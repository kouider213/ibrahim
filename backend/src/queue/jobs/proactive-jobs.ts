import type { Job } from 'bullmq';
import { supabase } from '../../integrations/supabase.js';
import { notifyOwner } from '../../notifications/pushover.js';
import { sendMessage } from '../../integrations/telegram.js';
import { getFinancialReport } from '../../integrations/finance.js';
import { listUpcomingEvents } from '../../integrations/google-calendar.js';
import { getOranWeather } from '../../integrations/web-search.js';
import { sendWhatsApp, detectLanguage } from '../../integrations/whatsapp.js';
import { chat } from '../../integrations/claude-api.js';
import axios from 'axios';
import { env } from '../../config/env.js';

function ownerChatId(): string {
  return env.TELEGRAM_CHAT_ID ?? '809747124';
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
  if (dayOfWeek === 0) return 'Dimanche — bon moment pour planifier la semaine avec Dzaryx.';
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

// ════════════════════════════════════════════════════════════════
// ── 4. RELANCE CLIENTS IMPAYÉS — PHASE 5 ÉTAPE 3 ─────────────
// Logique:
//   - attempt 1 → toutes les réservations CONFIRMED/ACTIVE avec
//     payment_status PENDING ou PARTIAL, créées il y a ≥ 48h
//     et pas encore relancées (pas de log attempt=1)
//   - attempt 2 → celles qui ont déjà eu une relance 1 il y a ≥ 24h
//     et sont toujours impayées
//   - Si toujours impayé après relance 2 → alerte urgente Kouider
// ════════════════════════════════════════════════════════════════

export async function jobUnpaidReminder(_job: Job): Promise<void> {
  console.log('[job:unpaid-reminder] Démarrage vérification impayés...');

  // 1. Récupérer toutes les réservations impayées/partielles actives
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, paid_amount, payment_status, created_at, start_date, end_date, cars(name)')
    .in('payment_status', ['PENDING', 'PARTIAL'])
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[job:unpaid-reminder] Erreur Supabase:', error.message);
    return;
  }

  if (!bookings?.length) {
    console.log('[job:unpaid-reminder] ✅ Aucun impayé trouvé.');
    return;
  }

  const now = new Date();
  let attempt1Count = 0;
  let attempt2Count = 0;
  let urgentCount   = 0;

  for (const booking of bookings as any[]) {
    const bookingId  = booking.id as string;
    const clientName = booking.client_name as string;
    const clientPhone = booking.client_phone as string | null;
    const carName    = (booking.cars as any)?.name ?? 'Véhicule';
    const total      = booking.final_price as number ?? 0;
    const paid       = booking.paid_amount as number ?? 0;
    const remaining  = total - paid;
    const createdAt  = new Date(booking.created_at);
    const hoursOld   = (now.getTime() - createdAt.getTime()) / 3_600_000;

    // Récupérer les logs de relance existants pour cette réservation
    const { data: logs } = await supabase
      .from('relance_logs')
      .select('attempt, sent_at')
      .eq('booking_id', bookingId)
      .order('attempt', { ascending: true });

    const existingAttempts = (logs ?? []) as Array<{ attempt: number; sent_at: string }>;
    const attempt1Log = existingAttempts.find(l => l.attempt === 1);
    const attempt2Log = existingAttempts.find(l => l.attempt === 2);

    // ── Relance 1: ≥48h sans paiement et pas encore relancé ──
    if (!attempt1Log && hoursOld >= 48) {
      const whatsappMsg = generateRelanceMessage(clientName, remaining, carName, 1);
      const tgMessage   = buildTelegramRelance(clientName, clientPhone, carName, remaining, total, paid, 1, Math.floor(hoursOld));

      await tg(tgMessage);
      await notifyOwner(
        `💸 Relance 1 — ${clientName}`,
        `${carName} | Reste: ${remaining}€ | ${Math.floor(hoursOld)}h sans paiement\n📱 ${clientPhone ?? 'N/A'}`,
        false,
      );

      // Log la relance dans Supabase
      await supabase.from('relance_logs').insert({
        booking_id:    bookingId,
        client_name:   clientName,
        client_phone:  clientPhone,
        car_name:      carName,
        amount_due:    remaining,
        attempt:       1,
        sent_at:       now.toISOString(),
        whatsapp_msg:  whatsappMsg,
        status:        'sent',
      });

      attempt1Count++;
      console.log(`[job:unpaid-reminder] Relance 1 → ${clientName} (${remaining}€)`);
    }

    // ── Relance 2: ≥24h après relance 1, toujours impayé ──
    else if (attempt1Log && !attempt2Log) {
      const hoursSinceAttempt1 = (now.getTime() - new Date(attempt1Log.sent_at).getTime()) / 3_600_000;

      if (hoursSinceAttempt1 >= 24) {
        const whatsappMsg = generateRelanceMessage(clientName, remaining, carName, 2);
        const tgMessage   = buildTelegramRelance(clientName, clientPhone, carName, remaining, total, paid, 2, Math.floor(hoursOld));

        await tg(tgMessage);
        await notifyOwner(
          `🚨 Relance 2 — ${clientName}`,
          `${carName} | Reste: ${remaining}€ | Déjà relancé il y a ${Math.floor(hoursSinceAttempt1)}h\n📱 ${clientPhone ?? 'N/A'}`,
          true, // urgente
        );

        // Log la relance 2
        await supabase.from('relance_logs').insert({
          booking_id:    bookingId,
          client_name:   clientName,
          client_phone:  clientPhone,
          car_name:      carName,
          amount_due:    remaining,
          attempt:       2,
          sent_at:       now.toISOString(),
          whatsapp_msg:  whatsappMsg,
          status:        'sent',
        });

        attempt2Count++;
        console.log(`[job:unpaid-reminder] Relance 2 → ${clientName} (${remaining}€)`);
      }
    }

    // ── Alerte urgente: 2 relances faites, toujours impayé ──
    else if (attempt1Log && attempt2Log) {
      const hoursSinceAttempt2 = (now.getTime() - new Date(attempt2Log.sent_at).getTime()) / 3_600_000;

      // Alerter toutes les 24h si toujours impayé après relance 2
      if (hoursSinceAttempt2 >= 24) {
        const daysDue = Math.floor(hoursOld / 24);

        await tg([
          `🔴 *IMPAYÉ PERSISTANT — ACTION REQUISE*`,
          ``,
          `👤 *${clientName}*`,
          `🚗 ${carName}`,
          `💰 Reste à payer: *${remaining}€* (total: ${total}€)`,
          `📅 ${daysDue} jours sans règlement`,
          `📱 ${clientPhone ?? 'N/A'}`,
          ``,
          `⚠️ 2 relances envoyées — aucune réponse.`,
          `👉 Contacte ce client directement.`,
        ].join('\n'));

        await notifyOwner(
          `🔴 IMPAYÉ ${daysDue}j — ${clientName}`,
          `${carName} | ${remaining}€ | 2 relances sans réponse | 📱 ${clientPhone ?? 'N/A'}`,
          true,
        );

        // Mettre à jour le log attempt 2 avec la dernière alerte
        await supabase.from('relance_logs')
          .update({ sent_at: now.toISOString(), status: 'urgent' })
          .eq('booking_id', bookingId)
          .eq('attempt', 2);

        urgentCount++;
        console.log(`[job:unpaid-reminder] 🔴 Alerte urgente → ${clientName} (${daysDue}j)`);
      }
    }
  }

  // Résumé
  const total_actions = attempt1Count + attempt2Count + urgentCount;
  if (total_actions > 0) {
    console.log(`[job:unpaid-reminder] ✅ Terminé: ${attempt1Count} relance(s) 1 | ${attempt2Count} relance(s) 2 | ${urgentCount} alerte(s) urgente(s)`);
  } else {
    console.log('[job:unpaid-reminder] ℹ️ Aucune nouvelle relance nécessaire.');
  }
}

