import { kvGet, kvSet } from './app-store.js';
import { autoCall } from '../notifications/auto-call.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// SURVEILLANCE DE L'OR (demande de Kouider 2026-10-22) : il aime investir dans l'or, il a un capital en cash en Algérie
// (600 € au départ) et veut que Dzaryx le fasse grossir. Dzaryx n'achète rien lui-même : il surveille le cours, prévient
// (Telegram + app + appel) quand l'or a assez baissé pour être intéressant, dit combien acheter (capital en 3 tranches),
// après combien de temps l'achat devient rentable (frais d'achat/revente compris), et quand revendre avec bénéfice.
// Cours : Yahoo Finance (or COMEX GC=F + EUR/USD, 1 an jour par jour), secours gold-api.com. Aucune clé.
// Portefeuille : app_kv `kouider:gold` (capital, achats, ventes, réglages).

const KEY = 'kouider:gold';
const OZ = 31.1035;                       // grammes dans une once
const LONG_TERM = 0.08;                   // hausse moyenne de l'or en euros sur 20 ans ≈ 8 %/an (estimation prudente)
const PURITY: Record<number, number> = { 24: 0.999, 22: 0.916, 21: 0.875, 18: 0.75 };

interface GoldBuy { date: string; grams: number; karat: number; paid_eur: number; note?: string }
interface GoldSell { date: string; grams: number; karat: number; got_eur: number }
interface GoldBook {
  capital: number; cash: number; tranches: number;
  buy_premium: number;       // ce qu'on paie au-dessus du prix du métal (or cassé ≈ 5 %, bijou neuf avec façon bien plus)
  sell_discount: number;     // ce que le bijoutier retient à la revente (≈ 5 % sous le prix du métal)
  drop_pct: number;          // baisse depuis le plus haut du mois qui déclenche l'alerte d'achat
  target_pct: number;        // bénéfice net visé avant de conseiller la revente
  buys: GoldBuy[]; sells: GoldSell[];
  last_buy_alert?: { at: string; price: number }; last_sell_alert?: { at: string; price: number };
}
const DEFAULT: GoldBook = { capital: 0, cash: 0, tranches: 3, buy_premium: 0.05, sell_discount: 0.05, drop_pct: 5, target_pct: 10, buys: [], sells: [] };

async function book(): Promise<GoldBook> {
  try { return { ...DEFAULT, ...JSON.parse((await kvGet(KEY)) ?? '{}') } as GoldBook; } catch { return { ...DEFAULT }; }
}
const saveBook = (b: GoldBook) => kvSet(KEY, JSON.stringify(b));

const eur = (x: number) => `${x.toFixed(2).replace('.', ',')} €`;
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const frDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

// ── Cours ────────────────────────────────────────────────────────────────────────────────────────
interface Market {
  now: number;            // € par gramme d'or pur (24 carats)
  high30: number; avg30: number; low30: number; high90: number;
  ago1y: number | null;   // il y a un an
  at: string;
}

