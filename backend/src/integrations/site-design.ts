import type { Place, Content } from './demo-site.js';

// ── FIK Sites : la page publique ────────────────────────────────────────────────────────────────
// Kouider veut des sites « incroyables », uniques, qui ne se ressemblent pas. Chaque site a :
//  - un STYLE (5 univers très différents : mise en page, héros, carte, typographie, fond), choisi par Claude selon le métier ;
//  - une VARIANTE tirée du nom du commerce (disposition du héros, forme des photos) → deux sites du même style diffèrent ;
//  - sa palette et ses polices (Claude) ;
//  - la « touche FIK », commune à tous : badge « Ouvert maintenant » en direct, bandeau qui défile, barre de progression,
//    apparitions animées, visionneuse de photos, avis qui défilent, barre Appeler / Itinéraire / WhatsApp sur téléphone,
//    signature FIK en bas.
// Un seul fichier HTML (+ photos), aucun script externe : le site tient même si notre serveur tombe.

export const STYLES = ['luxe', 'editorial', 'vibrant', 'minimal', 'urban'] as const;
export type StyleId = typeof STYLES[number];
export const STYLE_HINT: Record<StyleId, string> = {
  luxe: 'luxe = fond sombre, or, serif élégant, plein écran (restaurant gastronomique, hôtel, bijouterie, pâtisserie fine)',
  editorial: 'editorial = magazine clair, grand titre + photo encadrée, sections numérotées (café, librairie, boutique, fleuriste, cuisine du marché)',
  vibrant: 'vibrant = couleurs vives, formes arrondies, cartes qui bougent (fast-food, glacier, pizzeria, enfants, salle de sport)',
  minimal: 'minimal = blanc, très épuré, typographie géante (coiffure, beauté, santé, architecte, cabinet)',
  urban: 'urban = noir, majuscules condensées, néon, grain (garage, barbier, vente auto, street-food, tatouage)',
};
const BY_KIND: Record<string, StyleId> = {
  restaurant: 'luxe', hotel: 'luxe', cafe: 'editorial', librairie: 'editorial', boutique: 'editorial', bar: 'urban',
  garage: 'urban', vente_auto: 'urban', coiffure: 'minimal', beaute: 'minimal', sante: 'minimal', tabac: 'vibrant', autre: 'vibrant',
};

export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export interface RenderOpts { demo: boolean; siteId?: string; formApi?: string }

// Formulaire du site selon le métier : réservation de table, rendez-vous, ou simple message.
export function formKind(kind: string): { mode: 'table' | 'rdv' | 'contact'; title: string; nav: string } {
  if (['restaurant', 'cafe', 'bar', 'hotel'].includes(kind)) return { mode: 'table', title: kind === 'hotel' ? 'Réserver' : 'Réserver une table', nav: 'Réserver' };
  if (['coiffure', 'beaute', 'garage', 'sante'].includes(kind)) return { mode: 'rdv', title: 'Prendre rendez-vous', nav: 'Rendez-vous' };
  return { mode: 'contact', title: 'Nous écrire', nav: 'Contact' };
}

function formSection(c: Content, siteId: string, api: string): string {
  const f = formKind(c.kind);
  const extra = f.mode === 'table'
    ? `<div class="f3"><label>Date<input name="date" type="date" required></label><label>Heure<input name="time" type="time" required></label><label>Personnes<input name="people" type="number" min="1" max="200" value="2" required></label></div>`
    : f.mode === 'rdv' ? `<div class="f3"><label>Date souhaitée<input name="date" type="date" required></label><label>Heure<input name="time" type="time"></label></div>` : '';
  return `<section id="form" class="formsec"><div class="wrap narrow reveal"><div class="eyebrow">${esc(f.nav)}</div><h2>${esc(f.title)}</h2>
  <form id="fikform" autocomplete="on">
    <div class="f2"><label>Nom<input name="name" required maxlength="80"></label><label>Téléphone<input name="phone" type="tel" required maxlength="30"></label></div>
    <label>E-mail (facultatif)<input name="email" type="email" maxlength="120"></label>
    ${extra}
    <label>${f.mode === 'contact' ? 'Votre message' : 'Précisions (facultatif)'}<textarea name="message" rows="4" maxlength="2000"${f.mode === 'contact' ? ' required' : ''}></textarea></label>
    <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <button class="btn" type="submit">Envoyer</button><p class="fmsg" role="status"></p>
  </form></div></section>
<script>
(function(){const f=document.getElementById('fikform'),m=f.querySelector('.fmsg'),t0=Date.now();
f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;m.textContent='Envoi…';
const d=Object.fromEntries(new FormData(f));d.mode=${JSON.stringify(f.mode)};d.elapsed=Date.now()-t0;
try{const r=await fetch(${JSON.stringify(`${api}/api/client-sites/public/${siteId}/message`)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const j=await r.json().catch(()=>({}));
if(!r.ok)throw new Error(j.error||'Envoi impossible');f.reset();m.textContent=${JSON.stringify(f.mode === 'contact' ? 'Merci, votre message a bien été envoyé. Nous vous répondons rapidement.' : 'Merci, votre demande a bien été envoyée. Nous vous recontactons pour la confirmer.')}}
catch(x){m.textContent=x.message+'. Vous pouvez aussi nous appeler.'}b.disabled=false})})();
</script>`;
}

