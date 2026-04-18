import { BUSINESS_RULES } from '../config/constants.js';

export type ValidationReason = 'client_reply' | 'financial' | 'other';

export interface ValidationCheck {
  required: boolean;
  reason?:  ValidationReason;
  context?: string;
}

export function checkIfValidationRequired(
  action: string,
  params: Record<string, unknown>,
): ValidationCheck {
  // Always validate client communications
  if (action === 'reply_to_client') {
    return { required: true, reason: 'client_reply', context: 'Réponse à un client externe' };
  }

  // Financial threshold check
  if (action === 'create_reservation') {
    const total = (params as { total_amount?: number }).total_amount ?? 0;
    const days  = typeof params.days === 'number' ? params.days : 1;
    const rate  = (params as { daily_rate?: number }).daily_rate ?? 0;
    const estimated = total || rate * days;

    if (estimated >= BUSINESS_RULES.FINANCIAL_THRESHOLD_DZD) {
      return {
        required: true,
        reason:   'financial',
        context:  `Engagement financier: ${estimated.toLocaleString('fr-DZ')} DZD (seuil: ${BUSINESS_RULES.FINANCIAL_THRESHOLD_DZD.toLocaleString('fr-DZ')} DZD)`,
      };
    }
  }

  return { required: false };
}
