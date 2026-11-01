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

export interface ProjMonth { m: string; salary: number; extra: number; side: number; fik: number; charges: number; living: number; fixedSave: number }
export interface Projection {
  until: string; start: number; months: ProjMonth[];
  sideSales: number; sideStock: number; sideNet: number; living: number; livingSource: string; fikAvg: number; fikWithData: number;
  scenarios: Array<{ name: string; keep: number; end: number; curve: number[] }>;
  creditEnd: string | null; creditAmount: number; hypotheses: string[]; warnings: string[];
}

export async function buildProjection(until = '2028-12'): Promise<Projection> {
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

  const credit = f.charges.find(c => c.until && /crédit|credit|prêt|pret|leasing/i.test(c.label));
  const months: ProjMonth[] = [];
  for (let m = ymAdd(now, 1); m <= until; m = ymAdd(m, 1)) {
    const charges = f.charges.filter(c => !c.until || c.until >= m).reduce((s, c) => s + c.amount, 0);
    // FIK : même mois de l'an dernier (saison de la diaspora), sinon la moyenne
    const last = fik.months.find(x => x.m.slice(5) === m.slice(5) && x.n > 0);
    months.push({ m, salary: f.salary ?? 0, extra: b.extra, side: sideNet, fik: last ? last.net : fik.avg, charges, living, fixedSave: f.monthlySaving ?? 0 });
  }
  const start = (f.savings ?? 0) + (f.sideCash ?? 0);
  // Ce qui reste du salaire chaque mois (épargne fixe + crédit libéré) + la part GARDÉE du cash (appoint + FIK)
  const scen = (name: string, keep: number) => {
    let acc = start; const curve = [acc];
    for (const x of months) { acc += (x.salary + x.extra - x.charges - x.living) + keep * (x.side + x.fik); curve.push(acc); }
    return { name, keep, end: acc, curve };
  };
  const scenarios = [scen('Discipliné (tu gardes tout le cash)', 1), scen('Réaliste (tu gardes 70 % du cash)', 0.7), scen('Prudent (tu gardes 40 % du cash)', 0.4)];
  if (fik.withData < 6) warnings.push(`FIK : seulement ${fik.withData} mois de réservations en base — la saison est approximée par la moyenne.`);
  const miss = fik.months.reduce((s, x) => s + x.missing, 0);
  if (miss) warnings.push(`${miss} réservation(s) FIK sans prix Houari : leur bénéfice n'est PAS compté (jamais inventé).`);
  const hypotheses = [
    `Salaire net ${eur(f.salary ?? 0)}/mois${b.extra ? ` + ${(f.extras ?? []).map(e => `${e.label} ${eur(e.amount)}/${e.per}`).join(', ')} (≈ ${eur(b.extra)}/mois)` : ''}.`,
    side ? `Appoint : ${eur(daily)}/jour × ${days} jours/semaine = ${eur(sideSales)}/mois de ventes${side.order ? ` − stock ${eur(side.order.cost)} tous les ${side.order.everyDays} jours (≈ ${eur(sideStock)}/mois)` : ''} = ${eur(sideNet)}/mois net.` : '',
    `FIK : bénéfice net réel (prix client − prix Houari) des 12 derniers mois, mois par mois (moyenne ${eur(fik.avg)}/mois sur ${fik.withData} mois).`,
    `Charges fixes : ${f.charges.map(c => `${c.label} ${eur(c.amount)}${c.until ? ` jusqu'à ${c.until.slice(5)}/${c.until.slice(0, 4)}` : ''}`).join(', ')}.`,
    `Dépenses de vie : ${eur(living)}/mois (${livingSource}).`,
    `Départ : épargne ${eur(f.savings ?? 0)}${f.sideCash ? ` + caisse ${eur(f.sideCash)}` : ''} = ${eur(start)}. Aucun intérêt compté, montants d'aujourd'hui (pas d'inflation).`,
  ].filter(Boolean);
  return { until, start, months, sideSales, sideStock, sideNet, living, livingSource, fikAvg: fik.avg, fikWithData: fik.withData, scenarios, creditEnd: credit?.until ?? null, creditAmount: credit?.amount ?? 0, hypotheses, warnings };
}

