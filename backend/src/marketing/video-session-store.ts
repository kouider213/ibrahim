export interface VideoSession {
  id:          string;
  carName:     string;
  carImageUrl: string | null;
  carId?:      string;
  script:      string;
  videoBuffer: Buffer | null;  // the last MP4
  audioBuffer: Buffer | null;  // the last voice MP3
  prompt:      string;         // the Runway/Kling prompt used
  provider:    string;         // 'Runway Gen-4 Turbo' | 'Kling 1.6' | ...
  background:  string;         // background effect used
  scenario:    string;         // scenario type if any
  caption:     string;
  hashtags:    string[];
  pendingId:   string;
  createdAt:   string;
}

const _sessions = new Map<string, VideoSession>();
let _latestSessionId: string | null = null;

export function saveVideoSession(session: Omit<VideoSession, 'id' | 'createdAt'>): VideoSession {
  const id = `vsess_${Date.now()}`;
  const full: VideoSession = { ...session, id, createdAt: new Date().toISOString() };
  _sessions.set(id, full);
  _latestSessionId = id;
  // keep only last 10 sessions
  if (_sessions.size > 10) {
    const oldest = [..._sessions.keys()][0];
    _sessions.delete(oldest);
  }
  return full;
}

export function getLatestVideoSession(): VideoSession | null {
  if (!_latestSessionId) return null;
  return _sessions.get(_latestSessionId) ?? null;
}

export function getVideoSessionById(id: string): VideoSession | null {
  return _sessions.get(id) ?? null;
}
