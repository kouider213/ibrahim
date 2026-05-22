import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { storePushToken, getPushToken } from '../../notifications/mobile-push.js';
import { storeWebSub, getVapidPublicKey, isWebPushConfigured } from '../../notifications/web-push-service.js';
import type { PushSubscription } from 'web-push';

const router = Router();

// POST /api/push-token — Expo push token (native APK)
router.post('/', requireMobileAuth, async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token?.startsWith('ExponentPushToken[')) {
    res.status(400).json({ error: 'Invalid Expo push token' });
    return;
  }
  const actorId = req.mobileActor?.ownerKey ?? 'kouider';
  await storePushToken(token, actorId);
  res.json({ ok: true, actorId });
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

// GET /api/push-token — debug
router.get('/', requireMobileAuth, async (_req, res) => {
  const token = await getPushToken();
  res.json({ token: token ? `${token.slice(0, 30)}…` : null });
});

export default router;
