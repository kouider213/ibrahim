import axios from 'axios';
import { supabase } from './supabase.js';

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TARGET_EMAIL = 'fikconciergerie@gmail.com';

interface GoogleToken {
  access_token:  string;
  refresh_token: string;
  expires_at:    string;
}

interface CalendarEvent {
  id?:          string;
  summary:      string;
  description?: string;
  start:        { dateTime: string; timeZone: string };
  end:          { dateTime: string; timeZone: string };
  colorId?:     string;
}

// ── Token management ──────────────────────────────────────────

async function getStoredToken(): Promise<GoogleToken | null> {
  const { data } = await supabase
    .from('google_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('email', TARGET_EMAIL)
    .single();
  return data as GoogleToken | null;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId     = process.env['GOOGLE_CLIENT_ID'] ?? '';
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? '';

  const { data } = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     clientId,
    client_secret: clientSecret,
  }).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const expiresAt = new Date(Date.now() + (data.expires_in as number) * 1000).toISOString();

  await supabase.from('google_oauth_tokens').upsert({
    email:        TARGET_EMAIL,
    access_token: data.access_token as string,
    refresh_token: refreshToken,
    token_type:   'Bearer',
    expires_at:   expiresAt,
    scope:        data.scope as string,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'email' });

  return data.access_token as string;
}

async function getValidAccessToken(): Promise<string | null> {
  const token = await getStoredToken();
  if (!token) return null;

  const expiresAt = new Date(token.expires_at).getTime();
  const now = Date.now();

  if (now < expiresAt - 60_000) {
    return token.access_token;
  }

  try {
    return await refreshAccessToken(token.refresh_token);
  } catch (err) {
    console.error('[google-calendar] token refresh failed:', err);
    return null;
  }
}

// ── Calendar API helpers ──────────────────────────────────────

async function calendarRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: object,
): Promise<T | null> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    console.error('[google-calendar] No valid access token — use /api/calendar/auth to connect');
    return null;
  }

  try {
    const response = await axios.request<T>({
      method,
      url: `${GOOGLE_CALENDAR_BASE}${path}`,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      data: body,
    });
    return response.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[google-calendar] ${method} ${path} failed:`, msg);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────

export async function listUpcomingEvents(maxResults = 20): Promise<CalendarEvent[]> {
  const res = await calendarRequest<{ items: CalendarEvent[] }>('GET',
    `/calendars/primary/events?maxResults=${maxResults}&orderBy=startTime&singleEvents=true&timeMin=${new Date().toISOString()}`);
  return res?.items ?? [];
}

export async function createCalendarEvent(
  bookingId: string,
  clientName: string,
  carName: string,
  startDate: string,
  endDate: string,
  notes?: string,
): Promise<string | null> {
  // Date boundaries: start at 09:00, end at 18:00 on last day
  const startDT = `${startDate}T09:00:00`;
  const endDT   = `${endDate}T18:00:00`;

  const event: CalendarEvent = {
    summary:     `🚗 ${clientName} — ${carName}`,
    description: `Réservation Fik Conciergerie\nClient: ${clientName}\nVéhicule: ${carName}${notes ? `\nNotes: ${notes}` : ''}\nBooking ID: ${bookingId}`,
    start: { dateTime: startDT, timeZone: 'Africa/Algiers' },
    end:   { dateTime: endDT,   timeZone: 'Africa/Algiers' },
    colorId: '2', // Sage green
  };

  const created = await calendarRequest<{ id: string }>('POST', '/calendars/primary/events', event);
  if (!created?.id) return null;

  // Store in calendar_events table
  await supabase.from('calendar_events').upsert({
    booking_id:      bookingId,
    google_event_id: created.id,
    calendar_id:     'primary',
    title:           event.summary,
    start_datetime:  new Date(startDT).toISOString(),
    end_datetime:    new Date(endDT).toISOString(),
    status:          'synced',
  }, { onConflict: 'google_event_id' });

  return created.id;
}

export async function updateCalendarEvent(
  googleEventId: string,
  updates: Partial<{ summary: string; startDate: string; endDate: string; description: string }>,
): Promise<boolean> {
  const patch: Partial<CalendarEvent> = {};
  if (updates.summary)     patch.summary = updates.summary;
  if (updates.description) patch.description = updates.description;
  if (updates.startDate)   patch.start = { dateTime: `${updates.startDate}T09:00:00`, timeZone: 'Africa/Algiers' };
  if (updates.endDate)     patch.end   = { dateTime: `${updates.endDate}T18:00:00`,   timeZone: 'Africa/Algiers' };

  const res = await calendarRequest('PATCH', `/calendars/primary/events/${googleEventId}`, patch);
  if (res) {
    await supabase.from('calendar_events').update({ status: 'synced', updated_at: new Date().toISOString() })
      .eq('google_event_id', googleEventId);
  }
  return !!res;
}

export async function deleteCalendarEvent(googleEventId: string): Promise<boolean> {
  await calendarRequest('DELETE', `/calendars/primary/events/${googleEventId}`);
  await supabase.from('calendar_events').update({ status: 'deleted' }).eq('google_event_id', googleEventId);
  return true;
}

// Sync all confirmed bookings that don't have a calendar event yet
export async function syncPendingBookings(): Promise<number> {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, client_name, start_date, end_date, notes, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .not('id', 'in', supabase.from('calendar_events').select('booking_id'));

  if (!bookings?.length) return 0;
  let synced = 0;

  type BookingRow = { id: string; client_name: string; start_date: string; end_date: string; notes?: string; cars?: unknown };
  for (const b of bookings as BookingRow[]) {
    const carName = (b.cars as { name?: string } | null)?.name ?? 'Véhicule';
    const eventId = await createCalendarEvent(b.id, b.client_name, carName, b.start_date, b.end_date, b.notes);
    if (eventId) synced++;
  }

  return synced;
}

// ── OAuth2 flow ────────────────────────────────────────────────

export function getAuthUrl(): string {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? '';
  const redirectUri = process.env['GOOGLE_REDIRECT_URI'] ?? 'https://ibrahim-backend-production.up.railway.app/api/calendar/callback';

  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    login_hint: TARGET_EMAIL,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<boolean> {
  const clientId     = process.env['GOOGLE_CLIENT_ID'] ?? '';
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? '';
  const redirectUri  = process.env['GOOGLE_REDIRECT_URI'] ?? 'https://ibrahim-backend-production.up.railway.app/api/calendar/callback';

  try {
    const { data } = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const expiresAt = new Date(Date.now() + (data.expires_in as number) * 1000).toISOString();

    await supabase.from('google_oauth_tokens').upsert({
      email:         TARGET_EMAIL,
      access_token:  data.access_token as string,
      refresh_token: data.refresh_token as string,
      token_type:    'Bearer',
      expires_at:    expiresAt,
      scope:         data.scope as string,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'email' });

    return true;
  } catch (err) {
    console.error('[google-calendar] OAuth exchange failed:', err);
    return false;
  }
}
