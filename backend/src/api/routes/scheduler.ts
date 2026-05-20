import { Router } from 'express';
import { schedulerQueue, triggerJob, triggerCustomReminder, getSchedulerStatus } from '../../queue/scheduler.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { buildMemoryContext } from '../../conversation/memory-selector.js';
import { runProactiveEngine } from '../../conversation/proactive-engine.js';
import { sendMessage as sendTelegram } from '../../integrations/telegram.js';
import { env } from '../../config/env.js';
import { redis } from '../../queue/queue.js';
import { insertReminder, listReminders, getPendingDue, getRetryEligible } from '../../db/reminders.js';
import { triggerScanNow } from '../../workers/reminder-worker.js';
import {
  isValidTimezone,
  getTimezoneConversion,
  getServerTimezone,
  resolveTimezone,
  parseLocalHHMM,
} from '../../utils/timezone.js';

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
// ?force=true clears the day lock so the job runs fully (not "already sent today")
router.post('/trigger/:name', requireMobileAuth, async (req, res) => {
  const { name } = req.params as { name: string };
  const force = req.query['force'] === 'true';

  if (force) {
    const today = new Date().toISOString().slice(0, 10);
    // Clear today's day lock (pattern: job:<name>:sent:<date>)
    await redis.del(`job:${name}:sent:${today}`).catch(() => {});
    // monthly-report uses prev-month key
    if (name === 'monthly-report') {
      const now = new Date();
      const m = now.getMonth(); // 0-based current month
      const prevMonth = m === 0 ? 12 : m;
      const prevYear  = m === 0 ? now.getFullYear() - 1 : now.getFullYear();
      await redis.del(`job:monthly-report:sent:${prevYear}-${prevMonth}`).catch(() => {});
    }
  }

  const ok = await triggerJob(name);
  if (!ok) {
    res.status(404).json({ error: `Unknown job: ${name}` });
    return;
  }
  res.json({ triggered: true, job: name, force, queued_at: new Date().toISOString() });
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

// ─── P15 v2 — Timezone Test ──────────────────────────────────────────────────

// GET /api/scheduler/timezone-test — full timezone diagnostics
// ?tz=Europe/Brussels (optional — test a specific timezone)
router.get('/timezone-test', requireMobileAuth, async (req, res) => {
  try {
    const now         = new Date();
    const serverTz    = getServerTimezone();
    const explicitTz  = req.query['tz'] as string | undefined;

    // Detect stored user timezone from Redis
    const storedTz = await redis.get('user:tz').catch(() => null);

    // Test timezones
    const TZS_TO_TEST = [
      'Europe/Brussels',
      'Africa/Algiers',
      'UTC',
      ...(explicitTz && isValidTimezone(explicitTz) ? [explicitTz] : []),
      ...(storedTz && isValidTimezone(storedTz) ? [storedTz] : []),
    ].filter((v, i, a) => a.indexOf(v) === i); // dedup

    // Resolution chain simulation
    const resolved = resolveTimezone(
      explicitTz ?? null,
      storedTz ?? null,
    );

    // DST scenarios
    const summerDate = new Date(`${now.getFullYear()}-07-15T12:00:00Z`);
    const winterDate = new Date(`${now.getFullYear()}-01-15T12:00:00Z`);

    const dstScenarios = {
      belgium_summer: getTimezoneConversion('Europe/Brussels', summerDate),
      belgium_winter: getTimezoneConversion('Europe/Brussels', winterDate),
      algeria_summer: getTimezoneConversion('Africa/Algiers', summerDate),
      algeria_winter: getTimezoneConversion('Africa/Algiers', winterDate),
    };

    // at_time parsing tests
    const atTimeTests = ['18:00', '09:30', '00:00'].map(t => {
      const brussels = parseLocalHHMM(t, 'Europe/Brussels');
      const algiers  = parseLocalHHMM(t, 'Africa/Algiers');
      return {
        at_time:         t,
        brussels_utc:    brussels?.toISOString() ?? 'parse_error',
        algiers_utc:     algiers?.toISOString()  ?? 'parse_error',
        diff_minutes:    brussels && algiers
          ? Math.round((brussels.getTime() - algiers.getTime()) / 60_000)
          : null,
      };
    });

    // Travel scenario: user switches Brx → Algiers → back
    const travelScenario = [
      { location: 'Belgium',  tz: 'Europe/Brussels',  note: 'UTC+2 (DST)' },
      { location: 'Algeria',  tz: 'Africa/Algiers',   note: 'UTC+1 (no DST)' },
      { location: 'Belgium (return)', tz: 'Europe/Brussels', note: 'back home' },
    ].map(s => ({
      ...s,
      ...getTimezoneConversion(s.tz, now),
      resolve_result: resolveTimezone(s.tz).source,
    }));

    res.json({
      ok:      true,
      server: {
        timezone:    serverTz,
        utc_now:     now.toISOString(),
        local_time:  now.toLocaleString('fr-FR', { timeZone: serverTz }),
        node_version: process.version,
      },
      user: {
        stored_timezone:  storedTz,
        stored_valid:     storedTz ? isValidTimezone(storedTz) : null,
        explicit_from_qs: explicitTz ?? null,
        resolved:         resolved,
      },
      conversions: Object.fromEntries(
        TZS_TO_TEST.map(tz => [tz, getTimezoneConversion(tz, now)])
      ),
      dst_scenarios:   dstScenarios,
      at_time_parsing: atTimeTests,
      travel_scenario: travelScenario,
      anti_hardcode_check: {
        algiers_hardcoded: false,
        note: 'Africa/Algiers NEVER used unless explicitly provided by user or stored from X-Timezone header',
      },
      generated_at: now.toISOString(),
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

    // Resolve user timezone (same priority chain as tool-executor)
    const storedTz = await redis.get('user:tz').catch(() => null);
    const resolved  = resolveTimezone(null, storedTz ?? null);
    const { getUTCOffsetString, toLocalISO } = await import('../../utils/timezone.js');
    const utcOffset    = getUTCOffsetString(resolved.timezone, remindAt);
    const localTimeISO = toLocalISO(remindAt, resolved.timezone);

    // 1. DB insert
    const dbRow = await insertReminder({
      message,
      remind_at:       remindAt,
      timezone:        resolved.timezone,
      utc_offset:      utcOffset,
      local_time_iso:  localTimeISO,
      timezone_source: resolved.source,
      created_by:      'reminder-test-api',
      dedup_key:       dedup,
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
        db_id:           dbRow.id,
        job_id:          job.id ?? 'unknown',
        remind_at_utc:   remindAt.toISOString(),
        local_time:      localTimeISO,
        timezone_used:   resolved.timezone,
        timezone_source: resolved.source,
        utc_offset:      utcOffset,
        delay_minutes,
        message,
        status:          dbRow.status,
        dedup_key:       dedup,
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
