import { io, Socket } from 'socket.io-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env as Record<string, string> ?? {};

// ── Failover backend : liste d'URLs, bascule auto si le primaire est mort ─────
// Backups via VITE_BACKEND_BACKUPS="https://xxx.onrender.com,https://yyy" (build).
// ES modules = live bindings → les imports de BACKEND_URL voient la bascule.
const _PRIMARY  = (_env['VITE_BACKEND_URL'] as string) ?? 'https://ibrahim-backend-production.up.railway.app';
// Backup Render par défaut (déployé 2026-06-11) — surchargeable via VITE_BACKEND_BACKUPS
const _BACKUPS  = ((_env['VITE_BACKEND_BACKUPS'] as string) ?? 'https://dzaryx-backend-backup.onrender.com').split(',').map(s => s.trim()).filter(Boolean);
const _BACKENDS = [_PRIMARY, ..._BACKUPS];

// 2026-10-22 : on démarre TOUJOURS sur Railway. Avant, le choix du secours était gardé en mémoire : après 4 coupures
// réseau (voiture…) l'app restait collée au secours Render, mort → chat bloqué sur « CONNEXION… » même après relance.
try { localStorage.removeItem('dzaryx:backend:idx'); } catch { /* ignore */ }
let _backendIdx = 0;

export let BACKEND_URL = _BACKENDS[_backendIdx];
export let WS_URL      = (_env['VITE_WS_URL'] as string) && _backendIdx === 0
  ? (_env['VITE_WS_URL'] as string)
  : BACKEND_URL.replace(/^http/, 'ws');

async function _alive(url: string): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`${url}/health`, { signal: ctl.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

function _useBackend(i: number): void {
  _backendIdx = i;
  BACKEND_URL = _BACKENDS[i];
  WS_URL      = i === 0 && (_env['VITE_WS_URL'] as string) ? (_env['VITE_WS_URL'] as string) : BACKEND_URL.replace(/^http/, 'ws');
  console.warn(`[failover] backend → ${BACKEND_URL}`);
  // Le socket doit se reconnecter sur la nouvelle URL
  try { _socket?.disconnect(); } catch { /* ignore */ }
  _socket = null;
}

// Sur le secours : on revient sur Railway dès qu'il répond
let _backTimer: ReturnType<typeof setInterval> | null = null;
function _watchPrimary(): void {
  if (_backTimer) return;
  _backTimer = setInterval(() => {
    if (_backendIdx === 0) { clearInterval(_backTimer!); _backTimer = null; return; }
    void _alive(_BACKENDS[0]).then(ok => { if (ok && _backendIdx !== 0) _useBackend(0); });
  }, 20_000);
}

export function switchToNextBackend(): boolean {
  if (_BACKENDS.length < 2) return false;
  _useBackend((_backendIdx + 1) % _BACKENDS.length);
  if (_backendIdx !== 0) _watchPrimary();
  return true;
}

/** Bascule seulement si le serveur suivant répond vraiment (sinon on reste et on réessaie). */
async function switchIfNextAlive(): Promise<boolean> {
  if (_BACKENDS.length < 2) return false;
  const next = (_backendIdx + 1) % _BACKENDS.length;
  if (!(await _alive(_BACKENDS[next]))) return false;
  _useBackend(next);
  if (next !== 0) _watchPrimary();
  return true;
}

// Connexion par appareil : l'app ne contient plus aucun code d'accès. Le serveur vérifie identifiant + mot de passe
// (POST /api/auth/login) et remet un jeton propre à ce téléphone, gardé dans localStorage.
const DEVICE_TOKEN_KEY = 'dz:device_token';
export function getDeviceToken(): string {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY) ?? ''; } catch { return ''; }
}
export function setDeviceToken(t: string | null) {
  try { if (t) localStorage.setItem(DEVICE_TOKEN_KEY, t); else localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* ignore */ }
}

let _actor: 'kouider' | 'houari' = 'kouider';
export const setSimActor = (a: 'kouider' | 'houari') => { _actor = a; };
export const getSimActor = () => _actor;
export function getToken() { return getDeviceToken(); }

