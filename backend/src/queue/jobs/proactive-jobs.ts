import type { Job } from 'bullmq';
import { redis } from '../../queue/queue.js';
import { emitProactive } from '../../notifications/mobile-push.js';
import { getDailyCostReport } from '../../monitoring/cost-tracker.js';
import { supabase } from '../../integrations/supabase.js';
import { notifyOwner } from '../../notifications/pushover.js';
import { sendMessage, sendVideoBuffer } from '../../integrations/telegram.js';
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

  // Idempotency: only one send per day regardless of Railway restarts / dual instances
  const dayLock = `job:morning-briefing:sent:${today}`;
  const acquired = await redis.set(dayLock, '1', 'EX', 86400, 'NX');
  if (!acquired) {
    console.log('[job:morning-briefing] SKIP — already sent today');
    return;
  }
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
    supabase.from('bookings').select('client_name, start_date, end_date, client_price_per_day, final_price, cars(name)')
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

  // À venir cette semaine + prévisionnel revenus
  const upcoming = (upcomingBookings.data ?? []) as unknown as Array<{
    client_name: string; start_date: string; end_date: string;
    client_price_per_day?: number; final_price?: number;
    cars?: { name: string };
  }>;
  if (upcoming.length > 0) {
    let forecastCA = 0;
    lines.push(`📋 *À venir (7 jours):*`);
    for (const b of upcoming) {
      const car     = b.cars?.name ?? '?';
      const nbDays  = Math.max(1, Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000));
      const ppd     = b.client_price_per_day ?? (b.final_price ? b.final_price / nbDays : 0);
      const total   = ppd * nbDays;
      forecastCA   += total;
      lines.push(`  • ${b.client_name} — ${car} le ${b.start_date} (${nbDays}j — ${Math.round(total)}€)`);
    }
    if (forecastCA > 0) {
      lines.push(`  💵 *Prévisionnel 7j:* ${Math.round(forecastCA)}€`);
    }
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

  const fullMsg = lines.join('\n');
  await tg(fullMsg);

  // Proactive push to mobile app — short version for TTS
  const ttsLines: string[] = [`${greeting} Kouider !`];
  if (actives.length > 0) ttsLines.push(`${actives.length} voiture${actives.length > 1 ? 's' : ''} en location aujourd'hui.`);
  if (retToday.length > 0) ttsLines.push(`${retToday.length} retour${retToday.length > 1 ? 's' : ''} prévu${retToday.length > 1 ? 's' : ''} aujourd'hui.`);
  if (weather) ttsLines.push(`Météo Oran : ${weather.temperature} degrés, ${weather.condition}.`);
  emitProactive(ttsLines.join(' '), 'morning');

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

  let sent = 0;
  for (const b of bookings as unknown as Array<{ id: string; client_name: string; client_phone?: string; end_date: string; cars?: { name: string } }>) {
    // Idempotency: one reminder per booking per day
    const bookingLock = `job:end-rental:sent:${b.id}:${tomorrowStr}`;
    const acquired = await redis.set(bookingLock, '1', 'EX', 86400, 'NX');
    if (!acquired) {
      console.log(`[job:end-rental] SKIP — already sent for booking ${b.id}`);
      continue;
    }
    const carName = b.cars?.name ?? 'Véhicule';
    const msg = `🚗 *Fin de location demain*\n${b.client_name} — ${carName}\nRetour le ${b.end_date}${b.client_phone ? `\n📞 ${b.client_phone}` : ''}`;
    await tg(msg);
    await notifyOwner('🚗 Fin de réservation demain', `${b.client_name} — ${carName}`, false);
    sent++;
  }

  if (sent > 0) {
    emitProactive(
      `Rappel : ${sent} voiture${sent > 1 ? 's' : ''} à récupérer demain. Vérifie tes retours.`,
      'reminder',
    );
  }
  console.log(`[job:end-rental] ${sent} reminder(s) sent (skipped duplicates)`);
}

