import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { env } from '../../config/env.js';

const router = Router();

// POST /api/transcribe — base64 audio → text (Groq Whisper)
router.post('/', requireMobileAuth, async (req, res) => {
  const { audio, mimeType = 'audio/m4a' } = req.body as { audio?: string; mimeType?: string };

  if (!audio?.trim()) {
    res.status(400).json({ error: 'audio (base64) required' });
    return;
  }

  const groqKey = env.GROQ_API_KEY;
  if (!groqKey) {
    res.status(503).json({ error: 'GROQ_API_KEY not configured' });
    return;
  }

  try {
    const buf = Buffer.from(audio, 'base64');
    const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
      : mimeType.includes('webm') ? 'webm'
      : mimeType.includes('wav') ? 'wav'
      : 'm4a';

    const form = new FormData();
    form.append('file', new Blob([buf], { type: mimeType }), `audio.${ext}`);
    form.append('model', 'whisper-large-v3');
    // Prompt biases Whisper toward fr/ar and prevents hallucinations on silence/noise
    form.append('prompt', 'Conversation en français ou darija algérienne avec Dzaryx, assistant pour Fik Conciergerie Oran, location de voitures.');
    form.append('response_format', 'json');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('[transcribe] Groq error:', err);
      res.status(502).json({ error: 'Groq transcription failed', detail: err });
      return;
    }

    const { text } = await groqRes.json() as { text: string };
    res.json({ text: text.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[transcribe]', msg);
    res.status(500).json({ error: msg });
  }
});

export default router;
