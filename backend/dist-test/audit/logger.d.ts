export interface AuditEntry {
    actor?: string;
    action: string;
    target?: string;
    targetId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    ip?: string;
}
export declare function audit(entry: AuditEntry): Promise<void>;
export declare const logger: {
    debug(module: string, msg: string, data?: unknown): void;
    info(module: string, msg: string, data?: unknown): void;
    warn(module: string, msg: string, data?: unknown): void;
    error(module: string, msg: string, data?: unknown): void;
    /** Wrap an async fn and emit its duration + outcome */
    time<T>(module: string, label: string, fn: () => Promise<T>): Promise<T>;
};
export declare function consoleLog(level: 'info' | 'warn' | 'error', ...args: unknown[]): void;
//# sourceMappingURL=logger.d.ts.map