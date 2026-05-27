/**
 * Competitor Agent Runner — Tool-aware Claude agent for Fik Conciergerie competitor intelligence.
 *
 * Authorized tools (allowlist strict):
 *   web_search           → Jina AI web search (returns real web page excerpts)
 *
 * Note: analyze_competitors is NOT used as a tool here because it calls Claude
 * internally — nesting Claude inside a Claude tool loop breaks the agentic loop.
 * Instead, we use targeted web_search calls and let Claude synthesize the raw results.
 *
 * Data sources (reality check):
 *   - Jina AI search (s.jina.ai) → real indexed web content, no key required
 *   - TikTok page fetches via Jina → often blocked by TikTok anti-bot
 *   - If TikTok is blocked → explicit NO_DATA, never invented metrics
 *
 * Verdict:
 *   VERIFIED → ≥3 web_search calls returned >300 chars of real data with competitor names
 *   PARTIAL  → some real data but limited coverage
 *   FAKE     → no real data fetched, all invented
 */
export interface CompetitorToolCall {
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_result: string;
    duration_ms: number;
    blocked: boolean;
    chars_returned: number;
    data_quality: 'real' | 'blocked' | 'empty' | 'error';
}
export interface CompetitorAgentResult {
    request_id: string;
    agent_id: 'competitor';
    agent_name: '🔎 Agent Concurrence';
    provider: 'claude';
    model: string;
    system_prompt: string;
    tools_allowed: string[];
    tools_called: CompetitorToolCall[];
    tool_count: number;
    raw_data_chars: number;
    competitors_found: string[];
    analysis: string;
    input_tokens: number;
    output_tokens: number;
    total_ms: number;
    verdict: 'VERIFIED' | 'PARTIAL' | 'FAKE';
    verdict_reason: string;
    error?: string;
}
export declare function runCompetitorAgentWithTools(userMessage: string, requestId: string, timeoutMs?: number): Promise<CompetitorAgentResult>;
//# sourceMappingURL=competitor-agent-runner.d.ts.map