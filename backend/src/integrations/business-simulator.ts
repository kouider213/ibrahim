// SIMULATEUR BUSINESS (outil business_simulator) : « et si… ? », objectif de salaire, grille de prix.
// Tous les chiffres sont CALCULÉS ici à partir des vraies données (cars + bookings 2026) et des hypothèses
// données par Kouider — l'IA ne fait que poser la question et expliquer le résultat, jamais estimer de tête.
//
// Vocabulaire (cars) : resale_price = prix CLIENT / jour, base_price = prix PROPRIÉTAIRE (Houari) / jour.
// Marge Kouider / jour = client − propriétaire. Profit réservation = computeBookingFinancials (même règle que partout).
import { supabase } from './supabase.js';
import { computeBookingFinancials } from './finance.js';

type Car = { id: string; name: string; category: string; client: number | null; owner: number | null; available: boolean };
type CarStat = Car & { days: number; profit: number; revenue: number };
type Baseline = {
  year: number; cars: CarStat[]; bookings: number; days: number; revenue: number; ownerTotal: number; profit: number;
  monthsElapsed: number; daysPerMonth: number; profitPerMonth: number; marginPerDay: number; occupancy: number;
};
type Income = { label: string; monthly: number };

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
const eur1 = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
const pct = (n: number) => `${Math.round(n)} %`;
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.').replace(/[^\d.-]/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const margin = (c: { client: number | null; owner: number | null }) => (c.client != null && c.owner != null ? c.client - c.owner : null);

async function loadCars(): Promise<Car[]> {
  const { data, error } = await supabase.from('cars').select('id, name, category, base_price, resale_price, available').order('resale_price');
  if (error) throw new Error(error.message);
  return (data ?? []).map(c => ({
    id: c.id as string, name: String(c.name), category: String(c.category ?? ''),
    client: num(c.resale_price), owner: num(c.base_price), available: c.available !== false,
  }));
}

export function findCar(cars: Car[], q: string): Car | null {
  const n = norm(q);
  if (!n) return null;
  return cars.find(c => norm(c.name) === n)
    ?? cars.find(c => norm(c.name).startsWith(n))
    ?? cars.find(c => norm(c.name).includes(n))
    ?? cars.find(c => n.split(' ').every(w => norm(c.name).includes(w)))
    ?? null;
}

async function loadBaseline(year: number): Promise<Baseline> {
  const cars = await loadCars();
  const { data, error } = await supabase.from('bookings')
    .select('car_id, status, start_date, end_date, nb_days, final_price, client_price_per_day, owner_price_per_day, paid_amount, rented_by, discount_applied')
    .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
    .not('status', 'in', '(CANCELLED,REJECTED,PENDING)');
  if (error) throw new Error(error.message);
  const stats = new Map<string, CarStat>(cars.map(c => [c.id, { ...c, days: 0, profit: 0, revenue: 0 }]));
  let days = 0, revenue = 0, ownerTotal = 0, profit = 0;
  for (const b of data ?? []) {
    const f = computeBookingFinancials(b as Parameters<typeof computeBookingFinancials>[0]);
    days += f.nb_days; revenue += f.final_price ?? 0; ownerTotal += f.owner_total ?? 0; profit += f.kouider_profit ?? 0;
    const s = stats.get(String(b.car_id));
    if (s) { s.days += f.nb_days; s.profit += f.kouider_profit ?? 0; s.revenue += f.final_price ?? 0; }
  }
  const now = new Date();
  const monthsElapsed = year < now.getFullYear() ? 12 : Math.max(1, now.getMonth() + now.getDate() / 31);
  const fleetDays = Math.max(1, cars.length) * monthsElapsed * 30.4;
  return {
    year, cars: [...stats.values()], bookings: (data ?? []).length, days, revenue, ownerTotal, profit, monthsElapsed,
    daysPerMonth: days / monthsElapsed, profitPerMonth: profit / monthsElapsed,
    marginPerDay: days ? profit / days : avgCatalogMargin(cars), occupancy: days / fleetDays * 100,
  };
}

function avgCatalogMargin(cars: Car[]): number {
  const m = cars.map(margin).filter((x): x is number => x != null);
  return m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0;
}

/** Poids de chaque voiture dans les jours loués : historique réel (+1 pour que chaque voiture compte un peu). */
function weights(cars: CarStat[]): Map<string, number> {
  const tot = cars.reduce((s, c) => s + c.days + 1, 0) || 1;
  return new Map(cars.map(c => [c.id, (c.days + 1) / tot]));
}

