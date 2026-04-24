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

export interface PaymentStatus {
  booking_id:     string;
  client_name:    string;
  car_name:       string;
  total_amount:   number;
  paid_amount:    number;
  remaining:      number;
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID';
  last_payment:   string | null;
}

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
    return `- ${b.client_name} | ${b.cars?.name ?? '?'} | Total: ${total}€ | Payé: ${paid}€ | Reste: ${remaining}€ | ${status}`;
  });

  return `💰 ENCAISSEMENTS:\n${rows.join('\n')}`;
}

export async function recordPayment(
  bookingId: string,
  amount: number,
  note?: string
): Promise<string> {
  // Get current booking
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

  const { error } = await supabase
    .from('bookings')
    .update({
      paid_amount:        newPaid,
      payment_status:     newStatus,
      last_payment_date:  new Date().toISOString().split('T')[0],
      payment_notes:      note ?? null,
    })
    .eq('id', bookingId);

  if (error) return `Erreur enregistrement paiement: ${error.message}`;

  const remaining = total - newPaid;
  return `✅ Paiement enregistré!\n- Client: ${(booking as any).client_name}\n- Montant encaissé: +${amount}€\n- Total payé: ${newPaid}€/${total}€\n- Reste: ${remaining}€\n- Statut: ${newStatus}`;
}

// ─────────────────────────────────────────────
// 2. CALCUL CA AUTOMATIQUE
// ─────────────────────────────────────────────

export interface CAReport {
  period:         string;
  ca_total:       number;
  ca_kouider:     number;
  ca_houari:      number;
  nb_reservations: number;
  nb_mre:         number;
  nb_local:       number;
  by_vehicle:     Record<string, number>;
  by_week?:       Record<string, number>;
}

