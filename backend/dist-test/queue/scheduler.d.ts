import { Queue } from 'bullmq';
declare const SCHEDULER_QUEUE = "Dzaryx-scheduler";
export declare const schedulerQueue: Queue<any, any, string, any, any, string>;
export declare function initScheduler(): Promise<void>;
export declare function triggerJob(jobName: string): Promise<boolean>;
export declare function triggerCustomReminder(message: string, idempotencyKey: string): Promise<string>;
export declare function getSchedulerStatus(): Promise<{
    queue: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    repeatable: number;
    redis_ping_ms: number;
}>;
export { SCHEDULER_QUEUE };
//# sourceMappingURL=scheduler.d.ts.map