function parseIncome(v: unknown): Income[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): Income[] => {
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    const label = String(o['label'] ?? o['name'] ?? 'Autre revenu').trim();
    const monthly = num(o['monthly']) ?? ((num(o['unit_price']) ?? 0) * (num(o['units_per_month']) ?? 0));
    return monthly ? [{ label, monthly }] : [];
  });
}

type PriceOverride = { car: string; client_price?: number | null; owner_price?: number | null };
function parseOverrides(v: unknown): PriceOverride[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): PriceOverride[] => {
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    const car = String(o['car'] ?? o['name'] ?? '').trim();
    return car ? [{ car, client_price: num(o['client_price']), owner_price: num(o['owner_price']) }] : [];
  });
}

/** Applique les hypothèses de prix à une copie du parc. Renvoie aussi les voitures introuvables. */
function applyPrices(cars: CarStat[], input: Record<string, unknown>): { cars: CarStat[]; unknown: string[]; notes: string[] } {
  const ownerPct = num(input['owner_change_pct']) ?? (num(input['owner_discount_pct']) != null ? -(num(input['owner_discount_pct']) as number) : null);
  const clientPct = num(input['client_change_pct']);
  const onlyCat = input['category'] ? norm(String(input['category'])) : '';
  const notes: string[] = [];
  const out = cars.map(c => {
    const hit = !onlyCat || norm(c.category) === onlyCat;
    return {
      ...c,
      owner: c.owner != null && hit && ownerPct != null ? Math.round(c.owner * (1 + ownerPct / 100) * 10) / 10 : c.owner,
      client: c.client != null && hit && clientPct != null ? Math.round(c.client * (1 + clientPct / 100)) : c.client,
    };
  });
  if (ownerPct != null) notes.push(`prix propriétaire ${ownerPct > 0 ? '+' : ''}${ownerPct} %${onlyCat ? ` (${input['category']})` : ''}`);
  if (clientPct != null) notes.push(`prix client ${clientPct > 0 ? '+' : ''}${clientPct} %${onlyCat ? ` (${input['category']})` : ''}`);
  const unknown: string[] = [];
  for (const o of parseOverrides(input['price_overrides'])) {
    const c = findCar(out, o.car) as CarStat | null;
    if (!c) { unknown.push(o.car); continue; }
    if (o.client_price != null) c.client = o.client_price;
    if (o.owner_price != null) c.owner = o.owner_price;
    notes.push(`${c.name} : client ${c.client ?? '?'} €/j, propriétaire ${c.owner ?? '?'} €/j`);
  }
  return { cars: out, unknown, notes };
}

function addExtraCars(cars: CarStat[], input: Record<string, unknown>, notes: string[]): CarStat[] {
  const extra = Array.isArray(input['extra_cars']) ? input['extra_cars'] as Record<string, unknown>[] : [];
  const out = [...cars];
  for (const e of extra) {
    const count = Math.max(1, Math.round(num(e['count']) ?? 1));
    const client = num(e['client_price']), owner = num(e['owner_price']);
    if (client == null || owner == null) continue;
    const name = String(e['name'] ?? 'Nouvelle voiture');
    // Une voiture ajoutée se loue comme la voiture moyenne du parc actuel
    const avgDays = cars.reduce((s, c) => s + c.days, 0) / Math.max(1, cars.length);
    for (let i = 0; i < count; i++) out.push({ id: `extra-${name}-${i}`, name: count > 1 ? `${name} #${i + 1}` : name, category: String(e['category'] ?? ''), client, owner, available: true, days: avgDays, profit: 0, revenue: 0 });
    notes.push(`+${count} × ${name} (client ${client} €/j, propriétaire ${owner} €/j)`);
  }
  return out;
}

function weightedMargin(cars: CarStat[]): number {
  const w = weights(cars);
  return cars.reduce((s, c) => s + (w.get(c.id) ?? 0) * (margin(c) ?? 0), 0);
}

