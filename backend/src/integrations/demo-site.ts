import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { askJson } from './pro-doc.js';
import { kvGet, kvSet } from './app-store.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';

// SITE DE DÉMO en 1 à 2 minutes pour un commerce (create_demo_site) : Kouider envoie le lien Google Maps du
// commerce → infos Google (nom, adresse, téléphone, horaires, photos, avis, note) → Claude écrit les textes et
// INVENTE seulement ce qui manque (menu, prestations, véhicules…), en le notant → site en ligne sur Netlify.
// Chaque démo est gardée (app_kv demo:site:<slug>) avec la liste de ce qui a été inventé, pour faire le vrai site.

const mapsKey = () => process.env['GOOGLE_PLACES_API_KEY'] ?? process.env['GOOGLE_MAPS_API_KEY'];
const DEMO_INDEX = 'demo:sites';

export interface Place {
  place_id: string; name: string; address: string; phone?: string; website?: string; mapsUrl?: string;
  rating?: number; ratingsTotal?: number; priceLevel?: number; types: string[]; hours: string[];
  summary?: string; reviews: Array<{ author: string; rating: number; text: string }>;
  photoRefs: string[]; lat?: number; lng?: number; extras: string[];
}

export interface OfferItem { name: string; description?: string; price?: string }
export interface Content {
  kind: string; tagline: string; about: string[]; offerTitle: string; offerIntro: string;
  offer: Array<{ group: string; items: OfferItem[] }>; highlights: string[];
  palette: { primary: string; accent: string; dark: string; light: string }; fonts: [string, string];
  invented: string[]; currency: string;
}

export interface DemoRecord {
  slug: string; url: string; createdAt: string; place: Omit<Place, 'photoRefs'>; content: Content; notes?: string;
}

// ── 1. Lien Google → fiche Google ────────────────────────────────────────────
async function resolveLink(raw: string): Promise<{ query: string; lat?: number; lng?: number }> {
  let url = raw.trim();
  const m = url.match(/https?:\/\/\S+/);
  if (!m) return { query: url };
  url = m[0];
  // Liens courts de partage (maps.app.goo.gl, goo.gl, g.co/kgs) → on suit les redirections
  for (let i = 0; i < 6; i++) {
    try {
      const r = await axios.get(url, { maxRedirects: 0, validateStatus: s => s < 400, timeout: 10_000,
        headers: { 'User-Agent': 'Mozilla/5.0' } });
      const loc = r.headers['location'] as string | undefined;
      if (!loc || r.status < 300) break;
      url = new URL(loc, url).toString();
    } catch { break; }
  }
  const u = new URL(url);
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const coords = at ? { lat: Number(at[1]), lng: Number(at[2]) } : {};
  const placeSeg = u.pathname.match(/\/maps\/place\/([^/]+)/);
  if (placeSeg) return { query: decodeURIComponent(placeSeg[1]!.replace(/\+/g, ' ')), ...coords };
  const q = u.searchParams.get('q') ?? u.searchParams.get('query');
  if (q) return { query: q, ...coords };
  return { query: raw, ...coords };
}

async function findPlace(query: string, lat?: number, lng?: number): Promise<string | null> {
  const key = mapsKey();
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/findplacefromtext/json', { timeout: 15_000,
    params: { input: query, inputtype: 'textquery', fields: 'place_id', language: 'fr', key,
      ...(lat != null && lng != null ? { locationbias: `circle:300@${lat},${lng}` } : {}) } });
  const d = data as { status: string; candidates?: Array<{ place_id: string }>; error_message?: string };
  if (d.status !== 'OK' && d.status !== 'ZERO_RESULTS') throw new Error(`Google Places : ${d.status} ${d.error_message ?? ''}`);
  return d.candidates?.[0]?.place_id ?? null;
}

