import { getConversationHistory, getActiveRules, getFleet, getBookings, getRecentUserMessages, supabase } from '../integrations/supabase.js';
import { getOranWeather, formatWeatherForContext, getAlgeriaNews, formatNewsForContext, type WeatherData } from '../integrations/web-search.js';
import { listUpcomingEvents } from '../integrations/google-calendar.js';
import { getFinancialReport } from '../integrations/finance.js';
import { formatPricingTable } from '../config/pricing.js';
import type { Message } from '../integrations/claude-api.js';
import { loadCompactionSummary } from './compaction.js';

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
  messages:    Message[];
  systemExtra: string;
  sessionId:   string;
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
const OLD_CONFIRMATION_PATTERNS: RegExp[] = [
  /^compris parfaitement\b/i,
  /^c'est (bien )?noté\b/i,
  /^bien noté\b/i,
  /^noté[^a-z].*règle/i,
  /^d'accord[,!.\s]/i,
  /^je retiens\b/i,
  /^je vais appliquer\b/i,
  /^entendu[,!.\s].*règle/i,
  /^je comprends (et )?(retiens|note)\b/i,
];

function isConfirmationOnlyMessage(msg: Message): boolean {
  if (msg.role !== 'assistant') return false;
  const text = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (text.length > 500) return false; // Long messages contain actual business data — keep them
  return OLD_CONFIRMATION_PATTERNS.some(p => p.test(text));
}

