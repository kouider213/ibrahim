/**
 * Agentic Fallback — boucle outils complète sur providers GRATUITS.
 * Utilisé quand Claude est mort (crédits épuisés, 401/429, panne) pour que
 * Dzaryx garde TOUTE sa puissance : mêmes outils, mêmes données Supabase.
 *
 * Providers (API compatible OpenAI chat/completions + tool calling) :
 *   1. Gemini via endpoint OpenAI-compat (free tier) — plusieurs modèles, car un
 *      modèle seul est souvent en 503 (surcharge) ou 429 (quota du jour)
 *   2. Groq openai/gpt-oss-120b (free tier, 8 000 tokens/min → prompt court,
 *      peu d'outils, historique tronqué)
 *   3. OpenAI gpt-4o (payant — dernier recours si crédits restants)
 */
import axios from 'axios';
import type Anthropic from '@anthropic-ai/sdk';
import { Dzaryx } from '../config/constants.js';
import { Dzaryx_TOOLS } from './tools.js';
import { executeTool } from './tool-executor.js';
import type { Message, ToolExecution, ToolStartCallback, ToolDoneCallback } from './claude-api.js';
import { groqSystemPrompt } from './compact-prompt.js';

const GROQ_KEY   = process.env['GROQ_API_KEY'];
const GEMINI_KEY = process.env['GEMINI_API_KEY'];
const OPENAI_KEY = process.env['OPENAI_API_KEY'];

const MAX_TOOL_ROUNDS = 6;

interface OAIToolCall {
  id:       string;
  type:     'function';
  function: { name: string; arguments: string };
}

type OAIPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

interface OAIMessage {
  role:          'system' | 'user' | 'assistant' | 'tool';
  content:       string | OAIPart[] | null;
  tool_calls?:   OAIToolCall[];
  tool_call_id?: string;
}

interface FallbackEndpoint {
  key:     'groq' | 'gemini' | 'openai';
  name:    string;
  url:     string;
  model:   string;
  apiKey:  string;
  /** Petit quota (Groq) : prompt court, peu d'outils, historique et résultats tronqués */
  compact?: boolean;
}

const GEMINI_URL    = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
// gemini-flash-latest en dernier : le 23/10 il restait figé sans répondre (30 s+) pendant que les « lite » répondaient
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

// Modèle Gemini à quota épuisé (429) → on le saute 15 min au lieu de le réessayer à chaque message
const quotaUntil = new Map<string, number>();
export function markQuotaExhausted(model: string): void { quotaUntil.set(model, Date.now() + 15 * 60_000); }

