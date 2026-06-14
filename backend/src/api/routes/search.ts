// Recherche globale : véhicules, clients (réservations), biens, dossiers, leads, imports.
import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireMobileAuth, async (req, res) => {
  const q = (req.query['q'] as string | undefined)?.trim();
  if (!q || q.length < 2) { res.json({ results: [] }); return; }
  const like = `%${q}%`;
  type R = { type: string; label: string; sub?: string; ref?: string };
  const out: R[] = [];
  const safe = async (fn: () => Promise<void>) => { try { await fn(); } catch { /* ignore */ } };

  await Promise.all([
    safe(async () => {
      const { data } = await supabase.from('cars').select('name, category').ilike('name', like).limit(8);
      for (const c of data ?? []) out.push({ type: 'Véhicule', label: (c as { name: string }).name, sub: (c as { category?: string }).category ?? '' });
    }),
    safe(async () => {
      const { data } = await supabase.from('bookings').select('client_name, client_phone, start_date, cars(name)').or(`client_name.ilike.${like},client_phone.ilike.${like}`).order('created_at', { ascending: false }).limit(10);
      for (const b of (data ?? []) as Array<{ client_name: string; client_phone?: string; start_date?: string; cars?: { name?: string } }>) out.push({ type: 'Client/Résa', label: b.client_name, sub: [b.cars?.name, b.start_date].filter(Boolean).join(' · ') });
    }),
    safe(async () => {
      const { data } = await supabase.from('properties').select('title, city, transaction').ilike('title', like).limit(8);
      for (const p of (data ?? []) as Array<{ title: string; city?: string; transaction?: string }>) out.push({ type: 'Bien', label: p.title, sub: [p.transaction, p.city].filter(Boolean).join(' · ') });
    }),
    safe(async () => {
      const { data } = await supabase.from('dossiers').select('ref, subject, kind').or(`ref.ilike.${like},subject.ilike.${like},client_name.ilike.${like}`).limit(8);
      for (const d of (data ?? []) as Array<{ ref: string; subject?: string; kind?: string }>) out.push({ type: 'Dossier', label: d.subject || d.kind || 'Dossier', ref: d.ref });
    }),
    safe(async () => {
      const { data } = await supabase.from('import_orders').select('order_ref, vehicle_brand, vehicle_model').or(`order_ref.ilike.${like},client_name.ilike.${like},vehicle_brand.ilike.${like}`).limit(8);
      for (const o of (data ?? []) as Array<{ order_ref: string; vehicle_brand?: string; vehicle_model?: string }>) out.push({ type: 'Import', label: [o.vehicle_brand, o.vehicle_model].filter(Boolean).join(' ') || 'Importation', ref: o.order_ref });
    }),
    safe(async () => {
      const { data } = await supabase.from('client_leads').select('client_name, criteria, category').or(`client_name.ilike.${like},criteria.ilike.${like}`).limit(8);
      for (const l of (data ?? []) as Array<{ client_name: string; criteria?: string; category?: string }>) out.push({ type: 'Lead', label: l.client_name, sub: l.criteria || l.category || '' });
    }),
  ]);

  res.json({ results: out });
});

export default router;
