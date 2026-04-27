import PDFDocument from 'pdfkit';
import { supabase } from './supabase.js';

export async function generateReservationVoucher(
  bookingId: string,
): Promise<{ url: string; clientName: string; buffer: Buffer }> {
  // 1. Réservation + voiture
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, cars(name, category)')
    .eq('id', bookingId)
    .single();

  if (error || !booking) throw new Error(`Réservation introuvable: ${bookingId}`);

  // 2. Infos passeport/permis (OCR déjà fait)
  let passportInfo: Record<string, string> = {};
  const firstName = String(booking['client_name'] ?? '').split(' ')[0] ?? '';
  const { data: docs } = await supabase
    .from('client_documents')
    .select('notes, type')
    .ilike('client_name', `%${firstName}%`)
    .in('type', ['passport', 'license'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (docs?.[0]?.notes) {
    try { passportInfo = JSON.parse(String(docs[0].notes)) as Record<string, string>; } catch { /* ignore */ }
  }

  // 3. Générer PDF
  const pdfBuffer: Buffer = await buildPDF(booking as Record<string, unknown>, passportInfo);

  // 4. Upload Supabase Storage (bucket client-documents, dossier vouchers/)
  const safeName    = String(booking['client_name'] ?? 'client').replace(/[^a-zA-Z0-9]/g, '_');
  const storagePath = `vouchers/BON_${safeName}_${String(booking['start_date'] ?? '')}.pdf`;

  await supabase.storage.createBucket('client-documents', { public: true }).catch(() => {});
  await supabase.storage.from('client-documents').upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });

  const { data: urlData } = supabase.storage.from('client-documents').getPublicUrl(storagePath);

  return { url: urlData.publicUrl, clientName: String(booking['client_name'] ?? ''), buffer: pdfBuffer };
}

// ── Construction PDF ──────────────────────────────────────────────────────────

