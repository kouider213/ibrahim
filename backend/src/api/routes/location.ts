import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { storeLocation, getLocation } from '../../integrations/location.js';

const router = Router();

// POST /api/location — store actor's GPS position
router.post('/', requireMobileAuth, async (req, res) => {
  const { lat, lng } = req.body as { lat?: number; lng?: number };
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ ok: false, error: 'lat and lng required as numbers' });
    return;
  }
  const actorId = req.mobileActor!.id;
  try {
    const loc = await storeLocation(actorId, lat, lng);
    res.json({ ok: true, location: loc });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/location — get actor's last known position
router.get('/', requireMobileAuth, async (req, res) => {
  const actorId = req.mobileActor!.id;
  try {
    const loc = await getLocation(actorId);
    res.json({ ok: true, location: loc });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
