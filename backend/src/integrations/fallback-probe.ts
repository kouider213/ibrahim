/**
 * Fallback probe — vérifie VRAIMENT que chaque provider répond (pas seulement que la clé existe).
 * Né le 13/10/2026 : Groq (llama-3.3) et Gemini (2.0-flash) avaient retiré leurs modèles, la page santé
 * affichait « ✅ survive sans Claude » alors que seul OpenAI (payant) marchait encore.
 *
 * ok    = répond
 * busy  = 429/503/timeout (saturé ou quota du jour) → temporaire, pas d'alerte
 * down  = 4xx (modèle retiré, clé invalide, crédit épuisé) → à réparer
 */
import axios from 'axios';
import { fallbackEndpoints } from './agentic-fallback.js';
import { CLAUDE_FAST, adaptRawRequest } from './anthropic-compat.js';

export type ProbeState = 'ok' | 'busy' | 'down' | 'absent';
export interface ProbeResult { state: ProbeState; model: string; ms: number; error?: string }

const CLAUDE_PROBE_MODEL = CLAUDE_FAST;
const CACHE_MS = 30 * 60_000;
let cache: { at: number; results: Record<string, ProbeResult> } | null = null;

function classify(err: unknown): { state: ProbeState; error: string } {
  const ax = err as { response?: { status?: number; data?: unknown }; code?: string; message?: string };
  const status = ax.response?.status;
  const body   = JSON.stringify(ax.response?.data ?? '').slice(0, 160);
  const error  = status ? `${status} ${body}` : (ax.code ?? ax.message ?? String(err));
  if (!status || status === 429 || status >= 500) return { state: 'busy', error };
  return { state: 'down', error };
}

async function timed(model: string, fn: () => Promise<unknown>): Promise<ProbeResult> {
  const t = Date.now();
  try {
    await fn();
    return { state: 'ok', model, ms: Date.now() - t };
  } catch (err) {
    return { model, ms: Date.now() - t, ...classify(err) };
  }
}

export async function probeProviders(force = false): Promise<Record<string, ProbeResult>> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.results;

  const results: Record<string, ProbeResult> = {};
  const jobs: Array<Promise<void>> = [];

  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  if (anthropicKey && !(await import('./anthropic-compat.js')).freeModeOn()) {
    const req = adaptRawRequest(
      { model: CLAUDE_PROBE_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'OK' }] },
      { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    );
    jobs.push(timed(CLAUDE_PROBE_MODEL, () => axios.post('https://api.anthropic.com/v1/messages',
      req.body, { headers: req.headers, timeout: 20_000 },
    )).then(r => { results['claude'] = r; }));
  } else {
    results['claude'] = { state: 'absent', model: CLAUDE_PROBE_MODEL, ms: 0 };
  }

  for (const ep of fallbackEndpoints()) {
    jobs.push(timed(ep.model, () => axios.post(ep.url,
      { model: ep.model, messages: [{ role: 'user', content: 'Réponds juste OK' }], max_tokens: 64 },
      { headers: { Authorization: `Bearer ${ep.apiKey}` }, timeout: 30_000 },
    )).then(r => { results[ep.key] = r; }));
  }
  for (const k of ['groq', 'gemini', 'openai']) {
    if (!fallbackEndpoints().some(e => e.key === k)) results[k] = { state: 'absent', model: '', ms: 0 };
  }

  await Promise.all(jobs);
  cache = { at: Date.now(), results };
  return results;
}
