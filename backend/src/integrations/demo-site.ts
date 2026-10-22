import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { askJson } from './pro-doc.js';
import { kvGet, kvSet } from './app-store.js';
import { supabase } from './supabase.js';
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
  style?: string;       // univers graphique (site-design.ts STYLES)
  signature?: string;   // phrase signature du commerce, mise en avant
}

export interface DemoRecord {
  slug: string; url: string; createdAt: string; place: Omit<Place, 'photoRefs'>; content: Content; notes?: string;
  hostedHere?: true;   // Netlify indisponible → servie gratuitement par notre serveur
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
  ['Fraunces', 'Inter'], ['Syne', 'Manrope'], ['Unbounded', 'Work Sans'], ['Italiana', 'Jost'], ['Archivo Black', 'Archivo'],
  ['Anton', 'Barlow'], ['Marcellus', 'Karla'], ['Instrument Serif', 'Outfit'], ['Space Grotesk', 'Space Grotesk'], ['Libre Caslon Display', 'Manrope'],
];

const WRITER = `Tu crées le contenu d'un SITE DE DÉMONSTRATION pour un commerce, à montrer au patron pour lui vendre un vrai site.
C'est la signature FIK : le patron doit avoir un coup de cœur en l'ouvrant. Le site doit être UNIQUE, à l'image de CE commerce (son quartier, ses avis, ce qui le rend différent), jamais un texte passe-partout.
Tu reçois sa fiche Google. Écris dans la langue du pays (français par défaut), ton chaleureux, précis et vendeur, phrases naturelles et concrètes (des détails sensoriels, des mots des avis), aucun cliché (« bienvenue dans notre établissement », « qualité et savoir-faire »).
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
 "style": "luxe|editorial|vibrant|minimal|urban",
 "signature": "une phrase signature forte et personnelle, propre à ce commerce (10-16 mots)",
 "currency": "DA",
 "invented": ["..."]}
offer : 3 ou 4 groupes de 3 à 5 éléments. palette propre à ce commerce, jamais générique (dark = fond sombre lisible avec texte blanc, light = fond clair, accent = couleur qui claque). fontPair = indice parmi : ${FONT_PAIRS.map((p, i) => `${i}=${p[0]}/${p[1]}`).join(', ')}.
style = l'univers graphique qui colle le mieux à CE commerce : ${STYLES.map(x => STYLE_HINT[x]).join(' ; ')}.${'${RECENT}'}`;

export const HEX = /^#[0-9a-f]{6}$/i;

async function writeContent(p: Place, notes: string): Promise<Content> {
  const fiche = {
    nom: p.name, adresse: p.address, telephone: p.phone, site_actuel: p.website, types_google: p.types,
    note: p.rating, nombre_avis: p.ratingsTotal, niveau_prix: p.priceLevel, horaires: p.hours, resume_google: p.summary,
    services: p.extras, avis: p.reviews.map(r => r.text), photos: p.photoRefs.length,
  };
  const recent = (JSON.parse((await kvGet(DEMO_INDEX)) ?? '[]') as Array<{ style?: string; fonts?: string }>).slice(0, 6);
  const avoid = recent.map(d => [d.style, d.fonts].filter(Boolean).join(' + ')).filter(Boolean);
  const writer = WRITER.replace('${RECENT}', avoid.length ? `\nPour que nos sites ne se ressemblent pas, évite si possible ces combinaisons style + polices déjà utilisées récemment : ${avoid.join(' ; ')}.` : '');
  const r = await askJson<any>(writer, `FICHE GOOGLE :\n${JSON.stringify(fiche, null, 1)}${notes ? `\n\nPRÉCISIONS DE KOUIDER : ${notes}` : ''}`, 6000);
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
    ...((STYLES as readonly string[]).includes(s(r.style)) ? { style: s(r.style) } : {}), ...(s(r.signature) ? { signature: s(r.signature) } : {}),
  };
}

// ── 3. Page HTML : site-design.ts (styles, touche FIK) ──────────────────────
export { esc, formKind, renderHtml, type RenderOpts } from './site-design.js';
import { renderHtml, STYLES, STYLE_HINT } from './site-design.js';

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

