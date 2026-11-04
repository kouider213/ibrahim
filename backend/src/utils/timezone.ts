// ── Timezone utilities — no external dependencies, Node 18+ Intl only ────────

export const FALLBACK_TZ = 'Europe/Brussels';

// ── Validation ────────────────────────────────────────────────────────────────
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── UTC offset in milliseconds (positive = ahead of UTC) ─────────────────────
// Uses toLocaleString trick — accurate to the minute, handles DST correctly.
export function getUTCOffsetMs(tz: string, date: Date = new Date()): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr  = date.toLocaleString('en-US', { timeZone: tz });
  return new Date(tzStr).getTime() - new Date(utcStr).getTime();
}

export function getUTCOffsetMinutes(tz: string, date: Date = new Date()): number {
  return Math.round(getUTCOffsetMs(tz, date) / 60_000);
}

// Returns "+02:00" / "-05:30" style string
export function getUTCOffsetString(tz: string, date: Date = new Date()): string {
  const mins = getUTCOffsetMinutes(tz, date);
  const sign = mins >= 0 ? '+' : '-';
  const h    = String(Math.floor(Math.abs(mins) / 60)).padStart(2, '0');
  const m    = String(Math.abs(mins) % 60).padStart(2, '0');
  return `${sign}${h}:${m}`;
}

// ── Format a UTC Date as local ISO string (without Z suffix) ─────────────────
// e.g. "2026-05-10T20:00:00" in Europe/Brussels
export function toLocalISO(date: Date, tz: string): string {
  const f = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  return f.format(date).replace(' ', 'T');
}

// ── Dates/heures telles que le cerveau les écrit (05/11 banc « comme Kouider ») ──
// « 18h30 », « 18h », « 9H », « 18:30:00 » → « 18:30 ». null si illisible.
export function normalizeHHMM(raw: unknown): string | null {
  const m = /^\s*(\d{1,2})\s*(?:[:hH]\s*(\d{1,2})?)?(?::\d{2})?\s*$/.exec(String(raw ?? ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] ?? 0);
  if (h > 23 || mi > 59 || (!/[:hH]/.test(String(raw)))) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/** « 2026-11-16 », « 2026-11-16T10:00 », « 16/11/2026 », « 16-11-2026 », « 16.11.26 », « 16/11 » → { date: YYYY-MM-DD, time? }.
 *  Année PASSÉE écrite par erreur (le cerveau met souvent l'année d'avant) → prochaine occurrence à partir d'hier. */
export function normalizeYMD(raw: unknown, today = new Date().toISOString().slice(0, 10)): { date: string; time?: string; yearFixed?: boolean } | null {
  const s = String(raw ?? '').trim();
  let y: number, mo: number, d: number, time: string | undefined;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}:\d{2}))?/.exec(s);
  if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; time = m[4]; }
  else if ((m = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?(?:\s+(?:à\s+)?(\d{1,2}[:h]\d{0,2}))?$/.exec(s))) {
    d = +m[1]!; mo = +m[2]!; y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +today.slice(0, 4); time = m[4] ? normalizeHHMM(m[4]) ?? undefined : undefined;
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const fmt = (yy: number) => `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let date = fmt(y), yearFixed = false;
  const ty = +today.slice(0, 4);
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (y < ty) { date = fmt(ty); if (date < yesterday) date = fmt(ty + 1); yearFixed = true; }
  else if (!m?.[3] && /\//.test(s) && date < yesterday) date = fmt(ty + 1);     // « 10/01 » en novembre = janvier prochain
  return { date, ...(time ? { time: normalizeHHMM(time) ?? time } : {}), ...(yearFixed ? { yearFixed } : {}) };
}

// ── Parse "HH:MM" in a given timezone → UTC Date ─────────────────────────────
// Returns the next occurrence of that local time (today if future, tomorrow if past)
export function parseLocalHHMM(HHmm: string, tz: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalizeHHMM(HHmm) ?? HHmm);
  if (!match) return null;
  const [, hStr, mStr] = match;
  const h = Number(hStr), m = Number(mStr);
  if (h > 23 || m > 59) return null;

  const now = new Date();

  // Get today's date in target timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);

  const year  = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day   = parts.find(p => p.type === 'day')!.value;

  // Build a "fake UTC" with local clock digits, then subtract offset → real UTC
  const localISO   = `${year}-${month}-${day}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
  const offsetMs   = getUTCOffsetMs(tz, now);
  const targetUTC  = new Date(new Date(localISO + 'Z').getTime() - offsetMs);

  // If already past, schedule for tomorrow
  return targetUTC <= now ? new Date(targetUTC.getTime() + 86_400_000) : targetUTC;
}

