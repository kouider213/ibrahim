import { getConversationHistory, getActiveRules, getFleet, getBookings, getRecentUserMessages, getRecentEpisodes, supabase } from '../integrations/supabase.js';
import { getOranWeather, formatWeatherForContext, getAlgeriaNews, formatNewsForContext, type WeatherData } from '../integrations/web-search.js';
import { listUpcomingEvents, listPersonalEvents } from '../integrations/google-calendar.js';
import { getFinancialReport } from '../integrations/finance.js';
import { formatPricingTable } from '../config/pricing.js';
import type { Message } from '../integrations/claude-api.js';
import { loadCompactionSummary } from './compaction.js';
import { detectLanguage } from './language-detector.js';
import { buildMemoryContext, type MemoryContextResult } from './memory-selector.js';
import { detectMood, saveMoodSession, type MoodResult } from '../orchestrator/mood-detector.js';
import { getClientProfile } from '../orchestrator/client-intelligence.js';
import { getClientBrain, getActorBrainContext } from '../integrations/client-brain.js';
import { type OrgMember, DEFAULT_MEMBER } from '../orchestrator/org-resolver.js';
import { getSmartReminders } from '../bi/smart-reminders.js';
import { getLearnedRules, formatRulesForContext } from '../integrations/learned-rules.js';
import { redis } from '../queue/queue.js';

// Cache météo 5 minutes
let weatherCache: { data: WeatherData; ts: number } | null = null;
async function getCachedWeather(): Promise<WeatherData | undefined> {
  if (weatherCache && Date.now() - weatherCache.ts < 5 * 60 * 1000) return weatherCache.data;
  const w = await getOranWeather().catch(() => undefined);
  if (w) weatherCache = { data: w, ts: Date.now() };
  return w;
}

// Cache flotte + réservations + règles 2 minutes
let fleetCache: { data: any[]; ts: number } | null = null;
let bookingsCache: { data: any[]; ts: number } | null = null;
let rulesCache: { data: any[]; ts: number } | null = null;

async function getCachedRules() {
  if (rulesCache && Date.now() - rulesCache.ts < 2 * 60 * 1000) return rulesCache.data;
  const data = await getActiveRules().catch(() => []);
  rulesCache = { data, ts: Date.now() };
  return data;
}

async function getCachedFleet() {
  if (fleetCache && Date.now() - fleetCache.ts < 2 * 60 * 1000) return fleetCache.data;
  const data = await getFleet().catch(() => []);
  fleetCache = { data, ts: Date.now() };
  return data;
}

async function getCachedBookings() {
  if (bookingsCache && Date.now() - bookingsCache.ts < 2 * 60 * 1000) return bookingsCache.data;
  const data = await getBookings({ limit: 50 }).catch(() => []);
  bookingsCache = { data, ts: Date.now() };
  return data;
}

export interface ConversationContext {
  messages:                  Message[];
  systemExtra:               string;
  sessionId:                 string;
  hasInjectedFinancialData:  boolean;
  mood:                      MoodResult | null;
  actor:                     OrgMember;
}

// ── Intent detection: action requests need minimal history (avoids echoing old confirmations) ──
const ACTION_INTENT_PATTERNS: RegExp[] = [
  /résumé (du jour|de la journée|journée)/i,
  /rapport (financier|du mois|de la semaine|annuel|hebdo)/i,
  /disponibilit/i,
  /(fais|crée|génère|lance) (une? )?(vidéo|pub|tiktok|clip)/i,
  /(analyse|lis|ocr) (ce |le |la |un |une )?(passeport|permis|document|contrat)/i,
  /(génère|crée|fais|envoie) (le )?(bon|contrat|pdf) (de réservation |de |pour )/i,
  /météo\b/i,
  /actualit|news\b/i,
  /résumé (de |du )?(week[- ]?end|semaine)/i,
];

function isActionIntent(msg: string): boolean {
  return ACTION_INTENT_PATTERNS.some(p => p.test(msg));
}

// ── Filter old confirmation-only assistant messages from distant history ──
// Note: \b does not work after accented chars (é, è…) in JS — use explicit char class instead.
const OLD_CONFIRMATION_PATTERNS: RegExp[] = [
  /^compris parfaitement\b/i,
  /^c'est (bien )?not[eé]/i,
  /^bien not[eé]/i,
  /^not[eé]\s.*r[eè]gle/i,
  /^d'accord[,!.\s]/i,
  /^je retiens\b/i,
  /^je vais appliquer\b/i,
  /^entendu[,!.\s].*r[eè]gle/i,
  /^je comprends (et )?(retiens|note)\b/i,
];

