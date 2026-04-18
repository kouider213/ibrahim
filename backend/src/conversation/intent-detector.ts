import { detectIntent } from '../integrations/claude-api.js';
import { checkIfValidationRequired } from '../validations/gate.js';
import { actionRequiresValidation } from '../actions/registry.js';

export interface DetectedIntent {
  intent:             string;
  action?:            string;
  params:             Record<string, unknown>;
  requiresValidation: boolean;
  validationReason?:  string;
}

export async function analyzeMessage(
  message: string,
  contextSummary: string,
): Promise<DetectedIntent> {
  const raw = await detectIntent(message, contextSummary);

  const action = raw.action;
  const params = (raw.params ?? {}) as Record<string, unknown>;

  let requiresValidation = raw.requiresValidation ?? false;
  let validationReason: string | undefined;

  if (action) {
    // Check registry-level validation requirement
    if (actionRequiresValidation(action)) {
      requiresValidation = true;
      validationReason = action === 'reply_to_client'
        ? 'Réponse à un client externe'
        : 'Action marquée validation obligatoire';
    }

    // Check business-rule-level validation requirement
    if (!requiresValidation) {
      const check = checkIfValidationRequired(action, params);
      if (check.required) {
        requiresValidation = true;
        validationReason = check.context;
      }
    }
  }

  return {
    intent: raw.intent,
    action,
    params,
    requiresValidation,
    validationReason,
  };
}
