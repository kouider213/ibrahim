/**
 * Multi-Agent routes — test complet de l'architecture réelle.
 *
 * GET  /api/multi-agent/providers     — statut providers
 * GET  /api/multi-agent/catalog       — catalogue complet des 6 agents (prompts, config, isolation)
 * POST /api/multi-agent/run           — exécution parallèle avec rapport complet
 * POST /api/multi-agent/detect        — détection si multi-agent serait déclenché
 * POST /api/multi-agent/test-fallback — prouve que Claude prend le relais si provider forcé-down
 * POST /api/multi-agent/test-isolation— prouve l'isolation mémoire entre agents
 * POST /api/multi-agent/test-sequential — mode agent-to-agent séquentiel (Business → Finance)
 */
import { Router }        from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { runMultiAgent, needsMultiAgent, selectAgents, MULTI_AGENTS } from '../../agents/multi-agent-orchestrator.js';
import { isAvailable }                  from '../../providers/provider-manager.js';

const router = Router();

// ── GET /api/multi-agent/providers ────────────────────────────────────────────
router.get('/providers', requireMobileAuth, (_req, res) => {
  res.json({
    claude: { available: isAvailable('claude'), note: 'Primary — claude-sonnet-4-6' },
    openai: { available: isAvailable('openai'), note: 'Finance + Code Reviewer — GPT-4o' },
    gemini: { available: isAvailable('gemini'), note: 'Social fallback — Gemini 1.5 Flash' },
    groq:   { available: isAvailable('groq'),   note: 'Social + Competitor — LLaMA 3.3 70B' },
  });
});

// ── GET /api/multi-agent/catalog ─────────────────────────────────────────────
// Full agent catalog: provider, model, prompt, isolation proof, timeouts
router.get('/catalog', requireMobileAuth, (_req, res) => {
  const catalog = MULTI_AGENTS.map(a => ({
    id:               a.id,
    name:             a.name,
    provider:         a.provider,
    provider_available: isAvailable(a.provider as Parameters<typeof isAvailable>[0]),
    model:            a.model,
    temperature:      a.temperature,
    max_tokens:       a.maxTokens,
    fallback_provider: (a as any).fallback ?? null,
    system_prompt:    a.systemPrompt,
    // Isolation proof: each agent has its own system prompt, no shared state
    memory_isolation: {
      has_own_system_prompt: true,
      shared_state:          false,
      sees_other_agents:     false,
      receives_business_ctx: true,  // all agents receive the same businessCtx string
      note: 'Each agent call is a fresh HTTP request to its LLM provider. No in-memory state is shared.',
    },
    triggers: a.triggers.source,
  }));

  res.json({
    total_agents: catalog.length,
    execution_model: 'Promise.allSettled — parallel, isolated, never blocks on failure',
    default_timeout_ms: 30_000,
    fusion_model: 'claude-sonnet-4-6',
    agents: catalog,
  });
});

