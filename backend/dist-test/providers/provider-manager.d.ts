export type ProviderName = 'claude' | 'openai' | 'gemini' | 'groq';
export interface LLMConfig {
    provider: ProviderName;
    model: string;
    temperature: number;
    maxTokens: number;
    fallback?: ProviderName;
}
export interface ProviderResult {
    text: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    provider: ProviderName;
    model: string;
    usedFallback: boolean;
    costEstUsd: number;
}
export declare function isAvailable(p: ProviderName): boolean;
export declare function defaultModel(p: ProviderName): string;
export interface ProviderTestOptions {
    forceUnavailable?: ProviderName[];
}
export declare function callProvider(config: LLMConfig, userMessage: string, systemPrompt: string, timeoutMs: number, testOptions?: ProviderTestOptions): Promise<ProviderResult>;
//# sourceMappingURL=provider-manager.d.ts.map