import type { Job } from 'bullmq';
import { redis } from '../queue/queue.js';
import { supabase, getUserProfile } from '../integrations/supabase.js';
import { listUpcomingEvents } from '../integrations/google-calendar.js';
import { sendMessage } from '../integrations/telegram.js';
import { notifyOwner } from '../notifications/pushover.js';
import { getOranWeather } from '../integrations/web-search.js';
import { env } from '../config/env.js';

export interface TriggerResult {
  trigger: string;
  status:  'SENT' | 'SKIPPED' | 'ERROR';
  reason?: string;
}

type CalEvent = Awaited<ReturnType<typeof listUpcomingEvents>>[number];

// ── Helpers ───────────────────────────────────────────────────────

function ownerChatId(): string {
  return env.TELEGRAM_CHAT_ID ?? '809747124';
}

async function tg(text: string): Promise<void> {
  if (env.TELEGRAM_CHAT_ID) await sendMessage(ownerChatId(), text);
}

// Redis daily lock — returns true if lock acquired (first caller wins)
async function acquireDailyLock(name: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const result = await redis.set(`p12c:${name}:${today}`, '1', 'EX', 86400, 'NX');
  return result === 'OK';
}

// Redis weekly lock — keyed on ISO week Monday
async function acquireWeeklyLock(name: string): Promise<boolean> {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10);
  const result = await redis.set(`p12c:${name}:week:${monday}`, '1', 'EX', 604800, 'NX');
  return result === 'OK';
}

export async function clearAllLocks(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const now   = new Date();
  const day   = now.getDay();
  const diff  = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff).toISOString().slice(0, 10);

  await redis.del(
    `p12c:pre-work:${today}`,
    `p12c:after-work:${today}`,
    `p12c:heat-alert:${today}`,
    `p12c:family-time:${today}`,
    `p12c:unpaid-reminder:${today}`,
    `p12c:late-return:${today}`,
    `p12c:booking-tomorrow:${today}`,
    `p12c:calendar-appt:${today}`,
    `p12c:personal-schedule:${today}`,
    `p12c:tiktok-reminder:week:${monday}`,
  );
}

// Parse "HH:MM" or "HH:MM:SS" → total minutes
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Get {hour, minute, dayOfWeek(0=Sun)} in a timezone
function getLocalTime(tz: string): { hour: number; minute: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour:      parseInt(get('hour'),    10) % 24,
    minute:    parseInt(get('minute'),  10),
    dayOfWeek: dayMap[get('weekday')] ?? 0,
  };
}