const EXTRA_FLAGS: Record<string, string> = {
  delivery: 'livraison', dine_in: 'sur place', takeout: 'à emporter', reservable: 'réservation possible',
  serves_breakfast: 'petit-déjeuner', serves_lunch: 'déjeuner', serves_dinner: 'dîner',
  serves_vegetarian_food: 'plats végétariens', wheelchair_accessible_entrance: 'accès fauteuil roulant',
};

async function placeDetails(placeId: string): Promise<Place> {
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', { timeout: 15_000,
    params: { place_id: placeId, language: 'fr', reviews_sort: 'most_relevant', key: mapsKey(),
      fields: ['name', 'formatted_address', 'international_phone_number', 'website', 'url', 'rating', 'user_ratings_total',
        'price_level', 'types', 'opening_hours', 'editorial_summary', 'reviews', 'photos', 'geometry', ...Object.keys(EXTRA_FLAGS)].join(',') } });
  const d = data as { status: string; result?: Record<string, any>; error_message?: string };
  if (d.status !== 'OK' || !d.result) throw new Error(`Google Places : ${d.status} ${d.error_message ?? ''}`);
  const r = d.result;
  return {
    place_id: placeId, name: r.name, address: r.formatted_address ?? '', phone: r.international_phone_number,
    website: r.website, mapsUrl: r.url, rating: r.rating, ratingsTotal: r.user_ratings_total, priceLevel: r.price_level,
    types: r.types ?? [], hours: (r.opening_hours?.weekday_text ?? []).map((h: string) => h.replace(/ /g, ' ')),
    summary: r.editorial_summary?.overview,
    reviews: (r.reviews ?? []).filter((v: any) => v.rating >= 4 && v.text?.length > 40).slice(0, 4)
      .map((v: any) => ({ author: shortName(v.author_name ?? ''), rating: v.rating, text: String(v.text).slice(0, 420) })),
    photoRefs: (r.photos ?? []).map((p: any) => p.photo_reference).slice(0, 8),
    lat: r.geometry?.location?.lat, lng: r.geometry?.location?.lng,
    extras: Object.entries(EXTRA_FLAGS).filter(([k]) => r[k] === true).map(([, v]) => v),
  };
}

const shortName = (n: string) => { const [a, b] = n.trim().split(/\s+/); return b ? `${a} ${b[0]}.` : (a ?? 'Client'); };

async function downloadPhotos(refs: string[]): Promise<Buffer[]> {
  const out = await Promise.all(refs.map((ref): Promise<Buffer | null> => axios.get('https://maps.googleapis.com/maps/api/place/photo',
    { params: { maxwidth: 1600, photo_reference: ref, key: mapsKey() }, responseType: 'arraybuffer', timeout: 30_000 })
    .then(r => Buffer.from(r.data as ArrayBuffer)).catch(() => null)));
  return out.filter((b): b is Buffer => !!b && b.length > 5000);
}

// ── 2. Textes (Claude) ───────────────────────────────────────────────────────
export const FONT_PAIRS: Array<[string, string]> = [
  ['Playfair Display', 'Lato'], ['Montserrat', 'Open Sans'], ['Oswald', 'Roboto'], ['Poppins', 'Inter'],
  ['Cormorant Garamond', 'Nunito'], ['Bebas Neue', 'Source Sans 3'], ['DM Serif Display', 'DM Sans'],
];

