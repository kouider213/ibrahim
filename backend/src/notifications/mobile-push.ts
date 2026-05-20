import type { Namespace } from 'socket.io';
import { redis } from '../queue/queue.js';

let _io: Namespace | null = null;

export function initMobilePush(io: Namespace): void {
  _io = io;
}

export type ProactiveType = 'morning' | 'alert' | 'reminder' | 'info';

const PUSH_TOKEN_KEY    = 'mobile:expo_push_token';           // legacy single token (Kouider)
const PUSH_TOKEN_PREFIX = 'mobile:expo_push_token:';          // per-actor key prefix

export async function storePushToken(token: string, actorId = 'kouider'): Promise<void> {
  // Store actor-scoped + legacy key for Kouider (backward compat)
  await Promise.all([
    redis.set(`${PUSH_TOKEN_PREFIX}${actorId}`, token),
    actorId === 'kouider' ? redis.set(PUSH_TOKEN_KEY, token) : Promise.resolve(),
  ]);
  console.log(`[mobile-push] Push token stored for ${actorId}: ${token.slice(0, 30)}…`);
}

export async function getPushToken(actorId = 'kouider'): Promise<string | null> {
  const token = await redis.get(`${PUSH_TOKEN_PREFIX}${actorId}`);
  if (token) return token;
  // Fallback to legacy key for Kouider
  if (actorId === 'kouider') return redis.get(PUSH_TOKEN_KEY);
  return null;
}

/** Get all stored push tokens (for broadcast) */
async function getAllPushTokens(): Promise<string[]> {
  const [kouider, houari, legacy] = await Promise.all([
    redis.get(`${PUSH_TOKEN_PREFIX}kouider`),
    redis.get(`${PUSH_TOKEN_PREFIX}houari`),
    redis.get(PUSH_TOKEN_KEY),
  ]);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of [kouider, houari, legacy]) {
    if (t && !seen.has(t)) { seen.add(t); tokens.push(t); }
  }
  return tokens;
}

async function sendExpoPush(title: string, body: string, data?: Record<string, string>): Promise<void> {
  const tokens = await getAllPushTokens();
  if (tokens.length === 0) { console.log('[mobile-push] No push tokens — skipping FCM'); return; }

  // Expo supports array payload for batch send
  const payloads = tokens.map(to => ({
    to, title, body, data: data ?? {}, sound: 'default', priority: 'high',
  }));

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(payloads.length === 1 ? payloads[0] : payloads),
  });

  if (!res.ok) {
    console.error('[mobile-push] Expo push failed:', await res.text());
  } else {
    await res.json();
    console.log(`[mobile-push] Expo push sent to ${tokens.length} device(s)`);
  }
}

// Broadcast via Socket.IO (app open) + Expo Push (app closed)
// chatText: full message for the chat UI (if omitted, falls back to text)
export function emitProactive(text: string, type: ProactiveType = 'info', chatText?: string): void {
  // Socket.IO — instant if app open; send full chatText for rich display
  if (_io) {
    _io.emit('Dzaryx:proactive', { text: chatText ?? text, type, timestamp: new Date().toISOString() });
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
