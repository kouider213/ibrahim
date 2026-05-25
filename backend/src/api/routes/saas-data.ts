import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSaasAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import { sendSaasWhatsApp, validateTwilioCredentials } from '../../integrations/saas-whatsapp.js';
import { listOrgCalendarEvents, createOrgCalendarEvent, deleteOrgCalendarEvent } from '../../integrations/saas-calendar.js';

const router = Router();
router.use(requireSaasAuth);

// ── Bookings ──────────────────────────────────────────────────────

const bookingSchema = z.object({
  customer_name:  z.string().min(1).max(200),
  customer_phone: z.string().max(50).optional(),
  customer_email: z.string().email().optional().or(z.literal('')),
  item_name:      z.string().max(200).optional(),
  item_id:        z.string().uuid().optional(),
  start_date:     z.string().min(1),
  end_date:       z.string().optional(),
  notes:          z.string().max(2000).optional(),
  amount:         z.number().positive().optional(),
  currency:       z.string().length(3).optional(),
  guests:         z.number().int().positive().optional(),
  status:         z.enum(['confirmed', 'pending', 'cancelled', 'completed']).optional(),
});

router.get('/bookings', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const { status, date, limit, order } = req.query;
  const ascending = order === 'asc';

  let query = supabase
    .from('saas_bookings')
    .select('*')
    .eq('org_id', orgId)
    .order('start_date', { ascending })
    .limit(Number(limit ?? 50));

  if (status) query = query.eq('status', status as string);
  if (date) {
    const d = new Date(date as string);
    const s = new Date(d); s.setHours(0, 0, 0, 0);
    const e = new Date(d); e.setHours(23, 59, 59, 999);
    query = query.gte('start_date', s.toISOString()).lte('start_date', e.toISOString());
  }

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post('/bookings', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message }); return; }

  // Clean empty strings
  const payload = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== '' && v !== undefined)
  );

  const { data, error } = await supabase
    .from('saas_bookings')
    .insert({ ...payload, org_id: orgId })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch('/bookings/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const { id } = req.params;

  const { data, error } = await supabase
    .from('saas_bookings')
    .update({ ...req.body, updated_at: new Date().toISOString() })
    .eq('id', id).eq('org_id', orgId)
    .select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.delete('/bookings/:id', async (req: Request, res: Response): Promise<void> => {
  const { error } = await supabase
    .from('saas_bookings')
    .delete()
    .eq('id', req.params.id).eq('org_id', req.saasActor!.orgId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// ── Items ─────────────────────────────────────────────────────────

const itemSchema = z.object({
  name:           z.string().min(1).max(200),
  type:           z.string().max(50).optional(),
  status:         z.enum(['available', 'unavailable', 'maintenance']).optional(),
  price_per_day:  z.number().positive().optional(),
  price_per_unit: z.number().positive().optional(),
  currency:       z.string().length(3).optional(),
  capacity:       z.number().int().positive().optional(),
  metadata:       z.record(z.any()).optional(),
});

router.get('/items', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const { type, status } = req.query;

  let query = supabase
    .from('saas_items')
    .select('*')
    .eq('org_id', orgId)
    .order('name');

  if (type)   query = query.eq('type', type as string);
  if (status) query = query.eq('status', status as string);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.post('/items', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors[0]?.message }); return; }

  const { data, error } = await supabase
    .from('saas_items')
    .insert({ ...parsed.data, org_id: orgId })
    .select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json(data);
});

router.patch('/items/:id', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('saas_items')
    .update(req.body)
    .eq('id', req.params.id).eq('org_id', req.saasActor!.orgId)
    .select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.delete('/items/:id', async (req: Request, res: Response): Promise<void> => {
  const { error } = await supabase
    .from('saas_items')
    .delete()
    .eq('id', req.params.id).eq('org_id', req.saasActor!.orgId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// ── Stats ─────────────────────────────────────────────────────────

router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const now   = new Date();

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayRes, monthRes, totalRes, itemsRes] = await Promise.all([
    supabase.from('saas_bookings').select('amount')
      .eq('org_id', orgId).neq('status', 'cancelled')
      .gte('start_date', todayStart.toISOString()).lte('start_date', todayEnd.toISOString()),
    supabase.from('saas_bookings').select('amount')
      .eq('org_id', orgId).neq('status', 'cancelled')
      .gte('start_date', monthStart.toISOString()),
    supabase.from('saas_bookings').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase.from('saas_items').select('status')
      .eq('org_id', orgId),
  ]);

  const monthRevenue = (monthRes.data ?? []).reduce((s, b) => s + (b.amount ?? 0), 0);
  const todayRevenue = (todayRes.data ?? []).reduce((s, b) => s + (b.amount ?? 0), 0);
  const availableItems = (itemsRes.data ?? []).filter(i => i.status === 'available').length;

  res.json({
    today_bookings:  todayRes.data?.length ?? 0,
    today_revenue:   todayRevenue,
    month_bookings:  monthRes.data?.length ?? 0,
    month_revenue:   monthRevenue,
    total_bookings:  totalRes.count ?? 0,
    total_items:     itemsRes.data?.length ?? 0,
    available_items: availableItems,
  });
});

// ── Revenue breakdown ─────────────────────────────────────────────

router.get('/revenue', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data } = await supabase
    .from('saas_bookings')
    .select('start_date, amount, currency, item_name, status')
    .eq('org_id', orgId)
    .neq('status', 'cancelled')
    .gte('start_date', since.toISOString())
    .order('start_date');

  // Group by day
  const byDay: Record<string, { date: string; revenue: number; count: number }> = {};
  for (const b of data ?? []) {
    const day = (b.start_date as string).slice(0, 10);
    if (!byDay[day]) byDay[day] = { date: day, revenue: 0, count: 0 };
    byDay[day].revenue += b.amount ?? 0;
    byDay[day].count += 1;
  }

  // Top items by revenue
  const byItem: Record<string, { name: string; revenue: number; count: number }> = {};
  for (const b of data ?? []) {
    const key = (b.item_name as string | null) ?? 'Autre';
    if (!byItem[key]) byItem[key] = { name: key, revenue: 0, count: 0 };
    byItem[key].revenue += b.amount ?? 0;
    byItem[key].count += 1;
  }

  res.json({
    days:      Object.values(byDay),
    top_items: Object.values(byItem).sort((a, b) => b.revenue - a.revenue).slice(0, 6),
    currency:  (data?.[0] as { currency?: string } | undefined)?.currency ?? 'DZD',
  });
});

