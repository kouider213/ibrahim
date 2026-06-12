import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';

const router = Router();

// La page contrat est une page HTML complète avec JS inline (signature/upload).
// La CSP globale (helmet) bloque les scripts inline → on la relâche UNIQUEMENT ici.
router.use((_req, res, next) => {
  res.set('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; script-src-attr 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self'; form-action 'self'");
  next();
});

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const fmtDate = (d?: string) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return String(d); } };
const cur = (c?: string) => (c === 'DZD' || c === 'DA' ? 'DA' : '€');

const CONDITIONS = [
  'Âge minimum : 35 ans (exigence de nos assurances).',
  'Aucune caution exigée — zéro dépôt de garantie.',
  'Acompte de 3 jours de location pour confirmer, déduit du total.',
  'Passeport + permis valides ; le passeport est conservé durant la location.',
  'Kilométrage illimité, assurance tous risques incluse, circulation dans toute l\'Algérie.',
  'Le véhicule est remis propre, plein de carburant, et doit être rendu dans le même état.',
  'Tout dégât constaté au retour (hors usure normale) est à la charge du locataire selon l\'état des lieux.',
  'En cas d\'accident : prévenir immédiatement Fik Conciergerie et établir un constat.',
  'Le véhicule ne peut être ni sous-loué, ni conduit par une personne non déclarée au contrat.',
];

interface SigRow { id?: string; client_name?: string; status?: string; signature_url?: string; signed_at?: string; booking_id?: string; details?: Record<string, unknown>; }
interface Contract {
  row: SigRow; carName: string; start: string; end: string; total: number; currency: string;
  paid: number; nbDays: number; perDay: number; acompte: number; reste: number; cs: string; refNum: string;
  pickup: string; dropoff: string;
}

const DEFAULT_PLACE = 'Agence Fik Conciergerie — Hay Badr, Oran';

async function loadContract(token: string): Promise<Contract | null> {
  const { data } = await supabase.from('contract_signatures').select('*').eq('token', token).maybeSingle();
  const row = data as SigRow | null;
  if (!row) return null;

  const d = row.details ?? {};
  let carName = String(d['car'] ?? '');
  let start = String(d['start'] ?? '');
  let end = String(d['end'] ?? '');
  let total = Number(d['price'] ?? 0);
  let currency = String(d['currency'] ?? 'EUR');
  let paid = 0;
  let nbDays = 0;

  if (row.booking_id) {
    const { data: bk } = await supabase
      .from('bookings')
      .select('start_date, end_date, nb_days, final_price, paid_amount, currency, cars(name)')
      .eq('id', row.booking_id).maybeSingle();
    const b = bk as { start_date?: string; end_date?: string; nb_days?: number; final_price?: number; paid_amount?: number; currency?: string; cars?: { name?: string } } | null;
    if (b) {
      carName  = b.cars?.name ?? carName;
      start    = b.start_date ?? start;
      end      = b.end_date ?? end;
      total    = Number(b.final_price ?? total);
      paid     = Number(b.paid_amount ?? 0);
      currency = b.currency ?? currency;
      nbDays   = Number(b.nb_days ?? 0);
    }
  }
  if (!nbDays && start && end) nbDays = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
  const perDay  = nbDays > 0 && total > 0 ? Math.round(total / nbDays) : 0;
  const acompte = paid > 0 ? paid : (perDay > 0 ? perDay * 3 : 0);
  const reste   = Math.max(0, total - acompte);
  const pickup  = String(d['pickup_location'] ?? '').trim() || DEFAULT_PLACE;
  const dropoff = String(d['return_location'] ?? '').trim() || pickup;
  return { row, carName, start, end, total, currency, paid, nbDays, perDay, acompte, reste, cs: cur(currency), refNum: (row.booking_id ?? token).slice(0, 8).toUpperCase(), pickup, dropoff };
}