// ── Trigger 1: Pre-work commute reminder ─────────────────────────
async function triggerPreWorkReminder(
  workDays: number[], workStart: string, commute: number, tz: string, demo: boolean,
): Promise<TriggerResult> {
  const { hour, minute, dayOfWeek } = getLocalTime(tz);
  if (!demo && !workDays.includes(dayOfWeek)) {
    return { trigger: 'pre-work', status: 'SKIPPED', reason: 'pas un jour de travail' };
  }
  const nowMin    = hour * 60 + minute;
  const departMin = timeToMinutes(workStart) - commute;
  if (!demo && (nowMin < departMin - 15 || nowMin > departMin + 15)) {
    const dH = Math.floor(departMin / 60);
    const dM = String(departMin % 60).padStart(2, '0');
    return { trigger: 'pre-work', status: 'SKIPPED', reason: `fenêtre ${dH}h${dM} ±15min (actuel ${hour}h${String(minute).padStart(2, '0')})` };
  }
  if (!await acquireDailyLock('pre-work')) {
    return { trigger: 'pre-work', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }
  const dH = Math.floor(departMin / 60);
  const dM = String(departMin % 60).padStart(2, '0');
  const p = demo ? '🧪 [DEMO] ' : '';
  await tg(`${p}🚗 *Rappel trajet Bruxelles*\nDépart idéal : *${dH}h${dM}* (trajet ~${commute}min)\nPrise en charge : ${workStart.slice(0, 5)} ✅`);
  return { trigger: 'pre-work', status: 'SENT' };
}

// ── Trigger 2: After-work quick message ──────────────────────────
async function triggerAfterWorkRest(
  workDays: number[], workEnd: string, tz: string, demo: boolean,
): Promise<TriggerResult> {
  const { hour, minute, dayOfWeek } = getLocalTime(tz);
  if (!demo && !workDays.includes(dayOfWeek)) {
    return { trigger: 'after-work', status: 'SKIPPED', reason: 'pas un jour de travail' };
  }
  const nowMin = hour * 60 + minute;
  const endMin = timeToMinutes(workEnd);
  if (!demo && (nowMin < endMin || nowMin > endMin + 30)) {
    return { trigger: 'after-work', status: 'SKIPPED', reason: 'hors fenêtre post-travail (0–30min après work_end)' };
  }
  if (!await acquireDailyLock('after-work')) {
    return { trigger: 'after-work', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }
  const p = demo ? '🧪 [DEMO] ' : '';
  await tg(`${p}✅ *Journée terminée !*\nDzaryx surveille Fik Conciergerie. Repose-toi. 🛡️`);
  return { trigger: 'after-work', status: 'SENT' };
}

// ── Trigger 3: Oran heat alert (>35°C) ───────────────────────────
async function triggerHeatAlert(demo: boolean): Promise<TriggerResult> {
  const { hour } = getLocalTime('Africa/Algiers');
  if (!demo && (hour < 10 || hour > 20)) {
    return { trigger: 'heat-alert', status: 'SKIPPED', reason: 'hors fenêtre 10h–20h Oran' };
  }
  let weather;
  try {
    weather = await getOranWeather();
  } catch {
    return { trigger: 'heat-alert', status: 'SKIPPED', reason: 'météo Oran non disponible' };
  }
  if (!demo && weather.temperature < 35) {
    return { trigger: 'heat-alert', status: 'SKIPPED', reason: `${weather.temperature}°C < 35°C` };
  }
  if (!await acquireDailyLock('heat-alert')) {
    return { trigger: 'heat-alert', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }
  const p = demo ? `🧪 [DEMO ${weather.temperature}°C — prod si >35°C] ` : '';
  await tg([
    `${p}🌡️ *Alerte chaleur Oran : ${weather.temperature}°C* (ressenti ${weather.apparent_temp}°C)`,
    ``,
    `💡 Rappelle aux clients :`,
    `  • Stationnement ombragé obligatoire`,
    `  • Vérifier niveaux avant sorties longues`,
    `  • Prévoir eau + clim en marche`,
  ].join('\n'));
  if (!demo) await notifyOwner(`🌡️ Chaleur Oran ${weather.temperature}°C`, 'Conseille stationnement ombragé', false);
  return { trigger: 'heat-alert', status: 'SENT' };
}

// ── Trigger 4: TikTok weekly reminder ────────────────────────────
async function triggerTikTokReminder(demo: boolean): Promise<TriggerResult> {
  const { hour, dayOfWeek } = getLocalTime('Africa/Algiers');
  if (!demo && dayOfWeek !== 3 && dayOfWeek !== 5) {
    return { trigger: 'tiktok-reminder', status: 'SKIPPED', reason: 'pas mercredi/vendredi' };
  }
  if (!demo && hour < 14) {
    return { trigger: 'tiktok-reminder', status: 'SKIPPED', reason: 'avant 14h Algiers' };
  }
  if (!await acquireWeeklyLock('tiktok-reminder')) {
    return { trigger: 'tiktok-reminder', status: 'SKIPPED', reason: 'déjà rappelé cette semaine' };
  }
  const dayNames: Record<number, string> = { 0: 'dimanche', 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi', 6: 'samedi' };
  const p = demo ? '🧪 [DEMO] ' : '';
  await tg([
    `${p}📱 *Rappel TikTok — ${dayNames[dayOfWeek] ?? 'aujourd\'hui'}*`,
    `Objectif : 2 vidéos minimum cette semaine (Fik Conciergerie)`,
    ``,
    `💡 Dis "génère une idée TikTok" ou déclenche depuis l'app.`,
  ].join('\n'));
  return { trigger: 'tiktok-reminder', status: 'SENT' };
}

// ── Trigger 5: Family time (soir personnalisé) ───────────────────
async function triggerFamilyTime(
  profile: { family_members: unknown; sleep_time: string; wind_down_minutes: number },
  tz: string,
  demo: boolean,
): Promise<TriggerResult> {
  const { hour, dayOfWeek } = getLocalTime(tz);
  // Evenings 19h–22h any day (famille = 7j/7)
  if (!demo && (hour < 19 || hour > 22)) {
    return { trigger: 'family-time', status: 'SKIPPED', reason: 'hors fenêtre 19h–22h' };
  }
  if (!await acquireDailyLock('family-time')) {
    return { trigger: 'family-time', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }

  const members = Array.isArray(profile.family_members) ? profile.family_members as string[] : [];
  const sleepH  = profile.sleep_time.slice(0, 5); // "23:30"
  const windDown = profile.wind_down_minutes;

  const dayNames: Record<number, string> = { 0: 'dimanche', 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi', 6: 'samedi' };
  const p = demo ? '🧪 [DEMO] ' : '';

  const lines = [
    `${p}👨‍👩‍👦 *Soirée famille — ${dayNames[dayOfWeek] ?? ''}*`,
    members.length > 0
      ? `Profite avec ${members.slice(0, 3).join(', ')} 💙`
      : `Profite de ta soirée — tu mérites de te reposer. 💙`,
    ``,
    `🌙 Coucher prévu : ${sleepH} (déconnecte ~${windDown}min avant)`,
    `📵 Dzaryx gère Fik Conciergerie cette nuit. 🛡️`,
  ];

  await tg(lines.join('\n'));
  return { trigger: 'family-time', status: 'SENT' };
}

// ── Trigger 6: Unpaid clients > 7 days ──────────────────────────
async function triggerUnpaidReminder(demo: boolean): Promise<TriggerResult> {
  const { hour } = getLocalTime('Europe/Brussels');
  if (!demo && (hour < 9 || hour > 20)) {
    return { trigger: 'unpaid-reminder', status: 'SKIPPED', reason: 'hors fenêtre 9h–20h' };
  }
  if (!await acquireDailyLock('unpaid-reminder')) {
    return { trigger: 'unpaid-reminder', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, paid_amount, payment_status, start_date, cars(name)')
    .in('payment_status', ['PENDING', 'PARTIAL'])
    .in('status',         ['ACTIVE', 'COMPLETED'])
    .lte('start_date',    cutoffStr)
    .order('start_date',  { ascending: true });

  if (error) {
    return { trigger: 'unpaid-reminder', status: 'ERROR', reason: error.message };
  }

  const overdue = (data ?? []) as unknown as Array<{
    client_name: string; client_phone?: string;
    final_price: number; paid_amount?: number;
    payment_status: string; start_date: string;
    cars?: { name: string };
  }>;

  const withRemaining = overdue.filter(b => (b.final_price ?? 0) - (b.paid_amount ?? 0) > 0);

  if (!withRemaining.length) {
    // Lock already acquired — release it so next day re-checks cleanly
    return { trigger: 'unpaid-reminder', status: 'SKIPPED', reason: 'aucun impayé > 7j' };
  }

  const totalDue  = withRemaining.reduce((s, b) => s + (b.final_price - (b.paid_amount ?? 0)), 0);
  const p = demo ? '🧪 [DEMO] ' : '';
  const lines = [
    `${p}💸 *${withRemaining.length} impayé(s) depuis > 7 jours*`,
    `Total dû : *${totalDue.toLocaleString('fr-FR')}€*`,
    ``,
    ...withRemaining.slice(0, 5).map(b => {
      const rem  = (b.final_price ?? 0) - (b.paid_amount ?? 0);
      const car  = (b.cars as { name: string } | undefined)?.name ?? '?';
      const days = Math.floor((Date.now() - new Date(b.start_date).getTime()) / 86_400_000);
      return `  • *${b.client_name}* — ${car} | ${rem}€ | J+${days}${b.client_phone ? ` | ${b.client_phone}` : ''}`;
    }),
  ];
  if (withRemaining.length > 5) lines.push(`  … et ${withRemaining.length - 5} autre(s)`);

  await tg(lines.join('\n'));
  await notifyOwner(`💸 ${withRemaining.length} impayé(s) >7j`, `${totalDue}€ à encaisser`, false);
  return { trigger: 'unpaid-reminder', status: 'SENT' };
}

// ── Trigger 7: Late vehicle returns ──────────────────────────────
async function triggerLateReturn(demo: boolean): Promise<TriggerResult> {
  const { hour } = getLocalTime('Africa/Algiers');
  // Morning check 8h–13h Oran (before existing 11h cron)
  if (!demo && (hour < 8 || hour > 13)) {
    return { trigger: 'late-return', status: 'SKIPPED', reason: 'hors fenêtre 8h–13h Oran' };
  }
  if (!await acquireDailyLock('late-return')) {
    return { trigger: 'late-return', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, end_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .lt('end_date', today)
    .order('end_date', { ascending: true });

  if (error) {
    return { trigger: 'late-return', status: 'ERROR', reason: error.message };
  }

  const overdue = (data ?? []) as unknown as Array<{
    client_name: string; client_phone?: string; end_date: string;
    cars?: { name: string };
  }>;

  if (!overdue.length) {
    return { trigger: 'late-return', status: 'SKIPPED', reason: 'aucun retard de retour' };
  }

  const p = demo ? '🧪 [DEMO] ' : '';
  const lines = [
    `${p}🚨 *${overdue.length} véhicule(s) en retard de retour*`,
    ``,
    ...overdue.slice(0, 5).map(b => {
      const daysLate = Math.floor((new Date(today).getTime() - new Date(b.end_date).getTime()) / 86_400_000);
      const car = (b.cars as { name: string } | undefined)?.name ?? '?';
      return `  • *${b.client_name}* — ${car} | retard ${daysLate}j${b.client_phone ? ` | ${b.client_phone}` : ''}`;
    }),
  ];

  await tg(lines.join('\n'));
  await notifyOwner(`🚨 ${overdue.length} retard(s) retour`, overdue.map(b => b.client_name).join(', '), true);
  return { trigger: 'late-return', status: 'SENT' };
}

// ── Trigger 8: Bookings tomorrow (J+1) ───────────────────────────
async function triggerBookingTomorrow(demo: boolean): Promise<TriggerResult> {
  const { hour } = getLocalTime('Europe/Brussels');
  // Evening planning 17h–22h
  if (!demo && (hour < 17 || hour > 22)) {
    return { trigger: 'booking-tomorrow', status: 'SKIPPED', reason: 'hors fenêtre 17h–22h' };
  }
  if (!await acquireDailyLock('booking-tomorrow')) {
    return { trigger: 'booking-tomorrow', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tStr = tomorrow.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, start_date, end_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .or(`start_date.eq.${tStr},end_date.eq.${tStr}`)
    .order('start_date', { ascending: true });

  if (error) {
    return { trigger: 'booking-tomorrow', status: 'ERROR', reason: error.message };
  }

  const bookings = (data ?? []) as unknown as Array<{
    client_name: string; client_phone?: string;
    start_date: string; end_date: string;
    cars?: { name: string };
  }>;

  if (!bookings.length) {
    return { trigger: 'booking-tomorrow', status: 'SKIPPED', reason: `aucune location prévue le ${tStr}` };
  }

  const starts  = bookings.filter(b => b.start_date === tStr);
  const returns = bookings.filter(b => b.end_date   === tStr);
  const p = demo ? '🧪 [DEMO] ' : '';
  const lines = [
    `${p}📅 *Programme demain — ${tStr}*`,
    ``,
  ];
  if (starts.length) {
    lines.push(`🚗 *Prises en charge (${starts.length}):*`);
    for (const b of starts) {
      const car = (b.cars as { name: string } | undefined)?.name ?? '?';
      lines.push(`  • ${b.client_name} — ${car}${b.client_phone ? ` | ${b.client_phone}` : ''}`);
    }
    lines.push('');
  }
  if (returns.length) {
    lines.push(`🔑 *Retours prévus (${returns.length}):*`);
    for (const b of returns) {
      const car = (b.cars as { name: string } | undefined)?.name ?? '?';
      lines.push(`  • ${b.client_name} — ${car}${b.client_phone ? ` | ${b.client_phone}` : ''}`);
    }
  }

  await tg(lines.join('\n'));
  return { trigger: 'booking-tomorrow', status: 'SENT' };
}

// ── Trigger 9: Google Calendar appointment reminder ──────────────
async function triggerCalendarAppointment(commute: number, tz: string, demo: boolean): Promise<TriggerResult> {
  const { hour } = getLocalTime(tz);
  // Morning window 7h–10h
  if (!demo && (hour < 7 || hour > 10)) {
    return { trigger: 'calendar-appt', status: 'SKIPPED', reason: 'hors fenêtre 7h–10h' };
  }
  if (!await acquireDailyLock('calendar-appt')) {
    return { trigger: 'calendar-appt', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }

  let events: CalEvent[] = [];
  try {
    events = await listUpcomingEvents(5);
  } catch {
    return { trigger: 'calendar-appt', status: 'SKIPPED', reason: 'Google Calendar non disponible' };
  }

  if (!events.length) {
    return { trigger: 'calendar-appt', status: 'SKIPPED', reason: 'aucun événement Google Calendar' };
  }

  // Only events in the next 24h
  const in24h = new Date(Date.now() + 24 * 3_600_000).toISOString();
  const upcoming = events.filter(e => e.start.dateTime && e.start.dateTime <= in24h);

  if (!upcoming.length) {
    return { trigger: 'calendar-appt', status: 'SKIPPED', reason: `${events.length} événement(s) mais aucun dans 24h` };
  }

  const p = demo ? '🧪 [DEMO] ' : '';
  const lines = [`${p}📆 *Agenda — prochains rendez-vous :*`, ``];

  for (const e of upcoming.slice(0, 3)) {
    const startDt = new Date(e.start.dateTime);
    const timeStr = startDt.toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    const dateStr = startDt.toLocaleDateString('fr-FR', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
    // Departure reminder = event start - commute minutes
    const departMs   = startDt.getTime() - commute * 60_000;
    const departTime = new Date(departMs).toLocaleTimeString('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    lines.push(`  📌 *${e.summary}*`);
    lines.push(`     ${dateStr} à ${timeStr} — départ recommandé : ${departTime}`);
  }

  await tg(lines.join('\n'));
  return { trigger: 'calendar-appt', status: 'SENT' };
}

// ── Trigger 10: Personal schedule morning digest ─────────────────
async function triggerPersonalSchedule(
  profile: { wake_time: string; work_start: string; work_end: string; commute_minutes_avg: number; sleep_time: string },
  workDays: number[],
  tz: string,
  demo: boolean,
): Promise<TriggerResult> {
  const { hour, minute, dayOfWeek } = getLocalTime(tz);
  // Morning 6h30–8h30
  if (!demo && (hour < 6 || (hour === 6 && minute < 30) || hour > 8 || (hour === 8 && minute > 30))) {
    return { trigger: 'personal-schedule', status: 'SKIPPED', reason: 'hors fenêtre 6h30–8h30' };
  }
  if (!await acquireDailyLock('personal-schedule')) {
    return { trigger: 'personal-schedule', status: 'SKIPPED', reason: 'déjà envoyé aujourd\'hui' };
  }

  const isWorkDay = workDays.includes(dayOfWeek);
  const dayNames: Record<number, string> = { 0: 'Dimanche', 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi' };
  const p = demo ? '🧪 [DEMO] ' : '';

  const departMin = timeToMinutes(profile.work_start) - profile.commute_minutes_avg;
  const dH = Math.floor(departMin / 60);
  const dM = String(departMin % 60).padStart(2, '0');

  const lines = [
    `${p}⏰ *Horaire Kouider — ${dayNames[dayOfWeek] ?? ''}*`,
    ``,
    `🌅 Réveil : ${profile.wake_time.slice(0, 5)}`,
  ];

  if (isWorkDay) {
    lines.push(`🚗 Départ trajet : ${dH}h${dM} (${profile.commute_minutes_avg}min)`);
    lines.push(`💼 Travail : ${profile.work_start.slice(0, 5)} — ${profile.work_end.slice(0, 5)}`);
  } else {
    lines.push(`🏖 Jour de repos`);
  }
  lines.push(`🌙 Coucher prévu : ${profile.sleep_time.slice(0, 5)}`);

  await tg(lines.join('\n'));
  return { trigger: 'personal-schedule', status: 'SENT' };
}

// ── Main orchestrator ─────────────────────────────────────────────
export async function runProactiveEngine(
  _job?: Job,
  force = false,
  demo  = false,
): Promise<TriggerResult[]> {
  if (force) {
    await clearAllLocks();
    console.log('[p12c] Force mode — all locks cleared');
  }

  const profile = await getUserProfile().catch(() => null);
  if (!profile) {
    console.log('[p12c] SKIP — user_profile non disponible');
    return [{ trigger: 'all', status: 'SKIPPED', reason: 'user_profile non disponible' }];
  }

  const workDays  = profile.work_days           ?? [1, 2, 3, 4, 5];
  const workStart = profile.work_start          ?? '09:00';
  const workEnd   = profile.work_end            ?? '17:30';
  const commute   = profile.commute_minutes_avg ?? 25;
  const tzWork    = profile.timezone_primary    ?? 'Europe/Brussels';
  const sleepTime = profile.sleep_time          ?? '23:30';
  const wakeTime  = profile.wake_time           ?? '07:00';
  const windDown  = profile.wind_down_minutes   ?? 30;

  const wrap = (name: string, fn: Promise<TriggerResult>) =>
    fn.catch(err => ({ trigger: name, status: 'ERROR' as const, reason: (err as Error).message }));

  const results = await Promise.all([
    wrap('pre-work',          triggerPreWorkReminder(workDays, workStart, commute, tzWork, demo)),
    wrap('after-work',        triggerAfterWorkRest(workDays, workEnd, tzWork, demo)),
    wrap('heat-alert',        triggerHeatAlert(demo)),
    wrap('tiktok-reminder',   triggerTikTokReminder(demo)),
    wrap('family-time',       triggerFamilyTime({ family_members: profile.family_members, sleep_time: sleepTime, wind_down_minutes: windDown }, tzWork, demo)),
    wrap('unpaid-reminder',   triggerUnpaidReminder(demo)),
    wrap('late-return',       triggerLateReturn(demo)),
    wrap('booking-tomorrow',  triggerBookingTomorrow(demo)),
    wrap('calendar-appt',     triggerCalendarAppointment(commute, tzWork, demo)),
    wrap('personal-schedule', triggerPersonalSchedule({ wake_time: wakeTime, work_start: workStart, work_end: workEnd, commute_minutes_avg: commute, sleep_time: sleepTime }, workDays, tzWork, demo)),
  ]);

  for (const r of results) {
    console.log(`[p12c:${r.trigger}] ${r.status}${r.reason ? ` — ${r.reason}` : ''}`);
  }
  return results;
}
