"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAllActions = void 0;
exports.initOrchestratorEngine = initOrchestratorEngine;
exports.processWithOrchestration = processWithOrchestration;
const orchestrator_js_1 = require("../conversation/orchestrator.js");
const focus_manager_js_1 = require("./focus-manager.js");
const priority_engine_js_1 = require("./priority-engine.js");
const context_engine_js_1 = require("./context-engine.js");
const agent_router_js_1 = require("./agent-router.js");
const anti_hallucination_js_1 = require("./anti-hallucination.js");
var action_engine_js_1 = require("./action-engine.js");
Object.defineProperty(exports, "recordAllActions", { enumerable: true, get: function () { return action_engine_js_1.recordAllActions; } });
let _reqCounter = 0;
function nextId() { return `p15_${Date.now()}_${++_reqCounter}`; }
function initOrchestratorEngine(_opts = {}) {
    console.log('[p15] Orchestrator Engine initialized');
}
async function processWithOrchestration(userMessage, sessionId, textOnly = false, imageBase64, imageMime = 'image/jpeg') {
    const t0 = Date.now();
    const requestId = nextId();
    const channel = (0, context_engine_js_1.detectChannel)(sessionId);
    // ── 1. Focus manager ─────────────────────────────────────────────────────
    const focus = await (0, focus_manager_js_1.checkFocus)(sessionId, userMessage);
    if (!focus.allowed) {
        const focusText = focus.status === 'duplicate'
            ? '⚠️ Message dupliqué reçu — ignoré.'
            : `⚠️ Trop de messages. Attends ${Math.ceil((focus.retryAfterMs ?? 10_000) / 1000)}s.`;
        console.log(`[p15:${requestId}] FOCUS_BLOCK status=${focus.status}` +
            ` session=${sessionId.slice(0, 20)}`);
        const fakeScore = { level: 'LOW', score: 1, reason: focus.status };
        const fakeRoute = {
            route: { agent: null, agentTools: [], label: 'blocked' },
            confidence: 0,
            reason: focus.status,
            forced: false,
        };
        return {
            text: focusText,
            status: 'error',
            requestId,
            priority: fakeScore,
            channel,
            routing: fakeRoute,
            focusStatus: focus.status,
            latencyMs: Date.now() - t0,
        };
    }
    // ── 2. Priority + context (parallel) ─────────────────────────────────────
    const priority = (0, priority_engine_js_1.scorePriority)(userMessage, channel);
    const [ctx] = await Promise.all([
        (0, context_engine_js_1.buildOrchestratorContext)(sessionId),
    ]);
    // ── 3. Routing decision (metadata only — actual routing inside processMessage) ──
    const routing = (0, agent_router_js_1.routeWithContext)(userMessage, channel, priority);
    console.log((0, agent_router_js_1.formatRoutingLog)(requestId, routing, priority));
    logOrchestratorStart(requestId, channel, priority, ctx);
    // ── 4. Main processing — existing pipeline ────────────────────────────────
    const result = await (0, orchestrator_js_1.processMessage)(userMessage, sessionId, textOnly, imageBase64, imageMime);
    const latencyMs = Date.now() - t0;
    // ── 5. Post-process: anti-hallucination already applied inside processMessage
    // Gates 1/2/3 run with real toolsExecuted inside orchestrator.ts — result.text is already safe.
    // ── 6. Execution trace ─────────────────────────────────────────────────────
    (0, anti_hallucination_js_1.logExecutionTrace)({
        requestId,
        channel,
        sessionId,
        toolsExecuted: [],
        responseAllowed: true,
        priorityScore: priority.score,
        priorityLevel: priority.level,
        agentUsed: routing.route.label,
        focusStatus: focus.status,
        latencyMs,
    });
    console.log(`[p15:${requestId}] DONE` +
        ` channel=${channel}` +
        ` priority=${priority.level}(${priority.score})` +
        ` agent="${routing.route.label}"` +
        ` ms=${latencyMs}` +
        ` status=${result.status}`);
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
function logOrchestratorStart(requestId, channel, priority, ctx) {
    console.log(`[p15:${requestId}] START` +
        ` channel=${channel}` +
        ` priority=${priority.level}(${priority.score})` +
        ` reason="${priority.reason}"` +
        ` active_rentals=${ctx.fleet.activeRentals}` +
        ` pending=${ctx.fleet.pendingBookings}` +
        ` cross_channel_msgs=${ctx.crossChannel.length}` +
        ` tz=${ctx.channel.timezone ?? 'unknown'}`);
}
//# sourceMappingURL=orchestrator-engine.js.map