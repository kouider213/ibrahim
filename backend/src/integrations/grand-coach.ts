import { kvJson, kvPut, ai, tg } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { supabase } from './supabase.js';
import { SAGES, BOOKS, STATUT_STEPS, type Sage } from './grand-coach-sages.js';

// LE GRAND COACH (Kouider 31/10 : « je veux devenir un grand businessman en Algérie, indépendant, bon statut, bien
// financièrement » + « 10 options business utiles tous les jours » + « 10 options coach de vie » + « un texte de
// motivation chaque jour et me suivre toute la journée »). Nourri par la vie des grands (grand-coach-sages.ts).
//
// BUSINESS (chaque jour) : B1 tableau du patron · B2 rythme du mois · B3 rentabilité par voiture · B4 les 3 actions qui
// rapportent · B5 réveil des anciens clients · B6 répartition de l'argent encaissé · B7 délégation (ton heure vaut…) ·
// B8 statut & indépendance en Algérie · B9 revue du patron du vendredi · B10 trésorerie 30 jours.
// COACH DE VIE : L1 texte du matin (un grand + ta journée) · L2 suivi midi + soir · L3 « que ferait X à ma place ? » ·
// L4 livre du mois · L5 défi de la semaine · L6 cercle d'or (réseau en Algérie) · L7 examen du soir (Franklin) ·
// L8 vision 10 ans → 1 an → ce mois · L9 mode tempête · L10 équilibre des 4 piliers.
// N'existe PAS déjà ailleurs : motivation au réveil (morning-routine), mentor 11h30 (business-mentor), votes 21h et
// revue du dimanche (life-plus), conseil des sages / décisions (jarvis3/4), radar concurrence, commercial.

type Row = Record<string, unknown>;
const S = (v: unknown) => String(v ?? '');
const N = (v: unknown) => Number(v ?? 0) || 0;
const d10 = (v: unknown) => S(v).slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const fmtD = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const K = {
  big3: (d: string) => `gc:big3:${d}`, streak: 'gc:streak', used: 'gc:used', defi: 'gc:defi', cercle: 'gc:cercle', examen: 'gc:examen',
  vision: 'gc:vision', statut: 'gc:statut', split: 'gc:split', settings: 'gc:settings', book: 'gc:book', text: (d: string) => `gc:text:${d}`,
};
interface Big3 { date: string; items: Array<{ text: string; done?: boolean; carried?: number }> }
interface Defi { week: string; text: string; days: Record<string, boolean> }
interface Person { name: string; role: string; why?: string; last?: string; every: number }
interface Settings { on: boolean; hoursWeek: number; monthTarget?: number }

async function settings(): Promise<Settings> { return { on: true, hoursWeek: 15, ...(await kvJson<Partial<Settings>>(K.settings, {})) }; }
async function dayOff(): Promise<boolean> { return import('./kouider-dossier.js').then(m => m.isDayOff()).catch(() => false); }
/** Congé seulement à partir d'une heure (jeudi : librairie le matin, congé business dès 13h — Kouider 05/11). */
async function offFrom(): Promise<string | null> { return import('./kouider-dossier.js').then(m => m.dayOffFrom()).catch(() => null); }

// ── Données réelles ──────────────────────────────────────────────────────────

async function data(): Promise<{ books: Row[]; cars: Array<{ id: string; name: string; available?: boolean }>; costs: Row[] }> {
  const since = addDays(localNow().date, -400);
  const [{ data: b }, { data: c }, { data: x }] = await Promise.all([
    supabase.from('bookings').select('id, car_id, client_name, client_phone, client_lang, start_date, end_date, status, final_price, total_price, profit, profit_kouider, owner_total, amount_remaining, payment_status, last_payment_date, last_payment_amount, created_at, nb_days, rented_by').gte('end_date', since),
    supabase.from('cars').select('id, name, available'),
    supabase.from('cash_entries').select('kind, category, amount, entry_date, car_id').eq('kind', 'expense').gte('entry_date', addDays(localNow().date, -120)),
  ]);
  return { books: ((b ?? []) as Row[]).filter(r => !/REJECT|CANCEL/i.test(S(r['status']))), cars: (c ?? []) as Array<{ id: string; name: string }>, costs: (x ?? []) as Row[] };
}
const price = (b: Row) => N(b['final_price'] ?? b['total_price']);
const profitOf = (b: Row) => N(b['profit_kouider'] ?? b['profit']);
const days = (b: Row) => N(b['nb_days']) || Math.max(1, Math.round((Date.parse(d10(b['end_date'])) - Date.parse(d10(b['start_date']))) / 86_400_000));
/** Jours loués d'une réservation entre a et b (inclus a, exclu b). */
const overlap = (r: Row, a: string, b: string) => Math.max(0, Math.round((Math.min(Date.parse(d10(r['end_date'])), Date.parse(b)) - Math.max(Date.parse(d10(r['start_date'])), Date.parse(a))) / 86_400_000));

// B1 — Tableau du patron
export async function tableau(): Promise<string> {
  const today = localNow().date, tomorrow = addDays(today, 1), m0 = `${today.slice(0, 7)}-01`;
  const { books, cars } = await data();
  const month = books.filter(b => d10(b['start_date']) >= m0 && d10(b['start_date']) <= today.slice(0, 7) + '-31');
  const ca = month.reduce((s, b) => s + price(b), 0), pr = month.reduce((s, b) => s + profitOf(b), 0);
  const due = books.filter(b => S(b['payment_status']) !== 'PAID').reduce((s, b) => s + N(b['amount_remaining']), 0);
  const busyTomorrow = new Set(books.filter(b => d10(b['start_date']) <= tomorrow && d10(b['end_date']) > tomorrow).map(b => S(b['car_id'])));
  const free = cars.filter(c => c.available !== false && !busyTomorrow.has(c.id)).map(c => c.name);
  const a30 = addDays(today, -30);
  const occ = cars.length ? Math.round(books.reduce((s, b) => s + overlap(b, a30, today), 0) / (cars.length * 30) * 100) : 0;
  const dep = books.filter(b => d10(b['start_date']) === today).length, ret = books.filter(b => d10(b['end_date']) === today).length;
  return [`📊 Tableau du patron — ${fmtD(today)}`,
    `• CA du mois : ${eur(ca)} · bénéfice : ${eur(pr)}`,
    `• Reste à encaisser : ${eur(due)}`,
    `• Remplissage 30 j : ${occ} % (${cars.length} voitures)`,
    `• Aujourd'hui : ${dep} départ(s), ${ret} retour(s)`,
    `• Libres demain : ${free.length ? `${free.length} — ${free.slice(0, 5).join(', ')}${free.length > 5 ? '…' : ''}` : 'aucune 🔥'}`].join('\n');
}

// B2 — Rythme du mois
export async function rythme(input: Row = {}): Promise<string> {
  const today = localNow().date, m0 = `${today.slice(0, 7)}-01`;
  if (N(input['month_target']) > 0) await kvPut(K.settings, { ...(await settings()), monthTarget: N(input['month_target']) });
  const { books } = await data();
  // Objectif du mois : celui qu'il a donné, sinon +20 % sur le mois dernier (le 3 000 €/mois du GPS de vie est pour 2028)
  const pm = addDays(m0, -1).slice(0, 7);
  const lastMonth = books.filter(b => d10(b['start_date']).slice(0, 7) === pm).reduce((s, b) => s + price(b), 0);
  const target = (await settings()).monthTarget || Math.max(500, Math.round(lastMonth * 1.2 / 50) * 50);
  const month = books.filter(b => d10(b['start_date']) >= m0 && d10(b['start_date']).slice(0, 7) === today.slice(0, 7));
  const ca = month.reduce((s, b) => s + price(b), 0);
  const last = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
  const left = Math.max(1, last - +today.slice(8, 10) + 1);
  const ppd = (() => { const r = books.slice(-15); const d = r.reduce((s, b) => s + days(b), 0); return d ? r.reduce((s, b) => s + price(b), 0) / d : 40; })();
  const miss = Math.max(0, target - ca);
  const pace = Math.round((ca / Math.max(1, +today.slice(8, 10))) * last);
  if (left <= 2) return [`🎯 Mois presque fini : ${eur(ca)} réservés (objectif ${eur(target)}, ${Math.round(ca / target * 100)} %).`,
    `Pour le mois prochain, vise ${eur(Math.max(target, Math.round(ca * 1.2 / 50) * 50))} — dis « objectif du mois X € » pour le fixer toi-même.`].join('\n');
  return [`🎯 Rythme du mois : ${eur(ca)} / ${eur(target)} (${Math.round(ca / target * 100)} %)${(await settings()).monthTarget ? '' : ' — objectif auto (+20 % sur le mois dernier)'}`,
    miss ? `Il manque ${eur(miss)} en ${left} jours → ≈ ${Math.ceil(miss / ppd)} jours de location à vendre (prix moyen ${eur(ppd)}/j), soit ${eur(miss / left)} par jour.` : '✅ Objectif du mois atteint. Ce qui rentre maintenant, c\'est du bonus : mets-en une part de côté.',
    `À ce rythme tu finis le mois vers ${eur(pace)}.`].join('\n');
}

// B3 — Rentabilité par voiture (90 jours)
export async function voitures(): Promise<string> {
  const today = localNow().date, a = addDays(today, -90);
  const { books, cars, costs } = await data();
  const rows = cars.filter(c => c.available !== false).map(c => {
    const bs = books.filter(b => S(b['car_id']) === c.id && d10(b['end_date']) > a);
    const d = bs.reduce((s, b) => s + overlap(b, a, addDays(today, 1)), 0);
    const p = bs.reduce((s, b) => s + profitOf(b), 0);
    const cost = costs.filter(x => S(x['car_id']) === c.id && d10(x['entry_date']) >= a).reduce((s, x) => s + N(x['amount']), 0);
    return { name: c.name, d, net: p - cost, cost, occ: Math.round(d / 90 * 100) };
  }).sort((x, y) => y.net - x.net);
  if (!rows.length) return 'Aucune voiture.';
  const verdict = (r: typeof rows[number]) => r.occ >= 60 ? '🟢 monte le prix de 5-10 %' : r.occ >= 25 ? '🟡 garde, pousse-la en pub' : r.d === 0 ? '🔴 dort : offre flash + statut WhatsApp' : '🟠 trop peu louée : baisse ou pub ciblée';
  const sleeping = rows.filter(r => r.d === 0).map(r => r.name);
  return ['🚗 Rentabilité par voiture (90 jours, bénéfice − dépenses notées)', ...rows.filter(r => r.d > 0).map(r => `• ${r.name} : ${r.d} j loués (${r.occ} %), net ${eur(r.net)}${r.cost ? ` (dont ${eur(r.cost)} de frais)` : ''} → ${verdict(r)}`),
    ...(sleeping.length ? [`🔴 ${sleeping.length} voiture(s) pas louées en 90 j : ${sleeping.join(', ')} → offre flash + statut WhatsApp, ou retire-les de la vitrine.`] : []),
    'Rappel Buffett : chaque voiture doit se payer seule. Une voiture qui dort 90 jours chez un propriétaire, demande-toi si elle a sa place dans ta flotte.'].join('\n');
}

