import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';
import type { Request } from 'express';

export type TokenType = 'mobile' | 'pc-agent' | 'webhook';

const TOKEN_MAP: Record<TokenType, string> = {
  'mobile':    env.MOBILE_ACCESS_TOKEN,
  'pc-agent':  env.PC_AGENT_TOKEN,
  'webhook':   env.WEBHOOK_SECRET,
};

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a.padEnd(64));
    const bb = Buffer.from(b.padEnd(64));
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch { return false; }
}

export function validateToken(token: string, type: TokenType): boolean {
  const expected = TOKEN_MAP[type];
  if (!expected) return false;
  return safeEqual(token, expected);
}

export interface MobileActor {
  id:          string;  // 'kouider' | 'houari'
  displayName: string;
  ownerKey:    string;  // for data filtering
  role:        'owner' | 'admin';
}

// Identify which mobile user based on their token
export function identifyMobileActor(token: string): MobileActor | null {
  if (safeEqual(token, env.MOBILE_ACCESS_TOKEN)) {
    return { id: 'kouider', displayName: env.OWNER_NAME, ownerKey: 'kouider', role: 'owner' };
  }
  if (env.MOBILE_TOKEN_HOUARI && safeEqual(token, env.MOBILE_TOKEN_HOUARI)) {
    return { id: 'houari', displayName: env.PARTNER_NAME, ownerKey: 'houari', role: 'admin' };
  }
  return null;
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export function signHmac(payload: string): string {
  return createHmac('sha256', env.WEBHOOK_SECRET).update(payload).digest('hex');
}

export function verifyHmac(payload: string, signature: string): boolean {
  const expected = signHmac(payload);
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  } catch {
    return false;
  }
}
