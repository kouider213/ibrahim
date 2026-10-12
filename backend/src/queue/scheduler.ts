import type { Job } from 'bullmq';
import { Cron } from 'croner';
import { ensureAppStoreTables, claimJobRun } from '../integrations/app-store.js';
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
  jobHouariArrivalAlert,
  jobHouariReturnAlert,
  jobHouariWeeklyReport,
  jobDocumentExpiryAlert,
  jobMaintenanceAlert,
  jobSmartAlarm,
  jobMonthlyExcel,
  jobOpportunitiesWatch,
  jobOpportunitiesRefresh,
} from './jobs/proactive-jobs.js';
import { runProactiveEngine } from '../conversation/proactive-engine.js';
import { runDailyOutreach, checkProspectReplies } from '../integrations/prospect-autopilot.js';
import { emitProactive } from '../notifications/mobile-push.js';

const SCHEDULER_QUEUE = 'in-process';

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
    name:  'opportunities-refresh',
    cron:  '0 7 * * *',       // 7h chaque jour — refresh SILENCIEUX du cache (onglet frais, pas de notif)
    tz:    'Africa/Algiers',
  },
  {
    name:  'opportunities-watch',
    cron:  '0 9 * * 6',       // 9h samedi — DIGEST hebdo sur le chat (l'important de la semaine)
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
  // ── Houari ──
  {
    name:  'houari-arrival-alert',
    cron:  '0 9 * * *',          // 9h chaque jour — arrivée client demain → prépare véhicule
    tz:    'Africa/Algiers',
  },
  {
    name:  'houari-return-alert',
    cron:  '0 18 * * *',         // 18h chaque jour — retour client demain → prépare récupération
    tz:    'Africa/Algiers',
  },
  {
    name:  'houari-weekly-report',
    cron:  '15 8 * * 1',         // 8h15 chaque lundi — rapport hebdo revenus Houari
    tz:    'Africa/Algiers',
  },
  {
    name:  'document-expiry-alert',
    cron:  '0 9 * * 1',           // 9h chaque lundi — alertes documents clients expirant bientôt
    tz:    'Africa/Algiers',
  },
  {
    name:  'maintenance-alert',
    cron:  '0 8 * * 1',           // 8h chaque lundi — véhicules en retard d'entretien
    tz:    'Africa/Algiers',
  },
  {
    name:  'smart-alarm',
    cron:  '30 22 * * *',          // 22h30 chaque soir — réveil optimal selon agenda lendemain
    tz:    'Africa/Algiers',
  },
  {
    name:  'prospect-outreach',
    cron:  '0 10 * * *',            // 10h chaque jour — démarchage auto (nouvelles sociétés, jamais 2 fois la même)
    tz:    'Africa/Algiers',
  },
  {
    name:  'prospect-replies',
    cron:  '*/30 7-22 * * *',       // toutes les 30 min 7h-22h — réponses des prospects → récap dans l'app
    tz:    'Africa/Algiers',
  },
  {
    name:  'monthly-excel',
    cron:  '30 9 1 * *',            // 9h30 le 1er du mois — export Excel comptable auto
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
  'anthropic-watch':          jobAnthropicWatch,
  'competitor-watch':         jobCompetitorWatch,
  'opportunities-watch':      jobOpportunitiesWatch,
  'opportunities-refresh':    jobOpportunitiesRefresh,
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
  'houari-arrival-alert':    jobHouariArrivalAlert,
  'houari-return-alert':     jobHouariReturnAlert,
  'houari-weekly-report':    jobHouariWeeklyReport,
  'document-expiry-alert':   jobDocumentExpiryAlert,
  'maintenance-alert':       jobMaintenanceAlert,
  'smart-alarm':             jobSmartAlarm,
  'monthly-excel':           jobMonthlyExcel,
  'prospect-outreach':       async () => { console.log(`[prospect-auto] ${await runDailyOutreach()}`); },
  'prospect-replies':        async () => { await checkProspectReplies(); },
};

// Les tâches planifiées tournent dans le process (croner) et non plus via BullMQ : le worker BullMQ
// interrogeait Upstash en continu, saturait le quota, et quand Redis est bloqué AUCUN job ne partait
// (plus de briefing, plus de démarchage, plus de notifs). Verrou anti-doublon = Supabase `job_runs`.
const crons: Cron[] = [];

async function runJob(name: string, slot: string): Promise<void> {
  const handler = handlers[name];
  if (!handler) return;
  if (!(await claimJobRun(name, slot).catch(() => true))) {
    console.log(`[scheduler] SKIP (déjà exécuté par une autre instance): ${name}`);
    return;
  }
  console.log(`[scheduler] Running: ${name}`);
  try {
    await handler({ name, id: `${name}:${slot}`, data: {} } as unknown as Job);
    console.log(`[scheduler] ✅ ${name} done`);
  } catch (err) {
    console.error(`[scheduler] ❌ ${name} failed:`, err instanceof Error ? err.message : err);
  }
}

export async function initScheduler(): Promise<void> {
  await ensureAppStoreTables();

  for (const job of JOBS) {
    crons.push(new Cron(job.cron, { timezone: job.tz, protect: true, name: job.name }, (self: Cron) => {
      // Créneau = minute prévue (identique sur toutes les instances)
      const slot = (self.currentRun() ?? new Date()).toISOString().slice(0, 16);
      return runJob(job.name, slot);
    }));
    console.log(`[scheduler] Registered: ${job.name} (${job.cron})`);
  }
  console.log('[scheduler] All proactive jobs registered (cron in-process)');
}

// Manual trigger (for testing/admin)
export async function triggerJob(jobName: string): Promise<boolean> {
  const valid = JOBS.map(j => j.name) as string[];
  if (!valid.includes(jobName)) return false;
  void runJob(jobName, `manual:${new Date().toISOString()}`);
  return true;
}

// One-shot custom-reminder (test) — livré tout de suite dans l'app (Socket.IO + push)
export async function triggerCustomReminder(message: string, idempotencyKey: string): Promise<string> {
  emitProactive(message, 'reminder', `⏰ Rappel\n\n${message}`);
  return `direct:${idempotencyKey}`;
}

// Health snapshot (le scheduler ne dépend plus de Redis)
export async function getSchedulerStatus(): Promise<{
  queue: string;
  repeatable: number;
  jobs: Array<{ name: string; next: string | null; running: boolean }>;
}> {
  return {
    queue:      'in-process (croner)',
    repeatable: crons.length,
    jobs:       crons.map(c => ({ name: c.name ?? '?', next: c.nextRun()?.toISOString() ?? null, running: c.isBusy() })),
  };
}

export { SCHEDULER_QUEUE };