// ── 2. Véhicule sans réservation 7j ──────────────────────────
export async function jobIdleVehicleAlert(_job: Job): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const dayLock = `job:idle-vehicle:sent:${today}`;
  const acquired = await redis.set(dayLock, '1', 'EX', 86400, 'NX');
  if (!acquired) { console.log('[job:idle-vehicle] SKIP — already sent today'); return; }

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
  const qualityBadge = report.data_quality === 'real'    ? '✅ DONNÉES RÉELLES'
                     : report.data_quality === 'partial'  ? '⚠️ DONNÉES PARTIELLES'
                     : '❌ PAS DE DONNÉES RÉELLES';

  const researchMsg = [
    `📊 *RAPPORT MARKETING SEMAINE DU ${report.week}*`,
    ``,
    `🔍 *Source:* ${qualityBadge}`,
    `_${report.data_source}_`,
    report.real_metrics ? [
      ``,
      `📈 *Métriques réelles:*`,
      `• Vidéos analysées: ${report.real_metrics.videos_analyzed}`,
      `• Engagement moyen: ${report.real_metrics.avg_engagement_pct !== null ? `${report.real_metrics.avg_engagement_pct}%` : 'N/A'}`,
      `• Top hashtag: #${report.real_metrics.top_hashtags[0]?.tag ?? '?'} (~${report.real_metrics.top_hashtags[0]?.avgViews.toLocaleString('fr-FR') ?? '?'} vues)`,
    ].join('\n') : '',
    ``,
    report.trends.length
      ? `📈 *Tendances (données réelles):*\n${report.trends.map(t => `• ${t}`).join('\n')}`
      : `📈 *Tendances:* aucune donnée réelle disponible`,
    ``,
    `🎯 *${report.top_ideas.length} idées vidéos${report.data_quality === 'no_data' ? ' (sans données réelles)' : ''}*`,
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
  ].filter(Boolean).join('\n');

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
    video_url: targetCar.image_url,
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

  await sendVideoBuffer(ownerChatId(), videoResult.buffer, approvalCaption).catch(async () => {
    await tg([
      approvalCaption,
      ``,
      `🖼️ *Aperçu:* ${targetCar.image_url}`,
    ].join('\n'));
  });

  await notifyOwner('📱 Vidéo TikTok prête', `${bestIdea.title} — réponds Oke pour publier`, false);
  console.log('[job:tiktok] Weekly marketing job complete');
}

// ── Phase 5: Mercredi lifestyle + Vendredi prix choc ─────────

async function createWeeklyVideo(style: 'lifestyle' | 'prix' | 'temoignage', label: string): Promise<void> {
  const { data: carsRaw } = await supabase.from('cars').select('*').eq('available', true);
  const cars = ((carsRaw ?? []) as Car[]).filter(c => c.image_url);

  if (cars.length === 0) {
    await tg(`📱 *${label}*: aucune voiture avec photo disponible.`);
    return;
  }

  const car = cars[Math.floor(Math.random() * cars.length)];
  await tg(`🎬 *${label}*\n_Création vidéo ${style} pour ${car.name}..._`);

  const { executeCreateMarketingVideo } = await import('../../marketing/create-marketing-video.js');
  let result: Awaited<ReturnType<typeof executeCreateMarketingVideo>> | null = null;

  try {
    result = await executeCreateMarketingVideo(
      { car_name: car.name, style },
      ownerChatId(),
    );
  } catch (err) {
    console.error(`[job:${style}] video failed:`, err);
    await tg(`⚠️ *${label}*: création vidéo échouée. Réessaie manuellement.`);
    return;
  }

  await tg([
    `✅ *${label} — ${result.car_name}*`,
    ``,
    `📝 _${result.script}_`,
    `🏷️ ${result.hashtags.slice(0, 4).join(' ')}`,
    ``,
    `✅ Réponds *Oke* pour publier | ❌ *Non* pour annuler`,
  ].join('\n'));
}

export async function jobWednesdayContent(_job: Job): Promise<void> {
  console.log('[job:wednesday] Vidéo lifestyle mercredi...');
  await createWeeklyVideo('lifestyle', '🌅 Contenu Mercredi — Lifestyle');
}

