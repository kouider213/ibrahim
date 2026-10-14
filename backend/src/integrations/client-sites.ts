import axios from 'axios';
import { randomBytes, randomInt } from 'crypto';
import { promises as dns } from 'dns';
import { supabase } from './supabase.js';
import { kvGet, kvSet, kvDel } from './app-store.js';
import { askJson } from './pro-doc.js';
import { hashPassword, checkPassword, sha256 } from '../auth/device-auth.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { sendEmail } from './gmail.js';
import { emitProactive } from '../notifications/mobile-push.js';
import {
  type Place, type Content, type OfferItem, FONT_PAIRS, HEX, esc, renderHtml, deployNetlify, slugify, loadDemo, formKind,
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
  domain?: { name: string; status: 'pending' | 'active'; since: string; checkedAt?: string };
  billing?: Billing;
  notify?: { email?: string; kouider: boolean };   // où envoyer les messages du formulaire (défaut : e-mail du compte)
  pausedReason?: 'billing' | 'manual';
  adminV?: number;   // version de la page /admin/ publiée (republiée si elle est plus vieille que ADMIN_VERSION)
}
export interface Payment { at: string; amount: number; months: number; note?: string }
export interface Billing {
  monthly: number; currency: string; paidUntil: string;   // AAAA-MM-JJ : payé jusqu'à cette date incluse
  autoPause: boolean; graceDays: number; payments: Payment[]; reminded?: string;   // dernière alerte (clé jour/étape)
}
export interface SiteMessage {
  id: string; at: string; mode: 'table' | 'rdv' | 'contact'; name: string; phone: string; email?: string;
  date?: string; time?: string; people?: number; message?: string; read: boolean;
}
interface IndexRow { id: string; name: string; url: string; status: ClientSite['status']; fromDemo?: string }

const INDEX = 'fik:sites';
const BUCKET = 'fik-sites';
const SESSION_DAYS = 30;
export const MAX_PHOTOS = 20;
const ADMIN_VERSION = 2;   // à monter quand client-site-admin.ts change
const STAFF_HOURS = 2;
export const API_BASE = () => process.env['PUBLIC_API_URL'] ?? 'https://ibrahim-backend-production.up.railway.app';
export const publicUrl = (s: ClientSite) => (s.domain?.status === 'active' ? `https://${s.domain.name}` : s.url);
export const adminUrl = (s: ClientSite) => `${publicUrl(s)}/admin/`;

// ── Stockage ─────────────────────────────────────────────────────────────────
export const readIndex = async () => JSON.parse((await kvGet(INDEX)) ?? '[]') as IndexRow[];

export async function getSite(id: string): Promise<ClientSite | null> {
  return JSON.parse((await kvGet(`fik:site:${id}`)) ?? 'null') as ClientSite | null;
}

async function saveSite(s: ClientSite): Promise<void> {
  s.updatedAt = new Date().toISOString();
  await kvSet(`fik:site:${s.id}`, JSON.stringify(s));
  const index = (await readIndex()).filter(r => r.id !== s.id);
  index.unshift({ id: s.id, name: s.name, url: publicUrl(s), status: s.status, ...(s.fromDemo ? { fromDemo: s.fromDemo } : {}) });
  await kvSet(INDEX, JSON.stringify(index));
}

