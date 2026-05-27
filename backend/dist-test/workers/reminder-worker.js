"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initReminderWorker = initReminderWorker;
exports.stopReminderWorker = stopReminderWorker;
exports.triggerScanNow = triggerScanNow;
const queue_js_1 = require("../queue/queue.js");
const telegram_js_1 = require("../integrations/telegram.js");
const pushover_js_1 = require("../notifications/pushover.js");
const env_js_1 = require("../config/env.js");
const reminders_js_1 = require("../db/reminders.js");
const LOCK_PREFIX = 'reminder:sending:';
const LOCK_TTL_S = 300; // 5min lock — prevents double-send across instances
const SCAN_INTERVAL_MS = 30_000; // 30 seconds
let _scanTimer = null;
let _started = false;
// ── Send a single reminder to the configured channel ─────────────────────────
async function deliver(row) {
    const text = `⏰ *Rappel Dzaryx*\n\n${row.message}`;
    if (row.telegram_target) {
        await (0, telegram_js_1.sendMessage)(row.telegram_target, text);
        return `telegram:${row.telegram_target}`;
    }
    if (env_js_1.env.TELEGRAM_CHAT_ID) {
        await (0, telegram_js_1.sendMessage)(env_js_1.env.TELEGRAM_CHAT_ID, text);
        return `telegram:${env_js_1.env.TELEGRAM_CHAT_ID}`;
    }
    await (0, pushover_js_1.notifyOwner)('⏰ Rappel Dzaryx', row.message);
    return 'pushover:owner';
}
// ── Process one pending/retry reminder ───────────────────────────────────────
async function processReminder(row) {
    // Use dedup_key when available — shared with BullMQ path to prevent cross-path double-send.
    // Falls back to row.id for reminders created without a dedup_key.
    const lockKey = `${LOCK_PREFIX}${row.dedup_key ?? row.id}`;
    // Acquire Redis dedup lock — NX prevents double-send across Railway instances
    const acquired = await queue_js_1.redis.set(lockKey, '1', 'EX', LOCK_TTL_S, 'NX');
    if (!acquired) {
        console.log(`[reminder-worker] SKIP (lock held): ${row.id}`);
        return;
    }
    const retryNum = row.retry_count + 1;
    console.log(`[reminder-worker] SENDING id=${row.id} retry=${retryNum} ` +
        `remind_at=${row.remind_at} message="${row.message.slice(0, 60)}"`);
    try {
        const provider = await deliver(row);
        await (0, reminders_js_1.updateReminderStatus)(row.id, 'SENT', {
            sent_at: new Date(),
            provider_response: provider,
            retry_count: retryNum,
        });
        console.log(`[reminder-worker] ✅ SENT id=${row.id} provider=${provider}`);
    }
    catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[reminder-worker] ❌ FAILED id=${row.id} reason=${reason}`);
        if (retryNum >= 3) {
            await (0, reminders_js_1.updateReminderStatus)(row.id, 'FAILED', { failed_reason: reason, retry_count: retryNum });
            console.warn(`[reminder-worker] Max retries reached for ${row.id} — status=FAILED`);
        }
        else {
            // Will retry on next scan (status stays FAILED until resetToRetry)
            await (0, reminders_js_1.updateReminderStatus)(row.id, 'FAILED', { failed_reason: reason, retry_count: retryNum });
            // Schedule retry reset in 5min via Redis
            setTimeout(() => {
                (0, reminders_js_1.resetToRetry)(row.id, retryNum).catch(() => { });
                queue_js_1.redis.del(lockKey).catch(() => { });
            }, 5 * 60 * 1000);
        }
    }
}
// ── Main scan cycle ───────────────────────────────────────────────────────────
async function scan() {
    try {
        // 1. PENDING reminders due within next 90s
        const pending = await (0, reminders_js_1.getPendingDue)(90);
        if (pending.length > 0) {
            console.log(`[reminder-worker] scan: ${pending.length} pending due`);
            await Promise.allSettled(pending.map(r => processReminder(r)));
        }
        // 2. FAILED retries eligible (retry_count < 3, past due)
        const retries = await (0, reminders_js_1.getRetryEligible)();
        if (retries.length > 0) {
            console.log(`[reminder-worker] scan: ${retries.length} retry eligible`);
            await Promise.allSettled(retries.map(r => processReminder(r)));
        }
    }
    catch (err) {
        console.error('[reminder-worker] scan error:', err instanceof Error ? err.message : err);
    }
}
// ── Public API ────────────────────────────────────────────────────────────────
function initReminderWorker() {
    if (_started)
        return;
    _started = true;
    // Immediate first scan
    void scan();
    _scanTimer = setInterval(() => { void scan(); }, SCAN_INTERVAL_MS);
    console.log(`[reminder-worker] Started — scanning every ${SCAN_INTERVAL_MS / 1000}s`);
}
function stopReminderWorker() {
    if (_scanTimer) {
        clearInterval(_scanTimer);
        _scanTimer = null;
    }
    _started = false;
    console.log('[reminder-worker] Stopped');
}
// Manual trigger for tests
async function triggerScanNow() {
    const pending = await (0, reminders_js_1.getPendingDue)(90);
    const retries = await (0, reminders_js_1.getRetryEligible)();
    const all = [...pending, ...retries];
    if (all.length > 0)
        await Promise.allSettled(all.map(r => processReminder(r)));
    return { processed: all.length, rows: all };
}
//# sourceMappingURL=reminder-worker.js.map