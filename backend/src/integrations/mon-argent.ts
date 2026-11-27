// MON ARGENT (27/11/2026, Kouider : « rajoute un chiffre d'affaires du cash que je fais sans FIK, le snus tous les jours…
// un système sur l'app où je note à chaque fois que je fais une vente ou autre +1 +10… ensuite il me fait un calcul global
// de tout mon argent… un récap des meilleurs jours et de ce qui m'a rapporté le plus… rien ne doit être visible pour d'autres »).
// 27/11 (2) : « le +1 c'est le nombre de pièces de snus : 6 € la pièce, 5 € pour certains clients, à partir de 10 c'est 50 €
// les 10 sauf certains clients (60 €) ; appartement = prix client − prix propriétaire comme les voitures ; vente de voiture et
// autre (heures sup) = je donne le montant ; un vrai suivi : il me conseille, avance ou recule mon départ, + 20 idées ».
// Même journal que Telegram (« snus 150 ») : app_kv perso:journal + perso:finances. FIK = bénéfice Kouider des réservations.
// Données PRIVÉES : aucun chiffre ici (dépôt public), route réservée au compte Kouider.
import { kvJson, kvPut, ai } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { supabase } from './supabase.js';

type Entry = { d: string; t: 'vente' | 'achat' | 'depense'; cat: string; amount: number; mode: 'cash' | 'carte'; note?: string; at?: number;
  qty?: number; unit?: number; tarif?: string; client?: number; owner?: number; label?: string };
const J = 'perso:journal';
export const SOURCES = [
  { id: 'snus', label: 'Snus', icon: '🟢' },
  { id: 'appartement', label: 'Appartement', icon: '🏠' },
  { id: 'vente-voiture', label: 'Vente voiture', icon: '🚘' },
  { id: 'autre', label: 'Autre / heures sup', icon: '➕' },
] as const;
/** Tarifs snus (27/11, corrigé par Kouider) : normal = pièces × 6 € (12 = 72 €) ; lot = dès 10 pièces 5 € la pièce, au-delà aussi
 *  (10 = 50 €, 11 = 55 €), sous 10 = 6 € ; « cinq » = une ristourne client à 5 € la pièce. */
