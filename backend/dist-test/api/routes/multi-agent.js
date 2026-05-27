"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Multi-Agent routes — test complet de l'architecture réelle.
 *
 * GET  /api/multi-agent/providers       — statut providers
 * GET  /api/multi-agent/catalog         — catalogue complet des 6 agents (prompts, config, isolation)
 * POST /api/multi-agent/run             — exécution parallèle avec rapport complet
 * POST /api/multi-agent/detect          — détection si multi-agent serait déclenché
 * POST /api/multi-agent/test-fallback   — prouve que Claude prend le relais si provider forcé-down
 * POST /api/multi-agent/test-isolation  — prouve l'isolation mémoire entre agents
 * POST /api/multi-agent/test-sequential — mode agent-to-agent séquentiel (Business → Finance)
 * POST /api/multi-agent/audit           — audit complet : réponse brute + attribution + verdict VERIFIED/PARTIAL/FAILED
 */
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const multi_agent_orchestrator_js_1 = require("../../agents/multi-agent-orchestrator.js");
const provider_manager_js_1 = require("../../providers/provider-manager.js");
const finance_agent_runner_js_1 = require("../../agents/finance-agent-runner.js");
const competitor_agent_runner_js_1 = require("../../agents/competitor-agent-runner.js");
const social_agent_runner_js_1 = require("../../agents/social-agent-runner.js");
const code_audit_runner_js_1 = require("../../agents/code-audit-runner.js");
const router = (0, express_1.Router)();
// ── GET /api/multi-agent/providers ────────────────────────────────────────────
router.get('/providers', auth_js_1.requireMobileAuth, (_req, res) => {
    res.json({
        claude: { available: (0, provider_manager_js_1.isAvailable)('claude'), note: 'Primary — claude-sonnet-4-6' },
        openai: { available: (0, provider_manager_js_1.isAvailable)('openai'), note: 'Finance + Code Reviewer — GPT-4o' },
        gemini: { available: (0, provider_manager_js_1.isAvailable)('gemini'), note: 'Social fallback — Gemini 1.5 Flash' },
        groq: { available: (0, provider_manager_js_1.isAvailable)('groq'), note: 'Social + Competitor — LLaMA 3.3 70B' },
    });
});
// ── GET /api/multi-agent/catalog ─────────────────────────────────────────────
// Full agent catalog: provider, model, prompt, isolation proof, timeouts
router.get('/catalog', auth_js_1.requireMobileAuth, (_req, res) => {
    const catalog = multi_agent_orchestrator_js_1.MULTI_AGENTS.map(a => ({
        id: a.id,
        name: a.name,
        provider: a.provider,
        provider_available: (0, provider_manager_js_1.isAvailable)(a.provider),
        model: a.model,
        temperature: a.temperature,
        max_tokens: a.maxTokens,
        fallback_provider: a.fallback ?? null,
        system_prompt: a.systemPrompt,
        // Isolation proof: each agent has its own system prompt, no shared state
        memory_isolation: {
            has_own_system_prompt: true,
            shared_state: false,
            sees_other_agents: false,
            receives_business_ctx: true, // all agents receive the same businessCtx string
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
router.post('/run', auth_js_1.requireMobileAuth, async (req, res) => {
    const { message, agents, timeout_ms } = req.body;
    if (!message?.trim()) {
        res.status(400).json({ error: 'message requis' });
        return;
    }
    const requestId = `ma_${Date.now()}`;
    const agentTimeout = Math.min(timeout_ms ?? 30_000, 60_000);
    const agentIds = (agents?.length ? agents : (0, multi_agent_orchestrator_js_1.selectAgents)(message));
    console.log(`[multi-agent-route] ${requestId} msg="${message.slice(0, 60)}" agents=[${agentIds.join(',')}]`);
    try {
        const report = await (0, multi_agent_orchestrator_js_1.runMultiAgent)(message, '', agentIds, requestId, agentTimeout);
        res.json({
            ok: true,
            requestId,
            summary: {
                agents_requested: report.agentsRequested,
                agents_succeeded: report.agentsSucceeded,
                agents_failed: report.agentsFailed,
                total_latency_ms: report.totalLatencyMs,
                fusion_latency_ms: report.fusionLatencyMs,
                total_cost_usd: report.totalCostUsd,
                total_input_tokens: report.totalInputTokens,
                total_output_tokens: report.totalOutputTokens,
            },
            agent_results: report.agentResults.map(r => ({
                request_id: `${requestId}_${r.agentId}`,
                agent: r.agentName,
                desired_provider: r.desiredProvider,
                actual_provider: r.actualProvider,
                model: r.model,
                used_fallback: r.usedFallback,
                success: r.success,
                latency_ms: r.latencyMs,
                input_tokens: r.inputTokens,
                output_tokens: r.outputTokens,
                cost_usd: r.costEstUsd,
                text_preview: r.text.slice(0, 300),
                error: r.error,
            })),
            fused_response: report.fusedResponse,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[multi-agent-route] ${requestId} FAILED: ${msg}`);
        res.status(500).json({ ok: false, error: msg });
    }
});
// ── POST /api/multi-agent/detect ─────────────────────────────────────────────
router.post('/detect', auth_js_1.requireMobileAuth, (req, res) => {
    const { message } = req.body;
    if (!message) {
        res.status(400).json({ error: 'message requis' });
        return;
    }
    const triggered = (0, multi_agent_orchestrator_js_1.needsMultiAgent)(message);
    const agents = triggered ? (0, multi_agent_orchestrator_js_1.selectAgents)(message) : [];
    res.json({ triggered, agents, message: message.slice(0, 100) });
});
// ── POST /api/multi-agent/test-fallback ──────────────────────────────────────
// Prouve que le fallback Claude s'active quand OpenAI est forcé-down.
// NE TOUCHE PAS aux env vars — utilise forceUnavailable per-request.
router.post('/test-fallback', auth_js_1.requireMobileAuth, async (req, res) => {
    const { force_down = ['openai'] } = req.body;
    const requestId = `fb_${Date.now()}`;
    console.log(`[test-fallback:${requestId}] forceDown=[${force_down.join(',')}]`);
    try {
        const report = await (0, multi_agent_orchestrator_js_1.runMultiAgent)('Analyse les revenus de Fik Conciergerie et propose 3 optimisations financières pour l\'été.', '', ['finance'], requestId, 25_000, { forceUnavailable: force_down });
        const r = report.agentResults[0];
        res.json({
            ok: true,
            test: 'fallback_verification',
            force_down,
            requestId: `${requestId}_finance`,
            desired_provider: r.desiredProvider,
            actual_provider: r.actualProvider,
            used_fallback: r.usedFallback,
            model: r.model,
            success: r.success,
            latency_ms: r.latencyMs,
            input_tokens: r.inputTokens,
            output_tokens: r.outputTokens,
            cost_usd: r.costEstUsd,
            proof: r.usedFallback
                ? `✅ FALLBACK PROUVÉ — ${r.desiredProvider} was forced-down → ${r.actualProvider} (${r.model}) took over automatically`
                : r.success
                    ? `⚠️ Primary used (${r.actualProvider}) — force_down may not have matched`
                    : `❌ All providers failed: ${r.error}`,
            text_preview: r.text.slice(0, 400),
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ── POST /api/multi-agent/test-isolation ─────────────────────────────────────
// Prouve l'isolation mémoire : Business reçoit un secret, Finance ne le voit pas.
router.post('/test-isolation', auth_js_1.requireMobileAuth, async (_req, res) => {
    const secretCode = `SECRET_TOKEN_${Date.now()}`;
    const requestId = `iso_${Date.now()}`;
    console.log(`[test-isolation:${requestId}] secret="${secretCode}"`);
    const t0 = Date.now();
    // Step 1: Run Business Agent with the secret injected in its businessCtx
    const businessReport = await (0, multi_agent_orchestrator_js_1.runMultiAgent)(`Le token secret de test est: ${secretCode}. Confirme que tu le vois.`, `CONTEXTE PRIVÉ BUSINESS: token_secret=${secretCode}`, ['business'], `${requestId}_business`, 25_000);
    // Step 2: Run Finance Agent WITHOUT the secret — completely isolated call
    const financeReport = await (0, multi_agent_orchestrator_js_1.runMultiAgent)('Quel est le token secret qui a été donné à l\'Agent Business dans la requête précédente?', '', // NO business context passed — isolation test
    ['finance'], `${requestId}_finance`, 25_000);
    const businessResult = businessReport.agentResults[0];
    const financeResult = financeReport.agentResults[0];
    const businessSawSecret = businessResult.text.includes(secretCode);
    const financeSawSecret = financeResult.text.includes(secretCode);
    const isolationProven = businessSawSecret && !financeSawSecret;
    res.json({
        ok: true,
        test: 'memory_isolation',
        secret_injected: secretCode,
        total_latency_ms: Date.now() - t0,
        business_agent: {
            request_id: `${requestId}_business_business`,
            provider: businessResult.actualProvider,
            model: businessResult.model,
            saw_secret: businessSawSecret,
            latency_ms: businessResult.latencyMs,
            cost_usd: businessResult.costEstUsd,
            text_preview: businessResult.text.slice(0, 300),
        },
        finance_agent: {
            request_id: `${requestId}_finance_finance`,
            provider: financeResult.actualProvider,
            model: financeResult.model,
            saw_secret: financeSawSecret,
            latency_ms: financeResult.latencyMs,
            cost_usd: financeResult.costEstUsd,
            text_preview: financeResult.text.slice(0, 300),
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
router.post('/test-sequential', auth_js_1.requireMobileAuth, async (req, res) => {
    const { message = 'Analyse la stratégie été de Fik Conciergerie sous l\'angle business puis financier.' } = req.body;
    const requestId = `seq_${Date.now()}`;
    console.log(`[test-sequential:${requestId}] agents=[business,finance] sequential=true`);
    try {
        const report = await (0, multi_agent_orchestrator_js_1.runMultiAgent)(message, '', ['business', 'finance'], requestId, 35_000, undefined, true);
        res.json({
            ok: true,
            test: 'sequential_agent_communication',
            requestId,
            mode: 'sequential — Finance received Business output as context',
            summary: {
                agents_requested: report.agentsRequested,
                agents_succeeded: report.agentsSucceeded,
                total_latency_ms: report.totalLatencyMs,
                total_cost_usd: report.totalCostUsd,
            },
            agents: report.agentResults.map((r, idx) => ({
                order: idx + 1,
                request_id: `${requestId}_${r.agentId}`,
                agent: r.agentName,
                provider: r.actualProvider,
                model: r.model,
                used_fallback: r.usedFallback,
                received_prior_context: idx > 0,
                success: r.success,
                latency_ms: r.latencyMs,
                input_tokens: r.inputTokens,
                output_tokens: r.outputTokens,
                cost_usd: r.costEstUsd,
                text_preview: r.text.slice(0, 400),
            })),
            fused_response: report.fusedResponse.slice(0, 800),
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ── POST /api/multi-agent/finance-tool-test ───────────────────────────────────
// Test direct du finance-agent tool-aware : appelle les vrais outils Supabase,
// retourne réponse brute + proof outils + verdict VERIFIED/PARTIAL/FAILED.
router.post('/finance-tool-test', auth_js_1.requireMobileAuth, async (req, res) => {
    const { message = 'Analyse la finance de Fik Conciergerie ce mois-ci : CA, impayés, anomalies, et 3 recommandations.', } = req.body;
    const requestId = `fin_${Date.now()}`;
    console.log(`[finance-tool-test:${requestId}] msg="${message.slice(0, 80)}"`);
    try {
        const result = await (0, finance_agent_runner_js_1.runFinanceAgentWithTools)(message, requestId, 90_000);
        res.json({
            ok: true,
            test: 'finance_agent_tool_aware',
            requestId,
            proof: {
                // Identity
                agent_id: result.agent_id,
                agent_name: result.agent_name,
                provider: result.provider,
                model: result.model,
                system_prompt: result.system_prompt,
                tools_allowed: result.tools_allowed,
                // Tool execution proof
                tools_called: result.tools_called.map(t => ({
                    tool_name: t.tool_name,
                    tool_input: t.tool_input,
                    duration_ms: t.duration_ms,
                    blocked: t.blocked,
                    result_preview: t.tool_result.slice(0, 400),
                    result_chars: t.tool_result.length,
                })),
                tool_count: result.tool_count,
                raw_data_chars: result.raw_data_chars,
                // Execution metrics
                input_tokens: result.input_tokens,
                output_tokens: result.output_tokens,
                total_ms: result.total_ms,
                // Raw analysis (full, untruncated)
                analysis_full: result.analysis,
                analysis_chars: result.analysis.length,
                // Verdict
                verdict: result.verdict,
                verdict_reason: result.verdict_reason,
                error: result.error ?? null,
            },
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ── POST /api/multi-agent/social-tool-test ───────────────────────────────────
// Test direct social-agent tool-aware : APIFY TikTok + web_search.
// Teste aussi le profil TikTok Fik Conciergerie (compte existant ou non).
router.post('/social-tool-test', auth_js_1.requireMobileAuth, async (req, res) => {
    const { message = 'Analyse le marché TikTok location voiture Oran : concurrents, hashtags, métriques réelles. Vérifie aussi si Fik Conciergerie a un compte TikTok actif et donne ses vraies stats.', } = req.body;
    const requestId = `soc_${Date.now()}`;
    console.log(`[social-tool-test:${requestId}] msg="${message.slice(0, 80)}"`);
    try {
        const result = await (0, social_agent_runner_js_1.runSocialAgentWithTools)(message, requestId, 180_000);
        res.json({
            ok: true,
            test: 'social_agent_tool_aware',
            requestId,
            proof: {
                // Identity
                agent_id: result.agent_id,
                agent_name: result.agent_name,
                provider: result.provider,
                model: result.model,
                system_prompt: result.system_prompt,
                tools_allowed: result.tools_allowed,
                // Tool execution proof
                tools_called: result.tools_called.map(t => ({
                    tool_name: t.tool_name,
                    tool_input: t.tool_input,
                    duration_ms: t.duration_ms,
                    blocked: t.blocked,
                    data_quality: t.data_quality,
                    tiktok_videos: t.tiktok_videos ?? 0,
                    result_preview: t.tool_result.slice(0, 600),
                    result_chars: t.tool_result.length,
                })),
                tool_count: result.tool_count,
                raw_data_chars: result.raw_data_chars,
                tiktok_videos_found: result.tiktok_videos_found,
                // Fik Conciergerie TikTok probe
                fik_tiktok_profile: result.fik_profile
                    ? {
                        handle: result.fik_profile.handle,
                        found: result.fik_profile.found,
                        followers: result.fik_profile.followers,
                        total_views: result.fik_profile.total_views,
                        video_count: result.fik_profile.video_count,
                        top_videos: result.fik_profile.top_videos,
                        why_not_found: result.fik_profile.why_not_found ?? null,
                    }
                    : { handle: 'non vérifié', found: false, why_not_found: 'agent n\'a pas appelé get_tiktok_profile' },
                // Execution metrics
                input_tokens: result.input_tokens,
                output_tokens: result.output_tokens,
                total_ms: result.total_ms,
                // Raw analysis (full)
                analysis_full: result.analysis,
                analysis_chars: result.analysis.length,
                // Verdict
                verdict: result.verdict,
                verdict_reason: result.verdict_reason,
                error: result.error ?? null,
            },
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ── POST /api/multi-agent/competitor-tool-test ───────────────────────────────
// Test direct du competitor-agent tool-aware : appelle web_search (Jina AI),
// retourne réponse brute + proof outils + concurrents trouvés + verdict VERIFIED/PARTIAL/FAKE.
router.post('/competitor-tool-test', auth_js_1.requireMobileAuth, async (req, res) => {
    const { message = 'Analyse les concurrents de Fik Conciergerie sur le marché location voiture Oran : prix, présence digitale, avis clients, recommandations.', } = req.body;
    const requestId = `comp_${Date.now()}`;
    console.log(`[competitor-tool-test:${requestId}] msg="${message.slice(0, 80)}"`);
    try {
        const result = await (0, competitor_agent_runner_js_1.runCompetitorAgentWithTools)(message, requestId, 120_000);
        res.json({
            ok: true,
            test: 'competitor_agent_tool_aware',
            requestId,
            proof: {
                // Identity
                agent_id: result.agent_id,
                agent_name: result.agent_name,
                provider: result.provider,
                model: result.model,
                system_prompt: result.system_prompt,
                tools_allowed: result.tools_allowed,
                // Tool execution proof
                tools_called: result.tools_called.map(t => ({
                    tool_name: t.tool_name,
                    tool_input: t.tool_input,
                    duration_ms: t.duration_ms,
                    blocked: t.blocked,
                    data_quality: t.data_quality,
                    chars_returned: t.chars_returned,
                    result_preview: t.tool_result.slice(0, 500),
                })),
                tool_count: result.tool_count,
                raw_data_chars: result.raw_data_chars,
                // Competitor intelligence
                competitors_found: result.competitors_found,
                // Execution metrics
                input_tokens: result.input_tokens,
                output_tokens: result.output_tokens,
                total_ms: result.total_ms,
                // Raw analysis (full, untruncated)
                analysis_full: result.analysis,
                analysis_chars: result.analysis.length,
                // Verdict
                verdict: result.verdict,
                verdict_reason: result.verdict_reason,
                error: result.error ?? null,
            },
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ── POST /api/multi-agent/code-audit ─────────────────────────────────────────
// P8 — audit coding autonome : plante un bug TS, laisse l'agent le trouver + corriger.
// Prouve: read_file réel → bug identifié → apply_patch (commit réel) → re-read verify.
router.post('/code-audit', auth_js_1.requireMobileAuth, async (_req, res) => {
    const requestId = `ca_${Date.now()}`;
    console.log(`[code-audit-route:${requestId}] START`);
    try {
        const result = await (0, code_audit_runner_js_1.runCodeAudit)(requestId, 120_000);
        res.json({
            ok: true,
            test: 'code_audit_autonomous',
            requestId,
            proof: {
                // Identity
                agent_id: result.agent_id,
                provider: result.provider,
                model: result.model,
                tools_allowed: result.tools_allowed,
                // Bug planted
                test_file: result.test_file_path,
                bug_description: result.bug_description,
                before_commit_sha: result.before_commit_sha,
                before_content: result.before_content,
                // Tool execution proof
                tools_called: result.tools_called.map(t => ({
                    tool_name: t.tool_name,
                    tool_input: t.tool_input,
                    duration_ms: t.duration_ms,
                    blocked: t.blocked,
                    commit_sha: t.commit_sha ?? null,
                    result_preview: t.tool_result.slice(0, 500),
                    result_chars: t.tool_result.length,
                })),
                tool_count: result.tool_count,
                // Patches
                patches_applied: result.patches_applied.map(p => ({
                    file_path: p.file_path,
                    old_string: p.old_string,
                    new_string: p.new_string,
                    commit_sha: p.commit_sha,
                    commit_msg: p.commit_msg,
                    applied_at: p.applied_at,
                })),
                // Before / after comparison
                after_content: result.after_content,
                diff_summary: result.after_content && result.before_content !== result.after_content
                    ? '✅ Fichier modifié — contenu avant ≠ contenu après'
                    : '❌ Fichier identique — aucune modification détectée',
                // Metrics
                input_tokens: result.input_tokens,
                output_tokens: result.output_tokens,
                total_ms: result.total_ms,
                // Agent's final analysis
                analysis_full: result.analysis,
                analysis_chars: result.analysis.length,
                // Verdict
                bug_found: result.bug_found,
                bug_fixed: result.bug_fixed,
                fix_verified: result.fix_verified,
                verdict: result.verdict,
                verdict_reason: result.verdict_reason,
                error: result.error ?? null,
            },
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ── POST /api/multi-agent/audit ──────────────────────────────────────────────
// Audit complet des 6 agents : provider réel, modèle, prompt, réponse brute,
// latence, tokens, coût, preuve parallèle, verdict VERIFIED/PARTIAL/FAILED,
// + attribution des idées dans la fusion.
router.post('/audit', auth_js_1.requireMobileAuth, async (req, res) => {
    const { message = 'Analyse complète de Fik Conciergerie Oran : stratégie été, finances, réseaux sociaux, concurrence, technique, sécurité code.', agents, } = req.body;
    const requestId = `audit_${Date.now()}`;
    const t0 = Date.now();
    const t0ISO = new Date().toISOString();
    const agentIds = (agents?.length
        ? agents
        : ['business', 'finance', 'social', 'competitor', 'developer', 'code_reviewer']);
    console.log(`[audit:${requestId}] START agents=[${agentIds.join(',')}]`);
    let report;
    try {
        report = await (0, multi_agent_orchestrator_js_1.runMultiAgent)(message, '', agentIds, requestId, 45_000);
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
        return;
    }
    // ── Attribution step: ask Claude which ideas came from which agent ─────────
    let attribution = '⚠️ Attribution non calculée.';
    const successfulAgents = report.agentResults.filter(r => r.success && r.text.trim().length > 30);
    if (successfulAgents.length >= 2 && report.fusedResponse.length > 100) {
        try {
            const attrPrompt = `Voici la réponse fusionnée de ${successfulAgents.length} agents IA, suivie de leurs réponses brutes.

RÉPONSE FUSIONNÉE:
${report.fusedResponse}

RÉPONSES BRUTES:
${successfulAgents.map(r => `### ${r.agentName.toUpperCase()} (${r.actualProvider}/${r.model})\n${r.text.slice(0, 700)}`).join('\n\n---\n\n')}

Pour les 6-8 points/idées les plus importants de la réponse fusionnée, identifie quel agent l'a fourni.
Format strict — une ligne par idée:
• [Idée clé courte] → Source: [NOM_AGENT] (provider/modèle)

Si une idée est une synthèse de plusieurs agents, indique tous les agents sources.`;
            const attrResult = await (0, provider_manager_js_1.callProvider)({ provider: 'claude', model: 'claude-sonnet-4-6', temperature: 0.2, maxTokens: 600 }, attrPrompt, 'Tu es un analyseur de sources. Sois précis et bref.', 20_000);
            attribution = attrResult.text;
        }
        catch { /* keep default */ }
    }
    // ── Parallel proof (wall clock vs sum of individual latencies) ───────────
    const sumIndividualMs = report.agentResults.reduce((s, r) => s + r.latencyMs, 0);
    const wallClockMs = report.totalLatencyMs;
    const parallelGainMs = sumIndividualMs - wallClockMs - report.fusionLatencyMs;
    const parallelProven = parallelGainMs > 500; // at least 500ms saved = definitely parallel
    // ── Per-agent verdict ─────────────────────────────────────────────────────
    const agentAudit = report.agentResults.map(r => {
        const def = multi_agent_orchestrator_js_1.MULTI_AGENTS.find(a => a.id === r.agentId);
        const verdict = !r.success ? 'FAILED' :
            r.usedFallback ? 'PARTIAL' :
                'VERIFIED';
        return {
            // Identity
            agent_id: r.agentId,
            agent_name: r.agentName,
            // Provider proof
            desired_provider: r.desiredProvider,
            actual_provider: r.actualProvider,
            model: r.model,
            used_fallback: r.usedFallback,
            provider_available: (0, provider_manager_js_1.isAvailable)(r.actualProvider),
            // System prompt (full, for inspection)
            system_prompt: def?.systemPrompt ?? '(définition introuvable)',
            // Tool execution note (architectural fact)
            tools_executed: false,
            tools_note: 'Les agents multi-agent sont des analystes LLM purs — ils ne lancent pas d\'outils. L\'exécution d\'outils se fait dans le flow Telegram via tool-executor.ts.',
            // Execution metrics
            success: r.success,
            latency_ms: r.latencyMs,
            input_tokens: r.inputTokens,
            output_tokens: r.outputTokens,
            cost_usd: r.costEstUsd,
            timed_out: r.timedOut ?? false,
            error: r.error ?? null,
            // Raw response (full — not truncated)
            raw_response: r.text,
            raw_response_chars: r.text.length,
            raw_response_words: r.text.split(/\s+/).filter(Boolean).length,
            // Verdict
            verdict,
            verdict_reason: verdict === 'VERIFIED'
                ? `✅ ${r.desiredProvider}/${r.model} utilisé comme prévu — réponse réelle de ${r.text.length} chars`
                : verdict === 'PARTIAL'
                    ? `⚠️ Fallback utilisé: ${r.desiredProvider} → ${r.actualProvider} — réponse valide mais provider secondaire`
                    : `❌ Agent échoué: ${r.error ?? 'erreur inconnue'}`,
        };
    });
    const verifiedCount = agentAudit.filter(a => a.verdict === 'VERIFIED').length;
    const partialCount = agentAudit.filter(a => a.verdict === 'PARTIAL').length;
    const failedCount = agentAudit.filter(a => a.verdict === 'FAILED').length;
    console.log(`[audit:${requestId}] DONE verified=${verifiedCount} partial=${partialCount} failed=${failedCount} parallel=${parallelProven}`);
    res.json({
        ok: true,
        audit: {
            requestId,
            test_message: message,
            audit_started: t0ISO,
            // ── Parallel execution proof ─────────────────────────────────────────
            parallel_execution: {
                model: 'Promise.allSettled — tous les agents démarrent à T0 simultanément',
                t0_unix_ms: t0,
                wall_clock_ms: wallClockMs,
                fusion_latency_ms: report.fusionLatencyMs,
                agents_net_ms: wallClockMs - report.fusionLatencyMs,
                sum_individual_ms: sumIndividualMs,
                parallel_gain_ms: parallelGainMs,
                parallel_proven: parallelProven,
                parallel_proof: parallelProven
                    ? `✅ PARALLÈLE PROUVÉ — Si séquentiel: ~${sumIndividualMs}ms. Réel: ${wallClockMs - report.fusionLatencyMs}ms. Gain: ${parallelGainMs}ms économisés.`
                    : `⚠️ Gain faible (${parallelGainMs}ms) — possible si agents très rapides ou si un seul agent a tourné.`,
            },
            // ── Summary ──────────────────────────────────────────────────────────
            summary: {
                agents_requested: report.agentsRequested,
                agents_succeeded: report.agentsSucceeded,
                agents_failed: report.agentsFailed,
                total_latency_ms: report.totalLatencyMs,
                total_input_tokens: report.totalInputTokens,
                total_output_tokens: report.totalOutputTokens,
                total_cost_usd: report.totalCostUsd,
                verified: verifiedCount,
                partial: partialCount,
                failed: failedCount,
            },
            // ── Per-agent full audit ─────────────────────────────────────────────
            agents: agentAudit,
            // ── Fusion + attribution ─────────────────────────────────────────────
            fusion: {
                model: 'claude-sonnet-4-6',
                latency_ms: report.fusionLatencyMs,
                response_full: report.fusedResponse,
                attribution,
            },
        },
    });
});
exports.default = router;
//# sourceMappingURL=multi-agent.js.map