const WRITER = `Tu crées le contenu d'un SITE DE DÉMONSTRATION pour un commerce, à montrer au patron pour lui vendre un vrai site.
Tu reçois sa fiche Google. Écris dans la langue du pays (français par défaut), ton chaleureux et vendeur, phrases naturelles.
RÈGLE CLÉ : utilise d'abord les VRAIES infos de la fiche. Ce qui manque (carte/menu, prestations, prix, véhicules à vendre, produits…), tu l'INVENTES de façon crédible pour ce type de commerce et ce pays, et tu le notes précisément dans "invented" (ex. « Menu : 14 plats et leurs prix inventés — aucun menu sur Google »). Ne jamais inventer : nom, adresse, téléphone, horaires, note, avis.
Prix dans la monnaie du pays de l'adresse (Algérie → DA, zone euro → €).
Réponds UNIQUEMENT en JSON :
{"kind": "restaurant|cafe|bar|coiffure|beaute|garage|vente_auto|boutique|librairie|tabac|hotel|sante|autre",
 "tagline": "accroche courte (8 mots max)",
 "about": ["2 paragraphes de présentation"],
 "offerTitle": "Notre carte | Nos prestations | Véhicules à vendre | Nos produits…",
 "offerIntro": "1 phrase",
 "offer": [{"group": "Entrées / Coupes / Entretien…", "items": [{"name": "...", "description": "courte", "price": "1 200 DA"}]}],
 "highlights": ["3 ou 4 points forts courts, tirés des avis et de la fiche"],
 "palette": {"primary": "#hex", "accent": "#hex", "dark": "#hex", "light": "#hex"},
 "fontPair": 0,
 "currency": "DA",
 "invented": ["..."]}
offer : 3 ou 4 groupes de 3 à 5 éléments. palette adaptée au métier (dark = fond sombre lisible avec texte blanc, light = fond clair). fontPair = indice parmi : ${FONT_PAIRS.map((p, i) => `${i}=${p[0]}/${p[1]}`).join(', ')}.`;

export const HEX = /^#[0-9a-f]{6}$/i;

async function writeContent(p: Place, notes: string): Promise<Content> {
  const fiche = {
    nom: p.name, adresse: p.address, telephone: p.phone, site_actuel: p.website, types_google: p.types,
    note: p.rating, nombre_avis: p.ratingsTotal, niveau_prix: p.priceLevel, horaires: p.hours, resume_google: p.summary,
    services: p.extras, avis: p.reviews.map(r => r.text), photos: p.photoRefs.length,
  };
  const r = await askJson<any>(WRITER, `FICHE GOOGLE :\n${JSON.stringify(fiche, null, 1)}${notes ? `\n\nPRÉCISIONS DE KOUIDER : ${notes}` : ''}`, 6000);
  const pal = r.palette ?? {};
  const fp = FONT_PAIRS[Number(r.fontPair)] ?? FONT_PAIRS[0]!;
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    kind: s(r.kind) || 'autre', tagline: s(r.tagline) || p.name,
    about: (Array.isArray(r.about) ? r.about : []).map(s).filter(Boolean).slice(0, 3),
    offerTitle: s(r.offerTitle) || 'Nos services', offerIntro: s(r.offerIntro),
    offer: (Array.isArray(r.offer) ? r.offer : []).map((g: any) => ({ group: s(g?.group),
      items: (Array.isArray(g?.items) ? g.items : []).map((it: any) => ({ name: s(it?.name), description: s(it?.description), price: s(it?.price) }))
        .filter((it: OfferItem) => it.name) })).filter((g: { items: OfferItem[] }) => g.items.length).slice(0, 5),
    highlights: (Array.isArray(r.highlights) ? r.highlights : []).map(s).filter(Boolean).slice(0, 4),
    palette: {
      primary: HEX.test(pal.primary) ? pal.primary : '#b8860b', accent: HEX.test(pal.accent) ? pal.accent : '#e0b84f',
      dark: HEX.test(pal.dark) ? pal.dark : '#1d1b18', light: HEX.test(pal.light) ? pal.light : '#faf7f2',
    },
    fonts: fp, invented: (Array.isArray(r.invented) ? r.invented : []).map(s).filter(Boolean), currency: s(r.currency),
  };
}

