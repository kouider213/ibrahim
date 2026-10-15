import crypto from 'crypto';
import axios from 'axios';
import { supabase } from './supabase.js';
import { env } from '../config/env.js';

const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL     = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE       = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_ID          = 'fikconciergerie@gmail.com';
const getHouariCalId       = () => env.HOUARI_GCAL_ID   ?? 'houari.douba@gmail.com';

interface ServiceAccountKey {
  client_email: string;
  private_key:  string;
}

interface CalendarEvent {
  id?:          string;
  summary:      string;
  description?: string;
  location?:    string;   // adresse / lieu du RDV (champ standard Google Calendar)
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

// Dernière erreur Google (pour dire « pas d'accès » au lieu de « agenda vide »)
let lastCalendarError: { status?: number; msg: string } | null = null;

async function calendarRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: object,
): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) { lastCalendarError = { msg: 'no_token' }; console.error('[google-calendar] No token — set GOOGLE_SERVICE_ACCOUNT_JSON'); return null; }
  try {
    const res = await axios.request<T>({
      method, url: `${GOOGLE_CALENDAR_BASE}${path}`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: body,
    });
    return res.data;
  } catch (err: unknown) {
    const axErr = err as { response?: { status?: number; data?: unknown } };
    lastCalendarError = { status: axErr?.response?.status, msg: axErr?.response ? JSON.stringify(axErr.response.data).slice(0, 300) : (err instanceof Error ? err.message : String(err)) };
    if (axErr?.response) {
      console.error(`[google-calendar] ${method} ${path} HTTP ${axErr.response.status}:`, JSON.stringify(axErr.response.data));
    } else {
      console.error(`[google-calendar] ${method} ${path}:`, err instanceof Error ? err.message : err);
    }
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
  const { data: existingEvents } = await supabase
    .from('calendar_events').select('booking_id');
  const alreadySyncedIds = (existingEvents ?? []).map((r: { booking_id: string }) => r.booking_id).filter(Boolean);

  let query = supabase
    .from('bookings').select('id, client_name, start_date, end_date, notes, cars(name)')
    .in('status', ['CONFIRMED', 'ACTIVE']);
  if (alreadySyncedIds.length > 0) query = query.not('id', 'in', `(${alreadySyncedIds.join(',')})`);

  const { data: bookings } = await query;
  if (!bookings?.length) return 0;
  let count = 0;
  type BookingRow = { id: string; client_name: string; start_date: string; end_date: string; notes?: string; cars?: unknown };
  for (const b of bookings as BookingRow[]) {
    const carName = (b.cars as { name?: string } | null)?.name ?? 'Véhicule';
    if (await createCalendarEvent(b.id, b.client_name, carName, b.start_date, b.end_date, b.notes)) count++;
  }
  return count;
}

// ── Agenda de Kouider = agenda FIK (fikconciergerie@gmail.com) ──────────────
// Décision Kouider 2026-10-15 : Dzaryx n'a accès QU'À l'agenda FIK, jamais à son agenda perso (kouiderpablo@gmail.com).
// Ses RDV (pro, perso qu'il veut confier à Dzaryx, FIK Sites…) sont donc tous dans l'agenda FIK.

export interface AgendaEvent {
  id?: string; summary: string; description?: string; location?: string; recurringEventId?: string; transparency?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
}
const fikPath = (rest = '') => `/calendars/${encodeURIComponent(CALENDAR_ID)}${rest}`;

