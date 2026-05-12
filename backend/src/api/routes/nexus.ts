import { Router } from 'express';
import {
  isNexusOnline, pingNexus, getNexusMac, getNexusIp, getNexusStatus,
  isLauncherOnline, wakeNexus, getLauncherStatus,
  nexusRunCommand, nexusSysinfo, nexusScreenshot, nexusScreenshotBase64,
  nexusWriteFile, listNexusJobs, getNexusJob,
} from '../../actions/handlers/nexus-relay.js';
import { runNexusAgent }   from '../../agents/nexus-agent-runner.js';
import {
  executeNexusCommand,
  getNexusCapabilities,
  getCommandHistory,
  getCommandById,
} from '../../actions/handlers/nexus-command-registry.js';
import type { CommandType } from '../../actions/handlers/nexus-command-registry.js';
import {
  startVisionLoop, getLoopStatus, listLoops, getVisionContext,
  analyzeScreen, performLocalOcr,
  triggerEmergencyStop, clearEmergencyStop, isEmergencyStopped,
} from '../../actions/handlers/nexus-vision-loop.js';
import {
  createAndStartTask, getTask, listTasks, cancelTask,
} from '../../actions/handlers/nexus-task-runner.js';
import type { TaskStep } from '../../actions/handlers/nexus-task-runner.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { phantomGuard, PHANTOM_REFUSAL } from '../../conversation/response-guard.js';
import { testNlParser, detectIntent, splitCommands } from '../../actions/handlers/nexus-nl-router.js';

const router = Router();

