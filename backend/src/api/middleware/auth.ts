import type { Request, Response, NextFunction } from 'express';
import { extractBearerToken, validateToken, type TokenType } from '../../auth/tokens.js';

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
  requireAuth('mobile')(req, res, next);
}

export function requirePcAuth(req: Request, res: Response, next: NextFunction): void {
  requireAuth('pc-agent')(req, res, next);
}
