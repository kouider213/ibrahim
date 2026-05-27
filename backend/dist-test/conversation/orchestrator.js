"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initOrchestrator = initOrchestrator;
exports.processMessage = processMessage;
const context_builder_js_1 = require("./context-builder.js");
const response_guard_js_1 = require("./response-guard.js");
const anti_hallucination_js_1 = require("../orchestrator/anti-hallucination.js");
const claude_api_js_1 = require("../integrations/claude-api.js");
const supabase_js_1 = require("../integrations/supabase.js");
const dispatcher_js_1 = require("../notifications/dispatcher.js");
const llm_router_js_1 = require("../integrations/llm-router.js");
const core_router_js_1 = require("../agents/core-router.js");
const multi_agent_orchestrator_js_1 = require("../agents/multi-agent-orchestrator.js");
const constants_js_1 = require("../config/constants.js");
const queue_js_1 = require("../queue/queue.js");
let _io = null;
let _reqCounter = 0;
function nextRequestId() { return `req_${Date.now()}_${++_reqCounter}`; }
function detectSourceChannel(sessionId) {
    if (sessionId.startsWith('telegram_'))
        return 'telegram';
    if (sessionId.startsWith('voice_'))
        return 'mobile_voice';
    if (sessionId.startsWith('mobile_'))
        return 'mobile_text';
    return 'backend_internal';
}
function initOrchestrator(io) {
    _io = io;
}
// ── Mapping outil → message lisible pour l'UI ────────────────────────────────
const TOOL_LABELS = {
    list_bookings: '📋 Récupération des réservations…',
    create_booking: '✍️ Création de la réservation…',
    update_booking: '✏️ Modification de la réservation…',
    cancel_booking: '❌ Annulation en cours…',
    delete_booking: '🗑️ Suppression…',
    get_financial_report: '💰 Calcul du rapport financier…',
    get_revenue_report: '📊 Analyse des revenus…',
    get_finance_dashboard: '📈 Tableau de bord financier…',
    check_car_availability: '🚗 Vérification disponibilité…',
    get_weather: '🌤️ Récupération météo…',
    get_news: '📰 Chargement actualités…',
    remember_info: '🧠 Mémorisation…',
    recall_memory: '🧠 Consultation mémoire…',
    learn_rule: '📚 Apprentissage règle…',
    web_search: '🔍 Recherche internet…',
    fetch_url: '🌐 Lecture page web…',
    github_read_file: '📂 Lecture fichier code…',
    github_write_file: '💾 Écriture fichier code…',
    github_list_files: '📁 Navigation dossier…',
    github_search_code: '🔎 Recherche dans le code…',
    railway_wait_deploy: '🚀 Déploiement en cours… (2-3 min)',
    railway_get_logs: '📋 Récupération logs Railway…',
    supabase_execute: '🗄️ Requête base de données…',
    send_whatsapp_to_client: '📱 Envoi WhatsApp…',
    store_document: '📄 Stockage document…',
    get_client_document: '📄 Récupération document…',
    send_telegram_message: '📱 Envoi sur Telegram…',
    get_payment_status: '💳 Vérification paiements…',
    record_payment: '💳 Enregistrement paiement…',
    generate_receipt: '🧾 Génération reçu…',
    get_late_returns: '🚨 Vérification retards de retour…',
    generate_reservation_voucher: '📄 Génération bon de réservation PDF…',
    get_unpaid_bookings: '⚠️ Vérification impayés…',
    check_anomalies: '🔍 Détection anomalies…',
    analyze_image: '🖼️ Analyse image…',
    optimize_image: '🖼️ Optimisation image…',
    enhance_image: '✨ Amélioration image…',
    remove_background: '🎨 Suppression arrière-plan…',
    add_text_overlay: '📝 Ajout texte sur image…',
    create_social_variants: '📱 Création variantes réseaux…',
    analyze_video: '🎬 Analyse vidéo…',
    cut_video: '✂️ Découpe vidéo…',
    merge_videos: '🎞️ Fusion vidéos…',
    add_subtitles: '💬 Génération sous-titres…',
    optimize_for_platform: '📱 Optimisation plateforme…',
    extract_thumbnail: '🖼️ Extraction miniature…',
    add_background_music: '🎵 Ajout musique…',
    create_video_preview: '🎬 Création aperçu vidéo…',
    publish_to_socials: '🚀 Publication TikTok…',
};
function getToolLabel(toolName) {
    return TOOL_LABELS[toolName] ?? `🔧 ${toolName}…`;
}
// ── Processeur principal ──────────────────────────────────────────────────────
async function processMessage(userMessage, sessionId, textOnly = false, imageBase64, imageMime = 'image/jpeg') {
    const requestId = nextRequestId();
    const source_channel = detectSourceChannel(sessionId);
    console.log(`[orch:${requestId}] source_channel=${source_channel} session=${sessionId} msg="${userMessage.slice(0, 80)}"`);
    // 1. Notifier "thinking" immédiatement
    _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });
    // 2. Construire le contexte + sauvegarder le message user en parallèle
    const [ctx] = await Promise.all([
        (0, context_builder_js_1.buildContext)(sessionId, userMessage),
        (0, supabase_js_1.saveConversationTurn)(sessionId, 'user', userMessage).catch((err) => console.error('[orchestrator] user save error:', err)),
    ]);
    // ── Early tool-availability gate ─────────────────────────────────────────
    // Blocks requests that require unavailable APIs (e.g. TikTok without Apify key)
    // BEFORE invoking Claude — prevents any chance of hallucinated data.
    const earlyBlock = (0, response_guard_js_1.earlyToolAvailabilityCheck)(userMessage, requestId);
    if (earlyBlock) {
        console.log(`[orch:${requestId}] EARLY_BLOCK tool_unavailable`);
        _io?.emit(constants_js_1.SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: earlyBlock });
        (0, supabase_js_1.saveConversationTurn)(sessionId, 'assistant', earlyBlock).catch(() => { });
        _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
        return { text: earlyBlock, status: 'done' };
    }
    // ── Multi-Agent path — cross-domain analysis ─────────────────────────────
    // Triggered when the request covers multiple business domains simultaneously
    // (e.g. "analyse Fik Conciergerie et propose des améliorations pour l'été").
    if (!imageBase64 && (0, multi_agent_orchestrator_js_1.needsMultiAgent)(userMessage)) {
        const agentIds = (0, multi_agent_orchestrator_js_1.selectAgents)(userMessage);
        console.log(`[orch:${requestId}] MULTI-AGENT ▶ agents=[${agentIds.join(',')}]`);
        _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId, toolLabel: `🤖 Multi-agents: ${agentIds.length} spécialistes...` });
        try {
            const report = await (0, multi_agent_orchestrator_js_1.runMultiAgent)(userMessage, ctx.systemExtra, agentIds, requestId);
            const multiText = (0, response_guard_js_1.guardResponse)(report.fusedResponse, userMessage, requestId);
            const safeMulti = (0, response_guard_js_1.phantomGuard)(multiText, [], userMessage, requestId);
            // Execution trace
            console.log(`[multi-agent-trace] request_id=${requestId} agents=${agentIds.length} succeeded=${report.agentsSucceeded} cost=$${report.totalCostUsd.toFixed(6)} ms=${report.totalLatencyMs}`);
            _io?.emit(constants_js_1.SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: safeMulti });
            (0, supabase_js_1.saveConversationTurn)(sessionId, 'assistant', safeMulti).catch(() => { });
            if (!textOnly && safeMulti.length > 0) {
                _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
                await streamAudioSentences(safeMulti, sessionId);
                _io?.emit(constants_js_1.SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
            }
            _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
            return { text: safeMulti, status: 'done' };
        }
        catch (maErr) {
            console.error(`[orch:${requestId}] multi-agent failed, falling through to single-agent:`, maErr);
            // Fall through to single-agent path below
        }
    }
    // ── LLM Router — choose provider ──────────────────────────────────────────
    const route = (0, llm_router_js_1.classifyRequest)(userMessage, !!imageBase64, ctx.messages.length);
    console.log(`[router] provider=${route.provider} reason="${route.reason}" fallback=${route.fallback}`);
    // ── Fast path cascade: Groq/Gemini/OpenAI before any Claude call ─────────
    if (route.fastPath && (route.provider === 'groq' || route.provider === 'gemini')) {
        const fastToday = new Date().toISOString().slice(0, 10);
        const fpCascade = [];
        if (imageBase64) {
            // Vision cascade: Gemini → OpenAI → Claude (lightweight, no tool loop) → clean error
            console.log(`[VISION_RUNTIME] source=mobile_scanner base64_length=${imageBase64.length} mime=${imageMime} gemini=${(0, llm_router_js_1.isGeminiAvailable)()} openai=${(0, llm_router_js_1.isOpenAIAvailable)()} claude=${(0, llm_router_js_1.isClaudeAvailable)()}`);
            if ((0, llm_router_js_1.isGeminiAvailable)())
                fpCascade.push({ key: 'gemini', fn: () => (0, llm_router_js_1.callGemini)(userMessage, ctx.systemExtra, imageBase64, imageMime) });
            if ((0, llm_router_js_1.isOpenAIAvailable)())
                fpCascade.push({ key: 'openai', fn: () => (0, llm_router_js_1.callOpenAIVision)(userMessage, ctx.systemExtra, imageBase64, imageMime) });
            if ((0, llm_router_js_1.isClaudeAvailable)())
                fpCascade.push({ key: 'claude', fn: () => (0, llm_router_js_1.callClaudeVision)(userMessage, ctx.systemExtra, imageBase64, imageMime) });
        }
        else {
            // Text: primary provider first, then alternatives, then OpenAI
            if (route.provider === 'groq') {
                fpCascade.push({ key: 'groq', fn: () => (0, llm_router_js_1.callGroq)(userMessage, ctx.systemExtra) });
                if ((0, llm_router_js_1.isGeminiAvailable)())
                    fpCascade.push({ key: 'gemini', fn: () => (0, llm_router_js_1.callGemini)(userMessage, ctx.systemExtra) });
            }
            else {
                fpCascade.push({ key: 'gemini', fn: () => (0, llm_router_js_1.callGemini)(userMessage, ctx.systemExtra) });
                if ((0, llm_router_js_1.isGroqAvailable)())
                    fpCascade.push({ key: 'groq', fn: () => (0, llm_router_js_1.callGroq)(userMessage, ctx.systemExtra) });
            }
            if ((0, llm_router_js_1.isOpenAIAvailable)()) {
                const plain = ctx.messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }));
                fpCascade.push({ key: 'openai', fn: () => (0, llm_router_js_1.callOpenAI)(plain, ctx.systemExtra) });
            }
        }
        for (const fp of fpCascade) {
            if (imageBase64)
                console.log(`[VISION_RUNTIME] provider_attempt=${fp.key}`);
            try {
                const fastText = await fp.fn();
                queue_js_1.redis.incr(`provider:calls:${fastToday}:${fp.key}`).catch(() => { });
                const guarded1 = (0, response_guard_js_1.guardResponse)(fastText, userMessage, requestId);
                const safeText = (0, response_guard_js_1.phantomGuard)(guarded1, [], userMessage, requestId);
                if (imageBase64) {
                    console.log(`[VISION_RUNTIME] ${fp.key}_status=success chars=${safeText.length}`);
                }
                console.log(`[MOBILE_RUNTIME] channel=${source_channel} session=${sessionId} provider=${fp.key} fast_path=true router_used=true legacy=false`);
                _io?.emit(constants_js_1.SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: safeText });
                (0, supabase_js_1.saveConversationTurn)(sessionId, 'assistant', safeText).catch(() => { });
                if (!textOnly && safeText.length > 0) {
                    _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
                    await streamAudioSentences(safeText, sessionId);
                    _io?.emit(constants_js_1.SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
                }
                _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
                return { text: safeText, status: 'done' };
            }
            catch (fpErr) {
                const _axErr = fpErr;
                if (imageBase64) {
                    console.warn(`[VISION_RUNTIME] ${fp.key}_status=failed http=${_axErr.response?.status ?? 'network'} reason=${JSON.stringify(_axErr.response?.data ?? {}).slice(0, 400)} msg="${_axErr.message ?? ''}" session=${sessionId}`);
                }
                else {
                    console.warn(`[MOBILE_RUNTIME] fast_path=${fp.key} FAILED status=${_axErr.response?.status ?? 'network'} body=${JSON.stringify(_axErr.response?.data ?? {}).slice(0, 100)} session=${sessionId} — trying next`);
                }
            }
        }
        // Vision: Gemini+OpenAI+Claude all failed — return clean message, never crash
        if (imageBase64) {
            console.error(`[VISION_RUNTIME] ALL_PROVIDERS_FAILED session=${sessionId} gemini=${(0, llm_router_js_1.isGeminiAvailable)()} openai=${(0, llm_router_js_1.isOpenAIAvailable)()} claude=${(0, llm_router_js_1.isClaudeAvailable)()}`);
            const visionErr = 'Vision IA indisponible pour le moment. Réessaie dans quelques secondes.';
            _io?.emit(constants_js_1.SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: visionErr });
            if (!textOnly) {
                _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
                await streamAudioSentences(visionErr, sessionId);
                _io?.emit(constants_js_1.SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
            }
            _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
            return { text: visionErr, status: 'error' };
        }
        // Text: all cheap providers exhausted → fall through to Claude agentic loop
        console.warn(`[MOBILE_RUNTIME] all fast providers exhausted — falling to Claude. session=${sessionId}`);
    }
    // ── Phase 3: CoreRouter — pick specialized agent ──────────────────────────
    const agentRoute = (0, core_router_js_1.routeToAgent)(userMessage) ?? { agent: null, agentTools: undefined, label: '🤖 Dzaryx' };
    // History agent: only activate when NO keyword matched current message
    // (priority override removed — caused CLIENTS_AGENT to be hijacked by BOOKING_AGENT from old booking history)
    const historyAgent = (0, core_router_js_1.detectAgentFromHistory)(ctx.messages);
    if (!agentRoute.agent && historyAgent) {
        const { Dzaryx_TOOLS } = await Promise.resolve().then(() => __importStar(require('../integrations/tools.js')));
        agentRoute.agentTools = Dzaryx_TOOLS.filter((t) => historyAgent.toolNames.includes(t.name));
        agentRoute.label = historyAgent.name;
        agentRoute.agent = historyAgent;
    }
    const agentSystemExtra = (0, core_router_js_1.buildAgentSystem)(agentRoute, ctx.systemExtra);
    console.log(`[agent] ${agentRoute.label} — ${agentRoute.agentTools?.length ?? 'all'} tools — history_override=disabled`);
    // 3. Claude répond avec Tool Streaming temps réel
    let response;
    try {
        response = await (0, claude_api_js_1.chatWithTools)(ctx.messages, agentSystemExtra, sessionId, 
        // onToolStart → émettre "Dzaryx utilise l'outil X…"
        (toolName, _toolInput) => {
            const label = getToolLabel(toolName);
            _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId, toolLabel: label });
            console.log(`[tool-stream] ▶ ${label}`);
        }, 
        // onToolDone → retour au statut thinking normal
        (_toolName, _result) => {
            _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId, toolLabel: null });
        }, 
        // onTextChunk → streaming texte temps réel vers le frontend
        (chunk) => {
            _io?.emit(constants_js_1.SOCKET_EVENTS.TEXT_CHUNK, { sessionId, chunk });
        }, imageBase64, imageMime, agentRoute.agentTools);
    }
    catch (claudeErr) {
        const _cAxErr = claudeErr;
        console.error(`[PROVIDER_ROUTER] provider=claude FAILED status=${_cAxErr.response?.status ?? 'unknown'} body=${JSON.stringify(_cAxErr.response?.data ?? {}).slice(0, 200)} msg="${claudeErr instanceof Error ? claudeErr.message : String(claudeErr)}" session=${sessionId}`);
        // ── Fallback chain: Groq → OpenAI → Gemini ────────────────────────────
        const today = new Date().toISOString().slice(0, 10);
        queue_js_1.redis.incr(`provider:fallback:${today}:claude`).catch(() => { });
        console.warn(`[provider-monitor] Claude failed — entering fallback chain. session=${sessionId}`);
        const plainMessages = ctx.messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));
        const fallbackProviders = [];
        // Groq first — fastest + cheapest ($0.59/MTok input vs $3.00 Claude)
        if ((0, llm_router_js_1.isGroqAvailable)())
            fallbackProviders.push({ name: 'Groq LLaMA3', key: 'groq', fn: () => (0, llm_router_js_1.callGroq)(userMessage, ctx.systemExtra) });
        if ((0, llm_router_js_1.isOpenAIAvailable)())
            fallbackProviders.push({ name: 'OpenAI GPT-4o', key: 'openai', fn: () => (0, llm_router_js_1.callOpenAI)(plainMessages, ctx.systemExtra) });
        if ((0, llm_router_js_1.isGeminiAvailable)())
            fallbackProviders.push({ name: 'Gemini Flash', key: 'gemini', fn: () => (0, llm_router_js_1.callGemini)(userMessage, ctx.systemExtra) });
        for (const fb of fallbackProviders) {
            console.warn(`[router] Attempting ${fb.name} fallback…`);
            try {
                const fallbackText = await fb.fn();
                // Track successful fallback in Redis
                queue_js_1.redis.incr(`provider:calls:${today}:${fb.key}`).catch(() => { });
                queue_js_1.redis.incr(`provider:fallback:${today}:${fb.key}:success`).catch(() => { });
                console.warn(`[MOBILE_RUNTIME] channel=${source_channel} session=${sessionId} provider=${fb.key} fast_path=false fallback=true router_used=true legacy=false`);
                const guarded1 = (0, response_guard_js_1.guardResponse)(fallbackText, userMessage, requestId);
                // Fallback providers = aucun outil → phantom guard
                const safeText = (0, response_guard_js_1.phantomGuard)(guarded1, [], userMessage, requestId);
                _io?.emit(constants_js_1.SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: safeText });
                (0, supabase_js_1.saveConversationTurn)(sessionId, 'assistant', safeText).catch(() => { });
                if (!textOnly && safeText.length > 0) {
                    _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
                    await streamAudioSentences(safeText, sessionId);
                    _io?.emit(constants_js_1.SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
                }
                _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
                return { text: safeText, status: 'done' };
            }
            catch (fbErr) {
                const _fbAxErr = fbErr;
                console.error(`[PROVIDER_ROUTER] provider=${fb.key} FAILED status=${_fbAxErr.response?.status ?? 'network'} body=${JSON.stringify(_fbAxErr.response?.data ?? {}).slice(0, 200)} msg="${_fbAxErr.message ?? ''}" session=${sessionId}`);
            }
        }
        console.error(`[MOBILE_RUNTIME] channel=${source_channel} session=${sessionId} ALL_PROVIDERS_FAILED error=true router_used=true legacy=false`);
        const errorText = `⚠️ Service temporairement indisponible. Réessaie dans quelques secondes.`;
        _io?.emit(constants_js_1.SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: errorText });
        _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
        return { text: errorText, status: 'error' };
    }
    // Log thinking tokens si Extended Thinking utilisé
    if (response.thinkingTokens && response.thinkingTokens > 0) {
        console.log(`[orch:${requestId}] Extended Thinking: ${response.thinkingTokens} tokens`);
    }
    // Guard pass 1: strip leaked old-confirmation prefixes
    const guardedText = (0, response_guard_js_1.guardResponse)(response.text, userMessage, requestId);
    // Guard pass 2: remove old video-task paragraphs from non-video responses
    const scopedText = (0, response_guard_js_1.applyScopeGuard)(guardedText, userMessage, requestId);
    // Guard pass 3: PHANTOM GUARD — bloque toute affirmation d'action sans outil write réel
    const phantomText = (0, response_guard_js_1.phantomGuard)(scopedText, response.toolsExecuted, userMessage, requestId);
    // Guard pass 4: anti-hallucination Gates 2&3 — financial claims + system state claims
    const halluCheck = (0, anti_hallucination_js_1.checkAntiHallucination)(phantomText, response.toolsExecuted, userMessage, requestId);
    const safeText = halluCheck.blocked ?? phantomText;
    // Log trace complète
    const phantomBlocked = phantomText === response_guard_js_1.PHANTOM_REFUSAL;
    console.log(`[execution-trace] {` +
        `"execution_trace_id":"${requestId}",` +
        `"source_channel":"${source_channel}",` +
        `"session":"${sessionId}",` +
        `"tools_called":[${response.toolsExecuted.map(t => `"${t.name}"`).join(',')}],` +
        `"write_tool_success":${response.toolsExecuted.some(t => t.success)},` +
        `"response_allowed":${!halluCheck.blocked && !phantomBlocked},` +
        `"phantom_blocked":${phantomBlocked},` +
        `"hallucination_blocked":${halluCheck.reason ?? 'none'}` +
        `}`);
    console.log(`[orch:${requestId}] done len=${safeText.length} guard1=${guardedText !== response.text} guard2=${scopedText !== guardedText} guard3_phantom=${phantomBlocked} guard4_hallu=${halluCheck.reason ?? 'none'}`);
    // 4. Émettre le texte IMMÉDIATEMENT dès que Claude a répondu
    _io?.emit(constants_js_1.SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: safeText });
    // 5. Sauvegarder en base (non-bloquant)
    (0, supabase_js_1.saveConversationTurn)(sessionId, 'assistant', safeText).catch((err) => console.error('[orchestrator] save error:', err));
    // 6. Audio ElevenLabs (seulement si app mobile, pas Telegram)
    if (!textOnly && safeText.length > 0) {
        _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
        await streamAudioSentences(safeText, sessionId);
        _io?.emit(constants_js_1.SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
    }
    // 7. Idle
    _io?.emit(constants_js_1.SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
    return { text: safeText, status: 'done' };
}
async function streamAudioSentences(text, sessionId) {
    const SENTENCE_END = /([.!?…]+\s+|[.!?…]+$)/g;
    const sentences = [];
    let last = 0;
    let match;
    while ((match = SENTENCE_END.exec(text)) !== null) {
        const end = match.index + match[0].length;
        const sentence = text.slice(last, end).trim();
        if (sentence)
            sentences.push(sentence);
        last = end;
    }
    if (last < text.length) {
        const remaining = text.slice(last).trim();
        if (remaining)
            sentences.push(remaining);
    }
    for (const sentence of sentences) {
        await (0, dispatcher_js_1.synthesizeVoiceStream)(sentence, (chunk) => {
            _io?.emit(constants_js_1.SOCKET_EVENTS.AUDIO_CHUNK, {
                sessionId,
                chunk: chunk.toString('base64'),
                mimeType: 'audio/mpeg',
            });
        }).catch((err) => console.error('[orchestrator] audio error:', err));
    }
}
//# sourceMappingURL=orchestrator.js.map