"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeToAgent = routeToAgent;
exports.forceAgent = forceAgent;
exports.buildAgentSystem = buildAgentSystem;
exports.detectAgentFromHistory = detectAgentFromHistory;
/**
 * CoreRouter — Phase 3
 * Routes each request to the right specialized agent.
 * Falls back to full tool set if no agent matches.
 */
const agent_registry_js_1 = require("./agent-registry.js");
const tools_js_1 = require("../integrations/tools.js");
function routeToAgent(text) {
    // Check agents in priority order
    for (const agent of agent_registry_js_1.AGENT_REGISTRY) {
        if (agent.keywords.test(text)) {
            const agentTools = tools_js_1.Dzaryx_TOOLS.filter(t => agent.toolNames.includes(t.name));
            console.log(`[core-router] → ${agent.name} (${agentTools.length} tools)`);
            return { agent, agentTools, label: agent.name };
        }
    }
    // No match → general agent with all tools
    console.log(`[core-router] → General (${tools_js_1.Dzaryx_TOOLS.length} tools)`);
    return { agent: null, agentTools: tools_js_1.Dzaryx_TOOLS, label: '🤖 Dzaryx' };
}
// ── Force route to a specific agent by id ────────────────────────────────────
function forceAgent(agentId) {
    const agent = agent_registry_js_1.AGENT_MAP.get(agentId) ?? null;
    if (!agent)
        return { agent: null, agentTools: tools_js_1.Dzaryx_TOOLS, label: '🤖 Dzaryx' };
    const agentTools = tools_js_1.Dzaryx_TOOLS.filter(t => agent.toolNames.includes(t.name));
    return { agent, agentTools, label: agent.name };
}
// ── Build systemExtra for a routed agent ─────────────────────────────────────
function buildAgentSystem(route, baseExtra) {
    const parts = [];
    if (route.agent?.systemExtra)
        parts.push(route.agent.systemExtra);
    if (baseExtra)
        parts.push(baseExtra);
    return parts.join('\n\n');
}
// ── Detect if message references a previous agent context ────────────────────
function detectAgentFromHistory(messages) {
    // Look at last 8 messages (user + assistant) to infer active domain
    // User messages matter: "Créer une réservation" sets context even if
    // the assistant follow-up asks "quel âge?" (no booking keywords in assistant text)
    const recent = [...messages]
        .slice(-8)
        .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 300));
    const combined = recent.join(' ');
    for (const agent of agent_registry_js_1.AGENT_REGISTRY) {
        if (agent.keywords.test(combined))
            return agent;
    }
    return null;
}
//# sourceMappingURL=core-router.js.map