import type { Job } from 'bullmq';
import { supabase } from '../../integrations/supabase.js';
import { notifyOwner } from '../../notifications/pushover.js';
import { sendMessage } from '../../integrations/telegram.js';
import { getFinancialReport } from '../../integrations/finance.js';
import { listUpcomingEvents } from '../../integrations/google-calendar.js';
import { getOranWeather } from '../../integrations/web-search.js';

function ownerChatId(): string {
  return process.env['TELEGRAM_CHAT_ID'] ?? '809747124';
}

async function tg(text: string): Promise<void> {
  await sendMessage(ownerChatId(), text);
}

// ── 0. Réveil matinal 7h30 ────────────────────────────────────
export async function jobMorningBriefing(_job: Job): Promise<void> {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const [
    activeBookings,
    returningToday,
    returningTomorrow,
    upcomingBookings,
    weather,
    calendarEvents,
    financeThisMonth,
  ] = await Promise.all([
    supabase.from('bookings').select('*, cars(name)')
      .in('status', ['CONFIRMED', 'ACTIVE'])
      .lte('start_date', today).gte('end_date', today),
    supabase.from('bookings').select('*, cars(name)')
      .in('status', ['CONFIRMED', 'ACTIVE'])
      .eq('end_date', today),
    supabase.from('bookings').select('*, cars(name)')
      .in('status', ['CONFIRMED', 'ACTIVE'])
      .eq('end_date', tomorrowStr),
    supabase.from('bookings').select('*, cars(name)')
      .in('status', ['CONFIRMED', 'ACTIVE'])
      .gt('start_date', today)
      .lte('start_date', new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)),
    getOranWeather().catch(() => null),
    listUpcomingEvents(5).catch(() => []),
    getFinancialReport(new Date().getFullYear(), new Date().getMonth() + 1).catch(() => null),
  ]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Sbahhek' : hour < 18 ? 'Msakhir' : 'Tesba7 3la khir';
  const dayName = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const lines: string[] = [
    `☀️ *${greeting} Kouider !* — ${dayName}`,
    ``,
  ];

  // Météo
  if (weather) {
    lines.push(`🌡 *Météo Oran:* ${weather.temperature}°C — ${weather.condition}`);
    lines.push(``);
  }

  // Locations en cours
  const actives = (activeBookings.data ?? []) as Array<{ client_name: string; end_date: string; cars?: { name: string } }>;
  if (actives.length > 0) {
    lines.push(`🚗 *${actives.length} voiture(s) en location aujourd'hui:*`);
    for (const b of actives) {
      const car = b.cars?.name ?? '?';
      lines.push(`  • ${b.client_name} — ${car} → retour le ${b.end_date}`);
    }
    lines.push(``);
  } else {
    lines.push(`🚗 *Aucune voiture en location aujourd'hui*`);
    lines.push(``);
  }

  // Retours aujourd'hui
  const retToday = (returningToday.data ?? []) as Array<{ client_name: string; cars?: { name: string } }>;
  if (retToday.length > 0) {
    lines.push(`🔑 *Retours AUJOURD'HUI:*`);
    for (const b of retToday) lines.push(`  • ${b.client_name} — ${b.cars?.name ?? '?'}`);
    lines.push(``);
  }

  // Retours demain
  const retTomorrow = (returningTomorrow.data ?? []) as Array<{ client_name: string; cars?: { name: string } }>;
  if (retTomorrow.length > 0) {
    lines.push(`📅 *Retours DEMAIN:*`);
    for (const b of retTomorrow) lines.push(`  • ${b.client_name} — ${b.cars?.name ?? '?'}`);
    lines.push(``);
  }

  // À venir cette semaine
  const upcoming = (upcomingBookings.data ?? []) as Array<{ client_name: string; start_date: string; cars?: { name: string } }>;
  if (upcoming.length > 0) {
    lines.push(`📋 *À venir (7 jours):*`);
    for (const b of upcoming) lines.push(`  • ${b.client_name} — ${b.cars?.name ?? '?'} le ${b.start_date}`);
    lines.push(``);
  }

  // Agenda Google
  if (calendarEvents.length > 0) {
    lines.push(`📆 *Agenda:*`);
    for (const e of calendarEvents.slice(0, 3)) {
      const start = e.start.dateTime
        ? new Date(e.start.dateTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : (e.start as unknown as { date?: string }).date ?? '';
      lines.push(`  • ${e.summary} — ${start}`);
    }
    lines.push(``);
  }

  // Finance du mois
  if (financeThisMonth) {
    lines.push(`💰 *Bénéfice ${financeThisMonth.period}:* ${financeThisMonth.kouiderProfit}€`);
    lines.push(``);
  }

  // Conseil du jour
  const conseil = getDailyTip(now.getDay(), actives.length, upcoming.length);
  if (conseil) {
    lines.push(`💡 *Conseil:* ${conseil}`);
  }

  await tg(lines.join('\n'));
  console.log('[job:morning-briefing] Sent');
}

function getDailyTip(dayOfWeek: number, activeCount: number, upcomingCount: number): string {
  if (activeCount === 0 && upcomingCount === 0) {
    return 'Aucune réservation — bonne journée pour publier un TikTok ou contacter d\'anciens clients.';
  }
  if (dayOfWeek === 1) return 'Début de semaine — vérifie les docs de tous les clients en cours.';
  if (dayOfWeek === 5) return 'Vendredi — vérifie les retours prévus ce week-end.';
  if (dayOfWeek === 0) return 'Dimanche — bon moment pour planifier la semaine avec Ibrahim.';
  return '';
}

// ── 1. Rappel fin réservation ─────────────────────────────────
export async function jobEndRentalReminder(_job: Job): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { data: bookings } = await supabase
    .from('bookings').select('id, client_name, client_phone, end_date, cars(name)')
    .eq('end_date', tomorrowStr).in('status', ['CONFIRMED', 'ACTIVE']);

  if (!bookings?.length) return;

  for (const b of bookings as unknown as Array<{ client_name: string; client_phone?: string; end_date: string; cars?: { name: string } }>) {
    const carName = b.cars?.name ?? 'Véhicule';
    const msg = `🚗 *Fin de location demain*\n${b.client_name} — ${carName}\nRetour le ${b.end_date}${b.client_phone ? `\n📞 ${b.client_phone}` : ''}`;
    await tg(msg);
    await notifyOwner('🚗 Fin de réservation demain', `${b.client_name} — ${carName}`, false);
  }

  console.log(`[job:end-rental] ${bookings.length} reminder(s) sent`);
}

