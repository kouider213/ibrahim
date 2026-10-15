import axios from 'axios';
import { createHash } from 'crypto';
import { redis } from '../queue/queue.js';
import { readIndex, getSite, listMessages, publicUrl, adminUrl, type ClientSite } from './client-sites.js';
import { sendEmail } from './gmail.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// Statistiques des vrais sites FIK Sites + BILAN MENSUEL envoyé au patron le 1er du mois (15/10/2026).
// But : le commerçant voit ce que son site lui rapporte → il garde son abonnement. Kouider reçoit le résumé de tous
// les sites avec une idée de vente par site (nom de domaine, avis Google, plus de visibilité).

export type HitEvent = 'visit' | 'call' | 'route' | 'whatsapp';
const EVENTS: HitEvent[] = ['visit', 'call', 'route', 'whatsapp'];
const statsKey = (id: string, ym: string, e: HitEvent) => `fiksite:stats:${id}:${ym}:${e}`;
const ymOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit' }).format(d);
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

let known: { ids: Set<string>; at: number } = { ids: new Set(), at: 0 };
async function siteExists(id: string): Promise<boolean> {
  if (Date.now() - known.at > 5 * 60_000) known = { ids: new Set((await readIndex()).map(r => r.id)), at: Date.now() };
  return known.ids.has(id);
}

/** Clic ou visite envoyé par la page du site (sans cookie). Une visite comptée par appareil et par jour. */
export async function recordHit(siteId: string, e: string, ip: string): Promise<void> {
  if (!EVENTS.includes(e as HitEvent) || !/^[a-z0-9-]{2,80}$/.test(siteId) || !(await siteExists(siteId))) return;
  const day = new Date().toISOString().slice(0, 10);
  const who = createHash('sha256').update(`${ip}|${siteId}|${day}|${e}`).digest('hex').slice(0, 16);
  if ((await redis.set(`fikhit:${who}`, '1', 'EX', 86_400, 'NX')) !== 'OK') return;   // même appareil, même jour
  const key = statsKey(siteId, ymOf(new Date()), e as HitEvent);
  await redis.incr(key);
  await redis.expire(key, 400 * 86_400);
}

export interface MonthStats { visit: number; call: number; route: number; whatsapp: number; table: number; rdv: number; contact: number }
export async function monthStats(s: ClientSite, ym: string): Promise<MonthStats> {
  const h: Record<string, string | null> = {};
  for (const e of EVENTS) h[e] = await redis.get(statsKey(s.id, ym, e)).catch(() => null);
  const msgs = (await listMessages(s.id)).filter(m => ymOf(new Date(m.at)) === ym);
  return {
    visit: Number(h['visit'] ?? 0), call: Number(h['call'] ?? 0), route: Number(h['route'] ?? 0), whatsapp: Number(h['whatsapp'] ?? 0),
    table: msgs.filter(m => m.mode === 'table').length, rdv: msgs.filter(m => m.mode === 'rdv').length, contact: msgs.filter(m => m.mode === 'contact').length,
  };
}

/** Note Google actuelle (sinon celle gardée à la création). */
async function googleRating(s: ClientSite): Promise<{ rating?: number; total?: number }> {
  const key = process.env['GOOGLE_PLACES_API_KEY'] ?? process.env['GOOGLE_MAPS_API_KEY'];
  if (key && s.place.place_id) {
    try {
      const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', { timeout: 10_000,
        params: { place_id: s.place.place_id, fields: 'rating,user_ratings_total', key } });
      if (data?.result?.rating) return { rating: data.result.rating, total: data.result.user_ratings_total };
    } catch { /* note gardée */ }
  }
  return { rating: s.place.rating, total: s.place.ratingsTotal };
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

/** Idée de vente pour Kouider (règles simples, pas d'IA = gratuit). */
function upsell(s: ClientSite, st: MonthStats, rating?: number): string {
  const leads = st.table + st.rdv + st.contact + st.call;
  if (s.domain?.status !== 'active' && st.visit >= 30) return `propose-lui son propre nom de domaine (${st.visit} visites : le site marche)`;
  if (rating !== undefined && rating < 4.3) return `propose une campagne d'avis Google (note ${rating})`;
  if (leads >= 10) return `${leads} contacts via le site : bon moment pour proposer 12 mois payés d'avance (avec un mois offert)`;
  if (st.visit < 20) return 'peu de visites : conseille-lui de mettre le lien du site sur sa fiche Google et ses réseaux';
  return '';
}

