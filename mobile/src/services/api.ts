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
  text?:         string;
  audio?:        string;
  action?:       string;
  taskId?:       string;
  validationId?: string;
  sessionId?:    string;
  status:        'done' | 'queued' | 'validation_pending' | 'error' | 'processing';
}

export const api = {
  chat: (message: string, sessionId: string, textOnly = false, imageBase64?: string, imageMime?: string) =>
    apiFetch<ChatResponse>('/api/chat', {
      method: 'POST',
      body:   JSON.stringify({ message, sessionId, textOnly, imageBase64, imageMime }),
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

  getFinanceDashboard: () =>
    apiFetch<FinanceDashboardData>('/api/finance/dashboard'),

  generateReceipt: (bookingId: string) =>
    apiFetch<{ url: string; message: string }>(`/api/finance/receipts/${bookingId}`, { method: 'POST' }),

  vision: (imageBase64: string, mimeType = 'image/jpeg') =>
    apiFetch<{ description: string }>('/api/vision/analyze', {
      method: 'POST',
      body:   JSON.stringify({ imageBase64, mimeType }),
    }),
};

export interface FinanceDashboardData {
  month: number; year: number;
  ca:       { current: number; previous: number; evolution: number };
  payments: { collected: number; outstanding: number };
  profit:   number;
  forecast: { projected: number; nextMonth: number; dailyAvg: number };
  unpaid:   Array<{ id: string; name: string; car: string; amount: number; phone?: string }>;
  vehicles: Array<{ name: string; ca: number; bookings: number }>;
  bookingCount: number;
}

// ── Socket.IO ─────────────────────────────────────────────────

export type IbrahimStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface SocketCallbacks {
  onStatus:        (status: IbrahimStatus, toolLabel?: string | null) => void;
  onAudio:         (base64: string) => void;
  onAudioChunk:    (base64: string) => void;
  onAudioComplete: () => void;
  onTextChunk:     (chunk: string) => void;
  onTextComplete:  (text: string) => void;
  onResponse:      (text: string, fallback: boolean) => void;
  onValidation:    (validation: unknown) => void;
  onTaskUpdate:    (task: unknown) => void;
}

let _socket: Socket | null = null;

export function connectSocket(sessionId: string, callbacks: SocketCallbacks): Socket {
  if (_socket) return _socket; // reuse existing socket (even if reconnecting)

  _socket = io(`${WS_URL}/mobile`, {
    auth:              { token: ACCESS_TOKEN },
    transports:        ['websocket', 'polling'],
    reconnection:      true,
    reconnectionDelay: 1000,
    timeout:           10000,
  });

  _socket.on('connect', () => console.log('[socket] Connected'));
  _socket.on('disconnect', () => console.log('[socket] Disconnected'));

  _socket.on('Dzaryx:status', (data: { status: IbrahimStatus; sessionId?: string; toolLabel?: string | null }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onStatus(data.status, data.toolLabel);
  });

  _socket.on('Dzaryx:audio', (data: { audio: string; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onAudio(data.audio);
  });

  _socket.on('Dzaryx:audio_chunk', (data: { chunk: string; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onAudioChunk(data.chunk);
  });

  _socket.on('Dzaryx:audio_complete', (data: { sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onAudioComplete();
  });

  _socket.on('Dzaryx:text_chunk', (data: { chunk: string; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onTextChunk(data.chunk);
  });

  _socket.on('Dzaryx:text_complete', (data: { text: string; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onTextComplete(data.text);
  });

  _socket.on('Dzaryx:response', (data: { text: string; fallback?: boolean; sessionId?: string }) => {
    if (!data.sessionId || data.sessionId === sessionId) callbacks.onResponse(data.text, data.fallback ?? false);
  });

  _socket.on('Dzaryx:validation_request', (v: unknown) => {
    callbacks.onValidation(v);
  });

  _socket.on('Dzaryx:task_update', (t: unknown) => {
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

// Call this during a user gesture to permanently unlock iOS AudioContext
export function unlockAudio(): void {
  if (!_audioCtx) {
    try { _audioCtx = new AudioContext(); } catch { return; }
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  // Silent 1-sample buffer — iOS won't re-suspend after playing real audio
  try {
    const buf = _audioCtx.createBuffer(1, 1, 22050);
    const src = _audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_audioCtx.destination);
    src.start(0);
  } catch { /* ignore */ }
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
    window.dispatchEvent(new CustomEvent('Dzaryx:audioEnded'));
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
  // iOS Safari truncates utterances >~220 chars — split by punctuation then enforce hard 180-char limit
  const sentenceChunks = cleaned.match(/[^.!?…:;]+[.!?…:;]*/g)?.filter(s => s.trim().length > 0) ?? [cleaned];
  const chunks: string[] = [];
  for (const sentence of sentenceChunks) {
    const trimmed = sentence.trim();
    if (trimmed.length <= 180) {
      chunks.push(trimmed);
    } else {
      // Break long sentences at word boundaries every 180 chars
      const words = trimmed.split(' ');
      let current = '';
      for (const word of words) {
        if ((current + ' ' + word).trim().length > 180) {
          if (current) chunks.push(current.trim());
          current = word;
        } else {
          current = current ? current + ' ' + word : word;
        }
      }
      if (current) chunks.push(current.trim());
    }
  }
  let i = 0;
  function speakNext() {
    if (i >= chunks.length) { onComplete?.(); return; }
    const utt = new SpeechSynthesisUtterance(chunks[i++]!);
    utt.lang    = 'fr-FR';
    utt.rate    = 1.0;
    utt.pitch   = 1.0;
    utt.onend   = speakNext;
    utt.onerror = speakNext;
    window.speechSynthesis.speak(utt);
  }
  speakNext();
}

// ── Session ───────────────────────────────────────────────────

export function getOrCreateSessionId(): string {
  // Fixed session ID so voice and Telegram share the same memory context
  try {
    localStorage.setItem('Dzaryx_voice_session', 'voice_kouider');
  } catch { /* ignore */ }
  return 'voice_kouider';
}
