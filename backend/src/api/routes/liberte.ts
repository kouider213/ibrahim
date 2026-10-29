import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { libOverview, liberteTool } from '../../integrations/liberte.js';

// Page « LIBERTÉ » de l'app : programme d'arrêt (privé, Kouider seulement). Mêmes actions que l'outil liberte de Dzaryx.
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});

// GET /api/liberte
router.get('/', async (_req, res) => {
  try { res.json(await libOverview()); } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/liberte/action { action, …champs de l'outil } → { message, overview }
router.post('/action', async (req, res) => {
  try {
    const message = await liberteTool((req.body ?? {}) as Record<string, unknown>, 'kouider');
    res.json({ message, overview: await libOverview() });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

export default router;
