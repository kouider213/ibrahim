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
 *   3. NVIDIA, Mistral, Cerebras, OpenRouter (free tier, 27-29/10/2026) — modèle choisi tout seul dans leur liste
 *      (les noms changent tous les mois), sautés 15 min sur quota/panne
 *   4. OpenAI gpt-4o (payant — dernier recours si crédits restants)
 */
import axios from 'axios';
import type Anthropic from '@anthropic-ai/sdk';
import { Dzaryx } from '../config/constants.js';
import { Dzaryx_TOOLS } from './tools.js';
import { executeTool } from './tool-executor.js';
import type { Message, ToolExecution, ToolStartCallback, ToolDoneCallback } from './claude-api.js';
import { groqSystemPrompt } from './compact-prompt.js';
import { freeModeOn } from './anthropic-compat.js';

const GROQ_KEY   = process.env['GROQ_API_KEY'];
const GEMINI_KEY = process.env['GEMINI_API_KEY'];
// 29/10 : quota Gemini gratuit = par projet Google → GEMINI_API_KEYS (clés séparées par des virgules, autres projets
// AI Studio, sans carte) multiplie le quota des gros modèles. Le quota du jour était vide dès 8 h avec une seule clé.
const GEMINI_KEYS = [...new Set([GEMINI_KEY, ...(process.env['GEMINI_API_KEYS'] ?? '').split(',')].map(k => k?.trim()).filter((k): k is string => !!k))];
const OPENAI_KEY = process.env['OPENAI_API_KEY'];
const CEREBRAS_KEY   = process.env['CEREBRAS_API_KEY'];
const NVIDIA_KEY     = process.env['NVIDIA_API_KEY'];
const OPENROUTER_KEY = process.env['OPENROUTER_API_KEY'];
const MISTRAL_KEY    = process.env['MISTRAL_API_KEY'];

const MAX_TOOL_ROUNDS = 10;   // 29/10 : 6 → 10, les cerveaux gratuits enchaînent autant d'outils que Claude

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
  key:     'groq' | 'gemini' | 'openai' | 'cerebras' | 'nvidia' | 'openrouter' | 'mistral';
  name:    string;
  url:     string;
  model:   string;
  apiKey:  string;
  /** Identifiant de quota (modèle, + n° de clé Gemini) */
  qid?:    string;
  /** Petit quota (Groq) : prompt court, peu d'outils, historique et résultats tronqués */
  compact?: boolean;
  /** Voit les images (image_url) */
  vision?: boolean;
  /** Contexte plus petit : moins d'outils, descriptions courtes */
  toolMax?: number;
  descMax?: number;
}

const GEMINI_URL    = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
// gemini-flash-latest en dernier : le 23/10 il restait figé sans répondre (30 s+) pendant que les « lite » répondaient
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

// Modèle à quota épuisé (429), surchargé (503) ou figé → sauté 15 min au lieu d'être réessayé à chaque message
const quotaUntil = new Map<string, number>();
export function markQuotaExhausted(model: string, ms = 15 * 60_000): void { quotaUntil.set(model, Date.now() + ms); }
/** Modèle absent du compte (404) ou retiré (410) : sauté 24 h au lieu de coûter un appel à chaque message (Kimi, 29/10). */
// 29/10 : quota gratuit Gemini = 20 requêtes/jour/modèle, Google dit quand il revient (« Please retry in 20h3m43s »).
// Avant : sauté 15 min puis réessayé à chaque message toute la journée (une requête perdue par message).
export function markFailure(qid: string, status?: number, detail?: string): void {
  if (status === 404 || status === 410) return markQuotaExhausted(qid, 24 * 3600_000);
  const m = detail?.match(/retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  const ms = m ? ((+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0))) * 1000 : 0;
  if (status === 429 && /PerDay/i.test(detail ?? '')) return markQuotaExhausted(qid, Math.min(Math.max(ms, 3600_000), 24 * 3600_000));
  markQuotaExhausted(qid, Math.min(Math.max(ms, 15 * 60_000), 24 * 3600_000));
}
/** Gemini : « minimal » = rapide, mais gemini-flash-latest le refuse (400 « Thinking level MINIMAL is not supported »). */
const NO_MINIMAL = /^gemini-flash-latest$/;
export const geminiEffort = (model: string, deep: boolean) => deep ? 'medium' : NO_MINIMAL.test(model) ? 'low' : 'minimal';
const usable = (model: string) => (quotaUntil.get(model) ?? 0) < Date.now();

