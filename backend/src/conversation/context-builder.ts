import { getConversationHistory, getActiveRules, getFleet, getBookings, supabase } from '../integrations/supabase.js';
import { getOranWeather, formatWeatherForContext, getAlgeriaNews, formatNewsForContext, type WeatherData } from '../integrations/web-search.js';
import { listUpcomingEvents } from '../integrations/google-calendar.js';
import { getFinancialReport } from '../integrations/finance.js';
import { formatPricingTable } from '../config/pricing.js';
import type { Message } from '../integrations/claude-api.js';

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
  const data = await getBookings({ limit: 20 }).catch(() => []);
  bookingsCache = { data, ts: Date.now() };
  return data;
}

export interface ConversationContext {
  messages:    Message[];
  systemExtra: string;
  sessionId:   string;
}

export async function buildContext(
  sessionId: string,
  userMessage: string,
): Promise<ConversationContext> {
  const needsNews     = /actualit|news|journal|presse|info/i.test(userMessage);
  const needsFinance  = /combien|gagn|b[eé]n[eé]fice|revenu|profit|finance|rapport|mois|argent|kouider|houari/i.test(userMessage);
  const needsCalendar = /agenda|calendrier|rendez|event|demain|cette semaine/i.test(userMessage);
  const needsMemory   = /souviens|rappelle|mémoire|mémoris|retiens|n'oublie|remember/i.test(userMessage);

  const now = new Date();

  // Chargement parallèle — seulement ce dont on a besoin
  const [history, rules, fleet, allBookings, weather, news, calendarEvents, financeReport, memories] = await Promise.all([
    // HISTORIQUE: seulement 6 derniers messages (pas 15)
    getConversationHistory(sessionId, 6).catch(() => []),
    getCachedRules(),
    getCachedFleet(),
    getCachedBookings(),
    getCachedWeather(),
    needsNews     ? getAlgeriaNews(4).catch(() => [])                                            : Promise.resolve([]),
    needsCalendar ? listUpcomingEvents(10).catch(() => [])                                       : Promise.resolve([]),
    needsFinance  ? getFinancialReport(now.getFullYear(), now.getMonth() + 1).catch(() => null)  : Promise.resolve(null),
    needsMemory   ? supabase.from('ibrahim_memory').select('content, category').order('created_at', { ascending: false }).limit(20).then((r: any) => r.data ?? []) : Promise.resolve([]),
  ]);

  const rulesText = rules.length > 0
    ? `\n\nRÈGLES MÉTIER ACTIVES:\n${rules.map((r: any) => `- [${r.category}] ${r.rule}`).join('\n')}`
    : '';

  const hour = now.getHours();
  const timeContext = hour < 12
    ? 'PÉRIODE: Matin — ton énergique, propose résumé du jour si pertinent.'
    : hour < 18
    ? 'PÉRIODE: Après-midi — ton normal et professionnel.'
    : 'PÉRIODE: Soir — ton calme, propose résumé journée si Kouider salue.';

  const dateInfo = `\n\nDate: ${new Date().toLocaleDateString('fr-DZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })} | Heure Oran: ${String(hour).padStart(2,'0')}h${String(now.getMinutes()).padStart(2,'0')} | ${timeContext}`;

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
          `- ${b.client_name} (${b.client_phone}) — ${b.car_name} — du ${b.start_date} au ${b.end_date} — ${b.status}`
        ).join('\n')}`
      : '',
    upcomingRentals.length > 0
      ? `\n\nRÉSERVATIONS EN ATTENTE (${upcomingRentals.length + pendingBookings.length}):\n${[...upcomingRentals, ...pendingBookings].map((b: any) =>
          `- ${b.client_name} (${b.client_phone}) — ${b.car_name} — du ${b.start_date} au ${b.end_date}`
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
    ? `\n\nMÉMOIRE IBRAHIM (infos permanentes):\n${(memories as any[]).map((m: any) => `[${m.category}] ${m.content}`).join('\n')}`
    : '';

  const pricingText = `\n\nGRILLE TARIFAIRE (Houari=prix base | Kouider=prix majoré | Bénéfice=K-H):\n${formatPricingTable()}`;

  const systemExtra = [
    dateInfo,
    weatherText,
    fleetText,
    bookingsText,
    calendarText,
    newsText,
    financeText,
    memoriesText,
    rulesText,
    pricingText,
  ].join('');

  // Construire les messages: historique (6 max) + message courant
  const messages: Message[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  return { messages, systemExtra, sessionId };
}
