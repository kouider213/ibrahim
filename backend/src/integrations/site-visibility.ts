import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropic, QUALITY } from './anthropic-compat.js';
import { readIndex, getSite, saveSite, publicUrl, type ClientSite } from './client-sites.js';
import { sendEmail } from './gmail.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';

// « Pack visibilité » FIK Sites (option payante en plus de l'abonnement) : chaque mardi, Dzaryx écrit pour le
// commerçant UN post Google (fiche Google Business) + UNE légende Instagram/Facebook avec hashtags et l'idée de photo,
// à partir du vrai contenu de son site (carte, prix, points forts) et de la saison. Envoyé par mail au patron, prêt à
// copier-coller (on n'a pas accès à ses comptes). Les 6 derniers sujets sont gardés pour ne pas se répéter.

const ai = createAnthropic();
const MODEL = 'claude-sonnet-5-5';

export interface Visibility { monthly: number; since: string; history: string[]; lastAt?: string }
export interface WeeklyPost { theme: string; google: string; instagram: string; hashtags: string; photo: string }

const ownerEmail = (s: ClientSite) => s.notify?.email ?? s.account?.email ?? null;

export async function writeWeeklyPost(s: ClientSite & { visibility?: Visibility }): Promise<WeeklyPost> {
  const offers = s.content.offer.flatMap(g => g.items.map(i => `${g.group} — ${i.name}${i.price ? ` (${i.price})` : ''}`)).slice(0, 40);
  const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Algiers', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const user = [
    `Commerce : ${s.name} (${s.content.kind}) — ${s.place.address}`,
    `Accroche du site : ${s.content.tagline}`,
    `Points forts : ${s.content.highlights.join(' ; ')}`,
    `Offre / carte (vraie, ne rien inventer d'autre) :\n${offers.join('\n') || '(non détaillée)'}`,
    s.place.hours.length ? `Horaires : ${s.place.hours.join(' ; ')}` : '',
    `Site : ${publicUrl(s)}`,
    `Nous sommes le ${date}.`,
    s.visibility?.history.length ? `Sujets déjà faits les semaines passées (à NE PAS refaire) : ${s.visibility.history.join(' | ')}` : '',
  ].filter(Boolean).join('\n');
  const r = await ai.messages.create({
    model: MODEL, max_tokens: 900,
    system: `Tu écris le post de la semaine d'un petit commerce, à publier par le patron lui-même. Choisis UN sujet concret et nouveau ` +
      `(un plat ou produit précis de sa carte, la saison ou une fête qui arrive, un point fort, les horaires, un avis client…). ` +
      `N'invente AUCUN prix, promotion ou produit absent des infos. Ton chaleureux, simple, local. Langue : français ` +
      `(si le commerce est en Algérie, ajoute une courte phrase en arabe à la fin de la légende Instagram). ` +
      `Réponds UNIQUEMENT en JSON : {"theme":"sujet en 4 mots","google":"post fiche Google, 60-90 mots, finit par une invitation à venir/appeler",` +
      `"instagram":"légende Instagram/Facebook, 2-4 phrases avec 2-3 emojis","hashtags":"6 à 10 hashtags locaux","photo":"quelle photo prendre pour ce post, 1 phrase"}`,
    messages: [{ role: 'user', content: user }],
  }, QUALITY);
  const raw = r.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  const p = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as WeeklyPost;
  if (!p.google || !p.instagram) throw new Error('post vide');
  return p;
}

function postMail(s: ClientSite, p: WeeklyPost): { subject: string; body: string } {
  return {
    subject: `📣 Votre post de la semaine — ${s.name}`,
    body: `Bonjour,\n\nVoici votre post de la semaine (pack visibilité FIK Sites). Il suffit de copier-coller :\n\n` +
      `━━ 1. Fiche Google (Google Maps) ━━\nOuvrez Google Maps → votre fiche → « Ajouter une mise à jour », collez :\n\n${p.google}\n\n` +
      `━━ 2. Instagram / Facebook ━━\n${p.instagram}\n\n${p.hashtags}\n\n` +
      `📸 Photo conseillée : ${p.photo}\n\n` +
      `Publier chaque semaine fait remonter votre commerce sur Google et rappelle aux clients de revenir.\n` +
      `Votre site : ${publicUrl(s)}\n\nKouider — FIK Sites`,
  };
}

