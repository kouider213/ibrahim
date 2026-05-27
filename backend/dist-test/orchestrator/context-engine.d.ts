export type SourceChannel = 'telegram' | 'mobile_voice' | 'mobile_text' | 'backend_internal';
export interface ChannelInfo {
    channel: SourceChannel;
    sessionId: string;
    timezone: string | null;
    lastSeenMs: number | null;
}
export interface CrossChannelMessage {
    channel: SourceChannel;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}
export interface FleetSnapshot {
    activeRentals: number;
    pendingBookings: number;
    totalOpen: number;
}
export interface OrchestratorContext {
    channel: ChannelInfo;
    crossChannel: CrossChannelMessage[];
    fleet: FleetSnapshot;
    builtAtMs: number;
}
export declare function detectChannel(sessionId: string): SourceChannel;
export declare function buildOrchestratorContext(sessionId: string): Promise<OrchestratorContext>;
export declare function formatChannelForLog(info: ChannelInfo): string;
//# sourceMappingURL=context-engine.d.ts.map