// Dépenses dictées à Dzaryx (« j'ai mis 3000 DA d'essence dans la Clio », photo d'un ticket)
// → table cash_entries (même caisse que l'app et le site), reliées à la voiture.
import { supabase } from './supabase.js';
import { runSql } from './app-store.js';
import { getFinancialReport } from './finance.js';

export const EXPENSE_CATEGORIES = ['carburant', 'entretien', 'reparation', 'assurance', 'controle_technique', 'lavage', 'parking_peage', 'amende', 'pieces', 'autre'] as const;

type Car = { id: string; name: string };
type Entry = { id: string; kind: string; category: string | null; label: string | null; amount: number; currency: string | null; entry_date: string; car_id?: string | null };

let carColumn: Promise<boolean> | null = null;
/** Ajoute cash_entries.car_id (nullable, sans impact pour le site). false si la colonne n'a pas pu être créée. */
export function ensureExpenseColumns(): Promise<boolean> {
  carColumn ??= (async () => {
    const probe = await supabase.from('cash_entries').select('car_id').limit(1);
    if (!probe.error) return true;
    const ok = await runSql('ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS car_id UUID REFERENCES cars(id) ON DELETE SET NULL;').catch(() => false);
    if (ok) console.log('[expenses] ✅ colonne cash_entries.car_id créée');
    return ok;
  })();
  return carColumn;
}

async function findCar(name: string): Promise<Car | Car[] | null> {
  const { data } = await supabase.from('cars').select('id, name').ilike('name', `%${name.trim()}%`).limit(5);
  const cars = (data ?? []) as Car[];
  if (!cars.length) return null;
  const exact = cars.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
  return exact ?? (cars.length === 1 ? cars[0]! : cars);
}

const fmt = (n: number, cur: string) => `${Math.round(n).toLocaleString('fr-FR')} ${cur === 'EUR' ? '€' : 'DA'}`;

export async function recordExpense(input: Record<string, unknown>): Promise<string> {
  const amount = Number(input['amount']);
  if (!amount || amount <= 0) return '❌ Montant manquant : combien as-tu payé ?';
  const currency = String(input['currency'] ?? 'DZD').toUpperCase() === 'EUR' ? 'EUR' : 'DZD';
  const rawCat = String(input['category'] ?? 'autre');
  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(rawCat) ? rawCat : 'autre';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : new Date().toISOString().slice(0, 10);

  let car: Car | null = null;
  const carName = String(input['car_name'] ?? '').trim();
  if (carName) {
    const found = await findCar(carName);
    if (!found) return `❌ Aucune voiture « ${carName} » dans le parc. Dépense non enregistrée — précise la voiture (ou aucune).`;
    if (Array.isArray(found)) return `❌ Plusieurs voitures correspondent à « ${carName} » : ${found.map(c => c.name).join(', ')}. Laquelle ?`;
    car = found;
  }

  const label = String(input['label'] ?? '').trim() || category;
  const hasCarCol = car ? await ensureExpenseColumns() : false;
  const row: Record<string, unknown> = {
    kind: 'expense', category, amount, currency, entry_date: date,
    // Sans colonne car_id, la voiture reste lisible dans le libellé
    label: car && !hasCarCol ? `${car.name} — ${label}` : label,
  };
  if (car && hasCarCol) row['car_id'] = car.id;

  const { data, error } = await supabase.from('cash_entries').insert([row]).select('id').single();
  if (error) return `❌ Dépense non enregistrée : ${error.message}`;
  return `✅ Dépense enregistrée dans la caisse : ${fmt(amount, currency)} — ${category}${car ? ` — ${car.name}` : ''} — ${label} (${date}). id ${(data as { id: string }).id}`;
}

function monthRange(month?: unknown): { ym: string; start: string; end: string; year: number; m: number } {
  const ym = /^\d{4}-\d{2}$/.test(String(month ?? '')) ? String(month) : new Date().toISOString().slice(0, 7);
  const [year, m] = ym.split('-').map(Number) as [number, number];
  return { ym, year, m, start: `${ym}-01`, end: `${ym}-${String(new Date(year, m, 0).getDate()).padStart(2, '0')}` };
}

