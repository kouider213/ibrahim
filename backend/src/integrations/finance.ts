import { supabase } from './supabase.js';
import { VEHICLE_PRICING, getPricingForVehicle } from '../config/pricing.js';

export interface FinancialBooking {
  id:                    string;
  client_name:           string;
  car_name:              string;
  start_date:            string;
  end_date:              string;
  nb_days:               number;
  final_price:           number;
  client_price_per_day:  number;
  owner_price_per_day:   number;
  owner_total:           number;
  rented_by:             string;
  status:                string;
  payment_status:        string;
  paid_amount:           number;
  kouider_profit:        number;
  price_source:          'explicit' | 'computed' | 'catalog_fallback';
}

export interface FinancialReport {
  period:          string;
  totalBookings:   number;
  kouiderBookings: number;
  houariBookings:  number;
  grossCA:         number;
  ownerTotal:      number;
  kouiderProfit:   number;
  encaisse:        number;
  aEncaisser:      number;
  bookings:        FinancialBooking[];
}

// Seed pricing table — run once to populate Supabase
export async function seedPricingTable(): Promise<void> {
  const rows = VEHICLE_PRICING.map(p => ({
    vehicle_name:  p.name,
    houari_price:  p.houariPrice,
    kouider_price: p.kouiderPrice,
    benefit:       p.benefit,
  }));

  const { error } = await supabase
    .from('pricing')
    .upsert(rows, { onConflict: 'vehicle_name' });

  if (error) console.warn('[finance] Pricing seed failed (table may not exist yet):', error.message);
  else console.log('[finance] Pricing table seeded:', rows.length, 'vehicles');
}

/**
 * Calcul normalisé d'une réservation.
 *
 * Priorité des prix :
 * 1. client_price_per_day stocké (prix réellement négocié)
 * 2. final_price / nb_days (calcul depuis prix total réel)
 * 3. Fallback catalogue (UNIQUEMENT si final_price manquant — ne doit pas arriver en prod)
 */
function computeBookingFinancials(b: {
  final_price:          number | null;
  client_price_per_day: number | null;
  owner_price_per_day:  number | null;
  start_date:           string;
  end_date:             string;
  nb_days?:             number | null;
  paid_amount?:         number | null;
  payment_status?:      string | null;
  rented_by?:           string | null;
  cars?:                { name: string } | null;
}): {
  nb_days:              number;
  client_price_per_day: number;
  owner_price_per_day:  number;
  final_price:          number;
  owner_total:          number;
  kouider_profit:       number;
  paid_amount:          number;
  price_source:         'explicit' | 'computed' | 'catalog_fallback';
} {
  const startDt = new Date(b.start_date);
  const endDt   = new Date(b.end_date);
  const nb_days = b.nb_days ?? Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000));

  const final_price  = b.final_price ?? 0;
  const paid_amount  = b.paid_amount ?? 0;
  const rentedBy     = b.rented_by ?? 'Kouider';
  const catalog      = getPricingForVehicle(b.cars?.name ?? '');

  let client_price_per_day: number;
  let price_source: 'explicit' | 'computed' | 'catalog_fallback';

  if (b.client_price_per_day != null && b.client_price_per_day > 0) {
    // Source 1: prix réel stocké explicitement
    client_price_per_day = b.client_price_per_day;
    price_source = 'explicit';
  } else if (final_price > 0) {
    // Source 2: dériver depuis final_price (prix total réel)
    client_price_per_day = Math.round((final_price / nb_days) * 100) / 100;
    price_source = 'computed';
  } else if (catalog) {
    // Source 3: fallback catalogue — uniquement si aucun prix stocké
    client_price_per_day = catalog.kouiderPrice;
    price_source = 'catalog_fallback';
  } else {
    client_price_per_day = 0;
    price_source = 'catalog_fallback';
  }

  const owner_price_per_day = b.owner_price_per_day != null && b.owner_price_per_day > 0
    ? b.owner_price_per_day
    : (catalog?.houariPrice ?? 0);

  const effective_final = final_price > 0 ? final_price : client_price_per_day * nb_days;
  const owner_total     = Math.round(owner_price_per_day * nb_days * 100) / 100;

  // Kouider profit seulement si c'est sa réservation (pas Houari)
  const kouider_profit  = rentedBy === 'Houari'
    ? 0
    : Math.round((client_price_per_day - owner_price_per_day) * nb_days * 100) / 100;

  return { nb_days, client_price_per_day, owner_price_per_day, final_price: effective_final, owner_total, kouider_profit, paid_amount, price_source };
}

