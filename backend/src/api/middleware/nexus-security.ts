import type { Request, Response, NextFunction } from 'express';
import { redis } from '../../queue/queue.js';

// ── Nexus-specific rate limiter (30 req/min — stricter than global 120) ───────

const _nexusHits = new Map<string, { count: number; reset: number }>();

export function nexusRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const key = ((req.headers['x-forwarded-for'] as string | undefined) ?? req.ip ?? 'unknown')
    .split(',')[0].trim();
  const now = Date.now();
  let entry = _nexusHits.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + 60_000 };
    _nexusHits.set(key, entry);
  }
  entry.count++;
  if (entry.count > 30) {
    console.warn(`[NEXUS_SECURITY] rate_limit ip=${key} count=${entry.count}`);
    res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
    res.status(429).json({ ok: false, error: 'Too many Nexus requests — 30/min max' });
    return;
  }
  next();
}

// ── IP + method + path access logger ─────────────────────────────────────────

export function nexusIpLogger(req: Request, _res: Response, next: NextFunction): void {
  const ip = ((req.headers['x-forwarded-for'] as string | undefined) ?? req.ip ?? 'unknown')
    .split(',')[0].trim();
  const ua = (req.headers['user-agent'] ?? '-').slice(0, 80);
  console.log(`[NEXUS_ACCESS] ${new Date().toISOString()} ${req.method} ${req.path} ip=${ip} ua="${ua}"`);
  next();
}

// ── Anti-replay: optional X-Request-Time + X-Request-Nonce headers ───────────
// If headers present: timestamp must be within ±5 min, nonce must be unique (Redis TTL 10min).
// Headers are optional — requests without them are passed through (mobile app compat).

const NONCE_TTL_S = 600; // 10 minutes

export function nexusAntiReplay(req: Request, res: Response, next: NextFunction): void {
  const reqTime = req.headers['x-request-time'];
  const nonce   = req.headers['x-request-nonce'];
  if (!reqTime || !nonce) { next(); return; }

  const ts = Number(reqTime);
  if (isNaN(ts)) {
    res.status(400).json({ ok: false, error: 'Invalid X-Request-Time header' });
    return;
  }

  const drift = Math.abs(Date.now() - ts);
  if (drift > 5 * 60_000) {
    const ip = ((req.headers['x-forwarded-for'] as string | undefined) ?? req.ip ?? '?').split(',')[0].trim();
    console.warn(`[NEXUS_SECURITY] anti_replay drift=${drift}ms ip=${ip}`);
    res.status(400).json({
      ok:    false,
      error: `Request timestamp drift too large (${Math.round(drift / 1000)}s, max 300s)`,
    });
    return;
  }

  const redisKey = `nexus:nonce:${String(nonce).slice(0, 128)}`;
  // Async Redis check — use SET NX EX (atomic: set only if not exists)
  redis.set(redisKey, '1', 'EX', NONCE_TTL_S, 'NX').then((result) => {
    if (result === null) {
      // Key already existed → duplicate nonce
      const ip = ((req.headers['x-forwarded-for'] as string | undefined) ?? req.ip ?? '?').split(',')[0].trim();
      console.warn(`[NEXUS_SECURITY] anti_replay duplicate_nonce=${String(nonce).slice(0, 32)} ip=${ip}`);
      res.status(409).json({ ok: false, error: 'Duplicate request (nonce reuse)' });
    } else {
      next();
    }
  }).catch((err: unknown) => {
    // Redis unavailable — fail open to avoid blocking legitimate requests, log prominently
    console.error('[NEXUS_SECURITY] anti_replay Redis error — failing open:', err);
    next();
  });
}