function buildPDF(booking: Record<string, unknown>, passport: Record<string, string>): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];

    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const car     = (booking['cars'] as Record<string, string> | undefined);
    const carName = car?.['name'] ?? String(booking['car_id'] ?? '—');
    const carCat  = car?.['category'] ?? '';

    const startDate = String(booking['start_date'] ?? '');
    const endDate   = String(booking['end_date']   ?? '');
    const days = Math.max(1, Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ));
    const total   = Number(booking['final_price']  ?? 0);
    const paid    = Number(booking['paid_amount']   ?? 0);
    const daily   = days > 0 ? Math.round(total / days) : total;
    const refNo   = `BK-${new Date().getFullYear()}-${String(booking['id'] ?? '').slice(-6).toUpperCase()}`;
    const emitted = new Date().toLocaleDateString('fr-FR');

    // ── EN-TÊTE ──────────────────────────────────────────────────
    doc
      .font('Helvetica-Bold').fontSize(22).fillColor('#111111')
      .text('FIK CONCIERGERIE', { align: 'center' });
    doc
      .font('Helvetica').fontSize(10).fillColor('#888888')
      .text('AutoLux Location — Oran, Algerie', { align: 'center' });

    doc.moveDown(0.4);
    hr(doc, 2, '#111111');

    doc
      .font('Helvetica-Bold').fontSize(15).fillColor('#111111')
      .text('BON DE RESERVATION / CONTRAT DE LOCATION', { align: 'center' });

    hr(doc, 2, '#111111');
    doc.moveDown(0.4);

    doc
      .font('Helvetica').fontSize(9).fillColor('#555555')
      .text(`Reference: ${refNo}`, { continued: true })
      .text(`Emis le: ${emitted}`, { align: 'right' });

    doc.moveDown(1);

    // ── CLIENT ───────────────────────────────────────────────────
    sectionTitle(doc, 'INFORMATIONS CLIENT');
    row(doc, 'Nom complet',    String(booking['client_name'] ?? '—'));
    row(doc, 'N° Passeport',   passport['passport_number'] || passport['license_number'] || '—');
    row(doc, 'Date naissance', passport['birth_date']   || '—');
    row(doc, 'Nationalite',    passport['nationality']  || '—');
    row(doc, 'Telephone',      String(booking['client_phone'] ?? '—'));

    doc.moveDown(0.8);

    // ── VEHICULE ─────────────────────────────────────────────────
    sectionTitle(doc, 'VEHICULE & PERIODE DE LOCATION');
    row(doc, 'Vehicule',         carName);
    if (carCat) row(doc, 'Categorie', carCat);
    row(doc, 'Debut de location', fmtDate(startDate));
    row(doc, 'Fin de location',   fmtDate(endDate));
    row(doc, 'Duree',             `${days} jour${days > 1 ? 's' : ''}`);

    doc.moveDown(0.8);

    // ── TARIF ────────────────────────────────────────────────────
    sectionTitle(doc, 'TARIFICATION');
    row(doc, 'Prix par jour',   `${daily} EUR`);
    rowBold(doc, 'TOTAL',       `${total} EUR`);
    rowBold(doc, 'Caution versee', paid > 0 ? `${paid} EUR` : 'Aucune');

    doc.moveDown(0.6);

    // Phrase explicative paiement
    const reste = total - paid;
    if (paid > 0 && reste > 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#222222')
        .text(
          `Un montant de ${paid} EUR a ete verse a titre de caution afin de reserver le vehicule. Le reste de ${reste} EUR est a regler a la restitution des cles.`,
          55, doc.y, { width: 490 },
        );
    } else if (paid >= total) {
      doc.font('Helvetica').fontSize(10).fillColor('#222222')
        .text('Le montant total a ete regle integralement.', 55, doc.y, { width: 490 });
    } else {
      doc.font('Helvetica').fontSize(10).fillColor('#222222')
        .text(`Le montant total de ${total} EUR est a regler a la restitution des cles.`, 55, doc.y, { width: 490 });
    }

    doc.moveDown(1);

    // ── CONDITIONS ───────────────────────────────────────────────
    sectionTitle(doc, 'CONDITIONS DE LOCATION');
    doc.font('Helvetica').fontSize(9).fillColor('#444444')
      .text('1. Le vehicule doit etre restitue avec le meme niveau de carburant qu\'a la prise en charge.')
      .text('2. Le passeport du locataire est conserve par l\'agence pendant toute la duree de la location.')
      .text('3. Tout depassement de la date de retour sera facture au tarif journalier en vigueur.')
      .text("4. L'agence decline toute responsabilite en cas d'infraction commise pendant la location.")
      .text('5. En cas de panne ou accident, contacter immediatement l\'agence.');

    doc.moveDown(1.5);

    // ── PIED DE PAGE ─────────────────────────────────────────────
    doc.font('Helvetica').fontSize(7).fillColor('#cccccc')
      .text(`Fik Conciergerie — AutoLux Location Oran — Ref: ${refNo} — Document genere par Ibrahim IA`, 50, 770, {
        align: 'center', width: 495,
      });

    doc.end();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr(doc: InstanceType<typeof PDFDocument>, weight: number, color: string): void {
  doc.moveDown(0.2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(weight).strokeColor(color).stroke();
  doc.moveDown(0.3);
}

function sectionTitle(doc: InstanceType<typeof PDFDocument>, title: string): void {
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(title);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
  doc.moveDown(0.4);
}

function row(doc: InstanceType<typeof PDFDocument>, label: string, value: string): void {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#777777').text(`${label}:`, 55, y, { width: 150 });
  doc.font('Helvetica').fontSize(10).fillColor('#222222').text(value, 210, y, { width: 335 });
}

function rowBold(doc: InstanceType<typeof PDFDocument>, label: string, value: string): void {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(`${label}:`, 55, y, { width: 150 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(value, 210, y, { width: 335 });
}

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return d; }
}

