"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_js_1 = require("../../integrations/supabase.js");
const google_calendar_js_1 = require("../../integrations/google-calendar.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// GET /api/bookings — list bookings with filters
router.get('/', auth_js_1.requireMobileAuth, async (req, res) => {
    const status = req.query['status'];
    const phone = req.query['phone'];
    const limit = Number(req.query['limit'] ?? 50);
    try {
        const bookings = await (0, supabase_js_1.getBookings)({ status, clientPhone: phone, limit });
        res.json({ bookings, count: bookings.length });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/bookings/availability — check if a car is available
router.get('/availability', auth_js_1.requireMobileAuth, async (req, res) => {
    const { carId, startDate, endDate } = req.query;
    if (!carId || !startDate || !endDate) {
        res.status(400).json({ error: 'carId, startDate, endDate required' });
        return;
    }
    try {
        const available = await (0, supabase_js_1.checkCarAvailability)(carId, startDate, endDate);
        res.json({ available, carId, startDate, endDate });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/bookings — create a new booking (with anti-doublon)
const bookingSchema = zod_1.z.object({
    car_id: zod_1.z.string().uuid(),
    client_name: zod_1.z.string().min(1),
    client_email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    client_phone: zod_1.z.string().min(6),
    client_age: zod_1.z.number().int().min(18).max(99).optional(),
    start_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    final_price: zod_1.z.number().min(0),
    notes: zod_1.z.string().optional(),
    syncCalendar: zod_1.z.boolean().optional().default(true),
});
router.post('/', auth_js_1.requireMobileAuth, async (req, res) => {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
        return;
    }
    const { syncCalendar, ...bookingData } = parsed.data;
    try {
        // createBooking includes anti-doublon check
        const booking = await (0, supabase_js_1.createBooking)({
            ...bookingData,
            base_price_snapshot: bookingData.final_price,
            resale_price_snapshot: bookingData.final_price,
            profit: 0,
            status: 'PENDING',
            whatsapp_sent: false,
            sms_sent: false,
        });
        // Auto-sync to Google Calendar if requested
        if (syncCalendar) {
            const { data: car } = await supabase_js_1.supabase.from('cars').select('name').eq('id', bookingData.car_id).single();
            const carName = car?.name ?? 'Véhicule';
            await (0, google_calendar_js_1.createCalendarEvent)(booking.id, booking.client_name, carName, booking.start_date, booking.end_date, booking.notes)
                .catch(err => console.error('[bookings] Calendar sync failed:', err));
        }
        res.json({ booking, message: 'Réservation créée avec succès' });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: msg });
    }
});
// PATCH /api/bookings/:id — full update (client_name, dates, vehicle, amount, rented_by, etc.)
router.patch('/:id', auth_js_1.requireMobileAuth, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    if (!id) {
        res.status(400).json({ error: 'id required' });
        return;
    }
    // Sanitize: never allow changing id or created_at
    const { id: _id, created_at: _ca, ...safeUpdates } = updates;
    safeUpdates['updated_at'] = new Date().toISOString();
    // If dates changed, re-check availability
    if (safeUpdates['start_date'] || safeUpdates['end_date']) {
        const { data: current } = await supabase_js_1.supabase.from('bookings').select('car_id, start_date, end_date').eq('id', id).single();
        if (current) {
            const carId = (safeUpdates['car_id'] ?? current.car_id);
            const start = (safeUpdates['start_date'] ?? current.start_date);
            const end = (safeUpdates['end_date'] ?? current.end_date);
            const avail = await (0, supabase_js_1.checkCarAvailability)(carId, start, end, id);
            if (!avail) {
                res.status(409).json({ error: `Véhicule non disponible du ${start} au ${end}` });
                return;
            }
        }
    }
    try {
        const { data, error } = await supabase_js_1.supabase
            .from('bookings')
            .update(safeUpdates)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        res.json({ booking: data, message: 'Réservation mise à jour' });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// PATCH /api/bookings/:id/status — update booking status
router.patch('/:id/status', auth_js_1.requireMobileAuth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['PENDING', 'CONFIRMED', 'REJECTED', 'COMPLETED', 'ACTIVE'];
    if (!validStatuses.includes(status)) {
        res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
        return;
    }
    try {
        const { data, error } = await supabase_js_1.supabase
            .from('bookings')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        res.json({ booking: data, message: `Statut mis à jour: ${status}` });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=bookings.js.map