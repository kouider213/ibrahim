/**
 * BÉNÉFICE RÉEL DE KOUIDER (13/11/2026) — la même source que le tableau de bord du site (fikconciergerie.com/admin) :
 * site_settings(id=1).content.profit = { rate, cutoff, items: { bookingId: { da? | eur?, collected? } } }.
 *   - da / eur : bénéfice réel noté à la main (ex. 15 000 DA) ; sinon calcul auto (prix client − part propriétaire).
 *   - collected : déjà récupéré ; sinon tout ce qui commence avant `cutoff` (29/10/2026) est récupéré.
 * « Gagné depuis le début » = toutes les locations ; « À récupérer » repart à zéro à chaque « j'ai récupéré ».
 */
import { supabase } from './supabase.js';

export interface ProfitItem { da?: number; eur?: number; collected?: boolean }
export interface ProfitCfg { rate: number; cutoff: string; items: Record<string, ProfitItem> }
const DEFAULT: ProfitCfg = { rate: 275, cutoff: '2026-10-29', items: {} };
const ACCEPTED = ['ACCEPTED', 'CONFIRMED', 'ACTIVE', 'COMPLETED'];

let cache: { at: number; cfg: ProfitCfg } | null = null;
export async function profitCfg(fresh = false): Promise<ProfitCfg> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.cfg;
  const { data } = await supabase.from('site_settings').select('content').eq('id', 1).single();
  const p = (data?.content as { profit?: Partial<ProfitCfg> } | null)?.profit ?? {};
  const cfg: ProfitCfg = { rate: Number(p.rate) || DEFAULT.rate, cutoff: p.cutoff || DEFAULT.cutoff, items: p.items ?? {} };
  cache = { at: Date.now(), cfg };
  return cfg;
}

async function saveCfg(cfg: ProfitCfg): Promise<void> {
  const { data } = await supabase.from('site_settings').select('content').eq('id', 1).single();
  const { error } = await supabase.from('site_settings').update({ content: { ...((data?.content as object) ?? {}), profit: cfg } }).eq('id', 1);
  if (error) throw new Error(error.message);
  cache = { at: Date.now(), cfg };
}

/** Bénéfice réel noté à la main (en €), ou null → garder le calcul. */
export function manualProfitEur(cfg: ProfitCfg, id: string): number | null {
  const o = cfg.items[id];
  if (o?.da != null && String(o.da) !== '') return Math.round((Number(o.da) / cfg.rate) * 100) / 100;
  if (o?.eur != null && String(o.eur) !== '') return Number(o.eur);
  return null;
}

interface Row { id: string; client_name: string; start_date: string; end_date: string; nb_days: number | null; final_price: number | null; owner_price_per_day: number | null; rented_by: string | null; cars: { name: string; base_price: number | null } | null }
const autoProfit = (b: Row) => {
  const days = Number(b.nb_days) || Math.max(1, Math.round((Date.parse(b.end_date) - Date.parse(b.start_date)) / 86_400_000));
  const owner = (Number(b.owner_price_per_day) || Number(b.cars?.base_price) || 0) * days;
  const fp = Number(b.final_price || 0);
  return fp - Math.min(owner, fp);   // même règle que le tableau de bord du site
};

export async function profitLedger() {
  const cfg = await profitCfg(true);
  const { data } = await supabase.from('bookings').select('id, client_name, start_date, end_date, nb_days, final_price, owner_price_per_day, rented_by, cars(name, base_price)').in('status', ACCEPTED);
  const rows = ((data ?? []) as unknown as Row[]).map(b => {
    const manual = manualProfitEur(cfg, b.id);
    const eur = Math.round((manual ?? autoProfit(b)) * 100) / 100;
    const o = cfg.items[b.id];
    const collected = typeof o?.collected === 'boolean' ? o.collected : b.start_date < cfg.cutoff;
    return { id: b.id, client: b.client_name, car: b.cars?.name ?? '', start: b.start_date, end: b.end_date, eur, da: o?.da ?? Math.round(eur * cfg.rate), manual: manual != null, collected };
  }).sort((a, b) => a.start.localeCompare(b.start));
  const sum = (l: typeof rows) => Math.round(l.reduce((s, r) => s + r.eur, 0) * 100) / 100;
  const pending = rows.filter(r => !r.collected);
  return { cfg, rows, total: sum(rows), toCollect: sum(pending), pending, collected: sum(rows.filter(r => r.collected)) };
}