// ── 2. Véhicule sans réservation 7j ──────────────────────────
export async function jobIdleVehicleAlert(_job: Job): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: cars } = await supabase.from('cars').select('id, name, base_price').eq('available', true);
  if (!cars?.length) return;

  const idleCars: Array<{ name: string; base_price: number }> = [];

  for (const car of cars as Array<{ id: string; name: string; base_price: number }>) {
    const { count } = await supabase
      .from('bookings').select('id', { count: 'exact', head: true })
      .eq('car_id', car.id).in('status', ['CONFIRMED', 'ACTIVE', 'PENDING'])
      .gte('start_date', cutoffStr);
    if ((count ?? 0) === 0) idleCars.push(car);
  }

  if (!idleCars.length) return;

  const list = idleCars.map(c => `  • ${c.name}`).join('\n');
  await tg(`⚠️ *${idleCars.length} véhicule(s) sans réservation depuis 7 jours:*\n${list}\n\n💡 Fais un TikTok ou propose une promo.`);
  await notifyOwner(`⚠️ ${idleCars.length} véhicule(s) idle`, list, false);

  console.log(`[job:idle-vehicle] ${idleCars.length} idle`);
}

// ── 3. Suggestion TikTok ──────────────────────────────────────
export async function jobTikTokSuggestion(_job: Job): Promise<void> {
  const month = new Date().getMonth() + 1;
  let suggestion: string;

  if (month >= 6 && month <= 8) suggestion = '☀️ Saison MRE — vidéo flotte complète, prix été, livraison aéroport.';
  else if (month === 3 || month === 4) suggestion = '🌙 Ramadan — tarifs nuit, message darija, disponibilité nocturne.';
  else if (month === 12 || month === 1) suggestion = '❄️ Hiver — promo longue durée, véhicules chauffés.';
  else suggestion = '📱 Cette semaine: montre un véhicule, témoignage client, ou coulisses agence.';

  await tg(`📱 *Suggestion TikTok semaine:*\n${suggestion}`);
  await notifyOwner('📱 Suggestion TikTok', suggestion, false);
  console.log('[job:tiktok] sent');
}

