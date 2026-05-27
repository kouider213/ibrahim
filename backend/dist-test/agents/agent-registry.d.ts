/**
 * Agent Registry — Phase 3 + Multi-Agent LLM config.
 * Each agent has its own system prompt, tool subset, AND preferred LLM provider.
 * The llm field is used by multi-agent-orchestrator.ts for per-agent provider routing.
 */
import type { ProviderName } from '../providers/provider-manager.js';
export interface AgentLLMConfig {
    provider: ProviderName;
    model: string;
    temperature: number;
    maxTokens: number;
    fallback?: ProviderName;
}
export interface AgentDefinition {
    id: string;
    name: string;
    systemExtra: string;
    toolNames: string[];
    keywords: RegExp;
    priority: number;
    llm: AgentLLMConfig;
}
export declare const AGENT_REGISTRY: AgentDefinition[];
export declare const AGENT_MAP: Map<string, AgentDefinition>;
//# sourceMappingURL=agent-registry.d.ts.map