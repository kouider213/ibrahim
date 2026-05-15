/**
 * Multi-provider web search — resilient, no single point of failure.
 * Updated: 2026-05-15 — SearXNG + Jina DDG proxy added (free, no key required).
 *
 * Priority order:
 *   1. APIFY Google Search Scraper  — requires APIFY_API_KEY, highest quality
 *   2. SearXNG public instances     — free, JSON API, no key, ~2-4s
 *   3. Jina Reader → DDG/Yahoo      — r.jina.ai fetches search pages, bypasses bot-detection
 *   4. Google Custom Search API     — requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID
 *   5. Jina AI Search               — requires JINA_API_KEY
 *   6. DuckDuckGo HTML direct       — often blocked, last resort
 *   7. Bing HTML direct             — often blocked, last resort
 *   8. Jina Reader YouTube+TikTok   — media-specific fallback
 *
 * Rules:
 *   - Never invents data
 *   - If all providers fail → explicit NO_DATA result, confidence='low'
 *   - Every call logs which provider succeeded/failed and why
 */

import axios from 'axios';
import { env } from '../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SearchProvider = 'apify' | 'searxng' | 'jina_proxy' | 'duckduckgo' | 'bing' | 'google_api' | 'jina';
export type SearchConfidence = 'high' | 'medium' | 'low';

export interface WebSearchResult {
  text:               string;
  source:             SearchProvider;
  confidence:         SearchConfidence;
  results_count:      number;
  duration_ms:        number;
  attempted_providers: string[];
}

// ── Provider 1: APIFY Google Search Scraper ───────────────────────────────────
// Uses apify/google-search-scraper actor with 30s polling deadline.

async function searchWithApify(query: string): Promise<WebSearchResult | null> {
  if (!env.APIFY_API_KEY) return null;
  const t0  = Date.now();
  const key = env.APIFY_API_KEY;

  type RunResp  = { data: { id: string } };
  type PollResp = { data: { status: string; defaultDatasetId: string } };

  try {
    const runResp = await axios.post<RunResp>(
      `https://api.apify.com/v2/acts/apify~google-search-scraper/runs?token=${key}`,
      { queries: query, maxPagesPerQuery: 1, resultsPerPage: 6, countryCode: 'dz', languageCode: 'fr' },
      { timeout: 15_000 },
    );
    const runId = runResp.data?.data?.id ?? '';
    if (!runId) return null;

    // Poll max 10 × 3s = 30s
    let datasetId = '';
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3_000));
      const poll = await axios.get<PollResp>(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${key}`,
        { timeout: 8_000 },
      );
      const status = poll.data?.data?.status ?? '';
      if (status === 'SUCCEEDED') { datasetId = poll.data.data.defaultDatasetId; break; }
      if (status === 'FAILED' || status === 'ABORTED') return null;
    }
    if (!datasetId) return null;

    const items = await axios.get<unknown[]>(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${key}&limit=6`,
      { timeout: 10_000 },
    );
    const rows = Array.isArray(items.data) ? items.data : [];
    if (rows.length === 0) return null;

    const organic = (rows[0] as Record<string, unknown>)['organicResults'];
    const results = Array.isArray(organic) ? organic : [];
    if (results.length === 0) return null;

    const text = results
      .slice(0, 6)
      .map((r: unknown) => {
        const rr = r as Record<string, unknown>;
        return `• ${rr['title'] ?? ''}\n  ${rr['url'] ?? ''}\n  ${rr['description'] ?? ''}`;
      })
      .join('\n\n');

    if (text.length < 100) return null;

    return {
      text:               text.slice(0, 4000),
      source:             'apify',
      confidence:         'high',
      results_count:      results.length,
      duration_ms:        Date.now() - t0,
      attempted_providers: [],
    };
  } catch {
    return null;
  }
}

// ── Provider 2: SearXNG public instances (JSON API, no key required) ─────────
// Tries multiple public instances — returns structured JSON search results.

const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://search.bus-hit.me',
  'https://searx.prvcy.eu',
  'https://search.mdosch.de',
  'https://paulgo.io',
];

