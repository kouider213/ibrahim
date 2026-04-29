import type { Job } from 'bullmq';
import { supabase } from '../../integrations/supabase.js';
import { notifyOwner } from '../../notifications/pushover.js';
import { sendMessage, sendVideo } from '../../integrations/telegram.js';
import { getFinancialReport } from '../../integrations/finance.js';
import { listUpcomingEvents } from '../../integrations/google-calendar.js';
import { getOranWeather } from '../../integrations/web-search.js';
import { sendWhatsApp, detectLanguage } from '../../integrations/whatsapp.js';
import { chat } from '../../integrations/claude-api.js';
import axios from 'axios';
import { env } from '../../config/env.js';
import { runTikTokMarketResearch } from '../../marketing/market-research.js';
import { createMarketingVideo } from '../../marketing/video-creator.js';
import { savePendingVideo } from '../../marketing/approval-store.js';
import type { Car } from '../../integrations/supabase.js';

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

// ── 3. Marketing TikTok hebdomadaire (IA complète) ────────────
export async function jobTikTokSuggestion(_job: Job): Promise<void> {
  console.log('[job:tiktok] Démarrage recherche marketing IA...');

  // 1. Load available cars
  const { data: carsRaw } = await supabase.from('cars').select('*').eq('available', true);
  const cars = (carsRaw ?? []) as Car[];

  if (cars.length === 0) {
    await tg('📱 *Marketing TikTok*: aucune voiture disponible cette semaine.');
    return;
  }

  // 2. Run market research with Claude
  await tg('🔍 *Dzaryx Marketing*\nAnalyse TikTok en cours... ⏳');
  const report = await runTikTokMarketResearch(cars).catch(err => {
    console.error('[job:tiktok] research failed:', err);
    return null;
  });

  if (!report || report.top_ideas.length === 0) {
    await tg('⚠️ Recherche TikTok échouée — réessaie plus tard.');
    return;
  }

  // 3. Send research report to Telegram
  const researchMsg = [
    `📊 *RAPPORT MARKETING SEMAINE DU ${report.week}*`,
    ``,
    `📈 *Tendances qui cartonnent:*`,
    report.trends.map(t => `• ${t}`).join('\n'),
    ``,
    `🎯 *${report.top_ideas.length} idées vidéos générées*`,
    ``,
    report.top_ideas.map((idea, i) => [
      `*[${i + 1}] ${idea.title}*`,
      `🎬 ${idea.concept}`,
      `⏰ Publier: ${idea.best_time}`,
      `🚗 Voiture: ${idea.car_suggestion ?? 'au choix'}`,
    ].join('\n')).join('\n\n'),
    ``,
    `💡 *Stratégie:* ${report.summary}`,
    ``,
    `⏳ _Création vidéo de la meilleure idée en cours..._`,
  ].join('\n');

  await tg(researchMsg);

  // 4. Pick best idea and find matching car
  const bestIdea = report.top_ideas[0];
  const targetCar = cars.find(c =>
    bestIdea.car_suggestion &&
    c.name.toLowerCase().includes(bestIdea.car_suggestion.toLowerCase()),
  ) ?? cars[0];

  if (!targetCar.image_url) {
    await tg(`✅ Rapport envoyé ! Pas d'image pour créer la vidéo automatiquement.\n\n*Script voix-off:*\n_${bestIdea.voiceover_script}_`);
    return;
  }

  // 5. Create the video
  console.log(`[job:tiktok] Creating video for car: ${targetCar.name}`);
  const videoResult = await createMarketingVideo(targetCar, bestIdea).catch(err => {
    console.error('[job:tiktok] video creation failed:', err);
    return null;
  });

  if (!videoResult) {
    await tg([
      `✅ *Idée #1 — ${bestIdea.title}*`,
      ``,
      `📝 *Script voix-off:*`,
      `_${bestIdea.voiceover_script}_`,
      ``,
      `📱 *Légende:* ${bestIdea.caption}`,
      `#️⃣ ${bestIdea.hashtags.slice(0, 5).join(' ')}`,
    ].join('\n'));
    return;
  }

  // 6. Save as pending (waiting for "Oke" approval)
  const pendingId = await savePendingVideo({
    video_url: videoResult.video_url,
    caption:   videoResult.caption,
    hashtags:  videoResult.hashtags,
    car_name:  videoResult.car_name,
    car_id:    targetCar.id,
    script:    videoResult.script,
  });

  console.log(`[job:tiktok] Pending video saved: ${pendingId}`);

  // 7. Send video to Telegram for approval
  const approvalCaption = [
    `🎬 *Vidéo créée — ${bestIdea.title}*`,
    `🚗 ${videoResult.car_name}`,
    `📝 _${videoResult.script}_`,
    ``,
    `✅ Réponds *Oke* pour publier sur TikTok`,
    `❌ Réponds *Non* pour annuler`,
  ].join('\n');

  await sendVideo(ownerChatId(), videoResult.video_url, approvalCaption).catch(async () => {
    // Fallback if video send fails
    await tg([
      approvalCaption,
      ``,
      `🔗 *Lien vidéo:* ${videoResult.video_url}`,
    ].join('\n'));
  });

  await notifyOwner('📱 Vidéo TikTok prête', `${bestIdea.title} — réponds Oke pour publier`, false);
  console.log('[job:tiktok] Weekly marketing job complete');
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
  console.log('[job:unpaid-reminder] Démarrage vérification soldes...');

  const today = new Date().toISOString().slice(0, 10);

  // ── RÈGLE ABSOLUE Fik Conciergerie (clients MRE) ──────────────
  // 1. Client réserve → paie ACOMPTE → booking créé (PARTIAL ou PENDING)
  // 2. Client arrive à Oran → reçoit les clés → paie le SOLDE
  // 3. JAMAIS relancer un client pour le solde avant start_date
  //    (il n'a pas encore les clés = il ne doit rien de plus)
  // 4. Relancer le solde UNIQUEMENT si start_date passé ET voiture remise (ACTIVE/COMPLETED)
  // ──────────────────────────────────────────────────────────────

  // Cas 1 — Solde dû: client a la voiture (start_date passé, ACTIVE/COMPLETED, encore dû)
  const { data: activeUnpaid } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, paid_amount, payment_status, created_at, start_date, end_date, cars(name)')
    .in('payment_status', ['PENDING', 'PARTIAL'])
    .in('status', ['ACTIVE', 'COMPLETED'])
    .lte('start_date', today)
    .order('start_date', { ascending: true });

  // Cas 2 — Acompte manquant: client CONFIRMED, start_date dans 3 jours ou moins, aucun paiement
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const threeDaysStr = threeDaysFromNow.toISOString().slice(0, 10);

  const { data: pendingNoDeposit } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, paid_amount, payment_status, created_at, start_date, end_date, cars(name)')
    .eq('payment_status', 'PENDING')
    .eq('paid_amount', 0)
    .eq('status', 'CONFIRMED')
    .gt('start_date', today)
    .lte('start_date', threeDaysStr)
    .order('start_date', { ascending: true });

  const now = new Date();
  let soldeCount = 0;
  let acompteCount = 0;
  let urgentCount = 0;

  // ── Traitement des SOLDES DÛS (voiture déjà remise) ──────────
  for (const booking of (activeUnpaid ?? []) as any[]) {
    const bookingId   = booking.id as string;
    const clientName  = booking.client_name as string;
    const clientPhone = booking.client_phone as string | null;
    const carName     = (booking.cars as any)?.name ?? 'Véhicule';
    const total       = Number(booking.final_price ?? 0);
    const paid        = Number(booking.paid_amount ?? 0);
    const remaining   = total - paid;
    const startDate   = booking.start_date as string;
    const daysWithCar = Math.floor((now.getTime() - new Date(startDate).getTime()) / 86_400_000);

    if (remaining <= 0) continue;

    const { data: logs } = await supabase
      .from('relance_logs')
      .select('attempt, sent_at')
      .eq('booking_id', bookingId)
      .order('attempt', { ascending: true });

    const existingAttempts = (logs ?? []) as Array<{ attempt: number; sent_at: string }>;
    const attempt1Log = existingAttempts.find(l => l.attempt === 1);
    const attempt2Log = existingAttempts.find(l => l.attempt === 2);

    if (!attempt1Log) {
      // Première alerte solde (J+0 à J+1 après remise clés)
      const waMsg = generateSoldeMessage(clientName, remaining, carName, 1, daysWithCar);
      const tgMsg = buildTelegramSolde(clientName, clientPhone, carName, remaining, total, paid, 1, daysWithCar, startDate);
      await tg(tgMsg);
      await supabase.from('relance_logs').insert({
        booking_id: bookingId, client_name: clientName, client_phone: clientPhone,
        car_name: carName, amount_due: remaining, attempt: 1,
        sent_at: now.toISOString(), whatsapp_msg: waMsg, status: 'sent',
      });
      soldeCount++;
      console.log(`[job:unpaid-reminder] Solde J+${daysWithCar} → ${clientName} (${remaining}€)`);

    } else if (attempt1Log && !attempt2Log) {
      const hoursSince1 = (now.getTime() - new Date(attempt1Log.sent_at).getTime()) / 3_600_000;
      if (hoursSince1 >= 24) {
        const waMsg = generateSoldeMessage(clientName, remaining, carName, 2, daysWithCar);
        const tgMsg = buildTelegramSolde(clientName, clientPhone, carName, remaining, total, paid, 2, daysWithCar, startDate);
        await tg(tgMsg);
        await supabase.from('relance_logs').insert({
          booking_id: bookingId, client_name: clientName, client_phone: clientPhone,
          car_name: carName, amount_due: remaining, attempt: 2,
          sent_at: now.toISOString(), whatsapp_msg: waMsg, status: 'sent',
        });
        soldeCount++;
        console.log(`[job:unpaid-reminder] Solde relance 2 → ${clientName}`);
      }

    } else if (attempt1Log && attempt2Log) {
      const hoursSince2 = (now.getTime() - new Date(attempt2Log.sent_at).getTime()) / 3_600_000;
      if (hoursSince2 >= 24) {
        await tg([
          `🔴 *SOLDE NON ENCAISSÉ — ${daysWithCar}j après remise clés*`,
          ``,
          `👤 *${clientName}*`,
          `🚗 ${carName} (remis le ${startDate})`,
          `💰 Solde restant: *${remaining}€* (total: ${total}€ | payé: ${paid}€)`,
          `📱 ${clientPhone ?? 'Pas de téléphone'}`,
          ``,
          `⚠️ 2 rappels envoyés — aucun règlement. Contacte ce client directement.`,
        ].join('\n'));
        await supabase.from('relance_logs').update({ sent_at: now.toISOString(), status: 'urgent' })
          .eq('booking_id', bookingId).eq('attempt', 2);
        urgentCount++;
      }
    }
  }

  // ── Traitement des ACOMPTES MANQUANTS (arrive dans ≤ 3 jours, 0€ payé) ─
  for (const booking of (pendingNoDeposit ?? []) as any[]) {
    const clientName  = booking.client_name as string;
    const clientPhone = booking.client_phone as string | null;
    const carName     = (booking.cars as any)?.name ?? 'Véhicule';
    const total       = Number(booking.final_price ?? 0);
    const startDate   = booking.start_date as string;
    const daysLeft    = Math.ceil((new Date(startDate).getTime() - now.getTime()) / 86_400_000);

    const { data: logs } = await supabase
      .from('relance_logs').select('attempt').eq('booking_id', booking.id as string);

    if ((logs ?? []).length > 0) continue; // déjà alerté

    await tg([
      `⚠️ *ACOMPTE MANQUANT — Arrivée dans ${daysLeft}j*`,
      ``,
      `👤 *${clientName}*`,
      `🚗 ${carName}`,
      `📅 Arrivée prévue: ${startDate}`,
      `💰 Total: ${total}€ | Acompte: *0€ reçu*`,
      `📱 ${clientPhone ?? 'Pas de téléphone'}`,
      ``,
      `💡 Ce client n'a pas encore versé d'acompte. Confirme la réservation avec lui.`,
    ].join('\n'));

    await supabase.from('relance_logs').insert({
      booking_id: booking.id as string, client_name: clientName, client_phone: clientPhone,
      car_name: carName, amount_due: total, attempt: 0,
      sent_at: now.toISOString(), whatsapp_msg: '', status: 'acompte_alert',
    });
    acompteCount++;
    console.log(`[job:unpaid-reminder] Acompte manquant → ${clientName} (arrive le ${startDate})`);
  }

  const total_actions = soldeCount + acompteCount + urgentCount;
  console.log(`[job:unpaid-reminder] ✅ Terminé: ${soldeCount} solde(s) | ${acompteCount} acompte(s) manquant(s) | ${urgentCount} urgent(s)`);
  if (total_actions === 0) console.log('[job:unpaid-reminder] ℹ️ Aucune action nécessaire.');
}

