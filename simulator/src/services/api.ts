import { io, Socket } from 'socket.io-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env as Record<string, string> ?? {};
export const BACKEND_URL  = (_env['VITE_BACKEND_URL']  as string) ?? 'https://ibrahim-backend-production.up.railway.app';
export const WS_URL       = (_env['VITE_WS_URL']       as string) ?? 'wss://ibrahim-backend-production.up.railway.app';
export const ACCESS_TOKEN = (_env['VITE_ACCESS_TOKEN'] as string) ?? '';
const HOUARI_TOKEN        = (_env['VITE_ACCESS_TOKEN_HOUARI'] as string) ?? '';

let _actor: 'kouider' | 'houari' = 'kouider';
export const setSimActor = (a: 'kouider' | 'houari') => { _actor = a; };
export const getSimActor = () => _actor;
function getToken() { return (_actor === 'houari' && HOUARI_TOKEN) ? HOUARI_TOKEN : ACCESS_TOKEN; }

function getTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'Europe/Paris'; }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      'X-Timezone': getTimezone(),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
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

export interface TranscribeResponse { text: string; language?: string; }

export const api = {
  chat: (message: string, sessionId: string, imageBase64?: string, imageMime?: string, textOnly = false) =>
    apiFetch<ChatResponse>('/api/chat', {
      method: 'POST',
      body:   JSON.stringify({ message, sessionId, textOnly: textOnly && !imageBase64, imageBase64, imageMime }),
    }),

  transcribe: (audioBase64: string, mimeType = 'audio/webm') =>
    apiFetch<TranscribeResponse>('/api/transcribe', {
      method: 'POST',
      body:   JSON.stringify({ audio: audioBase64, mimeType }),
    }),

  tts: (text: string) =>
    apiFetch<{ audio: string; mimeType: string }>('/api/tts', {
      method: 'POST',
      body:   JSON.stringify({ text: text.slice(0, 500) }),
    }).then(r => r.audio).catch(() => null),

  vision: (imageBase64: string, mimeType = 'image/jpeg') =>
    apiFetch<{ description: string }>('/api/vision/analyze', {
      method: 'POST',
      body:   JSON.stringify({ imageBase64, mimeType }),
    }),

  scan: (imageBase64: string, mimeType = 'image/jpeg') =>
    apiFetch<{ description: string; type: string; extractedData?: Record<string, unknown> }>('/api/vision/scan', {
      method: 'POST',
      body:   JSON.stringify({ imageBase64, mimeType }),
    }),

  health: () =>
    fetch(`${BACKEND_URL}/health`, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } })
      .then(r => r.json() as Promise<{ status: string; uptime?: number }>)
      .catch(() => ({ status: 'error' })),

  nexusStatus: () =>
    fetch(`${BACKEND_URL}/api/nexus/status`, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } })
      .then(r => r.json() as Promise<{ connected: boolean }>)
      .catch(() => ({ connected: false })),

  getTasks: () =>
    apiFetch<{ tasks: TaskItem[] }>('/api/tasks'),

  getFinanceDashboard: () =>
    apiFetch<FinanceDash>('/api/finance/dashboard'),

  sendFeedback: async (feedback: FeedbackPayload) => {
    // Send to local dev watcher (for real-time Claude fix loop)
    fetch('http://localhost:4567/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    }).catch(() => {/* local server may not be running */});
    // Also send to Railway backend
    return apiFetch<{ ok: boolean }>('/api/feedback', {
      method: 'POST',
      body:   JSON.stringify(feedback),
    }).catch(() => ({ ok: false }));
  },
};

export interface TaskItem {
  id: string; type: string; status: string; createdAt: string;
  description?: string; result?: unknown;
}

export interface FinanceDash {
  month: number; year: number;
  ca:       { current: number; previous: number; evolution: number };
  payments: { collected: number; outstanding: number };
  profit:   number;
  bookingCount: number;
  vehicles: Array<{ name: string; ca: number; bookings: number }>;
}

