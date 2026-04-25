/**
 * PHASE 5 — Ibrahim gère tes finances
 * 1. Suivi encaissements & acomptes
 * 2. Calcul CA automatique (semaine/mois/année/véhicule)
 * 3. Relance clients impayés
 * 4. Génération reçu PDF simple
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
    .select('id, client_name, client_phone, final_price, paid_amount, payment_status, last_payment_date, start_date, end_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED']);

  if (bookingId) query = query.eq('id', bookingId);

  const { data, error } = await query.order('start_date', { ascending: false }).limit(20);
  if (error) return `Erreur: ${error.message}`;
  if (!data?.length) return 'Aucune réservation trouvée.';

  const rows = (data as any[]).map(b => {
    const paid      = b.paid_amount ?? 0;
    const total     = b.final_price ?? 0;
    const remaining = total - paid;
    const st        = paid >= total ? '✅ PAYÉ' : paid > 0 ? '⚠️ PARTIEL' : '❌ IMPAYÉ';
    const car       = (b as any).cars?.name ?? '?';
    return `- ${b.client_name} | ${car} | ${b.start_date}→${b.end_date} | Total: ${total}€ | Payé: ${paid}€ | Reste: ${remaining}€ | ${st}`;
  });

  const totalImpaye = (data as any[]).reduce((sum, b) => {
    const paid  = b.paid_amount ?? 0;
    const total = b.final_price ?? 0;
    return sum + Math.max(0, total - paid);
  }, 0);

  return `💰 ENCAISSEMENTS (${data.length} réservations):\n${rows.join('\n')}\n\n💸 Total restant à encaisser: ${totalImpaye}€`;
}

export async function recordPayment(
  bookingId: string,
  amount: number,
  type: 'acompte' | 'solde' | 'partiel' = 'partiel',
  note?: string
): Promise<string> {
  if (!bookingId) return '❌ booking_id manquant';
  if (!amount || amount <= 0) return '❌ Le montant doit être supérieur à 0';

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, client_name, final_price, paid_amount, acompte_amount')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) return `Réservation introuvable: ${fetchErr?.message}`;

  const b           = booking as any;
  const currentPaid = b.paid_amount ?? 0;
  const newPaid     = currentPaid + amount;
  const total       = b.final_price ?? 0;
  const newStatus   = newPaid >= total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'PENDING';

  // Mise à jour acompte si c'est un acompte
  const updateData: any = {
    paid_amount:       newPaid,
    payment_status:    newStatus,
    last_payment_date: new Date().toISOString().split('T')[0],
    payment_notes:     note ?? null,
    solde_paid:        newPaid >= total,
  };

  if (type === 'acompte') {
    updateData.acompte_amount = (b.acompte_amount ?? 0) + amount;
    updateData.acompte_date   = new Date().toISOString().split('T')[0];
  }

  // Log dans payment_logs
  await supabase.from('payment_logs').insert({
    booking_id:     bookingId,
    amount,
    payment_date:   new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    note:           `[${type}] ${note ?? ''}`.trim(),
  });

  const { error } = await supabase
    .from('bookings')
    .update(updateData)
    .eq('id', bookingId);

  if (error) return `Erreur enregistrement paiement: ${error.message}`;

  const remaining = total - newPaid;
  const statusEmoji = newStatus === 'PAID' ? '✅' : '⚠️';

  return `${statusEmoji} Paiement enregistré!\n` +
    `👤 Client: ${b.client_name}\n` +
    `💵 Type: ${type.toUpperCase()}\n` +
    `➕ Montant encaissé: +${amount}€\n` +
    `💰 Total payé: ${newPaid}€ / ${total}€\n` +
    `📊 Reste: ${remaining}€\n` +
    `🏷️ Statut: ${newStatus}` +
    (remaining <= 0 ? '\n\n🎉 Réservation entièrement payée!' : '');
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
    .select('*, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', startDate)
    .lte('start_date', endDate)
    .order('start_date');

  if (error) return `Erreur CA: ${error.message}`;
  if (!data?.length) return `Aucune réservation pour ${period}.`;

  // Calcul CA par véhicule
  const byVehicle: Record<string, { count: number; ca: number; profit: number }> = {};
  let totalCA     = 0;
  let totalProfit = 0;
  let totalKouider = 0;
  let totalHouari  = 0;

  for (const b of data as any[]) {
    const carName = b.cars?.name ?? 'Inconnu';
    const price   = b.final_price ?? 0;
    const startDt = new Date(b.start_date);
    const endDt   = new Date(b.end_date);
    const nbDays  = Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000));
    const pricing = getPricingForVehicle(carName);
    const rentedBy = b.rented_by ?? 'Kouider';

    let profit = 0;
    if (pricing) {
      profit = rentedBy === 'Kouider' ? pricing.benefit * nbDays : 0;
    }

    if (!byVehicle[carName]) byVehicle[carName] = { count: 0, ca: 0, profit: 0 };
    byVehicle[carName].count++;
    byVehicle[carName].ca += price;
    byVehicle[carName].profit += profit;

    totalCA     += price;
    totalProfit += profit;
    if (rentedBy === 'Kouider') totalKouider++;
    else totalHouari++;
  }

  // Trier par CA décroissant
  const vehicleRows = Object.entries(byVehicle)
    .sort(([, a], [, b]) => b.ca - a.ca)
    .map(([name, v]) => `  - ${name}: ${v.count} loc. | CA: ${v.ca}€ | Bénéfice Kouider: ${v.profit}€`);

  return `📊 CHIFFRE D'AFFAIRES — ${period}\n` +
    `${'─'.repeat(40)}\n` +
    `📈 CA Total: ${totalCA}€\n` +
    `💰 Bénéfice Kouider: ${totalProfit}€\n` +
    `📋 Réservations: ${data.length} (Kouider: ${totalKouider} | Houari: ${totalHouari})\n\n` +
    `🚗 PAR VÉHICULE:\n${vehicleRows.join('\n')}`;
}

// ─────────────────────────────────────────────
// 3. RELANCE CLIENTS IMPAYÉS
// ─────────────────────────────────────────────

export async function getUnpaidBookings(): Promise<string> {
  const now = new Date();

  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, final_price, paid_amount, payment_status, start_date, end_date, created_at, cars(name)')
    .in('payment_status', ['PENDING', 'PARTIAL'])
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .order('start_date', { ascending: false });

  if (error) return `Erreur: ${error.message}`;
  if (!data?.length) return '✅ Aucun impayé — tout est à jour!';

  const rows = (data as any[]).map(b => {
    const paid      = b.paid_amount ?? 0;
    const total     = b.final_price ?? 0;
    const remaining = total - paid;
    const created   = new Date(b.created_at);
    const hoursAgo  = Math.floor((now.getTime() - created.getTime()) / 3_600_000);
    const daysAgo   = Math.floor(hoursAgo / 24);
    const urgence   = hoursAgo >= 72 ? '🔴' : hoursAgo >= 48 ? '🟡' : '🟢';
    const car       = (b as any).cars?.name ?? '?';

    return `${urgence} ${b.client_name} | ${car} | Reste: ${remaining}€ | Depuis: ${daysAgo}j ${hoursAgo % 24}h | 📱 ${b.client_phone ?? 'N/A'}`;
  });

  const urgent = (data as any[]).filter(b => {
    const hoursAgo = Math.floor((now.getTime() - new Date(b.created_at).getTime()) / 3_600_000);
    return hoursAgo >= 48;
  }).length;

  return `⚠️ IMPAYÉS (${data.length} clients | ${urgent} urgents):\n${rows.join('\n')}\n\n` +
    `🔴 = +72h (relance urgente) | 🟡 = +48h (relance normale) | 🟢 = récent`;
}

// Message de relance WhatsApp
export function generateRelanceMessage(
  clientName: string,
  amount: number,
  carName: string,
  attempt: 1 | 2
): string {
  if (attempt === 1) {
    return `Bonjour ${clientName} 👋\n\nNous vous rappelons que le paiement de ${amount}€ pour la location de votre ${carName} est en attente.\n\nMerci de régulariser votre situation dès que possible.\n\n📞 AutoLux Oran — Fik Conciergerie`;
  } else {
    return `Bonjour ${clientName},\n\nMalgré notre premier rappel, le paiement de ${amount}€ pour la location de votre ${carName} reste impayé.\n\nNous vous demandons de régulariser cette situation dans les plus brefs délais pour éviter toute complication.\n\n📞 AutoLux Oran — Fik Conciergerie`;
  }
}

// ─────────────────────────────────────────────
// 4. GÉNÉRATION REÇU SIMPLE (texte formaté)
// ─────────────────────────────────────────────

export async function generateReceipt(bookingId: string): Promise<string> {
  const { data: b, error } = await supabase
    .from('bookings')
    .select('*, cars(name)')
    .eq('id', bookingId)
    .single();

  if (error || !b) return `Réservation introuvable: ${error?.message}`;

  const booking  = b as any;
  const carName  = booking.cars?.name ?? 'Véhicule';
  const startDt  = new Date(booking.start_date);
  const endDt    = new Date(booking.end_date);
  const nbDays   = Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000));
  const daily    = Math.round(booking.final_price / nbDays);
  const acompte  = booking.acompte_amount ?? 0;
  const solde    = (booking.final_price ?? 0) - acompte;
  const dateStr  = new Date().toLocaleDateString('fr-FR');
  const refNum   = booking.id.split('-')[0].toUpperCase();

  const receipt = `
╔══════════════════════════════════════╗
║        AUTOLUX ORAN — REÇU           ║
║        Fik Conciergerie              ║
╠══════════════════════════════════════╣
  Réf: #${refNum}
  Date: ${dateStr}
──────────────────────────────────────
  CLIENT
  Nom: ${booking.client_name}
  Tél: ${booking.client_phone ?? 'N/A'}
──────────────────────────────────────
  LOCATION
  Véhicule: ${carName}
  Du: ${booking.start_date}
  Au: ${booking.end_date}
  Durée: ${nbDays} jour(s)
  Prix/jour: ${daily}€
──────────────────────────────────────
  PAIEMENT
  Total: ${booking.final_price}€
  Acompte versé: ${acompte}€
  Solde à payer: ${solde}€
  Statut: ${booking.payment_status ?? 'PENDING'}
╚══════════════════════════════════════╝
  Merci pour votre confiance!
  📍 Oran, Algérie
`.trim();

  return receipt;
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

  // Mois courant
  const mm  = String(month).padStart(2, '0');
  const ppm = String(prevMonth).padStart(2, '0');

  const [curRes, prevRes, unpaidRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('final_price, paid_amount, payment_status, rented_by, start_date, end_date, cars(name)')
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .gte('start_date', `${year}-${mm}-01`)
      .lte('start_date', `${year}-${mm}-${new Date(year, month, 0).getDate()}`),
    supabase
      .from('bookings')
      .select('final_price, rented_by, start_date, end_date, cars(name)')
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .gte('start_date', `${prevYear}-${ppm}-01`)
      .lte('start_date', `${prevYear}-${ppm}-${new Date(prevYear, prevMonth, 0).getDate()}`),
    supabase
      .from('bookings')
      .select('final_price, paid_amount')
      .in('payment_status', ['PENDING', 'PARTIAL'])
      .in('status', ['CONFIRMED', 'ACTIVE']),
  ]);

  const curData  = (curRes.data ?? []) as any[];
  const prevData = (prevRes.data ?? []) as any[];
  const unpaid   = (unpaidRes.data ?? []) as any[];

  // Calculs mois courant
  const curCA      = curData.reduce((s, b) => s + (b.final_price ?? 0), 0);
  const curProfit  = curData.reduce((s, b) => {
    const startDt = new Date(b.start_date);
    const endDt   = new Date(b.end_date);
    const nbDays  = Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000));
    const pricing = getPricingForVehicle(b.cars?.name ?? '');
    const rentedBy = b.rented_by ?? 'Kouider';
    return s + (pricing && rentedBy === 'Kouider' ? pricing.benefit * nbDays : 0);
  }, 0);
  const curEncaisse = curData.reduce((s, b) => s + (b.paid_amount ?? 0), 0);

  // Calculs mois précédent
  const prevCA = prevData.reduce((s, b) => s + (b.final_price ?? 0), 0);

  // Évolution
  const evol     = prevCA > 0 ? Math.round(((curCA - prevCA) / prevCA) * 100) : 0;
  const evolEmoji = evol >= 0 ? '📈' : '📉';

  // Impayés
  const totalImpaye = unpaid.reduce((s, b) => s + Math.max(0, (b.final_price ?? 0) - (b.paid_amount ?? 0)), 0);

  // Prévision mois suivant (basée sur mois courant + 10% croissance)
  const nextMonthForecast = Math.round(curCA * 1.1);

  const daysInMonth    = new Date(year, month, 0).getDate();
  const daysElapsed    = now.getDate();
  const dailyAvg       = daysElapsed > 0 ? Math.round(curCA / daysElapsed) : 0;
  const projectedMonth = dailyAvg * daysInMonth;

  return `📊 TABLEAU DE BORD FINANCIER\n` +
    `${'═'.repeat(40)}\n` +
    `📅 ${mm}/${year}\n\n` +
    `💰 REVENUS\n` +
    `  CA Mois courant:    ${curCA}€\n` +
    `  CA Mois précédent:  ${prevCA}€\n` +
    `  Évolution:          ${evolEmoji} ${evol > 0 ? '+' : ''}${evol}%\n` +
    `  Encaissé:           ${curEncaisse}€\n` +
    `  À encaisser:        ${totalImpaye}€\n\n` +
    `💵 BÉNÉFICE KOUIDER\n` +
    `  Bénéfice mois:      ${curProfit}€\n\n` +
    `🔮 PRÉVISIONS\n` +
    `  Projection mois:    ${projectedMonth}€\n` +
    `  Mois prochain (est): ${nextMonthForecast}€\n` +
    `  Moyenne/jour:        ${dailyAvg}€\n\n` +
    `📋 ACTIVITÉ\n` +
    `  Réservations:       ${curData.length}\n` +
    `  Impayés:            ${unpaid.length} client(s) (${totalImpaye}€)`;
}

// ─────────────────────────────────────────────
// 6. ALERTE DÉPENSE ANORMALE
// ─────────────────────────────────────────────

export async function checkAnomalies(): Promise<string> {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const mm    = String(month).padStart(2, '0');

  const { data, error } = await supabase
    .from('bookings')
    .select('client_name, final_price, start_date, end_date, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
    .gte('start_date', `${year}-${mm}-01`)
    .lte('start_date', `${year}-${mm}-${new Date(year, month, 0).getDate()}`);

  if (error) return `Erreur: ${error.message}`;
  if (!data?.length) return 'Aucune donnée pour analyse.';

  const alerts: string[] = [];

  for (const b of data as any[]) {
    const total   = b.final_price ?? 0;
    const startDt = new Date(b.start_date);
    const endDt   = new Date(b.end_date);
    const nbDays  = Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000));
    const daily   = Math.round(total / nbDays);
    const carName = b.cars?.name ?? '?';
    const pricing = getPricingForVehicle(carName);

    // Alerte si prix journalier très différent du prix catalogue
    if (pricing) {
      const expected = pricing.kouiderPrice;
      const diff     = Math.abs(daily - expected);
      const pct      = Math.round((diff / expected) * 100);
      if (pct > 30) {
        alerts.push(`⚠️ ${b.client_name} | ${carName} | ${daily}€/j vs catalogue ${expected}€/j (écart ${pct}%)`);
      }
    }

    // Alerte si montant total > 2000€
    if (total > 2000) {
      alerts.push(`🔴 Réservation importante: ${b.client_name} | ${carName} | ${total}€ total`);
    }
  }

  if (!alerts.length) return '✅ Aucune anomalie détectée ce mois-ci.';
  return `🚨 ANOMALIES DÉTECTÉES (${alerts.length}):\n${alerts.join('\n')}`;
}

// ─────────────────────────────────────────────
// 7. GÉNÉRATION PDF FACTURE
// ─────────────────────────────────────────────

export async function generatePdfReceipt(bookingId: string): Promise<{ url: string; text: string }> {
  const { data: b, error } = await supabase
    .from('bookings').select('*, cars(name)').eq('id', bookingId).single();

  if (error || !b) throw new Error(`Réservation introuvable: ${error?.message}`);

  const booking  = b as any;
  const carName  = booking.cars?.name ?? 'Véhicule';
  const startDt  = new Date(booking.start_date);
  const endDt    = new Date(booking.end_date);
  const nbDays   = Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000));
  const daily    = Math.round((booking.final_price ?? 0) / nbDays);
  const acompte  = booking.acompte_amount ?? 0;
  const solde    = (booking.final_price ?? 0) - acompte;
  const refNum   = booking.id.split('-')[0].toUpperCase();
  const dateStr  = new Date().toLocaleDateString('fr-FR');

  // Génération PDF avec pdfkit
  const PDFDocument = (await import('pdfkit')).default;
  const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // En-tête
    doc.fontSize(22).font('Helvetica-Bold').text('AUTOLUX ORAN', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Fik Conciergerie — Location de véhicules', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Référence et date
    doc.fontSize(11).font('Helvetica-Bold').text(`FACTURE / REÇU  #${refNum}`, { continued: true });
    doc.font('Helvetica').text(`     Date: ${dateStr}`, { align: 'right' });
    doc.moveDown(1);

    // Client
    doc.fontSize(12).font('Helvetica-Bold').text('CLIENT');
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica')
      .text(`Nom:       ${booking.client_name}`)
      .text(`Téléphone: ${booking.client_phone ?? 'N/A'}`)
      .text(`Âge:       ${booking.client_age ?? 'N/A'}`);
    doc.moveDown(1);

    // Location
    doc.fontSize(12).font('Helvetica-Bold').text('DÉTAIL DE LA LOCATION');
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica')
      .text(`Véhicule:    ${carName}`)
      .text(`Début:       ${booking.start_date}`)
      .text(`Fin:         ${booking.end_date}`)
      .text(`Durée:       ${nbDays} jour(s)`)
      .text(`Prix/jour:   ${daily} €`);
    doc.moveDown(1);

    // Paiement
    doc.fontSize(12).font('Helvetica-Bold').text('PAIEMENT');
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica')
      .text(`Total:          ${booking.final_price ?? 0} €`)
      .text(`Acompte versé:  ${acompte} €`)
      .text(`Solde restant:  ${solde} €`)
      .text(`Statut:         ${booking.payment_status ?? 'PENDING'}`);
    doc.moveDown(1.5);

    // Pied de page
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('gray')
      .text('Merci pour votre confiance — AutoLux Oran, Algérie', { align: 'center' });

    doc.end();
  });

  // Upload Supabase Storage
  const storagePath = `receipts/${bookingId}.pdf`;
  const BUCKET = 'client-documents';

  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  await supabase.storage.from(BUCKET).upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const url = urlData.publicUrl;

  // Sauvegarder l'URL dans la réservation
  await supabase.from('bookings').update({ pdf_url: url }).eq('id', bookingId);

  const text = `✅ Facture PDF générée pour ${booking.client_name}\n🔗 ${url}`;
  return { url, text };
}

// ─────────────────────────────────────────────
// 8. DONNÉES STRUCTURÉES POUR LE DASHBOARD MOBILE
// ─────────────────────────────────────────────

export interface DashboardData {
  month: number; year: number;
  ca:       { current: number; previous: number; evolution: number };
  payments: { collected: number; outstanding: number };
  profit:   number;
  forecast: { projected: number; nextMonth: number; dailyAvg: number };
  unpaid:   Array<{ id: string; name: string; car: string; amount: number; phone?: string }>;
  vehicles: Array<{ name: string; ca: number; bookings: number }>;
  bookingCount: number;
}

export async function getDashboardData(): Promise<DashboardData> {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const mm  = String(month).padStart(2, '0');
  const ppm = String(prevMonth).padStart(2, '0');

  const [curRes, prevRes, unpaidRes] = await Promise.all([
    supabase.from('bookings')
      .select('id, final_price, paid_amount, payment_status, rented_by, start_date, end_date, cars(name)')
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .gte('start_date', `${year}-${mm}-01`)
      .lte('start_date', `${year}-${mm}-${new Date(year, month, 0).getDate()}`),
    supabase.from('bookings')
      .select('final_price, rented_by, start_date, end_date, cars(name)')
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .gte('start_date', `${prevYear}-${ppm}-01`)
      .lte('start_date', `${prevYear}-${ppm}-${new Date(prevYear, prevMonth, 0).getDate()}`),
    supabase.from('bookings')
      .select('id, client_name, client_phone, final_price, paid_amount, cars(name)')
      .in('payment_status', ['PENDING', 'PARTIAL'])
      .in('status', ['CONFIRMED', 'ACTIVE']),
  ]);

  const cur    = (curRes.data ?? [])    as any[];
  const prev   = (prevRes.data ?? [])   as any[];
  const unpaid = (unpaidRes.data ?? []) as any[];

  const curCA    = cur.reduce((s, b) => s + (b.final_price ?? 0), 0);
  const prevCA   = prev.reduce((s, b) => s + (b.final_price ?? 0), 0);
  const evol     = prevCA > 0 ? Math.round(((curCA - prevCA) / prevCA) * 100) : 0;
  const collected = cur.reduce((s, b) => s + (b.paid_amount ?? 0), 0);
  const outstanding = unpaid.reduce((s, b) => s + Math.max(0, (b.final_price ?? 0) - (b.paid_amount ?? 0)), 0);

  const profit = cur.reduce((s, b) => {
    const days = Math.max(1, Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000));
    const p    = getPricingForVehicle(b.cars?.name ?? '');
    return s + (p && (b.rented_by ?? 'Kouider') === 'Kouider' ? p.benefit * days : 0);
  }, 0);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyAvg    = now.getDate() > 0 ? Math.round(curCA / now.getDate()) : 0;

  // Répartition par véhicule
  const vehicleMap: Record<string, { ca: number; bookings: number }> = {};
  for (const b of cur) {
    const name = (b.cars as any)?.name ?? 'Inconnu';
    if (!vehicleMap[name]) vehicleMap[name] = { ca: 0, bookings: 0 };
    vehicleMap[name]!.ca += b.final_price ?? 0;
    vehicleMap[name]!.bookings++;
  }
  const vehicles = Object.entries(vehicleMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.ca - a.ca);

  return {
    month, year,
    ca:       { current: curCA, previous: prevCA, evolution: evol },
    payments: { collected, outstanding },
    profit,
    forecast: { projected: dailyAvg * daysInMonth, nextMonth: Math.round(curCA * 1.1), dailyAvg },
    unpaid:   unpaid.map(b => ({
      id: b.id, name: b.client_name, car: (b.cars as any)?.name ?? '?',
      amount: Math.max(0, (b.final_price ?? 0) - (b.paid_amount ?? 0)),
      phone: b.client_phone ?? undefined,
    })),
    vehicles,
    bookingCount: cur.length,
  };
}
