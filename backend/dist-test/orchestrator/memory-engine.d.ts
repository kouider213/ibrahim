import { type MemoryContextResult } from '../conversation/memory-selector.js';
export type MemoryDomain = 'identity' | 'business' | 'health' | 'family' | 'goal' | 'habit' | 'preference' | 'note';
export interface WriteMemoryParams {
    key: string;
    value: string;
    domain: MemoryDomain;
    confidence?: number;
    source?: string;
}
export interface WriteMemoryResult {
    success: boolean;
    id: string | null;
    operation: 'created' | 'updated' | 'failed';
    error?: string;
}
export interface MemoryStats {
    total: number;
    domains: Record<string, number>;
}
interface MemoryFactRow {
    id: string;
    domain: string;
    key: string;
    value: string;
    confidence: number;
    is_current: boolean;
    updated_at: string;
}
/**
 * Exported for callers (e.g. rememberInfo) to compute a stable key before calling writeMemory.
 * Passing this as the `key` param means writeMemory's Step 2 domain+key check catches
 * normalized near-duplicates (punctuation/case variations of the same fact).
 */
export declare function computeMemoryKey(content: string, domain: string, userId?: string): string;
export declare function writeMemory(params: WriteMemoryParams): Promise<WriteMemoryResult>;
export declare function invalidateMemory(domain: MemoryDomain, key: string): Promise<boolean>;
export declare function readMemory(query: string, maxTokens?: number): Promise<MemoryContextResult>;
export declare function getMemoryStats(): Promise<MemoryStats>;
export declare function listMemoryByDomain(domain: MemoryDomain, limit?: number): Promise<MemoryFactRow[]>;
export {};
//# sourceMappingURL=memory-engine.d.ts.map