// PROJECTION PERSO (01/11/2026, demande de Kouider : « où je serai d'ici 2028 » = un VRAI calcul, toutes charges déduites).
// Mois par mois jusqu'à la date visée : salaire + extras (heures sup) + revenu d'appoint NET (ventes − commandes de stock)
// + bénéfice FIK réel (réservations, saison de l'an dernier) − charges fixes (crédit qui s'arrête) − dépenses de vie.
// 3 scénarios selon la part du cash (appoint + FIK) qu'il garde. PDF avec graphiques → Telegram.
// PRIVÉ : tous les chiffres viennent d'app_kv (perso:finances) et de la base ; RIEN de personnel dans ce fichier (dépôt public).
import { kvJson } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { loadFinances, budget, type Finances } from './perso-finances.js';
import { supabase } from './supabase.js';
import { computeBookingFinancials } from './finance.js';

type Side = NonNullable<Finances['side']> & { daysPerWeek?: number; order?: { pieces?: number; cost: number; everyDays: number } };
type Entry = { d: string; t: 'vente' | 'achat' | 'depense'; cat: string; amount: number };
const W = 52 / 12;                                   // semaines par mois
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
const ymAdd = (ym: string, n: number) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ymLabel = (ym: string) => `${MOIS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

/** Bénéfice FIK net de Kouider par mois (12 derniers mois), calculé réservation par réservation (prix client − prix Houari). */
export async function fikMonthlyNet(): Promise<{ months: Array<{ m: string; net: number; ca: number; n: number; missing: number }>; avg: number; withData: number }> {
  const now = localNow().date.slice(0, 7);
  const from = ymAdd(now, -12);
  const { data } = await supabase.from('bookings')
    .select('start_date, end_date, nb_days, final_price, client_price_per_day, owner_price_per_day, paid_amount, rented_by, discount_applied, status')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])   // mêmes réservations que le rapport CA (phase5-finance)
    .gte('start_date', `${from}-01`).lt('start_date', `${now}-01`);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const months = Array.from({ length: 12 }, (_, i) => ({ m: ymAdd(from, i), net: 0, ca: 0, n: 0, missing: 0 }));
  for (const b of rows) {
    const mo = months.find(x => x.m === String(b['start_date']).slice(0, 7));
    if (!mo) continue;
    const f = computeBookingFinancials(b as unknown as Parameters<typeof computeBookingFinancials>[0]);
    mo.n++; mo.ca += f.final_price ?? 0;
    if (f.kouider_profit == null) mo.missing++; else mo.net += f.kouider_profit;
  }
  const first = months.findIndex(x => x.n > 0);
  const used = first < 0 ? [] : months.slice(first);
  const avg = used.length ? used.reduce((s, x) => s + x.net, 0) / used.length : 0;
  return { months, avg, withData: used.length };
}

export interface ProjMonth { m: string; salary: number; extra: number; side: number; fik: number; charges: number; living: number; fixedSave: number; biz: number; bizInvest: number }
export interface ProjBiz { name: string; partner?: string; share: number; perClient: number; clients: number; start: string; invest: number; monthly: number; offerName: string; perMonthFull: number }
export interface ProjOpts { target?: number; projet?: string; offer?: string; clients?: number; projetStart?: string; projetInvest?: number; quit?: string; clientsAfterQuit?: number }
/** « Quitter la librairie ? » : point de liberté calculé + scénario démission comparé à rester. */
export interface ProjFreedom {
  month: string | null; need: number; bizCashFull: number; fund: number;
  quitAt: string; clientsAfter: number; clientsAfterIsGuess: boolean; stayEnd: number; quitEnd: number; quitCurve: number[]; breakEven: number | null;
  stayMonthly: number; quitMonthly: number;
}
export interface Projection {
  until: string; start: number; months: ProjMonth[];
  sideSales: number; sideStock: number; sideNet: number; living: number; livingSource: string; fikAvg: number; fikWithData: number;
  scenarios: Array<{ name: string; keep: number; end: number; curve: number[] }>;
  creditEnd: string | null; creditAmount: number; hypotheses: string[]; warnings: string[];
  target?: number; biz?: ProjBiz; freedom?: ProjFreedom; base?: Array<{ name: string; end: number; curve: number[] }>;
}

export async function buildProjection(until = '2028-12', opts: ProjOpts = {}): Promise<Projection> {
  const f = await loadFinances();
  const side = f.side as Side | undefined;
  const b = budget(f);
  const fik = await fikMonthlyNet().catch(() => ({ months: [], avg: 0, withData: 0 }));
  const journal = await kvJson<Entry[]>('perso:journal', []);
  const now = localNow().date.slice(0, 7);
  const warnings: string[] = [];

  // Appoint : ventes/jour × jours/semaine − commandes de stock (prix d'une commande tous les N jours)
  const daily = side ? (side.dailyMin + side.dailyMax) / 2 : 0;
  const days = side?.daysPerWeek ?? 5;
  const sideSales = daily * days * W;
  const sideStock = side?.order ? side.order.cost * (365 / side.order.everyDays) / 12 : 0;
  if (side && !side.order) warnings.push('Coût du stock de l\'appoint inconnu : le revenu d\'appoint est compté SANS déduire les commandes.');
  const sideNet = sideSales - sideStock;

  // Dépenses de vie : son journal s'il y a au moins 2 mois notés, sinon tout ce qui reste du salaire après charges et épargne fixe
  const dep = journal.filter(e => e.t === 'depense');
  const depMonths = new Set(dep.map(e => e.d.slice(0, 7))).size;
  const living = depMonths >= 2 ? dep.reduce((s, e) => s + e.amount, 0) / depMonths : Math.max(0, b.rest);
  const livingSource = depMonths >= 2 ? `moyenne de ses dépenses notées (${depMonths} mois)` : 'hypothèse : il dépense tout ce qui reste du salaire + heures sup après charges fixes et épargne fixe';

  // Projet business en plus (« si j'ajoute le business avec Houari bof ») : sa part de la marge, montée en 3 mois
  let biz: ProjBiz | undefined;
  if (opts.projet !== undefined) {
    const pb = await (await import('./projets-business.js')).projetForProjection(opts.projet, opts.offer);
    if (!pb) warnings.push(`Projet « ${opts.projet} » introuvable : calcul fait sans.`);
    else {
      warnings.push(...pb.warnings);
      const clients = opts.clients && opts.clients > 0 ? opts.clients : 5;
      const start = /^\d{4}-\d{2}$/.test(opts.projetStart ?? '') ? opts.projetStart! : ymAdd(now, 2);
      const invest = opts.projetInvest !== undefined && opts.projetInvest >= 0 ? opts.projetInvest : pb.invest;
      if (opts.projetInvest !== undefined) for (let i = warnings.length - 1; i >= 0; i--) if (/mise de départ/.test(warnings[i]!)) warnings.splice(i, 1);
      biz = { name: pb.name, partner: pb.partner, share: pb.share, perClient: pb.perClient, clients, start, invest: invest * pb.share / 100,
        monthly: pb.monthly * pb.share / 100, offerName: pb.offerName, perMonthFull: (clients * pb.perClient - pb.monthly) * pb.share / 100 };
    }
  }
  const bizAt = (m: string, clients = biz?.clients ?? 0) => {
    if (!biz || m < biz.start) return 0;
    const k = (+m.slice(0, 4) - +biz.start.slice(0, 4)) * 12 + (+m.slice(5, 7) - +biz.start.slice(5, 7));
    return (clients * Math.min(1, (k + 1) / 3) * biz.perClient * biz.share / 100) - biz.monthly;   // 1/3, 2/3 puis 100 % des clients
  };

  const credit = f.charges.find(c => c.until && /crédit|credit|prêt|pret|leasing/i.test(c.label));
  const months: ProjMonth[] = [];
  for (let m = ymAdd(now, 1); m <= until; m = ymAdd(m, 1)) {
    const charges = f.charges.filter(c => !c.until || c.until >= m).reduce((s, c) => s + c.amount, 0);
    // FIK : même mois de l'an dernier (saison de la diaspora), sinon la moyenne
    const last = fik.months.find(x => x.m.slice(5) === m.slice(5) && x.n > 0);
    months.push({ m, salary: f.salary ?? 0, extra: b.extra, side: sideNet, fik: last ? last.net : fik.avg, charges, living, fixedSave: f.monthlySaving ?? 0, biz: bizAt(m), bizInvest: biz && m === biz.start ? biz.invest : 0 });
  }
  const start = (f.savings ?? 0) + (f.sideCash ?? 0);
  // Ce qui reste du salaire chaque mois (épargne fixe + crédit libéré) + la part GARDÉE du cash (appoint + FIK)
  const scen = (name: string, keep: number, withBiz = true) => {
    let acc = start; const curve = [acc];
    for (const x of months) { acc += (x.salary + x.extra - x.charges - x.living - (withBiz ? x.bizInvest : 0)) + keep * (x.side + x.fik + (withBiz ? x.biz : 0)); curve.push(acc); }
    return { name, keep, end: acc, curve };
  };
  const NAMES: Array<[string, number]> = [['Discipliné (tu gardes tout le cash)', 1], ['Réaliste (tu gardes 70 % du cash)', 0.7], ['Prudent (tu gardes 40 % du cash)', 0.4]];
  const scenarios = NAMES.map(([n, k]) => scen(n, k));
  const base = biz ? NAMES.map(([n, k]) => scen(n, k, false)) : undefined;

  // Quitter la librairie ? Point de liberté = 1er mois où (appoint + FIK + projet à plein régime) ≥ salaire + heures sup
  // ET où l'épargne (réaliste) couvre 6 mois de charges + vie. Puis scénario « démission » vs « je reste ».
  let freedom: ProjFreedom | undefined;
  if (biz && months.length) {
    const real = scenarios[1]!;
    const need = (f.salary ?? 0) + b.extra;
    const full = ymAdd(biz.start, 2);
    let month: string | null = null, fundAt = 0;
    months.forEach((x, k) => {
      if (month || x.m < full) return;
      const fund = 6 * (x.charges + x.living);
      if (0.7 * (x.side + fik.avg + x.biz) >= need && real.curve[k + 1]! >= fund) { month = x.m; fundAt = fund; }
    });
    const quitAt = /^\d{4}-\d{2}$/.test(opts.quit ?? '') ? opts.quit! : month ?? ymAdd(full, 1);
    const guess = !(opts.clientsAfterQuit && opts.clientsAfterQuit > 0);
    const clientsAfter = guess ? biz.clients * 2 : opts.clientsAfterQuit!;
    const sim = (cAfter: number) => {
      let acc = start; const curve = [acc];
      for (const x of months) {
        const q = x.m >= quitAt;
        acc += ((q ? 0 : x.salary + x.extra) - x.charges - x.living - x.bizInvest) + 0.7 * (x.side + x.fik + (q ? bizAt(x.m, cAfter) : x.biz));
        curve.push(acc);
      }
      return curve;
    };
    const quitCurve = sim(clientsAfter);
    let breakEven: number | null = null;
    for (let c = 1; c <= 300; c++) if (sim(c).at(-1)! >= real.end) { breakEven = c; break; }
    const ref = months.find(x => x.m >= quitAt) ?? months.at(-1)!;
    const bizFull = (c: number) => c * biz!.perClient * biz!.share / 100 - biz!.monthly;
    freedom = {
      month, need, bizCashFull: 0.7 * (sideNet + fik.avg + bizFull(biz.clients)), fund: fundAt || 6 * (ref.charges + ref.living),
      quitAt, clientsAfter, clientsAfterIsGuess: guess, stayEnd: real.end, quitEnd: quitCurve.at(-1)!, quitCurve, breakEven,
      stayMonthly: ref.salary + ref.extra + 0.7 * (sideNet + fik.avg + bizFull(biz.clients)) - ref.charges - ref.living,
      quitMonthly: 0.7 * (sideNet + fik.avg + bizFull(clientsAfter)) - ref.charges - ref.living,
    };
  }
  if (fik.withData < 6) warnings.push(`FIK : seulement ${fik.withData} mois de réservations en base — la saison est approximée par la moyenne.`);
  const miss = fik.months.reduce((s, x) => s + x.missing, 0);
  if (miss) warnings.push(`${miss} réservation(s) FIK sans prix Houari : leur bénéfice n'est PAS compté (jamais inventé).`);
  const hypotheses = [
    `Salaire net ${eur(f.salary ?? 0)}/mois${b.extra ? ` + ${(f.extras ?? []).map(e => `${e.label} ${eur(e.amount)}/${e.per}`).join(', ')} (≈ ${eur(b.extra)}/mois)` : ''}.`,
    side ? `Appoint : ${eur(daily)}/jour × ${days} jours/semaine = ${eur(sideSales)}/mois de ventes${side.order ? ` − stock ${eur(side.order.cost)} tous les ${side.order.everyDays} jours (≈ ${eur(sideStock)}/mois)` : ''} = ${eur(sideNet)}/mois net.` : '',
    `FIK : bénéfice net réel (prix client − prix Houari) des 12 derniers mois, mois par mois (moyenne ${eur(fik.avg)}/mois sur ${fik.withData} mois).`,
    `Charges fixes : ${f.charges.map(c => `${c.label} ${eur(c.amount)}${c.until ? ` jusqu'à ${c.until.slice(5)}/${c.until.slice(0, 4)}` : ''}`).join(', ')}.`,
    `Dépenses de vie : ${eur(living)}/mois (${livingSource}).`,
    biz ? `Projet ${biz.name}${biz.partner ? ` avec ${biz.partner}` : ''} : ${biz.clients} client(s)/mois dès ${ymLabel(biz.start)} (1/3 puis 2/3 des clients les 2 premiers mois), marge ${eur(biz.perClient)} par client (${biz.offerName}, après technicien), ta part ${biz.share} % = ${eur(biz.perMonthFull)}/mois à plein régime${biz.invest ? `, mise de départ (ta part) ${eur(biz.invest)}` : ''}. Payé en cash → compté avec le cash.` : '',
    `Départ : épargne ${eur(f.savings ?? 0)}${f.sideCash ? ` + caisse ${eur(f.sideCash)}` : ''} = ${eur(start)}. Aucun intérêt compté, montants d'aujourd'hui (pas d'inflation).`,
  ].filter(Boolean);
  return { until, start, months, sideSales, sideStock, sideNet, living, livingSource, fikAvg: fik.avg, fikWithData: fik.withData, scenarios, creditEnd: credit?.until ?? null, creditAmount: credit?.amount ?? 0, hypotheses, warnings, target: opts.target && opts.target > 0 ? opts.target : undefined, biz, freedom, base };
}

