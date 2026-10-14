import axios from 'axios';
import { randomBytes, randomInt } from 'crypto';
import { supabase } from './supabase.js';
import { kvGet, kvSet, kvDel } from './app-store.js';
import { askJson } from './pro-doc.js';
import { hashPassword, checkPassword, sha256 } from '../auth/device-auth.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import {
  type Place, type Content, type OfferItem, FONT_PAIRS, HEX, esc, renderHtml, deployNetlify, slugify, loadDemo,
} from './demo-site.js';
import { adminPageHtml } from './client-site-admin.js';

// FIK SITES — les VRAIS sites des clients de Kouider (plan A). Une démo (create_demo_site) devient un vrai site :
// Kouider donne les vraies infos, Dzaryx remplace ce qui était inventé, enlève l'étiquette « démo » et met en ligne.
// Le patron du commerce a un espace /admin sur son site (e-mail + mot de passe) pour modifier menu, prestations,
// photos, horaires et textes lui-même, comme sur Shopify. Le site public reste statique sur Netlify (il tient même
// si Railway tombe) ; seules les modifications passent par l'API Railway (/api/client-sites).
// Données : app_kv fik:site:<id> (un JSON par site), index fik:sites, sessions fik:sess:<sha256 jeton>.
// Photos : stockage Supabase public, bucket fik-sites/<id>/…

export interface ClientSite {
  id: string; name: string; url: string; netlifySiteId: string; status: 'live' | 'paused';
  createdAt: string; updatedAt: string; fromDemo?: string;
  place: Omit<Place, 'photoRefs'>; content: Content; photos: string[];
  account?: { email: string; pw: string };
}
interface IndexRow { id: string; name: string; url: string; status: ClientSite['status']; fromDemo?: string }

const INDEX = 'fik:sites';
const BUCKET = 'fik-sites';
const SESSION_DAYS = 30;
export const MAX_PHOTOS = 20;
export const API_BASE = () => process.env['PUBLIC_API_URL'] ?? 'https://ibrahim-backend-production.up.railway.app';
const adminUrl = (s: ClientSite) => `${s.url}/admin/`;

// ── Stockage ─────────────────────────────────────────────────────────────────
const readIndex = async () => JSON.parse((await kvGet(INDEX)) ?? '[]') as IndexRow[];

export async function getSite(id: string): Promise<ClientSite | null> {
  return JSON.parse((await kvGet(`fik:site:${id}`)) ?? 'null') as ClientSite | null;
}

async function saveSite(s: ClientSite): Promise<void> {
  s.updatedAt = new Date().toISOString();
  await kvSet(`fik:site:${s.id}`, JSON.stringify(s));
  const index = (await readIndex()).filter(r => r.id !== s.id);
  index.unshift({ id: s.id, name: s.name, url: s.url, status: s.status, ...(s.fromDemo ? { fromDemo: s.fromDemo } : {}) });
  await kvSet(INDEX, JSON.stringify(index));
}

async function findSite(name: string): Promise<ClientSite | null> {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const index = await readIndex();
  const hit = index.find(r => r.id === slugify(q)) ?? index.find(r => r.name.toLowerCase().includes(q) || r.id.includes(slugify(q)));
  return hit ? getSite(hit.id) : null;
}

let bucketReady = false;
export async function uploadPhoto(siteId: string, data: Buffer, contentType: string): Promise<string> {
  if (!bucketReady) {
    await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024 }).catch(() => {});
    bucketReady = true;
  }
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${siteId}/${Date.now()}-${randomBytes(3).toString('hex')}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, data, { contentType, upsert: false });
  if (up.error) throw new Error(`stockage photo : ${up.error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function removePhotos(urls: string[]): Promise<void> {
  const marker = `/object/public/${BUCKET}/`;
  const paths = urls.map(u => u.split(marker)[1]).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
}

// Seules nos propres photos (stockage du site) peuvent aller dans la page.
export const isOwnPhoto = (siteId: string, url: string) => url.includes(`/object/public/${BUCKET}/${siteId}/`);

// ── Mise en ligne ────────────────────────────────────────────────────────────
function pausedHtml(s: ClientSite): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.place.name)}</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f6f4f0;color:#333;text-align:center;padding:24px}h1{font-size:1.6rem;margin-bottom:8px}</style></head>
<body><div><h1>${esc(s.place.name)}</h1><p>Le site est momentanément indisponible.</p>${s.place.phone ? `<p>📞 <a href="tel:${esc(s.place.phone.replace(/\s/g, ''))}">${esc(s.place.phone)}</a></p>` : ''}</div></body></html>`;
}

