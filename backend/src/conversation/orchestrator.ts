import { buildContext } from './context-builder.js';
import { analyzeMessage } from './intent-detector.js';
import { chat } from '../integrations/claude-api.js';
import { requestValidation } from '../validations/approver.js';
import { saveConversationTurn } from '../integrations/supabase.js';
import { synthesizeVoice } from '../notifications/dispatcher.js';
import { enqueueAction } from '../queue/queue.js';
import { supabase } from '../integrations/supabase.js';
import type { Server as SocketServer } from 'socket.io';
import { SOCKET_EVENTS } from '../config/constants.js';

let _io: SocketServer | null = null;

export function initOrchestrator(io: SocketServer): void {
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

export async function processMessage(
  userMessage: string,
  sessionId:   string,
): Promise<OrchestratorResponse> {
  // Emit thinking status
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'thinking', sessionId });

  await saveConversationTurn(sessionId, 'user', userMessage);

  // Build conversation context
  const ctx = await buildContext(sessionId, userMessage);

  // Detect intent
  const intent = await analyzeMessage(
    userMessage,
    `Session: ${sessionId}. Intent detection context.`,
  );

  let responseText: string;
  let actionResult: { taskId?: string; validationId?: string; status: OrchestratorResponse['status'] } = { status: 'done' };

  if (intent.action && intent.intent !== 'conversation') {
    if (intent.requiresValidation) {
      // Request human validation
      const validationId = await requestValidation(
        intent.action === 'reply_to_client' ? 'client_reply' : 'financial',
        { description: userMessage, action: intent.action, params: intent.params },
        { action: intent.action, params: intent.params },
      );

      responseText = `J'ai besoin de votre validation avant de procéder. ${intent.validationReason ?? ''}. La demande #${validationId.slice(0, 8)} vous a été envoyée.`;
      actionResult = { validationId, status: 'validation_pending' };
    } else {
      // Create task in DB
      const { data: task } = await supabase.from('tasks').insert({
        title:       `${intent.action}: ${userMessage.slice(0, 80)}`,
        action_type: intent.action,
        payload:     intent.params,
        status:      'queued',
        priority:    5,
      }).select('id').single();

      const taskId = (task as { id: string } | null)?.id;

      // Enqueue for async execution
      await enqueueAction({
        action:    intent.action,
        params:    intent.params,
        taskId,
        sessionId,
      });

      // Generate voice acknowledgement immediately
      const ack = await chat(ctx.messages, ctx.systemExtra + `\n\nL'action "${intent.action}" a été mise en queue (task: ${taskId ?? 'N/A'}). Confirme brièvement à l'utilisateur que tu t'en occupes.`);
      responseText = ack.text;
      actionResult = { taskId, status: 'queued' };
    }
  } else {
    // Pure conversational response
    const response = await chat(ctx.messages, ctx.systemExtra);
    responseText = response.text;
  }

  await saveConversationTurn(sessionId, 'assistant', responseText);

  // Synthesize and emit audio
  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'speaking', sessionId });
  const audioBuffer = await synthesizeVoice(responseText);
  const audioBase64 = audioBuffer?.toString('base64');

  if (audioBase64) {
    _io?.emit(SOCKET_EVENTS.AUDIO, { sessionId, audio: audioBase64, mimeType: 'audio/mpeg' });
  } else {
    _io?.emit(SOCKET_EVENTS.RESPONSE, { sessionId, text: responseText, fallback: true });
  }

  _io?.emit(SOCKET_EVENTS.STATUS, { status: 'idle', sessionId });

  return {
    text:         responseText,
    audioBase64,
    action:       intent.action,
    taskId:       actionResult.taskId,
    validationId: actionResult.validationId,
    status:       actionResult.status,
  };
}
