import crypto from 'crypto';
import axios from 'axios';
import { supabase } from './supabase.js';
import { env } from '../config/env.js';

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL     = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE       = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_ID          = 'fikconciergerie@gmail.com';

interface ServiceAccountKey {
  client_email: string;
  private_key:  string;
}

interface CalendarEvent {
  id?:          string;
  summary:      string;
  description?: string;
  start:        { dateTime: string; timeZone: string };
  end:          { dateTime: string; timeZone: string };
  colorId?:     string;
}

// ── Service Account JWT auth ──────────────────────────────────

let cachedSAToken: { value: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccountKey | null {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw) as ServiceAccountKey; }
  catch { console.error('[google-calendar] Invalid GOOGLE_SERVICE_ACCOUNT_JSON'); return null; }
}

function buildJwt(sa: ServiceAccountKey): string {
  const now     = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email, scope: CALENDAR_SCOPE,
    aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600,
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  return `${header}.${payload}.${sign.sign(sa.private_key, 'base64url')}`;
}

async function getServiceAccountToken(): Promise<string | null> {
  if (cachedSAToken && Date.now() < cachedSAToken.expiresAt - 60_000) return cachedSAToken.value;
  const sa = getServiceAccount();
  if (!sa) return null;
  try {
    const { data } = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  buildJwt(sa),
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    cachedSAToken = { value: data.access_token as string, expiresAt: Date.now() + (data.expires_in as number) * 1000 };
    return cachedSAToken.value;
  } catch (err) {
    console.error('[google-calendar] SA token failed:', err);
    return null;
  }
}

// ── OAuth fallback ────────────────────────────────────────────

interface OAuthToken { access_token: string; refresh_token: string; expires_at: string; }

async function getOAuthToken(): Promise<string | null> {
  const { data } = await supabase
    .from('google_oauth_tokens').select('access_token, refresh_token, expires_at')
    .eq('email', CALENDAR_ID).single();
  if (!data) return null;
  const token = data as OAuthToken;
  if (Date.now() < new Date(token.expires_at).getTime() - 60_000) return token.access_token;
  try {
    const { data: r } = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: token.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    await supabase.from('google_oauth_tokens').upsert({
      email: CALENDAR_ID, access_token: r.access_token as string,
      refresh_token: token.refresh_token, token_type: 'Bearer',
      expires_at: new Date(Date.now() + (r.expires_in as number) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });
    return r.access_token as string;
  } catch { return null; }
}

async function getAccessToken(): Promise<string | null> {
  return (await getServiceAccountToken()) ?? (await getOAuthToken());
}

// ── Calendar API ──────────────────────────────────────────────

async function calendarRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: object,
): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) { console.error('[google-calendar] No token — set GOOGLE_SERVICE_ACCOUNT_JSON'); return null; }
  try {
    const res = await axios.request<T>({
      method, url: `${GOOGLE_CALENDAR_BASE}${path}`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: body,
    });
    return res.data;
  } catch (err) {
    console.error(`[google-calendar] ${method} ${path}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────

export async function listUpcomingEvents(maxResults = 20): Promise<CalendarEvent[]> {
  const res = await calendarRequest<{ items: CalendarEvent[] }>('GET',
    `/calendars/${encodeURIComponent(CALENDAR_ID)}/events?maxResults=${maxResults}&orderBy=startTime&singleEvents=true&timeMin=${new Date().toISOString()}`);
  return res?.items ?? [];
}

export async function createCalendarEvent(
  bookingId: string, clientName: string, carName: string,
  startDate: string, endDate: string, notes?: string,
): Promise<string | null> {
  const event: CalendarEvent = {
    summary:     `🚗 ${clientName} — ${carName}`,
    description: `Réservation Fik Conciergerie\nClient: ${clientName}\nVéhicule: ${carName}${notes ? `\nNotes: ${notes}` : ''}\nBooking ID: ${bookingId}`,
    start: { dateTime: `${startDate}T09:00:00`, timeZone: 'Africa/Algiers' },
    end:   { dateTime: `${endDate}T18:00:00`,   timeZone: 'Africa/Algiers' },
    colorId: '2',
  };
  const created = await calendarRequest<{ id: string }>(
    'POST', `/calendars/${encodeURIComponent(CALENDAR_ID)}/events`, event);
  if (!created?.id) return null;
  await supabase.from('calendar_events').upsert({
    booking_id: bookingId, google_event_id: created.id, calendar_id: CALENDAR_ID,
    title: event.summary,
    start_datetime: new Date(`${startDate}T09:00:00`).toISOString(),
    end_datetime:   new Date(`${endDate}T18:00:00`).toISOString(),
    status: 'synced',
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
  const res = await calendarRequest('PATCH', `/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${googleEventId}`, patch);
  if (res) await supabase.from('calendar_events').update({ status: 'synced', updated_at: new Date().toISOString() }).eq('google_event_id', googleEventId);
  return !!res;
}

export async function deleteCalendarEvent(googleEventId: string): Promise<boolean> {
  await calendarRequest('DELETE', `/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${googleEventId}`);
  await supabase.from('calendar_events').update({ status: 'deleted' }).eq('google_event_id', googleEventId);
  return true;
}

export async function syncPendingBookings(): Promise<number> {
  const { data: bookings } = await supabase
    .from('bookings').select('id, client_name, start_date, end_date, notes, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE'])
    .not('id', 'in', supabase.from('calendar_events').select('booking_id'));
  if (!bookings?.length) return 0;
  let synced = 0;
  type BookingRow = { id: string; client_name: string; start_date: string; end_date: string; notes?: string; cars?: unknown };
  for (const b of bookings as BookingRow[]) {
    const carName = (b.cars as { name?: string } | null)?.name ?? 'Véhicule';
    if (await createCalendarEvent(b.id, b.client_name, carName, b.start_date, b.end_date, b.notes)) synced++;
  }
  return synced;
}

// ── OAuth (kept for backward compat) ──────────────────────────

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '', response_type: 'code',
    redirect_uri: env.GOOGLE_REDIRECT_URI ?? 'https://ibrahim-backend-production.up.railway.app/api/calendar/callback',
    scope: CALENDAR_SCOPE, access_type: 'offline', prompt: 'consent', login_hint: CALENDAR_ID,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<boolean> {
  try {
    const { data } = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
      code, grant_type: 'authorization_code',
      client_id:     env.GOOGLE_CLIENT_ID     ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri:  env.GOOGLE_REDIRECT_URI  ?? 'https://ibrahim-backend-production.up.railway.app/api/calendar/callback',
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    await supabase.from('google_oauth_tokens').upsert({
      email: CALENDAR_ID, access_token: data.access_token as string,
      refresh_token: data.refresh_token as string, token_type: 'Bearer',
      expires_at: new Date(Date.now() + (data.expires_in as number) * 1000).toISOString(),
      scope: data.scope as string, updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });
    return true;
  } catch (err) {
    console.error('[google-calendar] OAuth exchange failed:', err);
    return false;
  }
}
