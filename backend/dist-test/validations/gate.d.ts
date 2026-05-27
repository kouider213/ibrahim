export type ValidationReason = 'client_reply' | 'financial' | 'other';
export interface ValidationCheck {
    required: boolean;
    reason?: ValidationReason;
    context?: string;
}
export declare function checkIfValidationRequired(action: string, params: Record<string, unknown>): ValidationCheck;
//# sourceMappingURL=gate.d.ts.map