export async function jobFridayContent(_job: Job): Promise<void> {
  console.log('[job:friday] Vidéo prix vendredi...');
  await createWeeklyVideo('prix', '🔥 Contenu Vendredi — Prix Choc');
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
    const bookingLock = `job:late-return:sent:${b.id as string}:${today}`;
    const acquired = await redis.set(bookingLock, '1', 'EX', 86400, 'NX');
    if (!acquired) { console.log(`[job:late-return] SKIP dup: ${b.id as string}`); continue; }

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

  emitProactive(
    `Alerte retard ! ${overdue.length} véhicule${overdue.length > 1 ? 's' : ''} pas encore rendu${overdue.length > 1 ? 's' : ''}. Contacte tes clients.`,
    'alert',
  );
  console.log(`[job:late-return] ${overdue.length} véhicule(s) en retard détecté(s)`);
}

// ── 4b. Détection anomalies financières ──────────────────────
export async function jobCheckAnomalies(_job: Job): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const dayLock = `job:check-anomalies:sent:${today}`;
  const acq = await redis.set(dayLock, '1', 'EX', 86400, 'NX');
  if (!acq) { console.log('[job:anomalies] SKIP — already ran today'); return; }
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
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    console.log('[job:wa-confirm] SKIP — Twilio non configuré (variables manquantes)');
    return;
  }
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
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    console.log('[job:wa-24h] SKIP — Twilio non configuré (variables manquantes)');
    return;
  }
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
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    console.log('[job:wa-return] SKIP — Twilio non configuré (variables manquantes)');
    return;
  }
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
    const { multiProviderWebSearch } = await import('../../integrations/web-search-provider.js');

    // 10 recherches parallèles — sources diversifiées (DDG + Bing + Google API)
    const SEARCH_QUERIES = [
      // Concurrents identifiés — présence réelle web
      'didanolocation oran location voiture algerie 2025',
      'agence location voiture oran algerie avis google maps tarifs',
      // TikTok — pages indexées par moteurs de recherche
      'tiktok #locationoran #locationvoitureoran location voiture algerie',
      'tiktok location voiture oran hashtag viral 2025',
      // Facebook/Instagram — plus accessibles que TikTok
      'location voiture oran facebook promo tarifs 2025',
      'location voiture oran instagram pas cher mre été 2025',
      // YouTube — bien indexé
      'youtube location voiture oran algerie 2025',
      // Aéroport + MRE — segment fort Fik Conciergerie
      'location voiture aeroport ahmed ben bella oran algerie prix',
      'location voiture oran mre été 2025 tarifs pas cher',
      // Prix marché
      'location auto oran algerie tarif comparaison prix journalier',
    ];

    const searchResults = await Promise.allSettled(
      SEARCH_QUERIES.map(q => multiProviderWebSearch(q).then(r => ({ q, text: r.text, source: r.source, chars: r.results_count }))),
    );

    const results = searchResults
      .map((r, i) => {
        if (r.status === 'rejected') return `[${SEARCH_QUERIES[i]}]\n❌ Erreur recherche`;
        const { q, text, source, chars } = r.value;
        const preview = text.slice(0, 1000);
        return `[${q}] (source:${source} results:${chars})\n${preview}`;
      });

    // Filtrer les résultats vides
    const validResults = results.filter(r => !r.includes('NO_DATA') && r.length > 80);
    console.log(`[job:competitor-watch] ${validResults.length}/${SEARCH_QUERIES.length} recherches avec données`);

    const { formatPricingTable } = await import('../../config/pricing.js');
    const pricing = formatPricingTable();

    const { data: carsRaw } = await supabase.from('cars').select('name, resale_price').eq('available', true);
    const availableNames = (carsRaw ?? []).map((c: any) => `${(c as { name: string; resale_price: number }).name} (${(c as { name: string; resale_price: number }).resale_price}€/j)`).join(', ');

    const hasRealData = validResults.length >= 2;
    const dataLabel = `${validResults.length}/${SEARCH_QUERIES.length} sources avec données réelles`;

    const analysis = await chat([{
      role: 'user',
      content: `Tu es Dzaryx, assistant IA de Fik Conciergerie Oran.
Analyse la concurrence location voiture Oran pour cette semaine.
RÈGLE ABSOLUE: cite uniquement des faits extraits des données ci-dessous. N'invente AUCUN chiffre, concurrent, hashtag ou prix.
Si une section manque de données, écris "données non disponibles cette semaine" pour cette section.

DONNÉES COLLECTÉES (${dataLabel}):
${validResults.length > 0 ? validResults.join('\n\n---\n\n') : '⚠️ Aucune donnée concrète récupérée cette semaine.'}

NOS PRIX (prix Kouider — source interne):
${pricing}

NOS VOITURES DISPONIBLES: ${availableNames || 'Toute la flotte'}

Rapport pour Telegram (markdown, 12 lignes max):

🕵️ **CONCURRENTS DÉTECTÉS**
(noms réels trouvés dans les données — sinon "aucun concurrent identifié cette semaine")

💰 **PRIX CONCURRENTS TROUVÉS**
(chiffres exacts des données — sinon "prix non disponibles")

📱 **HASHTAGS & TENDANCES RÉELS**
(hashtags ou tendances trouvés dans les données — ex: #locationoran, #mre2025 — sinon "non disponible")

⚡ **ACTION IMMÉDIATE**
(une action basée sur les données — si pas de données, basée sur notre positionnement prix)`,
    }], undefined);

    const msg = [
      `🕵️ *VEILLE CONCURRENCE — ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}*`,
      hasRealData ? `📊 _${dataLabel}_` : `⚠️ _Données limitées cette semaine (${dataLabel})_`,
      ``,
      analysis.text,
      ``,
      `💡 _Dis "analyse didanolocation" ou "vidéo concurrence" pour aller plus loin._`,
    ].join('\n');

    await tg(msg);
    console.log('[job:competitor-watch] ✅ Rapport envoyé');
  } catch (err) {
    console.error('[job:competitor-watch] ❌', err instanceof Error ? err.message : String(err));
  }
}