export async function findSite(name: string): Promise<ClientSite | null> {
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
    'index.html': Buffer.from(s.status === 'paused' ? pausedHtml(s) : renderHtml(s.place, s.content, s.photos, { demo: false, siteId: s.id, formApi: API_BASE() })),
    'admin/index.html': Buffer.from(adminPageHtml(s.id, s.place.name, API_BASE())),
  };
  const { url, siteId } = await deployNetlify(s.id, files, s.netlifySiteId || undefined);
  // Une fois un domaine branché, Netlify renvoie ce domaine : on garde l'adresse netlify.app comme adresse de base.
  if (!s.url) s.url = url;
  s.netlifySiteId = siteId;
  s.adminV = ADMIN_VERSION;
  await saveSite(s);
  return publicUrl(s);
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
  if (action === 'report') return billingReport();
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
        s.domain ? `Domaine : ${s.domain.name} (${s.domain.status === 'active' ? 'actif' : 'en attente du DNS'})` : 'Domaine : aucun',
        s.billing ? `Abonnement : ${money(s.billing.monthly, s.billing.currency)}/mois, payé jusqu'au ${frDate(s.billing.paidUntil)}${lateDays(s.billing) > 0 ? ` — ${lateDays(s.billing)} j de RETARD` : ''}` : 'Abonnement : pas réglé',
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
      if (action === 'pause') s.pausedReason = 'manual'; else delete s.pausedReason;
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
    case 'domain': {
      const d = str(input['domain'], 260);
      if (!d) return s.domain ? `Domaine de « ${s.name} » : ${s.domain.name} (${s.domain.status === 'active' ? 'actif' : 'en attente du DNS'}).\n${dnsInstructions(s)}` : '❌ Donne-moi le nom de domaine (domain).';
      return await setDomain(s, d);
    }
    case 'domain_check':
      return (await checkDomain(s)).msg;
    case 'domain_remove':
      return await removeDomain(s);
    case 'billing': {
      const err = setBilling(s, { monthly: input['monthly'], currency: input['currency'], paid_until: input['paid_until'], auto_pause: input['auto_pause'], grace_days: input['grace_days'] });
      if (err) return err;
      await saveSite(s);
      const b = s.billing!;
      return `💳 Abonnement « ${s.name} » : ${money(b.monthly, b.currency)}/mois, payé jusqu'au ${frDate(b.paidUntil)}. Pause automatique : ${b.autoPause ? `oui, après ${b.graceDays} jours de retard` : 'non (je te préviens seulement)'}.`;
    }
    case 'paid':
      return await markPaid(s, input['amount'], input['months'], str(input['note'], 200));
    case 'messages': {
      const list = await listMessages(s.id);
      if (!list.length) return `Aucun message reçu par le site « ${s.name} ».`;
      await markMessagesRead(s.id);
      return `Messages du site « ${s.name} » (${list.length}) :\n${list.slice(0, 10).map(m => `- ${new Date(m.at).toLocaleString('fr-FR', { timeZone: 'Africa/Algiers', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${MODE_LABEL[m.mode]} · ${describeMessage(m).replace(/\n/g, ' · ')}`).join('\n')}`;
    }
    case 'notify': {
      const email = str(input['notify_email'], 200);
      if (email && !EMAIL.test(email)) return `❌ E-mail invalide : « ${email} ».`;
      s.notify = { ...(email ? { email: email.toLowerCase() } : s.notify?.email ? { email: s.notify.email } : {}),
        kouider: typeof input['copy_kouider'] === 'boolean' ? input['copy_kouider'] : !!s.notify?.kouider };
      await saveSite(s);
      return `📨 Messages du site « ${s.name} » envoyés à ${s.notify.email ?? s.account?.email ?? '(personne : ajoute un e-mail)'}${s.notify.kouider ? ', avec une copie pour toi sur Telegram' : ''}.`;
    }
    default:
      return `❌ Action inconnue « ${action} » (list, info, edit, pause, resume, account, domain, domain_check, domain_remove, billing, paid, report, messages, notify).`;
  }
}

// ── Étape 4 : messages du formulaire (réservation / rendez-vous / contact) ──
const MSGS = (id: string) => `fik:msgs:${id}`;
const msgRate = new Map<string, number[]>();

export async function listMessages(siteId: string): Promise<SiteMessage[]> {
  return JSON.parse((await kvGet(MSGS(siteId))) ?? '[]') as SiteMessage[];
}

export async function markMessagesRead(siteId: string, ids?: string[]): Promise<void> {
  const list = await listMessages(siteId);
  for (const m of list) if (!ids || ids.includes(m.id)) m.read = true;
  await kvSet(MSGS(siteId), JSON.stringify(list));
}

const MODE_LABEL = { table: 'réservation de table', rdv: 'demande de rendez-vous', contact: 'message' } as const;

function describeMessage(m: SiteMessage): string {
  return [
    `Nom : ${m.name}`, `Téléphone : ${m.phone}`, m.email ? `E-mail : ${m.email}` : '',
    m.date ? `Date : ${new Date(`${m.date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${m.time ? ` à ${m.time}` : ''}` : '',
    m.people ? `Personnes : ${m.people}` : '', m.message ? `Message : ${m.message}` : '',
  ].filter(Boolean).join('\n');
}

/** Message envoyé par un visiteur. Renvoie une erreur à afficher, ou null si c'est bon (ou si c'est un robot : on ne le lui dit pas). */
export async function receiveMessage(siteId: string, raw: Record<string, unknown>, ip: string): Promise<string | null> {
  const s = await getSite(siteId);
  if (!s || s.status !== 'live') return 'Site indisponible';
  if (str(raw['website'])) return null;                                   // champ piège rempli → robot
  if (Number(raw['elapsed']) < 2500) return null;                         // envoyé en moins de 2,5 s → robot
  const now = Date.now();
  const recent = (msgRate.get(ip) ?? []).filter(t => now - t < 10 * 60_000);
  if (recent.length >= 5) return 'Trop de messages envoyés, réessayez plus tard ou appelez-nous';
  msgRate.set(ip, [...recent, now]);
  const name = str(raw['name'], 80), phone = str(raw['phone'], 30);
  if (!name || phone.replace(/\D/g, '').length < 6) return 'Nom et téléphone obligatoires';
  const email = str(raw['email'], 120);
  const mode = formKind(s.content.kind).mode;
  const m: SiteMessage = {
    id: randomBytes(6).toString('hex'), at: new Date().toISOString(), mode, name, phone, read: false,
    ...(EMAIL.test(email) ? { email } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(str(raw['date'])) ? { date: str(raw['date']) } : {}),
    ...(/^\d{2}:\d{2}$/.test(str(raw['time'])) ? { time: str(raw['time']) } : {}),
    ...(Number(raw['people']) > 0 ? { people: Math.min(200, Math.round(Number(raw['people']))) } : {}),
    ...(str(raw['message'], 2000) ? { message: str(raw['message'], 2000) } : {}),
  };
  if (mode === 'contact' && !m.message) return 'Écrivez votre message';
  const list = await listMessages(siteId);
  if (list.filter(x => now - Date.parse(x.at) < 86400_000).length >= 60) return 'Trop de messages aujourd\'hui, appelez-nous';
  list.unshift(m);
  await kvSet(MSGS(siteId), JSON.stringify(list.slice(0, 300)));

  const to = s.notify?.email ?? s.account?.email;
  const subject = `${m.mode === 'contact' ? 'Nouveau message' : `Nouvelle ${MODE_LABEL[m.mode]}`} — ${s.place.name}`;
  let mailed = false;
  if (to) {
    try {
      await sendEmail('pro', { to, subject, replyTo: m.email,
        body: `Bonjour,\n\nNouvelle ${MODE_LABEL[m.mode]} reçue sur votre site ${publicUrl(s)} :\n\n${describeMessage(m)}\n\n` +
          `${m.email ? 'Répondez simplement à cet e-mail pour lui écrire.\n' : ''}Tous vos messages sont aussi dans votre espace client : ${adminUrl(s)}\n\n— FIK Conciergerie` });
      mailed = true;
    } catch (err) { console.error('[client-sites] e-mail message', err instanceof Error ? err.message : err); }
  }
  if (s.notify?.kouider || !mailed) {
    await queueTelegramMessage(`📨 ${subject}${mailed ? '' : ' (pas envoyé au patron : pas d\'e-mail)'}\n${describeMessage(m)}`).catch(() => {});
  }
  return null;
}

// ── Étape 3 : nom de domaine du client ───────────────────────────────────────
const NETLIFY_LB = '75.2.60.5';
const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const netlifyHeaders = () => ({ Authorization: `Bearer ${process.env['NETLIFY_TOKEN']}` });
const netlifyHost = (s: ClientSite) => new URL(s.url).host;

export function dnsInstructions(s: ClientSite): string {
  return `Chez le vendeur du domaine (OVH, GoDaddy, Hostinger, Namecheap…), zone DNS de ${s.domain?.name ?? 'ton domaine'} :\n` +
    `- enregistrement A, nom « @ » → ${NETLIFY_LB}\n- enregistrement CNAME, nom « www » → ${netlifyHost(s)}\n` +
    `Supprime les autres enregistrements A/AAAA/CNAME sur « @ » et « www ». Ça prend de quelques minutes à 24 h ; Dzaryx vérifie chaque jour et te prévient quand c'est actif (cadenas https compris).`;
}

export async function setDomain(s: ClientSite, raw: string): Promise<string> {
  const name = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!DOMAIN_RE.test(name)) return `❌ Nom de domaine invalide : « ${raw} » (ex. restaurant-pralin.com).`;
  await axios.patch(`https://api.netlify.com/api/v1/sites/${s.netlifySiteId}`, { custom_domain: name, domain_aliases: [`www.${name}`] },
    { headers: netlifyHeaders(), timeout: 20_000 });
  s.domain = { name, status: 'pending', since: new Date().toISOString() };
  await saveSite(s);
  return `🌐 Domaine ${name} branché sur le site « ${s.name} ». Il reste à régler le DNS :\n${dnsInstructions(s)}`;
}

export async function removeDomain(s: ClientSite): Promise<string> {
  if (!s.domain) return `Le site « ${s.name} » n'a pas de domaine.`;
  await axios.patch(`https://api.netlify.com/api/v1/sites/${s.netlifySiteId}`, { custom_domain: null, domain_aliases: [] },
    { headers: netlifyHeaders(), timeout: 20_000 });
  const old = s.domain.name;
  delete s.domain;
  await saveSite(s);
  return `Domaine ${old} retiré : le site reste sur ${s.url}.`;
}

export async function checkDomain(s: ClientSite): Promise<{ active: boolean; msg: string }> {
  if (!s.domain) return { active: false, msg: 'Pas de domaine.' };
  const name = s.domain.name, host = netlifyHost(s);
  const [a, wa, wc] = await Promise.all([dns.resolve4(name).catch((): string[] => []), dns.resolve4(`www.${name}`).catch((): string[] => []),
    dns.resolveCname(`www.${name}`).catch((): string[] => [])]);
  const apexOk = a.includes(NETLIFY_LB);
  const wwwOk = wa.includes(NETLIFY_LB) || wc.some(x => x.replace(/\.$/, '') === host);
  s.domain.checkedAt = new Date().toISOString();
  if (!apexOk || !wwwOk) {
    await saveSite(s);
    return { active: false, msg: `DNS de ${name} pas encore bon : « @ » → ${a.join(', ') || 'rien'} (attendu ${NETLIFY_LB}) ; « www » → ${[...wc, ...wa].join(', ') || 'rien'} (attendu ${host}).` };
  }
  try {
    await axios.post(`https://api.netlify.com/api/v1/sites/${s.netlifySiteId}/ssl`, null, { headers: netlifyHeaders(), timeout: 60_000 });
  } catch (err) {
    await saveSite(s);
    const why = axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message).slice(0, 160) : String(err);
    return { active: false, msg: `DNS bon pour ${name}, certificat https pas encore prêt (${why}). Je réessaie.` };
  }
  const wasPending = s.domain.status !== 'active';
  s.domain.status = 'active';
  await publishSite(s);   // l'espace client et les liens prennent la nouvelle adresse
  return { active: true, msg: `${wasPending ? '✅ ' : ''}https://${name} est actif (https compris).` };
}

// ── Étape 5 : abonnements (paiement à la main : espèces, BaridiMob, virement) ─
const todayDz = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10);   // Oran = UTC+1
export function addMonths(d: string, n: number): string {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, dd));
  if (t.getUTCDate() !== dd) t.setUTCDate(0);   // 31 janv. + 1 mois → 28/29 févr.
  return t.toISOString().slice(0, 10);
}
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000);
/** Jours de retard (> 0), 0 = dû aujourd'hui ou à jour, < 0 = jours avant l'échéance. */
export const lateDays = (b: Billing) => dayDiff(b.paidUntil, todayDz());
const money = (n: number, cur: string) => `${n.toLocaleString('fr-FR')} ${cur}`;
const frDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function setBilling(s: ClientSite, v: { monthly?: unknown; currency?: unknown; paid_until?: unknown; auto_pause?: unknown; grace_days?: unknown }): string {
  const monthly = v.monthly != null && v.monthly !== '' ? Number(v.monthly) : s.billing?.monthly;
  if (monthly == null || !(monthly >= 0)) return '❌ Il me faut le prix mensuel (monthly).';
  const paidUntil = /^\d{4}-\d{2}-\d{2}$/.test(String(v.paid_until ?? '')) ? String(v.paid_until) : (s.billing?.paidUntil ?? todayDz());
  s.billing = {
    monthly, currency: str(v.currency, 8) || s.billing?.currency || 'DA', paidUntil,
    autoPause: typeof v.auto_pause === 'boolean' ? v.auto_pause : (s.billing?.autoPause ?? false),
    graceDays: Number(v.grace_days) > 0 ? Math.min(90, Math.round(Number(v.grace_days))) : (s.billing?.graceDays ?? 10),
    payments: s.billing?.payments ?? [], ...(s.billing?.reminded ? { reminded: s.billing.reminded } : {}),
  };
  return '';
}

