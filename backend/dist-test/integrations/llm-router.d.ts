export type LLMProvider = 'claude' | 'groq' | 'openai' | 'gemini';
export interface RouteDecision {
    provider: LLMProvider;
    fallback: LLMProvider;
    fastPath: boolean;
    reason: string;
}
declare function classifyRequest(text: string, hasImage: boolean, messageCount: number): RouteDecision;
export declare function callGroqVision(userMessage: string, systemExtra?: string, imageBase64?: string, imageMime?: string, skipBasePrompt?: boolean): Promise<string>;
export declare function callGroq(userMessage: string, systemExtra?: string): Promise<string>;
export declare function callGemini(userMessage: string, systemExtra?: string, imageBase64?: string, imageMime?: string): Promise<string>;
export declare function callOpenAI(messages: Array<{
    role: 'user' | 'assistant';
    content: string;
}>, systemExtra?: string): Promise<string>;
export declare function callOpenAIVision(userMessage: string, systemExtra?: string, imageBase64?: string, imageMime?: string): Promise<string>;
export declare function callClaudeVision(userMessage: string, systemExtra?: string, imageBase64?: string, imageMime?: string, skipBasePrompt?: boolean): Promise<string>;
export { classifyRequest };
export declare function isGroqAvailable(): boolean;
export declare function isOpenAIAvailable(): boolean;
export declare function isGeminiAvailable(): boolean;
export declare function isClaudeAvailable(): boolean;
//# sourceMappingURL=llm-router.d.ts.map