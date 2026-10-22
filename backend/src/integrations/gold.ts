import { kvGet, kvSet } from './app-store.js';
import { autoCall } from '../notifications/auto-call.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// SURVEILLANCE DE L'OR (demande de Kouider 2026-10-22) : il aime investir dans l'or, il a un capital en cash en Algérie
// (600 € au départ) et veut que Dzaryx le fasse grossir. Dzaryx n'achète rien lui-même : il surveille le cours, prévient
// (Telegram + app + appel) quand l'or a assez baissé pour être intéressant, dit combien acheter (capital en 3 tranches),
// après combien de temps l'achat devient rentable (frais d'achat/revente compris), et quand revendre avec bénéfice.
// Il n'achète qu'EN ALGÉRIE, en bijou 18 carats ou en louis → on suit le prix algérien du 18 carats en DINARS (au taux
// du square), pas le cours mondial en euros. Tout est compté en dinars, l'équivalent en € est donné au change du square.
// Cours : ExchangeDZ (historique jour par jour 18K/21K/24K DZD/g = or COMEX × dollar au square) + gold-api.com en direct
// au même calcul ; secours Yahoo GC=F × dernier taux connu. Aucune clé.
// Portefeuille : app_kv `kouider:gold` (capital, achats, ventes, réglages).

const KEY = 'kouider:gold';
const OZ = 31.1035;                       // grammes dans une once
const LONG_TERM = 0.08;                   // hausse moyenne de l'or sur 20 ans ≈ 8 %/an (estimation prudente)
const PURITY: Record<number, number> = { 24: 0.999, 22: 0.916, 21: 0.875, 18: 0.75 };   // louis d'or = 21,6 carats (0,900)
const purity = (karat: number) => PURITY[karat] ?? karat / 24;

interface GoldBuy { date: string; grams: number; karat: number; paid_dzd: number; paid_eur?: number; note?: string }
interface GoldSell { date: string; grams: number; karat: number; got_dzd: number }
interface GoldBook {
  unit?: 'dzd';              // absent = ancien carnet en euros (converti au 1er passage)
  capital: number; cash: number; tranches: number;   // en dinars
  buy_premium: number;       // ce qu'on paie au-dessus du prix du métal (or cassé ≈ 5 %, bijou neuf avec façon bien plus)
  sell_discount: number;     // ce que le bijoutier retient à la revente (≈ 5 % sous le prix du métal)
  drop_pct: number;          // baisse depuis le plus haut du mois qui déclenche l'alerte d'achat
  target_pct: number;        // bénéfice net visé avant de conseiller la revente
  buys: GoldBuy[]; sells: GoldSell[];
  usd_dzd?: number; eur_dzd?: number;   // derniers taux du square vus (secours si ExchangeDZ ne répond pas)
  my_eur_dzd?: number;       // taux fixé par Kouider s'il le demande (prioritaire) ; absent = square ExchangeDZ du jour
  capital_eur?: number;      // capital donné en € → recalculé en dinars si son taux change
  last_buy_alert?: { at: string; price: number }; last_sell_alert?: { at: string; price: number };
}
const DEFAULT: GoldBook = { unit: 'dzd', capital: 0, cash: 0, tranches: 3, buy_premium: 0.05, sell_discount: 0.05, drop_pct: 5, target_pct: 10, buys: [], sells: [] };

async function book(): Promise<GoldBook> {
  try {
    const raw = JSON.parse((await kvGet(KEY)) ?? '{}') as Partial<GoldBook>;
    return { ...DEFAULT, ...raw, unit: raw.capital || raw.buys?.length ? raw.unit : 'dzd' } as GoldBook;
  } catch { return { ...DEFAULT }; }
}
const saveBook = (b: GoldBook) => kvSet(KEY, JSON.stringify(b));

