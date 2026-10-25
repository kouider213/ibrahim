import { getRates } from './exchange-rates.js';

// MONTANTS EN DINARS → EUROS (Kouider 25/10) : un client écrit « budget max 2300000 » ou « 230 millions » → sur Telegram
// Dzaryx donne le montant en DA ET en € (change du square, comme pour l'or ; + l'officiel pour info).
// Usage algérien : « millions » / « مليون » = millions de CENTIMES (230 millions = 2 300 000 DA), « milliard » = 10 000 000 DA.

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
const AR_DIGITS = (t: string) => t.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** Montants en dinars trouvés dans un texte (sans doublon). */
export function findDzd(text: string): Array<{ raw: string; da: number; note?: string }> {
  const t = AR_DIGITS(text);
  const out: Array<{ raw: string; da: number; note?: string }> = [];
  const add = (raw: string, da: number, note?: string) => { if (da >= 1000 && da < 1e11 && !out.some(o => o.da === da)) out.push({ raw: raw.trim(), da, note }); };
  const num = (s: string) => Number(s.replace(/[\s.](?=\d{3}\b)/g, '').replace(',', '.'));
  // « 230 millions », « 1,5 milliard », « 230 مليون » (centimes)
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(milliards?|mlrd|مليار)\s*(?:(\d{1,3})\s*(?:millions?|مليون)?)?/gi))
    add(m[0], num(m[1]!) * 10_000_000 + (m[3] ? Number(m[3]) * 10_000 : 0), 'milliard(s) de centimes');
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(millions?|mlns?|مليون|ملاين|ملايين)(?!\s*(?:d['’]?euros?|€|eur))/gi))
    if (!/milliard|مليار/i.test(t.slice(Math.max(0, m.index! - 12), m.index!))) add(m[0], num(m[1]!) * 10_000, 'millions de centimes');
  // « 50 mille », « 50 ألف »
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(mille|alf|ألف|الف)\b/gi)) add(m[0], num(m[1]!) * 1000);
  // Montant explicite en dinars : « 2 300 000 DA », « 45000 dzd », « 3000 دج »
  for (const m of t.matchAll(/(\d{1,3}(?:[\s.]\d{3})+|\d{4,})(?:[.,]\d+)?\s*(da|dzd|dinars?|دج|دينار)\b/gi)) add(m[0], num(m[1]!));
  // Grand nombre seul (≥ 100 000) sans devise : en Algérie c'est des dinars (pas un téléphone : pas de « + » ni de « 0 » devant)
  for (const m of t.matchAll(/(?<![+\d])(?!0)(\d{1,3}(?:[\s.]\d{3}){1,3}|\d{6,10})(?![\d\s]*(?:€|eur|euros?|\$|usd))/gi)) {
    const v = num(m[1]!);
    if (v >= 100_000 && !/(\+|tel|tél|whatsapp|wa\.me)\s*$/i.test(t.slice(Math.max(0, m.index! - 8), m.index!))) add(m[0], v);
  }
  return out.slice(0, 4);
}

/** Ligne « 💱 … » à ajouter sous un message client (vide s'il n'y a aucun montant en dinars). */
export async function dzdLine(text: string): Promise<string> {
  const found = findDzd(text);
  if (!found.length) return '';
  const r = await getRates().catch(() => null);
  // Square : même source que l'or (ExchangeDZ, ou le taux que Kouider a donné), sinon l'API parallèle
  const gold = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  const sq = gold?.eurDzd ?? r?.parallel?.eur_to_dzd ?? null, off = r?.official?.eur_to_dzd ?? null;
  if (!sq && !off) return '';
  return found.map(f => `💱 ${f.raw}${f.note ? ` (${f.note})` : ''} = ${fmt(f.da)} DA ≈ ${sq ? `${fmt(f.da / sq)} € au square (${Math.round(sq)} DA/€)` : ''}${off ? `${sq ? ' · ' : ''}${fmt(f.da / off)} € au taux officiel` : ''}`).join('\n');
}