// RDV avec heure, lieu, notes (pas une réservation de voiture : pour ça createCalendarEvent)
export async function createAgendaEvent(
  title: string, startDateTime: string, endDateTime: string, description?: string, allDay?: boolean, location?: string,
  opts: { recurrence?: string[]; transparent?: boolean; timeZone?: string } = {},
): Promise<string | null> {
  const body: Record<string, unknown> = { summary: title };
  if (opts.recurrence?.length) body['recurrence'] = opts.recurrence;      // ex. ['RRULE:FREQ=WEEKLY;BYDAY=TH']
  if (opts.transparent) body['transparency'] = 'transparent';            // « libre » : ne bloque pas les créneaux
  if (description) body['description'] = description;
  if (location) body['location'] = location;
  if (allDay) {
    body['start'] = { date: startDateTime.slice(0, 10) };
    body['end']   = { date: endDateTime.slice(0, 10) };
  } else {
    const tz = opts.timeZone ?? 'Africa/Algiers';
    body['start'] = { dateTime: startDateTime.includes('T') ? startDateTime : `${startDateTime}T09:00:00`, timeZone: tz };
    body['end']   = { dateTime: endDateTime.includes('T')   ? endDateTime   : `${endDateTime}T10:00:00`,   timeZone: tz };
  }
  const created = await calendarRequest<{ id: string }>('POST', fikPath('/events'), body);
  return created?.id ?? null;
}

// Événements sur une période (ex. aujourd'hui, un jour précis, la semaine) — null = pas d'accès
export async function listAgendaRange(fromIso: string, toIso: string, max = 50): Promise<AgendaEvent[] | null> {
  const res = await calendarRequest<{ items: AgendaEvent[] }>('GET',
    fikPath(`/events?maxResults=${max}&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(fromIso)}&timeMax=${encodeURIComponent(toIso)}`));
  return res ? (res.items ?? []) : null;
}

// Modifier un RDV : titre, horaires (avec l'heure), lieu, notes — seuls les champs donnés changent
export async function updateAgendaEvent(googleEventId: string, u: Partial<{ title: string; start: string; end: string; description: string; location: string; allDay: boolean }>): Promise<boolean> {
  const patch: Record<string, unknown> = {};
  if (u.title) patch['summary'] = u.title;
  if (u.description !== undefined) patch['description'] = u.description;
  if (u.location !== undefined) patch['location'] = u.location;
  const when = (v: string, dflt: string) => u.allDay ? { date: v.slice(0, 10) } : { dateTime: v.includes('T') ? v : `${v}T${dflt}`, timeZone: 'Africa/Algiers' };
  if (u.start) patch['start'] = when(u.start, '09:00:00');
  if (u.end) patch['end'] = when(u.end, '10:00:00');
  if (u.start && !u.end && !u.allDay && u.start.includes('T')) {        // même durée par défaut : +1 h
    const e = new Date(new Date(`${u.start}Z`).getTime() + 3600_000).toISOString().slice(0, 19);
    patch['end'] = { dateTime: e, timeZone: 'Africa/Algiers' };
  }
  const r = await calendarRequest('PATCH', fikPath(`/events/${encodeURIComponent(googleEventId)}`), patch);
  return r !== null;
}

// Modifier TOUTE une série (événement qui se répète) : nouveau titre et/ou nouvelles heures (HH:MM), même jour de
// départ et même fuseau que la série (ex. Europe/Brussels) → toutes les semaines suivent.
export async function updateAgendaSeries(anyId: string, u: { title?: string; startTime?: string; endTime?: string; location?: string }): Promise<boolean> {
  const inst = await calendarRequest<AgendaEvent>('GET', fikPath(`/events/${encodeURIComponent(anyId)}`));
  const masterId = inst?.recurringEventId ?? anyId.split('_')[0]!;
  const m = await calendarRequest<AgendaEvent>('GET', fikPath(`/events/${encodeURIComponent(masterId)}`));
  if (!m) return false;
  const patch: Record<string, unknown> = {};
  if (u.title) patch['summary'] = u.title;
  if (u.location !== undefined) patch['location'] = u.location;
  const at = (orig: { dateTime?: string; timeZone?: string }, hhmm: string) => ({ dateTime: `${orig.dateTime!.slice(0, 10)}T${hhmm}:00`, timeZone: orig.timeZone ?? 'Europe/Brussels' });
  if (u.startTime && m.start.dateTime) patch['start'] = at(m.start, u.startTime);
  if (u.endTime && m.end.dateTime) patch['end'] = at(m.end, u.endTime);
  const r = await calendarRequest('PATCH', fikPath(`/events/${encodeURIComponent(masterId)}`), patch);
  return r !== null;
}

