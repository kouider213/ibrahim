import type { Job } from 'bullmq';
export interface TriggerResult {
    trigger: string;
    status: 'SENT' | 'SKIPPED' | 'ERROR';
    reason?: string;
}
export declare function clearAllLocks(): Promise<void>;
export declare function runProactiveEngine(_job?: Job, force?: boolean, demo?: boolean): Promise<TriggerResult[]>;
//# sourceMappingURL=proactive-engine.d.ts.map