/** Compteur des vrais sites clients (bilan mensuel du patron) : 1 visite par session + clics Appeler / Itinéraire / WhatsApp. Aucun cookie. */
function statsBeacon(api: string, siteId: string): string {
  const u = `${api}/api/client-sites/public/${siteId}/hit?e=`;
  return `<script>
(function(){var u=${JSON.stringify(u)};function h(e){try{if(navigator.sendBeacon)navigator.sendBeacon(u+e);else fetch(u+e,{method:'POST',keepalive:true})}catch(x){}}
try{if(!sessionStorage.getItem('fikv')){sessionStorage.setItem('fikv','1');h('visit')}}catch(x){h('visit')}
document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest?ev.target.closest('a'):null;if(!a)return;var r=a.getAttribute('href')||'';
if(r.indexOf('tel:')===0)h('call');else if(/google\\.com\\/maps\\/dir/.test(r))h('route');else if(/wa\\.me|whatsapp/.test(r))h('whatsapp')},true)})();
</script>`;
}

/** Numéro WhatsApp d'un portable (Algérie 05/06/07, France 06/07), sinon rien. */
function whatsapp(phone: string | undefined): string {
  if (!phone) return '';
  let d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2);
  if (/^0[567]\d{8}$/.test(d)) d = `213${d.slice(1)}`;               // Algérie
  if (/^0[67]\d{8}$/.test(phone.replace(/\D/g, '')) && !/^213/.test(d)) d = `33${phone.replace(/\D/g, '').slice(1)}`;   // France
  return /^213[567]\d{8}$/.test(d) || /^33[67]\d{8}$/.test(d) ? `https://wa.me/${d}` : '';
}

/** Style du site : celui choisi par Claude, sinon d'après le métier. */
export const styleOf = (c: Content): StyleId => (STYLES as readonly string[]).includes(c.style ?? '') ? c.style as StyleId : BY_KIND[c.kind] ?? 'vibrant';

// Couleurs de chaque univers, tirées de la palette du commerce
function themeVars(st: StyleId, pal: Content['palette']): string {
  const { primary: p, accent: a, dark: d, light: l } = pal;
  switch (st) {
    case 'luxe': return `--bg:${d};--fg:#f4efe6;--muted:rgba(244,239,230,.66);--card:rgba(255,255,255,.04);--line:rgba(255,255,255,.12);--hl:${a};--btnfg:${d};--alt:color-mix(in srgb,${d} 82%,#000)`;
    case 'urban': return `--bg:#0b0b0d;--fg:#f2f2f2;--muted:rgba(242,242,242,.6);--card:#141418;--line:rgba(255,255,255,.1);--hl:${a};--btnfg:#0b0b0d;--alt:#111114`;
    case 'minimal': return `--bg:#ffffff;--fg:#111;--muted:#6b6b6b;--card:#f6f6f4;--line:rgba(0,0,0,.09);--hl:${p};--btnfg:#fff;--alt:${l}`;
    case 'editorial': return `--bg:${l};--fg:#1d1b19;--muted:#6d665e;--card:#fff;--line:rgba(0,0,0,.1);--hl:${p};--btnfg:#fff;--alt:#fff`;
    default: return `--bg:${l};--fg:#1a1a1a;--muted:#5d5d5d;--card:#fff;--line:rgba(0,0,0,.08);--hl:${p};--btnfg:#fff;--alt:color-mix(in srgb,${a} 14%,#fff)`;
  }
}