const fmtE = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const fmtD = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} DA`;

export async function formatLedger(): Promise<string> {
  const l = await profitLedger();
  return [
    `💰 MON BÉNÉFICE (même chiffre que le tableau de bord du site, 1 € = ${l.cfg.rate} DA) :`,
    `• Gagné depuis le début : ${fmtE(l.total)} (${fmtD(l.total * l.cfg.rate)}) — ${l.rows.length} locations`,
    `• À récupérer (repart à zéro à chaque récupération) : ${fmtE(l.toCollect)} (${fmtD(l.toCollect * l.cfg.rate)})`,
    ...l.pending.map(r => `   – ${r.client} · ${r.car} (${r.start} → ${r.end}) : ${r.manual && l.cfg.items[r.id]?.da ? fmtD(Number(l.cfg.items[r.id]!.da)) + ' ≈ ' : ''}${fmtE(r.eur)}${r.manual ? ' (noté par Kouider)' : ' (calculé)'}`),
  ].join('\n');
}

/** « J'ai récupéré mon argent » → toutes les locations à récupérer passent en récupéré : la case repart à zéro. */
export async function markAllCollected(): Promise<string> {
  const l = await profitLedger();
  if (!l.pending.length) return 'Rien à récupérer : la case est déjà à zéro.';
  const items = { ...l.cfg.items };
  for (const r of l.pending) items[r.id] = { ...(items[r.id] ?? {}), collected: true };
  await saveCfg({ ...l.cfg, items });
  return `✅ Noté : ${fmtE(l.toCollect)} (${fmtD(l.toCollect * l.cfg.rate)}) récupérés (${l.pending.map(r => r.client).join(', ')}). « À récupérer » repart à zéro ; « gagné depuis le début » reste ${fmtE(l.total)}.`;
}

/** Bénéfice réel d'une location (« Belarbi c'est 12 500 DA », « 1 250 000 » = centimes). */
export async function setRealProfit(client: string, amount: string): Promise<string> {
  const l = await profitLedger();
  const q = client.toLowerCase().trim();
  const hits = l.rows.filter(r => r.client.toLowerCase().includes(q));
  const pick = hits.filter(r => !r.collected).length === 1 ? hits.filter(r => !r.collected) : hits.length ? [hits[hits.length - 1]!] : [];
  if (!pick.length) return `Aucune location trouvée pour « ${client} ».`;
  const r = pick[0]!;
  const t = amount.toLowerCase().replace(/\s/g, '');
  const n = Number(t.replace(/[^\d.,]/g, '').replace(',', '.'));
  if (!(n >= 0)) return 'Montant illisible.';
  const isEur = /€|eur/.test(t) || (!/da|dinar|cts|centime/.test(t) && n < 1000);
  const da = /cts|centime/.test(t) || (!isEur && n >= 200_000) ? n / 100 : n;
  const items = { ...l.cfg.items, [r.id]: isEur ? { collected: l.cfg.items[r.id]?.collected, eur: n } : { collected: l.cfg.items[r.id]?.collected, da } };
  await saveCfg({ ...l.cfg, items });
  return `✅ Bénéfice réel de ${r.client} (${r.car}) : ${isEur ? fmtE(n) : `${fmtD(da)} ≈ ${fmtE(da / l.cfg.rate)}`}.\n${await formatLedger()}`;
}
