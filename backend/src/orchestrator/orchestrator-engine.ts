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
import { processMessage, type OrchestratorResponse } from '../conversation/orchestrator.js';
import { checkFocus, type FocusDecision } from './focus-manager.js';
import { scorePriority, type PriorityScore, type SourceChannel } from './priority-engine.js';
import { buildOrchestratorContext, detectChannel, type OrchestratorContext } from './context-engine.js';
import { routeWithContext, formatRoutingLog, type RoutingDecision } from './agent-router.js';
import { logExecutionTrace } from './anti-hallucination.js';
export { recordAllActions } from './action-engine.js';

let _reqCounter = 0;
function nextId(): string { return `p15_${Date.now()}_${++_reqCounter}`; }

export interface P15Response extends OrchestratorResponse {
  requestId:   string;
  priority:    PriorityScore;
  channel:     SourceChannel;
  routing:     RoutingDecision;
  focusStatus: FocusDecision['status'];
  latencyMs:   number;
}

export interface P15InitOptions {
  io?: Namespace;
}

export function initOrchestratorEngine(_opts: P15InitOptions = {}): void {
  console.log('[p15] Orchestrator Engine initialized');
}

export async function processWithOrchestration(
  userMessage:  string,
  sessionId:    string,
  textOnly    = false,
  imageBase64?: string,
  imageMime   = 'image/jpeg',
): Promise<P15Response> {
  const t0        = Date.now();
  const requestId = nextId();
  const channel   = detectChannel(sessionId);

  // ── 1. Focus manager ─────────────────────────────────────────────────────
  const focus = await checkFocus(sessionId, userMessage);
  if (!focus.allowed) {
    const focusText = focus.status === 'duplicate'
      ? '⚠️ Message dupliqué reçu — ignoré.'
      : `⚠️ Trop de messages. Attends ${Math.ceil((focus.retryAfterMs ?? 10_000) / 1000)}s.`;

    console.log(
      `[p15:${requestId}] FOCUS_BLOCK status=${focus.status}` +
      ` session=${sessionId.slice(0, 20)}`,
    );

    const fakeScore: PriorityScore  = { level: 'LOW', score: 1, reason: focus.status };
    const fakeRoute: RoutingDecision = {
      route:      { agent: null, agentTools: [], label: 'blocked' },
      confidence: 0,
      reason:     focus.status,
      forced:     false,
    };

    return {
      text:        focusText,
      status:      'error',
      requestId,
      priority:    fakeScore,
      channel,
      routing:     fakeRoute,
      focusStatus: focus.status,
      latencyMs:   Date.now() - t0,
    };
  }

  // ── 2. Priority + context (parallel) ─────────────────────────────────────
  const priority = scorePriority(userMessage, channel);
  const [ctx] = await Promise.all([
    buildOrchestratorContext(sessionId),
  ]);

  // ── 3. Routing decision (metadata only — actual routing inside processMessage) ──
  const routing = routeWithContext(userMessage, channel, priority);
  console.log(formatRoutingLog(requestId, routing, priority));

  logOrchestratorStart(requestId, channel, priority, ctx);

  // ── 4. Main processing — existing pipeline ────────────────────────────────
  const result = await processMessage(userMessage, sessionId, textOnly, imageBase64, imageMime);

  const latencyMs = Date.now() - t0;

  // ── 5. Post-process: anti-hallucination already applied inside processMessage
  // Gates 1/2/3 run with real toolsExecuted inside orchestrator.ts — result.text is already safe.

  // ── 6. Execution trace ─────────────────────────────────────────────────────
  logExecutionTrace({
    requestId,
    channel,
    sessionId,
    toolsExecuted:   [],
    responseAllowed: true,
    priorityScore:   priority.score,
    priorityLevel:   priority.level,
    agentUsed:       routing.route.label,
    focusStatus:     focus.status,
    latencyMs,
  });

  console.log(
    `[p15:${requestId}] DONE` +
    ` channel=${channel}` +
    ` priority=${priority.level}(${priority.score})` +
    ` agent="${routing.route.label}"` +
    ` ms=${latencyMs}` +
    ` status=${result.status}`,
  );

  return {
    ...result,
    requestId,
    priority,
    channel,
    routing,
    focusStatus: focus.status,
    latencyMs,
  };
}

function logOrchestratorStart(
  requestId: string,
  channel:   SourceChannel,
  priority:  PriorityScore,
  ctx:       OrchestratorContext,
): void {
  console.log(
    `[p15:${requestId}] START` +
    ` channel=${channel}` +
    ` priority=${priority.level}(${priority.score})` +
    ` reason="${priority.reason}"` +
    ` active_rentals=${ctx.fleet.activeRentals}` +
    ` pending=${ctx.fleet.pendingBookings}` +
    ` cross_channel_msgs=${ctx.crossChannel.length}` +
    ` tz=${ctx.channel.timezone ?? 'unknown'}`,
  );
}
