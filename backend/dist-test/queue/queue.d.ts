import { Queue } from 'bullmq';
import IORedis from 'ioredis';
export declare const redis: IORedis;
export declare const actionsQueue: Queue<any, any, string, any, any, string>;
export declare const voiceQueue: Queue<any, any, string, any, any, string>;
export declare const notifyQueue: Queue<any, any, string, any, any, string>;
export interface ExecuteActionJob {
    action: string;
    params: Record<string, unknown>;
    taskId?: string;
    sessionId: string;
}
export declare function enqueueAction(job: ExecuteActionJob, priority?: number): Promise<string>;
export declare function enqueueVoice(text: string, sessionId: string): Promise<string>;
//# sourceMappingURL=queue.d.ts.map