/** Écrit (et envoie si send) le post de la semaine d'un site. */
export async function visibilityPost(s: ClientSite & { visibility?: Visibility }, send: boolean): Promise<string> {
  const p = await writeWeeklyPost(s);
  const to = ownerEmail(s);
  let sent = false;
  if (send && to) {
    await sendEmail('pro', { to, fromName: 'Kouider - FIK Sites', ...postMail(s, p) });
    sent = true;
    if (s.visibility) {
      s.visibility.history = [p.theme, ...s.visibility.history].slice(0, 6);
      s.visibility.lastAt = new Date().toISOString();
      await saveSite(s);
    }
  }
  return `📣 Post de la semaine — « ${s.name} » (${p.theme})${sent ? ` ✅ envoyé à ${to}` : send ? ' ❌ pas d\'e-mail du patron' : ' (aperçu, pas envoyé)'}\n\n` +
    `Google : ${p.google}\n\nInstagram : ${p.instagram}\n${p.hashtags}\n\n📸 ${p.photo}`;
}

/** Action manage_client_site visibility : on (visibility_monthly) / off. Le prix s'ajoute à l'abonnement. */
export async function setVisibility(s: ClientSite & { visibility?: Visibility }, on: boolean, monthlyIn: unknown): Promise<string> {
  if (!on) {
    if (!s.visibility) return `Le pack visibilité n'est pas actif pour « ${s.name} ».`;
    if (s.billing) s.billing.monthly = Math.max(0, s.billing.monthly - s.visibility.monthly);
    delete s.visibility;
    await saveSite(s);
    return `⏹️ Pack visibilité arrêté pour « ${s.name} »${s.billing ? ` (abonnement : ${s.billing.monthly} ${s.billing.currency}/mois)` : ''}.`;
  }
  const monthly = Number(monthlyIn);
  if (!(monthly >= 0) || monthlyIn == null || monthlyIn === '') return '❌ Donne-moi le prix du pack par mois (visibility_monthly), par exemple 1500 (DA).';
  if (!ownerEmail(s)) return `❌ « ${s.name} » n'a pas d'e-mail de patron : crée d'abord son espace client (action=account, client_email).`;
  if (s.billing) s.billing.monthly += monthly - (s.visibility?.monthly ?? 0);
  s.visibility = { monthly, since: new Date().toISOString().slice(0, 10), history: s.visibility?.history ?? [] };
  await saveSite(s);
  return `📣 Pack visibilité ACTIF pour « ${s.name} » : ${monthly}/mois${s.billing ? `, ajouté à l'abonnement → ${s.billing.monthly} ${s.billing.currency}/mois` : ' (pas encore d\'abonnement : règle-le avec action=billing)'}.\n` +
    `Chaque mardi à 9h, le patron reçoit par mail son post Google + Instagram prêt à copier-coller. Pour un aperçu tout de suite : action=visibility_post.`;
}

/** Mardi 9h : post de la semaine pour chaque site en ligne avec le pack. */
export async function jobVisibilityWeekly(): Promise<string> {
  const done: string[] = [], failed: string[] = [];
  for (const row of await readIndex()) {
    const s = await getSite(row.id) as (ClientSite & { visibility?: Visibility }) | null;
    if (!s?.visibility || s.status !== 'live') continue;
    if (s.visibility.lastAt && Date.now() - Date.parse(s.visibility.lastAt) < 5 * 86_400_000) continue;  // déjà fait cette semaine
    try { await visibilityPost(s, true); done.push(s.name); }
    catch (e) { failed.push(`${s.name} (${e instanceof Error ? e.message : e})`); }
  }
  if (!done.length && !failed.length) return 'aucun site avec le pack';
  const msg = `📣 Pack visibilité : post de la semaine envoyé à ${done.length} client(s)${done.length ? ` (${done.join(', ')})` : ''}.${failed.length ? `\n❌ Échec : ${failed.join(' ; ')}` : ''}`;
  await queueTelegramMessage(msg).catch(() => {});
  emitProactive(msg.split('\n')[0]!, failed.length ? 'alert' : 'info', msg, 'kouider');
  return msg;
}
