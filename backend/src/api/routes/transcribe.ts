import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { env } from '../../config/env.js';
import { isOut, noteFailure } from '../../integrations/credit-guard.js';

const router = Router();

/** Transcription réutilisable (Souffleur, réunions, vocaux WhatsApp) : Groq → OpenAI → Gemini, langue libre par défaut. */
export async function transcribeAudio(audio: string, mimeType: string, language?: string, neutral = false): Promise<{ text: string; provider: string }> {
  // neutral : quelqu'un d'autre que Kouider parle (souffleur, vocal client) → pas de consigne « surtout du français »,
  // sinon Whisper TRADUIT l'arabe en français au lieu de le transcrire (« dinar » devenait « $ »)
  const chain: Array<{ key: string; fn: () => Promise<string> }> = [];
  if (env.GROQ_API_KEY)   chain.push({ key: 'groq',      fn: () => transcribeWithGroq(audio, mimeType, language, neutral) });
  if (env.OPENAI_API_KEY) chain.push({ key: 'openai-4o', fn: () => transcribeWithOpenAI(audio, mimeType) });
  if (env.GEMINI_API_KEY) chain.push({ key: 'gemini',    fn: () => transcribeWithGemini(audio, mimeType) });
  let lastErr = 'no STT provider configured';
  for (const stt of chain) {
    if (isOut(stt.key)) continue;
    try { return { text: cleanTranscript(await stt.fn()), provider: stt.key }; } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      noteFailure(stt.key, err);
    }
  }
  throw new Error(lastErr);
}

// POST /api/transcribe — base64 audio → text
// provider: 'fast' (Groq d'abord, pour les appels) | 'google' (requires GOOGLE_SERVICE_ACCOUNT_JSON)
router.post('/', requireMobileAuth, async (req, res) => {
  const { audio, mimeType = 'audio/m4a', provider } = req.body as {
    audio?: string; mimeType?: string; provider?: string;
  };

  if (!audio?.trim()) {
    res.status(400).json({ error: 'audio (base64) required' });
    return;
  }

  // Ordre STT : Groq Whisper (gratuit, ~0,3 s) → OpenAI gpt-4o-transcribe (payant) → Google → Gemini (gratuit, dernier secours).
  // Un fournisseur sans crédit est sauté 30 min (credit-guard). 'provider' force un moteur si fourni.
  const chain: Array<{ key: string; fn: () => Promise<string> }> = [];
  if (provider === 'google' && env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    chain.push({ key: 'google', fn: () => transcribeWithGoogle(audio, mimeType) });
  } else {
    // Vrais appels ('fast') : français imposé — chaque seconde compte, la darija n'est plus utilisée.
    if (env.GROQ_API_KEY)                chain.push({ key: 'groq',      fn: () => transcribeWithGroq(audio, mimeType, provider === 'fast' ? 'fr' : undefined) });
    if (env.OPENAI_API_KEY)              chain.push({ key: 'openai-4o', fn: () => transcribeWithOpenAI(audio, mimeType) });
    if (env.GOOGLE_SERVICE_ACCOUNT_JSON && provider !== 'fast') chain.push({ key: 'google', fn: () => transcribeWithGoogle(audio, mimeType) });
  }
  if (env.GEMINI_API_KEY)                chain.push({ key: 'gemini',    fn: () => transcribeWithGemini(audio, mimeType) });

  let lastErr = 'no STT provider configured';
  for (const stt of chain) {
    if (isOut(stt.key)) continue;
    try {
      const text = cleanTranscript(await stt.fn());
      res.json({ text, provider: stt.key });
      return;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      noteFailure(stt.key, err);
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
    : mimeType.includes('ogg') || mimeType.includes('opus') ? 'ogg'
    : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
    : 'm4a';
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mimeType }), `audio.${ext}`);
  form.append('model', 'gpt-4o-transcribe');
  // Pas de verrou de langue (FR + darija possibles). Prompt COURT et NEUTRE : l'ancien lexique darija
  // (wesh, rak, kayen…) faisait inventer de la darija sur du français ("Il y a du nouveau" → "wesh rak?")
  // et était parfois recopié tel quel comme transcription.
  form.append('prompt', 'Kouider parle surtout en français, parfois en arabe algérien. Transcris exactement ce qui est dit.');
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
  // Écho du prompt STT (le modèle recopie ses consignes sur du silence)
  /conversation à oran/i,
  /mots fréquents/i,
  /transcris exactement/i,
  /parle surtout en français/i,
  /^\s*context\s*:/i,
];
function cleanTranscript(t: string): string {
  const s = (t ?? '').trim();
  if (s.length < 2) return '';
  if (FULL_JUNK.some(re => re.test(s)))     return '';
  if (CONTAINS_JUNK.some(re => re.test(s))) return '';
  return s;
}

async function transcribeWithGroq(audio: string, mimeType: string, language?: string, neutral = false): Promise<string> {
  const groqKey = env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not configured');

  const buf = Buffer.from(audio, 'base64');
  const ext = mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
    : mimeType.includes('webm') ? 'webm'
    : mimeType.includes('wav') ? 'wav'
    : mimeType.includes('ogg') || mimeType.includes('opus') ? 'ogg'
    : 'm4a';

  const form = new FormData();
  form.append('file', new Blob([buf], { type: mimeType }), `audio.${ext}`);
  form.append('model', 'whisper-large-v3-turbo');
  if (language) form.append('language', language);   // appels : français seul → moins d'erreurs
  // Pas de verrou de langue (français + darija oranaise mélangés).
  // Prompt COURT = contexte léger sans forcer des mots (un long lexique biaise Whisper → "comprend de travers").
  // neutral = AUCUNE consigne (testé 27/10) : une consigne française fait TRADUIRE l'arabe (« dinar » → « $ »), une consigne
  // arabe coupe un vocal français qui commence par « salam alaykoum » ; sans consigne, Whisper détecte bien les deux.
  if (!neutral) form.append('prompt', 'Kouider parle surtout en français, parfois en arabe algérien. Transcris exactement ce qui est dit.');
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

// Dernier secours gratuit : Gemini comprend l'audio directement (ogg/wav/mp3/m4a/webm).
async function transcribeWithGemini(audio: string, mimeType: string): Promise<string> {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  const mime = mimeType.includes('m4a') ? 'audio/mp4' : mimeType;
  for (const model of ['gemini-3.5-flash', 'gemini-flash-latest']) {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: mime, data: audio } },
          { text: 'Transcris exactement ce qui est dit dans cet audio (surtout du français). Réponds UNIQUEMENT par la transcription, rien d\'autre. Si on n\'entend rien, réponds vide.' },
        ] }],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!resp.ok) { if (resp.status === 404) continue; throw new Error(`Gemini STT: HTTP ${resp.status} — ${(await resp.text()).slice(0, 200)}`); }
    const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim();
  }
  throw new Error('Gemini STT: aucun modèle disponible');
}

export default router;