// ── 3. Page HTML (un seul fichier + photos) ──────────────────────────────────
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

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
  return `<section id="form" class="formsec"><div class="wrap reveal"><div class="eyebrow">${esc(f.nav)}</div><h2>${esc(f.title)}</h2>
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

export function renderHtml(p: Omit<Place, 'photoRefs'>, c: Content, photos: string[], opts: RenderOpts = { demo: true }): string {
  const [fh, fb] = c.fonts;
  const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fh)}:wght@400;600;700&family=${encodeURIComponent(fb)}:wght@400;600&display=swap`;
  const tel = p.phone ? `tel:${p.phone.replace(/\s/g, '')}` : '';
  const route = p.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&destination_place_id=${p.place_id}` : (p.mapsUrl ?? '#');
  const mapEmbed = `https://maps.google.com/maps?q=${encodeURIComponent(`${p.name}, ${p.address}`)}&z=16&output=embed`;
  const hero = photos[0] ? `url('${photos[0]}')` : `linear-gradient(135deg, ${c.palette.dark}, ${c.palette.primary})`;
  const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  const offer = c.offer.map(g => `
      <div class="group"><h3>${esc(g.group)}</h3>${g.items.map(it => `
        <div class="item"><div><strong>${esc(it.name)}</strong>${it.description ? `<p>${esc(it.description)}</p>` : ''}</div>${it.price ? `<span class="price">${esc(it.price)}</span>` : ''}</div>`).join('')}
      </div>`).join('');

  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.name)} — ${esc(c.tagline)}</title>
