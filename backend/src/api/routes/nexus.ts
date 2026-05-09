import { Router } from 'express';
import {
  isNexusOnline, pingNexus, getNexusMac, getNexusIp, getNexusStatus,
  isLauncherOnline, wakeNexus, getLauncherStatus,
  nexusRunCommand, nexusSysinfo, nexusScreenshot,
  listNexusJobs, getNexusJob,
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

// GET /api/nexus/telemetry — full telemetry (python_exe, RAM, CPU, OS, heartbeat)
router.get('/telemetry', requireMobileAuth, (_req, res) => {
  res.json({ ok: true, ...getNexusStatus() });
});

// POST /api/nexus/exec — run ONE shell command on the PC (security filter applies)
router.post('/exec', requireMobileAuth, async (req, res) => {
  if (!isNexusOnline()) {
    res.status(503).json({ ok: false, error: 'Nexus offline' });
    return;
  }
  const { command, cwd, timeout_ms } = req.body as {
    command?: string; cwd?: string; timeout_ms?: number; admin?: boolean;
  };
  if (!command?.trim()) {
    res.status(400).json({ ok: false, error: 'command required' });
    return;
  }
  try {
    const r = await nexusRunCommand(command, cwd, timeout_ms ?? 30_000);
    res.json({ ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr, jobId: r.jobId, blocked: r.blocked });
  } catch (err) {
    res.status(504).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/nexus/sysinfo — get real sysinfo from Nexus process
router.post('/sysinfo', requireMobileAuth, async (_req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  try {
    const r = await nexusSysinfo(12_000);
    const { ok: _ok, ...rest } = r;
    res.json({ ok: _ok, ...rest });
  } catch (err) {
    res.status(504).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/nexus/screenshot — take real desktop screenshot → Telegram
router.post('/screenshot', requireMobileAuth, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { caption } = req.body as { caption?: string };
  try {
    const r = await nexusScreenshot(caption, 35_000);
    res.json({ ok: r.ok, sent_to_telegram: r.sent_to_telegram, size_bytes: r.size_bytes, size_kb: r.size_bytes ? Math.round(r.size_bytes / 1024) : null, timestamp: r.timestamp, hostname: r.hostname, error: r.error });
  } catch (err) {
    res.status(504).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/nexus/jobs — list recent Nexus command jobs
router.get('/jobs', requireMobileAuth, (_req, res) => {
  res.json({ ok: true, jobs: listNexusJobs().slice(-20).reverse() });
});

// GET /api/nexus/jobs/:jobId — get specific job
router.get('/jobs/:jobId', requireMobileAuth, (req, res) => {
  const job = getNexusJob(req.params['jobId'] as string);
  if (!job) { res.status(404).json({ ok: false, error: 'Job not found' }); return; }
  res.json({ ok: true, job });
});

// POST /api/nexus/restart — restart Nexus process remotely (safe rolling restart)
router.post('/restart', requireMobileAuth, async (_req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline — cannot restart' }); return; }

  const NEXUS_DIR  = String.raw`C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus`;
  const NEXUS_EXE  = String.raw`C:\Users\douba\AppData\Local\Python\bin\python3.exe`;
  const beforeId   = getNexusStatus().socketId;

  res.json({
    ok:        true,
    message:   'Restart initiated — new Nexus process launching. Poll GET /api/nexus/telemetry to confirm new socket_id.',
    before_socket_id: beforeId,
    poll:      'GET /api/nexus/telemetry every 5s — done when socket_id changes and python_exe is non-null',
  });

  // Step 1 — get old PID
  let oldPid: string | null = null;
  try {
    const pidRes = await nexusRunCommand(
      `wmic process where "commandline like '%nexus.py%'" get processid /format:value`,
      NEXUS_DIR, 10_000,
    );
    const m = pidRes.stdout.match(/ProcessId=(\d+)/i);
    if (m) oldPid = m[1];
  } catch { /* non-critical */ }

  // Step 2 — launch new Nexus as detached process (new window, independent lifecycle)
  const launchCmd = [
    `powershell -Command "Start-Process -FilePath '${NEXUS_EXE}'`,
    `-ArgumentList 'nexus.py'`,
    `-WorkingDirectory '${NEXUS_DIR}'`,
    `-WindowStyle Hidden`,
    `-RedirectStandardOutput '${NEXUS_DIR}\\nexus_restart.log'`,
    `-RedirectStandardError '${NEXUS_DIR}\\nexus_restart_err.log'"`,
  ].join(' ');
  try {
    await nexusRunCommand(launchCmd, NEXUS_DIR, 15_000);
    console.log(`[NEXUS] New process launched. Old PID=${oldPid}`);
  } catch (e) {
    console.error('[NEXUS] Failed to launch new process:', e);
    return;
  }

  // Step 3 — wait 20s for new Nexus to connect and become active _nexusSocket
  await new Promise(r => setTimeout(r, 20_000));

  // Step 4 — kill old PID via new connection (if different socket now)
  const afterId = getNexusStatus().socketId;
  if (oldPid && afterId !== beforeId) {
    try {
      await nexusRunCommand(`taskkill /PID ${oldPid} /F`, undefined, 8_000);
      console.log(`[NEXUS] Old PID ${oldPid} killed. New socket: ${afterId}`);
    } catch { /* old process may have exited already */ }
  } else if (afterId === beforeId) {
    console.warn('[NEXUS] Socket ID unchanged after 20s — new process may not have connected yet');
  }
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
    [...testCase.toolsExecuted],
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