async function searchWithSearxNG(query: string): Promise<WebSearchResult | null> {
  const t0 = Date.now();
  for (const base of SEARXNG_INSTANCES) {
    try {
      const { data } = await axios.get<{ results?: unknown[] }>(`${base}/search`, {
        params: { q: query, format: 'json', language: 'fr', safesearch: 0, engines: 'google,bing,duckduckgo' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dzaryx/1.0)',
          'Accept':     'application/json',
        },
        timeout: 8_000,
      });
      const results = Array.isArray(data?.results) ? data.results : [];
      if (results.length === 0) continue;

      const text = results
        .slice(0, 8)
        .map((r: unknown) => {
          const rr = r as Record<string, unknown>;
          const title   = String(rr['title']   ?? '').trim();
          const snippet = String(rr['content'] ?? '').trim();
          const url     = String(rr['url']     ?? '').trim();
          return `• ${title}\n  ${url}\n  ${snippet}`;
        })
        .filter(l => l.length > 10)
        .join('\n\n');

      if (text.length < 80) continue;

      console.log(`[searxng] ✅ instance=${base} results=${results.length} chars=${text.length}`);
      return {
        text:               text.slice(0, 4000),
        source:             'searxng',
        confidence:         'high',
        results_count:      results.length,
        duration_ms:        Date.now() - t0,
        attempted_providers: [],
      };
    } catch {
      // try next instance
    }
  }
  return null;
}

// ── Provider 3: Jina Reader → DuckDuckGo/Yahoo (bypasses bot-detection) ──────
// r.jina.ai renders pages server-side — it can fetch DDG/Yahoo results
// where direct scraping gets blocked.

async function searchWithJinaProxy(query: string): Promise<WebSearchResult | null> {
  const t0 = Date.now();
  const jinaHeaders: Record<string, string> = { 'Accept': 'text/plain', 'X-Retain-Images': 'none' };
  if (env.JINA_API_KEY) jinaHeaders['Authorization'] = `Bearer ${env.JINA_API_KEY}`;

  const jinaFetch = async (url: string): Promise<string> => {
    try {
      const { data } = await axios.get(`https://r.jina.ai/${encodeURIComponent(url)}`, {
        headers: jinaHeaders,
        timeout: 18_000,
      });
      return typeof data === 'string' ? data : '';
    } catch {
      return '';
    }
  };

  // Try DuckDuckGo Lite (lighter page, less bot-detection) and Yahoo
  const ddgLiteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=fr-fr`;
  const yahooUrl   = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&vl=lang_fr`;

  const [ddgText, yahooText] = await Promise.all([
    jinaFetch(ddgLiteUrl),
    jinaFetch(yahooUrl),
  ]);

  // Parse DDG Lite — plain text links + snippets
  const ddgLines = ddgText.split('\n')
    .filter(l => l.trim().length > 20 && !l.match(/^(DuckDuckGo|Privacy|Settings|Next|Prev)/i))
    .slice(0, 25);

  // Parse Yahoo — extract titles and snippets
  const yahooLines = yahooText.split('\n')
    .filter(l => l.trim().length > 15 && !l.match(/^(Yahoo|Sign in|Mail|News|Sports|Finance)/i))
    .slice(0, 20);

  const combined = [
    ddgLines.length > 3  ? `🔍 DuckDuckGo — "${query}":\n${ddgLines.join('\n')}` : '',
    yahooLines.length > 3 ? `🔍 Yahoo — "${query}":\n${yahooLines.join('\n')}`    : '',
  ].filter(Boolean).join('\n\n');

  if (combined.length < 80) return null;

  return {
    text:               combined.slice(0, 4000),
    source:             'jina_proxy',
    confidence:         'medium',
    results_count:      ddgLines.length + yahooLines.length,
    duration_ms:        Date.now() - t0,
    attempted_providers: [],
  };
}

// ── Provider 4: DuckDuckGo HTML scraping ─────────────────────────────────────
// POST to html.duckduckgo.com/html/ — more reliable than GET (avoids redirect)

