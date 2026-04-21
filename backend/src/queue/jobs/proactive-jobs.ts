import type { Job } from 'bullmq';
import { supabase } from '../../integrations/supabase.js';
import { notifyOwner } from '../../notifications/pushover.js';

// ── 1. Rappel veille fin réservation ─────────────────────────
export async function jobEndRentalReminder(_job: Job): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, end_date, cars(name)')
    .eq('end_date', tomorrowStr)
    .in('status', ['CONFIRMED', 'ACTIVE']);

  if (!bookings?.length) return;

  for (const b of bookings as Array<{ client_name: string; client_phone?: string; end_date: string; cars?: unknown }>) {
    const carName = (b.cars as { name?: string } | null)?.name ?? 'Véhicule';
    await notifyOwner(
      `🚗 Fin de réservation demain`,
      `${b.client_name} — ${carName}\nRetour prévu le ${b.end_date}\n${b.client_phone ? `📞 ${b.client_phone}` : ''}`,
      false,
    );
  }

  console.log(`[job:end-rental] Sent ${bookings.length} reminder(s)`);
}

// ── 2. Alerte véhicule non réservé 7 jours ───────────────────
export async function jobIdleVehicleAlert(_job: Job): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: cars } = await supabase
    .from('cars')
    .select('id, name, base_price')
    .eq('available', true);

  if (!cars?.length) return;

  const idleCars: Array<{ name: string; base_price: number }> = [];

  for (const car of cars as Array<{ id: string; name: string; base_price: number }>) {
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('car_id', car.id)
      .in('status', ['CONFIRMED', 'ACTIVE', 'PENDING'])
      .gte('start_date', cutoffStr);

    if ((count ?? 0) === 0) idleCars.push(car);
  }

  if (!idleCars.length) return;

  const list = idleCars.map(c => `• ${c.name} (${c.base_price}€/j)`).join('\n');
  await notifyOwner(
    `⚠️ ${idleCars.length} véhicule(s) sans réservation depuis 7j`,
    `${list}\n\n💡 Envisage une promo ou TikTok pour relancer.`,
    false,
  );

  console.log(`[job:idle-vehicle] ${idleCars.length} idle car(s) found`);
}

// ── 3. Suggestion TikTok selon saison ────────────────────────
export async function jobTikTokSuggestion(_job: Job): Promise<void> {
  const month = new Date().getMonth() + 1; // 1-12

  let suggestion: string;
  if (month >= 6 && month <= 8) {
    suggestion = '☀️ Saison MRE — TikTok idéal: vidéo de la flotte complète, prix d\'été, livraison aéroport. Cible: Algériens en France qui rentrent.';
  } else if (month === 3 || month === 4) {
    suggestion = '🌙 Période Ramadan — TikTok idéal: tarifs Ramadan, disponibilité nocturne, message en arabe dialectal.';
  } else if (month === 12 || month === 1) {
    suggestion = '❄️ Saison hivernale — TikTok idéal: véhicules avec chauffage, promo hiver, longues durées.';
  } else {
    suggestion = '📱 TikTok cette semaine: montre un véhicule spécifique, témoignage client, ou les coulisses de l\'agence.';
  }

  await notifyOwner('📱 Suggestion TikTok hebdo', suggestion, false);
  console.log('[job:tiktok] Suggestion sent');
}

// ── 4. Relance impayé après 48h ───────────────────────────────
export async function jobUnpaidReminder(_job: Job): Promise<void> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 48);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, created_at, cars(name)')
    .eq('status', 'PENDING')
    .lt('created_at', cutoff.toISOString());

  if (!bookings?.length) return;

  for (const b of bookings as Array<{ id: string; client_name: string; client_phone?: string; final_price: number; cars?: unknown }>) {
    const carName = (b.cars as { name?: string } | null)?.name ?? 'Véhicule';
    await notifyOwner(
      `💸 Réservation impayée > 48h`,
      `${b.client_name} — ${carName}\nMontant: ${b.final_price}€\n${b.client_phone ? `📞 ${b.client_phone}\nRelance à faire sur WhatsApp.` : 'Pas de numéro.'}`,
      true,
    );
  }

  console.log(`[job:unpaid] ${bookings.length} unpaid booking(s) alerted`);
}

// ── 5. Rapport hebdomadaire lundi 8h ─────────────────────────
export async function jobWeeklyReport(_job: Job): Promise<void> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString();

  // Réservations cette semaine
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client_name, final_price, status, car_id, cars(name)')
    .gte('created_at', weekAgoStr);

  const all = (bookings ?? []) as Array<{ id: string; final_price: number; status: string; cars?: unknown }>;
  const confirmed = all.filter(b => ['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(b.status));
  const pending   = all.filter(b => b.status === 'PENDING');
  const revenue   = confirmed.reduce((sum, b) => sum + (b.final_price ?? 0), 0);

  // Véhicules les + loués
  const carCount: Record<string, { name: string; count: number }> = {};
  for (const b of confirmed) {
    const carName = (b.cars as { name?: string } | null)?.name ?? 'Inconnu';
    if (!carCount[carName]) carCount[carName] = { name: carName, count: 0 };
    carCount[carName]!.count++;
  }
  const topCars = Object.values(carCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(c => `• ${c.name}: ${c.count} rés.`)
    .join('\n');

  const report = [
    `📊 RAPPORT HEBDO — ${new Date().toLocaleDateString('fr-FR')}`,
    ``,
    `📅 Réservations: ${all.length} (${confirmed.length} confirmées)`,
    `💰 Revenus: ${revenue}€`,
    `⏳ En attente: ${pending.length}`,
    ``,
    `🚗 Top véhicules:`,
    topCars || '• Aucune réservation',
  ].join('\n');

  await notifyOwner('📊 Rapport hebdomadaire Ibrahim', report, false);
  console.log('[job:weekly-report] Report sent');
}
