import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { runBIEngine }          from '../../bi/bi-engine.js';
import { getFleetIntelligence } from '../../bi/fleet-intelligence.js';
import { getRevenueSummary }    from '../../bi/revenue-intelligence.js';
import { getSmartReminders }    from '../../bi/smart-reminders.js';
import { getTikTokIntelligence, generateViralHook } from '../../bi/tiktok-intelligence.js';
import { analyzeWhatsAppMessage, generateAutoResponse } from '../../bi/whatsapp-intelligence.js';
import { redis } from '../../queue/queue.js';
import { supabase } from '../../integrations/supabase.js';
import { getSchedulerStatus } from '../../queue/scheduler.js';

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

// GET /api/bi/reminders — smart reminders, filtered by dismissed
router.get('/reminders', requireMobileAuth, async (req, res) => {
  try {
    const actor = (req as unknown as { mobileActor?: { ownerKey: string } }).mobileActor?.ownerKey ?? 'kouider';
    const dismissedKey = `reminders:dismissed:${actor}`;
    const dismissed = await redis.smembers(dismissedKey).catch(() => []);
    const dismissedSet = new Set(dismissed);

    const all = await getSmartReminders(actor);
    const reminders = all.filter(r => !dismissedSet.has(r.id));
    res.json({ count: reminders.length, reminders });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/bi/reminders/dismiss — dismiss a reminder for 48h
router.post('/reminders/dismiss', requireMobileAuth, async (req, res) => {
  try {
    const { id } = req.body as { id?: string };
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    const actor = (req as unknown as { mobileActor?: { ownerKey: string } }).mobileActor?.ownerKey ?? 'kouider';
    const dismissedKey = `reminders:dismissed:${actor}`;
    await redis.sadd(dismissedKey, id);
    await redis.expire(dismissedKey, 172800); // 48h TTL
    res.json({ ok: true, id });
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

// POST /api/bi/cache/clear — vide le cache revenue + BI immédiatement
router.post('/cache/clear', requireMobileAuth, async (_req, res) => {
  try {
    const hour  = new Date().toISOString().slice(0, 13);
    const biKey = Math.floor(Date.now() / (30 * 60_000));
    const deleted = await redis.del(
      `bi:revenue:${hour}`,
      `bi:full:${biKey}`,
      `bi:fleet:${hour}`,
    );
    console.log(`[bi/cache/clear] deleted ${deleted} keys`);
    res.json({ ok: true, keys_deleted: deleted, message: 'Cache revenue vidé — prochaine requête récupère données fraîches' });
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

// GET /api/bi/heatmap — booking counts per day for last 60 days
router.get('/heatmap', requireMobileAuth, async (_req, res) => {
  try {
    const ago60 = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('bookings')
      .select('start_date')
      .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED'])
      .gte('start_date', ago60);
    if (error) { res.status(500).json({ error: error.message }); return; }
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ start_date: string }>) {
      counts[row.start_date] = (counts[row.start_date] ?? 0) + 1;
    }
    const result = Object.entries(counts).map(([date, count]) => ({ date, count }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bi/health — comprehensive system health check
router.get('/health', requireMobileAuth, async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Redis ping
    const t0 = Date.now();
    let redisOk = false;
    try { await redis.ping(); redisOk = true; } catch { /* */ }
    const redisPingMs = Date.now() - t0;

    // Supabase ping
    const t1 = Date.now();
    let supabaseOk = false;
    try {
      const { error } = await supabase.from('bookings').select('id').limit(1);
      supabaseOk = !error;
    } catch { /* */ }
    const supabasePingMs = Date.now() - t1;

    // Scheduler status
    const scheduler = await getSchedulerStatus().catch(() => null);

    // Claude token stats
    const [callsRaw, tokensInRaw, tokensOutRaw] = await Promise.all([
      redis.get(`claude:calls:${today}`),
      redis.get(`claude:tokens:in:${today}`),
      redis.get(`claude:tokens:out:${today}`),
    ]);

    res.json({
      redis:    { ok: redisOk,    ping_ms: redisPingMs    },
      supabase: { ok: supabaseOk, ping_ms: supabasePingMs },
      scheduler: scheduler ?? { error: 'unavailable' },
      process: {
        uptime_s:  Math.round(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      claude: {
        calls_today:      parseInt(callsRaw    ?? '0', 10),
        tokens_in_today:  parseInt(tokensInRaw  ?? '0', 10),
        tokens_out_today: parseInt(tokensOutRaw ?? '0', 10),
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
