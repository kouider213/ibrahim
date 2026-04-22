import { Router } from 'express';
import { z } from 'zod';
import { getBookings, checkCarAvailability, createBooking, supabase } from '../../integrations/supabase.js';
import { createCalendarEvent } from '../../integrations/google-calendar.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/bookings — list bookings with filters
router.get('/', requireMobileAuth, async (req, res) => {
  const status = req.query['status'] as string | undefined;
  const phone  = req.query['phone']  as string | undefined;
  const limit  = Number(req.query['limit'] ?? 50);

  try {
    const bookings = await getBookings({ status, clientPhone: phone, limit });
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
  car_id:       z.string().uuid(),
  client_name:  z.string().min(1),
  client_email: z.string().email().optional().or(z.literal('')),
  client_phone: z.string().min(6),
  client_age:   z.number().int().min(18).max(99).optional(),
  start_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  final_price:  z.number().min(0),
  notes:        z.string().optional(),
  syncCalendar: z.boolean().optional().default(true),
});

router.post('/', requireMobileAuth, async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }

  const { syncCalendar, ...bookingData } = parsed.data;

  try {
    // createBooking includes anti-doublon check
    const booking = await createBooking({
      ...bookingData,
      base_price_snapshot:   bookingData.final_price,
      resale_price_snapshot: bookingData.final_price,
      profit:                0,
      status:                'PENDING',
      whatsapp_sent:         false,
      sms_sent:              false,
    });

    // Auto-sync to Google Calendar if requested
    if (syncCalendar) {
      const { data: car } = await supabase.from('cars').select('name').eq('id', bookingData.car_id).single();
      const carName = (car as { name: string } | null)?.name ?? 'Véhicule';
      await createCalendarEvent(booking.id, booking.client_name, carName, booking.start_date, booking.end_date, booking.notes)
        .catch(err => console.error('[bookings] Calendar sync failed:', err));
    }

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

export default router;
