import type { Namespace } from 'socket.io';
import { redis } from '../queue/queue.js';

let _io: Namespace | null = null;

export function initMobilePush(io: Namespace): void {
  _io = io;
}

export type ProactiveType = 'morning' | 'alert' | 'reminder' | 'info';

const PUSH_TOKEN_KEY = 'mobile:expo_push_token';

export async function storePushToken(token: string): Promise<void> {
  await redis.set(PUSH_TOKEN_KEY, token);
  console.log(`[mobile-push] Push token stored: ${token.slice(0, 30)}…`);
}

export async function getPushToken(): Promise<string | null> {
  return redis.get(PUSH_TOKEN_KEY);
}

async function sendExpoPush(title: string, body: string, data?: Record<string, string>): Promise<void> {
  const token = await getPushToken();
  if (!token) { console.log('[mobile-push] No push token — skipping FCM'); return; }

  const payload = {
    to:    token,
    title,
    body,
    data:  data ?? {},
    sound: 'default',
    priority: 'high',
  };

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error('[mobile-push] Expo push failed:', await res.text());
  } else {
    const json = await res.json() as { data?: { status: string } };
    console.log(`[mobile-push] Expo push sent — status: ${json.data?.status ?? 'ok'}`);
  }
}

// Broadcast via Socket.IO (app open) + Expo Push (app closed)
export function emitProactive(text: string, type: ProactiveType = 'info'): void {
  // Socket.IO — instant if app open
  if (_io) {
    _io.emit('Dzaryx:proactive', { text, type, timestamp: new Date().toISOString() });
  }

  // Expo Push — works even when app is closed
  const title = type === 'morning'  ? '☀️ Dzaryx — Bonjour'
              : type === 'alert'    ? '🚨 Dzaryx — Alerte'
              : type === 'reminder' ? '🔔 Dzaryx — Rappel'
              : '📱 Dzaryx';

  sendExpoPush(title, text, { text, type }).catch(err =>
    console.error('[mobile-push] push error:', err instanceof Error ? err.message : String(err)),
  );

  console.log(`[mobile-push] Proactive (${type}): ${text.slice(0, 60)}…`);
}
