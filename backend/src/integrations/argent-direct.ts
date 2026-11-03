// ARGENT EN DIRECT (02/11/2026, Kouider : « Dzaryx invente des chiffres ; je lui dis ce que je gagne, il doit l'enregistrer,
// savoir ce que j'ai gagné hier / aujourd'hui, quel jour je gagne le plus, et donner les VRAIS chiffres : salaire, capital 15k,
// cash… »). Constat : « hier je fais 300 € avec le snus, je suis à 2 400 € en cash » → le cerveau a répondu « ✅ Noté » SANS
// rien enregistrer, puis « 7 950 € au total » (inventé ; vrai total = épargne + cash).
// → Ces phrases sont lues et exécutées PAR LE CODE (comme le GPS de vie), la réponse vient des données, jamais de l'IA.
// Données PRIVÉES (app_kv perso:journal / perso:finances) : aucun chiffre dans ce dépôt public.
import { kvJson, kvPut } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { loadFinances } from './perso-finances.js';

type Entry = { d: string; t: 'vente' | 'achat' | 'depense'; cat: string; amount: number; mode: 'cash' | 'carte'; note?: string };
const J = 'perso:journal';
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const wd = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const label = (d: string) => `${DAYS[wd(d)]} ${dm(d)}`;

export type MoneyCommand = {
  sale?: { amount: number; date: string; cat: string };
  cash?: number;
  cashDelta?: number;   // 03/11 : mouvement de caisse sans total (« j'ai pris 200 du cash ») → appliqué au cash enregistré
  cashCalc?: string;    // le calcul fait, montré à Kouider (« 2 200 € + 400 € récupérés »)
  ask?: { kind: 'total' | 'cash' | 'gains' | 'best'; from?: string; to?: string; title?: string };
};

const MONEY = /gagn|vend|ventes?\b|encaiss|cash|caisse|liquide|snus|argent|€|euros?\b|capital|fortune|patrimoine|tout confondu|au total|en tout|combien d.argent|j.ai combien\s*\??\s*$|b[ée]n[ée]f|thune|rentr[ée]|[ée]pargne/i;   // 02/11 « j'ai combien au total ? » partait au cerveau (risque de chiffre inventé)
const OTHER = /calori|kcal|\bpas\b|km\b|kg\b|kilos?|séance|seance|sommeil|dormi|course[s]? (?:à|a) pied/i;
const FIK_ONLY = /\b(fik|locations?|voitures?|clio|clients?|r[ée]servations?|bookings?|conciergerie|sites?)\b/i;

function parseNum(s: string): number | null {
  const m = s.match(/(\d{1,3}(?:[\s. ]\d{3})+|\d+(?:[.,]\d+)?)\s*(k\b)?/i);
  if (!m) return null;
  let v = parseFloat(m[1]!.replace(/[\s. ](?=\d{3}\b)/g, '').replace(',', '.'));
  if (m[2]) v *= 1000;
  return Number.isFinite(v) ? v : null;
}

