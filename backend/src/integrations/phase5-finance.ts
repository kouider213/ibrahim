/**
 * PHASE 5 — Ibrahim gère tes finances
 * 1. Suivi encaissements & acomptes
 * 2. Calcul CA automatique (semaine/mois/année/véhicule/type client)
 * 3. Relance clients impayés automatique
 * 4. Génération factures PDF
 * 5. Tableau de bord financier
 * 6. Alerte dépense anormale
 */

import { supabase } from './supabase.js';
import { getPricingForVehicle } from '../config/pricing.js';

// ─────────────────────────────────────────────
// 1. SUIVI ENCAISSEMENTS & ACOMPTES
// ─────────────────────────────────────────────

export async function getPaymentStatus(bookingId?: string): Promise<string> {
  let query = supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, paid_amount, payment_status, last_payment_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED']);

  if (bookingId) query = query.eq('id', bookingId);

  const { data, error } = await query.order('start_date', { ascending: false }).limit(20);
  if (error) return `Erreur: ${error.message}`;
  if (!data?.length) return 'Aucune réservation trouvée.';

  const rows = (data as any[]).map(b => {
    const paid      = b.paid_amount ?? 0;
    const total     = b.final_price ?? 0;
    const remaining = total - paid;
    const status    = paid >= total ? '✅ PAYÉ' : paid > 0 ? '⚠️ PARTIEL' : '❌ IMPAYÉ';
    return `- ${b.client_name} | ${(b as any).cars?.name ?? '?'} | Total: ${total}€ | Payé: ${paid}€ | Reste: ${remaining}€ | ${status}`;
  });

  return `💰 ENCAISSEMENTS:\n${rows.join('\n')}`;
}

export async function recordPayment(
  bookingId: string,
  amount: number,
  note?: string
): Promise<string> {
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, client_name, final_price, paid_amount')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) return `Réservation introuvable: ${fetchErr?.message}`;

  const currentPaid = (booking as any).paid_amount ?? 0;
  const newPaid     = currentPaid + amount;
  const total       = (booking as any).final_price ?? 0;
  const newStatus   = newPaid >= total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

  // Log payment
  await supabase.from('payment_logs').insert({
    booking_id:     bookingId,
    amount,
    payment_date:   new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    note: note ?? null,
  });

  const { error } = await supabase
    .from('bookings')
    .update({
      paid_amount:       newPaid,
      payment_status:    newStatus,
      last_payment_date: new Date().toISOString().split('T')[0],
      payment_notes:     note ?? null,
    })
    .eq('id', bookingId);

  if (error) return `Erreur enregistrement paiement: ${error.message}`;

  const remaining = total - newPaid;
  return `✅ Paiement enregistré!\n- Client: ${(booking as any).client_name}\n- Montant encaissé: +${amount}€\n- Total payé: ${newPaid}€/${total}€\n- Reste: ${remaining}€\n- Statut: ${newStatus}`;
}

// ─────────────────────────────────────────────
// 2. CALCUL CA AUTOMATIQUE
// ─────────────────────────────────────────────

