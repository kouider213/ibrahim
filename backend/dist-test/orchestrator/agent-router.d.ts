import { type AgentRoute } from '../agents/core-router.js';
import type { PriorityScore, SourceChannel } from './priority-engine.js';
export interface RoutingDecision {
    route: AgentRoute;
    confidence: number;
    reason: string;
    forced: boolean;
}
export declare function routeWithContext(message: string, channel: SourceChannel, priority: PriorityScore, agentIdOverride?: string): RoutingDecision;
export declare function buildRoutedSystemPrompt(decision: RoutingDecision, baseExtra: string, channelHint: string): string;
export declare function formatRoutingLog(requestId: string, decision: RoutingDecision, priority: PriorityScore): string;
//# sourceMappingURL=agent-router.d.ts.map