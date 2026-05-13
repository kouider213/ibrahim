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

export async function getRevenueSummary(): Promise<RevenueSummary> {
  const CACHE_KEY = `bi:revenue:${new Date().toISOString().slice(0, 13)}`;
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as RevenueSummary;

  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo  = new Date(Date.now() - 7  * 86_400_000).toISOString().slice(0, 10);
  const monthStr = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${now.getFullYear()}-${monthStr}-01`;

  // Parallel queries
  const [todayRes, weekRes, monthRes, rejectedRes, finReport] = await Promise.all([
    supabase.from('bookings').select('final_price')
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .eq('start_date', today),
    supabase.from('bookings').select('final_price')
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .gte('start_date', weekAgo),
    supabase.from('bookings').select('id, client_name, client_phone, final_price')
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .gte('start_date', monthStart),
    supabase.from('bookings').select('final_price')
      .eq('status', 'REJECTED')
      .gte('created_at', monthStart),
    getFinancialReport(now.getFullYear(), now.getMonth() + 1).catch(() => null),
  ]);

  type BookingRow = { final_price: number };
  const sumPrice = (rows: BookingRow[]) => rows.reduce((s, b) => s + (b.final_price ?? 0), 0);

  const todayRevenue = sumPrice((todayRes.data ?? []) as BookingRow[]);
  const weekRevenue  = sumPrice((weekRes.data  ?? []) as BookingRow[]);
  const monthRows    = (monthRes.data ?? []) as Array<{ id: string; client_name: string; client_phone?: string; final_price: number }>;
  const monthRevenue = monthRows.reduce((s, b) => s + (b.final_price ?? 0), 0);
  const rejected     = (rejectedRes.data ?? []) as BookingRow[];

  // Client scoring from month's bookings
  const clientMap: Record<string, { count: number; spent: number; phone?: string; last: string }> = {};
  for (const b of monthRows) {
    const key = b.client_name;
    if (!clientMap[key]) clientMap[key] = { count: 0, spent: 0, phone: b.client_phone, last: today };
    clientMap[key]!.count++;
    clientMap[key]!.spent += b.final_price ?? 0;
  }

  // Also pull all-time bookings for better client scoring
  const { data: allBks } = await supabase
    .from('bookings').select('client_name, client_phone, final_price, start_date')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED']);
  for (const b of (allBks ?? []) as Array<{ client_name: string; client_phone?: string; final_price: number; start_date: string }>) {
    const key = b.client_name;
    if (!clientMap[key]) {
      clientMap[key] = { count: 1, spent: b.final_price ?? 0, phone: b.client_phone, last: b.start_date };
    }
  }

  // Rebuild client list from all-time bookings for proper scoring
  const allClientMap: Record<string, { count: number; spent: number; phone?: string; last: string }> = {};
  for (const b of (allBks ?? []) as Array<{ client_name: string; client_phone?: string; final_price: number; start_date: string }>) {
    const key = b.client_name;
    const existing = allClientMap[key] ?? { count: 0, spent: 0, phone: b.client_phone, last: '' };
    allClientMap[key] = {
      count: existing.count + 1,
      spent: existing.spent + (b.final_price ?? 0),
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
    kouider_profit_month:  finReport?.kouiderProfit  ?? 0,
    houari_revenue_month:  finReport?.ownerTotal     ?? 0,
    avg_booking_value:     monthRows.length ? Math.round(monthRevenue / monthRows.length) : 0,
    total_bookings_month:  monthRows.length,
    rejected_count:        rejected.length,
    rejected_revenue_lost: sumPrice(rejected),
    top_clients,
    generated_at:          new Date().toISOString(),
  };

  await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', 1800);
  return result;
}