function isConfirmationOnlyMessage(msg: Message): boolean {
  if (msg.role !== 'assistant') return false;
  const text = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (text.length > 500) return false; // Long messages contain actual business data — keep them
  return OLD_CONFIRMATION_PATTERNS.some(p => p.test(text));
}

export async function buildContext(
  sessionId:   string,
  userMessage: string,
  actor:       OrgMember = DEFAULT_MEMBER,
): Promise<ConversationContext> {
  const needsNews     = /actualit|news|journal|presse|info/i.test(userMessage);
  const needsFinance  = /combien|gagn|b[eé]n[eé]fice|revenu|profit|finance|rapport|mois|argent|kouider|houari|part.*houari|part.*kouider|total|depuis.*janvier|d[eé]but.*ann[eé]e|cette.*ann[eé]e|bilan/i.test(userMessage);
  const needsAnnualFinance = /depuis.*janvier|d[eé]but.*ann[eé]e|cette.*ann[eé]e|bilan.*ann[eé]e|ann[eé]e.*enti[eè]re|rapport.*ann[eé]e|ann[eé]e.*compl[eè]te/i.test(userMessage);
  const needsCalendar = /agenda|calendrier|rendez|event|demain|cette semaine/i.test(userMessage);
  const needsReminders = /rappel|alerte|urgent|priorit|demain|arrivée|retour|passeport|acompte|prépare/i.test(userMessage);

  // Détection client mentionné dans le message — large net pour injecter profil + cerveau
  const clientMentionMatch =
    userMessage.match(/(?:client|résa(?:ervation)?|document|dossier|profil|infos?|préfère|loue|arrive|vient|paye)\s+(?:de\s+|sur\s+|pour\s+)?([A-ZÀ-ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-ÿ][a-zà-ÿ]+)?)/i)
    ?? userMessage.match(/([A-ZÀ-ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-ÿ][a-zà-ÿ]+)?)\s+(?:réserve|loue|veut|demande|arrive|vient|prend|préfère)/i)
    ?? userMessage.match(/(?:c'est qui|c est qui|qui est|profil de?)\s+([A-ZÀ-ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-ÿ][a-zà-ÿ]+)?)/i);
  const mentionedClient = clientMentionMatch?.[1] ?? null;

  const now = new Date();

  // Coding: deep history. Action intents: minimal history (3 msgs) to avoid echoing old confirmations. Default: 10.
  const isCodingContext = /code|fichier|github|railway|deploy|typescript|modifier|écrire|programme|lire|debug|erreur|push|commit/i.test(userMessage);
  const historyLimit = isCodingContext ? 20 : isActionIntent(userMessage) ? 3 : 10;

  // ── Mode urgence ──────────────────────────────────────────────────────────
  const URGENCY_RE = /\burgence\b|ibrahim urgence|mode urgence|priorit[eé] max/i;
  if (URGENCY_RE.test(userMessage)) {
    await redis.set('user:urgency_mode', '1', 'EX', 1800).catch(() => {}); // 30 min TTL
  }
  const inUrgencyMode = (await redis.get('user:urgency_mode').catch(() => null)) === '1';

  // Cross-channel: uniquement les messages récents (< 6h) pour éviter confusion
  const crossChannelSessionId = sessionId === 'voice_kouider'
    ? 'telegram_%'
    : sessionId.startsWith('telegram_') ? 'voice_kouider' : null;

  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

  const needsEpisodes = /histoire|passé|récemment|dernière fois|avant|souvenir|rappelle|episode/i.test(userMessage);

  // Inject reminders: always in morning (before noon Oran time), or when explicitly requested
  const oranHour = parseInt(
    new Intl.DateTimeFormat('fr-DZ', { timeZone: 'Africa/Algiers', hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
  const needsReminderInject = needsReminders || oranHour < 12;

  const isKouider = actor.ownerKey === 'kouider';

  const [history, crossHistory, rules, fleet, allBookings, weather, news, calendarEvents, financeReport, memories, styleMessages, compactionSummary, clientIntel, recentEpisodes, smartReminders, vipClients, learnedRules, clientBrain, actorBrainCtx, personalCalendarEvents] = await Promise.all([
    getConversationHistory(sessionId, historyLimit).catch(() => []),
    crossChannelSessionId
      ? supabase
          .from('conversations')
          .select('role, content, session_id, created_at')
          .like('session_id', crossChannelSessionId)
          .in('role', ['user', 'assistant'])
          .gte('created_at', sixHoursAgo)
          .order('created_at', { ascending: false })
          .limit(4)
          .then((r: any) => (r.data ?? []).reverse(), () => [])
      : Promise.resolve([]),
    getCachedRules(),
    getCachedFleet(),
    getCachedBookings(),
    getCachedWeather(),
    needsNews     ? getAlgeriaNews(4).catch(() => [])                                            : Promise.resolve([]),
    needsCalendar ? listUpcomingEvents(10).catch(() => [])                                       : Promise.resolve([]),
    needsFinance  ? getFinancialReport(now.getFullYear(), needsAnnualFinance ? undefined : now.getMonth() + 1).catch(() => null)  : Promise.resolve(null),
    buildMemoryContext(userMessage, 300, actor.ownerKey === 'houari' ? 'houari' : 'kouider'),
    getRecentUserMessages(40).catch(() => [] as string[]),
    loadCompactionSummary(sessionId).catch(() => null),
    mentionedClient ? getClientProfile(mentionedClient, actor.ownerKey).catch(() => null) : Promise.resolve(null),
    needsEpisodes
      ? getRecentEpisodes({ min_importance: 3, limit: 5 }).catch(() => [])
      : Promise.resolve([]),
    needsReminderInject
      ? getSmartReminders().catch(() => [])
      : Promise.resolve([]),
    supabase
      .from('client_intelligence')
      .select('client_name, score, total_bookings, total_spent')
      .eq('owner_id', actor.ownerKey)
      .eq('score', 'VIP')
      .order('total_spent', { ascending: false })
      .limit(10)
      .then((r: any) => r.data ?? [], () => []),
    getLearnedRules(actor.ownerKey, 40).catch(() => []),
    mentionedClient ? getClientBrain(mentionedClient, actor.ownerKey).catch(() => null) : Promise.resolve(null),
    getActorBrainContext(actor.ownerKey).catch(() => ''),
    isKouider ? listPersonalEvents(10).catch(() => []) : Promise.resolve([]),
  ]);

  // Détection humeur (synchrone, rapide)
  const hourBruxelles = parseInt(
    new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: 'numeric', hour12: false }).format(now),
    10,
  );
  const mood = detectMood(userMessage, hourBruxelles, actor.displayName);
  // Sauvegarder en background (non-bloquant)
  if (mood.mood !== 'normal') {
    saveMoodSession(sessionId, mood, userMessage).catch(() => {});
  }

  const rulesText = rules.length > 0
    ? `\n\nRÈGLES MÉTIER ACTIVES:\n${rules.map((r: any) => `- [${r.category}] ${r.rule}`).join('\n')}`
    : '';

  const learnedRulesFormatted = formatRulesForContext(learnedRules as any[]);
  const learnedRulesText = learnedRulesFormatted
    ? `\n\nRÈGLES APPRISES (${actor.displayName}):\n${learnedRulesFormatted}`
    : '';

  // Timezones: Kouider est à Bruxelles (Europe/Brussels), Fik Conciergerie à Oran (Africa/Algiers)
  const fmtBruxelles = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: 'numeric', minute: 'numeric', hour12: false });
  const fmtOran      = new Intl.DateTimeFormat('fr-DZ', { timeZone: 'Africa/Algiers',  hour: 'numeric', minute: 'numeric', hour12: false });
  const fmtDate      = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const timeContext = hourBruxelles < 12
    ? 'PÉRIODE: Matin — ton énergique, propose résumé du jour si pertinent.'
    : hourBruxelles < 18
    ? 'PÉRIODE: Après-midi — ton normal et professionnel.'
    : `PÉRIODE: Soir — ton calme, propose résumé journée si ${actor.displayName} salue.`;

  const actorRoleLabel = actor.role === 'owner' ? 'PDG' : actor.role === 'admin' ? 'Associé/Admin' : 'Membre';
  const dateInfo = `\n\nUTILISATEUR: ${actor.displayName} (${actorRoleLabel} — Fik Conciergerie)\nDate: ${fmtDate.format(now)} | Heure Bruxelles: ${fmtBruxelles.format(now)} | Heure Oran: ${fmtOran.format(now)} | ${timeContext}`;

  // Active rentals
  const today = new Date().toISOString().slice(0, 10);
  const activeRentals = allBookings.filter((b: any) =>
    (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
    b.start_date <= today && b.end_date >= today,
  );
  const upcomingRentals = allBookings.filter((b: any) =>
    (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
    b.start_date > today,
  );

  const fleetText = fleet.length > 0
    ? `\n\nFLOTTE (${fleet.length} véhicules):\n${fleet.map((c: any) => {
        const rental = activeRentals.find((b: any) => b.car_id === c.id);
        const status = rental
          ? `EN LOCATION → ${rental.client_name} jusqu'au ${rental.end_date}`
          : c.available ? 'DISPONIBLE' : 'INDISPONIBLE';
        return `- ${c.name} [${c.category}] — ${c.resale_price}€/jour — ${status}`;
      }).join('\n')}`
    : '';

  const pendingBookings = allBookings.filter((b: any) => b.status === 'PENDING');
  const bookingsText = [
    activeRentals.length > 0
      ? `\n\nLOCATIONS EN COURS (${activeRentals.length}):\n${activeRentals.map((b: any) =>
          `- ${b.client_name} (${b.client_phone}) — ${b.cars?.name ?? b.car_id} — du ${b.start_date} au ${b.end_date} — ${b.status}`
        ).join('\n')}`
      : '',
    upcomingRentals.length > 0
      ? `\n\nRÉSERVATIONS EN ATTENTE (${upcomingRentals.length + pendingBookings.length}):\n${[...upcomingRentals, ...pendingBookings].map((b: any) =>
          `- ${b.client_name} (${b.client_phone}) — ${b.cars?.name ?? b.car_id} — du ${b.start_date} au ${b.end_date}`
        ).join('\n')}`
      : '',
  ].join('');

  // Agenda Fik Conciergerie (seulement si demandé)
  const calendarText = calendarEvents.length > 0
    ? `\n\nAGENDA FIK CONCIERGERIE (${calendarEvents.length} événements):\n${calendarEvents.slice(0, 5).map((e: any) =>
        `- ${e.summary} → ${e.start?.dateTime?.slice(0, 16).replace('T', ' ') ?? e.start?.date ?? '?'}`
      ).join('\n')}`
    : '';

  // Agenda perso Kouider (kouiderpablo@gmail.com) — Kouider uniquement
  const personalCalendarText = (personalCalendarEvents as any[]).length > 0
    ? `\n\nAGENDA PERSO KOUIDER (${(personalCalendarEvents as any[]).length} événements privés):\n${(personalCalendarEvents as any[]).slice(0, 7).map((e: any) =>
        `- ${e.summary} → ${e.start?.dateTime?.slice(0, 16).replace('T', ' ') ?? e.start?.date ?? '?'}`
      ).join('\n')}`
    : '';

  const weatherText = weather
    ? `\n\nMÉTÉO ORAN EN CE MOMENT: ${formatWeatherForContext(weather)}`
    : '';

  const newsText = news.length > 0
    ? `\n\nACTUALITÉS ALGÉRIE:\n${formatNewsForContext(news)}`
    : '';

  const financeText = financeReport
    ? actor.ownerKey === 'houari'
      ? `\n\nRAPPORT FINANCIER HOUARI (${needsAnnualFinance ? 'ANNÉE ENTIÈRE' : 'MOIS EN COURS'} — ${financeReport.period}):