/** Objectif : quand il est atteint dans chaque scénario + ce qu'il faut changer (chaque levier seul suffit). Tout calculé. */
export function goalPlan(p: Projection): { reached: Array<{ name: string; when: string | null }>; gap: number; lines: string[] } | null {
  if (!p.target) return null;
  const T = p.target, n = p.months.length, real = p.scenarios[1]!;
  const reached = p.scenarios.map(s => { const k = s.curve.findIndex(v => v >= T); return { name: s.name, when: k < 0 ? null : k === 0 ? 'déjà' : p.months[k - 1]!.m }; });
  const gap = T - real.end;
  const lines: string[] = [];
  if (gap <= 0) lines.push(`Avec le scénario réaliste tu dépasses l'objectif de ${eur(-gap)} : tu es sur la bonne voie, ne change rien d'important.`);
  else {
    const cashSum = p.months.reduce((t, m) => t + m.side + m.fik + m.biz, 0);
    const fixedSum = p.months.reduce((t, m) => t + m.salary + m.extra - m.charges - m.living - m.bizInvest, 0);
    const keepNeeded = cashSum > 0 ? (T - p.start - fixedSum) / cashSum : Infinity;
    lines.push(`Il manque ${eur(gap)} au scénario réaliste (${eur(real.end)}). Chacune de ces solutions suffit À ELLE SEULE :`);
    if (keepNeeded <= 1) lines.push(`• Garder ${Math.ceil(keepNeeded * 100)} % du cash au lieu de 70 % (soit ${eur((keepNeeded - 0.7) * cashSum / n)} de plus gardés chaque mois).`);
    else lines.push(`• Même en gardant 100 % du cash tu n'y arrives pas (${eur(p.scenarios[0]!.end)}) : il faut une rentrée en plus.`);
    lines.push(`• Ou ${eur(gap / n)} de plus mis de côté chaque mois (dépenses de vie en moins ou nouvelle rentrée).`);
    lines.push(`• Ou FIK à ${eur(p.fikAvg + gap / 0.7 / n)}/mois de bénéfice au lieu de ${eur(p.fikAvg)}.`);
    if (p.biz && p.biz.perClient > 0) {
      const perClientTotal = p.months.reduce((t, m) => {
        if (m.m < p.biz!.start) return t;
        const k = (+m.m.slice(0, 4) - +p.biz!.start.slice(0, 4)) * 12 + (+m.m.slice(5, 7) - +p.biz!.start.slice(5, 7));
        return t + Math.min(1, (k + 1) / 3) * p.biz!.perClient * p.biz!.share / 100 * 0.7;
      }, 0);
      if (perClientTotal > 0) lines.push(`• Ou ${p.biz.name} à ${p.biz.clients + Math.ceil(gap / perClientTotal)} clients/mois au lieu de ${p.biz.clients}.`);
    }
  }
  return { reached, gap, lines };
}