// ── 4b. Secours gratuit : plus de crédit Netlify (ou Netlify en panne) → la démo est servie par notre serveur ──
// Fichiers dans le stockage Supabase (bucket privé fik-demos), servis par la route /demo/<slug>/ du backend.
// L'adresse reste valable pour toujours : on ne la déplace pas sur Netlify quand le crédit revient (le prospect l'a déjà).
const DEMO_BUCKET = 'fik-demos';
let demoBucketReady = false;
const DEMO_BASE = () => process.env['PUBLIC_API_URL'] ?? 'https://ibrahim-backend-production.up.railway.app';
const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', css: 'text/css', js: 'text/javascript' };
const typeOf = (path: string) => TYPES[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';

async function hostDemoHere(slug: string, files: Record<string, Buffer>): Promise<string> {
  if (!demoBucketReady) {
    await supabase.storage.createBucket(DEMO_BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024 }).catch(() => {});
    demoBucketReady = true;
  }
  for (const [path, data] of Object.entries(files)) {
    const up = await supabase.storage.from(DEMO_BUCKET).upload(`${slug}/${path}`, data, { contentType: typeOf(path), upsert: true });
    if (up.error) throw new Error(`stockage démo : ${up.error.message}`);
  }
  return `${DEMO_BASE()}/demo/${slug}/`;
}

/** Fichier d'une démo hébergée chez nous (route publique /demo/<slug>/<path>). */
export async function demoFile(slug: string, path: string): Promise<{ data: Buffer; type: string } | null> {
  if (!/^demo-[a-z0-9-]{1,60}$/.test(slug) || path.includes('..')) return null;
  const { data, error } = await supabase.storage.from(DEMO_BUCKET).download(`${slug}/${path || 'index.html'}`);
  if (error || !data) return null;
  return { data: Buffer.from(await data.arrayBuffer()), type: typeOf(path || 'index.html') };
}

/** Netlify d'abord ; s'il refuse (crédit épuisé, jeton, panne), la démo part quand même, gratuitement chez nous. */
export async function deployDemo(slug: string, files: Record<string, Buffer>): Promise<{ url: string; free?: string }> {
  try {
    return { url: (await deployNetlify(slug, files)).url };
  } catch (err) {
    const why = axios.isAxiosError(err) ? `${err.response?.status ?? ''} ${JSON.stringify(err.response?.data ?? err.message).slice(0, 150)}` : (err instanceof Error ? err.message : String(err));
    console.warn('[demo-site] Netlify refuse, démo hébergée chez nous :', why);
    return { url: await hostDemoHere(slug, files), free: why };
  }
}

// ── 5. Outil ─────────────────────────────────────────────────────────────────
export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
const running = new Set<string>();

/** placeId connu (démarchage « sites web ») → pas besoin de retrouver la fiche depuis un lien. */
export async function buildDemo(link: string, notes: string, knownPlaceId?: string): Promise<DemoRecord> {
  if (!mapsKey()) throw new Error('clé Google Maps absente du serveur (GOOGLE_MAPS_API_KEY)');
  let placeId = knownPlaceId ?? null;
  if (!placeId) {
    const { query, lat, lng } = await resolveLink(link);
    placeId = await findPlace(query, lat, lng);
    if (!placeId) throw new Error(`commerce introuvable sur Google pour « ${query} »`);
  }
  const place = await placeDetails(placeId);
  const [content, photoBufs] = await Promise.all([writeContent(place, notes), downloadPhotos(place.photoRefs)]);
  const photoNames = photoBufs.map((_, i) => `img/photo-${i + 1}.jpg`);
  const files: Record<string, Buffer> = { 'index.html': Buffer.from(renderHtml(place, content, photoNames)) };
  photoBufs.forEach((b, i) => { files[photoNames[i]!] = b; });
  const slug = `demo-${slugify(place.name) || 'commerce'}-${randomBytes(2).toString('hex')}`;
  const { url, free } = await deployDemo(slug, files);
  const { photoRefs: _drop, ...placeData } = place;
  const rec: DemoRecord = { slug, url, createdAt: new Date().toISOString(), place: placeData, content, ...(notes ? { notes } : {}), ...(free ? { hostedHere: true } : {}) };
  await kvSet(`demo:site:${slug}`, JSON.stringify(rec));
  const index = JSON.parse((await kvGet(DEMO_INDEX)) ?? '[]') as Array<{ slug: string; name: string; url: string; createdAt: string; style?: string; fonts?: string }>;
  index.unshift({ slug, name: place.name, url, createdAt: rec.createdAt, ...(content.style ? { style: content.style } : {}), fonts: content.fonts.join('/') });
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
      msg = `🌐 Démo du site « ${rec.place.name} » en ligne :\n${rec.url}${inv}` +
        (rec.hostedHere ? '\n\nℹ️ Netlify n\'a pas accepté (crédit épuisé ou panne) : démo hébergée gratuitement sur notre serveur, le lien marche pareil.' : '');
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
