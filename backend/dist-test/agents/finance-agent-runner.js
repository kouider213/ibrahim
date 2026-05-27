"use strict";
/**
 * Finance Agent Runner — Tool-aware Claude agent for Fik Conciergerie finance.
 *
 * Uses Claude's native tool-use API (agentic loop) to call ONLY the 6 authorized
 * finance tools against real Supabase data. No other tools allowed.
 *
 * Flow:
 *   1. Send message to Claude with FINANCE_TOOLS schema
 *   2. Claude calls tools → we execute them via executeTool()
 *   3. Tool results injected back → Claude calls more tools or produces final analysis
 *   4. Stop when stop_reason = 'end_turn' or MAX_ITER reached
 *   5. Return full proof: tools_called[], tool_results, analysis, tokens, verdict
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFinanceAgentWithTools = runFinanceAgentWithTools;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const env_js_1 = require("../config/env.js");
const tool_executor_js_1 = require("../integrations/tool-executor.js");
// ── Authorized tools (allowlist) ──────────────────────────────────────────────
const FINANCE_ALLOWED = new Set([
    'get_finance_dashboard',
    'get_financial_report',
    'get_revenue_report',
    'get_payment_status',
    'get_unpaid_bookings',
    'check_anomalies',
]);
const FINANCE_TOOLS = [
    {
        name: 'get_finance_dashboard',
        description: 'Tableau de bord financier complet: CA mois courant vs précédent, évolution %, encaissements réels, impayés, prévisions mois en cours.',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'get_financial_report',
        description: 'Rapport financier détaillé (bénéfice Kouider + revenu total) pour un mois/année donné, breakdown par véhicule.',
        input_schema: {
            type: 'object',
            properties: {
                year: { type: 'number', description: 'Année (ex: 2026). Défaut = année courante.' },
                month: { type: 'number', description: 'Mois 1-12. Omis = rapport annuel.' },
            },
        },
    },
    {
        name: 'get_revenue_report',
        description: 'CA automatique avec breakdown par véhicule. Période: année, mois, ou semaine précise.',
        input_schema: {
            type: 'object',
            properties: {
                year: { type: 'number', description: 'Année (ex: 2026)' },
                month: { type: 'number', description: 'Mois 1-12 (optionnel)' },
                week: { type: 'number', description: 'Numéro de semaine dans le mois (optionnel)' },
            },
        },
    },
    {
        name: 'get_payment_status',
        description: 'Statut encaissements et acomptes des réservations actives. Sans booking_id = toutes les réservations récentes.',
        input_schema: {
            type: 'object',
            properties: {
                booking_id: { type: 'string', description: 'UUID réservation (optionnel)' },
            },
        },
    },
    {
        name: 'get_unpaid_bookings',
        description: 'Liste clients avec paiements PENDING ou PARTIAL, classés par urgence (🔴 +72h, 🟡 +48h, 🟢 récent).',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'check_anomalies',
        description: 'Détecte prix anormaux (écart >30% vs catalogue) et réservations inhabituelles (>2000€) ce mois-ci.',
        input_schema: { type: 'object', properties: {} },
    },
];
// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es l'Agent Finance de Fik Conciergerie Oran — expert en analyse financière pour location de voitures.

CONTRAINTE ABSOLUE : Base ton analyse UNIQUEMENT sur les données retournées par les outils.
N'invente AUCUN chiffre. Si un outil retourne une erreur ou "no_data", dis-le explicitement.

SÉQUENCE OBLIGATOIRE :
1. Appelle get_finance_dashboard en premier (vue d'ensemble)
2. Appelle get_revenue_report pour le mois courant (breakdown véhicules)
3. Appelle get_unpaid_bookings (impayés actifs)
4. Appelle check_anomalies (alertes prix)
5. SEULEMENT ENSUITE, synthétise une analyse basée sur ces vraies données

TU PRODUIS (basé uniquement sur les données des outils) :
  - CA réel avec chiffres exacts (€)
  - Évolution mois sur mois (% réel)
  - Véhicules les plus rentables (données réelles)
  - Impayés actifs avec montants réels
  - Anomalies détectées
  - 3 recommandations actionnables basées sur les données

FORMAT : bullet points structurés, chiffres exacts des outils, périodes précises.
JAMAIS : inventer des chiffres, supposer des tendances sans données.`;
// ── Runner ─────────────────────────────────────────────────────────────────────
async function runFinanceAgentWithTools(userMessage, requestId, timeoutMs = 90_000) {
    const t0 = Date.now();
    const model = 'claude-sonnet-4-6';
    const toolsCalled = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalAnalysis = '';
    console.log(`[finance-agent:${requestId}] ▶ START model=${model} timeout=${timeoutMs}ms`);
    if (!env_js_1.env.ANTHROPIC_API_KEY) {
        return makeFailedResult(requestId, model, toolsCalled, 0, 0, Date.now() - t0, 'ANTHROPIC_API_KEY absent');
    }
    const client = new sdk_1.default({ apiKey: env_js_1.env.ANTHROPIC_API_KEY });
    const messages = [
        { role: 'user', content: userMessage },
    ];
    const MAX_ITER = 6;
    let iterCount = 0;
    try {
        while (iterCount < MAX_ITER && (Date.now() - t0) < timeoutMs) {
            iterCount++;
            const response = await client.messages.create({
                model,
                max_tokens: 2000,
                system: SYSTEM_PROMPT,
                tools: FINANCE_TOOLS,
                messages,
            });
            totalInputTokens += response.usage.input_tokens;
            totalOutputTokens += response.usage.output_tokens;
            console.log(`[finance-agent:${requestId}] iter=${iterCount} stop_reason=${response.stop_reason} ` +
                `blocks=${response.content.length} in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);
            // Collect any text from this turn
            const textBlocks = response.content
                .filter((b) => b.type === 'text')
                .map(b => b.text)
                .join('');
            if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') {
                finalAnalysis = textBlocks || finalAnalysis;
                break;
            }
            // ── Tool use step ───────────────────────────────────────────────────────
            const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
            // Add assistant message (including tool_use blocks) to history
            messages.push({ role: 'assistant', content: response.content });
            const toolResults = [];
            for (const tb of toolUseBlocks) {
                const tStart = Date.now();
                const input = tb.input;
                const blocked = !FINANCE_ALLOWED.has(tb.name);
                let result;
                if (blocked) {
                    result = `❌ Outil "${tb.name}" non autorisé pour finance-agent. Outils autorisés: ${[...FINANCE_ALLOWED].join(', ')}`;
                    console.warn(`[finance-agent:${requestId}] BLOCKED tool=${tb.name}`);
                }
                else {
                    try {
                        result = await (0, tool_executor_js_1.executeTool)(tb.name, input);
                        if (!result || result.trim() === '')
                            result = 'no_data';
                    }
                    catch (err) {
                        result = `Erreur outil ${tb.name}: ${err instanceof Error ? err.message : String(err)}`;
                    }
                }
                const duration = Date.now() - tStart;
                console.log(`[finance-agent:${requestId}] tool=${tb.name} blocked=${blocked} result_len=${result.length} ${duration}ms`);
                toolsCalled.push({ tool_name: tb.name, tool_input: input, tool_result: result, duration_ms: duration, blocked });
                toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result });
            }
            // Add tool results to conversation
            messages.push({ role: 'user', content: toolResults });
        }
        const totalMs = Date.now() - t0;
        const rawDataChars = toolsCalled.reduce((s, t) => s + t.tool_result.length, 0);
        const realCalls = toolsCalled.filter(t => !t.blocked);
        const verdict = realCalls.length >= 2 && finalAnalysis.length > 100 ? 'VERIFIED' :
            realCalls.length >= 1 ? 'PARTIAL' :
                'FAILED';
        const verdictReason = verdict === 'VERIFIED'
            ? `✅ ${realCalls.length}/${FINANCE_ALLOWED.size} outils appelés, ${rawDataChars} chars données Supabase réelles, analyse de ${finalAnalysis.length} chars`
            : verdict === 'PARTIAL'
                ? `⚠️ ${realCalls.length} outil(s) appelé(s) mais analyse insuffisante`
                : `❌ Aucun outil réel appelé — agent n'a pas accédé à Supabase`;
        console.log(`[finance-agent:${requestId}] DONE verdict=${verdict} tools=${realCalls.length} ${totalMs}ms`);
        return {
            request_id: requestId,
            agent_id: 'finance',
            agent_name: '💰 Agent Finance',
            provider: 'claude',
            model,
            system_prompt: SYSTEM_PROMPT,
            tools_allowed: [...FINANCE_ALLOWED],
            tools_called: toolsCalled,
            tool_count: realCalls.length,
            raw_data_chars: rawDataChars,
            analysis: finalAnalysis,
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            total_ms: totalMs,
            verdict,
            verdict_reason: verdictReason,
        };
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[finance-agent:${requestId}] ❌ ${errMsg}`);
        return makeFailedResult(requestId, model, toolsCalled, totalInputTokens, totalOutputTokens, Date.now() - t0, errMsg);
    }
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function makeFailedResult(requestId, model, toolsCalled, inp, out, ms, errMsg) {
    return {
        request_id: requestId,
        agent_id: 'finance',
        agent_name: '💰 Agent Finance',
        provider: 'claude',
        model,
        system_prompt: SYSTEM_PROMPT,
        tools_allowed: [...FINANCE_ALLOWED],
        tools_called: toolsCalled,
        tool_count: 0,
        raw_data_chars: 0,
        analysis: '',
        input_tokens: inp,
        output_tokens: out,
        total_ms: ms,
        verdict: 'FAILED',
        verdict_reason: `❌ ${errMsg}`,
        error: errMsg,
    };
}
//# sourceMappingURL=finance-agent-runner.js.map