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

export function cleanTextForTTS(text: string): string {
  return text
    // Supprimer les emojis
    .replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F000}-\u{1F9FF}]/gu, '')
    // Supprimer le markdown gras/italique
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    // Supprimer les titres markdown
    .replace(/^#{1,6}\s+/gm, '')
    // Supprimer les liens markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Supprimer les bullets markdown
    .replace(/^[-*•]\s+/gm, '')
    // Supprimer les blocs de code
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Nettoyer les espaces multiples
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── ElevenLabs TTS ────────────────────────────────────────────

const EL_VOICE_SETTINGS = {
  stability:         0.5,
  similarity_boost:  0.8,
  style:             0.2,
  use_speaker_boost: true,
};

export async function synthesizeVoice(text: string): Promise<Buffer | null> {
  try {
    const response = await axios.post<ArrayBuffer>(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}`,
      { text: cleanTextForTTS(text), model_id: 'eleven_turbo_v2_5', voice_settings: EL_VOICE_SETTINGS },
      {
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        responseType: 'arraybuffer',
        timeout:      12_000,
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
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}/stream`,
      {
        text: cleanTextForTTS(text),
        model_id: 'eleven_turbo_v2_5',
        voice_settings: EL_VOICE_SETTINGS,
        output_format: 'mp3_44100_128',
      },
      {
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        responseType: 'stream',
        timeout:      20_000,
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
