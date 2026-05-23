import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { redis } from '../../queue/queue.js';

const router = Router();
const CACHE_KEY = 'dzaryx:exchange_rates';
const CACHE_TTL = 1800; // 30 min

interface RatesResult {
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

async function fetchOfficialRates(): Promise<RatesResult['official'] | null> {
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

async function fetchParallelRate(): Promise<RatesResult['parallel']> {
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

// GET /api/rates/exchange — official + parallel DZD rates
router.get('/exchange', requireMobileAuth, async (_req, res) => {
  try {
    // Try cache first
    const cached = await redis.get(CACHE_KEY).catch(() => null);
    if (cached) {
      res.json(JSON.parse(cached) as RatesResult);
      return;
    }

    const [official, parallel] = await Promise.all([fetchOfficialRates(), fetchParallelRate()]);

    if (!official) {
      res.status(503).json({ error: 'Impossible de récupérer les taux officiels' });
      return;
    }

    const result: RatesResult = { official, parallel };
    await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL).catch(() => {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/rates/parallel — manually set parallel rate (stored in Redis)
router.post('/parallel', requireMobileAuth, async (req, res) => {
  const { eur_to_dzd, usd_to_dzd } = req.body as { eur_to_dzd?: number; usd_to_dzd?: number };
  if (!eur_to_dzd || eur_to_dzd < 50 || eur_to_dzd > 2000) {
    res.status(400).json({ error: 'Taux EUR/DZD invalide (50–2000)' });
    return;
  }
  const parallel = { eur_to_dzd, usd_to_dzd: usd_to_dzd ?? null, source: 'Manuel', updated_at: new Date().toISOString() };
  // Invalidate cache so next fetch includes manual rate
  await redis.del(CACHE_KEY).catch(() => {});
  // Store manual rate separately with long TTL
  await redis.set('dzaryx:parallel_rate_manual', JSON.stringify(parallel), 'EX', 86400 * 7).catch(() => {});
  res.json({ ok: true, parallel });
});

export default router;