export const SNUS_TARIFS = [
  { id: 'normal', label: 'Prix normal', hint: '6 € la pièce' },
  { id: 'lot', label: 'Lot dès 10', hint: '5 € la pièce dès 10' },
] as const;
export const snusPrice = (qty: number, tarif: string) => {
  const unit = tarif === 'cinq' ? 5 : tarif === 'six' ? 6 : tarif === 'lot' ? (qty >= 10 ? 5 : 6) : 6;
  return { unit, amount: qty * unit };
};
const LABEL: Record<string, string> = { cash: 'Autre (cash)', fik: 'Locations FIK', snus: 'Snus', appartement: 'Appartement', 'vente-voiture': 'Vente voiture', autre: 'Autre / heures sup' };
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const wd = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ymLabel = (ym: string) => `${MOIS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

/** Bénéfice FIK de Kouider, au jour de début de location (réservations non annulées). */
async function fikEntries(since: string): Promise<Array<{ d: string; amount: number; label: string }>> {
  const { data } = await supabase.from('bookings').select('client_name, start_date, status, profit, profit_kouider, cars(name)').gte('start_date', since);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter(b => !/CANCEL|REJECT|ANNUL/i.test(String(b['status'])))
    .map(b => ({ d: String(b['start_date']).slice(0, 10), amount: Number(b['profit_kouider'] ?? b['profit'] ?? 0) || 0,
      label: `${String(b['client_name'] ?? '')} · ${String((b['cars'] as { name?: string } | null)?.name ?? '')}` }))
    .filter(e => e.amount > 0);
}

/** Plan Algérie (date de départ possible) : calcul lourd → gardé 6 h. */
async function departPlan(): Promise<{ moveAt: string | null; upfront: number; rate: number } | null> {
  const c = await kvJson<{ at: number; v: { moveAt: string | null; upfront: number; rate: number } } | null>('perso:argent:plan', null);
  if (c && Date.now() - c.at < 6 * 3600_000) return c.v;
  try {
    const p = await (await import('./algerie-plan.js')).buildPlan();
    const v = { moveAt: p.moveAt, upfront: Math.round(p.upfrontTotal + p.fundAtMove), rate: p.rate };
    await kvPut('perso:argent:plan', { at: Date.now(), v });
    return v;
  } catch { return c?.v ?? null; }
}

export async function monArgentOverview() {
  const today = localNow().date, m0 = `${today.slice(0, 7)}-01`, since = addDays(today, -365);
  const pm0 = `${addDays(m0, -1).slice(0, 7)}-01`, pmEnd = addDays(m0, -1);
  const [journal, fin, fik, plan] = await Promise.all([
    kvJson<Entry[]>(J, []),
    kvJson<{ savings?: number; sideCash?: number; savingsAt?: string; sideCashAt?: string; salary?: number; monthlySaving?: number; side?: { order?: { pieces?: number; cost?: number; everyDays?: number } } }>('perso:finances', {}),
    fikEntries(since), departPlan(),
  ]);
  const sales = journal.filter(e => e.t === 'vente' && e.d >= since).map(e => ({ ...e, cat: e.cat === 'fik' ? 'autre' : e.cat }));
  const all = [...sales.map(s => ({ d: s.d, cat: s.cat, amount: s.amount })), ...fik.map(f => ({ d: f.d, cat: 'fik', amount: f.amount }))];
  const sum = (l: Array<{ amount: number }>) => r2(l.reduce((s, e) => s + e.amount, 0));
  const bySource = (l: typeof all) => Object.entries(l.reduce<Record<string, number>>((m, e) => { m[e.cat] = (m[e.cat] ?? 0) + e.amount; return m; }, {}))
    .map(([id, v]) => ({ id, label: LABEL[id] ?? id, amount: r2(v) })).sort((a, b) => b.amount - a.amount);
  const mon = addDays(today, -((wd(today) + 6) % 7));
  const perDay = new Map<string, number>();
  for (const e of all) perDay.set(e.d, (perDay.get(e.d) ?? 0) + e.amount);
  const bestDays = [...perDay].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, v]) => ({ d, amount: r2(v), day: DAYS[wd(d)] }));
  const wk = DAYS.map((name, i) => { const ds = [...perDay].filter(([d]) => wd(d) === i); return { name, avg: ds.length ? r2(ds.reduce((s, [, v]) => s + v, 0) / ds.length) : 0, n: ds.length }; });
  // 30 derniers jours, empilés par source
  const last30 = Array.from({ length: 30 }, (_, k) => { const d = addDays(today, k - 29); const l = all.filter(e => e.d === d);
    return { d, amount: sum(l), parts: bySource(l).map(x => ({ id: x.id, amount: x.amount })) }; });
  // 6 derniers mois
  const months6 = Array.from({ length: 6 }, (_, k) => { const dt = new Date(`${m0}T12:00:00Z`); dt.setUTCMonth(dt.getUTCMonth() - (5 - k)); const ym = dt.toISOString().slice(0, 7);
    const l = all.filter(e => e.d.startsWith(ym)); return { ym, label: MOIS[+ym.slice(5, 7) - 1]!, amount: sum(l), parts: bySource(l).map(x => ({ id: x.id, amount: x.amount })) }; });

  // ── Snus ──
  const snus = sales.filter(e => e.cat === 'snus');
  const pieces = (l: Entry[]) => l.reduce((s, e) => s + (e.qty ?? Math.round(e.amount / 6)), 0);
  const o = fin.side?.order;
  const costPiece = o?.pieces && o.cost ? o.cost / o.pieces : null;
  const snusMonth = snus.filter(e => e.d >= m0), snusPrev = snus.filter(e => e.d >= pm0 && e.d <= pmEnd);
  const pM = pieces(snusMonth), aM = sum(snusMonth);
  const avgUnit = pM ? aM / pM : null;
  const discount = snusMonth.reduce((s, e) => s + (e.qty ? e.qty * 6 - e.amount : 0), 0);
  const days7 = snus.filter(e => e.d > addDays(today, -7));
  const perDayPieces = pieces(days7) / 7;
  const snusStats = { today: pieces(snus.filter(e => e.d === today)), todayEur: sum(snus.filter(e => e.d === today)), week: pieces(snus.filter(e => e.d >= mon)),
    month: pM, monthEur: aM, prevMonthEur: sum(snusPrev), avgUnit: avgUnit ? r2(avgUnit) : null, costPiece: costPiece ? r2(costPiece) : null,
    marginPiece: avgUnit && costPiece ? r2(avgUnit - costPiece) : null, discount: r2(discount), perDay: r2(perDayPieces) };

  const dep = journal.filter(e => e.t === 'depense' || e.t === 'achat');
  const depMonth = sum(dep.filter(e => e.d >= m0));
  const savings = fin.savings ?? 0, cash = fin.sideCash ?? 0, total = savings + cash;
  const monthTotal = sum(all.filter(e => e.d >= m0)), prevTotal = sum(all.filter(e => e.d >= pm0 && e.d <= pmEnd));
  const dom = +today.slice(8, 10), dim = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();

  // ── Départ (plan Algérie) ──
  const depart = plan ? {
    moveAt: plan.moveAt, label: plan.moveAt ? ymLabel(plan.moveAt) : null, upfront: plan.upfront,
    pct: plan.upfront ? Math.min(100, Math.round(total / plan.upfront * 100)) : null,
  } : null;

  const insights = buildInsights({ today, dom, dim, snusStats, monthTotal, prevTotal, total, savings, cash, depMonth, fin, wk, bestDays, months6, depart, perDay, all, order: o, fikMonth: sum(fik.filter(e => e.d >= m0)) });

  return {
    balances: { compte: savings, cash, total, compteAt: fin.savingsAt ?? null, cashAt: fin.sideCashAt ?? null },
    today: { total: sum(all.filter(e => e.d === today)), bySource: bySource(all.filter(e => e.d === today)) },
    week: { total: sum(all.filter(e => e.d >= mon)) },
    month: { total: monthTotal, prev: prevTotal, pace: Math.round(monthTotal / Math.max(1, dom) * dim), bySource: bySource(all.filter(e => e.d >= m0)), depenses: depMonth },
    year: { total: sum(all), bySource: bySource(all) },
    snus: snusStats, depart, insights,
    bestDays, weekdays: wk, last30, months6,
    recent: sales.filter(s => s.at).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 25)
      .map(s => ({ at: s.at!, d: s.d, cat: s.cat, label: s.label || (LABEL[s.cat] ?? s.cat), amount: s.amount, qty: s.qty ?? null, unit: s.unit ?? null })),
    sources: SOURCES, tarifs: SNUS_TARIFS,
  };
}

// ── 20 repères calculés (pas d'IA) : ce à quoi il n'aurait pas pensé ─────────────────────────────────────────
type Ins = { icon: string; title: string; text: string; tone: 'ok' | 'warn' | 'info' };
function buildInsights(x: {
  today: string; dom: number; dim: number; snusStats: { month: number; monthEur: number; prevMonthEur: number; avgUnit: number | null; costPiece: number | null; marginPiece: number | null; discount: number; perDay: number; week: number };
  monthTotal: number; prevTotal: number; total: number; savings: number; cash: number; depMonth: number;
  fin: { salary?: number; monthlySaving?: number }; wk: Array<{ name: string; avg: number; n: number }>; bestDays: Array<{ d: string; amount: number }>;
  months6: Array<{ ym: string; amount: number }>; depart: { label: string | null; upfront: number; pct: number | null } | null;
  perDay: Map<string, number>; all: Array<{ d: string; cat: string; amount: number }>; order?: { pieces?: number; cost?: number; everyDays?: number }; fikMonth: number;
}): Ins[] {
  const out: Ins[] = [];
  const s = x.snusStats;
  const push = (icon: string, title: string, text: string, tone: Ins['tone'] = 'info') => out.push({ icon, title, text, tone });
  // 1. Marge réelle par pièce
  if (s.marginPiece != null && s.costPiece != null) push('🧮', 'Ta vraie marge par pièce', `Tu vends en moyenne ${s.avgUnit!.toFixed(2)} € la pièce, elle te coûte ${s.costPiece.toFixed(2)} € : il te reste ${s.marginPiece.toFixed(2)} € par pièce.`, s.marginPiece > 1.5 ? 'ok' : 'warn');
  // 2. Bénéfice snus du mois (après stock)
  if (s.costPiece != null && s.month) push('💶', 'Bénéfice snus du mois', `${s.month} pièces vendues = ${eur(s.monthEur)} encaissés, dont ${eur(s.month * s.costPiece)} de stock : ${eur(s.monthEur - s.month * s.costPiece)} de vrai bénéfice.`, 'ok');
  // 3. Coût des ristournes
  if (s.discount > 0) push('🏷️', 'Ce que te coûtent les ristournes', `Ce mois, les prix à 5 € t'ont fait ${eur(s.discount)} de moins qu'à 6 €. Garde-les pour les gros clients fidèles.`, s.discount > 50 ? 'warn' : 'info');
  // 4. Prochaine commande de stock
  if (x.order?.pieces && s.perDay > 0) push('📦', 'Prochaine commande', `À ${s.perDay.toFixed(1)} pièces/jour, un stock de ${x.order.pieces} pièces dure ≈ ${Math.round(x.order.pieces / s.perDay)} jours. Prévois ${eur(x.order.cost ?? 0)} de côté avant.`);
  // 5. Fin de mois au rythme actuel
  const pace = Math.round(x.monthTotal / Math.max(1, x.dom) * x.dim);
  push('📈', 'Fin du mois à ce rythme', `${eur(x.monthTotal)} gagnés en ${x.dom} jours → ≈ ${eur(pace)} fin du mois${x.prevTotal ? ` (mois dernier : ${eur(x.prevTotal)})` : ''}.`, x.prevTotal && pace < x.prevTotal ? 'warn' : 'ok');
  // 6. Comparaison avec le mois dernier au même jour
  const prevSameDay = x.all.filter(e => { const d = new Date(`${x.today.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); const ym = d.toISOString().slice(0, 7); return e.d.startsWith(ym) && +e.d.slice(8, 10) <= x.dom; }).reduce((a, e) => a + e.amount, 0);
  if (prevSameDay > 0) { const diff = x.monthTotal - prevSameDay; push(diff >= 0 ? '🚀' : '🐢', 'Par rapport au mois dernier', `Au ${x.dom} du mois dernier tu étais à ${eur(prevSameDay)} : tu es ${diff >= 0 ? 'en avance' : 'en retard'} de ${eur(Math.abs(diff))}.`, diff >= 0 ? 'ok' : 'warn'); }
  // 7. Meilleur jour de la semaine
  const bw = [...x.wk].filter(w => w.n >= 2).sort((a, b) => b.avg - a.avg)[0];
  if (bw) push('📅', 'Ton jour le plus rentable', `Le ${bw.name.toLowerCase()} rapporte en moyenne ${eur(bw.avg)}. Prépare ton stock la veille et préviens tes clients fidèles ce jour-là.`);
  // 8. Jours sans rien noté ce mois
  const noted = new Set(x.all.filter(e => e.d.startsWith(x.today.slice(0, 7))).map(e => e.d)).size;
  if (x.dom - noted >= 3) push('📝', 'Jours sans rien noté', `${x.dom - noted} jours sur ${x.dom} sans vente notée ce mois. Si tu as vendu, note-le : sinon tes chiffres sont faux.`, 'warn');
  // 9. Coussin de sécurité
  const monthly = x.depMonth > 0 ? x.depMonth / Math.max(1, x.dom) * 30 : (x.fin.salary ?? 0);
  if (monthly > 0) { const mths = x.total / monthly; push('🛟', 'Coussin de sécurité', `Avec ${eur(x.total)}, tu tiens ≈ ${mths.toFixed(1)} mois sans aucun revenu (à ${eur(monthly)}/mois de dépenses).`, mths >= 6 ? 'ok' : 'warn'); }
  // 10. Cash qui dort
  if (x.cash >= 1500) push('💤', 'Cash qui dort', `${eur(x.cash)} en cash : au-delà d'un fond de caisse, mets le reste de côté (épargne ou projet) pour ne pas le dépenser sans t'en rendre compte.`, 'warn');
  // 11. Règle 50/30/20 sur ce que tu gagnes ce mois
  if (x.monthTotal > 0) push('🧺', 'Répartition conseillée du mois', `Sur ${eur(x.monthTotal)} : ${eur(x.monthTotal * 0.5)} pour avancer (FIK, projet), ${eur(x.monthTotal * 0.3)} d'épargne, ${eur(x.monthTotal * 0.2)} pour toi et ta famille.`);
  // 12. Taux d'épargne
  if (x.depMonth > 0 && x.monthTotal > 0) { const rate = Math.round((1 - x.depMonth / x.monthTotal) * 100); push('🐷', 'Ce que tu gardes', `Tu as gagné ${eur(x.monthTotal)} hors salaire et dépensé ${eur(x.depMonth)} noté : tu gardes ${rate} %.`, rate >= 30 ? 'ok' : 'warn'); }
  // 13. Départ
  if (x.depart?.label) push('🇩🇿', 'Départ pour Oran', `Au rythme actuel : ${x.depart.label}, maison et voiture payées. Tu as ${x.depart.pct ?? 0} % de la somme (${eur(x.depart.upfront)}).`, 'info');
  // 14. Ce qu'une pièce de plus par jour change
  if (s.marginPiece) push('⏩', '1 pièce de plus par jour', `+1 pièce vendue par jour = +${eur(s.marginPiece * 30)} de bénéfice par mois, ${eur(s.marginPiece * 365)} par an de plus vers ton départ.`);
  // 15. Meilleur mois
  const bm = [...x.months6].sort((a, b) => b.amount - a.amount)[0];
  if (bm && bm.amount > 0) push('🏆', 'Ton meilleur mois', `${ymLabel(bm.ym)} : ${eur(bm.amount)}. ${bm.ym === x.today.slice(0, 7) ? 'C\'est ce mois-ci, continue !' : `Il te manque ${eur(Math.max(0, bm.amount - x.monthTotal))} pour le battre.`}`, bm.ym === x.today.slice(0, 7) ? 'ok' : 'info');
  // 16. Record du jour
  if (x.bestDays[0]) push('🥇', 'Ton record d\'un jour', `${eur(x.bestDays[0].amount)} le ${x.bestDays[0].d.slice(8, 10)}/${x.bestDays[0].d.slice(5, 7)}. Qu'est-ce qui s'est passé ce jour-là ? Refais-le.`);
  // 17. Part de FIK
  if (x.monthTotal > 0) { const p = Math.round(x.fikMonth / x.monthTotal * 100); push('🚗', 'Part de FIK', `FIK = ${p} % de ce que tu gagnes ce mois. ${p < 30 ? 'Le snus porte tout : FIK doit monter pour que tu sois libre en Algérie (le snus s\'arrête là-bas).' : 'FIK pèse, c\'est ce revenu qui te suivra à Oran.'}`, p < 30 ? 'warn' : 'ok'); }
  // 18. Revenu qui te suivra en Algérie
  const algerie = x.all.filter(e => e.d.startsWith(x.today.slice(0, 7)) && (e.cat === 'fik' || e.cat === 'appartement')).reduce((a, e) => a + e.amount, 0);
  push('🧳', 'Ce qui te suivra à Oran', `Ce mois, ${eur(algerie)} viennent d'activités qui continuent en Algérie (FIK, appartement). Le snus et les heures sup s'arrêtent au départ.`, algerie > 0 ? 'info' : 'warn');
  // 19. Zakat (2,5 % de l'épargne si au-dessus du nissab, à vérifier)
  if (x.total > 6000) push('🤲', 'Zakat', `Sur ${eur(x.total)} gardés un an, la zakat serait ≈ ${eur(x.total * 0.025)} (2,5 %). Vérifie le nissab du jour (prix de l'or) avant de payer.`);
  // 20. Heure sup vs snus
  const hs = x.all.filter(e => e.cat === 'autre' && e.d.startsWith(x.today.slice(0, 7))).reduce((a, e) => a + e.amount, 0);
  if (hs > 0 && s.marginPiece) push('⏱️', 'Heures sup ou snus ?', `${eur(hs)} d'heures sup ce mois = ${Math.round(hs / s.marginPiece)} pièces de snus de bénéfice. Compare le temps que ça te prend.`);
  return out.slice(0, 20);
}

