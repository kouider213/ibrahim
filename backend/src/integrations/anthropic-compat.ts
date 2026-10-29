/**
 * Client Anthropic unique pour tout le backend — passage à Claude Sonnet 5.5 / Haiku 5.5 (2026-10-14).
 *
 * Les nouveaux modèles refusent (erreur 400) plusieurs réglages que l'ancien code envoie partout :
 *   - temperature / top_p / top_k différents de la valeur par défaut ;
 *   - thinking { type: 'enabled', budget_tokens } (remplacé par thinking adaptatif + output_config.effort) ;
 *   - thinking { type: 'disabled' } sur Sonnet 5.5 (remplacé par { type: 'between_tools' }).
 * Plutôt que de retoucher les ~30 appels un par un, chaque requête passe par `compatFetch`, qui
 * réécrit le corps JSON juste avant l'envoi. Les appels gardent leur code, le modèle reçoit un corps valide.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

export const CLAUDE_MAIN  = 'claude-sonnet-5-5';
export const CLAUDE_FAST  = 'claude-haiku-5-5';

const MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-6':          CLAUDE_MAIN,
  'claude-sonnet-4-5':          CLAUDE_MAIN,
  'claude-sonnet-4-20250514':   CLAUDE_MAIN,
  'claude-haiku-4-5':          CLAUDE_FAST,
  'claude-haiku-4-5-20251001': CLAUDE_FAST,
  'claude-3-5-haiku-20241022':  CLAUDE_FAST,
  'claude-3-5-haiku-latest':    CLAUDE_FAST,
  'claude-3-haiku-20240307':    CLAUDE_FAST,
};

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

type Body = Record<string, any>;

/** Réécrit un corps /v1/messages pour les modèles 5.5. Retourne les betas à ajouter. */
export function adaptMessagesBody(body: Body): string[] {
  const betas: string[] = [];
  if (typeof body.model !== 'string') return betas;
  body.model = MODEL_MAP[body.model] ?? body.model;
  const isSonnet = body.model === CLAUDE_MAIN;
  const isHaiku  = body.model === CLAUDE_FAST;
  if (!isSonnet && !isHaiku) return betas;

  // Échantillonnage : refusé s'il n'est pas à la valeur par défaut
  delete body.temperature;
  delete body.top_p;
  delete body.top_k;

  // Réflexion : budget fixe → adaptatif + niveau d'effort
  const th = body.thinking;
  const oc = (body.output_config ??= {});
  if (th?.type === 'enabled') {
    const budget = Number(th.budget_tokens) || 0;
    body.thinking = { type: 'adaptive' };
    oc.effort ??= budget >= 4000 ? 'high' : 'medium';
  } else if (!th || th.type === 'disabled') {
    // L'ancien code ne réfléchissait pas ici → on garde ce comportement (rapide, réponse en premier bloc)
    body.thinking = isSonnet ? { type: 'between_tools' } : { type: 'disabled' };
    oc.effort ??= isSonnet ? 'medium' : 'low';
    if (['xhigh', 'max'].includes(oc.effort)) oc.effort = 'high';
  }

  // La réflexion compte dans max_tokens : un plafond trop court couperait la réponse
  if (body.thinking?.type === 'adaptive' && typeof body.max_tokens === 'number' && body.max_tokens < 4096) {
    body.max_tokens = 4096;
  }

  // Sonnet 5.5 peut refuser une demande (stop_reason 'refusal') : repli automatique côté serveur
  if (isSonnet && body.fallbacks === undefined) {
    body.fallbacks = 'default';
    betas.push(FALLBACK_BETA);
  }
  return betas;
}