// ── P13 — Business Intelligence jobs ─────────────────────────

export async function jobBIDaily(_job: Job): Promise<void> {
  console.log('[job:bi-daily] Démarrage rapport BI quotidien...');

  const today   = new Date().toISOString().slice(0, 10);
  const dayLock = `job:bi-daily:sent:${today}`;
  const acquired = await redis.set(dayLock, '1', 'EX', 86400, 'NX');
  if (!acquired) {
    console.log('[job:bi-daily] SKIP — already sent today');
    return;
  }

  try {
    const { runBIEngine } = await import('../../bi/bi-engine.js');
    await runBIEngine(true);
    console.log('[job:bi-daily] ✅ Rapport BI envoyé');
  } catch (err) {
    console.error('[job:bi-daily] ❌', err instanceof Error ? err.message : String(err));
  }
}

export async function jobBIReminders(_job: Job): Promise<void> {
  try {
    const { getSmartReminders } = await import('../../bi/smart-reminders.js');
    const reminders = await getSmartReminders();
    const highPri   = reminders.filter(r => r.priority === 'HIGH');
    if (!highPri.length) { console.log('[job:bi-reminders] ℹ️ Aucune alerte haute priorité'); return; }

    const chatId = env.TELEGRAM_CHAT_ID;
    if (!chatId) return;

    for (const r of highPri.slice(0, 5)) {
      const emoji = r.type === 'age_alert' ? '🔞' : r.type === 'missing_passport' ? '🪪' : '⚡';
      await sendMessage(chatId, `${emoji} *${r.message}*\n💡 ${r.action}`);
    }
    console.log(`[job:bi-reminders] ✅ ${highPri.length} alerte(s) HIGH envoyées`);
  } catch (err) {
    console.error('[job:bi-reminders] ❌', err instanceof Error ? err.message : String(err));
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

// ── Claude API Cost Monitor (daily check at 20h) ──────────────────────────────
export async function jobClaudeCostMonitor(_job: Job): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const lockKey = `job:claude-cost:sent:${today}`;
  const lock = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
  if (!lock) return;

  try {
    const report = await getDailyCostReport();
    if (report.totalUSD < 0.10) return; // Less than $0.10 → skip

    const lines: string[] = [`💰 *Coûts Claude API — ${today}*`, `Total: *$${report.totalUSD.toFixed(3)}*`];
    for (const [model, data] of Object.entries(report.breakdown)) {
      const short = model.replace('claude-', '').replace(/-4-\d$/, '');
      const inK  = Math.round(data.inputTokens  / 1000);
      const outK = Math.round(data.outputTokens / 1000);
      const crK  = Math.round(data.cacheReadTokens / 1000);
      lines.push(`• ${short}: ${inK}k in / ${outK}k out / ${crK}k cached = $${data.costUSD.toFixed(3)}`);
    }

    if (report.alertTriggered) {
      lines.push(`\n⚠️ *Alerte seuil $5 dépassé* — vérifier l'usage`);
      emitProactive(`Alerte coût Claude API: $${report.totalUSD.toFixed(2)} aujourd'hui. Seuil $5 dépassé.`, 'alert');
    }

    await tg(lines.join('\n'));
    console.log(`[job:claude-cost] ✅ Rapport envoyé — $${report.totalUSD.toFixed(3)}`);
  } catch (err) {
    console.error('[job:claude-cost] ❌', err instanceof Error ? err.message : String(err));
  }
}

// ── Client relance — clients n'ayant pas loué depuis 30+ jours ─────────────────
export async function jobClientRelance(_job: Job): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const lockKey = `job:client-relance:sent:${today}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
  if (!acquired) return;

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const sixtyDaysAgo  = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

    // Clients avec dernière location entre 30 et 60 jours (actifs mais inactifs récemment)
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('client_name, client_phone, end_date, cars(name)')
      .in('status', ['CONFIRMED', 'COMPLETED', 'ACTIVE'])
      .gte('end_date', sixtyDaysAgo)
      .lte('end_date', thirtyDaysAgo)
      .order('end_date', { ascending: false });

    if (error || !bookings?.length) {
      console.log('[job:client-relance] Aucun client à relancer');
      return;
    }

    // Dédupliquer par client_phone — garder la dernière location seulement
    const seen = new Set<string>();
    const toRelance: Array<{ name: string; phone: string; carName: string; endDate: string }> = [];

    for (const b of bookings) {
      const phone = (b as any).client_phone ?? 'inconnu';
      if (seen.has(phone)) continue;
      seen.add(phone);
      toRelance.push({
        name:    (b as any).client_name,
        phone,
        carName: (b as any).cars?.name ?? 'un véhicule',
        endDate: (b as any).end_date,
      });
      if (toRelance.length >= 5) break; // max 5 alertes par jour
    }

    if (toRelance.length === 0) return;

    const lines = [
      `🔔 *Relance clients — ${toRelance.length} client(s) à recontacter*\n`,
      ...toRelance.map(c => {
        const days = Math.floor((Date.now() - new Date(c.endDate).getTime()) / 86400000);
        return `• *${c.name}* (${c.phone}) — dernière location: ${c.carName}, il y a ${days} jours`;
      }),
      `\n💡 _Pense à les contacter pour les fidéliser ou proposer une promo._`,
    ];

    await tg(lines.join('\n'));
    emitProactive(`${toRelance.length} client(s) n'ont pas loué depuis 30+ jours. Pense à les relancer !`, 'alert');
    console.log(`[job:client-relance] ✅ ${toRelance.length} client(s) signalés`);
  } catch (err) {
    console.error('[job:client-relance] ❌', err instanceof Error ? err.message : String(err));
  }
}

