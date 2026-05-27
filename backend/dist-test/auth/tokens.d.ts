import type { Request } from 'express';
export type TokenType = 'mobile' | 'pc-agent' | 'webhook';
export declare function validateToken(token: string, type: TokenType): boolean;
export declare function extractBearerToken(req: Request): string | null;
export declare function signHmac(payload: string): string;
export declare function verifyHmac(payload: string, signature: string): boolean;
//# sourceMappingURL=tokens.d.ts.map