import type { ValidationReason } from './gate.js';
import type { Namespace } from 'socket.io';
export interface PendingValidation {
    id: string;
    taskId?: string;
    type: ValidationReason;
    context: Record<string, unknown>;
    proposed: Record<string, unknown>;
}
export declare function initApprover(io: Namespace): void;
export declare function requestValidation(type: ValidationReason, context: Record<string, unknown>, proposed: Record<string, unknown>, taskId?: string): Promise<string>;
export declare function processValidationReply(validationId: string, decision: 'approved' | 'rejected', note?: string, decisionBy?: string): Promise<PendingValidation | null>;
export declare function getPendingValidations(): Promise<any[]>;
//# sourceMappingURL=approver.d.ts.map