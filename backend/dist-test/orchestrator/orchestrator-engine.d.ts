/**
 * P15 Orchestrator Brain — central intelligence layer wrapping processMessage.
 *
 * Pipeline:
 *   1. focus-manager  → dedup + rate limit
 *   2. priority-engine → urgency score
 *   3. context-engine  → channel + cross-channel snapshot
 *   4. agent-router    → priority-aware routing decision (metadata only)
 *   5. processMessage  → existing Claude pipeline (unchanged)
 *   6. anti-hallucination → enhanced post-check + trace
 *   7. action-engine   → record executed tools
 */
import type { Namespace } from 'socket.io';
import { type OrchestratorResponse } from '../conversation/orchestrator.js';
import { type FocusDecision } from './focus-manager.js';
import { type PriorityScore, type SourceChannel } from './priority-engine.js';
import { type RoutingDecision } from './agent-router.js';
export { recordAllActions } from './action-engine.js';
export interface P15Response extends OrchestratorResponse {
    requestId: string;
    priority: PriorityScore;
    channel: SourceChannel;
    routing: RoutingDecision;
    focusStatus: FocusDecision['status'];
    latencyMs: number;
}
export interface P15InitOptions {
    io?: Namespace;
}
export declare function initOrchestratorEngine(_opts?: P15InitOptions): void;
export declare function processWithOrchestration(userMessage: string, sessionId: string, textOnly?: boolean, imageBase64?: string, imageMime?: string): Promise<P15Response>;
//# sourceMappingURL=orchestrator-engine.d.ts.map