export async function getCAReport(
  year: number,
  month?: number,
  week?: number
): Promise<string> {
  let startDate: string;
  let endDate:   string;
  let period:    string;

  if (week !== undefined && month !== undefined) {
    const firstDay = new Date(year, month - 1, 1);
    const startW   = new Date(firstDay);
    startW.setDate(firstDay.getDate() + (week - 1) * 7);
    const endW = new Date(startW);
    endW.setDate(startW.getDate() + 6);
    startDate = startW.toISOString().split('T')[0];
    endDate   = endW.toISOString().split('T')[0];
    period    = `Semaine ${week} — ${month}/${year}`;
  } else if (month !== undefined) {
    const mm  = String(month).padStart(2, '0');
    startDate = `${year}-${mm}-01`;
    endDate   = `${year}-${mm}-${new Date(year, month, 0).getDate()}`;
    period    = `${mm}/${year}`;
  } else {
    startDate = `${year}-01-01`;
    endDate   = `${year}-12-31`;
    period    = String(year);
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_type, final_price, rented_by, start_date, end_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', startDate)
    .lte('start_date', endDate);

  if (error) return `Erreur CA: ${error.message}`;
  if (!data?.length) return `Aucune réservation pour la période ${period}.`;

  let caTotal   = 0;
  let nbMRE     = 0;
  let nbLocal   = 0;
  let caKouider = 0;
  let caHouari  = 0;
  const byVehicle: Record<string, number> = {};

  for (const b of data as any[]) {
    const price    = b.final_price ?? 0;
    const carName  = b.cars?.name ?? 'Inconnu';
    const rentedBy = b.rented_by ?? 'Kouider';

    caTotal += price;
    if (b.client_type === 'mre') nbMRE++; else nbLocal++;
    if (rentedBy === 'Kouider') {
      const pricing = getPricingForVehicle(carName);
      const days    = Math.max(1, Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000));
      caKouider += pricing ? pricing.benefit * days : Math.round(price * 0.2);
    } else {
      caHouari += price;
    }
    byVehicle[carName] = (byVehicle[carName] ?? 0) + price;
  }

  const byVehicleText = Object.entries(byVehicle)
    .sort(([, a], [, b]) => b - a)
    .map(([name, total]) => `  • ${name}: ${total}€`)
    .join('\n');

  return [
    `📊 CA — ${period}`,
    `──────────────────────`,
    `💶 CA Total:       ${caTotal}€`,
    `👤 Bénéfice Kouider: ${caKouider}€`,
    `🚗 Revenu Houari:  ${caHouari}€`,
    `📦 Réservations:   ${data.length} (${nbLocal} local / ${nbMRE} MRE)`,
    ``,
    `🚘 Par véhicule:`,
    byVehicleText,
  ].join('\n');
}

// ─────────────────────────────────────────────
// 3. RELANCE CLIENTS IMPAYÉS
// ─────────────────────────────────────────────

export async function checkUnpaidBookings(): Promise<string> {
  const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString().split('T')[0];
  const cutoff72h = new Date(Date.now() - 72 * 3600 * 1000).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, paid_amount, start_date, cars(name)')
    .in('payment_status', ['UNPAID', 'PARTIAL'])
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .lte('start_date', cutoff48h);

  if (error) return `Erreur: ${error.message}`;
  if (!data?.length) return '✅ Aucun impayé détecté.';

  const results: string[] = ['⚠️ CLIENTS IMPAYÉS:'];

  for (const b of data as any[]) {
    const remaining = (b.final_price ?? 0) - (b.paid_amount ?? 0);
    const isOld     = b.start_date <= cutoff72h;
    const urgency   = isOld ? '🔴 +72h' : '🟡 +48h';
    results.push(`${urgency} ${b.client_name} (${b.client_phone ?? 'N/A'}) — ${b.cars?.name ?? '?'} — Reste: ${remaining}€`);
  }

  results.push('\n📲 Envoie un message WhatsApp pour relancer ces clients.');
  return results.join('\n');
}

// ─────────────────────────────────────────────
// 4. GÉNÉRATION FACTURES PDF (texte structuré → Supabase)
// ─────────────────────────────────────────────

