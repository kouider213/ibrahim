import { buildContext } from './context-builder.js';
import { analyzeMessage } from './intent-detector.js';
import { chatStream } from '../integrations/claude-api.js';
import { requestValidation } from '../validations/approver.js';
import { saveConversationTurn } from '../integrations/supabase.js';
import { synthesizeVoice, synthesizeVoiceStream } from '../notifications/dispatcher.js';
import { enqueueAction } from '../queue/queue.js';
import { supabase } from '../integrations/supabase.js';
import type { Namespace } from 'socket.io';
import { SOCKET_EVENTS } from '../config/constants.js';

let _io: Namespace | null = null;

export function initOrchestrator(io: Namespace): void {
  _io = io;
}

export interface OrchestratorResponse {
  text:          string;
  audioBase64?:  string;
  action?:       string;
  taskId?:       string;
  validationId?: string;
  status:        'done' | 'queued' | 'validation_pending' | 'error';
}

// Sentence boundary regex — split for progressive TTS
const SENTENCE_END = /([.!?…]+\s+|[.!?…]+$)/;

// Stream text only (mode Écrire — pas d'audio)
async function streamResponseTextOnly(
  sessionId: string,
  messages: Parameters<typeof chatStream>[0],
  systemExtra: string | undefined,
): Promise<string> {
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });
  let fullText = '';
  await chatStream(messages, systemExtra, (chunk: string) => {
    fullText += chunk;
    _io?.emit(SOCKET_EVENTS.TEXT_CHUNK, { sessionId, chunk });
  });
  _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: fullText });
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
  return fullText;
}

// Stream text + audio in parallel: text chunks via WS, audio sentence-by-sentence
async function streamResponseWithAudio(
  sessionId: string,
  messages: Parameters<typeof chatStream>[0],
  systemExtra: string | undefined,
): Promise<string> {
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });

  let fullText = '';
  let pending = '';
  const audioQueue: Promise<void>[] = [];

  const flushSentence = (sentence: string) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    const p: Promise<void> = synthesizeVoiceStream(trimmed, (chunk) => {
      _io?.emit(SOCKET_EVENTS.AUDIO_CHUNK, { sessionId, chunk: chunk.toString('base64'), mimeType: 'audio/mpeg' });
    }).then(() => undefined).catch(err => console.error('[orchestrator] audio chunk error:', err));
    audioQueue.push(p);
  };

  await chatStream(messages, systemExtra, (chunk: string) => {
    fullText += chunk;
    pending += chunk;
    _io?.emit(SOCKET_EVENTS.TEXT_CHUNK, { sessionId, chunk });

    // Flush completed sentences to ElevenLabs immediately
    let match: RegExpExecArray | null;
    while ((match = SENTENCE_END.exec(pending)) !== null) {
      const sentenceEnd = match.index + match[0].length;
      const sentence = pending.slice(0, sentenceEnd);
      pending = pending.slice(sentenceEnd);
      flushSentence(sentence);
    }
  });

  // Flush remaining text
  if (pending.trim()) flushSentence(pending);

  // Wait for all audio chunks to be sent
  await Promise.all(audioQueue);

  _io?.emit(SOCKET_EVENTS.TEXT_COMPLETE, { sessionId, text: fullText });
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });

  return fullText;
}

// Legacy audio path (non-streaming fallback)
async function emitAudioAsync(text: string, sessionId: string): Promise<void> {
  try {
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
    const audioBuffer = await synthesizeVoice(text);
    if (audioBuffer) {
      _io?.emit(SOCKET_EVENTS.AUDIO, { sessionId, audio: audioBuffer.toString('base64'), mimeType: 'audio/mpeg' });
    } else {
      _io?.emit(SOCKET_EVENTS.RESPONSE, { sessionId, text, fallback: true });
    }
  } catch (err) {
    console.error('[orchestrator] audio async error:', err);
    _io?.emit(SOCKET_EVENTS.RESPONSE, { sessionId, text, fallback: true });
  } finally {
    _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });
  }
}

export async function processMessage(
  userMessage: string,
  sessionId:   string,
  textOnly  = false,
): Promise<OrchestratorResponse> {
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });

  // Run DB save, context building, and intent detection all in parallel
  const [ctx, intent] = await Promise.all([
    buildContext(sessionId, userMessage),
    analyzeMessage(userMessage, `Session: ${sessionId}`),
    saveConversationTurn(sessionId, 'user', userMessage),
  ]) as [Awaited<ReturnType<typeof buildContext>>, Awaited<ReturnType<typeof analyzeMessage>>, unknown];

  let responseText: string;
  let actionResult: { taskId?: string; validationId?: string; status: OrchestratorResponse['status'] } = { status: 'done' };

  if (intent.action && intent.intent !== 'conversation') {
    if (intent.requiresValidation) {
      const validationId = await requestValidation(
        intent.action === 'reply_to_client' ? 'client_reply' : 'financial',
        { description: userMessage, action: intent.action, params: intent.params },
        { action: intent.action, params: intent.params },
      );
      responseText = `J'ai besoin de votre validation avant de procéder. ${intent.validationReason ?? ''}. La demande #${validationId.slice(0, 8)} vous a été envoyée.`;
      actionResult = { validationId, status: 'validation_pending' };

      await saveConversationTurn(sessionId, 'assistant', responseText);
      void emitAudioAsync(responseText, sessionId);
    } else {
      const { data: task } = await supabase.from('tasks').insert({
        title:       `${intent.action}: ${userMessage.slice(0, 80)}`,
        action_type: intent.action,
        payload:     intent.params,
        status:      'queued',
        priority:    5,
      }).select('id').single();

      const taskId = (task as { id: string } | null)?.id;
      await enqueueAction({ action: intent.action, params: intent.params, taskId, sessionId });

      // Stream ack response
      const ackSystem = ctx.systemExtra + `\n\nL'action "${intent.action}" a été mise en queue (task: ${taskId ?? 'N/A'}). Confirme brièvement à l'utilisateur que tu t'en occupes.`;
      const streamFn = textOnly ? streamResponseTextOnly : streamResponseWithAudio;
      responseText = await streamFn(sessionId, ctx.messages, ackSystem);
      actionResult = { taskId, status: 'queued' };

      await saveConversationTurn(sessionId, 'assistant', responseText);
    }
  } else {
    const streamFn = textOnly ? streamResponseTextOnly : streamResponseWithAudio;
    responseText = await streamFn(sessionId, ctx.messages, ctx.systemExtra);
    await saveConversationTurn(sessionId, 'assistant', responseText);
  }

  return {
    text:         responseText,
    action:       intent.action,
    taskId:       actionResult.taskId,
    validationId: actionResult.validationId,
    status:       actionResult.status,
  };
}