// B4 — Les 3 actions qui rapportent
async function makeBig3(): Promise<Big3> {
  const date = localNow().date;
  const ex = await kvJson<Big3 | null>(K.big3(date), null);
  if (ex) return ex;
  // 27/11 : les 3 actions viennent du point du jour (vrais clients, vraies voitures), plus d'actions vagues
  const items = (await makeBrief().catch(() => null))?.actions ?? [];
  let list = items.length === 3 ? items : ['Relance un client qui n\'a pas encore payé', 'Publie la voiture libre demain en statut WhatsApp avec le prix', 'Envoie 5 messages de prospection FIK Sites'];
  // Report : une action pas faite hier revient en tête (une seule), avec son compteur
  // 28/11 Kouider : « il me parle de ce client alors que je lui ai déjà répondu » → l'action d'hier est re-vérifiée (demande
  // déjà répondue sur WhatsApp/TikTok = faite) AVANT d'être reportée, pas seulement à midi.
  const yRaw = await kvJson<Big3 | null>(K.big3(addDays(date, -1)), null);
  const y = yRaw ? await autoDone(yRaw).catch(() => yRaw) : null;
  const yBrief = await kvJson<Brief | null>(KB(addDays(date, -1)), null);   // report seulement des actions du point du jour (pas des anciennes vagues)
  const left = yBrief && y?.items.find(i => !i.done && (i.carried ?? 0) < 2 && !/disponibles?\b/i.test(i.text));   // 27/11 : jamais « voitures disponibles » reporté
  if (left) list = [left.text, ...list.filter(t => t !== left.text)].slice(0, 3);
  const b: Big3 = { date, items: list.map(text => (left && text === left.text ? { text, carried: (left.carried ?? 0) + 1 } : { text })) };
  await kvPut(K.big3(date), b, 3 * 86_400);
  return b;
}
// ── POINT DU JOUR (27/11) ───────────────────────────────────────────────────
// Kouider 27/11 : « c'est pas très intéressant ce qu'il dit, faut que ce soit pertinent et compréhensible, un vrai truc pro ».
// Avant : histoire d'un grand + 3 actions vagues (« publie la liste des seize voitures disponibles ») + livre jour 26 + 6 blocs.
// Maintenant : 1 priorité choisie par le CODE dans ses vraies données, les chiffres du mois, 3 actions qui citent un vrai
// client / une vraie voiture, et une leçon d'un grand appliquée à CETTE priorité. Court, lisible en 30 secondes.
interface Signal { score: number; prio: string; why: string; action: string }
interface Brief { date: string; prio: string; why: string; actions: string[]; lecon: string; sage: string; stats: string[] }
const KB = (d: string) => `gc:brief:${d}`;
const hAgo = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3_600_000));

async function monthNumbers(books: Row[]): Promise<{ ca: number; pr: number; target: number; pace: number; miss: number; left: number; ppd: number; auto: boolean }> {
  const today = localNow().date, m0 = `${today.slice(0, 7)}-01`;
  const pm = addDays(m0, -1).slice(0, 7);
  // 27/11 : 3 chiffres du mois différents le même jour (coach, app, récap) → UNE règle : getFinancialReport (finance.ts)
  const { getFinancialReport } = await import('./finance.js');
  const [rep, prevRep] = await Promise.all([getFinancialReport(+today.slice(0, 4), +today.slice(5, 7)).catch(() => null), getFinancialReport(+pm.slice(0, 4), +pm.slice(5, 7)).catch(() => null)]);
  const month = books.filter(b => d10(b['start_date']).slice(0, 7) === today.slice(0, 7));
  const lastMonth = prevRep?.grossCA ?? books.filter(b => d10(b['start_date']).slice(0, 7) === pm).reduce((s, b) => s + price(b), 0);
  const set = (await settings()).monthTarget;
  const target = set || Math.max(500, Math.round(lastMonth * 1.2 / 50) * 50);
  const ca = rep?.grossCA ?? month.reduce((s, b) => s + price(b), 0), pr = rep?.kouiderProfit ?? month.reduce((s, b) => s + profitOf(b), 0);
  const last = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
  const left = Math.max(1, last - +today.slice(8, 10) + 1);
  const r = books.slice(-15); const d = r.reduce((s, b) => s + days(b), 0);
  const ppd = d ? r.reduce((s, b) => s + price(b), 0) / d : 40;
  return { ca, pr, target, pace: Math.round((ca / Math.max(1, +today.slice(8, 10))) * last), miss: Math.max(0, target - ca), left, ppd, auto: !set };
}

