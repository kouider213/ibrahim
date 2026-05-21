import PDFDocument from 'pdfkit';
import { supabase } from './supabase.js';

export async function generateRentalContract(
  bookingId: string,
): Promise<{ url: string; clientName: string; buffer: Buffer; contractNumber: string }> {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, cars(name, category)')
    .eq('id', bookingId)
    .single();

  if (error || !booking) throw new Error(`Réservation introuvable: ${bookingId}`);

  const year = new Date().getFullYear();
  const seq  = String(booking['id'] ?? '').slice(-6).toUpperCase();
  const contractNumber = `CTR-${year}-${seq}`;

  const pdfBuffer = await buildContractPDF(booking as Record<string, unknown>, contractNumber);

  const safeName    = String(booking['client_name'] ?? 'client').replace(/[^a-zA-Z0-9]/g, '_');
  const storagePath = `contracts/CTR_${safeName}_${String(booking['start_date'] ?? '')}.pdf`;

  await supabase.storage.createBucket('client-documents', { public: true }).catch(() => {});
  await supabase.storage.from('client-documents').upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });

  const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(storagePath);

  // Log in contracts table
  supabase.from('contracts').insert({
    booking_id:      bookingId,
    contract_number: contractNumber,
    pdf_url:         urlData.publicUrl,
    status:          'draft',
    created_by:      'dzaryx',
  }).then(() => {}, () => {});

  return {
    url:            urlData.publicUrl,
    clientName:     String(booking['client_name'] ?? ''),
    buffer:         pdfBuffer,
    contractNumber,
  };
}

