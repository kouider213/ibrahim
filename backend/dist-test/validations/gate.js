"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkIfValidationRequired = checkIfValidationRequired;
const constants_js_1 = require("../config/constants.js");
function checkIfValidationRequired(action, params) {
    // Always validate client communications
    if (action === 'reply_to_client') {
        return { required: true, reason: 'client_reply', context: 'Réponse à un client externe' };
    }
    // Financial threshold check
    if (action === 'create_reservation') {
        const total = params.total_amount ?? 0;
        const days = typeof params.days === 'number' ? params.days : 1;
        const rate = params.daily_rate ?? 0;
        const estimated = total || rate * days;
        if (estimated >= constants_js_1.BUSINESS_RULES.FINANCIAL_THRESHOLD_DZD) {
            return {
                required: true,
                reason: 'financial',
                context: `Engagement financier: ${estimated.toLocaleString('fr-DZ')} DZD (seuil: ${constants_js_1.BUSINESS_RULES.FINANCIAL_THRESHOLD_DZD.toLocaleString('fr-DZ')} DZD)`,
            };
        }
    }
    return { required: false };
}
//# sourceMappingURL=gate.js.map