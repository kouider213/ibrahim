export type FocusStatus = 'ok' | 'duplicate' | 'rate_limited';
export interface FocusDecision {
    allowed: boolean;
    status: FocusStatus;
    retryAfterMs?: number;
    sessionStats?: {
        count: number;
        resetAt: number;
    };
}
export declare function checkFocus(sessionId: string, message: string): Promise<FocusDecision>;
export declare function clearDedup(sessionId: string, message: string): Promise<void>;
export declare function getSessionStats(sessionId: string): Promise<{
    count: number;
    resetAt: number | null;
}>;
//# sourceMappingURL=focus-manager.d.ts.map