const BASE_CSS = `*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{font-family:var(--fb);color:var(--fg);background:var(--bg);line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden}
h1,h2,h3{font-family:var(--fh);line-height:1.08;font-weight:700}a{color:inherit}img{display:block;max-width:100%}
.wrap{max-width:1180px;margin:0 auto;padding:0 22px}.narrow{max-width:760px}
section{padding:clamp(70px,10vw,120px) 0;position:relative}
.eyebrow{text-transform:uppercase;letter-spacing:.28em;font-size:.74rem;color:var(--hl);font-weight:700;margin-bottom:14px}
h2{font-size:clamp(2rem,5vw,3.4rem);margin-bottom:26px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:700;background:var(--hl);color:var(--btnfg);border:2px solid var(--hl);transition:transform .25s,box-shadow .25s;cursor:pointer;font:inherit;font-weight:700}
.btn:hover{transform:translateY(-2px);box-shadow:0 12px 30px color-mix(in srgb,var(--hl) 40%,transparent)}
.btn.ghost{background:transparent;color:inherit;border-color:currentColor}
.btns{display:flex;flex-wrap:wrap;gap:12px}
#prog{position:fixed;top:0;left:0;height:3px;width:0;background:var(--a);z-index:60}
nav{position:fixed;inset:0 0 auto 0;z-index:40;display:flex;justify-content:space-between;align-items:center;padding:16px 24px;transition:all .35s}
nav b{font-family:var(--fh);font-size:1.15rem;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62vw}
nav .links a{margin-left:22px;text-decoration:none;font-size:.9rem;opacity:.85}nav .links a:hover{opacity:1}
nav.solid{background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(14px);box-shadow:0 1px 0 var(--line);padding:11px 24px}
@media(max-width:760px){nav .links{display:none}}
.open{display:inline-flex;align-items:center;gap:8px;font-size:.85rem;font-weight:700;padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.14);backdrop-filter:blur(6px)}
.open i{width:9px;height:9px;border-radius:50%;background:#9ca3af}.open.on i{background:#22c55e;box-shadow:0 0 0 0 rgba(34,197,94,.6);animation:pulse 1.8s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 10px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.rating{display:inline-flex;gap:8px;align-items:center;font-size:.92rem}.rating .s{color:var(--a);letter-spacing:2px}
.marquee{overflow:hidden;white-space:nowrap;border-block:1px solid var(--line);padding:18px 0;background:var(--alt)}
.marquee div{display:inline-block;animation:mq 38s linear infinite;font-family:var(--fh);font-size:clamp(1.1rem,2.4vw,1.6rem)}
.marquee span{margin:0 26px}.marquee em{color:var(--a);font-style:normal}
@keyframes mq{to{transform:translateX(-50%)}}
.about{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(30px,6vw,80px);align-items:center}
.about p{margin-bottom:16px;font-size:1.07rem;color:var(--muted)}
.about .ph{position:relative}.about .ph img{width:100%;height:min(560px,70vw);object-fit:cover}
.sig{font-family:var(--fh);font-size:clamp(1.3rem,2.6vw,1.8rem);line-height:1.35;margin:26px 0 8px;padding-left:20px;border-left:3px solid var(--a)}
@media(max-width:860px){.about{grid-template-columns:1fr}}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.chips span{border:1px solid var(--line);padding:8px 15px;border-radius:999px;font-size:.86rem;background:var(--card)}
.menu{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:clamp(30px,5vw,60px)}
.menu h3{font-size:1.5rem;margin-bottom:18px;color:var(--hl)}
.mi{display:flex;align-items:baseline;gap:10px;padding:12px 0}
.mi .n{font-weight:700}.mi .dots{flex:1;border-bottom:1px dotted var(--line);transform:translateY(-4px)}.mi .pr{font-weight:700;color:var(--hl);white-space:nowrap}
.mi + p{font-size:.9rem;color:var(--muted);margin:-8px 0 6px}
.tabs{display:flex;gap:8px;overflow-x:auto;margin:0 0 34px;padding-bottom:4px;scrollbar-width:none}.tabs::-webkit-scrollbar{display:none}
.tabs button{flex:0 0 auto;font:inherit;font-weight:700;font-size:.88rem;padding:10px 18px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer;transition:all .25s}
.tabs button.on{background:var(--hl);color:var(--btnfg);border-color:var(--hl)}[data-g].off{display:none}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px;transition:transform .3s,box-shadow .3s}
.card:hover{transform:translateY(-6px) rotate(-.4deg);box-shadow:0 22px 50px rgba(0,0,0,.12)}
.card .g{font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}.card h3{font-size:1.25rem;margin:8px 0}
.card p{font-size:.92rem;color:var(--muted)}.card .pr{display:inline-block;margin-top:14px;background:var(--hl);color:var(--btnfg);padding:5px 14px;border-radius:999px;font-weight:700;font-size:.9rem}
.gal{columns:3 260px;column-gap:14px}.gal img{width:100%;margin-bottom:14px;cursor:zoom-in;transition:transform .4s,filter .4s;break-inside:avoid}
.gal img:hover{transform:scale(1.02);filter:saturate(1.15)}
#lb{position:fixed;inset:0;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;z-index:80;cursor:zoom-out}
#lb img{max-width:92vw;max-height:88vh;border-radius:8px}#lb.on{display:flex}
.rv{position:relative;min-height:240px}.rv blockquote{position:absolute;inset:0;opacity:0;transition:opacity .8s;font-family:var(--fh);font-size:clamp(1.3rem,3vw,2.1rem);line-height:1.35}
.rv blockquote.on{opacity:1;position:relative}.rv cite{display:block;margin-top:18px;font-family:var(--fb);font-size:.92rem;font-style:normal;color:var(--muted)}
.rv .s{color:var(--a);letter-spacing:3px;font-size:1rem;display:block;margin-bottom:14px}
.dots2{display:flex;gap:8px;margin-top:22px}.dots2 b{width:28px;height:4px;border-radius:4px;background:var(--line);cursor:pointer}.dots2 b.on{background:var(--hl)}
.info{display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,5vw,70px)}@media(max-width:860px){.info{grid-template-columns:1fr}}
.hours div{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line);text-transform:capitalize}
.hours .today{color:var(--hl);font-weight:800}
.contact p{margin-bottom:10px;font-size:1.05rem}.map{width:100%;height:340px;border:0;border-radius:18px;margin-top:16px;filter:grayscale(.2)}
.formsec{background:var(--alt)}.formsec label{display:block;font-size:.85rem;font-weight:700;margin:14px 0 4px;color:var(--muted)}
.formsec input,.formsec textarea{width:100%;font:inherit;padding:13px 15px;border:1px solid var(--line);border-radius:12px;margin-top:4px;background:var(--card);color:var(--fg)}
.formsec .f2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.formsec .f3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
@media(max-width:600px){.formsec .f2,.formsec .f3{grid-template-columns:1fr}}
.formsec .btn{margin-top:20px}.formsec .btn:disabled{opacity:.6}.fmsg{margin-top:12px;font-weight:700;color:var(--hl)}.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
footer{padding:46px 22px 110px;text-align:center;font-size:.88rem;color:var(--muted);border-top:1px solid var(--line)}
footer b{color:var(--fg)}.fik{display:inline-flex;align-items:center;gap:8px;margin-top:16px;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;opacity:.8}
.fik svg{width:18px;height:18px}
.bar{position:fixed;left:10px;right:10px;bottom:10px;z-index:50;display:none;gap:8px;padding:8px;border-radius:20px;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(14px);box-shadow:0 10px 40px rgba(0,0,0,.25);border:1px solid var(--line)}
.bar a{flex:1;text-align:center;text-decoration:none;font-weight:700;font-size:.86rem;padding:11px 4px;border-radius:14px;background:var(--card)}
.bar a.main{background:var(--hl);color:var(--btnfg)}@media(max-width:760px){.bar{display:flex}footer{padding-bottom:120px}}
.demo{position:fixed;left:50%;transform:translateX(-50%);top:70px;z-index:45;background:rgba(0,0,0,.72);color:#fff;font-size:.72rem;padding:6px 12px;border-radius:20px}
.reveal{opacity:0;transform:translateY(34px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1)}.reveal.on{opacity:1;transform:none}
.reveal.d1{transition-delay:.12s}.reveal.d2{transition-delay:.24s}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.reveal{opacity:1;transform:none}}`;