function detailRows(c: Contract): [string, string][] {
  return [
    ['Véhicule', c.carName || '—'],
    ['Période', `du ${fmtDate(c.start)} au ${fmtDate(c.end)}`],
    ['Durée', c.nbDays ? `${c.nbDays} jour${c.nbDays > 1 ? 's' : ''}` : '—'],
    ['Lieu de prise en charge', c.pickup],
    ['Lieu de restitution', c.dropoff],
    c.perDay ? ['Tarif / jour', `${c.perDay.toLocaleString('fr-FR')} ${c.cs}`] : null,
    c.total ? ['Total location', `${c.total.toLocaleString('fr-FR')} ${c.cs}`] : null,
    c.acompte ? ['Acompte (3 j)', `${c.acompte.toLocaleString('fr-FR')} ${c.cs}`] : null,
    (c.total && c.acompte) ? ['Reste à régler', `${c.reste.toLocaleString('fr-FR')} ${c.cs}`] : null,
  ].filter(Boolean) as [string, string][];
}

// GET /sign/:token — contrat + validation par documents (passeport + permis)
router.get('/:token', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  const token = String(req.params['token'] ?? '');
  const c = await loadContract(token);
  if (!c) { res.status(404).send(page('<h2 style="text-align:center">Lien invalide ou expiré.</h2>')); return; }

  if (c.row.status === 'signed') {
    res.send(page(`
      <div style="text-align:center">
        <div style="font-size:46px">✅</div>
        <h1 style="color:#10b981">Contrat validé</h1>
        <p class="sub">Contrat n° ${c.refNum} — ${esc(c.row.client_name)}</p>
        <p class="sub">Validé le ${fmtDate(c.row.signed_at)} (conditions acceptées + documents reçus). Merci de votre confiance !</p>
        <a class="dl" href="/sign/${esc(token)}/pdf">📄 Télécharger le contrat (PDF)</a>
      </div>`));
    return;
  }

  const body = `
  <h1>Contrat de location</h1>
  <div class="sub">Fik Conciergerie — Oran, Algérie · Contrat n° ${c.refNum}</div>

  <div class="box">
    <div class="row"><span>Locataire</span><b>${esc(c.row.client_name) || '—'}</b></div>
    ${detailRows(c).map(([l, v]) => `<div class="row"><span>${l}</span><b>${esc(v)}</b></div>`).join('')}
  </div>

  <h2>Conditions de location</h2>
  <ul class="cond">${CONDITIONS.map(x => `<li>${x}</li>`).join('')}</ul>

  <label class="accept"><input type="checkbox" id="acc"/> <span>J'ai lu et j'accepte les conditions de location ci-dessus.</span></label>

  <h2>Pièces justificatives</h2>
  <p class="signlabel">Ajoutez une photo de votre passeport et de votre permis (obligatoire pour valider) :</p>
  <div class="docrow">
    <div class="doc2"><div class="dlbl">📷 Passeport</div><input type="file" id="pass" accept="image/*"/><img class="prev" id="prevPass" alt=""/></div>
    <div class="doc2"><div class="dlbl">📷 Permis</div><input type="file" id="perm" accept="image/*"/><img class="prev" id="prevPerm" alt=""/></div>
  </div>

  <div class="btns"><button type="button" class="ok" id="okBtn">Valider le contrat</button></div>
  <div class="msg" id="m"></div>
  <p class="legal">En validant, vous acceptez les conditions ci-dessus et confirmez l'envoi de vos pièces. Validation horodatée et conservée comme preuve.</p>`;

  res.send(page(body, true));
});

