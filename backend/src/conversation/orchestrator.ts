import { buildContext }                          from './context-builder.js';
import { chatWithTools }                         from '../integrations/claude-api.js';
import { saveConversationTurn }                  from '../integrations/supabase.js';
import { synthesizeVoiceStream }                 from '../notifications/dispatcher.js';
import type { Namespace }                        from 'socket.io';
import { SOCKET_EVENTS }                         from '../config/constants.js';

let _io: Namespace | null = null;

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
  get_client_profile:   '👤 Chargement profil client…',
  send_telegram_message:'📱 Envoi sur Telegram…',
  get_payment_status:   '💳 Vérification paiements…',
  record_payment:       '💳 Enregistrement paiement…',
  generate_receipt:     '🧾 Génération reçu…',
  get_unpaid_bookings:  '⚠️ Vérification impayés…',
  check_anomalies:        '🔍 Détection anomalies…',
  generate_contract:      '📄 Génération contrat location…',
  get_fleet_stats:        '📊 Analyse statistiques flotte…',
  add_to_blacklist:       '⛔ Ajout blacklist…',
  check_blacklist:        '⛔ Vérification blacklist…',
  get_blacklist:          '⛔ Chargement blacklist…',
  update_car_info:        '🚗 Mise à jour fiche voiture…',
  get_car_profile:        '🚗 Chargement fiche voiture…',
  record_mileage:         '🛣️ Enregistrement kilométrage…',
  get_car_mileage:        '🛣️ Chargement kilométrage…',
  record_deposit:         '💰 Enregistrement caution…',
  get_deposits_to_return: '💰 Vérification cautions…',
  mark_deposit_returned:  '💰 Remboursement caution…',
  send_alert:             '🚨 Envoi alerte Pushover…',
  record_maintenance:     '🔧 Enregistrement entretien…',
  get_fleet_maintenance:  '🔧 Chargement historique flotte…',
  create_calendar_event:  '📅 Création événement calendrier…',
  update_calendar_event:  '📅 Mise à jour calendrier…',
  delete_calendar_event:  '📅 Suppression événement calendrier…',
  sync_booking_to_calendar: '📅 Synchronisation réservation → calendrier…',
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

  // 1. Notifier "thinking" immédiatement
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });

  // 2. Construire le contexte + sauvegarder le message user en parallèle
  const [ctx] = await Promise.all([
    buildContext(sessionId, userMessage),
    saveConversationTurn(sessionId, 'user', userMessage),
  ]);

  // 3. Claude répond avec Tool Streaming temps réel
  let response: Awaited<ReturnType<typeof chatWithTools>>;
  try {
    response = await chatWithTools(
      ctx.messages,
      ctx.systemExtra,
      sessionId,
      // onToolStart → émettre "Ibrahim utilise l'outil X…"
      (toolName: string, _toolInput: Record<string, unknown>) => {
        const label = getToolLabel(toolName);
        _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId, toolLabel: label });
        console.log(`[tool-stream] ▶ ${label}`);
      },
      // onToolDone → retour au statut thinking normal
      (_toolName: string, _result: string) => {
        _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId, toolLabel: null });
      },
      undefined,
      imageBase64,
      imageMime,
    );
  } catch (err) {
    const errorText = `Erreur Ibrahim: ${err instanceof Error ? err.message : String(err)}`;
    _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: errorText });
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
    return { text: errorText, status: 'error' };
  }

  // Log thinking tokens si Extended Thinking utilisé
  if (response.thinkingTokens && response.thinkingTokens > 0) {
    console.log(`[orchestrator] Extended Thinking: ${response.thinkingTokens} tokens de réflexion`);
  }

  // 4. Émettre le texte IMMÉDIATEMENT dès que Claude a répondu
  _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: response.text });

  // 5. Sauvegarder en base (non-bloquant)
  saveConversationTurn(sessionId, 'assistant', response.text).catch((err: unknown) =>
    console.error('[orchestrator] save error:', err),
  );

  // 6. Audio ElevenLabs (seulement si app mobile, pas Telegram)
  if (!textOnly && response.text.length > 0) {
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
    await streamAudioSentences(response.text, sessionId);
    _io?.emit(SOCKET_EVENTS.AUDIO_COMPLETE, { sessionId });
  }

  // 7. Idle
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });

  return { text: response.text, status: 'done' };
}

const MAX_SENTENCE_LEN = 280;

function splitSentences(text: string): string[] {
  // Split on strong punctuation or colon/semicolon (common in French enumerations)
  const SENTENCE_END = /([.!?…]+\s+|[.!?…]+$|[:;]\s+)/g;
  const raw: string[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END.exec(text)) !== null) {
    const end      = match.index + match[0].length;
    const sentence = text.slice(last, end).trim();
    if (sentence) raw.push(sentence);
    last = end;
  }
  if (last < text.length) {
    const remaining = text.slice(last).trim();
    if (remaining) raw.push(remaining);
  }

  // Fallback: break sentences >MAX_SENTENCE_LEN at comma boundaries
  const sentences: string[] = [];
  for (const s of raw) {
    if (s.length <= MAX_SENTENCE_LEN) {
      sentences.push(s);
    } else {
      const parts = s.split(/,\s*/);
      let current = '';
      for (const part of parts) {
        const candidate = current ? `${current}, ${part}` : part;
        if (candidate.length <= MAX_SENTENCE_LEN) {
          current = candidate;
        } else {
          if (current) sentences.push(current);
          current = part;
        }
      }
      if (current) sentences.push(current);
    }
  }
  return sentences.filter(s => s.trim().length > 0);
}

// Pre-buffer a sentence into memory so it's ready to emit instantly
function preBufferSentence(sentence: string): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  return synthesizeVoiceStream(sentence, (chunk) => chunks.push(chunk))
    .catch(() => false)
    .then(() => chunks);
}

async function streamAudioSentences(text: string, sessionId: string): Promise<void> {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return;

  const emit = (chunk: Buffer) =>
    _io?.emit(SOCKET_EVENTS.AUDIO_CHUNK, { sessionId, chunk: chunk.toString('base64'), mimeType: 'audio/mpeg' });

  // Sentence 0: stream live while pre-buffering sentence 1
  let nextBuffered: Promise<Buffer[]> | null =
    sentences.length > 1 ? preBufferSentence(sentences[1]!) : null;

  await synthesizeVoiceStream(sentences[0]!, emit)
    .catch((err: unknown) => console.error('[orchestrator] audio error:', err));

  // Sentences 1+: emit pre-buffered chunks, pre-fetch next in parallel
  for (let i = 1; i < sentences.length; i++) {
    const chunks = await nextBuffered!;
    nextBuffered  = sentences[i + 1] ? preBufferSentence(sentences[i + 1]!) : null;
    for (const chunk of chunks) emit(chunk);
  }
}
