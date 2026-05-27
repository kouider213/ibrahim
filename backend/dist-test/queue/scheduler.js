"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEDULER_QUEUE = exports.schedulerQueue = void 0;
exports.initScheduler = initScheduler;
exports.triggerJob = triggerJob;
exports.triggerCustomReminder = triggerCustomReminder;
exports.getSchedulerStatus = getSchedulerStatus;
const bullmq_1 = require("bullmq");
const queue_js_1 = require("./queue.js");
const proactive_jobs_js_1 = require("./jobs/proactive-jobs.js");
const proactive_engine_js_1 = require("../conversation/proactive-engine.js");
const pushover_js_1 = require("../notifications/pushover.js");
const telegram_js_1 = require("../integrations/telegram.js");
const env_js_1 = require("../config/env.js");
const supabase_js_1 = require("../integrations/supabase.js");
const SCHEDULER_QUEUE = 'Dzaryx-scheduler';
exports.SCHEDULER_QUEUE = SCHEDULER_QUEUE;
exports.schedulerQueue = new bullmq_1.Queue(SCHEDULER_QUEUE, { connection: queue_js_1.redis });
const JOBS = [
    {
        name: 'morning-briefing',
        cron: '30 7 * * *', // 7h30 chaque matin (Africa/Algiers)
        tz: 'Africa/Algiers',
    },
    {
        name: 'end-rental-reminder',
        cron: '0 9 * * *', // 9h chaque jour (Africa/Algiers = UTC+1)
        tz: 'Africa/Algiers',
    },
    {
        name: 'idle-vehicle-alert',
        cron: '0 10 * * *', // 10h chaque jour
        tz: 'Africa/Algiers',
    },
    {
        name: 'tiktok-suggestion',
        cron: '0 9 * * 1', // 9h chaque lundi — reveal/témoignage + rapport marketing
        tz: 'Africa/Algiers',
    },
    {
        name: 'wednesday-content',
        cron: '0 14 * * 3', // 14h mercredi — style lifestyle
        tz: 'Africa/Algiers',
    },
    {
        name: 'friday-content',
        cron: '0 18 * * 5', // 18h vendredi — style prix choc
        tz: 'Africa/Algiers',
    },
    {
        name: 'unpaid-reminder',
        cron: '0 */6 * * *', // toutes les 6h
        tz: 'Africa/Algiers',
    },
    {
        name: 'weekly-report',
        cron: '0 8 * * 1', // 8h chaque lundi
        tz: 'Africa/Algiers',
    },
    {
        name: 'pattern-detection',
        cron: '30 8 * * 1', // 8h30 chaque lundi (après rapport hebdo)
        tz: 'Africa/Algiers',
    },
    {
        name: 'check-anomalies',
        cron: '0 12 * * *', // 12h chaque jour — détection anomalies financières
        tz: 'Africa/Algiers',
    },
    {
        name: 'late-return-alert',
        cron: '0 11 * * *', // 11h chaque jour — véhicules pas encore rendus
        tz: 'Africa/Algiers',
    },
    // ── Phase 6 — WhatsApp ──
    {
        name: 'wa-booking-confirmations',
        cron: '*/10 * * * *', // toutes les 10 min — envoi confirmations WhatsApp
        tz: 'Africa/Algiers',
    },
    {
        name: 'wa-24h-reminders',
        cron: '0 10 * * *', // 10h chaque jour — rappel J-1
        tz: 'Africa/Algiers',
    },
    {
        name: 'wa-return-reminders',
        cron: '0 9 * * *', // 9h chaque jour — rappel retour aujourd'hui
        tz: 'Africa/Algiers',
    },
    {
        name: 'anthropic-watch',
        cron: '0 10 * * 0', // 10h chaque dimanche — veille nouveautés Anthropic
        tz: 'Europe/Brussels',
    },
    {
        name: 'competitor-watch',
        cron: '0 11 * * 1,4', // 11h lundi + jeudi — veille concurrence TikTok/Telegram
        tz: 'Africa/Algiers',
    },
    {
        name: 'proactive-engine',
        cron: '*/15 * * * *', // toutes les 15min — moteur proactif P12c (memory-aware)
        tz: 'Europe/Brussels',
    },
    {
        name: 'bi-daily',
        cron: '0 8 * * *', // 8h chaque matin — rapport BI complet + Telegram
        tz: 'Africa/Algiers',
    },
    {
        name: 'bi-reminders',
        cron: '*/30 * * * *', // toutes les 30min — alertes smart reminders HIGH priority
        tz: 'Europe/Brussels',
    },
];
const handlers = {
    'morning-briefing': proactive_jobs_js_1.jobMorningBriefing,
    'end-rental-reminder': proactive_jobs_js_1.jobEndRentalReminder,
    'idle-vehicle-alert': proactive_jobs_js_1.jobIdleVehicleAlert,
    'tiktok-suggestion': proactive_jobs_js_1.jobTikTokSuggestion,
    'wednesday-content': proactive_jobs_js_1.jobWednesdayContent,
    'friday-content': proactive_jobs_js_1.jobFridayContent,
    'unpaid-reminder': proactive_jobs_js_1.jobUnpaidReminder,
    'weekly-report': proactive_jobs_js_1.jobWeeklyReport,
    'pattern-detection': proactive_jobs_js_1.jobPatternDetection,
    'check-anomalies': proactive_jobs_js_1.jobCheckAnomalies,
    'late-return-alert': proactive_jobs_js_1.jobLateReturnAlert,
    'wa-booking-confirmations': proactive_jobs_js_1.jobWhatsAppBookingConfirmations,
    'wa-24h-reminders': proactive_jobs_js_1.jobWhatsApp24hReminders,
    'wa-return-reminders': proactive_jobs_js_1.jobWhatsAppReturnReminders,
    'anthropic-watch': proactive_jobs_js_1.jobAnthropicWatch,
    'competitor-watch': proactive_jobs_js_1.jobCompetitorWatch,
    'proactive-engine': async (job) => { await (0, proactive_engine_js_1.runProactiveEngine)(job); },
    'bi-daily': proactive_jobs_js_1.jobBIDaily,
    'bi-reminders': proactive_jobs_js_1.jobBIReminders,
};
async function initScheduler() {
    // Remove all existing repeatable jobs first — évite les doublons après redéploiement Railway
    const existing = await exports.schedulerQueue.getRepeatableJobs();
    for (const rj of existing) {
        await exports.schedulerQueue.removeRepeatableByKey(rj.key);
        console.log(`[scheduler] Cleaned: ${rj.name}`);
    }
    // WhatsApp jobs — enregistrés seulement si Twilio configuré
    const twilioConfigured = Boolean(env_js_1.env.TWILIO_ACCOUNT_SID && env_js_1.env.TWILIO_AUTH_TOKEN && env_js_1.env.TWILIO_WHATSAPP_FROM);
    const WA_JOBS = new Set(['wa-booking-confirmations', 'wa-24h-reminders', 'wa-return-reminders']);
    // Register all repeatable jobs (ardoise propre)
    for (const job of JOBS) {
        if (WA_JOBS.has(job.name) && !twilioConfigured) {
            console.log(`[scheduler] SKIP (Twilio non configuré): ${job.name}`);
            continue;
        }
        await exports.schedulerQueue.add(job.name, {}, {
            jobId: `repeatable:${job.name}`, // stable jobId prevents queue duplicates
            repeat: { pattern: job.cron, tz: job.tz },
            removeOnComplete: { count: 10 },
            removeOnFail: { count: 5 },
        });
        console.log(`[scheduler] Registered: ${job.name} (${job.cron})`);
    }
    // Worker that processes all scheduled jobs
    const worker = new bullmq_1.Worker(SCHEDULER_QUEUE, async (job) => {
        if (job.name === 'custom-reminder') {
            // BullMQ custom-reminder is now a SAFE FALLBACK only.
            // Primary delivery = reminder-worker DB polling (single source of truth).
            // This handler guards against double-send using the same Redis lock key as the worker.
            const data = job.data;
            const msg = data.message;
            const idempotency_key = data.idempotency_key;
            const request_id = data.request_id ?? 'n/a';
            // Shared lock key — same prefix/key used by reminder-worker
            const lockKey = `reminder:sending:${idempotency_key ?? request_id}`;
            const acquired = await queue_js_1.redis.set(lockKey, `bullmq:${job.id ?? 'unknown'}`, 'EX', 300, 'NX');
            if (!acquired) {
                console.log(`[scheduler] custom-reminder SKIP — lock held (worker already delivered): idem=${idempotency_key}`);
                return;
            }
            // Check DB — if worker already marked SENT, skip
            if (idempotency_key) {
                const { data: dbRow } = await supabase_js_1.supabase
                    .from('reminders')
                    .select('id, status')
                    .eq('dedup_key', idempotency_key)
                    .maybeSingle();
                if (dbRow?.status === 'SENT') {
                    console.log(`[scheduler] custom-reminder SKIP — DB status=SENT: id=${dbRow.id}`);
                    await queue_js_1.redis.del(lockKey);
                    return;
                }
            }
            console.log(`[scheduler] custom-reminder DELIVERING — request_id=${request_id} idem=${idempotency_key} job_id=${job.id}`);
            try {
                const chatId = env_js_1.env.TELEGRAM_CHAT_ID;
                if (chatId) {
                    await (0, telegram_js_1.sendMessage)(chatId, `⏰ *Rappel Dzaryx*\n\n${msg}`);
                }
                else {
                    await (0, pushover_js_1.notifyOwner)('⏰ Rappel Dzaryx', msg);
                }
                // Update DB status if we have a dedup_key
                if (idempotency_key) {
                    await supabase_js_1.supabase
                        .from('reminders')
                        .update({ status: 'SENT', sent_at: new Date().toISOString(), provider_response: `bullmq:${job.id ?? 'unknown'}` })
                        .eq('dedup_key', idempotency_key)
                        .eq('status', 'PENDING');
                }
                console.log(`[scheduler] custom-reminder ✅ SENT: idem=${idempotency_key}`);
            }
            catch (sendErr) {
                const reason = sendErr instanceof Error ? sendErr.message : String(sendErr);
                console.error(`[scheduler] custom-reminder ❌ SEND FAILED: ${reason}`);
                // Release lock so reminder-worker can retry
                await queue_js_1.redis.del(lockKey);
                // Update DB to FAILED if we have a key
                if (idempotency_key) {
                    await supabase_js_1.supabase
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
        const acquired = await queue_js_1.redis.set(lockKey, '1', 'EX', 1800, 'NX');
        if (!acquired) {
            console.log(`[scheduler] SKIP (déjà exécuté par une autre instance): ${job.name}`);
            return;
        }
        const handler = handlers[job.name];
        if (handler) {
            console.log(`[scheduler] Running: ${job.name}`);
            await handler(job);
        }
    }, { connection: queue_js_1.redis, concurrency: 1 });
    worker.on('completed', job => console.log(`[scheduler] ✅ ${job.name} done`));
    worker.on('failed', (job, err) => console.error(`[scheduler] ❌ ${job?.name} failed:`, err.message));
    console.log('[scheduler] All proactive jobs registered');
}
// Manual trigger (for testing/admin)
async function triggerJob(jobName) {
    const valid = JOBS.map(j => j.name);
    if (!valid.includes(jobName))
        return false;
    await exports.schedulerQueue.add(jobName, {}, { priority: 1 });
    return true;
}
// Trigger a one-shot custom-reminder (sends text to Telegram/Pushover)
async function triggerCustomReminder(message, idempotencyKey) {
    const job = await exports.schedulerQueue.add('custom-reminder', { message, source_channel: 'api-test', idempotency_key: idempotencyKey, request_id: `test_${Date.now()}` }, { priority: 1, removeOnComplete: 5, removeOnFail: 5 });
    return job.id ?? 'unknown';
}
// Queue health snapshot
async function getSchedulerStatus() {
    const [waiting, active, completed, failed, delayed, repeatable] = await Promise.all([
        exports.schedulerQueue.getWaitingCount(),
        exports.schedulerQueue.getActiveCount(),
        exports.schedulerQueue.getCompletedCount(),
        exports.schedulerQueue.getFailedCount(),
        exports.schedulerQueue.getDelayedCount(),
        exports.schedulerQueue.getRepeatableJobs(),
    ]);
    const t0 = Date.now();
    await queue_js_1.redis.ping();
    const redis_ping_ms = Date.now() - t0;
    return {
        queue: SCHEDULER_QUEUE,
        waiting,
        active,
        completed,
        failed,
        delayed,
        repeatable: repeatable.length,
        redis_ping_ms,
    };
}
//# sourceMappingURL=scheduler.js.map