export async function monArgentAdd(input: { cat: string; amount?: number; qty?: number; tarif?: string; client?: number; owner?: number; label?: string; date?: string }): Promise<string> {
  const { cat } = input;
  if (!SOURCES.some(s => s.id === cat)) throw new Error('Source inconnue');
  const d = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '') ? input.date! : localNow().date;
  let e: Entry;
  if (cat === 'snus') {
    const qty = Math.round(Number(input.qty));
    if (!(qty >= 1 && qty <= 500)) throw new Error('Nombre de pièces invalide');
    const tarif = ['normal', 'lot', 'cinq', 'six'].includes(String(input.tarif)) ? String(input.tarif) : 'normal';
    const p = snusPrice(qty, tarif);
    e = { d, t: 'vente', cat, amount: p.amount, mode: 'cash', note: 'app', at: Date.now(), qty, unit: p.unit, tarif };
  } else if (cat === 'appartement') {
    const client = Number(input.client), owner = Number(input.owner ?? 0);
    if (!(client > 0) || owner < 0 || owner > client) throw new Error('Prix client et prix propriétaire requis (client ≥ propriétaire)');
    e = { d, t: 'vente', cat, amount: r2(client - owner), mode: 'cash', note: 'app', at: Date.now(), client, owner, ...(input.label ? { label: String(input.label).slice(0, 60) } : {}) };
  } else {
    const amount = Number(input.amount);
    if (!(amount > 0 && amount <= 200_000)) throw new Error('Montant invalide');
    e = { d, t: 'vente', cat, amount: r2(amount), mode: 'cash', note: 'app', at: Date.now(), ...(input.label ? { label: String(input.label).slice(0, 60) } : {}) };
  }
  const l = await kvJson<Entry[]>(J, []);
  l.push(e); await kvPut(J, l);
  return cat === 'snus' ? `+${e.qty} pièce${e.qty! > 1 ? 's' : ''} de snus (${eur(e.amount)})` : cat === 'appartement' ? `Appartement : bénéfice ${eur(e.amount)}` : `+${eur(e.amount)} ${LABEL[cat]}`;
}