/**
 * Génère le message WhatsApp à envoyer au client
 * (affiché à Kouider pour qu'il le copie/envoie)
 */
function generateRelanceMessage(
  clientName: string,
  amount: number,
  carName: string,
  attempt: 1 | 2,
): string {
  if (attempt === 1) {
    return `Bonjour ${clientName} 👋\n\nNous vous rappelons que le règlement de ${amount}€ pour la location du *${carName}* est toujours en attente.\n\nMerci de régulariser votre situation dès que possible.\n\n📞 AutoLux Oran — Fik Conciergerie`;
  } else {
    return `Bonjour ${clientName},\n\n⚠️ Malgré notre premier rappel, le règlement de *${amount}€* pour la location du ${carName} reste impayé.\n\nNous vous demandons de régulariser cette situation *dans les plus brefs délais* pour éviter toute complication.\n\n📞 AutoLux Oran — Fik Conciergerie`;
  }
}

/**
 * Construit le message Telegram envoyé à Kouider
 * avec le message WhatsApp prêt à copier-coller
 */
function buildTelegramRelance(
  clientName: string,
  clientPhone: string | null,
  carName: string,
  remaining: number,
  total: number,
  paid: number,
  attempt: 1 | 2,
  hoursOld: number,
): string {
  const emoji   = attempt === 1 ? '🟡' : '🔴';
  const urgence = attempt === 1 ? 'Première relance' : '⚠️ Deuxième relance URGENTE';
  const waMsg   = generateRelanceMessage(clientName, remaining, carName, attempt);

  return [
    `${emoji} *${urgence} — Impayé*`,
    ``,
    `👤 *${clientName}*`,
    `🚗 ${carName}`,
    `💰 Total: ${total}€ | Payé: ${paid}€ | *Reste: ${remaining}€*`,
    `⏱ Depuis: ${Math.floor(hoursOld / 24)}j ${hoursOld % 24}h`,
    `📱 ${clientPhone ?? 'Pas de téléphone'}`,
    ``,
    `📋 *Message WhatsApp à envoyer:*`,
    `\`\`\``,
    waMsg,
    `\`\`\``,
  ].join('\n');
}