function generateSoldeMessage(
  clientName: string,
  remaining: number,
  carName: string,
  attempt: 1 | 2,
  daysWithCar: number,
): string {
  if (attempt === 1) {
    return `Bonjour ${clientName} 👋\n\nNous espérons que vous profitez bien du *${carName}*.\n\nLe solde restant de *${remaining}€* est à régler dès que possible.\n\nMerci de votre confiance 🙏\n\n📞 Fik Conciergerie Oran`;
  } else {
    return `Bonjour ${clientName},\n\nNous vous rappelons que le solde de *${remaining}€* pour le *${carName}* (${daysWithCar}j de location) n'a pas encore été réglé.\n\nMerci de régulariser rapidement.\n\n📞 Fik Conciergerie Oran`;
  }
}

function buildTelegramSolde(
  clientName: string,
  clientPhone: string | null,
  carName: string,
  remaining: number,
  total: number,
  paid: number,
  attempt: 1 | 2,
  daysWithCar: number,
  startDate: string,
): string {
  const emoji   = attempt === 1 ? '🟡' : '🔴';
  const label   = attempt === 1 ? 'Solde à encaisser' : '⚠️ Rappel solde — 2ème';
  const waMsg   = generateSoldeMessage(clientName, remaining, carName, attempt, daysWithCar);

  return [
    `${emoji} *${label}*`,
    ``,
    `👤 *${clientName}*`,
    `🚗 ${carName} (remis le ${startDate})`,
    `💰 Total: ${total}€ | Payé: ${paid}€ | *Solde: ${remaining}€*`,
    `📅 Voiture en sa possession depuis ${daysWithCar}j`,
    `📱 ${clientPhone ?? 'Pas de téléphone'}`,
    ``,
    `📋 *Message WhatsApp à copier:*`,
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

// ── Veille concurrents — lundi + jeudi 11h ───────────────────
export async function jobCompetitorWatch(_job: Job): Promise<void> {
  console.log('[job:competitor-watch] Démarrage veille concurrence...');
  try {
    const queries = [
      'didanolocation tiktok location voiture oran promo',
      'location voiture oran tiktok video récente',
      'location voiture oran telegram prix promo',
      'concurrence location auto oran algerie',
    ];

    const results = await Promise.all(queries.map(async q => {
      const { data } = await axios.get(`https://s.jina.ai/${encodeURIComponent(q)}`, {
        headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
        timeout: 15_000,
      }).catch(() => ({ data: '' }));
      return `[${q}]\n${(typeof data === 'string' ? data : '').slice(0, 1200)}`;
    }));

    const { formatPricingTable } = await import('../../config/pricing.js');
    const pricing = formatPricingTable();

    const { data: carsRaw } = await supabase.from('cars').select('name, resale_price').eq('available', true);
    const availableNames = (carsRaw ?? []).map((c: any) => `${(c as { name: string; resale_price: number }).name} (${(c as { name: string; resale_price: number }).resale_price}€/j)`).join(', ');

    const analysis = await chat([{
      role: 'user',
      content: `Tu es Dzaryx, assistant IA de Fik Conciergerie Oran.
Analyse la concurrence location voiture Oran pour cette semaine.

RÉSULTATS RECHERCHE WEB:
${results.join('\n\n---\n\n')}

NOS PRIX (prix Kouider):
${pricing}

NOS VOITURES DISPONIBLES: ${availableNames || 'Toute la flotte'}

Donne un rapport court en français pour Telegram (markdown):

🕵️ **CE QUE FONT LES CONCURRENTS CETTE SEMAINE**
(promos, prix trouvés, vidéos TikTok, contenus Telegram)

📊 **ON EST COMPÉTITIF ?**
(sur quels modèles oui/non, et à quel prix)

⚡ **ACTION IMMÉDIATE**
(une seule chose concrète à faire MAINTENANT)

Si aucune info concrète trouvée: dis-le clairement et propose une stratégie proactive.
Format court, 10 lignes max.`,
    }], undefined);

    const msg = [
      `🕵️ *VEILLE CONCURRENCE — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}*`,
      ``,
      analysis.text,
      ``,
      `💡 _Réponds "vidéo concurrence" pour que je crée une contre-pub, ou "analyse didanolocation" pour cibler un concurrent._`,
    ].join('\n');

    await tg(msg);
    console.log('[job:competitor-watch] ✅ Rapport envoyé');
  } catch (err) {
    console.error('[job:competitor-watch] ❌', err instanceof Error ? err.message : String(err));
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