/** Annule une ligne ajoutée (repérée par son horodatage). */
export async function monArgentUndo(at: number): Promise<boolean> {
  const l = await kvJson<Entry[]>(J, []);
  const i = l.findIndex(e => e.at === at && e.t === 'vente');
  if (i < 0) return false;
  l.splice(i, 1); await kvPut(J, l);
  return true;
}

export async function monArgentBalances(compte?: number, cash?: number): Promise<void> {
  const f = await kvJson<Record<string, unknown>>('perso:finances', {});
  const d = localNow().date;
  await kvPut('perso:finances', { ...f, ...(compte != null && compte >= 0 ? { savings: Math.round(compte), savingsAt: d } : {}), ...(cash != null && cash >= 0 ? { sideCash: Math.round(cash), sideCashAt: d } : {}) });
  await kvPut('perso:argent:plan', null);   // le départ se recalcule avec les nouveaux soldes
}

/** Conseiller : « je veux lancer tel business » → il connaît son capital, ses revenus, son plan Algérie, cherche et conseille. */
export async function monArgentAdvise(question: string): Promise<string> {
  const q = String(question ?? '').trim().slice(0, 600);
  if (q.length < 5) throw new Error('Écris ton idée ou ta question');
  const o = await monArgentOverview();
  const ctx = `Capital : ${eur(o.balances.total)} (compte ${eur(o.balances.compte)} + cash ${eur(o.balances.cash)}). Gagné hors salaire ce mois : ${eur(o.month.total)} (${o.month.bySource.map(s => `${s.label} ${eur(s.amount)}`).join(', ')}), mois dernier ${eur(o.month.prev)}. Dépenses notées ce mois : ${eur(o.month.depenses)}. `
    + `Snus : marge ${o.snus.marginPiece ?? '?'} €/pièce, ${o.snus.perDay} pièces/jour. Départ pour Oran prévu : ${o.depart?.label ?? 'non calculé'} (somme à réunir ${o.depart ? eur(o.depart.upfront) : '?'}).`;
  const sys = `Tu es le conseiller financier personnel de Kouider (salarié en Belgique, FIK location de voitures à Oran, il veut s'installer à Oran avec Fatima et Ibrahim). FAITS : FIK ne possède AUCUNE voiture : toutes les voitures louées appartiennent à Houari (Kouider touche la marge client − prix propriétaire) ; l'Audi Q3 est sa voiture perso de tous les jours, pas une voiture de location. Ne parle jamais de « ta 2e voiture FIK ». Tutoiement, phrases courtes, mots simples. Données PRIVÉES. Tu fais des calculs exacts à partir de SES chiffres, tu cherches les vrais prix et règles (Algérie/Belgique) si besoin, et tu ne promets rien. Jamais de conseil illégal.`;
  const prompt = `Ses chiffres réels : ${ctx}\n\nSa question / son idée : « ${q} »\n\nRéponds en 5 parties courtes : 1) Mon avis franc en 1 phrase. 2) Les chiffres (mise de départ, ce que ça peut rapporter par mois, en combien de temps c'est remboursé) — dis d'où viennent les prix. 3) L'effet sur sa date de départ pour Oran (avance / recule, de combien à peu près). 4) Les 3 risques. 5) La première action à faire cette semaine (petite, sans tout risquer).`;
  const r = await (await import('./ai-util.js')).research(prompt, { system: sys, rounds: 5, max: 1400, sessionId: 'mon-argent' }).catch(() => '');
  return r || await ai(prompt, { system: sys, max: 900 });
}

