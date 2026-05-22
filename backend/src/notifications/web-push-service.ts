import webpush from 'web-push';
import { env } from '../config/env.js';
import { redis } from '../queue/queue.js';

const WEB_SUB_PREFIX = 'mobile:web_push_sub:';
const WEB_SUB_TTL    = 90 * 24 * 60 * 60; // 90 days

let _configured = false;

function configure() {
  if (_configured) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(
    env.VAPID_EMAIL ?? 'mailto:kouiderpablo@gmail.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  _configured = true;
}

export function isWebPushConfigured(): boolean {
  return !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;
}

export function getVapidPublicKey(): string {
  return env.VAPID_PUBLIC_KEY ?? '';
}

export async function storeWebSub(sub: webpush.PushSubscription, actorId = 'kouider'): Promise<void> {
  await redis.set(`${WEB_SUB_PREFIX}${actorId}`, JSON.stringify(sub), 'EX', WEB_SUB_TTL);
  console.log(`[web-push] Subscription stored for ${actorId}: ${sub.endpoint.slice(0, 60)}…`);
}

export async function getWebSub(actorId: string): Promise<webpush.PushSubscription | null> {
  const raw = await redis.get(`${WEB_SUB_PREFIX}${actorId}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as webpush.PushSubscription; } catch { return null; }
}

export async function getAllWebSubs(): Promise<webpush.PushSubscription[]> {
  const [k, h] = await Promise.all([
    redis.get(`${WEB_SUB_PREFIX}kouider`),
    redis.get(`${WEB_SUB_PREFIX}houari`),
  ]);
  const subs: webpush.PushSubscription[] = [];
  for (const raw of [k, h]) {
    if (!raw) continue;
    try { subs.push(JSON.parse(raw) as webpush.PushSubscription); } catch { /* skip */ }
  }
  return subs;
}

export async function sendWebPush(
  sub: webpush.PushSubscription,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  configure();
  if (!_configured) return;
  try {
    await webpush.sendNotification(sub, JSON.stringify({ title, body, data }));
  } catch (err: unknown) {
    // 410 Gone = subscription expired/unregistered → clean up
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) {
      const actors = ['kouider', 'houari'];
      for (const actor of actors) {
        const stored = await getWebSub(actor);
        if (stored?.endpoint === sub.endpoint) {
          await redis.del(`${WEB_SUB_PREFIX}${actor}`);
          console.log(`[web-push] Removed expired sub for ${actor}`);
        }
      }
    } else {
      console.error('[web-push] send error:', err instanceof Error ? err.message : String(err));
    }
  }
}

export async function broadcastWebPush(title: string, body: string, data?: Record<string, string>): Promise<void> {
  if (!isWebPushConfigured()) return;
  const subs = await getAllWebSubs();
  await Promise.all(subs.map(sub => sendWebPush(sub, title, body, data)));
}
