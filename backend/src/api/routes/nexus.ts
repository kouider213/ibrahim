import { Router } from 'express';
import {
  isNexusOnline, pingNexus, getNexusMac, getNexusIp,
  isLauncherOnline, wakeNexus, getLauncherStatus,
} from '../../actions/handlers/nexus-relay.js';
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

// POST /api/nexus/wake — réveiller Nexus via Launcher
router.post('/wake', requireMobileAuth, async (_req, res) => {
  if (!isLauncherOnline()) {
    res.status(503).json({
      ok:    false,
      error: 'Launcher hors ligne — le PC n\'est pas joignable. Allume le PC et exécute install-nexus-launcher.bat',
    });
    return;
  }
  if (isNexusOnline()) {
    res.json({ ok: true, status: 'already_running', message: '✅ Nexus est déjà actif' });
    return;
  }
  try {
    const result = await wakeNexus();
    res.json({ ok: result.success, ...result });
  } catch (err) {
    res.status(504).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/nexus/full-status — état complet nexus + launcher
router.get('/full-status', requireMobileAuth, async (_req, res) => {
  const launcherOnline = isLauncherOnline();
  let launcherStatus: Record<string, unknown> = {};
  if (launcherOnline) {
    try { launcherStatus = await getLauncherStatus(); } catch { /* timeout — ignore */ }
  }
  res.json({
    nexus:   { connected: isNexusOnline(), mac: getNexusMac() || null, ip: getNexusIp() || null },
    launcher: { connected: launcherOnline, ...launcherStatus },
  });
});

export default router;
