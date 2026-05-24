import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const SECRET = env.SAAS_JWT_SECRET ?? 'dzaryx-saas-dev-secret-change-in-prod';

export interface SaasTokenPayload {
  orgId:    string;
  email:    string;
  ownerKey: string;
  sector:   string;
  iat?:     number;
  exp?:     number;
}

export function signSaasToken(payload: Omit<SaasTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

export function verifySaasToken(token: string): SaasTokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as SaasTokenPayload;
  } catch {
    return null;
  }
}
