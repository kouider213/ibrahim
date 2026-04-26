import { Queue, Worker, type Job } from 'bullmq';
import { redis } from './queue.js';
import {
  jobMorningBriefing,
  jobEndRentalReminder,
  jobIdleVehicleAlert,
  jobTikTokSuggestion,
  jobUnpaidReminder,
  jobWeeklyReport,
  jobPatternDetection,
  jobCheckAnomalies,
  jobWhatsAppBookingConfirmations,
  jobWhatsApp24hReminders,
  jobWhatsAppReturnReminders,
  jobAnthropicWatch,
} from './jobs/proactive-jobs.js';
import { notifyOwner } from '../notifications/pushover.js';
import { sendMessage as sendTelegram } from '../integrations/telegram.js';
import { env } from '../config/env.js';

const SCHEDULER_QUEUE = 'ibrahim-scheduler';

export const schedulerQueue = new Queue(SCHEDULER_QUEUE, { connection: redis });

const JOBS = [
  {
    name:  'morning-briefing',
    cron:  '30 7 * * *',        // 7h30 chaque matin (Africa/Algiers)
    tz:    'Africa/Algiers',
  },
  {
    name:  'end-rental-reminder',
    cron:  '0 9 * * *',        // 9h chaque jour (Africa/Algiers = UTC+1)
    tz:    'Africa/Algiers',
  },
  {
    name:  'idle-vehicle-alert',
    cron:  '0 10 * * *',       // 10h chaque jour
    tz:    'Africa/Algiers',
  },
  {
    name:  'tiktok-suggestion',
    cron:  '0 9 * * 1',        // 9h chaque lundi
    tz:    'Africa/Algiers',
  },
  {
    name:  'unpaid-reminder',
    cron:  '0 */6 * * *',      // toutes les 6h
    tz:    'Africa/Algiers',
  },
  {
    name:  'weekly-report',
    cron:  '0 8 * * 1',        // 8h chaque lundi
    tz:    'Africa/Algiers',
  },
  {
    name:  'pattern-detection',
    cron:  '30 8 * * 1',       // 8h30 chaque lundi (après rapport hebdo)
    tz:    'Africa/Algiers',
  },
  {
    name:  'check-anomalies',
    cron:  '0 12 * * *',       // 12h chaque jour — détection anomalies financières
    tz:    'Africa/Algiers',
  },
  // ── Phase 6 — WhatsApp ──
  {
    name:  'wa-booking-confirmations',
    cron:  '*/10 * * * *',     // toutes les 10 min — envoi confirmations WhatsApp
    tz:    'Africa/Algiers',
  },
  {
    name:  'wa-24h-reminders',
    cron:  '0 10 * * *',       // 10h chaque jour — rappel J-1
    tz:    'Africa/Algiers',
  },
  {
    name:  'wa-return-reminders',
    cron:  '0 9 * * *',        // 9h chaque jour — rappel retour aujourd'hui
    tz:    'Africa/Algiers',
  },
  {
    name:  'anthropic-watch',
    cron:  '0 10 * * 0',       // 10h chaque dimanche — veille nouveautés Anthropic
    tz:    'Europe/Brussels',
  },
] as const;

const handlers: Record<string, (job: Job) => Promise<void>> = {
  'morning-briefing':         jobMorningBriefing,
  'end-rental-reminder':      jobEndRentalReminder,
  'idle-vehicle-alert':       jobIdleVehicleAlert,
  'tiktok-suggestion':        jobTikTokSuggestion,
  'unpaid-reminder':          jobUnpaidReminder,
  'weekly-report':            jobWeeklyReport,
  'pattern-detection':        jobPatternDetection,
  'check-anomalies':          jobCheckAnomalies,
  'wa-booking-confirmations': jobWhatsAppBookingConfirmations,
  'wa-24h-reminders':         jobWhatsApp24hReminders,
  'wa-return-reminders':      jobWhatsAppReturnReminders,
  'anthropic-watch':          jobAnthropicWatch,
};

export async function initScheduler(): Promise<void> {
  // Register all repeatable jobs
  for (const job of JOBS) {
    await schedulerQueue.add(
      job.name,
      {},
      {
        repeat: { pattern: job.cron, tz: job.tz },
        removeOnComplete: { count: 10 },
        removeOnFail:     { count: 5 },
      },
    );
    console.log(`[scheduler] Registered: ${job.name} (${job.cron})`);
  }

  // Worker that processes all scheduled jobs
  const worker = new Worker(
    SCHEDULER_QUEUE,
    async (job: Job) => {
      if (job.name === 'custom-reminder') {
        const msg = (job.data as { message: string }).message;
        const chatId = env.TELEGRAM_CHAT_ID;
        if (chatId) {
          await sendTelegram(chatId, `⏰ *Rappel Ibrahim*\n\n${msg}`);
        } else {
          await notifyOwner('⏰ Rappel Ibrahim', msg);
        }
        return;
      }
      const handler = handlers[job.name];
      if (handler) {
        console.log(`[scheduler] Running: ${job.name}`);
        await handler(job);
      }
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on('completed', job => console.log(`[scheduler] ✅ ${job.name} done`));
  worker.on('failed',    (job, err) => console.error(`[scheduler] ❌ ${job?.name} failed:`, err.message));

  console.log('[scheduler] All proactive jobs registered');
}

// Manual trigger (for testing/admin)
export async function triggerJob(jobName: string): Promise<boolean> {
  const valid = JOBS.map(j => j.name);
  if (!valid.includes(jobName as typeof valid[number])) return false;
  await schedulerQueue.add(jobName, {}, { priority: 1 });
  return true;
}

export { SCHEDULER_QUEUE };
