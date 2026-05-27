import type { ToolExecution } from '../integrations/claude-api.js';
export type ActionStatus = 'ALLOWED' | 'BLOCKED_DUPLICATE';
export interface ActionValidation {
    status: ActionStatus;
    reason?: string;
}
export interface ActionRecord {
    toolName: string;
    timestamp: number;
    success: boolean;
    sessionId: string;
    channel: string;
    args?: Record<string, unknown>;
    result?: string;
    latencyMs?: number;
    error?: string;
}
export interface ToolExecutionParams {
    sessionId: string;
    toolName: string;
    args: Record<string, unknown>;
    result: string;
    success: boolean;
    latencyMs: number;
    error?: string;
}
export declare function validateAction(sessionId: string, toolName: string, args: Record<string, unknown>): Promise<ActionValidation>;
export declare function recordAction(sessionId: string, execution: ToolExecution): Promise<void>;
export declare function recordAllActions(sessionId: string, executions: ToolExecution[]): Promise<void>;
export declare function recordToolExecution(params: ToolExecutionParams): Promise<void>;
export declare function getActionHistory(sessionId: string, limit?: number): Promise<ActionRecord[]>;
export declare function getSessionActionCount(sessionId: string): Promise<number>;
//# sourceMappingURL=action-engine.d.ts.map