function mergeBetas(headers: Headers, betas: string[]): void {
  if (!betas.length) return;
  const cur = (headers.get('anthropic-beta') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  for (const b of betas) if (!cur.includes(b)) cur.push(b);
  headers.set('anthropic-beta', cur.join(','));
}

// ── Survie sans crédit Claude (15/10/2026) ──
// Crédit épuisé / clé coupée → les appels NON streamés (démarchage, conseiller, résumés, agents en lecture…) sont
// rejoués sur les cerveaux gratuits (Groq, Gemini, puis OpenAI) au format OpenAI, et la réponse est rendue au format
// Anthropic : le code appelant ne voit pas la différence. Le chat (streamé) a déjà son propre repli (orchestrator).
const DEAD_RE = /credit balance|billing|purchase credits|insufficient|quota/i;
let claudeDeadUntil = 0;
// ── Dzaryx à 0 € (Kouider 2026-10-29 : « Dzaryx gratuit sauf Railway, aussi puissant qu'avec Claude ») ──
// Mode gratuit (défaut) : Claude n'est PLUS JAMAIS appelé. Chaque requête /v1/messages part sur la chaîne de
// cerveaux gratuits (agentic-fallback.ts : Gemini, NVIDIA, Mistral, Cerebras, OpenRouter, Groq), même les requêtes
// streamées (réponse rejouée en SSE). Interrupteur : app_kv « brain:free » ('0' = Claude payant), outil billing.
let freeCache = { on: process.env['FREE_BRAIN'] !== '0', at: 0 };
function refreshFree(): void {
  if (Date.now() - freeCache.at < 60_000) return;
  freeCache.at = Date.now();
  void import('./app-store.js').then(m => m.kvGet('brain:free'))
    .then(v => { if (v === '0' || v === '1') freeCache.on = v === '1'; }).catch(() => {});
}
export function freeModeOn(): boolean { refreshFree(); return freeCache.on; }
export function setFreeCache(on: boolean): void { freeCache = { on, at: Date.now() }; }

/** Claude à ne pas appeler (mode gratuit, ou crédit épuisé revérifié toutes les 10 min) : on part direct sur le gratuit. */
export const claudeKnownDead = (): boolean => freeModeOn() || Date.now() < claudeDeadUntil;

/** Message Anthropic (JSON) → flux SSE identique à celui de l'API, pour les appels .stream() en mode gratuit. */
function toSSE(msg: Body): Response {
  const ev = (type: string, data: Body) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const blocks = (msg.content ?? []) as Body[];
  let out = ev('message_start', { message: { ...msg, content: [], stop_reason: null, usage: { input_tokens: msg.usage?.input_tokens ?? 0, output_tokens: 0 } } });
  blocks.forEach((b, index) => {
    if (b.type === 'tool_use') {
      out += ev('content_block_start', { index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } });
      out += ev('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input ?? {}) } });
    } else {
      out += ev('content_block_start', { index, content_block: { type: 'text', text: '' } });
      out += ev('content_block_delta', { index, delta: { type: 'text_delta', text: String(b.text ?? '') } });
    }
    out += ev('content_block_stop', { index });
  });
  out += ev('message_delta', { delta: { stop_reason: msg.stop_reason ?? 'end_turn', stop_sequence: null }, usage: { output_tokens: msg.usage?.output_tokens ?? 0 } });
  out += ev('message_stop', {});
  return new Response(out, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function isClaudeDead(status: number, text: string): boolean {
  if (status === 401 || status === 402) return true;
  return (status === 400 || status === 403) && DEAD_RE.test(text);
}

type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown };
function blockText(c: unknown): string {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return (c as Block[]).map(b => b.type === 'text' ? b.text ?? '' : b.type === 'image' || b.type === 'document'
    ? '[pièce jointe non lisible par ce modèle de secours : dis-le, ne la décris pas, n\'invente rien]' : '').filter(Boolean).join('\n');
}

/** Message user avec images → parts OpenAI (image_url) pour les modèles qui voient (Gemini, OpenAI). */
function userParts(blocks: Block[]): Body[] | null {
  const imgs = blocks.filter(b => b.type === 'image') as Array<Block & { source?: { type?: string; media_type?: string; data?: string; url?: string } }>;
  if (!imgs.length) return null;
  const parts: Body[] = imgs.map(b => ({ type: 'image_url', image_url: { url: b.source?.type === 'url' ? b.source.url : `data:${b.source?.media_type ?? 'image/jpeg'};base64,${b.source?.data ?? ''}` } }));
  const text = blocks.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n');
  if (text) parts.push({ type: 'text', text });
  return parts;
}

// Gemini 3 exige qu'on lui renvoie la « thought_signature » de chaque appel d'outil (sinon 400 au tour suivant :
// 24/10, conseiller et veille plantés). Le format Anthropic n'a pas de place pour elle → gardée ici par id d'appel.
const toolSignatures = new Map<string, unknown>();
function keepSignature(id: string, extra: unknown): void {
  if (!id || !extra) return;
  toolSignatures.set(id, extra);
  if (toolSignatures.size > 500) toolSignatures.delete(toolSignatures.keys().next().value as string);
}

/** Corps Anthropic → corps OpenAI chat/completions. */
function toOpenAI(body: Body, model: string, vision = false, maxTools = 120, deep = false): Body {
  const msgs: Body[] = [];
  const sys = blockText(body.system);
  if (sys) msgs.push({ role: 'system', content: sys });
  for (const m of (body.messages ?? []) as Array<{ role: string; content: unknown }>) {
    if (typeof m.content === 'string') { msgs.push({ role: m.role, content: m.content }); continue; }
    const blocks = (m.content ?? []) as Block[];
    if (m.role === 'assistant') {
      const calls = blocks.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        ...(toolSignatures.has(b.id ?? '') ? { extra_content: toolSignatures.get(b.id ?? '') } : {}) }));
      msgs.push({ role: 'assistant', content: blockText(blocks) || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of blocks.filter(x => x.type === 'tool_result')) msgs.push({ role: 'tool', tool_call_id: b.tool_use_id, content: blockText(b.content) || 'ok' });
      const parts = vision ? userParts(blocks) : null;
      const t = blockText(blocks);
      if (parts) msgs.push({ role: 'user', content: parts });
      else if (t) msgs.push({ role: 'user', content: t });
    }
  }
  // Groq refuse > 128 outils : on garde les 120 plus utiles pour la demande
  const lastUser = [...msgs].reverse().find(m => m.role === 'user');
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : '';
  const pickText = userText.trim().length < 25 ? msgs.slice(-4).map(m => typeof m.content === 'string' ? m.content.slice(0, 600) : '').join('\n') : userText;
  const allTools = ((body.tools ?? []) as Array<{ name: string; description?: string; input_schema?: unknown }>).filter(t => t.input_schema);
  const tools = (allTools.length > maxTools ? pickFallbackTools(allTools as Anthropic.Tool[], pickText, maxTools) : allTools)
    .map(t => ({ type: 'function', function: { name: t.name, description: (t.description ?? '').slice(0, 1024), parameters: t.input_schema } }));
  // Gemini 3 : réflexion « minimal » (2 s au lieu de 10 s ; avec « low » la réflexion mangeait max_tokens → réponse coupée, 29/10).
  // Tâche importante (QUALITY) ou demande de fond : « medium » avec 8 000 tokens de marge, pour la qualité Claude.
  // gemini-flash-latest refuse « minimal » (400 à chaque appel, 29/10) → « low » avec plus de marge
  const gemini = /^gemini/.test(model);
  const noMinimal = /^gemini-flash-latest$/.test(model);
  return { model, messages: msgs, max_tokens: deep ? 8192 : Math.min(Math.max(Number(body.max_tokens) || 1024, gemini ? (noMinimal ? 4096 : 1024) : 0), 8000),
    ...(gemini ? { reasoning_effort: deep ? 'medium' : noMinimal ? 'low' : 'minimal' } : {}), ...(tools.length ? { tools } : {}) };
}

