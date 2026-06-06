import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { env } from '../../config/env.js';

const router = Router();

// POST /api/transcribe — base64 audio → text
// provider: 'groq' (default) | 'google' (requires GOOGLE_SERVICE_ACCOUNT_JSON)
router.post('/', requireMobileAuth, async (req, res) => {
  const { audio, mimeType = 'audio/m4a', provider } = req.body as {
    audio?: string; mimeType?: string; provider?: string;
  };

  if (!audio?.trim()) {
    res.status(400).json({ error: 'audio (base64) required' });
    return;
  }

  // Prefer Google STT if explicitly requested or if no Groq key
  const useGoogle = (provider === 'google' || !env.GROQ_API_KEY) && !!env.GOOGLE_SERVICE_ACCOUNT_JSON;

  try {
    const raw = useGoogle
      ? await transcribeWithGoogle(audio, mimeType)
      : await transcribeWithGroq(audio, mimeType);
    // Filtre anti-hallucination Whisper (sur silence/bruit il invente "Merci", "Sous-titres…")
    const text = cleanTranscript(raw);
    res.json({ text, provider: useGoogle ? 'google' : 'groq' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[transcribe]', msg);
    // Fallback: if Google failed, try Groq
    if (useGoogle && env.GROQ_API_KEY) {
      try {
        const fallback = await transcribeWithGroq(audio, mimeType);
        res.json({ text: fallback.trim(), provider: 'groq_fallback' });
        return;
      } catch { /* ignore fallback error */ }
    }
    res.status(500).json({ error: msg });
  }
});

// Phrases d'hallucination Whisper quand l'audio = silence/bruit (texte ENTIER = junk → on jette).
const FULL_JUNK = [
  /^\s*merci\s*\.?\s*$/i,
  /^\s*merci beaucoup\s*\.?\s*$/i,
  /^\s*(you|thank you|thanks|bye)\s*\.?\s*$/i,
  /^\s*sous-titres?.*$/i,
  /^\s*\W+\s*$/,            // ponctuation/symboles seuls (♪ ... !!!)
  /^\s*(au revoir|à bientôt)\s*\.?\s*$/i,
];
// Si l'audio contient ces fragments parasites → junk (peu importe le reste).
const CONTAINS_JUNK = [
  /amara\.org/i,
  /radio[- ]canada/i,
  /merci d'avoir regard/i,
  /abonnez[- ]vous/i,
  /sous-titrage/i,
];
function cleanTranscript(t: string): string {
  const s = (t ?? '').trim();
  if (s.length < 2) return '';
  if (FULL_JUNK.some(re => re.test(s)))     return '';
  if (CONTAINS_JUNK.some(re => re.test(s))) return '';
  return s;
}

async function transcribeWithGroq(audio: string, mimeType: string): Promise<string> {
  const groqKey = env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not configured');

  const buf = Buffer.from(audio, 'base64');
  const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
    : mimeType.includes('webm') ? 'webm'
    : mimeType.includes('wav') ? 'wav'
    : 'm4a';

  const form = new FormData();
  form.append('file', new Blob([buf], { type: mimeType }), `audio.${ext}`);
  form.append('model', 'whisper-large-v3-turbo');
  // Pas de verrou de langue (français + darija oranaise mélangés).
  // Prompt COURT = contexte léger sans forcer des mots (un long lexique biaise Whisper → "comprend de travers").
  form.append('prompt', "Conversation à Oran : français et arabe algérien (darija). Location de voitures.");
  form.append('response_format', 'json');

  const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq transcription failed: ${err}`);
  }

  const { text } = await resp.json() as { text: string };
  return text;
}

async function transcribeWithGoogle(audio: string, mimeType: string): Promise<string> {
  const saJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');

  const { SpeechClient } = await import('@google-cloud/speech');

  const credentials = JSON.parse(saJson) as object;
  const client = new SpeechClient({ credentials });

  const encoding = mimeType.includes('webm') ? 'WEBM_OPUS'
    : mimeType.includes('wav') ? 'LINEAR16'
    : 'MP3';

  const [response] = await client.recognize({
    audio: { content: audio },
    config: {
      encoding:        encoding as 'WEBM_OPUS' | 'LINEAR16' | 'MP3',
      sampleRateHertz: mimeType.includes('wav') ? 16000 : undefined,
      languageCode:    'fr-FR',
      alternativeLanguageCodes: ['ar-DZ'],
      model:           'default',
    },
  });

  const transcript = response.results
    ?.map(r => r.alternatives?.[0]?.transcript ?? '')
    .join(' ')
    .trim();

  if (!transcript) throw new Error('Google STT returned empty transcript');
  return transcript;
}

export default router;
