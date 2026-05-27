"use strict";
/**
 * PHASE 15 — Recherche d'images (Pexels API)
 * Permet à Dzaryx de chercher des images sur internet et les afficher
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchImages = searchImages;
exports.formatImageResults = formatImageResults;
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
async function searchImages(query, count = 4, orientation) {
    const apiKey = env_js_1.env.PEXELS_API_KEY;
    if (!apiKey) {
        throw new Error('PEXELS_API_KEY non configurée dans les variables d\'environnement Railway.');
    }
    const params = {
        query,
        per_page: Math.min(count, 10),
        locale: 'fr-FR',
    };
    if (orientation) {
        params['orientation'] = orientation;
    }
    const { data } = await axios_1.default.get('https://api.pexels.com/v1/search', {
        headers: {
            Authorization: apiKey,
        },
        params,
        timeout: 10_000,
    });
    return {
        photos: data.photos,
        total_results: data.total_results,
        query,
    };
}
function formatImageResults(result) {
    if (!result.photos || result.photos.length === 0) {
        return `❌ Aucune image trouvée pour "${result.query}".`;
    }
    const lines = result.photos.map((photo, i) => {
        return `**Image ${i + 1}** — par ${photo.photographer}
🖼️ ${photo.src.large}
📐 ${photo.width}×${photo.height}px
🔗 Pexels: ${photo.url}`;
    });
    return `🔍 **${result.photos.length} image(s) trouvée(s) pour "${result.query}"** (${result.total_results} total)\n\n${lines.join('\n\n')}`;
}
//# sourceMappingURL=image-search.js.map