/**
 * PROMOS AIR ALGÉRIE (27/11/2026) — Kouider : « je reçois une notif qu'il y a une promo mais je sais pas de quoi ;
 * Dzaryx connaît tout sur moi, il doit me dire quand il y a des promos et si ça me concerne ».
 * Sources (sans IA, 3×/jour) :
 *  1. airalgerie.dz « Offres et promotions » (éditions Algérie DZD, France EUR, International EUR) : nouveau trajet / prix en baisse ;
 *  2. bannières de la page d'accueil et page « Nouveautés et promotions » (rendues par r.jina.ai : le site se remplit en JavaScript) ;
 *  3. presse / web (2×/jour) : « Air Algérie promo ».
 * L'IA n'est appelée QUE s'il y a du nouveau : elle range chaque promo (quoi, pour qui, dates de réservation / de voyage, code)
 * et dit si elle le concerne (départ Lille / Bruxelles / Charleroi / Paris ↔ Oran ou Alger, sa famille, ses voyages prévus).
 * Pertinente → Telegram avec boutons (chercher mes dates / surveiller / pas intéressé). app_kv ah:promos:*.
 * Rien sur sa famille n'est écrit ici (profil privé lu dans app_kv kouider:travel:profile).
 */
import { kvJson, kvPut, ai, tg, jsonOf } from './ai-util.js';
import { localNow } from './morning-routine.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36' };
const EDITIONS: Array<[string, string]> = [['dz', 'https://airalgerie.dz'], ['fra', 'https://airalgerie.dz/fra'], ['int', 'https://airalgerie.dz/int']];
const OFFERS = 'ah:promos:offers', SEEN = 'ah:promos:seen', LIST = 'ah:promos:list', LASTWEB = 'ah:promos:lastweb';
const MY_CITIES = /lille|bruxelles|brussels|charleroi|paris|orly|cdg|roissy|lyon|marseille/i;   // départs possibles pour lui (Europe)
const MY_DEST = /oran|alger|algiers/i;
const PROMO_RX = /promo|promotion|r[ée]duction|remise|-\s?\d{1,2}\s?%|\d{1,2}\s?%|soldes?|offre sp[ée]ciale|tarif sp[ée]cial|black friday|flash|osra|famille|diaspora|[ée]tudiant|code promo|gratuit/i;

export interface Promo {
  id: string; title: string; what: string; who?: string; routes?: string; bookBy?: string | null; travel?: string | null; code?: string | null;
  url?: string | null; source: string; found: string; relevant: boolean; why: string; score: number; notified?: string | null; dismissed?: boolean;
}
interface Offer { ed: string; title: string; price: number; cur: string; url: string; seen: string }

