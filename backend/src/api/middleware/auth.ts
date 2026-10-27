import type { Request, Response, NextFunction } from 'express';
import { extractBearerToken, validateToken, identifyMobileActor, type TokenType, type MobileActor } from '../../auth/tokens.js';

// Augment Express Request with mobile actor
declare global {
  namespace Express {
    interface Request {
      mobileActor?: MobileActor;
    }
  }
}

export function requireAuth(tokenType: TokenType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({ error: 'Missing authorization token' });
      return;
    }

    if (!validateToken(token, tokenType)) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }

    next();
  };
}

export function requireMobileAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) { res.status(401).json({ error: 'Missing authorization token' }); return; }

  const actor = identifyMobileActor(token);
  // Diagnostic (Raccourcis iPhone) : longueur reçue (une clé d'appareil = 64 caractères hexadécimaux), jamais la clé elle-même
  if (!actor) { res.status(403).json({ error: 'Invalid token', recu: `${token.length} caractères${/^[0-9a-f]+$/.test(token) ? '' : ', avec des caractères en trop'}` }); return; }

  req.mobileActor = actor;
  next();
}

export function requirePcAuth(req: Request, res: Response, next: NextFunction): void {
  requireAuth('pc-agent')(req, res, next);
}