/** Quitter la librairie : phrases 100 % calculées. */
export function freedomLines(p: Projection): string[] {
  const F = p.freedom; if (!F || !p.biz) return [];
  const L: string[] = [];
  L.push(F.month
    ? `Point de liberté : ${ymLabel(F.month)}. Ce mois-là, les 70 % que tu gardes de appoint + FIK + ${p.biz.name} (${eur(F.bizCashFull)}/mois) dépassent ton salaire + heures sup (${eur(F.need)}) ET ton épargne couvre 6 mois de charges + vie (${eur(F.fund)}).`
    : `Pas de point de liberté avant ${ymLabel(p.until)} : tes business ne remplacent pas encore ton salaire + heures sup (${eur(F.need)}/mois) avec 6 mois d'avance de côté.`);
  L.push(`Si tu quittes la librairie en ${ymLabel(F.quitAt)} (70 % du cash gardé) et passes à ${F.clientsAfter} clients/mois${F.clientsAfterIsGuess ? ' (hypothèse : 2× plus de clients avec tout ton temps)' : ''} : ${eur(F.quitEnd)} en ${ymLabel(p.until)}, contre ${eur(F.stayEnd)} en restant (${F.quitEnd >= F.stayEnd ? '+' : '−'}${eur(Math.abs(F.quitEnd - F.stayEnd))}).`);
  L.push(`Épargné par mois à plein régime (70 % du cash gardé) : ${eur(F.quitMonthly)} sans la librairie, contre ${eur(F.stayMonthly)} en restant.`);
  L.push(F.breakEven ? `Pour gagner AUTANT qu'en restant, il te faut au moins ${F.breakEven} clients/mois après ta démission.` : `Même à 300 clients/mois, partir ne rattrape pas le salaire sur la période.`);
  return L;
}