async function yahoo(symbol: string): Promise<number[]> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Yahoo ${symbol} ${r.status}`);
  const j = await r.json() as { chart?: { result?: Array<{ indicators: { quote: Array<{ close: Array<number | null> }> }; meta?: { regularMarketPrice?: number } }> } };
  const res = j.chart?.result?.[0];
  const closes = (res?.indicators.quote[0]?.close ?? []).filter((x): x is number => typeof x === 'number' && x > 0);
  if (res?.meta?.regularMarketPrice) closes.push(res.meta.regularMarketPrice);
  if (closes.length < 30) throw new Error(`Yahoo ${symbol} : historique trop court`);
  return closes;
}

export async function goldMarket(): Promise<Market> {
  const [gold, fx] = await Promise.all([yahoo('GC=F'), yahoo('EURUSD=X')]);
  const rate = fx[fx.length - 1];
  // Le taux d'il y a un an sert pour le prix d'il y a un an (sinon le dollar fausse la comparaison)
  const g = gold.map((usd, i) => usd / (fx[Math.max(0, fx.length - gold.length + i)] ?? rate) / OZ);
  let now = g[g.length - 1];
  try {   // cours en direct (Yahoo a parfois 15-20 min de retard)
    const s = await fetch('https://api.gold-api.com/price/XAU', { signal: AbortSignal.timeout(8_000) }).then(r => r.json()) as { price?: number };
    if (s.price && Math.abs(s.price / rate / OZ / now - 1) < 0.05) now = s.price / rate / OZ;
  } catch { /* Yahoo suffit */ }
  const last = (n: number) => g.slice(-n);
  return {
    now,
    high30: Math.max(...last(22), now), low30: Math.min(...last(22), now), avg30: last(22).reduce((a, b) => a + b, 0) / 22,
    high90: Math.max(...last(65), now),
    ago1y: g.length > 240 ? g[0] : null,
    at: new Date().toISOString(),
  };
}

// ── Calculs ──────────────────────────────────────────────────────────────────────────────────────
const metal = (grams: number, karat: number, m: Market) => grams * (PURITY[karat] ?? karat / 24) * m.now;
/** Ce que le bijoutier en donnerait aujourd'hui. */
const resale = (grams: number, karat: number, m: Market, b: GoldBook) => metal(grams, karat, m) * (1 - b.sell_discount);
/** Hausse du cours nécessaire pour retrouver sa mise (frais d'achat + de revente). */
const breakEvenRise = (b: GoldBook) => (1 + b.buy_premium) / (1 - b.sell_discount) - 1;
/** Mois pour que le cours monte de `rise` au rythme annuel `g`. */
const monthsFor = (rise: number, g: number) => g <= 0 ? Infinity : Math.ceil(Math.log(1 + rise) / Math.log(1 + g) * 12);
const monthsText = (m: number) => !Number.isFinite(m) ? 'jamais au rythme actuel (le cours baisse sur un an)' : m < 12 ? `${m} mois` : `${Math.floor(m / 12)} an${m >= 24 ? 's' : ''}${m % 12 ? ` et ${m % 12} mois` : ''}`;

function holdings(b: GoldBook) {
  const g = new Map<number, number>();
  for (const x of b.buys) g.set(x.karat, (g.get(x.karat) ?? 0) + x.grams);
  for (const x of b.sells) g.set(x.karat, (g.get(x.karat) ?? 0) - x.grams);
  const paid = b.buys.reduce((a, x) => a + x.paid_eur, 0) - b.sells.reduce((a, x) => a + x.got_eur, 0);
  return { byKarat: [...g].filter(([, gr]) => gr > 0.001), paid };
}

/** Rentabilité d'un achat fait aujourd'hui avec `amount` €. */
function plan(amount: number, m: Market, b: GoldBook): string {
  const rise = breakEvenRise(b);
  const grams18 = amount / (m.now * PURITY[18] * (1 + b.buy_premium));
  const yearly = m.ago1y ? m.now / m.ago1y - 1 : null;
  const back = m.high30 / m.now - 1;
  const lines = [
    `Avec ${eur(amount)} : environ ${grams18.toFixed(1).replace('.', ',')} g d'or 18 carats (prix du métal + ${pct(b.buy_premium)} de marge du vendeur).`,
    `Rentable quand le cours a pris ${pct(rise)} (marge à l'achat + ce que le bijoutier retient à la revente).`,
    `→ Au rythme moyen de l'or sur 20 ans (≈ ${pct(LONG_TERM)}/an) : rentable en ${monthsText(monthsFor(rise, LONG_TERM))}.`,
    yearly !== null ? `→ Au rythme de la dernière année (${yearly >= 0 ? '+' : ''}${pct(yearly)}) : ${monthsText(monthsFor(rise, yearly))}.` : '',
    back > rise ? `→ S'il remonte juste à son plus haut du mois (${eur(m.high30)}/g pur, +${pct(back)}), tu gagnes environ ${eur(amount * ((1 + back) / (1 + rise) - 1))} net.` : '',
    `Bénéfice visé : +${b.target_pct} % net, soit ${eur(amount * b.target_pct / 100)} → cours à ${eur(m.now * (1 + rise) * (1 + b.target_pct / 100))}/g pur. Je te préviens quand on y est.`,
  ];
  return lines.filter(Boolean).join('\n');
}

function marketText(m: Market): string {
  const drop = 1 - m.now / m.high30;
  return `🪙 Or aujourd'hui : ${eur(m.now)}/g pur (24 carats) · ${eur(m.now * PURITY[18])}/g en 18 carats.\n` +
    `Sur 1 mois : plus haut ${eur(m.high30)}, moyenne ${eur(m.avg30)}, plus bas ${eur(m.low30)} → ` +
    (drop > 0.005 ? `${pct(drop)} sous le plus haut du mois.` : 'au plus haut du mois.') +
    (m.ago1y ? `\nSur 1 an : ${m.now >= m.ago1y ? '+' : ''}${pct(m.now / m.ago1y - 1)}.` : '');
}

