"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initApprover = initApprover;
exports.requestValidation = requestValidation;
exports.processValidationReply = processValidationReply;
exports.getPendingValidations = getPendingValidations;
const supabase_js_1 = require("../integrations/supabase.js");
const pushover_js_1 = require("../notifications/pushover.js");
const constants_js_1 = require("../config/constants.js");
const env_js_1 = require("../config/env.js");
let _io = null;
function initApprover(io) {
    _io = io;
}
async function requestValidation(type, context, proposed, taskId) {
    const { data, error } = await supabase_js_1.supabase
        .from('validations')
        .insert({
        task_id: taskId,
        type,
        context,
        proposed,
        status: 'pending',
    })
        .select('id')
        .single();
    if (error)
        throw new Error(`Validation insert failed: ${error.message}`);
    const validationId = data.id;
    // Notify via Pushover
    await (0, pushover_js_1.sendPushover)({
        title: `Dzaryx — Validation requise`,
        message: `[${type}] ${context['description'] ?? 'Action en attente de validation'}`,
        priority: 1,
        url: `${env_js_1.env.BACKEND_URL}/api/validations/${validationId}`,
        urlTitle: 'Voir la demande',
    });
    // Notify via Socket
    _io?.emit(constants_js_1.SOCKET_EVENTS.VALIDATION_REQ, { id: validationId, type, context, proposed });
    return validationId;
}
async function processValidationReply(validationId, decision, note, decisionBy) {
    const { data: validation, error: fetchError } = await supabase_js_1.supabase
        .from('validations')
        .select('*')
        .eq('id', validationId)
        .eq('status', 'pending')
        .single();
    if (fetchError || !validation)
        return null;
    await supabase_js_1.supabase
        .from('validations')
        .update({
        status: decision,
        decision_by: decisionBy ?? 'owner',
        decision_at: new Date().toISOString(),
        note,
    })
        .eq('id', validationId);
    return validation;
}
async function getPendingValidations() {
    const { data, error } = await supabase_js_1.supabase
        .from('validations')
        .select('*')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
    if (error)
        throw new Error(error.message);
    return data ?? [];
}
//# sourceMappingURL=approver.js.map