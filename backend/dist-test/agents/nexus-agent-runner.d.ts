/**
 * Nexus Agent Runner — P9: Dzaryx ↔ Nexus live intelligence layer.
 *
 * Transforms natural language commands into real Nexus PC actions.
 * Claude acts as the AI brain — it plans, executes, verifies.
 *
 * Anti-fake guarantees:
 *   - verdict VERIFIED only if real Nexus ack received
 *   - every tool call logged with timing + raw result
 *   - screenshots stored as base64 proof
 *   - Nexus offline → immediate FAKE verdict, no hallucination
 *
 * Features:
 *   - Retry: 1 automatic retry per tool on timeout/error (2s cooldown)
 *   - Queue: sequential execution via Claude agentic loop
 *   - Busy state: set in nexus-relay before/after execution
 *   - MAX_ITER=8, timeoutMs=90s
 */
export interface NexusToolCall {
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_result: string;
    duration_ms: number;
    retried: boolean;
    blocked: boolean;
    success: boolean;
}
export interface NexusScreenshot {
    captured_at: string;
    size_bytes: number;
    size_kb: number;
    hostname: string;
    image_base64: string;
}
export interface NexusAgentResult {
    request_id: string;
    agent_id: 'nexus_agent';
    provider: 'claude';
    model: string;
    user_message: string;
    tools_allowed: string[];
    nexus_online: boolean;
    nexus_hostname: string | null;
    nexus_os: string | null;
    nexus_latency_ms: number | null;
    tools_called: NexusToolCall[];
    tool_count: number;
    screenshots: NexusScreenshot[];
    screen_analysis: string | null;
    windows_found: unknown[];
    processes_found: unknown[];
    analysis: string;
    input_tokens: number;
    output_tokens: number;
    total_ms: number;
    verdict: 'VERIFIED' | 'PARTIAL' | 'FAKE';
    verdict_reason: string;
    error?: string;
}
export declare function runNexusAgent(userMessage: string, requestId: string, timeoutMs?: number): Promise<NexusAgentResult>;
//# sourceMappingURL=nexus-agent-runner.d.ts.map