IMPORTANT: Houari = propriétaire des voitures. Son revenu = son prix fixe (owner_price_per_day) × nb_jours. Pour ses réservations directes (rented_by=Houari), son revenu = ce que son client lui paie. PAS le même calcul que Kouider.
REVENU NET HOUARI: ${financeReport.houariRevenue}€
  → Resas gérées par Kouider (ta part): ${financeReport.ownerTotal}€
  → Resas gérées directement par toi: ${financeReport.houariBookings} résa
Réservations ce mois: ${financeReport.totalBookings} total
DÉTAIL (vue Houari):
${financeReport.bookings.map((b: any) => {
  const isHouariDirect = b.rented_by === 'Houari';
  const revenue = b.owner_total != null ? `${b.owner_total}€` : isHouariDirect ? `${b.final_price ?? '?'}€ (direct)` : '❓';
  return `- ${b.client_name} | ${b.car_name} | ${b.nb_days}j | Ton prix: ${b.owner_price_per_day ?? b.client_price_per_day ?? '?'}€/j | Ton revenu: ${revenue}`;
}).join('\n')}`
      : `\n\nRAPPORT FINANCIER KOUIDER (${needsAnnualFinance ? 'ANNÉE ENTIÈRE' : 'MOIS EN COURS'} — ${financeReport.period}):