// GET /api/nexus/status — état connexion NEXUS (enrichi: state, last_seen, pending_commands)
router.get('/status', requireMobileAuth, (_req, res) => {
  const s = getNexusStatus();
  res.json({
    connected:           s.online,
    state:               s.state,            // NexusWsState: ONLINE|SUSPECT|RECONNECTING|OFFLINE_CONFIRMED|DISCONNECTED
    last_seen:           s.last_seen,         // ISO timestamp last heartbeat pong
    pending_commands:    s.pending_commands,  // commands buffered while offline
    last_command_status: s.last_command_status,
    uptime_s:            s.telemetry.lastUptimeS,
    mac:                 s.mac    || null,
    ip:                  s.publicIp || null,
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
// Strategy: write a Python launcher script (no PowerShell — avoids EPERM), launch with
// NEXUS_HTTP_PORT=7779 / NEXUS_WS_PORT=7780 (avoids port conflict with running instance),
// wait for new socket_id, THEN kill old PID.
router.post('/restart', requireMobileAuth, async (_req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline — cannot restart' }); return; }

  const NEXUS_DIR  = String.raw`C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\nexus`;
  const PYTHON_EXE = String.raw`C:\Users\douba\AppData\Local\Python\pythoncore-3.14-64\python.exe`;
  const beforeId   = getNexusStatus().socketId;

  res.json({
    ok:               true,
    message:          'Restart initiated — new Nexus process launching with alt GUI ports (7779/7780).',
    before_socket_id: beforeId,
    poll:             'GET /api/nexus/live-status every 5s — done when socket_id changes',
  });

  // Step 1 — get old PID
  let oldPid: string | null = null;
  try {
    const pidRes = await nexusRunCommand(
      `wmic process where "commandline like '%nexus.py%'" get processid /format:value`,
      NEXUS_DIR, 10_000,
    );
    const m = pidRes.stdout.match(/ProcessId=(\d+)/i);
    if (m) { oldPid = m[1]; console.log(`[NEXUS restart] old PID=${oldPid}`); }
    else { console.warn(`[NEXUS restart] PID not found via wmic — stdout="${pidRes.stdout?.slice(0, 200)}"`); }
  } catch (e) { console.warn('[NEXUS restart] PID lookup failed:', e); }

  // Step 2 — write a Python launcher (avoids PowerShell EPERM on this machine)
  const launcherScript = [
    'import subprocess, os',
    `env = dict(os.environ, NEXUS_HTTP_PORT='7779', NEXUS_WS_PORT='7780')`,
    `p = subprocess.Popen(`,
    `    [r'${PYTHON_EXE}', 'nexus.py'],`,
    `    cwd=r'${NEXUS_DIR}',`,
    `    env=env,`,
    `    creationflags=8,`,
    `    stdout=open(r'${NEXUS_DIR}\\\\nexus_restart.log', 'w'),`,
    `    stderr=open(r'${NEXUS_DIR}\\\\nexus_restart_err.log', 'w'),`,
    `)`,
    `print('NEWPID:' + str(p.pid))`,
  ].join('\n');

  const launcherPath = `${NEXUS_DIR}\\nexus_launcher_tmp.py`;
  try {
    const wf = await nexusWriteFile(launcherPath, launcherScript, 10_000);
    if (!wf.ok) { console.error('[NEXUS restart] write_file failed:', wf.error); return; }
    console.log(`[NEXUS restart] launcher script written — ${wf.size} bytes`);
  } catch (e) { console.error('[NEXUS restart] write_file error:', e); return; }

  // Step 3 — execute the launcher (Python, not PowerShell)
  let newPid: string | null = null;
  try {
    const launchRes = await nexusRunCommand(
      `"${PYTHON_EXE}" nexus_launcher_tmp.py`,
      NEXUS_DIR, 20_000,
    );
    console.log(`[NEXUS restart] launcher exit=${launchRes.exit_code} stdout="${launchRes.stdout?.trim()}" stderr="${launchRes.stderr?.slice(0, 300)}"`);
    const m2 = launchRes.stdout?.match(/NEWPID:(\d+)/);
    if (m2) newPid = m2[1];
  } catch (e) { console.error('[NEXUS restart] launcher exec failed:', e); return; }

  console.log(`[NEXUS restart] new PID=${newPid} — waiting 35s for connection...`);

  // Step 4 — wait up to 35s for new Nexus to connect (Socket.IO reconnect takes ~10-20s)
  await new Promise(r => setTimeout(r, 35_000));

  const afterId = getNexusStatus().socketId;
  console.log(`[NEXUS restart] before=${beforeId} after=${afterId}`);

  // Step 5 — kill old PID only if new socket connected
  if (afterId && afterId !== beforeId) {
    if (oldPid) {
      try {
        const kill = await nexusRunCommand(`taskkill /PID ${oldPid} /F`, undefined, 8_000);
        console.log(`[NEXUS restart] taskkill PID ${oldPid} exit=${kill.exit_code}`);
      } catch { /* old process may have self-exited */ }
    }
    console.log(`[NEXUS restart] ✅ SUCCESS — new socket_id=${afterId}`);
  } else {
    console.warn(`[NEXUS restart] ⚠️  socket_id unchanged after 35s — new process may have failed to connect`);
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

// ── GET /api/nexus/capabilities — what Nexus can do ──────────────────────────
router.get('/capabilities', requireMobileAuth, (_req, res) => {
  res.json({ ok: true, ...getNexusCapabilities() });
});

// ── POST /api/nexus/command — execute a typed desktop command ─────────────────
// Body: { type: CommandType, payload?: Record<string, unknown> }
// Returns: NexusCommandRecord (full lifecycle with result/error)
router.post('/command', requireMobileAuth, async (req, res) => {
  const { type, payload } = req.body as {
    type?:    string;
    payload?: Record<string, unknown>;
  };

  if (!type) {
    res.status(400).json({ ok: false, error: 'type requis', available_commands: getNexusCapabilities().commands });
    return;
  }

  const validTypes: CommandType[] = getNexusCapabilities().commands;
  if (!validTypes.includes(type as CommandType)) {
    res.status(400).json({ ok: false, error: `Type inconnu: ${type}`, available_commands: validTypes });
    return;
  }

  try {
    const record = await executeNexusCommand(type as CommandType, payload ?? {});
    res.status(record.success ? 200 : 502).json({ ok: record.success ?? false, ...record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/nexus/command-history — last 50 executed commands ────────────────
router.get('/command-history', requireMobileAuth, (_req, res) => {
  res.json({ ok: true, commands: getCommandHistory() });
});

// ── GET /api/nexus/command-history/:id — single command by id ────────────────
router.get('/command-history/:id', requireMobileAuth, (req, res) => {
  const record = getCommandById(req.params['id'] as string);
  if (!record) { res.status(404).json({ ok: false, error: 'Command not found' }); return; }
  res.json({ ok: true, ...record });
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

// ══════════════════════════════════════════════════════════════════════════════
// VISION LOOP
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/nexus/vision/context — current vision state (no base64)
router.get('/vision/context', requireMobileAuth, (_req, res) => {
  res.json({ ok: true, ...getVisionContext() });
});

// POST /api/nexus/vision/analyze — one-shot: screenshot + AI analysis → structured decision
router.post('/vision/analyze', requireMobileAuth, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus hors ligne' }); return; }
  const { objective = 'Décris l\'état de l\'écran et les éléments visibles' } = req.body as { objective?: string };
  try {
    const shot = await nexusScreenshotBase64(35_000);
    if (!shot.ok || !shot.image_base64) {
      res.status(502).json({ ok: false, error: shot.error ?? 'Screenshot failed' });
      return;
    }
    const decision = await analyzeScreen(objective, shot.image_base64, [], 1, 1);
    res.json({ ok: true, objective, screenshot_kb: shot.size_kb, hostname: shot.hostname, ...decision });
  } catch (err) {
    res.status(504).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/nexus/vision/loop — start autonomous vision loop in background
// Body: { objective, maxSteps?, stepDelay?, demoTelegram? }
router.post('/vision/loop', requireMobileAuth, (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus hors ligne' }); return; }
  if (isEmergencyStopped()) { res.status(503).json({ ok: false, error: 'Emergency stop actif — /nexus/emergency-clear requis' }); return; }

  const { objective, maxSteps, stepDelay, demoTelegram } = req.body as {
    objective?: string; maxSteps?: number; stepDelay?: number; demoTelegram?: boolean;
  };
  if (!objective?.trim()) { res.status(400).json({ ok: false, error: 'objective requis' }); return; }

  const taskId = startVisionLoop(objective.trim(), {
    maxSteps:     Math.min(maxSteps ?? 10, 20),
    stepDelay:    Math.min(stepDelay ?? 2_000, 10_000),
    demoTelegram: demoTelegram ?? true,
  });
  res.json({ ok: true, taskId, poll: `GET /api/nexus/vision/loop/${taskId}` });
});

// GET /api/nexus/vision/loop/:taskId — poll vision loop status
router.get('/vision/loop/:taskId', requireMobileAuth, (req, res) => {
  const entry = getLoopStatus(req.params['taskId'] as string);
  if (!entry) { res.status(404).json({ ok: false, error: 'Vision loop not found' }); return; }
  res.json({ ok: true, ...entry });
});

// GET /api/nexus/vision/loops — list all vision loops
router.get('/vision/loops', requireMobileAuth, (_req, res) => {
  res.json({ ok: true, loops: listLoops() });
});

// GET /api/nexus/vision/ocr — local OCR via Windows Get-Process window titles
router.get('/vision/ocr', requireMobileAuth, async (_req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus hors ligne' }); return; }
  try {
    const result = await performLocalOcr(15_000);
    res.json({ ok: result.ok, windows: result.windows, text: result.text, error: result.error ?? null });
  } catch (err) {
    res.status(504).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TASK RUNNER
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/nexus/task — create + run task (AI-decomposed or predefined steps)
// Body: { objective, steps?, demoTelegram? }
router.post('/task', requireMobileAuth, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus hors ligne' }); return; }

  const { objective, steps, demoTelegram } = req.body as {
    objective?: string;
    steps?:     Array<Partial<TaskStep>>;
    demoTelegram?: boolean;
  };
  if (!objective?.trim()) { res.status(400).json({ ok: false, error: 'objective requis' }); return; }

  try {
    const task = await createAndStartTask(objective.trim(), steps, demoTelegram ?? true);
    res.json({
      ok: true, taskId: task.id,
      status: task.status, steps: task.steps.length,
      poll: `GET /api/nexus/tasks/${task.id}`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/nexus/tasks — list recent tasks
router.get('/tasks', requireMobileAuth, (req, res) => {
  const limit = Math.min(parseInt((req.query['limit'] as string | undefined) ?? '20', 10), 100);
  res.json({ ok: true, tasks: listTasks(limit) });
});

// GET /api/nexus/tasks/:id — get specific task with full step details
router.get('/tasks/:id', requireMobileAuth, (req, res) => {
  const task = getTask(req.params['id'] as string);
  if (!task) { res.status(404).json({ ok: false, error: 'Task not found' }); return; }
  res.json({ ok: true, ...task });
});

// POST /api/nexus/tasks/:id/cancel — cancel a running task
router.post('/tasks/:id/cancel', requireMobileAuth, (req, res) => {
  const cancelled = cancelTask(req.params['id'] as string);
  if (!cancelled) { res.status(409).json({ ok: false, error: 'Task not found or already terminal' }); return; }
  res.json({ ok: true, cancelled: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// SAFETY
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/nexus/emergency-stop — halt all vision loops immediately
router.post('/emergency-stop', requireMobileAuth, (_req, res) => {
  triggerEmergencyStop();
  res.json({ ok: true, emergency_stop: true, message: 'Tous les loops vision arrêtés. Utilisez /emergency-clear pour reprendre.' });
});

// POST /api/nexus/emergency-clear — re-enable vision loops
router.post('/emergency-clear', requireMobileAuth, (_req, res) => {
  clearEmergencyStop();
  res.json({ ok: true, emergency_stop: false, message: 'Emergency stop levé.' });
});

// GET /api/nexus/debug/screenshot-probe — check base64 format + AI provider availability
// Shows first 80 chars of screenshot base64 and which providers are available
router.get('/debug/screenshot-probe', requireMobileAuth, async (_req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'NEXUS offline' }); return; }
  try {
    const shot = await nexusScreenshotBase64(35_000);
    const b64  = shot.image_base64 ?? '';
    const isDataUri = b64.startsWith('data:');
    const prefix    = b64.slice(0, 80);
    // Detect MIME from magic bytes (after stripping prefix if any)
    const rawB64    = isDataUri ? b64.slice(b64.indexOf(',') + 1) : b64;
    const detectedMime = rawB64.startsWith('iVBORw0KGgo') ? 'image/png'
      : rawB64.startsWith('UklGR') ? 'image/webp'
      : rawB64.startsWith('/9j/') ? 'image/jpeg'
      : 'unknown';
    const { isGeminiAvailable, isClaudeAvailable, isOpenAIAvailable, isGroqAvailable } = await import('../../integrations/llm-router.js');
    res.json({
      ok:            shot.ok,
      size_kb:       shot.size_kb,
      hostname:      shot.hostname,
      b64_prefix:    prefix,
      b64_length:    b64.length,
      is_data_uri:   isDataUri,
      detected_mime: detectedMime,
      providers: {
        gemini: isGeminiAvailable(),
        claude: isClaudeAvailable(),
        openai: isOpenAIAvailable(),
        groq:   isGroqAvailable(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