export async function getCAReport(
  year: number,
  month?: number,
  week?: number
): Promise<string> {
  let startDate: string;
  let endDate:   string;
  let period:    string;

  if (week && month) {
    // Get week range
    const firstDay = new Date(year, (month - 1), 1);
    const startW   = new Date(firstDay);
    startW.setDate(firstDay.getDate() + (week - 1) * 7);
    const endW = new Date(startW);
    endW.setDate(startW.getDate() + 6);
    startDate = startW.toISOString().split('T')[0];
    endDate   = endW.toISOString().split('T')[0];
    period    = `Semaine ${week} - ${String(month).padStart(2,'0')}/${year}`;
  } else if (month) {
    const m   = String(month).padStart(2, '0');
    const last = new Date(year, month, 0).getDate();
    startDate  = `${year}-${m}-01`;
    endDate    = `${year}-${m}-${last}`;
    period     = `${m}/${year}`;
  } else {
    startDate = `${year}-01-01`;
    endDate   = `${year}-12-31`;
    period    = String(year);
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, rented_by, start_date, end_date, nb_days, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', startDate)
    .lte('start_date', endDate);

  if (error) return `Erreur CA: ${error.message}`;
  if (!data?.length) return `Aucune réservation pour ${period}.`;

  let ca_total   = 0;
  let ca_kouider = 0;
  let ca_houari  = 0;
  let nb_mre     = 0;
  let nb_local   = 0;
  const by_vehicle: Record<string, number> = {};

  for (const b of data as any[]) {
    const price    = b.final_price ?? 0;
    const carName  = b.cars?.name ?? 'Inconnu';
    const rentedBy = b.rented_by ?? 'Kouider';

    ca_total += price;
    if (rentedBy === 'Kouider') {
      const pricing = getPricingForVehicle(carName);
      const nbDays  = b.nb_days ?? Math.max(1, Math.ceil(
        (new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000
      ));
      ca_kouider += pricing ? pricing.benefit * nbDays : Math.round(price * 0.2);
      ca_houari  += pricing ? pricing.houariPrice * nbDays : price - Math.round(price * 0.2);
    } else {
      ca_houari += price;
    }

    // MRE vs local (France/Belgique/etc = MRE)
    const phone = b.client_phone ?? '';
    if (phone.startsWith('+33') || phone.startsWith('+32') || phone.startsWith('+34') || phone.startsWith('0033')) {
      nb_mre++;
    } else {
      nb_local++;
    }

    // Par véhicule
    by_vehicle[carName] = (by_vehicle[carName] ?? 0) + price;
  }

  // Format by_vehicle
  const vehicleLines = Object.entries(by_vehicle)
    .sort((a, b) => b[1] - a[1])
    .map(([v, p]) => `  • ${v}: ${p}€`)
    .join('\n');

  return `📊 CHIFFRE D'AFFAIRES — ${period}
━━━━━━━━━━━━━━━━━━━━━━
💶 CA Total:        ${ca_total}€
💰 Bénéfice Kouider: ${ca_kouider}€
🏠 Revenu Houari:   ${ca_houari}€
📋 Réservations:    ${data.length}
✈️  MRE:            ${nb_mre}
🏙️  Local:          ${nb_local}

🚗 PAR VÉHICULE:
${vehicleLines}`;
}

// ─────────────────────────────────────────────
// 3. RELANCE CLIENTS IMPAYÉS
// ─────────────────────────────────────────────

export async function getUnpaidClients(): Promise<string> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, paid_amount, payment_status, last_payment_date, start_date, end_date, cars(name)')
    .in('payment_status', ['UNPAID', 'PARTIAL'])
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .order('start_date', { ascending: false });

  if (error) return `Erreur: ${error.message}`;
  if (!data?.length) return '✅ Aucun client impayé !';

  const now = new Date();
  const rows = (data as any[]).map(b => {
    const paid      = b.paid_amount ?? 0;
    const total     = b.final_price ?? 0;
    const remaining = total - paid;
    const lastPay   = b.last_payment_date ? new Date(b.last_payment_date) : null;
    const daysSince = lastPay
      ? Math.floor((now.getTime() - lastPay.getTime()) / 86_400_000)
      : null;

    let urgency = '⚠️';
    if (!lastPay) urgency = '🔴';
    else if (daysSince && daysSince >= 3) urgency = '🔴';
    else if (daysSince && daysSince >= 2) urgency = '🟠';

    return `${urgency} ${b.client_name} (${b.client_phone ?? 'N/A'}) | ${b.cars?.name ?? '?'} | Reste: ${remaining}€ | ${lastPay ? `Dernier paiement il y a ${daysSince}j` : 'Jamais payé'}`;
  });

  // Check who needs reminder
  const toRemind48 = (data as any[]).filter(b => {
    if (b.payment_status === 'PAID') return false;
    const last = b.last_payment_date ? new Date(b.last_payment_date) : null;
    if (!last) return true;
    const days = Math.floor((now.getTime() - last.getTime()) / 86_400_000);
    return days >= 2;
  });

  let reminder = '';
  if (toRemind48.length > 0) {
    reminder = `\n\n🔔 ${toRemind48.length} client(s) à relancer maintenant !`;
  }

  return `💸 CLIENTS IMPAYÉS (${data.length}):\n${rows.join('\n')}${reminder}`;
}

export function generateReminderMessage(
  clientName: string,
  carName: string,
  remaining: number,
  attempt: 1 | 2
): string {
  if (attempt === 1) {
    return `Bonjour ${clientName} 👋\n\nNous vous rappelons qu'il reste un solde de ${remaining}€ à régler pour votre location ${carName}.\n\nMerci de procéder au règlement dans les plus brefs délais.\n\nCordialement,\nFik Conciergerie 🚗`;
  } else {
    return `Bonjour ${clientName},\n\n⚠️ Relance : Un solde de ${remaining}€ est toujours en attente pour votre location ${carName}.\n\nSans règlement sous 24h, nous serons contraints de prendre des mesures.\n\nMerci de nous contacter.\n\nFik Conciergerie 🚗`;
  }
}

// ─────────────────────────────────────────────
// 4. GÉNÉRATION FACTURE (format texte → PDF côté client)
// ─────────────────────────────────────────────

export async function generateInvoice(bookingId: string): Promise<string> {
  const { data: b, error } = await supabase
    .from('bookings')
    .select('*, cars(name)')
    .eq('id', bookingId)
    .single();

  if (error || !b) return `Réservation introuvable: ${error?.message}`;

  const booking  = b as any;
  const carName  = booking.cars?.name ?? 'Véhicule';
  const start    = booking.start_date;
  const end      = booking.end_date;
  const nbDays   = booking.nb_days ?? Math.max(1, Math.ceil(
    (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
  ));
  const total    = booking.final_price ?? 0;
  const paid     = booking.paid_amount ?? 0;
  const remaining = total - paid;
  const invoiceNo = `FIK-${new Date().getFullYear()}-${bookingId.slice(0,6).toUpperCase()}`;
  const today    = new Date().toLocaleDateString('fr-FR');

  const invoice = `
╔══════════════════════════════════════════════╗
║          FIK CONCIERGERIE — FACTURE          ║
╚══════════════════════════════════════════════╝

N° Facture:    ${invoiceNo}
Date:          ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CLIENT:
  Nom:         ${booking.client_name}
  Téléphone:   ${booking.client_phone ?? 'N/A'}

LOCATION:
  Véhicule:    ${carName}
  Du:          ${start}
  Au:          ${end}
  Durée:       ${nbDays} jour(s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MONTANT TOTAL:   ${total}€
DÉJÀ PAYÉ:       ${paid}€
RESTE À PAYER:   ${remaining}€
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${booking.notes ? `Notes: ${booking.notes}\n` : ''}
Merci de votre confiance !
Fik Conciergerie — Oran, Algérie
`;

  return invoice.trim();
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

  // Current month
  const m1    = String(month).padStart(2, '0');
  const last1 = new Date(year, month, 0).getDate();
  const { data: currData } = await supabase
    .from('bookings')
    .select('final_price, rented_by, nb_days, start_date, end_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', `${year}-${m1}-01`)
    .lte('start_date', `${year}-${m1}-${last1}`);

  // Previous month
  const m2    = String(prevMonth).padStart(2, '0');
  const last2 = new Date(prevYear, prevMonth, 0).getDate();
  const { data: prevData } = await supabase
    .from('bookings')
    .select('final_price, rented_by, nb_days, start_date, end_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', `${prevYear}-${m2}-01`)
    .lte('start_date', `${prevYear}-${m2}-${last2}`);

  const calcCA = (data: any[]) => {
    let total = 0;
    let kouider = 0;
    for (const b of data) {
      total += b.final_price ?? 0;
      if (b.rented_by === 'Kouider') {
        const p = getPricingForVehicle(b.cars?.name ?? '');
        const d = b.nb_days ?? Math.max(1, Math.ceil(
          (new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000
        ));
        kouider += p ? p.benefit * d : Math.round((b.final_price ?? 0) * 0.2);
      }
    }
    return { total, kouider };
  };

  const curr = calcCA(currData ?? []);
  const prev = calcCA(prevData ?? []);
  const diff = curr.total - prev.total;
  const diffPct = prev.total > 0 ? Math.round((diff / prev.total) * 100) : 0;
  const trend   = diff >= 0 ? '📈' : '📉';

  // Next month prediction (based on confirmed future bookings)
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;
  const m3        = String(nextMonth).padStart(2, '0');
  const last3     = new Date(nextYear, nextMonth, 0).getDate();
  const { data: nextData } = await supabase
    .from('bookings')
    .select('final_price')
    .in('status', ['CONFIRMED', 'PENDING'])
    .gte('start_date', `${nextYear}-${m3}-01`)
    .lte('start_date', `${nextYear}-${m3}-${last3}`);

  const nextPrev = (nextData ?? []).reduce((s: number, b: any) => s + (b.final_price ?? 0), 0);

  // Unpaid count
  const { data: unpaid } = await supabase
    .from('bookings')
    .select('id')
    .in('payment_status', ['UNPAID', 'PARTIAL'])
    .in('status', ['CONFIRMED', 'ACTIVE']);

  const unpaidCount = unpaid?.length ?? 0;

  return `🏦 TABLEAU DE BORD FINANCIER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 MOIS EN COURS (${m1}/${year}):
  💶 CA Total:         ${curr.total}€
  💰 Bénéfice Kouider: ${curr.kouider}€
  📋 Réservations:     ${(currData ?? []).length}

📅 MOIS PRÉCÉDENT (${m2}/${prevYear}):
  💶 CA Total:         ${prev.total}€
  💰 Bénéfice Kouider: ${prev.kouider}€
  📋 Réservations:     ${(prevData ?? []).length}

${trend} ÉVOLUTION: ${diff >= 0 ? '+' : ''}${diff}€ (${diffPct >= 0 ? '+' : ''}${diffPct}%)

📅 MOIS PROCHAIN (${m3}/${nextYear}):
  🔮 Prévision:        ${nextPrev}€ (${(nextData ?? []).length} résa confirmées)

${unpaidCount > 0 ? `⚠️  IMPAYÉS: ${unpaidCount} client(s) en attente de règlement` : '✅ Aucun impayé en cours'}`;
}

// ─────────────────────────────────────────────
// 6. ALERTE DÉPENSE ANORMALE
// ─────────────────────────────────────────────

export async function checkAnomalies(): Promise<string> {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const m     = String(month).padStart(2, '0');
  const last  = new Date(year, month, 0).getDate();

  // Get last 3 months average
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(now.getMonth() - 3);

  const { data: history } = await supabase
    .from('bookings')
    .select('final_price, start_date')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', threeMonthsAgo.toISOString().split('T')[0])
    .lt('start_date', `${year}-${m}-01`);

  const { data: current } = await supabase
    .from('bookings')
    .select('id, client_name, final_price, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', `${year}-${m}-01`)
    .lte('start_date', `${year}-${m}-${last}`);

  if (!history?.length || !current?.length) return '✅ Pas assez de données pour détecter des anomalies.';

  const histTotal  = (history as any[]).reduce((s, b) => s + (b.final_price ?? 0), 0);
  const histAvgMonth = histTotal / 3;
  const currTotal  = (current as any[]).reduce((s, b) => s + (b.final_price ?? 0), 0);

  const alerts: string[] = [];

  // Alert if current month is 50% below average
  if (currTotal < histAvgMonth * 0.5) {
    alerts.push(`📉 Revenus ce mois (${currTotal}€) sont 50%+ inférieurs à la moyenne (${Math.round(histAvgMonth)}€/mois)`);
  }

  // Alert if a single booking has unusually low price (< 50% of daily average)
  const avgPerBooking = histAvgMonth / Math.max(1, (history as any[]).length / 3);
  const suspiciousBookings = (current as any[]).filter(b => (b.final_price ?? 0) < avgPerBooking * 0.3);
  if (suspiciousBookings.length > 0) {
    suspiciousBookings.forEach(b => {
      alerts.push(`⚠️ Réservation suspecte: ${b.client_name} — ${(b as any).cars?.name ?? '?'} — ${b.final_price}€ (très bas par rapport à la moyenne)`);
    });
  }

  if (alerts.length === 0) return `✅ Aucune anomalie détectée.\n  Mois en cours: ${currTotal}€ | Moyenne mensuelle: ${Math.round(histAvgMonth)}€`;

  return `🚨 ALERTES FINANCIÈRES:\n${alerts.join('\n')}`;
}
