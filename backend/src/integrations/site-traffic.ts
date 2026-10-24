import { supabase } from './supabase.js';
import { runSql } from './app-store.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// Visites du site fikconciergerie.com, triées : vrais visiteurs / nous (équipe, Dzaryx, PC cloud) / robots (20/10/2026).
// Le tri est fait par le site (pages/api/track.js du repo autolux-location) dans la colonne page_views.visitor.
// Bilan envoyé chaque soir à 21h + ligne du brief du matin.

const COLUMNS_SQL = `ALTER TABLE page_views ADD COLUMN IF NOT EXISTS visitor TEXT,
  ADD COLUMN IF NOT EXISTS ip_hash TEXT, ADD COLUMN IF NOT EXISTS ua TEXT;`;

export async function ensureTrafficColumns(): Promise<void> {
  const { error } = await supabase.from('page_views').select('visitor, ip_hash, ua').limit(1);
  if (error && await runSql(COLUMNS_SQL)) console.log('[site-traffic] ✅ colonnes visitor / ip_hash / ua créées');
}

interface View { page: string | null; session_id: string | null; visitor: string | null; ip_hash: string | null;
  country: string | null; referrer: string | null; created_at: string }

export interface DayTraffic {
  visitors: number; pages: number; fromMails: number; us: number; robots: number; unknown: number;
  topPages: Array<[string, number]>; countries: Array<[string, number]>; sources: Array<[string, number]>;
}

/** Début du jour à Alger (UTC+1, pas d'heure d'été), décalé de `offsetDays`. */
function algiersDayStart(offsetDays = 0): number {
  const d = new Date(Date.now() + 3600_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offsetDays) - 3600_000;
}

const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

function sourceOf(referrer: string | null, page: string | null): string {
  if (page && /[?&]ref=/.test(page)) return 'mail de démarchage';
  if (!referrer) return 'direct';
  const host = (() => { try { return new URL(referrer).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  if (!host || /fikconciergerie\.com|autolux-location/.test(host)) return 'direct';
  if (/google\./.test(host)) return 'Google';
  if (/facebook|instagram|fb\.|t\.co|twitter|x\.com|tiktok|linkedin|snapchat/.test(host)) return 'réseaux sociaux';
  if (/whatsapp|wa\.me|telegram|t\.me/.test(host)) return 'WhatsApp / Telegram';
  if (/bing|yahoo|duckduckgo|qwant|ecosia/.test(host)) return 'autre moteur';
  return host;
}

/** Visites d'un jour (0 = aujourd'hui, -1 = hier), heure d'Alger. */
export async function dayTraffic(offsetDays = 0): Promise<DayTraffic> {
  const from = new Date(algiersDayStart(offsetDays)).toISOString(), to = new Date(algiersDayStart(offsetDays + 1)).toISOString();
  let { data, error } = await supabase.from('page_views').select('page, session_id, visitor, ip_hash, country, referrer, created_at')
    .gte('created_at', from).lt('created_at', to).order('created_at').limit(5000);
  if (error) {   // colonnes pas encore créées : tout passe en « avant le tri »
    ({ data } = await supabase.from('page_views').select('page, session_id, country, referrer, created_at')
      .gte('created_at', from).lt('created_at', to).order('created_at').limit(5000) as unknown as { data: View[] | null; error: null });
  }
  const views = (data ?? []) as View[];
  // Un autre appareil sur la même connexion qu'un appareil « nous » ce jour-là (ex. le téléphone de Kouider sur le wifi) = nous
  const ourIps = new Set(views.filter(v => v.visitor === 'nous' && v.ip_hash).map(v => v.ip_hash!));
  const kind = (v: View) => v.visitor === 'visiteur' && v.ip_hash && ourIps.has(v.ip_hash) ? 'nous' : v.visitor ?? 'inconnu';

  const sessions = { visiteur: new Set<string>(), nous: new Set<string>(), robot: new Set<string>(), inconnu: new Set<string>() } as Record<string, Set<string>>;
  const mails = new Set<string>(), seen = new Set<string>();
  const pages = new Map<string, number>(), countries = new Map<string, number>(), sources = new Map<string, number>();
  let pageCount = 0;
  for (const v of views) {
    const k = kind(v), sid = v.session_id ?? v.ip_hash ?? v.created_at;
    (sessions[k] ?? sessions.inconnu).add(sid);
    if (k !== 'visiteur') continue;
    pageCount++;
    bump(pages, (v.page ?? '/').split('?')[0] || '/');
    if (v.page && /[?&]ref=/.test(v.page)) mails.add(sid);
    if (seen.has(sid)) continue;   // pays et provenance : une fois par visiteur, sur sa 1re page
    seen.add(sid);
    if (v.country) bump(countries, v.country);
    bump(sources, sourceOf(v.referrer, v.page));
  }
  return {
    visitors: sessions.visiteur.size, pages: pageCount, fromMails: mails.size,
    us: sessions.nous.size, robots: sessions.robot.size, unknown: sessions.inconnu.size,
    topPages: top(pages, 5), countries: top(countries, 4), sources: top(sources, 4),
  };
}

const list = (a: Array<[string, number]>) => a.map(([k, n]) => `${k} ${n}`).join(', ');

/** Texte du bilan (utilisé par le message de 21h, le brief du matin et l'outil stats du site). */
export function formatTraffic(t: DayTraffic, label: string): string {
  const lines = [
    `🌐 Site fikconciergerie.com — ${label}`,
    `👤 Vrais visiteurs : ${t.visitors}${t.visitors ? ` (${t.pages} pages vues)` : ''}${t.fromMails ? `, dont ${t.fromMails} venu${t.fromMails > 1 ? 's' : ''} d'un mail de démarchage` : ''}`,
    `🏠 Nous (toi, l'équipe, Dzaryx) : ${t.us}`,
    `🤖 Robots (Google, aperçus de liens…) : ${t.robots}`,
  ];
  if (t.unknown) lines.push(`❔ Avant la mise en place du tri : ${t.unknown}`);
  if (t.topPages.length) lines.push(`📄 Pages les plus vues : ${list(t.topPages)}`);
  if (t.sources.length) lines.push(`🔗 Arrivés par : ${list(t.sources)}`);
  if (t.countries.length) lines.push(`📍 Pays : ${list(t.countries)}`);
  return lines.join('\n');
}

/** Ligne courte pour le brief du matin. */
export function trafficBriefLine(t: DayTraffic): string {
  return `${t.visitors} vrais visiteurs (${t.pages} pages vues${t.fromMails ? `, ${t.fromMails} via les mails de démarchage` : ''}) ; ` +
    `sans compter nous (${t.us}) ni les robots (${t.robots})${t.unknown ? ` ; ${t.unknown} visites d'avant le tri (on ne sait pas qui)` : ''}${t.topPages.length ? ` ; pages : ${list(t.topPages.slice(0, 3))}` : ''}`;
}

/** 21h : bilan du jour sur Telegram + app. */
export async function jobSiteTraffic(): Promise<void> {
  const { gscSection } = await import('./search-console.js');
  const text = formatTraffic(await dayTraffic(0), "aujourd'hui") + await gscSection().catch(() => '');
  await queueTelegramMessage(text);
  emitProactive(text, 'info', undefined, 'kouider');
}
