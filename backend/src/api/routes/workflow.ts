/**
 * Workflow routes — autonomous pipeline TEST 9 + Nexus proof TEST 10.
 *
 * POST /api/workflow/test9         — start pipeline (async, returns jobId + 202)
 * GET  /api/workflow/result/:jobId — poll for result (returns 200 when done, 202 while running)
 * GET  /api/workflow/status        — quick status check
 * POST /api/workflow/nexus-proof   — async Nexus real-execution proof (returns jobId + 202)
 * GET  /api/workflow/nexus-result/:jobId — poll nexus-proof result
 *
 * Pipeline runs in background to avoid Railway's 60s HTTP timeout.
 */
import { Router }            from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { runAutonomousPipeline, type PipelineReport } from '../../workflow/autonomous-pipeline.js';
import {
  isNexusOnline,
  getNexusStatus,
  nexusRunCommand,
  nexusWriteFile,
  nexusScreenshot,
} from '../../actions/handlers/nexus-relay.js';

const router = Router();

// ── In-memory job store (pipeline runs take 60-180s) ─────────────────────────
interface Job {
  requestId:  string;
  status:     'running' | 'done' | 'error';
  startedAt:  number;
  report?:    PipelineReport;
  error?:     string;
}

const JOBS = new Map<string, Job>();

// ── POST /api/workflow/test9 ──────────────────────────────────────────────────
router.post('/test9', requireMobileAuth, (_req, res) => {
  const requestId = `pipeline_${Date.now()}`;
  console.log(`[workflow] ${requestId} — starting background pipeline (nexus=${isNexusOnline()})`);

  const job: Job = { requestId, status: 'running', startedAt: Date.now() };
  JOBS.set(requestId, job);

  // Fire-and-forget — result arrives via Telegram + GET /result/:jobId
  runAutonomousPipeline(requestId)
    .then(report => {
      job.status = 'done';
      job.report = report;
      console.log(`[workflow] ${requestId} DONE — decision=${report.decision} totalMs=${report.totalMs}`);
    })
    .catch(err => {
      job.status = 'error';
      job.error  = err instanceof Error ? err.message : String(err);
      console.error(`[workflow] ${requestId} CRASHED: ${job.error}`);
    });

  res.status(202).json({
    ok:         true,
    requestId,
    status:     'running',
    poll_url:   `/api/workflow/result/${requestId}`,
    note:       'Pipeline started. Poll poll_url every 10s or wait for Telegram report.',
    nexus_online: isNexusOnline(),
  });
});

// ── GET /api/workflow/result/:jobId ───────────────────────────────────────────
router.get('/result/:jobId', requireMobileAuth, (req, res) => {
  const job = JOBS.get(req.params['jobId'] as string);
  if (!job) {
    res.status(404).json({ ok: false, error: 'Job not found' });
    return;
  }

  if (job.status === 'running') {
    res.status(202).json({
      ok:          true,
      requestId:   job.requestId,
      status:      'running',
      elapsed_ms:  Date.now() - job.startedAt,
      message:     'Pipeline still running — retry in 10s',
    });
    return;
  }

  if (job.status === 'error') {
    res.status(500).json({ ok: false, requestId: job.requestId, status: 'error', error: job.error });
    return;
  }

  const r = job.report!;
  res.json({
    ok:              true,
    requestId:       r.requestId,
    status:          'done',
    decision:        r.decision,
    commit_sha:      r.commitSha ?? null,
    rollback_reason: r.rollbackReason ?? null,
    total_ms:        r.totalMs,
    total_cost_usd:  r.totalCostUsd,
    nexus_online:    r.nexusOnline,
    telegram_sent:   r.telegramSent,
    started_at:      r.startedAt,
    completed_at:    r.completedAt,
    steps: r.steps.map(s => ({
      step:          s.step,
      status:        s.status,
      agent_id:      s.agentId ?? null,
      provider:      s.provider ?? null,
      model:         s.model ?? null,
      latency_ms:    s.latencyMs,
      input_tokens:  s.inputTokens ?? 0,
      output_tokens: s.outputTokens ?? 0,
      cost_usd:      s.costUsd ?? 0,
      output:        s.output.slice(0, 800),
      details:       s.details ?? null,
    })),
  });
});

