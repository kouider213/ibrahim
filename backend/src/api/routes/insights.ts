// Insights métier (lecture, calcul sur les données existantes) :
//  - /today      : command center du matin (départs, retours, à encaisser, demandes)
//  - /forecast   : prévision saison (pics diaspora à partir de l'historique)
//  - /reengage   : clients dormants à relancer (CRM lifecycle)
import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const CONFIRMED = ['ACCEPTED', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'accepted', 'confirmed', 'active', 'completed'];

type B = {
  id: string; client_name: string; client_phone: string | null; status: string;
  start_date: string; end_date: string; final_price: number | null; paid_amount: number | null;
  payment_status: string | null; created_at: string; cars?: { name?: string } | null;
};

async function allBookings(): Promise<B[]> {
  const { data } = await supabase
    .from('bookings')
    .select('id, client_name, client_phone, status, start_date, end_date, final_price, paid_amount, payment_status, created_at, cars(name)')
    .order('start_date', { ascending: false })
    .limit(1500);
  return (data ?? []) as B[];
}

// GET /api/insights/today
router.get('/today', requireMobileAuth, async (_req, res) => {
  try {
    const today = ymd(new Date());
    const rows = await allBookings();
    const conf = rows.filter(b => CONFIRMED.includes(b.status));
    const departures = conf.filter(b => b.start_date === today).map(b => ({ id: b.id, client: b.client_name, phone: b.client_phone, car: b.cars?.name ?? '—' }));
    const returns    = conf.filter(b => b.end_date === today).map(b => ({ id: b.id, client: b.client_name, phone: b.client_phone, car: b.cars?.name ?? '—' }));
    const toCollect  = conf
      .map(b => ({ b, due: (b.final_price ?? 0) - (b.paid_amount ?? 0) }))
      .filter(x => x.due > 0 && (x.b.payment_status ?? '') !== 'paid')
      .map(x => ({ id: x.b.id, client: x.b.client_name, phone: x.b.client_phone, car: x.b.cars?.name ?? '—', due: Math.round(x.due) }));
    const pendingBookings = rows.filter(b => b.status === 'PENDING').length;

    // Demandes site récentes (24h)
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const safeCount = async (table: string) => { try { const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).gte('created_at', since); return count ?? 0; } catch { return 0; } };
    const [leads, dossiers, imports] = await Promise.all([safeCount('client_leads'), safeCount('dossiers'), safeCount('import_orders')]);

    res.json({ date: today, departures, returns, toCollect, newDemands: pendingBookings + leads + dossiers + imports, pendingBookings, recent: { leads, dossiers, imports } });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /api/insights/forecast
router.get('/forecast', requireMobileAuth, async (_req, res) => {
  try {
    const rows = (await allBookings()).filter(b => CONFIRMED.includes(b.status));
    const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const byMonth = new Array(12).fill(0) as number[];
    for (const b of rows) { const m = new Date(b.start_date).getMonth(); if (m >= 0 && m <= 11) byMonth[m]++; }
    const max = Math.max(1, ...byMonth);
    const ranked = byMonth.map((n, i) => ({ month: MONTHS[i], idx: i, count: n, pct: Math.round((n / max) * 100) }))
      .sort((a, b) => b.count - a.count);
    const peaks = ranked.filter(r => r.count > 0).slice(0, 3).map(r => r.month);
    // Saison diaspora connue : été (Juin-Sep) + tendance fêtes
    const now = new Date().getMonth();
    const next3 = [0, 1, 2].map(k => MONTHS[(now + k) % 12]);
    const summerSoon = [4, 5, 6].includes(now); // mai/juin/juil → préparer l'été
    res.json({ byMonth: MONTHS.map((m, i) => ({ month: m, count: byMonth[i], pct: Math.round((byMonth[i] / max) * 100) })), peaks, next3, summerSoon, total: rows.length });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /api/insights/reengage?months=4
router.get('/reengage', requireMobileAuth, async (req, res) => {
  try {
    const months = Math.max(1, Number(req.query['months'] ?? 4));
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - months);
    const rows = (await allBookings()).filter(b => CONFIRMED.includes(b.status));
    // Dernière résa par client (par téléphone, fallback nom)
    const last = new Map<string, { name: string; phone: string | null; date: string; car: string; count: number }>();
    for (const b of rows) {
      const key = b.client_phone || b.client_name;
      const cur = last.get(key);
      if (!cur) last.set(key, { name: b.client_name, phone: b.client_phone, date: b.end_date || b.start_date, car: b.cars?.name ?? '—', count: 1 });
      else { cur.count++; if ((b.end_date || b.start_date) > cur.date) { cur.date = b.end_date || b.start_date; cur.car = b.cars?.name ?? cur.car; } }
    }
    const dormant = [...last.values()]
      .filter(c => c.date < ymd(cutoff))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100);
    res.json({ months, dormant });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

export default router;
