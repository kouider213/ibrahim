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
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });

  const [ctx] = await Promise.all([
    buildContext(sessionId, userMessage),
    saveConversationTurn(sessionId, 'user', userMessage),
  ]);

  // chatWithTools: Claude voit les outils, appelle Supabase si besoin, retourne réponse finale
  const response = await chatWithTools(ctx.messages, ctx.systemExtra);

  await saveConversationTurn(sessionId, 'assistant', response.text);

  if (textOnly) {
    // Telegram — texte seulement
    _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: response.text });
  } else {
    // App mobile — texte + audio ElevenLabs
    _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: response.text });
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });

    await streamAudioSentences(response.text, sessionId);
  }

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
