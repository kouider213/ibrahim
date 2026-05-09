/**
 * Workflow routes — autonomous pipeline TEST 9.
 *
 * POST /api/workflow/test9         — start pipeline (async, returns jobId + 202)
 * GET  /api/workflow/result/:jobId — poll for result (returns 200 when done, 202 while running)
 * GET  /api/workflow/status        — quick status check
 *
 * Pipeline runs in background to avoid Railway's 60s HTTP timeout.
 * Full report arrives via Telegram; result/:jobId for programmatic polling.
 */
import { Router }            from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { runAutonomousPipeline, type PipelineReport } from '../../workflow/autonomous-pipeline.js';
import { isNexusOnline }     from '../../actions/handlers/nexus-relay.js';

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
router.post('/test9', requireMobileAuth, (req, res) => {
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
  const job = JOBS.get(req.params.jobId!);
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

export default router;
