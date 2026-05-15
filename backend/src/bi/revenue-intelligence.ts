import { supabase } from '../integrations/supabase.js';
import { getFinancialReport } from '../integrations/finance.js';
import { redis } from '../queue/queue.js';

export interface ClientScore {
  client_name:    string;
  client_phone?:  string;
  bookings_count: number;
  total_spent:    number;
  last_booking:   string;
  score:          'VIP' | 'FREQUENT' | 'REGULAR' | 'NEW';
}

export interface RevenueSummary {
  today_revenue:            number;
  week_revenue:             number;
  month_revenue:            number;
  kouider_profit_month:     number;
  houari_revenue_month:     number;
  missing_owner_price:      number;    // bookings sans owner_ppd ce mois
  avg_booking_value:        number;
  total_bookings_month:     number;
  rejected_count:           number;
  rejected_revenue_lost:    number;
  top_clients:              ClientScore[];
  generated_at:             string;
}

function scoreClient(count: number, spent: number): ClientScore['score'] {
  if (count >= 5 || spent >= 1000) return 'VIP';
  if (count >= 3 || spent >= 500)  return 'FREQUENT';
  if (count >= 2 || spent >= 200)  return 'REGULAR';
  return 'NEW';
}

// Total contract value — used for rejected/lost revenue only
function realBookingCA(b: {
  client_price_per_day?: number | null;
  final_price?:          number | null;
  nb_days?:              number | null;
  start_date:            string;
  end_date:              string;
}): number {
  const nb_days = b.nb_days ?? Math.max(1,
    Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000),
  );
  if (b.client_price_per_day != null && b.client_price_per_day > 0) {
    return Math.round(b.client_price_per_day * nb_days * 100) / 100;
  }
  return b.final_price ?? 0;
}

// Prorated revenue — only the days of the booking that fall within [from, to]
// today_revenue = 1 day, week_revenue = overlap days in last 7, month = overlap in month
function proratedCA(b: {
  client_price_per_day?: number | null;
  final_price?:          number | null;
  nb_days?:              number | null;
  start_date:            string;
  end_date:              string;
}, from: string, to: string): number {
  const bStart  = new Date(b.start_date);
  const bEnd    = new Date(b.end_date);
  const wStart  = new Date(from);
  const wEnd    = new Date(to);
  const oStart  = new Date(Math.max(bStart.getTime(), wStart.getTime()));
  const oEnd    = new Date(Math.min(bEnd.getTime(),   wEnd.getTime()));
  const overlapMs = oEnd.getTime() - oStart.getTime();
  if (overlapMs < 0) return 0;
  // At least 1 day when there IS an overlap (handles same-day window = today)
  const overlapDays = Math.max(1, Math.ceil(overlapMs / 86_400_000));
  const totalDays   = b.nb_days ?? Math.max(1,
    Math.ceil((bEnd.getTime() - bStart.getTime()) / 86_400_000),
  );
  const dailyRate = b.client_price_per_day != null && b.client_price_per_day > 0
    ? b.client_price_per_day
    : Math.round(((b.final_price ?? 0) / totalDays) * 100) / 100;
  return Math.round(dailyRate * overlapDays * 100) / 100;
}

export async function getRevenueSummary(): Promise<RevenueSummary> {
  const CACHE_KEY = `bi:revenue:${new Date().toISOString().slice(0, 13)}`;
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as RevenueSummary;

  const now      = new Date();
  const today    = now.toISOString().slice(0, 10);
  const weekAgo  = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const monthStr = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${now.getFullYear()}-${monthStr}-01`;
  const monthEnd   = `${now.getFullYear()}-${monthStr}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

  // All queries include real price columns + use OVERLAP date filters
  const priceSelect = 'client_price_per_day, owner_price_per_day, final_price, nb_days, start_date, end_date';

  const [todayRes, weekRes, monthRes, rejectedRes, finReport] = await Promise.all([
    // Bookings ACTIVE today (overlap: start_date <= today AND end_date >= today)
    supabase.from('bookings')
      .select(priceSelect)
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .lte('start_date', today)
      .gte('end_date',   today),

    // Bookings active in the past 7 days
    supabase.from('bookings')
      .select(priceSelect)
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .lte('start_date', today)
      .gte('end_date',   weekAgo),

    // Bookings active this month (overlap)
    supabase.from('bookings')
      .select(`id, client_name, client_phone, ${priceSelect}`)
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .lte('start_date', monthEnd)
      .gte('end_date',   monthStart),

    // Rejected bookings this month
    supabase.from('bookings')
      .select(priceSelect)
      .eq('status', 'REJECTED')
      .gte('created_at', monthStart),

    getFinancialReport(now.getFullYear(), now.getMonth() + 1).catch(() => null),
  ]);

  type PriceRow = { client_price_per_day?: number | null; final_price?: number | null; nb_days?: number | null; start_date: string; end_date: string };

  const sumCA        = (rows: PriceRow[]) => rows.reduce((s, b) => s + realBookingCA(b), 0);
  const sumProrated  = (rows: PriceRow[], from: string, to: string) =>
    rows.reduce((s, b) => s + proratedCA(b, from, to), 0);

  const todayRevenue = sumProrated((todayRes.data ?? []) as PriceRow[], today, today);
  const weekRevenue  = sumProrated((weekRes.data  ?? []) as PriceRow[], weekAgo, today);

  type MonthRow = PriceRow & { id: string; client_name: string; client_phone?: string };
  const monthRows    = (monthRes.data ?? []) as MonthRow[];
  const monthRevenue = sumProrated(monthRows, monthStart, monthEnd);

  const rejected     = (rejectedRes.data ?? []) as PriceRow[];

  // Client scoring — use real prices for total_spent
  const { data: allBks } = await supabase
    .from('bookings')
    .select('client_name, client_phone, client_price_per_day, final_price, nb_days, start_date, end_date')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED']);

  type AllBkRow = PriceRow & { client_name: string; client_phone?: string };
  const allClientMap: Record<string, { count: number; spent: number; phone?: string; last: string }> = {};

  for (const b of (allBks ?? []) as AllBkRow[]) {
    const key      = b.client_name;
    const realCA   = realBookingCA(b);
    const existing = allClientMap[key] ?? { count: 0, spent: 0, phone: b.client_phone, last: '' };
    allClientMap[key] = {
      count: existing.count + 1,
      spent: existing.spent + realCA,
      phone: b.client_phone ?? existing.phone,
      last:  b.start_date > existing.last ? b.start_date : existing.last,
    };
  }

  const top_clients: ClientScore[] = Object.entries(allClientMap)
    .map(([name, data]) => ({
      client_name:    name,
      client_phone:   data.phone,
      bookings_count: data.count,
      total_spent:    data.spent,
      last_booking:   data.last,
      score:          scoreClient(data.count, data.spent),
    }))
    .sort((a, b) => b.total_spent - a.total_spent)
    .slice(0, 10);

  const result: RevenueSummary = {
    today_revenue:         todayRevenue,
    week_revenue:          weekRevenue,
    month_revenue:         monthRevenue,
    kouider_profit_month:  finReport?.kouiderProfit     ?? 0,
    houari_revenue_month:  finReport?.ownerTotal        ?? 0,
    missing_owner_price:   finReport?.missingOwnerPrice ?? 0,
    avg_booking_value:     monthRows.length ? Math.round(monthRevenue / monthRows.length) : 0,
    total_bookings_month:  monthRows.length,
    rejected_count:        rejected.length,
    rejected_revenue_lost: sumCA(rejected),
    top_clients,
    generated_at:          new Date().toISOString(),
  };

  await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', 1800);
  return result;
}
