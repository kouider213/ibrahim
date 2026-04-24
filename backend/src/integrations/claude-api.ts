import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { IBRAHIM } from '../config/constants.js';
import { IBRAHIM_TOOLS } from './tools.js';
import { executeTool } from './tool-executor.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  text:         string;
  inputTokens:  number;
  outputTokens: number;
  stopReason:   string;
}

// ── Tool-use chat (agentic loop) ──────────────────────────────
// Used by Telegram and any text-only flow.
// Claude calls tools natively → executor hits Supabase → result back to Claude → final answer.
export async function chatWithTools(
  messages: Message[],
  systemExtra?: string,
): Promise<ClaudeResponse> {
  const systemParts = [IBRAHIM.SYSTEM_PROMPT as string];
  if (systemExtra) systemParts.push(systemExtra);
  const system = systemParts.join('\n\n');

  // Convert Message[] to Anthropic format
  let apiMessages: Anthropic.MessageParam[] = messages.map(m => ({
    role:    m.role,
    content: m.content,
  }));

  let inputTokens  = 0;
  let outputTokens = 0;
  let finalText    = '';

  // Agentic loop — max 15 tool rounds (needed for multi-step coding tasks)
  for (let round = 0; round < 15; round++) {
    // Retry up to 3 times on 429 (rate limit), 529 (overloaded), 422 (context too long)
    let response: Awaited<ReturnType<typeof client.messages.create>> | null = null;
    let currentMessages = apiMessages;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await client.messages.create({
          model:      'claude-sonnet-4-5',
          max_tokens: 8192,
          system,
          tools:      IBRAHIM_TOOLS,
          messages:   currentMessages,
        });
        break;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 429 && attempt < 2) {
          console.warn(`[claude] Rate limit 429 — attente 65s (tentative ${attempt + 1}/3)`);
          await new Promise(r => setTimeout(r, 65_000));
        } else if (status === 529 && attempt < 2) {
          console.warn(`[claude] Overloaded 529 — attente 30s (tentative ${attempt + 1}/3)`);
          await new Promise(r => setTimeout(r, 30_000));
        } else if (status === 422 && attempt < 2) {
          // Context too long — keep only last 6 messages
          console.warn('[claude] Context trop long 422 — troncature historique');
          const trimmed = currentMessages.slice(-6);
          currentMessages = trimmed;
        } else { throw err; }
      }
    }
    if (!response) throw new Error('Claude API unavailable after retries');

    inputTokens  += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    // Collect text
    const textBlocks = response.content.filter(b => b.type === 'text');
    finalText = textBlocks.map(b => (b as Anthropic.TextBlock).text).join('');

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
      return { text: finalText, inputTokens, outputTokens, stopReason: response.stop_reason };
    }

    if (response.stop_reason !== 'tool_use') {
      return { text: finalText, inputTokens, outputTokens, stopReason: response.stop_reason ?? 'end_turn' };
    }

    // Execute tool calls
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
    if (!toolUseBlocks.length) break;

    // Add assistant turn with tool calls
    apiMessages = [...apiMessages, { role: 'assistant', content: response.content }];

    // Execute all tools and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        console.log(`[tools] Executing: ${block.name}`, block.input);
        const raw = await executeTool(block.name, block.input as Record<string, unknown>);
        // Guarantee content is always a plain string — never an object/array
        const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
        console.log(`[tools] Result: ${content.slice(0, 200)}`);
        return {
          type:        'tool_result' as const,
          tool_use_id: block.id,
          content,
        };
      }),
    );

    // Add tool results as user turn
    apiMessages = [...apiMessages, { role: 'user', content: toolResults }];
  }

  return { text: finalText || 'Désolé, erreur interne.', inputTokens, outputTokens, stopReason: 'end_turn' };
}