export interface FeedbackPayload {
  category: string; text: string; screenshot?: string; url?: string; timestamp?: string;
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────

export type DzaryxStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface SocketCbs {
  onStatus:        (s: DzaryxStatus, label?: string | null) => void;
  onAudio:         (b64: string) => void;
  onAudioChunk:    (b64: string) => void;
  onAudioComplete: () => void;
  onTextChunk:     (chunk: string) => void;
  onTextComplete:  (text: string) => void;
  onResponse:      (text: string, fallback: boolean) => void;
  onProactive:     (text: string) => void;
}

let _socket: Socket | null = null;

export function connectSocket(sessionId: string, cbs: SocketCbs): Socket {
  if (_socket?.connected) return _socket;
  _socket?.disconnect();

  _socket = io(`${WS_URL}/mobile`, {
    auth:         { token: getToken() },
    transports:   ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    timeout: 10000,
  });

  _socket.on('connect',    () => console.log('[ws] connected'));
  _socket.on('disconnect', () => console.log('[ws] disconnected'));

  _socket.on('Dzaryx:status', (d: { status: DzaryxStatus; sessionId?: string; toolLabel?: string | null }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onStatus(d.status, d.toolLabel);
  });
  _socket.on('Dzaryx:audio', (d: { audio: string; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onAudio(d.audio);
  });
  _socket.on('Dzaryx:audio_chunk', (d: { chunk: string; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onAudioChunk(d.chunk);
  });
  _socket.on('Dzaryx:audio_complete', (d: { sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onAudioComplete();
  });
  _socket.on('Dzaryx:text_chunk', (d: { chunk: string; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onTextChunk(d.chunk);
  });
  _socket.on('Dzaryx:text_complete', (d: { text: string; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onTextComplete(d.text);
  });
  _socket.on('Dzaryx:response', (d: { text: string; fallback?: boolean; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onResponse(d.text, d.fallback ?? false);
  });
  _socket.on('Dzaryx:proactive', (d: { text: string }) => cbs.onProactive(d.text));

  return _socket;
}

export function disconnectSocket(): void { _socket?.disconnect(); _socket = null; }

// ── Audio helpers ─────────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;
let _audioQueue: ArrayBuffer[] = [];
let _audioPlaying = false;
let _pendingChunks: Uint8Array[] = [];
let _currentSource: AudioBufferSourceNode | null = null;

export function unlockAudio(): void {
  if (!_audioCtx) { try { _audioCtx = new AudioContext(); } catch { return; } }
  if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
  try {
    const buf = _audioCtx.createBuffer(1, 1, 22050);
    const src = _audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(_audioCtx.destination);
    src.start(0);
  } catch { /* ignore */ }
}

async function getAudioCtx(): Promise<AudioContext> {
  if (!_audioCtx || _audioCtx.state === 'closed') _audioCtx = new AudioContext();
  if (_audioCtx.state === 'suspended') await _audioCtx.resume();
  return _audioCtx;
}

async function drainQueue(): Promise<void> {
  if (_audioPlaying || _audioQueue.length === 0) return;
  _audioPlaying = true;
  try {
    const ctx = await getAudioCtx();
    while (_audioQueue.length > 0) {
      const buf = _audioQueue.shift()!;
      try {
        const decoded = await ctx.decodeAudioData(buf);
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        src.connect(ctx.destination);
        _currentSource = src;
        await new Promise<void>(r => { src.onended = () => { _currentSource = null; r(); }; src.start(); });
      } catch { /* skip */ }
    }
  } finally {
    _audioPlaying = false;
    window.dispatchEvent(new CustomEvent('Dzaryx:audioEnded'));
  }
}

export async function playBase64Audio(b64: string): Promise<void> {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    _audioQueue.push(bytes.buffer);
    void drainQueue();
  } catch { /* ignore */ }
}

export function enqueueChunk(b64: string): void {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    _pendingChunks.push(bytes);
  } catch { /* ignore */ }
}

export async function flushChunks(): Promise<void> {
  if (!_pendingChunks.length) return;
  const len = _pendingChunks.reduce((s, c) => s + c.length, 0);
  const combined = new Uint8Array(len);
  let off = 0;
  for (const c of _pendingChunks) { combined.set(c, off); off += c.length; }
  _pendingChunks = [];
  _audioQueue.push(combined.buffer);
  void drainQueue();
}

export function stopAudio(): void {
  _audioQueue = []; _pendingChunks = []; _audioPlaying = false;
  try { _currentSource?.stop(); } catch { /* already stopped */ }
  _currentSource = null;
}

export function isAudioPlaying(): boolean { return _audioPlaying; }

export function getOrCreateSessionId(): string {
  return `voice_${_actor}`;
}

// ── Business types ────────────────────────────────────────────────────────────

export interface Booking {
  id: string; client_name: string; client_phone: string | null;
  start_date: string; end_date: string; final_price: number | null;
  payment_status: string; status: string;
  client_price_per_day: number | null; owner_price_per_day: number | null;
  profit_kouider: number | null; nb_days: number | null;
  cars?: { name: string } | null;
}

export interface Car {
  id: string; name: string; available: boolean;
  base_price: number | null; category: string | null;
}

export interface FleetStat { car_name: string; available_now: boolean; occupancy_pct: number; revenue_30d: number; }
export interface FleetIntel { total_cars: number; available_now_count: number; occupancy_avg_pct: number; stats: FleetStat[]; }

export interface RevenueSummary {
  today_revenue: number; week_revenue: number; month_revenue: number;
  kouider_profit_month: number; total_bookings_month: number;
  top_clients: Array<{ client_name: string; total_spent: number; score: string }>;
}

export interface SmartReminder {
  id: string; type: string; priority: 'HIGH' | 'MEDIUM' | 'LOW';
  client_name: string; client_phone: string | null; car_name: string;
  date: string; message: string; action: string;
}

export interface ClientSummary {
  name: string; phone: string | null; bookingCount: number; totalSpent: number; lastBooking: string;
}

export interface ClientIntelligence {
  client_name: string; preferred_cars: string[];
  typical_duration_days: number | null; negotiation_style: string;
  payment_reliability: string; total_bookings: number;
  total_spent: number; score: string; notes: string | null;
}

// ── Business API ──────────────────────────────────────────────────────────────

export const business = {
  fetchBookings: (q?: string) =>
    apiFetch<{ bookings: Booking[] }>(`/api/bookings?limit=40${q ? `&q=${encodeURIComponent(q)}` : ''}`),

  fetchCars: () =>
    apiFetch<{ cars: Car[] }>('/api/cars'),

  fetchFleet: () =>
    apiFetch<FleetIntel>('/api/bi/fleet'),

  fetchRevenue: () =>
    apiFetch<RevenueSummary>('/api/bi/revenue'),

  fetchReminders: () =>
    apiFetch<{ reminders: SmartReminder[] }>('/api/bi/reminders'),

  dismissReminder: (id: string) =>
    apiFetch<{ ok: boolean }>('/api/bi/reminders/dismiss', { method: 'POST', body: JSON.stringify({ id }) }),

  fetchClients: () =>
    apiFetch<{ clients: ClientSummary[] }>('/api/clients'),

  fetchClientIntel: () =>
    apiFetch<{ clients: ClientIntelligence[] }>('/api/clients/intelligence'),

  toggleCar: (id: string, available: boolean) =>
    apiFetch<{ ok: boolean }>(`/api/cars/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ available }) }),

  deleteBooking: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createBooking: (data: Record<string, unknown>) =>
    apiFetch<{ booking: Booking }>('/api/bookings', { method: 'POST', body: JSON.stringify(data) }),

  clearCache: () =>
    apiFetch<{ deleted: number }>('/api/bi/cache/clear', { method: 'POST' }),

  fetchJobs: () =>
    apiFetch<{ jobs: Array<{ name: string; cron: string; next: number | null }> }>('/api/scheduler/jobs'),

  triggerJob: (name: string) =>
    fetch(`${BACKEND_URL}/api/scheduler/trigger/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then(r => r.ok),

  health: () =>
    fetch(`${BACKEND_URL}/health`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json() as Promise<{ status: string; uptime?: number }>)
      .catch(() => ({ status: 'error' })),

  nexus: () =>
    fetch(`${BACKEND_URL}/api/nexus/status`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json() as Promise<{ connected: boolean }>)
      .catch(() => ({ connected: false })),
};
