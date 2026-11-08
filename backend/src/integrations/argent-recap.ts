// RÉCAP ARGENT EN PDF (08/11/2026, Kouider : d'où vient le plus d'argent, où partent les plus grosses dépenses, les jours où je
// gagne le plus de cash, document avec graphique chaque fin de mois).
// Tout est calculé par le code depuis ses données (perso:journal, perso:cash_log, perso:finances, réservations FIK) : aucune IA,
// donc aucun chiffre inventé. Données privées : rien de chiffré dans ce dépôt public.
import { kvJson, kvPut } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { budget, loadFinances } from './perso-finances.js';
import { supabase } from './supabase.js';
import { computeBookingFinancials } from './finance.js';
import { readCashLog, type CashLog } from './argent-direct.js';

type Entry = { d: string; t: 'vente' | 'achat' | 'depense'; cat: string; amount: number; mode: 'cash' | 'carte'; note?: string };
type Item = { label: string; value: number; color?: string };

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`;
const sign = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${eur(Math.abs(n))}`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const wd = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const dayCount = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;
const sum = (l: Array<{ amount: number }>) => l.reduce((s, e) => s + e.amount, 0);
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const catName = (c: string) => c === 'cash' ? 'Cash sans détail' : capital(c);

/** Sa part FIK sur la période : bénéfice de chaque location au prorata des jours couverts (prix propriétaire manquant = compté à part, jamais inventé). */
async function fikShare(from: string, to: string): Promise<{ net: number; missing: number; n: number }> {
  const { data } = await supabase.from('bookings')
    .select('start_date, end_date, nb_days, final_price, client_price_per_day, owner_price_per_day, paid_amount, rented_by, discount_applied, status, notes')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED']).lte('start_date', to).gte('end_date', from);
  let net = 0, missing = 0, n = 0;
  for (const b of (data ?? []) as Array<Record<string, unknown>>) {
    const start = String(b['start_date']).slice(0, 10), end = String(b['end_date']).slice(0, 10);
    const total = Math.max(1, dayCount(start, end) - 1);
    const first = start > from ? start : from, stop = end < addDays(to, 1) ? end : addDays(to, 1);
    const covered = Math.max(0, dayCount(first, stop) - 1);
    if (!covered) continue;
    const f = computeBookingFinancials(b as unknown as Parameters<typeof computeBookingFinancials>[0]);
    n++;
    if (f.kouider_profit == null) missing++; else net += f.kouider_profit * covered / total;
  }
  return { net: Math.round(net), missing, n };
}

export interface Recap {
  from: string; to: string; title: string; days: number; today: string;
  savings: number; cash: number; cashStart: number | null;
  gains: number; outs: number; orders: number; spent: number; unknownOut: number;
  byDay: Array<{ d: string; gain: number; out: number }>;
  curve: Array<{ d: string; cash: number }>;
  weekdays: Array<{ label: string; avg: number; total: number; n: number }>;
  bestDay?: { d: string; gain: number }; bestWeekday?: { label: string; avg: number };
  sources: Item[]; sinks: Item[]; unexplained: CashLog[];
  fik: { net: number; missing: number; n: number };
  soldDays: number; noData: number; months: number;
  order?: { cost: number; everyDays: number; pieces?: number; last?: string; dueIn?: number };
  goal?: { amount: number; until: string };
  snusMargin: number; snusSales: number; snusOrders: number; monthEnd?: number; runway?: number;
  savingsBefore?: number; cashBefore?: number; bigOuts: CashLog[];
}