// ── 4. Réservation impayée 48h ────────────────────────────────
export async function jobUnpaidReminder(_job: Job): Promise<void> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 48);

  const { data: bookings } = await supabase
    .from('bookings').select('id, client_name, client_phone, final_price, cars(name)')
    .eq('status', 'PENDING').lt('created_at', cutoff.toISOString());

  if (!bookings?.length) return;

  for (const b of bookings as unknown as Array<{ client_name: string; client_phone?: string; final_price: number; cars?: { name: string } }>) {
    const car = b.cars?.name ?? '?';
    await tg(`💸 *Réservation en attente > 48h*\n${b.client_name} — ${car}\nMontant: ${b.final_price}€${b.client_phone ? `\n📞 ${b.client_phone}` : ''}`);
    await notifyOwner('💸 Impayé > 48h', `${b.client_name} — ${car}`, true);
  }

  console.log(`[job:unpaid] ${bookings.length} alertes`);
}

// ── 5. Rapport hebdo lundi 8h ─────────────────────────────────
export async function jobWeeklyReport(_job: Job): Promise<void> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: bookings } = await supabase
    .from('bookings').select('id, client_name, final_price, status, cars(name)')
    .gte('created_at', weekAgo.toISOString());

  const all       = (bookings ?? []) as unknown as Array<{ final_price: number; status: string; cars?: { name: string } }>;
  const confirmed = all.filter(b => ['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(b.status));
  const revenue   = confirmed.reduce((s, b) => s + (b.final_price ?? 0), 0);

  const carCount: Record<string, number> = {};
  for (const b of confirmed) {
    const n = b.cars?.name ?? '?';
    carCount[n] = (carCount[n] ?? 0) + 1;
  }
  const topCars = Object.entries(carCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([n, c]) => `  • ${n}: ${c} rés.`).join('\n');

  // Finance du mois
  const finance = await getFinancialReport(new Date().getFullYear(), new Date().getMonth() + 1).catch(() => null);

  const report = [
    `📊 *Rapport hebdo — ${new Date().toLocaleDateString('fr-FR')}*`,
    ``,
    `📅 Réservations: ${all.length} (${confirmed.length} confirmées)`,
    `💰 Revenus: ${revenue}€`,
    finance ? `💼 Bénéfice Kouider ce mois: ${finance.kouiderProfit}€` : '',
    ``,
    `🚗 Top véhicules:`,
    topCars || '  • Aucune réservation',
  ].filter(Boolean).join('\n');

  await tg(report);
  await notifyOwner('📊 Rapport hebdomadaire', report, false);
  console.log('[job:weekly-report] sent');
}

// ── 6. Détection patterns (lundi avec rapport hebdo) ─────────
export async function jobPatternDetection(_job: Job): Promise<void> {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('client_name, client_phone, car_id, start_date, status, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', threeMonthsAgo.toISOString().slice(0, 10));

  if (!bookings?.length) return;

  const all = bookings as unknown as Array<{
    client_name: string; client_phone?: string; car_id: string;
    start_date: string; cars?: { name: string };
  }>;

  // Pattern 1: clients qui louent en juillet
  const julyBookers: Record<string, number> = {};
  for (const b of all) {
    if (new Date(b.start_date).getMonth() === 6) {
      julyBookers[b.client_name] = (julyBookers[b.client_name] ?? 0) + 1;
    }
  }

  // Pattern 2: véhicules demandés le week-end
  const weekendCars: Record<string, number> = {};
  for (const b of all) {
    const day = new Date(b.start_date).getDay();
    if (day === 5 || day === 6 || day === 0) {
      const car = b.cars?.name ?? b.car_id;
      weekendCars[car] = (weekendCars[car] ?? 0) + 1;
    }
  }

  // Pattern 3: jours les plus actifs
  const dayCount: Record<number, number> = {};
  for (const b of all) {
    const day = new Date(b.start_date).getDay();
    dayCount[day] = (dayCount[day] ?? 0) + 1;
  }
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const topDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];

  const lines: string[] = ['📈 *Patterns détectés (3 derniers mois):*', ''];

  const topJuly = Object.entries(julyBookers).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topJuly.length) {
    lines.push('🏖 *Clients récurrents juillet:*');
    topJuly.forEach(([name, count]) => lines.push(`  • ${name}: ${count} location(s)`));
    lines.push('');
  }

  const topWeekend = Object.entries(weekendCars).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topWeekend.length) {
    lines.push('🗓 *Véhicules les plus demandés le week-end:*');
    topWeekend.forEach(([car, count]) => lines.push(`  • ${car}: ${count}x`));
    lines.push('');
  }

  if (topDay) {
    lines.push(`📅 *Jour le plus actif:* ${dayNames[Number(topDay[0])]} (${topDay[1]} réservations)`);
  }

  await tg(lines.join('\n'));
  console.log('[job:pattern-detection] sent');
}
