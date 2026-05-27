import type { ToolExecution } from '../integrations/claude-api.js';
import { PHANTOM_REFUSAL } from '../conversation/response-guard.js';
export interface HallucinationCheck {
    safe: boolean;
    reason: 'phantom_action' | 'financial_claim_no_data' | 'system_state_claim' | null;
    blocked: string | null;
}
export declare function checkAntiHallucination(text: string, toolsExecuted: ToolExecution[], userMessage: string, requestId: string): HallucinationCheck;
export interface ExecutionTrace {
    requestId: string;
    channel: string;
    sessionId: string;
    toolsExecuted: ToolExecution[];
    responseAllowed: boolean;
    priorityScore: number;
    priorityLevel: string;
    agentUsed: string;
    focusStatus: string;
    latencyMs: number;
}
export declare function logExecutionTrace(t: ExecutionTrace): void;
export { PHANTOM_REFUSAL };
//# sourceMappingURL=anti-hallucination.d.ts.map