/** Décale une série récurrente de quelques minutes (début et/ou fin), en temps absolu (insensible au fuseau de la série).
 *  onlyDays : n'agit que si la série ne tombe QUE sur ces jours (BYDAY), sinon renvoie 'skip'. */
export async function shiftAgendaSeries(anyId: string, startMin: number, endMin: number, onlyDays?: string[]): Promise<'ok' | 'skip' | 'fail'> {
  const inst = await calendarRequest<AgendaEvent>('GET', fikPath(`/events/${encodeURIComponent(anyId)}`));
  const masterId = inst?.recurringEventId ?? anyId.split('_')[0]!;
  const m = await calendarRequest<AgendaEvent & { recurrence?: string[] }>('GET', fikPath(`/events/${encodeURIComponent(masterId)}`));
  if (!m?.start.dateTime || !m.end.dateTime) return 'fail';
  if (onlyDays) {
    const by = (m.recurrence ?? []).join(';').match(/BYDAY=([A-Z,]+)/)?.[1]?.split(',') ?? [];
    if (!by.length || by.some(d => !onlyDays.includes(d))) return 'skip';
  }
  const mv = (t: { dateTime?: string; timeZone?: string }, min: number) => ({ dateTime: new Date(new Date(t.dateTime!).getTime() + min * 60_000).toISOString(), timeZone: t.timeZone ?? 'Europe/Brussels' });
  const r = await calendarRequest('PATCH', fikPath(`/events/${encodeURIComponent(masterId)}`), { start: mv(m.start, startMin), end: mv(m.end, endMin) });
  return r !== null ? 'ok' : 'fail';
}

// Créneaux « 🟢 Libre » de l'agenda FIK (transparents) sur une période — là où Dzaryx peut donner des RDV
export async function listFreeWindows(fromIso: string, toIso: string): Promise<Array<{ start: number; end: number }>> {
  const evs = await listAgendaRange(fromIso, toIso, 250);
  return (evs ?? []).filter(e => (e.summary ?? '').startsWith('🟢') && e.start.dateTime && e.end.dateTime)
    .map(e => ({ start: new Date(e.start.dateTime!).getTime(), end: new Date(e.end.dateTime!).getTime() }));
}

export async function deleteAgendaEvent(googleEventId: string): Promise<boolean> {
  const r = await calendarRequest('DELETE', fikPath(`/events/${encodeURIComponent(googleEventId)}`));
  if (r !== null) await supabase.from('calendar_events').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('google_event_id', googleEventId);
  return r !== null;
}

// Dzaryx a-t-il bien accès à l'agenda FIK ? (sinon on le dit clairement, jamais « agenda vide »)
export async function agendaAccess(): Promise<{ ok: boolean; calendar: string; reason?: string }> {
  const r = await calendarRequest<{ id: string }>('GET', fikPath());
  if (r) return { ok: true, calendar: CALENDAR_ID };
  const e = lastCalendarError;
  return { ok: false, calendar: CALENDAR_ID, reason: e?.msg === 'no_token' ? 'Aucune clé Google configurée sur le serveur' : `Erreur Google ${e?.status ?? ''} ${e?.msg ?? ''}`.trim() };
}

// ── Houari personal calendar ──────────────────────────────────

export async function listHouariEvents(maxResults = 15): Promise<CalendarEvent[]> {
  const calId = getHouariCalId();
  const res = await calendarRequest<{ items: CalendarEvent[] }>('GET',
    `/calendars/${encodeURIComponent(calId)}/events?maxResults=${maxResults}&orderBy=startTime&singleEvents=true&timeMin=${new Date().toISOString()}`);
  return res?.items ?? [];
}

