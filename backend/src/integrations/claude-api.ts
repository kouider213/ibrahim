import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { IBRAHIM } from '../config/constants.js';
import { IBRAHIM_TOOLS } from './tools.js';
import { executeTool } from './tool-executor.js';
import { randomUUID } from 'crypto';
import { compactIfNeeded, emergencyCompact, needsCompaction } from '../conversation/compaction.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface Message {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlockParam[];
}

export interface ClaudeResponse {
  text:              string;
  inputTokens:       number;
  outputTokens:      number;
  cacheReadTokens?:  number;
  cacheWriteTokens?: number;
  thinkingTokens?:   number;
  stopReason:        string;
  mode?:             'fast' | 'normal' | 'thinking';
  citations?:        CitationInfo[];
}

// ── Citation info pour traçabilité ────────────────────────────────────────────
export interface CitationInfo {
  text:       string;
  source:     string;
  startIndex: number;
  endIndex:   number;
}

// ── Tool streaming callback ───────────────────────────────────────────────────
export type ToolStartCallback = (toolName: string, toolInput: Record<string, unknown>) => void;
export type ToolDoneCallback  = (toolName: string, result: string) => void;

// ── System prompt avec cache_control — mis en cache côté Anthropic ──────────
const CACHED_SYSTEM: Anthropic.TextBlockParam[] = [
  {
    type:          'text',
    text:          IBRAHIM.SYSTEM_PROMPT as string,
    cache_control: { type: 'ephemeral' },
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 1: FAST MODE — Questions simples = réponse ultra-rapide avec Haiku
// ══════════════════════════════════════════════════════════════════════════════
function isFastModeEligible(messages: Message[]): boolean {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return false;
  const content = lastUser.content;
  const text = (typeof content === 'string' ? content : '').toLowerCase().trim();

  // Questions très courtes (< 30 caractères) sans complexité
  if (text.length < 30) {
    const needsAction = /réserv|booking|modifi|change|créer|supprimer|annuler|rapport|finance|combien|météo|actualité|cherche|search|trouve|image|photo|montre|envoie|rappel|remind|web|internet|info/i.test(text);
    if (!needsAction) return true;
  }

  // Réponses simples: oui, non, ok, parfait, merci, etc.
  const simplePatterns = /^(oui|non|ok|d'accord|parfait|merci|cool|super|nice|bien|compris|test|rien|salut|hello|bonjour|bonsoir|ciao|bye|wesh|salam|cv|ca va|ça va|\?|yo|ouais|nope|nan|quoi de neuf|quoi de 9|je t'écoute|alors)$/i;
  if (simplePatterns.test(text)) return true;

  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 2: ADAPTIVE THINKING — Budget de réflexion selon complexité
// ══════════════════════════════════════════════════════════════════════════════
type ComplexityLevel = 'none' | 'low' | 'medium' | 'high';

function analyzeComplexity(messages: Message[]): { level: ComplexityLevel; budget: number } {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return { level: 'none', budget: 0 };

  const content = lastUser.content;
  const text = (typeof content === 'string' ? content : '').toLowerCase();

  // HIGH: Stratégie, optimisation, analyse approfondie, debug complexe
  if (/stratégi|optimis|analyse complète|plan d'action|business plan|prévision annuelle|comment améliorer/i.test(text)) {
    return { level: 'high', budget: 10000 };
  }
  if (/debug.*erreur|typescript.*error|fix.*bug|implémenter.*feature|architecture|refactor/i.test(text)) {
    return { level: 'high', budget: 10000 };
  }

  // MEDIUM: Calculs financiers, comparaisons, rapports
  if (/combien.*gagn|bénéfice|rentabilité|comparaison|rapport financier|revenu.*mois/i.test(text)) {
    return { level: 'medium', budget: 6000 };
  }
  if (/recommand|conseil|suggestion|meilleur|quel.*choix/i.test(text)) {
    return { level: 'medium', budget: 6000 };
  }

  // LOW: Questions de contexte, résumés
  if (/résumé|recap|qu'est-ce que|explique|c'est quoi/i.test(text)) {
    return { level: 'low', budget: 3000 };
  }

  // NONE: Questions factuelles, actions simples
  return { level: 'none', budget: 0 };
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 3: CITATIONS — Activer pour les requêtes avec documents/sources
// ══════════════════════════════════════════════════════════════════════════════
function needsCitations(messages: Message[], systemExtra?: string): boolean {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return false;

  const content = lastUser.content;
  const text = (typeof content === 'string' ? content : '').toLowerCase();

  if (/source|document|référence|d'où vient|citation|preuve|selon|d'après/i.test(text)) {
    return true;
  }

  if (systemExtra && systemExtra.length > 3000) {
    return /rapport|règle|grille|historique/i.test(text);
  }

  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 4: WEB SEARCH NATIF ANTHROPIC — Server Tool automatique
// ══════════════════════════════════════════════════════════════════════════════
function needsWebSearch(messages: Message[]): boolean {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return false;

  const content = lastUser.content;
  const text = (typeof content === 'string' ? content : '').toLowerCase();

  const webSearchPatterns = /actualités?|news|dernières nouvelles|récent|aujourd'hui|cette semaine|ce mois|anthropic|claude.*nouveau|openai|gpt|prix.*actuel|cours|bourse|événement|match|score|météo.*monde|température.*à|qui a gagné|résultat|élection/i;

  return webSearchPatterns.test(text);
}

// Server tool web_search natif Anthropic
const ANTHROPIC_WEB_SEARCH_TOOL: Anthropic.Tool = {
  type: 'web_search_20250305' as any,
  name: 'web_search',
} as any;

// ── Extraction des citations depuis la réponse ────────────────────────────────
function extractCitations(content: Anthropic.ContentBlock[]): CitationInfo[] {
  const citations: CitationInfo[] = [];

  for (const block of content) {
    if ((block as any).type === 'citation') {
      const citationBlock = block as any;
      citations.push({
        text:       citationBlock.cited_text ?? '',
        source:     citationBlock.source?.title ?? citationBlock.source?.url ?? 'source inconnue',
        startIndex: citationBlock.start_index ?? 0,
        endIndex:   citationBlock.end_index ?? 0,
      });
    }
  }

  return citations;
}

// ── Tool-use chat (agentic loop) avec Tool Streaming + Compaction ────────────
export async function chatWithTools(
  messages:       Message[],
  systemExtra?:   string,
  sessionId?:     string,
  onToolStart?:   ToolStartCallback,
  onToolDone?:    ToolDoneCallback,
  onTextChunk?:   (chunk: string) => void,
): Promise<ClaudeResponse> {

  const sid = sessionId ?? randomUUID();

  // ══════════════════════════════════════════════════════════════════════════
  // FAST MODE CHECK — Questions simples → Haiku sans outils
  // ══════════════════════════════════════════════════════════════════════════
  if (isFastModeEligible(messages)) {
    console.log('[claude] ⚡ FAST MODE: Question simple détectée');
    const systemBlocks: Anthropic.TextBlockParam[] = [...CACHED_SYSTEM];
    if (systemExtra) systemBlocks.push({ type: 'text', text: systemExtra });

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     systemBlocks,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    return {
      text,
      inputTokens:  response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason:   response.stop_reason ?? 'end_turn',
      mode:         'fast',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMPACTION: Si historique trop long, résumer avant d'envoyer à Claude
  // ══════════════════════════════════════════════════════════════════════════
  let processedMessages = messages;
  if (needsCompaction(messages)) {
    console.log(`[compaction] Historique trop long (${messages.length} msgs) — compaction en cours…`);
    processedMessages = await compactIfNeeded(messages, sid);
    console.log(`[compaction] Réduit à ${processedMessages.length} messages`);
  }

  // Build system array with caching on the main system prompt
  const systemBlocks: Anthropic.TextBlockParam[] = [...CACHED_SYSTEM];
  if (systemExtra) {
    systemBlocks.push({ type: 'text', text: systemExtra });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE THINKING: Ajuster le budget selon la complexité
  // ══════════════════════════════════════════════════════════════════════════
  const complexity = analyzeComplexity(processedMessages);
  const useThinking = complexity.level !== 'none';
  const thinkingBudget = complexity.budget;

  // ══════════════════════════════════════════════════════════════════════════
  // CITATIONS: Activer si nécessaire
  // ══════════════════════════════════════════════════════════════════════════
  const useCitations = needsCitations(processedMessages, systemExtra);

  // ══════════════════════════════════════════════════════════════════════════
  // WEB SEARCH NATIF: Ajouter le server tool si nécessaire
  // ══════════════════════════════════════════════════════════════════════════
  const useWebSearch = needsWebSearch(processedMessages);

  const tools: Anthropic.Tool[] = useWebSearch
    ? [...IBRAHIM_TOOLS, ANTHROPIC_WEB_SEARCH_TOOL]
    : IBRAHIM_TOOLS;

  let apiMessages: Anthropic.MessageParam[] = processedMessages.map(m => ({
    role:    m.role,
    content: m.content,
  }));

  let inputTokens      = 0;
  let outputTokens     = 0;
  let cacheReadTokens  = 0;
  let cacheWriteTokens = 0;
  let thinkingTokens   = 0;
  let finalText        = '';
  let allCitations: CitationInfo[] = [];

  if (useThinking) {
    const lastContent = processedMessages[processedMessages.length - 1]?.content;
    const preview = typeof lastContent === 'string' ? lastContent.slice(0, 60) : '[image]';
    console.log(`[claude] 🧠 ADAPTIVE THINKING: ${complexity.level} (${thinkingBudget} tokens) pour: "${preview}..."`);
  }
  if (useCitations)  console.log('[claude] 📚 CITATIONS: Activé pour cette requête');
  if (useWebSearch)  console.log('[claude] 🌐 WEB SEARCH NATIF: Activé pour cette requête');

  // Agentic loop — max 15 tool rounds
  for (let round = 0; round < 15; round++) {
    let response: Awaited<ReturnType<typeof client.messages.create>> | null = null;
    let currentMessages = apiMessages;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const createParams: Anthropic.MessageCreateParamsNonStreaming = {
          model:      'claude-sonnet-4-6',
          max_tokens: 16000,
          system:     systemBlocks,
          tools:      tools,
          messages:   currentMessages,
        };

        if (useThinking && thinkingBudget > 0) {
          (createParams as any).thinking = {
            type:          'enabled',
            budget_tokens: thinkingBudget,
          };
        }

        if (useCitations) {
          (createParams as any).citations = { enabled: true };
        }

        response = await client.messages.create(createParams);
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
          console.warn('[claude] Context trop long 422 — emergency compaction');
          const emergencyMessages = await emergencyCompact(
            currentMessages.map(m => ({
              role: m.role as 'user' | 'assistant',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
            sid,
          );
          currentMessages = emergencyMessages.map(m => ({
            role:    m.role,
            content: m.content,
          }));
          console.log(`[compaction] Emergency: réduit à ${currentMessages.length} messages`);
        } else {
          throw err;
        }
      }
    }
    if (!response) throw new Error('Claude API unavailable after retries');

    inputTokens  += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    const usage = response.usage as Anthropic.Usage & {
      cache_read_input_tokens?:     number;
      cache_creation_input_tokens?: number;
    };
    if (usage.cache_read_input_tokens)     cacheReadTokens  += usage.cache_read_input_tokens;
    if (usage.cache_creation_input_tokens) cacheWriteTokens += usage.cache_creation_input_tokens;

    if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
      console.log(`[claude-cache] read=${usage.cache_read_input_tokens ?? 0} write=${usage.cache_creation_input_tokens ?? 0} regular=${response.usage.input_tokens}`);
    }

    const thinkingBlocks = response.content.filter((b: any) => b.type === 'thinking');
    if (thinkingBlocks.length > 0) {
      const totalThinking = thinkingBlocks.reduce((sum: number, b: any) => sum + (b.thinking?.length ?? 0), 0);
      thinkingTokens += Math.ceil(totalThinking * 0.25);
      console.log(`[claude-thinking] ${thinkingBlocks.length} blocs de réflexion (${thinkingTokens} tokens estimés)`);
    }

    const textBlocks = response.content.filter(b => b.type === 'text');
    finalText = textBlocks.map(b => (b as Anthropic.TextBlock).text).join('');

    const citations = extractCitations(response.content);
    if (citations.length > 0) {
      allCitations = [...allCitations, ...citations];
      console.log(`[claude-citations] ${citations.length} citation(s) extraite(s)`);
    }

    if (onTextChunk && finalText) {
      onTextChunk(finalText);
    }

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
      const mode = useThinking ? 'thinking' : 'normal';
      return {
        text: finalText,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        thinkingTokens,
        stopReason: response.stop_reason,
        mode,
        citations: allCitations.length > 0 ? allCitations : undefined,
      };
    }

    if (response.stop_reason !== 'tool_use') {
      const mode = useThinking ? 'thinking' : 'normal';
      return {
        text: finalText,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        thinkingTokens,
        stopReason: response.stop_reason ?? 'end_turn',
        mode,
        citations: allCitations.length > 0 ? allCitations : undefined,
      };
    }

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
    if (!toolUseBlocks.length) break;

    apiMessages = [...apiMessages, { role: 'assistant', content: response.content }];

    for (const block of toolUseBlocks) {
      if (onToolStart) {
        console.log(`[tool-stream] ▶ START: ${block.name}`);
        onToolStart(block.name, block.input as Record<string, unknown>);
      }
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        if (block.name === 'web_search') {
          console.log(`[tools] Server tool web_search exécuté par Anthropic`);
          return {
            type:        'tool_result' as const,
            tool_use_id: block.id,
            content:     'Recherche web effectuée par le serveur Anthropic.',
          };
        }

        console.log(`[tools] Executing: ${block.name}`, block.input);
        const raw     = await executeTool(block.name, block.input as Record<string, unknown>, sid);
        const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
        console.log(`[tools] Result: ${content.slice(0, 200)}`);

        if (onToolDone) {
          console.log(`[tool-stream] ✅ DONE: ${block.name}`);
          onToolDone(block.name, content.slice(0, 500));
        }

        return {
          type:        'tool_result' as const,
          tool_use_id: block.id,
          content,
        };
      }),
    );

    apiMessages = [...apiMessages, { role: 'user', content: toolResults }];
  }

  const mode = useThinking ? 'thinking' : 'normal';
  return {
    text: finalText || 'Désolé, erreur interne.',
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    thinkingTokens,
    stopReason: 'end_turn',
    mode,
    citations: allCitations.length > 0 ? allCitations : undefined,
  };
}

// ── Simple chat (no tools) ────────────────────────────────────
export async function chat(
  messages:     Message[],
  systemExtra?: string,
): Promise<ClaudeResponse> {
  const systemBlocks: Anthropic.TextBlockParam[] = [...CACHED_SYSTEM];
  if (systemExtra) systemBlocks.push({ type: 'text', text: systemExtra });

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     systemBlocks,
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
  messages:     Message[],
  systemExtra:  string | undefined,
  onChunk:      (chunk: string) => void,
): Promise<ClaudeResponse> {
  const systemBlocks: Anthropic.TextBlockParam[] = [...CACHED_SYSTEM];
  if (systemExtra) systemBlocks.push({ type: 'text', text: systemExtra });

  let fullText     = '';
  let inputTokens  = 0;
  let outputTokens = 0;
  let stopReason   = 'end_turn';

  const stream = client.messages.stream({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:     systemBlocks,
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
      stopReason   = event.delta.stop_reason ?? 'end_turn';
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

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages:   [{ role: 'user', content: prompt }],
  });
  const res = {
    text: response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join(''),
  };

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
    role:    'user',
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
    role:    'user',
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
