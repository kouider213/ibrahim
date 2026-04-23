import { Router } from 'express';
import { synthesizeVoice } from '../../notifications/dispatcher.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { env } from '../../config/env.js';

const router = Router();

// GET /api/tts/test — test ElevenLabs connectivity
router.get('/test', requireMobileAuth, async (_req, res) => {
  try {
    const audio = await synthesizeVoice('Ibrahim est prêt.');
    if (!audio) {
      res.status(502).json({
        ok: false,
        error: 'ElevenLabs returned null — check ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID',
        voiceId: env.ELEVENLABS_VOICE_ID,
        keySet: !!env.ELEVENLABS_API_KEY,
      });
      return;
    }
    res.json({
      ok:      true,
      bytes:   audio.length,
      voiceId: env.ELEVENLABS_VOICE_ID,
      keySet:  !!env.ELEVENLABS_API_KEY,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/tts — synthesize text → base64 audio
router.post('/', requireMobileAuth, async (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  try {
    const audio = await synthesizeVoice(text.slice(0, 500));
    if (!audio) {
      res.status(502).json({ error: 'ElevenLabs synthesis failed' });
      return;
    }
    res.json({ audio: audio.toString('base64'), bytes: audio.length, mimeType: 'audio/mpeg' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