// ── 4a. Alerte retards de retour ─────────────────────────────
export async function jobLateReturnAlert(_job: Job): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: overdue } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, end_date, final_price, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .lt('end_date', today)
    .order('end_date', { ascending: true });

  if (!overdue?.length) {
    console.log('[job:late-return] ✅ Aucun retard');
    return;
  }

  for (const b of overdue as any[]) {
    const daysLate = Math.floor(
      (new Date(today).getTime() - new Date(b.end_date as string).getTime()) / 86_400_000
    );
    const carName = (b.cars as any)?.name ?? 'Véhicule';

    await tg([
      `🚨 *RETARD DE RETOUR — ${daysLate} jour(s)*`,
      ``,
      `👤 *${b.client_name}*`,
      `🚗 ${carName}`,
      `📅 Devait rendre le *${b.end_date}*`,
      `📱 ${b.client_phone ?? 'N/A'}`,
      `💰 Prix total: ${b.final_price}€`,
      ``,
      `⚠️ Contacte ce client immédiatement.`,
    ].join('\n'));

    await notifyOwner(
      `🚨 Retard ${daysLate}j — ${b.client_name}`,
      `${carName} — devait rendre le ${b.end_date}`,
      true,
    );
  }

  console.log(`[job:late-return] ${overdue.length} véhicule(s) en retard détecté(s)`);
}

// ── 4b. Détection anomalies financières ──────────────────────
export async function jobCheckAnomalies(_job: Job): Promise<void> {
  try {
    const { checkAnomalies } = await import('../../integrations/phase5-finance.js');
    const result = await checkAnomalies();
    if (result && !result.includes('Aucune anomalie')) {
      await tg(`⚠️ *Anomalies financières détectées:*\n${result}`);
      await notifyOwner('⚠️ Anomalie financière', result.slice(0, 200), true);
    }
    console.log('[job:anomalies] check done');
  } catch (err) {
    console.error('[job:anomalies] error:', err instanceof Error ? err.message : String(err));
  }
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

// ── PHASE 6 — WhatsApp proactifs ─────────────────────────────────

// Envoi confirmation WhatsApp pour toute réservation CONFIRMED dont whatsapp_sent=false
export async function jobWhatsAppBookingConfirmations(_job: Job): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, start_date, end_date, final_price, cars(name)')
    .eq('status', 'CONFIRMED')
    .eq('whatsapp_sent', false)
    .not('client_phone', 'is', null)
    .gte('start_date', today);

  if (!bookings?.length) return;

  for (const b of bookings as any[]) {
    if (!b.client_phone) continue;
    const phone     = b.client_phone as string;
    const lang      = detectLanguage('');   // default fr, phone has no text to detect
    const carName   = b.cars?.name ?? 'votre véhicule';

    let msg: string;
    if (lang === 'ar') {
      msg = `مرحباً ${b.client_name} 🎉\nتم تأكيد حجزك في Fik Conciergerie Oran!\n🚗 ${carName}\n📅 ${b.start_date} → ${b.end_date}\n💰 ${Number(b.final_price).toLocaleString('fr-DZ')} DZD\nشكراً لثقتك بنا. 🙏`;
    } else {
      msg = `Bonjour ${b.client_name} 🎉\nVotre réservation chez Fik Conciergerie Oran est confirmée !\n🚗 ${carName}\n📅 Du ${b.start_date} au ${b.end_date}\n💰 Total: ${Number(b.final_price).toLocaleString('fr-DZ')} DZD\nMerci de votre confiance. Pour toute question, répondez ici. 🙏`;
    }

    const ok = await sendWhatsApp(phone, msg);
    if (ok) {
      await supabase.from('bookings').update({ whatsapp_sent: true }).eq('id', b.id);
      console.log(`[job:wa-confirm] ✅ Sent to ${phone}`);
    }
  }
}

