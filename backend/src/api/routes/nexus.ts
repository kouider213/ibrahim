import { Router } from 'express';
import { isNexusOnline, pingNexus, getNexusMac, getNexusIp } from '../../actions/handlers/nexus-relay.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/nexus/status — état connexion NEXUS
router.get('/status', requireMobileAuth, (_req, res) => {
  res.json({
    connected: isNexusOnline(),
    mac:       getNexusMac() || null,
    ip:        getNexusIp()  || null,
  });
});

// POST /api/nexus/ping — ping réel avec heure du PC
router.post('/ping', requireMobileAuth, async (_req, res) => {
  if (!isNexusOnline()) {
    res.status(503).json({ ok: false, error: 'NEXUS hors ligne — lance start.bat sur le PC Windows' });
    return;
  }
  try {
    const result = await pingNexus();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(504).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