async function briefSignals(): Promise<{ signals: Signal[]; stats: string[] }> {
  const today = localNow().date, in2 = addDays(today, 2), in7 = addDays(today, 7), in14 = addDays(today, 14);
  const { books, cars } = await data();
  const carName = (id: unknown) => cars.find(c => c.id === S(id))?.name ?? 'la voiture';
  const first = (n: unknown) => S(n).trim() || 'le client';
  const m = await monthNumbers(books);
  const sig: Signal[] = [];
  // Demandes clients (WhatsApp + TikTok) encore ouvertes
  const dm = await import('./wa-demandes.js');
  const open = (await Promise.all((['whatsapp', 'tiktok'] as const).map(async ch => (await dm.listWaDemandes(ch).catch(() => [])).map(d => ({ ...d, ch })))))
    .flat().filter(d => !dm.WA_CLOSED.has(d.status) && Date.now() - Date.parse(d.updated_at) < 7 * 86_400_000);
  const waiting = open.filter(d => d.status === 'nouveau' && hAgo(d.updated_at) >= 1).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  for (const d of waiting.slice(0, 2)) sig.push({ score: 100 - Math.min(20, hAgo(d.updated_at) / 6), prio: `Réponds à ${d.chat} (${d.ch === 'tiktok' ? 'TikTok' : 'WhatsApp'})`,
    why: `sa demande attend depuis ${hAgo(d.updated_at)} h ; un client sans réponse part chez un autre.`, action: `Réponds à ${d.chat} sur ${d.ch === 'tiktok' ? 'TikTok' : 'WhatsApp'} (demande ouverte depuis ${hAgo(d.updated_at)} h)` });
  // Demandes déjà répondues mais pas conclues → à faire avancer (vérifier avec Houari puis revenir vers le client)
  // 27/11 Halima : « pour 5 jours … d'accord merci », sans date = elle ne rentre pas dans les conditions → pas un lead
  const closedByThanks = (t: string) => /(d'?accord|ok|merci|saha|baraka ?llahou?)[\s\w!.]{0,25}$/i.test(t.trim().split('\n').at(-1) ?? '') && !/\d{1,2}\s*(\/|au|→|-|hata|jusqu|déc|janv|fév|mars|avr|mai|juin|juil|août|sept|oct|nov)/i.test(t);
  // 27/11 Kouider : « il me dit de répondre à des clients auxquels j'ai déjà répondu ». Répondu (contacté) et le client n'a rien
  // réécrit depuis = la balle est chez le client → rien à faire. Seulement s'il a RÉÉCRIT après notre réponse (replied_at).
  const leads = open.filter(d => d.status === 'contacté' && d.replied_at && d.updated_at > d.replied_at && hAgo(d.updated_at) >= 2 && hAgo(d.updated_at) <= 96 && !closedByThanks(d.text))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  for (const d of leads.slice(0, 2)) {
    const ask = (d.text.split('\n').map(x => x.trim()).filter(x => x.length > 3 && !/^(slm|salam|bonjour|bonsoir|salut)\b.{0,20}$/i.test(x)).at(-1) ?? '').slice(0, 70);
    sig.push({ score: 85, prio: `Réponds à ${d.chat}`, why: `${d.ch === 'tiktok' ? 'TikTok' : 'WhatsApp'} : il a réécrit après ta réponse (« ${ask} »), il attend.`,
      action: `Réponds à ${d.chat} sur ${d.ch === 'tiktok' ? 'TikTok' : 'WhatsApp'} : il a réécrit après ta réponse (« ${ask.slice(0, 40)} »)` });
  }
  // Acomptes : une voiture prise = payée en entier, donc seulement les départs à venir
  const unpaid = books.filter(b => d10(b['start_date']) > today && S(b['payment_status']) !== 'PAID' && N(b['amount_remaining']) > 0)
    .sort((a, b) => d10(a['start_date']).localeCompare(d10(b['start_date'])));
  for (const b of unpaid.slice(0, 2)) {
    const soon = d10(b['start_date']) <= in2;
    sig.push({ score: soon ? 95 : 70, prio: `Encaisse l'acompte de ${first(b['client_name'])}`, why: `départ le ${fmtD(d10(b['start_date']))} (${carName(b['car_id'])}), il reste ${eur(N(b['amount_remaining']))} à payer.`,
      action: `Demande à ${first(b['client_name'])} de régler ${eur(N(b['amount_remaining']))} avant le ${fmtD(d10(b['start_date']))}` });
  }
  // Départs proches à préparer
  const deps = books.filter(b => d10(b['start_date']) > today && d10(b['start_date']) <= in2 && !/COMPLET|CANCEL|REJECT/i.test(S(b['status'])));
  for (const b of deps.slice(0, 2)) sig.push({ score: 75, prio: `Prépare la remise de ${first(b['client_name'])}`, why: `départ le ${fmtD(d10(b['start_date']))} avec la ${carName(b['car_id'])} : préviens Houari, heure et lieu confirmés.`,
    action: `Confirme à Houari l'heure de remise de la ${carName(b['car_id'])} pour ${first(b['client_name'])} (${fmtD(d10(b['start_date']))})` });
  // Voitures sans aucune location dans les 14 jours → pub TikTok (jamais « dispo » dit à un client) ; voitures phares d'abord
  const idle = cars.filter(c => c.available !== false && !books.some(b => S(b['car_id']) === c.id && d10(b['start_date']) < in14 && d10(b['end_date']) > today)).map(c => c.name)
    .sort((a, b) => Number(/creta|500 ?x|duster/i.test(b)) - Number(/creta|500 ?x|duster/i.test(a)));
  const avail = cars.filter(c => c.available !== false).length;
  if (idle.length && idle.length >= avail * 0.7) sig.push({ score: 55, prio: 'Remplis les 2 prochaines semaines', why: `aucune location prévue d'ici le ${fmtD(in14)} (${idle.length} voitures sur ${avail}).`,
    action: `Prépare une pub TikTok pour la ${idle[0]}, une de tes voitures phares` });
  else if (idle.length) sig.push({ score: 50, prio: `Fais tourner la ${idle[0]}`, why: `aucune location prévue pour elle d'ici le ${fmtD(in14)}${idle.length > 1 ? ` (${idle.length} voitures dans ce cas)` : ''}.`,
    action: `Prépare une pub TikTok pour la ${idle[0]} (aucune location d'ici 14 jours)` });
  // Retard sur l'objectif du mois
  if (m.miss > 0 && m.left > 2) sig.push({ score: 45, prio: `Vends ${Math.ceil(m.miss / m.ppd)} jours de location`, why: `il manque ${eur(m.miss)} pour l'objectif du mois (${eur(m.target)}), ${m.left} jours pour le faire.`,
    action: `Relance un ancien client avant ses vacances (il manque ${eur(m.miss)} ce mois)` });
  sig.push({ score: 20, prio: 'Trouve ton prochain client FIK Sites', why: 'chaque site vendu = un revenu qui ne dépend pas des voitures.', action: 'Envoie 3 messages de prospection FIK Sites à des commerces d\'Oran' });
  sig.sort((a, b) => b.score - a.score);
  const mois = new Date(`${today}T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' });
  // 27/11 : ce qu'il a gagné hier (tout confondu, MON ARGENT) — une ligne
  const hier = await import('./mon-argent.js').then(m => m.monArgentExtras()).then(x => x.yesterday).catch(() => null);
  const stats = [
    ...(hier && hier.total > 0 ? [`• Hier : ${eur(hier.total)} gagnés${hier.pieces ? ` (${hier.pieces} pièces)` : ''}`] : []),
    `• ${mois[0]!.toUpperCase()}${mois.slice(1)} : ${eur(m.ca)} réservés sur ${eur(m.target)} visés (${Math.round(m.ca / m.target * 100)} %)${m.auto ? ' — objectif auto' : ''}`,
    `• Bénéfice du mois : ${eur(m.pr)}${m.left > 2 ? ` · à ce rythme, fin du mois ≈ ${eur(m.pace)}` : ''}`,
    unpaid.length ? `• À encaisser avant départ : ${eur(unpaid.reduce((s, b) => s + N(b['amount_remaining']), 0))} (${unpaid.length} client${unpaid.length > 1 ? 's' : ''})` : '• Aucun acompte en attente',
    `• Demandes clients ouvertes : ${open.length}${waiting.length ? ` (dont ${waiting.length} sans réponse)` : ''}`,
    `• Départs d'ici 7 jours : ${books.filter(b => d10(b['start_date']) > today && d10(b['start_date']) <= in7 && !/CANCEL|REJECT/i.test(S(b['status']))).length}`,
  ];
  return { signals: sig, stats };
}

/** 27/11 : pistes business RÉELLES pour la Conscience (conseils dans la journée), recalculées au plus 1×/h. */
export async function businessIdeas(): Promise<string[]> {
  const c = await kvJson<{ at: number; l: string[] } | null>('gc:ideas', null);
  if (c && Date.now() - c.at < 3600_000) return c.l;
  const { signals, stats } = await briefSignals();
  const l = [...signals.slice(0, 4).map(x => `${x.prio} — ${x.why}`), ...stats.slice(0, 3).map(x => x.replace(/^•\s*/, ''))];
  await kvPut('gc:ideas', { at: Date.now(), l }, 7200);
  return l;
}

async function makeBrief(force = false): Promise<Brief> {
  const date = localNow().date;
  if (!force) { const ex = await kvJson<Brief | null>(KB(date), null); if (ex) return ex; }
  const { signals, stats } = await briefSignals();
  const top = signals[0]!;
  const used = await kvJson<string[]>(K.used, []);
  const sage = sageOfDay(date, used);
  const from = await offFrom();
  const when = from ? `il travaille à la librairie jusqu'à ${from}` : (await isAfterWorkEnd()) ?? 'il travaille à la librairie la journée (aucune pause au travail) : actions à faire avant ou après le travail';
  type Out = { actions?: string[]; lecon?: string };
  const { jsonOf } = await import('./media-util.js');
  const o = jsonOf<Out>(await ai(`Signaux RÉELS de FIK aujourd'hui, du plus important au moins important :\n${signals.slice(0, 6).map((x, k) => `${k + 1}. ${x.prio} — ${x.why} (action possible : ${x.action})`).join('\n')}\n\n`
    + `Sa journée : ${when}.\nGrand entrepreneur du jour : ${sage.name}. Principes : ${sage.principles.join(' ; ')}.\n\n`
    + `Réponds UNIQUEMENT en JSON : {"actions":["…","…","…"],"lecon":"…"}\n`
    + `- actions : EXACTEMENT 3, tirées des signaux ci-dessus dans l'ordre (la 1re = signal 1). Chacune : verbe à l'impératif, max 16 mots, faisable en moins de 20 min depuis son téléphone, avec le VRAI nom (client, voiture, montant) donné dans le signal. N'invente aucun nom ni chiffre. `
    + `Ne dis JAMAIS de dire à un client qu'une voiture est disponible ; les pubs, c'est TikTok seulement.\n`
    + `- lecon : 2 phrases simples. Ce que ${sage.name} ferait face à la priorité n°1 (« ${top.prio} »), et pourquoi. Commence par « ${sage.name} ». Pas de biographie, pas de métaphore, pas de grande phrase : du concret.`,
    { system: COACH_SYS, max: 350 }).catch(() => '')) ?? {};
  const bad = /disponibles?\b.*(client|groupe|liste)|(liste|groupes?).*disponibles?/i;
  const acts = (o.actions ?? []).map(a => S(a).replace(/^[\s\-•*\d.)]+/, '').trim()).filter(a => a.length > 12 && a.length < 160 && !bad.test(a));
  const actions = (acts.length === 3 ? acts : signals.slice(0, 3).map(x => x.action)).map(a => a.replace(/[.\s]+$/, ''));
  const lecon = S(o.lecon).trim().startsWith(sage.name.split(' ')[0]!) ? S(o.lecon).trim() : `${sage.name} : ${sage.principles[0]}.`;
  // Au travail jusqu'à HH:MM, aucune pause : « avant 20:00 » → « après 20:00 »
  const end = await import('./kouider-dossier.js').then(m => m.workEndToday()).catch(() => null);
  if (end) for (let k = 0; k < actions.length; k++) actions[k] = actions[k]!.replace(new RegExp(`avant ${end.replace(':', '[h:]')}`, 'i'), `après ${end}`);
  const b: Brief = { date, prio: top.prio, why: top.why, actions, lecon, sage: sage.name, stats };
  await kvPut(K.used, [...used, sage.id].slice(-30));
  await kvPut(KB(date), b, 3 * 86_400);
  return b;
}
/** Fin de travail du jour en clair (pour placer les actions), null si inconnue. */
async function isAfterWorkEnd(): Promise<string | null> {
  const e = await import('./kouider-dossier.js').then(m => m.workEndToday()).catch(() => null);
  return e ? `il travaille à la librairie jusqu'à ${e} (aucune pause au travail) : actions avant le travail ou après ${e}` : null;
}
/** Version parlée (audio du matin). */
export async function briefVoice(): Promise<string> {
  const b = await makeBrief();
  const off = !(await offFrom()) && await dayOff();
  if (off) return `Bonjour Kouider. Aujourd'hui c'est congé : Fatima et Ibrahim d'abord, et ta séance de sport. ${b.lecon}`;
  const big = await makeBig3();
  return `Bonjour Kouider. Ta priorité aujourd'hui : ${b.prio}. Pourquoi : ${b.why} Tes trois actions. ${big.items.map((i, k) => `${['Une', 'Deux', 'Trois'][k]} : ${i.text.replace(/[.\s]+$/, '')}.`).join(' ')} ${b.lecon}`.replace(/\b(lun|mar|mer|jeu|ven|sam|dim)\. /g, '');
}

async function big3Done(n: number): Promise<string> {
  const b = await makeBig3();
  const it = b.items[n - 1];
  if (!it) return '❌ n = 1, 2 ou 3.';
  it.done = true;
  await kvPut(K.big3(b.date), b, 3 * 86_400);
  const done = b.items.filter(i => i.done).length;
  if (done === 3) {
    const st = await kvJson<{ last: string; n: number }>(K.streak, { last: '', n: 0 });
    if (st.last !== b.date) { st.n = st.last === addDays(b.date, -1) ? st.n + 1 : 1; st.last = b.date; await kvPut(K.streak, st); }
    return `🏆 Les 3 actions sont faites ! Série : ${st.n} jour(s) d'affilée. C'est comme ça qu'on construit un empire — Rebrab : « Think big, start small, move fast ».`;
  }
  return `✅ Action ${n} faite (${done}/3) : ${it.text}`;
}
const big3Line = (b: Big3) => b.items.map((i, k) => `${i.done ? '✅' : `${k + 1}.`} ${i.text}`).join('\n');

