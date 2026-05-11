import { buildContext }                          from './context-builder.js';
import { guardResponse, applyScopeGuard, phantomGuard, PHANTOM_REFUSAL } from './response-guard.js';
import { chatWithTools }                         from '../integrations/claude-api.js';
import { saveConversationTurn }                  from '../integrations/supabase.js';
import { synthesizeVoiceStream }                 from '../notifications/dispatcher.js';
import { classifyRequest, callGroq, callGemini, callOpenAI, callOpenAIVision, isOpenAIAvailable, isGeminiAvailable, isGroqAvailable } from '../integrations/llm-router.js';
import { routeToAgent, detectAgentFromHistory, buildAgentSystem } from '../agents/core-router.js';
import { needsMultiAgent, selectAgents, runMultiAgent }           from '../agents/multi-agent-orchestrator.js';
import type { Namespace }                        from 'socket.io';
import { SOCKET_EVENTS }                         from '../config/constants.js';
import { redis }                                 from '../queue/queue.js';

let _io: Namespace | null = null;
let _reqCounter = 0;

function nextRequestId(): string { return `req_${Date.now()}_${++_reqCounter}`; }

function detectSourceChannel(sessionId: string): 'telegram' | 'mobile_voice' | 'mobile_text' | 'backend_internal' {
  if (sessionId.startsWith('telegram_'))  return 'telegram';
  if (sessionId.startsWith('voice_'))     return 'mobile_voice';
  if (sessionId.startsWith('mobile_'))    return 'mobile_text';
  return 'backend_internal';
}

export function initOrchestrator(io: Namespace): void {
  _io = io;
}

export interface OrchestratorResponse {
  text:   string;
  status: 'done' | 'error';
}

// ── Mapping outil → message lisible pour l'UI ────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  list_bookings:        '📋 Récupération des réservations…',
  create_booking:       '✍️ Création de la réservation…',
  update_booking:       '✏️ Modification de la réservation…',
  cancel_booking:       '❌ Annulation en cours…',
  delete_booking:       '🗑️ Suppression…',
  get_financial_report: '💰 Calcul du rapport financier…',
  get_revenue_report:   '📊 Analyse des revenus…',
  get_finance_dashboard:'📈 Tableau de bord financier…',
  check_car_availability:'🚗 Vérification disponibilité…',
  get_weather:          '🌤️ Récupération météo…',
  get_news:             '📰 Chargement actualités…',
  remember_info:        '🧠 Mémorisation…',
  recall_memory:        '🧠 Consultation mémoire…',
  learn_rule:           '📚 Apprentissage règle…',
  web_search:           '🔍 Recherche internet…',
  fetch_url:            '🌐 Lecture page web…',
  github_read_file:     '📂 Lecture fichier code…',
  github_write_file:    '💾 Écriture fichier code…',
  github_list_files:    '📁 Navigation dossier…',
  github_search_code:   '🔎 Recherche dans le code…',
  railway_wait_deploy:  '🚀 Déploiement en cours… (2-3 min)',
  railway_get_logs:     '📋 Récupération logs Railway…',
  supabase_execute:     '🗄️ Requête base de données…',
  send_whatsapp_to_client: '📱 Envoi WhatsApp…',
  store_document:       '📄 Stockage document…',
  get_client_document:  '📄 Récupération document…',
  send_telegram_message:'📱 Envoi sur Telegram…',
  get_payment_status:   '💳 Vérification paiements…',
  record_payment:       '💳 Enregistrement paiement…',
  generate_receipt:     '🧾 Génération reçu…',
  get_late_returns:     '🚨 Vérification retards de retour…',
  generate_reservation_voucher: '📄 Génération bon de réservation PDF…',
  get_unpaid_bookings:  '⚠️ Vérification impayés…',
  check_anomalies:      '🔍 Détection anomalies…',
  analyze_image:        '🖼️ Analyse image…',
  optimize_image:       '🖼️ Optimisation image…',
  enhance_image:        '✨ Amélioration image…',
  remove_background:    '🎨 Suppression arrière-plan…',
  add_text_overlay:     '📝 Ajout texte sur image…',
  create_social_variants: '📱 Création variantes réseaux…',
  analyze_video:        '🎬 Analyse vidéo…',
  cut_video:            '✂️ Découpe vidéo…',
  merge_videos:         '🎞️ Fusion vidéos…',
  add_subtitles:        '💬 Génération sous-titres…',
  optimize_for_platform: '📱 Optimisation plateforme…',
  extract_thumbnail:    '🖼️ Extraction miniature…',
  add_background_music: '🎵 Ajout musique…',
  create_video_preview: '🎬 Création aperçu vidéo…',
  publish_to_socials:   '🚀 Publication TikTok…',
};

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `🔧 ${toolName}…`;
}

