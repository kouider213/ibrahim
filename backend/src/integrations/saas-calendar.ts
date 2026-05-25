import crypto from 'crypto';
import axios from 'axios';
import { supabase } from './supabase.js';
import { env } from '../config/env.js';

interface ServiceAccountKey {
  client_email: string;
  private_key:  string;
  project_id?:  string;
}

const GOOGLE_TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPE    = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_BASE     = 'https://www.googleapis.com/calendar/v3';

// Per-org token cache (keyed by orgId)
const tokenCache = new Map<string, { value: string; expiresAt: number }>();

// Fetch service account for org (from integrations JSON or main env)
async function getOrgServiceAccount(orgId: string): Promise<{ sa: ServiceAccountKey; calendarId: string } | null> {
  const { data: cfg } = await supabase
    .from('org_configs')
    .select('integrations, business_profile')
    .eq('org_id', orgId)
    .maybeSingle();

  const integ   = cfg?.integrations   as Record<string, string> | null;
  const profile = cfg?.business_profile as Record<string, string> | null;

  // Org-specific service account
  if (integ?.google_service_account_json) {
    try {
      const sa = JSON.parse(integ.google_service_account_json) as ServiceAccountKey;
      const calendarId = integ.google_calendar_id ?? profile?.owner_email ?? sa.client_email;
      return { sa, calendarId };
    } catch { /* invalid JSON */ }
  }

  // Fallback: main shared service account (Kouider's)
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      const sa = JSON.parse(raw) as ServiceAccountKey;
      return { sa, calendarId: 'fikconciergerie@gmail.com' };
    } catch { /* invalid JSON */ }
  }

  return null;
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

async function getOrgToken(orgId: string, sa: ServiceAccountKey): Promise<string | null> {
  const cached = tokenCache.get(orgId);
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.value;

  try {
    const jwt = buildJwt(sa);
    const res = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const tok = { value: (res.data as { access_token: string }).access_token, expiresAt: Date.now() + 3500_000 };
    tokenCache.set(orgId, tok);
    return tok.value;
  } catch (err) {
    console.error(`[saas-calendar] Token error org ${orgId}:`, axios.isAxiosError(err) ? err.message : String(err));
    return null;
  }
}

export interface SaasCalendarEvent {
  summary:      string;
  description?: string;
  start:        string;  // ISO datetime
  end:          string;  // ISO datetime
  timezone?:    string;
}

// List upcoming events for an org
export async function listOrgCalendarEvents(
  orgId:     string,
  maxEvents: number = 10,
): Promise<Array<{ id: string; summary: string; start: string; end: string }>> {
  const account = await getOrgServiceAccount(orgId);
  if (!account) return [];

  const token = await getOrgToken(orgId, account.sa);
  if (!token) return [];

  const url = `${CALENDAR_BASE}/calendars/${encodeURIComponent(account.calendarId)}/events`;
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        timeMin:    new Date().toISOString(),
        maxResults: maxEvents,
        orderBy:    'startTime',
        singleEvents: true,
      },
    });

    type GEvent = { id: string; summary: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } };
    return ((res.data as { items: GEvent[] }).items ?? []).map(e => ({
      id:      e.id,
      summary: e.summary,
      start:   e.start.dateTime ?? e.start.date ?? '',
      end:     e.end.dateTime   ?? e.end.date   ?? '',
    }));
  } catch {
    return [];
  }
}

// Create event for an org
export async function createOrgCalendarEvent(
  orgId:    string,
  event:    SaasCalendarEvent,
): Promise<{ id: string; htmlLink: string } | null> {
  const account = await getOrgServiceAccount(orgId);
  if (!account) return null;

  const token = await getOrgToken(orgId, account.sa);
  if (!token) return null;

  const tz  = event.timezone ?? 'Africa/Algiers';
  const url = `${CALENDAR_BASE}/calendars/${encodeURIComponent(account.calendarId)}/events`;

  try {
    const res = await axios.post(url, {
      summary:     event.summary,
      description: event.description,
      start:       { dateTime: event.start, timeZone: tz },
      end:         { dateTime: event.end,   timeZone: tz },
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

    return { id: (res.data as { id: string }).id, htmlLink: (res.data as { htmlLink: string }).htmlLink };
  } catch (err) {
    console.error(`[saas-calendar] Create event error org ${orgId}:`, axios.isAxiosError(err) ? err.message : String(err));
    return null;
  }
}

// Delete event for an org
export async function deleteOrgCalendarEvent(orgId: string, eventId: string): Promise<boolean> {
  const account = await getOrgServiceAccount(orgId);
  if (!account) return false;

  const token = await getOrgToken(orgId, account.sa);
  if (!token) return false;

  const url = `${CALENDAR_BASE}/calendars/${encodeURIComponent(account.calendarId)}/events/${eventId}`;
  try {
    await axios.delete(url, { headers: { Authorization: `Bearer ${token}` } });
    return true;
  } catch {
    return false;
  }
}