// B5 — Réveil des anciens clients
export async function anciensClients(): Promise<string> {
  const today = localNow().date;
  const { books } = await data();
  const byPhone = new Map<string, Row[]>();
  // Vrais numéros seulement (les réservations de test ont des numéros bidon)
  const valid = (p: string) => /^(00|32|33|213)\d{8,12}$/.test(p) || /^0\d{9}$/.test(p) || (S(p).length >= 10 && /^\+/.test(p));
  for (const b of books) { const raw = S(b['client_phone']).trim(); const p = raw.replace(/\D/g, ''); if (p && (valid(p) || (raw.startsWith('+') && p.length >= 10))) byPhone.set(p, [...(byPhone.get(p) ?? []), b]); }
  const sleepers = [...byPhone.values()].map(l => l.sort((a, b) => d10(b['end_date']).localeCompare(d10(a['end_date'])))[0]!)
    .filter(b => d10(b['end_date']) <= addDays(today, -45) && d10(b['end_date']) >= addDays(today, -400)).slice(0, 8);
  if (!sleepers.length) return '😴 Pas d\'ancien client à réveiller pour l\'instant (aucun client parti il y a 45 jours à 13 mois). Ça viendra avec plus de locations.';
  const lines = sleepers.map(b => {
    const first = S(b['client_name']).split(' ')[0] || 'cher client';
    const ar = /ar|dz/i.test(S(b['client_lang']));
    const msg = ar ? `السلام عليكم ${first}، FIK Conciergerie هنا. إذا راك جاي لوهران قريب، عندنا سيارات نقية وخدمة توصيل للمطار. نحجزلك ؟`
      : `Bonjour ${first}, c'est FIK Conciergerie 😊 Vous revenez bientôt à Oran ? Pour nos anciens clients : livraison à l'aéroport offerte. Je vous réserve une voiture ?`;
    return `• ${S(b['client_name'])} (dernière location ${fmtD(d10(b['end_date']))}) — ${S(b['client_phone'])}\n  « ${msg} »`;
  });
  return ['📞 Anciens clients à réveiller (messages prêts — dis « envoie à … » et je passe par WhatsApp après ton oui) :', ...lines,
    'Walton : un ancien client coûte 5 fois moins cher à faire revenir qu\'un nouveau à trouver.'].join('\n');
}

// B6 — Répartition de l'argent encaissé
export async function repartition(input: Row = {}): Promise<string> {
  const split = await kvJson<{ reinvest: number; epargne: number; perso: number }>(K.split, { reinvest: 50, epargne: 30, perso: 20 });
  if (input['reinvest'] != null) {
    const r = N(input['reinvest']), e = N(input['epargne']), p = N(input['perso']);
    if (r + e + p !== 100) return '❌ Les 3 parts doivent faire 100 (ex. 50 / 30 / 20).';
    await kvPut(K.split, { reinvest: r, epargne: e, perso: p });
    return `✅ Nouvelle règle : ${r} % réinvesti dans FIK · ${e} % épargne · ${p} % pour toi.`;
  }
  const amount = N(input['amount']) || await (async () => {
    const y = addDays(localNow().date, -1);
    const { books } = await data();
    return books.filter(b => d10(b['last_payment_date']) === y).reduce((s, b) => s + N(b['last_payment_amount']), 0);
  })();
  const rule = `Règle : ${split.reinvest} % FIK · ${split.epargne} % épargne · ${split.perso} % toi`;
  if (!amount) return `💰 ${rule}. Rien d'encaissé hier. Quand un client paie, dis « répartis 300 € » et je te dis où mettre chaque euro.`;
  return [`💰 Encaissé : ${eur(amount)} → ${rule}`, `• ${eur(amount * split.reinvest / 100)} pour FIK (entretien, pub, prochaine voiture)`,
    `• ${eur(amount * split.epargne / 100)} à mettre de côté MAINTENANT (avant de dépenser)`, `• ${eur(amount * split.perso / 100)} pour toi et ta famille`,
    'Clason (L\'homme le plus riche de Babylone) : paie-toi en premier, au moins 1/10 de tout ce que tu gagnes.'].join('\n');
}

// B7 — Délégation
export async function deleguer(input: Row = {}): Promise<string> {
  if (input['hours_week']) { await kvPut(K.settings, { ...(await settings()), hoursWeek: N(input['hours_week']) }); }
  const s = await settings();
  const today = localNow().date;
  const { books } = await data();
  const profit30 = books.filter(b => d10(b['start_date']) >= addDays(today, -30) && d10(b['start_date']) <= today).reduce((x, b) => x + profitOf(b), 0);
  const hourly = profit30 / (s.hoursWeek * 4.3);
  const next7 = books.filter(b => (d10(b['start_date']) >= today && d10(b['start_date']) <= addDays(today, 7)) || (d10(b['end_date']) >= today && d10(b['end_date']) <= addDays(today, 7))).length;
  return [`⏱️ Ton heure sur FIK vaut ≈ ${eur(hourly)} (bénéfice 30 j ÷ ${s.hoursWeek} h/semaine — dis « je passe X h par semaine sur FIK » pour corriger).`,
    `Cette semaine : ${next7} remise(s) ou retour(s) de clés ≈ ${next7} h de terrain.`,
    'À confier (toi tu gardes : prix, gros clients, décisions, nouvelles idées) :',
    '• Remises/retours de clés + état des lieux → Houari bof (avec la check-list FIK et photos obligatoires)',
    '• Lavage, plein, petites courses de garage → un jeune payé à la tâche',
    '• Réponses WhatsApp simples (prix, conditions) → Dzaryx (relais / autonomie)',
    '• Comptabilité et déclarations → un comptable agréé à Oran',
    'Gerber (E-Myth) : travaille SUR ton entreprise, pas DEDANS. Ray Kroc : écris la procédure, le système fait le travail.'].join('\n');
}

// B8 — Statut & indépendance en Algérie
export async function statut(input: Row = {}): Promise<string> {
  const st = await kvJson<Record<string, string>>(K.statut, {});
  const id = S(input['id']).toLowerCase();
  if (id) {
    const step = STATUT_STEPS.find(s => s.id === id || s.title.toLowerCase().includes(id));
    if (!step) return `❌ Étape inconnue. Étapes : ${STATUT_STEPS.map(s => s.id).join(', ')}.`;
    st[step.id] = localNow().date; await kvPut(K.statut, st);
    return `✅ « ${step.title} » cochée. ${Object.keys(st).length}/${STATUT_STEPS.length} étapes faites vers ton indépendance.`;
  }
  const next = STATUT_STEPS.find(s => !st[s.id]);
  return [`🏛️ Ton statut en Algérie — ${Object.keys(st).length}/${STATUT_STEPS.length} étapes`, ...STATUT_STEPS.map(s => `${st[s.id] ? '✅' : '▫️'} ${s.title}`),
    next ? `\n➡️ Prochaine : ${next.title}\n${next.detail}` : '\n🏆 Tout est en règle. Tu es un vrai chef d\'entreprise algérien.',
    'Sources publiques (ANAE, startup.dz, lois de finances 2024-2026) : à confirmer avec l\'organisme ou un comptable avant de payer.'].join('\n');
}

// B9 — Revue du patron (vendredi)
export async function revue(): Promise<string> {
  const today = localNow().date, a = addDays(today, -7), b0 = addDays(today, -14);
  const { books } = await data();
  const w = (from: string, to: string) => { const l = books.filter(b => S(b['created_at']).slice(0, 10) > from && S(b['created_at']).slice(0, 10) <= to); return { n: l.length, ca: l.reduce((s, b) => s + price(b), 0), pr: l.reduce((s, b) => s + profitOf(b), 0) }; };
  const cur = w(a, today), prev = w(b0, a);
  let done = 0, total = 0;
  for (let i = 0; i < 7; i++) { const b = await kvJson<Big3 | null>(K.big3(addDays(today, -i)), null); if (b) { total += 3; done += b.items.filter(x => x.done).length; } }
  const arrow = (x: number, y: number) => x > y ? '📈' : x < y ? '📉' : '➡️';
  // 27/11 : tout son argent, pas seulement les locations (snus, ventes, autres, achats, dépenses — MON ARGENT)
  const ma = await import('./mon-argent.js');
  const [mc, mp] = await Promise.all([ma.periodMoney(a, today).catch(() => null), ma.periodMoney(b0, a).catch(() => null)]);
  const autres = mc ? [`${arrow(mc.net, mp?.net ?? 0)} Hors location : ${eur(mc.net)} gardés (avant ${eur(mp?.net ?? 0)})${mc.pris ? ` — ${eur(mc.ventes)} vendus − ${eur(mc.pris)} pris dessus` : ''}${Object.keys(mc.by).length > 1 ? ` · ${Object.entries(mc.by).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${eur(v)}`).join(', ')}` : ''}${mc.pieces ? ` · ${mc.pieces} pièces de snus` : ''}`,
    ...(mc.achats ? [`📦 Achats de stock : ${eur(mc.achats)}`] : []), ...(mc.depenses ? [`💸 Dépenses notées : ${eur(mc.depenses)}`] : []),
    `💰 Total gagné la semaine (locations + le reste) : ${eur(cur.pr + mc.net)} (avant ${eur(prev.pr + (mp?.net ?? 0))})`] : [];
  const facts = `Semaine : ${cur.n} réservations (avant : ${prev.n}), CA réservé ${eur(cur.ca)} (avant ${eur(prev.ca)}), bénéfice locations ${eur(cur.pr)} (avant ${eur(prev.pr)}). ${mc ? `Hors location (snus, ventes, autres) : ${eur(mc.net)} gardés après ${eur(mc.pris)} pris dessus (avant ${eur(mp?.net ?? 0)}), achats de stock ${eur(mc.achats)}, dépenses ${eur(mc.depenses)}. ` : ''}Actions du jour faites : ${done}/${total}.`;
  const week = await import('./kouider-dossier.js').then(m => m.weekScheduleText()).catch(() => '');
  // 27/11 Kouider : « je comprends pas la leçon, elle n'a aucun sens » → français simple, pas de citation, une action un jour LIBRE
  const lesson = await ai(`${facts}\n${week}\nTu es le bras droit de Kouider (FIK : location de voitures à Oran ; il vit et travaille en Belgique ; le snus est une autre activité, en Belgique, ne mélange jamais les deux). `
    + `Écris en français très simple, comme à un ami, 2 phrases courtes, tutoiement, sans citation, sans nom de célébrité, sans jargon (pas de « conversion », « haute valeur », « provoquer »).\n`
    + `Phrase 1 commence par « Cette semaine : » et dit en clair ce qui s'est passé, avec les vrais chiffres ci-dessus.\n`
    + `Phrase 2 commence par « Semaine prochaine : » et donne UNE seule action concrète, un JOUR où il est LIBRE d'après sa semaine (jamais pendant ses heures de travail), et ce qu'elle doit rapporter. N'invente aucun chiffre.`, { max: 220 }).catch(() => '');
  return [`🗂️ Revue du patron — semaine du ${fmtD(a)}`, `${arrow(cur.n, prev.n)} Réservations : ${cur.n} (avant ${prev.n})`, `${arrow(cur.ca, prev.ca)} Payé par les clients : ${eur(cur.ca)} (avant ${eur(prev.ca)})`,
    `${arrow(cur.pr, prev.pr)} Bénéfice locations : ${eur(cur.pr)} (avant ${eur(prev.pr)})`, ...autres, `🎯 Actions du jour cochées : ${done}/${total}`, lesson ? `\n${lesson}` : '', `\n${await tresorerie().catch(() => '')}`].join('\n').trim();
}