export async function publishSite(s: ClientSite): Promise<string> {
  const files: Record<string, Buffer> = {
    'index.html': Buffer.from(s.status === 'paused' ? pausedHtml(s) : renderHtml(s.place, s.content, s.photos, { demo: false, siteId: s.id })),
    'admin/index.html': Buffer.from(adminPageHtml(s.id, s.place.name, API_BASE())),
  };
  const { url, siteId } = await deployNetlify(s.id, files, s.netlifySiteId || undefined);
  s.url = url; s.netlifySiteId = siteId;
  await saveSite(s);
  return url;
}

// ── Nettoyage d'un contenu modifié (par Claude ou par le patron dans /admin) ─
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, n: number, max = 2000) => (Array.isArray(v) ? v : []).map(x => str(x, max)).filter(Boolean).slice(0, n);

export function cleanEdit(prev: ClientSite, raw: { place?: any; content?: any }): Pick<ClientSite, 'place' | 'content'> {
  const p = raw.place ?? {}, c = raw.content ?? {};
  const pal = c.palette ?? {};
  const fonts = Array.isArray(c.fonts) && FONT_PAIRS.some(f => f[0] === c.fonts[0] && f[1] === c.fonts[1])
    ? [c.fonts[0], c.fonts[1]] as [string, string] : prev.content.fonts;
  return {
    place: {
      ...prev.place,
      name: str(p.name, 120) || prev.place.name,
      address: 'address' in p ? str(p.address, 300) : prev.place.address,
      phone: 'phone' in p ? (str(p.phone, 40) || undefined) : prev.place.phone,
      hours: 'hours' in p ? strList(p.hours, 14, 120) : prev.place.hours,
    },
    content: {
      ...prev.content,
      tagline: 'tagline' in c ? str(c.tagline, 160) : prev.content.tagline,
      about: 'about' in c ? strList(c.about, 6) : prev.content.about,
      offerTitle: str(c.offerTitle, 80) || prev.content.offerTitle,
      offerIntro: 'offerIntro' in c ? str(c.offerIntro, 400) : prev.content.offerIntro,
      offer: 'offer' in c ? (Array.isArray(c.offer) ? c.offer : []).slice(0, 12).map((g: any) => ({
        group: str(g?.group, 80),
        items: (Array.isArray(g?.items) ? g.items : []).slice(0, 60)
          .map((it: any): OfferItem => ({ name: str(it?.name, 120), description: str(it?.description, 400), price: str(it?.price, 40) }))
          .filter((it: OfferItem) => it.name),
      })).filter((g: { items: OfferItem[] }) => g.items.length) : prev.content.offer,
      highlights: 'highlights' in c ? strList(c.highlights, 8, 80) : prev.content.highlights,
      palette: {
        primary: HEX.test(pal.primary) ? pal.primary : prev.content.palette.primary,
        accent: HEX.test(pal.accent) ? pal.accent : prev.content.palette.accent,
        dark: HEX.test(pal.dark) ? pal.dark : prev.content.palette.dark,
        light: HEX.test(pal.light) ? pal.light : prev.content.palette.light,
      },
      fonts,
      invented: 'invented' in c ? strList(c.invented, 30, 300) : prev.content.invented,
    },
  };
}