/** Réponse OpenAI → message Anthropic. */
function toAnthropic(data: Body, model: string, allowed: Set<string> = new Set()): Body {
  const msg = data?.choices?.[0]?.message ?? {};
  // Nemotron : appels d'outils écrits en texte → vrais appels (29/10)
  if (!(msg.tool_calls ?? []).length && allowed.size) {
    const calls = textToolCalls(msg.content, allowed);
    if (calls.length) { msg.tool_calls = calls; msg.content = null; }
  }
  const content: Body[] = [];
  if (msg.content) content.push({ type: 'text', text: String(msg.content) });
  for (const c of (msg.tool_calls ?? []) as Array<{ id: string; function: { name: string; arguments: string }; extra_content?: unknown }>) {
    keepSignature(c.id, c.extra_content);
    let input: unknown = {};
    try { input = JSON.parse(c.function.arguments || '{}'); } catch { /* arguments illisibles */ }
    content.push({ type: 'tool_use', id: c.id, name: c.function.name, input });
  }
  if (!content.length) content.push({ type: 'text', text: '' });
  return {
    id: `fallback_${Date.now()}`, type: 'message', role: 'assistant', model: `fallback:${model}`, content,
    stop_reason: (msg.tool_calls ?? []).length ? 'tool_use' : 'end_turn', stop_sequence: null,
    usage: { input_tokens: data?.usage?.prompt_tokens ?? 0, output_tokens: data?.usage?.completion_tokens ?? 0 },
  };
}

