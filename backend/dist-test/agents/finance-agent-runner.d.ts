/**
 * Finance Agent Runner — Tool-aware Claude agent for Fik Conciergerie finance.
 *
 * Uses Claude's native tool-use API (agentic loop) to call ONLY the 6 authorized
 * finance tools against real Supabase data. No other tools allowed.
 *
 * Flow:
 *   1. Send message to Claude with FINANCE_TOOLS schema
 *   2. Claude calls tools → we execute them via executeTool()
 *   3. Tool results injected back → Claude calls more tools or produces final analysis
 *   4. Stop when stop_reason = 'end_turn' or MAX_ITER reached
 *   5. Return full proof: tools_called[], tool_results, analysis, tokens, verdict
 */
export interface FinanceToolCall {
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_result: string;
    duration_ms: number;
    blocked: boolean;
}
export interface FinanceAgentResult {
    request_id: string;
    agent_id: 'finance';
    agent_name: '💰 Agent Finance';
    provider: 'claude';
    model: string;
    system_prompt: string;
    tools_allowed: string[];
    tools_called: FinanceToolCall[];
    tool_count: number;
    raw_data_chars: number;
    analysis: string;
    input_tokens: number;
    output_tokens: number;
    total_ms: number;
    verdict: 'VERIFIED' | 'PARTIAL' | 'FAILED';
    verdict_reason: string;
    error?: string;
}
export declare function runFinanceAgentWithTools(userMessage: string, requestId: string, timeoutMs?: number): Promise<FinanceAgentResult>;
//# sourceMappingURL=finance-agent-runner.d.ts.map