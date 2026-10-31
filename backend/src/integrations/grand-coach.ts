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
interface Big3 { date: string; items: Array<{ text: string; done?: boolean }> }
interface Defi { week: string; text: string; days: Record<string, boolean> }
interface Person { name: string; role: string; why?: string; last?: string; every: number }
interface Settings { on: boolean; hoursWeek: number; monthTarget?: number }

async function settings(): Promise<Settings> { return { on: true, hoursWeek: 15, ...(await kvJson<Partial<Settings>>(K.settings, {})) }; }
async function once(k: string, ttl = 2 * 86_400): Promise<boolean> {
  if (await kvJson<string | null>(`gc:sent:${k}`, null)) return false;
  await kvPut(`gc:sent:${k}`, '1', ttl);
  return true;
}
async function dayOff(): Promise<boolean> { return import('./kouider-dossier.js').then(m => m.isDayOff()).catch(() => false); }

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
  const [t, r0] = await Promise.all([tableau().catch(() => ''), rythme().catch(() => '')]);
  const r = r0.split('\n').filter(l => !/dis «/.test(l)).join('\n');
  const txt = await ai(`Tu es le coach business de Kouider (FIK Conciergerie : location de voitures à Oran pour la diaspora et les Algériens + FIK Sites : sites pour petits commerces ; il travaille encore en Belgique). Voici ses vrais chiffres :\n${t}\n${r}\n\nDonne EXACTEMENT 3 actions pour aujourd'hui qui font rentrer de l'argent ou en protègent (relancer, vendre, encaisser, publier, prospecter), chacune faisable en moins de 20 min depuis son téléphone. Une par ligne, sans numéro, sans intro, verbe à l'impératif, max 14 mots. N'invente aucun nom de client.`, { max: 200 }).catch(() => '');
  const items = txt.split('\n').map(l => l.replace(/^[\s\-•*\d.)]+/, '').trim()).filter(l => l.length > 12 && !/objectif du mois|dis «|^\d+\s*€/i.test(l)).slice(0, 3);
  const b: Big3 = { date, items: (items.length === 3 ? items : ['Relance un client qui n\'a pas encore payé', 'Publie la voiture libre demain en statut WhatsApp avec le prix', 'Envoie 5 messages de prospection FIK Sites']).map(text => ({ text })) };
  await kvPut(K.big3(date), b, 3 * 86_400);
  return b;
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
  const facts = `Semaine : ${cur.n} réservations (avant : ${prev.n}), CA réservé ${eur(cur.ca)} (avant ${eur(prev.ca)}), bénéfice ${eur(cur.pr)} (avant ${eur(prev.pr)}). Actions qui rapportent faites : ${done}/${total}.`;
  const lesson = await ai(`${facts}\nTu es le coach de Kouider (FIK, Oran). En 3 lignes max, tutoiement : 1) LA leçon de la semaine 2) LA décision à prendre pour la semaine prochaine (une seule, concrète). Appuie-toi sur un principe d'un grand entrepreneur (nomme-le). N'invente aucun chiffre.`, { max: 220 }).catch(() => '');
  return [`🗂️ Revue du patron — semaine du ${fmtD(a)}`, `${arrow(cur.n, prev.n)} Réservations : ${cur.n} (avant ${prev.n})`, `${arrow(cur.ca, prev.ca)} CA réservé : ${eur(cur.ca)} (avant ${eur(prev.ca)})`,
    `${arrow(cur.pr, prev.pr)} Bénéfice : ${eur(cur.pr)} (avant ${eur(prev.pr)})`, `🎯 Actions qui rapportent : ${done}/${total}`, lesson ? `\n${lesson}` : '', `\n${await tresorerie().catch(() => '')}`].join('\n').trim();
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
  return [`🏦 Trésorerie 30 jours`, `• À encaisser : ${eur(toCash)} (${future.length} location(s) à venir)`, `• À reverser aux propriétaires : ${eur(owners)}`,
    `• Frais habituels (moyenne/mois) : ${eur(monthlyCosts)}`, `= ${net >= 0 ? '🟢' : '🔴'} ${eur(net)} sur 30 jours`,
    net < 0 ? '⚠️ Mois serré : relance les impayés et vends 2-3 jours de location avant toute dépense.' : 'Bien. Mets la part épargne de côté avant qu\'elle disparaisse.'].join('\n');
}