/** Ancien carnet en euros (22/10) → dinars au change du square du jour. */
function migrate(b: GoldBook, m: Market): void {
  if (b.unit === 'dzd') return;
  const r = m.eurDzd;
  b.capital *= r; b.cash *= r;
  b.buys = b.buys.map(x => { const o = x as GoldBuy & { paid_eur?: number }; return { ...o, paid_dzd: o.paid_dzd ?? (o.paid_eur ?? 0) * r }; });
  b.sells = b.sells.map(x => { const o = x as GoldSell & { got_eur?: number }; return { ...o, got_dzd: o.got_dzd ?? (o.got_eur ?? 0) * r }; });
  delete b.last_buy_alert; delete b.last_sell_alert;   // prix d'alerte en €/g pur : plus comparables
  b.unit = 'dzd';
}

const dzd = (x: number) => `${Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} DA`;
let EUR_DZD = 275;   // mis à jour à chaque lecture du cours
const eur = (x: number) => `${Math.round(x / EUR_DZD)} €`;
const money = (x: number) => `${dzd(x)} (≈ ${eur(x)})`;
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const frDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

// ── Cours ────────────────────────────────────────────────────────────────────────────────────────
interface Market {
  now: number;            // dinars par gramme d'or 18 carats, marché algérien
  high30: number; avg30: number; low30: number; high90: number;
  ago1y: number | null;   // il y a un an
  usdDzd: number; eurDzd: number;   // eurDzd = taux de Kouider au marché noir s'il l'a donné, sinon square ExchangeDZ
  squareEurDzd: number;
  source: string;
  at: string;
}

interface Point { t: number; p18: number }

