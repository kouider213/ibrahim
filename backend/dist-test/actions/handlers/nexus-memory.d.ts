export declare function hashText(text: string): string;
export interface NexusTask {
    task_id: string;
    objective: string;
    status: string;
    steps: number;
    screenshots: number;
    provider: string | null;
    duration_ms: number;
    error: string | null;
    action_log: string[];
    created_at?: string;
}
export interface NexusTaskStep {
    task_id: string;
    step: number;
    action: string;
    payload: Record<string, unknown>;
    success: boolean;
    error: string | null;
    screen_hash: string | null;
    provider: string | null;
    latency_ms: number;
    confidence: number;
}
export interface NexusWorkflow {
    objective_hash: string;
    objective: string;
    action_sequence: string[];
    success_count: number;
    fail_count: number;
    reliability: number;
    avg_steps: number;
    avg_duration_ms: number;
    last_used_at: string;
}
export interface NexusProviderStat {
    provider: string;
    success_count: number;
    fail_count: number;
    avg_latency_ms: number;
    last_error: string | null;
    last_error_at: string | null;
    last_used_at: string | null;
    cooldown_until: string | null;
    reliability: number;
}
export declare function saveTask(task: NexusTask): Promise<void>;
export declare function saveStep(step: NexusTaskStep): Promise<void>;
export declare function getRecentTasks(limit?: number): Promise<NexusTask[]>;
export declare function saveWorkflow(objective: string, actions: string[], success: boolean, steps: number, durationMs: number): Promise<void>;
export declare function getSuccessfulWorkflow(objective: string): Promise<NexusWorkflow | null>;
export declare function getTopWorkflows(limit?: number): Promise<NexusWorkflow[]>;
export declare function updateProviderStats(provider: string, success: boolean, latencyMs: number, error?: string | null): Promise<void>;
export declare function getProviderStats(): Promise<NexusProviderStat[]>;
/**
 * Rank available providers by historical performance.
 * Providers in cooldown are excluded.
 * complexityHint influences provider preference (groq=simple, claude=complex).
 */
export declare function rankProviders(stats: NexusProviderStat[], available: string[], complexityHint?: 'simple' | 'complex'): string[];
export declare function rememberUiPattern(windowTitle: string, appName: string): Promise<void>;
export declare function recordFailure(pattern: string, context?: string): Promise<void>;
export declare function getFailurePatterns(limit?: number): Promise<Array<{
    pattern: string;
    count: number;
}>>;
export declare function saveScreenshotMeta(meta: {
    task_id: string;
    step: number;
    screen_hash: string;
    size_kb?: number;
    ui_elements?: string[];
}): Promise<void>;
export declare function getVisionStats(): Promise<{
    total: number;
    completed: number;
    successRate: number;
    avgDuration: number;
    bestProvider: string;
}>;
//# sourceMappingURL=nexus-memory.d.ts.map