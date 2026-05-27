/**
 * CoreRouter — Phase 3
 * Routes each request to the right specialized agent.
 * Falls back to full tool set if no agent matches.
 */
import { type AgentDefinition } from './agent-registry.js';
import { Dzaryx_TOOLS } from '../integrations/tools.js';
import type { Message } from '../integrations/claude-api.js';
export interface AgentRoute {
    agent: AgentDefinition | null;
    agentTools: typeof Dzaryx_TOOLS;
    label: string;
}
export declare function routeToAgent(text: string): AgentRoute;
export declare function forceAgent(agentId: string): AgentRoute;
export declare function buildAgentSystem(route: AgentRoute, baseExtra?: string): string;
export declare function detectAgentFromHistory(messages: Message[]): AgentDefinition | null;
//# sourceMappingURL=core-router.d.ts.map