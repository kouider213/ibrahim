"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRevenueSummary = getRevenueSummary;
const supabase_js_1 = require("../integrations/supabase.js");
const finance_js_1 = require("../integrations/finance.js");
const queue_js_1 = require("../queue/queue.js");
function scoreClient(count, spent) {
    if (count >= 5 || spent >= 1000)
        return 'VIP';
    if (count >= 3 || spent >= 500)
        return 'FREQUENT';
    if (count >= 2 || spent >= 200)
        return 'REGULAR';
    return 'NEW';
}
// Compute real CA for a booking row — client_price_per_day × nb_days preferred
// Falls back to final_price. Never uses catalog.
function realBookingCA(b) {
    const nb_days = b.nb_days ?? Math.max(1, Math.ceil((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000));
    if (b.client_price_per_day != null && b.client_price_per_day > 0) {
        return Math.round(b.client_price_per_day * nb_days * 100) / 100;
    }
    return b.final_price ?? 0;
}
async function getRevenueSummary() {
    const CACHE_KEY = `bi:revenue:${new Date().toISOString().slice(0, 13)}`;
    const cached = await queue_js_1.redis.get(CACHE_KEY);
    if (cached)
        return JSON.parse(cached);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');
    const monthStart = `${now.getFullYear()}-${monthStr}-01`;
    const monthEnd = `${now.getFullYear()}-${monthStr}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;
    // All queries include real price columns + use OVERLAP date filters
    const priceSelect = 'client_price_per_day, owner_price_per_day, final_price, nb_days, start_date, end_date';
    const [todayRes, weekRes, monthRes, rejectedRes, finReport] = await Promise.all([
        // Bookings ACTIVE today (overlap: start_date <= today AND end_date >= today)
        supabase_js_1.supabase.from('bookings')
            .select(priceSelect)
            .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
            .lte('start_date', today)
            .gte('end_date', today),
        // Bookings active in the past 7 days
        supabase_js_1.supabase.from('bookings')
            .select(priceSelect)
            .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
            .lte('start_date', today)
            .gte('end_date', weekAgo),
        // Bookings active this month (overlap)
        supabase_js_1.supabase.from('bookings')
            .select(`id, client_name, client_phone, ${priceSelect}`)
            .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
            .lte('start_date', monthEnd)
            .gte('end_date', monthStart),
        // Rejected bookings this month
        supabase_js_1.supabase.from('bookings')
            .select(priceSelect)
            .eq('status', 'REJECTED')
            .gte('created_at', monthStart),
        (0, finance_js_1.getFinancialReport)(now.getFullYear(), now.getMonth() + 1).catch(() => null),
    ]);
    const sumCA = (rows) => rows.reduce((s, b) => s + realBookingCA(b), 0);
    const todayRevenue = sumCA((todayRes.data ?? []));
    const weekRevenue = sumCA((weekRes.data ?? []));
    const monthRows = (monthRes.data ?? []);
    const monthRevenue = sumCA(monthRows);
    const rejected = (rejectedRes.data ?? []);
    // Client scoring — use real prices for total_spent
    const { data: allBks } = await supabase_js_1.supabase
        .from('bookings')
        .select('client_name, client_phone, client_price_per_day, final_price, nb_days, start_date, end_date')
        .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED']);
    const allClientMap = {};
    for (const b of (allBks ?? [])) {
        const key = b.client_name;
        const realCA = realBookingCA(b);
        const existing = allClientMap[key] ?? { count: 0, spent: 0, phone: b.client_phone, last: '' };
        allClientMap[key] = {
            count: existing.count + 1,
            spent: existing.spent + realCA,
            phone: b.client_phone ?? existing.phone,
            last: b.start_date > existing.last ? b.start_date : existing.last,
        };
    }
    const top_clients = Object.entries(allClientMap)
        .map(([name, data]) => ({
        client_name: name,
        client_phone: data.phone,
        bookings_count: data.count,
        total_spent: data.spent,
        last_booking: data.last,
        score: scoreClient(data.count, data.spent),
    }))
        .sort((a, b) => b.total_spent - a.total_spent)
        .slice(0, 10);
    const result = {
        today_revenue: todayRevenue,
        week_revenue: weekRevenue,
        month_revenue: monthRevenue,
        kouider_profit_month: finReport?.kouiderProfit ?? 0,
        houari_revenue_month: finReport?.ownerTotal ?? 0,
        missing_owner_price: finReport?.missingOwnerPrice ?? 0,
        avg_booking_value: monthRows.length ? Math.round(monthRevenue / monthRows.length) : 0,
        total_bookings_month: monthRows.length,
        rejected_count: rejected.length,
        rejected_revenue_lost: sumCA(rejected),
        top_clients,
        generated_at: new Date().toISOString(),
    };
    await queue_js_1.redis.set(CACHE_KEY, JSON.stringify(result), 'EX', 1800);
    return result;
}
//# sourceMappingURL=revenue-intelligence.js.map