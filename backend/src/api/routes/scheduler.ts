import { Router } from 'express';
import { schedulerQueue, triggerJob, triggerCustomReminder, getSchedulerStatus } from '../../queue/scheduler.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { buildMemoryContext } from '../../conversation/memory-selector.js';
import { runProactiveEngine } from '../../conversation/proactive-engine.js';
import { sendMessage as sendTelegram } from '../../integrations/telegram.js';
import { env } from '../../config/env.js';
import { insertReminder, listReminders, getPendingDue, getRetryEligible } from '../../db/reminders.js';
import { triggerScanNow } from '../../workers/reminder-worker.js';

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
// ?force=true clears Redis locks | ?demo=true bypasses day/time/temp conditions (sends [DEMO] messages)
router.get('/proactive-test', requireMobileAuth, async (req, res) => {
  const force = req.query['force'] === 'true';
  const demo  = req.query['demo']  === 'true';
  try {
    const results = await runProactiveEngine(undefined, force, demo);
    const sent    = results.filter(r => r.status === 'SENT').length;
    const skipped = results.filter(r => r.status === 'SKIPPED').length;
    const errors  = results.filter(r => r.status === 'ERROR').length;

    res.json({
      ok:        true,
      force,
      demo,
      triggers:  results,
      summary:   { sent, skipped, errors },
      tested_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── P15 — Reminder Reliability endpoints ─────────────────────────────────

// GET /api/scheduler/reminders — list recent DB reminders with status audit
router.get('/reminders', requireMobileAuth, async (req, res) => {
  try {
    const limit    = parseInt(req.query['limit'] as string ?? '30', 10);
    const reminders = await listReminders(Math.min(limit, 100));
    const pending  = reminders.filter(r => r.status === 'PENDING').length;
    const sent     = reminders.filter(r => r.status === 'SENT').length;
    const failed   = reminders.filter(r => r.status === 'FAILED').length;
    res.json({
      count: reminders.length,
      summary: { pending, sent, failed },
      reminders,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/scheduler/reminder-test — create a real reminder in N minutes, return full proof
// body: { message, delay_minutes } — default delay: 2min
router.post('/reminder-test', requireMobileAuth, async (req, res) => {
  try {
    const { message = 'Test P15 — reminder-worker sanity check', delay_minutes = 2 } = req.body as {
      message?: string;
      delay_minutes?: number;
    };

    const delayMs  = Number(delay_minutes) * 60 * 1000;
    const remindAt = new Date(Date.now() + delayMs);
    const dedup    = `test_${Date.now()}`;

    // 1. DB insert
    const dbRow = await insertReminder({
      message,
      remind_at: remindAt,
      timezone:  'Europe/Brussels',
      created_by: 'reminder-test-api',
      dedup_key:  dedup,
      telegram_target: env.TELEGRAM_CHAT_ID ?? undefined,
    });

    if (!dbRow) {
      res.status(500).json({ ok: false, error: 'DB insert failed — table may not exist. Run reminders_migration.sql in Supabase.' });
      return;
    }

    // 2. BullMQ job
    const job = await schedulerQueue.add(
      'custom-reminder',
      { message, request_id: dedup, source_channel: 'reminder-test-api', idempotency_key: dedup },
      { delay: delayMs, removeOnComplete: { count: 5 }, removeOnFail: { count: 3 } },
    );

    res.json({
      ok:             true,
      proof: {
        db_id:         dbRow.id,
        job_id:        job.id ?? 'unknown',
        remind_at_iso: remindAt.toISOString(),
        remind_at_local: remindAt.toLocaleString('fr-FR', { timeZone: 'Europe/Brussels' }),
        delay_minutes,
        message,
        status:        dbRow.status,
        dedup_key:     dedup,
        telegram_target: dbRow.telegram_target,
      },
      instruction: `Attends ${delay_minutes} min(s) puis vérifie Telegram ET GET /api/scheduler/reminders?limit=5`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/scheduler/reminder-scan — force a scan cycle NOW (admin/debug)
router.post('/reminder-scan', requireMobileAuth, async (_req, res) => {
  try {
    const { processed, rows } = await triggerScanNow();
    res.json({
      ok: true,
      processed,
      scanned_at: new Date().toISOString(),
      rows: rows.map(r => ({ id: r.id, status: r.status, message: r.message.slice(0, 60), remind_at: r.remind_at })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/scheduler/reminder-audit — snapshot: pending + due + retries
router.get('/reminder-audit', requireMobileAuth, async (_req, res) => {
  try {
    const [pending, retries] = await Promise.all([getPendingDue(86400), getRetryEligible()]);
    res.json({
      ok: true,
      pending_due_24h: pending.map(r => ({ id: r.id, message: r.message.slice(0, 60), remind_at: r.remind_at, retry_count: r.retry_count })),
      retry_eligible:  retries.map(r => ({ id: r.id, message: r.message.slice(0, 60), remind_at: r.remind_at, retry_count: r.retry_count, failed_reason: r.failed_reason })),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