export function projectionText(p: Projection): string {
  const x = p.months[0];
  const inc = x ? x.salary + x.extra + x.side + x.fik : 0;
  return [
    `📈 Projection jusqu'à ${ymLabel(p.until)} (${p.months.length} mois), calculée sur tes vrais chiffres :`,
    x ? `• Un mois type : salaire ${eur(x.salary)} + heures sup ${eur(x.extra)} + appoint net ${eur(x.side)} + FIK ${eur(x.fik)} = ${eur(inc)} ; − charges ${eur(x.charges)} − vie ${eur(x.living)}.` : '',
    p.creditEnd ? `• Crédit fini en ${ymLabel(p.creditEnd)} → +${eur(p.creditAmount)}/mois ensuite.` : '',
    ...p.scenarios.map((s, i) => `• ${s.name} : ${eur(s.end)} en ${ymLabel(p.until)}${p.base ? ` (sans ${p.biz!.name} : ${eur(p.base[i]!.end)} → +${eur(s.end - p.base[i]!.end)})` : ''}`),
    p.biz ? `• ${p.biz.name} : ${p.biz.clients} client(s)/mois dès ${ymLabel(p.biz.start)} → ta part ${eur(p.biz.perMonthFull)}/mois à plein régime.` : '',
    `Départ : ${eur(p.start)}.`,
    ...(p.freedom ? freedomLines(p).map(l => `🚪 ${l}`) : []),
    ...(() => { const g = goalPlan(p); if (!g) return []; return [`🎯 Objectif ${eur(p.target!)} : ${g.reached.map(r => `${r.name.split(' (')[0]} ${r.when === 'déjà' ? 'déjà atteint' : r.when ? `atteint en ${ymLabel(r.when)}` : 'pas atteint'}`).join(' · ')}`, ...g.lines]; })(),
    ...p.warnings.map(w => `⚠️ ${w}`),
  ].filter(Boolean).join('\n');
}