// ── FIK : quand les clients écrivent, combien de temps avant de réserver (27/11) ─────────────────────────────
const digits = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-9);
const brussels = (iso: string) => { const p = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)); return { h: Number(p.find(x => x.type === 'hour')?.value ?? 0), wd: new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Europe/Brussels' })).getDay() }; };

export async function fikInsights() {
  const dm = await import('./wa-demandes.js');
  const [wa, tt, { data: bk }] = await Promise.all([dm.listWaDemandes('whatsapp').catch(() => []), dm.listWaDemandes('tiktok').catch(() => []),
    supabase.from('bookings').select('client_name, client_phone, created_at, start_date, status').gte('created_at', '2026-01-01')]);
  const books = ((bk ?? []) as Array<Record<string, unknown>>).filter(b => !/CANCEL|REJECT/i.test(String(b['status'])));
  // Premier contact = 1er message WhatsApp/TikTok (même numéro) sinon la création de la réservation (site)
  const contacts = [...wa.map(d => ({ at: d.created_at, phone: digits(d.phone ?? d.chat), ch: 'WhatsApp' })), ...tt.map(d => ({ at: d.created_at, phone: '', ch: 'TikTok' }))];
  const firstByPhone = new Map<string, string>();
  for (const c of contacts) if (c.phone.length === 9 && (!firstByPhone.has(c.phone) || c.at < firstByPhone.get(c.phone)!)) firstByPhone.set(c.phone, c.at);
  const delays: number[] = [];
  for (const b of books) { const f = firstByPhone.get(digits(b['client_phone'])); const c = String(b['created_at']); if (f && f <= c) delays.push((Date.parse(c) - Date.parse(f)) / 3_600_000); }
  const events = [...contacts.map(c => c.at), ...books.filter(b => !firstByPhone.has(digits(b['client_phone']))).map(b => String(b['created_at']))].filter(Boolean);
  // Import groupé (plusieurs fiches créées la même minute) ≠ vrais messages clients : écarté
  const perMin = new Map<string, number>(); for (const iso of events) perMin.set(iso.slice(0, 16), (perMin.get(iso.slice(0, 16)) ?? 0) + 1);
  const real = events.filter(iso => (perMin.get(iso.slice(0, 16)) ?? 0) <= 2);
  const byWd = DAYS.map(name => ({ name, n: 0 })), byH = Array.from({ length: 24 }, (_, h) => ({ h, n: 0 }));
  for (const iso of real) { const t = brussels(iso); byWd[t.wd]!.n++; if (!/T12:00:00(\.000)?Z$/.test(iso)) byH[t.h]!.n++; }   // TikTok anciens : date seule (12:00) → pas d'heure
  // Réservations par mois (année en cours) : évolution
  const year = localNow().date.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, n: books.filter(b => String(b['start_date']).startsWith(`${year}-${String(i + 1).padStart(2, '0')}`)).length }));
  const med = delays.length ? delays.sort((a, b) => a - b)[Math.floor(delays.length / 2)]! : null;
  const bestWd = [...byWd].sort((a, b) => b.n - a.n)[0];
  const slots = [{ l: 'nuit (0h-7h)', a: 0, b: 7 }, { l: 'matin (7h-12h)', a: 7, b: 12 }, { l: 'après-midi (12h-18h)', a: 12, b: 18 }, { l: 'soir (18h-24h)', a: 18, b: 24 }]
    .map(s => ({ ...s, n: byH.slice(s.a, s.b).reduce((x, y) => x + y.n, 0) })).sort((a, b) => b.n - a.n);
  return { contacts: real.length, matched: delays.length, medianDelayH: med === null ? null : Math.round(med * 10) / 10,
    byWeekday: byWd, byHour: byH, bestWeekday: bestWd && bestWd.n ? bestWd.name : null, bestSlot: slots[0]?.n ? slots[0].l : null, months };
}

