import { kvGet, kvSet } from './app-store.js';

// Taux de change DZD : officiel (open.er-api.com) + marché parallèle (« square », API communautaires
// ou taux saisi à la main par Kouider dans l'app). Utilisé par la page Devises et l'outil convert_currency.

const MANUAL_KEY = 'dzaryx:parallel_rate_manual';
const CACHE_MS   = 30 * 60_000;
let cache: { at: number; value: RatesResult } | null = null;

export interface RatesResult {
  official: {
    eur_to_dzd: number;
    usd_to_dzd: number;
    eur_to_usd: number;
    updated_at: string;
  };
  parallel: {
    eur_to_dzd: number | null;
    usd_to_dzd: number | null;
    source: string;
    updated_at: string;
  } | null;
}

export async function fetchOfficialRates(): Promise<RatesResult['official'] | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number>; time_last_update_utc?: string };
    if (!data.rates?.DZD) return null;
    return {
      eur_to_dzd: Math.round(data.rates['DZD'] * 100) / 100,
      usd_to_dzd: Math.round((data.rates['DZD'] / (data.rates['USD'] ?? 1)) * 100) / 100,
      eur_to_usd: Math.round((data.rates['USD'] ?? 1) * 10000) / 10000,
      updated_at: data.time_last_update_utc ?? new Date().toISOString(),
    };
  } catch { return null; }
}

export async function fetchParallelRate(): Promise<RatesResult['parallel']> {
  // Try dinarco.app API (Algerian community app)
  try {
    const res = await fetch('https://api.dinarco.app/api/v1/rates', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json() as { EUR?: { parallel?: number }; USD?: { parallel?: number } };
      const eur = data.EUR?.parallel;
      const usd = data.USD?.parallel;
      if (eur && eur > 100) {
        return { eur_to_dzd: eur, usd_to_dzd: usd ?? null, source: 'dinarco.app', updated_at: new Date().toISOString() };
      }
    }
  } catch { /* fall through */ }

  // Try alternative: algerie360 API (if available)
  try {
    const res = await fetch('https://api.algerie360.com/taux', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json() as { parallel_eur?: number; parallel_usd?: number };
      if (data.parallel_eur && data.parallel_eur > 100) {
        return { eur_to_dzd: data.parallel_eur, usd_to_dzd: data.parallel_usd ?? null, source: 'algerie360', updated_at: new Date().toISOString() };
      }
    }
  } catch { /* fall through */ }

  return null;
}

/** Taux officiels + parallèles (auto, sinon le dernier taux saisi à la main, valable 7 jours). Cache 30 min. */
export async function getRates(): Promise<RatesResult | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const [official, auto] = await Promise.all([fetchOfficialRates(), fetchParallelRate()]);
  if (!official) return null;
  let parallel = auto;
  if (!parallel) {
    const raw = await kvGet(MANUAL_KEY).catch(() => null);
    if (raw) { try { parallel = JSON.parse(raw) as RatesResult['parallel']; } catch { /* ignore */ } }
  }
  const value: RatesResult = { official, parallel };
  cache = { at: Date.now(), value };
  return value;
}

export async function setManualParallelRate(eur_to_dzd: number, usd_to_dzd: number | null): Promise<NonNullable<RatesResult['parallel']>> {
  const parallel = { eur_to_dzd, usd_to_dzd, source: 'Manuel', updated_at: new Date().toISOString() };
  await kvSet(MANUAL_KEY, JSON.stringify(parallel), 86400 * 7);
  cache = null;
  return parallel;
}
