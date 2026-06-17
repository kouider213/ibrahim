// Bon de réservation (confirmation de réservation véhicule + acompte).
// Génère un PDF pro, l'uploade (bucket public), renvoie l'URL. Mirroir de quote.ts.
import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

const sym = (c: string) => (c === 'EUR' ? 'EUR' : c === 'USD' ? 'USD' : 'DA');
const money = (n: number, c: string) => `${Math.round(n).toLocaleString('fr-FR')} ${sym(c)}`;

// Récupère le logo (PNG/JPEG uniquement — pdfkit ne gère pas SVG/WebP). Best-effort.
async function fetchLogoBuffer(): Promise<Buffer | null> {
  let url = 'https://fikconciergerie.com/logo.png';
  try {
    const { data } = await supabase.from('site_settings').select('logo_url').eq('id', 1).single();
    if (data?.logo_url && /^https?:\/\/.+\.(png|jpe?g)(\?|$)/i.test(data.logo_url)) url = data.logo_url;
  } catch { /* ignore */ }
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!/png|jpe?g/i.test(ct)) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

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

type Row = [string, string] | [string, string, string];

function buildVoucherPDF(d: VoucherData, ref: string, logo: Buffer | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Palette
    const GOLD = '#b8902f', DARK = '#15151b', GREEN = '#1f8b4c';
    const INK = '#1a1a1a', SUB = '#7a7a82', LINE = '#ececef', BOX = '#f7f7f9';
    const X = 50, W = 495, R = X + W; // 545

    const cur = d.currency || 'DZD';
    const fullName = [d.first_name, d.last_name].filter(Boolean).join(' ') || '—';
    const total = Number(d.total) || 0;
    const deposit = Number(d.deposit) || 0;
    const reste = total > 0 ? Math.max(0, total - deposit) : null;

    // ── Accent supérieur ──
    doc.rect(0, 0, doc.page.width, 6).fill(GOLD);

    // ── En-tête marque ──
    let headY = 34;
    if (logo) {
      try { doc.image(logo, X, headY, { fit: [56, 56] }); } catch { /* ignore */ }
    }
    const tx = logo ? X + 70 : X;
    doc.font('Helvetica-Bold').fontSize(19).fillColor(INK).text('FIK CONCIERGERIE', tx, headY + 4);
    doc.font('Helvetica').fontSize(8.5).fillColor(SUB)
      .text('Conciergerie premium · Location · Vente · Immobilier · Import — Oran, Algérie', tx, headY + 28, { width: R - tx });
    doc.font('Helvetica').fontSize(8.5).fillColor(SUB)
      .text('WhatsApp +32 466 31 14 69   ·   fikconciergerie.com', tx, headY + 41, { width: R - tx });

    // ── Titre + bloc référence ──
    let y = 108;
    doc.font('Helvetica-Bold').fontSize(17).fillColor(INK).text('BON DE RÉSERVATION', X, y);
    // Badge "CONFIRMÉ"
    const badgeW = 92, badgeX = R - badgeW;
    doc.roundedRect(badgeX, y - 2, badgeW, 22, 11).fill(GREEN);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#ffffff').text('✓ CONFIRMÉ', badgeX, y + 4, { width: badgeW, align: 'center' });
    y += 28;
    doc.font('Helvetica').fontSize(9.5).fillColor(SUB)
      .text(`N° ${ref}`, X, y, { continued: true })
      .text(`Émis le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'right' });
    y += 20;
    doc.rect(X, y, W, 1.5).fill(GOLD);
    y += 16;

    // ── Helper section en carte ──
    const section = (title: string, rows: Row[]): void => {
      const headerH = 26, rowH = 21, padB = 12;
      const visible = rows.filter(r => r[1]);
      const h = headerH + visible.length * rowH + padB;
      doc.roundedRect(X, y, W, h, 8).fill(BOX);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(GOLD).text(title.toUpperCase(), X + 16, y + 9, { characterSpacing: 0.8 });
      let ry = y + headerH;
      for (const r of visible) {
        doc.font('Helvetica').fontSize(9.5).fillColor(SUB).text(r[0], X + 16, ry + 1, { width: 150 });
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(r[2] ?? INK).text(r[1] || '—', X + 172, ry, { width: W - 172 - 16 });
        ry += rowH;
      }
      y += h + 12;
    };

    section('Client', [
      ['Nom et prénom', fullName],
      ['N° de passeport', d.passport || ''],
      ['Téléphone', d.phone || ''],
    ]);

    section('Réservation', [
      ['Véhicule', d.vehicle || ''],
      ['Période', (d.start_date || d.end_date) ? `${d.start_date || '—'}   →   ${d.end_date || '—'}` : ''],
      ['Lieu de récupération', d.pickup || ''],
      ['Lieu de dépôt', d.dropoff || ''],
    ]);

    section('Paiement', [
      ...(total > 0 ? [['Montant total', money(total, cur)] as Row] : []),
      ['Acompte versé', money(deposit, cur), GREEN],
      ...(reste != null ? [['Reste à payer (à la prise du véhicule)', money(reste, cur), '#b3261e'] as Row] : []),
    ]);

    // ── Mention légale ──
    y += 2;
    doc.font('Helvetica').fontSize(9).fillColor('#555').text(
      'Ce bon confirme la réservation du véhicule ci-dessus avec l\'acompte indiqué. Le solde est réglé à la prise du véhicule. '
      + 'Passeport et permis valides requis. Sans caution. Acompte non remboursable en cas d\'annulation tardive (voir conditions).',
      X, y, { width: W, align: 'left', lineGap: 2 });

    // ── Pied de page ──
    const footY = doc.page.height - 60;
    doc.rect(X, footY, W, 1).fill(LINE);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK)
      .text('FIK CONCIERGERIE', X, footY + 10, { continued: true })
      .font('Helvetica').fillColor(SUB)
      .text('  —  Rue Derbouz Draoua, Houari, Oran 31300, Algérie');
    doc.font('Helvetica').fontSize(8.5).fillColor(SUB)
      .text('WhatsApp +32 466 31 14 69   ·   fikconciergerie.com   ·   Merci de votre confiance', X, footY + 23);

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
    const logo = await fetchLogoBuffer();
    const buffer = await buildVoucherPDF(data, ref, logo);
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