// GET /sign/:token/contrat — contrat PDF (impression / enregistrer en PDF)
router.get('/:token/contrat', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = String(req.params['token'] ?? '');
  const c = await loadContract(token);
  if (!c) { res.status(404).send('<h2>Lien invalide.</h2>'); return; }
  const d = c.row.details ?? {};
  const passUrl = String(d['passport_url'] ?? '');
  const permUrl = String(d['permit_url'] ?? '');
  const signed  = c.row.status === 'signed';

  const rows = [['Locataire', c.row.client_name ?? '—'], ...detailRows(c)];
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Contrat ${esc(c.refNum)} — Fik Conciergerie</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#fff;color:#111;padding:28px}
  .wrap{max-width:720px;margin:0 auto}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e9b949;padding-bottom:14px;margin-bottom:18px}
  .head h1{font-size:22px;margin:0;color:#1a1a1a} .head .b{color:#b8860b;font-weight:700}
  .ref{text-align:right;font-size:12px;color:#666}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#b8860b;margin:22px 0 8px}
  table{width:100%;border-collapse:collapse} td{padding:8px 0;border-bottom:1px solid #eee;font-size:14px}
  td.l{color:#666;width:45%} td.v{text-align:right;font-weight:600}
  ol{padding-left:18px} ol li{font-size:12.5px;color:#333;margin-bottom:6px;line-height:1.5}
  .valid{margin-top:22px;background:#f6fbf7;border:1px solid #cde9d6;border-radius:10px;padding:14px}
  .valid .ok{color:#127a3e;font-weight:700;font-size:13px;margin:2px 0}
  .docs{display:flex;gap:12px;margin-top:12px} .docs figure{margin:0;flex:1} .docs img{width:100%;border:1px solid #ddd;border-radius:6px;max-height:160px;object-fit:cover}
  .docs figcaption{font-size:11px;color:#666;margin-top:3px;text-align:center}
  .sign{margin-top:22px} .sign .lbl{font-size:11px;color:#666} .sign .line{height:70px;border-bottom:1px solid #111;margin-top:6px;max-width:260px}
  .meta{font-size:11px;color:#888;margin-top:10px}
  .foot{margin-top:28px;border-top:1px solid #eee;padding-top:12px;font-size:11px;color:#999;text-align:center}
  .print{position:fixed;bottom:16px;right:16px;background:#e9b949;color:#1a1500;border:0;border-radius:10px;padding:12px 18px;font-weight:700;font-size:14px;cursor:pointer}
  @media print{.print{display:none}}
</style></head><body><div class="wrap">
  <div class="head">
    <div><h1>Contrat de <span class="b">location</span></h1><div style="font-size:12px;color:#666">Fik Conciergerie — Oran, Algérie</div></div>
    <div class="ref">Contrat n°<br/><b>${esc(c.refNum)}</b></div>
  </div>
  <h2>Détails de la location</h2>
  <table>${rows.map(([l, v]) => `<tr><td class="l">${esc(l)}</td><td class="v">${esc(v)}</td></tr>`).join('')}</table>
  <h2>Conditions de location</h2>
  <ol>${CONDITIONS.map(x => `<li>${x}</li>`).join('')}</ol>
  ${signed ? `
  <h2>Validation du locataire</h2>
  <div class="valid">
    <div class="ok">☑ Conditions de location acceptées</div>
    <div class="ok">☑ Passeport reçu${permUrl ? ' &nbsp; ☑ Permis reçu' : ''}</div>
    <div class="meta">Validé électroniquement le ${fmtDate(c.row.signed_at)} par ${esc(c.row.client_name)}. Horodaté et conservé comme preuve.</div>
    <div class="docs">
      ${passUrl ? `<figure><img src="${esc(passUrl)}" alt="passeport"/><figcaption>Passeport</figcaption></figure>` : ''}
      ${permUrl ? `<figure><img src="${esc(permUrl)}" alt="permis"/><figcaption>Permis</figcaption></figure>` : ''}
    </div>
  </div>` : `
  <div class="sign"><div class="lbl">Signature / validation du locataire</div><div class="line"></div></div>`}
  <div class="foot">Fik Conciergerie — Oran, Algérie · Document généré automatiquement</div>
</div>
<a class="print" href="/sign/${esc(token)}/pdf" style="text-decoration:none;left:16px;right:auto">⬇️ Télécharger PDF</a>
<button class="print" onclick="window.print()">🖨️ Imprimer</button>
</body></html>`;
  res.send(html);
});

// GET /sign/:token/pdf — VRAI fichier PDF téléchargeable (pdfkit) avec photos
router.get('/:token/pdf', async (req, res) => {
  const token = String(req.params['token'] ?? '');
  const c = await loadContract(token);
  if (!c) { res.status(404).send('Lien invalide.'); return; }
  const d = c.row.details ?? {};

  const { default: axios } = await import('axios');
  const fetchImg = async (u: string): Promise<Buffer | null> => {
    if (!u) return null;
    try { const r = await axios.get(u, { responseType: 'arraybuffer', timeout: 15_000 }); return Buffer.from(r.data as ArrayBuffer); } catch { return null; }
  };
  const [passImg, permImg] = await Promise.all([fetchImg(String(d['passport_url'] ?? '')), fetchImg(String(d['permit_url'] ?? ''))]);

  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="contrat-${c.refNum}.pdf"`);
  doc.pipe(res);

  const GOLD = '#b8860b', DARK = '#1d1d1d', GREY = '#717171', LINE = '#e6e6e6', SOFT = '#f7f4ec', GREEN = '#1a7f3c';
  const M = 50, RIGHT = 545, CW = RIGHT - M;
  let y = 0;

  const section = (title: string) => {
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(10).text(title.toUpperCase(), M, y);
    y = doc.y + 4;
    doc.moveTo(M, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(LINE).stroke();
    y += 8;
  };
  const kv = (label: string, value: string) => {
    const vw = CW - 175;
    const vh = doc.font('Helvetica-Bold').fontSize(9.5).heightOfString(String(value), { width: vw });
    doc.fillColor(GREY).font('Helvetica').fontSize(9.5).text(label, M, y, { width: 170 });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9.5).text(String(value), M + 175, y, { width: vw });
    y += Math.max(vh, 12) + 5;
  };

  // ── En-tête ──
  doc.rect(0, 0, 595, 6).fill(GOLD);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(21).text('FIK CONCIERGERIE', M, 40);
  doc.fillColor(GREY).font('Helvetica').fontSize(9).text('Location de véhicules — Oran, Algérie', M, 66);
  doc.roundedRect(410, 38, 135, 42, 6).fillAndStroke(SOFT, LINE);
  doc.fillColor(GREY).font('Helvetica').fontSize(7).text('CONTRAT N°', 422, 46);
  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(15).text(c.refNum, 422, 56);
  doc.moveTo(M, 94).lineTo(RIGHT, 94).lineWidth(2).strokeColor(GOLD).stroke();
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(16).text('CONTRAT DE LOCATION', M, 106);
  doc.fillColor(GREY).font('Helvetica').fontSize(9).text('Établi entre Fik Conciergerie (le loueur) et le locataire désigné ci-dessous.', M, 127, { width: CW });
  y = 152;

  // ── Locataire & véhicule ──
  section('Locataire & véhicule');
  kv('Locataire', c.row.client_name ?? '—');
  kv('Véhicule', c.carName || '—');
  y += 4;

  // ── Période & lieux ──
  section('Période & lieux');
  kv('Date de départ', fmtDate(c.start));
  kv('Date de retour', fmtDate(c.end));
  kv('Durée', c.nbDays ? `${c.nbDays} jour${c.nbDays > 1 ? 's' : ''}` : '—');
  kv('Lieu de prise en charge', c.pickup);
  kv('Lieu de restitution', c.dropoff);
  y += 4;

  // ── Tarifs (encadré) ──
  section('Tarifs');
  const rowsT: Array<[string, string, boolean]> = [];
  if (c.perDay) rowsT.push(['Tarif / jour', `${c.perDay.toLocaleString('fr-FR')} ${c.cs}`, false]);
  if (c.total) rowsT.push(['Total location', `${c.total.toLocaleString('fr-FR')} ${c.cs}`, false]);
  if (c.acompte) rowsT.push(['Acompte (3 jours, déduit)', `${c.acompte.toLocaleString('fr-FR')} ${c.cs}`, false]);
  rowsT.push(['Reste à régler', `${c.reste.toLocaleString('fr-FR')} ${c.cs}`, true]);
  const boxH = rowsT.length * 18 + 14;
  doc.roundedRect(M, y, CW, boxH, 6).fillAndStroke(SOFT, LINE);
  let ty = y + 10;
  rowsT.forEach(([l, v, hl]) => {
    doc.fillColor(GREY).font('Helvetica').fontSize(9.5).text(l, M + 14, ty, { width: 250 });
    doc.fillColor(hl ? GOLD : DARK).font('Helvetica-Bold').fontSize(hl ? 12 : 10).text(v, M + 14, ty - (hl ? 1 : 0), { width: CW - 28, align: 'right' });
    ty += 18;
  });
  y += boxH + 14;

  // ── Conditions ──
  section('Conditions de location');
  CONDITIONS.forEach((x, i) => {
    doc.fillColor('#333').font('Helvetica').fontSize(8.7).text(`${i + 1}.  ${x}`, M, y, { width: CW });
    y = doc.y + 3;
  });
  y += 6;

  // ── Validation ──
  if (c.row.status === 'signed') {
    if (y > 600) { doc.addPage(); doc.rect(0, 0, 595, 6).fill(GOLD); y = 50; }
    section('Validation du locataire');
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9.5);
    doc.text('•  Conditions de location acceptées', M, y); y = doc.y + 3;
    doc.text('•  Passeport reçu' + (permImg ? '          •  Permis reçu' : ''), M, y); y = doc.y + 5;
    doc.fillColor(GREY).font('Helvetica').fontSize(8).text(`Validé électroniquement le ${fmtDate(c.row.signed_at)} par ${c.row.client_name ?? ''}. Horodaté et conservé comme preuve.`, M, y, { width: CW }); y = doc.y + 12;
    if (passImg || permImg) {
      if (y > 640) { doc.addPage(); doc.rect(0, 0, 595, 6).fill(GOLD); y = 50; }
      const iy = y;
      if (passImg) { try { doc.image(passImg, M, iy, { fit: [235, 150] }); doc.fillColor(GREY).font('Helvetica').fontSize(8).text('Passeport', M, iy + 153); } catch { /* format */ } }
      if (permImg) { try { doc.image(permImg, M + 250, iy, { fit: [235, 150] }); doc.fillColor(GREY).font('Helvetica').fontSize(8).text('Permis', M + 250, iy + 153); } catch { /* ignore */ } }
      y = iy + 172;
    }
  }

  // ── Pied de page ──
  doc.fillColor(GREY).font('Helvetica').fontSize(7.5).text('Fik Conciergerie — Hay Badr, Oran, Algérie — Document généré automatiquement et horodaté.', M, Math.max(y + 10, 800), { width: CW, align: 'center' });

  doc.end();
});

// POST /sign/:token — valide le contrat : accord + photos passeport & permis
router.post('/:token', async (req, res) => {
  const token = String(req.params['token'] ?? '');
  const body = req.body as { accepted?: boolean; passport?: string; permit?: string };
  if (!body.accepted) { res.status(400).json({ error: 'conditions non acceptées' }); return; }
  if (!body.passport?.startsWith('data:image') || !body.permit?.startsWith('data:image')) {
    res.status(400).json({ error: 'passeport et permis requis' }); return;
  }
  const { data } = await supabase.from('contract_signatures').select('id, status, details').eq('token', token).maybeSingle();
  const row = data as { id: string; status?: string; details?: Record<string, unknown> } | null;
  if (!row) { res.status(404).json({ error: 'introuvable' }); return; }
  if (row.status === 'signed') { res.json({ ok: true, already: true }); return; }

  try {
    await supabase.storage.createBucket('client-documents', { public: true }).catch(() => {});
    const up = async (kind: string, dataUrl: string): Promise<string | null> => {
      const b64 = dataUrl.split('base64,')[1] ?? '';
      const buf = Buffer.from(b64, 'base64');
      const path = `contracts/${token}-${kind}.jpg`;
      await supabase.storage.from('client-documents').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
      return supabase.storage.from('client-documents').getPublicUrl(path).data?.publicUrl ?? null;
    };
    const passport_url = await up('passport', body.passport);
    const permit_url   = await up('permit', body.permit);
    const details = { ...(row.details ?? {}), passport_url, permit_url, validated_by: 'documents' };
    await supabase.from('contract_signatures')
      .update({ status: 'signed', signed_at: new Date().toISOString(), details })
      .eq('id', row.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

function page(inner: string, withScript = false): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>Contrat — Fik Conciergerie</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0b0b0d;color:#f5f5f7;padding:18px}
  .card{max-width:560px;margin:0 auto;background:#16161c;border:1px solid #ffffff14;border-radius:18px;padding:22px}
  h1{font-size:21px;color:#e9b949;margin:0 0 4px} h2{font-size:14px;color:#e9b949;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.06em}
  .sub{color:#9b9ba6;font-size:12px;margin-bottom:14px}
  .box{background:#0f0f14;border:1px solid #ffffff10;border-radius:12px;padding:6px 14px;margin-top:6px}
  .row{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:9px 0;border-bottom:1px solid #ffffff0d}
  .row:last-child{border-bottom:0} .row span{color:#9b9ba6} .row b{color:#fff;text-align:right}
  ul.cond{margin:0;padding-left:18px} ul.cond li{font-size:13px;color:#c9c9d2;margin-bottom:7px;line-height:1.45}
  .accept{display:flex;gap:10px;align-items:flex-start;margin:18px 0 6px;font-size:13.5px;color:#e8e8ee;cursor:pointer}
  .accept input{width:20px;height:20px;margin-top:1px;flex-shrink:0}
  .signlabel{font-size:12px;color:#9b9ba6;margin:6px 0 0}
  .docrow{display:flex;flex-direction:column;gap:14px;margin-top:12px}
  .doc2{background:#0f0f14;border:1px solid #ffffff14;border-radius:12px;padding:14px}
  .doc2 .dlbl{font-size:14px;color:#cfcfd6;font-weight:600;margin-bottom:10px}
  .doc2 input[type=file]{color:#9b9ba6;font-size:14px;max-width:100%}
  .doc2 .prev{display:none;margin-top:12px;width:100%;max-height:170px;object-fit:contain;border-radius:8px;background:#000}
  .doc2 .prev.show{display:block}
  .btns{display:flex;gap:10px;margin-top:18px} button{flex:1;padding:14px;border:0;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer}
  .ok{background:#e9b949;color:#1a1500} .ok:disabled{opacity:.4}
  .msg{text-align:center;margin-top:12px;font-size:14px;min-height:18px}
  .legal{font-size:11px;color:#6b6b76;margin-top:14px;line-height:1.5}
  .dl{display:inline-block;margin-top:16px;color:#e9b949;text-decoration:none;border:1px solid #e9b94955;padding:12px 20px;border-radius:10px;font-weight:700}
</style></head><body><div class="card">${inner}</div>${withScript ? script() : ''}</body></html>`;
}

function script(): string {
  return `<script>
(function(){
  var m=document.getElementById('m');
  var passData=null, permData=null;
  function say(t,c){ m.style.color=c||'#9b9ba6'; m.textContent=t; }
  function hook(id, prevId, set){
    var inp=document.getElementById(id);
    inp.addEventListener('change',function(e){
      var f=e.target.files&&e.target.files[0];
      if(!f){ say('Aucun fichier','#f59e0b'); return; }
      say('Lecture de '+f.name+'...');
      var prev=document.getElementById(prevId);
      var fr=new FileReader();
      fr.onload=function(){
        var raw=fr.result;
        set(raw);
        try{ prev.src=raw; prev.classList.add('show'); }catch(er){}
        say('Photo prete ('+Math.round(raw.length/1024)+' ko)', '#10b981');
        try{ var img=new Image(); img.onload=function(){ try{ var max=1280,w=img.width,h=img.height; if(w>max||h>max){var r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r);} var cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(img,0,0,w,h); var cc=cv.toDataURL('image/jpeg',0.72); set(cc); prev.src=cc; }catch(e2){} }; img.src=raw; }catch(e3){}
      };
      fr.onerror=function(){ say('ERREUR lecture photo','#ef4444'); };
      try{ fr.readAsDataURL(f); }catch(e4){ say('ERREUR: '+e4.message,'#ef4444'); }
    });
  }
  hook('pass','prevPass',function(d){passData=d;});
  hook('perm','prevPerm',function(d){permData=d;});
  document.getElementById('okBtn').addEventListener('click',function(){
    var ok=document.getElementById('okBtn');
    if(!document.getElementById('acc').checked){say('Cochez la case J accepte d abord.','#f59e0b');return;}
    if(!passData){say('Photo du passeport manquante.','#f59e0b');return;}
    if(!permData){say('Photo du permis manquante.','#f59e0b');return;}
    say('Envoi du contrat...'); ok.disabled=true;
    fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepted:true,passport:passData,permit:permData})})
      .then(function(r){
        if(r.ok){ say('Contrat valide, merci !','#10b981'); setTimeout(function(){location.reload();},1300); return; }
        return r.text().then(function(txt){ say('Erreur '+r.status+': '+txt.slice(0,120),'#ef4444'); ok.disabled=false; });
      })
      .catch(function(err){ say('Echec reseau: '+(err&&err.message||'?'),'#ef4444'); ok.disabled=false; });
  });
})();
</script>`;
}

export default router;
