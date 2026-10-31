import type { Job } from 'bullmq';
import { Cron } from 'croner';
import { ensureAppStoreTables, claimJobRun, kvGet, kvSet, kvDel } from '../integrations/app-store.js';
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
  jobFallbackWatch,
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
import { jobClientSites } from '../integrations/client-sites.js';
import { jobPapaTime, jobPapaWeekly } from '../integrations/papa-time.js';
import { jobFormeReminders, jobFormeWeekly } from '../integrations/forme.js';
import { jobConnectionsWatch } from '../integrations/connections-watch.js';
import { runDailyOutreach, checkProspectReplies, checkProspectVisits, sendWeeklyReport } from '../integrations/prospect-autopilot.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { flushAutoCalls } from '../notifications/auto-call.js';
import { jobDailyRecapCall, jobMailReplyCall, jobRentalEveCall } from './jobs/call-jobs.js';
import { jobCarPapersCall } from '../integrations/car-papers.js';
import { checkTgcallAlive } from '../notifications/tgcall-watch.js';
import { reportIncident } from '../notifications/incident-call.js';
import { jobMissions } from '../integrations/missions.js';
import { jobMeetingPrep } from '../integrations/meeting-prep.js';
import { jobIntentions } from '../integrations/intentions.js';
import { jobGoals } from '../integrations/goals.js';
import { jobBrowserWatch } from '../integrations/browser-relay.js';
import { jobFlightWatch } from '../integrations/air-algerie.js';
import { jobTeamTasks } from '../integrations/team-tasks.js';
import { jobMemoryConsolidation } from '../integrations/memory-consolidation.js';
import { jobPrivacyExpire } from '../integrations/privacy.js';
import { jobBirthdays, jobReviewWhatsapp, jobFlashOffer } from '../notifications/client-care.js';
import { jobDbBackup } from '../integrations/db-backup.js';
import { jobSelfTest } from '../integrations/self-test.js';
import { jobSeasonWatch } from '../integrations/seasons.js';
import { jobBusinessMentor, jobMentorNewsWatch } from '../integrations/business-mentor.js';
import { jobGoldWatch } from '../integrations/gold.js';
import { jobBillingWatch } from '../integrations/billing.js';
import { jobKouiderDossier } from '../integrations/kouider-dossier.js';
import { jobLifeCoachEvening, jobLifeCoachWeekly } from '../integrations/life-coach.js';
import { jobCloudWatch, jobCloudRoutines } from '../integrations/cloud-watch.js';

