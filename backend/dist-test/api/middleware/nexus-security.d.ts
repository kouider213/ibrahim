import type { Request, Response, NextFunction } from 'express';
export declare function nexusRateLimiter(req: Request, res: Response, next: NextFunction): void;
export declare function nexusIpLogger(req: Request, _res: Response, next: NextFunction): void;
export declare function nexusAntiReplay(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=nexus-security.d.ts.map