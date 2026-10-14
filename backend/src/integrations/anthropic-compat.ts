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

export const compatFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (init?.body && typeof init.body === 'string' && /\/v1\/messages(\/count_tokens)?(\?|$)/.test(url)) {
    try {
      const body = JSON.parse(init.body) as Body;
      const betas = adaptMessagesBody(body);
      if (url.includes('count_tokens')) { delete body.fallbacks; betas.length = 0; }
      const headers = new Headers(init.headers);
      mergeBetas(headers, betas);
      init = { ...init, body: JSON.stringify(body), headers };
    } catch { /* corps non JSON : envoyé tel quel */ }
  }
  return fetch(input, init);
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