import { jobMorningRoutine } from '../integrations/morning-routine.js';
import { jobDepartureWatch } from '../integrations/departures.js';
import { jobTripReminders, jobFlightMailImport } from '../integrations/trips.js';
import { jobMailDigest } from '../integrations/mail-digest.js';
import { jobSiteTraffic } from '../integrations/site-traffic.js';

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
    name:  'fallback-watch',
    cron:  '30 9 * * *',        // 9h30 chaque matin — teste vraiment Claude + secours Groq/Gemini/OpenAI
    tz:    'Africa/Algiers',
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
    cron:  '*/10 7-22 * * *',       // toutes les 10 min 7h-22h (30 min = STOP vu par Kouider avant Dzaryx, 25/10) — réponses des prospects + visites du site via le lien des mails
    tz:    'Africa/Algiers',
  },
  {
    name:  'client-sites',
    cron:  '0 9 * * *',             // 9h chaque jour — sites clients : domaines en attente, échéances, retards, pause auto
    tz:    'Africa/Algiers',
  },
  {
    name:  'prospect-weekly',
    cron:  '0 9 * * 1',             // 9h chaque lundi — bilan démarchage (envois, réponses, RDV, ce qui marche)
    tz:    'Africa/Algiers',
  },
  {
    name:  'db-backup',
    cron:  '0 3 * * *',             // 3h — sauvegarde complète de la base → Drive pro (30 jours gardés)
    tz:    'Africa/Algiers',
  },
  {
    name:  'business-mentor',
    cron:  '30 11 * * *',           // 11h30 — l'appel du conseiller business (idée/plan/contact/risque) ; sauté les jours de congé
    tz:    'Europe/Brussels',
  },
  {
    name:  'mentor-news',
    cron:  '0 8,17 * * *',          // 8h + 17h — veille actu : risque/opportunité URGENT → appel, le reste par message
    tz:    'Europe/Brussels',
  },
  {
    name:  'gold-watch',
    cron:  '15 10,15,20 * * 1-5',   // 10h15, 15h15, 20h15 en semaine — cours de l'or : baisse → acheter, bénéfice → revendre (message + appel)
    tz:    'Europe/Brussels',
  },
  {
    name:  'sport-plan',
    cron:  '15 20 * * *',           // 20h15 — coach sportif : clôture du jour (séance faite/ratée) + séances des 7 jours écrites dans l'agenda
    tz:    'Europe/Brussels',
  },
  {
    name:  'digest',
    cron:  '30 12 * * *',           // 12h30 — « le point » : les infos secondaires de la matinée en UN message
    tz:    'Europe/Brussels',
  },
  {
    name:  'digest-evening',
    cron:  '0 19 * * *',            // 19h — le point du soir
    tz:    'Europe/Brussels',
  },
  {
    name:  'dzaryx-weekly',
    cron:  '0 19 * * 0',            // dimanche 19h — « ce que j'ai fait pour toi cette semaine » (Telegram + app)
    tz:    'Europe/Brussels',
  },
  {
    name:  'sport-weekly',
    cron:  '0 20 * * 0',            // dimanche 20h — bilan sport de la semaine + objectif de la semaine suivante
    tz:    'Europe/Brussels',
  },
  {
    name:  'presence-watch',
    cron:  '*/5 5-22 * * *',        // assistant GPS : départ de la maison, salle en avance, travail, retour ; brief du matin 10 min avant le travail
    tz:    'Europe/Brussels',
  },
  {
    name:  'wow-watch',
    cron:  '*/5 6-23 * * *',        // retard prédit à un RDV (GPS + trafic → prévenir / décaler) + parcmètre malin (temps à pied)
    tz:    'Europe/Brussels',
  },
  {
    name:  'day-map',
    cron:  '45 21 * * *',           // carte de la journée (trajet dessiné + km, volant, lieux, pas)
    tz:    'Europe/Brussels',
  },
  {
    name:  'sport-watch',
    cron:  '*/5 4-23 * * *',        // toutes les 5 min — arrivé à la salle → séance sur Telegram ; séance commencée et GPS loin → appel « tu as oublié ? »
    tz:    'Europe/Brussels',
  },
  {
    name:  'life-coach-evening',
    cron:  '30 20 * * *',           // 20h30 — coach : plan de demain (sport, mental, coucher) + « ton moral ? » ; moral bas → appel
    tz:    'Europe/Brussels',
  },
  {
    name:  'grand-coach',
    cron:  '*/15 6-22 * * *',       // GRAND COACH : texte 7h15 + 3 actions, midi, bilan 18h30, revue vendredi, équilibre samedi, anciens clients mardi
    tz:    'Europe/Brussels',
  },
  {
    name:  'argent',
    cron:  '*/15 9-22 * * *',       // COACH ARGENT : « combien aujourd'hui ? » 20h30, stock, bilan dimanche 18h, vrai revenu le 1er, zakat
    tz:    'Europe/Brussels',
  },
  {
    name:  'life-plus',
    cron:  '*/15 5-23 * * *',       // COACH DE VIE+ : votes 21h, revue de vie dimanche 19h, couple, décisions à 30 j, eau, surentraînement, prières, rapport du mois
    tz:    'Europe/Brussels',
  },
  {
    name:  'radars',
    cron:  '0 10 * * *',            // RADARS : amende à payer (7 j, 2 j, jour J) + « tu as reçu le courrier ? » 21 j après un flash
    tz:    'Europe/Brussels',
  },
  {
    name:  'liberte',
    cron:  '*/5 5-23 * * *',        // LIBERTÉ : prises autorisées (boutons), envie → « c'est passé ? », soir 21h15, silence 2 j → appel, bilan dimanche
    tz:    'Europe/Brussels',
  },
  {
    name:  'papa-time',
    cron:  '30 9,18 * * *',         // 9h30 jour off : idée de sortie avec le petit ; 18h30 : rien depuis 2 jours → petit rappel
    tz:    'Europe/Brussels',
  },
  {
    name:  'people-brief',
    cron:  '*/15 8-21 * * *',         // mémoire des gens : RDV dans ~45 min avec une personne connue → sa fiche ; anniversaires du jour
    tz:    'Europe/Brussels',
  },
  {
    name:  'night-list-run',
    cron:  '0 2 * * *',               // liste de nuit : les tâches confiées dans la journée sont faites pendant qu'il dort
    tz:    'Europe/Brussels',
  },
  {
    name:  'night-list-report',
    cron:  '45 6 * * *',              // liste de nuit : résultats au réveil
    tz:    'Europe/Brussels',
  },
  {
    name:  'savings-monthly',
    cron:  '0 10 1 * *',              // 1er du mois — chasseur d'économies sur ses contrats
    tz:    'Europe/Brussels',
  },
  {
    name:  'tutor',
    cron:  '*/15 7-23 * * *',         // prof perso : leçon du jour à son heure
    tz:    'Europe/Brussels',
  },
  {
    name:  'euro-watch',
    cron:  '0 10,17 * * *',           // square €→DA : historique + alerte au plus haut
    tz:    'Europe/Brussels',
  },
  {
    name:  'opportunities',
    cron:  '30 8 * * 1',              // lundi 8h30 — nouvelles opportunités (enchères, appels d'offres, salons)
    tz:    'Europe/Brussels',
  },
  {
    name:  'projects',
    cron:  '15 8 * * *',              // projets en pilote automatique : étape du jour, retard replanifié
    tz:    'Europe/Brussels',
  },
  {
    name:  'vacation-end',
    cron:  '5 * * * *',               // mode vacances terminé → résumé du retour
    tz:    'Europe/Brussels',
  },
  {
    name:  'mood',
    cron:  '30 22 * * *',             // humeur du jour d'après ses messages ; 3 jours de stress → mot doux
    tz:    'Europe/Brussels',
  },
  {
    name:  'habits-learn',
    cron:  '0 21 * * 0',              // dimanche — ses demandes récurrentes (il devine)
    tz:    'Europe/Brussels',
  },
  {
    name:  'habits-run',
    cron:  '*/15 6-22 * * *',         // habitude qui arrive → préparée avant qu'il demande
    tz:    'Europe/Brussels',
  },
  {
    name:  'self-report',
    cron:  '0 10 1 * *',              // 1er du mois — le rapport « qui tu es »
    tz:    'Europe/Brussels',
  },
  {
    name:  'self-improve',
    cron:  '15 0 * * *',              // auto-amélioration : relit ses erreurs du jour (avant l'atelier de code de nuit 0h30)
    tz:    'Europe/Brussels',
  },
  {
    name:  'tools-cleanup',
    cron:  '0 10 1 * *',              // grand ménage : outils toujours chargés jamais utilisés en 30 jours
    tz:    'Europe/Brussels',
  },
  {
    name:  'self-improve-morning',
    cron:  '30 7 * * *',              // auto-amélioration : propositions du matin
    tz:    'Europe/Brussels',
  },
  {
    name:  'bodyguard',
    cron:  '0 9 * * *',               // garde du corps numérique
    tz:    'Europe/Brussels',
  },
  {
    name:  'radar',
    cron:  '10 9 * * *',              // radar de la concurrence à Oran
    tz:    'Europe/Brussels',
  },
  {
    name:  'car-hunter',
    cron:  '30 9 * * 3',              // mercredi — voitures à acheter sous le prix du marché
    tz:    'Europe/Brussels',
  },
  {
    name:  'conscience',
    cron:  '*/10 * * * *',          // LA CONSCIENCE : regarde tout, parle si ça vaut la peine (Jarvis 4)
    tz:    'Europe/Brussels',
  },
  {
    name:  'tomorrow-sim',
    cron:  '0 21 * * *',            // simulation de demain (collisions + plan B)
    tz:    'Europe/Brussels',
  },
  {
    name:  'promises',
    cron:  '15 8-22/2 * * *',       // gardien des promesses
    tz:    'Europe/Brussels',
  },
  {
    name:  'life-gps',
    cron:  '0 19 * * 0',            // dimanche — GPS de vie
    tz:    'Europe/Brussels',
  },
  {
    name:  'plan-b',
    cron:  '0 8,18 * * *',          // plan B des locations des 3 prochains jours
    tz:    'Europe/Brussels',
  },
  {
    name:  'sales-lessons',
    cron:  '30 18 * * 0',           // dimanche — il apprend à mieux vendre
    tz:    'Europe/Brussels',
  },
  {
    name:  'time-bank',
    cron:  '0 20 * * 0',            // dimanche — banque du temps
    tz:    'Europe/Brussels',
  },
  {
    name:  'energy-profile',
    cron:  '0 4 * * 1',             // lundi — profil d'énergie (heures fortes / creux)
    tz:    'Europe/Brussels',
  },
  {
    name:  'factory',
    cron:  '5 * * * *',             // usine à outils : outils maison en ligne
    tz:    'Europe/Brussels',
  },
  {
    name:  'commercial',
    cron:  '0 10 * * *',              // commercial automatique : annonce du jour proposée (publiée après son oui)
    tz:    'Europe/Brussels',
  },
  {
    name:  'night-guard-recap',
    cron:  '*/15 * * * *',          // gardien de nuit : fin de la nuit → récap de ce qu'il a répondu seul (1 fois par nuit)
    tz:    'Europe/Brussels',
  },
  {
    name:  'nego-watch',
    cron:  '*/30 * * * *',          // négociateur : délai de 48 h dépassé → rapport avec les prix obtenus
    tz:    'Europe/Brussels',
  },
  {
    name:  'predictions',
    cron:  '0 9 * * 1',             // lundi 9h — prédictions des 30 prochains jours (manque de voitures, entretien, clients à risque)
    tz:    'Europe/Brussels',
  },
  {
    name:  'connections-watch',
    cron:  '*/15 * * * *',          // WhatsApp, PC cloud, Telegram, Gmail, Agenda : coupure → message tout de suite + rappel toutes les 2 h (8h-22h)
    tz:    'Europe/Brussels',
  },
  {
    name:  'forme-reminders',
    cron:  '*/15 7-22 * * *',       // app FORME : injection Wegovy, pesée, repas, eau, photo de suivi (1 fois/jour chacun)
    tz:    'Europe/Brussels',
  },
  {
    name:  'forme-weekly',
    cron:  '0 19 * * 0',            // dimanche 19h — bilan FORME + semaine de repas suivante composée
    tz:    'Europe/Brussels',
  },
  {
    name:  'papa-weekly',
    cron:  '30 18 * * 0',           // dimanche 18h30 — la semaine du petit (jeux Fennou, moments avec papa)
    tz:    'Europe/Brussels',
  },
  {
    name:  'life-coach-weekly',
    cron:  '0 18 * * 0',            // dimanche 18h — coach : bilan de la semaine au téléphone
    tz:    'Europe/Brussels',
  },
  {
    name:  'kouider-dossier',
    cron:  '30 3 * * *',            // 3h30 — réécrit le portrait de Kouider (mémoire, règles, messages, appels)
    tz:    'Europe/Brussels',
  },
  {
    name:  'client-sites-monthly',
    cron:  '0 10 1 * *',            // le 1er à 10h — bilan du mois précédent envoyé à chaque patron FIK Sites + résumé et idées de vente
    tz:    'Africa/Algiers',
  },
  {
    name:  'billing-watch',
    cron:  '0 10,18 * * *',         // 10h + 18h — « À PAYER » : échéances J-7/J-3/J-1/J0, retards, crédit Claude bas ou coupé
    tz:    'Europe/Brussels',
  },
  {
    name:  'self-test',
    cron:  '45 7 * * *',            // 7h45 — auto-test en lecture seule ; message seulement si problème (+ résumé le lundi)
    tz:    'Africa/Algiers',
  },
  {
    name:  'season-watch',
    cron:  '15 9 * * 2',            // mardi 9h15 (lundi = congé de Kouider) — saisons (diaspora, Aïd, vacances FR/BE) dans ≤ 6 semaines + remplissage réel
    tz:    'Africa/Algiers',
  },
  {
    name:  'cloud-watch',
    cron:  '*/15 * * * *',          // pages surveillées sur le PC cloud (chacune à son rythme, 15 min minimum)
    tz:    'Europe/Brussels',
  },
  {
    name:  'cloud-routines',
    cron:  '*/5 * * * *',           // tâches web programmées (heure de Bruxelles)
    tz:    'Europe/Brussels',
  },
  {
    name:  'monthly-excel',
    cron:  '30 9 1 * *',            // 9h30 le 1er du mois — export Excel comptable auto
    tz:    'Africa/Algiers',
  },
  {
    name:  'visibility-weekly',
    cron:  '0 9 * * 2',             // mardi 9h — pack visibilité FIK Sites : post Google + Instagram de la semaine envoyé aux patrons
    tz:    'Africa/Algiers',
  },
  {
    name:  'flash-offer',
    cron:  '0 10 * * 3',            // mercredi 10h — voitures libres jeudi→samedi : offre flash -10 % prête pour les anciens clients
    tz:    'Africa/Algiers',
  },
  {
    name:  'client-birthdays',
    cron:  '15 9 * * *',            // 9h15 — anniversaires clients (date de naissance des passeports) → message WhatsApp prêt + appel
    tz:    'Africa/Algiers',
  },
  {
    name:  'review-whatsapp',
    cron:  '30 10 * * *',           // 10h30 — demande d'avis WhatsApp prête pour les clients sans email (rendus hier)
    tz:    'Africa/Algiers',
  },
  {
    name:  'tgcall-watch',
    cron:  '*/5 * * * *',           // toutes les 5 min — service d'appels Telegram vivant ? (alerte une fois + « rétabli »)
    tz:    'Africa/Algiers',
  },
  {
    name:  'auto-call-flush',
    cron:  '*/15 * * * *',          // toutes les 15 min — appels auto mis en file (nuit, appels rapprochés)
    tz:    'Africa/Algiers',
  },
  {
    name:  'daily-recap-call',
    cron:  '0 10 * * *',            // 10h (Bruxelles) chaque jour — Dzaryx appelle Kouider pour le récap
    tz:    'Europe/Brussels',
  },
  {
    name:  'rental-eve-call',
    cron:  '0 18 * * *',            // 18h (Bruxelles) — Dzaryx appelle la veille de chaque départ et fin de location
    tz:    'Europe/Brussels',
  },
  {
    name:  'car-papers-call',
    cron:  '30 9 * * *',            // 9h30 (Bruxelles) chaque jour — assurance / CT / vignette : appel 7 j avant et à l'échéance
    tz:    'Europe/Brussels',
  },
  {
    name:  'missions',
    cron:  '*/5 * * * *',           // toutes les 5 min — missions permanentes confiées par Kouider (create_mission)
    tz:    'Europe/Brussels',
  },
  {
    name:  'flight-watch',
    cron:  '3-59/10 * * * *',       // toutes les 10 min — surveillances de prix Air Algérie (air_algerie_search watch_hours)
    tz:    'Europe/Brussels',
  },
  {
    name:  'browser-watch',
    cron:  '*/10 * * * *',          // toutes les 10 min — tâche du navigateur serveur bloquée → libérée + prévenu
    tz:    'Europe/Brussels',
  },
  {
    name:  'morning-routine',
    cron:  '*/2 4-11 * * *',        // toutes les 2 min 4h–11h (Bruxelles) — message du matin + appel si Kouider ne répond pas
    tz:    'Europe/Brussels',
  },
  {
    name:  'departure-watch',
    cron:  '*/5 * * * *',           // toutes les 5 min — heure de départ selon le trafic (salle, travail, RDV avec adresse 4h–23h ; aéroport 24h/24 pour les vols tôt)
    tz:    'Europe/Brussels',
  },
  {
    name:  'trip-reminders',
    cron:  '30 19 * * *',           // 19h30 — check-lists de voyage / clients pas validées ; appel à J-2
    tz:    'Europe/Brussels',
  },
  {
    name:  'site-traffic',
    cron:  '0 21 * * *',            // 21h — visites du site du jour : vrais visiteurs / nous / robots (Telegram + app)
    tz:    'Africa/Algiers',
  },
  {
    name:  'mail-digest',
    cron:  '0 20 * * *',            // 20h — résumé des mails du jour sur Telegram (importants, prospects, sans réponse ≥ 3 j)
    tz:    'Europe/Brussels',
  },
  {
    name:  'flight-mail-import',
    cron:  '*/15 * * * *',          // billets d'avion arrivés dans la boîte pro → agenda + check-list
    tz:    'Europe/Brussels',
  },
  {
    name:  'goals',
    cron:  '0 9 * * *',             // 9h (Bruxelles) — point quotidien sur chaque objectif + actions proposées
    tz:    'Europe/Brussels',
  },
  {
    name:  'team-tasks',
    cron:  '*/15 * * * *',          // toutes les 15 min — rappels des tâches de Houari / alerte si pas confirmé
    tz:    'Europe/Brussels',
  },
  {
    name:  'intentions',
    cron:  '*/5 * * * *',           // toutes les 5 min — rappels déclenchés par un événement (résa, mail pro, WhatsApp)
    tz:    'Europe/Brussels',
  },
  {
    name:  'memory-consolidation',
    cron:  '0 3 * * *',             // 3h (Bruxelles) — ménage des règles apprises (doublons, contradictions)
    tz:    'Europe/Brussels',
  },
  {
    name:  'privacy-expire',
    cron:  '*/10 * * * *',          // toutes les 10 min — fin des modes privés expirés (et effacement)
    tz:    'Europe/Brussels',
  },
  {
    name:  'meeting-prep',
    cron:  '*/10 * * * *',          // toutes les 10 min — fiche + appel ~1 h avant chaque RDV de l'agenda
    tz:    'Europe/Brussels',
  },
  {
    name:  'mail-reply-call',
    cron:  '*/15 * * * *',          // toutes les 15 min — quelqu'un a répondu à un mail de Kouider → appel (la nuit : mis en file pour 8h)
    tz:    'Europe/Brussels',
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
  'fallback-watch':           jobFallbackWatch,
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
  'billing-watch':           jobBillingWatch,
  'client-sites-monthly':    async () => { console.log(`[client-sites-monthly] ${await (await import('../integrations/client-site-stats.js')).jobClientSitesMonthly()}`); },
  'self-test':               async () => { console.log(`[self-test] ${await jobSelfTest()}`); },
  'business-mentor':         async () => { await jobBusinessMentor(); },
  'mentor-news':             jobMentorNewsWatch,
  'gold-watch':              jobGoldWatch,
  'sport-plan':              async () => { await (await import('../integrations/sport-coach.js')).jobSportPlan(); },
  'digest':                  async () => { console.log(`[digest] ${await (await import('../notifications/digest.js')).jobDigest()}`); },
  'digest-evening':          async () => { console.log(`[digest] ${await (await import('../notifications/digest.js')).jobDigest()}`); },
  'dzaryx-weekly':           async () => { await (await import('../integrations/dzaryx-weekly.js')).jobDzaryxWeekly(); },
  'sport-weekly':            async () => { await (await import('../integrations/sport-coach.js')).jobSportWeekly(); },
  'presence-watch':          async () => { await (await import('../integrations/presence.js')).jobPresenceWatch(); },
  'wow-watch':               async () => { await (await import('../integrations/wow.js')).jobWowWatch(); },
  'day-map':                 async () => { await (await import('../integrations/wow.js')).dayMap(true); },
  'sport-watch':             async () => { await (await import('../integrations/sport-coach.js')).jobSportWatch(); await (await import('../integrations/life-coach.js')).ensureCoachDays(); },
  'life-coach-evening':      jobLifeCoachEvening,
  'life-coach-weekly':       jobLifeCoachWeekly,
  'grand-coach':             async () => { await (await import('../integrations/grand-coach.js')).jobGrandCoach(); },
  'argent':                  async () => { await (await import('../integrations/argent-coach.js')).jobArgent(); },
  'life-plus':               async () => { await (await import('../integrations/life-plus.js')).jobLifePlus(); },
  'radars':                  async () => { await (await import('../integrations/speed-cameras.js')).jobRadars(); },
  'liberte':                 async () => { await (await import('../integrations/liberte.js')).jobLiberte(); },
  'papa-time':               async () => { console.log(`[papa-time] ${await jobPapaTime()}`); },
  'papa-weekly':             async () => { await jobPapaWeekly(); },
  'people-brief':             async () => { console.log(`[people-brief] ${await (await import('../integrations/people-memory.js')).jobPeopleBrief()}`); },
  'night-list-run':           async () => { console.log(`[night-list-run] ${await (await import('../integrations/night-list.js')).jobNightListRun()}`); },
  'night-list-report':        async () => { console.log(`[night-list-report] ${await (await import('../integrations/night-list.js')).jobNightListReport()}`); },
  'savings-monthly':          async () => { console.log(`[savings-monthly] ${await (await import('../integrations/life-helpers.js')).jobSavingsMonthly()}`); },
  'tutor':                    async () => { console.log(`[tutor] ${await (await import('../integrations/life-helpers.js')).jobTutor()}`); },
  'euro-watch':               async () => { console.log(`[euro-watch] ${await (await import('../integrations/world-watch.js')).jobEuroWatch()}`); },
  'opportunities':            async () => { console.log(`[opportunities] ${await (await import('../integrations/world-watch.js')).jobOpportunities()}`); },
  'projects':                 async () => { console.log(`[projects] ${await (await import('../integrations/brain-plus.js')).jobProjects()}`); },
  'vacation-end':             async () => { console.log(`[vacation-end] ${await (await import('../integrations/brain-plus.js')).jobVacationEnd()}`); },
  'mood':                     async () => { console.log(`[mood] ${await (await import('../integrations/brain-plus.js')).jobMood()}`); },
  'habits-learn':             async () => { console.log(`[habits-learn] ${await (await import('../integrations/brain-plus.js')).jobHabitsLearn()}`); },
  'habits-run':               async () => { console.log(`[habits-run] ${await (await import('../integrations/brain-plus.js')).jobHabitsRun()}`); },
  'self-report':              async () => { console.log(`[self-report] ${await (await import('../integrations/brain-plus.js')).jobSelfReport()}`); },
  'self-improve':             async () => { console.log(`[self-improve] ${await (await import('../integrations/guardian-ops.js')).jobSelfImprove()}`); },
  'tools-cleanup':            async () => { console.log(`[tools-cleanup] ${await (await import('../integrations/self-dev.js')).jobToolCleanup()}`); },
  'self-improve-morning':     async () => { console.log(`[self-improve-morning] ${await (await import('../integrations/guardian-ops.js')).jobSelfImproveMorning()}`); },
  'bodyguard':                async () => { console.log(`[bodyguard] ${await (await import('../integrations/guardian-ops.js')).jobBodyguard()}`); },
  'radar':                    async () => { console.log(`[radar] ${await (await import('../integrations/market-hunters.js')).jobRadar()}`); },
  'car-hunter':               async () => { console.log(`[car-hunter] ${await (await import('../integrations/market-hunters.js')).jobCarHunter()}`); },
  'conscience':                async () => { console.log(`[conscience] ${await (await import('../integrations/conscience.js')).jobConscience()}`); },
  'tomorrow-sim':              async () => { console.log(`[tomorrow-sim] ${await (await import('../integrations/foresight.js')).jobTomorrowSim()}`); },
  'promises':                  async () => { console.log(`[promises] ${await (await import('../integrations/foresight.js')).jobPromises()}`); },
  'life-gps':                  async () => { console.log(`[life-gps] ${await (await import('../integrations/foresight.js')).jobLifeGps()}`); },
  'plan-b':                    async () => { console.log(`[plan-b] ${await (await import('../integrations/foresight.js')).jobPlanB()}`); },
  'sales-lessons':             async () => { console.log(`[sales-lessons] ${await (await import('../integrations/foresight.js')).jobSalesLessons()}`); },
  'time-bank':                 async () => { console.log(`[time-bank] ${await (await import('../integrations/gps-life.js')).jobTimeBank()}`); },
  'energy-profile':            async () => { console.log(`[energy-profile] ${await (await import('../integrations/conscience.js')).jobEnergyProfile()}`); },
  'factory':                   async () => { console.log(`[factory] ${await (await import('../integrations/jarvis4.js')).jobFactory()}`); },
  'commercial':               async () => { console.log(`[commercial] ${await (await import('../integrations/builders.js')).jobCommercial()}`); },
  'night-guard-recap':       async () => { await (await import('../integrations/night-guard.js')).jobNightGuardRecap(); },
  'nego-watch':              async () => { await (await import('../integrations/negotiator.js')).jobNegoWatch(); },
  'predictions':             async () => { await (await import('../integrations/predictions.js')).jobPredictions(); },
  'connections-watch':       async () => { console.log(`[connections] ${await jobConnectionsWatch()}`); },
  'forme-reminders':         async () => { console.log(`[forme] ${await jobFormeReminders()}`); },
  'forme-weekly':            async () => { await jobFormeWeekly(); },
  'kouider-dossier':         async () => { console.log(`[kouider-dossier] ${await jobKouiderDossier()}`); },
  'season-watch':            async () => { console.log(`[season-watch] ${await jobSeasonWatch()}`); },
  'cloud-watch':             async () => { console.log(`[cloud-watch] ${await jobCloudWatch()}`); },
  'cloud-routines':          async () => { console.log(`[cloud-routines] ${await jobCloudRoutines()}`); },
  'db-backup':               async () => { console.log(`[db-backup] ${await jobDbBackup()}`); },
  'auto-call-flush':         async () => { await flushAutoCalls(); },
  'tgcall-watch':            async () => { await checkTgcallAlive(); },
  'client-birthdays':        async () => { await jobBirthdays(); },
  'flash-offer':             async () => { console.log(`[flash-offer] ${await jobFlashOffer()}`); },
  'visibility-weekly':       async () => { console.log(`[visibility-weekly] ${await (await import('../integrations/site-visibility.js')).jobVisibilityWeekly()}`); },
  'review-whatsapp':         async () => { await jobReviewWhatsapp(); },
  'daily-recap-call':        async () => { await jobDailyRecapCall(); },
  'mail-reply-call':         async () => { await jobMailReplyCall(); },
  'car-papers-call':         async () => { await jobCarPapersCall(); },
  'rental-eve-call':         async () => { await jobRentalEveCall(); },
  'morning-routine':         async () => { await jobMorningRoutine(); },
  'departure-watch':         async () => { await jobDepartureWatch(); },
  'trip-reminders':          async () => { await jobTripReminders(); },
  'flight-mail-import':      async () => { await jobFlightMailImport(); },
  'mail-digest':             async () => { await jobMailDigest(); },
  'site-traffic':            async () => { await jobSiteTraffic(); },
  'missions':                async () => { await jobMissions(); },
  'meeting-prep':            async () => { await jobMeetingPrep(); },
  'intentions':              async () => { await jobIntentions(); },
  'goals':                   async () => { await jobGoals(); },
  'browser-watch':           async () => { await jobBrowserWatch(); },
  'flight-watch':            async () => { await jobFlightWatch(); },
  'team-tasks':              async () => { await jobTeamTasks(); },
  'memory-consolidation':    async () => { await jobMemoryConsolidation(); },
  'privacy-expire':          async () => { await jobPrivacyExpire(); },
  'prospect-outreach':       async () => { console.log(`[prospect-auto] ${await runDailyOutreach()}`); },
  'prospect-replies':        async () => {
    await checkProspectReplies();
    await checkProspectVisits().catch(err => console.error('[prospect-auto] visites:', err instanceof Error ? err.message : err));
  },
  'prospect-weekly':         async () => { await sendWeeklyReport(); },
  'client-sites':            async () => { console.log(`[client-sites] ${await jobClientSites()}`); },
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
    void kvDel(`jobfail:${name}`).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] ❌ ${name} failed:`, msg);
    if (await firstTransientFailure(name, msg)) return;
    // Crédit Claude vide : déjà signalé une fois (alerte « recharge ») → pas d'appel « tâche plantée » par tâche (24/10)
    if (/credit balance|purchase credits/i.test(msg)) return;
    void reportIncident(`job:${name}`, `La tâche automatique « ${name} » a planté.`, `La tâche automatique « ${name} » a échoué :\n${msg.slice(0, 400)}`);
  }
}

// Coupure réseau passagère (ex. « timeout of 15000ms exceeded ») sur une tâche qui repasse dans moins de 2 h :
// pas d'appel au 1er échec, seulement si l'essai suivant échoue aussi.
const TRANSIENT_RE = /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|fetch failed|\b429\b|\b50[234]\b/i;

async function firstTransientFailure(name: string, msg: string): Promise<boolean> {
  if (!TRANSIENT_RE.test(msg)) return false;
  const next = crons.find(c => c.name === name)?.nextRun();
  if (!next || next.getTime() - Date.now() > 2 * 3600_000) return false;
  try {
    if (await kvGet(`jobfail:${name}`)) return false;
    await kvSet(`jobfail:${name}`, '1', 6 * 3600);
    console.warn(`[scheduler] ${name} : échec passager, on attend l'essai suivant avant d'alerter`);
    return true;
  } catch { return false; }
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
