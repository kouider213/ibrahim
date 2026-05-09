import { Router } from 'express';
import {
  isNexusOnline, pingNexus, getNexusMac, getNexusIp,
  isLauncherOnline, wakeNexus, getLauncherStatus,
} from '../../actions/handlers/nexus-relay.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { phantomGuard, PHANTOM_REFUSAL } from '../../conversation/response-guard.js';

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

// POST /api/nexus/test-phantom — TEST RÉEL du phantom guard (pas d'auth stricte pour debug)
// Prouve que la protection bloque une réponse "corrigé" sans outil réel
router.post('/test-phantom', requireMobileAuth, (req, res) => {
  const { scenario } = req.body as { scenario?: string };

  const cases = {
    // CAS 1 : Claude prétend avoir corrigé sans aucun outil → DOIT être bloqué
    phantom_no_tool: {
      simulatedResponse: '✅ Corrigé — j\'ai modifié votre site et pushé sur GitHub.',
      toolsExecuted: [],
      userMessage: 'corrige mon site',
    },
    // CAS 2 : Claude dit corrigé AVEC l'outil write qui a réussi → DOIT passer
    legitimate_with_tool: {
      simulatedResponse: '✅ Corrigé — j\'ai modifié le fichier cars.ts.',
      toolsExecuted: [{ name: 'github_patch_file', success: true, result: '✅ Fichier modifié' }],
      userMessage: 'corrige mon site',
    },
    // CAS 3 : Claude dit corrigé mais l'outil a ÉCHOUÉ → DOIT être bloqué
    phantom_failed_tool: {
      simulatedResponse: '✅ Corrigé — j\'ai modifié votre site.',
      toolsExecuted: [{ name: 'github_patch_file', success: false, result: '❌ Erreur GitHub 404' }],
      userMessage: 'corrige mon site',
    },
    // CAS 4 : Réponse normale sans claim → DOIT passer
    normal_response: {
      simulatedResponse: 'Je peux regarder votre site. Quel fichier voulez-vous modifier ?',
      toolsExecuted: [],
      userMessage: 'corrige mon site',
    },
  } as const;

  const key = (scenario ?? 'phantom_no_tool') as keyof typeof cases;
  const testCase = cases[key] ?? cases.phantom_no_tool;

  const result = phantomGuard(
    testCase.simulatedResponse,
    testCase.toolsExecuted,
    testCase.userMessage,
    `test_${Date.now()}`,
  );

  const wasBlocked = result === PHANTOM_REFUSAL;

  res.json({
    scenario:           key,
    input_response:     testCase.simulatedResponse,
    tools_executed:     testCase.toolsExecuted,
    output_response:    result,
    phantom_blocked:    wasBlocked,
    expected_blocked:   key === 'phantom_no_tool' || key === 'phantom_failed_tool',
    test_passed:        wasBlocked === (key === 'phantom_no_tool' || key === 'phantom_failed_tool'),
    phantom_refusal_msg: PHANTOM_REFUSAL,
  });
});

export default router;
