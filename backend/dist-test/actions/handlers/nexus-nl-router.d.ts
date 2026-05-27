export type IntentType = 'screenshot' | 'screen_understand' | 'file_list' | 'file_search' | 'file_read' | 'file_send' | 'file_open' | 'window_list' | 'window_focus' | 'window_close' | 'window_screenshot' | 'process_list' | 'process_kill' | 'app_launch' | 'app_close' | 'focus_app' | 'url_open' | 'terminal_run' | 'project_open' | 'claude_code_start' | 'nexus_status' | 'web_search' | 'unknown';
export interface DetectedIntent {
    type: IntentType;
    confidence: number;
    args: Record<string, string | number | boolean | undefined>;
    sysPriority?: boolean;
}
export interface NlRouterResult {
    handled: boolean;
    messages: string[];
    logs: string[];
    proofs: NlProof[];
}
export interface NlProof {
    cmd: string;
    intent: IntentType;
    confidence: number;
    route: 'os_agent' | 'python_ai' | 'unknown';
    jobId?: string;
    ok: boolean;
    elapsedMs: number;
    sysPriority?: boolean;
    fallbackReason?: string;
    toolUsed?: string;
}
export interface TestCase {
    input: string;
    expected_intents: IntentType[];
}
export interface TestResult {
    input: string;
    commands: string[];
    detected: Array<{
        cmd: string;
        intent: IntentType;
        confidence: number;
        args: Record<string, unknown>;
    }>;
    expected_intents: IntentType[];
    passed: boolean;
}
export declare function splitCommands(text: string): string[];
export declare function detectIntent(cmd: string): DetectedIntent;
export declare function routeNexusMessage(text: string): Promise<NlRouterResult>;
export declare function testNlParser(cases: TestCase[]): TestResult[];
//# sourceMappingURL=nexus-nl-router.d.ts.map