export async function buildContext(
  sessionId: string,
  userMessage: string,
): Promise<ConversationContext> {
  const needsNews     = /actualit|news|journal|presse|info/i.test(userMessage);
  const needsFinance  = /combien|gagn|b[eé]n[eé]fice|revenu|profit|finance|rapport|mois|argent|kouider|houari/i.test(userMessage);
  const needsCalendar = /agenda|calendrier|rendez|event|demain|cette semaine/i.test(userMessage);
  const needsMemory   = true; // always inject memories — both channels (voice app + Telegram) share them

  const now = new Date();

  // Coding: deep history. Action intents: minimal history (3 msgs) to avoid echoing old confirmations. Default: 10.
  const isCodingContext = /code|fichier|github|railway|deploy|typescript|modifier|écrire|programme|lire|debug|erreur|push|commit/i.test(userMessage);
  const historyLimit = isCodingContext ? 20 : isActionIntent(userMessage) ? 3 : 10;

  // Cross-channel: voice app also loads recent Telegram messages and vice-versa
  const crossChannelSessionId = sessionId === 'voice_kouider'
    ? 'telegram_%'
    : sessionId.startsWith('telegram_') ? 'voice_kouider' : null;

  const [history, crossHistory, rules, fleet, allBookings, weather, news, calendarEvents, financeReport, memories, styleMessages, compactionSummary] = await Promise.all([
    getConversationHistory(sessionId, historyLimit).catch(() => []),
    crossChannelSessionId
      ? supabase
          .from('conversations')
          .select('role, content, session_id, created_at')
          .like('session_id', crossChannelSessionId)
          .in('role', ['user', 'assistant'])
          .order('created_at', { ascending: false })
          .limit(8)
          .then((r: any) => (r.data ?? []).reverse(), () => [])
      : Promise.resolve([]),
    getCachedRules(),
    getCachedFleet(),
    getCachedBookings(),
    getCachedWeather(),
    needsNews     ? getAlgeriaNews(4).catch(() => [])                                            : Promise.resolve([]),
    needsCalendar ? listUpcomingEvents(10).catch(() => [])                                       : Promise.resolve([]),
    needsFinance  ? getFinancialReport(now.getFullYear(), now.getMonth() + 1).catch(() => null)  : Promise.resolve(null),
    needsMemory   ? supabase.from('ibrahim_memory').select('content, category').order('created_at', { ascending: false }).limit(20).then((r: any) => r.data ?? []) : Promise.resolve([]),
    getRecentUserMessages(40).catch(() => [] as string[]),
    loadCompactionSummary(sessionId).catch(() => null),
  ]);

  const rulesText = rules.length > 0
    ? `\n\nRÈGLES MÉTIER ACTIVES:\n${rules.map((r: any) => `- [${r.category}] ${r.rule}`).join('\n')}`
    : '';

  // Timezones: Kouider est à Bruxelles (Europe/Brussels), Fik Conciergerie à Oran (Africa/Algiers)
  const fmtBruxelles = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: 'numeric', minute: 'numeric', hour12: false });
  const fmtOran      = new Intl.DateTimeFormat('fr-DZ', { timeZone: 'Africa/Algiers',  hour: 'numeric', minute: 'numeric', hour12: false });
  const fmtDate      = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const hourBruxelles = parseInt(new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: 'numeric', hour12: false }).format(now), 10);

  const timeContext = hourBruxelles < 12
    ? 'PÉRIODE: Matin — ton énergique, propose résumé du jour si pertinent.'
    : hourBruxelles < 18
    ? 'PÉRIODE: Après-midi — ton normal et professionnel.'
    : 'PÉRIODE: Soir — ton calme, propose résumé journée si Kouider salue.';

  const dateInfo = `\n\nKOUIDER EST À BRUXELLES (Belgique) — pas à Oran.\nDate: ${fmtDate.format(now)} | Heure Bruxelles: ${fmtBruxelles.format(now)} | Heure Oran: ${fmtOran.format(now)} | ${timeContext}`;

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

  // Agenda (seulement si demandé)
  const calendarText = calendarEvents.length > 0
    ? `\n\nAGENDA GOOGLE (${calendarEvents.length} événements à venir):\n${calendarEvents.slice(0, 5).map((e: any) =>
        `- ${e.summary} → ${e.start}`
      ).join('\n')}`
    : '';

  const weatherText = weather
    ? `\n\nMÉTÉO ORAN EN CE MOMENT: ${formatWeatherForContext(weather)}`
    : '';

  const newsText = news.length > 0
    ? `\n\nACTUALITÉS ALGÉRIE:\n${formatNewsForContext(news)}`
    : '';

  const financeText = financeReport
    ? `\n\nRAPPORT FINANCIER:\n${JSON.stringify(financeReport, null, 2)}`
    : '';

  const memoriesText = memories.length > 0
    ? `\n\nMÉMOIRE Dzaryx (infos permanentes):\n${(memories as any[]).map((m: any) => `[${m.category}] ${m.content}`).join('\n')}`
    : '';

  const currentChannel = sessionId === 'voice_kouider'
    ? 'App Vocale'
    : sessionId.startsWith('telegram_')
    ? 'Telegram'
    : 'Inconnu';

  const channelInfo = `\n\nCANAL ACTUEL: ${currentChannel}. ${currentChannel === 'Telegram' ? 'Kouider écrit DEPUIS Telegram — ne jamais dire "je t\'envoie sur Telegram", il EST déjà sur Telegram. Envoyer les documents directement dans ce chat.' : 'Kouider parle via App Vocale — utiliser send_telegram_message pour lui envoyer des documents/photos.'}`;

  const crossChannelLabel = sessionId === 'voice_kouider' ? 'TELEGRAM' : 'APP VOCALE';
  const crossChannelText = (crossHistory as any[]).length > 0
    ? `\n\nCONVERSATION RÉCENTE SUR ${crossChannelLabel} (pour mémoire cross-canal):\n${(crossHistory as any[]).map((m: any) => `[${m.role === 'user' ? 'Kouider' : 'Dzaryx'}] ${String(m.content).slice(0, 300)}`).join('\n')}`
    : '';

  // Style mirror — Dzaryx voit comment Kouider écrit et adapte ses réponses
  const styleText = (styleMessages as string[]).length >= 5
    ? `\n\nSTYLE DE KOUIDER (IMPORTANT — adapte ton registre à ces exemples réels):\nKouider parle comme ça:\n${(styleMessages as string[]).slice(-20).map(m => `• ${m}`).join('\n')}\nMiroir son style: longueur phrases, mélange français/darija/arabe, niveau familiarité, ponctuation.`
    : '';

  const pricingText = `\n\nGRILLE TARIFAIRE (Houari=prix base | Kouider=prix majoré | Bénéfice=K-H):\n${formatPricingTable()}`;

  const systemExtra = [
    channelInfo,
    dateInfo,
    weatherText,
    fleetText,
    bookingsText,
    calendarText,
    newsText,
    financeText,
    memoriesText,
    crossChannelText,
    rulesText,
    pricingText,
    styleText,
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

  console.log(`[ctx:${sessionId.slice(0, 20)}] histLimit=${historyLimit} raw=${history.length} filtered=${filteredHistory.length} action=${isActionIntent(userMessage)}`);


  return { messages, systemExtra, sessionId };
}