// ── Notifications (daily briefings + alerts) ──────────────────────

router.get('/notifications', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const unreadOnly = req.query['unread'] === 'true';

  let query = supabase
    .from('saas_notifications')
    .select('id, type, title, body, read, created_at')
    .eq('org_id', orgId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  if (unreadOnly) query = query.eq('read', false);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data ?? []);
});

router.patch('/notifications/:id/read', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const { error } = await supabase
    .from('saas_notifications')
    .update({ read: true })
    .eq('id', req.params.id)
    .eq('org_id', orgId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

router.post('/notifications/read-all', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const { error } = await supabase
    .from('saas_notifications')
    .update({ read: true })
    .eq('org_id', orgId)
    .eq('read', false);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
});

// ── WhatsApp Pro ──────────────────────────────────────────────────

// Configure WhatsApp (store Twilio credentials in integrations)
router.post('/whatsapp/configure', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const { account_sid, auth_token, whatsapp_from } = req.body as {
    account_sid?: string; auth_token?: string; whatsapp_from?: string;
  };

  if (!account_sid || !auth_token || !whatsapp_from) {
    res.status(400).json({ error: 'account_sid, auth_token et whatsapp_from requis' });
    return;
  }

  // Validate credentials first
  const validation = await validateTwilioCredentials(account_sid, auth_token);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error ?? 'Identifiants Twilio invalides' });
    return;
  }

  // Fetch current integrations
  const { data: cfg } = await supabase.from('org_configs').select('integrations').eq('org_id', orgId).maybeSingle();
  const existing = (cfg?.integrations as Record<string, string>) ?? {};

  const { error } = await supabase.from('org_configs').update({
    integrations: {
      ...existing,
      twilio_account_sid:  account_sid,
      twilio_auth_token:   auth_token,
      twilio_whatsapp_from: whatsapp_from.startsWith('whatsapp:') ? whatsapp_from : `whatsapp:${whatsapp_from}`,
    },
    updated_at: new Date().toISOString(),
  }).eq('org_id', orgId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: `WhatsApp configuré — compte Twilio: ${validation.account_name}` });
});

// Send WhatsApp message
router.post('/whatsapp/send', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const { to, body } = req.body as { to?: string; body?: string };

  if (!to || !body) { res.status(400).json({ error: 'to et body requis' }); return; }

  const result = await sendSaasWhatsApp(orgId, to, body);
  if (!result.success) { res.status(502).json({ error: result.error }); return; }
  res.json({ success: true, sid: result.sid });
});

// ── Google Calendar Pro ───────────────────────────────────────────

// Configure Google Calendar (store service account JSON)
router.post('/calendar/configure', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const { service_account_json, calendar_id } = req.body as {
    service_account_json?: string; calendar_id?: string;
  };

  if (!service_account_json) { res.status(400).json({ error: 'service_account_json requis' }); return; }

  // Validate JSON structure
  try {
    const sa = JSON.parse(service_account_json) as Record<string, string>;
    if (!sa.client_email || !sa.private_key) {
      res.status(400).json({ error: 'JSON invalide — client_email et private_key requis' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'JSON invalide' });
    return;
  }

  const { data: cfg } = await supabase.from('org_configs').select('integrations').eq('org_id', orgId).maybeSingle();
  const existing = (cfg?.integrations as Record<string, string>) ?? {};

  const { error } = await supabase.from('org_configs').update({
    integrations: {
      ...existing,
      google_service_account_json: service_account_json,
      ...(calendar_id ? { google_calendar_id: calendar_id } : {}),
    },
    updated_at: new Date().toISOString(),
  }).eq('org_id', orgId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: 'Google Calendar configuré' });
});

// List upcoming events
router.get('/calendar/events', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const max = Math.min(Number(req.query['max'] ?? 10), 50);
  const events = await listOrgCalendarEvents(orgId, max);
  res.json(events);
});

// Create event
router.post('/calendar/events', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const { summary, description, start, end, timezone } = req.body as {
    summary?: string; description?: string; start?: string; end?: string; timezone?: string;
  };

  if (!summary || !start || !end) {
    res.status(400).json({ error: 'summary, start et end requis' });
    return;
  }

  const result = await createOrgCalendarEvent(orgId, { summary, description, start, end, timezone });
  if (!result) { res.status(502).json({ error: 'Google Calendar non configuré ou erreur API' }); return; }
  res.status(201).json(result);
});

// Delete event
router.delete('/calendar/events/:id', async (req: Request, res: Response): Promise<void> => {
  const orgId = req.saasActor!.orgId;
  const ok = await deleteOrgCalendarEvent(orgId, req.params['id'] as string);
  if (!ok) { res.status(502).json({ error: 'Suppression échouée' }); return; }
  res.status(204).send();
});

export default router;
