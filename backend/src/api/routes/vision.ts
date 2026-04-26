import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';

const router = Router();
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

router.post('/analyze', async (req, res) => {
  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };

  if (!imageBase64) {
    res.status(400).json({ error: 'imageBase64 required' });
    return;
  }

  const mime = (mimeType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mime, data: imageBase64 },
            },
            {
              type: 'text',
              text: 'Décris ce que tu vois sur cette photo de manière concise et naturelle en français. Si c\'est une personne, décris son apparence. Si c\'est un lieu ou un objet, décris ce que c\'est. Sois direct et utile.',
            },
          ],
        },
      ],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    res.json({ description: text });
  } catch (err) {
    console.error('[vision] analyze failed:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Vision analysis failed' });
  }
});

export default router;
