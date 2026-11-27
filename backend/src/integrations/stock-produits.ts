// STOCK PAR PRODUIT (27/11/2026, Kouider : « le stock par modèle, noté par nombre de points, les factures du fournisseur,
// préviens-moi quand je dois recommander, lequel je vends le plus, combien je gagne, mes best-sellers, les ruptures chez le
// fournisseur et les remplacements en attendant »).
// PRIVÉ : catalogue, factures, comptages et ventes vivent dans app_kv (perso:stock:*, perso:journal). Ce dépôt est public :
// aucun nom de marque, de modèle ni de prix ici, seulement la mécanique.
import { kvJson, kvPut } from './ai-util.js';
import { localNow } from './morning-routine.js';

export interface Produit { id: string; brand: string; name: string; points?: number; color?: string; cost: number; active: boolean; rupture?: boolean; remplace?: string; aliases?: string[] }
export interface Commande { id: string; d: string; lines: Array<{ pid: string; qty: number; unit: number }>; shipping?: number; taxes?: number; total?: number }
type Entry = { d: string; t: 'vente' | 'achat' | 'depense'; cat: string; amount: number; qty?: number; pid?: string; at?: number; note?: string; mode?: string };
const CAT = 'perso:stock:catalog', ORD = 'perso:stock:orders', CNT = 'perso:stock:count', J = 'perso:journal';
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const piecesOf = (e: Entry) => e.qty ?? Math.round(e.amount / 6);

export const catalog = () => kvJson<Produit[]>(CAT, []);
export const orders = () => kvJson<Commande[]>(ORD, []);
export async function saveCatalog(l: Produit[]): Promise<void> { await kvPut(CAT, l); }
export const label = (p: Produit) => `${p.brand} ${p.points ? `${p.points} points` : p.name}`;

/** Coût réel d'une pièce dans une commande : prix unitaire × (total payé / total des articles) → livraison + taxes répartis. */
export function realUnit(o: Commande, unit: number): number {
  const items = o.lines.reduce((s, l) => s + l.qty * l.unit, 0);
  return o.total && items ? r2(unit * o.total / items) : unit;
}

export async function addCommande(o: Omit<Commande, 'id'>): Promise<Commande> {
  const l = await orders();
  const c: Commande = { ...o, id: Math.random().toString(36).slice(2, 9), lines: o.lines.filter(x => x.qty > 0) };
  l.push(c); l.sort((a, b) => a.d.localeCompare(b.d));
  await kvPut(ORD, l);
  // dernier prix d'achat par produit
  const cat = await catalog();
  for (const x of c.lines) { const p = cat.find(p => p.id === x.pid); if (p && x.unit > 0) p.cost = x.unit; }
  await saveCatalog(cat);
  return c;
}
export async function deleteCommande(id: string): Promise<void> { await kvPut(ORD, (await orders()).filter(o => o.id !== id)); }

/** Comptage de l'après-midi : ce qu'il a vraiment en main, modèle par modèle. */
export async function setCount(counts: Record<string, number>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.max(0, Math.round(Number(v) || 0))]));
  await kvPut(CNT, { at: Date.now(), counts: clean });
}

