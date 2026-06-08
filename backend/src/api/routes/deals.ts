import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { getAutoOpportunities } from '../../integrations/opportunities.js';

const router = Router();

// GET /api/deals/opportunities?force=1 — briefing opportunités marché auto Algérie
router.get('/opportunities', requireMobileAuth, async (req, res) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true';
    const report = await getAutoOpportunities(force);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
