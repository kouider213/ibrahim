import type { Namespace } from 'socket.io';
import { redis } from '../queue/queue.js';
import { env } from '../config/env.js';
import { sendFcm, isFcmToken } from './fcm.js';
import { getWebSub, getAllWebSubs, sendWebPush } from './web-push-service.js';

let _io: Namespace | null = null;

export function initMobilePush(io: Namespace): void {
  _io = io;
}

export type ProactiveType = 'morning' | 'alert' | 'reminder' | 'info';
export type ProactiveActor = 'kouider' | 'houari' | 'all';

const PUSH_TOKEN_KEY    = 'mobile:expo_push_token';
const PUSH_TOKEN_PREFIX = 'mobile:expo_push_token:';

export async function storePushToken(token: string, actorId = 'kouider'): Promise<void> {
  await Promise.all([
    redis.set(`${PUSH_TOKEN_PREFIX}${actorId}`, token),
    actorId === 'kouider' ? redis.set(PUSH_TOKEN_KEY, token) : Promise.resolve(),
  ]);
  console.log(`[mobile-push] Push token stored for ${actorId}: ${token.slice(0, 30)}…`);
}

export async function getPushToken(actorId = 'kouider'): Promise<string | null> {
  const token = await redis.get(`${PUSH_TOKEN_PREFIX}${actorId}`);
  if (token) return token;
  if (actorId === 'kouider') return redis.get(PUSH_TOKEN_KEY);
  return null;
}

async function getTokensForActor(target: ProactiveActor): Promise<string[]> {
  const actors = target === 'all' ? ['kouider', 'houari'] : [target];
  const results = await Promise.all(actors.map(a => getPushToken(a)));
  const seen = new Set<string>();
  const tokens: string[] = [];
  // Legacy fallback for kouider
  if (target === 'all' || target === 'kouider') {
    const legacy = await redis.get(PUSH_TOKEN_KEY);
    if (legacy) { seen.add(legacy); tokens.push(legacy); }
  }
  for (const t of results) {
    if (t && !seen.has(t)) { seen.add(t); tokens.push(t); }
  }
  return tokens;
}

async function sendExpoPush(
  title: string, body: string,
  data?: Record<string, string>,
  target: ProactiveActor = 'all',
): Promise<void> {
  const tokens = await getTokensForActor(target);
  if (tokens.length === 0) return;

  const expoTokens = tokens.filter(t => !isFcmToken(t));
  const fcmTokens  = tokens.filter(t => isFcmToken(t));

  for (const token of fcmTokens) {
    sendFcm(token, title, body, data).catch(err =>
      console.error('[mobile-push] FCM error:', err instanceof Error ? err.message : String(err)),
    );
  }

  if (expoTokens.length === 0) return;

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
  }
}

async function sendTargetedWebPush(
  title: string, body: string,
  data?: Record<string, string>,
  target: ProactiveActor = 'all',
): Promise<void> {
  const actors = target === 'all' ? ['kouider', 'houari'] : [target];
  const subs = target === 'all'
    ? await getAllWebSubs()
    : (await Promise.all(actors.map(a => getWebSub(a)))).filter(Boolean) as Awaited<ReturnType<typeof getWebSub>>[];

  await Promise.all(
    (subs as NonNullable<Awaited<ReturnType<typeof getWebSub>>>[]).map(sub =>
      sendWebPush(sub, title, body, data),
    ),
  );
}

const PROACTIVE_HISTORY_KEY = 'proactive:history';
const PROACTIVE_HISTORY_TTL = 86400;

