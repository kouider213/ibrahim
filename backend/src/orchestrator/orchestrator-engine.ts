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
import { processMessage, emitToSession, type OrchestratorResponse } from '../conversation/orchestrator.js';
import { type OrgMember, DEFAULT_MEMBER } from './org-resolver.js';
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

const OTHERS_PRESENT_RX = /(à|a) voix haute|lis[- ]le (moi )?(à|a) voix|ma femme (est |)(l[àa]|à c[ôo]t[ée]|avec moi|dans la voiture)|(je suis |on est )?en voiture avec|devant (ma femme|mes parents|ma m[èe]re|mon p[èe]re|quelqu'un|des gens|le client)|(il y a|y'?a) (du monde|quelqu'un)( avec moi| à c[ôo]t[ée])?|haut-parleur/i;

async function processWithOrchestrationInner(
  userMessage:  string,
  sessionId:    string,
  textOnly    = false,
  imageBase64?: string,
  imageMime   = 'image/jpeg',
  actor:        OrgMember = DEFAULT_MEMBER,
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

    // Emit to socket so the frontend bubble is not left blank
    emitToSession(sessionId, focusText);

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
  const result = await processMessage(userMessage, sessionId, textOnly, imageBase64, imageMime, actor);

  const latencyMs = Date.now() - t0;

  // ── 5. Post-process: anti-hallucination already applied inside processMessage
  // Gates 1/2/3 run with real toolsExecuted inside orchestrator.ts — result.text is already safe.

  // ── 6. Execution trace ─────────────────────────────────────────────────────
  // Note: toolsExecuted is tracked inside processMessage (orchestrator.ts) and logged there.
  // P15 layer does not have access to the inner tool list — check [execution-trace] logs instead.
  logExecutionTrace({
    requestId,
    channel,
    sessionId,
    toolsExecuted:   [],   // see [execution-trace] log from orchestrator.ts for actual tools
    responseAllowed: result.status !== 'error',
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

  // 🔒 02/11 (crash-test liberte-prive) : « à voix haute », « ma femme est là », « dans la voiture »… → rien de privé
  // (santé, médicament, Liberté, vitalité) ne doit sortir, même si le cerveau l'a écrit.
  if (OTHERS_PRESENT_RX.test(userMessage) && typeof result.text === 'string') {
    const { carPrivacy } = await import('../integrations/jarvis4.js');
    const clean = carPrivacy(result.text);
    if (clean !== result.text) result.text = clean || 'Rien de spécial à signaler pour le moment.';
  }

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

/** 04/11 (« veines » perdue à 09:57) : un redéploiement Railway coupait la question en cours → elle est suivie ici et, si le
 *  serveur s'arrête avant la réponse, gardée pour être rejouée après le redémarrage (réponse sur Telegram). */
export async function processWithOrchestration(
  userMessage:  string,
  sessionId:    string,
  textOnly    = false,
  imageBase64?: string,
  imageMime   = 'image/jpeg',
  actor:        OrgMember = DEFAULT_MEMBER,
): Promise<P15Response> {
  const track = /kouider/.test(sessionId) && !imageBase64 && !/^(sandbox|bench|crash)/.test(sessionId);
  const br = track ? await import('../integrations/brain-retry.js').catch(() => null) : null;
  const id = br?.inflightStart(sessionId, userMessage);
  try {
    return await processWithOrchestrationInner(userMessage, sessionId, textOnly, imageBase64, imageMime, actor);
  } finally {
    if (id) br?.inflightEnd(id);
  }
}
