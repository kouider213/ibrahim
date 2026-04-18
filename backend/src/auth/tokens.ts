import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';
import type { Request } from 'express';

export type TokenType = 'mobile' | 'pc-agent' | 'webhook';

const TOKEN_MAP: Record<TokenType, string> = {
  'mobile':    env.MOBILE_ACCESS_TOKEN,
  'pc-agent':  env.PC_AGENT_TOKEN,
  'webhook':   env.WEBHOOK_SECRET,
};

export function validateToken(token: string, type: TokenType): boolean {
  const expected = TOKEN_MAP[type];
  if (!expected) return false;
  try {
    const a = Buffer.from(token.padEnd(64));
    const b = Buffer.from(expected.padEnd(64));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
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
