import { Router } from 'express';
import { z } from 'zod';
import { supabase, getClientHistory, getClientDocuments, saveClientDocument } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { updateClientIntelFromBooking } from '../../orchestrator/client-intelligence.js';

const router = Router();

// GET /api/clients — list clients filtered by actor (rented_by)
router.get('/', requireMobileAuth, async (req, res) => {
  const actorName = req.mobileActor
    ? req.mobileActor.ownerKey.charAt(0).toUpperCase() + req.mobileActor.ownerKey.slice(1)
    : 'Kouider';
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('client_name, client_phone, client_email, status, final_price, created_at')
      .eq('rented_by', actorName)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Group by phone
    const clientMap = new Map<string, {
      name: string; phone: string; email: string; bookingCount: number; totalSpent: number; lastBooking: string;
    }>();

    for (const b of (data ?? []) as Array<{
      client_name: string; client_phone: string; client_email: string;
      status: string; final_price: number; created_at: string;
    }>) {
      const key = b.client_phone ?? b.client_email ?? b.client_name;
      const existing = clientMap.get(key);
      if (existing) {
        existing.bookingCount++;
        if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') existing.totalSpent += b.final_price ?? 0;
        if (b.created_at > existing.lastBooking) existing.lastBooking = b.created_at;
      } else {
        clientMap.set(key, {
          name:         b.client_name,
          phone:        b.client_phone,
          email:        b.client_email,
          bookingCount: 1,
          totalSpent:   b.status === 'CONFIRMED' ? (b.final_price ?? 0) : 0,
          lastBooking:  b.created_at,
        });
      }
    }

    res.json({ clients: Array.from(clientMap.values()) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/clients/intelligence — list client profiles from client_intelligence table
router.get('/intelligence', requireMobileAuth, async (req, res) => {
  const ownerId = (req.query['owner'] as string | undefined) ?? req.mobileActor?.ownerKey ?? 'kouider';
  const limit   = Number(req.query['limit'] ?? 100);
  try {
    const { data, error } = await supabase
      .from('client_intelligence')
      .select('*')
      .eq('owner_id', ownerId)
      .order('total_spent', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    res.json({ clients: data ?? [], count: (data ?? []).length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/clients/backfill — rebuild client_intelligence from all historical bookings
router.post('/backfill', requireMobileAuth, async (_req, res) => {
  const ownerId = 'kouider';
  try {
    // 1. Clear existing intelligence records for this owner
    const { error: delError } = await supabase
      .from('client_intelligence')
      .delete()
      .eq('owner_id', ownerId);
    if (delError) throw new Error(`Clear failed: ${delError.message}`);

    // 2. Fetch all cars for id→name mapping
    const { data: carsData } = await supabase.from('cars').select('id, name');
    const carMap = new Map<string, string>();
    for (const c of (carsData ?? []) as Array<{ id: string; name: string }>) {
      carMap.set(c.id, c.name);
    }

    // 3. Fetch all non-rejected bookings ordered by date
    const { data: bookings, error: bErr } = await supabase
      .from('bookings')
      .select('client_name, client_phone, car_id, start_date, end_date, nb_days, client_price_per_day, final_price, discount_applied, status, payment_status, paid_amount')
      .neq('status', 'REJECTED')
      .order('start_date', { ascending: true });
    if (bErr) throw new Error(bErr.message);

    // 4. Process each booking sequentially (updateClientIntelFromBooking handles upsert)
    let processed = 0;
    let errors    = 0;
    for (const b of (bookings ?? []) as Array<{
      client_name: string; client_phone: string | null; car_id: string;
      start_date: string; end_date: string; nb_days: number | null;
      client_price_per_day: number | null; final_price: number | null;
      discount_applied: number | null; status: string;
      payment_status: string | null; paid_amount: number | null;
    }>) {
      const carName = carMap.get(b.car_id) ?? 'Véhicule';
      const nbDays  = b.nb_days ?? Math.max(1, Math.ceil(
        (new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000,
      ));
      try {
        await updateClientIntelFromBooking({
          client_name:          b.client_name,
          client_phone:         b.client_phone ?? undefined,
          car_name:             carName,
          start_date:           b.start_date,
          end_date:             b.end_date,
          nb_days:              nbDays,
          client_price_per_day: b.client_price_per_day,
          final_price:          b.final_price,
          discount_applied:     b.discount_applied ?? 0,
          status:               b.status,
          payment_status:       b.payment_status ?? undefined,
          paid_amount:          b.paid_amount ?? undefined,
        }, ownerId);
        processed++;
      } catch { errors++; }
    }

    // 5. Count unique profiles created
    const { count } = await supabase
      .from('client_intelligence')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId);

    res.json({
      ok:                 true,
      bookings_processed: processed,
      bookings_errors:    errors,
      clients_created:    count ?? 0,
      message: `Backfill terminé : ${processed} réservations → ${count ?? 0} profils clients créés`,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/clients/:phone/notes — update personal notes on client_intelligence
router.patch('/:phone/notes', requireMobileAuth, async (req, res) => {
  const phone   = decodeURIComponent(req.params['phone'] as string);
  const { notes } = req.body as { notes?: string };
  const ownerId = (req.query['owner'] as string | undefined) ?? 'kouider';
  try {
    const { data, error } = await supabase
      .from('client_intelligence')
      .update({ notes: notes?.trim() || null })
      .eq('client_phone', phone)
      .eq('owner_id', ownerId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, client: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/clients/:phone — full client profile + history (must be LAST — catches all)
router.get('/:phone', requireMobileAuth, async (req, res) => {
  const phone = decodeURIComponent(req.params['phone'] as string);
  try {
    const history = await getClientHistory(phone);
    const documents = await getClientDocuments(phone);
    res.json({ phone, ...history, documents });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/clients/documents — upload document reference
const docSchema = z.object({
  clientPhone: z.string().min(1),
  clientName:  z.string().min(1),
  bookingId:   z.string().uuid().optional(),
  type:        z.enum(['passport', 'license', 'contract', 'other']),
  fileUrl:     z.string().url(),
  storagePath: z.string().min(1),
  notes:       z.string().optional(),
});

router.post('/documents', requireMobileAuth, async (req, res) => {
  const parsed = docSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }
  try {
    const doc = await saveClientDocument({
      client_phone: parsed.data.clientPhone,
      client_name:  parsed.data.clientName,
      booking_id:   parsed.data.bookingId,
      type:         parsed.data.type,
      file_url:     parsed.data.fileUrl,
      storage_path: parsed.data.storagePath,
      notes:        parsed.data.notes,
    });
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
