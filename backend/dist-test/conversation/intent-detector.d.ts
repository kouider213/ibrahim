export interface DetectedIntent {
    intent: string;
    action?: string;
    params: Record<string, unknown>;
    requiresValidation: boolean;
    validationReason?: string;
}
export declare function analyzeMessage(message: string, contextSummary: string): Promise<DetectedIntent>;
//# sourceMappingURL=intent-detector.d.ts.map