// Demandes du site agrégées pour l'app Dzaryx : leads + dossiers + importations + réservations en attente.
// Même base Supabase que le site → tout ce qui arrive sur le site apparaît dans l'app.
import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

type Demande = {
  id: string; source: 'lead' | 'dossier' | 'import' | 'booking';
  ref?: string; title: string; client_name?: string; client_phone?: string;
  client_email?: string; status?: string; lang?: string; created_at?: string;
  meta?: string; admin_path: string; kind?: string;
};

router.get('/', requireMobileAuth, async (_req, res) => {
  const out: Demande[] = [];

  const safe = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.warn('[demandes]', (e as Error).message); } };

  await Promise.all([
    safe(async () => {
      const { data } = await supabase.from('client_leads')
        .select('id, client_name, client_phone, client_email, category, criteria, budget_max, currency, status, lang, created_at')
        .order('created_at', { ascending: false }).limit(120);
      for (const l of data ?? []) out.push({
        id: 'lead-' + l.id, source: 'lead', title: l.criteria || l.category || 'Lead',
        client_name: l.client_name, client_phone: l.client_phone, client_email: l.client_email,
        status: l.status, lang: l.lang, created_at: l.created_at,
        meta: [l.category, l.budget_max ? `${l.budget_max} ${l.currency || ''}` : ''].filter(Boolean).join(' · '),
        admin_path: '/admin/leads',
      });
    }),
    safe(async () => {
      const { data } = await supabase.from('dossiers')
        .select('id, ref, kind, status, client_name, client_phone, client_email, subject, budget, currency, lang, created_at')
        .order('created_at', { ascending: false }).limit(120);
      for (const d of data ?? []) out.push({
        id: 'dossier-' + d.id, source: 'dossier', ref: d.ref, title: d.subject || d.kind, kind: d.kind,
        client_name: d.client_name, client_phone: d.client_phone, client_email: d.client_email,
        status: d.status, lang: d.lang, created_at: d.created_at,
        meta: [d.kind, d.budget ? `${d.budget} ${d.currency || ''}` : ''].filter(Boolean).join(' · '),
        admin_path: '/admin/dossiers',
      });
    }),
    safe(async () => {
      const { data } = await supabase.from('import_orders')
        .select('id, order_ref, status, client_name, client_phone, client_email, vehicle_brand, vehicle_model, vehicle_year, budget, currency, lang, created_at')
        .order('created_at', { ascending: false }).limit(120);
      for (const o of data ?? []) out.push({
        id: 'import-' + o.id, source: 'import', ref: o.order_ref,
        title: [o.vehicle_brand, o.vehicle_model, o.vehicle_year].filter(Boolean).join(' ') || 'Importation',
        client_name: o.client_name, client_phone: o.client_phone, client_email: o.client_email,
        status: o.status, lang: o.lang, created_at: o.created_at,
        meta: o.budget ? `${o.budget} ${o.currency || ''}` : '',
        admin_path: '/admin/import',
      });
    }),
    safe(async () => {
      const { data } = await supabase.from('bookings')
        .select('id, client_name, client_phone, client_email, status, start_date, end_date, final_price, currency, client_lang, created_at, cars(name)')
        .eq('status', 'PENDING').order('created_at', { ascending: false }).limit(60);
      for (const b of (data ?? []) as Array<Record<string, unknown> & { cars?: { name?: string } }>) out.push({
        id: 'booking-' + b.id, source: 'booking',
        title: (b.cars?.name as string) || 'Réservation',
        client_name: b.client_name as string, client_phone: b.client_phone as string, client_email: b.client_email as string,
        status: b.status as string, lang: b.client_lang as string, created_at: b.created_at as string,
        meta: [b.start_date, b.end_date].filter(Boolean).join(' → ') + (b.final_price ? ` · ${b.final_price} ${b.currency || '€'}` : ''),
        admin_path: '/admin/bookings',
      });
    }),
  ]);

  out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const counts = {
    total: out.length,
    lead: out.filter(d => d.source === 'lead').length,
    dossier: out.filter(d => d.source === 'dossier').length,
    import: out.filter(d => d.source === 'import').length,
    booking: out.filter(d => d.source === 'booking').length,
  };

  res.json({ demandes: out, counts });
});

// POST /api/demandes/update — change le statut d'une demande DEPUIS l'app.
// Proxy serveur→serveur vers les APIs du site (déclenche email/WhatsApp auto) — pas de CORS.
const SITE = process.env['FIK_SITE_URL'] || 'https://fikconciergerie.com';

router.post('/update', requireMobileAuth, async (req, res) => {
  const { source, id, status } = (req.body ?? {}) as { source?: string; id?: string; status?: string };
  if (!source || !id || !status) { res.status(400).json({ error: 'source + id + status requis' }); return; }

  try {
    if (source === 'booking') {
      const r = await fetch(`${SITE}/api/update-booking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: id, patch: { status } }),
      });
      if (!r.ok) throw new Error(`site update-booking ${r.status}`);
    } else if (source === 'dossier') {
      const r = await fetch(`${SITE}/api/update-dossier`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, patch: { status } }),
      });
      if (!r.ok) throw new Error(`site update-dossier ${r.status}`);
    } else if (source === 'import') {
      const r = await fetch(`${SITE}/api/update-import-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, patch: { status } }),
      });
      if (!r.ok) throw new Error(`site update-import-order ${r.status}`);
    } else if (source === 'lead') {
      const { error } = await supabase.from('client_leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      res.status(400).json({ error: 'source inconnue' }); return;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