// ── POST /api/multi-agent/run ─────────────────────────────────────────────────
router.post('/run', requireMobileAuth, async (req, res) => {
  const { message, agents, timeout_ms } = req.body as {
    message:    string;
    agents?:    string[];
    timeout_ms?: number;
  };

  if (!message?.trim()) { res.status(400).json({ error: 'message requis' }); return; }

  const requestId    = `ma_${Date.now()}`;
  const agentTimeout = Math.min(timeout_ms ?? 30_000, 60_000);
  const agentIds     = (agents?.length ? agents : selectAgents(message)) as Parameters<typeof runMultiAgent>[2];

  console.log(`[multi-agent-route] ${requestId} msg="${message.slice(0, 60)}" agents=[${agentIds.join(',')}]`);

  try {
    const report = await runMultiAgent(message, '', agentIds, requestId, agentTimeout);
    res.json({
      ok: true,
      requestId,
      summary: {
        agents_requested:    report.agentsRequested,
        agents_succeeded:    report.agentsSucceeded,
        agents_failed:       report.agentsFailed,
        total_latency_ms:    report.totalLatencyMs,
        fusion_latency_ms:   report.fusionLatencyMs,
        total_cost_usd:      report.totalCostUsd,
        total_input_tokens:  report.totalInputTokens,
        total_output_tokens: report.totalOutputTokens,
      },
      agent_results: report.agentResults.map(r => ({
        request_id:       `${requestId}_${r.agentId}`,
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
        text_preview:     r.text.slice(0, 300),
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

// ── POST /api/multi-agent/detect ─────────────────────────────────────────────
router.post('/detect', requireMobileAuth, (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message) { res.status(400).json({ error: 'message requis' }); return; }
  const triggered = needsMultiAgent(message);
  const agents    = triggered ? selectAgents(message) : [];
  res.json({ triggered, agents, message: message.slice(0, 100) });
});

// ── POST /api/multi-agent/test-fallback ──────────────────────────────────────
// Prouve que le fallback Claude s'active quand OpenAI est forcé-down.
// NE TOUCHE PAS aux env vars — utilise forceUnavailable per-request.
router.post('/test-fallback', requireMobileAuth, async (req, res) => {
  const { force_down = ['openai'] } = req.body as { force_down?: string[] };
  const requestId = `fb_${Date.now()}`;

  console.log(`[test-fallback:${requestId}] forceDown=[${force_down.join(',')}]`);

  try {
    const report = await runMultiAgent(
      'Analyse les revenus de Fik Conciergerie et propose 3 optimisations financières pour l\'été.',
      '',
      ['finance'],
      requestId,
      25_000,
      { forceUnavailable: force_down as any },
    );

    const r = report.agentResults[0]!;
    res.json({
      ok:             true,
      test:           'fallback_verification',
      force_down,
      requestId:      `${requestId}_finance`,
      desired_provider: r.desiredProvider,
      actual_provider:  r.actualProvider,
      used_fallback:    r.usedFallback,
      model:            r.model,
      success:          r.success,
      latency_ms:       r.latencyMs,
      input_tokens:     r.inputTokens,
      output_tokens:    r.outputTokens,
      cost_usd:         r.costEstUsd,
      proof: r.usedFallback
        ? `✅ FALLBACK PROUVÉ — ${r.desiredProvider} was forced-down → ${r.actualProvider} (${r.model}) took over automatically`
        : r.success
          ? `⚠️ Primary used (${r.actualProvider}) — force_down may not have matched`
          : `❌ All providers failed: ${r.error}`,
      text_preview: r.text.slice(0, 400),
    });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/multi-agent/test-isolation ─────────────────────────────────────
// Prouve l'isolation mémoire : Business reçoit un secret, Finance ne le voit pas.
router.post('/test-isolation', requireMobileAuth, async (_req, res) => {
  const secretCode = `SECRET_TOKEN_${Date.now()}`;
  const requestId  = `iso_${Date.now()}`;

  console.log(`[test-isolation:${requestId}] secret="${secretCode}"`);

  const t0 = Date.now();

  // Step 1: Run Business Agent with the secret injected in its businessCtx
  const businessReport = await runMultiAgent(
    `Le token secret de test est: ${secretCode}. Confirme que tu le vois.`,
    `CONTEXTE PRIVÉ BUSINESS: token_secret=${secretCode}`,
    ['business'],
    `${requestId}_business`,
    25_000,
  );

  // Step 2: Run Finance Agent WITHOUT the secret — completely isolated call
  const financeReport = await runMultiAgent(
    'Quel est le token secret qui a été donné à l\'Agent Business dans la requête précédente?',
    '',   // NO business context passed — isolation test
    ['finance'],
    `${requestId}_finance`,
    25_000,
  );

  const businessResult = businessReport.agentResults[0]!;
  const financeResult  = financeReport.agentResults[0]!;

  const businessSawSecret = businessResult.text.includes(secretCode);
  const financeSawSecret  = financeResult.text.includes(secretCode);
  const isolationProven   = businessSawSecret && !financeSawSecret;

  res.json({
    ok:               true,
    test:             'memory_isolation',
    secret_injected:  secretCode,
    total_latency_ms: Date.now() - t0,
    business_agent: {
      request_id:      `${requestId}_business_business`,
      provider:        businessResult.actualProvider,
      model:           businessResult.model,
      saw_secret:      businessSawSecret,
      latency_ms:      businessResult.latencyMs,
      cost_usd:        businessResult.costEstUsd,
      text_preview:    businessResult.text.slice(0, 300),
    },
    finance_agent: {
      request_id:      `${requestId}_finance_finance`,
      provider:        financeResult.actualProvider,
      model:           financeResult.model,
      saw_secret:      financeSawSecret,
      latency_ms:      financeResult.latencyMs,
      cost_usd:        financeResult.costEstUsd,
      text_preview:    financeResult.text.slice(0, 300),
    },
    isolation_verdict: isolationProven
      ? '✅ ISOLATION PROUVÉE — Business voit le secret, Finance ne le voit pas. Aucune mémoire partagée.'
      : financeSawSecret
        ? '❌ FUITE MÉMOIRE — Finance a vu le secret. Architecture à corriger.'
        : '⚠️ Business n\'a pas confirmé le secret — vérifier le résultat manuellement.',
  });
});

// ── POST /api/multi-agent/test-sequential ────────────────────────────────────
// Prouve la communication agent-to-agent : Business analyse d'abord, Finance utilise ces résultats.
router.post('/test-sequential', requireMobileAuth, async (req, res) => {
  const { message = 'Analyse la stratégie été de Fik Conciergerie sous l\'angle business puis financier.' } =
    req.body as { message?: string };
  const requestId = `seq_${Date.now()}`;

  console.log(`[test-sequential:${requestId}] agents=[business,finance] sequential=true`);

  try {
    const report = await runMultiAgent(
      message,
      '',
      ['business', 'finance'],
      requestId,
      35_000,
      undefined,
      true,   // sequential = true
    );

    res.json({
      ok:   true,
      test: 'sequential_agent_communication',
      requestId,
      mode: 'sequential — Finance received Business output as context',
      summary: {
        agents_requested:    report.agentsRequested,
        agents_succeeded:    report.agentsSucceeded,
        total_latency_ms:    report.totalLatencyMs,
        total_cost_usd:      report.totalCostUsd,
      },
      agents: report.agentResults.map((r, idx) => ({
        order:            idx + 1,
        request_id:       `${requestId}_${r.agentId}`,
        agent:            r.agentName,
        provider:         r.actualProvider,
        model:            r.model,
        used_fallback:    r.usedFallback,
        received_prior_context: idx > 0,
        success:          r.success,
        latency_ms:       r.latencyMs,
        input_tokens:     r.inputTokens,
        output_tokens:    r.outputTokens,
        cost_usd:         r.costEstUsd,
        text_preview:     r.text.slice(0, 400),
      })),
      fused_response: report.fusedResponse.slice(0, 800),
    });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
