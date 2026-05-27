export interface StepResult {
    step: string;
    status: 'success' | 'failure' | 'skipped' | 'info';
    agentId?: string;
    provider?: string;
    model?: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    output: string;
    details?: Record<string, unknown>;
}
export interface PipelineReport {
    requestId: string;
    startedAt: string;
    completedAt: string;
    totalMs: number;
    nexusOnline: boolean;
    steps: StepResult[];
    decision: 'committed' | 'rolled_back' | 'aborted';
    commitSha?: string;
    rollbackReason?: string;
    totalCostUsd: number;
    telegramSent: boolean;
}
export declare function runAutonomousPipeline(requestId: string): Promise<PipelineReport>;
//# sourceMappingURL=autonomous-pipeline.d.ts.map