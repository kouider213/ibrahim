export interface MemoryContextResult {
    entries: Array<{
        content: string;
        category: string;
    }>;
    source: 'memory_facts' | 'ibrahim_memory' | 'empty';
    totalFacts: number;
    selectedFacts: number;
    tokenEstimate: number;
}
export declare function buildMemoryContext(userMessage: string, maxTokens?: number): Promise<MemoryContextResult>;
//# sourceMappingURL=memory-selector.d.ts.map