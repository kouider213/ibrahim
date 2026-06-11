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

// GET /sign/:token — contrat + signature (ou état signé avec téléchargement PDF)
router.get('/:token', async (req, res) => {
  const token = String(req.params['token'] ?? '');
  const c = await loadContract(token);
  if (!c) { res.status(404).send(page('<h2 style="text-align:center">Lien invalide ou expiré.</h2>')); return; }

  if (c.row.status === 'signed') {
    res.send(page(`
      <div style="text-align:center">
        <div style="font-size:46px">✅</div>
        <h1 style="color:#10b981">Contrat signé</h1>
        <p class="sub">Contrat n° ${c.refNum} — ${esc(c.row.client_name)}</p>
        <p class="sub">Signé le ${fmtDate(c.row.signed_at)}. Merci de votre confiance !</p>
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

  <p class="signlabel">Signature du locataire :</p>
  <canvas id="c"></canvas>
  <div class="btns"><button type="button" class="clr" id="clrBtn">Effacer</button><button type="button" class="ok" id="okBtn">Valider</button></div>
  <div class="msg" id="m"></div>
  <p class="legal">En validant, vous reconnaissez avoir pris connaissance de l'état des lieux du véhicule et acceptez les conditions ci-dessus. Signature horodatée et conservée comme preuve.</p>`;

  res.send(page(body, true));
});

// GET /sign/:token/contrat — contrat PDF (impression / enregistrer en PDF), signé uniquement
router.get('/:token/contrat', async (req, res) => {
  const token = String(req.params['token'] ?? '');
  const c = await loadContract(token);
  if (!c) { res.status(404).send('<h2>Lien invalide.</h2>'); return; }

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
  .sign{margin-top:26px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
  .sign .box{flex:1} .sign .lbl{font-size:11px;color:#666;margin-bottom:6px} .sign img{max-height:90px;border-bottom:1px solid #111}
  .meta{font-size:11px;color:#888;margin-top:6px}
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
  <div class="sign">
    <div class="box"><div class="lbl">Le loueur — Fik Conciergerie</div><div style="height:90px;border-bottom:1px solid #111"></div></div>
    <div class="box"><div class="lbl">Le locataire — ${esc(c.row.client_name)}</div>${c.row.signature_url ? `<img src="${esc(c.row.signature_url)}" alt="signature"/>` : '<div style="height:90px;border-bottom:1px solid #111"></div>'}</div>
  </div>
  <div class="meta">Signé électroniquement le ${fmtDate(c.row.signed_at)}. Signature horodatée et conservée comme preuve.</div>
  <div class="foot">Fik Conciergerie — Oran, Algérie · Document généré automatiquement</div>
</div>
<button class="print" onclick="window.print()">📄 Enregistrer en PDF</button>
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.print();}catch(e){}},600);});</script>
</body></html>`;
  res.send(html);
});

// POST /sign/:token — enregistre la signature (image PNG base64)
router.post('/:token', async (req, res) => {
  const token = String(req.params['token'] ?? '');
  const sig = (req.body as { signature?: string }).signature;
  if (!sig?.startsWith('data:image')) { res.status(400).json({ error: 'signature invalide' }); return; }
  const { data } = await supabase.from('contract_signatures').select('id, status').eq('token', token).maybeSingle();
  const row = data as { id: string; status?: string } | null;
  if (!row) { res.status(404).json({ error: 'introuvable' }); return; }
  if (row.status === 'signed') { res.json({ ok: true, already: true }); return; }

  try {
    const b64 = sig.split('base64,')[1];
    const buf = Buffer.from(b64 ?? '', 'base64');
    const path = `signatures/${token}.png`;
    await supabase.storage.createBucket('client-documents', { public: true }).catch(() => {});
    await supabase.storage.from('client-documents').upload(path, buf, { contentType: 'image/png', upsert: true });
    const url = supabase.storage.from('client-documents').getPublicUrl(path).data?.publicUrl;
    await supabase.from('contract_signatures').update({ status: 'signed', signature_url: url ?? null, signed_at: new Date().toISOString() }).eq('id', row.id);
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
  .signlabel{font-size:12px;color:#9b9ba6;margin:14px 0 0}
  canvas{width:100%;height:200px;background:#fff;border-radius:12px;margin-top:8px;touch-action:none;display:block}
  .btns{display:flex;gap:10px;margin-top:12px} button{flex:1;padding:14px;border:0;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer}
  .clr{background:#2a2a31;color:#bbb} .ok{background:#e9b949;color:#1a1500} .ok:disabled{opacity:.4}
  .msg{text-align:center;margin-top:12px;font-size:14px;min-height:18px}
  .legal{font-size:11px;color:#6b6b76;margin-top:14px;line-height:1.5}
  .dl{display:inline-block;margin-top:16px;color:#e9b949;text-decoration:none;border:1px solid #e9b94955;padding:12px 20px;border-radius:10px;font-weight:700}
</style></head><body><div class="card">${inner}</div>${withScript ? script() : ''}</body></html>`;
}

function script(): string {
  return `<script>
(function(){
  var cv=document.getElementById('c'), x=cv.getContext('2d'), m=document.getElementById('m');
  var has=false, drawing=false, last=null;
  // Dimensionne le canvas à sa taille réelle (sans DPR = robuste sur iOS). Renvoie false si pas encore prêt.
  function fit(){
    var r=cv.getBoundingClientRect();
    if(r.width<10) return false;
    if(cv.width!==Math.round(r.width)||cv.height!==Math.round(r.height)){ cv.width=Math.round(r.width); cv.height=Math.round(r.height); }
    x.lineWidth=3; x.lineCap='round'; x.lineJoin='round'; x.strokeStyle='#000'; x.fillStyle='#000';
    return true;
  }
  if(typeof requestAnimationFrame==='function') requestAnimationFrame(fit); else setTimeout(fit,30);
  window.addEventListener('load',fit);
  function rel(e){var r=cv.getBoundingClientRect();var t=(e.touches&&e.touches[0])?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top};}
  function start(e){ if(!fit()) fit(); drawing=true; has=true; last=rel(e); x.beginPath(); x.arc(last.x,last.y,1.6,0,7); x.fill(); if(e.cancelable)e.preventDefault(); }
  function move(e){ if(!drawing)return; var p=rel(e); x.beginPath(); x.moveTo(last.x,last.y); x.lineTo(p.x,p.y); x.stroke(); last=p; if(e.cancelable)e.preventDefault(); }
  function end(e){ drawing=false; last=null; if(e&&e.cancelable)e.preventDefault(); }
  cv.addEventListener('touchstart',start,{passive:false});
  cv.addEventListener('touchmove',move,{passive:false});
  cv.addEventListener('touchend',end,{passive:false});
  cv.addEventListener('mousedown',start);
  window.addEventListener('mousemove',move);
  window.addEventListener('mouseup',end);
  document.getElementById('clrBtn').addEventListener('click',function(){ fit(); x.clearRect(0,0,cv.width,cv.height); has=false; m.textContent=''; });
  document.getElementById('okBtn').addEventListener('click',function(){
    var ok=document.getElementById('okBtn');
    if(!document.getElementById('acc').checked){m.style.color='#f59e0b';m.textContent='Cochez la case J accepte d abord.';return;}
    if(!has){m.style.color='#f59e0b';m.textContent='Signez dans le cadre blanc d abord.';return;}
    m.style.color='#9b9ba6';m.textContent='Validation...';ok.disabled=true;
    fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature:cv.toDataURL('image/png')})})
      .then(function(r){ if(r.ok){m.style.color='#10b981';m.textContent='Contrat valide, merci !';setTimeout(function(){location.reload();},1200);} else {m.style.color='#ef4444';m.textContent='Erreur, reessayez.';ok.disabled=false;} })
      .catch(function(){m.style.color='#ef4444';m.textContent='Pas de connexion, reessayez.';ok.disabled=false;});
  });
})();
</script>`;
}

export default router;
