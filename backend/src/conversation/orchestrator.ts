import { buildContext }                          from './context-builder.js';
import { guardResponse, applyScopeGuard, phantomGuard, PHANTOM_REFUSAL } from './response-guard.js';
import { chatWithTools }                         from '../integrations/claude-api.js';
import { saveConversationTurn }                  from '../integrations/supabase.js';
import { synthesizeVoiceStream }                 from '../notifications/dispatcher.js';
import { classifyRequest, callGroq, callGemini, callOpenAI, isOpenAIAvailable, isGeminiAvailable } from '../integrations/llm-router.js';
import { routeToAgent, detectAgentFromHistory, buildAgentSystem } from '../agents/core-router.js';
import type { Namespace }                        from 'socket.io';
import { SOCKET_EVENTS }                         from '../config/constants.js';

let _io: Namespace | null = null;
let _reqCounter = 0;

function nextRequestId(): string { return `req_${Date.now()}_${++_reqCounter}`; }

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

  const requestId = nextRequestId();
  console.log(`[orch:${requestId}] session=${sessionId} msg="${userMessage.slice(0, 80)}"`);

  // 1. Notifier "thinking" immédiatement
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });

  // 2. Construire le contexte + sauvegarder le message user en parallèle
  const [ctx] = await Promise.all([
    buildContext(sessionId, userMessage),
    saveConversationTurn(sessionId, 'user', userMessage).catch((err: unknown) =>
      console.error('[orchestrator] user save error:', err),
    ),
  ]);

  // ── LLM Router — choose provider ──────────────────────────────────────────
  const route = classifyRequest(userMessage, !!imageBase64, ctx.messages.length);
  console.log(`[router] provider=${route.provider} reason="${route.reason}" fallback=${route.fallback}`);

  // ── Fast path: Groq or Gemini (no agentic loop) ───────────────────────────
  if (route.fastPath && (route.provider === 'groq' || route.provider === 'gemini')) {
    try {
      let fastText: string;
      if (route.provider === 'groq') {
        fastText = await callGroq(userMessage, ctx.systemExtra);
      } else {
        fastText = await callGemini(userMessage, ctx.systemExtra, imageBase64, imageMime);
      }
      const guarded1  = guardResponse(fastText, userMessage, requestId);
      // Fast path = aucun outil appelé → phantom guard obligatoire
      const safeText  = phantomGuard(guarded1, [], userMessage, requestId);
      _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: safeText });
      saveConversationTurn(sessionId, 'assistant', safeText).catch(() => {});
      if (!textOnly && safeText.length > 0) {
        _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
        await streamAudioSentences(safeText, sessionId);
        _io?.emit(SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
      }
      _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
      return { text: safeText, status: 'done' };
    } catch (fastErr) {
      console.warn(`[router] ${route.provider} failed (${fastErr instanceof Error ? fastErr.message : fastErr}) — falling back to Claude`);
      // Fall through to Claude below
    }
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
    console.error(`[orch:${requestId}] Claude failed:`, claudeErr);

    // ── Fallback chain: OpenAI → Gemini ───────────────────────────────────
    const plainMessages = ctx.messages.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    const fallbackProviders: Array<{ name: string; fn: () => Promise<string> }> = [];
    if (isOpenAIAvailable()) fallbackProviders.push({ name: 'OpenAI GPT-4o', fn: () => callOpenAI(plainMessages, ctx.systemExtra) });
    if (isGeminiAvailable()) fallbackProviders.push({ name: 'Gemini Flash', fn: () => callGemini(userMessage, ctx.systemExtra) });

    for (const fb of fallbackProviders) {
      console.warn(`[router] Attempting ${fb.name} fallback…`);
      try {
        const fallbackText = await fb.fn();
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
        console.error(`[router] ${fb.name} fallback failed:`, fbErr);
      }
    }

    const errorText = `Erreur Dzaryx: ${claudeErr instanceof Error ? claudeErr.message : String(claudeErr)}`;
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