/** Jour visé : « hier », « avant-hier », « mardi », « le 30 », sinon aujourd'hui. */
function dayOf(msg: string, today: string): string | null {
  if (/avant[- ]hier/i.test(msg)) return addDays(today, -2);
  if (/\bhier\b/i.test(msg)) return addDays(today, -1);
  if (/aujourd|ce soir|ce matin|\bce jour\b/i.test(msg)) return today;
  const w = msg.toLowerCase().match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
  if (w) { const t = DAYS.indexOf(w[1]!); let d = today; for (let i = 0; i < 7 && wd(d) !== t; i++) d = addDays(d, -1); return d; }
  const n = msg.match(/\b(?:le|du)\s+(\d{1,2})(?:\/(\d{1,2}))?\b/);
  if (n) { const day = Number(n[1]), mo = n[2] ? Number(n[2]) : Number(today.slice(5, 7)); if (day >= 1 && day <= 31 && mo >= 1 && mo <= 12) { let y = Number(today.slice(0, 4)); const d = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`; if (d > today) y--; return `${y}-${d.slice(5)}`; } }
  return null;
}

export function parseMoneyCommand(raw: string): MoneyCommand | null {
  let msg = raw;
  for (let i = 0; i < 3; i++) { const m = msg.match(/^\s*\[[\s\S]*?\]\s*/); if (!m) break; msg = msg.slice(m[0].length); }
  msg = msg.replace(/^CONFIRM[ÉE] AU T[ÉE]L[ÉE]PHONE\s*:\s*/i, '').trim();
  if (!msg || msg.length > 300 || !MONEY.test(msg) || OTHER.test(msg)) return null;
  const today = localNow().date;
  const question = /\?|combien|quel(?:le)?s? jours?|meilleur jour|j.en suis|je suis (?:à|a) combien|c.est quoi mon|dis[- ]moi/i.test(msg);
  const snus = /snus/i.test(msg);
  if (/combien de (?!fric|thune|sous|argent|cash|liquide)\p{L}/iu.test(msg) && !/gagn|vend|encaiss|€|euros?\b/i.test(msg)) return null;   // « combien de messages/clients au total » ≠ argent
  if (FIK_ONLY.test(msg) && !snus && !/tout confondu/i.test(msg)) return null;   // « combien de clients au total » = FIK, pas l'argent perso   // CA FIK = réservations : autre outil
  const out: MoneyCommand = {};

  if (question) {
    if (/quel(?:le)?s? jours?|meilleur jour|jour o[ùu]/i.test(msg) && /gagn|vend|plus|meilleur|rapport/i.test(msg)) out.ask = { kind: 'best' };
    else if (/tout confondu|au total|en tout|capital|fortune|patrimoine|[ée]pargne|combien d.argent|j.ai combien|je suis (?:à|a) combien|combien j.ai(?! (?:gagn|vendu|fait|encaiss))/i.test(msg) && !/gagn|vendu|encaiss/i.test(msg)) out.ask = { kind: /cash|caisse|liquide/i.test(msg) && !/tout confondu|au total|capital|patrimoine/i.test(msg) ? 'cash' : 'total' };
    else if (/combien.{0,25}(cash|caisse|liquide)/i.test(msg) && !/gagn|vendu/i.test(msg)) out.ask = { kind: 'cash' };
    else if (/gagn|vend|ventes?\b|encaiss|rentr|b[ée]n[ée]f|fait\b.{0,15}(€|euros?|snus)|snus/i.test(msg)) {
      if (/semaine derni|la semaine pass/i.test(msg)) { const mon = addDays(today, -((wd(today) + 6) % 7) - 7); out.ask = { kind: 'gains', from: mon, to: addDays(mon, 6), title: 'la semaine dernière' }; }
      else if (/cette semaine|la semaine/i.test(msg)) out.ask = { kind: 'gains', from: addDays(today, -((wd(today) + 6) % 7)), to: today, title: 'cette semaine' };
      else if (/mois dernier|le mois pass/i.test(msg)) { const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); const m = d.toISOString().slice(0, 7); out.ask = { kind: 'gains', from: `${m}-01`, to: `${m}-31`, title: 'le mois dernier' }; }
      else if (/ce mois|du mois|le mois/i.test(msg)) out.ask = { kind: 'gains', from: `${today.slice(0, 7)}-01`, to: today, title: 'ce mois-ci' };
      else { const d = dayOf(msg, today); out.ask = d ? { kind: 'gains', from: d, to: d, title: d === today ? "aujourd'hui" : d === addDays(today, -1) ? 'hier' : label(d) } : { kind: 'gains' }; }
    }
    return out.ask ? out : null;
  }

  // ── Enregistrements ──
  // Cash total : « je suis en total en cash à 2400 », « cash 2400 », « j'ai 2400 en cash », « caisse à 2400 »
  let cashPos = -1;
  const cashNums = new Set<number>();   // positions des chiffres déjà lus comme mouvements de caisse (pas des ventes)
  const c1 = /(?:cash|caisse|liquide)\D{0,18}?(\d[\d\s. ,]*\s*k?)/i.exec(msg);
  const c2 = /(\d[\d\s. ,]*\s*k?)\s*(?:€|euros?)?\s*(?:en|de)\s*(?:cash|liquide)/i.exec(msg);
  // 03/11 « -200€ en cash », « cash +400 », « moins 200 de la caisse » = mouvement, JAMAIS « ton cash = 200 »
  const signed = [...msg.matchAll(/(?:^|[\s(:])([+−–-]|moins|plus)\s*(\d[\d\s.,]*\s*k?)\s*(?:€|euros?)?\s*(?:(?:en|de|du|dans|sur)\s+(?:la\s+|le\s+|mon\s+|ma\s+)?)?(?=cash|caisse|liquide)/giu),
    ...msg.matchAll(/(?:cash|caisse|liquide)\s*:?\s*([+−–-]|moins|plus)\s*(\d[\d\s.,]*\s*k?)/giu)]
    .map(m => ({ v: parseNum(m[2]!), sign: /^(\+|plus)$/i.test(m[1]!) ? 1 : -1 })).filter(x => x.v !== null && x.v >= 1 && x.v <= 1_000_000) as Array<{ v: number; sign: number }>;
  if (signed.length && !/retomb|redescend|remont|repass|il me reste|je suis (?:à|a)\s+\d/i.test(msg)) return { cashDelta: signed.reduce((t, x) => t + x.sign * x.v, 0) };
  const cm = /total|en tout|je suis|j.ai|il me reste|caisse|^\s*(?:mon\s+)?cash\b/i.test(msg) ? (c1 ?? c2) : null;
  if (cm) { const v = parseNum(cm[1]!); if (v !== null && v >= 10 && v <= 1_000_000) { out.cash = Math.round(v); cashPos = cm.index + cm[0].lastIndexOf(cm[1]!); } }
  // Mouvements de caisse (03/11, « je pris 200 € du cash hier donc je suis retombé à 2200 € mais aujourd'hui je récupère 400 € »
  // → rien n'était lu, le cerveau a répondu « Cash +400 € enregistré, 2 600 € » sans rien écrire).
  const cashCtx = /cash|caisse|liquide/i.test(msg);
  const NUM = '(\\d[\\d\\s.,]*\\s*k?)';
  const absM = new RegExp('(?:retomb|redescend|remont|repass|tomb)\\p{L}*\\s+(?:(?:à|a)\\s+)?' + NUM, 'iu').exec(msg)
    ?? (cashCtx ? new RegExp('(?:je suis|j.ai|il me reste)\\s+(?:(?:à|a)\\s+|plus que\\s+)?' + NUM + '\\s*(?:€|euros?)', 'iu').exec(msg) : null);
  const plusRe = new RegExp('(?:r[ée]cup[èée]r\\p{L}*|remets|remis|rajout\\p{L}*|ajout\\p{L}*|reçu|recu|remet\\p{L}*|rembours\\p{L}*|rends|rendu)\\D{0,12}?' + NUM, 'giu');
  const minusRe = new RegExp('(?:pris|prends|retir\\p{L}*|sorti\\p{L}*|enlev\\p{L}*|tir[ée]|pioch\\p{L}*|emprunt\\p{L}*)\\D{0,8}?' + NUM + '\\s*(?:€|euros?)?\\s*(?:du|de|dans|en|sur)\\s+(?:la\\s+|le\\s+|mon\\s+|ma\\s+)?(?:cash|caisse|liquide)', 'giu');
  const moves = (re: RegExp, sign: number) => [...msg.matchAll(re)].map(m => ({ pos: m.index! + m[0].lastIndexOf(m[1]!), v: parseNum(m[1]!), sign })).filter(x => x.v !== null && x.v >= 1 && x.v <= 1_000_000) as Array<{ pos: number; v: number; sign: number }>;
  if (cashCtx || absM) {
    const plus = moves(plusRe, 1), minus = cashCtx ? moves(minusRe, -1) : [];
    if (absM && (cashCtx || plus.length || minus.length)) {
      const base = parseNum(absM[1]!), at = absM.index! + absM[0].lastIndexOf(absM[1]!);
      if (base !== null && base >= 0 && base <= 1_000_000) {
        const after = [...plus, ...minus].filter(x => x.pos > at);   // ce qui est AVANT le total explique comment il y est arrivé
        const total = after.reduce((s, x) => s + x.sign * x.v, base);
        out.cash = Math.max(0, Math.round(total)); cashPos = at;
        if (after.length) out.cashCalc = [eur(base), ...after.map(x => `${x.sign > 0 ? '+' : '−'} ${eur(x.v)}${x.sign > 0 ? ' récupérés' : ' pris'}`)].join(' ') + ` = ${eur(out.cash)}`;
      }
    } else if (out.cash === undefined && (plus.length || minus.length) && cashCtx) {
      out.cashDelta = [...plus, ...minus].reduce((s, x) => s + x.sign * x.v, 0);
    }
    for (const x of [...plus, ...minus]) cashNums.add(x.pos);   // mouvement de caisse ≠ vente
  }
  // Vente : « hier j'ai fait 300 € avec le snus », « snus 180 », « j'ai vendu pour 150 »
  if (!/d[ée]pens|course|essence|achet|achat|command|pay[ée]|factur|amende|loyer/i.test(msg)) {
    const res = [
      /(?:fait|fais|vendu|vends|gagn[ée]?|encaiss[ée]?|rentr[ée]|snus)\D{0,25}?(\d[\d\s. ,]*\s*k?)/gi,
      /(\d[\d\s. ,]*\s*k?)\s*(?:€|euros?)?\s*(?:avec|de|en|du)\s*(?:le\s+|du\s+)?snus/gi,
    ];
    for (const re of res) {
      for (const m of msg.matchAll(re)) {
        const pos = m.index! + m[0].lastIndexOf(m[1]!);
        if (pos === cashPos || cashNums.has(pos)) continue;
        const v = parseNum(m[1]!);
        if (v !== null && v >= 1 && v <= 20_000 && (snus || /€|euros?/i.test(msg))) { out.sale = { amount: Math.round(v * 100) / 100, date: dayOf(msg, today) ?? today, cat: /fik/i.test(msg) && !snus ? 'fik' : 'snus' }; break; }
      }
      if (out.sale) break;
    }
  }
  return out.sale || out.cash !== undefined || out.cashDelta !== undefined ? out : null;
}

// ── Lectures ──
const journal = () => kvJson<Entry[]>(J, []);

export async function gainsText(from?: string, to?: string, title?: string): Promise<string> {
  const today = localNow().date;
  const l = (await journal()).filter(e => e.t === 'vente');
  const sumIn = (a: string, b: string) => l.filter(e => e.d >= a && e.d <= b).reduce((s, e) => s + e.amount, 0);
  const detail = (a: string, b: string) => { const m = new Map<string, number>(); for (const e of l.filter(x => x.d >= a && x.d <= b)) m.set(e.cat, (m.get(e.cat) ?? 0) + e.amount); return [...m].map(([k, v]) => `${k} ${eur(v)}`).join(' · '); };
  if (!l.length) return "📒 Je n'ai encore AUCUNE vente notée — je ne te donne pas de chiffre inventé. Dis-moi chaque soir « snus 150 » (ou « hier j'ai fait 300 avec le snus ») et je tiens les comptes jour par jour.";
  if (from && to) {
    const s = sumIn(from, to);
    if (from === to) {
      const lines = l.filter(e => e.d === from);
      return lines.length ? `💵 ${title ? title[0]!.toUpperCase() + title.slice(1) : label(from)} (${label(from)}) : ${eur(s)} — ${detail(from, to)}.` : `📒 Rien de noté pour ${title ?? label(from)} (${label(from)}). Si tu as vendu, dis-moi « snus 150 »${from !== today ? ` en précisant le jour` : ''} — je n'invente pas.`;
    }
    const days = new Set(l.filter(e => e.d >= from && e.d <= to).map(e => e.d)).size;
    return days ? `💵 ${title ? title[0]!.toUpperCase() + title.slice(1) : `Du ${dm(from)} au ${dm(to)}`} : ${eur(s)} sur ${days} jour${days > 1 ? 's' : ''} notés (${detail(from, to)}) — moyenne ${eur(s / days)}/jour noté.` : `📒 Rien de noté ${title ?? `du ${dm(from)} au ${dm(to)}`}.`;
  }
  const mon = addDays(today, -((wd(today) + 6) % 7));
  return [`💵 TES GAINS NOTÉS`, `• Aujourd'hui : ${eur(sumIn(today, today))}`, `• Hier : ${eur(sumIn(addDays(today, -1), addDays(today, -1)))}`, `• Cette semaine : ${eur(sumIn(mon, today))}`, `• Ce mois : ${eur(sumIn(`${today.slice(0, 7)}-01`, today))}`].join('\n');
}

