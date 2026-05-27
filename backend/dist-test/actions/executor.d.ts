export interface ActionPayload {
    action: string;
    params: Record<string, unknown>;
    taskId?: string;
    sessionId: string;
}
export interface ActionResult {
    success: boolean;
    data?: unknown;
    error?: string;
    message: string;
}
export declare function executeAction(payload: ActionPayload): Promise<ActionResult>;
//# sourceMappingURL=executor.d.ts.map