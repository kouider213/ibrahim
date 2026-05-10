import { Router } from 'express';
import { schedulerQueue, triggerJob, triggerCustomReminder, getSchedulerStatus } from '../../queue/scheduler.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { buildMemoryContext } from '../../conversation/memory-selector.js';
import { runProactiveEngine } from '../../conversation/proactive-engine.js';
import { sendMessage as sendTelegram } from '../../integrations/telegram.js';
import { env } from '../../config/env.js';

const router = Router();

// GET /api/scheduler/jobs — list repeatable jobs with next fire time
router.get('/jobs', requireMobileAuth, async (_req, res) => {
  try {
    const repeatable = await schedulerQueue.getRepeatableJobs();
    res.json({ jobs: repeatable.map(j => ({ name: j.name, cron: j.pattern, next: j.next })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/scheduler/status — queue health (waiting/active/completed/failed + Redis ping)
router.get('/status', requireMobileAuth, async (_req, res) => {
  try {
    const status = await getSchedulerStatus();
    res.json({ ok: true, ...status, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/scheduler/trigger/:name — manual trigger any known cron job
router.post('/trigger/:name', requireMobileAuth, async (req, res) => {
  const { name } = req.params as { name: string };
  const ok = await triggerJob(name);
  if (!ok) {
    res.status(404).json({ error: `Unknown job: ${name}` });
    return;
  }
  res.json({ triggered: true, job: name, queued_at: new Date().toISOString() });
});

// POST /api/scheduler/test-telegram — fire a custom-reminder → real Telegram message (P11 runtime proof)
router.post('/test-telegram', requireMobileAuth, async (req, res) => {
  const { message } = req.body as { message?: string };
  const msg = message?.trim() || `🧪 P11 BullMQ Test — ${new Date().toISOString()} — scheduler worker ALIVE`;
  const idempotencyKey = `p11_test_${Date.now()}`;
  try {
    const jobId = await triggerCustomReminder(msg, idempotencyKey);
    res.json({
      ok:               true,
      job_id:           jobId,
      idempotency_key:  idempotencyKey,
      message:          msg,
      queued_at:        new Date().toISOString(),
      note:             'Check Telegram — message should arrive in <5s if worker is alive',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/scheduler/memory-test — P12b runtime proof: call buildMemoryContext, return JSON + send Telegram
router.get('/memory-test', requireMobileAuth, async (_req, res) => {
  try {
    const query = 'P12b test: qui je suis objectif Dzaryx business Fik';
    const result = await buildMemoryContext(query, 300);

    const verdict = result.source === 'memory_facts' && result.selectedFacts > 0
      ? 'VERIFIED'
      : result.source === 'ibrahim_memory' && result.selectedFacts > 0
        ? 'PARTIAL — fallback ibrahim_memory'
        : 'FAIL — no memory';

    const telegramLines = [
      `🧪 *P12b Memory Engine Test*`,
      `📊 Source: \`${result.source}\``,
      `📦 Facts: ${result.selectedFacts}/${result.totalFacts} selected`,
      `🪙 Tokens: ~${result.tokenEstimate}/300`,
      `✅ Verdict: *${verdict}*`,
      ``,
      `*Top facts:*`,
      ...result.entries.slice(0, 5).map(e => `• [${e.category}] ${e.content.slice(0, 80)}`),
    ];

    if (env.TELEGRAM_CHAT_ID) {
      await sendTelegram(env.TELEGRAM_CHAT_ID, telegramLines.join('\n'));
    }

    res.json({
      ok:            true,
      verdict,
      source:        result.source,
      totalFacts:    result.totalFacts,
      selectedFacts: result.selectedFacts,
      tokenEstimate: result.tokenEstimate,
      budgetTokens:  300,
      entries:       result.entries,
      telegram_sent: !!env.TELEGRAM_CHAT_ID,
      tested_at:     new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/scheduler/proactive-test — P12c: run memory-aware engine NOW, return trigger results
// ?force=true clears Redis locks so notifications fire even if already sent today/week
router.get('/proactive-test', requireMobileAuth, async (req, res) => {
  const force = req.query['force'] === 'true';
  try {
    const results = await runProactiveEngine(undefined, force);
    const sent    = results.filter(r => r.status === 'SENT').length;
    const skipped = results.filter(r => r.status === 'SKIPPED').length;
    const errors  = results.filter(r => r.status === 'ERROR').length;

    res.json({
      ok:        true,
      force,
      triggers:  results,
      summary:   { sent, skipped, errors },
      tested_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
