// Bon de réservation (confirmation de réservation véhicule + acompte).
// Génère un PDF pro, l'uploade (bucket public), renvoie l'URL. Mirroir de quote.ts.
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

const sym = (c: string) => (c === 'EUR' ? 'EUR' : c === 'USD' ? 'USD' : 'DA');
const money = (n: number, c: string) => `${Math.round(n).toLocaleString('fr-FR')} ${sym(c)}`;

interface VoucherData {
  first_name?: string;
  last_name?: string;
  passport?: string;
  phone?: string;
  vehicle?: string;
  start_date?: string;
  end_date?: string;
  pickup?: string;   // lieu de récupération
  dropoff?: string;  // lieu de dépôt
  total?: number;
  deposit?: number;
  currency?: string;
}

function buildVoucherPDF(d: VoucherData, ref: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const cur = d.currency || 'DZD';
    const fullName = [d.first_name, d.last_name].filter(Boolean).join(' ') || '—';
    const total = Number(d.total) || 0;
    const deposit = Number(d.deposit) || 0;
    const reste = total > 0 ? Math.max(0, total - deposit) : null;

    // En-tête marque
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text('FIK CONCIERGERIE', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#888').text('Location · Vente · Immobilier · Packs séjour — Oran, Algérie', { align: 'center' });
    doc.moveDown(0.4);
    doc.rect(50, doc.y, 495, 2).fill('#caa53d'); doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111').text('BON DE RÉSERVATION', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`N° ${ref}`, { continued: true }).text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, { align: 'right' });
    doc.moveDown(0.8);

    // Bloc infos client
    const row = (label: string, value: string) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#555').text(label, 50, y, { width: 160 });
      doc.font('Helvetica').fontSize(11).fillColor('#111').text(value || '—', 215, y, { width: 330 });
      doc.moveDown(0.55);
    };

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#caa53d').text('CLIENT'); doc.moveDown(0.3);
    row('Nom et prénom', fullName);
    row('N° de passeport', d.passport || '—');
    if (d.phone) row('Téléphone', d.phone);

    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#caa53d').text('RÉSERVATION'); doc.moveDown(0.3);
    row('Véhicule', d.vehicle || '—');
    if (d.start_date || d.end_date) row('Période', `${d.start_date || '—'}  →  ${d.end_date || '—'}`);
    row('Lieu de récupération', d.pickup || '—');
    row('Lieu de dépôt', d.dropoff || '—');

    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#caa53d').text('PAIEMENT'); doc.moveDown(0.3);
    if (total > 0) row('Montant total', money(total, cur));
    row('Acompte versé', money(deposit, cur));
    if (reste != null) row('Reste à payer', money(reste, cur));

    doc.moveDown(0.8);
    doc.rect(50, doc.y, 495, 1).fill('#ddd'); doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(9.5).fillColor('#444')
      .text('Ce bon confirme la réservation du véhicule ci-dessus avec l\'acompte indiqué. '
        + 'Le solde est réglé à la prise du véhicule. Passeport et permis valides requis. Sans caution.', { align: 'left' });
    doc.moveDown(1.2);

    // Signatures
    const yS = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor('#888');
    doc.text('Signature client', 60, yS + 28);
    doc.text('Fik Conciergerie', 360, yS + 28);
    doc.rect(60, yS + 24, 150, 0.8).fill('#bbb');
    doc.rect(360, yS + 24, 150, 0.8).fill('#bbb');

    doc.moveDown(4);
    doc.font('Helvetica').fontSize(8.5).fillColor('#999')
      .text('Fik Conciergerie — Rue Derbouz Draoua, Houari, Oran 31300 · WhatsApp +32 466 31 14 69', 50, doc.y, { align: 'center' });
    doc.end();
  });
}

router.post('/pdf', requireMobileAuth, async (req, res) => {
  const b = (req.body ?? {}) as VoucherData;
  if (!b.vehicle || (!b.first_name && !b.last_name)) {
    res.status(400).json({ error: 'véhicule + nom du client requis' }); return;
  }
  try {
    const ref = 'BON-' + Date.now().toString(36).toUpperCase().slice(-6);
    const data: VoucherData = { ...b, currency: b.currency || 'DZD' };
    const buffer = await buildVoucherPDF(data, ref);
    const path = `vouchers/${ref}.pdf`;
    await supabase.storage.createBucket('client-documents', { public: true }).catch(() => {});
    const up = await supabase.storage.from('client-documents').upload(path, buffer, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw new Error(up.error.message);
    const { data: pub } = supabase.storage.from('client-documents').getPublicUrl(path);
    // Historique (best-effort, ne bloque pas si la table n'existe pas)
    supabase.from('reservation_vouchers').insert({
      ref,
      client_name: [b.first_name, b.last_name].filter(Boolean).join(' ') || null,
      passport: b.passport || null,
      vehicle: b.vehicle || null,
      deposit: Number(b.deposit) || 0,
      total: Number(b.total) || 0,
      currency: data.currency,
      pickup: b.pickup || null,
      dropoff: b.dropoff || null,
      url: pub.publicUrl,
    }).then(() => {}, () => {});
    res.json({ url: pub.publicUrl, ref });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /api/reservation-voucher/list — historique (vide si table absente)
router.get('/list', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase.from('reservation_vouchers')
      .select('id, ref, client_name, vehicle, deposit, total, currency, url, created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) { res.json({ vouchers: [] }); return; }
    res.json({ vouchers: data ?? [] });
  } catch { res.json({ vouchers: [] }); }
});

export default router;