// ── 21. Taux d'utilisation véhicules — rapport hebdo samedi 9h ────────────────
export async function jobVehicleUtilization(_job: Job): Promise<void> {
  try {
    const today   = new Date().toISOString().slice(0, 10);
    const lockKey = `job:vehicle-utilization:sent:${today}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
    if (!acquired) return;

    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

    // Fetch all bookings from last 30 days
    const { data: bookings } = await supabase
      .from('bookings')
      .select('car_id, start_date, end_date, cars(name)')
      .gte('end_date', since30)
      .neq('status', 'cancelled');

    // Fetch all active cars
    const { data: cars } = await supabase
      .from('cars')
      .select('id, name, status')
      .eq('available', true);

    if (!cars || cars.length === 0) return;

    // Count booked days per car
    const bookedDays: Record<string, number> = {};
    const carNames: Record<string, string>   = {};

    for (const car of cars as Array<{ id: string; name: string }>) {
      bookedDays[car.id] = 0;
      carNames[car.id]   = car.name;
    }

    for (const b of (bookings ?? []) as Array<{ car_id: string; start_date: string; end_date: string }>) {
      if (!(b.car_id in bookedDays)) continue;
      const start = new Date(b.start_date).getTime();
      const end   = new Date(b.end_date).getTime();
      const days  = Math.max(1, Math.round((end - start) / 86_400_000));
      bookedDays[b.car_id] = (bookedDays[b.car_id] ?? 0) + days;
    }

    // Sort by utilization rate descending
    const sorted = Object.entries(bookedDays).sort((a, b) => b[1] - a[1]);
    const total  = 30;

    const lines: string[] = [
      `🚗 *Taux d'utilisation du parc — 30 derniers jours*\n`,
      ...sorted.map(([id, days]) => {
        const rate = Math.round((days / total) * 100);
        const bar  = '█'.repeat(Math.floor(rate / 10)) + '░'.repeat(10 - Math.floor(rate / 10));
        const hint = rate < 30 ? ' ⚠️ sous-utilisé' : rate >= 80 ? ' ✅ excellent' : '';
        return `• *${carNames[id] ?? id}* — ${bar} ${rate}%${hint}`;
      }),
    ];

    // Identify idle cars (< 20% utilization)
    const idle = sorted.filter(([, d]) => d < 6);
    if (idle.length > 0) {
      lines.push(`\n💡 *Suggestions* :`);
      for (const [id, days] of idle) {
        const rate = Math.round((days / total) * 100);
        lines.push(`  — ${carNames[id] ?? id} (${rate}%) : envisage de baisser le tarif ou une promo flash.`);
      }
    }

    await tg(lines.join('\n'));
    emitProactive(`Rapport utilisation parc : ${sorted.length} véhicules analysés sur 30 jours.`, 'info');
    console.log('[job:vehicle-utilization] ✅ rapport envoyé');
  } catch (err) {
    console.error('[job:vehicle-utilization] ❌', err instanceof Error ? err.message : String(err));
  }
}

