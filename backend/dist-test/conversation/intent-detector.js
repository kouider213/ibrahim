"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeMessage = analyzeMessage;
const claude_api_js_1 = require("../integrations/claude-api.js");
const gate_js_1 = require("../validations/gate.js");
const registry_js_1 = require("../actions/registry.js");
async function analyzeMessage(message, contextSummary) {
    const raw = await (0, claude_api_js_1.detectIntent)(message, contextSummary);
    const action = raw.action;
    const params = (raw.params ?? {});
    let requiresValidation = raw.requiresValidation ?? false;
    let validationReason;
    if (action) {
        // Check registry-level validation requirement
        if ((0, registry_js_1.actionRequiresValidation)(action)) {
            requiresValidation = true;
            validationReason = action === 'reply_to_client'
                ? 'Réponse à un client externe'
                : 'Action marquée validation obligatoire';
        }
        // Check business-rule-level validation requirement
        if (!requiresValidation) {
            const check = (0, gate_js_1.checkIfValidationRequired)(action, params);
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
//# sourceMappingURL=intent-detector.js.map