// B10 — Trésorerie 30 jours
export async function tresorerie(): Promise<string> {
  const today = localNow().date, end = addDays(today, 30);
  const { books, costs } = await data();
  const toCash = books.filter(b => S(b['payment_status']) !== 'PAID' && d10(b['end_date']) >= addDays(today, -30)).reduce((s, b) => s + N(b['amount_remaining']), 0);
  const future = books.filter(b => d10(b['start_date']) > today && d10(b['start_date']) <= end);
  const owners = future.reduce((s, b) => s + N(b['owner_total']), 0);
  const monthlyCosts = costs.reduce((s, x) => s + N(x['amount']), 0) / 4;
  const net = toCash - owners - monthlyCosts;
  // 27/11 : « 0 € … 🟢 Bien, mets la part épargne de côté » n'avait aucun sens → rien à encaisser ni à payer = une ligne claire
  if (!toCash && !owners && !monthlyCosts) return '🏦 Les 30 prochains jours : aucune location réservée, donc rien à encaisser ni à reverser pour l\'instant.';
  return [`🏦 Trésorerie 30 jours`, `• À encaisser : ${eur(toCash)} (${future.length} location(s) à venir)`, `• À reverser aux propriétaires : ${eur(owners)}`,
    `• Frais habituels (moyenne/mois) : ${eur(monthlyCosts)}`, `= ${net >= 0 ? '🟢' : '🔴'} ${eur(net)} sur 30 jours`,
    net < 0 ? '⚠️ Mois serré : relance les impayés et vends 2-3 jours de location avant toute dépense.' : 'Bien. Mets la part épargne de côté avant qu\'elle disparaisse.'].join('\n');
}

// ── COACH DE VIE ─────────────────────────────────────────────────────────────

function sageOfDay(date: string, used: string[]): Sage {
  const fresh = SAGES.filter(s => !used.slice(-20).includes(s.id));
  const pool = fresh.length ? fresh : SAGES;
  return pool[Math.floor(Date.parse(date) / 86_400_000) % pool.length]!;
}
const sageText = (s: Sage) => `${s.name} (${s.from}) — ${s.story}\nPrincipes : ${s.principles.join(' ; ')}\nPour Kouider : ${s.fik}${s.storm ? `\nÉpreuve : ${s.storm}` : ''}`;
const COACH_SYS = `Tu es le GRAND COACH de Kouider : déterminé, chaleureux, exigeant, comme un grand frère qui a lu la vie de tous les grands entrepreneurs. Kouider : Algérien d'Oran installé en Belgique, salarié dans une librairie à Jette (Bruxelles), marié à FATIMA, un fils (Ibrahim, 1 an et demi). Fatima et Ibrahim vivent AVEC lui et le suivent partout : ils ne sont PAS en Algérie, il ne va jamais « les rejoindre » ; l'Algérie = s'y installer TOUS LES TROIS. Quand tu parles de sa famille, dis « Fatima et Ibrahim » (jamais Ibrahim seul) ; il bâtit FIK Conciergerie (location de voitures à Oran) et FIK Sites, sport le matin, et il veut devenir un grand businessman en Algérie : indépendant, bon statut, bien financièrement, quitter la Belgique fin 2028. Tutoiement, phrases COURTES, mots de tous les jours (comme à un ami), jamais de phrase compliquée ni de mots savants. Jamais de nutrition ni de médicaments. N'invente ni chiffre, ni citation douteuse, ni nom de client.`;

/** Retire une consigne recopiée par le modèle et les paragraphes répétés (20/11). */
export function cleanCoachText(t: string): string {
  let x = String(t ?? '').trim();
  const cut = Math.max(x.lastIndexOf('Pas de titre'), x.lastIndexOf('sans recopier ces consignes'));
  if (cut >= 0) x = x.slice(x.indexOf('\n', cut) + 1 || x.length).trim();
  const seen = new Set<string>(); const out: string[] = [];
  for (const p of x.split(/\n\s*\n/)) {
    if (/Écris son|^\s*[•\-\d]\)?\s*(commence|PUIS|la leçon|finis|l'histoire vraie|une phrase qui)/im.test(p)) continue;
    const k = p.toLowerCase().replace(/[^a-zà-ÿ]/g, '').slice(0, 80);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(p.trim());
  }
  return out.join('\n\n').replace(/[ ]+—[ ]+/g, ', ').trim();
}

// L1 — Texte du matin
export async function texteDuJour(force = false): Promise<string> {
  const date = localNow().date;
  if (!force) { const t = await kvJson<string | null>(K.text(date), null); if (t) return t; }
  const used = await kvJson<string[]>(K.used, []);
  const sage = sageOfDay(date, used);
  const off = await dayOff();
  const from = await offFrom();
  const dayDesc = from ? `il travaille à la LIBRAIRIE jusqu'à ${from}, puis TEMPS LIBRE (congé) : du temps en famille avec sa femme et Ibrahim + du sport, pas de business sauf urgence. Ce n'est PAS une journée entière de congé : ne dis jamais « c'est ton jour de congé »`
    : off ? 'JOUR DE CONGÉ : du temps en famille avec sa femme et Ibrahim + du sport, pas de business sauf urgence'
    : 'jour de travail (librairie + FIK en plus)';
  const [vision, ex, pil] = await Promise.all([kvJson<{ ten?: string; one?: string; month?: string } | null>(K.vision, null), kvJson<Record<string, string>>(K.examen, {}), piliers().catch(() => null)]);
  const lastExam = Object.entries(ex).sort().at(-1);
  const weak = pil ? Object.entries(pil).sort((a, b) => a[1] - b[1])[0]?.[0] : '';
  // 20/11 Kouider : « je comprends rien à ce texte, faut que ça soit plus simple, et surtout il se répète 2× »
  // (le modèle avait recopié la consigne puis écrit le texte) → consigne courte + nettoyage (consigne recopiée, paragraphes en double).
  const raw = await ai(`${sageText(sage)}\n\n${vision ? `Sa vision : 10 ans = ${vision.ten ?? '?'} ; cette année = ${vision.one ?? '?'} ; ce mois = ${vision.month ?? '?'}.` : ''}\n${lastExam ? `Son examen d'hier soir : ${lastExam[1]}` : ''}\n${weak ? `Pilier le plus faible cette semaine : ${weak}.` : ''}\nAujourd'hui : ${dayDesc}.\n\n`
    + `Écris son petit texte du matin, 4 à 6 lignes COURTES, en français très simple (mots de tous les jours, une idée par phrase) :\n`
    + `1) l'histoire vraie de ${sage.name} en 1 ou 2 phrases simples ;\n`
    + `2) une phrase qui commence par « Toi, Kouider, » : ce qui est PAREIL entre lui et ${sage.name} (sa vraie vie : la librairie, FIK construit à distance, l'épargne pour s'installer à Oran avec Fatima et Ibrahim) ;\n`
    + `3) UNE petite action claire à faire AUJOURD'HUI, qui colle à sa journée ;\n`
    + `4) une phrase forte pour finir.\n`
    + `Pas de titre, pas de puces, pas de tirets longs. Réponds SEULEMENT avec le texte, sans recopier ces consignes.`, { system: COACH_SYS, max: 400 }).catch(() => '');
  const body = cleanCoachText(raw);
  const text = body || `${sage.name} — ${sage.story}\n\n${sage.fik}\n\nAujourd'hui, une seule règle : avance, même d'un petit pas. Les grands ne sont pas nés grands, ils ont continué.`;
  await kvPut(K.used, [...used, sage.id].slice(-30));
  await kvPut(K.text(date), text, 3 * 86_400);
  return text;
}

async function morningMessage(): Promise<string> {
  const from = await offFrom();
  const off = from ? false : await dayOff();   // 7h15 : le jeudi / dimanche il travaille encore (congé seulement à partir de « from »)
  const weekday = localNow().weekday;
  const b = await makeBrief();
  const parts = [`☀️ LE GRAND COACH — ${fmtD(localNow().date)}`];
  if (off) {
    parts.push('', '👨‍👩‍👦 Jour de congé : Fatima et Ibrahim d\'abord + ta séance de sport. Téléphone loin, Dzaryx garde la boutique.', '', `💡 ${b.lecon}`);
  } else {
    const b3 = await makeBig3();
    parts.push('', '🎯 TA PRIORITÉ', `${b.prio}.`, `Pourquoi : ${b.why}`,
      '', '📊 OÙ TU EN ES', ...b.stats,
      '', '✅ TES 3 ACTIONS (réponds « fait 1 », « fait 2 »…)', big3Line(b3),
      '', `💡 ${b.lecon}`);
    const rep = await repartition().catch(() => '');
    if (rep && !rep.includes('Rien d\'encaissé')) parts.push('', rep);
    if (from) parts.push('', `🕐 À partir de ${from} : temps libre, sport + Fatima et Ibrahim.`);
  }
  // Le reste seulement quand c'est neuf : défi le lundi, baraka le vendredi (le livre et le compte à rebours restent sur demande)
  const defi = weekday === 1 ? await currentDefi() : null;
  if (defi) parts.push('', `🔥 Défi de la semaine : ${defi.text}`);
  if (weekday === 1) { const c = await import('./grand-coach-plus.js').then(m => m.countdown()).catch(() => ''); if (c) parts.push('', c); }
  if (weekday === 5) parts.push('', await import('./grand-coach-plus.js').then(m => m.baraka()).catch(() => ''));
  return parts.filter((x, k, a) => !(x === '' && a[k - 1] === '')).join('\n').trim();
}

