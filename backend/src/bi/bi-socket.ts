import type { Namespace } from 'socket.io';

let _ns: Namespace | null = null;

export function setBISocket(ns: Namespace): void {
  _ns = ns;
}

export function emitBIRefresh(type: 'fleet' | 'revenue' | 'reminders' | 'full'): void {
  _ns?.emit('bi:refresh', { type, timestamp: new Date().toISOString() });
}
