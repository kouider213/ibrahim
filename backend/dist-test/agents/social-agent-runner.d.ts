/**
 * Social Agent Runner — Tool-aware Claude agent for Fik Conciergerie social media.
 *
 * Authorized tools (allowlist strict):
 *   get_tiktok_market   → APIFY clockworks~tiktok-scraper: competitor hashtags + profiles
 *   get_tiktok_profile  → APIFY: stats d'un compte TikTok précis (Fik ou concurrent)
 *   web_search          → multi-provider (APIFY Google > DDG > Bing > Jina)
 *
 * Verdict:
 *   VERIFIED → APIFY a retourné ≥1 vidéo réelle + analyse >200 chars
 *   PARTIAL  → seulement web_search (pas de données TikTok directes)
 *   FAKE     → aucune donnée réelle récupérée
 *
 * Fik Conciergerie TikTok probe:
 *   Tente @fikconciergerie → si 0 vidéos: "compte non trouvé ou sans contenu public"
 */
export interface SocialToolCall {
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_result: string;
    duration_ms: number;
    blocked: boolean;
    data_quality: 'real' | 'partial' | 'no_data' | 'blocked' | 'error';
    tiktok_videos?: number;
}
export interface FikTikTokProfile {
    handle: string;
    found: boolean;
    followers: number | null;
    total_views: number;
    video_count: number;
    top_videos: Array<{
        description: string;
        views: number | null;
        likes: number | null;
        engagement_pct: number | null;
        published_at: string | null;
    }>;
    why_not_found?: string;
}
export interface SocialAgentResult {
    request_id: string;
    agent_id: 'social';
    agent_name: '📱 Agent Social Media';
    provider: 'claude';
    model: string;
    system_prompt: string;
    tools_allowed: string[];
    tools_called: SocialToolCall[];
    tool_count: number;
    raw_data_chars: number;
    tiktok_videos_found: number;
    fik_profile: FikTikTokProfile | null;
    analysis: string;
    input_tokens: number;
    output_tokens: number;
    total_ms: number;
    verdict: 'VERIFIED' | 'PARTIAL' | 'FAKE';
    verdict_reason: string;
    error?: string;
}
export declare function runSocialAgentWithTools(userMessage: string, requestId: string, timeoutMs?: number): Promise<SocialAgentResult>;
//# sourceMappingURL=social-agent-runner.d.ts.map