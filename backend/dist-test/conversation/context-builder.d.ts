import type { Message } from '../integrations/claude-api.js';
export interface ConversationContext {
    messages: Message[];
    systemExtra: string;
    sessionId: string;
}
export declare function buildContext(sessionId: string, userMessage: string): Promise<ConversationContext>;
//# sourceMappingURL=context-builder.d.ts.map