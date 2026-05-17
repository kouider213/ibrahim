import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { storePushToken, getPushToken } from '../../notifications/mobile-push.js';

const router = Router();

// POST /api/push-token — store Expo push token
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

// GET /api/push-token — debug: verify stored token
router.get('/', requireMobileAuth, async (_req, res) => {
  const token = await getPushToken();
  res.json({ token: token ? `${token.slice(0, 30)}…` : null });
});

export default router;
