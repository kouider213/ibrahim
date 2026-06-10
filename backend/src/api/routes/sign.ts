import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';

const router = Router();

// GET /sign/:token — page de signature (publique, le client ouvre le lien sur son tel)
router.get('/:token', async (req, res) => {
  const token = String(req.params['token'] ?? '');
  const { data } = await supabase.from('contract_signatures').select('*').eq('token', token).maybeSingle();
  const row = data as { client_name?: string; status?: string; details?: Record<string, unknown> } | null;
  if (!row) { res.status(404).send('<h2>Lien invalide ou expiré.</h2>'); return; }

  if (row.status === 'signed') {
    res.send('<div style="font-family:system-ui;text-align:center;padding:40px"><h2>✅ Contrat déjà signé</h2><p>Merci !</p></div>');
    return;
  }
  const d = row.details ?? {};
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>Signature — Fik Conciergerie</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0b0b0d;color:#f5f5f7;padding:18px}
  .card{max-width:520px;margin:0 auto;background:#16161c;border:1px solid #ffffff14;border-radius:16px;padding:20px}
  h1{font-size:18px;color:#10b981;margin:0 0 4px} .sub{color:#9b9ba6;font-size:12px;margin-bottom:16px}
  .row{display:flex;justify-content:space-between;font-size:14px;padding:7px 0;border-bottom:1px solid #ffffff0d}
  .row b{color:#fff} canvas{width:100%;height:200px;background:#fff;border-radius:12px;margin-top:14px;touch-action:none}
  .btns{display:flex;gap:10px;margin-top:12px} button{flex:1;padding:13px;border:0;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer}
  .clr{background:#2a2a31;color:#bbb} .ok{background:#10b981;color:#06281c} .msg{text-align:center;margin-top:12px;font-size:14px}
</style></head><body>
<div class="card">
  <h1>Contrat de location — Fik Conciergerie</h1>
  <div class="sub">Oran, Algérie</div>
  <div class="row"><span>Client</span><b>${row.client_name ?? ''}</b></div>
  ${d['car'] ? `<div class="row"><span>Véhicule</span><b>${d['car']}</b></div>` : ''}
  ${d['start'] ? `<div class="row"><span>Du</span><b>${d['start']}</b></div>` : ''}
  ${d['end'] ? `<div class="row"><span>Au</span><b>${d['end']}</b></div>` : ''}
  ${d['price'] ? `<div class="row"><span>Montant</span><b>${d['price']} ${d['currency'] ?? ''}</b></div>` : ''}
  <p style="font-size:12px;color:#9b9ba6;margin-top:14px">Signez ci-dessous pour accepter le contrat de location :</p>
  <canvas id="c" width="480" height="200"></canvas>
  <div class="btns"><button class="clr" onclick="clr()">Effacer</button><button class="ok" onclick="send()">✅ Signer</button></div>
  <div class="msg" id="m"></div>
</div>
<script>
  const cv=document.getElementById('c'),x=cv.getContext('2d');x.lineWidth=2.5;x.lineCap='round';x.strokeStyle='#111';
  let drawing=false,has=false;
  function pos(e){const r=cv.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return{x:(t.clientX-r.left)*(cv.width/r.width),y:(t.clientY-r.top)*(cv.height/r.height)};}
  function down(e){drawing=true;has=true;const p=pos(e);x.beginPath();x.moveTo(p.x,p.y);e.preventDefault();}
  function move(e){if(!drawing)return;const p=pos(e);x.lineTo(p.x,p.y);x.stroke();e.preventDefault();}
  function up(){drawing=false;}
  cv.addEventListener('mousedown',down);cv.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
  cv.addEventListener('touchstart',down);cv.addEventListener('touchmove',move);cv.addEventListener('touchend',up);
  function clr(){x.clearRect(0,0,cv.width,cv.height);has=false;}
  async function send(){
    if(!has){document.getElementById('m').textContent='✍️ Signe d\\'abord.';return;}
    document.getElementById('m').textContent='Envoi…';
    const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signature:cv.toDataURL('image/png')})});
    document.getElementById('m').textContent=r.ok?'✅ Contrat signé, merci !':'❌ Erreur, réessaie.';
  }
</script></body></html>`;
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
    const buf = Buffer.from(b64, 'base64');
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

export default router;
