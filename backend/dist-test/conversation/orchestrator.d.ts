import type { Namespace } from 'socket.io';
export declare function initOrchestrator(io: Namespace): void;
export interface OrchestratorResponse {
    text: string;
    status: 'done' | 'error';
}
export declare function processMessage(userMessage: string, sessionId: string, textOnly?: boolean, imageBase64?: string, imageMime?: string): Promise<OrchestratorResponse>;
//# sourceMappingURL=orchestrator.d.ts.map