// ── 22. Vérification habitudes Kouider — quotidien 8h15 ───────────────────────
export async function jobHabitCheck(_job: Job): Promise<void> {
  try {
    const now   = new Date();
    const today = now.toISOString().slice(0, 10);
    const lockKey = `job:habit-check:sent:${today}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
    if (!acquired) return;

    const { data: habits } = await supabase
      .from('memory_habits')
      .select('*')
      .eq('active', true)
      .eq('user_id', 'kouider');

    if (!habits || habits.length === 0) return;

    const due: Array<{ name: string; description: string }> = [];
    const hourNow = now.getHours();

    for (const h of habits as Array<{
      habit_name: string;
      description: string;
      schedule_type: string;
      interval_hours?: number;
      last_done_at?: string;
    }>) {
      if (h.schedule_type === 'daily') {
        // Morning check (7h-10h) — always remind
        if (hourNow >= 7 && hourNow <= 10) {
          due.push({ name: h.habit_name, description: h.description });
        }
      } else if (h.schedule_type === 'interval' && h.interval_hours) {
        const lastDone = h.last_done_at ? new Date(h.last_done_at).getTime() : 0;
        const hoursSince = (Date.now() - lastDone) / 3_600_000;
        if (hoursSince >= h.interval_hours) {
          due.push({ name: h.habit_name, description: h.description });
        }
      }
    }

    if (due.length === 0) return;

    const lines = [
      `⭐ *Tes habitudes du jour, Kouider :*\n`,
      ...due.map(h => `• ${h.name} — ${h.description}`),
      `\nBonne journée ! 💪`,
    ];

    await tg(lines.join('\n'));
    emitProactive(`${due.length} habitude(s) à faire aujourd'hui : ${due.map(h => h.name).join(', ')}`, 'reminder');
    console.log(`[job:habit-check] ✅ ${due.length} habitude(s) rappelées`);
  } catch (err) {
    console.error('[job:habit-check] ❌', err instanceof Error ? err.message : String(err));
  }
}

