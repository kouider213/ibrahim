import { buildContext }            from './context-builder.js';
import { chatWithTools }           from '../integrations/claude-api.js';
import { saveConversationTurn }    from '../integrations/supabase.js';
import { synthesizeVoiceStream }   from '../notifications/dispatcher.js';
import type { Namespace }          from 'socket.io';
import { SOCKET_EVENTS }           from '../config/constants.js';

let _io: Namespace | null = null;

export function initOrchestrator(io: Namespace): void {
  _io = io;
}

export interface OrchestratorResponse {
  text:   string;
  status: 'done' | 'error';
}

export async function processMessage(
  userMessage: string,
  sessionId:   string,
  textOnly = false,
): Promise<OrchestratorResponse> {

  // 1. Notifier "thinking" immédiatement
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });

  // 2. Construire le contexte + sauvegarder le message user en parallèle
  const [ctx] = await Promise.all([
    buildContext(sessionId, userMessage),
    saveConversationTurn(sessionId, 'user', userMessage),
  ]);

  // 3. Claude répond (avec tools si besoin)
  let response: Awaited<ReturnType<typeof chatWithTools>>;
  try {
    response = await chatWithTools(ctx.messages, ctx.systemExtra);
  } catch (err) {
    const errorText = `Erreur Ibrahim: ${err instanceof Error ? err.message : String(err)}`;
    _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: errorText });
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
    return { text: errorText, status: 'error' };
  }

  // 4. Émettre le texte IMMÉDIATEMENT dès que Claude a répondu
  _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: response.text });

  // 5. Sauvegarder en base (non-bloquant)
  saveConversationTurn(sessionId, 'assistant', response.text).catch(err =>
    console.error('[orchestrator] save error:', err)
  );

  // 6. Audio ElevenLabs (seulement si app mobile, pas Telegram)
  if (!textOnly && response.text.length > 0) {
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
    await streamAudioSentences(response.text, sessionId);
  }

  // 7. Idle
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });

  return { text: response.text, status: 'done' };
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
    }).catch(err => console.error('[orchestrator] audio error:', err));
  }
}
