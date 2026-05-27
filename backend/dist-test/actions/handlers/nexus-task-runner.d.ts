import type { CommandType } from './nexus-command-registry.js';
export type TaskStatus = 'queued' | 'running' | 'waiting_vision' | 'waiting_user' | 'completed' | 'failed' | 'cancelled';
export type StepType = 'COMMAND' | 'VISION_CHECK' | 'WAIT' | 'VISION_LOOP';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';
export interface TaskStep {
    id: string;
    type: StepType;
    description: string;
    command?: CommandType;
    payload?: Record<string, unknown>;
    visionQ?: string;
    confirm?: boolean;
    status: StepStatus;
    startedAt: string | null;
    doneAt: string | null;
    result: unknown;
    error: string | null;
}
export interface NexusAutomationTask {
    id: string;
    objective: string;
    status: TaskStatus;
    steps: TaskStep[];
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
    demoTelegram: boolean;
    actionsCount: number;
}
export declare function getTask(id: string): NexusAutomationTask | null;
export declare function listTasks(limit?: number): NexusAutomationTask[];
export declare function cancelTask(id: string): boolean;
/**
 * Create task from objective (AI-decomposed) or predefined steps, run in background.
 * Returns the task immediately — poll GET /api/nexus/tasks/:id for live status.
 */
export declare function createAndStartTask(objective: string, steps?: Array<Partial<TaskStep>>, demoTelegram?: boolean): Promise<NexusAutomationTask>;
//# sourceMappingURL=nexus-task-runner.d.ts.map