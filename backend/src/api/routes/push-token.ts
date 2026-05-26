import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { storePushToken, getPushToken, emitProactive } from '../../notifications/mobile-push.js';
import { isFcmToken } from '../../notifications/fcm.js';
import { storeWebSub, getVapidPublicKey, isWebPushConfigured } from '../../notifications/web-push-service.js';
import type { PushSubscription } from 'web-push';

const router = Router();

// POST /api/push-token/debug — step-by-step registration diagnostics from native app
router.post('/debug', requireMobileAuth, async (req, res) => {
  const { step, detail, platform, ts } = req.body as { step?: string; detail?: string; platform?: string; ts?: number };
  console.log(`[push-debug] ${platform ?? '?'} | ${step ?? '?'} | ${detail ?? ''} | t=${ts ?? 0}`);
  res.json({ ok: true });
});

// POST /api/push-token — Expo push token OR raw FCM token (native APK)
router.post('/', requireMobileAuth, async (req, res) => {
  const { token } = req.body as { token?: string };
  const isExpo = token?.startsWith('ExponentPushToken[');
  const isFcm  = token ? isFcmToken(token) : false;
  if (!token || (!isExpo && !isFcm)) {
    res.status(400).json({ error: 'Invalid push token' });
    return;
  }
  const actorId = req.mobileActor?.ownerKey ?? 'kouider';
  await storePushToken(token, actorId);
  res.json({ ok: true, actorId, type: isExpo ? 'expo' : 'fcm' });
});

// POST /api/push-token/web — Web Push subscription (PWA browser)
router.post('/web', requireMobileAuth, async (req, res) => {
  const sub = req.body as PushSubscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    res.status(400).json({ error: 'Invalid web push subscription' });
    return;
  }
  const actorId = req.mobileActor?.ownerKey ?? 'kouider';
  // Derive actor from sessionId header if provided (single-token deployment)
  const sessionId = req.headers['x-session-id'] as string | undefined;
  const resolvedActor = actorId !== 'houari' && sessionId?.toLowerCase().includes('houari')
    ? 'houari'
    : actorId;
  await storeWebSub(sub, resolvedActor);
  res.json({ ok: true, actorId: resolvedActor });
});

// GET /api/push-token/vapid-public-key — VAPID public key for browser subscription
router.get('/vapid-public-key', (_req, res) => {
  if (!isWebPushConfigured()) {
    res.status(503).json({ error: 'Web push not configured' });
    return;
  }
  res.json({ key: getVapidPublicKey() });
});

// POST /api/push-token/test — send a real push notification to test FCM
router.post('/test', requireMobileAuth, (_req, res) => {
  emitProactive('🔔 Test push FCM — tu reçois ça ?', 'info', undefined, 'kouider');
  res.json({ ok: true });
});

// GET /api/push-token — debug
router.get('/', requireMobileAuth, async (_req, res) => {
  const token = await getPushToken();
  res.json({ token: token ? `${token.slice(0, 30)}…` : null });
});

export default router;