export async function stockOverview() {
  const today = localNow().date, d30 = addDays(today, -30), d14 = addDays(today, -14);
  const [cat, ords, cnt, journal] = await Promise.all([catalog(), orders(), kvJson<{ at: number; counts: Record<string, number> } | null>(CNT, null), kvJson<Entry[]>(J, [])]);
  const sales = journal.filter(e => e.t === 'vente' && e.cat === 'snus');
  const countDay = cnt ? new Date(cnt.at).toISOString().slice(0, 10) : null;
  const lastOrder = (pid: string) => [...ords].reverse().find(o => o.lines.some(l => l.pid === pid));
  const rows = cat.map(p => {
    const s30 = sales.filter(e => e.pid === p.id && e.d >= d30);
    const sold30 = s30.reduce((s, e) => s + piecesOf(e), 0), eur30 = s30.reduce((s, e) => s + e.amount, 0);
    const lo = lastOrder(p.id); const lu = lo?.lines.find(l => l.pid === p.id);
    const realCost = lo && lu ? realUnit(lo, lu.unit) : p.cost;
    // Stock : comptage + arrivages après le comptage − ventes après le comptage
    let stock: number | null = null;
    if (cnt) {
      const inn = ords.filter(o => Date.parse(`${o.d}T23:00:00Z`) > cnt.at).flatMap(o => o.lines).filter(l => l.pid === p.id).reduce((s, l) => s + l.qty, 0);
      const out = sales.filter(e => e.pid === p.id && (e.at ?? 0) > cnt.at).reduce((s, e) => s + piecesOf(e), 0);
      stock = Math.max(0, (cnt.counts[p.id] ?? 0) + inn - out);
    }
    const perDay = sales.filter(e => e.pid === p.id && e.d >= d14).reduce((s, e) => s + piecesOf(e), 0) / 14 || sold30 / 30;
    const avgPrice = sold30 ? eur30 / sold30 : 6;
    return { ...p, label: label(p), stock, sold30, eur30: r2(eur30), perDay: r2(perDay), daysLeft: stock !== null && perDay > 0 ? Math.floor(stock / perDay) : null,
      realCost, marginPiece: r2(avgPrice - realCost), profit30: r2(eur30 - sold30 * realCost), lastBought: lo?.d ?? null };
  });
  const unassigned = sales.filter(e => !e.pid && e.d >= d30).reduce((s, e) => s + piecesOf(e), 0);
  // Rythme des commandes (dates des factures)
  const dates = ords.map(o => o.d).sort();
  const gaps = dates.slice(1).map((d, i) => (Date.parse(d) - Date.parse(dates[i]!)) / 86_400_000).filter(g => g >= 1).slice(-6);
  const every = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 14;
  const last = dates.at(-1) ?? null;
  const nextOrder = last ? addDays(last, every) : null;
  const lead = 4;   // délai DHL Express + marge
  // Commande conseillée : couvrir (rythme + délai) jours au rythme de vente, ruptures remplacées
  const cover = every + lead;
  const advice = rows.filter(r => r.active).map(r => ({ r, need: Math.max(0, Math.ceil((r.perDay * cover - (r.stock ?? 0)) / 10) * 10) })).filter(x => x.need > 0);
  const cart = new Map<string, { pid: string; label: string; qty: number; note?: string }>();
  for (const { r, need } of advice) {
    const target = r.rupture && r.remplace ? rows.find(x => x.id === r.remplace) : r.rupture ? null : r;
    if (!target) continue;
    const prev = cart.get(target.id);
    cart.set(target.id, { pid: target.id, label: target.label, qty: (prev?.qty ?? 0) + need, note: r.rupture ? `${prev?.note ? `${prev.note}, ` : ''}remplace ${r.label} (rupture)` : prev?.note });
  }
  const cartList = [...cart.values()].sort((a, b) => b.qty - a.qty);
  const cartCost = cartList.reduce((s, c) => s + c.qty * (cat.find(p => p.id === c.pid)?.cost ?? 0), 0);
  // Livraison + taxes par pièce, commande par commande
  const perOrder = ords.filter(o => o.total && o.lines.length).map(o => { const n = o.lines.reduce((s, l) => s + l.qty, 0); return { d: o.d, pieces: n, total: o.total!, fees: r2((o.shipping ?? 0) + (o.taxes ?? 0)), feePiece: r2(((o.shipping ?? 0) + (o.taxes ?? 0)) / n), costPiece: r2(o.total! / n) }; });
  // Meilleurs jours (pièces) sur 60 jours
  const wd = DAYS.map((name, i) => ({ name, pieces: sales.filter(e => e.d >= addDays(today, -60) && new Date(`${e.d}T12:00:00Z`).getUTCDay() === i).reduce((s, e) => s + piecesOf(e), 0) }));
  const minDays = Math.min(...rows.filter(r => r.active && !r.rupture && r.daysLeft !== null).map(r => r.daysLeft!), 999);
  const totalStock = cnt ? rows.reduce((s, r) => s + (r.stock ?? 0), 0) : null;
  return {
    products: rows.sort((a, b) => b.sold30 - a.sold30), unassigned, counted: countDay, totalStock,
    orders: [...ords].reverse().map(o => ({ ...o, pieces: o.lines.reduce((s, l) => s + l.qty, 0) })),
    rhythm: { every, last, nextOrder, lead }, reorder: { urgent: minDays <= lead + 2 || (nextOrder !== null && nextOrder <= addDays(today, 2)), minDays: minDays === 999 ? null : minDays, cart: cartList, cartCost: r2(cartCost) },
    perOrder, weekdays: wd,
    tips: tips(rows, perOrder, unassigned, cnt !== null, every),
  };
}