// L2 — Suivi de la journée
/** 27/11 : une action « réponds à / vérifie pour <client> » est faite si ce client a déjà eu sa réponse depuis (et n'a rien réécrit). */
export async function briefPrio(): Promise<string> { const b = await makeBrief(); return `${b.prio} — ${b.why}`; }
export async function big3Fresh(): Promise<Big3 | null> {
  const b = await kvJson<Big3 | null>(K.big3(localNow().date), null);
  return b ? autoDone(b) : null;
}
async function autoDone(b: Big3): Promise<Big3> {
  const dm = await import('./wa-demandes.js');
  const all = (await Promise.all((['whatsapp', 'tiktok'] as const).map(ch => dm.listWaDemandes(ch).catch(() => [])))).flat();
  let changed = false;
  for (const it of b.items) {
    if (it.done) continue;
    const d = all.find(x => x.chat.length >= 3 && it.text.includes(x.chat));
    if (d && d.status !== 'nouveau' && (!d.replied_at || d.replied_at >= d.updated_at)) { it.done = true; changed = true; }
  }
  if (changed) await kvPut(K.big3(b.date), b, 3 * 86_400);
  return b;
}
async function middayCheck(): Promise<string> {
  const b = await autoDone(await makeBig3());
  const left = b.items.filter(i => !i.done);
  const weekday = localNow().weekday;
  const cercle = [weekday === 2 ? await cercleSuggestion().catch(() => '') : '', ...(await import('./grand-coach-plus.js').then(m => m.middaySections(weekday)).catch(() => [] as string[]))].filter(Boolean).join('\n\n');
  if (!left.length) return `🕛 Point de midi : tes 3 actions sont déjà faites 🏆 Après le travail : une action bonus ou du temps pour ta famille.${cercle ? `\n\n${cercle}` : ''}`;
  // 28/11 : seulement ce qui reste (une action déjà faite n'est plus réaffichée), avec son numéro d'origine pour « fait N »
  const leftLines = b.items.map((i, k) => (i.done ? '' : `${k + 1}. ${i.text}`)).filter(Boolean).join('\n');
  return `🕛 Point de midi — il te reste ${left.length} action(s) :\n${leftLines}\n${await import('./grand-coach-plus.js').then(m => m.atWorkNow()).catch(() => false) ? 'Tu es au travail (aucune pause là-bas) : rien maintenant. Dès que tu sors, la plus petite d\'abord, 10 minutes.' : 'La plus petite d\'abord, maintenant, 10 minutes.'} Réponds « fait ${b.items.indexOf(left[0]) + 1} » quand c'est fait.${cercle ? `\n\n${cercle}` : ''}`;
}
async function eveningCheck(): Promise<string> {
  const b = await autoDone(await makeBig3());
  const done = b.items.filter(i => i.done).length;
  const st = await kvJson<{ last: string; n: number }>(K.streak, { last: '', n: 0 });
  // 27/11 Kouider : « il dit 0/3 aujourd'hui, je sais même pas de quoi il parle » → on dit ce que c'est, sans reproche
  const verdict = done === 3 ? `🏆 Les 3 faites. Série : ${st.n} jour(s).` : done ? `💪 ${done} sur 3 faites. Demain on finit le reste.` : 'Aucune cochée. Si tu en as fait une, écris « fait 1 » (ou 2, 3) et je la coche ; sinon elle revient demain.';
  return [`🌇 Bilan de ta journée`, 'Les 3 actions pour faire rentrer de l\'argent que je t\'ai proposées ce matin (7h15) :', big3Line(b), verdict, '', '📝 3 questions pour finir ta journée (2 min, réponds en un seul message, je le garde dans ton journal) :', '1. Qu\'est-ce que j\'ai fait de bien aujourd\'hui ?', '2. Qu\'est-ce que je ferais mieux demain ?', '3. Pour qui j\'ai été là (famille, ami, client) ?'].join('\n');
}

// L3 — Que ferait X à ma place ?
export async function grand(name: string, question: string): Promise<string> {
  const s = SAGES.find(x => name && (x.name.toLowerCase().includes(name.toLowerCase()) || x.id === name.toLowerCase())) ?? sageOfDay(localNow().date, []);
  if (!question.trim()) return `Pose ta question à ${s.name}, ou à : ${SAGES.map(x => x.name).join(', ')}.`;
  const dossier = await import('./kouider-dossier.js').then(m => m.kouiderDossierText()).catch(() => '');
  return ai(`${sageText(s)}\n\nCe que tu sais de Kouider :\n${dossier.slice(0, 2500)}\n\nKouider demande : « ${question} »\nRéponds comme le ferait ${s.name}, avec SES principes (ne prétends pas être lui, dis « ${s.name} te dirait… »). 6 à 10 lignes : son avis franc, ce qu'il ferait concrètement cette semaine, et le piège à éviter.`, { system: COACH_SYS, max: 600 });
}

// L4 — Livre du mois
export async function livre(): Promise<string> {
  const { date } = localNow();
  const idx = (+date.slice(0, 4) * 12 + +date.slice(5, 7)) % BOOKS.length;
  const bk = BOOKS[idx]!;
  const st = await kvJson<{ month: string; ideas: string[]; today?: string; date?: string }>(K.book, { month: '', ideas: [] });
  if (st.month !== date.slice(0, 7)) { st.month = date.slice(0, 7); st.ideas = []; }
  if (st.date === date && st.today) return st.today;
  const idea = await ai(`Livre : « ${bk.title} » de ${bk.author}. Thèse : ${bk.thesis}\nDéjà donné ce mois : ${st.ideas.join(' | ') || 'rien'}.\nDonne UNE idée clé de ce livre (vraie, fidèle au livre) en 1 ou 2 phrases simples, puis une question courte pour l'appliquer aujourd'hui à FIK ou à sa vie. Tutoiement (« tu », jamais « vous »), mots de tous les jours. Réponds seulement avec la ligne. Format : « 📚 ${bk.title} — jour ${st.ideas.length + 1} : … ➡️ … »`, { system: COACH_SYS, max: 200 }).catch(() => '');
  const out = idea || `📚 Livre du mois : « ${bk.title} » (${bk.author}) — ${bk.thesis}`;
  st.ideas = [...st.ideas, out.slice(0, 120)]; st.today = out; st.date = date;
  await kvPut(K.book, st);
  return out;
}

// L5 — Défi de la semaine
const weekKey = (d: string) => { const t = new Date(`${d}T12:00:00Z`); const w = (t.getUTCDay() + 6) % 7; return addDays(d, -w); };
async function currentDefi(): Promise<Defi | null> { const d = await kvJson<Defi | null>(K.defi, null); return d && d.week === weekKey(localNow().date) ? d : null; }
async function newDefi(): Promise<Defi> {
  const s = SAGES[Math.floor(Math.random() * SAGES.length)]!;
  const t = await ai(`Inspire-toi de ${s.name} (${s.principles.join(' ; ')}). Donne UN défi pour la semaine de Kouider, faisable chaque jour en moins de 15 min, mesurable (oui/non chaque soir), qui le rapproche de « grand businessman indépendant en Algérie ». Une seule phrase, commence par un verbe, termine par « — inspiré de ${s.name} ».`, { max: 90 }).catch(() => '');
  const d: Defi = { week: weekKey(localNow().date), text: t.trim() || `Chaque jour, contacte une personne utile à FIK (client, partenaire, prospect) — inspiré de ${s.name}`, days: {} };
  await kvPut(K.defi, d);
  return d;
}

// L6 — Cercle d'or (réseau en Algérie)
const CERCLE_ROLES = ['un comptable agréé à Oran', 'un conseiller bancaire (compte pro + devises)', 'un assureur flotte', 'un concessionnaire / vendeur de voitures', 'une agence de voyages (diaspora)', 'un hôtel ou une résidence à Oran', 'un organisateur de mariages', 'un garagiste de confiance', 'un entrepreneur d\'Oran qui a réussi (mentor)', 'un avocat d\'affaires algérien'];
async function cercleSuggestion(): Promise<string> {
  const l = await kvJson<Person[]>(K.cercle, []);
  const today = localNow().date;
  const due = l.filter(p => !p.last || p.last <= addDays(today, -p.every)).sort((a, b) => S(a.last).localeCompare(S(b.last)))[0];
  if (due) return `🤝 Cercle d'or : cette semaine, reprends contact avec ${due.name} (${due.role})${due.last ? `, dernier contact ${fmtD(due.last)}` : ''}. Un message, une question, un café. Dis « vu ${due.name} » après.`;
  const missing = CERCLE_ROLES.find(r => !l.some(p => p.role === r));
  return missing ? `🤝 Cercle d'or : il manque ${missing} dans ton réseau. Carnegie : entoure-toi de gens plus forts que toi. Quand tu l'as trouvé, dis « ajoute au cercle Nom, rôle ».` : '';
}

// L7 — Examen du soir
async function saveExamen(text: string): Promise<string> {
  const ex = await kvJson<Record<string, string>>(K.examen, {});
  const date = localNow().date;
  ex[date] = text.slice(0, 600);
  for (const k of Object.keys(ex)) if (k < addDays(date, -60)) delete ex[k];
  await kvPut(K.examen, ex);
  return '📝 Examen noté. Je m\'en sers demain matin dans ton texte. Dors bien, champion.';
}

