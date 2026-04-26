import { supabase } from '../integrations/supabase.js';
import { sendPushover } from '../notifications/pushover.js';
import type { ValidationReason } from './gate.js';
import type { Namespace } from 'socket.io';
import { SOCKET_EVENTS } from '../config/constants.js';
import { env } from '../config/env.js';

export interface PendingValidation {
  id:       string;
  taskId?:  string;
  type:     ValidationReason;
  context:  Record<string, unknown>;
  proposed: Record<string, unknown>;
}

let _io: Namespace | null = null;

export function initApprover(io: Namespace): void {
  _io = io;
}

export async function requestValidation(
  type:     ValidationReason,
  context:  Record<string, unknown>,
  proposed: Record<string, unknown>,
  taskId?:  string,
): Promise<string> {
  const { data, error } = await supabase
    .from('validations')
    .insert({
      task_id:  taskId,
      type,
      context,
      proposed,
      status:   'pending',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Validation insert failed: ${error.message}`);

  const validationId = (data as { id: string }).id;

  // Notify via Pushover
  await sendPushover({
    title:    `Ibrahim — Validation requise`,
    message:  `[${type}] ${context['description'] ?? 'Action en attente de validation'}`,
    priority: 1,
    url:      `${env.BACKEND_URL}/api/validations/${validationId}`,
    urlTitle: 'Voir la demande',
  });

  // Notify via Socket
  _io?.emit(SOCKET_EVENTS.VALIDATION_REQ, { id: validationId, type, context, proposed });

  return validationId;
}

export async function processValidationReply(
  validationId: string,
  decision:     'approved' | 'rejected',
  note?:        string,
  decisionBy?:  string,
): Promise<PendingValidation | null> {
  const { data: validation, error: fetchError } = await supabase
    .from('validations')
    .select('*')
    .eq('id', validationId)
    .eq('status', 'pending')
    .single();

  if (fetchError || !validation) return null;

  await supabase
    .from('validations')
    .update({
      status:      decision,
      decision_by: decisionBy ?? 'owner',
      decision_at: new Date().toISOString(),
      note,
    })
    .eq('id', validationId);

  return validation as PendingValidation;
}

export async function getPendingValidations() {
  const { data, error } = await supabase
    .from('validations')
    .select('*')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