// Ce qui change d'un univers à l'autre
const STYLE_CSS: Record<StyleId, string> = {
  luxe: `nav{color:#fff;text-transform:uppercase;letter-spacing:.2em;font-size:.8rem}nav b{letter-spacing:.18em}
.hero{min-height:100svh;display:grid;place-items:center;text-align:center;color:#fff;position:relative;overflow:hidden}
.hero .bgi{position:absolute;inset:0;background-size:cover;background-position:center;animation:kb 22s ease-in-out infinite alternate}
.hero:after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,.25),rgba(0,0,0,.78))}
@keyframes kb{to{transform:scale(1.14) translate(-1.5%,-1.5%)}}
.hero .in{position:relative;z-index:2;padding:0 22px}.hero h1{font-size:clamp(3rem,10vw,7.5rem);font-weight:400;letter-spacing:.02em}
.hero .tag{font-size:clamp(1rem,2.4vw,1.35rem);letter-spacing:.24em;text-transform:uppercase;margin:16px 0 30px;color:var(--a)}
.hero .line{width:90px;height:1px;background:var(--a);margin:22px auto}.hero .btns{justify-content:center}.hero .meta{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;margin-bottom:26px}
.about .ph img{border-radius:0}.about .ph:before{content:"";position:absolute;inset:-16px 16px 16px -16px;border:1px solid var(--a)}
h2{font-weight:400}.menu h3{font-weight:400;letter-spacing:.06em;border-bottom:1px solid var(--line);padding-bottom:12px}
.offer{background:var(--alt)}
.about{text-align:left}.about .ph img{height:min(620px,80vw)}.sig{border:0;padding:0;text-align:center;font-style:italic;color:var(--a);font-size:clamp(1.5rem,3vw,2.2rem);margin:34px 0 10px}`,
  editorial: `nav{color:var(--fg)}
.hero{min-height:100svh;display:grid;grid-template-columns:1.1fr .9fr;align-items:center;gap:clamp(24px,5vw,70px);padding:110px clamp(22px,5vw,70px) 60px;max-width:1300px;margin:0 auto}
.hero h1{font-size:clamp(3rem,8.5vw,7rem);letter-spacing:-.02em}.hero .tag{font-size:clamp(1.1rem,2.2vw,1.45rem);color:var(--muted);margin:18px 0 28px;max-width:30ch}
.hero .ph{position:relative}.hero .ph img{width:100%;height:min(74vh,640px);object-fit:cover;border-radius:4px;position:relative;z-index:1}
.hero .ph:before{content:"";position:absolute;inset:26px -26px -26px 26px;background:var(--a);border-radius:4px}
.hero .meta{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px}.hero .open{background:var(--card);border:1px solid var(--line)}
@media(max-width:860px){.hero{grid-template-columns:1fr;padding-top:96px}.hero .ph img{height:52vh}}
.eyebrow{color:var(--fg)}.eyebrow:before{content:attr(data-n);color:var(--hl);margin-right:10px}
h2{letter-spacing:-.01em}.about .ph img{border-radius:4px}.offer{background:var(--alt)}
.about .ph{order:-1}.about p:first-of-type::first-letter{float:left;font-family:var(--fh);font-size:4.4em;line-height:.8;margin:8px 12px 0 0;color:var(--hl)}
.mi .n{font-family:var(--fh);font-size:1.12rem}`,
  vibrant: `nav{color:#fff}nav.solid{color:var(--fg)}
.hero{min-height:100svh;position:relative;display:flex;align-items:center;color:#fff;background:linear-gradient(135deg,var(--p),var(--a));clip-path:polygon(0 0,100% 0,100% 88%,0 100%);overflow:hidden;padding:110px 0 120px}
.hero .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center;width:100%}
.hero h1{font-size:clamp(3rem,9vw,6.4rem);letter-spacing:-.03em}.hero .tag{font-size:clamp(1.1rem,2.4vw,1.5rem);margin:14px 0 26px;opacity:.95}
.hero .ph img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:44% 56% 52% 48%/48% 42% 58% 52%;box-shadow:0 30px 80px rgba(0,0,0,.35);animation:blob 12s ease-in-out infinite alternate;border:8px solid rgba(255,255,255,.25)}
@keyframes blob{to{border-radius:56% 44% 40% 60%/60% 52% 48% 40%}}
.hero .btn{background:#fff;color:var(--p);border-color:#fff}.hero .btn.ghost{background:transparent;color:#fff}.hero .meta{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:22px}
.hero .bub{position:absolute;border-radius:50%;background:rgba(255,255,255,.12)}
@media(max-width:860px){.hero .wrap{grid-template-columns:1fr}.hero .ph{max-width:340px}}
.about .ph img{border-radius:44% 56% 52% 48%/48% 42% 58% 52%;aspect-ratio:1;height:auto}.card{border-radius:28px}h2{letter-spacing:-.02em}.offer{background:var(--alt)}
.about>div:first-child{background:var(--card);padding:clamp(24px,4vw,44px);border-radius:32px;box-shadow:0 24px 70px rgba(0,0,0,.09)}`,
  minimal: `nav{color:var(--fg)}
.hero{padding:140px 0 0}.hero h1{font-size:clamp(3.4rem,13vw,11rem);letter-spacing:-.05em;line-height:.92;font-weight:600}
.hero .row{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;margin:28px 0 40px}
.hero .tag{font-size:clamp(1.05rem,2vw,1.3rem);color:var(--muted);max-width:34ch}.hero .open{background:var(--card)}
.hero .strip{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;height:min(62vh,560px)}.hero .strip img{width:100%;height:100%;object-fit:cover}
@media(max-width:760px){.hero .strip{grid-template-columns:1fr;height:auto}.hero .strip img{height:44vh}.hero .strip img+img{display:none}}
h2{font-weight:600;letter-spacing:-.03em}.eyebrow{color:var(--muted)}.btn{border-radius:0}.chips span{border-radius:0}.card{border-radius:0}
.mi{border-bottom:1px solid var(--line)}.mi .dots{border:0}.offer{background:var(--alt)}
.about{grid-template-columns:1fr}.about p{font-size:clamp(1.1rem,1.8vw,1.35rem);max-width:52ch;color:var(--fg)}.about .ph img{height:min(58vh,520px)}`,
  urban: `body:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:70;opacity:.06;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")}
nav{color:#fff;text-transform:uppercase}h1,h2,h3{text-transform:uppercase;letter-spacing:.01em}
.hero{min-height:100svh;display:flex;align-items:flex-end;position:relative;overflow:hidden;color:#fff;padding-bottom:90px}
.hero .bgi{position:absolute;inset:0;background-size:cover;background-position:center;filter:grayscale(.35) contrast(1.1)}
.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(to top,#0b0b0d 8%,rgba(11,11,13,.2) 60%)}
.hero .stripe{position:absolute;right:-10%;top:18%;width:60%;height:120px;background:var(--a);transform:rotate(-8deg);opacity:.85;mix-blend-mode:screen;z-index:1}
.hero .wrap{position:relative;z-index:2;width:100%}.hero h1{font-size:clamp(3.4rem,13vw,9.4rem);line-height:.98}
.hero h1 span{display:block;color:transparent;-webkit-text-stroke:2px var(--a)}.hero .tag{font-size:clamp(1rem,2.4vw,1.3rem);margin:18px 0 26px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.hero .meta{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:22px}
.btn{border-radius:6px;text-transform:uppercase;letter-spacing:.08em;font-size:.9rem}.btn:hover{box-shadow:0 0 30px var(--a)}
.eyebrow{color:var(--a)}.card{border-radius:10px}.card:hover{box-shadow:0 0 0 1px var(--a),0 20px 50px rgba(0,0,0,.5)}
.about .ph img{border-radius:10px;filter:contrast(1.05)}.offer{background:var(--alt)}
.about{grid-template-columns:1fr;gap:0}.about .ph{order:-1}.about .ph img{height:min(64vh,600px)}
.about>div.reveal:not(.ph){background:var(--card);padding:clamp(24px,4vw,44px);margin:-110px clamp(0px,4vw,60px) 0;position:relative;z-index:2;border-left:4px solid var(--a)}`,
};