async function searchWithDuckDuckGo(query: string): Promise<WebSearchResult | null> {
  const t0 = Date.now();
  try {
    const { data } = await axios.post(
      'https://html.duckduckgo.com/html/',
      `q=${encodeURIComponent(query)}&kl=fr-fr`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
          'Accept':       'text/html,application/xhtml+xml',
        },
        timeout: 10_000,
      },
    );
    if (typeof data !== 'string' || data.length < 500) return null;

    const titles:   string[] = [];
    const snippets: string[] = [];

    for (const m of data.matchAll(/<a[^>]+class="result__a"[^>]*>(.*?)<\/a>/gs)) {
      const t = m[1]?.replace(/<[^>]+>/g, '').trim();
      if (t && t.length > 3) titles.push(t);
    }
    for (const m of data.matchAll(/<(?:div|span)[^>]+class="result__snippet"[^>]*>(.*?)<\/(?:div|span)>/gs)) {
      const s = m[1]?.replace(/<[^>]+>/g, '').trim();
      if (s && s.length > 20) snippets.push(s);
    }

    if (titles.length === 0 && snippets.length === 0) return null;

    const lines = titles.slice(0, 8).map((t, i) => {
      const s = snippets[i] ?? '';
      return s ? `• ${t}\n  ${s}` : `• ${t}`;
    });
    const text = lines.join('\n\n');
    if (text.length < 80) return null;

    return {
      text:               text.slice(0, 4000),
      source:             'duckduckgo',
      confidence:         'medium',
      results_count:      titles.length,
      duration_ms:        Date.now() - t0,
      attempted_providers: [],
    };
  } catch {
    return null;
  }
}

// ── Provider 3: Bing HTML scraping ───────────────────────────────────────────

async function searchWithBing(query: string): Promise<WebSearchResult | null> {
  const t0 = Date.now();
  try {
    const { data } = await axios.get(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fr&cc=DZ&count=8`,
      {
        headers: {
          'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'fr-FR,fr;q=0.9',
          'Accept':       'text/html',
        },
        timeout: 10_000,
      },
    );
    if (typeof data !== 'string' || data.length < 500) return null;

    const titles:   string[] = [];
    const snippets: string[] = [];

    // Extract from .b_algo divs (standard Bing result structure)
    for (const m of data.matchAll(/<h2[^>]*><a[^>]*>(.*?)<\/a><\/h2>/gs)) {
      const t = m[1]?.replace(/<[^>]+>/g, '').trim();
      if (t && t.length > 3) titles.push(t);
    }
    for (const m of data.matchAll(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>(.*?)<\/p>/gs)) {
      const s = m[1]?.replace(/<[^>]+>/g, '').trim();
      if (s && s.length > 20) snippets.push(s);
    }
    // Fallback: any <p> inside b_caption
    if (snippets.length === 0) {
      for (const m of data.matchAll(/<div[^>]+class="b_caption"[^>]*>.*?<p[^>]*>(.*?)<\/p>/gs)) {
        const s = m[1]?.replace(/<[^>]+>/g, '').trim();
        if (s && s.length > 20) snippets.push(s);
      }
    }

    if (titles.length === 0) return null;

    const lines = titles.slice(0, 8).map((t, i) => {
      const s = snippets[i] ?? '';
      return s ? `• ${t}\n  ${s}` : `• ${t}`;
    });
    const text = lines.join('\n\n');
    if (text.length < 80) return null;

    return {
      text:               text.slice(0, 4000),
      source:             'bing',
      confidence:         'medium',
      results_count:      titles.length,
      duration_ms:        Date.now() - t0,
      attempted_providers: [],
    };
  } catch {
    return null;
  }
}

// ── Provider 4: Google Custom Search API ─────────────────────────────────────
// Requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID

async function searchWithGoogle(query: string): Promise<WebSearchResult | null> {
  if (!env.GOOGLE_SEARCH_API_KEY || !env.GOOGLE_SEARCH_ENGINE_ID) return null;
  const t0 = Date.now();
  try {
    const { data } = await axios.get<{ items?: unknown[] }>('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: env.GOOGLE_SEARCH_API_KEY,
        cx:  env.GOOGLE_SEARCH_ENGINE_ID,
        q:   query,
        num: 8,
        lr:  'lang_fr',
        gl:  'dz',
      },
      timeout: 10_000,
    });

    const items = data.items ?? [];
    if (items.length === 0) return null;

    const text = items
      .slice(0, 8)
      .map((r: unknown) => {
        const rr = r as Record<string, unknown>;
        return `• ${rr['title'] ?? ''}\n  ${rr['snippet'] ?? ''}`;
      })
      .join('\n\n');

    return {
      text:               text.slice(0, 4000),
      source:             'google_api',
      confidence:         'high',
      results_count:      items.length,
      duration_ms:        Date.now() - t0,
      attempted_providers: [],
    };
  } catch {
    return null;
  }
}

// ── Provider 5: Jina AI Search (requires JINA_API_KEY) ───────────────────────

async function searchWithJina(query: string): Promise<WebSearchResult | null> {
  if (!env.JINA_API_KEY) return null; // s.jina.ai requires auth since 2025
  const t0 = Date.now();
  try {
    const { data } = await axios.get(`https://s.jina.ai/${encodeURIComponent(query)}`, {
      headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none', 'Authorization': `Bearer ${env.JINA_API_KEY}` },
      timeout: 15_000,
    });
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    if (!text || text.length < 100) return null;
    return {
      text: text.slice(0, 4000), source: 'jina', confidence: 'medium',
      results_count: 1, duration_ms: Date.now() - t0, attempted_providers: [],
    };
  } catch {
    return null;
  }
}