// ── PDF avec graphiques (pdfkit, dessinés à la main) ─────────────────────────
export async function projectionPdf(p: Projection, analysis = ''): Promise<Buffer> {
  const fik = await fikMonthlyNet().catch(() => ({ months: [] as Array<{ m: string; net: number; ca: number; n: number; missing: number }> }));
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 45 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(res => doc.on('end', () => res(Buffer.concat(chunks))));
  // Helvetica (police PDF de base) n'a pas ≈ − → ni l'espace fine : remplacés pour ne pas afficher de signes cassés.
  const rawText = doc.text.bind(doc) as (...a: unknown[]) => typeof doc;
  (doc as unknown as { text: (...a: unknown[]) => typeof doc }).text = (t: unknown, ...rest: unknown[]) =>
    rawText(typeof t === 'string' ? t.replace(/≈ ?/g, 'env. ').replace(/−/g, '-').replace(/→/g, '->').replace(/⚠\uFE0F? ?/g, '(!) ').replace(/[\u202F\u2009]/g, ' ') : t, ...rest);
  const GOLD = '#B8860B', NAVY = '#0B2545', GREY = '#666666', COLORS = ['#1B998B', '#2E86AB', '#F18F01', '#C73E1D', '#6A4C93'];
  const H = (t: string) => { doc.moveDown(0.8).fontSize(15).fillColor(NAVY).text(t).moveDown(0.3); };
  const P = (t: string, size = 10.5, color = '#222') => doc.fontSize(size).fillColor(color).text(t, { lineGap: 2 });

  // Page 1 : résultat
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc.fillColor('#fff').fontSize(22).text(p.target ? `Objectif ${eur(p.target)} en ${ymLabel(p.until)}` : `Où tu seras en ${ymLabel(p.until)}`, 45, 28);
  doc.fontSize(10).fillColor('#E8D9A8').text(`Projection personnelle — calculée le ${localNow().date.split('-').reverse().join('/')} par Dzaryx · document privé`, 45, 58);
  doc.y = 110; doc.x = 45;
  const x0 = p.months[0];
  const income = x0 ? [['Salaire', x0.salary], ['Heures sup', x0.extra], ['Appoint (net)', x0.side], ['FIK (net)', x0.fik]] as Array<[string, number]> : [];
  const out = x0 ? [['Charges fixes', x0.charges], ['Dépenses de vie', x0.living]] as Array<[string, number]> : [];
  H('Le résultat');
  for (const [i, s] of p.scenarios.entries()) {
    const y = doc.y;
    doc.roundedRect(45, y, 505, 34, 6).fill(i === 1 ? '#FFF6DD' : '#F4F6F8');
    doc.fillColor(COLORS[i]!).fontSize(11).text(s.name, 58, y + 11, { width: 300 });
    doc.fillColor(NAVY).fontSize(15).text(eur(s.end), 360, y + 8, { width: 175, align: 'right' });
    if (p.base) doc.fillColor(GREY).fontSize(7.5).text(`sans ${p.biz!.name} : ${eur(p.base[i]!.end)}`, 360, y + 25, { width: 175, align: 'right' });
    else if (p.target) doc.fillColor(s.end >= p.target ? '#1B998B' : '#C73E1D').fontSize(7.5).text(s.end >= p.target ? 'objectif atteint' : `il manque ${eur(p.target - s.end)}`, 360, y + 25, { width: 175, align: 'right' });
    doc.y = y + 42; doc.x = 45;
  }
  P(`Point de départ : ${eur(p.start)} (épargne + caisse). « Cash » = appoint + FIK${p.biz ? ` + ${p.biz.name}` : ''}.`, 9.5, GREY);

  // Graphique 1 : courbes du patrimoine
  H('Ton argent mois par mois');
  {
    const gx = 75, gy = doc.y + 5, gw = 460, gh = 190;
    const all = [...p.scenarios.flatMap(s => s.curve), ...(p.base?.[1]?.curve ?? []), p.target ?? 0]; const max = Math.max(...all) * 1.08, min = Math.min(0, ...all);
    const Y = (v: number) => gy + gh - (v - min) / (max - min) * gh;
    doc.lineWidth(0.5).strokeColor('#DDD');
    for (let k = 0; k <= 4; k++) { const v = min + (max - min) * k / 4; doc.moveTo(gx, Y(v)).lineTo(gx + gw, Y(v)).stroke(); doc.fontSize(7).fillColor(GREY).text(`${Math.round(v / 1000)} k€`, gx - 34, Y(v) - 4, { width: 30, align: 'right' }); }
    const n = p.months.length;
    for (const [i, s] of p.scenarios.entries()) {
      doc.lineWidth(2).strokeColor(COLORS[i]!);
      s.curve.forEach((v, k) => { const X = gx + k / n * gw; if (k === 0) doc.moveTo(X, Y(v)); else doc.lineTo(X, Y(v)); });
      doc.stroke();
    }
    [0, ...p.months.map((m, k) => (m.m.endsWith('-01') || k === n - 1) ? k + 1 : -1).filter(k => k > 0)].forEach(k => {
      const lab = k === 0 ? 'auj.' : p.months[k - 1]!.m.endsWith('-01') ? p.months[k - 1]!.m.slice(0, 4) : ymLabel(p.months[k - 1]!.m);
      doc.fontSize(7).fillColor(GREY).text(lab, gx + k / n * gw - 20, gy + gh + 4, { width: 40, align: 'center' });
    });
    if (p.base) { doc.lineWidth(1.2).strokeColor('#999').dash(4, { space: 3 }); p.base[1]!.curve.forEach((v, k) => { const X = gx + k / n * gw; if (k === 0) doc.moveTo(X, Y(v)); else doc.lineTo(X, Y(v)); }); doc.stroke().undash(); }
    if (p.target) { doc.lineWidth(1).strokeColor('#C73E1D').dash(6, { space: 3 }).moveTo(gx, Y(p.target)).lineTo(gx + gw, Y(p.target)).stroke().undash(); doc.fontSize(7.5).fillColor('#C73E1D').text(`objectif ${eur(p.target)}`, gx + 4, Y(p.target) - 11); }
    if (p.creditEnd) { const k = p.months.findIndex(m => m.m > p.creditEnd!); if (k >= 0) { const X = gx + (k + 1) / n * gw; doc.lineWidth(0.8).strokeColor(GOLD).dash(3, { space: 3 }).moveTo(X, gy).lineTo(X, gy + gh).stroke().undash(); doc.fontSize(7).fillColor(GOLD).text('fin du crédit', X + 3, gy + 2); } }
    doc.y = gy + gh + 18; doc.x = 45;
    p.scenarios.forEach((s, i) => { const y = doc.y; doc.rect(45, y + 2, 10, 6).fill(COLORS[i]!); doc.fillColor('#333').fontSize(8.5).text(s.name, 60, y); });
    if (p.base) { const y = doc.y; doc.rect(45, y + 4, 10, 1.5).fill('#999'); doc.fillColor('#333').fontSize(8.5).text(`Réaliste SANS ${p.biz!.name} (pointillés)`, 60, y); }
  }

  // Page 2 : un mois type + FIK
  doc.addPage();
  H('Un mois type (le mois prochain)');
  {
    const tot = income.reduce((s, [, v]) => s + v, 0), outT = out.reduce((s, [, v]) => s + v, 0);
    const bar = (y: number, parts: Array<[string, number]>, total: number, label: string) => {
      let x = 45; const w = 505;
      doc.fontSize(9).fillColor(NAVY).text(`${label} : ${eur(total)}`, 45, y - 13);
      parts.forEach(([l, v], i) => { const pw = Math.max(0, v / Math.max(tot, 1) * w); doc.rect(x, y, pw, 26).fill(COLORS[i % COLORS.length]!); if (pw > 55) doc.fillColor('#fff').fontSize(7.5).text(`${l}\n${eur(v)}`, x + 3, y + 3, { width: pw - 6 }); x += pw; });
    };
    const y = doc.y + 16;
    bar(y, income, tot, 'Ce qui rentre');
    bar(y + 58, [...out, ['Reste', Math.max(0, tot - outT)]], tot, 'Où ça part');
    doc.y = y + 96; doc.x = 45;
    P(`Reste à épargner un mois type : ${eur(tot - outT)} si tu gardes tout le cash.`, 10.5, NAVY);
  }
  if (p.biz) {
    H(`Le projet ${p.biz.name}${p.biz.partner ? ` avec ${p.biz.partner}` : ''}`);
    P(`${p.biz.clients} client(s)/mois à partir de ${ymLabel(p.biz.start)} · marge ${eur(p.biz.perClient)} par client (${p.biz.offerName}) après le technicien · ta part ${p.biz.share} %.`, 10);
    P(`À plein régime : ${eur(p.biz.perMonthFull)}/mois pour toi. Les 2 premiers mois sont comptés à 1/3 puis 2/3 des clients (le temps de démarrer).`, 10);
    const r = p.scenarios[1]!.end - p.base![1]!.end;
    P(`Effet sur ${ymLabel(p.until)} (réaliste) : +${eur(r)}.`, 11, NAVY);
  }
  H('FIK — ton bénéfice net réel, 12 derniers mois');
  {
    const gx = 75, gy = doc.y + 5, gw = 460, gh = 140; const ms = fik.months;
    const max = Math.max(100, ...ms.map(x => x.net)) * 1.1; const bw = gw / Math.max(1, ms.length);
    doc.lineWidth(0.5).strokeColor('#DDD').moveTo(gx, gy + gh).lineTo(gx + gw, gy + gh).stroke();
    ms.forEach((x, i) => {
      const h = Math.max(0, x.net) / max * gh;
      doc.rect(gx + i * bw + 4, gy + gh - h, bw - 8, h).fill(GOLD);
      if (x.net) doc.fontSize(6.5).fillColor('#333').text(`${Math.round(x.net)}`, gx + i * bw, gy + gh - h - 9, { width: bw, align: 'center' });
      doc.fontSize(6.5).fillColor(GREY).text(MOIS[+x.m.slice(5) - 1]!, gx + i * bw, gy + gh + 3, { width: bw, align: 'center' });
    });
    doc.y = gy + gh + 18; doc.x = 45;
    P(`Moyenne ${eur(p.fikAvg)}/mois (${p.fikWithData} mois avec des réservations). Bénéfice = (prix client − prix Houari) × jours.`, 9.5, GREY);
  }

  if (p.freedom && p.biz) {
    const F = p.freedom;
    doc.addPage();
    H('Quitter la librairie ?');
    for (const l of freedomLines(p)) { P(l, 10.5); doc.moveDown(0.3); }
    // Graphique : rester vs partir (réaliste, 70 % du cash gardé)
    const stay = p.scenarios[1]!.curve, gx = 75, gy = doc.y + 10, gw = 460, gh = 170, n = p.months.length;
    const all = [...stay, ...F.quitCurve]; const max = Math.max(...all) * 1.08, min = Math.min(0, ...all);
    const Y = (v: number) => gy + gh - (v - min) / (max - min) * gh;
    doc.lineWidth(0.5).strokeColor('#DDD');
    for (let k = 0; k <= 4; k++) { const v = min + (max - min) * k / 4; doc.moveTo(gx, Y(v)).lineTo(gx + gw, Y(v)).stroke(); doc.fontSize(7).fillColor(GREY).text(`${Math.round(v / 1000)} k€`, gx - 34, Y(v) - 4, { width: 30, align: 'right' }); }
    ([[stay, COLORS[1]!], [F.quitCurve, '#6A4C93']] as Array<[number[], string]>).forEach(([c, col]) => { doc.lineWidth(2).strokeColor(col); c.forEach((v, k) => { const X = gx + k / n * gw; if (k === 0) doc.moveTo(X, Y(v)); else doc.lineTo(X, Y(v)); }); doc.stroke(); });
    const kq = p.months.findIndex(m => m.m >= F.quitAt);
    if (kq >= 0) { const X = gx + (kq + 1) / n * gw; doc.lineWidth(0.8).strokeColor('#6A4C93').dash(3, { space: 3 }).moveTo(X, gy).lineTo(X, gy + gh).stroke().undash(); doc.fontSize(7).fillColor('#6A4C93').text('démission', X + 3, gy + 2); }
    doc.y = gy + gh + 10; doc.x = 45;
    ([['Tu restes à la librairie', COLORS[1]!], [`Tu pars en ${ymLabel(F.quitAt)}, ${F.clientsAfter} clients/mois`, '#6A4C93']] as Array<[string, string]>).forEach(([t, col]) => { const y = doc.y; doc.rect(45, y + 2, 10, 6).fill(col); doc.fillColor('#333').fontSize(8.5).text(t, 60, y); });
    H('Avant de poser ta démission (les conditions)');
    for (const c of [
      `3 mois de suite avec au moins ${F.breakEven ?? p.biz.clients} vrais clients ${p.biz.name} payés — pas des promesses.`,
      `${eur(F.fund)} de côté (6 mois de charges + vie) AVANT de partir, sans compter le stock.`,
      `Les prix du projet vérifiés sur de vrais clients (aujourd'hui : ${eur(p.biz.perClient)} de marge par client, d'après tes chiffres).`,
      `Ton revenu ne dépend plus d'une seule source : si l'appoint ou le projet s'arrête un mois, tu tiens quand même.`,
      `Se renseigner sur la mutuelle / la sécurité sociale et le statut (indépendant) quand on n'a plus de salaire.`,
    ]) P(`• ${c}`, 10);
  }

  // Page 3 : tableau par trimestre + hypothèses + analyse
  doc.addPage();
  H('Trimestre par trimestre (scénario réaliste)');
  {
    const real = p.scenarios[1]!;
    const cols = [45, 140, 225, 310, 395, 470];
    const head = ['Fin de', 'Rentrées', 'Charges', 'Vie', 'Épargné', 'Total'];
    let y = doc.y; head.forEach((h, i) => doc.fontSize(8.5).fillColor(NAVY).text(h, cols[i]!, y, { width: 80 })); y += 14;
    for (let k = 2; k < p.months.length; k += 3) {
      const q = p.months.slice(k - 2, k + 1);
      const inc = q.reduce((s, x) => s + x.salary + x.extra - x.bizInvest + real.keep * (x.side + x.fik + x.biz), 0), ch = q.reduce((s, x) => s + x.charges, 0), lv = q.reduce((s, x) => s + x.living, 0);
      const vals = [ymLabel(p.months[k]!.m), eur(inc), eur(ch), eur(lv), eur(inc - ch - lv), eur(real.curve[k + 1]!)];
      if ((k / 3) % 2 < 1) doc.rect(42, y - 2, 510, 13).fill('#F4F6F8');
      vals.forEach((v, i) => doc.fontSize(8.5).fillColor('#222').text(v, cols[i]!, y, { width: 80 }));
      y += 14;
    }
    doc.y = y + 6; doc.x = 45;
  }
  const g = goalPlan(p);
  if (g) {
    H(`Ton objectif : ${eur(p.target!)} en ${ymLabel(p.until)}`);
    for (const r of g.reached) P(`${r.name.split(' (')[0]} : ${r.when === 'déjà' ? 'déjà atteint' : r.when ? `atteint en ${ymLabel(r.when)}` : 'pas atteint à temps'}`, 10, r.when ? '#1B998B' : '#C73E1D');
    doc.moveDown(0.3);
    for (const l of g.lines) P(l, 10);
  }
  H('Les hypothèses (tout est vérifiable)');
  for (const h of p.hypotheses) P(`• ${h}`, 9.5);
  for (const w of p.warnings) P(`⚠ ${w}`, 9.5, '#C73E1D');
  if (analysis) { H('L\'analyse de Dzaryx'); P(analysis, 10); }
  doc.moveDown(1); P('Document privé, pour toi seul. Les montants sont en euros d\'aujourd\'hui. Dis à Dzaryx un chiffre qui change (salaire, prix, dépense…) et il refait le calcul.', 8.5, GREY);
  doc.end();
  return done;
}