function hero(st: StyleId, v: number, p: Omit<Place, 'photoRefs'>, c: Content, photos: string[], meta: string, btns: string): string {
  const img0 = photos[0] ?? '';
  const bg = img0 ? `style="background-image:url('${img0}')"` : `style="background:linear-gradient(135deg,${c.palette.dark},${c.palette.primary})"`;
  const name = esc(p.name);
  switch (st) {
    case 'luxe':
      return `<header class="hero"><div class="bgi" ${bg}></div><div class="in">${meta}<h1>${name}</h1><div class="line"></div><p class="tag">${esc(c.tagline)}</p>${btns}</div></header>`;
    case 'editorial':
      return `<header class="hero"><div>${meta}<h1>${name}</h1><p class="tag">${esc(c.tagline)}</p>${btns}</div>${img0 ? `<div class="ph"><img src="${img0}" alt="${name}"></div>` : ''}</header>`;
    case 'vibrant': {
      const bubs = [0, 1, 2].map(i => { const sz = 80 + ((v + i * 37) % 160); return `<i class="bub" style="width:${sz}px;height:${sz}px;left:${(v * 7 + i * 31) % 90}%;top:${(v * 3 + i * 23) % 80}%"></i>`; }).join('');
      return `<header class="hero">${bubs}<div class="wrap"><div>${meta}<h1>${name}</h1><p class="tag">${esc(c.tagline)}</p>${btns}</div>${img0 ? `<div class="ph"><img src="${img0}" alt="${name}"></div>` : ''}</div></header>`;
    }
    case 'minimal':
      return `<header class="hero"><div class="wrap"><h1>${name}</h1><div class="row"><p class="tag">${esc(c.tagline)}</p><div>${meta}${btns}</div></div>` +
        `${photos.length ? `<div class="strip">${[0, 1, 2].map(i => photos[(i + v) % photos.length]).map(ph => `<img src="${ph}" alt="${name}">`).join('')}</div>` : ''}</div></header>`;
    case 'urban': {
      const words = p.name.trim().split(/\s+/);
      const h = words.length > 1 ? `${esc(words.slice(0, -1).join(' '))}<span>${esc(words.at(-1))}</span>` : `${name}<span>${esc(c.offerTitle.split(' ').at(-1))}</span>`;
      return `<header class="hero"><div class="bgi" ${bg}></div><i class="stripe"></i><div class="wrap">${meta}<h1>${h}</h1><p class="tag">${esc(c.tagline)}</p>${btns}</div></header>`;
    }
  }
}