export function fallbackEndpoints(): FallbackEndpoint[] {
  const list: FallbackEndpoint[] = [];
  if (GEMINI_KEY) for (const model of GEMINI_MODELS) if ((quotaUntil.get(model) ?? 0) < Date.now()) list.push({ key: 'gemini', name: `Gemini ${model}`, url: GEMINI_URL, model, apiKey: GEMINI_KEY });
  if (GROQ_KEY)   list.push({ key: 'groq',   name: 'Groq GPT-OSS 120B', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', apiKey: GROQ_KEY, compact: true });
  if (OPENAI_KEY) list.push({ key: 'openai', name: 'OpenAI GPT-4o',     url: 'https://api.openai.com/v1/chat/completions',     model: 'gpt-4o',              apiKey: OPENAI_KEY });
  return list;
}

// ── Choix des outils : Groq refuse > 128 outils, et 237 outils = ~50 000 tokens ──
const MUST_TOOLS = [
  'list_bookings', 'check_car_availability', 'get_fleet_status', 'get_financial_report', 'get_revenue_report',
  'create_booking', 'send_whatsapp_to_client', 'draft_email', 'send_email', 'call_me', 'schedule_reminder',
  'list_agenda_events', 'web_search', 'remember_info', 'recall_memory',
];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function pickFallbackTools(tools: Anthropic.Tool[], userText: string, max: number): Anthropic.Tool[] {
  if (tools.length <= max) return tools;
  const words = [...new Set(norm(userText).split(/[^a-z0-9]+/).filter(w => w.length >= 4))].map(w => w.slice(0, 6));
  const hays  = new Map(tools.map(t => [t.name, norm(`${t.name.replace(/_/g, ' ')} ${t.description ?? ''}`)]));
  // Mot rare = signal fort (« sport »), mot présent partout = bruit (« pour », « être », « comme »)
  const weight = new Map(words.map(w => [w, Math.log(tools.length / (1 + [...hays.values()].filter(h => h.includes(w)).length))]));
  const score = (t: Anthropic.Tool) => {
    const hay = hays.get(t.name) ?? '';
    const must = MUST_TOOLS.indexOf(t.name);
    return words.filter(w => hay.includes(w)).reduce((a, w) => a + Math.max(0, weight.get(w) ?? 0), 0) * 2 + (must >= 0 ? 3 - must / MUST_TOOLS.length : 0);
  };
  return tools
    .map((t, i) => ({ t, s: score(t), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .map(x => x.t);
}

export function isAgenticFallbackAvailable(): boolean {
  return fallbackEndpoints().length > 0;
}

// ── Conversion outils Anthropic → format OpenAI functions ─────────────────────
function toOpenAITools(tools: Anthropic.Tool[], descMax = 1024): Array<Record<string, unknown>> {
  return tools.map(t => ({
    type:     'function',
    function: {
      name:        t.name,
      description: (t.description ?? '').slice(0, descMax),
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
  image?:       { base64: string; mime: string },
): Promise<AgenticFallbackResult> {
  const eps = fallbackEndpoints();
  if (eps.length === 0) throw new Error('No agentic fallback provider configured');

  const flat         = messages.map(m => ({ role: m.role, content: flattenContent(m.content) }) as OAIMessage);
  const lastUserText = String([...flat].reverse().find(m => m.role === 'user')?.content ?? '');
  // Réponse courte (« Oui », « vas-y ») = suite de la question d'avant : les outils se choisissent sur les derniers
  // échanges et parmi TOUS les outils (23/10 : « Oui » pour avancer le sport → morning_routine absent, rien fait)
  const shortReply   = lastUserText.trim().length < 25;
  const tools        = toolOverride && toolOverride.length > 0 && !shortReply ? toolOverride : Dzaryx_TOOLS;
  const pickText     = shortReply ? flat.slice(-4).map(m => String(m.content ?? '').slice(0, 600)).join('\n') : lastUserText;
  // Photo : Gemini/OpenAI la voient (image_url) ; Groq non → on le lui dit pour qu'il n'invente rien
  const withImage = (msgs: OAIMessage[], vision: boolean): OAIMessage[] => {
    const last = msgs.map(m => m.role).lastIndexOf('user');
    if (!image || last < 0) return msgs;
    return msgs.map((m, i) => {
    if (i !== last) return m;
    const text = String(m.content ?? '');
    return vision
      ? { ...m, content: [{ type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } }, { type: 'text', text }] }
      : { ...m, content: `${text}\n\n(Photo jointe, mais ce modèle de secours ne voit pas les images : dis-le, ne la décris pas.)` };
    });
  };
  const fullTools    = toOpenAITools(pickFallbackTools(tools, pickText, 120));
  const fullHistory: OAIMessage[] = [
    { role: 'system', content: [Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? ''].filter(Boolean).join('\n\n') },
    ...flat,
  ];
  // Groq : ~4 500 tokens par requête pour tenir 2 tours dans les 8 000 tokens/min
  const compactTools   = toOpenAITools(pickFallbackTools(tools, pickText, 8), 300);
  const compactHistory: OAIMessage[] = [
    { role: 'system', content: groqSystemPrompt('', systemExtra ?? '', 1_200) },
    ...flat.slice(-6).map(m => ({ ...m, content: String(m.content ?? '').slice(0, 800) })),
  ];

  let lastErr: unknown = null;

  for (const ep of eps) {
    const toolsExecuted: ToolExecution[] = [];
    const history  = withImage(ep.compact ? compactHistory : fullHistory, !ep.compact);
    const oaiTools = ep.compact ? compactTools : fullTools;
    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const body = {
          model:       ep.model,
          messages:    history,
          tools:       oaiTools,
          tool_choice: 'auto',
          max_tokens:  ep.compact ? 1024 : 4096,
          temperature: 0.5,
        };
        const post = () => axios.post(ep.url, body, { headers: { Authorization: `Bearer ${ep.apiKey}` }, timeout: ep.key === 'gemini' ? 20_000 : 45_000 });   // 23/10 : un Gemini figé faisait attendre 45 s en plein appel
        let data;
        try {
          ({ data } = await post());
        } catch (e) {
          const r = (e as { response?: { status?: number; headers?: Record<string, string>; data?: { error?: { code?: string } } } }).response;
          const wait = Number(r?.headers?.['retry-after'] ?? NaN);
          if (r?.status === 400 && r.data?.error?.code === 'tool_use_failed') {
            // gpt-oss appelle parfois un outil absent de la liste (ex. web_search) → on lui rappelle la liste, un essai
            const names = oaiTools.map(t => (t['function'] as { name: string }).name).join(', ');
            body.messages = [...history, { role: 'system', content: `Outils disponibles UNIQUEMENT : ${names}. N'en appelle aucun autre ; sinon réponds sans outil.` }];
          } else if (r?.status !== 429 || !(wait <= 20) || ep.key === 'gemini') {
            throw e;
          } else {
            // Groq : quota/minute dépassé → mieux vaut attendre quelques secondes que répondre « indisponible »
            await new Promise(res => setTimeout(res, (wait + 1) * 1000));
          }
          ({ data } = await post());
        }

        const msg = data.choices?.[0]?.message as OAIMessage | undefined;
        if (!msg) throw new Error(`${ep.name} empty choice`);

        const toolCalls = msg.tool_calls ?? [];
        if (toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
          const text = String(msg.content ?? '').trim();
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
          history.push({ role: 'tool', content: result.slice(0, ep.compact ? 2_500 : 12_000), tool_call_id: tc.id });
        }
      }
      throw new Error(`${ep.name} loop exhausted`);
    } catch (err) {
      lastErr = err;
      // quota (429), surcharge (503) ou figé (timeout) → ce modèle est sauté 15 min au lieu de refaire attendre
      const st = (err as { response?: { status?: number }; code?: string });
      if (ep.key === 'gemini' && (st.response?.status === 429 || st.response?.status === 503 || st.code === 'ECONNABORTED')) markQuotaExhausted(ep.model);
      const res = (err as { response?: { status?: number; data?: unknown } }).response;
      console.warn(`[agentic-fallback] ${ep.key}/${ep.model} FAILED status=${res?.status ?? 'network'} body=${JSON.stringify(res?.data ?? {}).slice(0, 200)} msg="${err instanceof Error ? err.message.slice(0, 120) : String(err)}" → provider suivant`);
      // Des outils ont déjà tourné (ex. mail envoyé) : rejouer ailleurs risquerait un doublon
      if (toolsExecuted.some(t => t.success && !/^(list|get|check|read|recall|search)_/.test(t.name))) break;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('All agentic fallback providers failed');
}
