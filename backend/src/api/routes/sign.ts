import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';

const router = Router();

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
}

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
  return { row, carName, start, end, total, currency, paid, nbDays, perDay, acompte, reste, cs: cur(currency), refNum: (row.booking_id ?? token).slice(0, 8).toUpperCase() };
}

function detailRows(c: Contract): [string, string][] {
  return [
    ['Véhicule', c.carName || '—'],
    ['Période', `du ${fmtDate(c.start)} au ${fmtDate(c.end)}`],
    ['Durée', c.nbDays ? `${c.nbDays} jour${c.nbDays > 1 ? 's' : ''}` : '—'],
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
        <a class="dl" href="/sign/${esc(token)}/contrat" target="_blank">📄 Télécharger le contrat (PDF)</a>
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
  <div class="docs">
    <label class="doc" id="lblPass"><input type="file" id="pass" accept="image/*" capture="environment" hidden/><span class="ico">📷</span><span class="lbl">Passeport</span></label>
    <label class="doc" id="lblPerm"><input type="file" id="perm" accept="image/*" capture="environment" hidden/><span class="ico">📷</span><span class="lbl">Permis</span></label>
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
<button class="print" onclick="window.print()">📄 Enregistrer en PDF</button>
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.print();}catch(e){}},700);});</script>
</body></html>`;
  res.send(html);
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
  .docs{display:flex;gap:12px;margin-top:12px}
  .doc{flex:1;background:#0f0f14;border:2px dashed #ffffff1f;border-radius:14px;padding:18px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;transition:.15s}
  .doc.ok{border-color:#10b981;background:#0e1a14}
  .doc .ico{font-size:26px} .doc .lbl{font-size:13px;color:#cfcfd6;font-weight:600}
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
  // Compresse l'image avant envoi (rapide + léger)
  function readImg(file, cb){
    var fr=new FileReader();
    fr.onload=function(){
      var img=new Image();
      img.onload=function(){
        var max=1280, w=img.width, h=img.height;
        if(w>max||h>max){ var r=Math.min(max/w,max/h); w=Math.round(w*r); h=Math.round(h*r); }
        var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        cb(cv.toDataURL('image/jpeg',0.7));
      };
      img.onerror=function(){ cb(fr.result); };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  }
  function hook(id, lblId, set){
    document.getElementById(id).addEventListener('change',function(e){
      var f=e.target.files&&e.target.files[0]; if(!f)return;
      m.textContent='Lecture de l image...';
      readImg(f,function(d){ set(d); document.getElementById(lblId).classList.add('ok'); document.getElementById(lblId).querySelector('.lbl').textContent='✓ Ajouté'; m.textContent=''; });
    });
  }
  hook('pass','lblPass',function(d){passData=d;});
  hook('perm','lblPerm',function(d){permData=d;});
  document.getElementById('okBtn').addEventListener('click',function(){
    var ok=document.getElementById('okBtn');
    if(!document.getElementById('acc').checked){m.style.color='#f59e0b';m.textContent='Cochez la case J accepte d abord.';return;}
    if(!passData){m.style.color='#f59e0b';m.textContent='Ajoutez la photo du passeport.';return;}
    if(!permData){m.style.color='#f59e0b';m.textContent='Ajoutez la photo du permis.';return;}
    m.style.color='#9b9ba6';m.textContent='Validation en cours...';ok.disabled=true;
    fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepted:true,passport:passData,permit:permData})})
      .then(function(r){ if(r.ok){m.style.color='#10b981';m.textContent='Contrat valide, merci !';setTimeout(function(){location.reload();},1200);} else {return r.json().then(function(j){m.style.color='#ef4444';m.textContent=(j&&j.error)||'Erreur, reessayez.';ok.disabled=false;});} })
      .catch(function(){m.style.color='#ef4444';m.textContent='Pas de connexion, reessayez.';ok.disabled=false;});
  });
})();
</script>`;
}

export default router;
