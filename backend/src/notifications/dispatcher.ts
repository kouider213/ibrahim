import axios from 'axios';
import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import type { Namespace } from 'socket.io';
import { SOCKET_EVENTS } from '../config/constants.js';

let _io: Namespace | null = null;

export function initDispatcher(io: Namespace): void {
  _io = io;
}

// ── Nettoyage texte pour TTS ─────────────────────────────────

// Noms de voitures → phonétique française pour ElevenLabs
const CAR_PHONETICS: Array<[RegExp, string]> = [
  [/\bJumpy\b/gi,    'Djompi'],
  [/\bDuster\b/gi,   'Douster'],
  [/\bCreta\b/gi,    'Kréta'],
  [/\bTiguan\b/gi,   'Tigouane'],
  [/\bTucson\b/gi,   'Touksone'],
  [/\bSorento\b/gi,  'Sorento'],
  [/\bOutlander\b/gi,'Outlandeur'],
  [/\bTransporter\b/gi,'Transporteur'],
];

export function cleanTextForTTS(text: string): string {
  let t = text;

  // 1a. Supprimer toutes les URLs (visuelles uniquement — jamais lues à voix haute)
  t = t.replace(/^📹\s+https?:\/\/\S+\s*$/gm, '');
  t = t.replace(/https?:\/\/[^\s\])"']+/g, '');

  // 1b. Supprimer les numéros de téléphone (inutiles à l'oral)
  t = t.replace(/(?:\+?\d[\d\s\-().]{7,}\d)/g, 'numéro disponible sur l\'appli');

  // 2. Supprimer les séparateurs --- / *** / ___
  t = t.replace(/^[-*_]{2,}\s*$/gm, '');

  // 3. Markdown gras/italique → texte brut
  t = t.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1');
  t = t.replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1');

  // 4. Titres markdown
  t = t.replace(/^#{1,6}\s+/gm, '');

  // 5. Liens markdown
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 6. Numéros de liste "1." / "2." en début de ligne → naturel
  t = t.replace(/^\s*\d+\.\s+/gm, '');

  // 7. Bullets - / * / • en début de ligne
  t = t.replace(/^[\s]*[-*•]\s+/gm, '');

  // 8. Flèche → → "au" ou "jusqu'au"
  t = t.replace(/\s*→\s*/g, ' au ');
  t = t.replace(/\s*->\s*/g, ' au ');

  // 9. Blocs de code
  t = t.replace(/```[\s\S]*?```/g, '');
  t = t.replace(/`([^`]+)`/g, '$1');

  // 10. Emojis
  t = t.replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F000}-\u{1F9FF}]/gu, '');

  // 11. Phonétique française pour noms de voitures
  for (const [re, phonetic] of CAR_PHONETICS) {
    t = t.replace(re, phonetic);
  }

  // 12. Lignes vides multiples → une seule
  t = t.replace(/\n{3,}/g, '\n\n');

  // 13. Espaces multiples
  t = t.replace(/[ \t]{2,}/g, ' ');

  return t.trim();
}

// ── ElevenLabs TTS ────────────────────────────────────────────

const EL_VOICE_SETTINGS = {
  stability:         0.5,
  similarity_boost:  0.8,
  style:             0.2,
  use_speaker_boost: true,
};

// Always use multilingual_v2 — turbo_v2_5 produces Spanish-like phonetics with French voices
const ARABIC_SCRIPT_RE = /[؀-ۿ]/;
function pickTTSModel(text: string): { model_id: string; language_code: string } {
  return ARABIC_SCRIPT_RE.test(text)
    ? { model_id: 'eleven_multilingual_v2', language_code: 'ar' }
    : { model_id: 'eleven_multilingual_v2', language_code: 'fr' };
}

export async function synthesizeVoice(text: string): Promise<Buffer | null> {
  const { model_id, language_code } = pickTTSModel(text);
  try {
    const response = await axios.post<ArrayBuffer>(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}`,
      { text: cleanTextForTTS(text), model_id, language_code, voice_settings: EL_VOICE_SETTINGS },
      {
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        responseType: 'arraybuffer',
        timeout:      15_000,
      },
    );
    return Buffer.from(response.data);
  } catch (err) {
    console.error('[elevenlabs] TTS failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// Streaming TTS — calls onChunk for each audio buffer chunk
export async function synthesizeVoiceStream(
  text: string,
  onChunk: (chunk: Buffer) => void,
): Promise<boolean> {
  const { model_id, language_code } = pickTTSModel(text);
  try {
    const response = await axios.post(
      // optimize_streaming_latency=3 → premier chunk audio plus rapide (moins d'attente perçue)
      `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}/stream?optimize_streaming_latency=3`,
      {
        text: cleanTextForTTS(text),
        model_id,
        language_code,
        voice_settings: EL_VOICE_SETTINGS,
        output_format: 'mp3_44100_128',
      },
      {
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        responseType: 'stream',
        timeout:      25_000,
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = response.data as any;
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => onChunk(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    return true;
  } catch (err) {
    console.error('[elevenlabs] streaming TTS failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function synthesizeAndSend(text: string, sessionId: string): Promise<void> {
  const audioBuffer = await synthesizeVoice(text);

  if (audioBuffer) {
    const base64 = audioBuffer.toString('base64');
    _io?.emit(SOCKET_EVENTS.AUDIO, { sessionId, audio: base64, mimeType: 'audio/mpeg' });

    await supabase.from('conversations').insert({
      session_id: sessionId,
      role:       'assistant',
      content:    text,
      metadata:   { has_audio: true },
    });
  } else {
    // Fallback: send text only, client uses iOS TTS
    _io?.emit(SOCKET_EVENTS.RESPONSE, { sessionId, text, fallback: true });
  }
}

// ── General dispatcher ────────────────────────────────────────

export async function dispatch(
  channel: 'pushover' | 'socket' | 'email',
  title:   string,
  message: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    type:    payload['type'] ?? 'general',
    channel,
    title,
    message,
    payload,
    status: 'pending',
  });

  if (error) console.error('[dispatcher] Failed to insert notification:', error.message);

  if (channel === 'socket') {
    _io?.emit(SOCKET_EVENTS.RESPONSE, { title, message, ...payload });
  }
}