// ── Modifications en langage naturel (Kouider, à la voix ou par écrit) ──────
const EDITOR = `Tu modifies le contenu du site web d'un commerce, client de FIK Conciergerie.
Tu reçois le JSON actuel du site et les consignes ou vraies infos données par Kouider.
- Applique les consignes EXACTEMENT. Ne change rien d'autre.
- Si Kouider donne de vraies infos (vrai menu, vrais prix, vraies prestations…), elles REMPLACENT entièrement ce qui avait été inventé pour la même partie.
- "content.invented" liste ce qui est encore inventé : retire ce qui est maintenant remplacé par du vrai, garde le reste tel quel. N'invente rien de nouveau, sauf si Kouider le demande (et alors ajoute-le à "invented").
- Horaires : une ligne par jour au format « lundi: 09:00 – 18:00 » (ou « lundi: Fermé »).
Réponds UNIQUEMENT avec le JSON complet mis à jour, même forme : {"place": {"name","address","phone","hours"}, "content": {"tagline","about","offerTitle","offerIntro","offer","highlights","palette","invented"}}`;

async function applyInstructions(s: ClientSite, instructions: string): Promise<Pick<ClientSite, 'place' | 'content'>> {
  const current = {
    place: { name: s.place.name, address: s.place.address, phone: s.place.phone ?? '', hours: s.place.hours },
    content: { tagline: s.content.tagline, about: s.content.about, offerTitle: s.content.offerTitle, offerIntro: s.content.offerIntro,
      offer: s.content.offer, highlights: s.content.highlights, palette: s.content.palette, invented: s.content.invented },
  };
  const r = await askJson<{ place?: unknown; content?: unknown }>(EDITOR,
    `SITE ACTUEL :\n${JSON.stringify(current, null, 1)}\n\nCONSIGNES DE KOUIDER :\n${instructions}`, 12000);
  return cleanEdit(s, r);
}

// ── Création depuis une démo ─────────────────────────────────────────────────
const PW_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const newPassword = () => Array.from({ length: 10 }, () => PW_CHARS[randomInt(PW_CHARS.length)]).join('');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function copyDemoPhotos(siteId: string, demoUrl: string): Promise<string[]> {
  const out: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const r = await axios.get(`${demoUrl}/img/photo-${i}.jpg`, { responseType: 'arraybuffer', timeout: 30_000, validateStatus: () => true });
    const buf = Buffer.from(r.data as ArrayBuffer);
    if (r.status !== 200 || !String(r.headers['content-type'] ?? '').startsWith('image/') || buf.length < 5000) break;
    out.push(await uploadPhoto(siteId, buf, 'image/jpeg'));
  }
  return out;
}

export async function buildClientSite(demoName: string, realInfo: string, email: string): Promise<{ site: ClientSite; password?: string }> {
  const demo = await loadDemo(demoName);
  if (!demo) throw new Error(`aucune démo trouvée pour « ${demoName} » (fais d'abord la démo avec son lien Google Maps)`);
  const existing = (await readIndex()).find(r => r.fromDemo === demo.slug);
  if (existing) throw new Error(`cette démo est déjà devenue un vrai site : ${existing.url} (pour le modifier : manage_client_site action=edit)`);

  let id = slugify(demo.place.name) || 'site';
  if (await getSite(id)) id = `${id}-${randomBytes(2).toString('hex')}`;
  const now = new Date().toISOString();
  let site: ClientSite = {
    id, name: demo.place.name, url: '', netlifySiteId: '', status: 'live', createdAt: now, updatedAt: now, fromDemo: demo.slug,
    place: demo.place, content: demo.content, photos: [],
  };
  const [photos, edited] = await Promise.all([
    copyDemoPhotos(id, demo.url),
    realInfo ? applyInstructions(site, realInfo) : Promise.resolve({ place: site.place, content: site.content }),
  ]);
  site = { ...site, ...edited, name: edited.place.name, photos };
  let password: string | undefined;
  if (email) {
    password = newPassword();
    site.account = { email: email.toLowerCase(), pw: hashPassword(password) };
  }
  await publishSite(site);
  return { site, ...(password ? { password } : {}) };
}

const running = new Set<string>();

