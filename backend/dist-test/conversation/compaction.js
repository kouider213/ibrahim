"use strict";
/**
 * COMPACTION — Compression intelligente de l'historique de conversation
 *
 * Quand la conversation devient trop longue (>20 messages ou >8000 tokens estimés),
 * Dzaryx résume les anciens échanges en un bloc compact "mémoire de session"
 * sans perdre les informations importantes (réservations, décisions, préférences).
 *
 * Stratégie:
 *   1. Garder les 6 derniers messages toujours intacts (contexte immédiat)
 *   2. Résumer les messages plus anciens en un seul bloc "RÉSUMÉ DE SESSION"
 *   3. Stocker le résumé en DB pour les sessions longues
 *   4. Réinjecter le résumé comme premier message de l'historique
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.needsCompaction = needsCompaction;
exports.loadCompactionSummary = loadCompactionSummary;
exports.compactIfNeeded = compactIfNeeded;
exports.emergencyCompact = emergencyCompact;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const env_js_1 = require("../config/env.js");
const supabase_js_1 = require("../integrations/supabase.js");
const llm_router_js_1 = require("../integrations/llm-router.js");
const client = new sdk_1.default({ apiKey: env_js_1.env.ANTHROPIC_API_KEY });
// Seuils de compaction
const MAX_MESSAGES_BEFORE_COMPACT = 20; // Compacter si plus de 20 messages
const RECENT_MESSAGES_TO_KEEP = 6; // Toujours garder les 6 derniers intacts
const ESTIMATED_TOKENS_PER_CHAR = 0.25; // ~4 chars = 1 token
const MAX_TOKENS_BEFORE_COMPACT = 8000; // Compacter si historique > 8000 tokens estimés
// ── Estimation rapide du nombre de tokens ────────────────────────────────────
function estimateTokens(messages) {
    return messages.reduce((sum, m) => {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return sum + Math.ceil(text.length * ESTIMATED_TOKENS_PER_CHAR);
    }, 0);
}
// ── Vérifier si la compaction est nécessaire ─────────────────────────────────
function needsCompaction(messages) {
    if (messages.length > MAX_MESSAGES_BEFORE_COMPACT)
        return true;
    if (estimateTokens(messages) > MAX_TOKENS_BEFORE_COMPACT)
        return true;
    return false;
}
// ── Générer un résumé compact de l'historique ────────────────────────────────
async function summarizeHistory(messages) {
    const conversationText = messages
        .map(m => {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `[${m.role === 'user' ? 'Kouider' : 'Dzaryx'}]: ${text}`;
    })
        .join('\n\n');
    const prompt = `Tu es Dzaryx, assistant IA de Kouider (Fik Conciergerie Oran).
Résume cette conversation de manière TRÈS COMPACTE en retenant UNIQUEMENT:
- Les réservations créées/modifiées (client, voiture, dates, prix)
- Les décisions importantes prises
- Les informations client importantes
- Les tâches en cours ou à faire
- Les préférences exprimées par Kouider

CONVERSATION À RÉSUMER:
${conversationText}

Réponds avec un résumé structuré en français, max 500 mots, format bullet points.
Commence par: "📋 RÉSUMÉ SESSION PRÉCÉDENTE:"`;
    // Try cheap providers first — summarization is a simple text task
    if ((0, llm_router_js_1.isGroqAvailable)()) {
        try {
            const text = await (0, llm_router_js_1.callGroq)(prompt);
            console.log('[compaction] summarized via Groq');
            return text;
        }
        catch (e) {
            console.warn('[compaction] Groq summarization failed:', e instanceof Error ? e.message : e);
        }
    }
    if ((0, llm_router_js_1.isGeminiAvailable)()) {
        try {
            const text = await (0, llm_router_js_1.callGemini)(prompt);
            console.log('[compaction] summarized via Gemini');
            return text;
        }
        catch (e) {
            console.warn('[compaction] Gemini summarization failed:', e instanceof Error ? e.message : e);
        }
    }
    // Claude Haiku fallback
    console.log('[compaction] summarized via Claude Haiku (fallback)');
    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    return text;
}
// ── Sauvegarder le résumé en base ────────────────────────────────────────────
async function saveCompactionSummary(sessionId, summary) {
    try {
        await supabase_js_1.supabase
            .from('conversations')
            .insert({
            session_id: sessionId,
            role: 'system',
            content: summary,
            metadata: { type: 'compaction_summary', compacted_at: new Date().toISOString() },
        });
    }
    catch (err) {
        console.warn('[compaction] Could not save summary to DB:', err);
    }
}
// ── Charger le dernier résumé de compaction pour une session ─────────────────
async function loadCompactionSummary(sessionId) {
    try {
        const { data } = await supabase_js_1.supabase
            .from('conversations')
            .select('content, created_at')
            .eq('session_id', sessionId)
            .eq('role', 'system')
            .order('created_at', { ascending: false })
            .limit(1);
        if (data && data.length > 0) {
            const row = data[0];
            // Vérifier que le résumé est récent (moins de 24h)
            const age = Date.now() - new Date(row.created_at).getTime();
            if (age < 24 * 60 * 60 * 1000)
                return row.content;
        }
    }
    catch (err) {
        console.warn('[compaction] Could not load summary:', err);
    }
    return null;
}
// ── Fonction principale: compacter si nécessaire ─────────────────────────────
async function compactIfNeeded(messages, sessionId) {
    // Pas besoin de compacter
    if (!needsCompaction(messages))
        return messages;
    console.log(`[compaction] Compacting ${messages.length} messages (session: ${sessionId})`);
    // Séparer: anciens messages à résumer vs récents à garder
    const oldMessages = messages.slice(0, messages.length - RECENT_MESSAGES_TO_KEEP);
    const recentMessages = messages.slice(messages.length - RECENT_MESSAGES_TO_KEEP);
    try {
        // Générer le résumé des anciens messages
        const summary = await summarizeHistory(oldMessages);
        // Sauvegarder en DB (non-bloquant si erreur)
        saveCompactionSummary(sessionId, summary).catch(() => { });
        // Construire le nouvel historique: résumé + messages récents
        const summaryMessage = {
            role: 'user',
            content: summary,
        };
        const compacted = [summaryMessage, ...recentMessages];
        console.log(`[compaction] Reduced ${messages.length} → ${compacted.length} messages`);
        return compacted;
    }
    catch (err) {
        console.error('[compaction] Summarization failed, using truncation fallback:', err);
        // Fallback: simple troncature si le résumé échoue
        return messages.slice(-RECENT_MESSAGES_TO_KEEP);
    }
}
// ── Compaction pour les contextes trop longs (erreur 422) ────────────────────
// Appelée automatiquement par claude-api.ts quand le contexte est trop long
async function emergencyCompact(messages, sessionId) {
    console.warn(`[compaction] EMERGENCY compact — ${messages.length} messages trop longs`);
    if (messages.length <= 4) {
        // Cas extrême: même 4 messages sont trop longs → garder seulement le dernier
        return messages.slice(-2);
    }
    return compactIfNeeded(messages, sessionId);
}
//# sourceMappingURL=compaction.js.map