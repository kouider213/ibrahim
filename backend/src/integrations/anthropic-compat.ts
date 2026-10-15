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

function isClaudeDead(status: number, text: string): boolean {
  if (status === 401 || status === 402) return true;
  return (status === 400 || status === 403) && DEAD_RE.test(text);
}

type Block = { type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown };
function blockText(c: unknown): string {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return (c as Block[]).map(b => b.type === 'text' ? b.text ?? '' : b.type === 'image' || b.type === 'document' ? '[pièce jointe non lisible en mode secours]' : '').filter(Boolean).join('\n');
}

/** Corps Anthropic → corps OpenAI chat/completions. */
function toOpenAI(body: Body, model: string): Body {
  const msgs: Body[] = [];
  const sys = blockText(body.system);
  if (sys) msgs.push({ role: 'system', content: sys });
  for (const m of (body.messages ?? []) as Array<{ role: string; content: unknown }>) {
    if (typeof m.content === 'string') { msgs.push({ role: m.role, content: m.content }); continue; }
    const blocks = (m.content ?? []) as Block[];
    if (m.role === 'assistant') {
      const calls = blocks.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      msgs.push({ role: 'assistant', content: blockText(blocks) || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of blocks.filter(x => x.type === 'tool_result')) msgs.push({ role: 'tool', tool_call_id: b.tool_use_id, content: blockText(b.content) || 'ok' });
      const t = blockText(blocks);
      if (t) msgs.push({ role: 'user', content: t });
    }
  }
  const tools = ((body.tools ?? []) as Array<{ name: string; description?: string; input_schema?: unknown }>).filter(t => t.input_schema)
    .map(t => ({ type: 'function', function: { name: t.name, description: (t.description ?? '').slice(0, 1024), parameters: t.input_schema } }));
  return { model, messages: msgs, max_tokens: Math.min(Number(body.max_tokens) || 1024, 8000), ...(tools.length ? { tools } : {}) };
}

/** Réponse OpenAI → message Anthropic. */
function toAnthropic(data: Body, model: string): Body {
  const msg = data?.choices?.[0]?.message ?? {};
  const content: Body[] = [];
  if (msg.content) content.push({ type: 'text', text: String(msg.content) });
  for (const c of (msg.tool_calls ?? []) as Array<{ id: string; function: { name: string; arguments: string } }>) {
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

async function freeBrain(body: Body): Promise<Response | null> {
  const { fallbackEndpoints } = await import('./agentic-fallback.js');
  for (const ep of fallbackEndpoints()) {
    try {
      const r = await fetch(ep.url, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${ep.apiKey}` },
        body: JSON.stringify(toOpenAI(body, ep.model)), signal: AbortSignal.timeout(90_000) });
      if (!r.ok) { console.warn(`[claude-secours] ${ep.key} ${r.status}`); continue; }
      const out = toAnthropic(await r.json() as Body, ep.model);
      console.warn(`[claude-secours] réponse servie par ${ep.key} (${ep.model})`);
      return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (err) { console.warn(`[claude-secours] ${ep.key}:`, err instanceof Error ? err.message : err); }
  }
  return null;
}

export const compatFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let parsed: Body | null = null;
  if (init?.body && typeof init.body === 'string' && /\/v1\/messages(\/count_tokens)?(\?|$)/.test(url)) {
    try {
      const body = JSON.parse(init.body) as Body;
      const betas = adaptMessagesBody(body);
      if (url.includes('count_tokens')) { delete body.fallbacks; betas.length = 0; }
      else parsed = body;
      const headers = new Headers(init.headers);
      mergeBetas(headers, betas);
      init = { ...init, body: JSON.stringify(body), headers };
    } catch { /* corps non JSON : envoyé tel quel */ }
  }
  const canRescue = !!parsed && !parsed.stream;
  // Claude déjà connu comme coupé : on ne perd pas de temps, on revérifie toutes les 10 min
  if (canRescue && Date.now() < claudeDeadUntil) {
    const r = await freeBrain(parsed!);
    if (r) return r;
  }
  const res = await fetch(input, init);
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
