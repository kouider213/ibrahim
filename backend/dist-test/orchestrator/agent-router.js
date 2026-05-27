"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeWithContext = routeWithContext;
exports.buildRoutedSystemPrompt = buildRoutedSystemPrompt;
exports.formatRoutingLog = formatRoutingLog;
const core_router_js_1 = require("../agents/core-router.js");
const tools_js_1 = require("../integrations/tools.js");
// Tool subset for CRITICAL priority — only comms + core ops
const CRITICAL_TOOL_NAMES = new Set([
    'send_telegram_message', 'send_whatsapp_to_client',
    'list_bookings', 'update_booking', 'cancel_booking',
    'schedule_reminder', 'get_late_returns', 'check_anomalies',
    'record_payment', 'get_payment_status',
]);
// NEXUS channel routes to NEXUS-aware agent by default
const NEXUS_KEYWORDS = /^nexus\b|^\/nexus\b/i;
function buildCriticalRoute(base) {
    const criticalTools = tools_js_1.Dzaryx_TOOLS.filter((t) => CRITICAL_TOOL_NAMES.has(t.name));
    return { ...base, agentTools: criticalTools, label: '🚨 Dzaryx-Critical' };
}
function routeWithContext(message, channel, priority, agentIdOverride) {
    // Explicit override (e.g. forced by NEXUS command or test)
    if (agentIdOverride) {
        return {
            route: (0, core_router_js_1.forceAgent)(agentIdOverride),
            confidence: 1.0,
            reason: `forced:${agentIdOverride}`,
            forced: true,
        };
    }
    // NEXUS-prefixed messages → NEXUS agent
    if (NEXUS_KEYWORDS.test(message.trim())) {
        return {
            route: (0, core_router_js_1.forceAgent)('nexus'),
            confidence: 0.95,
            reason: 'nexus_prefix',
            forced: true,
        };
    }
    // Standard keyword routing
    const base = (0, core_router_js_1.routeToAgent)(message);
    const isGeneral = base.agent === null;
    // CRITICAL priority with no specific agent → narrow to emergency tools only
    if (priority.level === 'CRITICAL' && isGeneral) {
        return {
            route: buildCriticalRoute(base),
            confidence: 0.75,
            reason: `critical_scope:${priority.reason}`,
            forced: false,
        };
    }
    // Telegram channel gets slightly higher confidence (direct operator input)
    const channelBoost = channel === 'telegram' ? 0.05 : 0;
    return {
        route: base,
        confidence: Math.min(1.0, (isGeneral ? 0.50 : 0.85) + channelBoost),
        reason: isGeneral ? 'general_fallback' : `keyword_match:${base.label}`,
        forced: false,
    };
}
function buildRoutedSystemPrompt(decision, baseExtra, channelHint) {
    const combined = [baseExtra, channelHint].filter(s => s.trim().length > 0).join('\n\n');
    return (0, core_router_js_1.buildAgentSystem)(decision.route, combined);
}
function formatRoutingLog(requestId, decision, priority) {
    return (`[agent-router:${requestId}] ` +
        `agent="${decision.route.label}" ` +
        `tools=${decision.route.agentTools.length} ` +
        `confidence=${decision.confidence.toFixed(2)} ` +
        `reason="${decision.reason}" ` +
        `priority=${priority.level}(${priority.score})`);
}
//# sourceMappingURL=agent-router.js.map