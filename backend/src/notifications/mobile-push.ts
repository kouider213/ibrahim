import type { Namespace } from 'socket.io';

let _io: Namespace | null = null;

export function initMobilePush(io: Namespace): void {
  _io = io;
}

export type ProactiveType = 'morning' | 'alert' | 'reminder' | 'info';

// Broadcast proactive message to ALL connected mobile clients
export function emitProactive(text: string, type: ProactiveType = 'info'): void {
  if (!_io) return;
  _io.emit('Dzaryx:proactive', {
    text,
    type,
    timestamp: new Date().toISOString(),
  });
  console.log(`[mobile-push] Proactive emitted (${type}): ${text.slice(0, 60)}…`);
}
