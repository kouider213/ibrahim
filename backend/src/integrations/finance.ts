import { supabase } from './supabase.js';
import { VEHICLE_PRICING, getPricingForVehicle } from '../config/pricing.js';

export interface FinancialBooking {
  id:          string;
  client_name: string;
  car_name:    string;
  start_date:  string;
  end_date:    string;
  nb_days:     number;
  final_price: number;
  rented_by:   string;
  status:      string;
  kouider_profit: number;
  houari_revenue: number;
}

export interface FinancialReport {
  period:          string;
  totalBookings:   number;
  kouiderBookings: number;
  houariBookings:  number;
  kouiderProfit:   number;
  houariRevenue:   number;
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

  const { data, error } = await supabase
    .from('bookings')
    .select('*, cars(name)')
    .in('status', ['CONFIRMED', 'COMPLETED', 'ACTIVE'])
    .gte('start_date', startDate)
    .lte('start_date', endDate)
    .order('start_date');

  if (error) throw new Error(`Financial report failed: ${error.message}`);

  const bookings = (data ?? []) as Array<{
    id: string;
    client_name: string;
    start_date: string;
    end_date: string;
    nb_days?: number;
    final_price: number;
    rented_by?: string;
    status: string;
    cars?: { name: string };
  }>;

  const result: FinancialBooking[] = bookings.map(b => {
    const carName    = b.cars?.name ?? 'Inconnu';
    const startDt    = new Date(b.start_date);
    const endDt      = new Date(b.end_date);
    const nbDays     = b.nb_days ?? Math.max(1, Math.ceil((endDt.getTime() - startDt.getTime()) / 86_400_000));
    const rentedBy   = b.rented_by ?? 'Kouider';
    const finalPrice = b.final_price; // Prix TOTAL déjà payé
    const pricing    = getPricingForVehicle(carName);

    let kouiderProfit = 0;
    let houariRevenue = 0;

    if (rentedBy === 'Houari') {
      // Houari loue → Houari = 100%, Kouider = 0
      houariRevenue = finalPrice;
      kouiderProfit = 0;
    } else {
      // Kouider loue → calculer bénéfice d'après grille tarifaire
      if (pricing) {
        const benefitPerDay = pricing.benefit;
        kouiderProfit = benefitPerDay * nbDays;
        houariRevenue = finalPrice - kouiderProfit;
      } else {
        // Pas de grille → estimation 20% pour Kouider
        kouiderProfit = Math.round(finalPrice * 0.2);
        houariRevenue = finalPrice - kouiderProfit;
      }
    }

    return {
      id:             b.id,
      client_name:    b.client_name,
      car_name:       carName,
      start_date:     b.start_date,
      end_date:       b.end_date,
      nb_days:        nbDays,
      final_price:    finalPrice,
      rented_by:      rentedBy,
      status:         b.status,
      kouider_profit: kouiderProfit,
      houari_revenue: houariRevenue,
    };
  });

  const kouiderBookings = result.filter(b => b.rented_by === 'Kouider').length;
  const houariBookings  = result.filter(b => b.rented_by === 'Houari').length;
  const kouiderProfit   = result.reduce((s, b) => s + b.kouider_profit, 0);
  const houariRevenue   = result.reduce((s, b) => s + b.houari_revenue, 0);

  return {
    period,
    totalBookings:   result.length,
    kouiderBookings,
    houariBookings,
    kouiderProfit,
    houariRevenue,
    bookings: result,
  };
}

export function formatFinancialReport(report: FinancialReport): string {
  const lines: string[] = [
    `📊 RAPPORT FINANCIER — ${report.period}`,
    `Total: ${report.totalBookings} réservations (Kouider: ${report.kouiderBookings} | Houari: ${report.houariBookings})`,
    ``,
    `💰 KOUIDER — Bénéfice: ${report.kouiderProfit}€`,
    `🏢 HOUARI — Revenu: ${report.houariRevenue}€`,
    ``,
    `DÉTAIL:`,
  ];

  for (const b of report.bookings) {
    const tag = b.rented_by === 'Kouider' ? `K+${b.kouider_profit}€` : `H100%`;
    lines.push(`- ${b.client_name} | ${b.car_name} | ${b.nb_days}j | ${b.final_price}€ | [${tag}]`);
  }

  return lines.join('\n');
}