function carTable(before: Car[], after: Car[]): string {
  return after.map(c => {
    const b = before.find(x => x.id === c.id);
    const m = margin(c), mb = b ? margin(b) : null;
    const changed = b && (b.client !== c.client || b.owner !== c.owner);
    const pc = m != null && c.client ? ` (${pct(m / c.client * 100)})` : '';
    return `• ${c.name} : client ${c.client != null ? eur1(c.client) : '?'} · propriétaire ${c.owner != null ? eur1(c.owner) : '?'} · marge ${m != null ? eur1(m) : '?'}/j${pc}${changed && mb != null ? ` (avant ${eur1(mb)})` : !b ? ' (nouvelle)' : ''}`;
  }).join('\n');
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function baseline(input: Record<string, unknown>): Promise<string> {
  const year = num(input['year']) ?? new Date().getFullYear();
  const b = await loadBaseline(year);
  const rented = b.cars.filter(c => c.days > 0).sort((x, y) => y.profit - x.profit);
  const lines = [
    `📊 CHIFFRES RÉELS ${year} (réservations terminées/confirmées, calcul officiel)`,
    `• ${b.bookings} locations · ${b.days} jours loués · CA ${eur(b.revenue)} · part propriétaire ${eur(b.ownerTotal)} · TON BÉNÉFICE ${eur(b.profit)}`,
    `• Sur ${b.monthsElapsed.toFixed(1)} mois : ${b.daysPerMonth.toFixed(1)} jours loués/mois → ${eur(b.profitPerMonth)} de bénéfice/mois en moyenne`,
    `• Marge moyenne : ${eur1(b.marginPerDay)} par jour loué (${b.revenue ? pct(b.profit / b.revenue * 100) : '?'} du CA)`,
    `• Taux d'occupation du parc (${b.cars.length} voitures) : ${b.occupancy.toFixed(1)} %`,
    '',
    rented.length ? `Par voiture louée :\n${rented.map(c => `• ${c.name} : ${c.days} j · CA ${eur(c.revenue)} · bénéfice ${eur(c.profit)}`).join('\n')}` : 'Aucune voiture louée sur la période.',
    '',
    `Grille actuelle du parc (prix catalogue) :\n${carTable(b.cars, b.cars)}`,
    `\nMarge moyenne catalogue : ${eur1(avgCatalogMargin(b.cars))}/j.`,
  ];
  return lines.join('\n');
}

async function scenario(input: Record<string, unknown>): Promise<string> {
  const b = await loadBaseline(num(input['year']) ?? new Date().getFullYear());
  const { cars: priced, unknown, notes } = applyPrices(b.cars, input);
  const cars = addExtraCars(priced, input, notes);
  const util = num(input['occupancy_pct']);
  const daysPerMonth = num(input['rental_days_per_month'])
    ?? (util != null ? util / 100 * cars.length * 30.4 : b.daysPerMonth * (1 + (num(input['demand_change_pct']) ?? 0) / 100));
  if (num(input['demand_change_pct'])) notes.push(`demande ${num(input['demand_change_pct'])! > 0 ? '+' : ''}${num(input['demand_change_pct'])} %`);
  const income = parseIncome(input['other_income']);
  const costs = num(input['monthly_costs']) ?? 0;
  const label = String(input['label'] ?? input['partner'] ?? '').trim();

  // Ancré sur le RÉEL : marge réelle par jour loué (prix négociés) + l'écart de marge catalogue dû au scénario.
  const delta = weightedMargin(cars) - weightedMargin(b.cars);
  const mBefore = b.marginPerDay, mAfter = Math.max(0, b.marginPerDay + delta);
  const rentBefore = b.profitPerMonth;                   // aujourd'hui (réel)
  const rentSameVol = mAfter * b.daysPerMonth;           // nouveaux prix, même volume qu'aujourd'hui
  const rentAfter = mAfter * daysPerMonth;               // nouveaux prix + volume du scénario
  const other = income.reduce((s, i) => s + i.monthly, 0);
  const net = rentAfter + other - costs;
  const capacity = cars.length * 30.4;

  const lines = [
    `🔮 SCÉNARIO${label ? ` « ${label} »` : ''} — calculé sur tes vraies données ${b.year}`,
    `Hypothèses : ${notes.length ? notes.join(' ; ') : 'prix actuels'} ; ${daysPerMonth.toFixed(1)} jours loués/mois (aujourd'hui ${b.daysPerMonth.toFixed(1)}) = ${(daysPerMonth / capacity * 100).toFixed(0)} % d'occupation de ${cars.length} voitures${costs ? ` ; charges ${eur(costs)}/mois` : ''}.`,
    unknown.length ? `⚠️ Voitures introuvables (ignorées) : ${unknown.join(', ')}` : '',
    '',
    `Marge moyenne par jour loué : ${eur1(mBefore)} aujourd'hui (réel, prix négociés) → ${eur1(mAfter)} avec ce scénario (${delta >= 0 ? '+' : ''}${eur1(delta)}/j).`,
    `Bénéfice location / mois : ${eur(rentBefore)} aujourd'hui → ${eur(rentSameVol)} à volume égal → ${eur(rentAfter)} avec le volume du scénario.`,
    income.length ? `Autres revenus / mois : ${income.map(i => `${i.label} ${eur(i.monthly)}`).join(' + ')} = ${eur(other)}` : '',
    `➡️ NET ESTIMÉ : ${eur(net)} / mois · ${eur(net * 12)} / an (aujourd'hui ≈ ${eur(rentBefore)} / mois, ${eur(rentBefore * 12)} / an).`,
    `Écart : ${net - rentBefore >= 0 ? '+' : ''}${eur(net - rentBefore)} / mois.`,
    '',
    `Grille du scénario :\n${carTable(b.cars, cars)}`,
    '',
    'ℹ️ « Volume égal » = mêmes jours loués qu\'en ' + b.year + ' ; une baisse de prix client peut attirer plus de clients (demand_change_pct pour le tester). Pour appliquer ces prix au site : action apply_prices.',
  ];
  return lines.filter(l => l !== '').join('\n').replace(/\n(?=Grille|ℹ️)/g, '\n\n');
}

async function targetIncome(input: Record<string, unknown>): Promise<string> {
  const target = num(input['target_net_monthly']) ?? num(input['target']);
  if (!target) return '❌ Donne target_net_monthly (ex. 2000 pour 2 000 € net par mois).';
  const b = await loadBaseline(num(input['year']) ?? new Date().getFullYear());
  const costs = num(input['monthly_costs']) ?? 0;
  const income = parseIncome(input['other_income']);
  const other = income.reduce((s, i) => s + i.monthly, 0);
  const need = Math.max(0, target + costs - other);
  const m = b.marginPerDay || weightedMargin(b.cars);          // marge RÉELLE par jour loué
  const mCat = weightedMargin(b.cars);                          // si les prix catalogue étaient respectés
  const capacity = b.cars.length * 30.4;
  const D = num(input['rental_days_per_month']) ?? b.daysPerMonth;
  const avgClient = b.days ? b.revenue / b.days : (b.cars.reduce((t, c) => t + (c.client ?? 0), 0) / Math.max(1, b.cars.length));

  const daysNeeded = m > 0 ? need / m : Infinity;
  const marginNeeded = D > 0 ? need / D : Infinity;
  const occ = (d: number) => `${(d / capacity * 100).toFixed(0)} % du parc`;
  const feasible = (d: number) => d <= capacity * 0.7 ? '' : d <= capacity ? ' (⚠️ > 70 % du parc occupé, très ambitieux)' : ' (❌ impossible avec le parc actuel)';

  const daysGrid = [...new Set([Math.round(D), 30, 60, 90, 120, 150].filter(x => x > 0))].sort((a, c) => a - c);
  const marginGrid = [...new Set([Math.round(m * 10) / 10, 10, 15, 20, 25].filter(x => x > 0))].sort((a, c) => a - c);
  const grid = marginGrid.map(mg => `• marge ${eur1(mg)}/j : ${daysGrid.map(d => `${d} j → ${eur(mg * d)}${mg * d >= need ? ' ✅' : ''}`).join(' · ')}`).join('\n');

  // Plan réaliste : le plus petit volume pour lequel la marge nécessaire reste ≤ 35 % du prix client moyen
  const plans = [45, 60, 75, 90, 105, 120, 150, 180].filter(d => d <= capacity).map(d => ({ d, mg: need / d, p: need / d / avgClient * 100 }));
  const plan = plans.find(x => x.p <= 35) ?? plans[plans.length - 1];
  const perCar = plan ? b.cars.filter(c => c.client != null && c.owner != null).map(c => {
    const ownerMax = c.client! * (1 - plan.p / 100);
    const clientMin = c.owner! / (1 - Math.min(plan.p, 90) / 100);
    const okNow = margin(c)! / c.client! * 100 >= plan.p;
    return `• ${c.name} : ${c.client} € client / ${c.owner} € proprio ${okNow ? '✅ déjà assez' : `→ proprio ≤ ${eur1(ownerMax)} (prix client gardé) ou client ${eur1(clientMin)} (prix proprio gardé)`}`;
  }).join('\n') : '';

  return [
    `🎯 OBJECTIF ${eur(target)} NET / MOIS — calculé sur tes chiffres réels ${b.year}`,
    `Aujourd'hui : ${eur(b.profitPerMonth)} / mois (${b.daysPerMonth.toFixed(1)} jours loués/mois × ${eur1(b.marginPerDay)} de marge).`,
    `À trouver par la location : ${eur(target)}${costs ? ` + ${eur(costs)} de charges` : ''}${other ? ` − ${eur(other)} d'autres revenus (${income.map(i => i.label).join(', ')})` : ''} = ${eur(need)} / mois.`,
    '',
    `LEVIER 1 — LOUER PLUS à ta marge réelle (${eur1(m)}/j) : ${Number.isFinite(daysNeeded) ? `${Math.ceil(daysNeeded)} jours loués/mois = ${occ(daysNeeded)}${feasible(daysNeeded)}` : 'impossible (marge nulle)'}. Aujourd'hui : ${b.daysPerMonth.toFixed(1)} j.`,
    mCat > m ? `   (en faisant respecter les prix catalogue, marge ${eur1(mCat)}/j : ${Math.ceil(need / mCat)} jours/mois = ${occ(need / mCat)}${feasible(need / mCat)}.)` : '',
    `LEVIER 2 — GAGNER PLUS PAR JOUR au volume actuel (${D.toFixed(1)} j/mois) : il faudrait ${Number.isFinite(marginNeeded) ? eur1(marginNeeded) : '∞'} de marge par jour (aujourd'hui ${eur1(m)}).${marginNeeded > avgClient * 0.4 ? ` ❌ Impossible seul : c'est plus de 40 % d'un prix client moyen de ${eur1(avgClient)}. Il faut louer plus.` : ''}`,
    `LEVIER 3 — LES DEUX (marge × jours loués/mois, ✅ = objectif atteint) :\n${grid}`,
    '',
    plan ? `👉 PLAN RÉALISTE : ${plan.d} jours loués/mois (${occ(plan.d)}) avec ${eur1(plan.mg)} de marge/jour = ${pct(plan.p)} du prix client moyen (${eur1(avgClient)}).${plan.p > 35 ? ' ⚠️ Même ainsi la marge est très haute : la location seule ne suffit pas, ajoute d\'autres activités (other_income).' : ''}\nCe que ça veut dire voiture par voiture (garder ${pct(plan.p)} du prix client) :\n${perCar}` : '',
    '',
    'ℹ️ Chaque 100 € gagnés ailleurs (FIK Sites, immobilier, abonnements entreprises…) = ' + (m > 0 ? `${Math.ceil(100 / m)} jours de location en moins à trouver.` : '?') + ' Passe other_income [{label, monthly}] ou [{label, unit_price, units_per_month}] pour les inclure.',
  ].join('\n');
}

async function priceCar(input: Record<string, unknown>): Promise<string> {
  const cars = await loadCars();
  const q = String(input['car'] ?? '').trim();
  const c = q ? findCar(cars, q) : null;
  if (q && !c) return `❌ Voiture « ${q} » introuvable. Parc : ${cars.map(x => x.name).join(', ')}.`;
  const client = num(input['client_price']) ?? c?.client ?? null;
  const owner = num(input['owner_price']) ?? (num(input['client_price']) != null ? null : c?.owner ?? null);
  const days = num(input['rental_days_per_month']);
  const wantPct = num(input['margin_pct']), wantEur = num(input['margin_eur']);
  const pcts = wantPct != null ? [wantPct] : [10, 15, 20, 25, 30];
  const head = c ? `🚗 ${c.name} — aujourd'hui : client ${c.client ?? '?'} €/j · propriétaire ${c.owner ?? '?'} €/j · marge ${margin(c) != null ? `${eur1(margin(c)!)} (${pct(margin(c)! / (c.client || 1) * 100)})` : '?'}` : '🚗 Calcul de prix';
  const lines = [head];
  if (client != null) {
    lines.push(`\nSi le client paie ${client} €/j, le propriétaire doit être payé au maximum :`);
    for (const p of pcts) lines.push(`• marge ${p} % → ${eur1(client * (1 - p / 100))} au propriétaire (tu gardes ${eur1(client * p / 100)}/j${days ? `, ${eur(client * p / 100 * days)}/mois à ${days} j` : ''})`);
    if (wantEur != null) lines.push(`• marge ${eur1(wantEur)}/j → ${eur1(client - wantEur)} au propriétaire`);
  }
  if (owner != null) {
    lines.push(`\nSi le propriétaire est payé ${owner} €/j, le client doit payer au minimum :`);
    for (const p of pcts) lines.push(`• marge ${p} % → ${eur1(owner / (1 - p / 100))} au client (tu gardes ${eur1(owner / (1 - p / 100) - owner)}/j)`);
    if (wantEur != null) lines.push(`• marge ${eur1(wantEur)}/j → ${eur1(owner + wantEur)} au client`);
  }
  if (client == null && owner == null) return '❌ Donne car (voiture du parc) ou client_price / owner_price.';
  lines.push('\n(marge % = part du prix client que tu gardes). Pour changer le prix sur le site : apply_prices ou update_car.');
  return lines.join('\n');
}

async function priceGrid(input: Record<string, unknown>): Promise<string> {
  const cars = await loadCars();
  const p = num(input['margin_pct']), e = num(input['margin_eur']);
  if (p == null && e == null) return '❌ Donne margin_pct (ex. 20) ou margin_eur (ex. 8) : la marge que tu veux garder par jour.';
  const rows = cars.filter(c => c.client != null || c.owner != null).map(c => {
    const ownerMax = c.client != null ? (p != null ? c.client * (1 - p / 100) : c.client - e!) : null;
    const clientMin = c.owner != null ? (p != null ? c.owner / (1 - p / 100) : c.owner + e!) : null;
    const ok = margin(c) != null && (p != null ? margin(c)! / (c.client || 1) * 100 >= p : margin(c)! >= e!);
    return `• ${c.name} (${c.client ?? '?'} € / ${c.owner ?? '?'} €) ${ok ? '✅ déjà OK' : '⚠️'} → proprio max ${ownerMax != null ? eur1(ownerMax) : '?'} à prix client inchangé, ou client ${clientMin != null ? eur1(clientMin) : '?'} à prix proprio inchangé`;
  });
  return `📋 GRILLE pour garder ${p != null ? `${p} % du prix client` : `${eur1(e!)} par jour`} :\n${rows.join('\n')}`;
}

async function applyPricesAction(input: Record<string, unknown>): Promise<string> {
  const b = await loadBaseline(new Date().getFullYear());
  const { cars, unknown, notes } = applyPrices(b.cars, input);
  const changed = cars.filter(c => { const o = b.cars.find(x => x.id === c.id)!; return o.client !== c.client || o.owner !== c.owner; });
  if (!changed.length) return `❌ Aucun prix modifié${unknown.length ? ` (voitures introuvables : ${unknown.join(', ')})` : ''}. Utilise price_overrides [{car, client_price, owner_price}], client_change_pct ou owner_change_pct (+ category).`;
  const preview = changed.map(c => {
    const o = b.cars.find(x => x.id === c.id)!;
    const m = margin(c) ?? 0;
    return `• ${c.name} : client ${o.client} → ${c.client} €/j · propriétaire ${o.owner} → ${c.owner} €/j · marge ${eur1(margin(o) ?? 0)} → ${eur1(m)}${m <= 0 ? ' ❌ tu perds de l\'argent' : m < 3 ? ' ⚠️ marge presque nulle' : ''}`;
  }).join('\n');
  if (input['confirm'] !== true) {
    return `📝 APERÇU (rien n'est encore changé) — ${notes.join(' ; ')}\n${preview}${unknown.length ? `\n⚠️ Introuvables : ${unknown.join(', ')}` : ''}\n\nLe prix client est celui affiché sur le site. Demande à Kouider de confirmer, puis rappelle apply_prices avec les mêmes paramètres et confirm=true.`;
  }
  for (const c of changed) {
    const { error } = await supabase.from('cars').update({ resale_price: c.client, base_price: c.owner }).eq('id', c.id);
    if (error) return `❌ Erreur sur ${c.name} : ${error.message} (les voitures précédentes sont déjà modifiées).`;
  }
  return `✅ Prix mis à jour (site + app + Carte live) :\n${preview}`;
}

export async function businessSimulator(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'baseline');
  try {
    switch (action) {
      case 'baseline':     return await baseline(input);
      case 'scenario':     return await scenario(input);
      case 'target_income': return await targetIncome(input);
      case 'price_car':    return await priceCar(input);
      case 'price_grid':   return await priceGrid(input);
      case 'apply_prices': return await applyPricesAction(input);
      default: return `❌ action inconnue : ${action} (baseline, scenario, target_income, price_car, price_grid, apply_prices)`;
    }
  } catch (err) {
    return `❌ Simulateur : ${err instanceof Error ? err.message : String(err)}`;
  }
}
