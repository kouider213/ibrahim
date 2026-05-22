import { Router } from 'express';
import { z } from 'zod';
import { processWithOrchestration } from '../../orchestrator/orchestrator-engine.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { getConversationHistory } from '../../integrations/supabase.js';
import { redis } from '../../queue/queue.js';
import { isValidTimezone } from '../../utils/timezone.js';
import { DEFAULT_MEMBER, type OrgMember } from '../../orchestrator/org-resolver.js';
import { env } from '../../config/env.js';

const router = Router();

const messageSchema = z.object({
  message:      z.string().min(1).max(4000),
  sessionId:    z.string().min(1).max(128),
  textOnly:     z.boolean().optional().default(false),
  imageBase64:  z.string().optional(),
  imageMime:    z.string().optional().default('image/jpeg'),
});

// POST /api/chat — send a message to Dzaryx
router.post('/', requireMobileAuth, async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }

  const { message, sessionId, textOnly, imageBase64, imageMime } = parsed.data;

  const _channel = sessionId.startsWith('voice_') ? 'mobile_voice' : 'mobile_text';
  console.log(`[MOBILE_RUNTIME] channel=${_channel} endpoint=/api/chat session=${sessionId.slice(0, 30)} len=${message.length} has_image=${!!imageBase64} base64_length=${imageBase64?.length ?? 0} router_used=true legacy=false`);
  if (imageBase64) {
    if (imageBase64.length < 1000) {
      res.status(400).json({ error: 'Image caméra non reçue.' });
      return;
    }
    console.log(`[VISION_RUNTIME] source=mobile_scanner has_image=true base64_length=${imageBase64.length} mime=${imageMime}`);
  }

  // Persist timezone from X-Timezone header — used by schedule_reminder priority chain
  const headerTz = req.headers['x-timezone'] as string | undefined;
  if (headerTz && isValidTimezone(headerTz)) {
    redis.set(`user:tz:${sessionId}`, headerTz, 'EX', 7 * 86_400).catch(() => {});
    redis.set('user:tz', headerTz, 'EX', 7 * 86_400).catch(() => {}); // global fallback
  }

  // Cache actor display name for tool-executor (create_booking rented_by default)
  const mobileActorForCache = req.mobileActor;
  if (mobileActorForCache) {
    redis.set(`session:actor:${sessionId}`, mobileActorForCache.displayName, 'EX', 86_400).catch(() => {});
  }

  // Acknowledge immediately — result delivered via Socket.IO (Dzaryx:text_complete + audio chunks)
  res.status(202).json({ status: 'processing', sessionId });

  // Resolve mobile actor from auth middleware
  const mobileAct = req.mobileActor;
  let actor: OrgMember = mobileAct ? {
    orgId:       '',
    ownerKey:    mobileAct.ownerKey,
    role:        mobileAct.role,
    displayName: mobileAct.displayName,
  } : DEFAULT_MEMBER;

  // When both users share a single MOBILE_ACCESS_TOKEN, derive real actor from sessionId prefix.
  // Sessions voice_houari / mobile_houari are created by the simulator after Houari logs in.
  if (actor.ownerKey !== 'houari' && /^(voice|mobile)_houari($|_)/i.test(sessionId)) {
    actor = { orgId: '', ownerKey: 'houari', role: 'admin', displayName: env.PARTNER_NAME };
  }

  processWithOrchestration(message, sessionId, textOnly, imageBase64, imageMime, actor).catch(err => {
    console.error('[chat] processWithOrchestration error:', err instanceof Error ? err.message : String(err));
  });
});

// GET /api/chat/:sessionId/history
router.get('/:sessionId/history', requireMobileAuth, async (req, res) => {
  const sessionId = req.params['sessionId'] as string;
  const limit = Number(req.query['limit'] ?? 30);

  try {
    const history = await getConversationHistory(sessionId, Math.min(limit, 100));
    res.json({ history });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error });
  }
});

export default router;