// L10 — Équilibre des 4 piliers (sur 10, 7 derniers jours, à partir des vraies données)
// 28/11 Kouider (Business 0/10, Famille 0/10, Amis 0/10 alors qu'il a vendu et vit avec sa famille) : « faut qu'il donne les vraies infos,
// le business ça doit être tout le cash ». Business = TOUT l'argent gagné de la semaine (ventes nettes du journal + bénéfice FIK)
// face à ce qu'il doit mettre de côté par semaine pour le plan Algérie ; Santé = séances + sommeil ; Famille = vrais moments
// (journal Mon esprit + temps avec Ibrahim). Pas de pilier Amis (sa demande 28/11). Sans donnée → null (« pas de donnée »), jamais un faux 0.
type Pilier = { score: number | null; info: string };
async function piliersDetail(): Promise<Record<string, Pilier>> {
  const today = localNow().date, from = addDays(today, -7);
  const c = (x: number) => Math.max(0, Math.min(10, Math.round(x)));
  const votes = await kvJson<Record<string, Record<string, string[]>>>('life:votes', {});
  const ids = await kvJson<Array<{ name: string; kind: string }>>('life:identities', []);
  const count = (kind: string) => { let n = 0; for (let i = 0; i < 7; i++) { const v = votes[addDays(today, -i)] ?? {}; for (const id of ids.filter(x => x.kind === kind)) n += v[id.name]?.length ?? 0; } return n; };
  const esprit = (await import('./mon-esprit.js').then(m => m.readDays()).catch(() => [])).filter(d => d.date > from && d.date <= today);

  // Business : tout le cash de la semaine
  const ma = await import('./mon-argent.js');
  const pm = await ma.periodMoney(from, today).catch(() => null);
  const { data: bk } = await supabase.from('bookings').select('start_date, status, profit, profit_kouider').gt('start_date', from).lte('start_date', today);
  const fik = ((bk ?? []) as Row[]).filter(r => !/REJECT|CANCEL/i.test(S(r['status']))).reduce((a, r) => a + profitOf(r), 0);
  const side = pm?.net ?? 0, week = side + fik;
  const per = await ma.departDetail().then(d => d?.perWeek ?? null).catch(() => null);
  let target = per && per > 0 ? per : null, tLabel = 'à mettre de côté / semaine pour l\'Algérie';
  if (!target) {   // repli : sa moyenne des 4 semaines d'avant
    let sum = 0; for (let w = 1; w <= 4; w++) sum += (await ma.periodMoney(addDays(from, -7 * w), addDays(today, -7 * w)).catch(() => null))?.net ?? 0;
    target = sum > 0 ? sum / 4 : null; tLabel = 'ta moyenne / semaine';
  }
  const parts = [pm ? Object.entries(pm.by).filter(([, v]) => v).map(([k, v]) => `${k} ${eur(v)}`).join(' + ') : '', fik ? `FIK ${eur(fik)}` : ''].filter(Boolean).join(' + ');
  const pris = pm?.pris ? ` (− ${eur(pm.pris)} pris dessus)` : '';
  const tot = await ma.monArgentOverview().then(o => o.balances.total).catch(() => null);
  const business: Pilier = { score: target ? c(week / target * 10) : (week > 0 ? null : 0),
    info: `${eur(week)} gagnés${parts ? ` : ${parts}${pris}` : ''}${target ? ` — objectif ${eur(target)} (${tLabel})` : ''}${tot != null ? `\n   💰 Tout ton cash (compte + cash + chez Houari) : ${eur(tot)}` : ''}` };

  // Santé : séances (objectif 4) + sommeil moyen (objectif 7 h)
  const sportDays = esprit.filter(d => d.sport?.fait).length;
  const sleeps = esprit.map(d => d.sommeil).filter((x): x is number => typeof x === 'number' && x > 0);
  const sleep = sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null;
  const sante: Pilier = esprit.length || count('forme')
    ? { score: c(Math.min(1, Math.max(sportDays, Math.round(count('forme') / 2)) / 4) * 6 + (sleep != null ? Math.min(1, sleep / 7) * 4 : 2)),
        info: `${sportDays} séance(s)${sleep != null ? ` · sommeil ${String(Math.round(sleep * 10) / 10).replace('.', ',')} h/nuit` : ''}` }
    : { score: null, info: 'pas de donnée' };

  // Famille : jours avec un vrai moment (journal) + temps avec Ibrahim
  const famDays = esprit.filter(d => (d.famille ?? []).length).length;
  const kid = await import('./ai-util.js').then(m => m.kvJson<Array<{ date: string; minutes: number }>>('kouider:kid:log', [])).catch(() => []);
  const kidMin = kid.filter(k => k.date > from && k.date <= today).reduce((a, k) => a + (k.minutes || 0), 0);
  const famMoments = esprit.flatMap(d => d.famille ?? []).slice(-2);
  const famille: Pilier = esprit.length || kidMin || count('pere')
    ? { score: c(famDays / 5 * 8 + Math.min(2, kidMin / 60) + Math.min(2, count('pere') * 0.5)),
        info: `${famDays} jour(s) avec un vrai moment en famille${kidMin ? ` · ${kidMin} min avec Ibrahim` : ''}${famMoments.length ? ` (ex. ${famMoments.join(' ; ').slice(0, 120)})` : ''}` }
    : { score: null, info: 'pas de donnée' };

  // 28/11 Kouider : « pas de truc sur les amis, que la famille et l'argent, pas le temps de faire des amis » → pilier Amis retiré
  return { Business: business, Santé: sante, Famille: famille };
}
async function piliers(): Promise<Record<string, number>> {
  const d = await piliersDetail();
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.score ?? 0]));
}
export async function piliersNow(): Promise<Record<string, number>> { return piliers(); }
export async function equilibre(): Promise<string> {
  const p = await piliersDetail();
  const bar = (n: number) => '█'.repeat(n) + '░'.repeat(10 - n);
  const scored = Object.entries(p).filter(([, v]) => v.score != null) as Array<[string, { score: number; info: string }]>;
  const weak = scored.sort((a, b) => a[1].score - b[1].score)[0];
  const lines = Object.entries(p).map(([k, v]) => `${k} ${v.score != null ? `${bar(v.score)} ${v.score}/10` : '— pas de donnée'}\n   ${v.info}`);
  const facts = Object.entries(p).map(([k, v]) => `${k} : ${v.score ?? '?'}/10 — ${v.info}`).join('\n');
  const tip = weak ? await ai(`Ses vrais chiffres de la semaine :\n${facts}\nPilier le plus faible : ${weak[0]}. Donne EXACTEMENT 2 lignes : 2 actions très concrètes pour la semaine prochaine, basées sur CES chiffres (cite-les), ton encourageant (pas de reproche). Rien d'inventé, pas de nom de célébrité.`, { system: COACH_SYS, max: 200 }).catch(() => '') : '';
  return ['⚖️ Équilibre de ta semaine (tes vraies données, 7 derniers jours)', ...lines, weak ? `\nÀ renforcer : ${weak[0]}.` : '', tip].filter(Boolean).join('\n').trim();
}

// L9 — Mode tempête
export async function tempete(text: string): Promise<string> {
  const storms = SAGES.filter(s => s.storm).sort(() => Math.random() - 0.5).slice(0, 3);
  const wins = await import('./grand-coach-plus.js').then(m => m.winsPick(3)).catch(() => '');
  const out = await ai(`Kouider traverse un moment dur : « ${text || 'journée difficile'} ».\nHistoires vraies :\n${storms.map(s => `- ${s.name} : ${s.storm}`).join('\n')}\n\nRéponds en 8-10 lignes : reconnais ce qu'il vit (sans dramatiser), raconte UNE de ces histoires en 2 phrases, puis 3 étapes concrètes pour les prochaines 24 h (la 1re faisable dans l'heure). Termine par une phrase de force. Si c'est grave (santé, idées noires), dis-lui d'appeler un proche ou le 112 / 0800 32 123.`, { system: COACH_SYS, max: 500 });
  return wins ? `${out}\n\n${wins}` : out;
}

// ── Job planifié (*/15) ──────────────────────────────────────────────────────

export async function jobGrandCoach(): Promise<void> {
  const s = await settings();
  if (!s.on) return;
  const plus = await import('./grand-coach-plus.js');
  const { date, hhmm, weekday } = localNow();
  const toMin = (h: string) => +h.slice(0, 2) * 60 + +h.slice(3, 5);
  // Fenêtre souple de 90 min : s'il conduit ou a dit « ne me dérange pas », on réessaie au quart d'heure suivant (20 : le coach sait se taire)
  const at = (h: string, span = 90) => { const d = toMin(hhmm) - toMin(h); return d >= 0 && d < span; };
  const run = async (k: string, f: () => Promise<string | void>, o: { important?: boolean; silent?: boolean; voice?: boolean } = {}) => {
    if (await kvJson<string | null>(`gc:sent:${k}:${date}`, null)) return;
    if (!o.silent && !(await plus.canSpeak(o.important))) return;
    await kvPut(`gc:sent:${k}:${date}`, '1', 2 * 86_400);
    try {
      const t = await f();
      if (t && !o.silent) { await tg(t); await plus.spoke(); if (o.voice) await plus.sendVoice(await briefVoice()).catch(() => false); }
    } catch (e) { console.error(`[grand-coach] ${k}:`, e instanceof Error ? e.message : e); }
  };
  if (weekday === 1 && at('07:00')) await run('defi', async () => { await newDefi(); }, { silent: true });
  if (at('07:15')) await run('matin', morningMessage, { important: true, voice: true });
  const off = await dayOff();
  if (at('10:00', 600)) await run('principes', plus.failuresToLearn);
  if (!off && at('12:30')) await run('midi', middayCheck, { important: true });
  if (!off && at('16:00', 60)) await run('procrast', plus.antiProcrastination);
  if (!off && at('18:30')) await run('soir', eveningCheck, { important: true });
  if (at('21:30', 60)) await run('victoires', async () => { await plus.collectWins(); }, { silent: true });
  if (weekday === 5 && at('17:00')) await run('revue', revue);
  if (weekday === 6 && at('10:00')) await run('equilibre', async () => `${await equilibre()}\n\n${await plus.wordScore()}\n\n${await import('./grand-coach-futur.js').then(m => m.evolution()).catch(() => '')}`);
  if (weekday === 0 && at('22:00', 120)) await run('snapshot', async () => { await import('./grand-coach-futur.js').then(m => m.snapshot()); }, { silent: true });
  if (date.endsWith('-15') && at('09:00')) await run('futur', async () => import('./grand-coach-futur.js').then(m => m.futur()));
  if (weekday === 0 && at('10:00')) await run('ibrahim', plus.ibrahimQuestion);
  if (weekday === 2 && at('10:00')) await run('anciens', async () => { const t = await anciensClients(); return t.startsWith('😴') ? '' : t; });
  if (date.endsWith('-01') && at('09:00')) await run('mois', async () => {
    const m = plus.mentorOfMonth(date);
    return [`✉️ LETTRE DU KOUIDER DE 2036\n\n${await plus.letter2036()}`, '', await plus.versus30(), '', `👑 Ton mentor du mois : ${m.name} — ${m.principles[0]}. Tout ce mois-ci, demande-toi : « que ferait ${m.name} ? »`,
      '', await voitures(), '', await statut(), '', await plus.principles(), '', '🧭 Nouveau mois : relis ta vision (« ma vision ») et donne-moi ton objectif du mois.'].join('\n');
  });
}