function inBackground(key: string, work: () => Promise<string>): void {
  running.add(key);
  void (async () => {
    let msg: string;
    try { msg = await work(); } catch (err) {
      const e = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message).slice(0, 300) : (err instanceof Error ? err.message : String(err));
      msg = `❌ Site client : ${e}`;
    } finally { running.delete(key); }
    console.log('[client-sites]', msg.replace(/\n/g, ' ').replace(/Mot de passe : \S+/, 'Mot de passe : ***'));
    await queueTelegramMessage(msg).catch(() => {});
    emitProactive(msg.split('\n')[0]!.slice(0, 100), 'info', msg);
  })();
}

const loginLines = (s: ClientSite, password?: string) => s.account
  ? `\n\n🔑 Espace client (à donner au patron) :\n${adminUrl(s)}\nE-mail : ${s.account.email}${password ? `\nMot de passe : ${password}` : ''}`
  : `\n\n🔑 Pas encore d'espace client : donne-moi l'e-mail du patron pour le créer.`;
const inventedLines = (s: ClientSite) => s.content.invented.length
  ? `\n\n✏️ Encore inventé (à remplacer) :\n- ${s.content.invented.join('\n- ')}` : '\n\n✅ Plus rien d\'inventé.';

export function createClientSite(input: Record<string, unknown>): string {
  const demo = str(input['demo'], 200);
  const realInfo = str(input['real_info'], 20000);
  const email = str(input['client_email'], 200);
  if (!demo) return '❌ Dis-moi de quelle démo on part (nom du commerce). Liste des démos : get_demo_site.';
  if (email && !EMAIL.test(email)) return `❌ E-mail du client invalide : « ${email} ».`;
  const key = `create:${demo.toLowerCase()}`;
  if (running.has(key)) return '⏳ Ce site est déjà en préparation : le lien arrive sur Telegram et dans l\'app.';
  inBackground(key, async () => {
    const { site, password } = await buildClientSite(demo, realInfo, email);
    return `🌐 Vrai site « ${site.name} » en ligne (sans l'étiquette démo) :\n${site.url}${loginLines(site, password)}${inventedLines(site)}`;
  });
  return '⏳ Je transforme la démo en vrai site (1 à 2 minutes) : vraies infos à la place de ce qui était inventé, photos, mise en ligne' +
    `${email ? ', espace client' : ''}. Le lien${email ? ' et les identifiants arrivent' : ' arrive'} sur Telegram et dans l'app.`;
}

