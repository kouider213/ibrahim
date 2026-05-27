"use strict";
/**
 * Multi-provider web search — resilient, no single point of failure.
 *
 * Priority order (per user spec):
 *   1. APIFY Google Search Scraper  — requires APIFY_API_KEY, highest quality, ~20-40s
 *   2. DuckDuckGo HTML              — free, no key, ~2s
 *   3. Bing HTML                    — free, no key, ~3s
 *   4. Google Custom Search API     — requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID, ~1s
 *   5. Jina AI                      — optional JINA_API_KEY, fallback only
 *
 * Rules:
 *   - Never invents data
 *   - If all providers fail → explicit NO_DATA result, confidence='low'
 *   - Every call logs which provider succeeded/failed and why
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiProviderWebSearch = multiProviderWebSearch;
exports.jinaAuthHeaders = jinaAuthHeaders;
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
// ── Provider 1: APIFY Google Search Scraper ───────────────────────────────────
// Uses apify/google-search-scraper actor with 30s polling deadline.
async function searchWithApify(query) {
    if (!env_js_1.env.APIFY_API_KEY)
        return null;
    const t0 = Date.now();
    const key = env_js_1.env.APIFY_API_KEY;
    try {
        const runResp = await axios_1.default.post(`https://api.apify.com/v2/acts/apify~google-search-scraper/runs?token=${key}`, { queries: query, maxPagesPerQuery: 1, resultsPerPage: 6, countryCode: 'dz', languageCode: 'fr' }, { timeout: 15_000 });
        const runId = runResp.data?.data?.id ?? '';
        if (!runId)
            return null;
        // Poll max 10 × 3s = 30s
        let datasetId = '';
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 3_000));
            const poll = await axios_1.default.get(`https://api.apify.com/v2/actor-runs/${runId}?token=${key}`, { timeout: 8_000 });
            const status = poll.data?.data?.status ?? '';
            if (status === 'SUCCEEDED') {
                datasetId = poll.data.data.defaultDatasetId;
                break;
            }
            if (status === 'FAILED' || status === 'ABORTED')
                return null;
        }
        if (!datasetId)
            return null;
        const items = await axios_1.default.get(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${key}&limit=6`, { timeout: 10_000 });
        const rows = Array.isArray(items.data) ? items.data : [];
        if (rows.length === 0)
            return null;
        const organic = rows[0]['organicResults'];
        const results = Array.isArray(organic) ? organic : [];
        if (results.length === 0)
            return null;
        const text = results
            .slice(0, 6)
            .map((r) => {
            const rr = r;
            return `• ${rr['title'] ?? ''}\n  ${rr['url'] ?? ''}\n  ${rr['description'] ?? ''}`;
        })
            .join('\n\n');
        if (text.length < 100)
            return null;
        return {
            text: text.slice(0, 4000),
            source: 'apify',
            confidence: 'high',
            results_count: results.length,
            duration_ms: Date.now() - t0,
            attempted_providers: [],
        };
    }
    catch {
        return null;
    }
}
// ── Provider 2: DuckDuckGo HTML scraping ─────────────────────────────────────
// POST to html.duckduckgo.com/html/ — more reliable than GET (avoids redirect)
async function searchWithDuckDuckGo(query) {
    const t0 = Date.now();
    try {
        const { data } = await axios_1.default.post('https://html.duckduckgo.com/html/', `q=${encodeURIComponent(query)}&kl=fr-fr`, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml',
            },
            timeout: 10_000,
        });
        if (typeof data !== 'string' || data.length < 500)
            return null;
        const titles = [];
        const snippets = [];
        for (const m of data.matchAll(/<a[^>]+class="result__a"[^>]*>(.*?)<\/a>/gs)) {
            const t = m[1]?.replace(/<[^>]+>/g, '').trim();
            if (t && t.length > 3)
                titles.push(t);
        }
        for (const m of data.matchAll(/<(?:div|span)[^>]+class="result__snippet"[^>]*>(.*?)<\/(?:div|span)>/gs)) {
            const s = m[1]?.replace(/<[^>]+>/g, '').trim();
            if (s && s.length > 20)
                snippets.push(s);
        }
        if (titles.length === 0 && snippets.length === 0)
            return null;
        const lines = titles.slice(0, 8).map((t, i) => {
            const s = snippets[i] ?? '';
            return s ? `• ${t}\n  ${s}` : `• ${t}`;
        });
        const text = lines.join('\n\n');
        if (text.length < 80)
            return null;
        return {
            text: text.slice(0, 4000),
            source: 'duckduckgo',
            confidence: 'medium',
            results_count: titles.length,
            duration_ms: Date.now() - t0,
            attempted_providers: [],
        };
    }
    catch {
        return null;
    }
}
// ── Provider 3: Bing HTML scraping ───────────────────────────────────────────
async function searchWithBing(query) {
    const t0 = Date.now();
    try {
        const { data } = await axios_1.default.get(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fr&cc=DZ&count=8`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'fr-FR,fr;q=0.9',
                'Accept': 'text/html',
            },
            timeout: 10_000,
        });
        if (typeof data !== 'string' || data.length < 500)
            return null;
        const titles = [];
        const snippets = [];
        // Extract from .b_algo divs (standard Bing result structure)
        for (const m of data.matchAll(/<h2[^>]*><a[^>]*>(.*?)<\/a><\/h2>/gs)) {
            const t = m[1]?.replace(/<[^>]+>/g, '').trim();
            if (t && t.length > 3)
                titles.push(t);
        }
        for (const m of data.matchAll(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>(.*?)<\/p>/gs)) {
            const s = m[1]?.replace(/<[^>]+>/g, '').trim();
            if (s && s.length > 20)
                snippets.push(s);
        }
        // Fallback: any <p> inside b_caption
        if (snippets.length === 0) {
            for (const m of data.matchAll(/<div[^>]+class="b_caption"[^>]*>.*?<p[^>]*>(.*?)<\/p>/gs)) {
                const s = m[1]?.replace(/<[^>]+>/g, '').trim();
                if (s && s.length > 20)
                    snippets.push(s);
            }
        }
        if (titles.length === 0)
            return null;
        const lines = titles.slice(0, 8).map((t, i) => {
            const s = snippets[i] ?? '';
            return s ? `• ${t}\n  ${s}` : `• ${t}`;
        });
        const text = lines.join('\n\n');
        if (text.length < 80)
            return null;
        return {
            text: text.slice(0, 4000),
            source: 'bing',
            confidence: 'medium',
            results_count: titles.length,
            duration_ms: Date.now() - t0,
            attempted_providers: [],
        };
    }
    catch {
        return null;
    }
}
// ── Provider 4: Google Custom Search API ─────────────────────────────────────
// Requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID
async function searchWithGoogle(query) {
    if (!env_js_1.env.GOOGLE_SEARCH_API_KEY || !env_js_1.env.GOOGLE_SEARCH_ENGINE_ID)
        return null;
    const t0 = Date.now();
    try {
        const { data } = await axios_1.default.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: env_js_1.env.GOOGLE_SEARCH_API_KEY,
                cx: env_js_1.env.GOOGLE_SEARCH_ENGINE_ID,
                q: query,
                num: 8,
                lr: 'lang_fr',
                gl: 'dz',
            },
            timeout: 10_000,
        });
        const items = data.items ?? [];
        if (items.length === 0)
            return null;
        const text = items
            .slice(0, 8)
            .map((r) => {
            const rr = r;
            return `• ${rr['title'] ?? ''}\n  ${rr['snippet'] ?? ''}`;
        })
            .join('\n\n');
        return {
            text: text.slice(0, 4000),
            source: 'google_api',
            confidence: 'high',
            results_count: items.length,
            duration_ms: Date.now() - t0,
            attempted_providers: [],
        };
    }
    catch {
        return null;
    }
}
// ── Provider 5: Jina AI Search (requires JINA_API_KEY) ───────────────────────
async function searchWithJina(query) {
    if (!env_js_1.env.JINA_API_KEY)
        return null; // s.jina.ai requires auth since 2025
    const t0 = Date.now();
    try {
        const { data } = await axios_1.default.get(`https://s.jina.ai/${encodeURIComponent(query)}`, {
            headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none', 'Authorization': `Bearer ${env_js_1.env.JINA_API_KEY}` },
            timeout: 15_000,
        });
        const text = typeof data === 'string' ? data : JSON.stringify(data);
        if (!text || text.length < 100)
            return null;
        return {
            text: text.slice(0, 4000), source: 'jina', confidence: 'medium',
            results_count: 1, duration_ms: Date.now() - t0, attempted_providers: [],
        };
    }
    catch {
        return null;
    }
}
// ── Provider 6: Jina Reader (YouTube + TikTok) — no key required ─────────────
// Fetches YouTube search results + TikTok hashtag pages via r.jina.ai reader.
// Works without API key. Provides real view counts, video titles, hashtag counts.
async function searchWithJinaReader(query) {
    const t0 = Date.now();
    const headers = { 'Accept': 'text/plain', 'X-Retain-Images': 'none' };
    if (env_js_1.env.JINA_API_KEY)
        headers['Authorization'] = `Bearer ${env_js_1.env.JINA_API_KEY}`;
    const jinaRead = async (url) => {
        try {
            const { data } = await axios_1.default.get(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers, timeout: 18_000 });
            return (typeof data === 'string' ? data : '').slice(0, 3000);
        }
        catch {
            return '';
        }
    };
    // Build URLs to fetch based on query content
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    // Extract hashtag-like terms for TikTok
    const hashtagMatch = query.match(/\w{4,}/g) ?? [];
    const shortQuery = hashtagMatch.slice(0, 3).join('');
    const tiktokUrl = shortQuery.length > 3 ? `https://www.tiktok.com/tag/${shortQuery.toLowerCase()}` : '';
    const [ytText, tiktokText] = await Promise.all([
        jinaRead(ytUrl),
        tiktokUrl ? jinaRead(tiktokUrl) : Promise.resolve(''),
    ]);
    // Extract meaningful lines from YouTube (titles + view counts)
    const ytLines = ytText.split('\n')
        .filter(l => l.match(/###|##/) || l.match(/\d+[KMB]?\s*views?|\d+[KMB]?\s*vues?/i))
        .slice(0, 20)
        .join('\n');
    // Extract TikTok hashtag post count
    const tiktokPostCount = tiktokText.match(/(\d+[\.,]?\d*)\s*posts?/i)?.[0] ?? '';
    const tiktokLines = tiktokText.split('\n')
        .filter(l => l.match(/#\w+/) || l.match(/###/) || l.match(/\d+[KMB]/i))
        .slice(0, 10)
        .join('\n');
    const combined = [
        ytLines.length > 50 ? `📺 YOUTUBE — résultats pour "${query}":\n${ytLines}` : '',
        tiktokLines.length > 20 ? `📱 TIKTOK ${tiktokPostCount}:\n${tiktokLines}` : '',
    ].filter(Boolean).join('\n\n');
    if (combined.length < 80)
        return null;
    return {
        text: combined.slice(0, 4000),
        source: 'jina',
        confidence: 'medium',
        results_count: (ytLines.match(/###/g)?.length ?? 0) + (tiktokLines.match(/###/g)?.length ?? 0),
        duration_ms: Date.now() - t0,
        attempted_providers: [],
    };
}
// ── Main export ───────────────────────────────────────────────────────────────
const PROVIDERS = [
    { name: 'apify', fn: searchWithApify },
    { name: 'jina', fn: searchWithJina }, // Jina Search (key required)
    { name: 'google_api', fn: searchWithGoogle },
    { name: 'duckduckgo', fn: searchWithDuckDuckGo }, // may be blocked by bot detection
    { name: 'bing', fn: searchWithBing }, // may be blocked by bot detection
    { name: 'jina', fn: searchWithJinaReader }, // Jina Reader (YouTube+TikTok) — always available
];
async function multiProviderWebSearch(query, requestId) {
    const tag = `[web-search${requestId ? ':' + requestId : ''}]`;
    const attempted = [];
    for (const { name, fn } of PROVIDERS) {
        attempted.push(name);
        const t0 = Date.now();
        try {
            const result = await fn(query);
            if (result && result.text.length >= 80) {
                console.log(`${tag} ✅ source=${name} results=${result.results_count} chars=${result.text.length} ${Date.now() - t0}ms`);
                return { ...result, attempted_providers: attempted };
            }
            console.log(`${tag} ⚠️ ${name} → empty/short (${Date.now() - t0}ms) → next`);
        }
        catch (err) {
            console.log(`${tag} ❌ ${name} → ${err instanceof Error ? err.message : String(err)} (${Date.now() - t0}ms) → next`);
        }
    }
    console.log(`${tag} ❌ ALL_PROVIDERS_FAILED query="${query.slice(0, 60)}" tried=[${attempted.join(',')}]`);
    return {
        text: `NO_DATA — Toutes les sources de recherche ont échoué. Requête: "${query}"`,
        source: 'jina',
        confidence: 'low',
        results_count: 0,
        duration_ms: 0,
        attempted_providers: attempted,
    };
}
// ── Re-export Jina headers helper for fetchUrl ────────────────────────────────
function jinaAuthHeaders() {
    const h = { 'Accept': 'text/plain', 'X-Retain-Images': 'none' };
    if (env_js_1.env.JINA_API_KEY)
        h['Authorization'] = `Bearer ${env_js_1.env.JINA_API_KEY}`;
    return h;
}
//# sourceMappingURL=web-search-provider.js.map