// ── Contexte pour le cerveau ─────────────────────────────────────────────────

export async function grandCoachText(): Promise<string> {
  const date = localNow().date;
  const [b, d] = await Promise.all([kvJson<Big3 | null>(K.big3(date), null), currentDefi()]);
  return [
    b ? `GRAND COACH — ses 3 actions du jour : ${b.items.map((i, k) => `${k + 1}. ${i.text}${i.done ? ' (fait)' : ''}`).join(' ; ')}. Quand il dit « fait 1/2/3 » ou qu'il a fait l'une d'elles → outil grand_coach action fait n=… .` : '',
    d ? `Défi de la semaine : ${d.text}.` : '',
    'Après le bilan de 18h30, sa réponse aux 3 questions du soir → grand_coach action examen text=… .',
    'Réponses au coach → grand_coach : réponse à la « gym du vendeur » → action objection text ; règle tirée d\'un échec → principe ; réponse à la « lettre à Ibrahim » → ibrahim text ; « victoire : … » / il raconte une réussite → victoire ; ce qu\'il arrête (liste du mercredi) → stop text ; « j\'ai mis de côté » (défi épargne) → epargne op paid.',
  ].filter(Boolean).join('\n');
}

export async function grandCoachOverview() {
  const date = localNow().date;
  const [b, d, st, txt, vision, cercle, statutDone, pil] = await Promise.all([
    kvJson<Big3 | null>(K.big3(date), null), currentDefi(), kvJson<{ last: string; n: number }>(K.streak, { last: '', n: 0 }),
    kvJson<string | null>(K.text(date), null), kvJson<Record<string, string> | null>(K.vision, null), kvJson<Person[]>(K.cercle, []),
    kvJson<Record<string, string>>(K.statut, {}), piliers().catch(() => null),
  ]);
  return { text: txt, big3: b?.items ?? [], streak: st.last >= addDays(date, -1) ? st.n : 0, defi: d, vision, cercle, statut: { done: Object.keys(statutDone).length, total: STATUT_STEPS.length }, piliers: pil, sages: SAGES.map(s => s.name) };
}

// ── Outil ────────────────────────────────────────────────────────────────────

export async function grandCoachTool(input: Row): Promise<string> {
  const a = S(input['action'] || 'status');
  const text = S(input['text']).trim();
  switch (a) {
    case 'status': {
      const o = await grandCoachOverview();
      return [o.big3.length ? `💼 Actions du jour :\n${o.big3.map((i, k) => `${i.done ? '✅' : `${k + 1}.`} ${i.text}`).join('\n')}` : 'Actions du jour pas encore tirées (7h15).',
        `🏆 Série : ${o.streak} j`, o.defi ? `🔥 Défi : ${o.defi.text}` : '', `🏛️ Statut : ${o.statut.done}/${o.statut.total}`,
        o.piliers ? `⚖️ ${Object.entries(o.piliers).map(([k, v]) => `${k} ${v}/10`).join(' · ')}` : ''].filter(Boolean).join('\n');
    }
    case 'texte': return texteDuJour(input['force'] === true);
    case 'matin': return morningMessage();
    case 'tableau': return tableau();
    case 'rythme': return rythme(input);
    case 'voitures': return voitures();
    case 'actions': {
      const items = Array.isArray(input['items']) ? (input['items'] as unknown[]).map(String) : text ? text.split(/\n|;/).map(x => x.trim()).filter(Boolean) : [];
      if (items.length) { const b: Big3 = { date: localNow().date, items: items.slice(0, 3).map(t => ({ text: t })) }; await kvPut(K.big3(b.date), b, 3 * 86_400); return `✅ Tes 3 actions du jour :\n${big3Line(b)}`; }
      return big3Line(await makeBig3());
    }
    case 'fait': return big3Done(N(input['n']) || 1);
    case 'anciens_clients': return anciensClients();
    case 'repartition': return repartition(input);
    case 'deleguer': return deleguer(input);
    case 'statut': return statut(input);
    case 'revue': return revue();
    case 'tresorerie': return tresorerie();
    case 'grand': return grand(S(input['name']), text);
    case 'livre': return livre();
    case 'defi': {
      if (text) { const d: Defi = { week: weekKey(localNow().date), text, days: {} }; await kvPut(K.defi, d); return `🔥 Défi de la semaine : ${text}`; }
      const d = (await currentDefi()) ?? await newDefi();
      return `🔥 Défi de la semaine : ${d.text}\nCette semaine : ${Object.values(d.days).filter(Boolean).length} jour(s) réussi(s).`;
    }
    case 'defi_fait': {
      const d = (await currentDefi()) ?? await newDefi();
      d.days[localNow().date] = true; await kvPut(K.defi, d);
      return `🔥 Défi réussi aujourd'hui (${Object.values(d.days).filter(Boolean).length}/7 cette semaine).`;
    }
    case 'cercle': {
      const op = S(input['op'] || 'list');
      const l = await kvJson<Person[]>(K.cercle, []);
      const name = S(input['name']).trim();
      if (op === 'add' && name) { l.push({ name, role: S(input['role']) || 'contact', why: text, every: N(input['every']) || 30 }); await kvPut(K.cercle, l); return `🤝 ${name} ajouté à ton cercle d'or (${S(input['role']) || 'contact'}). Je te rappellerai de garder le lien.`; }
      if (op === 'vu' && name) { const p = l.find(x => x.name.toLowerCase().includes(name.toLowerCase())); if (!p) return `❌ ${name} n'est pas dans ton cercle.`; p.last = localNow().date; await kvPut(K.cercle, l); return `✅ Contact avec ${p.name} noté.`; }
      return l.length ? `🤝 Ton cercle d'or :\n${l.map(p => `• ${p.name} — ${p.role}${p.last ? ` (vu ${fmtD(p.last)})` : ' (pas encore contacté)'}`).join('\n')}\n\n${await cercleSuggestion()}` : `🤝 Ton cercle d'or est vide. Un grand businessman en Algérie a besoin de : ${CERCLE_ROLES.join(', ')}.`;
    }
    case 'examen': return text ? saveExamen(text) : '❌ text = ses réponses aux 3 questions du soir.';
    case 'vision': {
      if (text || input['ten'] || input['one'] || input['month']) {
        const v = { ...(await kvJson<Record<string, string>>(K.vision, {})), ...(input['ten'] ? { ten: S(input['ten']) } : {}), ...(input['one'] ? { one: S(input['one']) } : {}), ...(input['month'] ? { month: S(input['month']) } : {}), ...(text && !input['ten'] ? { ten: text } : {}), updated: localNow().date };
        await kvPut(K.vision, v); return `🧭 Vision enregistrée.\n10 ans : ${v['ten'] ?? '—'}\nCette année : ${v['one'] ?? '—'}\nCe mois : ${v['month'] ?? '—'}\nJe la relie à ton texte du matin.`;
      }
      const v = await kvJson<Record<string, string> | null>(K.vision, null);
      return v ? `🧭 Ta vision\n10 ans : ${v['ten'] ?? '—'}\nCette année : ${v['one'] ?? '—'}\nCe mois : ${v['month'] ?? '—'}` : '🧭 Pas encore de vision écrite. Réponds : où tu te vois dans 10 ans ? cette année ? ce mois ? (ex. « 10 ans : 30 voitures à Oran et Alger, une maison, libre ; cette année : 5 voitures ; ce mois : 3 000 € de CA »).';
    }
    case 'tempete': return tempete(text);
    case 'equilibre': return equilibre();
    case 'vocal': { const ok = await (await import('./grand-coach-plus.js')).sendVoice(await briefVoice()); return ok ? '🎧 Vocal du coach envoyé sur Telegram.' : '❌ Voix indisponible pour l\'instant.'; }
    case 'compte_a_rebours': return (await import('./grand-coach-plus.js')).countdown();
    case 'lettre_2036': return (await import('./grand-coach-plus.js')).letter2036();
    case 'premortem': return (await import('./grand-coach-plus.js')).premortem();
    case 'victoire': return text ? (await import('./grand-coach-plus.js')).addWin(text) : '❌ text = la victoire.';
    case 'victoires': return (await (await import('./grand-coach-plus.js')).winsPick(8)) || '🫙 Bocal vide pour l\'instant : dis « victoire : … » à chaque réussite.';
    case 'procrastination': return (await (await import('./grand-coach-plus.js')).antiProcrastination()) || '✅ Rien en retard aujourd\'hui.';
    case 'parole': return (await import('./grand-coach-plus.js')).wordScore();
    case 'negociation': return (await import('./grand-coach-plus.js')).negociation();
    case 'objection': return text ? (await import('./grand-coach-plus.js')).gradeObjection(text) : '❌ text = sa réponse à l\'objection.';
    case 'principe': return text ? (await import('./grand-coach-plus.js')).addPrinciple(text) : '❌ text = la règle qu\'il retient.';
    case 'principes': return (await import('./grand-coach-plus.js')).principles();
    case 'ibrahim': return text ? (await import('./grand-coach-plus.js')).ibrahimAnswer(text) : (await import('./grand-coach-plus.js')).ibrahimQuestion();
    case 'livre_ibrahim': return (await import('./grand-coach-plus.js')).ibrahimBook();
    case 'mentor': { const m = (await import('./grand-coach-plus.js')).mentorOfMonth(); return `👑 Mentor du mois : ${m.name} (${m.from})\n${m.story}\n• ${m.principles.join('\n• ')}\n➡️ ${m.fik}`; }
    case 'versus': return (await import('./grand-coach-plus.js')).versus30();
    case 'stop': return (await import('./grand-coach-plus.js')).stopDoing(text || undefined);
    case 'epargne': return (await import('./grand-coach-plus.js')).saving(input);
    case 'baraka': return (await import('./grand-coach-plus.js')).baraka();
    case 'geste': return (await import('./grand-coach-plus.js')).geste();
    case 'futur': return (await import('./grand-coach-futur.js')).futur();
    case 'evolution': { const f = await import('./grand-coach-futur.js'); if (!(await kvJson<unknown[]>('gc:evo', [])).length) await f.snapshot(); return f.evolution(); }
    case 'on': case 'off': { await kvPut(K.settings, { ...(await settings()), on: a === 'on' }); return a === 'on' ? '✅ Grand Coach activé.' : '⏸️ Grand Coach en pause (plus de messages planifiés).'; }
  }
  return '❌ action inconnue.';
}
