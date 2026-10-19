/**
 * Disjoncteur « plus de crédit » : un fournisseur qui répond quota/crédit/clé refusée est mis de côté
 * 30 min, la chaîne passe directement au suivant (Kouider : Dzaryx ne doit jamais tomber en panne
 * tant que Railway est payé — il bascule sur un secours gratuit).
 */
const OUT_MS = 30 * 60_000;
const outUntil = new Map<string, number>();

const CREDIT_RE = /insufficient_quota|credit|quota|billing|exceeded|payment|402|401|unauthori[sz]ed|invalid.?api.?key|rate.?limit|429/i;

export function isOut(provider: string): boolean {
  const until = outUntil.get(provider);
  if (!until) return false;
  if (Date.now() > until) { outUntil.delete(provider); return false; }
  return true;
}

/** À appeler quand un fournisseur échoue : coupé 30 min si c'est une erreur de crédit/clé. */
export function noteFailure(provider: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401 || status === 402 || status === 429 || CREDIT_RE.test(msg)) {
    if (!isOut(provider)) console.warn(`[credit-guard] ${provider} hors service 30 min (crédit/quota) : ${msg.slice(0, 120)}`);
    outUntil.set(provider, Date.now() + OUT_MS);
  }
}

export function outProviders(): string[] {
  return [...outUntil.keys()].filter(isOut);
}