export async function recapData(from: string | undefined, to: string, title?: string): Promise<Recap> {
  const today = localNow().date;
  const [all, log, f] = await Promise.all([kvJson<Entry[]>('perso:journal', []), readCashLog(), loadFinances()]);
  const firstKnown = [...all.map(e => e.d), ...log.map(e => e.d)].sort()[0] ?? today;
  const start = from ?? firstKnown;
  const list = all.filter(e => e.d >= start && e.d <= to);
  const moves = log.filter(e => e.d >= start && e.d <= to);
  const days = dayCount(start, to);
  const sales = list.filter(e => e.t === 'vente'), achats = list.filter(e => e.t === 'achat'), deps = list.filter(e => e.t === 'depense');
  const unexplained = moves.filter(m => m.delta < 0 && (m.kind === 'retrait' || m.kind === 'ecart'));
  const unknownOut = unexplained.reduce((s, m) => s - m.delta, 0);
  const gains = sum(sales), orders = sum(achats), spent = sum(deps);

  const byDay: Recap['byDay'] = [];
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const u = unexplained.filter(m => m.d === d).reduce((s, m) => s - m.delta, 0);
    byDay.push({ d, gain: sum(sales.filter(e => e.d === d)), out: sum([...achats, ...deps].filter(e => e.d === d && e.mode === 'cash')) + u });
  }
  // Courbe du cash : dernier solde connu de chaque jour
  const before = log.filter(m => m.d < start).at(-1);
  let cur = before?.cash ?? null;
  const cashStart = before?.cash ?? (moves[0] ? moves[0].cash - moves[0].delta : null);
  const curve: Recap['curve'] = [];
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const last = moves.filter(m => m.d === d).at(-1);
    if (last) cur = last.cash;
    if (cur != null) curve.push({ d, cash: cur });
  }

  const weekdays = [1, 2, 3, 4, 5, 6, 0].map(w => {
    const ds = byDay.filter(x => wd(x.d) === w);
    const total = ds.reduce((s, x) => s + x.gain, 0);
    return { label: DAYS[w]!, total, n: ds.length, avg: ds.length ? Math.round(total / ds.length) : 0 };
  });
  const best = [...byDay].sort((a, b) => b.gain - a.gain)[0];
  const bestWd = [...weekdays].sort((a, b) => b.avg - a.avg)[0];

  // Mois touchés par la période : le salaire et les charges sont mensuels
  const monthKeys = [...new Set(byDay.map(x => x.d.slice(0, 7)))];
  const b = budget(f);
  const fik = await fikShare(start, to).catch(() => ({ net: 0, missing: 0, n: 0 }));
  const salesBy = new Map<string, number>();
  for (const e of sales) salesBy.set(e.cat, (salesBy.get(e.cat) ?? 0) + e.amount);
  const sources: Item[] = [
    ...(b.salary ? [{ label: `Salaire (${monthKeys.length} mois)`, value: b.salary * monthKeys.length }] : []),
    ...(b.extra ? [{ label: 'Heures sup', value: Math.round(b.extra * monthKeys.length) }] : []),
    ...[...salesBy].map(([label, value]) => ({ label: catName(label), value })),
    ...(fik.net > 0 ? [{ label: 'FIK (ta part)', value: fik.net }] : []),
  ].sort((x, y) => y.value - x.value);
  const out = new Map<string, number>();
  for (const e of achats) out.set(`Commandes ${e.cat}`, (out.get(`Commandes ${e.cat}`) ?? 0) + e.amount);
  for (const e of deps) out.set(capital(e.cat), (out.get(capital(e.cat)) ?? 0) + e.amount);
  if (unknownOut) out.set('Sorties sans motif', unknownOut);
  if (b.charges) out.set(`Charges fixes (${monthKeys.length} mois)`, b.charges * monthKeys.length);
  const sinks: Item[] = [...out].map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value);

  const side = (f.side?.label ?? 'snus').toLowerCase();
  const snusSales = sum(sales.filter(e => e.cat === side || e.cat === 'cash')), snusOrders = sum(achats.filter(e => e.cat === side));
  const lastOrder = all.filter(e => e.t === 'achat' && e.cat === side).map(e => e.d).sort().at(-1);
  const order = f.side?.order ? { cost: f.side.order.cost, everyDays: f.side.order.everyDays, pieces: f.side.order.pieces, last: lastOrder, dueIn: lastOrder ? f.side.order.everyDays - (dayCount(lastOrder, today) - 1) : undefined } : undefined;

  const noData = byDay.filter(x => !x.gain && !x.out).length;
  const cashOut = byDay.reduce((s, x) => s + x.out, 0);
  const isCurrent = to === today && to.slice(0, 7) === start.slice(0, 7) && !to.endsWith('-01');
  const inMonth = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0)).getUTCDate();
  const prevYm = (() => { const d = new Date(`${start.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const snap = await kvJson<{ savings: number; cash: number } | null>(`perso:capital:${prevYm}`, null);
  return {
    from: start, to, today, days, title: title ?? `du ${dm(start)} au ${dm(to)}`,
    savings: f.savings ?? 0, cash: f.sideCash ?? 0, cashStart,
    gains, orders, spent, unknownOut, outs: cashOut,
    byDay, curve, weekdays,
    ...(best && best.gain > 0 ? { bestDay: { d: best.d, gain: best.gain } } : {}),
    ...(bestWd && bestWd.avg > 0 ? { bestWeekday: { label: bestWd.label, avg: bestWd.avg } } : {}),
    sources, sinks, unexplained, fik,
    soldDays: byDay.filter(x => x.gain > 0).length, noData, months: monthKeys.length,
    ...(order ? { order } : {}),
    ...(f.goal ? { goal: { amount: f.goal.amount, until: f.goal.until } } : {}),
    snusMargin: snusSales - snusOrders, snusSales, snusOrders,
    ...(isCurrent && gains > 0 ? { monthEnd: Math.round(gains / days * inMonth) } : {}),
    ...(cashOut > 0 ? { runway: Math.round((f.sideCash ?? 0) / (cashOut / days)) } : {}),
    ...(snap ? { savingsBefore: snap.savings, cashBefore: snap.cash } : {}),
    bigOuts: moves.filter(m => m.delta < 0).sort((x, y) => x.delta - y.delta).slice(0, 5),
  };
}

export async function recapPdf(r: Recap): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 45, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(res => doc.on('end', () => res(Buffer.concat(chunks))));
  const rawText = doc.text.bind(doc) as (...a: unknown[]) => typeof doc;
  (doc as unknown as { text: (...a: unknown[]) => typeof doc }).text = (t: unknown, ...rest: unknown[]) =>
    rawText(typeof t === 'string' ? t.replace(/≈ ?/g, 'env. ').replace(/−/g, '-').replace(/→/g, '->').replace(/[   ]/g, ' ') : t, ...rest);

  const NAVY = '#0B2545', GOLD = '#B8860B', GREY = '#68707A', LINE = '#E3E6EA', GREEN = '#1B998B', RED = '#C73E1D', BLUE = '#2E86AB', INK = '#20262E';
  const L = 45, W = 505;
  const header = (sub: string) => {
    doc.rect(0, 0, doc.page.width, 78).fill(NAVY);
    doc.fillColor('#fff').fontSize(20).text('Ton argent', L, 22, { lineBreak: false });
    doc.fontSize(10).fillColor('#E8D9A8').text(sub, L, 50, { width: W, lineBreak: false });
    doc.y = 96; doc.x = L;
  };
  const H = (t: string) => { doc.x = L; doc.fontSize(13.5).fillColor(NAVY).text(t, L, doc.y, { width: W }).moveDown(0.25); };
  const P = (t: string, size = 10, color = INK) => { doc.x = L; doc.fontSize(size).fillColor(color).text(t, L, doc.y, { width: W, lineGap: 2 }); };
  const ensure = (need: number, sub: string) => { if (doc.y + need > doc.page.height - 50) { doc.addPage(); header(sub); } };
  const sub = `Récapitulatif ${r.title} · calculé le ${dm(r.today)} par Dzaryx · document privé`;

  const cards = (items: Array<[string, string, string?]>) => {
    const y = doc.y, gap = 9, w = (W - gap * (items.length - 1)) / items.length;
    items.forEach(([lab, val, col], i) => {
      const x = L + i * (w + gap);
      doc.roundedRect(x, y, w, 58, 6).fill('#F4F6F8');
      doc.fillColor(GREY).fontSize(8.5).text(lab, x + 9, y + 9, { width: w - 16, lineBreak: false });
      doc.fillColor(col ?? NAVY).fontSize(16).text(val, x + 9, y + 27, { width: w - 16, lineBreak: false });
    });
    doc.y = y + 70; doc.x = L;
  };
  const scale = (max: number) => { if (max <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(max))); return [1, 2, 2.5, 5, 10].map(m => m * p).find(v => v >= max) ?? max; };
  const axisY = (x: number, y: number, w: number, h: number, lo: number, hi: number) => {
    for (let i = 0; i <= 4; i++) {
      const v = lo + (hi - lo) * i / 4, py = y + h - h * i / 4;
      doc.moveTo(x, py).lineTo(x + w, py).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.fillColor(GREY).fontSize(7).text(Math.round(v).toLocaleString('fr-FR'), L, py - 3.5, { width: x - L - 5, align: 'right', lineBreak: false });
    }
  };

  // Courbe du cash
  const lineChart = (pts: Array<{ label: string; value: number }>, h = 150) => {
    const x = L + 38, y = doc.y + 6, w = W - 42;
    const vals = pts.map(p => p.value), top = scale(Math.max(...vals) * 1.05);
    axisY(x, y, w, h, 0, top);
    const px = (i: number) => x + (pts.length > 1 ? w * i / (pts.length - 1) : w / 2), py = (v: number) => y + h - h * v / top;
    doc.moveTo(px(0), y + h);
    pts.forEach((p, i) => doc.lineTo(px(i), py(p.value)));
    doc.lineTo(px(pts.length - 1), y + h).closePath().fillOpacity(0.1).fill(BLUE).fillOpacity(1);
    pts.forEach((p, i) => { if (i) doc.moveTo(px(i - 1), py(pts[i - 1]!.value)).lineTo(px(i), py(p.value)).lineWidth(2).strokeColor(BLUE).stroke(); });
    const step = Math.ceil(pts.length / 10);
    pts.forEach((p, i) => {
      doc.circle(px(i), py(p.value), 2.6).fill(NAVY);
      if (i % step === 0 || i === pts.length - 1) {
        doc.fillColor(GREY).fontSize(7).text(p.label, px(i) - 18, y + h + 5, { width: 36, align: 'center', lineBreak: false });
        doc.fillColor(NAVY).fontSize(7.5).text(Math.round(p.value).toLocaleString('fr-FR'), px(i) - 22 + (i === 0 ? 20 : 0), py(p.value) - 13, { width: 44, align: 'center', lineBreak: false });
      }
    });
    doc.y = y + h + 22; doc.x = L;
  };
  // Barres entrées (haut) / sorties (bas) par jour
  const flowChart = (days: Recap['byDay'], h = 150) => {
    const x = L + 38, y = doc.y + 6, w = W - 42;
    const maxIn = Math.max(1, ...days.map(d => d.gain)), maxOut = Math.max(0, ...days.map(d => d.out));
    const top = scale(Math.max(maxIn, maxOut));
    const hasOut = maxOut > 0, zero = hasOut ? y + h / 2 : y + h, unit = (hasOut ? h / 2 : h) / top;
    for (const v of hasOut ? [top, top / 2, 0, -top / 2, -top] : [top, top * 0.75, top / 2, top / 4, 0]) {
      const py = zero - v * unit;
      doc.moveTo(x, py).lineTo(x + w, py).lineWidth(v === 0 ? 1 : 0.5).strokeColor(v === 0 ? '#9AA3AD' : LINE).stroke();
      doc.fillColor(GREY).fontSize(7).text(Math.round(v).toLocaleString('fr-FR'), L, py - 3.5, { width: 33, align: 'right', lineBreak: false });
    }
    const slot = w / days.length, bw = Math.min(26, slot * 0.62), step = Math.ceil(days.length / 14);
    days.forEach((d, i) => {
      const bx = x + i * slot + (slot - bw) / 2;
      if (d.gain) { doc.rect(bx, zero - d.gain * unit, bw, d.gain * unit).fill(GREEN); doc.fillColor(GREEN).fontSize(7).text(String(Math.round(d.gain)), bx - 12, zero - d.gain * unit - 10, { width: bw + 24, align: 'center', lineBreak: false }); }
      if (d.out) { doc.rect(bx, zero, bw, d.out * unit).fill(RED); doc.fillColor(RED).fontSize(7).text(`-${Math.round(d.out)}`, bx - 12, zero + d.out * unit + 3, { width: bw + 24, align: 'center', lineBreak: false }); }
      if (i % step === 0) doc.fillColor(GREY).fontSize(7).text(dm(d.d), bx - 12, y + h + 13, { width: bw + 24, align: 'center', lineBreak: false });
    });
    doc.y = y + h + 28; doc.x = L;
  };
  const weekdayChart = (items: Recap['weekdays'], h = 112) => {
    const x = L + 38, y = doc.y + 6, w = W - 42, top = scale(Math.max(1, ...items.map(d => d.avg)));
    axisY(x, y, w, h, 0, top);
    const max = Math.max(...items.map(d => d.avg)), slot = w / items.length, bw = slot * 0.55;
    items.forEach((d, i) => {
      const bh = h * d.avg / top, bx = x + i * slot + (slot - bw) / 2;
      if (bh) doc.rect(bx, y + h - bh, bw, bh).fill(d.avg === max ? GOLD : '#C9D3DD');
      if (d.avg) doc.fillColor(INK).fontSize(8).text(`${d.avg}`, bx - 10, y + h - bh - 11, { width: bw + 20, align: 'center', lineBreak: false });
      doc.fillColor(GREY).fontSize(7.5).text(d.label.slice(0, 3), bx - 10, y + h + 5, { width: bw + 20, align: 'center', lineBreak: false });
    });
    doc.y = y + h + 22; doc.x = L;
  };
  const hbars = (items: Item[], color: string) => {
    const max = Math.max(1, ...items.map(i => i.value)), total = items.reduce((s, i) => s + i.value, 0);
    const lab = 150, valW = 92, bar = W - lab - valW;
    for (const it of items.slice(0, 7)) {
      const y = doc.y;
      doc.fillColor(INK).fontSize(9).text(it.label, L, y + 2, { width: lab - 6, lineBreak: false });
      doc.roundedRect(L + lab, y + 1, bar, 11, 3).fill('#EEF1F4');
      doc.roundedRect(L + lab, y + 1, Math.max(3, bar * it.value / max), 11, 3).fill(it.color ?? color);
      doc.fillColor(NAVY).fontSize(9).text(`${eur(it.value)} (${Math.round(it.value / total * 100)} %)`, L + lab + bar, y + 2, { width: valW, align: 'right', lineBreak: false });
      doc.y = y + 18; doc.x = L;
    }
    doc.moveDown(0.3);
  };
  // Calendrier : plus la case est foncée, plus il a rentré de cash
  const calendar = () => {
    const size = 30, gap = 4, heads = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const y0 = doc.y + 2, x0 = L;
    heads.forEach((d, i) => doc.fillColor(GREY).fontSize(7.5).text(d, x0 + i * (size + gap), y0, { width: size, align: 'center', lineBreak: false }));
    const max = Math.max(1, ...r.byDay.map(d => d.gain));
    let row = 0;
    r.byDay.forEach((d, i) => {
      const col = (wd(d.d) + 6) % 7;
      if (i && col === 0) row++;
      const x = x0 + col * (size + gap), y = y0 + 13 + row * (size + gap);
      const shade = d.gain ? 0.25 + 0.75 * d.gain / max : 0;
      doc.roundedRect(x, y, size, size, 4).fill(d.gain ? GREEN : '#EEF1F4');
      if (d.gain) { doc.roundedRect(x, y, size, size, 4).fillOpacity(1 - shade).fill('#FFFFFF').fillOpacity(1); }
      doc.fillColor(shade > 0.6 ? '#fff' : GREY).fontSize(7.5).text(d.d.slice(8), x, y + 5, { width: size, align: 'center', lineBreak: false });
      if (d.gain) doc.fillColor(shade > 0.6 ? '#fff' : NAVY).fontSize(8).text(String(Math.round(d.gain)), x, y + 16, { width: size, align: 'center', lineBreak: false });
      if (d.out) doc.circle(x + size - 5, y + 5, 2.5).fill(RED);
    });
    const rows = row + 1, bottom = y0 + 13 + rows * (size + gap);
    const notes = [`Chiffre vert = cash rentré ce jour-là.`, `Point rouge = du cash est sorti.`, `${r.soldDays} jour(s) avec des ventes sur ${r.days}.`, r.noData ? `${r.noData} jour(s) sans rien de noté : soit rien, soit oublié.` : ''].filter(Boolean);
    let ny = y0 + 12; const nx = x0 + 7 * (size + gap) + 18;
    for (const n of notes) { doc.fillColor(INK).fontSize(9.5).text(n, nx, ny, { width: L + W - nx, lineGap: 2 }); ny = doc.y + 6; }
    doc.y = Math.max(bottom, ny) + 8; doc.x = L;
  };

  // ── Page 1
  header(sub);
  cards([['TOTAL (épargne + cash)', eur(r.savings + r.cash)], ['Cash aujourd\'hui', eur(r.cash)], ['Cash rentré', sign(r.gains), GREEN], ['Cash sorti', r.outs ? `-${eur(r.outs)}` : '0 €', RED]]);
  H('L\'essentiel');
  const delta = r.cashStart != null ? r.cash - r.cashStart : null;
  const source = r.sources[0], sink = r.sinks[0], cashSink = r.sinks.filter(s => !/^Charges fixes/.test(s.label))[0];
  const lines = [
    delta != null ? `Ta caisse est passée de ${eur(r.cashStart!)} à ${eur(r.cash)}, soit ${sign(delta)}.` : '',
    source ? `Le plus d'argent vient de : ${source.label.toLowerCase()} (${eur(source.value)}).` : '',
    sink ? `La plus grosse sortie : ${sink.label.toLowerCase()} (${eur(sink.value)}).` : '',
    cashSink && cashSink !== sink ? `La plus grosse sortie de cash : ${cashSink.label.toLowerCase()} (${eur(cashSink.value)}).` : '',
    r.bestDay ? `Ton meilleur jour : ${DAYS[wd(r.bestDay.d)]!.toLowerCase()} ${dm(r.bestDay.d)}, avec ${eur(r.bestDay.gain)}.` : '',
    r.savingsBefore !== undefined ? `Épargne : ${sign(r.savings - r.savingsBefore)} sur le mois.` : `Épargne actuelle : ${eur(r.savings)} (pas encore d'historique : la comparaison commence avec ce premier récap).`,
  ].filter(Boolean);
  for (const l of lines) { P(`•  ${l}`, 10.5); doc.moveDown(0.15); }
  doc.moveDown(0.5);
  if (r.curve.length > 1) { H('Ton cash, jour après jour'); lineChart(r.curve.map(c => ({ label: dm(c.d), value: c.cash }))); }
  H('Ce qui rentre et ce qui sort, par jour'); flowChart(r.byDay);

  // ── Page 2
  doc.addPage(); header(sub);
  H('Les jours où tu gagnes le plus (moyenne par jour)'); weekdayChart(r.weekdays);
  if (r.days < 28) P(`Sur ${r.days} jours seulement, chaque jour de la semaine n'apparaît qu'une ou deux fois : la tendance sera fiable après un mois.`, 9, GREY);
  doc.moveDown(0.6);
  H('Calendrier du cash'); calendar();
  H('D\'où vient ton argent'); hbars(r.sources, GREEN);
  if (r.fik.missing) P(`FIK : ${r.fik.missing} location(s) sans prix propriétaire, non comptée(s).`, 8.5, GREY);
  H('Où part ton argent'); hbars(r.sinks, RED);

  // ── Page 3
  doc.addPage(); header(sub);
  H('Ce à quoi tu n\'aurais pas pensé');
  doc.moveDown(0.2);
  const tips: Array<[string, string, string]> = [];
  if (r.order) {
    const free = r.cash - r.order.cost;
    tips.push(['Ton cash vraiment libre', eur(free), `Une fois ta prochaine commande de ${eur(r.order.cost)} mise de côté, il te reste ça à utiliser.${r.order.dueIn !== undefined ? (r.order.dueIn > 0 ? ` Commande prévue dans ${r.order.dueIn} jours.` : ' Ta commande est à refaire maintenant.') : ' Dis-moi « -900 pour une commande » à la prochaine : je calcule ton rythme.'}`]);
    if (r.order.pieces) { const unit = r.order.cost / r.order.pieces; tips.push(['Ton coût par pièce', `${unit.toFixed(2).replace('.', ',')} €`, `Tes ${r.order.pieces} pièces à ${eur(r.order.cost)}. Il faut ${Math.ceil(r.order.cost / (r.gains / Math.max(1, r.soldDays) || r.order.cost))} jour(s) de ventes à ton rythme actuel pour rembourser une commande.`]); }
  }
  if (r.monthEnd) tips.push(['À ce rythme, fin de mois', eur(r.monthEnd), `Ce que tu auras rentré en cash ce mois si tu continues pareil (${eur(Math.round(r.gains / r.days))} par jour en moyenne).`]);
  if (r.runway !== undefined) tips.push(['Ton cash tient', `${r.runway} jours`, `Sans aucune nouvelle vente, au rythme de sorties de cette période (${eur(Math.round(r.outs / r.days))} par jour).`]);
  if (r.snusOrders) tips.push(['Ta vraie marge', eur(r.snusMargin), `Ventes ${eur(r.snusSales)} moins commandes ${eur(r.snusOrders)}.`]);
  if (r.goal) { const pct = Math.round((r.savings + r.cash) / r.goal.amount * 100); tips.push([`Objectif ${eur(r.goal.amount)}`, `${pct} %`, `Atteint à ${pct} %, échéance ${r.goal.until.slice(5)}/${r.goal.until.slice(0, 4)}. Il manque ${eur(Math.max(0, r.goal.amount - r.savings - r.cash))}.`]); }
  for (const [lab, val, text] of tips) {
    ensure(56, sub);
    const y = doc.y;
    doc.roundedRect(L, y, W, 50, 6).fill('#F4F6F8');
    doc.fillColor(GREY).fontSize(8.5).text(lab, L + 12, y + 9, { width: 150, lineBreak: false });
    doc.fillColor(NAVY).fontSize(15).text(val, L + 12, y + 24, { width: 150, lineBreak: false });
    doc.fillColor(INK).fontSize(9.5).text(text, L + 170, y + 9, { width: W - 182, height: 36, lineGap: 1.5 });
    doc.y = y + 57; doc.x = L;
  }
  doc.moveDown(0.5);
  if (r.bigOuts.length) {
    ensure(40 + r.bigOuts.length * 16, sub);
    H('Les plus gros retraits de cash');
    for (const m of r.bigOuts) { P(`${dm(m.d)}   -${eur(-m.delta)}   ${m.why}`, 10); doc.moveDown(0.1); }
    doc.moveDown(0.5);
  }
  if (r.unexplained.length) {
    ensure(70, sub);
    H('À préciser pour un récap parfait');
    P(`${eur(r.unknownOut)} sont sortis sans motif noté. Dis-moi à quoi ils ont servi et je les classe. Maintenant, dis simplement « -900 pour une commande » ou « -60 pour les courses » au moment où tu prends l'argent.`, 10);
    doc.moveDown(0.5);
  }
  ensure(50, sub);
  P('Calculs faits uniquement à partir de ce que tu as noté et de tes réservations FIK. Salaire et charges sont comptés par mois entier. Les ventes des premiers jours sont reprises de tes messages.', 8.5, GREY);
  doc.end();
  return done;
}

/** Fabrique le PDF et le met dans la file Telegram ; renvoie la légende. */
export async function buildRecap(from: string | undefined, to: string, title?: string): Promise<{ pdf: Buffer; name: string; caption: string; recap: Recap }> {
  const recap = await recapData(from, to, title);
  const pdf = await recapPdf(recap);
  const caption = `📊 Ton récap ${recap.title} : total ${eur(recap.savings + recap.cash)}, cash ${eur(recap.cash)}, ${sign(recap.gains)} rentrés${recap.bestDay ? `, meilleur jour ${dm(recap.bestDay.d)}` : ''}.`;
  return { pdf, name: `Recap-argent-${recap.from}-au-${recap.to}.pdf`, caption, recap };
}

export async function sendRecap(from: string | undefined, to: string, title?: string): Promise<string> {
  const { pdf, name, caption } = await buildRecap(from, to, title);
  const { queueTelegramFile } = await import('../actions/handlers/nexus-relay.js');
  await queueTelegramFile(pdf.toString('base64'), name, caption);
  return `${caption}\n📄 Le document avec les graphiques arrive sur Telegram.`;
}

/** Dernier jour du mois : photo du capital (pour comparer le mois suivant) + récap du mois envoyé. */
export async function monthEndRecap(): Promise<void> {
  const { date } = localNow();
  const f = await loadFinances();
  await kvPut(`perso:capital:${date.slice(0, 7)}`, { savings: f.savings ?? 0, cash: f.sideCash ?? 0, at: date });
  await sendRecap(`${date.slice(0, 7)}-01`, date, `de ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`);
}