export async function bestDayText(): Promise<string> {
  const l = (await journal()).filter(e => e.t === 'vente');
  const byDay = new Map<string, number>();
  for (const e of l) byDay.set(e.d, (byDay.get(e.d) ?? 0) + e.amount);
  if (byDay.size < 3) return `📒 Seulement ${byDay.size} jour${byDay.size > 1 ? 's' : ''} noté${byDay.size > 1 ? 's' : ''} pour l'instant — pas assez pour dire quel jour tu gagnes le plus. Note chaque soir (« snus 150 ») : dans 2 semaines je te le dis avec de vrais chiffres.`;
  const w = new Map<number, number[]>();
  for (const [d, v] of byDay) { const k = wd(d); w.set(k, [...(w.get(k) ?? []), v]); }
  const rows = [...w].map(([k, v]) => ({ day: DAYS[k]!, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length, total: v.reduce((a, b) => a + b, 0) })).sort((a, b) => b.avg - a.avg);
  const few = rows.some(r => r.n < 2) ? '\n(Certains jours n\'ont qu\'une semaine de données : ça se précise avec le temps.)' : '';
  return [`📊 TES MEILLEURS JOURS (moyenne des jours notés, ${byDay.size} jours)`, ...rows.map((r, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} ${r.day[0]!.toUpperCase() + r.day.slice(1)} : ${eur(r.avg)} en moyenne (${r.n} fois, total ${eur(r.total)})`)].join('\n') + few;
}

export async function totalText(): Promise<string> {
  const f = await loadFinances() as Awaited<ReturnType<typeof loadFinances>> & { sideCashAt?: string; savingsAt?: string };
  const save = f.savings ?? 0, cash = f.sideCash ?? 0;
  const lines = [`💰 TOTAL TOUT CONFONDU : ${eur(save + cash)}`,
    `• Épargne : ${save ? eur(save) : 'pas notée'}${f.savingsAt ? ` (au ${dm(f.savingsAt)})` : ''}`,
    `• Cash (caisse ${f.side?.label ?? 'appoint'}) : ${cash ? eur(cash) : 'pas noté'}${f.sideCashAt ? ` (au ${dm(f.sideCashAt)})` : ''}`];
  if (f.salary) lines.push(`Revenus : salaire ${eur(f.salary)}/mois${f.side ? ` + ${f.side.label} ≈ ${eur(f.side.dailyMin)}/jour` : ''} (pas comptés dans le total, c'est ce qui rentre).`);
  lines.push('Pour corriger : « cash 2400 », « épargne 15 000 ».');
  return lines.join('\n');
}

// ── Exécution ──
export async function runMoneyCommand(c: MoneyCommand): Promise<string> {
  if (c.ask) {
    if (c.ask.kind === 'total') return totalText();
    if (c.ask.kind === 'best') return bestDayText();
    if (c.ask.kind === 'cash') { const f = await loadFinances() as { sideCash?: number; sideCashAt?: string }; return f.sideCash ? `💵 Cash : ${eur(f.sideCash)}${f.sideCashAt ? ` (noté le ${dm(f.sideCashAt)})` : ''}.` : '📒 Ton cash n\'est pas noté. Dis « cash 2400 ».'; }
    return gainsText(c.ask.from, c.ask.to, c.ask.title);
  }
  const out: string[] = [];
  if (c.sale) {
    const l = await journal();
    const dup = l.some(e => e.t === 'vente' && e.d === c.sale!.date && e.cat === c.sale!.cat && e.amount === c.sale!.amount && e.note === 'auto');
    if (!dup) { l.push({ d: c.sale.date, t: 'vente', cat: c.sale.cat, amount: c.sale.amount, mode: 'cash', note: 'auto' }); await kvPut(J, l); }
    const day = l.filter(e => e.t === 'vente' && e.d === c.sale!.date).reduce((s, e) => s + e.amount, 0);
    out.push(`✅ Enregistré : ${c.sale.cat} +${eur(c.sale.amount)} le ${label(c.sale.date)}${day !== c.sale.amount ? ` (total ce jour-là ${eur(day)})` : ''}.`);
  }
  if (c.cashDelta !== undefined && c.cash === undefined) {
    const f = await kvJson<{ sideCash?: number }>('perso:finances', {});
    if (f.sideCash == null) return `📒 Ton cash n'est pas encore noté, je ne peux pas faire ${c.cashDelta >= 0 ? '+' : '−'} ${eur(Math.abs(c.cashDelta))}. Dis « cash 2400 » avec le total.`;
    c.cash = Math.max(0, Math.round(f.sideCash + c.cashDelta));
    c.cashCalc = `${eur(f.sideCash)} ${c.cashDelta >= 0 ? '+' : '−'} ${eur(Math.abs(c.cashDelta))} = ${eur(c.cash)}`;
  }
  if (c.cash !== undefined) {
    const f = await kvJson<Record<string, unknown>>('perso:finances', {});
    await kvPut('perso:finances', { ...f, sideCash: c.cash, sideCashAt: localNow().date, updated: localNow().date });
    out.push(`✅ Cash mis à jour : ${eur(c.cash)}${c.cashCalc ? ` (${c.cashCalc})` : ''}.`);
  }
  out.push((await totalText()).split('\n')[0]!);
  return out.join('\n');
}

/** Pour l'outil mes_finances : 'gains' (date | month | from/to), 'meilleur_jour', 'total', 'cash' (amount = nouveau total cash). */
export async function moneyToolAction(action: string, input: Record<string, unknown>): Promise<string | null> {
  const today = localNow().date;
  if (action === 'total') return totalText();
  if (action === 'meilleur_jour') return bestDayText();
  if (action === 'cash') { const a = Number(input['amount']); if (Number.isFinite(a) && a > 0) return runMoneyCommand({ cash: Math.round(a) }); return runMoneyCommand({ ask: { kind: 'cash' } }); }
  if (action === 'gains') {
    const d = String(input['date'] ?? ''), m = String(input['month'] ?? ''), fr = String(input['from'] ?? ''), to = String(input['to'] ?? '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return gainsText(d, d, d === today ? "aujourd'hui" : undefined);
    if (/^\d{4}-\d{2}$/.test(m)) return gainsText(`${m}-01`, `${m}-31`, `en ${m.slice(5)}/${m.slice(0, 4)}`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(fr)) return gainsText(fr, /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today);
    return gainsText();
  }
  return null;
}
