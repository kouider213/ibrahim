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

  // Ordre STT : OpenAI gpt-4o-transcribe (meilleur sur darija/accents) → Groq Whisper → Google.
  // 'provider' force un moteur si fourni.
  const chain: Array<{ key: string; fn: () => Promise<string> }> = [];
  if (provider === 'google' && env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    chain.push({ key: 'google', fn: () => transcribeWithGoogle(audio, mimeType) });
  } else {
    if (env.OPENAI_API_KEY)              chain.push({ key: 'openai-4o', fn: () => transcribeWithOpenAI(audio, mimeType) });
    if (env.GROQ_API_KEY)               chain.push({ key: 'groq',      fn: () => transcribeWithGroq(audio, mimeType) });
    if (env.GOOGLE_SERVICE_ACCOUNT_JSON) chain.push({ key: 'google',    fn: () => transcribeWithGoogle(audio, mimeType) });
  }

  let lastErr = 'no STT provider configured';
  for (const stt of chain) {
    try {
      const text = cleanTranscript(await stt.fn());
      res.json({ text, provider: stt.key });
      return;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.error(`[transcribe] ${stt.key} failed:`, lastErr, '→ next');
    }
  }
  res.status(500).json({ error: lastErr });
});

// ── OpenAI gpt-4o-transcribe (meilleur STT, gère darija/accents/mix FR-arabe) ──
async function transcribeWithOpenAI(audio: string, mimeType: string): Promise<string> {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  const buf = Buffer.from(audio, 'base64');
  const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
    : mimeType.includes('webm') ? 'webm'
    : mimeType.includes('wav') ? 'wav'
    : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
    : 'm4a';
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mimeType }), `audio.${ext}`);
  form.append('model', 'gpt-4o-transcribe');
  // Pas de verrou de langue (FR + darija algérienne mélangés). Prompt = biais léger sur le contexte/dialecte.
  form.append('prompt', 'Conversation à Oran en darija algérienne mélangée avec du français. Mots fréquents: wesh, rak, raki, kayen, makanch, bzaf, mli7, chhal, kifach, 3andi, drahem, tomobil, location voiture, réservation, dispo.');
  form.append('response_format', 'json');
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`OpenAI transcribe: HTTP ${resp.status} — ${(await resp.text()).slice(0, 200)}`);
  const { text } = await resp.json() as { text: string };
  return text;
}

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
