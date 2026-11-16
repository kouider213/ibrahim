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
      .filter(x => x.due > 0 && (x.b.payment_status ?? '').toLowerCase() !== 'paid')
      .map(x => ({ id: x.b.id, client: x.b.client_name, phone: x.b.client_phone, car: x.b.cars?.name ?? '—', due: Math.round(x.due) }));
    const pendingBookings = rows.filter(b => b.status === 'PENDING').length;

    // Demandes site récentes (24h)
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const safeCount = async (table: string) => { try { const { count } = await supabase.from(table).select('*', { count: 'exact', head: true }).gte('created_at', since); return count ?? 0; } catch { return 0; } };
    const [leads, dossiers, imports] = await Promise.all([safeCount('client_leads'), safeCount('dossiers'), safeCount('import_orders')]);

    res.json({ date: today, departures, returns, toCollect, newDemands: pendingBookings + leads + dossiers + imports, pendingBookings, recent: { leads, dossiers, imports } });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /api/insights/me — carte « Toi » + « Ta semaine » (page Aujourd'hui)
router.get('/me', requireMobileAuth, async (_req, res) => {
  try { res.json(await (await import('../../integrations/me-week.js')).meCard()); } catch (e) { res.status(500).json({ error: (e as Error).message }); }
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

// ── 16/11 : campagne diaspora (Kouider : « mes clients vivent en Europe, les voitures sont en Algérie, ils louent
// seulement quand ils descendent ») → on vise les PROCHAINS VOYAGES (vacances scolaires FR/BE, Aïd, été), pas « cette semaine ».
// Dates d'Aïd = estimations (calendrier lunaire, ± 1 jour). Canaux : anciens clients (WhatsApp, 1 appui chacun) + leur famille
// (code parrain dans le message) + nouveaux clients (bandeau du site + légende TikTok — pubs = TikTok seulement).
const WAVES = [
  { id: 'noel26',  name: 'Fêtes de fin d\'année', short: 'les fêtes', from: '2026-12-19', to: '2027-01-03', note: 'vacances scolaires France et Belgique' },
  { id: 'fitr27',  name: 'Aïd el-Fitr', short: 'l\'Aïd', from: '2027-03-05', to: '2027-03-15', note: 'date estimée (≈ 10 mars), fin du Ramadan' },
  { id: 'paq27',   name: 'Vacances de printemps', short: 'les vacances de printemps', from: '2027-04-03', to: '2027-05-09', note: 'Pâques Belgique + zones France, étalées' },
  { id: 'adha27',  name: 'Aïd el-Adha', short: 'l\'Aïd el-Kebir', from: '2027-05-13', to: '2027-05-23', note: 'date estimée (≈ 16-17 mai)' },
  { id: 'ete27',   name: 'Été', short: 'l\'été', from: '2027-07-03', to: '2027-08-31', note: 'le gros de la saison diaspora' },
];
const BUSY = [...CONFIRMED, 'PENDING'];
/** Numéro au format international sans + (wa.me) : 0033… → 33…, 06/07/05 algérien → 213…, +32 4… → 324… */
function intlPhone(raw: string | null): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  else if (/^04\d{8}$/.test(d)) d = '32' + d.slice(1);          // 04xx xx xx xx = portable belge
  else if (/^0[567]\d{8}$/.test(d)) d = '213' + d.slice(1);     // 05/06/07 : numéro local d'Oran (les voitures sont là-bas)
  else if (d.startsWith('0')) return null;                        // 0… sans indicatif : impossible de savoir le pays
  // Garde-fou : indicatif connu + bonne longueur (des fiches ont « 1340101104104 », « 010401040134 »)
  const ok = /^33[67]\d{8}$/.test(d) || /^324\d{8}$/.test(d) || /^213[567]\d{8}$/.test(d) || /^44\d{10}$/.test(d) || /^49\d{10,11}$/.test(d)
    || /^34[67]\d{8}$/.test(d) || /^1\d{10}$/.test(d) || /^41\d{9}$/.test(d) || /^31\d{9}$/.test(d) || /^39\d{9,10}$/.test(d);
  return ok ? d : null;
}
const country = (p: string) => p.startsWith('33') ? 'France' : p.startsWith('32') ? 'Belgique' : p.startsWith('213') ? 'Algérie' : p.startsWith('44') ? 'Royaume-Uni' : p.startsWith('49') ? 'Allemagne' : p.startsWith('34') ? 'Espagne' : p.startsWith('1') ? 'Canada' : '';

router.get('/waves', requireMobileAuth, async (_req, res) => {
  try {
    const today = ymd(new Date());
    const [{ data: cars }, { data: bk }, { data: refs }, { data: site }] = await Promise.all([
      supabase.from('cars').select('id, name, resale_price, available, image_url').eq('available', true),
      supabase.from('bookings').select('car_id, client_name, client_phone, client_lang, status, start_date, end_date').order('start_date', { ascending: false }).limit(1500),
      supabase.from('referrals').select('code, referrer_phone, uses').limit(500),
      supabase.from('site_settings').select('announcement').eq('id', 1).maybeSingle(),
    ]);
    const C = (cars ?? []) as Array<{ id: string; name: string; resale_price: number | null; image_url: string | null }>;
    const Bk = (bk ?? []) as Array<{ car_id: string; client_name: string; client_phone: string | null; client_lang: string | null; status: string; start_date: string; end_date: string }>;
    const waves = WAVES.filter(w => w.to >= today).slice(0, 4).map(w => {
      const taken = new Set(Bk.filter(b => BUSY.includes(b.status) && b.start_date <= w.to && b.end_date >= w.from).map(b => b.car_id));
      // Même période l'an dernier (± les mêmes dates, 1 an avant) : combien de locations ?
      const ly = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
      const lastYear = Bk.filter(b => CONFIRMED.includes(b.status) && b.start_date <= ly(w.to) && b.end_date >= ly(w.from)).length;
      const days = Math.round((Date.parse(w.from) - Date.parse(today)) / 86_400_000);
      // Réserver tôt : la diaspora prend ses billets 1 à 2 mois avant → offre valable jusqu'à 3 semaines avant le départ
      const deadline = new Date(Date.parse(w.from) - 21 * 86_400_000).toISOString().slice(0, 10);
      return { ...w, days, deadline: deadline > today ? deadline : null, cars: C.length, booked: taken.size, lastYear,
        free: C.filter(c => !taken.has(c.id)).map(c => ({ id: c.id, name: c.name, price: c.resale_price, img: c.image_url })) };
    });
    // Anciens clients (location confirmée) joignables sur WhatsApp
    const byPhone = new Map<string, { name: string; phone: string; lang: string; trips: number; last: string; months: number[]; country: string; code: string | null }>();
    const refBy = new Map(((refs ?? []) as Array<{ code: string; referrer_phone: string | null }>).filter(r => r.referrer_phone).map(r => [intlPhone(r.referrer_phone), r.code]));
    for (const b of Bk.filter(x => CONFIRMED.includes(x.status))) {
      const ph = intlPhone(b.client_phone); if (!ph) continue;
      const cur = byPhone.get(ph);
      const m = Number(b.start_date.slice(5, 7));
      if (!cur) byPhone.set(ph, { name: b.client_name, phone: ph, lang: b.client_lang || 'fr', trips: 1, last: b.start_date, months: [m], country: country(ph), code: refBy.get(ph) ?? null });
      else { cur.trips++; cur.months.push(m); if (b.start_date > cur.last) cur.last = b.start_date; }
    }
    // Ceux qui sont DÉJÀ réservés pour la prochaine vague ne reçoivent rien
    const next = waves[0];
    const already = new Set(next ? Bk.filter(b => BUSY.includes(b.status) && b.start_date <= next.to && b.end_date >= next.from).map(b => intlPhone(b.client_phone)).filter(Boolean) : []);
    const clients = [...byPhone.values()].filter(c => !already.has(c.phone)).sort((a, b) => b.trips - a.trips || b.last.localeCompare(a.last));
    res.json({ today, waves, clients, unreachable: Bk.filter(x => CONFIRMED.includes(x.status) && !intlPhone(x.client_phone)).length, announcement: (site as { announcement?: string } | null)?.announcement ?? '' });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// POST /api/insights/waves/announce { text } — bandeau en haut de fikconciergerie.com (texte vide = retiré)
router.post('/waves/announce', requireMobileAuth, async (req, res) => {
  try {
    const text = String((req.body as { text?: string } | undefined)?.text ?? '').trim().slice(0, 220);
    const { error } = await supabase.from('site_settings').update({ announcement: text, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) throw new Error(error.message);
    res.json({ ok: true, announcement: text });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

export default router;