// Rappel 24h avant prise en charge
export async function jobWhatsApp24hReminders(_job: Job): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, start_date, cars(name)')
    .eq('status', 'CONFIRMED')
    .eq('start_date', tomorrowStr)
    .not('client_phone', 'is', null);

  if (!bookings?.length) return;

  for (const b of bookings as any[]) {
    if (!b.client_phone) continue;
    const phone   = b.client_phone as string;
    const carName = b.cars?.name ?? 'votre véhicule';

    const msg = `Bonjour ${b.client_name} 👋\nRappel : votre location de ${carName} commence demain, le ${b.start_date}.\nNous vous attendons ! Pour toute question, répondez ici. 🚗`;
    await sendWhatsApp(phone, msg);
    console.log(`[job:wa-24h] Reminder sent to ${phone}`);
  }
}

// Message de fin de location (jour J de restitution)
export async function jobWhatsAppReturnReminders(_job: Job): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, end_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .eq('end_date', today)
    .not('client_phone', 'is', null);

  if (!bookings?.length) return;

  for (const b of bookings as any[]) {
    if (!b.client_phone) continue;
    const phone   = b.client_phone as string;
    const carName = b.cars?.name ?? 'votre véhicule';

    const msg = `Bonjour ${b.client_name},\nRappel : la restitution de ${carName} est prévue aujourd'hui.\nMerci pour votre confiance — nous espérons que vous avez apprécié votre location ! 🙏`;
    await sendWhatsApp(phone, msg);
    console.log(`[job:wa-return] Reminder sent to ${phone}`);
  }
}

// ── Veille Anthropic — chaque dimanche 10h ────────────────────
export async function jobAnthropicWatch(_job: Job): Promise<void> {
  try {
    // Fetch release notes + SDK changelog via Jina.ai
    const [releaseNotes, sdkChangelog] = await Promise.all([
      axios.get('https://r.jina.ai/https://docs.anthropic.com/en/release-notes/overview', {
        headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
        timeout: 20_000,
      }).then((r: { data: unknown }) => (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)).slice(0, 3000)),
      axios.get('https://r.jina.ai/https://github.com/anthropics/anthropic-sdk-node/blob/main/CHANGELOG.md', {
        headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
        timeout: 20_000,
      }).then((r: { data: unknown }) => (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)).slice(0, 2000)),
    ]);

    const analysis = await chat([{
      role: 'user',
      content: `Tu es Dzaryx, assistant IA de Fik Conciergerie Oran.
Analyse ces nouveautés Anthropic/Claude et identifie ce qui peut CONCRÈTEMENT améliorer tes capacités.

RELEASE NOTES ANTHROPIC:
${releaseNotes}

SDK CHANGELOG:
${sdkChangelog}

Réponds en français, format court:
1. Liste les 2-3 nouveautés les plus utiles pour toi (nouveau modèle, nouvelle fonctionnalité API, amélioration)
2. Pour chacune: ce que ça changerait concrètement pour Kouider
3. Effort estimé: Facile/Moyen/Complexe

Si rien de nouveau ou utile: dis-le clairement en une phrase.`,
    }], undefined);

    const msg = `🤖 *Veille Anthropic hebdomadaire*\n\n${analysis.text}\n\n_Réponds "go" + numéro pour que j'implémente._`;
    await tg(msg);
    console.log('[job:anthropic-watch] ✅ Rapport envoyé');
  } catch (err) {
    console.error('[job:anthropic-watch] ❌', err instanceof Error ? err.message : String(err));
  }
}