// ── COACH DE VIE ─────────────────────────────────────────────────────────────

function sageOfDay(date: string, used: string[]): Sage {
  const fresh = SAGES.filter(s => !used.slice(-12).includes(s.id));
  const pool = fresh.length ? fresh : SAGES;
  return pool[Math.floor(Date.parse(date) / 86_400_000) % pool.length]!;
}
const sageText = (s: Sage) => `${s.name} (${s.from}) — ${s.story}\nPrincipes : ${s.principles.join(' ; ')}\nPour Kouider : ${s.fik}${s.storm ? `\nÉpreuve : ${s.storm}` : ''}`;
const COACH_SYS = `Tu es le GRAND COACH de Kouider : déterminé, chaleureux, exigeant, comme un grand frère qui a lu la vie de tous les grands entrepreneurs. Kouider : Algérien d'Oran installé en Belgique, marié, un fils (Ibrahim, 1 an et demi), il bâtit FIK Conciergerie (location de voitures à Oran) et FIK Sites, sport le matin, et il veut devenir un grand businessman en Algérie : indépendant, bon statut, bien financièrement, quitter la Belgique fin 2028. Tutoiement, phrases courtes, français simple. Jamais de nutrition ni de médicaments. N'invente ni chiffre, ni citation douteuse, ni nom de client.`;

