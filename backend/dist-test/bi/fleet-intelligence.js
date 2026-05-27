"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFleetIntelligence = getFleetIntelligence;
const supabase_js_1 = require("../integrations/supabase.js");
const queue_js_1 = require("../queue/queue.js");
async function getFleetIntelligence() {
    const CACHE_KEY = `bi:fleet:${new Date().toISOString().slice(0, 13)}`;
    const cached = await queue_js_1.redis.get(CACHE_KEY);
    if (cached)
        return JSON.parse(cached);
    const today = new Date().toISOString().slice(0, 10);
    const ago30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const in7days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const { data: carsRaw } = await supabase_js_1.supabase
        .from('cars').select('id, name, base_price, resale_price, available');
    const cars = (carsRaw ?? []);
    const { data: bookingsRaw } = await supabase_js_1.supabase
        .from('bookings')
        .select('car_id, start_date, end_date, final_price, status')
        .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
        .gte('start_date', ago30);
    const bookings = (bookingsRaw ?? []);
    // Active bookings today
    const { data: activeRaw } = await supabase_js_1.supabase
        .from('bookings')
        .select('car_id')
        .in('status', ['CONFIRMED', 'ACTIVE'])
        .lte('start_date', today)
        .gte('end_date', today);
    const activeCars = new Set((activeRaw ?? []).map((b) => b.car_id));
    // Future bookings (next 7 days) per car — for next_free_date
    const { data: futureRaw } = await supabase_js_1.supabase
        .from('bookings')
        .select('car_id, start_date, end_date')
        .in('status', ['CONFIRMED', 'ACTIVE'])
        .gte('start_date', today)
        .lte('start_date', in7days);
    const futureBycar = {};
    for (const fb of (futureRaw ?? [])) {
        (futureBycar[fb.car_id] ??= []).push(fb.end_date);
    }
    const stats = cars.map(car => {
        const carBks = bookings.filter(b => b.car_id === car.id);
        const revenue_30d = carBks.reduce((s, b) => s + (b.final_price ?? 0), 0);
        // Count occupied days (sum of booking durations capped to 30-day window)
        let occupied = 0;
        for (const b of carBks) {
            const s = new Date(Math.max(new Date(b.start_date).getTime(), new Date(ago30).getTime()));
            const e = new Date(Math.min(new Date(b.end_date).getTime(), new Date(today).getTime()));
            const days = Math.max(0, Math.ceil((e.getTime() - s.getTime()) / 86_400_000));
            occupied += days;
        }
        const sortedEnds = (futureBycar[car.id] ?? []).sort();
        const next_free_date = sortedEnds.length ? sortedEnds[sortedEnds.length - 1] : null;
        const lastBk = carBks.sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
        return {
            car_id: car.id,
            car_name: car.name,
            base_price: car.base_price,
            resale_price: car.resale_price,
            total_bookings_30d: carBks.length,
            revenue_30d,
            occupied_days_30d: Math.min(occupied, 30),
            occupancy_pct: Math.round((Math.min(occupied, 30) / 30) * 100),
            last_booked: lastBk?.start_date ?? null,
            next_free_date,
            available_now: !activeCars.has(car.id),
        };
    });
    const sortedByRevenue = [...stats].sort((a, b) => b.revenue_30d - a.revenue_30d);
    const available_now_count = stats.filter(s => s.available_now).length;
    const idleThreshold = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const idle_vehicles = stats
        .filter(s => !s.last_booked || s.last_booked < idleThreshold)
        .map(s => s.car_name);
    // Low fleet alert: < 2 cars free in next 7 days
    const freeInWeek = stats.filter(s => s.available_now && !s.next_free_date);
    const low_fleet_alert = freeInWeek.length < 2;
    const result = {
        stats,
        total_cars: cars.length,
        available_now_count,
        occupancy_avg_pct: stats.length ? Math.round(stats.reduce((s, c) => s + c.occupancy_pct, 0) / stats.length) : 0,
        most_profitable: sortedByRevenue[0]?.car_name ?? null,
        idle_vehicles,
        low_fleet_alert,
        generated_at: new Date().toISOString(),
    };
    await queue_js_1.redis.set(CACHE_KEY, JSON.stringify(result), 'EX', 1800);
    return result;
}
//# sourceMappingURL=fleet-intelligence.js.map