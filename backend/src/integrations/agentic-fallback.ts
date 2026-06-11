/**
 * Agentic Fallback — boucle outils complète sur providers GRATUITS.
 * Utilisé quand Claude est mort (crédits épuisés, 401/429, panne) pour que
 * Dzaryx garde TOUTE sa puissance : mêmes outils, mêmes données Supabase.
 *
 * Providers (API compatible OpenAI chat/completions + tool calling) :
 *   1. Groq  llama-3.3-70b-versatile  (free tier)
 *   2. Gemini gemini-2.0-flash via endpoint OpenAI-compat (free tier)
 *   3. OpenAI gpt-4o (payant — dernier recours si crédits restants)
 */
import axios from 'axios';
import type Anthropic from '@anthropic-ai/sdk';
import { Dzaryx } from '../config/constants.js';
import { Dzaryx_TOOLS } from './tools.js';
import { executeTool } from './tool-executor.js';
import type { Message, ToolExecution, ToolStartCallback, ToolDoneCallback } from './claude-api.js';

const GROQ_KEY   = process.env['GROQ_API_KEY'];
const GEMINI_KEY = process.env['GEMINI_API_KEY'];
const OPENAI_KEY = process.env['OPENAI_API_KEY'];

const MAX_TOOL_ROUNDS = 6;

interface OAIToolCall {
  id:       string;
  type:     'function';
  function: { name: string; arguments: string };
}

interface OAIMessage {
  role:          'system' | 'user' | 'assistant' | 'tool';
  content:       string | null;
  tool_calls?:   OAIToolCall[];
  tool_call_id?: string;
}

interface FallbackEndpoint {
  key:     'groq' | 'gemini' | 'openai';
  name:    string;
  url:     string;
  model:   string;
  apiKey:  string;
}

function endpoints(): FallbackEndpoint[] {
  const list: FallbackEndpoint[] = [];
  if (GROQ_KEY)   list.push({ key: 'groq',   name: 'Groq LLaMA 3.3',   url: 'https://api.groq.com/openai/v1/chat/completions',                                model: 'llama-3.3-70b-versatile', apiKey: GROQ_KEY });
  if (GEMINI_KEY) list.push({ key: 'gemini', name: 'Gemini 2.0 Flash', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',       model: 'gemini-2.0-flash',        apiKey: GEMINI_KEY });
  if (OPENAI_KEY) list.push({ key: 'openai', name: 'OpenAI GPT-4o',    url: 'https://api.openai.com/v1/chat/completions',                                     model: 'gpt-4o',                  apiKey: OPENAI_KEY });
  return list;
}

export function isAgenticFallbackAvailable(): boolean {
  return endpoints().length > 0;
}

// ── Conversion outils Anthropic → format OpenAI functions ─────────────────────
function toOpenAITools(tools: Anthropic.Tool[]): Array<Record<string, unknown>> {
  return tools.map(t => ({
    type:     'function',
    function: {
      name:        t.name,
      description: (t.description ?? '').slice(0, 1024),
      parameters:  t.input_schema,
    },
  }));
}

// ── Aplatit l'historique Anthropic (blocks) en texte simple ───────────────────
function flattenContent(content: Message['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map(b => {
      if (b.type === 'text') return b.text;
      if (b.type === 'tool_result') {
        const c = (b as { content?: unknown }).content;
        return typeof c === 'string' ? c : '';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export interface AgenticFallbackResult {
  text:          string;
  toolsExecuted: ToolExecution[];
  provider:      string;
}

/**
 * Boucle agentique complète : le modèle gratuit appelle les MÊMES outils
 * (executeTool → Supabase/Cloudinary/etc.) jusqu'à la réponse finale.
 */
export async function runAgenticFallback(
  messages:     Message[],
  systemExtra?: string,
  sessionId?:   string,
  toolOverride?: Anthropic.Tool[],
  onToolStart?: ToolStartCallback,
  onToolDone?:  ToolDoneCallback,
): Promise<AgenticFallbackResult> {
  const eps = endpoints();
  if (eps.length === 0) throw new Error('No agentic fallback provider configured');

  const tools        = toolOverride && toolOverride.length > 0 ? toolOverride : Dzaryx_TOOLS;
  const oaiTools     = toOpenAITools(tools);
  const systemPrompt = [Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? ''].filter(Boolean).join('\n\n');

  const baseHistory: OAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: flattenContent(m.content) }) as OAIMessage),
  ];

  let lastErr: unknown = null;

  for (const ep of eps) {
    const toolsExecuted: ToolExecution[] = [];
    const history = [...baseHistory];
    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const { data } = await axios.post(
          ep.url,
          {
            model:       ep.model,
            messages:    history,
            tools:       oaiTools,
            tool_choice: 'auto',
            max_tokens:  4096,
            temperature: 0.5,
          },
          { headers: { Authorization: `Bearer ${ep.apiKey}` }, timeout: 60_000 },
        );

        const msg = data.choices?.[0]?.message as OAIMessage | undefined;
        if (!msg) throw new Error(`${ep.name} empty choice`);

        const toolCalls = msg.tool_calls ?? [];
        if (toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
          const text = (msg.content ?? '').trim();
          if (!text) throw new Error(`${ep.name} empty final response`);
          console.log(`[agentic-fallback] ✅ ${ep.key} — ${toolsExecuted.length} outils, ${text.length} chars`);
          return { text, toolsExecuted, provider: ep.key };
        }

        // Le modèle veut des outils → on les exécute (les VRAIS outils Dzaryx)
        history.push({ role: 'assistant', content: msg.content ?? null, tool_calls: toolCalls });
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* args invalides → {} */ }
          onToolStart?.(tc.function.name, args);
          let result: string;
          try {
            result = await executeTool(tc.function.name, args, sessionId);
          } catch (toolErr) {
            result = `❌ Erreur outil: ${toolErr instanceof Error ? toolErr.message : String(toolErr)}`;
          }
          onToolDone?.(tc.function.name, result);
          toolsExecuted.push({ name: tc.function.name, success: !result.startsWith('❌'), result });
          history.push({ role: 'tool', content: result.slice(0, 12_000), tool_call_id: tc.id });
        }
      }
      throw new Error(`${ep.name} loop exhausted`);
    } catch (err) {
      lastErr = err;
      const status = (err as { response?: { status?: number } }).response?.status;
      console.warn(`[agentic-fallback] ${ep.key} FAILED status=${status ?? 'network'} msg="${err instanceof Error ? err.message.slice(0, 120) : String(err)}" → provider suivant`);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('All agentic fallback providers failed');
}
