import { apiFetch, BACKEND_URL, getDeviceToken } from '../services/api.ts';

// Réseau commun aux jeux du couple (RUSH, L'ŒIL) : qui joue (Kouider = session Dzaryx, sa femme = jeton FORME),
// records et salle à deux (/api/forme/games…). Sans connexion : on joue seul, records gardés sur le téléphone.

export type Uid = 'kouider' | 'femme';
const FT = 'forme:token';

// Lien ?invite=… (depuis FORME de sa femme) : gardé dans l'adresse et le manifeste, sinon l'icône
// « écran d'accueil » d'iPhone (mémoire séparée de Safari) ouvrirait le jeu sans savoir qui joue.
export function bootIdentity(manifest: { name: string; short: string; color: string; icon: string }) {
  try {
    const t = new URLSearchParams(location.search).get('invite') ?? localStorage.getItem(FT);
    if (!t || getDeviceToken()) return;
    localStorage.setItem(FT, t);
    const start = `${location.origin}${location.pathname}?invite=${encodeURIComponent(t)}`;
    if (new URLSearchParams(location.search).get('invite') !== t) history.replaceState(null, '', start);
    const abs = (u: string) => `${location.origin}${u}`;
    const m = { id: `${location.pathname}?f`, name: manifest.name, short_name: manifest.short, start_url: start, scope: abs(location.pathname), display: 'fullscreen', orientation: 'portrait', background_color: manifest.color, theme_color: manifest.color, icons: [{ src: abs(manifest.icon), sizes: '512x512', type: 'image/png' }] };
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) link.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(m))}`;
  } catch { /* */ }
}

const formeToken = () => { try { return localStorage.getItem(FT); } catch { return null; } };
export const online = () => !!getDeviceToken() || !!formeToken();

async function call<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) };
  const t = getDeviceToken() ? null : formeToken();
  if (!t) return apiFetch<T>(`/api/forme${path}`, init);
  const r = await fetch(`${BACKEND_URL}/api/forme${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'x-forme-token': t } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`API ${r.status}: ${txt}`);
  return JSON.parse(txt) as T;
}

export interface Best { best: number; at: number; plays: number; last: number; wins: number }
export interface BoardView { me: Uid; names: Record<Uid, string>; board: Record<string, Partial<Record<Uid, Best>>> & { daily?: { date: string; scores: Partial<Record<Uid, number>> } } }
export interface RoomPlayer { ready: boolean; seen: number; state: Record<string, unknown> | null; done: boolean; score: number }
export interface Room { id: string; game: 'rush' | 'oeil' | 'gardiens' | 'resto' | 'folie'; events?: Array<{ from: Uid; at: number; ev: Record<string, unknown> }>; seed: number; mode: string; host: Uid; createdAt: number; players: Partial<Record<Uid, RoomPlayer>>; startAt: number | null; claims: Record<string, Uid>; ended: boolean; me: Uid; otherGone: boolean }
export type BuildingId = 'maison' | 'forge' | 'jardin' | 'phare' | 'fontaine' | 'tour';
export interface Island { crystals: number; b: Record<BuildingId, number>; night: Record<Uid, number>; best: Record<Uid, number>; log: Array<{ uid: Uid; text: string; at: number }> }
export interface IslandView { island: Island; names: Record<Uid, string>; costs: Record<BuildingId, number[]> }
export interface RoomView { now: number; room: Room | null }

export const games = {
  board: () => call<BoardView>('/games'),
  score: (game: string, score: number, date?: string) => call<{ record: boolean; beat: boolean; best: number }>('/games/score', { game, score, date }),
  peek: () => call<RoomView>('/games/room'),
  room: (action: string, extra: Record<string, unknown> = {}) => call<RoomView>('/games/room', { action, ...extra }),
  island: () => call<IslandView>('/games/island'),
  islandAct: (action: 'reward' | 'build', extra: Record<string, unknown>) => call<{ island: Island; names: Record<Uid, string> }>('/games/island', { action, ...extra }),
};

/** Écart horloge serveur → téléphone, pour un départ synchronisé au 1/10 s près. */
let skew = 0;
export const syncClock = (v: RoomView, sentAt: number) => { const rtt = Date.now() - sentAt; skew = v.now + rtt / 2 - Date.now(); };
export const serverNow = () => Date.now() + skew;
export const otherOf = (u: Uid): Uid => (u === 'kouider' ? 'femme' : 'kouider');

/** Records locaux (marchent même hors-ligne). */
export const local = {
  get: (k: string, d = 0) => { try { return Number(localStorage.getItem(`jeux:${k}`) ?? d) || d; } catch { return d; } },
  set: (k: string, v: number) => { try { localStorage.setItem(`jeux:${k}`, String(v)); } catch { /* */ } },
  json: <T,>(k: string, d: T): T => { try { const r = localStorage.getItem(`jeux:${k}`); return r ? JSON.parse(r) as T : d; } catch { return d; } },
  save: (k: string, v: unknown) => { try { localStorage.setItem(`jeux:${k}`, JSON.stringify(v)); } catch { /* */ } },
};

/** Générateur pseudo-aléatoire à graine : même graine = même piste / même image sur les deux téléphones. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const f = () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return Object.assign(f, {
    range: (a: number, b: number) => a + f() * (b - a),
    int: (a: number, b: number) => Math.floor(a + f() * (b - a + 1)),
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(f() * arr.length)]!,
    chance: (p: number) => f() < p,
  });
}
export type Rng = ReturnType<typeof rng>;

export const isAr = () => { try { return !!formeToken() && !getDeviceToken() && localStorage.getItem('jeux:lang') !== 'fr' || localStorage.getItem('jeux:lang') === 'ar'; } catch { return false; } };
export const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* */ } };

/** Bouton ✕ des jeux : retour à la page JEUX (si on vient d'elle) ou fermeture dans l'app Dzaryx. */
export const fromHub = () => new URLSearchParams(location.search).has('hub');
export function exitGame() {
  if (fromHub()) { const ft = getDeviceToken() ? null : formeToken(); location.href = `/ibrahim/jeux/${ft ? `?invite=${encodeURIComponent(ft)}` : ''}`; return; }
  window.parent.postMessage({ type: 'jeux:exit' }, '*');
}