// ── Fournisseurs gratuits ajoutés le 27/10 : le modèle est pris dans leur liste du moment (préférences dans l'ordre),
// relue toutes les 6 h ; avant la 1re lecture, la 1re préférence connue sert par défaut.
interface FreeProvider { key: 'cerebras' | 'nvidia' | 'openrouter' | 'mistral'; name: string; apiKey?: string; base: string; prefs: RegExp[]; fallback: string; toolMax: number; descMax: number }
const FREE_PROVIDERS: FreeProvider[] = [
  // 29/10 : sur le compte de Kouider seul nemotron-3-ultra répond (Kimi/Mistral = 404, GLM/DeepSeek figés)
  { key: 'nvidia',     name: 'NVIDIA',     apiKey: NVIDIA_KEY,     base: 'https://integrate.api.nvidia.com/v1',
    prefs: [/^nvidia\/nemotron-3-ultra/, /^moonshotai\/kimi-k2/, /^z-ai\/glm-5/, /^deepseek-ai\/deepseek-v4/], fallback: 'nvidia/nemotron-3-ultra-550b-a55b', toolMax: 60, descMax: 500 },
  { key: 'mistral',    name: 'Mistral',    apiKey: MISTRAL_KEY,    base: 'https://api.mistral.ai/v1',
    prefs: [/^mistral-large-latest$/, /^mistral-medium-latest$/, /^magistral-medium-latest$/], fallback: 'mistral-large-latest', toolMax: 80, descMax: 600 },
  { key: 'cerebras',   name: 'Cerebras',   apiKey: CEREBRAS_KEY,   base: 'https://api.cerebras.ai/v1',
    prefs: [/gpt-oss-120b/, /qwen-3-235b.*instruct/, /glm/, /llama-3\.3-70b/], fallback: 'gpt-oss-120b', toolMax: 40, descMax: 400 },
  { key: 'openrouter', name: 'OpenRouter', apiKey: OPENROUTER_KEY, base: 'https://openrouter.ai/api/v1',
    // 29/10 : super-vl = rapide (4 s) et voit les photos → 2e modèle, passe devant quand il y a une image
    prefs: [/^nvidia\/nemotron-3-ultra/, /^nvidia\/nemotron-3\.5-super-vl/, /^deepseek\//, /^qwen\/qwen3/, /^thinkingmachines\/inkling:/, /^google\/gemma-4-31b/], fallback: 'nvidia/nemotron-3-ultra-550b-a55b:free', toolMax: 60, descMax: 500 },
];
const freeModels = new Map<string, string[]>();   // fournisseur → 2 meilleurs modèles du moment

async function refreshFreeModels(): Promise<void> {
  for (const p of FREE_PROVIDERS) {
    if (!p.apiKey) continue;
    try {
      const { data } = await axios.get(`${p.base}/models`, { headers: { Authorization: `Bearer ${p.apiKey}` }, timeout: 15_000 });
      let rows = (data?.data ?? []) as Array<{ id: string; supported_parameters?: string[] }>;
      // OpenRouter : seulement les modèles gratuits qui savent appeler des outils
      if (p.key === 'openrouter') rows = rows.filter(m => m.id.endsWith(':free') && (m.supported_parameters ?? []).includes('tools'));
      const ids = rows.map(m => m.id);
      const picked = p.prefs.map(re => ids.find(id => re.test(id))).filter((id): id is string => !!id);
      if (picked.length) freeModels.set(p.key, [...new Set(picked)].slice(0, 2));
      console.log(`[agentic-fallback] ${p.name} : ${freeModels.get(p.key)?.join(', ') ?? 'aucun modèle reconnu'}`);
    } catch (e) {
      console.warn(`[agentic-fallback] ${p.name} liste des modèles :`, e instanceof Error ? e.message : e);
    }
  }
}
if (FREE_PROVIDERS.some(p => p.apiKey)) {
  void refreshFreeModels();
  setInterval(() => void refreshFreeModels(), 6 * 3600_000).unref();
}

export function fallbackEndpoints(): FallbackEndpoint[] {
  const list: FallbackEndpoint[] = [];
  // Classés par PUISSANCE, pas par fournisseur (29/10) : Gemini « lite » inventait des voitures et sautait les outils
  // finances quand les gros Gemini avaient épuisé leur quota du jour → Nemotron Ultra (NVIDIA/OpenRouter) passe avant.
  const gemini = (lite: boolean) => {
    for (const model of GEMINI_MODELS) if (/lite/.test(model) === lite) GEMINI_KEYS.forEach((apiKey, k) => {
      const qid = k ? `${model}#${k}` : model;
      if (usable(qid)) list.push({ key: 'gemini', name: `Gemini ${model}${k ? ` (clé ${k + 1})` : ''}`, url: GEMINI_URL, model, qid, apiKey, vision: true });
    });
  };
  gemini(false);
  for (const p of FREE_PROVIDERS) {
    if (!p.apiKey) continue;
    for (const model of freeModels.get(p.key) ?? [p.fallback]) if (usable(`${p.key}:${model}`)) {
      list.push({ key: p.key, name: `${p.name} ${model}`, url: `${p.base}/chat/completions`, model, qid: `${p.key}:${model}`, apiKey: p.apiKey, toolMax: p.toolMax, descMax: p.descMax, vision: /-vl\b|vision|omni/.test(model) });
    }
  }
  gemini(true);
  if (GROQ_KEY)   list.push({ key: 'groq',   name: 'Groq GPT-OSS 120B', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', apiKey: GROQ_KEY, compact: true });
  // OpenAI = payant → jamais en mode gratuit (Dzaryx à 0 €, 29/10)
  if (OPENAI_KEY && !freeModeOn()) list.push({ key: 'openai', name: 'OpenAI GPT-4o',     url: 'https://api.openai.com/v1/chat/completions',     model: 'gpt-4o',              apiKey: OPENAI_KEY, vision: true });
  return list;
}

/** Photo jointe : les cerveaux qui voient passent devant (Gemini à quota épuisé → super-vl plutôt qu'un modèle aveugle). */
export function visionFirst<E extends { vision?: boolean }>(eps: E[], hasImage: boolean): E[] {
  return hasImage ? [...eps.filter(e => e.vision), ...eps.filter(e => !e.vision)] : eps;
}

/**
 * Course relais (29/10) : le 1er cerveau part ; s'il n'a pas répondu après `delay` ms (ou plante), le suivant part
 * en parallèle (2 à la fois max). Le 1er qui répond gagne, les autres sont annulés. `next` = nb de cerveaux lancés.
 */
export function hedgedRace<E, T>(eps: E[], run: (ep: E, signal: AbortSignal) => Promise<T>, delay: (ep: E) => number):
  Promise<{ value: T; ep: E; next: number } | { error: unknown; next: number }> {
  const ctrl = new AbortController();
  return new Promise(resolve => {
    let i = 0, pending = 0, done = false, lastErr: unknown = null;
    const finish = (r: { value: T; ep: E; next: number } | { error: unknown; next: number }) => { if (!done) { done = true; ctrl.abort(); resolve(r); } };
    const launch = (): void => {
      if (done) return;
      if (i >= eps.length) { if (pending === 0) finish({ error: lastErr ?? new Error('aucun cerveau gratuit disponible'), next: i }); return; }
      const ep = eps[i++];
      pending++;
      let moved = false;
      const next = () => { if (!moved) { moved = true; launch(); } };
      const timer = setTimeout(() => { if (pending < 2) next(); }, delay(ep));
      run(ep, ctrl.signal).then(
        value => { pending--; clearTimeout(timer); finish({ value, ep, next: i }); },
        err   => { pending--; clearTimeout(timer); lastErr = err; if (!moved) next(); else if (pending === 0) launch(); },
      );
    };
    launch();
  });
}

/**
 * Nemotron écrit parfois ses appels d'outils en TEXTE (`[{"name": "x", "parameters": {...}}]`) au lieu de tool_calls
 * (29/10) : Kouider recevait ce JSON brut. On les convertit en vrais appels, seulement vers des outils proposés.
 */
export function textToolCalls(content: unknown, allowed: Set<string>): OAIToolCall[] {
  const raw = String(content ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  if (!/^\[+\s*\{[\s\S]*"name"/.test(raw)) return [];
  try {
    let arr: unknown = JSON.parse(raw.replace(/^\[+/, '[').replace(/\]+$/, ']'));
    if (!Array.isArray(arr)) arr = [arr];
    return (arr as Array<{ name?: string; parameters?: unknown; arguments?: unknown }>)
      .filter(c => c && typeof c.name === 'string' && allowed.has(c.name))
      .map((c, i) => ({ id: `txt_${Date.now()}_${i}`, type: 'function' as const,
        function: { name: c.name!, arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.parameters ?? c.arguments ?? {}) } }));
  } catch { return []; }
}

/** Demande qui mérite de la réflexion (analyse, plan, calcul, texte à rédiger…) plutôt qu'une réponse éclair. */
export function needsDeepThought(text: string): boolean {
  return text.length > 220 || /analys|strat[eé]g|business ?plan|calcul|compar|r[eé]dig|pourquoi|expliqu|conseil|optimis|pr[eé]vision|bilan|devis|contrat/i.test(text);
}

/** Fournisseurs gratuits branchés (page À PAYER / diagnostic). */
export function freeBrainStatus(): Array<{ provider: string; on: boolean; models: string[] }> {
  return [
    { provider: GEMINI_KEYS.length > 1 ? `gemini ×${GEMINI_KEYS.length} clés` : 'gemini', on: GEMINI_KEYS.length > 0, models: GEMINI_MODELS.filter(usable) },
    ...FREE_PROVIDERS.map(p => ({ provider: p.key, on: !!p.apiKey, models: p.apiKey ? (freeModels.get(p.key) ?? [p.fallback]).filter(m => usable(`${p.key}:${m}`)) : [] })),
    { provider: 'groq', on: !!GROQ_KEY, models: GROQ_KEY ? ['openai/gpt-oss-120b'] : [] },
  ];
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
  /** Modèle qui a répondu (pour relancer AILLEURS si sa réponse est refusée par les gardes) */
  model?:        string;
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
  skipModels?:  string[],
): Promise<AgenticFallbackResult> {
  const eps = fallbackEndpoints().filter(e => !skipModels?.includes(e.model));
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
  // Note de passation : le secours sait où on en est (objectif, déjà fait, ce qui attend un oui)
  const { buildHandoffNote } = await import('./brain-handoff.js');
  const handoff = await buildHandoffNote(messages).catch(() => '');
  const handoffMsg: OAIMessage[] = handoff ? [{ role: 'system', content: handoff }] : [];
  const fullHistory: OAIMessage[] = [
    { role: 'system', content: [Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? ''].filter(Boolean).join('\n\n') },
    ...handoffMsg,
    ...flat,
  ];
  // Groq : ~4 500 tokens par requête pour tenir 2 tours dans les 8 000 tokens/min
  const compactTools   = toOpenAITools(pickFallbackTools(tools, pickText, 8), 300);
  const compactHistory: OAIMessage[] = [
    { role: 'system', content: groqSystemPrompt('', systemExtra ?? '', 1_200) },
    ...(handoff ? [{ role: 'system' as const, content: handoff.slice(0, 900) }] : []),
    ...flat.slice(-6).map(m => ({ ...m, content: String(m.content ?? '').slice(0, 800) })),
  ];

  // Gemini : réflexion « minimal » pour le quotidien (2 s), « medium » quand la demande le mérite (29/10 : aussi fort que Claude)
  const deep = needsDeepThought(lastUserText);

  const call = async (ep: FallbackEndpoint, history: OAIMessage[], oaiTools: Array<Record<string, unknown>>, signal?: AbortSignal) => {
    const body = {
      model:       ep.model,
      messages:    history,
      tools:       oaiTools,
      tool_choice: 'auto',   // 29/10 : 'required' testé → Nemotron appelait update_car pour une question de dispo : jamais
      max_tokens:  ep.compact ? 1024 : deep ? 8192 : 4096,
      // Gemini 3 : réflexion « minimal » → 2 s au lieu de 10 s, et la réflexion ne mange plus la réponse (29/10)
      ...(ep.key === 'gemini' ? { reasoning_effort: geminiEffort(ep.model, deep) } : {}),
      temperature: 0.5,
    };
    // 23/10 : un Gemini figé faisait attendre 45 s en plein appel ; Nemotron réfléchit avant de répondre → 45 s
    const timeout = ep.key === 'gemini' ? (deep ? 40_000 : 20_000) : 45_000;
    const post = () => axios.post(ep.url, body, { headers: { Authorization: `Bearer ${ep.apiKey}` }, timeout, signal });
    try {
      return (await post()).data;
    } catch (e) {
      const r = (e as { response?: { status?: number; headers?: Record<string, string>; data?: { error?: { code?: string } } } }).response;
      const wait = Number(r?.headers?.['retry-after'] ?? NaN);
      if (r?.status === 400 && r.data?.error?.code === 'tool_use_failed') {
        // gpt-oss appelle parfois un outil absent de la liste (ex. web_search) → on lui rappelle la liste, un essai
        const names = oaiTools.map(t => (t['function'] as { name: string }).name).join(', ');
        body.messages = [...history, { role: 'system', content: `Outils disponibles UNIQUEMENT : ${names}. N'en appelle aucun autre ; sinon réponds sans outil.` }];
      } else if (r?.status !== 429 || !(wait <= 20) || ep.key !== 'groq') {
        throw e;
      } else {
        // Groq : quota/minute dépassé → mieux vaut attendre quelques secondes que répondre « indisponible »
        await new Promise(res => setTimeout(res, (wait + 1) * 1000));
      }
      return (await post()).data;
    }
  };

  const noteFailure = (ep: FallbackEndpoint, err: unknown) => {
    // quota (429), surcharge (503) ou figé (timeout) → ce modèle est sauté 15 min au lieu de refaire attendre
    const st = (err as { response?: { status?: number }; code?: string });
    const code = st.response?.status;
    const res = (err as { response?: { status?: number; data?: unknown } }).response;
    if (ep.key !== 'groq' && ep.key !== 'openai' && (code === 429 || code === 503 || code === 404 || code === 410 || st.code === 'ECONNABORTED')) markFailure(ep.qid ?? ep.model, code, JSON.stringify(res?.data ?? ''));
    console.warn(`[agentic-fallback] ${ep.key}/${ep.model} FAILED status=${res?.status ?? 'network'} body=${JSON.stringify(res?.data ?? {}).slice(0, 200)} msg="${err instanceof Error ? err.message.slice(0, 120) : String(err)}" → provider suivant`);
  };

  // 1er tour en course relais : un cerveau lent (> 8-14 s) ou en panne est doublé par le suivant, le 1er qui répond
  // garde la main pour la suite (les outils ne tournent qu'une fois). Échec plus tard → nouvelle course sur les restants.
  const toolsFor = (ep: FallbackEndpoint) => ep.compact ? compactTools : ep.toolMax ? toOpenAITools(pickFallbackTools(tools, pickText, ep.toolMax), ep.descMax) : fullTools;
  let lastErr: unknown = null;
  let rest = visionFirst(eps, !!image);
  while (rest.length) {
    const race = await hedgedRace(rest, async (ep, signal) => {
      const history  = withImage([...(ep.compact ? compactHistory : fullHistory)], !!ep.vision);
      const oaiTools = toolsFor(ep);
      try {
        const data = await call(ep, history, oaiTools, signal);
        if (!data?.choices?.[0]?.message) throw new Error(`${ep.name} empty choice`);
        return { history, oaiTools, data };
      } catch (err) {
        if (!signal.aborted) noteFailure(ep, err);
        throw err;
      }
    }, ep => ep.key === 'gemini' ? 8_000 : 14_000);
    rest = rest.slice(race.next);
    if ('error' in race) { lastErr = race.error; break; }

    let { ep, value: { history, oaiTools } } = race;
    let data = race.value.data;
    const toolsExecuted: ToolExecution[] = [];
    // 29/10 11h42 : Gemini lance un outil puis prend un 429 au tour suivant → tout le secours abandonnait et Groq
    // répondait sans données (« ⚠️ Réponse de secours NON vérifiée »). Désormais le cerveau suivant REPREND le tour
    // avec les résultats d'outils déjà obtenus (rien n'est relancé, donc pas de doublon).
    const takeOver = async (): Promise<void> => {
      for (;;) {
        try { data = await call(ep, history, oaiTools); return; } catch (err) {
          noteFailure(ep, err);
          const to = rest.shift();
          if (!to) throw err;
          const done = toolsExecuted.map(t => `• ${t.name} → ${t.result.slice(0, to.compact ? 600 : 4_000)}`).join('\n');
          console.warn(`[agentic-fallback] reprise du tour par ${to.key}/${to.model} (${toolsExecuted.length} outils déjà faits)`);
          ep = to;
          oaiTools = toolsFor(to);
          history = [...withImage([...(to.compact ? compactHistory : fullHistory)], !!to.vision),
            { role: 'system', content: `[REPRISE : un autre cerveau a déjà exécuté ces outils à ce tour. NE LES RELANCE PAS, réponds avec leurs résultats (ou appelle un AUTRE outil si vraiment nécessaire) :]\n${done}` }];
        }
      }
    };
    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        if (round > 0) await takeOver();
        const msg = data.choices?.[0]?.message as OAIMessage | undefined;
        if (!msg) throw new Error(`${ep.name} empty choice`);

        let toolCalls = msg.tool_calls ?? [];
        if (!toolCalls.length) {
          toolCalls = textToolCalls(msg.content, new Set(oaiTools.map(t => (t['function'] as { name: string }).name)));
          if (toolCalls.length) msg.content = null;
        }
        if (toolCalls.length === 0 || round === MAX_TOOL_ROUNDS) {
          const text = String(msg.content ?? '').trim();
          if (!text) throw new Error(`${ep.name} empty final response`);
          console.log(`[agentic-fallback] ✅ ${ep.key}/${ep.model} — ${toolsExecuted.length} outils, ${text.length} chars${deep ? ' (réflexion)' : ''}`);
          return { text, toolsExecuted, provider: ep.key, model: ep.model };
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
      noteFailure(ep, err);
      // Des outils ont déjà tourné (ex. mail envoyé) : rejouer ailleurs risquerait un doublon
      if (toolsExecuted.some(t => t.success && !/^(list|get|check|read|recall|search)_/.test(t.name))) break;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('All agentic fallback providers failed');
}