// ── PLAN PAR ÉTAPES (27/11) ──────────────────────────────────────────────────────────────────────────────────────
// Kouider : « au rythme actuel… il doit rajouter des phases, ex. maison Algérie 2027, voiture 2028, maison Belgique 2030,
// les trucs possibles à réaliser avec une vraie analyse ; quand je clique, plus d'infos ; un départ potentiel ; où je dois
// m'améliorer ; + 20 options ». Courbe d'épargne = projection réelle (algerie-plan → perso-projection, 3 scénarios).
type Goal = { id: string; name: string; icon: string; cost: number; fixed?: boolean };
const GOALS_KEY = 'perso:argent:goals';
const ymAdd = (ym: string, n: number) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
type Curves = { at: number; now: string; rate: number; curves: Array<{ name: string; curve: number[] }>; parts: Array<[string, number]>; fund: number; m0: Record<string, number>; aptPriceDa: number; aptRentDa: number; houseDa: number; carEur: number };

async function curves(force = false): Promise<Curves | null> {
  const c = await kvJson<Curves | null>('perso:argent:curves', null);
  if (!force && c && Date.now() - c.at < 6 * 3600_000) return c;
  try {
    const p = await (await import('./algerie-plan.js')).buildPlan();
    const v: Curves = { at: Date.now(), now: localNow().date.slice(0, 7), rate: p.rate, curves: p.belgium.scenarios.map(s => ({ name: s.name, curve: s.curve.map(Math.round) })),
      parts: p.upfront.map(([k, n]) => [k, Math.round(n)] as [string, number]), fund: Math.round(p.fundAtMove), m0: (p.belgium.months[0] ?? {}) as unknown as Record<string, number>,
      aptPriceDa: p.cfg.aptPriceDa, aptRentDa: p.cfg.aptRentDa, houseDa: p.cfg.houseDa, carEur: p.cfg.carEur };
    await kvPut('perso:argent:curves', v);
    return v;
  } catch { return c; }
}

/** Ses étapes : les défauts du plan Algérie + celles qu'il ajoute (ordre = ordre de réalisation). */
async function goals(c: Curves): Promise<Goal[]> {
  const saved = await kvJson<Goal[] | null>(GOALS_KEY, null);
  if (saved?.length) return saved;
  const part = (rx: RegExp) => c.parts.filter(([k]) => rx.test(k)).reduce((s, [, n]) => s + n, 0);
  return [
    { id: 'reserve', name: 'Réserve de sécurité (6 mois)', icon: '🛟', cost: c.fund, fixed: true },
    { id: 'voiture', name: 'Ta voiture en Algérie', icon: '🚙', cost: part(/voiture/i) },
    { id: 'maison', name: 'Maison en Algérie (frais + meubles)', icon: '🏡', cost: part(/maison|frais|meubles/i) },
    { id: 'depart', name: 'Déménagement → départ', icon: '✈️', cost: part(/déménag/i) },
  ].filter(g => g.cost > 0);
}
export async function setGoals(list: Goal[]): Promise<void> {
  const clean = list.filter(g => g && String(g.name).trim() && Number(g.cost) > 0).slice(0, 15)
    .map(g => ({ id: String(g.id || Math.random().toString(36).slice(2, 8)), name: String(g.name).slice(0, 60), icon: String(g.icon || '🎯').slice(0, 4), cost: Math.round(Number(g.cost)), ...(g.fixed ? { fixed: true } : {}) }));
  await kvPut(GOALS_KEY, clean);
}

