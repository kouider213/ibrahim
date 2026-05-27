"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHANTOM_REFUSAL = void 0;
exports.checkAntiHallucination = checkAntiHallucination;
exports.logExecutionTrace = logExecutionTrace;
const response_guard_js_1 = require("../conversation/response-guard.js");
Object.defineProperty(exports, "PHANTOM_REFUSAL", { enumerable: true, get: function () { return response_guard_js_1.PHANTOM_REFUSAL; } });
// Tools that legitimize numeric/data claims
const DATA_TOOLS = new Set([
    'get_financial_report', 'get_revenue_report', 'get_finance_dashboard',
    'list_bookings', 'check_car_availability', 'get_payment_status',
    'get_unpaid_bookings', 'get_late_returns', 'check_anomalies',
    'supabase_execute',
    'create_booking', 'update_booking', 'cancel_booking',
]);
// Financial report patterns — stronger than casual number mentions
const FINANCIAL_REPORT_PATTERNS = [
    /rapport\s+(financier|mensuel|annuel)/i,
    /chiffre\s+d'affaires/i,
    /b[eé]n[eé]fice\s+(total|net|brut)/i,
    /revenu\s+(total|mensuel|annuel)/i,
    /total\s+(des\s+)?r[eé]servations\s*:\s*\d/i,
];
// Claims about reading real system state without calling a tool
const SYSTEM_STATE_CLAIMS = [
    /j'ai\s+(v[eé]rifi[eé]|consult[eé]|regard[eé])\s+(les|la|le|vos)\s+(r[eé]servation|voiture|client|planning)/i,
    /d'apr[eè]s\s+(mes|les)\s+donn[eé]es/i,
    /selon\s+(mes|les)\s+enregistrements/i,
    /j'ai\s+acc[eè]s\s+[aà]\s+(vos|ces|les)/i,
];
function checkAntiHallucination(text, toolsExecuted, userMessage, requestId) {
    // Gate 1: phantom write guard (existing — definitive blocker)
    const phantomResult = (0, response_guard_js_1.phantomGuard)(text, toolsExecuted, userMessage, requestId);
    if (phantomResult === response_guard_js_1.PHANTOM_REFUSAL) {
        return { safe: false, reason: 'phantom_action', blocked: response_guard_js_1.PHANTOM_REFUSAL };
    }
    // Gate 2: financial report claim without data tool
    const isFinancialReport = FINANCIAL_REPORT_PATTERNS.some(p => p.test(text));
    if (isFinancialReport) {
        const hasDataTool = toolsExecuted.some(t => DATA_TOOLS.has(t.name) && t.success);
        if (!hasDataTool) {
            console.log(`[anti-hallucination:${requestId}] ⛔ FINANCIAL_REPORT_BLOCKED no data tool` +
                ` tools=[${toolsExecuted.map(t => t.name).join(',') || 'none'}]` +
                ` text="${text.slice(0, 100).replace(/\n/g, ' ')}"`);
            return {
                safe: false,
                reason: 'financial_claim_no_data',
                blocked: '⚠️ Impossible de générer ce rapport — aucune donnée financière réelle n\'a été récupérée.\nJe ne fournis pas de chiffres sans avoir consulté la base de données.',
            };
        }
    }
    // Gate 3: system state claims with zero tools
    const hasStateClaim = SYSTEM_STATE_CLAIMS.some(p => p.test(text));
    if (hasStateClaim && toolsExecuted.length === 0) {
        console.log(`[anti-hallucination:${requestId}] ⛔ SYSTEM_STATE_CLAIM_BLOCKED no tools` +
            ` claim="${text.slice(0, 80).replace(/\n/g, ' ')}"`);
        return {
            safe: false,
            reason: 'system_state_claim',
            blocked: '⚠️ Je ne peux pas affirmer avoir consulté vos données sans avoir exécuté une requête réelle.\nDemandez-moi de vérifier explicitement et je lancerai l\'outil approprié.',
        };
    }
    return { safe: true, reason: null, blocked: null };
}
function logExecutionTrace(t) {
    const writeSuccess = t.toolsExecuted.some(x => x.success);
    console.log(`[orchestrator-trace] {` +
        `"request_id":"${t.requestId}",` +
        `"channel":"${t.channel}",` +
        `"session":"${t.sessionId.slice(0, 30)}",` +
        `"tools":[${t.toolsExecuted.map(x => `"${x.name}"`).join(',')}],` +
        `"write_success":${writeSuccess},` +
        `"response_allowed":${t.responseAllowed},` +
        `"priority":${t.priorityScore},` +
        `"priority_level":"${t.priorityLevel}",` +
        `"agent":"${t.agentUsed}",` +
        `"focus":"${t.focusStatus}",` +
        `"ms":${t.latencyMs}` +
        `}`);
}
//# sourceMappingURL=anti-hallucination.js.map