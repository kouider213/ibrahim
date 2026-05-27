import type { Request, Response, NextFunction } from 'express';
import { type TokenType } from '../../auth/tokens.js';
export declare function requireAuth(tokenType: TokenType): (req: Request, res: Response, next: NextFunction) => void;
export declare function requireMobileAuth(req: Request, res: Response, next: NextFunction): void;
export declare function requirePcAuth(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map