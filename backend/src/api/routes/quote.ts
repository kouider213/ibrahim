// PDF de devis (conciergerie multi-service). Génère un PDF pro, l'uploade (bucket public), renvoie l'URL.
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

interface Line { label: string; amount: number; currency: string; }
const sym = (c: string) => (c === 'EUR' ? 'EUR' : c === 'USD' ? 'USD' : 'DA');

function buildQuotePDF(clientName: string, lines: Line[], ref: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text('FIK CONCIERGERIE', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#888').text('Location · Vente · Immobilier · Packs séjour — Oran, Algérie', { align: 'center' });
    doc.moveDown(0.4);
    doc.rect(50, doc.y, 495, 2).fill('#caa53d'); doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111').text('DEVIS', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`N° ${ref}`, { continued: true }).text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, { align: 'right' });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(11).fillColor('#222').text(`Client : ${clientName || '—'}`);
    doc.moveDown(0.6);

    // En-tête tableau
    const x0 = 50, xAmt = 430;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#555');
    doc.text('PRESTATION', x0, doc.y, { continued: true }).text('MONTANT', xAmt - x0 + 50, doc.y, { align: 'right' });
    doc.moveDown(0.2); doc.rect(50, doc.y, 495, 1).fill('#ddd'); doc.moveDown(0.4);

    const byCur: Record<string, number> = {};
    doc.font('Helvetica').fontSize(11).fillColor('#222');
    for (const l of lines) {
      const y = doc.y;
      doc.text(l.label, x0, y, { width: 340 });
      doc.text(`${Math.round(l.amount).toLocaleString('fr-FR')} ${sym(l.currency)}`, xAmt, y, { width: 95, align: 'right' });
      doc.moveDown(0.3);
      byCur[l.currency] = (byCur[l.currency] || 0) + l.amount;
    }
    doc.moveDown(0.3); doc.rect(50, doc.y, 495, 1).fill('#ddd'); doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111');
    for (const [cur, v] of Object.entries(byCur)) {
      const y = doc.y;
      doc.text('TOTAL', x0, y, { continued: false });
      doc.text(`${Math.round(v).toLocaleString('fr-FR')} ${sym(cur)}`, xAmt, y, { width: 95, align: 'right' });
      doc.moveDown(0.4);
    }
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor('#888')
      .text('Devis valable 7 jours. Pour confirmer, contactez-nous sur WhatsApp.', { align: 'center' })
      .text('Fik Conciergerie — Rue Derbouz Draoua, Houari, Oran 31300', { align: 'center' });
    doc.end();
  });
}

router.post('/pdf', requireMobileAuth, async (req, res) => {
  const { client_name, lines } = (req.body ?? {}) as { client_name?: string; lines?: Line[] };
  const valid = (lines ?? []).filter(l => l && l.label && Number(l.amount) > 0).map(l => ({ label: String(l.label), amount: Number(l.amount), currency: l.currency || 'DZD' }));
  if (valid.length === 0) { res.status(400).json({ error: 'au moins une ligne requise' }); return; }
  try {
    const ref = 'DEV-' + Date.now().toString(36).toUpperCase().slice(-6);
    const buffer = await buildQuotePDF(client_name || 'Client', valid, ref);
    const path = `quotes/${ref}.pdf`;
    await supabase.storage.createBucket('client-documents', { public: true }).catch(() => {});
    const up = await supabase.storage.from('client-documents').upload(path, buffer, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw new Error(up.error.message);
    const { data } = supabase.storage.from('client-documents').getPublicUrl(path);
    // Historique (best-effort, ne bloque pas si la table n'existe pas encore)
    const byCur: Record<string, number> = {};
    for (const l of valid) byCur[l.currency] = (byCur[l.currency] || 0) + l.amount;
    const mainCur = Object.keys(byCur)[0] || 'DZD';
    supabase.from('quotes').insert({ ref, client_name: client_name || null, total: byCur[mainCur] || 0, currency: mainCur, url: data.publicUrl, lines: valid }).then(() => {}, () => {});
    res.json({ url: data.publicUrl, ref });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /api/quote/list — historique des devis
router.get('/list', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase.from('quotes').select('id, ref, client_name, total, currency, url, created_at').order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    res.json({ quotes: data ?? [] });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

export default router;
