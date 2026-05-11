import { routeToAgent, forceAgent, buildAgentSystem, type AgentRoute } from '../agents/core-router.js';
import { Dzaryx_TOOLS } from '../integrations/tools.js';
import type { PriorityScore, SourceChannel } from './priority-engine.js';

export interface RoutingDecision {
  route:      AgentRoute;
  confidence: number;    // 0–1
  reason:     string;
  forced:     boolean;
}

// Tool subset for CRITICAL priority — only comms + core ops
const CRITICAL_TOOL_NAMES = new Set([
  'send_telegram_message', 'send_whatsapp_to_client',
  'list_bookings', 'update_booking', 'cancel_booking',
  'schedule_reminder', 'get_late_returns', 'check_anomalies',
  'record_payment', 'get_payment_status',
]);

// NEXUS channel routes to NEXUS-aware agent by default
const NEXUS_KEYWORDS = /^nexus\b|^\/nexus\b/i;

function buildCriticalRoute(base: AgentRoute): AgentRoute {
  const criticalTools = Dzaryx_TOOLS.filter(
    (t: { name: string }) => CRITICAL_TOOL_NAMES.has(t.name),
  );
  return { ...base, agentTools: criticalTools, label: '🚨 Dzaryx-Critical' };
}

export function routeWithContext(
  message:         string,
  channel:         SourceChannel,
  priority:        PriorityScore,
  agentIdOverride?: string,
): RoutingDecision {
  // Explicit override (e.g. forced by NEXUS command or test)
  if (agentIdOverride) {
    return {
      route:      forceAgent(agentIdOverride),
      confidence: 1.0,
      reason:     `forced:${agentIdOverride}`,
      forced:     true,
    };
  }

  // NEXUS-prefixed messages → NEXUS agent
  if (NEXUS_KEYWORDS.test(message.trim())) {
    return {
      route:      forceAgent('nexus'),
      confidence: 0.95,
      reason:     'nexus_prefix',
      forced:     true,
    };
  }

  // Standard keyword routing
  const base       = routeToAgent(message);
  const isGeneral  = base.agent === null;

  // CRITICAL priority with no specific agent → narrow to emergency tools only
  if (priority.level === 'CRITICAL' && isGeneral) {
    return {
      route:      buildCriticalRoute(base),
      confidence: 0.75,
      reason:     `critical_scope:${priority.reason}`,
      forced:     false,
    };
  }

  // Telegram channel gets slightly higher confidence (direct operator input)
  const channelBoost = channel === 'telegram' ? 0.05 : 0;

  return {
    route:      base,
    confidence: Math.min(1.0, (isGeneral ? 0.50 : 0.85) + channelBoost),
    reason:     isGeneral ? 'general_fallback' : `keyword_match:${base.label}`,
    forced:     false,
  };
}

export function buildRoutedSystemPrompt(
  decision:    RoutingDecision,
  baseExtra:   string,
  channelHint: string,
): string {
  const combined = [baseExtra, channelHint].filter(s => s.trim().length > 0).join('\n\n');
  return buildAgentSystem(decision.route, combined);
}

export function formatRoutingLog(
  requestId: string,
  decision:  RoutingDecision,
  priority:  PriorityScore,
): string {
  return (
    `[agent-router:${requestId}] ` +
    `agent="${decision.route.label}" ` +
    `tools=${decision.route.agentTools.length} ` +
    `confidence=${decision.confidence.toFixed(2)} ` +
    `reason="${decision.reason}" ` +
    `priority=${priority.level}(${priority.score})`
  );
}
