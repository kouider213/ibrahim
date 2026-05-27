import type { Server as SocketServer } from 'socket.io';
import type { ActionPayload, ActionResult } from '../executor.js';
export declare function initPcRelay(io: SocketServer): void;
export declare function registerPcAgent(socketId: string): void;
export declare function unregisterPcAgent(socketId: string): void;
export declare function isPcAgentConnected(): boolean;
export declare function handlePcRelay(payload: ActionPayload): Promise<ActionResult>;
//# sourceMappingURL=pc-relay.d.ts.map