// MON ARGENT (27/11/2026, Kouider : « rajoute un chiffre d'affaires du cash que je fais sans FIK, le snus tous les jours…
// un système sur l'app où je note à chaque fois que je fais une vente ou autre +1 +10… ensuite il me fait un calcul global
// de tout mon argent… un récap des meilleurs jours et de ce qui m'a rapporté le plus entre une location FIK, une vente de
// voiture, une location d'appartement et le snus… rien de tout ça ne doit être visible pour d'autres personnes »).
// Même journal que Telegram (« snus 150 ») : app_kv perso:journal + perso:finances. FIK = bénéfice Kouider des réservations.
// Données PRIVÉES : aucun chiffre ici (dépôt public), route réservée au compte Kouider.
import { kvJson, kvPut } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { supabase } from './supabase.js';

type Entry = { d: string; t: 'vente' | 'achat' | 'depense'; cat: string; amount: number; mode: 'cash' | 'carte'; note?: string; at?: number };
const J = 'perso:journal';
export const SOURCES = [
  { id: 'snus', label: 'Snus', icon: '🟢' },
  { id: 'appartement', label: 'Appartement', icon: '🏠' },
  { id: 'vente-voiture', label: 'Vente voiture', icon: '🚘' },
  { id: 'autre', label: 'Autre', icon: '➕' },
] as const;
const LABEL: Record<string, string> = { cash: 'Autre (cash)', fik: 'Locations FIK', snus: 'Snus', appartement: 'Appartement', 'vente-voiture': 'Vente voiture', autre: 'Autre' };
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const wd = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Bénéfice FIK de Kouider, au jour de début de location (réservations non annulées). */
async function fikEntries(since: string): Promise<Array<{ d: string; amount: number; label: string }>> {
  const { data } = await supabase.from('bookings').select('client_name, start_date, status, profit, profit_kouider, cars(name)').gte('start_date', since);
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter(b => !/CANCEL|REJECT|ANNUL/i.test(String(b['status'])))
    .map(b => ({ d: String(b['start_date']).slice(0, 10), amount: Number(b['profit_kouider'] ?? b['profit'] ?? 0) || 0,
      label: `${String(b['client_name'] ?? '')} · ${String((b['cars'] as { name?: string } | null)?.name ?? '')}` }))
    .filter(e => e.amount > 0);
}

export async function monArgentOverview() {
  const today = localNow().date, m0 = `${today.slice(0, 7)}-01`, since = addDays(today, -365);
  const [journal, fin, fik] = await Promise.all([
    kvJson<Entry[]>(J, []), kvJson<{ savings?: number; sideCash?: number; savingsAt?: string; sideCashAt?: string }>('perso:finances', {}), fikEntries(since),
  ]);
  const sales = journal.filter(e => e.t === 'vente' && e.d >= since).map(e => ({ d: e.d, cat: e.cat === 'fik' ? 'autre' : e.cat, amount: e.amount, at: e.at ?? 0, note: e.note }));
  const all = [...sales.map(s => ({ d: s.d, cat: s.cat, amount: s.amount })), ...fik.map(f => ({ d: f.d, cat: 'fik', amount: f.amount }))];
  const sum = (l: typeof all) => r2(l.reduce((s, e) => s + e.amount, 0));
  const bySource = (l: typeof all) => Object.entries(l.reduce<Record<string, number>>((m, e) => { m[e.cat] = (m[e.cat] ?? 0) + e.amount; return m; }, {}))
    .map(([id, v]) => ({ id, label: LABEL[id] ?? id, amount: r2(v) })).sort((a, b) => b.amount - a.amount);
  const mon = addDays(today, -((wd(today) + 6) % 7));
  // Jours : total par jour (365 j), meilleurs jours, moyenne par jour de semaine (jours où quelque chose est noté)
  const perDay = new Map<string, number>();
  for (const e of all) perDay.set(e.d, (perDay.get(e.d) ?? 0) + e.amount);
  const bestDays = [...perDay].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, v]) => ({ d, amount: r2(v), day: DAYS[wd(d)] }));
  const wk = DAYS.map((name, i) => { const ds = [...perDay].filter(([d]) => wd(d) === i); return { name, avg: ds.length ? r2(ds.reduce((s, [, v]) => s + v, 0) / ds.length) : 0, n: ds.length }; });
  const last30 = Array.from({ length: 30 }, (_, k) => { const d = addDays(today, k - 29); return { d, amount: r2(perDay.get(d) ?? 0) }; });
  const savings = fin.savings ?? 0, cash = fin.sideCash ?? 0;
  return {
    balances: { compte: savings, cash, total: savings + cash, compteAt: fin.savingsAt ?? null, cashAt: fin.sideCashAt ?? null },
    today: { total: sum(all.filter(e => e.d === today)), bySource: bySource(all.filter(e => e.d === today)) },
    week: { total: sum(all.filter(e => e.d >= mon)) },
    month: { total: sum(all.filter(e => e.d >= m0)), bySource: bySource(all.filter(e => e.d >= m0)) },
    year: { total: sum(all), bySource: bySource(all) },
    bestDays, weekdays: wk, last30,
    recent: sales.filter(s => s.at).sort((a, b) => b.at - a.at).slice(0, 25).map(s => ({ at: s.at, d: s.d, cat: s.cat, label: LABEL[s.cat] ?? s.cat, amount: s.amount })),
    sources: SOURCES,
  };
}

export async function monArgentAdd(cat: string, amount: number, date?: string): Promise<string> {
  if (!SOURCES.some(s => s.id === cat)) throw new Error('Source inconnue');
  if (!(amount > 0 && amount <= 100_000)) throw new Error('Montant invalide');
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') ? date! : localNow().date;
  const l = await kvJson<Entry[]>(J, []);
  l.push({ d, t: 'vente', cat, amount: r2(amount), mode: 'cash', note: 'app', at: Date.now() });
  await kvPut(J, l);
  return `+${r2(amount)} € ${LABEL[cat]}`;
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