export async function createHouariCalendarEvent(
  title: string,
  startDateTime: string,
  endDateTime: string,
  description?: string,
  allDay?: boolean,
): Promise<string | null> {
  const calId = getHouariCalId();
  const body: Record<string, unknown> = { summary: title };
  if (description) body['description'] = description;
  if (allDay) {
    body['start'] = { date: startDateTime.slice(0, 10) };
    body['end']   = { date: endDateTime.slice(0, 10) };
  } else {
    body['start'] = { dateTime: startDateTime.includes('T') ? startDateTime : `${startDateTime}T09:00:00`, timeZone: 'Africa/Algiers' };
    body['end']   = { dateTime: endDateTime.includes('T')   ? endDateTime   : `${endDateTime}T10:00:00`,   timeZone: 'Africa/Algiers' };
  }
  const created = await calendarRequest<{ id: string }>('POST', `/calendars/${encodeURIComponent(calId)}/events`, body);
  return created?.id ?? null;
}

export async function deleteHouariCalendarEvent(googleEventId: string): Promise<boolean> {
  const calId = getHouariCalId();
  await calendarRequest('DELETE', `/calendars/${encodeURIComponent(calId)}/events/${googleEventId}`);
  return true;
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

// ── Créneaux libres (rendez-vous proposés aux prospects intéressés) ──

/**
 * Prochains créneaux libres de Kouider (agenda perso + agenda pro), en semaine 10h-17h heure d'Oran,
 * à partir du surlendemain, un seul par jour. Retourne des ISO (UTC). [] si l'agenda est inaccessible.
 */
export async function findFreeSlots(count = 3, durationMin = 30): Promise<string[]> {
  const from = new Date(Date.now() + 36 * 3600_000);
  const to   = new Date(Date.now() + 12 * 86_400_000);
  const res = await calendarRequest<{ calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }> }>('POST', '/freeBusy', {
    timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: 'Africa/Algiers',
    items: [{ id: CALENDAR_ID }],
  });
  if (!res?.calendars) return [];
  const busy = Object.values(res.calendars).flatMap(c => c.busy ?? [])
    .map(b => [new Date(b.start).getTime(), new Date(b.end).getTime()] as const);
  const free = (s: number) => !busy.some(([bs, be]) => s < be && s + durationMin * 60_000 > bs);
  // Jours de congé de Kouider (lundi + jeudi par défaut, réglables) : jamais de rendez-vous proposé
  const daysOff = await import('./kouider-dossier.js').then(m => m.getDaysOff()).catch(() => [] as number[]);

  // 1) D'abord les créneaux « 🟢 Libre — RDV possibles » que Kouider garde pour ça (un RDV par jour, jours différents)
  const windows = await listFreeWindows(from.toISOString(), to.toISOString()).catch(() => []);
  const picked: string[] = [], usedDays = new Set<string>();
  for (const w of windows.sort((a, b) => a.start - b.start)) {
    if (picked.length >= count) break;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date(w.start));
    const dow = new Date(`${day}T12:00:00+01:00`).getUTCDay();
    if (usedDays.has(day) || daysOff.includes(dow) || dow === 5 || dow === 6) continue;   // congé + week-end algérien
    for (let t = w.start; t + durationMin * 60_000 <= w.end; t += 30 * 60_000) {
      if (t > from.getTime() && free(t)) { picked.push(new Date(t).toISOString()); usedDays.add(day); break; }
    }
  }
  if (picked.length) return picked;

  // 2) Sinon : horaires de bureau classiques
  const slots: string[] = [];
  for (let d = 0; d < 12 && slots.length < count; d++) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date(from.getTime() + d * 86_400_000));
    const dow = new Date(`${day}T12:00:00+01:00`).getUTCDay();
    if (dow === 5 || dow === 6) continue;  // vendredi-samedi : week-end en Algérie
    if (daysOff.includes(dow)) continue;   // congé de Kouider
    // Un horaire différent selon le jour (matin / début d'après-midi / fin d'après-midi) pour laisser le choix
    const hours = [[10, 11, 12], [14, 15, 11], [16, 10, 15]][slots.length % 3]!;
    const hit = hours.map(h => new Date(`${day}T${String(h).padStart(2, '0')}:00:00+01:00`).getTime()).find(t => t > from.getTime() && free(t));
    if (hit) slots.push(new Date(hit).toISOString());
  }
  return slots;
}
