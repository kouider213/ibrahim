import { getAction } from './registry.js';
import { handleReservation } from './handlers/reservation.js';
import { handleContent } from './handlers/content.js';
import { handlePcRelay } from './handlers/pc-relay.js';
import { handleFinance } from './handlers/finance.js';
import { handleLearning } from './handlers/learning.js';
import { audit } from '../audit/logger.js';
import { supabase } from '../integrations/supabase.js';

export interface ActionPayload {
  action:    string;
  params:    Record<string, unknown>;
  taskId?:   string;
  sessionId: string;
}

export interface ActionResult {
  success: boolean;
  data?:   unknown;
  error?:  string;
  message: string;
}

export async function executeAction(payload: ActionPayload): Promise<ActionResult> {
  const def = getAction(payload.action);
  if (!def) {
    return { success: false, error: 'Unknown action', message: `Action inconnue: ${payload.action}` };
  }

  await audit({
    action:   `execute:${payload.action}`,
    target:   'action',
    after:    { params: payload.params, session: payload.sessionId },
  });

  if (payload.taskId) {
    await supabase
      .from('tasks')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', payload.taskId);
  }

  let result: ActionResult;

  try {
    switch (def.handler) {
      case 'reservation':
        result = await handleReservation(payload);
        break;
      case 'content':
        result = await handleContent(payload);
        break;
      case 'pc-relay':
        result = await handlePcRelay(payload);
        break;
      case 'finance':
        result = await handleFinance(payload);
        break;
      case 'learning':
        result = await handleLearning(payload);
        break;
      default:
        result = { success: false, error: 'No handler', message: 'Aucun handler configuré' };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    result = { success: false, error, message: `Erreur lors de l'exécution: ${error}` };
  }

  if (payload.taskId) {
    await supabase
      .from('tasks')
      .update({
        status:       result.success ? 'completed' : 'failed',
        result:       result.success ? { data: result.data } : undefined,
        error:        result.success ? undefined : result.error,
        completed_at: new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      })
      .eq('id', payload.taskId);
  }

  return result;
}