export async function generateInvoice(bookingId: string): Promise<string> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, cars(name)')
    .eq('id', bookingId)
    .single();

  if (error || !booking) return `Réservation introuvable: ${error?.message}`;

  const b         = booking as any;
  const invoiceNo = `FIK-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const days      = Math.max(1, Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000));
  const priceDay  = Math.round(b.final_price / days);

  const invoiceText = [
    `╔══════════════════════════════╗`,
    `║     FIK CONCIERGERIE         ║`,
    `║     FACTURE LOCATION         ║`,
    `╚══════════════════════════════╝`,
    `N° Facture: ${invoiceNo}`,
    `Date: ${new Date().toLocaleDateString('fr-FR')}`,
    `──────────────────────────────`,
    `CLIENT:`,
    `  Nom: ${b.client_name}`,
    `  Tél: ${b.client_phone ?? 'N/A'}`,
    `──────────────────────────────`,
    `LOCATION:`,
    `  Véhicule: ${b.cars?.name ?? 'N/A'}`,
    `  Du: ${b.start_date}`,
    `  Au: ${b.end_date}`,
    `  Durée: ${days} jour(s)`,
    `  Prix/jour: ${priceDay}€`,
    `──────────────────────────────`,
    `  TOTAL: ${b.final_price}€`,
    `  Payé: ${b.paid_amount ?? 0}€`,
    `  Reste: ${(b.final_price ?? 0) - (b.paid_amount ?? 0)}€`,
    `══════════════════════════════`,
    `Merci de votre confiance!`,
    `📞 WhatsApp: +213 XXX XXX XXX`,
  ].join('\n');

  // Store invoice record in Supabase
  const { error: invErr } = await supabase.from('invoices').insert({
    booking_id:     bookingId,
    invoice_number: invoiceNo,
    pdf_url:        null, // PDF generation requires server-side lib
    sent_to_client: false,
  });

  if (invErr) console.warn('[phase5] Invoice insert error:', invErr.message);

  return `✅ Facture générée!\n\n${invoiceText}`;
}

// ─────────────────────────────────────────────
// 5. TABLEAU DE BORD FINANCIER
// ─────────────────────────────────────────────

export async function getFinancialDashboard(): Promise<string> {
  const now       = new Date();
  const year      = now.getFullYear();
  const month     = now.getMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;

  const [currentCA, previousCA] = await Promise.all([
    getCAReport(year, month),
    getCAReport(prevYear, prevMonth),
  ]);

  // Unpaid count
  const { count: unpaidCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .in('payment_status', ['UNPAID', 'PARTIAL'])
    .in('status', ['CONFIRMED', 'ACTIVE']);

  // Active bookings this month
  const mm = String(month).padStart(2, '0');
  const { count: activeCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .gte('start_date', `${year}-${mm}-01`);

  return [
    `📊 TABLEAU DE BORD — ${mm}/${year}`,
    `══════════════════════════════`,
    ``,
    `📅 MOIS EN COURS:`,
    currentCA,
    ``,
    `📅 MOIS PRÉCÉDENT (${String(prevMonth).padStart(2,'0')}/${prevYear}):`,
    previousCA,
    ``,
    `──────────────────────────────`,
    `📋 Réservations actives: ${activeCount ?? 0}`,
    `⚠️  Impayés en cours: ${unpaidCount ?? 0}`,
  ].join('\n');
}

// ─────────────────────────────────────────────
// 6. ALERTES DÉPENSES ANORMALES
// ─────────────────────────────────────────────

export async function checkAnomalies(): Promise<string> {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const mm    = String(month).padStart(2, '0');

  // Fetch current month bookings
  const { data, error } = await supabase
    .from('bookings')
    .select('final_price, rented_by, client_name')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', `${year}-${mm}-01`)
    .lte('start_date', `${year}-${mm}-${new Date(year, month, 0).getDate()}`);

  if (error) return `Erreur détection anomalies: ${error.message}`;
  if (!data?.length) return 'Aucune donnée ce mois.';

  const alerts: string[] = [];

  // Check: bookings with unusually low price (< 50% of average)
  const prices  = (data as any[]).map(b => b.final_price ?? 0).filter(p => p > 0);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const threshold = avgPrice * 0.5;

  for (const b of data as any[]) {
    if ((b.final_price ?? 0) < threshold && (b.final_price ?? 0) > 0) {
      alerts.push(`🔴 Prix anormalement bas: ${b.client_name} — ${b.final_price}€ (moy: ${Math.round(avgPrice)}€)`);

      await supabase.from('expense_alerts').insert({
        alert_type:  'LOW_PRICE',
        description: `Prix bas détecté: ${b.client_name} — ${b.final_price}€`,
        amount:      b.final_price,
        threshold:   Math.round(threshold),
      });
    }
  }

  if (!alerts.length) return `✅ Aucune anomalie détectée ce mois (moy: ${Math.round(avgPrice)}€/réservation).`;

  return `⚠️ ALERTES FINANCIÈRES:\n${alerts.join('\n')}`;
}
