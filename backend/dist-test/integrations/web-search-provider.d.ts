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
export type SearchProvider = 'apify' | 'duckduckgo' | 'bing' | 'google_api' | 'jina';
export type SearchConfidence = 'high' | 'medium' | 'low';
export interface WebSearchResult {
    text: string;
    source: SearchProvider;
    confidence: SearchConfidence;
    results_count: number;
    duration_ms: number;
    attempted_providers: string[];
}
export declare function multiProviderWebSearch(query: string, requestId?: string): Promise<WebSearchResult>;
export declare function jinaAuthHeaders(): Record<string, string>;
//# sourceMappingURL=web-search-provider.d.ts.map