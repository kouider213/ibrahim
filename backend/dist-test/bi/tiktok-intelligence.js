"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTikTokIntelligence = getTikTokIntelligence;
exports.generateViralHook = generateViralHook;
const claude_api_js_1 = require("../integrations/claude-api.js");
const env_js_1 = require("../config/env.js");
const queue_js_1 = require("../queue/queue.js");
// Empirical best times for Fik Conciergerie audience (Algerian MRE)
const BEST_WINDOWS = [
    { day: 'Vendredi', time: '18h00–20h00', score: 95, reason: 'Fin semaine, clients MRE planifient vacances' },
    { day: 'Samedi', time: '11h00–13h00', score: 88, reason: 'Matin week-end, scrolling intense' },
    { day: 'Jeudi', time: '20h00–22h00', score: 82, reason: 'Veille week-end, audience active' },
    { day: 'Dimanche', time: '15h00–17h00', score: 78, reason: 'Après-midi détente, forte visibilité' },
    { day: 'Lundi', time: '07h00–09h00', score: 70, reason: 'Trajet travail, audience captive' },
];
function scoreViralHook(hook) {
    let score = 50;
    if (hook.length < 60)
        score += 15; // Short hooks perform better
    if (/\d/.test(hook))
        score += 10; // Numbers increase click rate
    if (/!/.test(hook))
        score += 5;
    if (/\?/.test(hook))
        score += 8; // Questions drive engagement
    if (/prix|promo|gratuit|offre|exclusive|secret/i.test(hook))
        score += 12;
    if (hook.length > 120)
        score -= 20; // Too long
    return Math.min(100, Math.max(0, score));
}
async function generateTikTokIdeas(carName) {
    const CACHE_KEY = `bi:tiktok:ideas:${new Date().toISOString().slice(0, 10)}`;
    const cached = await queue_js_1.redis.get(CACHE_KEY);
    if (cached)
        return JSON.parse(cached);
    const vehicle = carName ?? 'une voiture premium';
    const prompt = `Tu es un expert TikTok pour Fik Conciergerie, agence de location de voitures à Oran Algérie.
Génère 3 idées de vidéos TikTok virales. Chaque idée doit avoir:
- Un hook d'accroche irrésistible (MAX 60 caractères)
- Un concept de vidéo (2 lignes)
- 5 hashtags pertinents
- Un score de viralité /100

Véhicule à promouvoir: ${vehicle}
Cible: clients MRE (Europe → Algérie été/fêtes)
Style: caveman, direct, chiffres concrets

Réponds en JSON strict, sans markdown:
[
  {
    "title": "titre court",
    "hook": "accroche 60 chars max",
    "concept": "2 lignes description",
    "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
    "virality_score": 85,
    "best_time": "Vendredi 18h"
  }
]`;
    const response = await (0, claude_api_js_1.chat)([{ role: 'user', content: prompt }], undefined).catch(() => null);
    if (!response?.text)
        return [];
    try {
        const json = response.text.match(/\[[\s\S]*?\]/)?.[0];
        if (!json)
            return [];
        const ideas = JSON.parse(json);
        const scored = ideas.map(idea => ({ ...idea, virality_score: scoreViralHook(idea.hook) || idea.virality_score }));
        await queue_js_1.redis.set(CACHE_KEY, JSON.stringify(scored), 'EX', 3600 * 6);
        return scored;
    }
    catch {
        return [];
    }
}
async function getTikTokIntelligence(carName) {
    const CACHE_KEY = `bi:tiktok:${new Date().toISOString().slice(0, 13)}`;
    const cached = await queue_js_1.redis.get(CACHE_KEY);
    if (cached)
        return JSON.parse(cached);
    const apify_available = Boolean(env_js_1.env.APIFY_API_KEY);
    const ideas = await generateTikTokIdeas(carName);
    const result = {
        best_posting_windows: BEST_WINDOWS,
        ideas,
        apify_available,
        generated_at: new Date().toISOString(),
    };
    await queue_js_1.redis.set(CACHE_KEY, JSON.stringify(result), 'EX', 1800);
    return result;
}
async function generateViralHook(carName, style = 'prix') {
    const styleGuide = {
        lifestyle: 'Montre le luxe et le plaisir de conduire. Émotionnel.',
        prix: 'Choc des prix. Concret. Chiffres. Court.',
        temoignage: 'Réaction client surprise. Authentique.',
    };
    const prompt = `Génère UN seul hook TikTok viral pour ${carName}, style "${style}".
${styleGuide[style]}
MAX 60 caractères. Sans guillemets. Direct.`;
    const response = await (0, claude_api_js_1.chat)([{ role: 'user', content: prompt }], undefined).catch(() => null);
    return response?.text?.trim().slice(0, 120) ?? `${carName} à Oran — prix qui choquent! 🔥`;
}
//# sourceMappingURL=tiktok-intelligence.js.map