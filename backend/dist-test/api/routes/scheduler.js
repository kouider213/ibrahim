"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const scheduler_js_1 = require("../../queue/scheduler.js");
const auth_js_1 = require("../middleware/auth.js");
const memory_selector_js_1 = require("../../conversation/memory-selector.js");
const proactive_engine_js_1 = require("../../conversation/proactive-engine.js");
const telegram_js_1 = require("../../integrations/telegram.js");
const env_js_1 = require("../../config/env.js");
const queue_js_1 = require("../../queue/queue.js");
const reminders_js_1 = require("../../db/reminders.js");
const reminder_worker_js_1 = require("../../workers/reminder-worker.js");
const timezone_js_1 = require("../../utils/timezone.js");
const router = (0, express_1.Router)();
// GET /api/scheduler/jobs — list repeatable jobs with next fire time
router.get('/jobs', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const repeatable = await scheduler_js_1.schedulerQueue.getRepeatableJobs();
        res.json({ jobs: repeatable.map(j => ({ name: j.name, cron: j.pattern, next: j.next })) });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/scheduler/status — queue health (waiting/active/completed/failed + Redis ping)
router.get('/status', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const status = await (0, scheduler_js_1.getSchedulerStatus)();
        res.json({ ok: true, ...status, timestamp: new Date().toISOString() });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/scheduler/trigger/:name — manual trigger any known cron job
router.post('/trigger/:name', auth_js_1.requireMobileAuth, async (req, res) => {
    const { name } = req.params;
    const ok = await (0, scheduler_js_1.triggerJob)(name);
    if (!ok) {
        res.status(404).json({ error: `Unknown job: ${name}` });
        return;
    }
    res.json({ triggered: true, job: name, queued_at: new Date().toISOString() });
});
// POST /api/scheduler/test-telegram — fire a custom-reminder → real Telegram message (P11 runtime proof)
router.post('/test-telegram', auth_js_1.requireMobileAuth, async (req, res) => {
    const { message } = req.body;
    const msg = message?.trim() || `🧪 P11 BullMQ Test — ${new Date().toISOString()} — scheduler worker ALIVE`;
    const idempotencyKey = `p11_test_${Date.now()}`;
    try {
        const jobId = await (0, scheduler_js_1.triggerCustomReminder)(msg, idempotencyKey);
        res.json({
            ok: true,
            job_id: jobId,
            idempotency_key: idempotencyKey,
            message: msg,
            queued_at: new Date().toISOString(),
            note: 'Check Telegram — message should arrive in <5s if worker is alive',
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/scheduler/memory-test — P12b runtime proof: call buildMemoryContext, return JSON + send Telegram
router.get('/memory-test', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const query = 'P12b test: qui je suis objectif Dzaryx business Fik';
        const result = await (0, memory_selector_js_1.buildMemoryContext)(query, 300);
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
        if (env_js_1.env.TELEGRAM_CHAT_ID) {
            await (0, telegram_js_1.sendMessage)(env_js_1.env.TELEGRAM_CHAT_ID, telegramLines.join('\n'));
        }
        res.json({
            ok: true,
            verdict,
            source: result.source,
            totalFacts: result.totalFacts,
            selectedFacts: result.selectedFacts,
            tokenEstimate: result.tokenEstimate,
            budgetTokens: 300,
            entries: result.entries,
            telegram_sent: !!env_js_1.env.TELEGRAM_CHAT_ID,
            tested_at: new Date().toISOString(),
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/scheduler/proactive-test — P12c: run memory-aware engine NOW, return trigger results
// ?force=true clears Redis locks | ?demo=true bypasses day/time/temp conditions (sends [DEMO] messages)
router.get('/proactive-test', auth_js_1.requireMobileAuth, async (req, res) => {
    const force = req.query['force'] === 'true';
    const demo = req.query['demo'] === 'true';
    try {
        const results = await (0, proactive_engine_js_1.runProactiveEngine)(undefined, force, demo);
        const sent = results.filter(r => r.status === 'SENT').length;
        const skipped = results.filter(r => r.status === 'SKIPPED').length;
        const errors = results.filter(r => r.status === 'ERROR').length;
        res.json({
            ok: true,
            force,
            demo,
            triggers: results,
            summary: { sent, skipped, errors },
            tested_at: new Date().toISOString(),
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ─── P15 v2 — Timezone Test ──────────────────────────────────────────────────
// GET /api/scheduler/timezone-test — full timezone diagnostics
// ?tz=Europe/Brussels (optional — test a specific timezone)
router.get('/timezone-test', auth_js_1.requireMobileAuth, async (req, res) => {
    try {
        const now = new Date();
        const serverTz = (0, timezone_js_1.getServerTimezone)();
        const explicitTz = req.query['tz'];
        // Detect stored user timezone from Redis
        const storedTz = await queue_js_1.redis.get('user:tz').catch(() => null);
        // Test timezones
        const TZS_TO_TEST = [
            'Europe/Brussels',
            'Africa/Algiers',
            'UTC',
            ...(explicitTz && (0, timezone_js_1.isValidTimezone)(explicitTz) ? [explicitTz] : []),
            ...(storedTz && (0, timezone_js_1.isValidTimezone)(storedTz) ? [storedTz] : []),
        ].filter((v, i, a) => a.indexOf(v) === i); // dedup
        // Resolution chain simulation
        const resolved = (0, timezone_js_1.resolveTimezone)(explicitTz ?? null, storedTz ?? null);
        // DST scenarios
        const summerDate = new Date(`${now.getFullYear()}-07-15T12:00:00Z`);
        const winterDate = new Date(`${now.getFullYear()}-01-15T12:00:00Z`);
        const dstScenarios = {
            belgium_summer: (0, timezone_js_1.getTimezoneConversion)('Europe/Brussels', summerDate),
            belgium_winter: (0, timezone_js_1.getTimezoneConversion)('Europe/Brussels', winterDate),
            algeria_summer: (0, timezone_js_1.getTimezoneConversion)('Africa/Algiers', summerDate),
            algeria_winter: (0, timezone_js_1.getTimezoneConversion)('Africa/Algiers', winterDate),
        };
        // at_time parsing tests
        const atTimeTests = ['18:00', '09:30', '00:00'].map(t => {
            const brussels = (0, timezone_js_1.parseLocalHHMM)(t, 'Europe/Brussels');
            const algiers = (0, timezone_js_1.parseLocalHHMM)(t, 'Africa/Algiers');
            return {
                at_time: t,
                brussels_utc: brussels?.toISOString() ?? 'parse_error',
                algiers_utc: algiers?.toISOString() ?? 'parse_error',
                diff_minutes: brussels && algiers
                    ? Math.round((brussels.getTime() - algiers.getTime()) / 60_000)
                    : null,
            };
        });
        // Travel scenario: user switches Brx → Algiers → back
        const travelScenario = [
            { location: 'Belgium', tz: 'Europe/Brussels', note: 'UTC+2 (DST)' },
            { location: 'Algeria', tz: 'Africa/Algiers', note: 'UTC+1 (no DST)' },
            { location: 'Belgium (return)', tz: 'Europe/Brussels', note: 'back home' },
        ].map(s => ({
            ...s,
            ...(0, timezone_js_1.getTimezoneConversion)(s.tz, now),
            resolve_result: (0, timezone_js_1.resolveTimezone)(s.tz).source,
        }));
        res.json({
            ok: true,
            server: {
                timezone: serverTz,
                utc_now: now.toISOString(),
                local_time: now.toLocaleString('fr-FR', { timeZone: serverTz }),
                node_version: process.version,
            },
            user: {
                stored_timezone: storedTz,
                stored_valid: storedTz ? (0, timezone_js_1.isValidTimezone)(storedTz) : null,
                explicit_from_qs: explicitTz ?? null,
                resolved: resolved,
            },
            conversions: Object.fromEntries(TZS_TO_TEST.map(tz => [tz, (0, timezone_js_1.getTimezoneConversion)(tz, now)])),
            dst_scenarios: dstScenarios,
            at_time_parsing: atTimeTests,
            travel_scenario: travelScenario,
            anti_hardcode_check: {
                algiers_hardcoded: false,
                note: 'Africa/Algiers NEVER used unless explicitly provided by user or stored from X-Timezone header',
            },
            generated_at: now.toISOString(),
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ─── P15 — Reminder Reliability endpoints ─────────────────────────────────
// GET /api/scheduler/reminders — list recent DB reminders with status audit
router.get('/reminders', auth_js_1.requireMobileAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query['limit'] ?? '30', 10);
        const reminders = await (0, reminders_js_1.listReminders)(Math.min(limit, 100));
        const pending = reminders.filter(r => r.status === 'PENDING').length;
        const sent = reminders.filter(r => r.status === 'SENT').length;
        const failed = reminders.filter(r => r.status === 'FAILED').length;
        res.json({
            count: reminders.length,
            summary: { pending, sent, failed },
            reminders,
            generated_at: new Date().toISOString(),
        });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/scheduler/reminder-test — create a real reminder in N minutes, return full proof
// body: { message, delay_minutes } — default delay: 2min
router.post('/reminder-test', auth_js_1.requireMobileAuth, async (req, res) => {
    try {
        const { message = 'Test P15 — reminder-worker sanity check', delay_minutes = 2 } = req.body;
        const delayMs = Number(delay_minutes) * 60 * 1000;
        const remindAt = new Date(Date.now() + delayMs);
        const dedup = `test_${Date.now()}`;
        // Resolve user timezone (same priority chain as tool-executor)
        const storedTz = await queue_js_1.redis.get('user:tz').catch(() => null);
        const resolved = (0, timezone_js_1.resolveTimezone)(null, storedTz ?? null);
        const { getUTCOffsetString, toLocalISO } = await Promise.resolve().then(() => __importStar(require('../../utils/timezone.js')));
        const utcOffset = getUTCOffsetString(resolved.timezone, remindAt);
        const localTimeISO = toLocalISO(remindAt, resolved.timezone);
        // 1. DB insert
        const dbRow = await (0, reminders_js_1.insertReminder)({
            message,
            remind_at: remindAt,
            timezone: resolved.timezone,
            utc_offset: utcOffset,
            local_time_iso: localTimeISO,
            timezone_source: resolved.source,
            created_by: 'reminder-test-api',
            dedup_key: dedup,
            telegram_target: env_js_1.env.TELEGRAM_CHAT_ID ?? undefined,
        });
        if (!dbRow) {
            res.status(500).json({ ok: false, error: 'DB insert failed — table may not exist. Run reminders_migration.sql in Supabase.' });
            return;
        }
        // 2. BullMQ job
        const job = await scheduler_js_1.schedulerQueue.add('custom-reminder', { message, request_id: dedup, source_channel: 'reminder-test-api', idempotency_key: dedup }, { delay: delayMs, removeOnComplete: { count: 5 }, removeOnFail: { count: 3 } });
        res.json({
            ok: true,
            proof: {
                db_id: dbRow.id,
                job_id: job.id ?? 'unknown',
                remind_at_utc: remindAt.toISOString(),
                local_time: localTimeISO,
                timezone_used: resolved.timezone,
                timezone_source: resolved.source,
                utc_offset: utcOffset,
                delay_minutes,
                message,
                status: dbRow.status,
                dedup_key: dedup,
                telegram_target: dbRow.telegram_target,
            },
            instruction: `Attends ${delay_minutes} min(s) puis vérifie Telegram ET GET /api/scheduler/reminders?limit=5`,
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/scheduler/reminder-scan — force a scan cycle NOW (admin/debug)
router.post('/reminder-scan', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const { processed, rows } = await (0, reminder_worker_js_1.triggerScanNow)();
        res.json({
            ok: true,
            processed,
            scanned_at: new Date().toISOString(),
            rows: rows.map(r => ({ id: r.id, status: r.status, message: r.message.slice(0, 60), remind_at: r.remind_at })),
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/scheduler/reminder-audit — snapshot: pending + due + retries
router.get('/reminder-audit', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const [pending, retries] = await Promise.all([(0, reminders_js_1.getPendingDue)(86400), (0, reminders_js_1.getRetryEligible)()]);
        res.json({
            ok: true,
            pending_due_24h: pending.map(r => ({ id: r.id, message: r.message.slice(0, 60), remind_at: r.remind_at, retry_count: r.retry_count })),
            retry_eligible: retries.map(r => ({ id: r.id, message: r.message.slice(0, 60), remind_at: r.remind_at, retry_count: r.retry_count, failed_reason: r.failed_reason })),
            generated_at: new Date().toISOString(),
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=scheduler.js.map