"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeAction = executeAction;
const registry_js_1 = require("./registry.js");
const reservation_js_1 = require("./handlers/reservation.js");
const content_js_1 = require("./handlers/content.js");
const pc_relay_js_1 = require("./handlers/pc-relay.js");
const finance_js_1 = require("./handlers/finance.js");
const learning_js_1 = require("./handlers/learning.js");
const logger_js_1 = require("../audit/logger.js");
const supabase_js_1 = require("../integrations/supabase.js");
async function executeAction(payload) {
    const def = (0, registry_js_1.getAction)(payload.action);
    if (!def) {
        return { success: false, error: 'Unknown action', message: `Action inconnue: ${payload.action}` };
    }
    await (0, logger_js_1.audit)({
        action: `execute:${payload.action}`,
        target: 'action',
        after: { params: payload.params, session: payload.sessionId },
    });
    if (payload.taskId) {
        await supabase_js_1.supabase
            .from('tasks')
            .update({ status: 'running', updated_at: new Date().toISOString() })
            .eq('id', payload.taskId);
    }
    let result;
    try {
        switch (def.handler) {
            case 'reservation':
                result = await (0, reservation_js_1.handleReservation)(payload);
                break;
            case 'content':
                result = await (0, content_js_1.handleContent)(payload);
                break;
            case 'pc-relay':
                result = await (0, pc_relay_js_1.handlePcRelay)(payload);
                break;
            case 'finance':
                result = await (0, finance_js_1.handleFinance)(payload);
                break;
            case 'learning':
                result = await (0, learning_js_1.handleLearning)(payload);
                break;
            default:
                result = { success: false, error: 'No handler', message: 'Aucun handler configuré' };
        }
    }
    catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        result = { success: false, error, message: `Erreur lors de l'exécution: ${error}` };
    }
    if (payload.taskId) {
        await supabase_js_1.supabase
            .from('tasks')
            .update({
            status: result.success ? 'completed' : 'failed',
            result: result.success ? { data: result.data } : undefined,
            error: result.success ? undefined : result.error,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
            .eq('id', payload.taskId);
    }
    return result;
}
//# sourceMappingURL=executor.js.map