function ownerMail(s: ClientSite, ym: string, st: MonthStats, prev: MonthStats | null, r: { rating?: number; total?: number }): { subject: string; body: string } {
  const since = s.statsSince && s.statsSince.slice(0, 7) === ym ? ` (comptage depuis le ${new Date(`${s.statsSince}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })})` : '';
  const evo = prev ? pct(st.visit, prev.visit) : null;
  const lines = [
    `• ${st.visit} visite(s) de votre site${since}${evo !== null && Math.abs(evo) >= 5 ? ` — ${evo > 0 ? '+' : ''}${evo} % par rapport au mois précédent` : ''}`,
    st.call ? `• ${st.call} personne(s) ont appuyé sur « Appeler »` : '',
    st.route ? `• ${st.route} demande(s) d'itinéraire vers chez vous` : '',
    st.whatsapp ? `• ${st.whatsapp} clic(s) vers WhatsApp` : '',
    st.table ? `• ${st.table} réservation(s) reçue(s) par le site` : '',
    st.rdv ? `• ${st.rdv} demande(s) de rendez-vous reçue(s) par le site` : '',
    st.contact ? `• ${st.contact} message(s) reçu(s) par le site` : '',
    r.rating ? `• Note Google : ${r.rating}/5${r.total ? ` (${r.total} avis)` : ''}` : '',
  ].filter(Boolean);
  return {
    subject: `${s.place.name} — le bilan de votre site (${monthName(ym)})`,
    body: `Bonjour,\n\nVoici le bilan de votre site ${publicUrl(s)} pour ${monthName(ym)} :\n\n${lines.join('\n')}\n\n` +
      `Besoin de changer vos horaires, vos prix ou vos photos ? Faites-le vous-même ici : ${adminUrl(s)}\n` +
      `ou répondez simplement à ce mail.\n\nBon mois à vous,\nKouider — FIK Sites`,
  };
}

/** Bilan d'un site (envoi au patron si `send`). */
export async function siteReport(s: ClientSite, ym: string, send: boolean): Promise<{ line: string; sent: boolean }> {
  const prevYm = ymOf(new Date(new Date(`${ym}-15T12:00:00Z`).getTime() - 30 * 86_400_000));
  const [st, prev, r] = await Promise.all([monthStats(s, ym), monthStats(s, prevYm), googleRating(s)]);
  const to = s.notify?.email ?? s.account?.email;
  let sent = false;
  if (send && to && s.status === 'live') {
    const m = ownerMail(s, ym, st, prev.visit ? prev : null, r);
    await sendEmail('pro', { to, subject: m.subject, body: m.body, fromName: 'Kouider - FIK Sites' });
    sent = true;
  }
  const idea = upsell(s, st, r.rating);
  const line = `• ${s.name} : ${st.visit} visites, ${st.call} appels, ${st.route} itinéraires, ${st.table + st.rdv + st.contact} demandes` +
    `${r.rating ? `, ⭐ ${r.rating}` : ''}${sent ? ' — bilan envoyé ✉️' : to ? '' : ' — pas d\'e-mail du patron'}${idea ? `\n   💡 ${idea}` : ''}`;
  return { line, sent };
}

/** Job du 1er du mois : bilan du mois précédent à chaque patron + résumé à Kouider. */
export async function jobClientSitesMonthly(): Promise<string> {
  const ym = ymOf(new Date(Date.now() - 5 * 86_400_000));   // le 1er → mois précédent
  const lines: string[] = [];
  let sent = 0;
  for (const row of await readIndex()) {
    const s = await getSite(row.id);
    if (!s || s.status !== 'live') continue;
    try {
      const r = await siteReport(s, ym, true);
      lines.push(r.line);
      if (r.sent) sent++;
    } catch (err) { lines.push(`• ${s.name} : ⚠️ bilan non envoyé (${err instanceof Error ? err.message.slice(0, 80) : 'erreur'})`); }
  }
  if (!lines.length) return 'aucun site en ligne';
  const msg = `📊 Sites clients — bilan de ${monthName(ym)} (${sent} patron(s) ont reçu leur bilan par mail) :\n${lines.join('\n')}`;
  emitProactive(`Bilan mensuel des sites clients envoyé (${sent}).`, 'info', msg, 'kouider', 'sites');
  await queueTelegramMessage(msg).catch(() => {});
  return `${sent} bilan(s) envoyé(s)`;
}

export const currentYm = () => ymOf(new Date());
export const previousYm = () => ymOf(new Date(new Date().setUTCDate(1) - 86_400_000));
