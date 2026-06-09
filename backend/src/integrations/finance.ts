import { supabase } from './supabase.js';
import { VEHICLE_PRICING } from '../config/pricing.js';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface FinancialBooking {
  id:                    string;
  client_name:           string;
  car_name:              string;
  start_date:            string;
  end_date:              string;
  nb_days:               number;
  final_price:           number | null;       // null = non défini en base
  client_price_per_day:  number | null;       // null = données manquantes (jamais inventé)
  owner_price_per_day:   number | null;       // null = non renseigné (jamais inventé)
  owner_total:           number | null;       // null si owner_ppd manquant
  rented_by:             string;
  status:                string;
  payment_status:        string;
  paid_amount:           number;
  kouider_profit:        number | null;       // null = impossible à calculer (données manquantes)
  discount_applied:      number;
  price_source:          'explicit' | 'computed' | 'missing';
  data_complete:         boolean;
  currency:              string;             // 'EUR' (défaut) | 'DZD' (locations Houari en dinars)
}

export interface FinancialReport {
  period:             string;
  totalBookings:      number;
  kouiderBookings:    number;
  houariBookings:     number;
  grossCA:            number;
  ownerTotal:         number;
  houariRevenue:      number;         // revenu réel Houari : owner_total (resas Kouider) + CA direct (resas Houari)
  kouiderProfit:      number;         // somme partielle — voir missingOwnerPrice
  encaisse:           number;
  aEncaisser:         number;
  missingOwnerPrice:  number;         // nb bookings sans owner_price_per_day
  missingClientPrice: number;         // nb bookings sans client_price_per_day (revenus non fiables)
  bookings:           FinancialBooking[];
  // CA en dinars (locations Houari en DZD) — séparé, n'affecte pas les totaux EUR ci-dessus
  dzd:                { ca: number; houariCA: number; kouiderCA: number; kouiderProfit: number; encaisse: number; aEncaisser: number; bookings: number };
}

// ── Seed pricing table ────────────────────────────────────────────────────────

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
  if (error) console.warn('[finance] Pricing seed failed:', error.message);
  else console.log('[finance] Pricing table seeded:', rows.length, 'vehicles');
}

// ── Core computation — NO catalog fallback ────────────────────────────────────
//
// Règle stricte :
//   client_ppd  → client_price_per_day si > 0, sinon final_price/nb_days, sinon null
//   owner_ppd   → owner_price_per_day si > 0, sinon null (JAMAIS catalogue)
//   profit      → null si owner_ppd manquant (pas inventé)
//
export function computeBookingFinancials(b: {
  final_price:          number | null;
  client_price_per_day: number | null;
  owner_price_per_day:  number | null;
  start_date:           string;
  end_date:             string;
  nb_days?:             number | null;
  paid_amount?:         number | null;
  rented_by?:           string | null;
  discount_applied?:    number | null;
}): {
  nb_days:              number;
  client_price_per_day: number | null;
  owner_price_per_day:  number | null;
  final_price:          number | null;
  owner_total:          number | null;
  kouider_profit:       number | null;
  paid_amount:          number;
  discount_applied:     number;
  price_source:         'explicit' | 'computed' | 'missing';
  data_complete:        boolean;
} {
  const nb_days = b.nb_days ?? Math.max(1,
    Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000),
  );
  const paid_amount     = b.paid_amount     ?? 0;
  const discount_applied = b.discount_applied ?? 0;
  const rentedBy        = b.rented_by       ?? 'Kouider';

  // ── client_ppd (prix négocié réel — jamais catalogue) ──
  let client_price_per_day: number | null;
  let price_source: 'explicit' | 'computed' | 'missing';

  if (b.client_price_per_day != null && b.client_price_per_day > 0) {
    client_price_per_day = b.client_price_per_day;
    price_source = 'explicit';
  } else if (b.final_price != null && b.final_price > 0) {
    client_price_per_day = Math.round((b.final_price / nb_days) * 100) / 100;
    price_source = 'computed';
  } else {
    client_price_per_day = null;
    price_source = 'missing';
  }

  // ── owner_ppd (prix Houari réel — jamais catalogue) ──
  const owner_price_per_day: number | null =
    (b.owner_price_per_day != null && b.owner_price_per_day > 0)
      ? b.owner_price_per_day
      : null;

  // ── Totaux ──
  const final_price = client_price_per_day != null
    ? Math.round(client_price_per_day * nb_days * 100) / 100
    : (b.final_price ?? null);

  const owner_total = owner_price_per_day != null
    ? Math.round(owner_price_per_day * nb_days * 100) / 100
    : null;

  // Profit Kouider = 0 pour les résa Houari (connu); null si owner_ppd manquant
  const kouider_profit =
    rentedBy === 'Houari'
      ? 0
      : (client_price_per_day != null && owner_price_per_day != null)
        ? Math.round((client_price_per_day - owner_price_per_day) * nb_days * 100) / 100
        : null;

  const data_complete = client_price_per_day != null && owner_price_per_day != null;

  return {
    nb_days, client_price_per_day, owner_price_per_day,
    final_price, owner_total, kouider_profit,
    paid_amount, discount_applied, price_source, data_complete,
  };
}