/** Page or d'ExchangeDZ : historique 18K en DZD/g + taux du square. */
async function exchangeDz(): Promise<{ hist: Point[]; usd: number; eur: number }> {
  const r = await fetch('https://www.exchangedz.com/gold', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`ExchangeDZ ${r.status}`);
  const html = await r.text();
  const hist = [...html.matchAll(/date:"(\d{4}-\d{2}-\d{2})T[^"]*",price18k:(\d+)/g)]
    .map(x => ({ t: Date.parse(x[1]), p18: Number(x[2]) }))
    .filter(x => x.p18 > 0).sort((a, b) => a.t - b.t);
  const rate = (code: string) => {
    const x = html.match(new RegExp(`assetCode:"${code}",rates:\\[\\{[^}]*?source:"exchangedz",buyRate:([\\d.]+)`));
    return x ? Number(x[1]) : 0;
  };
  if (hist.length < 20) throw new Error('ExchangeDZ : historique illisible');
  return { hist, usd: rate('USD'), eur: rate('EUR') };
}

async function yahooGold(): Promise<Point[]> {
  const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=1y&interval=1d',
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Yahoo GC=F ${r.status}`);
  const j = await r.json() as { chart?: { result?: Array<{ timestamp: number[]; indicators: { quote: Array<{ close: Array<number | null> }> } }> } };
  const res = j.chart?.result?.[0];
  const closes = res?.indicators.quote[0]?.close ?? [];
  const pts = (res?.timestamp ?? []).map((t, i) => ({ t: t * 1000, p18: closes[i] ?? 0 })).filter(x => x.p18 > 0);
  if (pts.length < 30) throw new Error('Yahoo GC=F : historique trop court');
  return pts;   // en $ l'once, converti par l'appelant
}

export async function goldMarket(): Promise<Market> {
  const b = await book();
  let hist: Point[]; let usd = b.usd_dzd ?? 239, eurR = b.eur_dzd ?? 275, source = 'ExchangeDZ (square)';
  try {
    const x = await exchangeDz();
    hist = x.hist;
    if (x.usd > 0) usd = x.usd;
    if (x.eur > 0) eurR = x.eur;
    if (x.usd > 0 && (x.usd !== b.usd_dzd || x.eur !== b.eur_dzd)) { b.usd_dzd = x.usd; b.eur_dzd = x.eur || b.eur_dzd; await saveBook(b).catch(() => {}); }
  } catch {
    // Secours : or COMEX × dernier dollar au square connu (même calcul qu'ExchangeDZ)
    hist = (await yahooGold()).map(x => ({ t: x.t, p18: x.p18 * usd / OZ * PURITY[18] }));
    source = 'cours mondial × dernier taux du square';
  }
  let now = hist[hist.length - 1].p18;
  try {   // en direct (ExchangeDZ ne met à jour qu'une fois par jour)
    const s = await fetch('https://api.gold-api.com/price/XAU', { signal: AbortSignal.timeout(8_000) }).then(r => r.json()) as { price?: number };
    const live = s.price ? s.price * usd / OZ * PURITY[18] : 0;
    if (live && Math.abs(live / now - 1) < 0.05) now = live;
  } catch { /* dernier cours du jour */ }
  const squareEur = eurR;
  if (b.my_eur_dzd) eurR = b.my_eur_dzd;
  EUR_DZD = eurR;
  const since = (days: number) => { const v = hist.filter(x => x.t >= Date.now() - days * 86_400_000).map(x => x.p18); return v.length ? v : [now]; };
  const m30 = [...since(30), now], m90 = [...since(90), now];
  const year = hist.filter(x => x.t <= Date.now() - 335 * 86_400_000).pop();
  return {
    now,
    high30: Math.max(...m30), low30: Math.min(...m30), avg30: m30.reduce((a, c) => a + c, 0) / m30.length,
    high90: Math.max(...m90),
    ago1y: year && year.t >= Date.now() - 400 * 86_400_000 ? year.p18 : null,
    usdDzd: usd, eurDzd: eurR, squareEurDzd: squareEur, source,
    at: new Date().toISOString(),
  };
}

// ── Calculs ──────────────────────────────────────────────────────────────────────────────────────
/** Valeur du métal en dinars (le cours suivi est celui du 18 carats). */
const metal = (grams: number, karat: number, m: Market) => grams * purity(karat) / PURITY[18] * m.now;
/** Ce que le bijoutier en donnerait aujourd'hui. */
const resale = (grams: number, karat: number, m: Market, b: GoldBook) => metal(grams, karat, m) * (1 - b.sell_discount);
/** Hausse du cours nécessaire pour retrouver sa mise (frais d'achat + de revente). */
const breakEvenRise = (b: GoldBook) => (1 + b.buy_premium) / (1 - b.sell_discount) - 1;
/** Mois pour que le cours monte de `rise` au rythme annuel `g`. */
const monthsFor = (rise: number, g: number) => g <= 0 ? Infinity : Math.ceil(Math.log(1 + rise) / Math.log(1 + g) * 12);
const monthsText = (m: number) => !Number.isFinite(m) ? 'jamais au rythme actuel (le cours baisse sur un an)' : m < 12 ? `${m} mois` : `${Math.floor(m / 12)} an${m >= 24 ? 's' : ''}${m % 12 ? ` et ${m % 12} mois` : ''}`;
const g1 = (x: number) => x.toFixed(1).replace('.', ',');
const karatName = (k: number) => k === 21.6 ? 'louis (21,6 carats)' : `${k} carats`;

function holdings(b: GoldBook) {
  const g = new Map<number, number>();
  for (const x of b.buys) g.set(x.karat, (g.get(x.karat) ?? 0) + x.grams);
  for (const x of b.sells) g.set(x.karat, (g.get(x.karat) ?? 0) - x.grams);
  const paid = b.buys.reduce((a, x) => a + x.paid_dzd, 0) - b.sells.reduce((a, x) => a + x.got_dzd, 0);
  return { byKarat: [...g].filter(([, gr]) => gr > 0.001), paid };
}

/** Rentabilité d'un achat fait aujourd'hui avec `amount` dinars. */
function plan(amount: number, m: Market, b: GoldBook): string {
  const rise = breakEvenRise(b);
  const grams18 = amount / (m.now * (1 + b.buy_premium));
  const yearly = m.ago1y ? m.now / m.ago1y - 1 : null;
  const back = m.high30 / m.now - 1;
  const lines = [
    `Avec ${money(amount)} : environ ${g1(grams18)} g d'or 18 carats (prix du métal + ${pct(b.buy_premium)} de marge du bijoutier).`,
    `Rentable quand le cours a pris ${pct(rise)} (marge à l'achat + ce que le bijoutier retient à la revente).`,
    `→ Au rythme moyen de l'or sur 20 ans (≈ ${pct(LONG_TERM)}/an) : rentable en ${monthsText(monthsFor(rise, LONG_TERM))}.`,
    yearly !== null ? `→ Au rythme de la dernière année en dinars (${yearly >= 0 ? '+' : ''}${pct(yearly)}) : ${monthsText(monthsFor(rise, yearly))}.` : '',
    back > rise ? `→ S'il remonte juste à son plus haut du mois (${dzd(m.high30)}/g, +${pct(back)}), tu gagnes environ ${money(amount * ((1 + back) / (1 + rise) - 1))} net.` : '',
    `Bénéfice visé : +${b.target_pct} % net, soit ${money(amount * b.target_pct / 100)} → 18 carats à ${dzd(m.now * (1 + rise) * (1 + b.target_pct / 100))}/g. Je te préviens quand on y est.`,
  ];
  return lines.filter(Boolean).join('\n');
}