let pickFallbackTools: typeof import('./agentic-fallback.js').pickFallbackTools = t => t;
let textToolCalls: typeof import('./agentic-fallback.js').textToolCalls = () => [];

async function freeBrain(body: Body, quality = false): Promise<Response | null> {
  const { fallbackEndpoints, pickFallbackTools: pick, markFailure, hedgedRace, visionFirst, needsDeepThought, textToolCalls: ttc } = await import('./agentic-fallback.js');
  pickFallbackTools = pick;
  textToolCalls = ttc;
  const msgs = (body.messages ?? []) as Array<{ role: string; content: unknown }>;
  const hasImage = msgs.some(m => Array.isArray(m.content) && (m.content as Block[]).some(b => b.type === 'image'));
  const lastUser = blockText([...msgs].reverse().find(m => m.role === 'user')?.content);
  const deep = quality || needsDeepThought(lastUser);
  // Course relais (29/10) : un cerveau lent ou en panne est doublé par le suivant, le 1er qui répond gagne
  // Tâche de fond simple sans outils (résumé, tri, classement) : Gemini « lite » d'abord → les gros Gemini gardent
  // leur quota du jour pour les conversations avec Kouider (29/10 : quota vide dès 8 h)
  const all = fallbackEndpoints();
  const light = !deep && !hasImage && !((body.tools ?? []) as unknown[]).length;
  const eps = light ? [...all.filter(e => /lite/.test(e.model)), ...all.filter(e => !/lite/.test(e.model))] : visionFirst(all, hasImage);
  const race = await hedgedRace(eps, async (ep, signal) => {
    try {
      const oai = toOpenAI(body, ep.model, !!ep.vision, ep.toolMax ?? 120, deep);
      // Groq : 8 000 tokens/min → descriptions d'outils raccourcies (61 outils = 8 500 tokens : 2e tour toujours refusé)
      if (ep.key === 'groq') for (const t of (oai.tools ?? []) as Body[]) t.function.description = String(t.function.description ?? '').slice(0, 200);
      // NVIDIA / OpenRouter : descriptions plafonnées (descMax)
      if (ep.descMax) for (const t of (oai.tools ?? []) as Body[]) t.function.description = String(t.function.description ?? '').slice(0, ep.descMax);
      const timeout = ep.key === 'groq' || ep.key === 'openai' ? 60_000 : ep.key === 'gemini' && !deep ? 30_000 : 60_000;
      const post = () => fetch(ep.url, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${ep.apiKey}` },
        body: JSON.stringify(oai), signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]) });
      let r = await post();
      const wait = Number(r.headers.get('retry-after') ?? NaN);
      if (ep.key === 'groq' && r.status === 429 && wait <= 30) {   // quota/minute : attendre vaut mieux que planter la tâche
        await new Promise(res => setTimeout(res, (wait + 1) * 1000));
        r = await post();
      }
      // 23/10 : quota du jour (429), surcharge (503) → modèle sauté 15 min au lieu d'être réessayé à chaque tour
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        if (ep.key !== 'groq' && ep.key !== 'openai' && [429, 503, 404, 410].includes(r.status)) markFailure(ep.qid ?? ep.model, r.status, detail);
        throw new Error(`${r.status} ${detail.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      const out = toAnthropic(await r.json() as Body, ep.model, new Set(((oai.tools ?? []) as Body[]).map(t => String(t.function.name))));
      console.warn(`[claude-secours] réponse servie par ${ep.key} (${ep.model})${deep ? ' — réflexion' : ''}`);
      return out;
    } catch (err) {
      if (!signal.aborted) {
        if (ep.key !== 'groq' && ep.key !== 'openai' && !(err instanceof Error && /^\d{3} /.test(err.message))) markFailure(ep.qid ?? ep.model);   // figé (gemini-flash-latest ne répondait plus du tout le 23/10)
        console.warn(`[claude-secours] ${ep.key}/${ep.model}:`, err instanceof Error ? err.message : err);
      }
      throw err;
    }
  }, ep => ep.key === 'gemini' ? (deep ? 15_000 : 8_000) : 14_000);
  if ('error' in race) return null;
  return new Response(JSON.stringify(race.value), { status: 200, headers: { 'content-type': 'application/json' } });
}

// ── Mode économie (15/10/2026, Kouider : « le moins de frais possible ») ──
// Les appels NON streamés (tâches de fond) passent de Sonnet à Haiku (~20× moins cher), sauf ceux marqués QUALITY
// (mails aux prospects, conseiller business, inspections photo). Le chat (streamé) garde Sonnet.
// Interrupteur : app_kv « billing:eco » ('0' = coupé), page À PAYER. Activé par défaut.
export const QUALITY = { headers: { 'x-dz-quality': 'high' } } as const;
let ecoCache: { on: boolean; at: number } = { on: true, at: 0 };
export let ecoDowngrades = 0;
async function ecoOn(): Promise<boolean> {
  if (Date.now() - ecoCache.at > 60_000) {
    try {
      const { kvGet } = await import('./app-store.js');
      ecoCache = { on: (await kvGet('billing:eco')) !== '0', at: Date.now() };
    } catch { ecoCache.at = Date.now(); }
  }
  return ecoCache.on;
}
export function setEcoCache(on: boolean): void { ecoCache = { on, at: Date.now() }; }
/** Haiku accepte ce corps ? (pas de réflexion forcée, seulement des outils « maison ») */
function ecoSafe(body: Body): boolean {
  if (body.thinking && body.thinking.type !== 'disabled') return false;
  return ((body.tools ?? []) as Body[]).every(t => !t.type || t.type === 'custom');
}

/** Origine d'un appel (fichier appelant, sinon début du prompt système) — pour savoir QUI consomme le crédit. */
function callerSource(body: Body): string {
  const frames = (new Error().stack ?? '').split('\n');
  for (const f of frames) {
    const m = f.match(/src\/(?:integrations|queue|agents|conversation|api|notifications|bi|orchestrator|actions)\/(?:[\w-]+\/)*([\w-]+)\.(?:ts|js)/);
    if (m && !/anthropic-compat|cost-tracker/.test(m[1])) return m[1];
  }
  const sys = Array.isArray(body.system) ? String((body.system as Body[])[0]?.text ?? '') : String(body.system ?? '');
  return `sys-${sys.replace(/\s+/g, ' ').trim().slice(0, 24)}` || 'inconnu';
}

export const compatFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let parsed: Body | null = null;
  let quality = false;
  if (init?.body && typeof init.body === 'string' && /\/v1\/messages(\/count_tokens)?(\?|$)/.test(url)) {
    try {
      const body = JSON.parse(init.body) as Body;
      const headers = new Headers(init.headers);
      quality = headers.get('x-dz-quality') === 'high';
      headers.delete('x-dz-quality');
      if (!url.includes('count_tokens') && !body.stream && !quality && typeof body.model === 'string'
          && (MODEL_MAP[body.model] ?? body.model) === CLAUDE_MAIN && ecoSafe(body) && await ecoOn()) {
        body.model = CLAUDE_FAST;
        ecoDowngrades++;
      }
      const betas = adaptMessagesBody(body);
      if (url.includes('count_tokens')) { delete body.fallbacks; betas.length = 0; }
      else parsed = body;
      mergeBetas(headers, betas);
      init = { ...init, body: JSON.stringify(body), headers };
    } catch { /* corps non JSON : envoyé tel quel */ }
  }
  // Mode gratuit : jamais Claude. count_tokens estimé, le reste sur la chaîne gratuite.
  if (freeModeOn() && /\/v1\/messages/.test(url)) {
    const json = (status: number, data: Body) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (url.includes('count_tokens')) return json(200, { input_tokens: Math.ceil(String(init?.body ?? '').length / 3.5) });
    const r = parsed ? await freeBrain(parsed, quality) : null;
    if (r) return parsed!.stream ? toSSE(await r.json() as Body) : r;
    return json(503, { type: 'error', error: { type: 'overloaded_error', message: 'mode gratuit : aucun cerveau gratuit disponible pour le moment' } });
  }
  const canRescue = !!parsed && !parsed.stream;
  // Claude déjà connu comme coupé : on ne perd pas de temps, on revérifie toutes les 10 min
  if (canRescue && Date.now() < claudeDeadUntil) {
    const r = await freeBrain(parsed!);
    if (r) return r;
  }
  const src = parsed && !parsed.stream ? callerSource(parsed) : '';
  const res = await fetch(input, init);
  if (parsed && !parsed.stream && res.ok) {
    void res.clone().json().then((x: unknown) => {
      const j = x as Body;
      const u = j?.usage ?? {};
      return import('../monitoring/cost-tracker.js').then(c => c.trackTokenUsage(String(j?.model ?? parsed!.model), u.input_tokens ?? 0,
        u.output_tokens ?? 0, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0, src));
    }).catch(() => {});
  }
  if (parsed && res.ok && claudeDeadUntil) {       // Claude remarche (recharge faite) → fin du mode secours
    claudeDeadUntil = 0;
    void import('./billing.js').then(b => b.clearClaudeOut()).catch(() => {});
  }
  if (!parsed || res.ok || res.status < 400 || res.status >= 500) return res;
  const text = await res.clone().text().catch(() => '');
  if (!isClaudeDead(res.status, text)) return res;
  claudeDeadUntil = Date.now() + 10 * 60_000;
  void import('./billing.js').then(b => b.markClaudeCreditOut(`${res.status} ${text.replace(/\s+/g, ' ').slice(0, 120)}`)).catch(() => {});
  if (!canRescue) return res;
  return (await freeBrain(parsed)) ?? res;
};

/** À utiliser à la place de `new Anthropic({ apiKey })` partout dans le backend. */
export function createAnthropic(apiKey: string = env.ANTHROPIC_API_KEY ?? ''): Anthropic {
  return new Anthropic({ apiKey, fetch: compatFetch });
}

/** Même réécriture pour les appels HTTP directs (axios) : renvoie corps + en-tête beta éventuel. */
export function adaptRawRequest(body: Body, headers: Record<string, string>): { body: Body; headers: Record<string, string> } {
  const b = JSON.parse(JSON.stringify(body)) as Body;
  const betas = adaptMessagesBody(b);
  const h = { ...headers };
  if (betas.length) {
    const cur = (h['anthropic-beta'] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    h['anthropic-beta'] = [...new Set([...cur, ...betas])].join(',');
  }
  return { body: b, headers: h };
}