/** Dépenses du mois (par catégorie, par voiture) + bénéfice réel par voiture = bénéfice des locations − dépenses, devise par devise. */
export async function getExpenses(input: Record<string, unknown>): Promise<string> {
  const { ym, year, m, start, end } = monthRange(input['month']);
  const hasCarCol = await ensureExpenseColumns();
  const { data, error } = await supabase.from('cash_entries')
    .select(hasCarCol ? 'id, kind, category, label, amount, currency, entry_date, car_id' : 'id, kind, category, label, amount, currency, entry_date')
    .eq('kind', 'expense').gte('entry_date', start).lte('entry_date', end).order('entry_date');
  if (error) return `❌ Lecture de la caisse impossible : ${error.message}`;
  const entries = (data ?? []) as unknown as Entry[];

  const { data: carsData } = await supabase.from('cars').select('id, name');
  const cars = (carsData ?? []) as Car[];
  const carOf = (e: Entry): string | null => {
    if (e.car_id) return cars.find(c => c.id === e.car_id)?.name ?? null;
    return cars.find(c => e.label?.startsWith(`${c.name} — `))?.name ?? null;
  };

  const carFilter = String(input['car_name'] ?? '').trim().toLowerCase();
  const list = carFilter ? entries.filter(e => carOf(e)?.toLowerCase().includes(carFilter)) : entries;

  const lines: string[] = [`🧾 Dépenses ${ym}${carFilter ? ` — ${input['car_name']}` : ''} : ${list.length} ligne(s)`];
  if (!list.length) lines.push('Aucune dépense enregistrée sur cette période.');

  const byCur: Record<string, number> = {};
  const byCat: Record<string, number> = {};
  const byCar: Record<string, Record<string, number>> = {};
  for (const e of list) {
    const cur = (e.currency || 'DZD').toUpperCase();
    byCur[cur] = (byCur[cur] ?? 0) + Number(e.amount);
    byCat[`${e.category ?? 'autre'}|${cur}`] = (byCat[`${e.category ?? 'autre'}|${cur}`] ?? 0) + Number(e.amount);
    const c = carOf(e) ?? 'Sans voiture';
    (byCar[c] ??= {})[cur] = (byCar[c]![cur] ?? 0) + Number(e.amount);
  }
  if (list.length) {
    lines.push(`Total : ${Object.entries(byCur).map(([c, v]) => fmt(v, c)).join(' + ')}`);
    lines.push('Par catégorie : ' + Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const [cat, cur] = k.split('|'); return `${cat} ${fmt(v, cur!)}`; }).join(', '));
  }

  // Bénéfice réel par voiture (réservations du mois, bénéfice Kouider = prix client − prix proprio, jamais inventé)
  const report = await getFinancialReport(year, m).catch(() => null);
  if (report) {
    const profit: Record<string, Record<string, number>> = {};
    const missing: Record<string, number> = {};
    for (const b of report.bookings) {
      if (b.rented_by === 'Houari') continue;
      if (b.kouider_profit == null) { missing[b.car_name] = (missing[b.car_name] ?? 0) + 1; continue; }
      (profit[b.car_name] ??= {})[b.currency] = (profit[b.car_name]![b.currency] ?? 0) + b.kouider_profit;
    }
    const carNames = [...new Set([...Object.keys(profit), ...Object.keys(byCar).filter(c => c !== 'Sans voiture'), ...Object.keys(missing)])]
      .filter(c => !carFilter || c.toLowerCase().includes(carFilter));
    if (carNames.length) {
      lines.push('', '🚗 Bénéfice réel par voiture (tes locations du mois − dépenses de la voiture) :');
      for (const c of carNames) {
        const curs = [...new Set([...Object.keys(profit[c] ?? {}), ...Object.keys(byCar[c] ?? {})])];
        const parts = curs.map(cur => {
          const p = profit[c]?.[cur] ?? 0; const d = byCar[c]?.[cur] ?? 0;
          return `${fmt(p, cur)} − ${fmt(d, cur)} = ${fmt(p - d, cur)}`;
        });
        lines.push(`• ${c} : ${parts.join(' | ') || '—'}${missing[c] ? ` (⚠️ ${missing[c]} location(s) sans prix proprio, non comptée(s))` : ''}`);
      }
      lines.push('Les devises ne sont jamais mélangées (€ et DA comptés à part).');
    }
  }

  if (list.length && input['details']) {
    lines.push('', ...list.slice(-30).map(e => `• ${e.entry_date} — ${fmt(Number(e.amount), (e.currency || 'DZD').toUpperCase())} — ${e.category ?? 'autre'}${carOf(e) ? ` — ${carOf(e)}` : ''} — ${(e.label ?? '').replace(`${carOf(e)} — `, '')} (id ${e.id})`));
  }
  return lines.join('\n');
}

export async function deleteExpense(input: Record<string, unknown>): Promise<string> {
  const id = String(input['expense_id'] ?? '');
  if (!id) return '❌ Il faut l\'id de la dépense (get_expenses avec details:true).';
  const { data, error } = await supabase.from('cash_entries').delete().eq('id', id).eq('kind', 'expense').select('id, amount, currency, label');
  if (error) return `❌ ${error.message}`;
  const row = (data ?? [])[0] as { amount: number; currency: string; label: string } | undefined;
  return row ? `✅ Dépense supprimée : ${fmt(row.amount, (row.currency || 'DZD').toUpperCase())} — ${row.label}` : '❌ Aucune dépense avec cet id.';
}
