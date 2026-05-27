export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
export type SourceChannel = 'telegram' | 'mobile_voice' | 'mobile_text' | 'backend_internal';
export interface PriorityScore {
    level: PriorityLevel;
    score: number;
    reason: string;
}
export declare function scorePriority(message: string, channel: SourceChannel): PriorityScore;
export declare function priorityToQueuePriority(p: PriorityScore): number;
//# sourceMappingURL=priority-engine.d.ts.map