export async function markPaid(s: ClientSite, amountIn: unknown, monthsIn: unknown, note: string): Promise<string> {
  if (!s.billing) return `❌ Pas encore d'abonnement pour « ${s.name} » : donne d'abord le prix mensuel (action billing).`;
  const months = Math.max(1, Math.min(24, Math.round(Number(monthsIn) || 1)));
  const amount = amountIn != null && amountIn !== '' ? Number(amountIn) : s.billing.monthly * months;
  s.billing.paidUntil = addMonths(s.billing.paidUntil, months);
  s.billing.payments.unshift({ at: new Date().toISOString(), amount, months, ...(note ? { note } : {}) });
  s.billing.payments = s.billing.payments.slice(0, 120);
  delete s.billing.reminded;
  let extra = '';
  if (s.status === 'paused' && s.pausedReason === 'billing' && lateDays(s.billing) <= 0) {
    s.status = 'live'; delete s.pausedReason;
    await publishSite(s);
    extra = ' Le site, mis en pause pour impayé, est remis en ligne.';
  } else await saveSite(s);
  const late = lateDays(s.billing);
  return `💰 Paiement noté pour « ${s.name} » : ${money(amount, s.billing.currency)} (${months} mois). Payé jusqu'au ${frDate(s.billing.paidUntil)}` +
    `${late > 0 ? ` — encore ${late} jour(s) de retard` : ''}.${extra}`;
}

