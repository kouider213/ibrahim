"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBIEngine = runBIEngine;
const queue_js_1 = require("../queue/queue.js");
const bi_socket_js_1 = require("./bi-socket.js");
const telegram_js_1 = require("../integrations/telegram.js");
const pushover_js_1 = require("../notifications/pushover.js");
const env_js_1 = require("../config/env.js");
const fleet_intelligence_js_1 = require("./fleet-intelligence.js");
const revenue_intelligence_js_1 = require("./revenue-intelligence.js");
const smart_reminders_js_1 = require("./smart-reminders.js");
const tiktok_intelligence_js_1 = require("./tiktok-intelligence.js");
function ownerChatId() {
    return env_js_1.env.TELEGRAM_CHAT_ID ?? '809747124';
}
function formatBITelegram(report) {
    const { fleet, revenue, reminders } = report;
    const highReminders = reminders.filter(r => r.priority === 'HIGH');
    const lines = [
        `📊 *Business Intelligence — Fik Conciergerie*`,
        `_${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}_`,
        ``,
        `🚗 *FLOTTE (${fleet.total_cars} véhicules)*`,
        `• Dispo maintenant : ${fleet.available_now_count}/${fleet.total_cars}`,
        `• Occupation 30j : ${fleet.occupancy_avg_pct}%`,
        fleet.most_profitable ? `• + rentable : ${fleet.most_profitable}` : '',
        fleet.idle_vehicles.length ? `• ⚠️ Inactifs >7j : ${fleet.idle_vehicles.join(', ')}` : '• ✅ Flotte active',
        fleet.low_fleet_alert ? `• 🔴 ALERTE : flotte faible` : '',
        ``,
        `💰 *REVENUS*`,
        `• Aujourd'hui : ${revenue.today_revenue.toLocaleString('fr-FR')}€`,
        `• Cette semaine : ${revenue.week_revenue.toLocaleString('fr-FR')}€`,
        `• Ce mois : ${revenue.month_revenue.toLocaleString('fr-FR')}€`,
        revenue.kouider_profit_month ? `• Profit Kouider : ${revenue.kouider_profit_month.toLocaleString('fr-FR')}€` : '',
        revenue.rejected_count ? `• Pertes (refus) : ${revenue.rejected_revenue_lost.toLocaleString('fr-FR')}€ (${revenue.rejected_count} rés.)` : '',
        ``,
        `⚡ *ALERTES (${reminders.length} total — ${highReminders.length} urgentes)*`,
        ...highReminders.slice(0, 3).map(r => `• 🔴 ${r.message}`),
        reminders.filter(r => r.priority === 'MEDIUM').length ?
            `• 🟡 ${reminders.filter(r => r.priority === 'MEDIUM').length} rappel(s) à traiter` : '',
        reminders.length === 0 ? '• ✅ Aucune alerte' : '',
        ``,
        `📱 *TIKTOK*`,
        `• Meilleur moment : ${report.tiktok.best_posting_windows[0]?.day} ${report.tiktok.best_posting_windows[0]?.time}`,
        report.tiktok.ideas[0] ? `• Idée #1 : ${report.tiktok.ideas[0].hook}` : '',
    ];
    return lines.filter(l => l !== '').join('\n');
}
async function runBIEngine(forceTelegram = false) {
    const CACHE_KEY = `bi:full:${Math.floor(Date.now() / (30 * 60_000))}`;
    const cached = await queue_js_1.redis.get(CACHE_KEY);
    if (cached && !forceTelegram)
        return JSON.parse(cached);
    const t0 = Date.now();
    const [fleet, revenue, reminders, tiktok] = await Promise.all([
        (0, fleet_intelligence_js_1.getFleetIntelligence)().catch(err => {
            console.error('[bi:fleet] error:', err.message);
            return { stats: [], total_cars: 0, available_now_count: 0, occupancy_avg_pct: 0, most_profitable: null, idle_vehicles: [], low_fleet_alert: false, generated_at: new Date().toISOString() };
        }),
        (0, revenue_intelligence_js_1.getRevenueSummary)().catch(err => {
            console.error('[bi:revenue] error:', err.message);
            return { today_revenue: 0, week_revenue: 0, month_revenue: 0, kouider_profit_month: 0, houari_revenue_month: 0, missing_owner_price: 0, avg_booking_value: 0, total_bookings_month: 0, rejected_count: 0, rejected_revenue_lost: 0, top_clients: [], generated_at: new Date().toISOString() };
        }),
        (0, smart_reminders_js_1.getSmartReminders)().catch(err => {
            console.error('[bi:reminders] error:', err.message);
            return [];
        }),
        (0, tiktok_intelligence_js_1.getTikTokIntelligence)().catch(err => {
            console.error('[bi:tiktok] error:', err.message);
            return { best_posting_windows: [], ideas: [], apify_available: false, generated_at: new Date().toISOString() };
        }),
    ]);
    const report = {
        fleet, revenue, reminders, tiktok,
        generated_at: new Date().toISOString(),
        runtime_ms: Date.now() - t0,
    };
    await queue_js_1.redis.set(CACHE_KEY, JSON.stringify(report), 'EX', 1800);
    (0, bi_socket_js_1.emitBIRefresh)('full');
    if (forceTelegram && env_js_1.env.TELEGRAM_CHAT_ID) {
        const msg = formatBITelegram(report);
        await (0, telegram_js_1.sendMessage)(ownerChatId(), msg).catch(err => console.error('[bi] Telegram error:', err.message));
        // Pushover for HIGH priority reminders
        const highAlerts = reminders.filter(r => r.priority === 'HIGH');
        if (highAlerts.length > 0) {
            await (0, pushover_js_1.notifyOwner)(`🔴 ${highAlerts.length} alerte(s) urgente(s)`, highAlerts.slice(0, 3).map(r => r.message).join(' | '), true).catch(() => { });
        }
    }
    console.log(`[bi-engine] Done in ${report.runtime_ms}ms — fleet:${fleet.total_cars} revenue:${revenue.month_revenue}€ reminders:${reminders.length} tiktok:${tiktok.ideas.length}`);
    return report;
}
//# sourceMappingURL=bi-engine.js.map