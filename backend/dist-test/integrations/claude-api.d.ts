import Anthropic from '@anthropic-ai/sdk';
export interface Message {
    role: 'user' | 'assistant';
    content: string | Anthropic.ContentBlockParam[];
}
export interface ToolExecution {
    name: string;
    success: boolean;
    result: string;
}
export interface ClaudeResponse {
    text: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    thinkingTokens?: number;
    stopReason: string;
    mode?: 'fast' | 'normal' | 'thinking';
    citations?: CitationInfo[];
    toolsExecuted: ToolExecution[];
}
export interface CitationInfo {
    text: string;
    source: string;
    startIndex: number;
    endIndex: number;
}
export type ToolStartCallback = (toolName: string, toolInput: Record<string, unknown>) => void;
export type ToolDoneCallback = (toolName: string, result: string) => void;
export declare function chatWithTools(messages: Message[], systemExtra?: string, sessionId?: string, onToolStart?: ToolStartCallback, onToolDone?: ToolDoneCallback, onTextChunk?: (chunk: string) => void, imageBase64?: string, imageMime?: string, toolOverride?: Anthropic.Tool[]): Promise<ClaudeResponse>;
export declare function chat(messages: Message[], systemExtra?: string): Promise<ClaudeResponse>;
export declare function chatStream(messages: Message[], systemExtra: string | undefined, onChunk: (chunk: string) => void): Promise<ClaudeResponse>;
export declare function detectIntent(userMessage: string, context: string): Promise<{
    intent: string;
    action?: string;
    params?: Record<string, unknown>;
    requiresValidation: boolean;
}>;
export declare function generateTikTokContent(topic: string, vehicleName?: string): Promise<string>;
export declare function learnRule(userInstruction: string): Promise<{
    category: string;
    rule: string;
    conditions: object;
    action: object;
}>;
//# sourceMappingURL=claude-api.d.ts.map