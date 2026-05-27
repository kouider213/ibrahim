import { type NexusProviderStat } from './nexus-memory.js';
export interface VisionContext {
    pcId: string;
    objective: string | null;
    lastScreenshot: string | null;
    lastAnalysis: string | null;
    lastAnalysisError: string | null;
    lastRawResponse: string | null;
    lastOcrText: string | null;
    lastActionType: string | null;
    lastProvider: string | null;
    actionHistory: string[];
    updatedAt: number | null;
}
export interface VisionDecision {
    screen_analysis: string;
    ui_elements: string[];
    detected_errors: string[];
    objective_status: 'in_progress' | 'completed' | 'failed' | 'blocked';
    next_action: {
        type: string;
        payload: Record<string, unknown>;
    };
    reasoning: string;
    confidence: number;
}
export interface VisionLoopResult {
    taskId: string;
    objective: string;
    status: 'completed' | 'failed' | 'stopped' | 'max_steps';
    steps: number;
    lastAnalysis: string | null;
    error: string | null;
    durationMs: number;
    startedAt: string;
}
export interface OcrResult {
    ok: boolean;
    windows: string[];
    text: string;
    error?: string;
}
interface LoopEntry {
    status: 'running' | 'done';
    startedAt: string;
    result?: VisionLoopResult;
}
export declare function getVisionContext(): VisionContext;
export declare function getLoopStatus(taskId: string): LoopEntry | null;
export declare function listLoops(): Array<{
    taskId: string;
} & LoopEntry>;
export declare function triggerEmergencyStop(): void;
export declare function clearEmergencyStop(): void;
export declare function isEmergencyStopped(): boolean;
export declare function performLocalOcr(timeoutMs?: number): Promise<OcrResult>;
export declare function analyzeScreen(objective: string, base64: string, actionHistory: string[], step: number, maxSteps: number, contextHint?: string, // pre-OCR window state for first step
providerStats?: NexusProviderStat[]): Promise<VisionDecision | null>;
export declare function runVisionLoop(objective: string, options?: {
    taskId?: string;
    maxSteps?: number;
    stepDelay?: number;
    demoTelegram?: boolean;
}): Promise<VisionLoopResult>;
export declare function startVisionLoop(objective: string, options?: {
    maxSteps?: number;
    stepDelay?: number;
    demoTelegram?: boolean;
}): string;
export {};
//# sourceMappingURL=nexus-vision-loop.d.ts.map