function marketText(m: Market): string {
  const drop = 1 - m.now / m.high30;
  return `🪙 Or 18 carats en Algérie : ${dzd(m.now)}/g (≈ ${eur(m.now)}) · louis ≈ ${dzd(m.now * 0.9 / PURITY[18] * 6.45)} la pièce (6,45 g) · 24 carats ${dzd(m.now * PURITY[24] / PURITY[18])}/g.\n` +
    `Sur 1 mois : plus haut ${dzd(m.high30)}, moyenne ${dzd(m.avg30)}, plus bas ${dzd(m.low30)} → ` +
    (drop > 0.005 ? `${pct(drop)} sous le plus haut du mois.` : 'au plus haut du mois.') +
    (m.ago1y ? `\nSur 1 an : ${m.now >= m.ago1y ? '+' : ''}${pct(m.now / m.ago1y - 1)} en dinars.` : '') +
    (m.eurDzd !== m.squareEurDzd
      ? `\nTon change : 1 € = ${g1(m.eurDzd)} DA (square ExchangeDZ : 1 € = ${g1(m.squareEurDzd)} DA, 1 $ = ${g1(m.usdDzd)} DA ; prix de l'or : ${m.source}).`
      : `\nSquare : 1 € = ${g1(m.eurDzd)} DA, 1 $ = ${g1(m.usdDzd)} DA (source ${m.source}).`);
}

const HONEST = `⚠️ L'or monte sur le long terme mais peut baisser pendant des mois : n'y mets que l'argent dont tu n'as pas besoin avant 1 à 2 ans. ` +
  `En bijou, achète au poids (or cassé ou bijou simple) : la façon d'un bijou neuf est perdue à la revente ; le louis se revend facilement. ` +
  `C'est un prix de référence (or mondial × dollar au square) : le prix du bijoutier peut s'en écarter de quelques %, compare 2-3 bijoutiers avant.`;

// ── Surveillance (job « gold-watch ») ───────────────────────────────────────────────────────────
/** Achat : l'or a baissé d'au moins drop_pct depuis son plus haut du mois et passe sous sa moyenne → message + appel.
 *  Revente : l'or qu'il a vaut target_pct de plus que ce qu'il a payé, frais de revente déduits → message + appel. */