// ── Simple chat (no tools) ────────────────────────────────────
export async function chat(
  messages: Message[],
  systemExtra?: string,
): Promise<ClaudeResponse> {
  const systemParts: string[] = [IBRAHIM.SYSTEM_PROMPT as string];
  if (systemExtra) systemParts.push(systemExtra);

  const response = await client.messages.create({
    model:      'claude-sonnet-4-5',
    max_tokens: 1024,
    system:     systemParts.join('\n\n'),
    messages,
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  return {
    text,
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason:   response.stop_reason ?? 'end_turn',
  };
}

// Streaming version — calls onChunk for each text delta, returns full response
export async function chatStream(
  messages: Message[],
  systemExtra: string | undefined,
  onChunk: (chunk: string) => void,
): Promise<ClaudeResponse> {
  const systemParts: string[] = [IBRAHIM.SYSTEM_PROMPT as string];
  if (systemExtra) systemParts.push(systemExtra);

  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason = 'end_turn';

  const stream = client.messages.stream({
    model:      'claude-sonnet-4-5',
    max_tokens: 1024,
    system:     systemParts.join('\n\n'),
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      onChunk(event.delta.text);
    } else if (event.type === 'message_start') {
      inputTokens = event.message.usage.input_tokens;
    } else if (event.type === 'message_delta') {
      outputTokens = event.usage.output_tokens;
      stopReason = event.delta.stop_reason ?? 'end_turn';
    }
  }

  return { text: fullText, inputTokens, outputTokens, stopReason };
}

export async function detectIntent(userMessage: string, context: string): Promise<{
  intent:  string;
  action?: string;
  params?: Record<string, unknown>;
  requiresValidation: boolean;
}> {
  const prompt = `Analyse ce message et retourne un JSON structuré pour exécuter l'action.

CONTEXTE ACTUEL (réservations, flotte, agenda):
${context}

Message utilisateur: "${userMessage}"

ACTIONS DISPONIBLES:
- update_reservation: params = { id (UUID de la réservation), + champs à modifier: client_name, end_date, start_date, car_id, final_price, rented_by, status, notes }
- create_reservation: params = { client_name, vehicle_id, vehicle_name, start_date, end_date, daily_rate }
- cancel_reservation: params = { id }
- list_reservations: params = { status?, vehicle_id?, date? }
- check_availability: params = { vehicle_id, start_date, end_date }
- get_financial_report: params = { year?, month? }
- set_booking_owner: params = { id, rented_by: "Kouider"|"Houari" }
- store_document: params = { clientPhone, clientName, type, fileName, base64 }
- read_site_file: params = { path }
- update_site_file: params = { path, content, message? }
- generate_tiktok: params = { topic, vehicle_name? }
- learn_rule: params = { instruction }
- reply_to_client: TOUJOURS requiresValidation=true

IMPORTANT: Si update_reservation → trouve l'ID UUID dans le contexte en cherchant par nom client ou véhicule mentionné.

Retourne UNIQUEMENT un JSON valide:
{
  "intent": "reservation|content_generation|pc_command|query|conversation|rule_learning",
  "action": "action_name_or_null",
  "params": {},
  "requiresValidation": false,
  "reasoning": "courte explication"
}`;

  // Use Haiku for fast intent detection (3-5x faster than Sonnet)
  const response = await client.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 256,
    messages:   [{ role: 'user', content: prompt }],
  });
  const res = { text: response.content.filter(b => b.type === 'text').map(b => (b as { type:'text'; text:string }).text).join('') };

  try {
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    return JSON.parse(jsonMatch[0]) as {
      intent:  string;
      action?: string;
      params?: Record<string, unknown>;
      requiresValidation: boolean;
    };
  } catch {
    return { intent: 'conversation', requiresValidation: false };
  }
}

export async function generateTikTokContent(topic: string, vehicleName?: string): Promise<string> {
  const res = await chat([{
    role: 'user',
    content: `Crée un script TikTok engageant pour Fik Conciergerie Oran.
Sujet: ${topic}
${vehicleName ? `Véhicule: ${vehicleName}` : ''}
Format: accroche + contenu 30 secondes + CTA.
Style: énergie, luxe, algérien moderne.`,
  }]);
  return res.text;
}

export async function learnRule(
  userInstruction: string,
): Promise<{ category: string; rule: string; conditions: object; action: object }> {
  const res = await chat([{
    role: 'user',
    content: `Transforme cette instruction métier en règle structurée JSON.

Instruction: "${userInstruction}"

Retourne UNIQUEMENT ce JSON:
{
  "category": "reservation|validation|pricing|communication|general",
  "rule": "description courte de la règle",
  "conditions": {},
  "action": {}
}`,
  }]);

  try {
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    return JSON.parse(jsonMatch[0]) as {
      category:   string;
      rule:       string;
      conditions: object;
      action:     object;
    };
  } catch {
    return {
      category:   'general',
      rule:       userInstruction,
      conditions: {},
      action:     {},
    };
  }
}
