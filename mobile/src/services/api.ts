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
  chat: (message: string, sessionId: string) =>
    apiFetch<ChatResponse>('/api/chat', {
      method: 'POST',
      body:   JSON.stringify({ message, sessionId }),
    }),

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
  onStatus:     (status: IbrahimStatus) => void;
  onAudio:      (base64: string) => void;
  onResponse:   (text: string, fallback: boolean) => void;
  onValidation: (validation: unknown) => void;
  onTaskUpdate: (task: unknown) => void;
}

let _socket: Socket | null = null;

export function connectSocket(_sessionId: string, callbacks: SocketCallbacks): Socket {
  if (_socket?.connected) return _socket;

  _socket = io(`${WS_URL}/mobile`, {
    auth:       { token: ACCESS_TOKEN },
    transports: ['websocket'],
  });

  _socket.on('connect', () => console.log('[socket] Connected'));
  _socket.on('disconnect', () => console.log('[socket] Disconnected'));

  _socket.on('ibrahim:status', (data: { status: IbrahimStatus }) => {
    callbacks.onStatus(data.status);
  });

  _socket.on('ibrahim:audio', (data: { audio: string }) => {
    callbacks.onAudio(data.audio);
  });

  _socket.on('ibrahim:response', (data: { text: string; fallback?: boolean }) => {
    callbacks.onResponse(data.text, data.fallback ?? false);
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

export async function playBase64Audio(base64: string): Promise<void> {
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const buffer = await _audioCtx.decodeAudioData(bytes.buffer);
    const source = _audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(_audioCtx.destination);
    source.start();
  } catch (err) {
    console.error('[audio] Playback failed:', err);
  }
}

export function iosFallbackSpeak(text: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang  = 'fr-FR';
  utterance.rate  = 0.95;
  window.speechSynthesis.speak(utterance);
}

// ── Session ───────────────────────────────────────────────────

export function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem('ibrahim_session');
  if (!id) {
    id = `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('ibrahim_session', id);
  }
  return id;
}