export async function jobGoldWatch(): Promise<void> {
  const m = await goldMarket();
  const b = await book();
  if (b.unit !== 'dzd') { migrate(b, m); await saveBook(b); }
  const now = Date.now();
  const days = (iso?: string) => iso ? (now - new Date(iso).getTime()) / 86_400_000 : Infinity;

  const drop = 1 - m.now / m.high30;
  const lastBuy = b.last_buy_alert;
  const buySignal = drop * 100 >= b.drop_pct && m.now < m.avg30 &&
    (!lastBuy || m.now < lastBuy.price * 0.97 || days(lastBuy.at) > 14);   // pas de rappel au même niveau de prix
  if (buySignal) {
    const tranche = b.capital > 0 ? Math.min(b.cash, Math.round(b.capital / b.tranches)) : 0;
    const text = `📉 OR EN BAISSE — moment intéressant pour acheter\n\n${marketText(m)}\n\n` +
      (tranche > 0
        ? `💰 Ton capital : ${money(b.capital)}, encore ${money(b.cash)} en cash. Je te conseille d'acheter une tranche de ${money(tranche)} maintenant ` +
          `(on achète en ${b.tranches} fois pour lisser le prix : si ça baisse encore, la tranche suivante coûtera moins cher).\n\n${plan(tranche, m, b)}`
        : b.capital > 0 ? `Tout ton capital est déjà en or : rien à acheter, je surveille la revente.` : plan(600 * m.eurDzd, m, b)) +
      `\n\nQuand tu achètes, dis-moi « j'ai acheté X grammes 18 carats pour Y dinars » et je suis ton bénéfice.\n\n${HONEST}`;
    b.last_buy_alert = { at: m.at, price: m.now };
    await saveBook(b);
    await queueTelegramMessage(text).catch(() => {});
    emitProactive('📉 L\'or a baissé — moment pour acheter', 'info', text);
    if (b.capital === 0 || tranche > 0) {
      await autoCall(`gold:buy:${m.at.slice(0, 10)}`,
        `Le prix de l'or 18 carats en Algérie a baissé de ${(drop * 100).toFixed(0)} pour cent depuis son plus haut du mois, il est à ${Math.round(m.now)} dinars le gramme. C'est un bon moment pour acheter. ` +
        (tranche > 0 ? `Je te conseille une tranche d'environ ${Math.round(tranche / 1000)} mille dinars. ` : '') +
        `Il faut compter environ ${monthsText(monthsFor(breakEvenRise(b), LONG_TERM))} pour être rentable si l'or suit sa hausse habituelle. Je t'ai tout envoyé sur Telegram.`,
        { level: 'normal' });
    }
  }

  const h = holdings(b);
  if (h.byKarat.length && h.paid > 0) {
    const value = h.byKarat.reduce((a, [k, gr]) => a + resale(gr, k, m, b), 0);
    const gain = value / h.paid - 1;
    const lastSell = b.last_sell_alert;
    if (gain * 100 >= b.target_pct && (!lastSell || m.now > lastSell.price * 1.03 || days(lastSell.at) > 14)) {
      const text = `📈 TON OR A PRIS DE LA VALEUR — tu peux revendre avec bénéfice\n\n${marketText(m)}\n\n` +
        `Tu as payé ${money(h.paid)} ; un bijoutier t'en donnerait environ ${money(value)} aujourd'hui → +${money(value - h.paid)} (+${pct(gain)}) net.\n` +
        `Tu peux tout revendre, ou garder une partie si tu penses que ça continue de monter. Dis-moi « j'ai vendu X g pour Y dinars » pour mettre à jour ton capital.`;
      b.last_sell_alert = { at: m.at, price: m.now };
      await saveBook(b);
      await queueTelegramMessage(text).catch(() => {});
      emitProactive('📈 Ton or a pris de la valeur', 'info', text);
      await autoCall(`gold:sell:${m.at.slice(0, 10)}`,
        `Bonne nouvelle pour ton or : il vaut environ ${Math.round((value - h.paid) / 1000)} mille dinars de plus que ce que tu l'as payé, frais de revente compris. Tu peux revendre avec bénéfice. Je t'ai envoyé le détail sur Telegram.`,
        { level: 'normal' });
    }
  }
}

