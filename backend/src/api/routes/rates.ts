import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { getRates, setManualParallelRate } from '../../integrations/exchange-rates.js';

const router = Router();

// GET /api/rates/exchange — official + parallel DZD rates
router.get('/exchange', requireMobileAuth, async (_req, res) => {
  try {
    const result = await getRates();
    if (!result) {
      res.status(503).json({ error: 'Impossible de récupérer les taux officiels' });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/rates/parallel — manually set parallel rate (used when no community API answers)
router.post('/parallel', requireMobileAuth, async (req, res) => {
  const { eur_to_dzd, usd_to_dzd } = req.body as { eur_to_dzd?: number; usd_to_dzd?: number };
  if (!eur_to_dzd || eur_to_dzd < 50 || eur_to_dzd > 2000) {
    res.status(400).json({ error: 'Taux EUR/DZD invalide (50–2000)' });
    return;
  }
  try { res.json({ ok: true, parallel: await setManualParallelRate(eur_to_dzd, usd_to_dzd ?? null) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

export default router;