export function renderHtml(p: Omit<Place, 'photoRefs'>, c: Content, photos: string[], opts: RenderOpts = { demo: true }): string {
  const st = styleOf(c);
  const v = hash(p.name);
  const [fh, fb] = c.fonts;
  const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fh)}:wght@400;600;700&family=${encodeURIComponent(fb)}:wght@400;600;700&display=swap`;
  const tel = p.phone ? `tel:${p.phone.replace(/\s/g, '')}` : '';
  const wa = whatsapp(p.phone);
  const route = p.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&destination_place_id=${p.place_id}` : (p.mapsUrl ?? '#');
  const mapEmbed = `https://maps.google.com/maps?q=${encodeURIComponent(`${p.name}, ${p.address}`)}&z=16&output=embed`;
  const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const hasForm = !!(opts.formApi && opts.siteId);
  let k = 0;   // numéros des sections (style editorial)

  const meta = `<div class="meta">${p.hours.length ? '<span class="open" id="open"><i></i><span>Horaires</span></span>' : ''}` +
    `${p.rating ? `<span class="rating"><span class="s">${stars(p.rating)}</span> ${p.rating.toFixed(1).replace('.', ',')} · ${p.ratingsTotal ?? ''} avis</span>` : ''}</div>`;
  const btns = `<div class="btns">${tel ? `<a class="btn" href="${tel}">Appeler</a>` : ''}<a class="btn ghost" href="${hasForm ? '#form' : '#offer'}">${esc(hasForm ? formKind(c.kind).nav : c.offerTitle)}</a>` +
    `<a class="btn ghost" href="${esc(route)}" target="_blank" rel="noopener">Itinéraire</a></div>`;

  const tape = [...c.highlights, ...p.extras].slice(0, 6);
  const marquee = tape.length ? `<div class="marquee" aria-hidden="true"><div>${[...tape, ...tape, ...tape, ...tape].map(t => `<span>${esc(t)}</span><em>✦</em>`).join('')}</div></div>` : '';

  const asCards = st === 'vibrant' || st === 'urban';
  const gid = (i: number) => `g${i}`;
  const tabs = c.offer.length > 1 ? `<div class="tabs reveal" role="tablist"><button class="on" data-g="*">Tout</button>${c.offer.map((g, i) => `<button data-g="${gid(i)}">${esc(g.group)}</button>`).join('')}</div>` : '';
  const offer = tabs + (asCards
    ? `<div class="cards">${c.offer.flatMap((g, gi) => g.items.map(it => `<div class="card reveal" data-g="${gid(gi)}"><div class="g">${esc(g.group)}</div><h3>${esc(it.name)}</h3>${it.description ? `<p>${esc(it.description)}</p>` : ''}${it.price ? `<span class="pr">${esc(it.price)}</span>` : ''}</div>`)).join('')}</div>`
    : `<div class="menu">${c.offer.map((g, gi) => `<div class="reveal${gi % 2 ? ' d1' : ''}" data-g="${gid(gi)}"><h3>${esc(g.group)}</h3>${g.items.map(it =>
        `<div class="mi"><span class="n">${esc(it.name)}</span><span class="dots"></span>${it.price ? `<span class="pr">${esc(it.price)}</span>` : ''}</div>${it.description ? `<p>${esc(it.description)}</p>` : ''}`).join('')}</div>`).join('')}</div>`);

  const eb = (label: string) => `<div class="eyebrow"${st === 'editorial' ? ` data-n="${String(++k).padStart(2, '0')}"` : ''}>${esc(label)}</div>`;
  const aboutImg = photos[1] ?? photos[0];
  const gallery = photos.slice(st === 'minimal' ? 0 : 2);
  const reviews = p.reviews.filter(r => r.text).slice(0, 5);

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.name)} — ${esc(c.tagline)}</title>
<meta name="description" content="${esc(c.about[0] ?? c.tagline)}">
<meta name="theme-color" content="${c.palette.dark}">
<meta property="og:title" content="${esc(p.name)}"><meta property="og:description" content="${esc(c.tagline)}">${photos[0] ? `<meta property="og:image" content="${esc(photos[0])}">` : ''}
${opts.demo ? '<meta name="robots" content="noindex">' : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontsUrl}" rel="stylesheet">
<style>
:root{--p:${c.palette.primary};--a:${c.palette.accent};--d:${c.palette.dark};--l:${c.palette.light};--fh:'${fh}',serif;--fb:'${fb}',system-ui,sans-serif;${themeVars(st, c.palette)}}
${BASE_CSS}
${STYLE_CSS[st]}
</style></head>
<body class="st-${st}">
<div id="prog"></div>
<nav id="nav"><b>${esc(p.name)}</b><div class="links"><a href="#about">À propos</a><a href="#offer">${esc(c.offerTitle)}</a>${gallery.length ? '<a href="#gallery">Photos</a>' : ''}<a href="#contact">Accès</a>${hasForm ? `<a href="#form">${esc(formKind(c.kind).nav)}</a>` : ''}</div></nav>

