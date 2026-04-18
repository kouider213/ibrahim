import axios from 'axios';
import { env } from '../config/env.js';
import { supabase } from '../integrations/supabase.js';
import type { Server as SocketServer } from 'socket.io';
import { SOCKET_EVENTS } from '../config/constants.js';

let _io: SocketServer | null = null;

export function initDispatcher(io: SocketServer): void {
  _io = io;
}

// ── ElevenLabs TTS ────────────────────────────────────────────

export async function synthesizeVoice(text: string): Promise<Buffer | null> {
  try {
    const response = await axios.post<ArrayBuffer>(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}`,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability:         0.6,
          similarity_boost:  0.8,
          style:             0.3,
          use_speaker_boost: true,
        },
      },
      {
        headers: {
          'xi-api-key':    env.ELEVENLABS_API_KEY,
          'Content-Type':  'application/json',
          'Accept':        'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout:      15_000,
      },
    );
    return Buffer.from(response.data);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[elevenlabs] TTS failed:', error);
    return null;
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