// L1 — Texte du matin
export async function texteDuJour(force = false): Promise<string> {
  const date = localNow().date;
  if (!force) { const t = await kvJson<string | null>(K.text(date), null); if (t) return t; }
  const used = await kvJson<string[]>(K.used, []);
  const sage = sageOfDay(date, used);
  const off = await dayOff();
  const [vision, ex, pil] = await Promise.all([kvJson<{ ten?: string; one?: string; month?: string } | null>(K.vision, null), kvJson<Record<string, string>>(K.examen, {}), piliers().catch(() => null)]);
  const lastExam = Object.entries(ex).sort().at(-1);
  const weak = pil ? Object.entries(pil).sort((a, b) => a[1] - b[1])[0]?.[0] : '';
  const body = await ai(`${sageText(sage)}\n\n${vision ? `Sa vision : 10 ans = ${vision.ten ?? '?'} ; cette année = ${vision.one ?? '?'} ; ce mois = ${vision.month ?? '?'}.` : ''}\n${lastExam ? `Son examen d'hier soir : ${lastExam[1]}` : ''}\n${weak ? `Pilier le plus faible cette semaine : ${weak}.` : ''}\nAujourd'hui : ${off ? 'JOUR DE CONGÉ en famille (pas de business, sauf urgence)' : 'jour de travail'}.\n\nÉcris son TEXTE DE MOTIVATION DU JOUR (8 à 12 lignes) :\n- commence par l'histoire vraie de ${sage.name} en 2-3 phrases qui accrochent\n- la leçon à appliquer AUJOURD'HUI dans SA vie (business, sport, famille ou amis selon le jour et son pilier faible)\n- finis par une phrase forte de détermination\nPas de titre, pas de liste à puces.`, { system: COACH_SYS, max: 600 }).catch(() => '');
  const text = body || `${sage.name} — ${sage.story}\n\n${sage.fik}\n\nAujourd'hui, une seule règle : avance, même d'un petit pas. Les grands ne sont pas nés grands, ils ont continué.`;
  await kvPut(K.used, [...used, sage.id].slice(-30));
  await kvPut(K.text(date), text, 3 * 86_400);
  return text;
}

async function morningMessage(): Promise<string> {
  const off = await dayOff();
  const [txt, defi, book] = await Promise.all([texteDuJour(), currentDefi(), livre().catch(() => '')]);
  const parts = [`☀️ LE GRAND COACH — ${fmtD(localNow().date)}`, '', txt];
  if (!off) {
    const [b3, r] = await Promise.all([makeBig3(), rythme().catch(() => '')]);
    parts.push('', '💼 TES 3 ACTIONS QUI RAPPORTENT AUJOURD\'HUI (réponds « fait 1 », « fait 2 »…) :', big3Line(b3), '', r);
    const rep = await repartition().catch(() => '');
    if (rep && !rep.includes('Rien d\'encaissé')) parts.push('', rep);
  } else parts.push('', '👨‍👩‍👦 Jour de congé : téléphone loin, ta femme et Ibrahim d\'abord. Dzaryx garde la boutique.');
  if (defi) parts.push('', `🔥 Défi de la semaine : ${defi.text}`);
  if (book) parts.push('', book);
  return parts.join('\n');
}

// L2 — Suivi de la journée
async function middayCheck(): Promise<string> {
  const b = await makeBig3();
  const left = b.items.filter(i => !i.done);
  const weekday = localNow().weekday;
  const cercle = weekday === 2 ? await cercleSuggestion().catch(() => '') : '';
  if (!left.length) return `🕛 Point de midi : tes 3 actions sont déjà faites 🏆 Profite de l'après-midi pour une action bonus ou pour ta famille.${cercle ? `\n\n${cercle}` : ''}`;
  return `🕛 Point de midi — il te reste ${left.length} action(s) :\n${big3Line(b)}\nLa plus petite d'abord, maintenant, 10 minutes. Réponds « fait 2 » quand c'est fait.${cercle ? `\n\n${cercle}` : ''}`;
}
async function eveningCheck(): Promise<string> {
  const b = await makeBig3();
  const done = b.items.filter(i => i.done).length;
  const st = await kvJson<{ last: string; n: number }>(K.streak, { last: '', n: 0 });
  const verdict = done === 3 ? `🏆 3/3. Série : ${st.n} jour(s). Journée de champion.` : done ? `💪 ${done}/3. Pas parfait, mais tu as avancé. Demain on finit le travail.` : '😤 0/3 aujourd\'hui. Pas grave une fois — la règle des grands : jamais deux jours de suite.';
  return [`🌇 Bilan de ta journée`, big3Line(b), verdict, '', '📝 Examen du soir (Franklin, 2 min — réponds en un message) :', '1. Qu\'est-ce que j\'ai fait de bien aujourd\'hui ?', '2. Qu\'est-ce que je ferais mieux demain ?', '3. Pour qui j\'ai été là (famille, ami, client) ?'].join('\n');
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
  const idea = await ai(`Livre : « ${bk.title} » de ${bk.author}. Thèse : ${bk.thesis}\nDéjà donné ce mois : ${st.ideas.join(' | ') || 'rien'}.\nDonne UNE idée clé de ce livre (vraie, fidèle au livre) en 2 lignes + une question pour l'appliquer aujourd'hui à FIK ou à sa vie. Format : « 📚 ${bk.title} — jour ${st.ideas.length + 1} : … ➡️ … »`, { max: 200 }).catch(() => '');
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
async function piliers(): Promise<Record<string, number>> {
  const today = localNow().date;
  const votes = await kvJson<Record<string, Record<string, string[]>>>('life:votes', {});
  const ids = await kvJson<Array<{ name: string; kind: string }>>('life:identities', []);
  const count = (kind: string) => { let n = 0; for (let i = 0; i < 7; i++) { const v = votes[addDays(today, -i)] ?? {}; for (const id of ids.filter(x => x.kind === kind)) n += v[id.name]?.length ?? 0; } return n; };
  let done = 0, total = 0;
  for (let i = 0; i < 7; i++) { const b = await kvJson<Big3 | null>(K.big3(addDays(today, -i)), null); if (b) { total += 3; done += b.items.filter(x => x.done).length; } }
  const cercle = (await kvJson<Person[]>(K.cercle, [])).filter(p => p.last && p.last >= addDays(today, -7)).length;
  const ex = await kvJson<Record<string, string>>(K.examen, {});
  const friends = Object.entries(ex).filter(([d, t]) => d >= addDays(today, -7) && /ami|pote|fr[eè]re|s[oœ]ur|cousin|parent|m[eè]re|p[eè]re/i.test(t)).length;
  const c = (x: number) => Math.max(0, Math.min(10, Math.round(x)));
  return { Business: c(total ? done / total * 10 : count('business') * 2), Santé: c(count('forme') * 1.5), Famille: c(count('pere') * 1.5), Amis: c((cercle + friends) * 2.5) };
}
export async function equilibre(): Promise<string> {
  const p = await piliers();
  if (Object.values(p).reduce((x, y) => x + y, 0) <= 2) return '⚖️ Équilibre de ta semaine : pas encore assez de données (tout commence aujourd\'hui). Coche tes 3 actions (« fait 1 »), réponds à l\'examen du soir et dis-moi quand tu vois un proche : samedi prochain tu auras ton vrai score sur 10 pour le business, la santé, la famille et les amis.';
  const bar = (n: number) => '█'.repeat(n) + '░'.repeat(10 - n);
  const weak = Object.entries(p).sort((a, b) => a[1] - b[1])[0]!;
  const tip = await ai(`Pilier le plus faible de Kouider cette semaine : ${weak[0]} (${weak[1]}/10). Donne EXACTEMENT 2 lignes : 2 actions très concrètes pour la semaine prochaine, ton encourageant (pas de reproche), chacune inspirée d'un grand (nomme-le). Rien d'autre.`, { system: COACH_SYS, max: 160 }).catch(() => '');
  return ['⚖️ Équilibre de ta semaine (tes vraies données)', ...Object.entries(p).map(([k, v]) => `${k.padEnd(9)} ${bar(v)} ${v}/10`), `\nÀ renforcer : ${weak[0]}.`, tip].join('\n').trim();
}

// L9 — Mode tempête
export async function tempete(text: string): Promise<string> {
  const storms = SAGES.filter(s => s.storm).sort(() => Math.random() - 0.5).slice(0, 3);
  return ai(`Kouider traverse un moment dur : « ${text || 'journée difficile'} ».\nHistoires vraies :\n${storms.map(s => `- ${s.name} : ${s.storm}`).join('\n')}\n\nRéponds en 8-10 lignes : reconnais ce qu'il vit (sans dramatiser), raconte UNE de ces histoires en 2 phrases, puis 3 étapes concrètes pour les prochaines 24 h (la 1re faisable dans l'heure). Termine par une phrase de force. Si c'est grave (santé, idées noires), dis-lui d'appeler un proche ou le 112 / 0800 32 123.`, { system: COACH_SYS, max: 500 });
}

// ── Job planifié (*/15) ──────────────────────────────────────────────────────

export async function jobGrandCoach(): Promise<void> {
  const s = await settings();
  if (!s.on) return;
  const { date, hhmm, weekday } = localNow();
  const at = (h: string) => hhmm >= h && hhmm < `${h.slice(0, 3)}${String(+h.slice(3) + 15).padStart(2, '0')}`;
  const run = async (k: string, f: () => Promise<string | void>) => {
    if (!(await once(`${k}:${date}`))) return;
    try { const t = await f(); if (t) await tg(t); } catch (e) { console.error(`[grand-coach] ${k}:`, e instanceof Error ? e.message : e); }
  };
  if (weekday === 1 && at('07:00')) await run('defi', async () => { await newDefi(); });
  if (at('07:15')) await run('matin', morningMessage);
  const off = await dayOff();
  if (!off && at('12:30')) await run('midi', middayCheck);
  if (!off && at('18:30')) await run('soir', eveningCheck);
  if (weekday === 5 && at('17:00')) await run('revue', revue);
  if (weekday === 6 && at('10:00')) await run('equilibre', equilibre);
  if (weekday === 2 && at('10:00')) await run('anciens', async () => { const t = await anciensClients(); return t.startsWith('😴') ? '' : t; });
  if (date.endsWith('-01') && at('09:00')) await run('mois', async () => [await voitures(), '', await statut(), '', '🧭 Nouveau mois : relis ta vision (« ma vision ») et donne-moi ton objectif du mois.'].join('\n'));
}

// ── Contexte pour le cerveau ─────────────────────────────────────────────────

export async function grandCoachText(): Promise<string> {
  const date = localNow().date;
  const [b, d] = await Promise.all([kvJson<Big3 | null>(K.big3(date), null), currentDefi()]);
  return [
    b ? `GRAND COACH — ses 3 actions du jour : ${b.items.map((i, k) => `${k + 1}. ${i.text}${i.done ? ' (fait)' : ''}`).join(' ; ')}. Quand il dit « fait 1/2/3 » ou qu'il a fait l'une d'elles → outil grand_coach action fait n=… .` : '',
    d ? `Défi de la semaine : ${d.text}.` : '',
    'Après le bilan de 18h30, sa réponse aux 3 questions du soir → grand_coach action examen text=… .',
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
    case 'on': case 'off': { await kvPut(K.settings, { ...(await settings()), on: a === 'on' }); return a === 'on' ? '✅ Grand Coach activé.' : '⏸️ Grand Coach en pause (plus de messages planifiés).'; }
  }
  return '❌ action inconnue.';
}