// ── GET /api/workflow/status ──────────────────────────────────────────────────
router.get('/status', requireMobileAuth, (_req, res) => {
  const running = [...JOBS.values()].filter(j => j.status === 'running').length;
  res.json({
    nexus_online:      isNexusOnline(),
    buggy_file:        'backend/src/test/buggy_rental_calc.ts',
    active_jobs:       running,
    pipeline_endpoint: 'POST /api/workflow/test9',
    note:              'Pipeline runs async. Poll GET /api/workflow/result/:jobId every 10s.',
  });
});

// ── In-memory store for Nexus proof jobs ─────────────────────────────────────
interface NexusStep {
  name:        string;
  ok:          boolean;
  exit_code?:  number;
  stdout?:     string;
  stderr?:     string;
  detail?:     string;
  latency_ms:  number;
}

interface NexusProofJob {
  jobId:      string;
  status:     'running' | 'done' | 'error';
  startedAt:  number;
  steps?:     NexusStep[];
  screenshot_base64?: string;
  hostname?:  string;
  error?:     string;
  nexus_status?: ReturnType<typeof getNexusStatus>;
}

const NEXUS_JOBS = new Map<string, NexusProofJob>();

async function runNexusProof(jobId: string): Promise<void> {
  const job = NEXUS_JOBS.get(jobId)!;
  const steps: NexusStep[] = [];

  async function step(
    name: string,
    fn: () => Promise<{ ok: boolean; exit_code?: number; stdout?: string; stderr?: string; detail?: string }>,
  ): Promise<void> {
    const t0 = Date.now();
    try {
      const r = await fn();
      steps.push({ name, ...r, latency_ms: Date.now() - t0 });
    } catch (e) {
      steps.push({ name, ok: false, stderr: String(e), latency_ms: Date.now() - t0 });
    }
  }

  const desktopFile = String.raw`C:\Users\douba\Desktop\nexus_test.txt`;

  // Step 1 — pwd
  await step('pwd', async () => {
    const r = await nexusRunCommand('cd', undefined, 10_000);
    return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr };
  });

  // Step 2 — git status
  await step('git status', async () => {
    const r = await nexusRunCommand('git status', String.raw`C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim`, 15_000);
    return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr };
  });

  // Step 3 — node -v
  await step('node -v', async () => {
    const r = await nexusRunCommand('node -v', undefined, 10_000);
    return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr };
  });

  // Step 4 — python --version
  await step('python --version', async () => {
    const r = await nexusRunCommand('python --version', undefined, 10_000);
    return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr };
  });

  // Step 5 — create real file on Desktop
  await step('create nexus_test.txt', async () => {
    const content = `NEXUS REAL EXECUTION PROOF\nTimestamp: ${new Date().toISOString()}\nJobId: ${jobId}\nGenerated by Dzaryx AI on the real PC.\n`;
    const r = await nexusWriteFile(desktopFile, content, 15_000);
    return { ok: r.ok, detail: r.ok ? `Written ${r.size} chars to ${r.path}` : r.error };
  });

  // Step 6 — verify file exists
  await step('verify file on disk', async () => {
    const r = await nexusRunCommand(`powershell -Command "Get-Item '${desktopFile}' | Select-Object FullName,Length,LastWriteTime | ConvertTo-Json"`, undefined, 10_000);
    return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr };
  });

  // Step 7 — screenshot
  let screenshotB64: string | undefined;
  await step('screenshot', async () => {
    const r = await nexusScreenshot(25_000);
    if (r.ok && r.base64) {
      screenshotB64 = r.base64;
      return { ok: true, detail: `PNG captured — ${r.base64.length} base64 chars` };
    }
    return { ok: false, detail: r.error };
  });

  // Step 8 — npx tsc --noEmit
  await step('npx tsc --noEmit', async () => {
    const r = await nexusRunCommand(
      'npx tsc --noEmit --skipLibCheck',
      String.raw`C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim\backend`,
      60_000,
    );
    return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout.slice(0, 2000), stderr: r.stderr.slice(0, 1000) };
  });

  // Step 9 — delete file
  await step('delete nexus_test.txt', async () => {
    const r = await nexusRunCommand(`del "${desktopFile}"`, undefined, 10_000);
    return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr };
  });

  // Capture hostname from first successful step or from telemetry
  const nexusStatus = getNexusStatus();
  const hostname    = nexusStatus.telemetry.lastHostname ?? 'unknown';

  job.status             = 'done';
  job.steps              = steps;
  job.screenshot_base64  = screenshotB64;
  job.hostname           = hostname;
  job.nexus_status       = nexusStatus;
}

