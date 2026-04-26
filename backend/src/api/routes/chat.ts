import { Router } from 'express';
import { z } from 'zod';
import { processMessage } from '../../conversation/orchestrator.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { getConversationHistory } from '../../integrations/supabase.js';

const router = Router();

const messageSchema = z.object({
  message:      z.string().min(1).max(4000),
  sessionId:    z.string().min(1).max(128),
  textOnly:     z.boolean().optional().default(false),
  imageBase64:  z.string().optional(),
  imageMime:    z.string().optional().default('image/jpeg'),
});

// POST /api/chat — send a message to Ibrahim
router.post('/', requireMobileAuth, async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }

  const { message, sessionId, textOnly, imageBase64, imageMime } = parsed.data;

  // Acknowledge immediately — result delivered via Socket.IO (ibrahim:text_complete + audio chunks)
  res.status(202).json({ status: 'processing', sessionId });

  processMessage(message, sessionId, textOnly, imageBase64, imageMime).catch(err => {
    console.error('[chat] processMessage error:', err instanceof Error ? err.message : String(err));
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