IMPORTANT: Kouider fixe son propre prix client (client_price_per_day). Il paie Houari (owner_price_per_day). Son bénéfice = différence × nb jours. Houari a son propre revenu séparé (owner_price × jours).
Total: ${financeReport.totalBookings} réservations (Kouider: ${financeReport.kouiderBookings} | Houari direct: ${financeReport.houariBookings})
CA BRUT (prix réels clients): ${financeReport.grossCA}€
COÛT HOUARI (owner_price × nb_jours): ${financeReport.ownerTotal}€
BÉNÉFICE NET KOUIDER: ${financeReport.kouiderProfit}€
${financeReport.missingOwnerPrice > 0 ? `⚠️ ${financeReport.missingOwnerPrice} résa sans owner_price_per_day → bénéfice partiel` : ''}
DÉTAIL:
${financeReport.bookings.map((b: any) => `- ${b.client_name} | ${b.car_name} | ${b.nb_days}j | client: ${b.client_price_per_day ?? '?'}€/j — Houari: ${b.owner_price_per_day ?? '?'}€/j | Total client: ${b.final_price ?? '?'}€ | Bénéfice Kouider: ${b.kouider_profit != null ? `${b.kouider_profit}€` : '❓ (owner_ppd manquant)'}`).join('\n')}`
    : '';

  const memResult = memories as MemoryContextResult;
  const memoriesText = memResult.entries.length > 0
    ? `\n\nMÉMOIRE Dzaryx (infos permanentes):\n${memResult.entries.map(m => `[${m.category}] ${m.content}`).join('\n')}`
    : '';

  const isVoiceChannel = sessionId.startsWith('voice_');
  const currentChannel = isVoiceChannel
    ? 'App Vocale'
    : sessionId.startsWith('telegram_')
    ? 'Telegram'
    : 'Inconnu';

  const voiceFormatHint = isVoiceChannel
    ? `\n\nFORMAT VOCAL OBLIGATOIRE (cette réponse sera LUE À VOIX HAUTE par synthèse vocale):