function tips(rows: Array<{ label: string; sold30: number; profit30: number; marginPiece: number; daysLeft: number | null; rupture?: boolean; active: boolean; stock: number | null; perDay: number }>, per: Array<{ pieces: number; feePiece: number; costPiece: number; d: string }>, unassigned: number, counted: boolean, every: number): Array<{ icon: string; title: string; text: string }> {
  const out: Array<{ icon: string; title: string; text: string }> = [];
  const add = (icon: string, title: string, text: string) => out.push({ icon, title, text });
  const sold = rows.filter(r => r.sold30 > 0).sort((a, b) => b.sold30 - a.sold30);
  if (!counted) add('🧮', 'Compte ton stock', 'Fais le comptage modèle par modèle (bouton « Compter mon stock ») : ensuite chaque vente le fait baisser tout seul.');
  if (unassigned > 0) add('🏷️', 'Ventes sans modèle', `${unassigned} pièces vendues ces 30 jours sans modèle. Choisis le modèle avant +1 (ou écris « 3 velo 5 ») pour savoir ce qui part vraiment.`);
  if (sold[0]) add('🏆', 'Ton best-seller', `${sold[0].label} : ${sold[0].sold30} pièces en 30 jours. Ne sois jamais à court de celui-là.`);
  const best = [...rows].filter(r => r.sold30 > 0).sort((a, b) => b.profit30 - a.profit30)[0];
  if (best) add('💶', 'Celui qui rapporte le plus', `${best.label} : ${best.profit30.toFixed(0)} € de bénéfice en 30 jours (${best.marginPiece.toFixed(2)} € par pièce).`);
  const thin = [...rows].filter(r => r.sold30 > 0).sort((a, b) => a.marginPiece - b.marginPiece)[0];
  if (thin && thin.marginPiece < 2.5) add('📉', 'Marge la plus faible', `${thin.label} : ${thin.marginPiece.toFixed(2)} € par pièce. Évite la ristourne à 5 € sur ce modèle.`);
  const sleeping = rows.filter(r => r.active && !r.rupture && (r.stock ?? 0) > 20 && r.sold30 === 0);
  if (sleeping.length) add('😴', 'Stock qui dort', `${sleeping.map(r => r.label).join(', ')} : en stock mais rien vendu en 30 jours. Commande-en moins la prochaine fois.`);
  const soon = rows.filter(r => r.active && !r.rupture && r.daysLeft !== null && r.daysLeft <= 5);
  if (soon.length) add('⏳', 'Bientôt à court', soon.map(r => `${r.label} (${r.daysLeft} j)`).join(', '));
  if (per.length >= 2) { const a = per.reduce((s, p) => s + p.feePiece, 0) / per.length; add('🚚', 'Livraison + taxes par pièce', `En moyenne ${a.toFixed(2)} € par pièce partent en DHL + taxes. Une commande de 360 pièces au lieu de 240 fait baisser ce coût par pièce (la livraison est presque fixe).`); }
  if (per.length) { const c = per[per.length - 1]!; add('🧾', 'Vrai prix d\'une pièce', `Dernière commande : ${c.costPiece.toFixed(2)} € la pièce tout compris (articles + DHL + taxes).`); }
  add('📅', 'Ton rythme de commande', `Tu commandes environ tous les ${every} jours. Commande 4 jours avant d'être à court (délai DHL).`);
  return out;
}

/** Alerte (job « argent ») : un modèle courant à moins de délai+2 jours, ou date de recommande atteinte. */
export async function jobStock(): Promise<string | null> {
  const s = await stockOverview().catch(() => null);
  if (!s || !s.counted || !s.reorder.urgent || !s.reorder.cart.length) return null;
  return `📦 C'est le moment de recommander${s.reorder.minDays !== null ? ` (un modèle tient encore ≈ ${s.reorder.minDays} j)` : ''}.\nCommande conseillée :\n${s.reorder.cart.map(c => `• ${c.label} × ${c.qty}${c.note ? ` — ${c.note}` : ''}`).join('\n')}\n≈ ${Math.round(s.reorder.cartCost)} € d'articles (+ DHL et taxes). Détails : MON ARGENT › Stock.`;
}

/** « 3 velo 5 », « 2 pablo ice » → produit (alias du catalogue privé). */
export async function findProduit(text: string): Promise<Produit | null> {
  const t = ` ${text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `;
  const cat = await catalog();
  let best: { p: Produit; n: number } | null = null;
  for (const p of cat) for (const a of p.aliases ?? []) { const al = a.toLowerCase(); if (t.includes(` ${al} `) || t.includes(` ${al}`) && al.length > 4) if (!best || al.length > best.n) best = { p, n: al.length }; }
  return best?.p ?? null;
}

// Alias en mémoire (pour l'analyse rapide d'un message Telegram, sans attendre la base) — rafraîchis toutes les 10 min
let aliasCache: Array<{ pid: string; a: string }> = []; let aliasAt = 0;
export function refreshAliases(): void {
  if (Date.now() - aliasAt < 10 * 60_000) return;
  aliasAt = Date.now();
  void catalog().then(c => { aliasCache = c.flatMap(p => (p.aliases ?? []).map(a => ({ pid: p.id, a: a.toLowerCase() }))).sort((x, y) => y.a.length - x.a.length); }).catch(() => {});
}
/** Produit nommé dans le texte (alias le plus long), null sinon. */
export function aliasHit(text: string): string | null {
  refreshAliases();
  const t = ` ${text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')} `;
  return aliasCache.find(x => t.includes(` ${x.a} `) || t.includes(` ${x.a}.`) || t.includes(` ${x.a},`))?.pid ?? null;
}