const HONEST = `⚠️ L'or monte sur le long terme mais peut baisser pendant des mois : n'y mets que l'argent dont tu n'as pas besoin avant 1 à 2 ans. ` +
  `Achète de l'or au poids (or cassé, lingotin, louis) : sur un bijou neuf, la façon est perdue à la revente. ` +
  `Le prix en Algérie (dinars, change au square) peut s'écarter un peu du cours mondial : compare 2-3 bijoutiers avant.`;

// ── Surveillance (job « gold-watch ») ───────────────────────────────────────────────────────────
/** Achat : l'or a baissé d'au moins drop_pct depuis son plus haut du mois et passe sous sa moyenne → message + appel.
 *  Revente : l'or qu'il a vaut target_pct de plus que ce qu'il a payé, frais de revente déduits → message + appel. */
export async function jobGoldWatch(): Promise<void> {
  const b = await book();
  const m = await goldMarket();
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
        ? `💰 Ton capital : ${eur(b.capital)}, encore ${eur(b.cash)} en cash. Je te conseille d'acheter une tranche de ${eur(tranche)} maintenant ` +
          `(on achète en ${b.tranches} fois pour lisser le prix : si ça baisse encore, la tranche suivante coûtera moins cher).\n\n${plan(tranche, m, b)}`
        : b.capital > 0 ? `Tout ton capital est déjà en or : rien à acheter, je surveille la revente.` : plan(600, m, b)) +
      `\n\nQuand tu achètes, dis-moi « j'ai acheté X grammes 18 carats pour Y € » et je suis ton bénéfice.\n\n${HONEST}`;
    b.last_buy_alert = { at: m.at, price: m.now };
    await saveBook(b);
    await queueTelegramMessage(text).catch(() => {});
    emitProactive('📉 L\'or a baissé — moment pour acheter', 'info', text);
    if (b.capital === 0 || tranche > 0) {
      await autoCall(`gold:buy:${m.at.slice(0, 10)}`,
        `Le cours de l'or a baissé de ${(drop * 100).toFixed(0)} pour cent depuis son plus haut du mois, c'est un bon moment pour acheter. ` +
        (tranche > 0 ? `Je te conseille une tranche de ${Math.round(tranche)} euros. ` : '') +
        `Il faut compter environ ${monthsText(monthsFor(breakEvenRise(b), LONG_TERM))} pour être rentable si l'or suit sa hausse habituelle. Je t'ai tout envoyé sur Telegram. Tu veux que je te dise où acheter à Oran ?`,
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
        `Tu as payé ${eur(h.paid)} ; un bijoutier t'en donnerait environ ${eur(value)} aujourd'hui → +${eur(value - h.paid)} (+${pct(gain)}) net.\n` +
        `Tu peux tout revendre, ou garder une partie si tu penses que ça continue de monter. Dis-moi « j'ai vendu X g pour Y € » pour mettre à jour ton capital.`;
      b.last_sell_alert = { at: m.at, price: m.now };
      await saveBook(b);
      await queueTelegramMessage(text).catch(() => {});
      emitProactive('📈 Ton or a pris de la valeur', 'info', text);
      await autoCall(`gold:sell:${m.at.slice(0, 10)}`,
        `Bonne nouvelle pour ton or : il vaut environ ${Math.round(value - h.paid)} euros de plus que ce que tu l'as payé, frais de revente compris. Tu peux revendre avec bénéfice. Je t'ai envoyé le détail sur Telegram.`,
        { level: 'normal' });
    }
  }
}