function buildContractPDF(booking: Record<string, unknown>, contractNumber: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];

    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const car      = booking['cars'] as Record<string, string> | undefined;
    const carName  = car?.['name'] ?? String(booking['car_id'] ?? '—');
    const startDate = String(booking['start_date'] ?? '');
    const endDate   = String(booking['end_date']   ?? '');
    const days = Math.max(1, Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ));
    const total   = Number(booking['final_price']  ?? 0);
    const paid    = Number(booking['paid_amount']  ?? 0);
    const daily   = days > 0 ? Math.round(total / days) : total;
    const reste   = total - paid;
    const emitted = new Date().toLocaleDateString('fr-FR');

    // ── EN-TÊTE ──────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111')
      .text('FIK CONCIERGERIE', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#888888')
      .text('AutoLux Location — Oran, Algérie', { align: 'center' });
    doc.moveDown(0.3);
    hr(doc, 2, '#111111');
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111')
      .text('CONTRAT DE LOCATION DE VEHICULE', { align: 'center' });
    hr(doc, 2, '#111111');
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(9).fillColor('#555555')
      .text(`N° Contrat: ${contractNumber}`, { continued: true })
      .text(`Date: ${emitted}`, { align: 'right' });
    doc.moveDown(0.8);

    // ── PARTIES ──────────────────────────────────────────────────
    sectionTitle(doc, 'PARTIES AU CONTRAT');
    rowBold(doc, 'Bailleur', 'Fik Conciergerie — AutoLux Location, Oran');
    row(doc, 'Représenté par', 'La direction');
    doc.moveDown(0.5);
    rowBold(doc, 'Locataire', String(booking['client_name'] ?? '—'));
    row(doc, 'Téléphone', String(booking['client_phone'] ?? '—'));
    doc.moveDown(0.8);

    // ── VÉHICULE ─────────────────────────────────────────────────
    sectionTitle(doc, 'VÉHICULE LOUÉ');
    row(doc, 'Véhicule',          carName);
    row(doc, 'Début de location', fmtDate(startDate));
    row(doc, 'Fin de location',   fmtDate(endDate));
    row(doc, 'Durée',             `${days} jour${days > 1 ? 's' : ''}`);
    doc.moveDown(0.8);

    // ── TARIF ────────────────────────────────────────────────────
    sectionTitle(doc, 'CONDITIONS FINANCIÈRES');
    row(doc, 'Tarif journalier',  `${daily} EUR`);
    rowBold(doc, 'Montant total', `${total} EUR`);
    row(doc, 'Acompte versé',     paid > 0 ? `${paid} EUR` : 'Aucun');
    if (reste > 0) {
      rowBold(doc, 'Solde restant dû', `${reste} EUR`);
    } else {
      row(doc, 'Solde', 'Réglé intégralement');
    }
    doc.moveDown(0.8);

    // ── CONDITIONS GÉNÉRALES ─────────────────────────────────────
    sectionTitle(doc, 'CONDITIONS GÉNÉRALES DE LOCATION');
    doc.font('Helvetica').fontSize(8.5).fillColor('#333333');
    const cg = [
      '1. RESTITUTION DU CARBURANT: Le véhicule doit être restitué avec le même niveau de carburant qu\'à la prise en charge. Dans le cas contraire, le carburant manquant sera facturé au tarif en vigueur majoré de 20%.',
      '2. CAUTION ET DOCUMENTS: Le passeport ou la carte d\'identité nationale du locataire est conservé par l\'agence pendant toute la durée de la location à titre de garantie.',
      '3. RETARD DE RETOUR: Tout dépassement de la date de retour convenue sera automatiquement facturé au tarif journalier en vigueur. Un retard de plus de 2h est considéré comme un jour supplémentaire.',
      '4. RESPONSABILITÉ: L\'agence décline toute responsabilité pour les infractions au Code de la Route, contraventions ou dommages causés à des tiers pendant la période de location.',
      '5. DOMMAGES: En cas de dommages constatés à la restitution du véhicule qui n\'étaient pas présents lors de la remise, les frais de réparation seront à la charge du locataire.',
      '6. PANNE ET ACCIDENT: En cas de panne ou d\'accident, le locataire doit contacter immédiatement l\'agence au numéro fourni lors de la remise des clés. Le véhicule ne doit pas être abandonné sans accord préalable.',
      '7. USAGE DU VÉHICULE: Le véhicule est mis à disposition pour un usage personnel et non professionnel. Toute sous-location est strictement interdite.',
      '8. JURIDICTION: En cas de litige, les tribunaux d\'Oran sont seuls compétents.',
    ];

    for (const clause of cg) {
      doc.text(clause, 55, doc.y, { width: 490 });
      doc.moveDown(0.3);
    }

    doc.moveDown(0.5);

    // ── SIGNATURES ───────────────────────────────────────────────
    sectionTitle(doc, 'SIGNATURES');
    doc.font('Helvetica').fontSize(9).fillColor('#333333');

    const sigY = doc.y + 10;

    // Bailleur (gauche)
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111')
      .text('LE BAILLEUR', 55, sigY);
    doc.font('Helvetica').fontSize(8.5).fillColor('#555555')
      .text('Fik Conciergerie', 55, sigY + 14)
      .text('Date: _______________', 55, sigY + 28)
      .text('Signature: _______________', 55, sigY + 42);

    // Locataire (droite)
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111')
      .text('LE LOCATAIRE', 330, sigY);
    doc.font('Helvetica').fontSize(8.5).fillColor('#555555')
      .text(String(booking['client_name'] ?? ''), 330, sigY + 14)
      .text('Date: _______________', 330, sigY + 28)
      .text('Signature: _______________', 330, sigY + 42);

    // ── PIED DE PAGE ─────────────────────────────────────────────
    doc.font('Helvetica').fontSize(7).fillColor('#cccccc')
      .text(
        `Fik Conciergerie — ${contractNumber} — Document généré par Dzaryx IA — ${emitted}`,
        50, 775, { align: 'center', width: 495 },
      );

    doc.end();
  });
}

function hr(doc: InstanceType<typeof PDFDocument>, weight: number, color: string): void {
  doc.moveDown(0.2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(weight).strokeColor(color).stroke();
  doc.moveDown(0.3);
}

function sectionTitle(doc: InstanceType<typeof PDFDocument>, title: string): void {
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111111').text(title);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
  doc.moveDown(0.4);
}

function row(doc: InstanceType<typeof PDFDocument>, label: string, value: string): void {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#777777').text(`${label}:`, 55, y, { width: 150 });
  doc.font('Helvetica').fontSize(9.5).fillColor('#222222').text(value, 210, y, { width: 335 });
}

function rowBold(doc: InstanceType<typeof PDFDocument>, label: string, value: string): void {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#333333').text(`${label}:`, 55, y, { width: 150 });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111111').text(value, 210, y, { width: 335 });
}

function fmtDate(d: string): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return d; }
}
