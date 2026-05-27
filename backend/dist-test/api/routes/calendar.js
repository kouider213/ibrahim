"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const google_calendar_js_1 = require("../../integrations/google-calendar.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// GET /api/calendar/auth — returns Google OAuth2 URL
router.get('/auth', auth_js_1.requireMobileAuth, (_req, res) => {
    res.json({ url: (0, google_calendar_js_1.getAuthUrl)() });
});
// GET /api/calendar/callback — OAuth2 callback
router.get('/callback', async (req, res) => {
    const code = req.query['code'];
    if (!code) {
        res.status(400).send('Missing code');
        return;
    }
    const ok = await (0, google_calendar_js_1.exchangeCodeForTokens)(code);
    if (ok) {
        res.send('<html><body><h2>✅ Google Calendar connecté pour fikconciergerie@gmail.com !</h2><p>Vous pouvez fermer cette page.</p></body></html>');
    }
    else {
        res.status(500).send('OAuth exchange failed');
    }
});
// GET /api/calendar/events — list upcoming events
router.get('/events', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const events = await (0, google_calendar_js_1.listUpcomingEvents)(30);
        res.json({ events });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/calendar/sync — sync all pending bookings
router.post('/sync', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const count = await (0, google_calendar_js_1.syncPendingBookings)();
        res.json({ synced: count, message: `${count} réservation(s) synchronisée(s) avec Google Agenda` });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/calendar/events — create a manual event
router.post('/events', auth_js_1.requireMobileAuth, async (req, res) => {
    const { bookingId, clientName, carName, startDate, endDate, notes } = req.body;
    try {
        const eventId = await (0, google_calendar_js_1.createCalendarEvent)(bookingId, clientName, carName, startDate, endDate, notes);
        res.json({ eventId, success: !!eventId });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=calendar.js.map