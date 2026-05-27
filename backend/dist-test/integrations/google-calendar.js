"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUpcomingEvents = listUpcomingEvents;
exports.createCalendarEvent = createCalendarEvent;
exports.updateCalendarEvent = updateCalendarEvent;
exports.deleteCalendarEvent = deleteCalendarEvent;
exports.syncPendingBookings = syncPendingBookings;
exports.getAuthUrl = getAuthUrl;
exports.exchangeCodeForTokens = exchangeCodeForTokens;
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const supabase_js_1 = require("./supabase.js");
const env_js_1 = require("../config/env.js");
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_ID = 'fikconciergerie@gmail.com';
// ── Service Account JWT auth ──────────────────────────────────
let cachedSAToken = null;
function getServiceAccount() {
    const raw = env_js_1.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        console.error('[google-calendar] Invalid GOOGLE_SERVICE_ACCOUNT_JSON');
        return null;
    }
}
function buildJwt(sa) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        iss: sa.client_email, scope: CALENDAR_SCOPE,
        aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600,
    })).toString('base64url');
    const sign = crypto_1.default.createSign('RSA-SHA256');
    sign.update(`${header}.${payload}`);
    return `${header}.${payload}.${sign.sign(sa.private_key, 'base64url')}`;
}
async function getServiceAccountToken() {
    if (cachedSAToken && Date.now() < cachedSAToken.expiresAt - 60_000)
        return cachedSAToken.value;
    const sa = getServiceAccount();
    if (!sa)
        return null;
    try {
        const { data } = await axios_1.default.post(GOOGLE_TOKEN_URL, new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: buildJwt(sa),
        }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        cachedSAToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
        return cachedSAToken.value;
    }
    catch (err) {
        console.error('[google-calendar] SA token failed:', err);
        return null;
    }
}
async function getOAuthToken() {
    const { data } = await supabase_js_1.supabase
        .from('google_oauth_tokens').select('access_token, refresh_token, expires_at')
        .eq('email', CALENDAR_ID).single();
    if (!data)
        return null;
    const token = data;
    if (Date.now() < new Date(token.expires_at).getTime() - 60_000)
        return token.access_token;
    try {
        const { data: r } = await axios_1.default.post(GOOGLE_TOKEN_URL, new URLSearchParams({
            grant_type: 'refresh_token', refresh_token: token.refresh_token,
            client_id: env_js_1.env.GOOGLE_CLIENT_ID ?? '',
            client_secret: env_js_1.env.GOOGLE_CLIENT_SECRET ?? '',
        }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        await supabase_js_1.supabase.from('google_oauth_tokens').upsert({
            email: CALENDAR_ID, access_token: r.access_token,
            refresh_token: token.refresh_token, token_type: 'Bearer',
            expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'email' });
        return r.access_token;
    }
    catch {
        return null;
    }
}
async function getAccessToken() {
    return (await getServiceAccountToken()) ?? (await getOAuthToken());
}
// ── Calendar API ──────────────────────────────────────────────
async function calendarRequest(method, path, body) {
    const token = await getAccessToken();
    if (!token) {
        console.error('[google-calendar] No token — set GOOGLE_SERVICE_ACCOUNT_JSON');
        return null;
    }
    try {
        const res = await axios_1.default.request({
            method, url: `${GOOGLE_CALENDAR_BASE}${path}`,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            data: body,
        });
        return res.data;
    }
    catch (err) {
        const axErr = err;
        if (axErr?.response) {
            console.error(`[google-calendar] ${method} ${path} HTTP ${axErr.response.status}:`, JSON.stringify(axErr.response.data));
        }
        else {
            console.error(`[google-calendar] ${method} ${path}:`, err instanceof Error ? err.message : err);
        }
        return null;
    }
}
// ── Public API ────────────────────────────────────────────────
async function listUpcomingEvents(maxResults = 20) {
    const res = await calendarRequest('GET', `/calendars/${encodeURIComponent(CALENDAR_ID)}/events?maxResults=${maxResults}&orderBy=startTime&singleEvents=true&timeMin=${new Date().toISOString()}`);
    return res?.items ?? [];
}
async function createCalendarEvent(bookingId, clientName, carName, startDate, endDate, notes) {
    const event = {
        summary: `🚗 ${clientName} — ${carName}`,
        description: `Réservation Fik Conciergerie\nClient: ${clientName}\nVéhicule: ${carName}${notes ? `\nNotes: ${notes}` : ''}\nBooking ID: ${bookingId}`,
        start: { dateTime: `${startDate}T09:00:00`, timeZone: 'Africa/Algiers' },
        end: { dateTime: `${endDate}T18:00:00`, timeZone: 'Africa/Algiers' },
        colorId: '2',
    };
    const created = await calendarRequest('POST', `/calendars/${encodeURIComponent(CALENDAR_ID)}/events`, event);
    if (!created?.id)
        return null;
    await supabase_js_1.supabase.from('calendar_events').upsert({
        booking_id: bookingId, google_event_id: created.id, calendar_id: CALENDAR_ID,
        title: event.summary,
        start_datetime: new Date(`${startDate}T09:00:00`).toISOString(),
        end_datetime: new Date(`${endDate}T18:00:00`).toISOString(),
        status: 'synced',
    }, { onConflict: 'google_event_id' });
    return created.id;
}
async function updateCalendarEvent(googleEventId, updates) {
    const patch = {};
    if (updates.summary)
        patch.summary = updates.summary;
    if (updates.description)
        patch.description = updates.description;
    if (updates.startDate)
        patch.start = { dateTime: `${updates.startDate}T09:00:00`, timeZone: 'Africa/Algiers' };
    if (updates.endDate)
        patch.end = { dateTime: `${updates.endDate}T18:00:00`, timeZone: 'Africa/Algiers' };
    const res = await calendarRequest('PATCH', `/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${googleEventId}`, patch);
    if (res)
        await supabase_js_1.supabase.from('calendar_events').update({ status: 'synced', updated_at: new Date().toISOString() }).eq('google_event_id', googleEventId);
    return !!res;
}
async function deleteCalendarEvent(googleEventId) {
    await calendarRequest('DELETE', `/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${googleEventId}`);
    await supabase_js_1.supabase.from('calendar_events').update({ status: 'deleted' }).eq('google_event_id', googleEventId);
    return true;
}
async function syncPendingBookings() {
    const { data: existingEvents } = await supabase_js_1.supabase
        .from('calendar_events').select('booking_id');
    const alreadySyncedIds = (existingEvents ?? []).map((r) => r.booking_id).filter(Boolean);
    let query = supabase_js_1.supabase
        .from('bookings').select('id, client_name, start_date, end_date, notes, cars(name)')
        .in('status', ['CONFIRMED', 'ACTIVE']);
    if (alreadySyncedIds.length > 0)
        query = query.not('id', 'in', `(${alreadySyncedIds.join(',')})`);
    const { data: bookings } = await query;
    if (!bookings?.length)
        return 0;
    let count = 0;
    for (const b of bookings) {
        const carName = b.cars?.name ?? 'Véhicule';
        if (await createCalendarEvent(b.id, b.client_name, carName, b.start_date, b.end_date, b.notes))
            count++;
    }
    return count;
}
// ── OAuth (kept for backward compat) ──────────────────────────
function getAuthUrl() {
    const params = new URLSearchParams({
        client_id: env_js_1.env.GOOGLE_CLIENT_ID ?? '', response_type: 'code',
        redirect_uri: env_js_1.env.GOOGLE_REDIRECT_URI ?? 'https://ibrahim-backend-production.up.railway.app/api/calendar/callback',
        scope: CALENDAR_SCOPE, access_type: 'offline', prompt: 'consent', login_hint: CALENDAR_ID,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
async function exchangeCodeForTokens(code) {
    try {
        const { data } = await axios_1.default.post(GOOGLE_TOKEN_URL, new URLSearchParams({
            code, grant_type: 'authorization_code',
            client_id: env_js_1.env.GOOGLE_CLIENT_ID ?? '',
            client_secret: env_js_1.env.GOOGLE_CLIENT_SECRET ?? '',
            redirect_uri: env_js_1.env.GOOGLE_REDIRECT_URI ?? 'https://ibrahim-backend-production.up.railway.app/api/calendar/callback',
        }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        await supabase_js_1.supabase.from('google_oauth_tokens').upsert({
            email: CALENDAR_ID, access_token: data.access_token,
            refresh_token: data.refresh_token, token_type: 'Bearer',
            expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
            scope: data.scope, updated_at: new Date().toISOString(),
        }, { onConflict: 'email' });
        return true;
    }
    catch (err) {
        console.error('[google-calendar] OAuth exchange failed:', err);
        return false;
    }
}
//# sourceMappingURL=google-calendar.js.map