export async function billingReport(): Promise<string> {
  const sites = (await Promise.all((await readIndex()).map(r => getSite(r.id)))).filter((x): x is ClientSite => !!x);
  if (!sites.length) return 'Aucun site client pour le moment.';
  const billed = sites.filter(x => x.billing);
  const mrr = new Map<string, number>();
  for (const x of billed) if (x.status === 'live') mrr.set(x.billing!.currency, (mrr.get(x.billing!.currency) ?? 0) + x.billing!.monthly);
  const late = billed.filter(x => lateDays(x.billing!) > 0).sort((a, b) => lateDays(b.billing!) - lateDays(a.billing!));
  const soon = billed.filter(x => { const d = lateDays(x.billing!); return d <= 0 && d >= -7; });
  return [
    `Sites clients : ${sites.length} (${sites.filter(x => x.status === 'live').length} en ligne, ${sites.filter(x => x.status === 'paused').length} en pause)`,
    `Revenus mensuels (sites en ligne) : ${mrr.size ? [...mrr].map(([c, n]) => money(n, c)).join(' + ') : '—'}`,
    late.length ? `En retard (${late.length}) :\n${late.map(x => `- ${x.name} : ${lateDays(x.billing!)} j de retard, payé jusqu'au ${frDate(x.billing!.paidUntil)} (${money(x.billing!.monthly, x.billing!.currency)}/mois)${x.status === 'paused' ? ' — EN PAUSE' : ''}`).join('\n')}` : 'Personne en retard.',
    soon.length ? `À payer dans les 7 jours :\n${soon.map(x => `- ${x.name} : le ${frDate(x.billing!.paidUntil)} (${money(x.billing!.monthly, x.billing!.currency)})`).join('\n')}` : '',
    sites.filter(x => !x.billing).length ? `Sans abonnement réglé : ${sites.filter(x => !x.billing).map(x => x.name).join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

/** Tâche quotidienne : domaines en attente, échéances, retards, pause automatique. Un seul message à Kouider. */
export async function jobClientSites(): Promise<string> {
  const lines: string[] = [];
  const today = todayDz();
  for (const r of await readIndex()) {
    const s = await getSite(r.id);
    if (!s) continue;
    if (s.domain?.status === 'pending') {
      const d = await checkDomain(s).catch(err => ({ active: false, msg: String(err) }));
      if (d.active) lines.push(`🌐 ${s.name} : ${d.msg}`);
      else if (dayDiff(s.domain.since.slice(0, 10), today) % 3 === 2) lines.push(`🌐 ${s.name} : ${d.msg}`);
    }
    const b = s.billing;
    if (!b) continue;
    const late = lateDays(b);
    let note = '';
    if (late === -3) note = `📅 ${s.name} : ${money(b.monthly, b.currency)} à payer le ${frDate(b.paidUntil)} (dans 3 jours).`;
    else if (late === 1 || (late > 1 && late % 7 === 0)) note = `⏰ ${s.name} : ${late} jour(s) de retard de paiement (${money(b.monthly, b.currency)}/mois, payé jusqu'au ${frDate(b.paidUntil)}).`;
    if (b.autoPause && late >= b.graceDays && s.status === 'live') {
      s.status = 'paused'; s.pausedReason = 'billing';
      await publishSite(s);
      note = `⏸️ ${s.name} mis en pause automatiquement : ${late} jours de retard. Dès que tu notes le paiement, il revient en ligne.`;
    }
    if (note && b.reminded !== `${today}`) {
      b.reminded = today;
      await saveSite(s);
      lines.push(note);
    }
  }
  if (lines.length) {
    const msg = `🌐 Sites clients — ${lines.length} point(s) :\n${lines.join('\n')}`;
    await queueTelegramMessage(msg).catch(() => {});
    emitProactive(lines[0]!.slice(0, 100), 'info', msg);
  }
  return lines.length ? lines.join(' | ') : 'rien à signaler';
}

// ── Vue d'ensemble pour la page « Sites » de l'app ───────────────────────────
export async function sitesOverview() {
  const sites = (await Promise.all((await readIndex()).map(r => getSite(r.id)))).filter((x): x is ClientSite => !!x);
  const rows = await Promise.all(sites.map(async x => {
    const msgs = await listMessages(x.id);
    return {
      id: x.id, name: x.name, kind: x.content.kind, status: x.status, pausedReason: x.pausedReason ?? null,
      url: publicUrl(x), netlifyUrl: x.url, adminUrl: adminUrl(x), createdAt: x.createdAt, updatedAt: x.updatedAt,
      photo: x.photos[0] ?? null, account: x.account?.email ?? null, invented: x.content.invented,
      domain: x.domain ?? null, dns: x.domain ? dnsInstructions(x) : null, dnsTarget: { a: NETLIFY_LB, cname: netlifyHost(x) },
      billing: x.billing ? { ...x.billing, late: lateDays(x.billing) } : null,
      notify: { email: x.notify?.email ?? null, kouider: !!x.notify?.kouider },
      unread: msgs.filter(m => !m.read).length, messages: msgs.slice(0, 30),
    };
  }));
  const demos = JSON.parse((await kvGet('demo:sites')) ?? '[]') as Array<{ slug: string; name: string; url: string; createdAt: string }>;
  const converted = new Set(sites.map(x => x.fromDemo));
  const mrr: Record<string, number> = {};
  for (const x of sites) if (x.billing && x.status === 'live') mrr[x.billing.currency] = (mrr[x.billing.currency] ?? 0) + x.billing.monthly;
  return {
    sites: rows,
    demos: demos.map(d => ({ ...d, converted: converted.has(d.slug) })),
    stats: {
      live: sites.filter(x => x.status === 'live').length, paused: sites.filter(x => x.status === 'paused').length,
      late: rows.filter(x => (x.billing?.late ?? 0) > 0).length, unread: rows.reduce((n, x) => n + x.unread, 0), mrr,
    },
  };
}

// ── Sessions de l'espace client ──────────────────────────────────────────────
interface Session { site: string; epoch: number; staff?: true }   // staff = Kouider entré depuis l'app
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

export async function sessionOf(token: string): Promise<{ site: ClientSite; staff: boolean } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const sess = JSON.parse((await kvGet(`fik:sess:${sha256(token)}`)) ?? 'null') as Session | null;
  if (!sess || sess.epoch !== await sessionEpoch(sess.site)) return null;
  const site = await getSite(sess.site);
  return site ? { site, staff: !!sess.staff } : null;
}

export async function sessionSite(token: string): Promise<ClientSite | null> {
  return (await sessionOf(token))?.site ?? null;
}

/** Kouider ouvre l'espace client sans le mot de passe du patron (session de 2 h, le patron n'est pas déconnecté).
 *  Le jeton passe dans le #fragment de l'adresse : il n'est jamais envoyé à Netlify ni gardé dans l'historique. */
export async function openAsStaff(s: ClientSite): Promise<string> {
  if ((s.adminV ?? 0) < ADMIN_VERSION) await publishSite(s);   // anciennes pages /admin/ : pas encore le mode staff
  const token = randomBytes(32).toString('hex');
  const sess: Session = { site: s.id, epoch: await sessionEpoch(s.id), staff: true };
  await kvSet(`fik:sess:${sha256(token)}`, JSON.stringify(sess), STAFF_HOURS * 3600);
  return `${s.url}/admin/#k=${token}`;
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
