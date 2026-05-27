import type { Namespace } from 'socket.io';
export declare function initDispatcher(io: Namespace): void;
export declare function cleanTextForTTS(text: string): string;
export declare function synthesizeVoice(text: string): Promise<Buffer | null>;
export declare function synthesizeVoiceStream(text: string, onChunk: (chunk: Buffer) => void): Promise<boolean>;
export declare function synthesizeAndSend(text: string, sessionId: string): Promise<void>;
export declare function dispatch(channel: 'pushover' | 'socket' | 'email', title: string, message: string, payload?: Record<string, unknown>): Promise<void>;
//# sourceMappingURL=dispatcher.d.ts.map