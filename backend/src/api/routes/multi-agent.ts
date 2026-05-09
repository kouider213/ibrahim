/**
 * POST /api/multi-agent/run
 * Test réel du système multi-agents — appelle chaque agent en parallèle
 * avec son provider LLM propre, retourne le rapport complet.
 *
 * POST /api/multi-agent/status
 * Statut des providers disponibles (configurés ou non).
 */
import { Router }        from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { runMultiAgent, needsMultiAgent, selectAgents } from '../../agents/multi-agent-orchestrator.js';
import { isAvailable }   from '../../providers/provider-manager.js';

const router = Router();

// GET /api/multi-agent/providers — providers disponibles
router.get('/providers', requireMobileAuth, (_req, res) => {
  res.json({
    claude:  { available: isAvailable('claude'),  note: 'Primary — Anthropic claude-sonnet-4-6' },
    openai:  { available: isAvailable('openai'),  note: 'Finance + Code Reviewer — GPT-4o' },
    gemini:  { available: isAvailable('gemini'),  note: 'Social + Designer — Gemini 1.5 Flash' },
    groq:    { available: isAvailable('groq'),    note: 'TikTok + Concurrent — LLaMA 3.3 70B' },
  });
});

// POST /api/multi-agent/run — lancement réel multi-agents
router.post('/run', requireMobileAuth, async (req, res) => {
  const { message, agents, timeout_ms } = req.body as {
    message:    string;
    agents?:    string[];
    timeout_ms?: number;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: 'message requis' });
    return;
  }

  const requestId    = `ma_${Date.now()}`;
  const agentTimeout = Math.min(timeout_ms ?? 30_000, 60_000);

  // Select agents: explicit list or auto-select from message
  const agentIds = (agents?.length ? agents : selectAgents(message)) as Parameters<typeof runMultiAgent>[2];

  console.log(`[multi-agent-route] ${requestId} msg="${message.slice(0, 60)}" agents=[${agentIds.join(',')}]`);

  try {
    const report = await runMultiAgent(message, '', agentIds, requestId, agentTimeout);
    res.json({
      ok:       true,
      requestId,
      summary: {
        agents_requested:   report.agentsRequested,
        agents_succeeded:   report.agentsSucceeded,
        agents_failed:      report.agentsFailed,
        total_latency_ms:   report.totalLatencyMs,
        fusion_latency_ms:  report.fusionLatencyMs,
        total_cost_usd:     report.totalCostUsd,
        total_input_tokens:  report.totalInputTokens,
        total_output_tokens: report.totalOutputTokens,
      },
      agent_results: report.agentResults.map(r => ({
        agent:            r.agentName,
        desired_provider: r.desiredProvider,
        actual_provider:  r.actualProvider,
        model:            r.model,
        used_fallback:    r.usedFallback,
        success:          r.success,
        latency_ms:       r.latencyMs,
        input_tokens:     r.inputTokens,
        output_tokens:    r.outputTokens,
        cost_usd:         r.costEstUsd,
        text_preview:     r.text.slice(0, 200),
        error:            r.error,
      })),
      fused_response: report.fusedResponse,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[multi-agent-route] ${requestId} FAILED: ${msg}`);
    res.status(500).json({ ok: false, error: msg });
  }
});

// POST /api/multi-agent/detect — détection si multi-agent serait déclenché
router.post('/detect', requireMobileAuth, (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message) { res.status(400).json({ error: 'message requis' }); return; }
  const triggered = needsMultiAgent(message);
  const agents    = triggered ? selectAgents(message) : [];
  res.json({ triggered, agents, message: message.slice(0, 100) });
});

export default router;