// ── Financial report ──────────────────────────────────────────────────────────

export async function getFinancialReport(year: number, month?: number): Promise<FinancialReport> {
  let startDate: string;
  let endDate:   string;
  let period:    string;

  if (month) {
    const mm = String(month).padStart(2, '0');
    startDate = `${year}-${mm}-01`;
    endDate   = `${year}-${mm}-${new Date(year, month, 0).getDate()}`;
    period    = `${mm}/${year}`;
  } else {
    startDate = `${year}-01-01`;
    endDate   = `${year}-12-31`;
    period    = String(year);
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_name, start_date, end_date, nb_days, final_price, client_price_per_day, owner_price_per_day, discount_applied, paid_amount, payment_status, rented_by, status, currency, cars(name)')
    .in('status', ['CONFIRMED', 'COMPLETED', 'ACTIVE'])
    .lte('start_date', endDate)
    .gte('end_date',   startDate)
    .order('start_date');

  if (error) throw new Error(`Financial report failed: ${error.message}`);

  const raw = (data ?? [] as unknown[]) as Array<{
    id: string; client_name: string; start_date: string; end_date: string;
    nb_days?: number | null; final_price: number | null;
    client_price_per_day?: number | null; owner_price_per_day?: number | null;
    discount_applied?: number | null;
    paid_amount?: number | null; payment_status?: string | null;
    rented_by?: string | null; status: string; currency?: string | null;
    cars?: { name: string } | { name: string }[] | null;
  }>;

  const result: FinancialBooking[] = raw.map(b => {
    const carObj = Array.isArray(b.cars) ? b.cars[0] : b.cars;
    const calc   = computeBookingFinancials({
      ...b,
      client_price_per_day: b.client_price_per_day ?? null,
      owner_price_per_day:  b.owner_price_per_day  ?? null,
      discount_applied:     b.discount_applied      ?? null,
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
      discount_applied:     calc.discount_applied,
      price_source:         calc.price_source,
      data_complete:        calc.data_complete,
      currency:             (b.currency ?? 'EUR').toUpperCase(),
    };
  });

  // Séparation par devise : les totaux EUR (historique) excluent les locations DZD,
  // pour ne RIEN changer aux chiffres existants. Le DZD est compté à part.
  const eur = result.filter(b => b.currency !== 'DZD');
  const dzdList = result.filter(b => b.currency === 'DZD');

  const kouiderBookings   = eur.filter(b => b.rented_by !== 'Houari').length;
  const houariBookings    = eur.filter(b => b.rented_by === 'Houari').length;
  const grossCA           = eur.reduce((s, b) => s + (b.final_price ?? 0), 0);
  const ownerTotal        = eur.reduce((s, b) => s + (b.owner_total ?? 0), 0);
  // Houari revenue = owner_total des resas Kouider + CA complet des resas Houari directes
  const houariRevenue     = eur.reduce((s, b) => {
    if (b.owner_total != null) return s + b.owner_total;
    if (b.rented_by === 'Houari') return s + (b.final_price ?? 0);
    return s;
  }, 0);
  const kouiderProfit     = eur.reduce((s, b) => s + (b.kouider_profit ?? 0), 0);
  const encaisse          = eur.reduce((s, b) => s + b.paid_amount, 0);
  const aEncaisser        = eur.reduce((s, b) => s + Math.max(0, (b.final_price ?? 0) - b.paid_amount), 0);
  const missingOwnerPrice = eur.filter(b => b.owner_price_per_day === null && b.rented_by !== 'Houari').length;
  const missingClientPrice = eur.filter(b => b.price_source === 'missing').length;

  const dzd = {
    ca:            Math.round(dzdList.reduce((s, b) => s + (b.final_price ?? 0), 0) * 100) / 100,
    houariCA:      Math.round(dzdList.filter(b => b.rented_by === 'Houari').reduce((s, b) => s + (b.final_price ?? 0), 0) * 100) / 100,
    // CA + bénéfice DZD de Kouider (locations Kouider en dinars — déduit le prix proprio)
    kouiderCA:     Math.round(dzdList.filter(b => b.rented_by !== 'Houari').reduce((s, b) => s + (b.final_price ?? 0), 0) * 100) / 100,
    kouiderProfit: Math.round(dzdList.reduce((s, b) => s + (b.kouider_profit ?? 0), 0) * 100) / 100,
    encaisse:      Math.round(dzdList.reduce((s, b) => s + b.paid_amount, 0) * 100) / 100,
    aEncaisser:    Math.round(dzdList.reduce((s, b) => s + Math.max(0, (b.final_price ?? 0) - b.paid_amount), 0) * 100) / 100,
    bookings:      dzdList.length,
  };

  return {
    period, totalBookings: result.length,
    kouiderBookings, houariBookings,
    grossCA, ownerTotal, houariRevenue, kouiderProfit,
    encaisse, aEncaisser,
    missingOwnerPrice, missingClientPrice,
    bookings: result,
    dzd,
  };
}

// ── Formatted report ──────────────────────────────────────────────────────────

export function formatFinancialReport(report: FinancialReport): string {
  const lines: string[] = [
    `📊 RAPPORT FINANCIER — ${report.period}`,
    `Total: ${report.totalBookings} réservations (Kouider: ${report.kouiderBookings} | Houari: ${report.houariBookings})`,
    ``,
    `💰 CA BRUT (prix réels clients):   ${report.grossCA}€`,
    `🏢 Coût Houari (prix réels):        ${report.ownerTotal}€`,
    `✅ BÉNÉFICE KOUIDER NET:            ${report.kouiderProfit}€`,
    ``,
    `📥 Encaissé:    ${report.encaisse}€`,
    `⏳ À encaisser: ${report.aEncaisser}€`,
  ];

  if (report.missingOwnerPrice > 0) {
    lines.push(
      ``,
      `⚠️ DONNÉES MANQUANTES: ${report.missingOwnerPrice} réservation(s) sans owner_price_per_day`,
      `   → bénéfice partiel (les réservations sans prix Houari sont exclues du calcul)`,
      `   → renseignez owner_price_per_day dans Supabase pour un calcul complet`,
    );
  }
  if (report.missingClientPrice > 0) {
    lines.push(
      ``,
      `❌ PRIX CLIENT MANQUANT: ${report.missingClientPrice} réservation(s) sans client_price_per_day ni final_price`,
      `   → Impossible de calculer sans données financières réelles`,
    );
    const missing = report.bookings.filter(b => b.price_source === 'missing');
    for (const b of missing) {
      lines.push(`  → ${b.client_name} | ${b.car_name} | ${b.start_date}`);
    }
  }

  lines.push(``, `DÉTAIL:`);
  for (const b of report.bookings) {
    const srcTag    = b.price_source === 'explicit' ? '' : b.price_source === 'computed' ? ' [calculé]' : ' [❌MANQUANT]';
    const profitTag = b.rented_by === 'Houari'
      ? 'Houari 100%'
      : b.kouider_profit != null
        ? `K+${b.kouider_profit}€`
        : '❓profit inconnu (owner_ppd manquant)';
    const clientPpd = b.client_price_per_day != null ? `${b.client_price_per_day}€/j` : '❓';
    const ownerPpd  = b.owner_price_per_day  != null ? `${b.owner_price_per_day}€/j`  : '❓';
    lines.push(
      `- ${b.client_name} | ${b.car_name} | ${b.nb_days}j` +
      ` | client: ${clientPpd} — Houari: ${ownerPpd}` +
      ` | Total: ${b.final_price ?? '?'}€ | [${profitTag}]${srcTag}`,
    );
  }

  return lines.join('\n');
}
