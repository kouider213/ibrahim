import { Router } from 'express';
import {
  isNexusOnline, pingNexus, getNexusMac, getNexusIp, getNexusStatus,
  isLauncherOnline, wakeNexus, getLauncherStatus,
  nexusRunCommand, nexusSysinfo, nexusScreenshot, nexusScreenshotBase64,
  listNexusJobs, getNexusJob,
} from '../../actions/handlers/nexus-relay.js';
import { runNexusAgent }   from '../../agents/nexus-agent-runner.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { phantomGuard, PHANTOM_REFUSAL } from '../../conversation/response-guard.js';
import { testNlParser, detectIntent, splitCommands } from '../../actions/handlers/nexus-nl-router.js';

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

// POST /api/nexus/nl-test — test the NL router without executing (dry-run)
router.post('/nl-test', requireMobileAuth, (req, res) => {
  const { text, cases } = req.body as { text?: string; cases?: Array<{ input: string; expected_intents: string[] }> };

  // If custom test cases provided, run batch
  if (Array.isArray(cases) && cases.length) {
    const results = testNlParser(cases as Parameters<typeof testNlParser>[0]);
    const passed  = results.filter(r => r.passed).length;
    res.json({ ok: true, total: results.length, passed, failed: results.length - passed, results });
    return;
  }

  // Single text — run default suite + the provided text
  const defaultCases = [
    { input: 'Nexus, montre-moi mon bureau',                   expected_intents: ['screen_understand'] },
    { input: 'Nexus, screenshot',                              expected_intents: ['screenshot'] },
    { input: 'Nexus, lance chrome',                            expected_intents: ['app_launch'] },
    { input: 'Nexus, liste les fenêtres ouvertes',             expected_intents: ['window_list'] },
    { input: 'Nexus, liste les processus',                     expected_intents: ['process_list'] },
    { input: 'Nexus,\n1. montre-moi mon bureau\n2. lance chrome', expected_intents: ['screen_understand', 'app_launch'] },
    { input: 'Nexus,\n- screenshot\n- liste les fichiers du bureau\n- lance spotify', expected_intents: ['screenshot', 'file_list', 'app_launch'] },
  ] as Parameters<typeof testNlParser>[0];

  if (text?.trim()) {
    const cmds = splitCommands(text);
    const single = cmds.map(cmd => ({ cmd, ...detectIntent(cmd) }));
    res.json({ ok: true, input: text, commands: cmds, detected: single, suite: testNlParser(defaultCases) });
    return;
  }

  const results = testNlParser(defaultCases);
  const passed  = results.filter(r => r.passed).length;
  res.json({ ok: true, total: results.length, passed, failed: results.length - passed, results });
});

// ── GET /api/nexus/live-status — état complet + busy task en temps réel ───────
router.get('/live-status', requireMobileAuth, (_req, res) => {
  const s = getNexusStatus();
  res.json({
    ok:           true,
    nexus_online: s.online,
    nexus_busy:   s.busy,
    busy_task:    s.busyTask,
    busy_ms:      s.busyMs,
    hostname:     s.telemetry.lastHostname,
    os:           s.telemetry.lastOs,
    os_release:   s.telemetry.lastOsRelease,
    ram_used_mb:  s.telemetry.lastRamUsedMb,
    ram_total_mb: s.telemetry.lastRamTotalMb,
    cpu_percent:  s.telemetry.lastCpuPercent,
    uptime_s:     s.telemetry.lastUptimeS,
    heartbeat_at: s.telemetry.lastHeartbeatAt,
    latency_ms:   s.telemetry.lastHeartbeatLatency,
    mac:          s.mac || null,
    public_ip:    s.publicIp || null,
    socket_id:    s.socketId,
    launcher_online: isLauncherOnline(),
    connections:  s.telemetry.totalConnections,
  });
});

// ── POST /api/nexus/screenshot-b64 — screenshot retourné en base64 HTTP ───────
// Contrairement à /screenshot (Telegram uniquement), retourne l'image directement.
router.post('/screenshot-b64', requireMobileAuth, async (_req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  try {
    const r = await nexusScreenshotBase64(35_000);
    if (!r.ok) {
      res.status(502).json({ ok: false, error: r.error ?? 'Screenshot failed' });
      return;
    }
    res.json({
      ok:           true,
      size_bytes:   r.size_bytes,
      size_kb:      r.size_kb,
      timestamp:    r.timestamp,
      hostname:     r.hostname,
      image_base64: r.image_base64,  // PNG encodé base64
    });
  } catch (err) {
    res.status(504).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/nexus/agent — Dzaryx AI layer: natural language → Nexus actions ─
// P9: couche intelligence Dzaryx au-dessus de Nexus.
// Corps: { message: "Nexus, montre mon bureau" }
// Retourne: proof complet (tools_called, screenshots, windows, verdict)
router.post('/agent', requireMobileAuth, async (req, res) => {
  const { message, timeout_ms } = req.body as { message?: string; timeout_ms?: number };
  if (!message?.trim()) {
    res.status(400).json({ ok: false, error: 'message requis — ex: "Nexus, montre mon bureau"' });
    return;
  }
  const requestId = `na_${Date.now()}`;
  const timeoutMs = Math.min(timeout_ms ?? 90_000, 120_000);

  console.log(`[nexus-agent-route:${requestId}] "${message.slice(0, 80)}"`);

  try {
    const result = await runNexusAgent(message, requestId, timeoutMs);

    res.json({
      ok:           true,
      test:         'nexus_agent_p9',
      requestId,
      proof: {
        // Identity
        agent_id:       result.agent_id,
        provider:       result.provider,
        model:          result.model,
        tools_allowed:  result.tools_allowed,

        // Connection
        nexus_online:    result.nexus_online,
        nexus_hostname:  result.nexus_hostname,
        nexus_os:        result.nexus_os,
        nexus_latency_ms: result.nexus_latency_ms,

        // User command
        user_message: result.user_message,

        // Tool execution proof
        tools_called: result.tools_called.map(t => ({
          tool_name:      t.tool_name,
          tool_input:     t.tool_input,
          duration_ms:    t.duration_ms,
          retried:        t.retried,
          blocked:        t.blocked,
          success:        t.success,
          result_preview: t.tool_result.slice(0, 400),
          result_chars:   t.tool_result.length,
        })),
        tool_count:    result.tool_count,

        // Screenshots (base64)
        screenshots: result.screenshots.map(s => ({
          captured_at:  s.captured_at,
          size_bytes:   s.size_bytes,
          size_kb:      s.size_kb,
          hostname:     s.hostname,
          image_base64: s.image_base64,  // full PNG
        })),
        screenshot_count: result.screenshots.length,

        // Other outputs
        screen_analysis: result.screen_analysis,
        windows_found:   result.windows_found,
        processes_found: result.processes_found,

        // Final Claude answer
        analysis:      result.analysis,
        analysis_chars: result.analysis.length,

        // Cost
        input_tokens:  result.input_tokens,
        output_tokens: result.output_tokens,
        total_ms:      result.total_ms,

        // Verdict
        verdict:        result.verdict,
        verdict_reason: result.verdict_reason,
        error:          result.error ?? null,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[nexus-agent-route:${requestId}] ❌ ${errMsg}`);
    res.status(500).json({ ok: false, error: errMsg });
  }
});

export default router;
