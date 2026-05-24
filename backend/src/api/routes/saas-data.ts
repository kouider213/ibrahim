import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireSaasAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';

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
  const { status, date, limit } = req.query;

  let query = supabase
    .from('saas_bookings')
    .select('*')
    .eq('org_id', orgId)
    .order('start_date', { ascending: false })
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

export default router;
