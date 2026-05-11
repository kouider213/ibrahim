import { Router } from 'express';
import { callGemini, callOpenAIVision, isGeminiAvailable, isOpenAIAvailable } from '../../integrations/llm-router.js';

const router = Router();

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

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function sanitizeMime(m?: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  return (ALLOWED_MIMES.has(m ?? '') ? m : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

// Vision: Gemini Flash Vision primary, OpenAI Vision fallback — never Anthropic direct
async function analyzeImageWithFallback(
  imageBase64: string,
  mime: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
  systemExtra: string,
  userPrompt: string,
  _maxTokens: number,
): Promise<string> {
  if (isGeminiAvailable()) {
    try {
      const text = await callGemini(userPrompt, systemExtra, imageBase64, mime);
      console.log('[AI_ROUTER] task=vision provider=gemini fallback_reason=primary route=vision.ts');
      return text;
    } catch (gErr) {
      const _gAxErr = gErr as { response?: { status?: number; data?: unknown }; message?: string };
      console.warn(`[AI_ROUTER] task=vision provider=gemini FAILED status=${_gAxErr.response?.status ?? 'network'} body=${JSON.stringify(_gAxErr.response?.data ?? {}).slice(0, 150)} — trying openai`);
    }
  }
  if (isOpenAIAvailable()) {
    try {
      const text = await callOpenAIVision(userPrompt, systemExtra, imageBase64, mime);
      console.log('[AI_ROUTER] task=vision provider=openai fallback_reason=gemini_failed route=vision.ts');
      return text;
    } catch (oErr) {
      const _oAxErr = oErr as { response?: { status?: number; data?: unknown }; message?: string };
      console.warn(`[AI_ROUTER] task=vision provider=openai FAILED status=${_oAxErr.response?.status ?? 'network'} body=${JSON.stringify(_oAxErr.response?.data ?? {}).slice(0, 150)}`);
    }
  }
  console.error(`[AI_ROUTER] task=vision ALL_PROVIDERS_FAILED gemini=${isGeminiAvailable()} openai=${isOpenAIAvailable()}`);
  throw new Error('Vision indisponible: Gemini et OpenAI Vision ont échoué.');
}

// POST /api/vision/analyze — original endpoint (kept for compatibility)
router.post('/analyze', async (req, res) => {
  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };

  if (!imageBase64) {
    res.status(400).json({ error: 'imageBase64 required' });
    return;
  }

  const mime = sanitizeMime(mimeType);

  try {
    const text = await analyzeImageWithFallback(imageBase64, mime, SMART_VISION_PROMPT, 'Analyse cette image.', 300);
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

  const mime = sanitizeMime(mimeType);

  try {
    // Step 1: detect what's in the image
    const detectedRaw = await analyzeImageWithFallback(
      imageBase64,
      mime,
      'Réponds avec UN seul mot en majuscules: PASSPORT, LICENSE, CONTRACT, VEHICLE, ARABIC, RECEIPT, or SCENE.',
      'What type of content is in this image?',
      50,
    );
    const detectedType = detectedRaw.trim().toUpperCase().split(/\s/)[0] ?? 'SCENE';

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

    const rawText = await analyzeImageWithFallback(imageBase64, mime, '', prompt, maxTokens);

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

// ── Live relay: forward camera frame from app to NEXUS PC ────────────────────
router.post('/relay-frame', async (req, res) => {
  res.sendStatus(200); // Respond immediately — no blocking
  const { data } = req.body as { data?: string };
  if (!data) return;
  try {
    const { isNexusOnline, sendToNexus } = await import('../../actions/handlers/nexus-relay.js');
    if (isNexusOnline()) {
      sendToNexus('nexus:live_frame', { data });
    }
  } catch (_) {}
});

export default router;
