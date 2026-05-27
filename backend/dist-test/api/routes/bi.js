"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const bi_engine_js_1 = require("../../bi/bi-engine.js");
const fleet_intelligence_js_1 = require("../../bi/fleet-intelligence.js");
const revenue_intelligence_js_1 = require("../../bi/revenue-intelligence.js");
const smart_reminders_js_1 = require("../../bi/smart-reminders.js");
const tiktok_intelligence_js_1 = require("../../bi/tiktok-intelligence.js");
const whatsapp_intelligence_js_1 = require("../../bi/whatsapp-intelligence.js");
const queue_js_1 = require("../../queue/queue.js");
const supabase_js_1 = require("../../integrations/supabase.js");
const scheduler_js_1 = require("../../queue/scheduler.js");
const router = (0, express_1.Router)();
// GET /api/bi/fleet — fleet utilization, occupancy, idle alert
router.get('/fleet', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        res.json(await (0, fleet_intelligence_js_1.getFleetIntelligence)());
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/bi/revenue — CA jour/semaine/mois, marges, clients scorés
router.get('/revenue', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        res.json(await (0, revenue_intelligence_js_1.getRevenueSummary)());
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/bi/reminders — smart reminders (arrivée demain, passeport, acompte, retour)
router.get('/reminders', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const reminders = await (0, smart_reminders_js_1.getSmartReminders)();
        res.json({ count: reminders.length, reminders });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/bi/tiktok — posting windows, viral ideas, virality score
// ?car=Mercedes (optional)
router.get('/tiktok', auth_js_1.requireMobileAuth, async (req, res) => {
    try {
        const car = typeof req.query['car'] === 'string' ? req.query['car'] : undefined;
        res.json(await (0, tiktok_intelligence_js_1.getTikTokIntelligence)(car));
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/bi/tiktok/hook — generate a viral hook for a specific car + style
router.post('/tiktok/hook', auth_js_1.requireMobileAuth, async (req, res) => {
    try {
        const { car_name, style } = req.body;
        if (!car_name) {
            res.status(400).json({ error: 'car_name requis' });
            return;
        }
        const hook = await (0, tiktok_intelligence_js_1.generateViralHook)(car_name, style ?? 'prix');
        res.json({ hook, car_name, style: style ?? 'prix', generated_at: new Date().toISOString() });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/bi/whatsapp/analyze — analyze incoming WhatsApp message
router.post('/whatsapp/analyze', auth_js_1.requireMobileAuth, async (req, res) => {
    try {
        const { text, client_age } = req.body;
        if (!text) {
            res.status(400).json({ error: 'text requis' });
            return;
        }
        const result = await (0, whatsapp_intelligence_js_1.analyzeWhatsAppMessage)(text, client_age);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/bi/whatsapp/response — generate WhatsApp confirmation message
router.post('/whatsapp/response', auth_js_1.requireMobileAuth, async (req, res) => {
    try {
        const booking = req.body;
        if (!booking.client_name || !booking.car_name) {
            res.status(400).json({ error: 'client_name + car_name requis' });
            return;
        }
        const message = await (0, whatsapp_intelligence_js_1.generateAutoResponse)({
            client_name: booking.client_name,
            car_name: booking.car_name,
            start_date: booking.start_date ?? '',
            end_date: booking.end_date ?? '',
            final_price: booking.final_price ?? 0,
        });
        res.json({ message, generated_at: new Date().toISOString() });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/bi/full — full BI report (cached 30min)
// ?telegram=true sends to Telegram
router.get('/full', auth_js_1.requireMobileAuth, async (req, res) => {
    try {
        const telegram = req.query['telegram'] === 'true';
        const report = await (0, bi_engine_js_1.runBIEngine)(telegram);
        res.json({ ok: true, ...report });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/bi/test — full run, bypass cache, send Telegram
router.get('/test', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        // Clear all BI caches
        const hour = Math.floor(Date.now() / (30 * 60_000));
        const today = new Date().toISOString().slice(0, 13);
        await queue_js_1.redis.del(`bi:full:${hour}`, `bi:fleet:${today}`, `bi:revenue:${today}`, `bi:tiktok:${today}`);
        const report = await (0, bi_engine_js_1.runBIEngine)(true);
        res.json({
            ok: true,
            runtime_ms: report.runtime_ms,
            summary: {
                fleet_cars: report.fleet.total_cars,
                available_now: report.fleet.available_now_count,
                occupancy_pct: report.fleet.occupancy_avg_pct,
                revenue_month: report.revenue.month_revenue,
                reminders: report.reminders.length,
                high_priority: report.reminders.filter(r => r.priority === 'HIGH').length,
                tiktok_ideas: report.tiktok.ideas.length,
            },
            fleet: report.fleet,
            revenue: report.revenue,
            reminders: report.reminders,
            tiktok: { best_windows: report.tiktok.best_posting_windows, ideas: report.tiktok.ideas },
            generated_at: report.generated_at,
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/bi/heatmap — booking counts per day for last 60 days
router.get('/heatmap', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const ago60 = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
        const { data, error } = await supabase_js_1.supabase
            .from('bookings')
            .select('start_date')
            .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
            .gte('start_date', ago60);
        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }
        const counts = {};
        for (const row of (data ?? [])) {
            counts[row.start_date] = (counts[row.start_date] ?? 0) + 1;
        }
        const result = Object.entries(counts).map(([date, count]) => ({ date, count }));
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/bi/health — comprehensive system health check
router.get('/health', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        // Redis ping
        const t0 = Date.now();
        let redisOk = false;
        try {
            await queue_js_1.redis.ping();
            redisOk = true;
        }
        catch { /* */ }
        const redisPingMs = Date.now() - t0;
        // Supabase ping
        const t1 = Date.now();
        let supabaseOk = false;
        try {
            const { error } = await supabase_js_1.supabase.from('bookings').select('id').limit(1);
            supabaseOk = !error;
        }
        catch { /* */ }
        const supabasePingMs = Date.now() - t1;
        // Scheduler status
        const scheduler = await (0, scheduler_js_1.getSchedulerStatus)().catch(() => null);
        // Claude token stats
        const [callsRaw, tokensInRaw, tokensOutRaw] = await Promise.all([
            queue_js_1.redis.get(`claude:calls:${today}`),
            queue_js_1.redis.get(`claude:tokens:in:${today}`),
            queue_js_1.redis.get(`claude:tokens:out:${today}`),
        ]);
        res.json({
            redis: { ok: redisOk, ping_ms: redisPingMs },
            supabase: { ok: supabaseOk, ping_ms: supabasePingMs },
            scheduler: scheduler ?? { error: 'unavailable' },
            process: {
                uptime_s: Math.round(process.uptime()),
                memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            },
            claude: {
                calls_today: parseInt(callsRaw ?? '0', 10),
                tokens_in_today: parseInt(tokensInRaw ?? '0', 10),
                tokens_out_today: parseInt(tokensOutRaw ?? '0', 10),
            },
            generated_at: new Date().toISOString(),
        });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=bi.js.map