import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { runBIEngine }          from '../../bi/bi-engine.js';
import { getFleetIntelligence } from '../../bi/fleet-intelligence.js';
import { getRevenueSummary }    from '../../bi/revenue-intelligence.js';
import { getSmartReminders }    from '../../bi/smart-reminders.js';
import { getTikTokIntelligence, generateViralHook } from '../../bi/tiktok-intelligence.js';
import { analyzeWhatsAppMessage, generateAutoResponse } from '../../bi/whatsapp-intelligence.js';
import { redis } from '../../queue/queue.js';

const router = Router();

// GET /api/bi/fleet — fleet utilization, occupancy, idle alert
router.get('/fleet', requireMobileAuth, async (_req, res) => {
  try {
    res.json(await getFleetIntelligence());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bi/revenue — CA jour/semaine/mois, marges, clients scorés
router.get('/revenue', requireMobileAuth, async (_req, res) => {
  try {
    res.json(await getRevenueSummary());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bi/reminders — smart reminders (arrivée demain, passeport, acompte, retour)
router.get('/reminders', requireMobileAuth, async (_req, res) => {
  try {
    const reminders = await getSmartReminders();
    res.json({ count: reminders.length, reminders });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bi/tiktok — posting windows, viral ideas, virality score
// ?car=Mercedes (optional)
router.get('/tiktok', requireMobileAuth, async (req, res) => {
  try {
    const car = typeof req.query['car'] === 'string' ? req.query['car'] : undefined;
    res.json(await getTikTokIntelligence(car));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/bi/tiktok/hook — generate a viral hook for a specific car + style
router.post('/tiktok/hook', requireMobileAuth, async (req, res) => {
  try {
    const { car_name, style } = req.body as { car_name?: string; style?: 'lifestyle' | 'prix' | 'temoignage' };
    if (!car_name) { res.status(400).json({ error: 'car_name requis' }); return; }
    const hook = await generateViralHook(car_name, style ?? 'prix');
    res.json({ hook, car_name, style: style ?? 'prix', generated_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/bi/whatsapp/analyze — analyze incoming WhatsApp message
router.post('/whatsapp/analyze', requireMobileAuth, async (req, res) => {
  try {
    const { text, client_age } = req.body as { text?: string; client_age?: number };
    if (!text) { res.status(400).json({ error: 'text requis' }); return; }
    const result = await analyzeWhatsAppMessage(text, client_age);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/bi/whatsapp/response — generate WhatsApp confirmation message
router.post('/whatsapp/response', requireMobileAuth, async (req, res) => {
  try {
    const booking = req.body as { client_name?: string; car_name?: string; start_date?: string; end_date?: string; final_price?: number };
    if (!booking.client_name || !booking.car_name) {
      res.status(400).json({ error: 'client_name + car_name requis' }); return;
    }
    const message = await generateAutoResponse({
      client_name: booking.client_name,
      car_name:    booking.car_name,
      start_date:  booking.start_date  ?? '',
      end_date:    booking.end_date    ?? '',
      final_price: booking.final_price ?? 0,
    });
    res.json({ message, generated_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bi/full — full BI report (cached 30min)
// ?telegram=true sends to Telegram
router.get('/full', requireMobileAuth, async (req, res) => {
  try {
    const telegram = req.query['telegram'] === 'true';
    const report = await runBIEngine(telegram);
    res.json({ ok: true, ...report });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bi/test — full run, bypass cache, send Telegram
router.get('/test', requireMobileAuth, async (_req, res) => {
  try {
    // Clear all BI caches
    const hour = Math.floor(Date.now() / (30 * 60_000));
    const today = new Date().toISOString().slice(0, 13);
    await redis.del(
      `bi:full:${hour}`,
      `bi:fleet:${today}`,
      `bi:revenue:${today}`,
      `bi:tiktok:${today}`,
    );
    const report = await runBIEngine(true);
    res.json({
      ok:         true,
      runtime_ms: report.runtime_ms,
      summary: {
        fleet_cars:    report.fleet.total_cars,
        available_now: report.fleet.available_now_count,
        occupancy_pct: report.fleet.occupancy_avg_pct,
        revenue_month: report.revenue.month_revenue,
        reminders:     report.reminders.length,
        high_priority: report.reminders.filter(r => r.priority === 'HIGH').length,
        tiktok_ideas:  report.tiktok.ideas.length,
      },
      fleet:     report.fleet,
      revenue:   report.revenue,
      reminders: report.reminders,
      tiktok:    { best_windows: report.tiktok.best_posting_windows, ideas: report.tiktok.ideas },
      generated_at: report.generated_at,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