// ── Processeur principal ──────────────────────────────────────────────────────
export async function processMessage(
  userMessage:  string,
  sessionId:    string,
  textOnly    = false,
  imageBase64?: string,
  imageMime   = 'image/jpeg',
): Promise<OrchestratorResponse> {

  const requestId     = nextRequestId();
  const source_channel = detectSourceChannel(sessionId);
  console.log(
    `[orch:${requestId}] source_channel=${source_channel} session=${sessionId} msg="${userMessage.slice(0, 80)}"`,
  );

  // 1. Notifier "thinking" immédiatement
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });

  // 2. Construire le contexte + sauvegarder le message user en parallèle
  const [ctx] = await Promise.all([
    buildContext(sessionId, userMessage),
    saveConversationTurn(sessionId, 'user', userMessage).catch((err: unknown) =>
      console.error('[orchestrator] user save error:', err),
    ),
  ]);

  // ── Multi-Agent path — cross-domain analysis ─────────────────────────────
  // Triggered when the request covers multiple business domains simultaneously
  // (e.g. "analyse Fik Conciergerie et propose des améliorations pour l'été").
  if (!imageBase64 && needsMultiAgent(userMessage)) {
    const agentIds = selectAgents(userMessage) as Parameters<typeof runMultiAgent>[2];
    console.log(`[orch:${requestId}] MULTI-AGENT ▶ agents=[${agentIds.join(',')}]`);
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId, toolLabel: `🤖 Multi-agents: ${agentIds.length} spécialistes...` });

    try {
      const report = await runMultiAgent(userMessage, ctx.systemExtra, agentIds, requestId);
      const multiText = guardResponse(report.fusedResponse, userMessage, requestId);
      const safeMulti = phantomGuard(multiText, [], userMessage, requestId);

      // Execution trace
      console.log(`[multi-agent-trace] request_id=${requestId} agents=${agentIds.length} succeeded=${report.agentsSucceeded} cost=$${report.totalCostUsd.toFixed(6)} ms=${report.totalLatencyMs}`);

      _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: safeMulti });
      saveConversationTurn(sessionId, 'assistant', safeMulti).catch(() => {});
      if (!textOnly && safeMulti.length > 0) {
        _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
        await streamAudioSentences(safeMulti, sessionId);
        _io?.emit(SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
      }
      _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
      return { text: safeMulti, status: 'done' };
    } catch (maErr) {
      console.error(`[orch:${requestId}] multi-agent failed, falling through to single-agent:`, maErr);
      // Fall through to single-agent path below
    }
  }

  // ── LLM Router — choose provider ──────────────────────────────────────────
  const route = classifyRequest(userMessage, !!imageBase64, ctx.messages.length);
  console.log(`[router] provider=${route.provider} reason="${route.reason}" fallback=${route.fallback}`);

  // ── Fast path cascade: Groq/Gemini/OpenAI before any Claude call ─────────
  if (route.fastPath && (route.provider === 'groq' || route.provider === 'gemini')) {
    const fastToday = new Date().toISOString().slice(0, 10);

    type FP = { key: string; fn: () => Promise<string> };
    const fpCascade: FP[] = [];

    if (imageBase64) {
      // Vision: Groq can't do images — Gemini Vision → OpenAI Vision only (never Anthropic)
      console.log(`[VISION_RUNTIME] source=mobile_scanner base64_length=${imageBase64.length} mime=${imageMime} gemini=${isGeminiAvailable()} openai=${isOpenAIAvailable()}`);
      if (isGeminiAvailable())   fpCascade.push({ key: 'gemini', fn: () => callGemini(userMessage, ctx.systemExtra, imageBase64, imageMime) });
      if (isOpenAIAvailable())   fpCascade.push({ key: 'openai', fn: () => callOpenAIVision(userMessage, ctx.systemExtra, imageBase64, imageMime) });
    } else {
      // Text: primary provider first, then alternatives, then OpenAI
      if (route.provider === 'groq') {
        fpCascade.push({ key: 'groq',   fn: () => callGroq(userMessage, ctx.systemExtra) });
        if (isGeminiAvailable()) fpCascade.push({ key: 'gemini', fn: () => callGemini(userMessage, ctx.systemExtra) });
      } else {
        fpCascade.push({ key: 'gemini', fn: () => callGemini(userMessage, ctx.systemExtra) });
        if (isGroqAvailable())   fpCascade.push({ key: 'groq',   fn: () => callGroq(userMessage, ctx.systemExtra) });
      }
      if (isOpenAIAvailable()) {
        const plain = ctx.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }));
        fpCascade.push({ key: 'openai', fn: () => callOpenAI(plain, ctx.systemExtra) });
      }
    }

    for (const fp of fpCascade) {
      if (imageBase64) console.log(`[VISION_RUNTIME] provider_attempt=${fp.key}`);
      try {
        const fastText = await fp.fn();
        redis.incr(`provider:calls:${fastToday}:${fp.key}`).catch(() => {});
        const guarded1 = guardResponse(fastText, userMessage, requestId);
        const safeText = phantomGuard(guarded1, [], userMessage, requestId);
        if (imageBase64) {
          console.log(`[VISION_RUNTIME] ${fp.key}_status=success chars=${safeText.length}`);
        }
        console.log(`[MOBILE_RUNTIME] channel=${source_channel} session=${sessionId} provider=${fp.key} fast_path=true router_used=true legacy=false`);
        _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: safeText });
        saveConversationTurn(sessionId, 'assistant', safeText).catch(() => {});
        if (!textOnly && safeText.length > 0) {
          _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
          await streamAudioSentences(safeText, sessionId);
          _io?.emit(SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
        }
        _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
        return { text: safeText, status: 'done' };
      } catch (fpErr) {
        const _axErr = fpErr as { response?: { status?: number; data?: unknown }; message?: string };
        if (imageBase64) {
          console.warn(`[VISION_RUNTIME] ${fp.key}_status=failed http=${_axErr.response?.status ?? 'network'} reason=${JSON.stringify(_axErr.response?.data ?? {}).slice(0, 400)} msg="${_axErr.message ?? ''}" session=${sessionId}`);
        } else {
          console.warn(`[MOBILE_RUNTIME] fast_path=${fp.key} FAILED status=${_axErr.response?.status ?? 'network'} body=${JSON.stringify(_axErr.response?.data ?? {}).slice(0, 100)} session=${sessionId} — trying next`);
        }
      }
    }

    // Vision: never fall through to Claude — return user-friendly error
    if (imageBase64) {
      console.error(`[VISION_RUNTIME] ALL_PROVIDERS_FAILED session=${sessionId} gemini=${isGeminiAvailable()} openai=${isOpenAIAvailable()}`);
      const visionErr = 'Vision IA indisponible pour le moment. Réessaie dans quelques secondes.';
      _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: visionErr });
      if (!textOnly) {
        _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
        await streamAudioSentences(visionErr, sessionId);
        _io?.emit(SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
      }
      _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
      return { text: visionErr, status: 'error' };
    }

    // Text: all cheap providers exhausted → fall through to Claude agentic loop
    console.warn(`[MOBILE_RUNTIME] all fast providers exhausted — falling to Claude. session=${sessionId}`);
  }

  // ── Phase 3: CoreRouter — pick specialized agent ──────────────────────────
  const agentRoute   = routeToAgent(userMessage) ?? { agent: null, agentTools: undefined, label: '🤖 Dzaryx' };
  // If no agent matched but history implies a domain → keep context agent
  if (!agentRoute.agent) {
    const historyAgent = detectAgentFromHistory(ctx.messages);
    if (historyAgent) {
      const { Dzaryx_TOOLS } = await import('../integrations/tools.js');
      agentRoute.agentTools = Dzaryx_TOOLS.filter((t: { name: string }) => historyAgent.toolNames.includes(t.name));
      agentRoute.label = historyAgent.name;
    }
  }
  const agentSystemExtra = buildAgentSystem(agentRoute, ctx.systemExtra);
  console.log(`[agent] ${agentRoute.label} — ${agentRoute.agentTools?.length ?? 'all'} tools`);

  // 3. Claude répond avec Tool Streaming temps réel
  let response: Awaited<ReturnType<typeof chatWithTools>>;
  try {
    response = await chatWithTools(
      ctx.messages,
      agentSystemExtra,
      sessionId,
      // onToolStart → émettre "Dzaryx utilise l'outil X…"
      (toolName: string, _toolInput: Record<string, unknown>) => {
        const label = getToolLabel(toolName);
        _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId, toolLabel: label });
        console.log(`[tool-stream] ▶ ${label}`);
      },
      // onToolDone → retour au statut thinking normal
      (_toolName: string, _result: string) => {
        _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId, toolLabel: null });
      },
      // onTextChunk → streaming texte temps réel vers le frontend
      (chunk: string) => {
        _io?.emit(SOCKET_EVENTS.TEXT_CHUNK, { sessionId, chunk });
      },
      imageBase64,
      imageMime,
      agentRoute.agentTools,   // Phase 3: scoped tool subset
    );
  } catch (claudeErr) {
    const _cAxErr = claudeErr as { response?: { status?: number; data?: unknown } };
    console.error(`[PROVIDER_ROUTER] provider=claude FAILED status=${_cAxErr.response?.status ?? 'unknown'} body=${JSON.stringify(_cAxErr.response?.data ?? {}).slice(0, 200)} msg="${claudeErr instanceof Error ? claudeErr.message : String(claudeErr)}" session=${sessionId}`);

    // ── Fallback chain: Groq → OpenAI → Gemini ────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    redis.incr(`provider:fallback:${today}:claude`).catch(() => {});
    console.warn(`[provider-monitor] Claude failed — entering fallback chain. session=${sessionId}`);

    const plainMessages = ctx.messages.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    const fallbackProviders: Array<{ name: string; key: string; fn: () => Promise<string> }> = [];
    // Groq first — fastest + cheapest ($0.59/MTok input vs $3.00 Claude)
    if (isGroqAvailable())   fallbackProviders.push({ name: 'Groq LLaMA3', key: 'groq',   fn: () => callGroq(userMessage, ctx.systemExtra) });
    if (isOpenAIAvailable()) fallbackProviders.push({ name: 'OpenAI GPT-4o', key: 'openai', fn: () => callOpenAI(plainMessages, ctx.systemExtra) });
    if (isGeminiAvailable()) fallbackProviders.push({ name: 'Gemini Flash',  key: 'gemini', fn: () => callGemini(userMessage, ctx.systemExtra) });

    for (const fb of fallbackProviders) {
      console.warn(`[router] Attempting ${fb.name} fallback…`);
      try {
        const fallbackText = await fb.fn();
        // Track successful fallback in Redis
        redis.incr(`provider:calls:${today}:${fb.key}`).catch(() => {});
        redis.incr(`provider:fallback:${today}:${fb.key}:success`).catch(() => {});
        console.warn(`[MOBILE_RUNTIME] channel=${source_channel} session=${sessionId} provider=${fb.key} fast_path=false fallback=true router_used=true legacy=false`);
        const guarded1     = guardResponse(fallbackText, userMessage, requestId);
        // Fallback providers = aucun outil → phantom guard
        const safeText     = phantomGuard(guarded1, [], userMessage, requestId);
        _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: safeText });
        saveConversationTurn(sessionId, 'assistant', safeText).catch(() => {});
        if (!textOnly && safeText.length > 0) {
          _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
          await streamAudioSentences(safeText, sessionId);
          _io?.emit(SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
        }
        _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
        return { text: safeText, status: 'done' };
      } catch (fbErr) {
        const _fbAxErr = fbErr as { response?: { status?: number; data?: unknown }; message?: string };
        console.error(`[PROVIDER_ROUTER] provider=${fb.key} FAILED status=${_fbAxErr.response?.status ?? 'network'} body=${JSON.stringify(_fbAxErr.response?.data ?? {}).slice(0, 200)} msg="${_fbAxErr.message ?? ''}" session=${sessionId}`);
      }
    }

    console.error(`[MOBILE_RUNTIME] channel=${source_channel} session=${sessionId} ALL_PROVIDERS_FAILED error=true router_used=true legacy=false`);
    const errorText = `⚠️ Service temporairement indisponible. Réessaie dans quelques secondes.`;
    _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: errorText });
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
    return { text: errorText, status: 'error' };
  }

  // Log thinking tokens si Extended Thinking utilisé
  if (response.thinkingTokens && response.thinkingTokens > 0) {
    console.log(`[orch:${requestId}] Extended Thinking: ${response.thinkingTokens} tokens`);
  }

  // Guard pass 1: strip leaked old-confirmation prefixes
  const guardedText  = guardResponse(response.text, userMessage, requestId);
  // Guard pass 2: remove old video-task paragraphs from non-video responses
  const scopedText   = applyScopeGuard(guardedText, userMessage, requestId);
  // Guard pass 3: PHANTOM GUARD — bloque toute affirmation d'action sans outil write réel
  const safeText     = phantomGuard(scopedText, response.toolsExecuted, userMessage, requestId);
  // Log trace complète
  const phantomBlocked = safeText === PHANTOM_REFUSAL;
  console.log(
    `[execution-trace] {` +
    `"execution_trace_id":"${requestId}",` +
    `"source_channel":"${source_channel}",` +
    `"session":"${sessionId}",` +
    `"tools_called":[${response.toolsExecuted.map(t => `"${t.name}"`).join(',')}],` +
    `"write_tool_success":${response.toolsExecuted.some(t => t.success)},` +
    `"response_allowed":${!phantomBlocked},` +
    `"phantom_blocked":${phantomBlocked}` +
    `}`,
  );
  console.log(`[orch:${requestId}] done len=${safeText.length} guard1=${guardedText !== response.text} guard2=${scopedText !== guardedText} guard3_phantom=${safeText !== scopedText}`);

  // 4. Émettre le texte IMMÉDIATEMENT dès que Claude a répondu
  _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: safeText });

  // 5. Sauvegarder en base (non-bloquant)
  saveConversationTurn(sessionId, 'assistant', safeText).catch((err: unknown) =>
    console.error('[orchestrator] save error:', err),
  );

  // 6. Audio ElevenLabs (seulement si app mobile, pas Telegram)
  if (!textOnly && safeText.length > 0) {
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
    await streamAudioSentences(safeText, sessionId);
    _io?.emit(SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
  }

  // 7. Idle
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });

  return { text: safeText, status: 'done' };
}

async function streamAudioSentences(text: string, sessionId: string): Promise<void> {
  const SENTENCE_END = /([.!?…]+\s+|[.!?…]+$)/g;
  const sentences: string[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_END.exec(text)) !== null) {
    const end      = match.index + match[0].length;
    const sentence = text.slice(last, end).trim();
    if (sentence) sentences.push(sentence);
    last = end;
  }
  if (last < text.length) {
    const remaining = text.slice(last).trim();
    if (remaining) sentences.push(remaining);
  }

  for (const sentence of sentences) {
    await synthesizeVoiceStream(sentence, (chunk) => {
      _io?.emit(SOCKET_EVENTS.AUDIO_CHUNK, {
        sessionId,
        chunk:    chunk.toString('base64'),
        mimeType: 'audio/mpeg',
      });
    }).catch((err: unknown) => console.error('[orchestrator] audio error:', err));
  }
}