// ── Provider 6: Jina Reader (YouTube + TikTok) — no key required ─────────────
// Fetches YouTube search results + TikTok hashtag pages via r.jina.ai reader.
// Works without API key. Provides real view counts, video titles, hashtag counts.

async function searchWithJinaReader(query: string): Promise<WebSearchResult | null> {
  const t0 = Date.now();
  const headers: Record<string, string> = { 'Accept': 'text/plain', 'X-Retain-Images': 'none' };
  if (env.JINA_API_KEY) headers['Authorization'] = `Bearer ${env.JINA_API_KEY}`;

  const jinaRead = async (url: string): Promise<string> => {
    try {
      const { data } = await axios.get(`https://r.jina.ai/${encodeURIComponent(url)}`, { headers, timeout: 18_000 });
      return (typeof data === 'string' ? data : '').slice(0, 3000);
    } catch {
      return '';
    }
  };

  // Build URLs to fetch based on query content
  const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  // Extract hashtag-like terms for TikTok
  const hashtagMatch = query.match(/\w{4,}/g) ?? [];
  const shortQuery   = hashtagMatch.slice(0, 3).join('');
  const tiktokUrl    = shortQuery.length > 3 ? `https://www.tiktok.com/tag/${shortQuery.toLowerCase()}` : '';

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

  if (combined.length < 80) return null;

  return {
    text:               combined.slice(0, 4000),
    source:             'jina',
    confidence:         'medium',
    results_count:      (ytLines.match(/###/g)?.length ?? 0) + (tiktokLines.match(/###/g)?.length ?? 0),
    duration_ms:        Date.now() - t0,
    attempted_providers: [],
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

const PROVIDERS: Array<{ name: SearchProvider; fn: (q: string) => Promise<WebSearchResult | null> }> = [
  { name: 'apify',      fn: searchWithApify },       // best quality, requires APIFY_API_KEY
  { name: 'searxng',    fn: searchWithSearxNG },     // free public instances, JSON API
  { name: 'jina_proxy', fn: searchWithJinaProxy },   // Jina fetches DDG Lite + Yahoo (bypasses bot-detection)
  { name: 'google_api', fn: searchWithGoogle },      // requires GOOGLE_SEARCH_API_KEY
  { name: 'jina',       fn: searchWithJina },        // requires JINA_API_KEY
  { name: 'duckduckgo', fn: searchWithDuckDuckGo },  // often blocked
  { name: 'bing',       fn: searchWithBing },        // often blocked
  { name: 'jina',       fn: searchWithJinaReader },  // YouTube+TikTok media fallback
];

export async function multiProviderWebSearch(
  query:     string,
  requestId?: string,
): Promise<WebSearchResult> {
  const tag      = `[web-search${requestId ? ':' + requestId : ''}]`;
  const attempted: string[] = [];

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
    } catch (err) {
      console.log(`${tag} ❌ ${name} → ${err instanceof Error ? err.message : String(err)} (${Date.now() - t0}ms) → next`);
    }
  }

  console.log(`${tag} ❌ ALL_PROVIDERS_FAILED query="${query.slice(0, 60)}" tried=[${attempted.join(',')}]`);
  return {
    text:               `NO_DATA — Toutes les sources de recherche ont échoué. Requête: "${query}"`,
    source:             'jina',
    confidence:         'low',
    results_count:      0,
    duration_ms:        0,
    attempted_providers: attempted,
  };
}

// ── Re-export Jina headers helper for fetchUrl ────────────────────────────────
export function jinaAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Accept': 'text/plain', 'X-Retain-Images': 'none' };
  if (env.JINA_API_KEY) h['Authorization'] = `Bearer ${env.JINA_API_KEY}`;
  return h;
}
