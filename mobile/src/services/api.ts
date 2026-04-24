import { io, Socket } from 'socket.io-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env ?? {};
const BACKEND_URL  = (_env['VITE_BACKEND_URL']  as string | undefined) ?? 'http://localhost:3000';
const WS_URL       = (_env['VITE_WS_URL']        as string | undefined) ?? 'ws://localhost:3000';
const ACCESS_TOKEN = (_env['VITE_ACCESS_TOKEN']  as string | undefined) ?? '';

// ── REST helpers ──────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface ChatResponse {
  text:          string;
  audio?:        string;
  action?:       string;
  taskId?:       string;
  validationId?: string;
  status:        'done' | 'queued' | 'validation_pending' | 'error';
}

export const api = {
  chat: (message: string, sessionId: string, textOnly = false) =>
    apiFetch<ChatResponse>('/api/chat', {
      method: 'POST',
      body:   JSON.stringify({ message, sessionId, textOnly }),
    }),

  tts: (text: string) =>
    apiFetch<{ audio: string; mimeType: string }>('/api/tts', {
      method: 'POST',
      body:   JSON.stringify({ text: text.slice(0, 500) }),
    }).then(r => r.audio).catch(() => null),

  getTasks: (status?: string) =>
    apiFetch<{ tasks: unknown[] }>(`/api/tasks${status ? `?status=${status}` : ''}`),

  getValidations: () =>
    apiFetch<{ validations: unknown[] }>('/api/validations'),

  decide: (id: string, decision: 'approved' | 'rejected', note?: string) =>
    apiFetch(`/api/validations/${id}/decide`, {
      method: 'POST',
      body:   JSON.stringify({ decision, note }),
    }),
};

// ── Socket.IO ─────────────────────────────────────────────────

export type IbrahimStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface SocketCallbacks {
  onStatus:       (status: IbrahimStatus) => void;
  onAudio:        (base64: string) => void;
  onAudioChunk:   (base64: string) => void;
  onTextChunk:    (chunk: string) => void;
  onTextComplete: (text: string) => void;
  onResponse:     (text: string, fallback: boolean) => void;
  onValidation:   (validation: unknown) => void;
  onTaskUpdate:   (task: unknown) => void;
}

let _socket: Socket | null = null;

export function connectSocket(sessionId: string, callbacks: SocketCallbacks): Socket {
  if (_socket?.connected) return _socket;

  _socket = io(`${WS_URL}/mobile`, {
    auth:       { token: ACCESS_TOKEN },
    transports: ['websocket'],
  });

  _socket.on('connect', () => console.log('[socket] Connected'));
  _socket.on('disconnect', () => console.log('[socket] Disconnected'));

  _socket.on('ibrahim:status', (data: { status: IbrahimStatus; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onStatus(data.status);
  });

  _socket.on('ibrahim:audio', (data: { audio: string; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onAudio(data.audio);
  });

  _socket.on('ibrahim:audio_chunk', (data: { chunk: string; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onAudioChunk(data.chunk);
  });

  _socket.on('ibrahim:text_chunk', (data: { chunk: string; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onTextChunk(data.chunk);
  });

  _socket.on('ibrahim:text_complete', (data: { text: string; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onTextComplete(data.text);
  });

  _socket.on('ibrahim:response', (data: { text: string; fallback?: boolean; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onResponse(data.text, data.fallback ?? false);
  });

  _socket.on('ibrahim:validation_request', (v: unknown) => {
    callbacks.onValidation(v);
  });

  _socket.on('ibrahim:task_update', (t: unknown) => {
    callbacks.onTaskUpdate(t);
  });

  return _socket;
}

export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}

// ── Audio helpers ─────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;
let _audioQueue: ArrayBuffer[] = [];
let _audioPlaying = false;
let _pendingChunks: Uint8Array[] = [];
let _currentSource: AudioBufferSourceNode | null = null;

// Call this during a user gesture (button tap) to unlock iOS AudioContext
export function unlockAudio(): void {
  if (!_audioCtx) {
    try { _audioCtx = new AudioContext(); } catch { return; }
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
}

async function getAudioCtx(): Promise<AudioContext> {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
  }
  if (_audioCtx.state === 'suspended') await _audioCtx.resume();
  return _audioCtx;
}

async function drainAudioQueue(): Promise<void> {
  if (_audioPlaying || _audioQueue.length === 0) return;
  _audioPlaying = true;
  try {
    const ctx = await getAudioCtx();
    while (_audioQueue.length > 0) {
      const buf = _audioQueue.shift()!;
      try {
        const decoded = await ctx.decodeAudioData(buf);
        const source = ctx.createBufferSource();
        source.buffer = decoded;
        source.connect(ctx.destination);
        _currentSource = source;
        await new Promise<void>(resolve => {
          source.onended = () => { _currentSource = null; resolve(); };
          source.start();
        });
      } catch { /* skip bad chunk */ }
    }
  } finally {
    _audioPlaying = false;
    // Signal component that audio finished — component uses this instead of timer guessing
    window.dispatchEvent(new CustomEvent('ibrahim:audioEnded'));
  }
}

export async function playBase64Audio(base64: string): Promise<void> {
  try {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    _audioQueue.push(bytes.buffer);
    void drainAudioQueue();
  } catch (err) {
    console.error('[audio] Playback failed:', err);
  }
}

// Accumulate streaming MP3 chunks — do NOT decode individually (incomplete frames)
export function enqueueAudioChunk(base64: string): void {
  try {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    _pendingChunks.push(bytes);
  } catch (err) {
    console.error('[audio] Chunk enqueue failed:', err);
  }
}

// Call once streaming is complete — concatenates all chunks and decodes the full MP3
export async function flushAudioChunks(): Promise<void> {
  if (!_pendingChunks.length) return;
  const totalLen = _pendingChunks.reduce((s, c) => s + c.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of _pendingChunks) { combined.set(chunk, offset); offset += chunk.length; }
  _pendingChunks = [];
  _audioQueue.push(combined.buffer);
  void drainAudioQueue();
}

export function clearAudioQueue(): void {
  _audioQueue = [];
  _pendingChunks = [];
}

export function isAudioPlaying(): boolean {
  return _audioPlaying;
}

// Stop playback immediately (barge-in)
export function stopAudio(): void {
  _audioQueue = [];
  _pendingChunks = [];
  _audioPlaying = false;
  try { _currentSource?.stop(); } catch { /* already stopped */ }
  _currentSource = null;
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F000}-\u{1F9FF}]/gu, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function iosFallbackSpeak(text: string, onComplete?: () => void): void {
  window.speechSynthesis.cancel();
  const cleaned = cleanForSpeech(text);
  // iOS Safari truncates utterances >~220 chars — split into sentence chunks and chain
  const chunks = cleaned.match(/[^.!?…:;]+[.!?…:;]*/g)?.filter(s => s.trim().length > 0) ?? [cleaned];
  let i = 0;
  function speakNext() {
    if (i >= chunks.length) { onComplete?.(); return; }
    const utt = new SpeechSynthesisUtterance(chunks[i++]!.trim());
    utt.lang  = 'fr-FR';
    utt.rate  = 1.0;
    utt.pitch = 1.0;
    utt.onend = speakNext;
    utt.onerror = () => { onComplete?.(); };
    window.speechSynthesis.speak(utt);
  }
  speakNext();
}

// ── Session ───────────────────────────────────────────────────

export function getOrCreateSessionId(): string {
  try {
    let id = sessionStorage.getItem('ibrahim_session');
    if (!id) {
      id = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('ibrahim_session', id);
    }
    return id;
  } catch {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}