const strip = (s: string) => s.replace(/&#8211;|&ndash;/g, '–').replace(/&amp;/g, '&').replace(/&#039;|&#8217;/g, "'").replace(/\s+/g, ' ').trim();
const hash = (s: string) => { let h = 0; for (const c of s.toLowerCase().replace(/\s+/g, ' ')) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

// ── 1. Offres du site ────────────────────────────────────────────────────────
export async function readOffers(): Promise<Offer[]> {
  const out: Offer[] = [];
  for (const [ed, base] of EDITIONS) {
    try {
      const r = await fetch(`${base}/decouvrir/offres-et-promotions/`, { headers: UA, signal: AbortSignal.timeout(25_000) });
      if (!r.ok) continue;
      const s = await r.text();
      for (const m of s.matchAll(/<a href="([^"]+\/offre\/[^"]+)" class="col-4 offer-item">[\s\S]*?offer-title">([^<]*)<\/div>[\s\S]*?offer-price">([^<]*)</g)) {
        const pm = m[3]!.match(/([\d\s.,]+)\s*([A-Z]{3})/);
        if (!pm) continue;
        out.push({ ed, title: strip(m[2]!), price: Number(pm[1]!.replace(/[\s.]/g, '').replace(',', '.')), cur: pm[2]!, url: m[1]!, seen: new Date().toISOString() });
      }
    } catch { /* site lent : on réessaiera */ }
  }
  return out;
}

// ── 2. Bannières (page d'accueil + Nouveautés et promotions) ─────────────────
async function rendered(url: string): Promise<string> {
  const { jinaAuthHeaders } = await import('./web-search-provider.js');
  const r = await fetch(`https://r.jina.ai/${url}`, { headers: { ...jinaAuthHeaders(), 'X-Return-Format': 'markdown' }, signal: AbortSignal.timeout(45_000) });
  return r.ok ? r.text() : '';
}
async function readBanners(): Promise<Array<{ text: string; url: string; source: string }>> {
  const out: Array<{ text: string; url: string; source: string }> = [];
  for (const url of ['https://airalgerie.dz/fra/', 'https://airalgerie.dz/', 'https://airalgerie.dz/air-algerie-plus/nouveautes-et-promotions/']) {
    const md = await rendered(url).catch(() => '');
    for (const line of md.split('\n')) {
      // titres de bannières / cartes : « #### [PROMO AFRICA](lien) », pas le menu ni le pied de page
      for (const m of line.matchAll(/#{1,4}\s*\[([^\]]{4,120})\]\((https?:[^)]+)\)/g)) {
        const t = strip(m[1]!);
        if (PROMO_RX.test(t) && !/^code promo$|^offres et promotions|^nouveaut[ée]s et promotions|^voir toutes/i.test(t)) out.push({ text: t, url: m[2]!, source: 'site Air Algérie' });
      }
    }
  }
  return out;
}

// ── 3. Presse / web ──────────────────────────────────────────────────────────
async function readNews(): Promise<Array<{ text: string; url: string; source: string }>> {
  const { multiProviderWebSearch } = await import('./web-search-provider.js');
  const now = localNow();
  const month = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][+now.date.slice(5, 7) - 1];
  const out: Array<{ text: string; url: string; source: string }> = [];
  for (const q of [`Air Algérie promotion billets ${month} ${now.date.slice(0, 4)}`, `Air Algérie promo Europe Oran ${now.date.slice(0, 4)}`]) {
    const r = await multiProviderWebSearch(q).catch(() => null);
    if (!r?.text) continue;
    // lignes « [titre](url) » ou « Title: … URL: … » : on garde les titres qui parlent d'une promo d'Air Algérie
    for (const m of r.text.matchAll(/\[([^\]]{15,200})\]\((https?:[^)\s]+)/g)) {
      const t = strip(m[1]!);
      if (/air\s?alg[ée]rie/i.test(t) && PROMO_RX.test(t) && !/youtube\.com\/shorts/.test(m[2]!)) out.push({ text: t, url: m[2]!, source: 'presse' });
    }
  }
  return out.slice(0, 15);
}

// ── Profil (sans rien écrire de privé dans le code) ──────────────────────────
async function profileText(): Promise<string> {
  const p = await kvJson<{ family?: Array<{ name: string; birth: string }>; min_stay_days?: number } | null>('kouider:travel:profile', null);
  const today = localNow().date;
  const ages = (p?.family ?? []).map(f => Math.floor((Date.parse(today) - Date.parse(f.birth)) / (365.25 * 86_400_000)));
  const comp = ages.length ? `${ages.filter(a => a >= 12).length} adulte(s), ${ages.filter(a => a >= 2 && a < 12).length} enfant(s), ${ages.filter(a => a < 2).length} bébé(s)` : 'lui, sa femme et leur fils';
  const { readTrips } = await import('./trips.js');
  const next = (await readTrips().catch(() => [])).filter(t => t.who === 'kouider' && t.departAt > Date.now()).map(t => `${t.title} le ${localNow(t.departAt, t.tz).date}`);
  return `Kouider habite en Belgique (près de Lille/Bruxelles), voyage vers ORAN (Alger accepté), TOUJOURS en famille (${comp}), séjour ${p?.min_stay_days ?? 14} jours minimum, Air Algérie VOL DIRECT, départ habituel Lille (LIL), aussi Bruxelles/Charleroi/Paris. `
    + `Voyages déjà prévus : ${next.join(' ; ') || 'aucun billet enregistré'}. Il a dit vouloir partir après le ramadan 2027 et pour l'Aïd ; il veut s'installer à Oran plus tard. Aujourd'hui : ${today}.`;
}

// ── Analyse IA des nouveautés ────────────────────────────────────────────────
async function analyse(items: Array<{ text: string; url: string; source: string }>): Promise<Promo[]> {
  if (!items.length) return [];
  // un titre seul ne dit rien (« PROMO AFRICA ») : on lit la page de chaque nouveauté avant de juger
  const detail = new Map<string, string>();
  for (const x of items.slice(0, 6)) {
    const md = await rendered(x.url).catch(() => '');
    const body = md.replace(/\(https?:[^)]+\)/g, '').split('\n').filter(l => l.trim() && !/^\s*\*\s+\[|^\s{2,}\*|EPE\/SPA|Conditions g[ée]n[ée]rales|cookies/i.test(l));
    const i = body.findIndex(l => l.toLowerCase().includes(x.text.toLowerCase().slice(0, 12)));
    detail.set(x.url, body.slice(Math.max(0, i), Math.max(0, i) + 40).join(' ').replace(/\s+/g, ' ').slice(0, 1200));
  }
  const prof = await profileText();
  const raw = await ai(
    `${prof}\n\nNouveautés trouvées sur Air Algérie :\n${items.map((x, i) => `${i + 1}. [${x.source}] ${x.text} — ${x.url}${detail.get(x.url) ? `\n   Contenu de la page : ${detail.get(x.url)}` : ''}`).join('\n')}\n\n`
    + `Range UNIQUEMENT les vraies PROMOS / offres de prix d'Air Algérie (ignore le reste : recrutement, ferries, autres compagnies, vieilles promos de plus de 2 mois). `
    + `N'invente rien : si une date ou un code n'est pas écrit, mets null. Pour chacune dis si elle concerne Kouider et pourquoi, en une phrase simple. relevant = true SEULEMENT si le contenu montre clairement un prix réduit sur un trajet qu'il peut prendre (Belgique / nord de la France / Paris ↔ Oran ou Alger) ou une réduction valable pour tous les vols / les familles ; si on ne sait pas ce que couvre la promo → relevant false et dis « on ne sait pas encore ce qu'elle couvre ». Les promos sur les miles ne comptent que s'il est membre Air Algérie Plus (on ne le sait pas → false). score 8-10 = vraie bonne affaire pour lui.\n`
    + `JSON : {"promos":[{"n":1,"title":"titre court","what":"ce que c'est en clair (ex. -30 % sur Europe ↔ Algérie)","who":"pour qui (tout le monde, femmes, familles, étudiants, membres Air Algérie Plus…)","routes":"trajets","bookBy":"AAAA-MM-JJ ou null","travel":"période de voyage ou null","code":"code promo ou null","relevant":true,"score":0-10,"why":"pourquoi ça le concerne ou pas"}]}`,
    { max: 1800 }).catch(() => '');
  const o = jsonOf<{ promos?: Array<Omit<Promo, 'id' | 'url' | 'source' | 'found'> & { n: number }> }>(raw);
  const nul = (v: unknown) => v == null || /^(null|none|n\/a|)$/i.test(String(v).trim()) ? null : String(v);
  return (o?.promos ?? []).map(p => {
    const src = items[(p.n ?? 1) - 1] ?? items[0]!;
    return { ...p, what: nul(p.what) ?? p.title, who: nul(p.who) ?? undefined, routes: nul(p.routes) ?? undefined, bookBy: /^\d{4}-\d{2}-\d{2}$/.test(String(p.bookBy)) ? p.bookBy : null,
      travel: nul(p.travel), code: nul(p.code), id: hash(`${p.title}|${src.url}`), url: src.url, source: src.source, found: new Date().toISOString(), relevant: !!p.relevant, score: Number(p.score) || 0, why: String(p.why ?? '') };
  });
}

async function notify(p: Promo): Promise<void> {
  const { createDecision } = await import('./conscience.js');
  const lines = [`✈️ PROMO AIR ALGÉRIE — ${p.title}`, `💡 ${p.what}`, p.who ? `👥 Pour : ${p.who}` : '', p.routes ? `🛫 ${p.routes}` : '',
    p.bookBy ? `⏳ Réserver avant le ${p.bookBy.slice(8, 10)}/${p.bookBy.slice(5, 7)}` : '', p.travel ? `📅 Voyages : ${p.travel}` : '', p.code ? `🏷 Code : ${p.code}` : '',
    `👉 Pour toi : ${p.why}`, p.url ? `🔗 ${p.url}` : ''].filter(Boolean);
  await createDecision(lines.join('\n'), [
    { label: '🔎 Cherche-moi le prix', say: `cherche-moi le prix Air Algérie avec cette promo (${p.title}) pour toute la famille, Lille → Oran, sur la période de la promo` },
    { label: '👀 Surveille le prix', say: `surveille le prix Air Algérie Lille → Oran pour la famille pendant 1 semaine (promo ${p.title})` },
    { label: '🙅 Pas intéressé', tool: 'promos_air_algerie', input: { action: 'dismiss', id: p.id } },
  ]);
}

// ── Job (8h, 13h, 18h) ───────────────────────────────────────────────────────
export async function jobAhPromos(force = false): Promise<string> {
  const now = localNow();
  const seen = new Set(await kvJson<string[]>(SEEN, []));
  const fresh: Array<{ text: string; url: string; source: string }> = [];
  // 1. Offres : nouveau trajet ou baisse ≥ 5 %
  const before = await kvJson<Record<string, Offer>>(OFFERS, {});
  const offers = await readOffers();
  const drops: string[] = [];
  if (offers.length) {
    const map: Record<string, Offer> = {};
    for (const o of offers) {
      const k = `${o.ed}|${o.title}`; map[k] = o;
      const b = before[k];
      const mine = (MY_CITIES.test(o.title) && MY_DEST.test(o.title) || /oran/i.test(o.title) && o.cur === 'EUR') && !(o.ed === 'int' && map[`fra|${o.title}`]);
      if (Object.keys(before).length && !b && mine) fresh.push({ text: `Nouvelle offre ${o.title} à partir de ${o.price} ${o.cur}`, url: o.url, source: 'offres du site' });
      if (b && o.price < b.price * 0.95 && mine) drops.push(`📉 ${o.title} : ${b.price} → ${o.price} ${o.cur} (à partir de)`);
    }
    await kvPut(OFFERS, map);
  }
  // 2 + 3. Bannières (3×/jour) et presse (2×/jour)
  for (const b of await readBanners().catch(() => [])) if (!seen.has(hash(b.text))) fresh.push(b);
  const lastWeb = await kvJson<string>(LASTWEB, '');
  if (force || lastWeb !== `${now.date}:${now.hhmm < '12:00' ? 'am' : 'pm'}`) {
    await kvPut(LASTWEB, `${now.date}:${now.hhmm < '12:00' ? 'am' : 'pm'}`);
    for (const n of await readNews().catch(() => [])) if (!seen.has(hash(n.text))) fresh.push(n);
  }
  const uniq = fresh.filter((x, i) => fresh.findIndex(y => hash(y.text) === hash(x.text)) === i).slice(0, 12);
  for (const x of uniq) seen.add(hash(x.text));
  await kvPut(SEEN, [...seen].slice(-500));
  // première passe : on mémorise ce qui existe déjà sans rien envoyer (sinon 20 vieilles promos d'un coup)
  const firstRun = !(await kvJson<boolean>('ah:promos:init', false));
  if (firstRun) await kvPut('ah:promos:init', true);
  const found = await analyse(uniq);
  const list = await kvJson<Promo[]>(LIST, []);
  let sent = 0;
  for (const p of found) {
    if (list.some(x => x.id === p.id || x.title.toLowerCase() === p.title.toLowerCase())) continue;
    list.push(p);
    if (!firstRun && p.relevant && p.score >= 6 && now.hhmm >= '08:00' && now.hhmm < '21:30' && sent < 2) { await notify(p).catch(() => {}); p.notified = new Date().toISOString(); sent++; }
  }
  await kvPut(LIST, list.filter(p => Date.now() - Date.parse(p.found) < 90 * 86_400_000).slice(-60));
  if (drops.length && !firstRun) await tg(`✈️ Air Algérie — prix « à partir de » en baisse sur le site :\n${drops.join('\n')}\n\nDis « cherche-moi le prix pour la famille » pour avoir le vrai total avec bagages.`);
  return `offres ${offers.length}, nouveautés ${uniq.length}, promos ${found.length}, envoyées ${sent}${drops.length ? `, baisses ${drops.length}` : ''}${firstRun ? ' (1re passe, rien envoyé)' : ''}`;
}

/** Promos encore valables qui le concernent (carte À faire, message du matin). */
export async function activePromos(): Promise<Promo[]> {
  const today = localNow().date;
  return (await kvJson<Promo[]>(LIST, [])).filter(p => p.relevant && !p.dismissed && (!p.bookBy || p.bookBy >= today) && Date.now() - Date.parse(p.found) < 30 * 86_400_000)
    .sort((a, b) => b.score - a.score);
}

// ── Outil du cerveau ─────────────────────────────────────────────────────────
export async function ahPromosTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'list');
  if (a === 'dismiss') {
    const list = await kvJson<Promo[]>(LIST, []); const p = list.find(x => x.id === input['id']);
    if (p) { p.dismissed = true; await kvPut(LIST, list); }
    return '👍 Noté, je ne t\'en reparle plus.';
  }
  if (a === 'check') return `🔎 Vérifié maintenant : ${await jobAhPromos(true)}.\n\n${await ahPromosTool({ action: 'list' })}`;
  if (a === 'explain') {
    // il colle / dicte le texte de la notif (ou ce qu'on lit sur sa capture)
    const text = String(input['text'] ?? '').trim();
    const { multiProviderWebSearch } = await import('./web-search-provider.js');
    const web = text ? (await multiProviderWebSearch(`Air Algérie ${text.slice(0, 120)}`).catch(() => null))?.text ?? '' : '';
    const known = (await kvJson<Promo[]>(LIST, [])).slice(-15).map(p => `- ${p.title} : ${p.what}${p.bookBy ? ` (réserver avant ${p.bookBy})` : ''}${p.code ? ` code ${p.code}` : ''} ${p.url ?? ''}`).join('\n');
    const out = await ai(`${await profileText()}\n\nKouider a reçu une notification Air Algérie : « ${text || '(pas de texte, juste « il y a une promo »)'} ».\nPromos déjà repérées :\n${known || '—'}\n\nRecherche web :\n${web.slice(0, 3500)}\n\n`
      + `Explique-lui en 4-6 lignes simples, sans inventer : de quelle promo il s'agit (si on la trouve), ce qu'elle donne, pour qui, jusqu'à quand, le code s'il y en a un, et si ça vaut le coup POUR LUI (famille, Lille/Bruxelles → Oran). Si on ne la trouve pas, dis-le franchement et propose de chercher le prix réel Air Algérie pour ses dates (Air Algérie SEULEMENT, jamais une autre compagnie). Tutoie-le.`, { max: 700 }).catch(() => '');
    return out || '❌ Je n\'ai pas pu vérifier cette promo maintenant. Envoie-moi une capture de la notif, ou dis « cherche-moi le prix pour la famille ».';
  }
  const act = await activePromos();
  const all = (await kvJson<Promo[]>(LIST, [])).filter(p => !p.dismissed).slice(-8).reverse();
  const offers = Object.values(await kvJson<Record<string, Offer>>(OFFERS, {})).filter((o, i, l) => o.cur === 'EUR' && (MY_CITIES.test(o.title) || /oran/i.test(o.title)) && l.findIndex(x => x.title === o.title && x.cur === o.cur) === i);
  return [
    act.length ? `✈️ Promos Air Algérie pour toi :\n${act.map(p => `• ${p.title} — ${p.what}${p.bookBy ? ` (réserver avant le ${p.bookBy.slice(8, 10)}/${p.bookBy.slice(5, 7)})` : ''}${p.code ? ` · code ${p.code}` : ''}\n  ${p.why}`).join('\n')}` : '✈️ Aucune promo Air Algérie qui te concerne en ce moment.',
    all.filter(p => !p.relevant).length ? `Autres promos vues (pas pour toi) : ${all.filter(p => !p.relevant).map(p => p.title).join(' · ')}` : '',
    offers.length ? `Prix « à partir de » sur le site (aller simple, 1 adulte) : ${offers.map(o => `${o.title} ${o.price} €`).join(' · ')}` : '',
  ].filter(Boolean).join('\n\n');
}
