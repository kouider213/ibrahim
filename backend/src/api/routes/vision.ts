import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';

const router = Router();
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SMART_VISION_PROMPT = `Tu es Dzaryx, assistant IA avec vision. Analyse cette image et donne une réponse concise en français (max 3 phrases) adaptée à ce que tu vois.

RÈGLES SELON CE QUE TU DÉTECTES:

1. PASSEPORT / CARTE D'IDENTITÉ / PERMIS DE CONDUIRE:
   → Extrais immédiatement: nom complet, numéro, date naissance, nationalité, expiration
   → Format: "Passeport de [NOM]. Numéro [X], né le [X], expire le [X]."
   → Si illisible: dis-le clairement

2. VOITURE / VÉHICULE:
   → Identifie le modèle si possible
   → Évalue l'état: dommages visibles, égratignures, bosses
   → Format: "Je vois [MODÈLE]. [État général]."

3. DOCUMENT / CONTRAT / PAPIER TEXTE:
   → Lis et résume le contenu principal
   → Traduis si c'est en arabe ou autre langue

4. TEXTE EN ARABE:
   → Traduis en français immédiatement

5. REÇU / FACTURE / PRIX:
   → Lis les montants et informations clés

6. AUTRE:
   → Décris naturellement et utilement en 1-2 phrases

IMPORTANT: Sois direct, précis, actionnable. Parle comme si tu aidais quelqu'un en temps réel.`;

// POST /api/vision/analyze — original endpoint (kept for compatibility)
router.post('/analyze', async (req, res) => {
  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };

  if (!imageBase64) {
    res.status(400).json({ error: 'imageBase64 required' });
    return;
  }

  const mime = (mimeType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: imageBase64 } },
          { type: 'text',  text: SMART_VISION_PROMPT },
        ],
      }],
    });

    const text = response.content.find(b => b.type === 'text')?.text ?? '';
    res.json({ description: text });
  } catch (err) {
    console.error('[vision] analyze failed:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Vision analysis failed' });
  }
});

// POST /api/vision/scan — real-time SCAN endpoint with document detection
router.post('/scan', async (req, res) => {
  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };

  if (!imageBase64) {
    res.status(400).json({ error: 'imageBase64 required' });
    return;
  }

  const mime = (mimeType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  try {
    // Step 1: detect what's in the image
    const detectResp = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: imageBase64 } },
          { type: 'text',  text: 'What type of content is in this image? Reply with ONLY one word: PASSPORT, LICENSE, CONTRACT, VEHICLE, ARABIC, RECEIPT, SCENE' },
        ],
      }],
    });

    const detectedType = detectResp.content.find(b => b.type === 'text')?.text?.trim().toUpperCase() ?? 'SCENE';

    // Step 2: Smart analysis based on type
    let prompt = SMART_VISION_PROMPT;
    let maxTokens = 300;

    if (['PASSPORT', 'LICENSE'].includes(detectedType)) {
      prompt = `Extrais TOUTES les informations de ce document d'identité en français.
Format JSON STRICT dans ta réponse (entouré de backticks):
\`\`\`json
{"type":"passport","name":"","document_number":"","birth_date":"","expiry_date":"","nationality":"","readable":true}
\`\`\`
Puis une phrase naturelle résumant le document pour être lue à voix haute.`;
      maxTokens = 400;
    } else if (detectedType === 'VEHICLE') {
      prompt = `Analyse ce véhicule. Identifie:
1. Le modèle/marque si visible
2. La couleur
3. L'état général: dommages, bosses, égratignures
Réponds en 2 phrases max, naturellement, comme si tu décrivais à quelqu'un en direct.`;
      maxTokens = 200;
    } else if (detectedType === 'ARABIC') {
      prompt = 'Traduis ce texte arabe en français. Donne la traduction directement, sans introduction.';
      maxTokens = 300;
    } else if (detectedType === 'RECEIPT') {
      prompt = 'Lis ce reçu/facture. Indique le total, la date, et les articles principaux en 2 phrases.';
      maxTokens = 200;
    }

    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: imageBase64 } },
          { type: 'text',  text: prompt },
        ],
      }],
    });

    const rawText = response.content.find(b => b.type === 'text')?.text ?? '';

    // Extract JSON if document
    let extractedData: Record<string, unknown> | null = null;
    let spokenText = rawText;

    if (['PASSPORT', 'LICENSE'].includes(detectedType)) {
      const match = rawText.match(/```json\s*([\s\S]*?)```/);
      if (match) {
        try {
          extractedData = JSON.parse(match[1]!) as Record<string, unknown>;
        } catch { /* ignore */ }
      }
      // Get the spoken part (after the JSON block)
      spokenText = rawText.replace(/```json[\s\S]*?```/g, '').trim();
      if (!spokenText && extractedData) {
        const name = extractedData['name'] as string || '';
        const num  = extractedData['document_number'] as string || '';
        spokenText = `Document de ${name}${num ? `, numéro ${num}` : ''}. Voulez-vous que je l'enregistre ?`;
      }
    }

    res.json({
      description:   spokenText,
      type:          detectedType.toLowerCase(),
      extractedData: extractedData ?? undefined,
    });

  } catch (err) {
    console.error('[vision] scan failed:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Scan failed' });
  }
});

export default router;
