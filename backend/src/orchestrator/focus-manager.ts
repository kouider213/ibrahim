import { createHash } from 'crypto';
import { redis } from '../queue/queue.js';

const DEDUP_TTL_SEC   = 10;     // identical message within 10s = duplicate
const RATE_WINDOW_MS  = 60_000; // 1-minute rate window
const RATE_MAX_MSGS   = 30;     // 30 msgs/min per session before throttle
const RATE_KEY_TTL    = 65;     // slightly > window to avoid race

export type FocusStatus = 'ok' | 'duplicate' | 'rate_limited';

export interface FocusDecision {
  allowed:       boolean;
  status:        FocusStatus;
  retryAfterMs?: number;
  sessionStats?: { count: number; resetAt: number };
}

interface RateData {
  count: number;
  reset: number;
}

function msgHash(sessionId: string, message: string): string {
  return createHash('sha1')
    .update(`${sessionId}:${message.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 20);
}

export async function checkFocus(sessionId: string, message: string): Promise<FocusDecision> {
  const hash     = msgHash(sessionId, message);
  const dedupKey = `focus:dedup:${hash}`;
  const rateKey  = `focus:rate:${sessionId}`;

  // Dedup check
  const dedupExists = await redis.get(dedupKey).catch(() => null);
  if (dedupExists) {
    return {
      allowed:      false,
      status:       'duplicate',
      retryAfterMs: DEDUP_TTL_SEC * 1000,
    };
  }

  // Rate check
  const rateRaw  = await redis.get(rateKey).catch(() => null);
  const rateData: RateData | null = rateRaw ? (JSON.parse(rateRaw) as RateData) : null;
  const now      = Date.now();

  const windowActive = rateData !== null && now < rateData.reset;
  if (windowActive && rateData!.count >= RATE_MAX_MSGS) {
    return {
      allowed:       false,
      status:        'rate_limited',
      retryAfterMs:  rateData!.reset - now,
      sessionStats:  { count: rateData!.count, resetAt: rateData!.reset },
    };
  }

  // Record dedup entry
  await redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SEC).catch(() => {});

  // Update rate counter
  if (!windowActive) {
    const fresh: RateData = { count: 1, reset: now + RATE_WINDOW_MS };
    await redis.set(rateKey, JSON.stringify(fresh), 'EX', RATE_KEY_TTL).catch(() => {});
    return { allowed: true, status: 'ok', sessionStats: { count: 1, resetAt: fresh.reset } };
  }

  const updated: RateData = { count: rateData!.count + 1, reset: rateData!.reset };
  await redis.set(rateKey, JSON.stringify(updated), 'EX', RATE_KEY_TTL).catch(() => {});

  return {
    allowed:      true,
    status:       'ok',
    sessionStats: { count: updated.count, resetAt: updated.reset },
  };
}

export async function clearDedup(sessionId: string, message: string): Promise<void> {
  const hash     = msgHash(sessionId, message);
  const dedupKey = `focus:dedup:${hash}`;
  await redis.del(dedupKey).catch(() => {});
}

export async function getSessionStats(sessionId: string): Promise<{ count: number; resetAt: number | null }> {
  const rateRaw = await redis.get(`focus:rate:${sessionId}`).catch(() => null);
  if (!rateRaw) return { count: 0, resetAt: null };
  const data = JSON.parse(rateRaw) as RateData;
  return { count: data.count, resetAt: data.reset };
}