// ── 23. Bilan mensuel automatique — 1er du mois 9h ───────────────────────────
export async function jobMonthlyReport(_job: Job): Promise<void> {
  try {
    const now   = new Date();
    const month = now.getMonth() + 1;       // 1–12
    const year  = now.getFullYear();
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear  = month === 1 ? year - 1 : year;

    const lockKey = `job:monthly-report:sent:${prevYear}-${prevMonth}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 86400 * 32, 'NX');
    if (!acquired) return;

    const [finance, { data: bookings }] = await Promise.all([
      getFinancialReport(prevYear, prevMonth).catch(() => null),
      supabase
        .from('bookings')
        .select('id, client_name, payment_status, final_price')
        .gte('start_date', `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`)
        .lt('start_date',  `${year}-${String(month).padStart(2, '0')}-01`),
    ]);

    const allBookings = (bookings ?? []) as Array<{ payment_status: string; final_price: number }>;
    const paid    = allBookings.filter(b => b.payment_status === 'PAID').length;
    const unpaid  = allBookings.filter(b => b.payment_status === 'UNPAID').length;
    const monthName = new Date(prevYear, prevMonth - 1).toLocaleDateString('fr-FR', { month: 'long' });

    const lines = [
      `📊 *Bilan ${monthName} ${prevYear}*\n`,
      `📦 Réservations: ${allBookings.length} (${paid} payées / ${unpaid} impayées)`,
    ];

    if (finance) {
      lines.push(`💵 CA Brut: *${finance.grossCA}€*`);
      lines.push(`💰 Bénéfice Kouider: *${finance.kouiderProfit}€*`);
      lines.push(`📤 Coût Houari: ${finance.ownerTotal}€`);
      if (finance.missingOwnerPrice > 0) {
        lines.push(`⚠️ ${finance.missingOwnerPrice} résa sans prix Houari — bénéfice partiel`);
      }
    }

    lines.push(`\n💡 _Dzaryx génère automatiquement ce bilan chaque 1er du mois._`);

    await tg(lines.join('\n'));
    emitProactive(`Bilan ${monthName} : ${finance?.kouiderProfit ?? '?'}€ de bénéfice, ${allBookings.length} réservations.`, 'info');
    console.log('[job:monthly-report] ✅ envoyé');
  } catch (err) {
    console.error('[job:monthly-report] ❌', err instanceof Error ? err.message : String(err));
  }
}

// ── 24. Alerte véhicule immobilisé 14+ jours ─────────────────────────────────
export async function jobLongIdleAlert(_job: Job): Promise<void> {
  try {
    const today  = new Date().toISOString().slice(0, 10);
    const lockKey = `job:long-idle:sent:${today}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
    if (!acquired) return;

    const ago14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

    // Cars available now — find last booking end_date
    const { data: cars } = await supabase
      .from('cars')
      .select('id, name')
      .eq('available', true);

    if (!cars || cars.length === 0) return;

    const idle: Array<{ name: string; daysSince: number }> = [];

    for (const car of cars as Array<{ id: string; name: string }>) {
      const { data: lastBooking } = await supabase
        .from('bookings')
        .select('end_date')
        .eq('car_id', car.id)
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastDate = (lastBooking as { end_date?: string } | null)?.end_date;
      if (!lastDate || lastDate < ago14) {
        const days = lastDate
          ? Math.round((Date.now() - new Date(lastDate).getTime()) / 86_400_000)
          : 30;
        idle.push({ name: car.name, daysSince: days });
      }
    }

    if (idle.length === 0) return;

    const lines = [
      `🔧 *Véhicules immobilisés ${idle.length > 1 ? `(${idle.length})` : ''} — plus de 14 jours sans location:*\n`,
      ...idle.map(c => `• *${c.name}* — immobilisé depuis ${c.daysSince} jours`),
      `\n💡 _Vérifie l'état mécanique et envisage une promo ou une révision._`,
    ];

    await tg(lines.join('\n'));
    emitProactive(`${idle.length} véhicule(s) immobilisé(s) 14+ jours : ${idle.map(c => c.name).join(', ')}`, 'alert');
    console.log(`[job:long-idle] ✅ ${idle.length} véhicule(s) signalé(s)`);
  } catch (err) {
    console.error('[job:long-idle] ❌', err instanceof Error ? err.message : String(err));
  }
}