/** 1er mois où la courbe (+ extra/mois) couvre la somme ; null = pas dans l'horizon. */
const reachAt = (curve: number[], need: number, extra = 0, from = 0) => { for (let i = from; i < curve.length; i++) if (curve[i]! + extra * i >= need) return i; return null; };
const MOISL = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ymL = (ym: string) => `${MOISL[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

export async function departDetail(force = false) {
  const c = await curves(force);
  if (!c) return null;
  const o = await monArgentOverview();
  const gl = await goals(c);
  const real = c.curves[1]?.curve ?? c.curves[0]!.curve, best = c.curves[0]!.curve, slow = c.curves[2]?.curve ?? real;
  const at = (i: number | null) => (i === null ? null : ymAdd(c.now, i));
  const lab = (i: number | null) => (i === null ? 'pas avant 10 ans' : ymL(at(i)!));
  // Étapes cumulées, dans l'ordre
  let cum = 0;
  const steps = gl.map(g => {
    cum += g.cost;
    const iR = reachAt(real, cum), iB = reachAt(best, cum), iS = reachAt(slow, cum);
    return { ...g, cumul: cum, at: at(iR), label: lab(iR), best: lab(iB), slow: lab(iS), done: o.balances.total >= cum,
      pct: Math.min(100, Math.round(o.balances.total / cum * 100)) };
  });
  const total = cum;
  const iDep = reachAt(real, total);
  // Leviers : combien de mois gagnés si + X €/mois
  const m0 = c.m0;
  const marge = o.snus.marginPiece ?? 2;
  const fikDay = 8;   // marge FIK moyenne par jour de location (fik-margins : 3-9 €/j)
  const lever = (label: string, perMonth: number, icon: string) => { const i = reachAt(real, total, perMonth); return { icon, label, perMonth: Math.round(perMonth), date: lab(i), gain: iDep !== null && i !== null ? iDep - i : null }; };
  const levers = [
    lever('+1 pièce de snus par jour', marge * 26, '🟢'),
    lever('+3 pièces de snus par jour', marge * 26 * 3, '🟢'),
    lever('+10 jours de location FIK par mois', fikDay * 10, '🚗'),
    lever('−100 € de dépenses par mois', 100, '✂️'),
    lever('−250 € de dépenses par mois', 250, '✂️'),
    lever('+1 dimanche d\'heures sup par mois', 150, '⏱️'),
    lever('Un appartement loué en plus (≈ +150 €/mois)', 150, '🏠'),
  ];
  // Où tu dois t'améliorer (calculé)
  const weak: Array<{ icon: string; text: string }> = [];
  const noted = o.last30.filter(d => d.amount > 0).length;
  if (noted < 15) weak.push({ icon: '📝', text: `Seulement ${noted} jours avec une vente notée sur 30 : ton plan est calculé sur des chiffres incomplets. Note chaque vente (bouton +1).` });
  if (!o.month.depenses) weak.push({ icon: '🧾', text: 'Aucune dépense notée ce mois : le plan suppose que tu dépenses tout le reste du salaire. Note tes grosses dépenses (« -200 courses ») pour un calcul juste.' });
  const fikShare = o.month.total ? (o.month.bySource.find(s => s.id === 'fik')?.amount ?? 0) / o.month.total : 0;
  if (fikShare < 0.3) weak.push({ icon: '🚗', text: `FIK = ${Math.round(fikShare * 100)} % de tes gains : le snus et les heures sup s'arrêtent au départ, FIK doit monter pour te faire vivre à Oran.` });
  if (o.balances.cash > 1500) weak.push({ icon: '💤', text: `${eur(o.balances.cash)} en cash : mets ce qui dépasse ton fond de caisse sur le compte, sinon ça part sans que tu le voies.` });
  if (o.month.prev && o.month.pace < o.month.prev) weak.push({ icon: '🐢', text: `Ce mois va finir plus bas que le précédent (${eur(o.month.pace)} contre ${eur(o.month.prev)}).` });
  // Repère de contrôle : où tu devrais être dans 3, 6, 12 mois pour tenir la date
  const checkpoints = [3, 6, 12].map(k => ({ label: ymL(ymAdd(c.now, k)), need: Math.round(real[k] ?? 0) }));
  // 20 options (calculées sur ses chiffres)
  const eurRate = (da: number) => da / c.rate;
  const opt: Array<{ icon: string; title: string; text: string }> = [];
  const add = (icon: string, title: string, text: string) => opt.push({ icon, title, text });
  const tgtYm = '2028-12', tgtI = Math.max(1, (+tgtYm.slice(0, 4) - +c.now.slice(0, 4)) * 12 + (+tgtYm.slice(5, 7) - +c.now.slice(5, 7)));
  const needMonthly = Math.max(0, (total - (real[tgtI] ?? 0)) / tgtI);
  add('🎯', 'Partir fin 2028 (ton objectif)', needMonthly > 0 ? `Il faudrait ${eur(needMonthly)} de plus par mois que ton rythme actuel, pendant ${tgtI} mois.` : 'Ton rythme actuel suffit pour partir fin 2028.');
  add('⚡', 'Au plus tôt / au plus tard', `Si tu gardes tout ton cash : ${lab(reachAt(best, total))}. Réaliste : ${lab(iDep)}. Si tu dépenses plus : ${lab(reachAt(slow, total))}.`);
  const house = steps.find(s => s.id === 'maison');
  if (house) {
    const cheaper = reachAt(real, total - house.cost * 0.2);
    add('🏘️', 'Maison 20 % moins chère', `Une maison à ${(c.houseDa * 0.8 / 1e6).toFixed(0)} M DA au lieu de ${(c.houseDa / 1e6).toFixed(0)} M : départ ${lab(cheaper)}${iDep !== null && cheaper !== null ? ` (${iDep - cheaper} mois plus tôt)` : ''}.`);
    const apport = total - house.cost * 0.8;
    add('🏦', 'Maison à crédit (apport 20 %)', `Avec un crédit en Algérie et 20 % d'apport, il te faut ${eur(apport)} au départ au lieu de ${eur(total)} : départ ${lab(reachAt(real, apport))}. Mais tu paies une mensualité à Oran : à étudier avec « plan Algérie crédit ».`);
  }
  const carStep = steps.find(s => s.id === 'voiture');
  if (carStep) add('🚙', 'Voiture d\'occasion en Algérie', `Une voiture à ${eur(carStep.cost * 0.6)} au lieu de ${eur(carStep.cost)} : départ ${lab(reachAt(real, total - carStep.cost * 0.4))}.`);
  add('💱', 'Le taux du dinar', `Ta maison est en dinars : si le square passe de ${Math.round(c.rate)} à ${Math.round(c.rate * 1.1)} DA/€, elle te coûte ${eur(eurRate(c.houseDa) - c.houseDa / (c.rate * 1.1))} de moins. Change ton argent quand le taux est haut (gold_watch suit le square).`);
  add('📈', 'Si les prix montent de 5 % par an', `Maison + voiture +5 %/an : il te faudrait ≈ ${eur(total * Math.pow(1.05, (iDep ?? 36) / 12))} au lieu de ${eur(total)} à ta date de départ. Acheter le terrain/la maison plus tôt protège de la hausse.`);
  const snusNet = (m0['side'] ?? 0);
  if (snusNet > 0) add('🔁', 'Remplacer le snus à Oran', `Le snus te rapporte ≈ ${eur(snusNet)}/mois et s'arrête au départ. Pour le remplacer avec FIK à ${fikDay} € de marge par jour, il faudrait ≈ ${Math.round(snusNet / fikDay / 30)} voitures louées en permanence : FIK seul ne suffira pas tout de suite, prévois un 2e revenu à Oran (appartement, projet).`);
  if (m0['salary']) add('💼', 'Remplacer ton salaire belge', `${eur(m0['salary'] + (m0['extra'] ?? 0))}/mois de salaire + heures sup = ≈ ${Math.round((m0['salary'] + (m0['extra'] ?? 0)) / fikDay / 30)} voitures FIK louées en permanence. À Oran tu en as besoin de moins (la vie coûte ≈ ${eur(eurRate(243_000))}/mois), mais il faut un vrai revenu là-bas.`);
  if (c.aptPriceDa && c.aptRentDa) add('🏢', 'Un appartement à louer à Oran', `Un appartement à ${(c.aptPriceDa / 1e6).toFixed(1)} M DA (${eur(eurRate(c.aptPriceDa))}) loué ${(c.aptRentDa / 1000).toFixed(0)} 000 DA/mois = ${eur(eurRate(c.aptRentDa))}/mois, remboursé en ≈ ${Math.round(c.aptPriceDa / c.aptRentDa / 12)} ans. À faire APRÈS la maison.`);
  add('🛟', 'Réserve 3 mois au lieu de 6', `Partir avec 3 mois de réserve au lieu de 6 : départ ${lab(reachAt(real, total - c.fund / 2))} — plus risqué si FIK met du temps à démarrer là-bas.`);
  add('🤲', 'La zakat dans ton plan', `Sur l'épargne que tu gardes un an : ≈ 2,5 % par an (≈ ${eur(o.balances.total * 0.025)} aujourd'hui), à prévoir chaque année dans le calcul.`);
  add('📊', 'Ton point de contrôle', `Pour tenir ${lab(iDep)}, tu dois avoir ≈ ${eur(checkpoints[0]!.need)} en ${checkpoints[0]!.label}, ${eur(checkpoints[1]!.need)} en ${checkpoints[1]!.label}, ${eur(checkpoints[2]!.need)} en ${checkpoints[2]!.label}.`);
  add('🧱', 'Acheter en 2 fois', `Terrain/maison d'abord (pendant que tu es encore salarié en Belgique), voiture juste avant de partir : tu profites plus longtemps de ton salaire belge pour finir.`);
  add('🧾', 'Frais cachés à prévoir', `Notaire + enregistrement (≈ 7 %), meubles, CASNOS, assurance CATNAT, école d'Ibrahim : déjà comptés dans « maison » et la réserve — vérifie les montants avec « plan Algérie ».`);
  add('🧓', 'Ton âge et ta retraite', 'En partant, tu arrêtes de cotiser en Belgique : demande un relevé de tes années (mypension.be) pour savoir ce que tu garderas, et cotise à la CASNOS à Oran.');
  add('👨‍👩‍👦', 'Ibrahim et l\'école', 'Le bon moment pour partir, c\'est aussi la rentrée scolaire : vise un départ en été pour qu\'Ibrahim commence l\'année à Oran.');
  add('🗂️', 'Papiers avant le départ', 'Passeports, carte consulaire, permis (échange en Algérie), relevés bancaires et fiches de paie : prépare-les 6 mois avant, c\'est ce qui retarde le plus souvent.');
  add('🏦', 'Compte en devises en Algérie', 'Un compte en devises (euros) à Oran te permet d\'apporter ton épargne proprement et de changer au bon moment.');
  add('🧪', 'Tester la vie à Oran', 'Avant de vendre quoi que ce soit en Belgique : 1 mois à Oran en vrai (dépenses réelles notées) pour vérifier les 243 000 DA/mois du plan.');
  add('🔒', 'Ce qui ne doit pas bouger', `Ton épargne du départ (${eur(o.balances.compte)}) ne sert qu'au départ : les nouveaux projets se financent avec ce qui rentre en plus, jamais avec elle.`);
  return {
    now: c.now, total, departLabel: lab(iDep), departBest: lab(reachAt(best, total)), departSlow: lab(reachAt(slow, total)),
    have: o.balances.total, pct: Math.min(100, Math.round(o.balances.total / Math.max(1, total) * 100)),
    steps, levers, weak, checkpoints, options: opt.slice(0, 20),
    curve: real.slice(0, 120).filter((_, i) => i % 3 === 0).map((v, k) => ({ ym: ymAdd(c.now, k * 3), v })),
  };
}
