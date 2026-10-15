import { Router } from 'express';
import {
  getAuthUrl, exchangeCodeForTokens, listUpcomingEvents,
  createCalendarEvent, syncPendingBookings,
  listHouariEvents, createHouariCalendarEvent,
  createAgendaEvent, listAgendaRange, updateAgendaEvent, deleteAgendaEvent, agendaAccess,
} from '../../integrations/google-calendar.js';
import { exchangeGmailCode, getGmailAuthUrl, GMAIL_STATE_PREFIX } from '../../integrations/gmail.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { getDaysOff } from '../../integrations/kouider-dossier.js';

const router = Router();

// GET /api/calendar/auth — returns Google OAuth2 URL
router.get('/auth', requireMobileAuth, (_req, res) => {
  res.json({ url: getAuthUrl() });
});

// GET /api/calendar/gmail-connect — redirige vers le consentement Google pour fikconciergerie@gmail.com
// Sans auth : n'ouvre que l'écran Google ; le token est rangé sous l'adresse réellement connectée.
router.get('/gmail-connect', (_req, res) => {
  res.redirect(getGmailAuthUrl('pro'));
});

// GET /api/calendar/callback — OAuth2 callback
router.get('/callback', async (req, res) => {
  const code = req.query['code'] as string | undefined;
  if (!code) {
    res.status(400).send('Missing code');
    return;
  }
  // Connexion Gmail : même URI de callback, distinguée par le paramètre state
  const state = req.query['state'] as string | undefined;
  if (state?.startsWith(GMAIL_STATE_PREFIX)) {
    const address = await exchangeGmailCode(code);
    if (address) {
      res.send(`<html><body><h2>✅ Gmail connecté pour ${address.replace(/[<>&"]/g, '')} !</h2><p>Dzaryx peut maintenant lire tes mails et en envoyer (toujours après ton accord). Tu peux fermer cette page.</p></body></html>`);
    } else {
      res.status(500).send('Connexion Gmail échouée');
    }
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

// ── Bonhomme Kouider sur la Carte live : son agenda (= agenda FIK, jamais l'agenda perso) du jour + 7 jours ──
const ownerOf = (req: unknown) => (req as { mobileActor?: { ownerKey?: string } }).mobileActor?.ownerKey ?? 'kouider';
router.get('/me', requireMobileAuth, async (req, res) => {
  if (ownerOf(req) === 'houari') { res.status(403).json({ error: 'Agenda de Kouider seulement' }); return; }
  try {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
    const from = new Date(`${day}T00:00:00+01:00`), to = new Date(from.getTime() + 8 * 86_400_000);
    const [evs, daysOff] = await Promise.all([listAgendaRange(from.toISOString(), to.toISOString(), 80), getDaysOff().catch(() => [1, 4])]);
    const access = evs === null ? await agendaAccess() : { ok: true, calendar: 'fikconciergerie@gmail.com' };
    const events = (evs ?? []).filter(e => !(e.summary ?? '').startsWith('🚗'))      // les locations sont déjà sur la carte
      .map(e => ({ id: e.id, title: e.summary, location: e.location ?? null, start: e.start.dateTime ?? e.start.date ?? null, end: e.end?.dateTime ?? e.end?.date ?? null, allDay: !e.start.dateTime }));
    res.json({ day, access, events, daysOff });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
router.patch('/agenda/:id', requireMobileAuth, async (req, res) => {
  if (ownerOf(req) === 'houari') { res.status(403).json({ error: 'Agenda de Kouider seulement' }); return; }
  const b = req.body as { title?: string; start?: string; end?: string; location?: string; description?: string; allDay?: boolean };
  const ok = await updateAgendaEvent(String(req.params['id']), b);
  res.status(ok ? 200 : 502).json({ success: ok });
});
router.delete('/agenda/:id', requireMobileAuth, async (req, res) => {
  if (ownerOf(req) === 'houari') { res.status(403).json({ error: 'Agenda de Kouider seulement' }); return; }
  const ok = await deleteAgendaEvent(String(req.params['id']));
  res.status(ok ? 200 : 502).json({ success: ok });
});

// GET /api/calendar/all — multi-calendar events, actor-aware
router.get('/all', requireMobileAuth, async (req, res) => {
  const actor = (req.query['actor'] as string) === 'houari' ? 'houari' : 'kouider';
  try {
    const [fikRaw, kouiderRaw, houariRaw] = await Promise.all([
      listUpcomingEvents(50),
      Promise.resolve([]),          // agenda perso de Kouider : jamais lu (agenda FIK seulement)
      listHouariEvents(20),
    ]);
    type Source = 'fik' | 'kouider' | 'houari';
    interface RawEvent {
      id?: string; summary: string; description?: string; location?: string;
      start: { dateTime?: string; date?: string; timeZone?: string };
      end:   { dateTime?: string; date?: string; timeZone?: string };
      colorId?: string;
    }
    const tag = <S extends Source>(evts: RawEvent[], s: S) =>
      evts.map(e => ({ ...e, source: s }));
    const events = [
      ...tag(fikRaw as RawEvent[],     'fik'),
      ...tag(kouiderRaw as RawEvent[], 'kouider'),
      ...tag(houariRaw as RawEvent[],  'houari'),
    ].sort((a, b) => {
      const aT = (a.start.dateTime ?? a.start.date ?? '');
      const bT = (b.start.dateTime ?? b.start.date ?? '');
      return aT.localeCompare(bT);
    });
    res.json({ events, actor });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/calendar/add — create event in specific calendar (fik | kouider | houari)
router.post('/add', requireMobileAuth, async (req, res) => {
  const { calendar, title, startDateTime, endDateTime, description, allDay } = req.body as {
    calendar: 'fik' | 'kouider' | 'houari';
    title: string;
    startDateTime: string;
    endDateTime:   string;
    description?:  string;
    allDay?:       boolean;
    location?:     string;
  };
  if (!calendar || !title || !startDateTime || !endDateTime) {
    res.status(400).json({ error: 'calendar, title, startDateTime, endDateTime requis' });
    return;
  }
  try {
    let eventId: string | null = null;
    if (calendar === 'fik') {
      eventId = await createCalendarEvent(`add_${Date.now()}`, title, '', startDateTime.slice(0,10), endDateTime.slice(0,10), description);
    } else if (calendar === 'kouider') {
      eventId = await createAgendaEvent(title, startDateTime, endDateTime, description, allDay, (req.body as { location?: string }).location); // « mon agenda » = agenda FIK
    } else {
      eventId = await createHouariCalendarEvent(title, startDateTime, endDateTime, description, allDay);
    }
    res.json({ eventId, success: !!eventId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