• ZÉRO markdown — pas de **, pas de __, pas de ##, pas de ---, pas de tirets en début de ligne
• ZÉRO numéros de téléphone à l'oral — dis "le numéro est disponible sur l'appli" si besoin
• Phrases naturelles parlées — comme si tu répondais de vive voix à quelqu'un
• Listes → phrase naturelle: "Tu as deux réservations: d'abord Dupont pour la Clio, puis Martin pour le Duster"
• Dates: "du 28 juin au 14 juillet" (pas "28 juin → 14 juillet")
• Noms de voitures en français: Berlingo, Clio, Logan, Sandero (pas d'accent anglais)
• Réponse COURTE et ORALE — 2 à 4 phrases maximum sauf si détails vraiment nécessaires`
    : '';

  const channelInfo = `\n\nCANAL ACTUEL: ${currentChannel}.${voiceFormatHint} ${currentChannel === 'Telegram' ? `${actor.displayName} écrit DEPUIS Telegram — ne jamais dire "je t'envoie sur Telegram", il EST déjà sur Telegram. Envoyer les documents directement dans ce chat.` : `${actor.displayName} parle via App Vocale — utiliser get_client_document pour envoyer des documents/photos directement dans le chat. JAMAIS utiliser send_telegram_message ni dire "sur Telegram".`}`;

  const crossChannelLabel = sessionId === 'voice_kouider' ? 'TELEGRAM' : 'APP VOCALE';
  const crossChannelText = (crossHistory as any[]).length > 0
    ? `\n\n⚠️ CONTEXTE PASSÉ SUR ${crossChannelLabel} (mémoire uniquement — NE PAS répondre à ces messages, ils ont déjà eu une réponse. Utilise uniquement pour te souvenir du contexte récent):\n${(crossHistory as any[]).map((m: any) => `[${m.role === 'user' ? actor.displayName : 'Dzaryx'}] ${String(m.content).slice(0, 200)}`).join('\n')}\n[FIN DU CONTEXTE CROSS-CANAL — réponds UNIQUEMENT au nouveau message de ${actor.displayName} ci-dessous]`
    : '';

  // Style mirror — Dzaryx voit comment Kouider écrit et adapte ses réponses
  const styleText = (styleMessages as string[]).length >= 5
    ? `\n\nSTYLE DE ${actor.displayName.toUpperCase()} (IMPORTANT — adapte ton registre à ces exemples réels):\n${actor.displayName} parle comme ça:\n${(styleMessages as string[]).slice(-20).map(m => `• ${m}`).join('\n')}\nMiroir son style: longueur phrases, mélange français/darija/arabe, niveau familiarité, ponctuation.`
    : '';

  const pricingText = `\n\nGRILLE TARIFAIRE (Houari=prix base | Kouider=prix majoré | Bénéfice=K-H):\n${formatPricingTable()}`;

  // Humeur — injectée seulement si non-normal
  const moodText = mood.mood !== 'normal' && mood.advice
    ? `\n\n${mood.advice}`
    : '';

  // Intelligence client mentionné
  const clientIntelText = clientIntel?.context
    ? `\n\n${clientIntel.context}`
    : '';

  // Cerveau enrichi du client (insights IA + arrivée + notes)
  const brainCtx = (clientBrain as { found: boolean; context: string } | null);
  const clientBrainText = brainCtx?.found && brainCtx.context && brainCtx.context !== clientIntelText.trim()
    ? `\n\n${brainCtx.context}`
    : '';

  // Cerveau acteur (patterns communication Kouider/Houari appris)
  const actorBrainText = (actorBrainCtx as string) || '';

  // Smart reminders (matin ou si demandé explicitement)
  const remindersArr = smartReminders as Array<{ type: string; priority: string; client_name: string; car_name: string; date: string; message: string; action: string }>;
  const highReminders = remindersArr.filter(r => r.priority === 'HIGH');
  const remindersText = highReminders.length > 0
    ? `\n\n🔔 RAPPELS URGENTS (${highReminders.length} actions HIGH priority):\n${highReminders.map(r => `⚠️ ${r.message}\n   → Action: ${r.action}`).join('\n')}`
    : '';

  // Épisodes mémoire récents (seulement si demandés)
  const episodesText = (recentEpisodes as Array<{ episode_type: string; summary: string; occurred_at: string; importance: number }>).length > 0
    ? `\n\nÉVÉNEMENTS RÉCENTS IMPORTANTS:\n${(recentEpisodes as Array<{ episode_type: string; summary: string; occurred_at: string; importance: number }>).map(e => {
        const age = Math.round((Date.now() - new Date(e.occurred_at).getTime()) / 3_600_000);
        const ageStr = age < 24 ? `il y a ${age}h` : `il y a ${Math.round(age / 24)}j`;
        return `[${e.episode_type}] ${ageStr} — ${e.summary.slice(0, 120)}`;
      }).join('\n')}`
    : '';

  // Build VIP client list per actor
  const vipList = (vipClients as any[]).length > 0
    ? `\nCLIENTS VIP:\n${(vipClients as any[]).map((c: any) => `• ${c.client_name} (${c.total_bookings} locations, ${c.total_spent}€)`).join('\n')}`
    : '\n(Aucun client VIP enregistré pour le moment)';

  const isHouari = actor.ownerKey === 'houari';
  const actorPersonaText = isHouari
    ? `\n\nIDENTITÉ DZARYX — HOUARI:\nTu es le Dzaryx personnel de HOUARI — grand patron du DOUBA GROUPE.\nPROFIL HOUARI:\n• PDG / Grand patron — Douba Groupe (Oran, Algérie)\n• Secteurs: immobilier + location de voiture\n• Basé physiquement à ORAN, quartier HAY BADR (Cité Badr) — il gère les opérations terrain en direct\n• Coordonnées bureau: Hay Badr, Oran (Maps: 0xd7e89959facae1d:0x4be5a279c4105451)\n• Associé avec Kouider pour la partie location voiture (Fik Conciergerie)\nLANGUE OBLIGATOIRE — DIALECTE ORANAIS ALGÉRIEN:\nTu parles EXCLUSIVEMENT le darija ORANAIS — le dialecte de la ville d'Oran (غران), nord-ouest Algérie.\nDIFFÉRENCES CRITIQUES à respecter:\n• ORANAIS utilise: "واش" (wesh), "كيفاش" (kifach), "راك" (rak), "بزاف" (bzaf), "خويا" (khoya), "صاحبي" (sahbi), "لاباس" (labas), "ماشي" (machi = non), "هاكا" (haka = comme ça), "شحال" (chhal = combien), "فين" (fin = où), "علاش" (alach = pourquoi), "درك" (derk = maintenant), "يصح" (yesah = ok/vrai), "نتا/نتي" (nta/nti), "روح" (roh = vas-y), "قداش" (gdach = combien ça coûte)\n• NE JAMAIS utiliser vocabulaire MAROCAIN: "ماشي كذا" (marocain), "غادي" (marocain = "je vais"), "دابا" (marocain = maintenant), "كتيبان" — ces mots ne sont PAS oranais\n• NE PAS utiliser "خاصك" (marocain) → utiliser "لازمك" (oranais)\n• Mélange naturel français/darija oranais comme un vrai habitant d'Oran le ferait\n• Expressions oranaises typiques: "يزي" (yezi = ça suffit/ok), "ماهو" (mahu), "وقيلة" (wgila = tellement), "طاح في رأسي" (ça m'est venu en tête), "حبس" (hbes = arrête)\nFOCUS: priorité aux infos et réservations de Houari (rented_by="Houari"). Tu connais aussi les infos de Kouider et la vision globale Douba Groupe.\nRENTED_BY PAR DÉFAUT: quand Houari crée une réservation → rented_by="Houari" automatiquement.\nIMPORTANT: Houari est le PATRON. Traite-le avec respect — patron niveau PDG, pas simple employé. Connais ses deux activités (immo + location).\n${vipList}`
    : `\n\nIDENTITÉ DZARYX — KOUIDER:\nTu es le Dzaryx personnel de Kouider (PDG Fik Conciergerie Oran).\nLANGUE PAR DÉFAUT: Français. Réponds TOUJOURS en français sauf si Kouider écrit dans une autre langue.\nLOCALISATION: Kouider vit à BRUXELLES (Belgique) — il ne peut pas aller à Oran en personne. C'est l'employé sur place qui gère les opérations terrain.\nFOCUS: priorité aux infos et réservations de Kouider (rented_by="Kouider"). Tu connais aussi les infos de Houari.\nRENTED_BY PAR DÉFAUT: quand Kouider crée une réservation → rented_by="Kouider" automatiquement.\nAGENDA KOUIDER (heures Bruxelles):\n| Jour | Travail Belgique | Business Algérie | Famille |\n|------|-----------------|-----------------|----------|\n| Lun | Congé | 14h–18h | Matin+soir |\n| Mar–Ven–Sam | 12h–20h | 9h–11h30 | Après 20h |\n| Mer | 13h–20h | 10h–12h30 | Après 20h |\n| Jeu | 6h30–13h | 13h30–18h | Après 18h |\n| Dim | 10h–18h | 18h30–20h | Matin+soir |\nBusiness Algérie et famille PASSENT AVANT le travail Belgique — toujours envoyer sans restriction.\n${vipList}`;

  let langDetection = detectLanguage(userMessage);
  // Actor preferred language override
  if (actor.ownerKey === 'houari') {
    // Houari = darija by default unless clearly French or English
    if (langDetection.lang !== 'fr' && langDetection.lang !== 'en') {
      langDetection = {
        lang:       'darija',
        label:      'Darija oranaise (défaut Houari)',
        systemHint: 'LANGUE: darija ORANAISE — dialecte d\'Oran (غران), nord-ouest Algérie. PAS le marocain. Mots-clés oranais: wesh واش, kifach كيفاش, rak راك, bzaf بزاف, khoya خويا, labas لاباس, machi ماشي, haka هاكا, chhal شحال, derk درك, yezi يزي, yesah يصح. JAMAIS: ghadi غادي, daba دابا, khassek خاصك (marocain). Mélange naturel oranais/français.',
      };
    }
  } else if (actor.ownerKey === 'kouider') {
    // Kouider = French by default unless clearly another language
    if (langDetection.lang === 'unknown' || userMessage.trim().length < 6) {
      langDetection = {
        lang:       'fr',
        label:      'Français (défaut Kouider)',
        systemHint: 'LANGUE: français — réponds en français.',
      };
    }
  }
  const langHint = `\n\n${langDetection.systemHint}`;
  console.log(`[lang:${sessionId.slice(0, 20)}] detected=${langDetection.lang} label="${langDetection.label}" mood=${mood.mood}(${mood.intensity}) actor=${actor.ownerKey}`);

  const urgencyText = inUrgencyMode
    ? '\n\n🚨 MODE URGENCE ACTIVÉ — Réponses ultra-courtes et directes uniquement. Priorité maximum. Actions immédiates sans demander confirmation. Notifications maximales. Pas d\'explication inutile — seulement ce qui est essentiel.'
    : '';

  // Tolérance fautes — toujours active
  const toleranceHint = `\n\nCOMPRÉHENSION INTELLIGENTE (OBLIGATOIRE):
• Si le message est mal orthographié, abrégé ou phonétique → déduis l'intention, ne signale JAMAIS les fautes
• Si transcription vocale imparfaite (accent algérien, mots coupés) → comprends le sens global
• Français algérien / francoalgérien / darija mélangée → traite naturellement, pas de correction
• Messages courts ("oui", "go", "nan", "sah") → déduis du contexte conversationnel
• JAMAIS dire "je n'ai pas compris" si l'intention est devinable — fais de ton mieux`;

  const systemExtra = [
    actorPersonaText,
    toleranceHint,
    urgencyText,
    langHint,
    channelInfo,
    dateInfo,
    moodText,
    weatherText,
    fleetText,
    bookingsText,
    calendarText,
    personalCalendarText,
    newsText,
    financeText,
    memoriesText,
    crossChannelText,
    rulesText,
    pricingText,
    styleText,
    clientIntelText,
    clientBrainText,
    actorBrainText,
    episodesText,
    remindersText,
    learnedRulesText,
  ].join('');

  // Filter old confirmation-only messages from non-recent history to prevent context contamination.
  // Always keep the last 3 messages intact (immediate context); strip confirmation-only assistant
  // messages from older history so Claude doesn't echo them in new unrelated responses.
  const KEEP_RECENT = 3;
  const recentHistory = history.slice(-KEEP_RECENT);
  const olderHistory  = history
    .slice(0, Math.max(0, history.length - KEEP_RECENT))
    .filter((m: Message) => !isConfirmationOnlyMessage(m));
  const filteredHistory = [...olderHistory, ...recentHistory];

  // Construire les messages: résumé compaction (si dispo) + historique filtré + message courant
  const compactionMessage: Message[] = compactionSummary
    ? [{ role: 'user', content: compactionSummary }, { role: 'assistant', content: 'Compris, je me souviens de ce contexte.' }]
    : [];

  const messages: Message[] = [
    ...compactionMessage,
    ...filteredHistory,
    { role: 'user', content: userMessage },
  ];

  const systemExtraTokenEst = Math.round(systemExtra.length / 4);
  console.log(
    `[ctx:${sessionId.slice(0, 20)}] histLimit=${historyLimit} raw=${history.length} filtered=${filteredHistory.length} action=${isActionIntent(userMessage)} | systemExtra~${systemExtraTokenEst}tok | memory: source=${memResult.source} total=${memResult.totalFacts} selected=${memResult.selectedFacts} ~${memResult.tokenEstimate}tok`,
  );

  // SaaS tenants: override system prompt with their sector config
  if (actor.systemPromptOverride) {
    const saasExtra = [
      actor.systemPromptOverride,
      `\nCOMPRÉHENSION: Si message mal orthographié → déduis l'intention. JAMAIS signaler les fautes.`,
      `\nDATE: ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
    ].join('\n');
    return { messages, systemExtra: saasExtra, sessionId, hasInjectedFinancialData: false, mood, actor };
  }

  return { messages, systemExtra, sessionId, hasInjectedFinancialData: financeReport != null, mood, actor };
}
