import type { Namespace } from 'socket.io';
import { redis } from '../queue/queue.js';
import { sendFcm, isFcmToken } from './fcm.js';

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
  if (tokens.length === 0) { console.log('[mobile-push] No push tokens — skipping push'); return; }

  const expoTokens = tokens.filter(t => !isFcmToken(t));
  const fcmTokens  = tokens.filter(t => isFcmToken(t));

  // Native FCM tokens → Firebase Admin SDK
  for (const token of fcmTokens) {
    sendFcm(token, title, body, data).catch(err =>
      console.error('[mobile-push] FCM error:', err instanceof Error ? err.message : String(err)),
    );
  }

  if (expoTokens.length === 0) return;

  // Expo tokens → Expo push service
  const payloads = expoTokens.map(to => ({
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
    console.log(`[mobile-push] Expo push sent to ${expoTokens.length} device(s), FCM to ${fcmTokens.length}`);
  }
}

const PROACTIVE_HISTORY_KEY = 'proactive:history';
const PROACTIVE_HISTORY_TTL = 86400; // 24h

export async function getRecentProactives(): Promise<Array<{ text: string; type: ProactiveType; timestamp: string }>> {
  try {
    const items = await redis.lrange(PROACTIVE_HISTORY_KEY, 0, 29);
    return items.map(i => JSON.parse(i) as { text: string; type: ProactiveType; timestamp: string }).reverse();
  } catch { return []; }
}

// Broadcast via Socket.IO (app open) + Expo Push (app closed)
// chatText: full message for the chat UI (if omitted, falls back to text)
export function emitProactive(text: string, type: ProactiveType = 'info', chatText?: string): void {
  const timestamp = new Date().toISOString();
  const chatPayload = chatText ?? text;

  // Store in Redis history so late-joining clients can catch up
  const entry = JSON.stringify({ text: chatPayload, type, timestamp });
  redis.lpush(PROACTIVE_HISTORY_KEY, entry)
    .then(() => redis.expire(PROACTIVE_HISTORY_KEY, PROACTIVE_HISTORY_TTL))
    .then(() => redis.ltrim(PROACTIVE_HISTORY_KEY, 0, 29))
    .catch(() => {});

  // Socket.IO — instant if app open; send full chatText for rich display
  if (_io) {
    _io.emit('Dzaryx:proactive', { text: chatPayload, type, timestamp });
  }

  // Expo Push — works even when app is closed (short text only)
  const title = type === 'morning'  ? '☀️ Dzaryx — Bonjour'
              : type === 'alert'    ? '🚨 Dzaryx — Alerte'
              : type === 'reminder' ? '🔔 Dzaryx — Rappel'
              : '📱 Dzaryx';

  sendExpoPush(title, text, { text, type }).catch(err =>
    console.error('[mobile-push] push error:', err instanceof Error ? err.message : String(err)),
  );

  console.log(`[mobile-push] Proactive (${type}): ${text.slice(0, 60)}…`);
}
