import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';

const router = Router();

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const fmtDate = (d?: string) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return String(d); } };
const cur = (c?: string) => (c === 'DZD' || c === 'DA' ? 'DA' : '€');

// Conditions réelles Fik Conciergerie (alignées sur lib/conditions du site)
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

// GET /sign/:token — contrat complet + signature (public, le client ouvre sur son tel)
router.get('/:token', async (req, res) => {
  const token = String(req.params['token'] ?? '');
  const { data } = await supabase.from('contract_signatures').select('*').eq('token', token).maybeSingle();
  const row = data as SigRow | null;
  if (!row) { res.status(404).send(page('<h2 style="text-align:center">Lien invalide ou expiré.</h2>')); return; }

  // Détails : on privilégie la réservation réelle (booking_id), sinon details stockés
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
  const acompte = paid > 0 ? paid : (perDay > 0 ? perDay * 3 : 0);   // règle : acompte = 3 jours
  const reste   = Math.max(0, total - acompte);
  const cs      = cur(currency);
  const refNum  = (row.booking_id ?? token).slice(0, 8).toUpperCase();

  if (row.status === 'signed') {
    res.send(page(`
      <div style="text-align:center">
        <div style="font-size:46px">✅</div>
        <h1 style="color:#10b981">Contrat signé</h1>
        <p class="sub">Contrat n° ${refNum} — ${esc(row.client_name)}</p>
        <p class="sub">Signé le ${fmtDate(row.signed_at)}. Merci de votre confiance !</p>
        ${row.signature_url ? `<a class="dl" href="${esc(row.signature_url)}" target="_blank">Voir ma signature</a>` : ''}
      </div>`));
    return;
  }

  const detailRows = [
    ['Véhicule', carName || '—'],
    ['Période', `du ${fmtDate(start)} au ${fmtDate(end)}`],
    ['Durée', nbDays ? `${nbDays} jour${nbDays > 1 ? 's' : ''}` : '—'],
    perDay ? ['Tarif / jour', `${perDay.toLocaleString('fr-FR')} ${cs}`] : null,
    total ? ['Total location', `${total.toLocaleString('fr-FR')} ${cs}`] : null,
    acompte ? ['Acompte (3 j)', `${acompte.toLocaleString('fr-FR')} ${cs}`] : null,
    (total && acompte) ? ['Reste à régler', `${reste.toLocaleString('fr-FR')} ${cs}`] : null,
  ].filter(Boolean) as [string, string][];

  const body = `
  <h1>Contrat de location</h1>
  <div class="sub">Fik Conciergerie — Oran, Algérie · Contrat n° ${refNum}</div>

  <div class="box">
    <div class="row"><span>Locataire</span><b>${esc(row.client_name) || '—'}</b></div>
    ${detailRows.map(([l, v]) => `<div class="row"><span>${l}</span><b>${esc(v)}</b></div>`).join('')}
  </div>

  <h2>Conditions de location</h2>
  <ul class="cond">${CONDITIONS.map(c => `<li>${c}</li>`).join('')}</ul>

  <label class="accept"><input type="checkbox" id="acc"/> <span>J'ai lu et j'accepte les conditions de location ci-dessus.</span></label>

  <p class="signlabel">Signature du locataire :</p>
  <canvas id="c" width="480" height="200"></canvas>
  <div class="btns"><button class="clr" onclick="clr()">Effacer</button><button class="ok" id="okBtn" onclick="send()">Signer le contrat</button></div>
  <div class="msg" id="m"></div>
  <p class="legal">En signant, vous reconnaissez avoir pris connaissance de l'état des lieux du véhicule et acceptez les conditions ci-dessus. Signature horodatée et conservée comme preuve.</p>`;

  res.send(page(body, true));
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

// Gabarit HTML commun
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
  canvas{width:100%;height:200px;background:#fff;border-radius:12px;margin-top:8px;touch-action:none;border:2px dashed #00000020}
  .btns{display:flex;gap:10px;margin-top:12px} button{flex:1;padding:14px;border:0;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer}
  .clr{background:#2a2a31;color:#bbb} .ok{background:#e9b949;color:#1a1500} .ok:disabled{opacity:.4}
  .msg{text-align:center;margin-top:12px;font-size:14px;min-height:18px}
  .legal{font-size:11px;color:#6b6b76;margin-top:14px;line-height:1.5}
  .dl{display:inline-block;margin-top:14px;color:#e9b949;text-decoration:none;border:1px solid #e9b94955;padding:10px 18px;border-radius:10px}
</style></head><body><div class="card">${inner}</div>${withScript ? script() : ''}</body></html>`;
}

function script(): string {
  return `<script>
  const cv=document.getElementById('c'),x=cv.getContext('2d');x.lineWidth=2.5;x.lineCap='round';x.strokeStyle='#111';
  let drawing=false,has=false;
  function pos(e){const r=cv.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return{x:(t.clientX-r.left)*(cv.width/r.width),y:(t.clientY-r.top)*(cv.height/r.height)};}
  function down(e){drawing=true;has=true;const p=pos(e);x.beginPath();x.moveTo(p.x,p.y);e.preventDefault();}
  function move(e){if(!drawing)return;const p=pos(e);x.lineTo(p.x,p.y);x.stroke();e.preventDefault();}
  function up(){drawing=false;}
  cv.addEventListener('mousedown',down);cv.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
  cv.addEventListener('touchstart',down,{passive:false});cv.addEventListener('touchmove',move,{passive:false});cv.addEventListener('touchend',up);
  function clr(){x.clearRect(0,0,cv.width,cv.height);has=false;}
  async function send(){
    const m=document.getElementById('m');
    if(!document.getElementById('acc').checked){m.style.color='#f59e0b';m.textContent='Veuillez cocher « J\\'accepte » d\\'abord.';return;}
    if(!has){m.style.color='#f59e0b';m.textContent='✍️ Signez dans le cadre blanc d\\'abord.';return;}
    m.style.color='#9b9ba6';m.textContent='Envoi…';document.getElementById('okBtn').disabled=true;
    try{
      const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature:cv.toDataURL('image/png')})});
      if(r.ok){m.style.color='#10b981';m.textContent='✅ Contrat signé, merci ! Vous pouvez fermer cette page.';setTimeout(()=>location.reload(),1500);}
      else{m.style.color='#ef4444';m.textContent='❌ Erreur, réessayez.';document.getElementById('okBtn').disabled=false;}
    }catch(e){m.style.color='#ef4444';m.textContent='❌ Pas de connexion, réessayez.';document.getElementById('okBtn').disabled=false;}
  }
</script>`;
}

export default router;
