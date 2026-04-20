import { Router } from 'express';
import {
  getAuthUrl, exchangeCodeForTokens, listUpcomingEvents,
  createCalendarEvent, syncPendingBookings,
} from '../../integrations/google-calendar.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/calendar/auth — returns Google OAuth2 URL
router.get('/auth', requireMobileAuth, (_req, res) => {
  res.json({ url: getAuthUrl() });
});

// GET /api/calendar/callback — OAuth2 callback
router.get('/callback', async (req, res) => {
  const code = req.query['code'] as string | undefined;
  if (!code) {
    res.status(400).send('Missing code');
    return;
  }
  const ok = await exchangeCodeForTokens(code);
  if (ok) {
    res.send('<html><body><h2>✅ Google Calendar connecté pour fikconciergerie@gmail.com !</h2><p>Vous pouvez fermer cette page.</p></body></html>');
  } else {
    res.status(500).send('OAuth exchange failed');
  }
});

// GET /api/calendar/events — list upcoming events
router.get('/events', requireMobileAuth, async (_req, res) => {
  try {
    const events = await listUpcomingEvents(30);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/calendar/sync — sync all pending bookings
router.post('/sync', requireMobileAuth, async (_req, res) => {
  try {
    const count = await syncPendingBookings();
    res.json({ synced: count, message: `${count} réservation(s) synchronisée(s) avec Google Agenda` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/calendar/events — create a manual event
router.post('/events', requireMobileAuth, async (req, res) => {
  const { bookingId, clientName, carName, startDate, endDate, notes } = req.body as {
    bookingId: string; clientName: string; carName: string;
    startDate: string; endDate: string; notes?: string;
  };
  try {
    const eventId = await createCalendarEvent(bookingId, clientName, carName, startDate, endDate, notes);
    res.json({ eventId, success: !!eventId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