export function projectionText(p: Projection): string {
  const x = p.months[0];
  const inc = x ? x.salary + x.extra + x.side + x.fik : 0;
  return [
    `📈 Projection jusqu'à ${ymLabel(p.until)} (${p.months.length} mois), calculée sur tes vrais chiffres :`,
    x ? `• Un mois type : salaire ${eur(x.salary)} + heures sup ${eur(x.extra)} + appoint net ${eur(x.side)} + FIK ${eur(x.fik)} = ${eur(inc)} ; − charges ${eur(x.charges)} − vie ${eur(x.living)}.` : '',
    p.creditEnd ? `• Crédit fini en ${ymLabel(p.creditEnd)} → +${eur(p.creditAmount)}/mois ensuite.` : '',
    ...p.scenarios.map(s => `• ${s.name} : ${eur(s.end)} en ${ymLabel(p.until)}`),
    `Départ : ${eur(p.start)}.`,
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
    rawText(typeof t === 'string' ? t.replace(/≈ ?/g, 'env. ').replace(/−/g, '-').replace(/→/g, '->').replace(/[\u202F\u2009]/g, ' ') : t, ...rest);
  const GOLD = '#B8860B', NAVY = '#0B2545', GREY = '#666666', COLORS = ['#1B998B', '#2E86AB', '#F18F01', '#C73E1D', '#6A4C93'];
  const H = (t: string) => { doc.moveDown(0.8).fontSize(15).fillColor(NAVY).text(t).moveDown(0.3); };
  const P = (t: string, size = 10.5, color = '#222') => doc.fontSize(size).fillColor(color).text(t, { lineGap: 2 });

  // Page 1 : résultat
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc.fillColor('#fff').fontSize(22).text(`Où tu seras en ${ymLabel(p.until)}`, 45, 28);
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
    doc.y = y + 42; doc.x = 45;
  }
  P(`Point de départ : ${eur(p.start)} (épargne + caisse). « Cash » = appoint + FIK.`, 9.5, GREY);

  // Graphique 1 : courbes du patrimoine
  H('Ton argent mois par mois');
  {
    const gx = 75, gy = doc.y + 5, gw = 460, gh = 190;
    const all = p.scenarios.flatMap(s => s.curve); const max = Math.max(...all) * 1.08, min = Math.min(0, ...all);
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
    if (p.creditEnd) { const k = p.months.findIndex(m => m.m > p.creditEnd!); if (k >= 0) { const X = gx + (k + 1) / n * gw; doc.lineWidth(0.8).strokeColor(GOLD).dash(3, { space: 3 }).moveTo(X, gy).lineTo(X, gy + gh).stroke().undash(); doc.fontSize(7).fillColor(GOLD).text('fin du crédit', X + 3, gy + 2); } }
    doc.y = gy + gh + 18; doc.x = 45;
    p.scenarios.forEach((s, i) => { const y = doc.y; doc.rect(45, y + 2, 10, 6).fill(COLORS[i]!); doc.fillColor('#333').fontSize(8.5).text(s.name, 60, y); });
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
      const inc = q.reduce((s, x) => s + x.salary + x.extra + real.keep * (x.side + x.fik), 0), ch = q.reduce((s, x) => s + x.charges, 0), lv = q.reduce((s, x) => s + x.living, 0);
      const vals = [ymLabel(p.months[k]!.m), eur(inc), eur(ch), eur(lv), eur(inc - ch - lv), eur(real.curve[k + 1]!)];
      if ((k / 3) % 2 < 1) doc.rect(42, y - 2, 510, 13).fill('#F4F6F8');
      vals.forEach((v, i) => doc.fontSize(8.5).fillColor('#222').text(v, cols[i]!, y, { width: 80 }));
      y += 14;
    }
    doc.y = y + 6; doc.x = 45;
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
  const tenPct = 0.1 * p.months.reduce((t, m) => t + m.side + m.fik, 0);
  const freed = p.creditEnd ? p.months.filter(m => m.m > p.creditEnd!).length * p.creditAmount : 0;
  const shareSide = cash > 0 ? Math.round(x.side / cash * 100) : 0;
  const lines = [
    `En ${ymLabel(p.until)}, tu seras entre ${eur(prud.end)} et ${eur(disc.end)} selon ce que tu gardes du cash — ${eur(real.end)} si tu en gardes 70 %. Tu pars de ${eur(p.start)}.`,
    `D'où vient l'argent : le salaire + les heures sup, après les charges et ta vie, te laissent ${eur(fromSalary)}/mois. Le cash (appoint ${eur(x.side)} + FIK ${eur(x.fik)}) fait ${eur(cash)}/mois : c'est LUI qui fait la différence entre les scénarios. L'appoint pèse ${shareSide} % de ce cash, FIK ${100 - shareSide} %.`,
    `Levier 1 — garder le cash : chaque 10 % de cash gardé en plus = +${eur(tenPct)} d'ici ${ymLabel(p.until)}. Note tes ventes et tes dépenses chaque soir (mes_finances) : sans ça, le cash « disparaît » au quotidien.`,
    p.creditEnd ? `Levier 2 — le crédit : il s'arrête en ${ymLabel(p.creditEnd)} ; garder ses ${eur(p.creditAmount)}/mois de côté ensuite rapporte ${eur(freed)} avant ${ymLabel(p.until)} (déjà compté ici).` : '',
    `Levier 3 — FIK : aujourd'hui ${eur(p.fikAvg)}/mois de bénéfice net en moyenne. Passer à 500 €/mois ajouterait ≈ ${eur((500 - p.fikAvg) * n)} sur la période : c'est le levier qui peut grandir, l'appoint est déjà à son rythme.`,
    `Levier 4 — la vie : ${eur(p.living)}/mois aujourd'hui (${p.livingSource.startsWith('moyenne') ? 'tes vraies dépenses' : 'estimation'}). 200 € de moins par mois = +${eur(200 * n)}.`,
    `Action ce mois-ci : chaque soir, note la vente du jour et les dépenses, et chaque commande de stock. Dans 2 mois, la projection utilisera tes VRAIES dépenses au lieu d'une estimation.`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Outil : texte + PDF sur Telegram (quand le backend tourne : lien de fichier temporaire). */
export async function projectionTool(input: Record<string, unknown>): Promise<string> {
  const until = /^\d{4}-\d{2}$/.test(String(input['until'] ?? '')) ? String(input['until']) : '2028-12';
  const p = await buildProjection(until);
  const text = projectionText(p);
  const analysis = autoAnalysis(p);
  const pdf = await projectionPdf(p, analysis);
  if (input['send'] !== false) {
    const { queueTelegramFile } = await import('../actions/handlers/nexus-relay.js');
    await queueTelegramFile(pdf.toString('base64'), `Projection-${until}.pdf`, `📈 Ta projection jusqu'à ${ymLabel(until)} — vrais chiffres, graphiques, hypothèses.`);
  }
  return `${text}${analysis ? `\n\n${analysis}` : ''}\n\n📄 PDF avec les graphiques envoyé sur Telegram.`;
}
