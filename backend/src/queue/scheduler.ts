import { Queue, Worker, type Job } from 'bullmq';
import { redis } from './queue.js';
import {
  jobMorningBriefing,
  jobEndRentalReminder,
  jobIdleVehicleAlert,
  jobTikTokSuggestion,
  jobWednesdayContent,
  jobFridayContent,
  jobUnpaidReminder,
  jobWeeklyReport,
  jobPatternDetection,
  jobCheckAnomalies,
  jobLateReturnAlert,
  jobWhatsAppBookingConfirmations,
  jobWhatsApp24hReminders,
  jobWhatsAppReturnReminders,
  jobAnthropicWatch,
  jobCompetitorWatch,
  jobBIDaily,
  jobBIReminders,
  jobClaudeCostMonitor,
  jobClientRelance,
  jobVehicleUtilization,
  jobHabitCheck,
  jobMonthlyReport,
  jobLongIdleAlert,
  jobClientBrainUpdate,
  jobDeliveryDepartureAlert,
} from './jobs/proactive-jobs.js';
import { runProactiveEngine } from '../conversation/proactive-engine.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';

const SCHEDULER_QUEUE = 'Dzaryx-scheduler';

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
    cron:  '0 9 * * 1',        // 9h chaque lundi — reveal/témoignage + rapport marketing
    tz:    'Africa/Algiers',
  },
  {
    name:  'wednesday-content',
    cron:  '0 14 * * 3',       // 14h mercredi — style lifestyle
    tz:    'Africa/Algiers',
  },
  {
    name:  'friday-content',
    cron:  '0 18 * * 5',       // 18h vendredi — style prix choc
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
  {
    name:  'late-return-alert',
    cron:  '0 11 * * *',       // 11h chaque jour — véhicules pas encore rendus
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
  {
    name:  'competitor-watch',
    cron:  '0 11 * * 1,4',    // 11h lundi + jeudi — veille concurrence TikTok/Telegram
    tz:    'Africa/Algiers',
  },
  {
    name:  'proactive-engine',
    cron:  '*/15 * * * *',     // toutes les 15min — moteur proactif P12c (memory-aware)
    tz:    'Europe/Brussels',
  },
  {
    name:  'bi-daily',
    cron:  '0 8 * * *',        // 8h chaque matin — rapport BI complet + Telegram
    tz:    'Africa/Algiers',
  },
  {
    name:  'bi-reminders',
    cron:  '*/30 * * * *',     // toutes les 30min — alertes smart reminders HIGH priority
    tz:    'Europe/Brussels',
  },
  {
    name:  'claude-cost-monitor',
    cron:  '0 20 * * *',       // 20h chaque soir — rapport coûts API Claude
    tz:    'Africa/Algiers',
  },
  {
    name:  'client-relance',
    cron:  '0 11 * * 2,4',     // 11h mardi + jeudi — clients inactifs 30+ jours
    tz:    'Africa/Algiers',
  },
  {
    name:  'vehicle-utilization',
    cron:  '0 9 * * 6',         // 9h samedi — rapport utilisation parc 30 jours
    tz:    'Africa/Algiers',
  },
  {
    name:  'habit-check',
    cron:  '15 8 * * *',        // 8h15 chaque matin — rappel habitudes Kouider
    tz:    'Africa/Algiers',
  },
  {
    name:  'monthly-report',
    cron:  '0 9 1 * *',         // 9h le 1er de chaque mois — bilan mensuel automatique
    tz:    'Africa/Algiers',
  },
  {
    name:  'long-idle-alert',
    cron:  '0 10 * * 1',        // 10h chaque lundi — véhicules immobilisés 14+ jours
    tz:    'Africa/Algiers',
  },
  {
    name:  'client-brain-update',
    cron:  '0 3 * * 0',          // 3h chaque dimanche — analyse patterns tous clients
    tz:    'Africa/Algiers',
  },
  {
    name:  'delivery-departure-alert',
    cron:  '*/30 7-21 * * *',    // toutes les 30min 7h-21h — alerte départ livraison depuis GPS
    tz:    'Africa/Algiers',
  },
] as const;

const handlers: Record<string, (job: Job) => Promise<void>> = {
  'morning-briefing':         jobMorningBriefing,
  'end-rental-reminder':      jobEndRentalReminder,
  'idle-vehicle-alert':       jobIdleVehicleAlert,
  'tiktok-suggestion':        jobTikTokSuggestion,
  'wednesday-content':        jobWednesdayContent,
  'friday-content':           jobFridayContent,
  'unpaid-reminder':          jobUnpaidReminder,
  'weekly-report':            jobWeeklyReport,
  'pattern-detection':        jobPatternDetection,
  'check-anomalies':          jobCheckAnomalies,
  'late-return-alert':        jobLateReturnAlert,
  'wa-booking-confirmations': jobWhatsAppBookingConfirmations,
  'wa-24h-reminders':         jobWhatsApp24hReminders,
  'wa-return-reminders':      jobWhatsAppReturnReminders,
  'anthropic-watch':          jobAnthropicWatch,
  'competitor-watch':         jobCompetitorWatch,
  'proactive-engine':         async (job: Job) => { await runProactiveEngine(job); },
  'bi-daily':                 jobBIDaily,
  'bi-reminders':             jobBIReminders,
  'claude-cost-monitor':      jobClaudeCostMonitor,
  'client-relance':           jobClientRelance,
  'vehicle-utilization':      jobVehicleUtilization,
  'habit-check':              jobHabitCheck,
  'monthly-report':           jobMonthlyReport,
  'long-idle-alert':          jobLongIdleAlert,
  'client-brain-update':      jobClientBrainUpdate,
  'delivery-departure-alert': jobDeliveryDepartureAlert,
};

export async function initScheduler(): Promise<void> {
  // Remove all existing repeatable jobs first — évite les doublons après redéploiement Railway
  const existing = await schedulerQueue.getRepeatableJobs();
  for (const rj of existing) {
    await schedulerQueue.removeRepeatableByKey(rj.key);
    console.log(`[scheduler] Cleaned: ${rj.name}`);
  }

  // WhatsApp jobs — enregistrés seulement si Twilio configuré
  const twilioConfigured = Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM,
  );
  const WA_JOBS = new Set(['wa-booking-confirmations', 'wa-24h-reminders', 'wa-return-reminders']);

  // Register all repeatable jobs (ardoise propre)
  for (const job of JOBS) {
    if (WA_JOBS.has(job.name) && !twilioConfigured) {
      console.log(`[scheduler] SKIP (Twilio non configuré): ${job.name}`);
      continue;
    }
    await schedulerQueue.add(
      job.name,
      {},
      {
        jobId:  `repeatable:${job.name}`,   // stable jobId prevents queue duplicates
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
        // BullMQ custom-reminder is now a SAFE FALLBACK only.
        // Primary delivery = reminder-worker DB polling (single source of truth).
        // This handler guards against double-send using the same Redis lock key as the worker.
        const data = job.data as {
          message:          string;
          request_id?:      string;
          source_channel?:  string;
          idempotency_key?: string;
        };
        const msg             = data.message;
        const idempotency_key = data.idempotency_key;
        const request_id      = data.request_id ?? 'n/a';

        // Shared lock key — same prefix/key used by reminder-worker
        const lockKey = `reminder:sending:${idempotency_key ?? request_id}`;
        const acquired = await redis.set(lockKey, `bullmq:${job.id ?? 'unknown'}`, 'EX', 300, 'NX');
        if (!acquired) {
          console.log(`[scheduler] custom-reminder SKIP — lock held (worker already delivered): idem=${idempotency_key}`);
          return;
        }

        // Check DB — if worker already marked SENT, skip
        if (idempotency_key) {
          const { data: dbRow } = await supabase
            .from('reminders')
            .select('id, status')
            .eq('dedup_key', idempotency_key)
            .maybeSingle();
          if (dbRow?.status === 'SENT') {
            console.log(`[scheduler] custom-reminder SKIP — DB status=SENT: id=${dbRow.id}`);
            await redis.del(lockKey);
            return;
          }
        }

        console.log(`[scheduler] custom-reminder DELIVERING — request_id=${request_id} idem=${idempotency_key} job_id=${job.id}`);

        try {
          // Deliver to app (Socket.IO + Expo Push)
          emitProactive(msg, 'reminder', `⏰ Rappel\n\n${msg}`);
          // Update DB status if we have a dedup_key
          if (idempotency_key) {
            await supabase
              .from('reminders')
              .update({ status: 'SENT', sent_at: new Date().toISOString(), provider_response: `bullmq:${job.id ?? 'unknown'}` })
              .eq('dedup_key', idempotency_key)
              .eq('status', 'PENDING');
          }
          console.log(`[scheduler] custom-reminder ✅ SENT: idem=${idempotency_key}`);
        } catch (sendErr) {
          const reason = sendErr instanceof Error ? sendErr.message : String(sendErr);
          console.error(`[scheduler] custom-reminder ❌ SEND FAILED: ${reason}`);
          // Release lock so reminder-worker can retry
          await redis.del(lockKey);
          // Update DB to FAILED if we have a key
          if (idempotency_key) {
            await supabase
              .from('reminders')
              .update({ status: 'FAILED', failed_reason: `bullmq_send_failed: ${reason}` })
              .eq('dedup_key', idempotency_key)
              .eq('status', 'PENDING');
          }
        }
        return;
      }

      // ── Verrou anti-doublon Redis ─────────────────────────────
      // Évite qu'une 2ème instance Railway (overlap de déploiement) exécute
      // le même job cron dans les 30 minutes qui suivent la 1ère exécution.
      const lockKey = `scheduler:lock:${job.name}:${Math.floor(Date.now() / (30 * 60 * 1000))}`;
      const acquired = await redis.set(lockKey, '1', 'EX', 1800, 'NX');
      if (!acquired) {
        console.log(`[scheduler] SKIP (déjà exécuté par une autre instance): ${job.name}`);
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
  const valid = JOBS.map(j => j.name) as string[];
  if (!valid.includes(jobName)) return false;
  await schedulerQueue.add(jobName, {}, { priority: 1 });
  return true;
}

// Trigger a one-shot custom-reminder (sends text to Telegram/Pushover)
export async function triggerCustomReminder(message: string, idempotencyKey: string): Promise<string> {
  const job = await schedulerQueue.add(
    'custom-reminder',
    { message, source_channel: 'api-test', idempotency_key: idempotencyKey, request_id: `test_${Date.now()}` },
    { priority: 1, removeOnComplete: 5, removeOnFail: 5 },
  );
  return job.id ?? 'unknown';
}

// Queue health snapshot
export async function getSchedulerStatus(): Promise<{
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  repeatable: number;
  redis_ping_ms: number;
}> {
  const [waiting, active, completed, failed, delayed, repeatable] = await Promise.all([
    schedulerQueue.getWaitingCount(),
    schedulerQueue.getActiveCount(),
    schedulerQueue.getCompletedCount(),
    schedulerQueue.getFailedCount(),
    schedulerQueue.getDelayedCount(),
    schedulerQueue.getRepeatableJobs(),
  ]);
  const t0 = Date.now();
  await redis.ping();
  const redis_ping_ms = Date.now() - t0;
  return {
    queue:         SCHEDULER_QUEUE,
    waiting,
    active,
    completed,
    failed,
    delayed,
    repeatable:    repeatable.length,
    redis_ping_ms,
  };
}

export { SCHEDULER_QUEUE };
