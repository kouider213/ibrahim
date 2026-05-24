import { redis } from '../queue/queue.js';
import { emitBIRefresh } from './bi-socket.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { getFleetIntelligence,   type FleetIntelligence   } from './fleet-intelligence.js';
import { getRevenueSummary,      type RevenueSummary       } from './revenue-intelligence.js';
import { getSmartReminders,      type SmartReminder        } from './smart-reminders.js';
import { getTikTokIntelligence,  type TikTokIntelligence   } from './tiktok-intelligence.js';

export interface BIReport {
  fleet:     FleetIntelligence;
  revenue:   RevenueSummary;
  reminders: SmartReminder[];
  tiktok:    TikTokIntelligence;
  generated_at: string;
  runtime_ms:   number;
}

function formatBITelegram(report: BIReport): string {
  const { fleet, revenue, reminders } = report;

  const highReminders = reminders.filter(r => r.priority === 'HIGH');

  const lines: string[] = [
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

export async function runBIEngine(forceTelegram = false): Promise<BIReport> {
  const CACHE_KEY = `bi:full:${Math.floor(Date.now() / (30 * 60_000))}`;
  const cached = await redis.get(CACHE_KEY);
  if (cached && !forceTelegram) return JSON.parse(cached) as BIReport;

  const t0 = Date.now();

  const [fleet, revenue, reminders, tiktok] = await Promise.all([
    getFleetIntelligence().catch(err => {
      console.error('[bi:fleet] error:', err.message);
      return { stats: [], total_cars: 0, available_now_count: 0, occupancy_avg_pct: 0, most_profitable: null, idle_vehicles: [], low_fleet_alert: false, generated_at: new Date().toISOString() } as FleetIntelligence;
    }),
    getRevenueSummary().catch(err => {
      console.error('[bi:revenue] error:', err.message);
      return { today_revenue: 0, week_revenue: 0, month_revenue: 0, last_month_revenue: 0, last_month_profit: 0, month_vs_last_pct: 0, kouider_profit_month: 0, houari_revenue_month: 0, missing_owner_price: 0, avg_booking_value: 0, total_bookings_month: 0, rejected_count: 0, rejected_revenue_lost: 0, total_unpaid_receivables: 0, top_clients: [], generated_at: new Date().toISOString() } as RevenueSummary;
    }),
    getSmartReminders().catch(err => {
      console.error('[bi:reminders] error:', err.message);
      return [] as SmartReminder[];
    }),
    getTikTokIntelligence().catch(err => {
      console.error('[bi:tiktok] error:', err.message);
      return { best_posting_windows: [], ideas: [], apify_available: false, generated_at: new Date().toISOString() } as TikTokIntelligence;
    }),
  ]);

  const report: BIReport = {
    fleet, revenue, reminders, tiktok,
    generated_at: new Date().toISOString(),
    runtime_ms:   Date.now() - t0,
  };

  await redis.set(CACHE_KEY, JSON.stringify(report), 'EX', 1800);
  emitBIRefresh('full');

  if (forceTelegram) {
    const msg = formatBITelegram(report);
    const clean = msg.replace(/\*/g, '').replace(/_/g, '').trim();
    const highAlerts = reminders.filter(r => r.priority === 'HIGH');
    const shortMsg = highAlerts.length > 0
      ? `🔴 ${highAlerts.length} alerte(s) urgente(s) — ${fleet.total_cars} voitures / ${revenue.month_revenue}€`
      : `📊 BI — ${fleet.total_cars} voitures / ${revenue.month_revenue}€ ce mois`;
    emitProactive(shortMsg, highAlerts.length > 0 ? 'alert' : 'info', clean, 'kouider');
  }

  console.log(`[bi-engine] Done in ${report.runtime_ms}ms — fleet:${fleet.total_cars} revenue:${revenue.month_revenue}€ reminders:${reminders.length} tiktok:${tiktok.ideas.length}`);
  return report;
}