// ── Outil gold_watch ─────────────────────────────────────────────────────────────────────────────
export async function goldWatchTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'status');
  const m = await goldMarket();
  const b = await book();
  if (b.unit !== 'dzd') { migrate(b, m); await saveBook(b); }
  // Capital donné en € : toujours compté au taux de Kouider (ancien carnet converti au square → retrouve ses 600 €)
  if (!b.capital_eur && b.capital > 0 && !b.buys.length && !b.sells.length) b.capital_eur = Math.round(b.capital / (b.eur_dzd ?? m.squareEurDzd));
  if (b.capital_eur && !b.sells.length && Math.abs(b.capital - b.capital_eur * m.eurDzd) > 1) {
    b.capital = b.capital_eur * m.eurDzd; b.cash = Math.max(0, b.capital - holdings(b).paid); await saveBook(b);
  }
  const num = (k: string) => Number(input[k] ?? 0);
  const rate = num('eur_dzd') > 0 ? num('eur_dzd') : m.eurDzd;
  /** Montant en dinars : amount_dzd, sinon amount_eur / amount (€) au change du square. */
  const dinars = (eurKey: string) => num('amount_dzd') > 0 ? num('amount_dzd') : num(eurKey) * rate;

  if (action === 'change') {   // « l'euro est à combien ? » → taux du marché noir, jamais celui des banques
    const eurAmt = num('amount_eur') || num('amount'), dzdAmt = num('amount_dzd');
    return `💱 Marché noir (square) aujourd'hui : 1 € = ${g1(m.squareEurDzd)} DA, 1 $ = ${g1(m.usdDzd)} DA (ExchangeDZ, prix d'achat du cambiste).` +
      (m.eurDzd !== m.squareEurDzd ? `\nTon taux enregistré : 1 € = ${g1(m.eurDzd)} DA.` : '') +
      (eurAmt > 0 ? `\n${eurAmt} € = ${dzd(eurAmt * m.eurDzd)}.` : '') +
      (dzdAmt > 0 ? `\n${dzd(dzdAmt)} = ${Math.round(dzdAmt / m.eurDzd)} €.` : '') +
      `\nLe taux de la banque est bien plus bas : ne change pas à la banque.`;
  }
  if (action === 'capital') {
    const amount = dinars('amount');
    if (!(amount > 0)) return '❓ Quel capital (en dinars, ou en euros) ?';
    const invested = holdings(b).paid;
    b.capital = amount; b.cash = Math.max(0, amount - invested);
    b.capital_eur = num('amount_dzd') > 0 ? undefined : num('amount');
    if (num('tranches') > 0) b.tranches = Math.round(num('tranches'));
    await saveBook(b);
    return `✅ Capital or : ${money(b.capital)} (${money(b.cash)} encore en cash). Je l'achèterai en ${b.tranches} tranches de ${money(b.capital / b.tranches)} quand l'or 18 carats baisse en Algérie, et je t'appelle à chaque bon moment.`;
  }
  if (action === 'buy' || action === 'sell') {
    const grams = num('grams'), karat = num('karat') || 18;
    const paid = dinars('amount_eur');
    if (!(grams > 0) || !(paid > 0)) return '❓ Il me faut le poids (grammes), les carats (18 par défaut, 21.6 pour un louis) et le prix payé/reçu en dinars.';
    const date = new Date().toISOString();
    if (action === 'buy') { b.buys.push({ date, grams, karat, paid_dzd: paid, paid_eur: paid / rate, note: input['note'] ? String(input['note']) : undefined }); b.cash = Math.max(0, b.cash - paid); }
    else { b.sells.push({ date, grams, karat, got_dzd: paid }); b.cash += paid; b.capital = Math.max(b.capital, b.cash); }
    await saveBook(b);
    const per18 = paid / (grams * purity(karat) / PURITY[18]);   // ramené au gramme 18 carats
    return `✅ ${action === 'buy' ? 'Achat' : 'Vente'} noté : ${grams} g ${karatName(karat)} pour ${money(paid)}` +
      ` (${dzd(per18)}/g en équivalent 18 carats, cours du jour ${dzd(m.now)} → ${per18 > m.now ? `${pct(per18 / m.now - 1)} au-dessus` : `${pct(1 - per18 / m.now)} en dessous`}).\n` +
      `Cash restant : ${money(b.cash)}.` + (action === 'buy' ? `\nRentable quand un bijoutier t'en donnera ${dzd(paid)} : 18 carats à ${dzd(per18 / (1 - b.sell_discount))}/g.` : '');
  }
  if (action === 'settings') {
    if (input['eur_dzd'] === 0 || input['eur_dzd'] === 'square') delete b.my_eur_dzd;   // retour au square du jour
    if (num('eur_dzd') > 0) {   // « je change à 230 maintenant » → son taux du marché noir
      b.my_eur_dzd = num('eur_dzd');
    }
    {
      const r = b.my_eur_dzd ?? m.squareEurDzd;
      if (b.capital_eur && !b.sells.length) { b.capital = b.capital_eur * r; b.cash = Math.max(0, b.capital - holdings(b).paid); }
    }
    if (num('drop_pct') > 0) b.drop_pct = num('drop_pct');
    if (num('target_pct') > 0) b.target_pct = num('target_pct');
    if (num('buy_premium_pct') >= 0 && input['buy_premium_pct'] !== undefined) b.buy_premium = num('buy_premium_pct') / 100;
    if (num('sell_discount_pct') >= 0 && input['sell_discount_pct'] !== undefined) b.sell_discount = num('sell_discount_pct') / 100;
    await saveBook(b);
    return `✅ Change : 1 € = ${b.my_eur_dzd ?? m.squareEurDzd} DA (${b.my_eur_dzd ? 'ton taux' : 'square du jour ExchangeDZ'}). Alerte d'achat à −${b.drop_pct} % sous le plus haut du mois, revente conseillée à +${b.target_pct} % net, marge bijoutier ${pct(b.buy_premium)}, retenue à la revente ${pct(b.sell_discount)}.`;
  }

  // status
  const h = holdings(b);
  const value = h.byKarat.reduce((a, [k, gr]) => a + resale(gr, k, m, b), 0);
  const mine = h.byKarat.length
    ? `\n\n💼 Ton or : ${h.byKarat.map(([k, gr]) => `${g1(gr)} g ${karatName(k)}`).join(', ')} — payé ${money(h.paid)}, revente aujourd'hui ≈ ${money(value)} ` +
      `(${value >= h.paid ? '+' : ''}${dzd(value - h.paid)}). Achats : ${b.buys.map(x => `${frDate(x.date)} ${x.grams} g pour ${dzd(x.paid_dzd)}`).join(' ; ')}.`
    : '';
  const cap = b.capital > 0 ? `\n💰 Capital : ${money(b.capital)}, dont ${money(b.cash)} en cash${b.cash > 0 ? ` (prochaine tranche : ${money(Math.min(b.cash, b.capital / b.tranches))})` : ''}.` : '';
  const drop = 1 - m.now / m.high30;
  const verdict = drop * 100 >= b.drop_pct && m.now < m.avg30 ? '\n\n✅ C\'est un bon moment pour acheter une tranche.'
    : drop * 100 >= b.drop_pct / 2 ? `\n\n🟡 Ça baisse, mais pas encore assez (alerte à −${b.drop_pct} %).` : '\n\n⏳ Pas le moment d\'acheter : l\'or est près de son plus haut du mois.';
  const amount = b.cash > 0 ? Math.min(b.cash, b.capital / b.tranches) : dinars('amount') || 600 * m.eurDzd;
  return `${marketText(m)}${cap}${mine}${verdict}\n\nSi tu achètes ${money(amount)} aujourd'hui :\n${plan(amount, m, b)}\n\nJe surveille le prix algérien du 18 carats 3 fois par jour : message + appel quand c'est le moment d'acheter, et quand ton or a assez pris pour revendre.\n${HONEST}`;
}
