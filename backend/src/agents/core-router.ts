/**
 * CoreRouter — Phase 3
 * Routes each request to the right specialized agent.
 * Falls back to full tool set if no agent matches.
 */
import { AGENT_REGISTRY, AGENT_MAP, type AgentDefinition } from './agent-registry.js';
import { Dzaryx_TOOLS } from '../integrations/tools.js';
import type { Message } from '../integrations/claude-api.js';

// ── Route decision ─────────────────────────────────────────────────────────────
export interface AgentRoute {
  agent:      AgentDefinition | null;  // null = use full tool set (general)
  agentTools: typeof Dzaryx_TOOLS;
  label:      string;
}

export function routeToAgent(text: string): AgentRoute {
  // Check agents in priority order
  for (const agent of AGENT_REGISTRY) {
    if (agent.keywords.test(text)) {
      const agentTools = Dzaryx_TOOLS.filter(t => agent.toolNames.includes(t.name));
      console.log(`[core-router] → ${agent.name} (${agentTools.length} tools)`);
      return { agent, agentTools, label: agent.name };
    }
  }

  // No match → general agent with all tools
  console.log(`[core-router] → General (${Dzaryx_TOOLS.length} tools)`);
  return { agent: null, agentTools: Dzaryx_TOOLS, label: '🤖 Dzaryx' };
}

// ── Force route to a specific agent by id ────────────────────────────────────
export function forceAgent(agentId: string): AgentRoute {
  const agent = AGENT_MAP.get(agentId) ?? null;
  if (!agent) return { agent: null, agentTools: Dzaryx_TOOLS, label: '🤖 Dzaryx' };
  const agentTools = Dzaryx_TOOLS.filter(t => agent.toolNames.includes(t.name));
  return { agent, agentTools, label: agent.name };
}

// ── Build systemExtra for a routed agent ─────────────────────────────────────
export function buildAgentSystem(route: AgentRoute, baseExtra?: string): string {
  const parts: string[] = [];
  if (route.agent?.systemExtra) parts.push(route.agent.systemExtra);
  if (baseExtra) parts.push(baseExtra);
  return parts.join('\n\n');
}

// ── Detect if message references a previous agent context ────────────────────
export function detectAgentFromHistory(messages: Message[]): AgentDefinition | null {
  // Look at last 8 messages (user + assistant) to infer active domain
  // User messages matter: "Créer une réservation" sets context even if
  // the assistant follow-up asks "quel âge?" (no booking keywords in assistant text)
  const recent = [...messages]
    .slice(-8)
    .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 300));

  const combined = recent.join(' ');
  for (const agent of AGENT_REGISTRY) {
    if (agent.keywords.test(combined)) return agent;
  }
  return null;
}