${hero(st, v, p, c, photos, meta, btns)}
${marquee}

<section id="about"><div class="wrap about">
  <div class="reveal">${eb('Bienvenue')}<h2>${esc(c.about.length ? p.name : c.tagline)}</h2>${c.about.map(t => `<p>${esc(t)}</p>`).join('')}
  ${c.signature ? `<p class="sig">${esc(c.signature)}</p>` : ''}
  ${c.highlights.length ? `<div class="chips">${c.highlights.slice(0, 5).map(h => `<span>${esc(h)}</span>`).join('')}</div>` : ''}</div>
  ${aboutImg ? `<div class="ph reveal d1"><img src="${aboutImg}" alt="${esc(p.name)}" loading="lazy"></div>` : ''}
</div></section>

<section id="offer" class="offer"><div class="wrap">
  <div class="reveal">${eb(c.offerTitle)}<h2>${esc(c.offerTitle)}</h2>${c.offerIntro ? `<p style="color:var(--muted);margin:-10px 0 40px;max-width:60ch">${esc(c.offerIntro)}</p>` : ''}</div>
  ${offer}
</div></section>

${gallery.length ? `<section id="gallery"><div class="wrap"><div class="reveal">${eb('En images')}<h2>Photos</h2></div>
  <div class="gal reveal">${gallery.map(ph => `<img src="${ph}" alt="${esc(p.name)}" loading="lazy">`).join('')}</div></div></section><div id="lb"><img alt=""></div>` : ''}

${reviews.length ? `<section class="offer"><div class="wrap narrow reveal">${eb('Ils en parlent')}
  <div class="rv">${reviews.map((r, i) => `<blockquote class="${i ? '' : 'on'}"><span class="s">${stars(r.rating)}</span>« ${esc(r.text.length > 260 ? `${r.text.slice(0, 257)}…` : r.text)} »<cite>${esc(r.author)} · avis Google</cite></blockquote>`).join('')}</div>
  ${reviews.length > 1 ? `<div class="dots2">${reviews.map((_, i) => `<b class="${i ? '' : 'on'}"></b>`).join('')}</div>` : ''}</div></section>` : ''}

${hasForm ? formSection(c, opts.siteId!, opts.formApi!) : ''}

<section id="contact"><div class="wrap info">
  <div class="reveal">${eb('Horaires')}<h2>Quand venir</h2>
    <div class="hours">${p.hours.length ? p.hours.map(h => { const [d, ...rest] = h.split(':'); return `<div data-day="${esc((d ?? '').trim().toLowerCase())}"><span>${esc(d)}</span><span>${esc(rest.join(':').trim())}</span></div>`; }).join('') : '<p>Horaires sur demande</p>'}</div></div>
  <div class="contact reveal d1">${eb('Accès')}<h2>Nous trouver</h2>
    <p>📍 ${esc(p.address)}</p>${p.phone ? `<p>📞 <a href="${tel}">${esc(p.phone)}</a></p>` : ''}${wa ? `<p>💬 <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a></p>` : ''}
    <iframe class="map" src="${mapEmbed}" loading="lazy" title="Plan"></iframe></div>
