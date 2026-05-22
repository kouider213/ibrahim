import { redis } from '../queue/queue.js';
import { sendMessage } from '../integrations/telegram.js';
import { notifyOwner } from '../notifications/pushover.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { env } from '../config/env.js';
import {
  getPendingDue,
  getRetryEligible,
  updateReminderStatus,
  resetToRetry,
  type ReminderRow,
} from '../db/reminders.js';

const LOCK_PREFIX = 'reminder:sending:';
const LOCK_TTL_S  = 300; // 5min lock — prevents double-send across instances
const SCAN_INTERVAL_MS = 30_000; // 30 seconds

let _scanTimer: ReturnType<typeof setInterval> | null = null;
let _started = false;

// ── Send a single reminder to the configured channel ─────────────────────────
async function deliver(row: ReminderRow): Promise<string> {
  const text = `⏰ *Rappel Dzaryx*\n\n${row.message}`;
  const providers: string[] = [];

  // Always send to app (Socket.IO + Web Push)
  emitProactive(row.message, 'reminder', `⏰ Rappel\n\n${row.message}`);
  providers.push('app');

  // Also send to Telegram if configured
  if (row.telegram_target) {
    await sendMessage(row.telegram_target, text);
    providers.push(`telegram:${row.telegram_target}`);
  } else if (env.TELEGRAM_CHAT_ID) {
    await sendMessage(env.TELEGRAM_CHAT_ID, text).catch(() => {});
    providers.push(`telegram:${env.TELEGRAM_CHAT_ID}`);
  } else {
    await notifyOwner('⏰ Rappel Dzaryx', row.message).catch(() => {});
    providers.push('pushover:owner');
  }

  return providers.join('+');
}

// ── Process one pending/retry reminder ───────────────────────────────────────
async function processReminder(row: ReminderRow): Promise<void> {
  // Use dedup_key when available — shared with BullMQ path to prevent cross-path double-send.
  // Falls back to row.id for reminders created without a dedup_key.
  const lockKey = `${LOCK_PREFIX}${row.dedup_key ?? row.id}`;

  // Acquire Redis dedup lock — NX prevents double-send across Railway instances
  const acquired = await redis.set(lockKey, '1', 'EX', LOCK_TTL_S, 'NX');
  if (!acquired) {
    console.log(`[reminder-worker] SKIP (lock held): ${row.id}`);
    return;
  }

  const retryNum = row.retry_count + 1;
  console.log(
    `[reminder-worker] SENDING id=${row.id} retry=${retryNum} ` +
    `remind_at=${row.remind_at} message="${row.message.slice(0, 60)}"`,
  );

  try {
    const provider = await deliver(row);
    await updateReminderStatus(row.id, 'SENT', {
      sent_at: new Date(),
      provider_response: provider,
      retry_count: retryNum,
    });
    console.log(`[reminder-worker] ✅ SENT id=${row.id} provider=${provider}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[reminder-worker] ❌ FAILED id=${row.id} reason=${reason}`);

    if (retryNum >= 3) {
      await updateReminderStatus(row.id, 'FAILED', { failed_reason: reason, retry_count: retryNum });
      console.warn(`[reminder-worker] Max retries reached for ${row.id} — status=FAILED`);
    } else {
      // Will retry on next scan (status stays FAILED until resetToRetry)
      await updateReminderStatus(row.id, 'FAILED', { failed_reason: reason, retry_count: retryNum });
      // Schedule retry reset in 5min via Redis
      setTimeout(() => {
        resetToRetry(row.id, retryNum).catch(() => {});
        redis.del(lockKey).catch(() => {});
      }, 5 * 60 * 1000);
    }
  }
}

// ── Main scan cycle ───────────────────────────────────────────────────────────
async function scan(): Promise<void> {
  try {
    // 1. PENDING reminders due within next 90s
    const pending = await getPendingDue(90);
    if (pending.length > 0) {
      console.log(`[reminder-worker] scan: ${pending.length} pending due`);
      await Promise.allSettled(pending.map(r => processReminder(r)));
    }

    // 2. FAILED retries eligible (retry_count < 3, past due)
    const retries = await getRetryEligible();
    if (retries.length > 0) {
      console.log(`[reminder-worker] scan: ${retries.length} retry eligible`);
      await Promise.allSettled(retries.map(r => processReminder(r)));
    }
  } catch (err) {
    console.error('[reminder-worker] scan error:', err instanceof Error ? err.message : err);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function initReminderWorker(): void {
  if (_started) return;
  _started = true;

  // Immediate first scan
  void scan();

  _scanTimer = setInterval(() => { void scan(); }, SCAN_INTERVAL_MS);

  console.log(`[reminder-worker] Started — scanning every ${SCAN_INTERVAL_MS / 1000}s`);
}

export function stopReminderWorker(): void {
  if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; }
  _started = false;
  console.log('[reminder-worker] Stopped');
}

// Manual trigger for tests
export async function triggerScanNow(): Promise<{ processed: number; rows: ReminderRow[] }> {
  const pending = await getPendingDue(90);
  const retries = await getRetryEligible();
  const all     = [...pending, ...retries];
  if (all.length > 0) await Promise.allSettled(all.map(r => processReminder(r)));
  return { processed: all.length, rows: all };
}
