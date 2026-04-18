import type { Server as SocketServer } from 'socket.io';
import { SOCKET_EVENTS } from '../../config/constants.js';
import type { ActionPayload, ActionResult } from '../executor.js';

let _io: SocketServer | null = null;
let _pcSocketId: string | null = null;

export function initPcRelay(io: SocketServer): void {
  _io = io;
}

export function registerPcAgent(socketId: string): void {
  _pcSocketId = socketId;
  console.log(`[pc-relay] PC agent connected: ${socketId}`);
}

export function unregisterPcAgent(socketId: string): void {
  if (_pcSocketId === socketId) {
    _pcSocketId = null;
    console.log('[pc-relay] PC agent disconnected');
  }
}

export function isPcAgentConnected(): boolean {
  return _pcSocketId !== null;
}

export async function handlePcRelay(payload: ActionPayload): Promise<ActionResult> {
  if (!_io || !_pcSocketId) {
    return { success: false, error: 'pc_offline', message: "L'agent PC n'est pas connecté." };
  }

  return new Promise<ActionResult>(resolve => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'timeout', message: "L'agent PC n'a pas répondu dans les délais." });
    }, 30_000);

    const correlationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    _io!.once(`${SOCKET_EVENTS.PC_RESULT}:${correlationId}`, (result: ActionResult) => {
      clearTimeout(timeout);
      resolve(result);
    });

    _io!.to(_pcSocketId!).emit(SOCKET_EVENTS.PC_COMMAND, {
      correlationId,
      action: payload.action,
      params: payload.params,
    });
  });
}