export async function getRecentProactives(actor?: string): Promise<Array<{ text: string; type: ProactiveType; timestamp: string; targetActor?: string }>> {
  type Item = { text: string; type: ProactiveType; timestamp: string; targetActor?: string };
  const parse = (i: string) => JSON.parse(i) as Item;
  try {
    if (!actor || actor === 'all') {
      const items = await redis.lrange(PROACTIVE_HISTORY_KEY, 0, 29);
      return items.map(parse).reverse();
    }
    // Merge global ('all') + actor-specific history, deduplicate, sort chronologically
    const [globalItems, actorItems] = await Promise.all([
      redis.lrange(PROACTIVE_HISTORY_KEY, 0, 29),
      redis.lrange(`${PROACTIVE_HISTORY_KEY}:${actor}`, 0, 29),
    ]);
    // For houari: exclude global items explicitly tagged for kouider only
    const houariNoise = /aucun impayé|aucun retard|tous les clients sont à jour|ont rendu leur véhicule à temps|aucune alerte|tout est en ordre|agenda|temps famille|travail belgique|trajet travail|soirée|météo|briefing matinal|conseil du jour|coûts claude|bénéfice|chiffre d'affaires|tiktok|marketing|vidéo prête/i;
    const filteredGlobal = actor === 'houari'
      ? globalItems.filter(i => { try { const m = parse(i); return m.targetActor !== 'kouider' && !houariNoise.test(m.text); } catch { return false; } })
      : globalItems;
    const seen = new Set<string>();
    const merged = [...filteredGlobal, ...actorItems]
      .map(parse)
      .filter(m => { if (seen.has(m.timestamp)) return false; seen.add(m.timestamp); return true; })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-30);
    return merged;
  } catch { return []; }
}

/**
 * Send a proactive message to the app (Socket.IO + push).
 * targetActor: 'kouider' | 'houari' | 'all' (default 'all')
 */
export function emitProactive(
  text: string,
  type: ProactiveType = 'info',
  chatText?: string,
  targetActor: ProactiveActor = 'kouider',
  deepLink?: string,
): void {
  const timestamp   = new Date().toISOString();
  const chatPayload = chatText ?? text;

  // Redis history — scoped per actor so each sees only their own
  const historyKey = targetActor === 'all'
    ? PROACTIVE_HISTORY_KEY
    : `proactive:history:${targetActor}`;
  const entry = JSON.stringify({ text: chatPayload, type, timestamp, targetActor, deepLink });
  redis.lpush(historyKey, entry)
    .then(() => redis.expire(historyKey, PROACTIVE_HISTORY_TTL))
    .then(() => redis.ltrim(historyKey, 0, 29))
    .catch(() => {});

  // Socket.IO — emit only to targeted actor's room (server-side filtering)
  if (_io) {
    const room = targetActor === 'all' ? 'actor:all' : `actor:${targetActor}`;
    _io.to(room).emit('Dzaryx:proactive', { text: chatPayload, type, timestamp, targetActor, deepLink });
  }

  const title = type === 'morning'  ? '☀️ Dzaryx — Bonjour'
              : type === 'alert'    ? '🚨 Dzaryx — Alerte'
              : type === 'reminder' ? '🔔 Dzaryx — Rappel'
              : '📱 Dzaryx';

  sendExpoPush(title, text, { text, type }, targetActor).catch(err =>
    console.error('[mobile-push] push error:', err instanceof Error ? err.message : String(err)),
  );

  sendTargetedWebPush(title, text, { text, type }, targetActor).catch(err =>
    console.error('[mobile-push] web-push error:', err instanceof Error ? err.message : String(err)),
  );

  console.log(`[mobile-push] Proactive (${type}) → ${targetActor}: ${text.slice(0, 60)}…`);
}

/**
 * Proactif émis par l'agent PC Nexus (watchdog, task-runner, vision-loop, relay…).
 * Désactivé par défaut (anti-spam) : Nexus renvoyait les mêmes alertes en boucle.
 * Réactiver avec NEXUS_PROACTIVE_ENABLED=true sur Railway si besoin un jour.
 */
export function emitNexusProactive(
  text: string,
  type: ProactiveType = 'info',
  chatText?: string,
  targetActor: ProactiveActor = 'kouider',
): void {
  if (env.NEXUS_PROACTIVE_ENABLED !== 'true') {
    // Silencieux : on log seulement, aucune notif poussée.
    console.log(`[mobile-push] Nexus proactive SUPPRIMÉ (NEXUS_PROACTIVE_ENABLED!=true): ${text.slice(0, 60)}…`);
    return;
  }
  emitProactive(text, type, chatText, targetActor);
}