/** Jeton refusé par le serveur (appareil déconnecté, mot de passe changé…) → l'app revient à l'écran de connexion. */
// Un 403 peut aussi vouloir dire « pas le droit » (page réservée à Kouider) : on vérifie le jeton lui-même avant de déconnecter.
let _checkingAuth = false;
function signalAuthExpired() {
  const t = getDeviceToken();
  if (!t || _checkingAuth) return;
  _checkingAuth = true;
  fetch(`${BACKEND_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } })
    .then(r => {
      if ((r.status === 401 || r.status === 403) && getDeviceToken() === t) {
        try { window.dispatchEvent(new CustomEvent('dz:auth-expired')); } catch { /* SSR */ }
      }
    })
    .catch(() => { /* réseau : on ne déconnecte pas */ })
    .finally(() => { _checkingAuth = false; });
}

export async function loginDevice(user: string, password: string): Promise<{ token: string; actor: 'kouider' | 'houari' }> {
  const label = `App ${/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'navigateur'} — ${new Date().toLocaleDateString('fr-BE')}`;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < _BACKENDS.length; attempt++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password, label }),
      });
      const data = await res.json().catch(() => ({})) as { token?: string; actor?: 'kouider' | 'houari'; error?: string };
      if (res.ok && data.token && data.actor) return { token: data.token, actor: data.actor };
      if ([502, 503, 504].includes(res.status) && await switchIfNextAlive()) continue;
      throw new Error(data.error ?? `Erreur ${res.status}`);
    } catch (e) {
      lastErr = e as Error;
      if (e instanceof TypeError && await switchIfNextAlive()) continue;   // réseau → backend de secours
      break;
    }
  }
  throw lastErr ?? new Error('Connexion impossible');
}

export async function logoutDevice(): Promise<void> {
  const t = getDeviceToken();
  setDeviceToken(null);
  if (t) await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
}

export async function changePassword(current: string, next: string, logoutOthers: boolean): Promise<{ ok?: boolean; error?: string; loggedOut?: number }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify({ current, next, logoutOthers }),
  });
  return res.json().catch(() => ({ error: `Erreur ${res.status}` }));
}

function getTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'Europe/Paris'; }
}

// ── Cache hors-ligne (lecture) ────────────────────────────────────────────────
// Les GET réussis sont mis en cache (localStorage). Hors-ligne / backend mort,
// on resert la DERNIÈRE donnée connue + on signale le mode hors-ligne (bannière).
const OFFLINE_PREFIX = 'dz:cache:';
function writeOfflineCache(path: string, data: unknown) {
  try { localStorage.setItem(OFFLINE_PREFIX + path, JSON.stringify({ t: Date.now(), data })); } catch { /* quota — ignore */ }
}
function readOfflineCache<T>(path: string): { data: T; t: number } | null {
  try { const raw = localStorage.getItem(OFFLINE_PREFIX + path); return raw ? JSON.parse(raw) as { data: T; t: number } : null; } catch { return null; }
}
export function setOffline(on: boolean) {
  try { window.dispatchEvent(new CustomEvent('dz:offline', { detail: on })); } catch { /* SSR */ }
}


// ── Coach sportif (page SPORT) ──
export type SportType = 'push' | 'pull' | 'legs' | 'cardio' | 'upper' | 'core';
export interface SportExercise { id: string; name: string; muscle: string; sets: number; reps: string; rest: number; tip: string; alt: string[]; step?: number;
  suggestion: { kg: number | null; last?: string; up?: boolean }; timed: boolean; demo: string[]; video: string }
export interface SportSession { date: string; type: SportType; label: string; emoji: string; focus: string; muscles: string[]; warmup: string;
  exercises: SportExercise[]; finisher: string | null; estMin: number; start: string; end: string; minutes: number; arrived: number | null }
export interface SportOverview {
  today: SportSession | null; next: SportSession | null; planned?: SportSession[]; objective?: string;
  week: Array<{ date: string; type: SportType | null; label: string | null; emoji: string | null; start: string | null; end: string | null; minutes: number | null; skip: string | null; status: string | null }>;
  recovery: Array<{ muscle: string; pct: number }>;
  stats: { streak: number; monthSessions: number; total: number; weeks: Array<{ from: string; sessions: number; volume: number }>; prs: Array<{ ex: string; kg: number; reps: number | null; date: string }> };
  gym: { address: string; lat?: number; lng?: number; distanceKm?: number | null };
  settings: { callBefore: boolean; gymCheck: boolean };
  sessions: Record<SportType, { label: string; emoji: string; focus: string }>;
  recent: Array<{ date: string; type: SportType; label: string; sets: number; volume: number; durationMin: number | null; rpe: number | null }>;
}

// ── Coach (mental, jeu, évolution) ──
export interface CoachDay { date: string;
  mental: { time: string; goal: string; action: string }; sleep: { time: string; why: string }; sport: string | null }
export interface CoachGame {
  total: number; level: number; title: string; floor: number; next: number; pct: number; today: number; streakDays: number; prCount: number;
  feed: Array<{ date: string; xp: number; label: string }>;
  badges: Array<{ id: string; icon: string; name: string; how: string; ok: boolean }>;
  quests: Array<{ icon: string; name: string; have: number; need: number; xp: number; done: boolean }>;
  xpRules: Record<string, number>;
}
export interface CoachOverview {
  today: string; day: CoachDay | null; tomorrow: CoachDay | null;
  checks: { breath: number; gratitude: string[] };
  game: CoachGame;
  evolution: { exercises: Record<string, { name: string; points: Array<{ date: string; kg: number }> }>; weights: Array<{ date: string; kg: number }>; moods: Array<{ date: string; mood: number }>; target: number | null };
  gained?: number; message?: string;
}

const GET_TIMEOUT_MS = 20_000;

export async function apiFetch<T>(path: string, options: RequestInit = {}, _attempt = 0): Promise<T> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  let res: Response;
  // Une lecture bloquée (réseau mobile qui décroche, serveur qui redémarre) ne doit pas laisser la page charger à l'infini
  const ctrl = isGet && !options.signal ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), GET_TIMEOUT_MS) : null;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...(ctrl ? { signal: ctrl.signal } : {}),
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
        'X-Timezone': getTimezone(),
        ...(options.headers ?? {}),
      },
    });
  } catch (netErr) {
    // Backend injoignable (réseau/down) → bascule sur le backup et retente
    if (_attempt < _BACKENDS.length - 1 && await switchIfNextAlive()) {
      return apiFetch<T>(path, options, _attempt + 1);
    }
    // Hors-ligne : resert la dernière donnée connue pour les lectures
    if (isGet) {
      const cached = readOfflineCache<T>(path);
      if (cached) { setOffline(true); return cached.data; }
    }
    throw netErr;
  } finally {
    if (timer) clearTimeout(timer);
  }
  // 502/503/504 = backend mort derrière le proxy → même bascule
  if ([502, 503, 504].includes(res.status) && _attempt < _BACKENDS.length - 1 && await switchIfNextAlive()) {
    return apiFetch<T>(path, options, _attempt + 1);
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) signalAuthExpired();
    if (isGet) { const cached = readOfflineCache<T>(path); if (cached) { setOffline(true); return cached.data; } }
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as T;
  if (isGet) { writeOfflineCache(path, data); setOffline(false); }
  return data;
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
  analyzeFile: (fileBase64: string, mime: string, fileName: string, message = '') =>
    apiFetch<{ text?: string; error?: string }>('/api/chat/analyze-file', {
      method: 'POST',
      body: JSON.stringify({ fileBase64, mime, fileName, message }),
    }),

  chat: (message: string, sessionId: string, imageBase64?: string, imageMime?: string, textOnly = false) =>
    apiFetch<ChatResponse>('/api/chat', {
      method: 'POST',
      body:   JSON.stringify({ message, sessionId, textOnly: textOnly && !imageBase64, imageBase64, imageMime }),
    }),

  // Cache des photos jointes dans le chat pour la session → Dzaryx les attache
  // automatiquement à l'annonce qu'il va créer (add_car / create_property / ...).
  uploadSessionPhotos: (sessionId: string, images: string[]) =>
    apiFetch<{ count: number }>('/api/cars/session-photos', {
      method: 'POST',
      body:   JSON.stringify({ sessionId, images }),
    }),

  uploadCarPhotos: (message: string, images: string[]) =>
    apiFetch<{ text: string; count?: number; car?: string }>('/api/cars/photos', {
      method: 'POST',
      body:   JSON.stringify({ message, images }),
    }),

  // Ajoute des photos à une voiture précise (par nom) → car_photos + image_url
  addCarPhotos: (carName: string, images: string[]) =>
    apiFetch<{ text: string; count?: number; car?: string }>('/api/cars/photos', {
      method: 'POST',
      body:   JSON.stringify({ car_name: carName, images }),
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
    fetch(`${BACKEND_URL}/health`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json() as Promise<{ status: string; uptime?: number }>)
      .catch(() => ({ status: 'error' })),

  nexusStatus: () =>
    fetch(`${BACKEND_URL}/api/nexus/status`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json() as Promise<{ connected: boolean }>)
      .catch(() => ({ connected: false })),

  getTasks: () =>
    apiFetch<{ tasks: TaskItem[] }>('/api/tasks'),

  getFinanceDashboard: () =>
    apiFetch<FinanceDash>('/api/finance/dashboard'),

  getRecentProactives: () =>
    apiFetch<{ messages: Array<{ text: string; type: string; timestamp: string }> }>(`/api/notifications/proactive/recent?actor=${_actor}`),

  getSmartReminders: () =>
    apiFetch<{ reminders: Array<{ type: string; message: string; priority: 'high' | 'medium' | 'low' }> }>('/api/bi/reminders'),

  getChatHistory: (sessionId: string, limit = 20) =>
    apiFetch<{ history: Array<{ role: 'user' | 'assistant'; content: string; created_at: string }> }>(`/api/chat/${encodeURIComponent(sessionId)}/history?limit=${limit}`),

  shareLocation: (lat: number, lng: number) =>
    apiFetch<{ ok: boolean; location: { lat: number; lng: number; city?: string; country: string; updated_at: string } }>('/api/location', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    }),

  getMyLocation: () =>
    apiFetch<{ ok: boolean; location: { lat: number; lng: number; city?: string; country: string; updated_at: string } | null }>('/api/location'),

  getTravelTime: (destination: string, originLat?: number, originLng?: number) => {
    const params = new URLSearchParams({ destination });
    if (originLat !== undefined) params.set('origin_lat', String(originLat));
    if (originLng !== undefined) params.set('origin_lng', String(originLng));
    return apiFetch<{
      ok: boolean;
      distance_km?: number;
      travel_time_minutes?: number;
      traffic?: string;
      waze_link?: string;
      maps_link?: string;
      destination_label?: string;
      warning?: string;
      error?: string;
    }>(`/api/maps/travel-time?${params.toString()}`);
  },

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

// ── Web Push subscription ─────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  const buf     = new ArrayBuffer(raw.length);
  const view    = new DataView(buf);
  for (let i = 0; i < raw.length; i++) view.setUint8(i, raw.charCodeAt(i));
  return buf;
}

let _webPushRegistered = false;

// Crée/récupère la souscription push et l'envoie au backend.
// NE demande PAS la permission — l'appelant garantit qu'elle est déjà 'granted'.
async function subscribePush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;

    // Fetch VAPID public key from backend
    const res = await fetch(`${BACKEND_URL}/api/push-token/vapid-public-key`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return false;
    const { key } = await res.json() as { key: string };

    // Réutilise la souscription existante (après réinstall le SW peut déjà l'avoir) ;
    // sinon en crée une. On re-POST toujours au backend pour re-lier le device.
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    await fetch(`${BACKEND_URL}/api/push-token/web`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${getToken()}`,
        'X-Session-Id':  _actor,
      },
      body: JSON.stringify(sub.toJSON()),
    });

    _webPushRegistered = true;
    console.log('[webpush] subscribed for actor:', _actor);
    return true;
  } catch (err) {
    console.warn('[webpush] registration failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

// GESTE UTILISATEUR UNIQUEMENT — doit être appelé directement depuis un tap (exigence
// iOS Safari/PWA : requestPermission hors gesture est silencieusement ignoré).
// Demande la permission PUIS souscrit. Retourne l'état final de la permission.
export async function registerWebPush(): Promise<NotificationPermission | 'unsupported'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined')
    return 'unsupported';
  const perm = await Notification.requestPermission(); // 1ʳᵉ instruction async = conserve l'activation utilisateur
  if (perm === 'granted') await subscribePush();
  return perm;
}

// SILENCIEUX — ré-attache la souscription si la permission est DÉJÀ accordée.
// Ne demande JAMAIS la permission → sûr à appeler au montage / après login.
export async function resumeWebPush(): Promise<void> {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') await subscribePush();
}

// État des notifications pour l'UI (Réglages).
export function notifStatus(): { supported: boolean; permission: NotificationPermission | 'unsupported'; standalone: boolean } {
  const supported = ('serviceWorker' in navigator) && ('PushManager' in window) && typeof Notification !== 'undefined';
  const standalone = (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)')?.matches)
    || ((navigator as unknown as { standalone?: boolean }).standalone === true);
  return { supported, permission: supported ? Notification.permission : 'unsupported', standalone };
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────

export type DzaryxStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface SocketCbs {
  onStatus:            (s: DzaryxStatus, label?: string | null) => void;
  onAudio:             (b64: string) => void;
  onAudioChunk:        (b64: string) => void;
  onAudioComplete:     () => void;
  onAudioSentenceDone: () => void;
  onTextChunk:         (chunk: string) => void;
  onTextComplete:      (text: string) => void;
  onResponse:          (text: string, fallback: boolean) => void;
  onProactive:         (text: string) => void;
}

let _socket: Socket | null = null;
let _wsErrCount = 0;

// ── Proactive message queue ───────────────────────────────────────────────────
// Stores messages received when no CHAT subscriber is active (different tab open).
const _proactiveQueue: string[] = [];
let _proactiveSub: ((text: string) => void) | null = null;

function _dispatchProactive(text: string, deepLink?: string): void {
  if (_proactiveSub) {
    _proactiveSub(text);
  } else {
    _proactiveQueue.push(text);
  }
  // Global event — Phone.tsx listens to show notification banner
  try {
    window.dispatchEvent(new CustomEvent('Dzaryx:notify', { detail: { text, deepLink } }));
  } catch { /* SSR guard */ }
}

export function subscribeProactive(cb: (text: string) => void): void {
  _proactiveSub = cb;
  // Drain queued messages that arrived while chat was not active
  while (_proactiveQueue.length > 0) cb(_proactiveQueue.shift()!);
}

export function unsubscribeProactive(): void { _proactiveSub = null; }

export function connectSocket(sessionId: string, cbs: SocketCbs): Socket {
  if (!_socket?.connected) {
    _socket?.disconnect();
    _socket = io(`${WS_URL}/mobile`, {
      auth:         { token: getToken() },
      transports:   ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    _socket.on('connect',    () => { _wsErrCount = 0; console.log('[ws] connected'); });
    _socket.on('disconnect', () => console.log('[ws] disconnected'));
    // 4 échecs de connexion d'affilée → backend mort → bascule + reconnexion
    _socket.on('connect_error', () => {
      _wsErrCount += 1;
      if (_wsErrCount >= 4) {
        _wsErrCount = 0;
        void switchIfNextAlive().then(ok => { if (ok) setTimeout(() => connectSocket(sessionId, cbs), 500); });
      }
    });
  }

  // Always re-register session-scoped listeners with current callbacks
  // so switching tabs updates the active handler
  _socket.off('Dzaryx:status').on('Dzaryx:status', (d: { status: DzaryxStatus; sessionId?: string; toolLabel?: string | null }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onStatus(d.status, d.toolLabel);
  });
  _socket.off('Dzaryx:audio').on('Dzaryx:audio', (d: { audio: string; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onAudio(d.audio);
  });
  _socket.off('Dzaryx:audio_chunk').on('Dzaryx:audio_chunk', (d: { chunk: string; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onAudioChunk(d.chunk);
  });
  _socket.off('Dzaryx:audio_complete').on('Dzaryx:audio_complete', (d: { sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onAudioComplete();
  });
  _socket.off('Dzaryx:audio_sentence_done').on('Dzaryx:audio_sentence_done', (d: { sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onAudioSentenceDone();
  });
  // TTS serveur mort (ElevenLabs + secours) → le device parle (gratuit, offline)
  _socket.off('Dzaryx:tts_fallback').on('Dzaryx:tts_fallback', (d: { text: string; sessionId?: string }) => {
    if (d.sessionId && d.sessionId !== sessionId) return;
    speakOnDevice(d.text);
  });
  _socket.off('Dzaryx:text_chunk').on('Dzaryx:text_chunk', (d: { chunk: string; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onTextChunk(d.chunk);
  });
  _socket.off('Dzaryx:text_complete').on('Dzaryx:text_complete', (d: { text: string; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onTextComplete(d.text);
  });
  _socket.off('Dzaryx:response').on('Dzaryx:response', (d: { text: string; fallback?: boolean; sessionId?: string }) => {
    if (!d.sessionId || d.sessionId === sessionId) cbs.onResponse(d.text, d.fallback ?? false);
  });
  // Dzaryx appelle (app ouverte) → Phone.tsx affiche l'écran « Dzaryx t'appelle »
  _socket.off('Dzaryx:incoming_call').on('Dzaryx:incoming_call', (d: { id: string; reason: string }) => {
    try { window.dispatchEvent(new CustomEvent('Dzaryx:incoming_call', { detail: d })); } catch { /* ignore */ }
  });
  // Proactive: dispatch via queue AND call screen callback (VoiceScreen HUD)
  // Filter by targetActor — 'all' goes to everyone, actor-specific only to that actor
  _socket.off('Dzaryx:proactive').on('Dzaryx:proactive', (d: { text: string; targetActor?: string; deepLink?: string }) => {
    if (d.targetActor && d.targetActor !== 'all' && d.targetActor !== _actor) return;
    _dispatchProactive(d.text, d.deepLink);
    cbs.onProactive(d.text);
  });

  return _socket;
}

// ── Appels Dzaryx dans l'app (sans numéro) ───────────────────────────────────
export interface PendingCall { id: string; reason: string; createdAt: string }
export const callApi = {
  // POST (pas GET) : un GET serait resservi par le cache hors-ligne → fausse sonnerie
  pending: () => apiFetch<{ call: PendingCall | null }>('/api/call/pending', { method: 'POST', body: JSON.stringify({ actor: _actor }) }),
  answer:  (callId?: string) => apiFetch<{ text: string; audio: string | null; incoming: boolean }>('/api/call/answer', {
    method: 'POST', body: JSON.stringify({ callId, actor: _actor }),
  }),
  decline: (callId?: string) => apiFetch<{ ok: boolean }>('/api/call/decline', { method: 'POST', body: JSON.stringify({ callId, actor: _actor }) }),
  tgLive:  () => apiFetch<{ live: boolean }>('/api/call/tg-live-state', { method: 'POST', body: JSON.stringify({ actor: _actor }) }),
};

export function disconnectSocket(): void { _socket?.disconnect(); _socket = null; }
export function isSocketConnected(): boolean { return _socket?.connected ?? false; }

// ── Voix device (dernier secours TTS — speechSynthesis, gratuit, offline) ────
const ARABIC_RE = /[؀-ۿ]/;
export function speakOnDevice(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const clean = text.replace(/https?:\/\/\S+/g, '').replace(/[*#`_~]/g, '').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = ARABIC_RE.test(clean) ? 'ar' : 'fr-FR';
    u.rate = 1.0;
    const voices = synth.getVoices();
    const match = voices.find(v => v.lang.toLowerCase().startsWith(u.lang.toLowerCase().slice(0, 2)));
    if (match) u.voice = match;
    synth.speak(u);
  } catch { /* speechSynthesis indisponible → silencieux, le texte est affiché */ }
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;
let _audioQueue: ArrayBuffer[] = [];
let _audioPlaying = false;
let _pendingChunks: Uint8Array[] = [];
let _currentSource: AudioBufferSourceNode | null = null;
// Volume réel de la voix de Dzaryx pendant qu'elle joue → la bouche de son visage (ui/dzaryxFace.ts) suit le son
let _analyser: AnalyserNode | null = null;
let _levelBuf: Uint8Array<ArrayBuffer> | null = null;

/** Volume instantané de la voix de Dzaryx (0 = silence, ~1 = fort). */
export function getVoiceLevel(): number {
  if (!_analyser || !_levelBuf || !_audioPlaying) return 0;
  _analyser.getByteTimeDomainData(_levelBuf);
  let sum = 0;
  for (let i = 0; i < _levelBuf.length; i++) { const v = (_levelBuf[i]! - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / _levelBuf.length) * 4);
}

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
        if (!_analyser || _analyser.context !== ctx) {
          try { _analyser = ctx.createAnalyser(); _analyser.fftSize = 512; _analyser.connect(ctx.destination); _levelBuf = new Uint8Array(_analyser.fftSize); }
          catch { _analyser = null; }
        }
        src.connect(_analyser ?? ctx.destination);
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

// ── React Native WebView bridge ───────────────────────────────────────────────
export function sendNativeAction(action: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rn = (window as any).ReactNativeWebView;
    if (rn?.postMessage) rn.postMessage(JSON.stringify(action));
  } catch { /* not in WebView */ }
}

export function tryParseNativeAction(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed['__native_action']) return parsed;
  } catch { /* not json */ }
  return null;
}

// ── Business types ────────────────────────────────────────────────────────────

export interface Booking {
  id: string; client_name: string; client_phone: string | null;
  start_date: string; end_date: string; final_price: number | null;
  payment_status: string; status: string;
  client_price_per_day: number | null; owner_price_per_day: number | null;
  profit_kouider: number | null; nb_days: number | null;
  paid_amount?: number | null;
  rented_by?: string | null;
  car_id?: string | null;
  cars?: { name: string } | null;
}

export interface Car {
  id: string; name: string; available: boolean;
  base_price: number | null; resale_price?: number | null;
  owner_price_per_day?: number | null;
  houari_base_price?: number | null; houari_resale_price?: number | null;
  currency?: string | null; category: string | null;
  image_url?: string | null;
  maintenance_note?: string | null; service_notes?: string | null;
  fuel?: string | null; transmission?: string | null; seats?: number | null; description?: string | null;
  last_service_date?: string | null; last_service_km?: number | null; service_interval_km?: number | null; service_due_date?: string | null;
  current_km?: number | null; next_service_km?: number | null; next_service_date?: string | null;
  insurance_expiry?: string | null; technical_expiry?: string | null; vignette_expiry?: string | null;
}

export interface CarReminder { id: string; message: string; remind_at: string; local_time_iso?: string | null }

// ── Inspection (état avant/après véhicule + bien) ──────────────────
export interface DamageBox {
  label: string;
  severity: 'aucun' | 'leger' | 'moyen' | 'grave';
  location: string;
  is_new?: boolean;
  photo_index?: number;
  box: { x: number; y: number; w: number; h: number };
}
export interface InspectionAnalysis {
  description: string;
  severity: 'aucun' | 'leger' | 'moyen' | 'grave';
  accident: boolean;
  damages: string[];
  damageBoxes: DamageBox[];
  damageDetected: boolean;
  comparisonReport?: string;
}
export interface InspectionResult {
  success: boolean;
  message: string;
  stateId?: string;
  photoUrl?: string | null;
  photos?: string[];
  bookingId?: string | null;
  analysis?: InspectionAnalysis;
}
export interface InspectionState {
  id: string;
  client_name: string;
  car_name?: string;
  property_name?: string;
  state_type: 'before' | 'after';
  photos: string[];
  ai_description: string | null;
  damages: string[];
  damage_boxes: DamageBox[];
  damage_detected: boolean;
  accident: boolean;
  severity: string | null;
  comparison_report: string | null;
  created_at: string;
}

// ── Opportunités marché auto (Dzaryx + web search) ─────────────────
export interface Opportunity {
  category: 'location' | 'vente' | 'import' | 'immo' | 'business' | 'change' | 'invest' | 'aide' | 'loi' | 'marche' | 'modele';
  title: string; detail: string; action: string;
  urgency: 'info' | 'a_suivre' | 'urgent';
}
export interface OpportunitiesReport { updated_at: string; summary: string; items: Opportunity[]; pending?: boolean; refreshing?: boolean; }

export interface FleetStat { car_name: string; available_now: boolean; occupancy_pct: number; revenue_30d: number; }
export interface FleetIntel { total_cars: number; available_now_count: number; occupancy_avg_pct: number; stats: FleetStat[]; }

export interface RevenueSummary {
  today_revenue:            number;
  week_revenue:             number;
  month_revenue:            number;
  last_month_revenue:       number;
  last_month_profit:        number;
  month_vs_last_pct:        number;
  kouider_profit_month:     number;
  houari_revenue_month:     number;
  missing_owner_price:      number;
  avg_booking_value:        number;
  total_bookings_month:     number;
  rejected_count:           number;
  rejected_revenue_lost:    number;
  total_unpaid_receivables: number;
  top_clients:              Array<{ client_name: string; total_spent: number; score: string }>;
  generated_at?:            string;
}

export interface FinancialBooking {
  id: string; client_name: string; car_name: string;
  start_date: string; end_date: string; nb_days: number;
  final_price: number | null; client_price_per_day: number | null;
  owner_price_per_day: number | null; owner_total: number | null;
  rented_by: string; status: string; payment_status: string;
  paid_amount: number; kouider_profit: number | null;
  discount_applied: number; price_source: string; data_complete: boolean;
}

export interface FinancialReport {
  period:             string;
  totalBookings:      number;
  kouiderBookings:    number;
  houariBookings:     number;
  grossCA:            number;
  ownerTotal:         number;
  kouiderProfit:      number;
  encaisse:           number;
  aEncaisser:         number;
  missingOwnerPrice:  number;
  missingClientPrice: number;
  bookings:           FinancialBooking[];
  dzd?:               { ca: number; houariCA: number; kouiderCA?: number; kouiderProfit?: number; encaisse: number; aEncaisser: number; bookings: number };
}

export interface ClientDocument {
  id: string; client_name: string; client_phone: string;
  type: 'passport' | 'license' | 'contract' | 'other';
  file_url: string; notes?: string | null; created_at: string;
}

export interface SmartReminder {
  id: string; type: string; priority: 'HIGH' | 'MEDIUM' | 'LOW';
  client_name: string; client_phone: string | null; car_name: string;
  date: string; message: string; action: string;
}

export type ClientType = 'loc_auto' | 'loc_immo' | 'achat_auto' | 'achat_immo' | 'demande';

export interface ClientSummary {
  name: string; phone: string | null; bookingCount: number; totalSpent: number; lastBooking: string;
  types?: ClientType[];
  lastCarName?: string | null; lastBookingDate?: string | null;
}

export interface ClientBookingHistory {
  id: string; car_id?: string | null; car_name?: string | null; start_date?: string; end_date?: string;
  status?: string; final_price?: number | null; nb_days?: number | null; created_at?: string;
  client_price_per_day?: number | null; owner_price_per_day?: number | null;
  paid_amount?: number | null; payment_status?: string | null;
  client_passport?: string | null; passport_expiry?: string | null;
}
export interface ClientDetail {
  phone: string; bookings: ClientBookingHistory[]; documents: ClientDocument[];
  totalSpent: number; bookingCount: number; isVip: boolean;
}

export interface TodayItem { id: string; client: string; phone: string | null; car: string; }

export interface Referral {
  id: string; code: string; referrer_name?: string | null; referrer_phone?: string | null;
  reward?: string | null; uses: number; note?: string | null; created_at?: string;
}

export interface BlogPost {
  id: string; slug?: string; title_fr?: string; excerpt_fr?: string;
  cover_url?: string | null; published?: boolean; created_at?: string;
}

export interface SiteReview {
  id: string; client_name?: string | null; rating: number; comment?: string | null;
  approved: boolean; verified?: boolean | null; created_at?: string;
}

export interface CashEntry {
  id: string; kind: 'income' | 'expense'; category?: string | null; label?: string | null;
  amount: number; currency?: string | null; entry_date?: string; created_at?: string;
}

export interface ClientOperation {
  id: string; client_name: string; client_phone: string | null;
  deal_type: string; item_label: string | null; amount: number | null;
  currency: string | null; status: string | null; created_at: string;
}

export interface SiteProperty {
  id: string; title?: string | null; name?: string | null;
  city?: string | null; district?: string | null; transaction?: string | null;
  price?: number | null; currency?: string | null; price_type?: string | null;
  status?: string | null; type?: string | null; rooms?: number | null;
  surface?: number | null; image_url?: string | null;
}

export interface SaleVehicle {
  id: string; brand: string; model: string; year?: number | null;
  price?: number | null; currency?: string | null; status?: string | null;
  mileage?: number | null; image_url?: string | null;
}

export interface ClientLead {
  id: string; client_name: string; client_phone?: string | null;
  category: string; criteria: string; budget_max?: number | null;
  currency?: string | null; city?: string | null; status: string;
  notes?: string | null; created_at: string;
}

export interface ClientIntelligence {
  client_name: string; preferred_cars: string[];
  typical_duration_days: number | null; negotiation_style: string;
  payment_reliability: string; total_bookings: number;
  total_spent: number; score: string; notes: string | null;
}

// ── Business API ──────────────────────────────────────────────────────────────

export interface ProspectRow {
  id: string; company: string; contact_name: string | null; email: string | null; phone: string | null;
  segment: string; city: string; source: string | null; status: string; notes: string | null; website: string | null;
  created_at: string; last_contacted_at: string | null; last_subject: string | null;
  last_reply_text: string | null; suggested_reply: string | null;
  linkedin_contacts: Array<{ name: string; title: string; url: string; message: string; sent_at: string | null; email?: string | null; subject?: string | null; idx?: number }>;
  lang: string | null; last_sent_text: string | null;
  followup_at: string | null; site_visit_at: string | null; site_visits: number;
  whatsapp_message: string | null; whatsapp_sent_at: string | null; whatsapp_number: string | null;
  quote_draft: Array<{ label: string; currency: string }> | null; proposed_slots: string[] | null;
}
export interface ProspectsOverview {
  autopilot: { enabled: boolean; per_day: number };
  mode?: 'sites' | 'conciergerie' | 'both'; cities?: string[];
  sender: string; sender_pro: boolean;
  stats: { total: number; sent: number; sent_today: number; replies: number; linkedin_todo: number; whatsapp_todo: number; followups: number; visits: number; sites_sent?: number; by_status: Record<string, number> };
  prospects: ProspectRow[];
}

// ── À PAYER (abonnements pour garder Dzaryx actif) ──
export interface BillingRow {
  id: string; name: string; level: 'vital' | 'important' | 'optionnel'; kind: 'abonnement' | 'credits' | 'gratuit' | 'annuel';
  what: string; ifUnpaid: string; payUrl: string; period?: 'mois' | 'an'; price?: string; mandatory?: boolean;
  due: string | null; daysLeft: number | null; amount: string | null; note: string | null;
  state: 'ok' | 'soon' | 'late' | 'out' | 'unknown'; status: string; live: boolean;
}
export interface BillingOverview { rows: BillingRow[]; claudeSpent7d: number | null; survival: string[]; eco?: boolean }

// ── Sites clients (FIK Sites) ──
export interface SiteMessage { id: string; at: string; mode: 'table' | 'rdv' | 'contact'; name: string; phone: string; email?: string; date?: string; time?: string; people?: number; message?: string; read: boolean }
export interface ClientSiteRow {
  id: string; name: string; kind: string; status: 'live' | 'paused'; pausedReason: 'billing' | 'manual' | null;
  url: string; netlifyUrl: string; adminUrl: string; createdAt: string; updatedAt: string; photo: string | null;
  account: string | null; invented: string[];
  domain: { name: string; status: 'pending' | 'active'; since: string; checkedAt?: string } | null; dns: string | null;
  dnsTarget: { a: string; cname: string };
  billing: { monthly: number; currency: string; paidUntil: string; autoPause: boolean; graceDays: number; late: number;
    payments: Array<{ at: string; amount: number; months: number; note?: string }> } | null;
  notify: { email: string | null; kouider: boolean }; unread: number; messages: SiteMessage[];
  pack: { id: string; name: string; country: 'DZ' | 'FR'; period: 'mois' | 'an' | 'unique'; since: string } | null;
  contact: { name?: string; phone?: string; email?: string; city?: string } | null; address: string;
  clientSince: string; clientFor: string; totalPaid: number; services: string[];
}
export interface SitePack { id: string; country: 'DZ' | 'FR'; name: string; currency: string; for: string; includes: string[]; monthly?: number; yearly?: number; once?: number; renewal?: number }
export interface SiteTarifs { updatedAt: string; packs: SitePack[]; options: Array<{ id: string; country: 'DZ' | 'FR'; name: string; currency: string; monthly?: number; once?: number; note: string }>; offers: Record<'DZ' | 'FR', string> }
export interface SitesOverview {
  sites: ClientSiteRow[]; tarifs?: SiteTarifs;
  demos: Array<{ slug: string; name: string; url: string; createdAt: string; converted: boolean }>;
  stats: { live: number; paused: number; late: number; unread: number; mrr: Record<string, number> };
}

// ── Studio vidéo IA ──
export interface StudioShot { prompt: string; camera: string; duration: number; use_image?: boolean }
export interface StudioPlan {
  id: string; title: string; hook: string; voiceover: string; cta: string; music_prompt: string; post_caption: string;
  brand: string; lang: string; template: string; image_url?: string | null; shots: StudioShot[]; createdAt: string;
}
export interface StudioModel { id: string; label: string; perSec: number; perSecAudio: number; durations: number[]; note: string }
export interface StudioOptions {
  models: StudioModel[]; cameras: Array<{ id: string; label: string }>; templates: Array<{ id: string; label: string }>;
  langs: string[]; cars: Array<{ id: string; name: string; image_url: string }>; spentUsd: number;
}
export interface StudioJob {
  id: string; planId: string; title: string; model: string; status: 'queued' | 'shots' | 'audio' | 'montage' | 'done' | 'error';
  step: string; progress: number; estimateUsd: number; costUsd: number; url?: string; caption?: string; error?: string;
  shotsDone: number; shotsTotal: number; createdAt: string; updatedAt: string;
}
export interface StudioRenderOptions { model: string; nativeAudio: boolean; voice: boolean; music: boolean; subtitles: boolean }

export const business = {
  fetchBookings: (q?: string, rentedBy?: string) => {
    const p = new URLSearchParams({ limit: '40' });
    if (q) p.set('q', q);
    if (rentedBy) p.set('rented_by', rentedBy);
    return apiFetch<{ bookings: Booking[] }>(`/api/bookings?${p.toString()}`);
  },

  fetchCars: () =>
    apiFetch<{ cars: Car[] }>('/api/cars'),

  // Fenêtre large (carte live) : assez de résas récentes pour couvrir celles en cours.
  fetchBookingsWindow: () =>
    apiFetch<{ bookings: Booking[] }>('/api/bookings?limit=300'),

  fetchFleet: () =>
    apiFetch<FleetIntel>('/api/bi/fleet'),

  fetchRevenue: () =>
    apiFetch<RevenueSummary>('/api/bi/revenue'),

  fetchReminders: () =>
    apiFetch<{ reminders: SmartReminder[] }>('/api/bi/reminders'),

  dismissReminder: (id: string) =>
    apiFetch<{ ok: boolean }>('/api/bi/reminders/dismiss', { method: 'POST', body: JSON.stringify({ id }) }),

  fetchDocuments: (name: string, type?: string) =>
    apiFetch<{ documents: ClientDocument[]; count: number }>(
      `/api/documents/search?name=${encodeURIComponent(name)}${type ? `&type=${encodeURIComponent(type)}` : ''}`
    ),

  fetchClients: () =>
    apiFetch<{ clients: ClientSummary[] }>('/api/clients'),

  fetchClientIntel: () =>
    apiFetch<{ clients: ClientIntelligence[] }>(`/api/clients/intelligence?owner=${_actor}`),

  fetchClientDetail: (phone: string) =>
    apiFetch<ClientDetail>(`/api/clients/${encodeURIComponent(phone)}`),

  // Scanne une pièce (passeport/permis) + l'enregistre sur le client ET sa réservation.
  scanClientDocument: (base64: string, opts: { mime?: string; isPermis?: boolean; clientName?: string; clientPhone?: string } = {}) =>
    apiFetch<{ text: string }>('/api/clients/scan-document', {
      method: 'POST',
      body: JSON.stringify({ base64, ...opts }),
    }),

  // Supprime une pièce du dossier client (ex: passeport ajouté par erreur).
  deleteClientDocument: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/clients/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Modifier le profil intelligence d'un client (négociation, fiabilité, durée typique, notes).
  updateClientIntel: (clientName: string, fields: Record<string, unknown>) =>
    apiFetch<{ client: ClientIntelligence }>('/api/clients/intelligence', {
      method: 'PATCH',
      body: JSON.stringify({ client_name: clientName, owner: _actor, ...fields }),
    }),

  // Newsletter (envoi via le site / Resend)
  newsletterStats: () =>
    apiFetch<{ active: number }>('/api/newsletter/stats'),
  newsletterList: () =>
    apiFetch<{ subscribers: Array<{ email: string; lang?: string; created_at?: string }> }>('/api/newsletter/list'),

  // Blog
  blogList: () =>
    apiFetch<{ posts: BlogPost[] }>('/api/blog'),
  blogGenerate: (topic: string) =>
    apiFetch<{ article: { title: string; excerpt: string; body: string } }>('/api/blog-generate', { method: 'POST', body: JSON.stringify({ topic }) }),
  blogCover: (data: { base64: string; fileName?: string; mimeType?: string }) =>
    apiFetch<{ url: string }>('/api/blog/cover', { method: 'POST', body: JSON.stringify(data) }),
  blogCreate: (data: { title: string; excerpt?: string; body: string; cover_url?: string; published?: boolean }) =>
    apiFetch<{ post: BlogPost }>('/api/blog', { method: 'POST', body: JSON.stringify(data) }),
  blogToggle: (id: string, published: boolean) =>
    apiFetch<{ post: BlogPost }>(`/api/blog/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ published }) }),
  blogDelete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/blog/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Assistant WhatsApp rédactionnel
  whatsappDraft: (data: { clientMessage?: string; context?: string; lang?: string; tone?: string }) =>
    apiFetch<{ reply?: string; error?: string }>('/api/whatsapp/draft', { method: 'POST', body: JSON.stringify(data) }),

  // Préférences notifications (par type)
  pushPrefsGet: () =>
    apiFetch<{ prefs: Record<string, boolean> }>('/api/push-token/prefs'),
  pushPrefsSet: (prefs: Record<string, boolean>) =>
    apiFetch<{ prefs: Record<string, boolean> }>('/api/push-token/prefs', { method: 'POST', body: JSON.stringify(prefs) }),

  // Insights
  insightsToday: () =>
    apiFetch<{ date: string; departures: TodayItem[]; returns: TodayItem[]; toCollect: Array<TodayItem & { due: number }>; newDemands: number; pendingBookings: number }>('/api/insights/today'),
  insightsForecast: () =>
    apiFetch<{ byMonth: Array<{ month: string; count: number; pct: number }>; peaks: string[]; next3: string[]; summerSoon: boolean; total: number }>('/api/insights/forecast'),
  insightsReengage: (months = 4) =>
    apiFetch<{ months: number; dormant: Array<{ name: string; phone: string | null; date: string; car: string; count: number }> }>(`/api/insights/reengage?months=${months}`),
  // Démarchage (prospection B2B)
  prospectsOverview: () => apiFetch<ProspectsOverview>('/api/prospects/overview'),
  sitesOverview: () => apiFetch<SitesOverview>('/api/fik-sites/overview'),
  sitesDemo: (link: string, notes: string) => apiFetch<{ message: string }>('/api/fik-sites/demo', { method: 'POST', body: JSON.stringify({ link, notes }) }),
  sitesCreate: (demo: string, real_info: string, client_email: string, extra: { pack?: string; period?: string; paid_amount?: number; country?: string } = {}) =>
    apiFetch<{ message: string }>('/api/fik-sites/create', { method: 'POST', body: JSON.stringify({ demo, real_info, client_email, ...extra }) }),
  sitesTarifs: (changes = '') => apiFetch<{ message: string; tarifs: SiteTarifs }>('/api/fik-sites/tarifs', { method: 'POST', body: JSON.stringify({ changes }) }),
  siteAction: (id: string, action: string, params: Record<string, unknown> = {}) =>
    apiFetch<{ message: string }>(`/api/fik-sites/${encodeURIComponent(id)}/action`, { method: 'POST', body: JSON.stringify({ ...params, action }) }),
  siteOpenAdmin: (id: string) => apiFetch<{ url: string }>(`/api/fik-sites/${encodeURIComponent(id)}/open-admin`, { method: 'POST' }),
  siteMessagesRead: (id: string) => apiFetch<{ ok: boolean }>(`/api/fik-sites/${encodeURIComponent(id)}/messages/read`, { method: 'POST' }),
  prospectsAutopilot: (patch: { enabled?: boolean; per_day?: number; mode?: 'sites' | 'conciergerie' | 'both'; cities?: string[] }) =>
    apiFetch<{ autopilot: ProspectsOverview['autopilot'] }>('/api/prospects/autopilot', { method: 'POST', body: JSON.stringify(patch) }),
  prospectsRun: () => apiFetch<{ ok: boolean; message: string }>('/api/prospects/run', { method: 'POST' }),
  prospectReply: (id: string, text: string) =>
    apiFetch<{ ok: boolean; message: string }>(`/api/prospects/${id}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
  prospectDismissReply: (id: string) => apiFetch<{ ok: boolean }>(`/api/prospects/${id}/dismiss-reply`, { method: 'POST' }),
  prospectStatus: (id: string, status: string) =>
    apiFetch<{ ok: boolean }>(`/api/prospects/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  prospectLinkedinSent: (id: string, idx: number, sent: boolean) =>
    apiFetch<{ ok: boolean }>(`/api/prospects/${id}/linkedin/${idx}`, { method: 'POST', body: JSON.stringify({ sent }) }),
  prospectWhatsappSent: (id: string, sent: boolean) =>
    apiFetch<{ ok: boolean }>(`/api/prospects/${id}/whatsapp`, { method: 'POST', body: JSON.stringify({ sent }) }),
  prospectWhatsappSend: (id: string) => apiFetch<{ ok: boolean; message: string }>(`/api/prospects/${id}/whatsapp/send`, { method: 'POST' }),
  billing: () => apiFetch<BillingOverview>('/api/billing'),
  sport: () => apiFetch<SportOverview>('/api/sport'),
  sportLog: (body: { date: string; type: SportType; sets: Array<{ ex: string; kg?: number; reps?: number }>; durationMin?: number; rpe?: number; note?: string }) =>
    apiFetch<{ ok: boolean; prs: string[]; total: number; gained: number; level: number | null; levelUp: boolean }>('/api/sport/log', { method: 'POST', body: JSON.stringify(body) }),
  sportSwap: (date: string, type: SportType | null) => apiFetch<SportOverview>('/api/sport/swap', { method: 'POST', body: JSON.stringify({ date, type }) }),
  sportSkip: (date: string, reason: string | null) => apiFetch<SportOverview>('/api/sport/skip', { method: 'POST', body: JSON.stringify({ date, reason }) }),
  sportSettings: (patch: { callBefore?: boolean; gymCheck?: boolean }) => apiFetch<{ settings: SportOverview['settings'] }>('/api/sport/settings', { method: 'POST', body: JSON.stringify(patch) }),
  coach: () => apiFetch<CoachOverview>('/api/coach'),
  coachGenerate: (day: 'today' | 'tomorrow') => apiFetch<CoachOverview>('/api/coach/generate', { method: 'POST', body: JSON.stringify({ day }) }),
  coachCheck: (kind: 'breath' | 'gratitude' | 'mood', value?: string | number) =>
    apiFetch<CoachOverview>('/api/coach/check', { method: 'POST', body: JSON.stringify({ kind, value }) }),
  coachWeight: (kg: number) => apiFetch<CoachOverview>('/api/coach/weight', { method: 'POST', body: JSON.stringify({ kg }) }),
  coachTarget: (kg: number | null) => apiFetch<CoachOverview>('/api/coach/target', { method: 'POST', body: JSON.stringify({ kg }) }),
  sportSync: () => apiFetch<{ ok: boolean; message: string }>('/api/sport/sync', { method: 'POST' }),
  studioOptions: () => apiFetch<StudioOptions>('/api/studio/options'),
  studioPlan: (body: { idea: string; template: string; lang: string; seconds: number; imageUrl?: string; carName?: string }
    | { manual: { prompt: string; camera: string; duration: number; imageUrl?: string } }) =>
    apiFetch<StudioPlan>('/api/studio/plan', { method: 'POST', body: JSON.stringify(body) }),
  studioRender: (plan: StudioPlan, options: StudioRenderOptions) =>
    apiFetch<{ job: StudioJob; estimateUsd: number }>('/api/studio/render', { method: 'POST', body: JSON.stringify({ plan, options }) }),
  studioJobs: () => apiFetch<{ jobs: StudioJob[]; spentUsd: number }>('/api/studio/jobs'),
  billingEco: (on: boolean) => apiFetch<{ ok: boolean; message: string }>('/api/billing/eco', { method: 'POST', body: JSON.stringify({ on }) }),
  billingUpdate: (id: string, patch: { due?: string; amount?: string; balance?: number; note?: string; paid?: boolean }) =>
    apiFetch<{ ok: boolean; message: string }>(`/api/billing/${id}`, { method: 'POST', body: JSON.stringify(patch) }),
  prospectsWeekly: () => apiFetch<{ report: string }>('/api/prospects/weekly'),
  // Contenu social
  socialGenerate: (data: { topic: string; platform?: string; lang?: string }) =>
    apiFetch<{ caption?: string; hashtags?: string; error?: string }>('/api/social/generate', { method: 'POST', body: JSON.stringify(data) }),
  // Recherche globale
  globalSearch: (q: string) =>
    apiFetch<{ results: Array<{ type: string; label: string; sub?: string; ref?: string }> }>(`/api/search?q=${encodeURIComponent(q)}`),
  // Devis PDF
  quotePdf: (data: { client_name?: string; lines: Array<{ label: string; amount: number; currency: string }> }) =>
    apiFetch<{ url: string; ref: string }>('/api/quote/pdf', { method: 'POST', body: JSON.stringify(data) }),
  quotesList: () =>
    apiFetch<{ quotes: Array<{ id: string; ref: string; client_name?: string; total?: number; currency?: string; url: string; created_at?: string }> }>('/api/quote/list'),
  // Bon de réservation PDF
  voucherPdf: (data: { first_name?: string; last_name?: string; passport?: string; phone?: string; vehicle?: string; start_date?: string; end_date?: string; pickup?: string; dropoff?: string; total?: number; deposit?: number; currency?: string }) =>
    apiFetch<{ url: string; ref: string }>('/api/reservation-voucher/pdf', { method: 'POST', body: JSON.stringify(data) }),
  vouchersList: () =>
    apiFetch<{ vouchers: Array<{ id: string; ref: string; client_name?: string; vehicle?: string; deposit?: number; total?: number; currency?: string; url: string; created_at?: string }> }>('/api/reservation-voucher/list'),

  // Parrainage
  referralsList: () =>
    apiFetch<{ referrals: Referral[] }>('/api/referrals'),
  referralCreate: (data: { referrer_name?: string; referrer_phone?: string; reward?: string }) =>
    apiFetch<{ referral: Referral }>('/api/referrals', { method: 'POST', body: JSON.stringify(data) }),
  referralUpdate: (id: string, data: { uses?: number; note?: string }) =>
    apiFetch<{ referral: Referral }>(`/api/referrals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  referralDelete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/referrals/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Avis clients
  reviewsList: () =>
    apiFetch<{ reviews: SiteReview[]; counts: { total: number; approved: number; pending: number; avg: number } }>('/api/reviews'),
  reviewSetApproved: (id: string, approved: boolean) =>
    apiFetch<{ review: SiteReview }>(`/api/reviews/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ approved }) }),
  reviewDelete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/reviews/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Caisse / comptabilité
  cashList: () =>
    apiFetch<{ entries: CashEntry[]; ym: string; month: Record<string, { income: number; expense: number; balance: number }> }>('/api/cash'),
  cashAdd: (data: { kind: string; category?: string; label?: string; amount: number; currency?: string; entry_date?: string }) =>
    apiFetch<{ entry: CashEntry }>('/api/cash', { method: 'POST', body: JSON.stringify(data) }),
  cashDelete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/cash/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  newsletterSend: (data: { title: string; body: string; test?: boolean; testEmail?: string }) =>
    apiFetch<{ ok?: boolean; total?: number; sent?: number; test?: boolean; dest?: string; error?: string }>(
      '/api/newsletter/send', { method: 'POST', body: JSON.stringify(data) }),

  fetchOperations: () =>
    apiFetch<{ operations: ClientOperation[] }>('/api/clients/operations'),

  // Leads / demandes clients
  fetchLeads: (status?: string) =>
    apiFetch<{ leads: ClientLead[] }>(`/api/clients/leads${status ? `?status=${status}` : ''}`),
  createLead: (data: Record<string, unknown>) =>
    apiFetch<{ lead: ClientLead }>('/api/clients/leads', { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (id: string, data: Record<string, unknown>) =>
    apiFetch<{ lead: ClientLead }>(`/api/clients/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Immobilier (synchro site)
  fetchProperties: () =>
    apiFetch<{ properties: SiteProperty[] }>('/api/immo/properties'),
  createProperty: (data: Record<string, unknown>) =>
    apiFetch<{ property: SiteProperty }>('/api/immo/properties', { method: 'POST', body: JSON.stringify(data) }),
  updateProperty: (id: string, data: Record<string, unknown>) =>
    apiFetch<{ property: SiteProperty }>(`/api/immo/properties/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addPropertyPhotos: (id: string, photos: string[]) =>
    apiFetch<{ ok: boolean; count: number }>(`/api/immo/properties/${encodeURIComponent(id)}/photos`, { method: 'POST', body: JSON.stringify({ photos }) }),
  propertyPhotos: (id: string) =>
    apiFetch<{ photos: Array<{ url: string; position: number }> }>(`/api/immo/properties/${encodeURIComponent(id)}/photos`),
  propertyPhotoDelete: (id: string, url: string) =>
    apiFetch<{ ok: boolean }>(`/api/immo/properties/${encodeURIComponent(id)}/photos`, { method: 'DELETE', body: JSON.stringify({ url }) }),
  vehiclePhotos: (id: string) =>
    apiFetch<{ photos: Array<{ url: string; position: number }> }>(`/api/immo/vehicles-for-sale/${encodeURIComponent(id)}/photos`),
  vehiclePhotoDelete: (id: string, url: string) =>
    apiFetch<{ ok: boolean }>(`/api/immo/vehicles-for-sale/${encodeURIComponent(id)}/photos`, { method: 'DELETE', body: JSON.stringify({ url }) }),
  deleteProperty: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/immo/properties/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Vente véhicules (synchro site)
  fetchVehiclesForSale: () =>
    apiFetch<{ vehicles: SaleVehicle[] }>('/api/immo/vehicles-for-sale'),
  addVehicleForSale: (data: Record<string, unknown>) =>
    apiFetch<{ vehicle: SaleVehicle }>('/api/immo/vehicles-for-sale', { method: 'POST', body: JSON.stringify(data) }),
  updateVehicleSale: (id: string, data: Record<string, unknown>) =>
    apiFetch<{ vehicle: SaleVehicle }>(`/api/immo/vehicles-for-sale/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  addVehicleSalePhotos: (id: string, photos: string[]) =>
    apiFetch<{ ok: boolean; count: number }>(`/api/immo/vehicles-for-sale/${encodeURIComponent(id)}/photos`, { method: 'POST', body: JSON.stringify({ photos }) }),

  fetchClientDeals: (name?: string, phone?: string) => {
    const p = new URLSearchParams();
    if (phone) p.set('phone', phone);
    if (name)  p.set('name', name);
    return apiFetch<{ deals: ClientOperation[] }>(`/api/clients/deals?${p.toString()}`);
  },

  fetchOpportunities: (force = false) =>
    apiFetch<OpportunitiesReport>(`/api/deals/opportunities${force ? '?force=1' : ''}`),

  addressAutocomplete: (input: string) =>
    apiFetch<{ ok: boolean; predictions: Array<{ label: string; place_id: string }> }>(`/api/maps/autocomplete?input=${encodeURIComponent(input)}`),

  toggleCar: (id: string, available: boolean) =>
    apiFetch<{ ok: boolean }>(`/api/cars/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ available }) }),

  carReminders: (id: string) =>
    apiFetch<{ reminders: CarReminder[] }>(`/api/cars/${encodeURIComponent(id)}/reminders`),
  addCarReminder: (id: string, data: { message: string; date: string; time?: string }) =>
    apiFetch<{ reminder: CarReminder }>(`/api/cars/${encodeURIComponent(id)}/reminders`, { method: 'POST', body: JSON.stringify(data) }),
  deleteCarReminder: (id: string, rid: string) =>
    apiFetch<{ ok: boolean }>(`/api/cars/${encodeURIComponent(id)}/reminders/${encodeURIComponent(rid)}`, { method: 'DELETE' }),

  updateCar: (id: string, data: Record<string, unknown>) =>
    apiFetch<{ car: Car }>(`/api/cars/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),

  addCarPhotos: (carName: string, images: string[]) =>
    apiFetch<{ text: string; count?: number; car?: string }>('/api/cars/photos', { method: 'POST', body: JSON.stringify({ car_name: carName, images }) }),
  // Galerie : photos d'une voiture du parc (1re = photo principale du site), suppression, photo principale
  carPhotos: (id: string) =>
    apiFetch<{ photos: Array<{ url: string; position: number }>; cover: string | null }>(`/api/cars/${encodeURIComponent(id)}/photos`),
  carPhotoDelete: (id: string, url: string) =>
    apiFetch<{ ok: boolean }>(`/api/cars/${encodeURIComponent(id)}/photos`, { method: 'DELETE', body: JSON.stringify({ url }) }),
  carPhotoCover: (id: string, url: string) =>
    apiFetch<{ ok: boolean }>(`/api/cars/${encodeURIComponent(id)}/photos/cover`, { method: 'POST', body: JSON.stringify({ url }) }),
  propertyPhotoCover: (id: string, url: string) =>
    apiFetch<{ ok: boolean }>(`/api/immo/properties/${encodeURIComponent(id)}/photos/cover`, { method: 'POST', body: JSON.stringify({ url }) }),
  vehiclePhotoCover: (id: string, url: string) =>
    apiFetch<{ ok: boolean }>(`/api/immo/vehicles-for-sale/${encodeURIComponent(id)}/photos/cover`, { method: 'POST', body: JSON.stringify({ url }) }),
  // Toutes les photos d'une annonce → album sur le Telegram de Kouider
  sendPhotosTelegram: (kind: 'car' | 'property' | 'sale', id: string) =>
    apiFetch<{ text: string }>('/api/cars/send-photos', { method: 'POST', body: JSON.stringify({ kind, id }) }),

  // Inspection avant/après (véhicule ou bien) — multi-photos, renvoie photos + dégâts localisés
  inspect: (kind: 'vehicle' | 'property', body: {
    mode: 'before' | 'after'; client_name: string; subject: string;
    images: string[]; mime?: string; session_id?: string; ref_id?: string;
  }) =>
    apiFetch<InspectionResult>(`/api/inspections/${kind}`, { method: 'POST', body: JSON.stringify(body) }),

  fetchInspections: (kind: 'vehicle' | 'property', client: string, subject: string, sessionId: string) => {
    const p = new URLSearchParams({ client, subject, session_id: sessionId });
    return apiFetch<{ states: InspectionState[] }>(`/api/inspections/${kind}?${p.toString()}`);
  },

  deleteBooking: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createBooking: (data: Record<string, unknown>) =>
    apiFetch<{ booking: Booking }>('/api/bookings', { method: 'POST', body: JSON.stringify(data) }),

  updateBooking: (id: string, data: Record<string, unknown>) =>
    apiFetch<{ booking: Booking }>(`/api/bookings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),

  fetchFinanceReport: (year: number, month?: number) =>
    apiFetch<FinancialReport>(`/api/finance/report?year=${year}${month != null ? `&month=${month}` : ''}`),

  clearCache: () =>
    apiFetch<{ deleted: number }>('/api/bi/cache/clear', { method: 'POST' }),

  fetchJobs: () =>
    apiFetch<{ jobs: Array<{ name: string; cron: string; next: number | null }> }>('/api/scheduler/jobs'),

  triggerJob: (name: string, force = true) =>
    fetch(`${BACKEND_URL}/api/scheduler/trigger/${encodeURIComponent(name)}?force=${force}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then(r => r.ok),

  health: () =>
    fetch(`${BACKEND_URL}/health`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json() as Promise<{ status: string; uptime?: number }>)
      .catch(() => ({ status: 'error' })),

  nexus: () =>
    fetch(`${BACKEND_URL}/api/nexus/live-status`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json() as Promise<{
        nexus_online: boolean; connected?: boolean;
        hostname?: string; cpu_percent?: number;
        ram_used_mb?: number; ram_total_mb?: number;
        uptime_s?: number; latency_ms?: number;
        os?: string; heartbeat_at?: string;
      }>)
      .catch(() => ({ nexus_online: false, connected: false, hostname: undefined as string | undefined })),

  shareLocation: (lat: number, lng: number) =>
    apiFetch<{ ok: boolean; location: { lat: number; lng: number; city?: string; country: string; updated_at: string } }>('/api/location', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    }),

  getMyLocation: () =>
    apiFetch<{ ok: boolean; location: { lat: number; lng: number; city?: string; country: string; updated_at: string } | null }>('/api/location'),

  getTravelTime: (destination: string, originLat?: number, originLng?: number, fromDepot?: boolean) => {
    const params = new URLSearchParams({ destination });
    if (fromDepot) params.set('from_depot', 'true');
    if (originLat !== undefined) params.set('origin_lat', String(originLat));
    if (originLng !== undefined) params.set('origin_lng', String(originLng));
    return apiFetch<{
      ok: boolean;
      distance_km?: number;
      travel_time_minutes?: number;
      traffic?: string;
      waze_link?: string;
      maps_link?: string;
      destination_label?: string;
      warning?: string;
      error?: string;
    }>(`/api/maps/travel-time?${params.toString()}`);
  },

  getAutocomplete: (input: string) =>
    apiFetch<{ ok: boolean; predictions: Array<{ label: string; place_id: string }>; warning?: string }>(
      `/api/maps/autocomplete?input=${encodeURIComponent(input)}`
    ),

  // ── NEXUS : piloter le PC depuis le téléphone ─────────────────────────────
  // Écran en direct : route à part (/api/nexus/live, sa propre limite), jamais de bascule de serveur ni de cache.

  nexusLive: <T = { ok: boolean; result?: string; error?: string }>(path: 'frame' | 'click' | 'drag' | 'scroll' | 'key', body: Record<string, unknown>) =>
    fetch(`${BACKEND_URL}/api/nexus/live/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
    }).then(r => r.json() as Promise<T>)
      .catch(e => ({ ok: false, error: e instanceof Error ? e.message : 'réseau' }) as T),

  // PC cloud (bureau virtuel du serveur) : quels PC sont joignables + ouvrir une adresse
  nexusTargets: () =>
    fetch(`${BACKEND_URL}/api/nexus/live/targets`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json() as Promise<{ ok: boolean; laptop: boolean; cloud: boolean; cloud_since?: string | null }>)
      .catch(() => ({ ok: false, laptop: false, cloud: false })),

  cloudOpen: (url: string) =>
    fetch(`${BACKEND_URL}/api/nexus/live/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ url, target: 'cloud' }),
    }).then(r => r.json() as Promise<{ ok: boolean; result?: string; error?: string }>)
      .catch(e => ({ ok: false, error: e instanceof Error ? e.message : 'réseau' })),

  // PC cloud : fichiers, presse-papiers, onglets, capture → Telegram (routes /api/nexus/live/*, Kouider seulement)
  cloud: <T = { ok: boolean; result?: string; error?: string }>(path: string, body?: Record<string, unknown>) =>
    fetch(`${BACKEND_URL}/api/nexus/live/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).then(r => r.json() as Promise<T>)
      .catch(e => ({ ok: false, error: e instanceof Error ? e.message : 'réseau' }) as T),

  cloudRestartBrowser: () =>
    fetch(`${BACKEND_URL}/api/nexus/live/restart-browser`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: '{}',
    }).then(r => r.json() as Promise<{ ok: boolean; result?: string; error?: string }>)
      .catch(e => ({ ok: false, error: e instanceof Error ? e.message : 'réseau' })),

  nexusSay: (command: string, confirmed = false) =>
    apiFetch<{ ok: boolean; text?: string; error?: string }>('/api/nexus/say', {
      method: 'POST', body: JSON.stringify({ command, confirmed }),
    }),

  nexusRemoteStatus: () =>
    apiFetch<{ ok: boolean; online: boolean; launcher: boolean; text: string }>('/api/nexus/remote-status'),

  nexusWakePc: () =>
    apiFetch<{ ok: boolean; text?: string; error?: string }>('/api/nexus/wake-pc', { method: 'POST' }),

  nexusUpdate: () =>
    apiFetch<{ ok: boolean; text?: string; error?: string }>('/api/nexus/update', { method: 'POST' }),

  nexusRestart: () =>
    apiFetch<{ ok: boolean; text?: string; error?: string }>('/api/nexus/soft-restart', { method: 'POST' }),
  // Jauges du PC (CPU / RAM / disque) et widgets poussés sur l'écran Nexus
  nexusSysinfo: () =>
    apiFetch<{ ok: boolean; cpu_percent?: number; ram_percent?: number; ram_used_mb?: number; ram_total_mb?: number; disk_percent?: number; disk_free_gb?: number; uptime_s?: number; hostname?: string; error?: string }>('/api/nexus/sysinfo', { method: 'POST' }),
  nexusWidget: (widget: 'disk' | 'weather' | 'bookings' | 'railway') =>
    apiFetch<{ ok: boolean; error?: string }>('/api/nexus/widget', { method: 'POST', body: JSON.stringify({ widget }) }),
  // Explorateur du PC portable (dossiers autorisés), fenêtres ouvertes, journal de Nexus
  pcFiles: (path?: string) =>
    apiFetch<{ ok: boolean; path?: string; entries?: Array<{ name: string; type: string; size?: number | null; modified?: string }>; error?: string }>('/api/nexus/os/file/list', { method: 'POST', body: JSON.stringify({ path }) }),
  pcFileSearch: (query: string, root?: string) =>
    apiFetch<{ ok: boolean; results?: Array<{ path: string; name: string; type: string }>; error?: string }>('/api/nexus/os/file/search', { method: 'POST', body: JSON.stringify({ query, root, max_results: 40 }) }),
  pcFileAction: (action: 'open' | 'send', path: string) =>
    apiFetch<{ ok: boolean; error?: string }>(`/api/nexus/os/file/${action}`, { method: 'POST', body: JSON.stringify({ path, caption: `📎 ${path.split(/[\\/]/).pop()} — depuis le PC` }) }),
  pcWindows: () =>
    apiFetch<{ ok: boolean; windows?: Array<{ pid: number; process: string; title: string }>; error?: string }>('/api/nexus/os/window/list'),
  pcWindowAction: (action: 'focus' | 'close', title: string) =>
    apiFetch<{ ok: boolean; error?: string }>(`/api/nexus/os/window/${action}`, { method: 'POST', body: JSON.stringify({ title }) }),
  nexusJournal: () =>
    apiFetch<{ ok: boolean; items: Array<{ at: string; text: string }> }>('/api/nexus/journal'),
  weather: () =>
    apiFetch<{ temperature: number; apparent_temp: number; humidity: number; wind_speed: number; condition: string; icon: string; is_day: boolean }>('/api/weather'),
};