<meta name="description" content="${esc(c.about[0] ?? c.tagline)}">
${opts.demo ? '<meta name="robots" content="noindex">' : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontsUrl}" rel="stylesheet">
<style>
:root{--p:${c.palette.primary};--a:${c.palette.accent};--d:${c.palette.dark};--l:${c.palette.light};--fh:'${fh}',serif;--fb:'${fb}',system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{font-family:var(--fb);color:#2a2a2a;background:var(--l);line-height:1.65}
h1,h2,h3{font-family:var(--fh);line-height:1.15}
a{color:inherit}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}
nav{position:fixed;inset:0 0 auto 0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:14px 22px;background:rgba(0,0,0,.35);backdrop-filter:blur(8px);color:#fff}
nav b{font-family:var(--fh);font-size:1.15rem;letter-spacing:.5px}
nav .links a{margin-left:18px;text-decoration:none;font-size:.92rem;opacity:.9}
@media(max-width:700px){nav .links{display:none}}
.hero{min-height:min(92vh,820px);display:flex;align-items:flex-end;color:#fff;background:linear-gradient(to top,rgba(0,0,0,.78),rgba(0,0,0,.15) 60%),${hero} center/cover}
.hero .wrap{padding-bottom:70px;width:100%}
.hero h1{font-size:clamp(2.4rem,7vw,4.6rem);margin-bottom:10px}
.hero p.tag{font-size:clamp(1.05rem,2.6vw,1.4rem);opacity:.92;margin-bottom:22px}
.rating{display:inline-flex;gap:8px;align-items:center;background:rgba(255,255,255,.14);padding:6px 14px;border-radius:30px;margin-bottom:22px;font-size:.95rem}
.rating .s{color:var(--a);letter-spacing:2px}
.btns{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-block;padding:13px 26px;border-radius:40px;text-decoration:none;font-weight:600;background:var(--p);color:#fff;border:2px solid var(--p)}
.btn.ghost{background:transparent;border-color:#fff}
section{padding:80px 0}
.eyebrow{text-transform:uppercase;letter-spacing:3px;font-size:.78rem;color:var(--p);font-weight:600;margin-bottom:10px}
h2{font-size:clamp(1.9rem,4.5vw,2.8rem);margin-bottom:22px;color:var(--d)}
.about{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center}
.about p{margin-bottom:14px;font-size:1.05rem}
.about img{width:100%;height:430px;object-fit:cover;border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,.18)}
@media(max-width:820px){.about{grid-template-columns:1fr}.about img{height:280px}}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.chips span{background:#fff;border:1px solid rgba(0,0,0,.08);padding:7px 14px;border-radius:30px;font-size:.88rem}
.offer{background:var(--d);color:#f3f3f3}
.offer h2{color:#fff}.offer .intro{opacity:.8;margin:-8px 0 34px}
.groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:34px}
.group h3{color:var(--a);font-size:1.45rem;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.15)}
.item{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px dashed rgba(255,255,255,.12)}
.item p{font-size:.9rem;opacity:.72}.price{color:var(--a);font-weight:600;white-space:nowrap}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.gallery img{width:100%;height:240px;object-fit:cover;border-radius:12px;transition:transform .3s}
.gallery img:hover{transform:scale(1.03)}
.reviews{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.review{background:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.06)}
.review .s{color:var(--p);letter-spacing:2px;margin-bottom:8px}.review p{font-style:italic;font-size:.96rem;margin-bottom:12px}
.review b{font-size:.88rem;color:#666}
.info{display:grid;grid-template-columns:1fr 1fr;gap:40px}
@media(max-width:820px){.info{grid-template-columns:1fr}}
.hours div{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(0,0,0,.07);text-transform:capitalize}
.hours .today{color:var(--p);font-weight:700}
.contact p{margin-bottom:10px}.map{width:100%;height:320px;border:0;border-radius:16px;margin-top:14px}
footer{background:var(--d);color:#bbb;text-align:center;padding:34px 20px;font-size:.88rem}
footer b{color:#fff}
.demo{position:fixed;left:50%;transform:translateX(-50%);top:62px;z-index:30;background:rgba(0,0,0,.72);color:#fff;font-size:.72rem;padding:6px 12px;border-radius:20px}
.callfab{position:fixed;right:16px;bottom:78px;z-index:30;background:var(--p);color:#fff;width:58px;height:58px;border-radius:50%;display:none;align-items:center;justify-content:center;font-size:1.5rem;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.3)}
@media(max-width:700px){.callfab{display:flex}}
.formsec{background:#fff}.formsec form{max-width:640px}.formsec label{display:block;font-size:.85rem;font-weight:600;margin:12px 0 4px;color:#555}
.formsec input,.formsec textarea{width:100%;font:inherit;padding:11px 13px;border:1px solid rgba(0,0,0,.15);border-radius:10px;margin-top:4px;background:#fff}
.formsec .f2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.formsec .f3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
@media(max-width:600px){.formsec .f2,.formsec .f3{grid-template-columns:1fr}}
.formsec .btn{margin-top:18px;cursor:pointer;font:inherit;font-weight:600}.formsec .btn:disabled{opacity:.6}.fmsg{margin-top:12px;font-weight:600;color:var(--p)}.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.reveal{opacity:0;transform:translateY(24px);transition:all .7s ease}.reveal.on{opacity:1;transform:none}
</style></head>
<body>
<nav><b>${esc(p.name)}</b><div class="links"><a href="#about">À propos</a><a href="#offer">${esc(c.offerTitle)}</a>${photos.length > 1 ? '<a href="#gallery">Photos</a>' : ''}<a href="#contact">Horaires & accès</a>${opts.formApi && opts.siteId ? `<a href="#form">${esc(formKind(c.kind).nav)}</a>` : ''}</div></nav>

<header class="hero"><div class="wrap">
  ${p.rating ? `<div class="rating"><span class="s">${stars(p.rating)}</span> ${p.rating.toFixed(1).replace('.', ',')} · ${p.ratingsTotal ?? ''} avis Google</div>` : ''}
  <h1>${esc(p.name)}</h1>
  <p class="tag">${esc(c.tagline)}</p>
  <div class="btns">${tel ? `<a class="btn" href="${tel}">Appeler</a>` : ''}<a class="btn ghost" href="#offer">${esc(c.offerTitle)}</a><a class="btn ghost" href="${esc(route)}" target="_blank" rel="noopener">Itinéraire</a></div>
</div></header>

<section id="about"><div class="wrap about reveal">
  <div><div class="eyebrow">Bienvenue</div><h2>${esc(p.name)}</h2>${c.about.map(t => `<p>${esc(t)}</p>`).join('')}
  ${c.highlights.length || p.extras.length ? `<div class="chips">${[...c.highlights, ...p.extras].slice(0, 7).map(h => `<span>${esc(h)}</span>`).join('')}</div>` : ''}</div>
  ${photos[1] ? `<img src="${photos[1]}" alt="${esc(p.name)}" loading="lazy">` : ''}
</div></section>

<section id="offer" class="offer"><div class="wrap reveal">
  <div class="eyebrow">${esc(c.offerTitle)}</div><h2>${esc(c.offerTitle)}</h2>${c.offerIntro ? `<p class="intro">${esc(c.offerIntro)}</p>` : ''}
  <div class="groups">${offer}</div>
</div></section>

${photos.length > 2 ? `<section id="gallery"><div class="wrap reveal"><div class="eyebrow">En images</div><h2>Photos</h2>
  <div class="gallery">${photos.slice(2).map(ph => `<img src="${ph}" alt="${esc(p.name)}" loading="lazy">`).join('')}</div></div></section>` : ''}

${p.reviews.length ? `<section style="background:#fff3"><div class="wrap reveal"><div class="eyebrow">Ils en parlent</div><h2>Avis de nos clients</h2>
  <div class="reviews">${p.reviews.slice(0, 3).map(r => `<div class="review"><div class="s">${stars(r.rating)}</div><p>« ${esc(r.text)} »</p><b>${esc(r.author)} · avis Google</b></div>`).join('')}</div></div></section>` : ''}

${opts.formApi && opts.siteId ? formSection(c, opts.siteId, opts.formApi) : ''}

<section id="contact"><div class="wrap info reveal">
  <div><div class="eyebrow">Horaires</div><h2>Quand nous trouver</h2>
    <div class="hours">${p.hours.length ? p.hours.map(h => { const [d, ...rest] = h.split(':'); return `<div data-day="${esc((d ?? '').trim().toLowerCase())}"><span>${esc(d)}</span><span>${esc(rest.join(':').trim())}</span></div>`; }).join('') : '<p>Horaires sur demande</p>'}</div></div>
  <div class="contact"><div class="eyebrow">Accès</div><h2>Nous contacter</h2>
    <p>📍 ${esc(p.address)}</p>${p.phone ? `<p>📞 <a href="${tel}">${esc(p.phone)}</a></p>` : ''}
    <iframe class="map" src="${mapEmbed}" loading="lazy" title="Plan"></iframe></div>
</div></section>

<footer><b>${esc(p.name)}</b> · ${esc(p.address)}<br><br>${opts.demo ? 'Site de démonstration réalisé' : 'Site réalisé'} par <b>FIK Conciergerie</b></footer>
${opts.demo ? '<div class="demo">Version de démonstration</div>' : ''}
${tel ? `<a class="callfab" href="${tel}" aria-label="Appeler">📞</a>` : ''}
<script>
const today=${JSON.stringify(days)}[new Date().getDay()];
document.querySelectorAll('.hours [data-day]').forEach(e=>{if(e.dataset.day===today)e.classList.add('today')});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(e=>io.observe(e));
</script>
</body></html>`;
}

// ── 4. Mise en ligne Netlify (déploiement par empreintes, sans zip) ──────────
// siteId absent → crée le site Netlify (nom pris → suffixe) ; présent → nouveau déploiement du même site.
export async function deployNetlify(slug: string, files: Record<string, Buffer>, siteId?: string): Promise<{ url: string; siteId: string }> {
  const token = process.env['NETLIFY_TOKEN'];
  if (!token) throw new Error('NETLIFY_TOKEN manquant sur le serveur');
  const h = { Authorization: `Bearer ${token}` };
  if (!siteId) {
    for (const name of [slug, `${slug}-${randomBytes(2).toString('hex')}`]) {
      try {
        const { data: site } = await axios.post('https://api.netlify.com/api/v1/sites', { name }, { headers: h, timeout: 20_000 });
        siteId = (site as { id: string }).id; slug = name; break;
      } catch (err) {
        if (!(axios.isAxiosError(err) && err.response?.status === 422)) throw err;
      }
    }
    if (!siteId) throw new Error(`Netlify : nom « ${slug} » déjà pris`);
  }
  const sha = (b: Buffer) => createHash('sha1').update(b).digest('hex');
  const digest = Object.fromEntries(Object.entries(files).map(([path, b]) => [`/${path}`, sha(b)]));
  const { data: dep } = await axios.post(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, { files: digest }, { headers: h, timeout: 20_000 });
  const d = dep as { id: string; required?: string[] };
  const bySha = new Map(Object.entries(files).map(([path, b]) => [sha(b), path]));
  for (const need of d.required ?? []) {
    const path = bySha.get(need);
    if (!path) continue;
    await axios.put(`https://api.netlify.com/api/v1/deploys/${d.id}/files/${path}`, files[path],
      { headers: { ...h, 'Content-Type': 'application/octet-stream' }, timeout: 60_000, maxBodyLength: Infinity });
  }
  for (let i = 0; i < 30; i++) {
    const { data: st } = await axios.get(`https://api.netlify.com/api/v1/deploys/${d.id}`, { headers: h, timeout: 15_000 });
    const s = st as { state: string; ssl_url?: string; error_message?: string };
    if (s.state === 'ready') return { url: s.ssl_url ?? `https://${slug}.netlify.app`, siteId };
    if (s.state === 'error') throw new Error(`Netlify : ${s.error_message ?? 'erreur de déploiement'}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  return { url: `https://${slug}.netlify.app`, siteId };
}

// ── 5. Outil ─────────────────────────────────────────────────────────────────
export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
const running = new Set<string>();

export async function buildDemo(link: string, notes: string): Promise<DemoRecord> {
  if (!mapsKey()) throw new Error('clé Google Maps absente du serveur (GOOGLE_MAPS_API_KEY)');
  const { query, lat, lng } = await resolveLink(link);
  const placeId = await findPlace(query, lat, lng);
  if (!placeId) throw new Error(`commerce introuvable sur Google pour « ${query} »`);
  const place = await placeDetails(placeId);
  const [content, photoBufs] = await Promise.all([writeContent(place, notes), downloadPhotos(place.photoRefs)]);
  const photoNames = photoBufs.map((_, i) => `img/photo-${i + 1}.jpg`);
  const files: Record<string, Buffer> = { 'index.html': Buffer.from(renderHtml(place, content, photoNames)) };
  photoBufs.forEach((b, i) => { files[photoNames[i]!] = b; });
  const slug = `demo-${slugify(place.name) || 'commerce'}-${randomBytes(2).toString('hex')}`;
  const { url } = await deployNetlify(slug, files);
  const { photoRefs: _drop, ...placeData } = place;
  const rec: DemoRecord = { slug, url, createdAt: new Date().toISOString(), place: placeData, content, ...(notes ? { notes } : {}) };
  await kvSet(`demo:site:${slug}`, JSON.stringify(rec));
  const index = JSON.parse((await kvGet(DEMO_INDEX)) ?? '[]') as Array<{ slug: string; name: string; url: string; createdAt: string }>;
  index.unshift({ slug, name: place.name, url, createdAt: rec.createdAt });
  await kvSet(DEMO_INDEX, JSON.stringify(index.slice(0, 100)));
  return rec;
}

export function createDemoSite(input: Record<string, unknown>): string {
  const link = String(input['link'] ?? '').trim();
  const notes = String(input['notes'] ?? '').trim();
  if (!link) return '❌ Il me faut le lien Google Maps du commerce (bouton « Partager » dans Google Maps), ou son nom + sa ville.';
  const key = link.toLowerCase();
  if (running.has(key)) return '⏳ Cette démo est déjà en préparation : le lien arrive sur Telegram et dans l\'app.';
  running.add(key);
  void (async () => {
    let msg: string;
    try {
      const rec = await buildDemo(link, notes);
      const inv = rec.content.invented.length ? `\n\n✏️ Inventé pour la démo (à remplacer par les vraies infos) :\n- ${rec.content.invented.join('\n- ')}` : '\n\n✅ Rien d\'inventé : tout vient de Google.';
      msg = `🌐 Démo du site « ${rec.place.name} » en ligne :\n${rec.url}${inv}`;
    } catch (err) {
      const e = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message).slice(0, 300) : (err instanceof Error ? err.message : String(err));
      msg = `❌ La démo du site n'a pas pu être faite : ${e}`;
    } finally {
      running.delete(key);
    }
    console.log('[demo-site]', msg.replace(/\n/g, ' '));
    await queueTelegramMessage(msg).catch(() => {});
    emitProactive(msg.split('\n')[0]!.slice(0, 100), 'info', msg);
  })();
  return '⏳ Démo du site en préparation (1 à 2 minutes) : infos et photos Google, textes, mise en ligne. Le lien sera envoyé sur Telegram et dans l\'app, avec la liste de ce qui a été inventé.';
}

export async function loadDemo(name: string): Promise<DemoRecord | null> {
  const index = JSON.parse((await kvGet(DEMO_INDEX)) ?? '[]') as Array<{ slug: string; name: string }>;
  const q = name.trim().toLowerCase();
  const hit = index.find(d => d.name.toLowerCase().includes(q) || d.slug.includes(slugify(q)));
  return hit ? JSON.parse((await kvGet(`demo:site:${hit.slug}`)) ?? 'null') as DemoRecord | null : null;
}

export async function getDemoSite(input: Record<string, unknown>): Promise<string> {
  const name = String(input['name'] ?? '').trim().toLowerCase();
  const index = JSON.parse((await kvGet(DEMO_INDEX)) ?? '[]') as Array<{ slug: string; name: string; url: string; createdAt: string }>;
  if (!index.length) return 'Aucune démo de site pour le moment.';
  if (!name) return `Démos de sites (${index.length}) :\n${index.slice(0, 20).map(d => `- ${d.name} — ${d.url} (${d.createdAt.slice(0, 10)})`).join('\n')}`;
  const hit = index.find(d => d.name.toLowerCase().includes(name) || d.slug.includes(slugify(name)));
  if (!hit) return `Aucune démo trouvée pour « ${name} ». Démos : ${index.slice(0, 10).map(d => d.name).join(', ')}`;
  const rec = JSON.parse((await kvGet(`demo:site:${hit.slug}`)) ?? 'null') as DemoRecord | null;
  if (!rec) return `Démo ${hit.name} : ${hit.url} (détails introuvables)`;
  return [
    `Démo « ${rec.place.name} » — ${rec.url} (créée le ${rec.createdAt.slice(0, 10)})`,
    `VRAIES infos (Google) : adresse ${rec.place.address} ; tél. ${rec.place.phone ?? '—'} ; note ${rec.place.rating ?? '—'} (${rec.place.ratingsTotal ?? 0} avis) ; horaires : ${rec.place.hours.join(' | ') || '—'}`,
    `INVENTÉ pour la démo : ${rec.content.invented.length ? rec.content.invented.join(' ; ') : 'rien'}`,
    `Contenu : ${rec.content.offerTitle} → ${rec.content.offer.map(g => `${g.group} (${g.items.map(i => `${i.name}${i.price ? ` ${i.price}` : ''}`).join(', ')})`).join(' ; ')}`,
  ].join('\n');
}