</div></section>

<footer><b>${esc(p.name)}</b> · ${esc(p.address)}<br>
<a class="fik" href="https://fikconciergerie.com" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><path d="M9 8h6M9 12h4M9 8v8"/></svg>${opts.demo ? 'Démo signée' : 'Site signé'} FIK</a></footer>
${opts.demo ? '<div class="demo">Version de démonstration</div>' : ''}
<div class="bar">${tel ? `<a class="main" href="${tel}">📞 Appeler</a>` : ''}<a href="${esc(route)}" target="_blank" rel="noopener">📍 Itinéraire</a>${wa ? `<a href="${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : hasForm ? `<a href="#form">${esc(formKind(c.kind).nav)}</a>` : ''}</div>
<script>
(function(){
var days=${JSON.stringify(days)},now=new Date(),today=days[now.getDay()];
document.querySelectorAll('.hours [data-day]').forEach(function(e){if(e.dataset.day===today)e.classList.add('today')});
// Ouvert maintenant ? (« lundi: 09:00 – 12:00, 14:00 – 19:00 », « Ouvert 24h/24 », « Fermé »)
var o=document.getElementById('open');if(o){var row=document.querySelector('.hours [data-day="'+today+'"] span:last-child'),t=row?row.textContent:'',m=now.getHours()*60+now.getMinutes(),open=/24\\s*h/i.test(t),next='';
(t.match(/\\d{1,2}[:h]\\d{2}\\s*[–—-]\\s*\\d{1,2}[:h]\\d{2}/g)||[]).forEach(function(r){var x=r.match(/(\\d{1,2})[:h](\\d{2})\\s*[–—-]\\s*(\\d{1,2})[:h](\\d{2})/),a=+x[1]*60+ +x[2],b=+x[3]*60+ +x[4];if(b<=a)b+=1440;if(m>=a&&m<b)open=true;else if(!next&&m<a)next=x[1]+'h'+x[2]});
o.classList.toggle('on',open);o.lastChild.textContent=open?'Ouvert maintenant':(next?'Ouvre à '+next:'Fermé pour le moment')}
var nav=document.getElementById('nav'),pr=document.getElementById('prog'),bgi=document.querySelector('.hero .bgi'),calm=matchMedia('(prefers-reduced-motion: reduce)').matches;
addEventListener('scroll',function(){var h=document.documentElement;nav.classList.toggle('solid',scrollY>60);pr.style.width=(scrollY/(h.scrollHeight-innerHeight)*100)+'%';
if(bgi&&!calm&&scrollY<innerHeight*1.2)bgi.style.translate='0 '+(scrollY*.35)+'px'},{passive:true});
// Onglets de la carte : n'afficher qu'une catégorie
document.querySelectorAll('.tabs button').forEach(function(b){b.addEventListener('click',function(){var g=b.dataset.g;document.querySelectorAll('.tabs button').forEach(function(x){x.classList.toggle('on',x===b)});
document.querySelectorAll('#offer [data-g]').forEach(function(e){if(e.tagName!=='BUTTON')e.classList.toggle('off',g!=='*'&&e.dataset.g!==g)})})});
// Cartes qui s'inclinent sous la souris (ordinateur)
if(!calm&&matchMedia('(hover: hover)').matches)document.querySelectorAll('.card,.about .ph img').forEach(function(e){e.addEventListener('mousemove',function(ev){var r=e.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width-.5,y=(ev.clientY-r.top)/r.height-.5;
e.style.transform='perspective(800px) rotateY('+(x*7)+'deg) rotateX('+(-y*7)+'deg) translateY(-4px)'});e.addEventListener('mouseleave',function(){e.style.transform=''})});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}})},{threshold:.1});
document.querySelectorAll('.reveal').forEach(function(e){io.observe(e)});
var lb=document.getElementById('lb');if(lb){document.querySelectorAll('.gal img').forEach(function(i){i.addEventListener('click',function(){lb.firstChild.src=i.src;lb.classList.add('on')})});lb.addEventListener('click',function(){lb.classList.remove('on')})}
var q=document.querySelectorAll('.rv blockquote'),d=document.querySelectorAll('.dots2 b'),cur=0;function show(i){q[cur].classList.remove('on');d[cur]&&d[cur].classList.remove('on');cur=i;q[cur].classList.add('on');d[cur]&&d[cur].classList.add('on')}
if(q.length>1){d.forEach(function(b,i){b.addEventListener('click',function(){show(i)})});setInterval(function(){show((cur+1)%q.length)},6500)}
})();
</script>${!opts.demo && opts.siteId && opts.formApi ? statsBeacon(opts.formApi, opts.siteId) : ''}
</body></html>`;
}