// Parse une DATE précise (YYYY-MM-DD) + heure (HH:MM, défaut 09:00) dans la timezone → UTC.
// Pour les rappels à une date future ("le 29 juillet"). Retourne null si format invalide,
// ou si la date+heure est déjà passée (un rappel ne peut pas être dans le passé).
export function parseLocalDateTime(dateYMD: string, HHmm: string | undefined, tz: string): Date | null {
  const nd = normalizeYMD(dateYMD, new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()));
  if (nd) { dateYMD = nd.date; if (!HHmm && nd.time) HHmm = nd.time; }
  if (HHmm) HHmm = normalizeHHMM(HHmm) ?? HHmm;
  const dMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYMD.trim());
  if (!dMatch) return null;
  let h = 9, m = 0;
  if (HHmm) {
    const tMatch = /^(\d{1,2}):(\d{2})$/.exec(HHmm.trim());
    if (!tMatch) return null;
    h = Number(tMatch[1]); m = Number(tMatch[2]);
    if (h > 23 || m > 59) return null;
  }
  const [, y, mo, d] = dMatch;
  const localISO  = `${y}-${mo}-${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  // Offset à la date cible (gère l'heure d'été/hiver à cette date précise).
  const approx    = new Date(localISO + 'Z');
  const offsetMs  = getUTCOffsetMs(tz, approx);
  const targetUTC = new Date(approx.getTime() - offsetMs);
  return targetUTC.getTime() <= Date.now() ? null : targetUTC;
}

// ── Priority-chain timezone resolver ─────────────────────────────────────────
export interface ResolvedTimezone {
  timezone: string;
  source:   'explicit' | 'user_profile' | 'device' | 'fallback';
  valid:    boolean;
}

export function resolveTimezone(
  explicit?:    string | null,   // from tool input
  userProfile?: string | null,   // from Redis session (X-Timezone header)
  deviceTz?:   string | null,   // from app context
): ResolvedTimezone {
  // 1. Explicit parameter (tool call)
  if (explicit) {
    if (isValidTimezone(explicit)) return { timezone: explicit, source: 'explicit', valid: true };
    // Invalid explicit → caller must reject (anti-hallucination)
    return { timezone: explicit, source: 'explicit', valid: false };
  }

  // 2. User profile / session (stored from X-Timezone header)
  if (userProfile && isValidTimezone(userProfile)) {
    return { timezone: userProfile, source: 'user_profile', valid: true };
  }

  // 3. Device/app timezone
  if (deviceTz && isValidTimezone(deviceTz)) {
    return { timezone: deviceTz, source: 'device', valid: true };
  }

  // 4. Fallback — NEVER hardcode Africa/Algiers
  return { timezone: FALLBACK_TZ, source: 'fallback', valid: true };
}

// ── Rich timezone debug info ──────────────────────────────────────────────────
export interface TimezoneConversion {
  timezone:        string;
  utc_offset:      string;
  local_iso:       string;
  utc_iso:         string;
  is_dst:          boolean;
}

export function getTimezoneConversion(tz: string, date: Date = new Date()): TimezoneConversion {
  // DST detection: compare summer vs winter offset
  const jan  = getUTCOffsetMinutes(tz, new Date(date.getFullYear(), 0, 15));
  const jul  = getUTCOffsetMinutes(tz, new Date(date.getFullYear(), 6, 15));
  const now  = getUTCOffsetMinutes(tz, date);
  const is_dst = Math.max(jan, jul) !== Math.min(jan, jul) && now === Math.max(jan, jul);

  return {
    timezone:   tz,
    utc_offset: getUTCOffsetString(tz, date),
    local_iso:  toLocalISO(date, tz),
    utc_iso:    date.toISOString(),
    is_dst,
  };
}

// ── Server timezone info ──────────────────────────────────────────────────────
export function getServerTimezone(): string {
  return process.env['TZ'] ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}