// ── Gestion (Kouider) ────────────────────────────────────────────────────────
export async function manageClientSite(input: Record<string, unknown>): Promise<string> {
  const action = str(input['action'], 20) || 'list';
  const name = str(input['site'], 200);
  if (action === 'list') {
    const index = await readIndex();
    if (!index.length) return 'Aucun vrai site client pour le moment (les démos : get_demo_site).';
    return `Sites clients (${index.length}) :\n${index.map(r => `- ${r.name} — ${r.url}${r.status === 'paused' ? ' (EN PAUSE)' : ''}`).join('\n')}`;
  }
  const s = await findSite(name);
  if (!s) {
    const index = await readIndex();
    return `❌ Aucun site client trouvé pour « ${name} ».${index.length ? ` Sites : ${index.map(r => r.name).join(', ')}` : ''}`;
  }
  switch (action) {
    case 'info':
      return [
        `« ${s.name} » — ${s.url} (${s.status === 'paused' ? 'EN PAUSE' : 'en ligne'}, mis à jour le ${s.updatedAt.slice(0, 10)})`,
        s.account ? `Espace client : ${adminUrl(s)} — e-mail ${s.account.email}` : 'Pas d\'espace client (action=account avec client_email pour le créer).',
        `Adresse ${s.place.address} ; tél. ${s.place.phone ?? '—'} ; horaires : ${s.place.hours.join(' | ') || '—'}`,
        `${s.content.offerTitle} : ${s.content.offer.map(g => `${g.group} (${g.items.map(i => `${i.name}${i.price ? ` ${i.price}` : ''}`).join(', ')})`).join(' ; ')}`,
        `Photos : ${s.photos.length}`,
        `Encore inventé : ${s.content.invented.length ? s.content.invented.join(' ; ') : 'rien'}`,
      ].join('\n');
    case 'edit': {
      const changes = str(input['changes'], 20000);
      if (!changes) return '❌ Dis-moi quoi changer (changes).';
      const key = `edit:${s.id}`;
      if (running.has(key)) return '⏳ Une modification de ce site est déjà en cours.';
      inBackground(key, async () => {
        const fresh = (await getSite(s.id))!;
        Object.assign(fresh, await applyInstructions(fresh, changes));
        fresh.name = fresh.place.name;
        await publishSite(fresh);
        return `✅ Site « ${fresh.name} » mis à jour :\n${fresh.url}${inventedLines(fresh)}`;
      });
      return `⏳ Je modifie le site « ${s.name} » (moins d'une minute). Je te confirme sur Telegram et dans l'app.`;
    }
    case 'pause':
    case 'resume':
      s.status = action === 'pause' ? 'paused' : 'live';
      await publishSite(s);
      return action === 'pause'
        ? `⏸️ Site « ${s.name} » en pause : les visiteurs voient « momentanément indisponible » avec le téléphone. ${s.url}`
        : `▶️ Site « ${s.name} » remis en ligne : ${s.url}`;
    case 'account': {
      const email = str(input['client_email'], 200) || s.account?.email || '';
      if (!EMAIL.test(email)) return '❌ Il me faut l\'e-mail du patron (client_email).';
      const password = newPassword();
      s.account = { email: email.toLowerCase(), pw: hashPassword(password) };
      await saveSite(s);
      await revokeSessions(s.id);
      await queueTelegramMessage(`🔑 Espace client « ${s.name} » :\n${adminUrl(s)}\nE-mail : ${s.account.email}\nMot de passe : ${password}`).catch(() => {});
      return `✅ Espace client prêt pour « ${s.name} » (${s.account.email}). Le lien et le nouveau mot de passe sont envoyés sur Telegram. Les anciennes connexions sont coupées.`;
    }
    default:
      return `❌ Action inconnue « ${action} » (list, info, edit, pause, resume, account).`;
  }
}

// ── Sessions de l'espace client ──────────────────────────────────────────────
interface Session { site: string; epoch: number }
const sessionEpoch = async (siteId: string) => Number((await kvGet(`fik:epoch:${siteId}`)) ?? '0');
async function revokeSessions(siteId: string): Promise<void> {
  await kvSet(`fik:epoch:${siteId}`, String((await sessionEpoch(siteId)) + 1));
}

const failures = new Map<string, { n: number; until: number }>();

export async function loginClient(siteId: string, email: string, password: string, ip: string): Promise<string | null> {
  const key = `${siteId}|${ip}`;
  const f = failures.get(key);
  if (f && f.n >= 8 && f.until > Date.now()) throw new Error('Trop d\'essais. Réessayez dans 15 minutes.');
  const s = await getSite(siteId);
  const ok = !!s?.account && s.account.email === email.trim().toLowerCase() && checkPassword(password, s.account.pw);
  if (!ok) {
    failures.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    return null;
  }
  failures.delete(key);
  const token = randomBytes(32).toString('hex');
  const sess: Session = { site: siteId, epoch: await sessionEpoch(siteId) };
  await kvSet(`fik:sess:${sha256(token)}`, JSON.stringify(sess), SESSION_DAYS * 86400);
  return token;
}

export async function sessionSite(token: string): Promise<ClientSite | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const sess = JSON.parse((await kvGet(`fik:sess:${sha256(token)}`)) ?? 'null') as Session | null;
  if (!sess || sess.epoch !== await sessionEpoch(sess.site)) return null;
  return getSite(sess.site);
}

export async function logoutClient(token: string): Promise<void> {
  await kvDel(`fik:sess:${sha256(token)}`);
}

export async function changeClientPassword(s: ClientSite, oldPw: string, newPw: string): Promise<string | null> {
  if (!s.account || !checkPassword(oldPw, s.account.pw)) return 'Ancien mot de passe incorrect.';
  if (newPw.length < 8) return 'Le nouveau mot de passe doit faire au moins 8 caractères.';
  s.account.pw = hashPassword(newPw);
  await saveSite(s);
  return null;
}

export { saveSite };
