import { getConversationHistory, getActiveRules, getFleet, getBookings } from '../integrations/supabase.js';
import { getOranWeather, formatWeatherForContext, getAlgeriaNews, formatNewsForContext, type WeatherData } from '../integrations/web-search.js';
import { listUpcomingEvents } from '../integrations/google-calendar.js';
import { IBRAHIM } from '../config/constants.js';
import type { Message } from '../integrations/claude-api.js';

// Cache météo 5 minutes
let weatherCache: { data: WeatherData; ts: number } | null = null;
async function getCachedWeather(): Promise<WeatherData | undefined> {
  if (weatherCache && Date.now() - weatherCache.ts < 5 * 60 * 1000) return weatherCache.data;
  const w = await getOranWeather().catch(() => undefined);
  if (w) weatherCache = { data: w, ts: Date.now() };
  return w;
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
  const needsNews = /actualit|news|journal|presse|info/i.test(userMessage);

  const [history, rules, fleet, allBookings, weather, news, calendarEvents] = await Promise.all([
    getConversationHistory(sessionId, 15),
    getActiveRules(),
    getFleet().catch(() => []),
    getBookings({ limit: 30 }).catch(() => []),
    getCachedWeather(),
    needsNews ? getAlgeriaNews(4).catch(() => []) : Promise.resolve([]),
    listUpcomingEvents(15).catch(() => []),
  ]);

  const rulesText = rules.length > 0
    ? `\n\nRÈGLES MÉTIER ACTIVES:\n${rules.map(r => `- [${r.category}] ${r.rule}`).join('\n')}`
    : '';

  const dateInfo = `\n\nDate actuelle: ${new Date().toLocaleDateString('fr-DZ', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })}`;

  // Active rentals: cars currently booked (CONFIRMED or ACTIVE)
  const today = new Date().toISOString().slice(0, 10);
  const activeRentals = allBookings.filter(b =>
    (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
    b.start_date <= today && b.end_date >= today,
  );
  const upcomingRentals = allBookings.filter(b =>
    (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
    b.start_date > today,
  );

  // Build set of car_ids currently occupied
  const occupiedCarIds = new Set(activeRentals.map(b => b.car_id));

  const fleetText = fleet.length > 0
    ? `\n\nFLOTTE (${fleet.length} véhicules):\n${fleet.map(c => {
        const rental = activeRentals.find(b => b.car_id === c.id);
        const busy = occupiedCarIds.has(c.id) || !c.available;
        const status = rental
          ? `EN LOCATION → ${rental.client_name} jusqu'au ${rental.end_date}`
          : c.available ? 'DISPONIBLE' : 'INDISPONIBLE';
        return `- ${c.name} [${c.category}] — ${c.resale_price}€/jour — ${status}`;
      }).join('\n')}`
    : '';

  const pendingBookings = allBookings.filter(b => b.status === 'PENDING');
  const bookingsText = [
    activeRentals.length > 0
      ? `\n\nLOCATIONS EN COURS (${activeRentals.length}):\n${activeRentals.map(b => `- ${b.client_name} (${b.client_phone ?? 'N/A'}) — ${(b as unknown as {cars?: {name?: string}}).cars?.name ?? b.car_id} — du ${b.start_date} au ${b.end_date} — ${b.status}`).join('\n')}`
      : '',
    upcomingRentals.length > 0
      ? `\n\nLOCATIONS À VENIR (${upcomingRentals.length}):\n${upcomingRentals.map(b => `- ${b.client_name} (${b.client_phone ?? 'N/A'}) — ${(b as unknown as {cars?: {name?: string}}).cars?.name ?? b.car_id} — du ${b.start_date} au ${b.end_date}`).join('\n')}`
      : '',
    pendingBookings.length > 0
      ? `\n\nRÉSERVATIONS EN ATTENTE (${pendingBookings.length}):\n${pendingBookings.map(b => `- ${b.client_name} (${b.client_phone ?? 'N/A'}) — ${(b as unknown as {cars?: {name?: string}}).cars?.name ?? b.car_id} — du ${b.start_date} au ${b.end_date}`).join('\n')}`
      : '',
  ].join('');

  const weatherText = weather ? `\n\n${formatWeatherForContext(weather)}` : '';
  const newsText = news && news.length > 0 ? `\n\n${formatNewsForContext(news)}` : '';

  const calendarText = calendarEvents.length > 0
    ? `\n\nAGENDA GOOGLE (${calendarEvents.length} événements à venir):\n${calendarEvents.map(e => {
        const start = e.start.dateTime ? new Date(e.start.dateTime).toLocaleDateString('fr-DZ', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : (e.start as unknown as {date?: string}).date ?? '';
        return `- ${e.summary} → ${start}`;
      }).join('\n')}`
    : '';

  const systemExtra = rulesText + dateInfo + weatherText + fleetText + bookingsText + calendarText + newsText;

  const messages: Message[] = [
    ...history.map(h => ({
      role:    h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ];

  return { messages, systemExtra, sessionId };
}

export function formatIbrahimGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Bonjour, je suis ${IBRAHIM.NAME}, votre assistant ${IBRAHIM.AGENCY}.`;
  if (hour < 18) return `Bon après-midi, je suis ${IBRAHIM.NAME}.`;
  return `Bonsoir, je suis ${IBRAHIM.NAME}, assistant de ${IBRAHIM.AGENCY}.`;
}
