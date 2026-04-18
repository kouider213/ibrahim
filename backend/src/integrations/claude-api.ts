import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { IBRAHIM } from '../config/constants.js';

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

export async function chat(
  messages: Message[],
  systemExtra?: string,
): Promise<ClaudeResponse> {
  const systemParts: string[] = [IBRAHIM.SYSTEM_PROMPT as string];
  if (systemExtra) systemParts.push(systemExtra);

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
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

export async function detectIntent(userMessage: string, context: string): Promise<{
  intent:  string;
  action?: string;
  params?: Record<string, unknown>;
  requiresValidation: boolean;
}> {
  const prompt = `Analyse ce message et retourne un JSON structuré.

Context: ${context}
Message utilisateur: "${userMessage}"

Retourne UNIQUEMENT un JSON valide avec ces champs:
{
  "intent": "reservation|content_generation|pc_command|query|conversation|rule_learning",
  "action": "action_name_or_null",
  "params": {},
  "requiresValidation": false,
  "reasoning": "courte explication"
}`;

  const res = await chat([{ role: 'user', content: prompt }]);

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
