/* NEXUS — interface holographique façon JARVIS (vidéo TechEnClair v10)
   · sphère neuronale 3D (three.js) qui respire en veille, pulse quand Nexus parle, se tord en ruban quand il réfléchit
   · horloge HUD encadrée, terminal de sous-titres tapés à la machine, bandeau orange « VOUS : … »
   · widget mails holographique déplaçable (liste → mail ouvert), piloté à la voix, à la souris ou à la main
   · contrôle à la main par la webcam (MediaPipe) : curseur = index, pincer = attraper / cliquer, deux mains = zoom, balayage = fermer
   Branché sur index.html : Holo.on(message) reçoit tous les messages du serveur ; utilise send(), phase, globeFrame, toast(). */
'use strict';
(() => {
const $ = id => document.getElementById(id);
const esc = t => String(t ?? '').replace(/[&<>"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]));
const COLORS = { green:'#a6ff3a', blue:'#4aa3ff', cyan:'#38d8f5', violet:'#b48cff', orange:'#ffae3a', red:'#ff5a6a', white:'#e8f4ff' };
const store = { get(k, d){ try{ return localStorage.getItem(k) ?? d; }catch(_){ return d; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(_){} } };
let style = store.get('nexus_look', 'neural'), color = store.get('nexus_color', 'green');

/* ── Styles ── */
document.head.insertAdjacentHTML('beforeend', `<style>
body.neural #hud,body.neural #feed,body.neural #sub{display:none}
#neural{position:absolute;inset:0;display:none;cursor:grab}
body.neural #neural{display:block}
#neural canvas{display:block;width:100%;height:100%}
.stage.gopen #neural{position:fixed;inset:auto;left:28px;bottom:96px;width:120px;height:120px;z-index:6;pointer-events:none}
.stage.popen #neural{opacity:.25}
#hclock{position:absolute;top:2px;left:50%;transform:translateX(-50%);display:none;align-items:center;gap:14px;padding:6px 18px 5px;z-index:2;pointer-events:none;
  border:1px solid rgba(56,216,245,.45);background:rgba(4,14,28,.55);clip-path:polygon(12px 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%,0 12px);
  font-family:'Share Tech Mono',Consolas,monospace;color:var(--cyan);text-shadow:0 0 10px rgba(56,216,245,.7)}
body.neural #hclock{display:flex}
.stage.gopen #hclock,.stage.popen #hclock{display:none}
#hclock .t{font-size:30px;letter-spacing:4px;line-height:1}
#hclock .m{font-size:10px;color:var(--dim);text-align:center;line-height:1.35;min-width:58px}
#hclock .m b{display:block;font-size:13px;color:var(--cyan)}
#hclock .d{position:absolute;left:0;right:0;bottom:-15px;text-align:center;font-size:9.5px;letter-spacing:3px;color:var(--dim)}
#term{position:absolute;left:50%;bottom:58px;transform:translateX(-50%);width:min(760px,86%);display:none;z-index:2;pointer-events:none;
  font-family:'Share Tech Mono',Consolas,monospace;text-transform:uppercase}
body.neural #term.on{display:block}
.stage.gopen #term,.stage.popen #term{display:none!important}
#term .box{position:relative;padding:10px 16px;border:1px solid rgba(56,216,245,.5);background:rgba(3,16,30,.72);color:#7ff0ff;font-size:13.5px;line-height:1.5;
  text-align:center;text-shadow:0 0 8px rgba(56,216,245,.55);max-height:132px;overflow:hidden}
#term .box::before,#term .box::after{content:"";position:absolute;width:14px;height:14px;border:2px solid var(--cyan)}
#term .box::before{top:-2px;left:-2px;border-right:0;border-bottom:0}#term .box::after{bottom:-2px;right:-2px;border-left:0;border-top:0}
#term .lbl{display:flex;justify-content:space-between;font-size:9px;letter-spacing:1.5px;color:var(--dim);margin-top:3px}
#term .lbl .ok{color:var(--green)}
#term .caret{display:inline-block;width:.6em;background:#7ff0ff;animation:blink 1s steps(1) infinite;margin-left:2px}
@keyframes blink{50%{opacity:0}}
#you{position:absolute;left:50%;bottom:196px;transform:translateX(-50%);width:min(560px,70%);display:none;z-index:2;pointer-events:none;
  padding:5px 14px;border:1px solid rgba(255,150,40,.6);background:rgba(40,18,4,.7);color:#ffb35a;font:12px 'Share Tech Mono',Consolas,monospace;
  text-transform:uppercase;letter-spacing:1px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.neural #you.on{display:block}
.stage.gopen #you,.stage.popen #you{display:none!important}
.holo{position:absolute;z-index:5;width:min(390px,44%);max-height:76%;display:flex;flex-direction:column;
  background:rgba(3,18,32,.86);border:1.5px solid rgba(56,216,245,.75);border-radius:6px;backdrop-filter:blur(8px);
  box-shadow:0 0 26px rgba(56,216,245,.35),inset 0 0 22px rgba(56,216,245,.12);font-family:'Share Tech Mono',Consolas,monospace;color:#bff6ff;animation:hin .35s ease}
@keyframes hin{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
.holo .hh{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid rgba(56,216,245,.35);cursor:move;user-select:none}
.holo .hh b{flex:1;font-size:11px;letter-spacing:1.5px;color:var(--cyan)}
.holo .hh button{font:inherit;font-size:10px;padding:2px 7px;border:1px solid rgba(56,216,245,.5);border-radius:4px;color:var(--cyan);background:rgba(56,216,245,.08)}
.holo .hh button.g{border-color:#4ade80;color:#4ade80;background:rgba(74,222,128,.1)}
.holo .hb{overflow:auto;padding:6px;scrollbar-width:thin;scrollbar-color:rgba(56,216,245,.4) transparent}
.holo .hf{display:flex;justify-content:space-between;padding:4px 9px;border-top:1px solid rgba(56,216,245,.25);font-size:9px;letter-spacing:1px;color:var(--dim)}
.mrow{padding:7px 8px;margin-bottom:5px;border:1px solid rgba(56,216,245,.25);border-radius:4px;background:rgba(56,216,245,.04);cursor:pointer}
.mrow:hover,.mrow.ghover{border-color:var(--cyan);background:rgba(56,216,245,.12)}
.mrow .r1{display:flex;gap:6px;font-size:11px}.mrow .r1 b{color:#fff;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mrow .r1 i{font-style:normal;color:var(--dim);font-size:10px;white-space:nowrap}
.mrow .s{font-size:11.5px;color:var(--cyan);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mrow .p{font-size:10.5px;color:var(--dim);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mrow.unread .r1 b::before{content:"● ";color:#4ade80}
.mopen .mh{font-size:11px;color:var(--dim);line-height:1.5;padding:4px 4px 8px;border-bottom:1px solid rgba(56,216,245,.2)}
.mopen .mh b{color:#fff;font-size:12.5px;display:block}
.mopen .mb{white-space:pre-wrap;font-size:11.5px;line-height:1.55;padding:8px 4px;color:#d8faff;text-transform:none}
button.ghover{outline:2px solid #4ade80}
#gcur{position:fixed;left:0;top:0;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:2px solid #a6ff3a;z-index:50;pointer-events:none;display:none;
  box-shadow:0 0 14px #a6ff3a;transition:width .1s,height .1s,margin .1s,background .1s}
#gcur.pinch{width:20px;height:20px;margin:-10px 0 0 -10px;background:rgba(166,255,58,.55)}
#gcur.two{border-color:#38d8f5;box-shadow:0 0 14px #38d8f5}
#gpip{position:absolute;right:0;bottom:0;width:176px;height:132px;border-radius:10px;border:1px solid rgba(166,255,58,.5);z-index:3;display:none;background:#000}
#gpip.on{display:block}
.stage.gopen #gpip{z-index:6}
</style>`);
document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap">`);

/* ── Éléments ── */
const stage = $('stage');
stage.insertAdjacentHTML('afterbegin', `<div id="neural" aria-hidden="true"></div>
<div id="hclock" aria-hidden="true"><div class="m"><b id="hc-l">--</b>MÉTÉO</div><div class="t" id="hc-t">--:--:--</div><div class="m"><b id="hc-r">--</b>DISQUE</div><div class="d" id="hc-d"></div></div>`);
stage.insertAdjacentHTML('beforeend', `<div id="you"></div>
<div id="term" aria-live="polite"><div class="box" id="term-box"></div><div class="lbl"><span>NEXUS_TERMINAL_V10</span><span id="term-st"></span></div></div>
<canvas id="gpip" width="176" height="132" aria-hidden="true"></canvas>`);
document.body.insertAdjacentHTML('beforeend', '<div id="gcur"></div>');
const foot = document.querySelector('footer');
foot.insertAdjacentHTML('afterbegin', `<button class="ibtn" id="btn-stop" title="Arrêter de parler" aria-label="Arrêter de parler">⏹</button>
<button class="ibtn" id="btn-hand" title="Contrôle à la main (webcam)" aria-label="Contrôle à la main">✋</button>`);
$('btn-stop').onclick = () => send({ type:'stop_speech' });
$('btn-hand').onclick = () => setGesture(!gest.on, true);

/* ══════════ Sphère neuronale (three.js) ══════════ */
const sphere = (() => {
  const host = $('neural');
  if(!window.THREE){ return { setColor(){}, nudge(){} }; }
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, 1, .1, 50);
  cam.position.z = 3.4;
  const group = new THREE.Group(); scene.add(group);

  const N = 1500, g = Math.PI * (3 - Math.sqrt(5));
  const base = new Float32Array((N + 1) * 3), rad = new Float32Array(N + 1), pos = new Float32Array((N + 1) * 3);
  for(let i = 0; i < N; i++){
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = g * i;
    base[i*3] = Math.cos(t) * r; base[i*3+1] = y; base[i*3+2] = Math.sin(t) * r;
    rad[i] = .9 + Math.random() * .2 + (Math.random() < .06 ? -.35 * Math.random() : 0);
  }
  rad[N] = 0;                                                     // nœud central : les « rayons » partent de là
  const idx = [];
  for(let i = 0; i < N; i++){                                     // 3 voisins les plus proches → maillage de synapses
    const best = [[9, -1], [9, -1], [9, -1]];
    for(let j = 0; j < N; j++){ if(j === i) continue;
      const dx = base[i*3] - base[j*3], dy = base[i*3+1] - base[j*3+1], dz = base[i*3+2] - base[j*3+2], d = dx*dx + dy*dy + dz*dz;
      if(d < best[2][0]){ best[2] = [d, j]; best.sort((a, b) => a[0] - b[0]); } }
    best.forEach(([, j]) => { if(j > i) idx.push(i, j); });
    if(Math.random() < .045) idx.push(i, (i * 7919 + 13) % N);    // quelques longues connexions
  }
  for(let k = 0; k < 150; k++) idx.push(N, Math.floor(Math.random() * N));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', geo.getAttribute('position')); lgeo.setIndex(idx);
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const pmat = new THREE.PointsMaterial({ size:.05, map:dot, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, color:COLORS[color] || COLORS.green });
  const lmat = new THREE.LineBasicMaterial({ transparent:true, opacity:.32, depthWrite:false, blending:THREE.AdditiveBlending, color:COLORS[color] || COLORS.green });
  group.add(new THREE.LineSegments(lgeo, lmat)); group.add(new THREE.Points(geo, pmat));

  function fit(){ const w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    cam.position.z = w < 200 ? 3.9 : 3.4 * Math.max(1, .9 * 520 / Math.min(w, h * 1.1)); }
  new ResizeObserver(fit).observe(host); fit();

  const cur = { vol:0, think:0, glow:.5 }, rot = { x:.25, y:0, vx:0, vy:.18 };
  let last = performance.now();
  // Souris : glisser = tourner la sphère
  let drag = null;
  host.addEventListener('pointerdown', e => { drag = { x:e.clientX, y:e.clientY }; host.setPointerCapture(e.pointerId); });
  host.addEventListener('pointermove', e => { if(!drag) return; nudge(e.clientX - drag.x, e.clientY - drag.y); drag = { x:e.clientX, y:e.clientY }; });
  host.addEventListener('pointerup', () => { drag = null; });
  function nudge(dx, dy){ rot.vy += dx * .004; rot.vx += dy * .003; }

  function frame(now){
    requestAnimationFrame(frame);
    if(document.hidden || !document.body.classList.contains('neural')){ last = now; return; }
    const dt = Math.min((now - last) / 1000, .05); last = now; const t = now / 1000;
    const ph = typeof phase === 'string' ? phase : 'idle';
    const tv = ph === 'speaking' ? .55 + .45 * Math.abs(Math.sin(t * 9.5) * Math.sin(t * 3.1 + 1)) : ph === 'listening' ? .18 + .1 * Math.sin(t * 3) : 0;
    cur.vol += (tv - cur.vol) * (1 - Math.exp(-dt * 12));
    cur.think += ((ph === 'thinking' ? 1 : 0) - cur.think) * (1 - Math.exp(-dt * 2.5));
    cur.glow += ((ph === 'idle' ? .55 : .95) - cur.glow) * (1 - Math.exp(-dt * 3));
    const br = 1 + .035 * Math.sin(t * 1.4), m = cur.think;
    for(let i = 0; i < N; i++){
      const bx = base[i*3], by = base[i*3+1], bz = base[i*3+2];
      const wave = 1 + cur.vol * .22 * Math.sin(t * 7 + by * 5 + bx * 3) + cur.vol * .1 * Math.sin(t * 11 + bz * 6);
      const r = rad[i] * br * wave;
      let x = bx * r, y = by * r, z = bz * r;
      if(m > .001){                                               // réflexion : la sphère se tord en ruban
        const a = Math.atan2(bz, bx), tw = t * 2.2;
        const rx = Math.cos(a) * 1.55, rz = Math.sin(a) * .45, ry = by * .16 + .22 * Math.sin(a * 2 + tw);
        x += (rx - x) * m; y += (ry - y) * m; z += (rz - z) * m;
      }
      pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
    }
    geo.attributes.position.needsUpdate = true;
    rot.vy += ((ph === 'thinking' ? .9 : .18) - rot.vy) * (1 - Math.exp(-dt * .8)); rot.vx *= Math.exp(-dt * 2);
    rot.y += rot.vy * dt; rot.x += rot.vx * dt; rot.x += (.25 - rot.x) * dt * .4;
    group.rotation.set(rot.x, rot.y, m * .5 * Math.sin(t));
    pmat.size = .045 + cur.vol * .025; lmat.opacity = .16 + cur.glow * .22 + cur.vol * .2; pmat.opacity = .55 + cur.glow * .45;
    renderer.render(scene, cam);
  }
  requestAnimationFrame(frame);
  return { setColor(c){ const col = COLORS[c] || COLORS.green; pmat.color.set(col); lmat.color.set(col); }, nudge };
})();

function applyLook(){
  document.body.classList.toggle('neural', style === 'neural');
  sphere.setColor(color);
  const c = COLORS[color] || COLORS.green; document.documentElement.style.setProperty('--hand', c);
}
applyLook();

/* ══════════ Horloge HUD ══════════ */
setInterval(() => {
  const d = new Date();
  $('hc-t').textContent = d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  $('hc-d').textContent = d.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' }).toUpperCase();
  $('hc-l').textContent = ($('v-weather') || {}).textContent || '--';
  $('hc-r').textContent = ($('v-disk') || {}).textContent || '--';
}, 1000);

/* ══════════ Terminal de sous-titres + bandeau « VOUS » ══════════ */
let typeTimer = 0, termHide = 0, lastUser = null;
function typeOut(text){
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 520); if(!text) return;
  clearInterval(typeTimer); clearTimeout(termHide);
  const box = $('term-box'); let n = 0; $('term').classList.add('on'); $('term-st').textContent = 'TRANSMISSION…'; $('term-st').className = '';
  const step = Math.max(1, Math.round(text.length / 260));
  typeTimer = setInterval(() => {
    n = Math.min(text.length, n + step);
    box.innerHTML = esc(text.slice(0, n)) + '<span class="caret">&nbsp;</span>'; box.scrollTop = box.scrollHeight;
    if(n >= text.length){ clearInterval(typeTimer); $('term-st').textContent = 'TRANSMISSION_COMPLETE (STABLE)'; $('term-st').className = 'ok';
      termHide = setTimeout(() => $('term').classList.remove('on'), 25000); }
  }, 32);
}
let youHide = 0;
function showYou(text){
  $('you').textContent = 'VOUS : ' + String(text).slice(0, 160); $('you').classList.add('on');
  clearTimeout(youHide); youHide = setTimeout(() => $('you').classList.remove('on'), 9000);
}

/* ══════════ Widget mails holographique ══════════ */
let mailW = null, mails = [];
function mailWidget(){
  if(mailW) return mailW;
  mailW = document.createElement('div'); mailW.className = 'holo'; mailW.id = 'mailw';
  mailW.innerHTML = `<div class="hh"><b id="mw-title">COMMUNICATIONS // BOÎTE PRO</b><button data-a="refresh" title="Actualiser">⟳ ACTUALISER</button><button class="g" data-a="back" id="mw-back" style="display:none">◀ LISTE</button><button data-a="close" title="Fermer">✕</button></div>
    <div class="hb" id="mw-body"></div><div class="hf"><span id="mw-foot">FIK_INBOX</span><span>SECURE_CHANNEL</span></div>`;
  stage.appendChild(mailW);
  const r = stage.getBoundingClientRect(); mailW.style.left = Math.max(10, r.width / 2 - 195) + 'px'; mailW.style.top = '64px';
  mailW.querySelector('[data-a=refresh]').onclick = () => send({ type:'message', text:'montre mes mails' });
  mailW.querySelector('[data-a=back]').onclick = () => send({ type:'message', text:'retour à la liste des mails' });
  mailW.querySelector('[data-a=close]').onclick = () => send({ type:'message', text:'ferme les mails' });
  dragBy(mailW.querySelector('.hh'), mailW);
  return mailW;
}
function when(d){ const t = new Date(d); if(isNaN(t)) return ''; const today = new Date().toDateString() === t.toDateString();
  return today ? t.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : t.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }); }
const who = f => { const m = String(f || '').match(/^\s*"?([^"<]+?)"?\s*</); return (m ? m[1] : String(f || '').split('@')[0]).trim() || 'inconnu'; };
function showMails(list){
  mails = list || []; const w = mailWidget(), b = $('mw-body');
  $('mw-title').textContent = 'COMMUNICATIONS // BOÎTE PRO'; $('mw-back').style.display = 'none';
  b.className = 'hb'; b.innerHTML = mails.length ? '' : '<div style="padding:18px;text-align:center;color:var(--dim)">BOÎTE VIDE</div>';
  mails.forEach((m, i) => {
    const d = document.createElement('div'); d.className = 'mrow' + (m.unread ? ' unread' : '');
    d.innerHTML = `<div class="r1"><span>[${i + 1}]</span><b>${esc(who(m.from))}</b><i>${esc(when(m.date))}</i></div><div class="s">${esc(m.subject)}</div><div class="p">${esc(m.snippet)}</div>`;
    d.onclick = () => send({ type:'message', text:`ouvre le mail ${i + 1}` });
    b.appendChild(d);
  });
  $('mw-foot').textContent = `FIK_INBOX · ${mails.length} MESSAGE${mails.length > 1 ? 'S' : ''}`;
}
function openMail(i, m){
  const w = mailWidget(), b = $('mw-body'); $('mw-back').style.display = '';
  $('mw-title').textContent = `MESSAGE [${(i ?? 0) + 1}] // LECTURE`;
  b.className = 'hb mopen';
  b.innerHTML = `<div class="mh"><b>${esc(m.subject)}</b>De : ${esc(m.from)}<br>${esc(new Date(m.date).toLocaleString('fr-FR'))}${(m.attachments || []).length ? '<br>📎 ' + m.attachments.map(esc).join(', ') : ''}</div><div class="mb">${esc(m.body)}${m.truncated ? '\n…' : ''}</div>`;
  b.scrollTop = 0;
}
function closeMails(){ if(mailW){ mailW.remove(); mailW = null; } }

/* Déplacer un widget (souris ou main) */
function dragBy(handle, el){
  handle.addEventListener('pointerdown', e => {
    if(e.target.closest('button')) return;
    const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop; handle.setPointerCapture(e.pointerId);
    const mv = ev => moveTo(el, ox + ev.clientX - sx, oy + ev.clientY - sy);
    handle.addEventListener('pointermove', mv);
    handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', mv), { once:true });
  });
}
function moveTo(el, x, y){
  const W = stage.clientWidth, H = stage.clientHeight;
  el.style.left = Math.max(-el.offsetWidth + 60, Math.min(W - 60, x)) + 'px'; el.style.top = Math.max(0, Math.min(H - 40, y)) + 'px';
}

/* ══════════ Contrôle à la main (MediaPipe Hand Landmarker, dans la page) ══════════ */
const gest = { on:false, lm:null, video:null, stream:null, raf:0, lastTs:-1, hands:[], cur:{ x:-1, y:-1 }, pinch:false, hold:null, hover:null,
  zoom0:0, hist:[], swipeAt:0 };
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
async function setGesture(on, tell){
  if(on === gest.on) return;
  if(!on){ stopGesture(); if(tell) send({ type:'message', text:'désactive le contrôle gestuel' }); return; }
  gest.on = true; $('btn-hand').classList.add('active');
  if(tell) send({ type:'message', text:'active le contrôle gestuel' });
  try {
    if(!gest.lm){
      toast('Chargement du suivi de la main…');
      const v = await import(`${MP}/vision_bundle.mjs`);
      const fs = await v.FilesetResolver.forVisionTasks(`${MP}/wasm`);
      const opts = d => ({ baseOptions:{ modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', delegate:d },
        runningMode:'VIDEO', numHands:2, minHandDetectionConfidence:.6, minTrackingConfidence:.5 });
      try { gest.lm = await v.HandLandmarker.createFromOptions(fs, opts('GPU')); } catch(_) { gest.lm = await v.HandLandmarker.createFromOptions(fs, opts('CPU')); }
    }
    gest.stream = await navigator.mediaDevices.getUserMedia({ video:{ width:640, height:480, facingMode:'user' } });
    gest.video = Object.assign(document.createElement('video'), { muted:true, playsInline:true, srcObject:gest.stream });
    await gest.video.play();
    if(!gest.on){ stopGesture(); return; }
    $('gpip').classList.add('on'); toast('✋ Contrôle à la main actif — pince pour attraper, deux mains pour zoomer');
    loopGesture();
  } catch(e){
    stopGesture();
    toast(/Permission|NotAllowed/i.test(e.name + e.message) ? 'Caméra refusée : autorise-la pour Nexus dans le navigateur.'
      : /NotReadable|in use|Could not start/i.test(e.name + e.message) ? 'Caméra déjà utilisée (vision Nexus ?) : coupe-la puis réessaie.'
      : 'Contrôle à la main indisponible : ' + e.message);
  }
}
function stopGesture(){
  gest.on = false; cancelAnimationFrame(gest.raf); $('btn-hand').classList.remove('active');
  if(gest.stream) gest.stream.getTracks().forEach(t => t.stop()); gest.stream = null;
  $('gpip').classList.remove('on'); $('gcur').style.display = 'none'; release(); setHover(null);
}
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function handInfo(L){
  const size = d2(L[0], L[9]) || .1, pinchR = d2(L[4], L[8]) / size;
  const open = [[8, 6], [12, 10], [16, 14], [20, 18]].every(([tip, pip]) => d2(L[tip], L[0]) > d2(L[pip], L[0]) * 1.1);
  // Zone active réduite au centre de l'image : pas besoin d'aller au bord du champ pour atteindre les coins de l'écran
  const nx = Math.min(1, Math.max(0, ((1 - L[8].x) - .18) / .64)), ny = Math.min(1, Math.max(0, (L[8].y - .14) / .6));
  return { pinchR, open, x:nx * innerWidth, y:ny * innerHeight };
}
function loopGesture(){
  gest.raf = requestAnimationFrame(loopGesture);
  const v = gest.video; if(!v || v.readyState < 2 || v.currentTime === gest.lastTs) return;
  gest.lastTs = v.currentTime;
  const res = gest.lm.detectForVideo(v, performance.now());
  const H = (res.landmarks || []).map(handInfo);
  drawPip(v, res.landmarks || []);
  const c = $('gcur');
  if(!H.length){ c.style.display = 'none'; release(); setHover(null); gest.hist = []; return; }
  const h = H[0];
  const k = gest.cur.x < 0 ? 1 : .45;                             // lissage du curseur
  gest.cur.x += (h.x - gest.cur.x) * k; gest.cur.y += (h.y - gest.cur.y) * k;
  const x = gest.cur.x, y = gest.cur.y;
  c.style.display = 'block'; c.style.left = x + 'px'; c.style.top = y + 'px';
  const pinched = gest.pinch ? h.pinchR < .55 : h.pinchR < .33;   // hystérésis
  const two = H.length === 2 && H.every(q => q.pinchR < .4);
  c.classList.toggle('pinch', pinched); c.classList.toggle('two', two);
  if(two){                                                        // deux mains pincées : écarter = zoom
    const dist = Math.hypot(H[0].x - H[1].x, H[0].y - H[1].y);
    if(gest.zoom0){ const f = dist / gest.zoom0; if(Math.abs(f - 1) > .06){ zoom(f); gest.zoom0 = dist; } } else gest.zoom0 = dist;
    release(); return;
  }
  gest.zoom0 = 0;
  if(pinched && !gest.pinch) press(x, y); else if(pinched) dragTo(x, y); else if(gest.pinch) release();
  gest.pinch = pinched;
  if(!pinched) setHover(x, y);
  // Balayage main ouverte
  const now = performance.now();
  gest.hist.push({ x, y, t:now, open:h.open }); gest.hist = gest.hist.filter(p => now - p.t < 380);
  const f = gest.hist[0];
  if(h.open && f && f.open && now - gest.swipeAt > 1100 && Math.abs(x - f.x) > innerWidth * .32 && Math.abs(y - f.y) < innerHeight * .2){
    gest.swipeAt = now; gest.hist = []; swipe(x > f.x ? 'right' : 'left');
  }
}
function drawPip(v, lands){
  const cv = $('gpip'), g = cv.getContext('2d'), W = cv.width, Hh = cv.height;
  g.save(); g.translate(W, 0); g.scale(-1, 1); g.drawImage(v, 0, 0, W, Hh); g.restore();
  g.strokeStyle = COLORS[color] || COLORS.green; g.fillStyle = '#fff'; g.lineWidth = 1.5;
  const B = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  lands.forEach(L => { g.beginPath(); B.forEach(([a, b]) => { g.moveTo((1 - L[a].x) * W, L[a].y * Hh); g.lineTo((1 - L[b].x) * W, L[b].y * Hh); }); g.stroke();
    [4, 8].forEach(i => { g.beginPath(); g.arc((1 - L[i].x) * W, L[i].y * Hh, 3, 0, 7); g.fill(); }); });
}
function globeAt(x, y){
  if(typeof globeFrame === 'undefined' || !globeFrame || !$('globewrap').classList.contains('on')) return null;
  const r = globeFrame.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? { x:x - r.left, y:y - r.top } : null;
}
const toGlobe = m => globeFrame.contentWindow.postMessage({ type:'globe', ...m }, location.origin);
function targetAt(x, y){ const c = $('gcur'); c.style.visibility = 'hidden'; const el = document.elementFromPoint(x, y); c.style.visibility = ''; return el; }
function setHover(x, y){
  let b = null;
  if(x != null){
    const gpt = globeAt(x, y);
    if(gpt){ toGlobe({ action:'g_hover', ...gpt }); }
    else { const el = targetAt(x, y); b = el && el.closest('button,.mrow,.ptab,.card,.act,.th'); }
  }
  if(b !== gest.hover){ if(gest.hover) gest.hover.classList.remove('ghover'); gest.hover = b; if(b) b.classList.add('ghover'); }
}
function press(x, y){
  const gpt = globeAt(x, y);
  if(gpt){ gest.hold = { kind:'globe' }; toGlobe({ action:'g_ptr', phase:'down', ...gpt }); return; }
  const el = targetAt(x, y), holo = el && el.closest('.holo'), body = el && el.closest('.hb,.pb,.blist');
  gest.hold = { x0:x, y0:y, x, y, moved:0, el,
    kind: holo && !body ? 'move' : body ? 'scroll' : el && el.closest('#neural,#stage') ? 'spin' : 'none',
    box: holo, scroller: body, ox: holo ? holo.offsetLeft : 0, oy: holo ? holo.offsetTop : 0 };
}
function dragTo(x, y){
  const h = gest.hold; if(!h) return;
  if(h.kind === 'globe'){ const gpt = globeAt(x, y); if(gpt) toGlobe({ action:'g_ptr', phase:'move', ...gpt }); return; }
  const dx = x - h.x, dy = y - h.y; h.x = x; h.y = y; h.moved += Math.abs(dx) + Math.abs(dy);
  if(h.kind === 'move') moveTo(h.box, h.ox + x - h.x0, h.oy + y - h.y0);
  else if(h.kind === 'scroll') h.scroller.scrollTop -= dy * 1.6;
  else if(h.kind === 'spin') sphere.nudge(dx, dy);
}
function release(){
  const h = gest.hold; gest.hold = null; gest.pinch = false; if(!h) return;
  if(h.kind === 'globe'){ toGlobe({ action:'g_ptr', phase:'up', x:gest.cur.x - globeFrame.getBoundingClientRect().left, y:gest.cur.y - globeFrame.getBoundingClientRect().top }); return; }
  if(h.moved < 16 && h.el){ const b = h.el.closest('button,.mrow,.ptab,.card,.act,a,.th'); if(b) b.click(); }
}
function zoom(f){
  if(globeAt(gest.cur.x, gest.cur.y)) toGlobe({ action:'g_zoom', f });
  else if(mailW){ const s = Math.max(.7, Math.min(1.6, (parseFloat(mailW.dataset.s) || 1) * f)); mailW.dataset.s = s; mailW.style.transform = `scale(${s})`; mailW.style.transformOrigin = 'top left'; }
}
function swipe(dir){
  if($('globewrap').classList.contains('on')) toGlobe({ action: dir === 'right' ? 'cam_next' : 'cam_prev' });
  else if(mailW) send({ type:'message', text:'ferme les mails' });
  else if(document.querySelector('#panel.on')) $('pclose').click();
  else sphere.nudge(dir === 'right' ? 260 : -260, 0);
}

/* ══════════ Messages du serveur ══════════ */
window.Holo = {
  on(d){
    switch(d.type){
      case 'speak': typeOut(d.text); break;
      case 'chat_history': { const u = [...(d.history || [])].reverse().find(m => m.role !== 'nexus'); if(u && u.text !== lastUser){ if(lastUser !== null) showYou(u.text); lastUser = u.text; } else if(lastUser === null) lastUser = ''; break; }
      case 'mails': showMails(d.emails); break;
      case 'mail_open': openMail(d.index, d.mail || {}); break;
      case 'mails_close': closeMails(); break;
      case 'gesture': void setGesture(!!d.on, false); break;
      case 'look': if(d.style) style = d.style; if(d.color) color = d.color; store.set('nexus_look', style); store.set('nexus_color', color); applyLook(); break;
    }
  },
};
})();
