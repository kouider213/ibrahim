"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordFeedback = recordFeedback;
exports.getFeedbackForAction = getFeedbackForAction;
exports.getFeedbackByType = getFeedbackByType;
exports.analyzeFeedbackPattern = analyzeFeedbackPattern;
exports.upsertLearningPattern = upsertLearningPattern;
exports.getLearningPatterns = getLearningPatterns;
exports.getKouiderPreferences = getKouiderPreferences;
exports.getFeedbackStats = getFeedbackStats;
const supabase_js_1 = require("./supabase.js");
// ── Enregistrer un feedback ────────────────────────────────────
async function recordFeedback(params) {
    const { data, error } = await supabase_js_1.supabase
        .from('Dzaryx_feedback')
        .insert({
        session_id: params.sessionId,
        action_type: params.actionType,
        action_id: params.actionId,
        rating: params.rating,
        comment: params.comment,
        context: params.context ?? {},
    })
        .select()
        .single();
    if (error)
        throw new Error(`Feedback recording failed: ${error.message}`);
    // Déclencher l'analyse en arrière-plan
    analyzeFeedbackPattern(params.actionType).catch(err => console.error('⚠️ Background pattern analysis failed:', err));
    return data;
}
// ── Récupérer les feedbacks d'une action ───────────────────────
async function getFeedbackForAction(actionId) {
    const { data, error } = await supabase_js_1.supabase
        .from('Dzaryx_feedback')
        .select('*')
        .eq('action_id', actionId)
        .order('created_at', { ascending: false });
    if (error)
        throw new Error(`Feedback fetch failed: ${error.message}`);
    return (data ?? []);
}
// ── Récupérer les feedbacks par type ───────────────────────────
async function getFeedbackByType(actionType, limit = 50) {
    const { data, error } = await supabase_js_1.supabase
        .from('Dzaryx_feedback')
        .select('*')
        .eq('action_type', actionType)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error)
        throw new Error(`Feedback fetch failed: ${error.message}`);
    return (data ?? []);
}
// ── Analyser les patterns de feedback ──────────────────────────
async function analyzeFeedbackPattern(actionType) {
    const feedbacks = await getFeedbackByType(actionType, 100);
    if (feedbacks.length < 5)
        return; // Pas assez de données
    const positive = feedbacks.filter(f => f.rating === 'positive').length;
    const negative = feedbacks.filter(f => f.rating === 'negative').length;
    const total = feedbacks.length;
    // Analyser les patterns spécifiques selon le type
    let patterns = {};
    if (actionType === 'response') {
        // Analyser la longueur des réponses
        const longResponses = feedbacks.filter(f => f.context?.response_length && f.context.response_length > 500);
        const shortResponses = feedbacks.filter(f => f.context?.response_length && f.context.response_length < 200);
        const longPositive = longResponses.filter(f => f.rating === 'positive').length;
        const shortPositive = shortResponses.filter(f => f.rating === 'positive').length;
        patterns = {
            prefers_long: longPositive / Math.max(longResponses.length, 1) > 0.7,
            prefers_short: shortPositive / Math.max(shortResponses.length, 1) > 0.7,
        };
    }
    else if (actionType === 'tiktok') {
        // Analyser les styles TikTok
        const styles = feedbacks
            .filter(f => f.context?.style)
            .map(f => ({ style: f.context.style, rating: f.rating }));
        const styleStats = styles.reduce((acc, s) => {
            if (!acc[s.style])
                acc[s.style] = { positive: 0, total: 0 };
            acc[s.style].total++;
            if (s.rating === 'positive')
                acc[s.style].positive++;
            return acc;
        }, {});
        patterns = { style_preferences: styleStats };
    }
    // Calculer la confiance
    const confidence = positive / total;
    // Enregistrer ou mettre à jour le pattern
    await upsertLearningPattern({
        category: actionType,
        pattern: JSON.stringify({
            success_rate: confidence,
            positive,
            negative,
            total,
            ...patterns,
        }),
        confidence,
        sampleSize: total,
        metadata: patterns,
    });
}
// ── Enregistrer un pattern d'apprentissage ─────────────────────
async function upsertLearningPattern(params) {
    const { data, error } = await supabase_js_1.supabase
        .from('Dzaryx_learning_patterns')
        .upsert({
        category: params.category,
        pattern: params.pattern,
        confidence: params.confidence,
        sample_size: params.sampleSize,
        metadata: params.metadata,
    }, { onConflict: 'category' })
        .select()
        .single();
    if (error)
        throw new Error(`Pattern upsert failed: ${error.message}`);
    return data;
}
// ── Récupérer les patterns d'apprentissage ─────────────────────
async function getLearningPatterns() {
    const { data, error } = await supabase_js_1.supabase
        .from('Dzaryx_learning_patterns')
        .select('*')
        .order('confidence', { ascending: false });
    if (error)
        throw new Error(`Patterns fetch failed: ${error.message}`);
    return (data ?? []);
}
// ── Obtenir les préférences de Kouider ─────────────────────────
async function getKouiderPreferences() {
    const patterns = await getLearningPatterns();
    const responsePattern = patterns.find(p => p.category === 'response');
    const tiktokPattern = patterns.find(p => p.category === 'tiktok');
    let responseStyle = 'balanced';
    if (responsePattern?.metadata?.prefers_short)
        responseStyle = 'short';
    else if (responsePattern?.metadata?.prefers_long)
        responseStyle = 'detailed';
    const tiktokStyles = {};
    if (tiktokPattern?.metadata?.style_preferences) {
        const stylePrefs = tiktokPattern.metadata.style_preferences;
        Object.entries(stylePrefs).forEach(([style, stats]) => {
            tiktokStyles[style] = stats.positive / stats.total;
        });
    }
    // Analyse du ton basée sur les patterns de feedback
    let tone = 'friendly';
    const tonePattern = patterns.find(p => p.category === 'tone');
    if (tonePattern?.metadata) {
        const tm = tonePattern.metadata;
        const scores = {
            professional: tm['professional'] ?? 0,
            friendly: tm['friendly'] ?? 0,
            casual: tm['casual'] ?? 0,
        };
        tone = (Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]);
    }
    else if (responseStyle === 'detailed') {
        tone = 'professional';
    }
    else if (responseStyle === 'short') {
        tone = 'casual';
    }
    return {
        response_style: responseStyle,
        tone,
        tiktok_styles: tiktokStyles,
        auto_approve_threshold: 0.8,
    };
}
// ── Statistiques globales de feedback ──────────────────────────
async function getFeedbackStats() {
    const { data, error } = await supabase_js_1.supabase
        .from('Dzaryx_feedback')
        .select('rating, action_type');
    if (error)
        throw new Error(`Stats fetch failed: ${error.message}`);
    const feedbacks = (data ?? []);
    const stats = {
        total: feedbacks.length,
        positive: feedbacks.filter(f => f.rating === 'positive').length,
        negative: feedbacks.filter(f => f.rating === 'negative').length,
        neutral: feedbacks.filter(f => f.rating === 'neutral').length,
        by_type: {},
    };
    feedbacks.forEach(f => {
        if (!stats.by_type[f.action_type]) {
            stats.by_type[f.action_type] = { positive: 0, negative: 0, neutral: 0 };
        }
        stats.by_type[f.action_type][f.rating]++;
    });
    return stats;
}
//# sourceMappingURL=feedback-system.js.map