/** Analyse 100 % calculée (01/11 : pas d'IA ici → aucun chiffre inventé, Kouider : « il raconte n'importe quoi »). */
export function autoAnalysis(p: Projection): string {
  const n = p.months.length, x = p.months[0]; if (!x) return '';
  const cash = x.side + x.fik, real = p.scenarios[1]!, disc = p.scenarios[0]!, prud = p.scenarios[2]!;
  const fromSalary = x.salary + x.extra - x.charges - x.living;
  const tenPct = 0.1 * p.months.reduce((t, m) => t + m.side + m.fik + m.biz, 0);
  const freed = p.creditEnd ? p.months.filter(m => m.m > p.creditEnd!).length * p.creditAmount : 0;
  const shareSide = cash > 0 ? Math.round(x.side / cash * 100) : 0;
  const lines = [
    `En ${ymLabel(p.until)}, tu seras entre ${eur(prud.end)} et ${eur(disc.end)} selon ce que tu gardes du cash — ${eur(real.end)} si tu en gardes 70 %. Tu pars de ${eur(p.start)}.`,
    `D'où vient l'argent : le salaire + les heures sup, après les charges et ta vie, te laissent ${eur(fromSalary)}/mois. Le cash (appoint ${eur(x.side)} + FIK ${eur(x.fik)}) fait ${eur(cash)}/mois : c'est LUI qui fait la différence entre les scénarios. L'appoint pèse ${shareSide} % de ce cash, FIK ${100 - shareSide} %.`,
    `Levier 1 — garder le cash : chaque 10 % de cash gardé en plus = +${eur(tenPct)} d'ici ${ymLabel(p.until)}. Note tes ventes et tes dépenses chaque soir (mes_finances) : sans ça, le cash « disparaît » au quotidien.`,
    p.creditEnd ? `Levier 2 — le crédit : il s'arrête en ${ymLabel(p.creditEnd)} ; garder ses ${eur(p.creditAmount)}/mois de côté ensuite rapporte ${eur(freed)} avant ${ymLabel(p.until)} (déjà compté ici).` : '',
    `Levier 3 — FIK : aujourd'hui ${eur(p.fikAvg)}/mois de bénéfice net en moyenne. Passer à 500 €/mois ajouterait ≈ ${eur((500 - p.fikAvg) * n)} sur la période : c'est le levier qui peut grandir, l'appoint est déjà à son rythme.`,
    `Levier 4 — la vie : ${eur(p.living)}/mois aujourd'hui (${p.livingSource.startsWith('moyenne') ? 'tes vraies dépenses' : 'estimation'}). 200 € de moins par mois = +${eur(200 * n)}.`,
    p.biz ? `Le projet ${p.biz.name} : à ${p.biz.clients} client(s)/mois il t'ajoute ${eur(p.scenarios[1]!.end - p.base![1]!.end)} d'ici ${ymLabel(p.until)} (réaliste). Chaque client de plus par mois ≈ +${eur(p.biz.perClient * p.biz.share / 100 * 0.7 * p.months.filter(m => m.m >= p.biz!.start).length)} sur la période. Tant qu'il n'y a pas de vrai client, c'est une hypothèse : premier objectif = 1 vrai client payé.` : '',
    `Action ce mois-ci : chaque soir, note la vente du jour et les dépenses, et chaque commande de stock. Dans 2 mois, la projection utilisera tes VRAIES dépenses au lieu d'une estimation.`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Outil : texte + PDF sur Telegram (quand le backend tourne : lien de fichier temporaire). */
export async function projectionTool(input: Record<string, unknown>): Promise<string> {
  const until = /^\d{4}-\d{2}$/.test(String(input['until'] ?? '')) ? String(input['until']) : (await import('./perso-finances.js').then(m => m.loadFinances()).then(f => f.goal?.until).catch(() => undefined)) ?? '2028-12';
  // Objectif : donné maintenant (et alors retenu) ou déjà fixé avant
  const { loadFinances } = await import('./perso-finances.js');
  const f = await loadFinances();
  const tIn = Number(String(input['target'] ?? '').replace(/[^\d.]/g, ''));
  if (tIn > 0) {
    const { kvPut } = await import('./ai-util.js');
    f.goal = { amount: tIn, until, set: localNow().date };
    await kvPut('perso:finances', f);
  }
  const target = tIn > 0 ? tIn : f.goal && (!input['until'] || f.goal.until === until) ? f.goal.amount : undefined;
  const p = await buildProjection(until, {
    target,
    projet: input['projet'] !== undefined && String(input['projet']).trim() !== '' ? String(input['projet']) : undefined,
    offer: input['offer'] ? String(input['offer']) : undefined,
    clients: Number(input['clients']) || undefined,
    projetStart: input['projet_start'] ? String(input['projet_start']) : undefined,
    projetInvest: input['projet_invest'] !== undefined && input['projet_invest'] !== '' ? Number(input['projet_invest']) : undefined,
    quit: input['quit'] ? String(input['quit']) : undefined,
    clientsAfterQuit: Number(input['clients_after_quit']) || undefined,
  });
  const text = projectionText(p);
  const analysis = autoAnalysis(p);
  const pdf = await projectionPdf(p, analysis);
  if (input['send'] !== false) {
    const { queueTelegramFile } = await import('../actions/handlers/nexus-relay.js');
    await queueTelegramFile(pdf.toString('base64'), `Projection-${until}${p.biz ? `-avec-${p.biz.name.split(/\s/)[0]}` : ''}.pdf`, `📈 Ta projection jusqu'à ${ymLabel(until)}${p.target ? ` — objectif ${eur(p.target)}` : ''}${p.biz ? ` — avec ${p.biz.name}` : ''} : vrais chiffres, graphiques, hypothèses.`);
  }
  return `${text}${analysis ? `\n\n${analysis}` : ''}\n\n📄 PDF avec les graphiques envoyé sur Telegram.`;
}