// ── POST /api/workflow/nexus-proof ───────────────────────────────────────────
router.post('/nexus-proof', requireMobileAuth, (_req, res) => {
  const nexusStatus = getNexusStatus();

  if (!nexusStatus.online) {
    res.status(503).json({
      ok:          false,
      error:       'Nexus offline — cannot run real PC execution proof',
      nexus_state: {
        online:                nexusStatus.online,
        last_connected_at:     nexusStatus.telemetry.lastConnectedAt,
        last_disconnected_at:  nexusStatus.telemetry.lastDisconnectedAt,
        last_disconnect_reason:nexusStatus.telemetry.lastDisconnectReason,
        total_connections:     nexusStatus.telemetry.totalConnections,
        total_disconnections:  nexusStatus.telemetry.totalDisconnections,
        last_socket_id:        nexusStatus.telemetry.lastSocketId,
        last_hostname:         nexusStatus.telemetry.lastHostname,
        public_ip:             nexusStatus.publicIp,
        mac:                   nexusStatus.mac,
        fix:                   'Ensure Nexus PC agent is running (nexus_main.py) and PC_AGENT_TOKEN matches',
      },
    });
    return;
  }

  const jobId = `nexus_proof_${Date.now()}`;
  const job: NexusProofJob = { jobId, status: 'running', startedAt: Date.now() };
  NEXUS_JOBS.set(jobId, job);

  runNexusProof(jobId)
    .catch(err => {
      job.status = 'error';
      job.error  = err instanceof Error ? err.message : String(err);
    });

  res.status(202).json({
    ok:         true,
    jobId,
    status:     'running',
    poll_url:   `/api/workflow/nexus-result/${jobId}`,
    nexus_online: true,
    socket_id:  nexusStatus.socketId,
    public_ip:  nexusStatus.publicIp,
    hostname:   nexusStatus.telemetry.lastHostname,
    note:       'Proof running. Poll poll_url every 5s — takes ~45-90s total.',
  });
});

// ── GET /api/workflow/nexus-result/:jobId ────────────────────────────────────
router.get('/nexus-result/:jobId', requireMobileAuth, (req, res) => {
  const job = NEXUS_JOBS.get(req.params['jobId'] as string);
  if (!job) {
    res.status(404).json({ ok: false, error: 'Nexus proof job not found' });
    return;
  }

  if (job.status === 'running') {
    res.status(202).json({
      ok:         true,
      jobId:      job.jobId,
      status:     'running',
      elapsed_ms: Date.now() - job.startedAt,
    });
    return;
  }

  if (job.status === 'error') {
    res.status(500).json({ ok: false, jobId: job.jobId, status: 'error', error: job.error });
    return;
  }

  res.json({
    ok:               true,
    jobId:            job.jobId,
    status:           'done',
    hostname:         job.hostname,
    total_ms:         Date.now() - job.startedAt,
    nexus_status:     job.nexus_status,
    has_screenshot:   !!job.screenshot_base64,
    screenshot_chars: job.screenshot_base64?.length ?? 0,
    screenshot_base64:job.screenshot_base64 ?? null,
    steps:            job.steps ?? [],
  });
});

export default router;