// Get financial report for a given month/year
export async function getFinancialReport(year: number, month?: number): Promise<FinancialReport> {
  let startDate: string;
  let endDate:   string;
  let period:    string;

  if (month) {
    const monthStr = String(month).padStart(2, '0');
    startDate = `${year}-${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${monthStr}-${lastDay}`;
    period = `${monthStr}/${year}`;
  } else {
    startDate = `${year}-01-01`;
    endDate   = `${year}-12-31`;
    period    = String(year);
  }

  // Réservations dont la période CHEVAUCHE le mois demandé (pas seulement celles qui démarrent)
  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, start_date, end_date, nb_days, final_price, client_price_per_day, owner_price_per_day, paid_amount, payment_status, rented_by, status, cars(name)')
    .in('status', ['CONFIRMED', 'COMPLETED', 'ACTIVE'])
    .lte('start_date', endDate)
    .gte('end_date',   startDate)
    .order('start_date');

  if (error) throw new Error(`Financial report failed: ${error.message}`);

  const raw = (data ?? [] as unknown[]) as Array<{
    id: string; client_name: string; start_date: string; end_date: string;
    nb_days?: number | null; final_price: number | null;
    client_price_per_day?: number | null; owner_price_per_day?: number | null;
    paid_amount?: number | null; payment_status?: string | null;
    rented_by?: string | null; status: string;
    cars?: { name: string } | { name: string }[] | null;
  }>;

  const result: FinancialBooking[] = raw.map(b => {
    const carObj = Array.isArray(b.cars) ? b.cars[0] : b.cars;
    const calc = computeBookingFinancials({
      ...b,
      client_price_per_day: b.client_price_per_day ?? null,
      owner_price_per_day:  b.owner_price_per_day  ?? null,
      cars: carObj ?? null,
    });
    return {
      id:                   b.id,
      client_name:          b.client_name,
      car_name:             carObj?.name ?? 'Inconnu',
      start_date:           b.start_date,
      end_date:             b.end_date,
      nb_days:              calc.nb_days,
      final_price:          calc.final_price,
      client_price_per_day: calc.client_price_per_day,
      owner_price_per_day:  calc.owner_price_per_day,
      owner_total:          calc.owner_total,
      rented_by:            b.rented_by ?? 'Kouider',
      status:               b.status,
      payment_status:       b.payment_status ?? 'PENDING',
      paid_amount:          calc.paid_amount,
      kouider_profit:       calc.kouider_profit,
      price_source:         calc.price_source,
    };
  });

  const kouiderBookings = result.filter(b => b.rented_by !== 'Houari').length;
  const houariBookings  = result.filter(b => b.rented_by === 'Houari').length;
  const grossCA         = result.reduce((s, b) => s + b.final_price, 0);
  const ownerTotal      = result.reduce((s, b) => s + b.owner_total, 0);
  const kouiderProfit   = result.reduce((s, b) => s + b.kouider_profit, 0);
  const encaisse        = result.reduce((s, b) => s + b.paid_amount, 0);
  const aEncaisser      = result.reduce((s, b) => s + Math.max(0, b.final_price - b.paid_amount), 0);

  return {
    period,
    totalBookings: result.length,
    kouiderBookings,
    houariBookings,
    grossCA,
    ownerTotal,
    kouiderProfit,
    encaisse,
    aEncaisser,
    bookings: result,
  };
}

export function formatFinancialReport(report: FinancialReport): string {
  const catalogFallbacks = report.bookings.filter(b => b.price_source === 'catalog_fallback');

  const lines: string[] = [
    `📊 RAPPORT FINANCIER — ${report.period}`,
    `Total: ${report.totalBookings} réservations (Kouider: ${report.kouiderBookings} | Houari: ${report.houariBookings})`,
    ``,
    `💰 CA BRUT (client total):  ${report.grossCA}€`,
    `🏢 Coût Houari (propriétaire): ${report.ownerTotal}€`,
    `✅ BÉNÉFICE KOUIDER NET:    ${report.kouiderProfit}€`,
    ``,
    `📥 Encaissé:    ${report.encaisse}€`,
    `⏳ À encaisser: ${report.aEncaisser}€`,
  ];

  if (catalogFallbacks.length > 0) {
    lines.push(``, `⚠️ ${catalogFallbacks.length} réservation(s) utilisent prix catalogue (client_price_per_day manquant) — vérifier:`);
    for (const b of catalogFallbacks) {
      lines.push(`  → ${b.client_name} | ${b.car_name} | ${b.start_date}`);
    }
  }

  lines.push(``, `DÉTAIL:`);
  for (const b of report.bookings) {
    const src    = b.price_source === 'explicit' ? '' : b.price_source === 'computed' ? ' [calculé]' : ' [⚠️catalogue]';
    const profit = b.rented_by === 'Houari' ? 'Houari 100%' : `K+${b.kouider_profit}€`;
    lines.push(
      `- ${b.client_name} | ${b.car_name} | ${b.nb_days}j` +
      ` | ${b.client_price_per_day}€/j client - ${b.owner_price_per_day}€/j Houari` +
      ` | Total: ${b.final_price}€ | [${profit}]${src}`,
    );
  }

  return lines.join('\n');
}
