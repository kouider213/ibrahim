/**
 * Petits outils communs des modules « Jarvis 3 » (27/10/2026) : appel Claude, JSON, app_kv en JSON, Telegram (muet en
 * crash-test), agent de lecture avec le web, dernière photo envoyée par Kouider.
 */
import { createAnthropic, CLAUDE_FAST, CLAUDE_MAIN, QUALITY } from './anthropic-compat.js';
import { kvGet, kvSet } from './app-store.js';
import { inSandbox } from './crash-test-sandbox.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
export { jsonOf } from './media-util.js';

/** emergency : 'voix' (voiture, réveil…) = si TOUS les cerveaux gratuits échouent, secours Claude Haiku (anthropic-compat). */
export async function ai(prompt: string, opts: { system?: string; quality?: boolean; max?: number; images?: Array<{ base64: string; mime: string }>; emergency?: 'voix' | 'chat' } = {}): Promise<string> {
  if (!opts.emergency) return aiOnce(prompt, opts);
  const first = await aiOnce(prompt, opts).catch(e => { console.warn('[ai] gratuit en échec :', e instanceof Error ? e.message.slice(0, 120) : e); return ''; });
  if (first) return first;
  const { runClaudeEmergency } = await import('./anthropic-compat.js');
  return (await runClaudeEmergency(() => aiOnce(prompt, { ...opts, quality: false }), opts.emergency).catch(() => null)) ?? '';
}

async function aiOnce(prompt: string, opts: { system?: string; quality?: boolean; max?: number; images?: Array<{ base64: string; mime: string }> }): Promise<string> {
  const content = [
    ...(opts.images ?? []).map(i => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: (/png|webp|gif/.test(i.mime) ? i.mime : 'image/jpeg') as 'image/jpeg', data: i.base64 } })),
    { type: 'text' as const, text: prompt },
  ];
  const r = await createAnthropic().messages.create({
    model: opts.quality ? CLAUDE_MAIN : CLAUDE_FAST, max_tokens: opts.max ?? 1200,
    ...(opts.system ? { system: opts.system } : {}), messages: [{ role: 'user', content }],
  }, opts.quality ? QUALITY : undefined);
  return r.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
}

export async function kvJson<T>(key: string, fallback: T): Promise<T> {
  try { const v = await kvGet(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
export async function kvPut(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  await kvSet(key, JSON.stringify(value), ttlSeconds);
}

/** Message Telegram à Kouider (rien pendant un crash-test). Les ** du markdown sont retirés (Telegram en texte brut). */
export async function tg(text: string, imageB64?: string): Promise<void> {
  if (inSandbox()) return;
  await queueTelegramMessage(text.replace(/\*\*/g, ''), imageB64).catch(() => {});
}

/** Dzaryx qui cherche seul (outils de lecture + web), qualité Sonnet. */
export async function research(instruction: string, opts: { system?: string; rounds?: number; max?: number; sessionId?: string } = {}): Promise<string> {
  const { runReadOnlyAgent } = await import('./readonly-agent.js');
  const r = await runReadOnlyAgent(`Aujourd'hui : ${new Date().toISOString().slice(0, 10)}.\n${instruction}`,
    { system: opts.system, maxRounds: opts.rounds ?? 6, maxTokens: opts.max ?? 1800, quality: true, sessionId: opts.sessionId ?? 'jarvis3' });
  return r.text;
}

/** Dernière photo envoyée par Kouider (app : session ; Telegram : 30 min). */
export async function lastPhoto(sessionId?: string): Promise<{ base64: string; mime: string } | null> {
  if (sessionId) {
    const { redis } = await import('../queue/queue.js');
    const c = await redis.get(`session:image:${sessionId}`).catch(() => null);
    if (c) { const j = JSON.parse(c) as { base64: string; mime?: string }; return { base64: j.base64, mime: j.mime ?? 'image/jpeg' }; }
  }
  const t = await import('./forme.js').then(m => m.lastTelegramPhoto()).catch(() => null);
  return t ? { base64: t.b64, mime: t.mime ?? 'image/jpeg' } : null;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const uid = () => Math.random().toString(36).slice(2, 8);

/** Une recherche web rend souvent du texte (tableau, liste) au lieu du JSON demandé : Haiku le range en JSON. */
export async function extractJson<T>(text: string, shape: string): Promise<T | null> {
  const { jsonOf } = await import('./media-util.js');
  const direct = jsonOf<T>(text);
  if (direct) return direct;
  return jsonOf<T>(await ai(`Range ces résultats de recherche dans ce JSON exact (n'invente rien, garde les liens) :\n${shape}\n\nRésultats :\n${text.slice(0, 12000)}\n\nRéponds UNIQUEMENT avec le JSON.`, { max: 2500 }));
}
