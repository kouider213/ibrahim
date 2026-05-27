"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMemoryContext = buildMemoryContext;
const supabase_js_1 = require("../integrations/supabase.js");
// 4 chars ≈ 1 token (mixed French/English/Arabic estimate)
const CHARS_PER_TOKEN = 4;
function scoreMemoryFact(fact, query) {
    const q = query.toLowerCase();
    let score = 0;
    // 1. Keyword overlap between query and fact key+value
    const queryWords = q.split(/[\s,.!?;:]+/).filter(w => w.length > 3);
    const factText = `${fact.key} ${fact.value}`.toLowerCase();
    const overlap = queryWords.filter(w => factText.includes(w)).length;
    score += overlap * 15;
    // 2. Domain relevance based on query intent
    if (/réservation|booking|location|voiture|client|tarif|prix|Houari|Fik/.test(q) && fact.domain === 'business')
        score += 20;
    if (/santé|vitamine|médecin|sport|médication|supplément/.test(q) && fact.domain === 'health')
        score += 30;
    if (/famille|enfant|conjoint|parent|proche|anniversaire/.test(q) && fact.domain === 'family')
        score += 30;
    if (/objectif|but|plan|stratégie|tiktok|vidéo|contenu/.test(q) && fact.domain === 'goal')
        score += 25;
    if (/habitude|routine|matin|soir|réveil|café|vitamine|gym/.test(q) && fact.domain === 'habit')
        score += 25;
    if (/qui|nom|où|profil|identité|Bruxelles|Oran|langue|parle/.test(q) && fact.domain === 'identity')
        score += 15;
    if (/dzaryx|nexus|assistant|Ibrahim/.test(q) && fact.domain === 'business')
        score += 10;
    if (/preference|style|réponse|format|rappel/.test(q) && fact.domain === 'preference')
        score += 20;
    // 3. Confidence bonus
    score += fact.confidence * 10;
    // 4. Freshness: recent updates score higher (max 20 pts, decays over 30 days)
    const daysSince = (Date.now() - new Date(fact.updated_at).getTime()) / 86_400_000;
    score += Math.max(0, 20 - daysSince * (20 / 30));
    // 5. Base priority for identity and business facts — always useful
    if (fact.domain === 'identity' || fact.domain === 'business')
        score += 8;
    return score;
}
async function buildMemoryContext(userMessage, maxTokens = 300) {
    const maxChars = maxTokens * CHARS_PER_TOKEN;
    // ── Primary: memory_facts (L2 Semantic, scored) ───────────────
    try {
        const facts = await (0, supabase_js_1.getMemoryFacts)({ is_current: true, limit: 200 });
        if (facts.length > 0) {
            const scored = facts
                .map((f) => ({ fact: f, score: scoreMemoryFact(f, userMessage) }))
                .sort((a, b) => b.score - a.score);
            const entries = [];
            let usedChars = 0;
            for (const { fact } of scored) {
                const line = `[${fact.domain}] ${fact.key}: ${fact.value}`;
                if (usedChars + line.length + 1 > maxChars)
                    continue; // skip if over budget
                entries.push({ content: `${fact.key}: ${fact.value}`, category: fact.domain });
                usedChars += line.length + 1;
            }
            const tokenEstimate = Math.round(usedChars / CHARS_PER_TOKEN);
            console.log(`[memory-engine] source=memory_facts total=${facts.length} selected=${entries.length} ~${tokenEstimate}tok budget=${maxTokens}tok`);
            return {
                entries,
                source: 'memory_facts',
                totalFacts: facts.length,
                selectedFacts: entries.length,
                tokenEstimate,
            };
        }
    }
    catch (err) {
        console.error('[memory-engine] memory_facts fetch failed, falling back:', err.message);
    }
    // ── Fallback: ibrahim_memory (legacy FIFO, budget-capped) ─────
    try {
        const { data } = await supabase_js_1.supabase
            .from('ibrahim_memory')
            .select('content, category')
            .order('created_at', { ascending: false })
            .limit(20);
        const raw = (data ?? []);
        const entries = [];
        let usedChars = 0;
        for (const entry of raw) {
            const line = `[${entry.category}] ${entry.content}`;
            if (usedChars + line.length + 1 > maxChars)
                break;
            entries.push(entry);
            usedChars += line.length + 1;
        }
        const tokenEstimate = Math.round(usedChars / CHARS_PER_TOKEN);
        console.log(`[memory-engine] source=ibrahim_memory(fallback) total=${raw.length} selected=${entries.length} ~${tokenEstimate}tok budget=${maxTokens}tok`);
        return {
            entries,
            source: 'ibrahim_memory',
            totalFacts: raw.length,
            selectedFacts: entries.length,
            tokenEstimate,
        };
    }
    catch (err) {
        console.error('[memory-engine] fallback ibrahim_memory also failed:', err.message);
        return { entries: [], source: 'empty', totalFacts: 0, selectedFacts: 0, tokenEstimate: 0 };
    }
}
//# sourceMappingURL=memory-selector.js.map