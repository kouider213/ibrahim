import { Router } from 'express';
import { z } from 'zod';
import { getBookings, checkCarAvailability, createBooking, supabase } from '../../integrations/supabase.js';
import { createCalendarEvent } from '../../integrations/google-calendar.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { updateClientIntelFromBooking } from '../../orchestrator/client-intelligence.js';

const router = Router();

// GET /api/bookings — list bookings with filters
router.get('/', requireMobileAuth, async (req, res) => {
  const status = req.query['status'] as string | undefined;
  const phone  = req.query['phone']  as string | undefined;
  const limit  = Number(req.query['limit'] ?? 50);
  const q      = req.query['q']      as string | undefined;

  try {
    const bookings = await getBookings({ status, clientPhone: phone, limit, q });
    res.json({ bookings, count: bookings.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bookings/availability — check if a car is available
router.get('/availability', requireMobileAuth, async (req, res) => {
  const { carId, startDate, endDate } = req.query as { carId: string; startDate: string; endDate: string };
  if (!carId || !startDate || !endDate) {
    res.status(400).json({ error: 'carId, startDate, endDate required' });
    return;
  }
  try {
    const available = await checkCarAvailability(carId, startDate, endDate);
    res.json({ available, carId, startDate, endDate });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/bookings — create a new booking (with anti-doublon)
const bookingSchema = z.object({
  car_id:               z.string().uuid(),
  client_name:          z.string().min(1),
  client_email:         z.string().email().optional().or(z.literal('')),
  client_phone:         z.string().min(6),
  client_age:           z.number().int().min(18).max(99).optional(),
  start_date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  final_price:          z.number().min(0),
  notes:                z.string().optional(),
  syncCalendar:         z.boolean().optional().default(true),
  rented_by:            z.enum(['Kouider', 'Houari']).optional(),
  client_price_per_day: z.number().min(0).optional(),
  owner_price_per_day:  z.number().min(0).optional(),
  payment_status:       z.enum(['UNPAID', 'PENDING', 'PARTIAL', 'PAID']).optional(),
  paid_amount:          z.number().min(0).optional(),
  initial_status:       z.enum(['PENDING', 'CONFIRMED']).optional(),
});

router.post('/', requireMobileAuth, async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }

  const { syncCalendar, client_price_per_day, owner_price_per_day, payment_status, paid_amount, initial_status, ...bookingData } = parsed.data;
  const nb_days = Math.max(1, Math.ceil(
    (new Date(bookingData.end_date).getTime() - new Date(bookingData.start_date).getTime()) / 86_400_000,
  ));
  const profit_kouider = client_price_per_day != null && owner_price_per_day != null
    ? Math.round((client_price_per_day - owner_price_per_day) * nb_days * 100) / 100
    : null;

  try {
    // createBooking includes anti-doublon check
    const booking = await createBooking({
      ...bookingData,
      base_price_snapshot:   bookingData.final_price,
      resale_price_snapshot: bookingData.final_price,
      profit:                0,
      status:                initial_status ?? 'PENDING',
      whatsapp_sent:         false,
      sms_sent:              false,
      ...(client_price_per_day != null ? { client_price_per_day } : {}),
      ...(owner_price_per_day  != null ? { owner_price_per_day }  : {}),
      ...(profit_kouider       != null ? { profit_kouider }       : {}),
      ...(payment_status       != null ? { payment_status }       : {}),
      ...(paid_amount          != null ? { paid_amount }          : {}),
      nb_days,
    });

    // Auto-sync to Google Calendar if requested
    const { data: car } = await supabase.from('cars').select('name').eq('id', bookingData.car_id).single();
    const carName = (car as { name: string } | null)?.name ?? 'Véhicule';

    if (syncCalendar) {
      await createCalendarEvent(booking.id, booking.client_name, carName, booking.start_date, booking.end_date, booking.notes)
        .catch(err => console.error('[bookings] Calendar sync failed:', err));
    }

    // Update client intelligence profile (fire-and-forget, non-blocking)
    const actorId = req.mobileActor?.ownerKey ?? 'kouider';
    updateClientIntelFromBooking({
      client_name:          booking.client_name,
      client_phone:         booking.client_phone ?? undefined,
      car_name:             carName,
      start_date:           booking.start_date,
      end_date:             booking.end_date,
      nb_days:              nb_days,
      client_price_per_day: client_price_per_day ?? null,
      final_price:          booking.final_price ?? null,
      discount_applied:     0,
      status:               booking.status ?? 'PENDING',
      payment_status:       booking.payment_status ?? undefined,
    }, actorId).catch(err => console.error('[bookings] Client intel update failed:', err));

    res.json({ booking, message: 'Réservation créée avec succès' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// PATCH /api/bookings/:id — full update (client_name, dates, vehicle, amount, rented_by, etc.)
router.patch('/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const updates = req.body as Record<string, unknown>;

  if (!id) {
    res.status(400).json({ error: 'id required' });
    return;
  }

  // Sanitize: never allow changing id or created_at
  const { id: _id, created_at: _ca, ...safeUpdates } = updates as Record<string, unknown>;
  safeUpdates['updated_at'] = new Date().toISOString();

  // If dates changed, re-check availability
  if (safeUpdates['start_date'] || safeUpdates['end_date']) {
    const { data: current } = await supabase.from('bookings').select('car_id, start_date, end_date').eq('id', id).single();
    if (current) {
      const carId = (safeUpdates['car_id'] ?? (current as { car_id: string }).car_id) as string;
      const start = (safeUpdates['start_date'] ?? (current as { start_date: string }).start_date) as string;
      const end   = (safeUpdates['end_date']   ?? (current as { end_date: string }).end_date) as string;
      const avail = await checkCarAvailability(carId, start, end, id);
      if (!avail) {
        res.status(409).json({ error: `Véhicule non disponible du ${start} au ${end}` });
        return;
      }
    }
  }

  try {
    const { data, error } = await supabase
      .from('bookings')
      .update(safeUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // If marking as PAID, auto-insert payment record (non-blocking)
    if (safeUpdates['payment_status'] === 'PAID') {
      const paidAmt = Number(safeUpdates['paid_amount'] ?? (data as { final_price?: number })?.final_price ?? 0);
      if (paidAmt > 0) {
        supabase.from('payments').insert({
          booking_id: id,
          amount:     paidAmt,
          type:       'solde',
          note:       'Paiement complet — marqué via app mobile',
          created_at: new Date().toISOString(),
        }).then(() => {}, () => {});
      }
    }

    res.json({ booking: data, message: 'Réservation mise à jour' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/bookings/:id/status — update booking status
router.patch('/:id/status', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status: string };

  const validStatuses = ['PENDING', 'CONFIRMED', 'REJECTED', 'COMPLETED', 'ACTIVE'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.json({ booking: data, message: `Statut mis à jour: ${status}` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bookings/cars — list all cars for booking form
router.get('/cars', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('cars')
      .select('id, name, category, available, base_price')
      .order('name', { ascending: true });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ cars: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bookings/:id/payments — list payment records for a booking
router.get('/:id/payments', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('booking_id', id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    res.json({ payments: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/bookings/:id/payments — record a payment
const paymentSchema = z.object({
  amount: z.number().positive(),
  type:   z.enum(['avance', 'solde', 'virement', 'especes', 'autre']),
  note:   z.string().optional(),
});

router.post('/:id/payments', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert({ booking_id: id, ...parsed.data, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Recompute paid_amount on the booking
    const { data: allPays } = await supabase
      .from('payments')
      .select('amount')
      .eq('booking_id', id);
    const totalPaid = (allPays ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0);
    const { data: bk } = await supabase.from('bookings').select('final_price').eq('id', id).single();
    const finalPrice = (bk as { final_price?: number } | null)?.final_price ?? 0;
    const newPayStatus = totalPaid >= finalPrice ? 'PAID' : 'PARTIAL';
    await supabase
      .from('bookings')
      .update({ paid_amount: totalPaid, payment_status: newPayStatus, updated_at: new Date().toISOString() })
      .eq('id', id);

    res.json({ payment: data, totalPaid, paymentStatus: newPayStatus });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/bookings/:id — full booking detail
router.get('/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, cars(id, name, category, base_price, available)')
      .eq('id', id)
      .single();
    if (error) { res.status(404).json({ error: 'Réservation introuvable' }); return; }
    res.json({ booking: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/bookings/:id — delete booking (also removes calendar event if stored)
router.delete('/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    // Fetch to get google_event_id if present
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, google_event_id')
      .eq('id', id)
      .single();

    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) throw new Error(error.message);

    // Non-blocking calendar cleanup
    if (booking && (booking as { google_event_id?: string }).google_event_id) {
      const { deleteCalendarEvent } = await import('../../integrations/google-calendar.js');
      deleteCalendarEvent((booking as { google_event_id: string }).google_event_id)
        .catch(e => console.error('[bookings] Calendar delete failed:', e));
    }

    res.json({ message: 'Réservation supprimée', id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