// ── Outil gold_watch ─────────────────────────────────────────────────────────────────────────────
export async function goldWatchTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'status');
  const b = await book();
  const num = (k: string) => Number(input[k] ?? 0);

  if (action === 'capital') {
    const amount = num('amount');
    if (!(amount > 0)) return '❓ Quel capital (en euros) ?';
    const invested = b.buys.reduce((a, x) => a + x.paid_eur, 0) - b.sells.reduce((a, x) => a + x.got_eur, 0);
    b.capital = amount; b.cash = Math.max(0, amount - invested);
    if (num('tranches') > 0) b.tranches = Math.round(num('tranches'));
    await saveBook(b);
    return `✅ Capital or : ${eur(b.capital)} (${eur(b.cash)} encore en cash). Je l'achèterai en ${b.tranches} tranches de ${eur(b.capital / b.tranches)} quand l'or baisse, et je t'appelle à chaque bon moment.`;
  }
  if (action === 'buy' || action === 'sell') {
    const grams = num('grams'), karat = Math.round(num('karat')) || 18;
    let money = num('amount_eur');
    if (!money && num('amount_dzd') > 0) {
      if (!(num('eur_dzd') > 0)) return '❓ À quel taux tu as changé tes euros (dinars pour 1 €) ?';
      money = num('amount_dzd') / num('eur_dzd');
    }
    if (!(grams > 0) || !(money > 0)) return '❓ Il me faut le poids (grammes), les carats (18 par défaut) et le prix payé/reçu.';
    const date = new Date().toISOString();
    if (action === 'buy') { b.buys.push({ date, grams, karat, paid_eur: money, note: input['note'] ? String(input['note']) : undefined }); b.cash = Math.max(0, b.cash - money); }
    else { b.sells.push({ date, grams, karat, got_eur: money }); b.cash += money; b.capital = Math.max(b.capital, b.cash); }
    await saveBook(b);
    const m = await goldMarket().catch(() => null);
    const perG = money / (grams * (PURITY[karat] ?? karat / 24));
    return `✅ ${action === 'buy' ? 'Achat' : 'Vente'} noté : ${grams} g ${karat} carats pour ${eur(money)}` +
      ` (${eur(perG)}/g pur${m ? `, cours du jour ${eur(m.now)} → ${perG > m.now ? `${pct(perG / m.now - 1)} au-dessus` : `${pct(1 - perG / m.now)} en dessous`}` : ''}).\n` +
      `Cash restant : ${eur(b.cash)}.` + (action === 'buy' && m ? `\nRentable quand un bijoutier t'en donnera ${eur(money)} : cours à ${eur(perG / (1 - b.sell_discount))}/g pur.` : '');
  }
  if (action === 'settings') {
    if (num('drop_pct') > 0) b.drop_pct = num('drop_pct');
    if (num('target_pct') > 0) b.target_pct = num('target_pct');
    if (num('buy_premium_pct') >= 0 && input['buy_premium_pct'] !== undefined) b.buy_premium = num('buy_premium_pct') / 100;
    if (num('sell_discount_pct') >= 0 && input['sell_discount_pct'] !== undefined) b.sell_discount = num('sell_discount_pct') / 100;
    await saveBook(b);
    return `✅ Alerte d'achat à −${b.drop_pct} % sous le plus haut du mois, revente conseillée à +${b.target_pct} % net, marge vendeur ${pct(b.buy_premium)}, retenue à la revente ${pct(b.sell_discount)}.`;
  }

  // status
  const m = await goldMarket();
  const h = holdings(b);
  const value = h.byKarat.reduce((a, [k, gr]) => a + resale(gr, k, m, b), 0);
  const mine = h.byKarat.length
    ? `\n\n💼 Ton or : ${h.byKarat.map(([k, gr]) => `${gr.toFixed(1).replace('.', ',')} g ${k} carats`).join(', ')} — payé ${eur(h.paid)}, revente aujourd'hui ≈ ${eur(value)} ` +
      `(${value >= h.paid ? '+' : ''}${eur(value - h.paid)}). Achats : ${b.buys.map(x => `${frDate(x.date)} ${x.grams} g pour ${eur(x.paid_eur)}`).join(' ; ')}.`
    : '';
  const cap = b.capital > 0 ? `\n💰 Capital : ${eur(b.capital)}, dont ${eur(b.cash)} en cash${b.cash > 0 ? ` (prochaine tranche : ${eur(Math.min(b.cash, b.capital / b.tranches))})` : ''}.` : '';
  const drop = 1 - m.now / m.high30;
  const verdict = drop * 100 >= b.drop_pct && m.now < m.avg30 ? '\n\n✅ C\'est un bon moment pour acheter une tranche.'
    : drop * 100 >= b.drop_pct / 2 ? `\n\n🟡 Ça baisse, mais pas encore assez (alerte à −${b.drop_pct} %).` : '\n\n⏳ Pas le moment d\'acheter : l\'or est près de son plus haut du mois.';
  const amount = b.cash > 0 ? Math.min(b.cash, b.capital / b.tranches) : num('amount') || 600;
  return `${marketText(m)}${cap}${mine}${verdict}\n\nSi tu achètes ${eur(amount)} aujourd'hui :\n${plan(amount, m, b)}\n\nJe surveille le cours 3 fois par jour : message + appel quand c'est le moment d'acheter, et quand ton or a assez pris pour revendre.\n${HONEST}`;
}
