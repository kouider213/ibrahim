import { kvGet, kvSet } from './app-store.js';
import { getFormeProfile, type Uid } from './forme.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// Jeux du couple (RUSH = runner 3D, L'ŒIL = jeu des différences) : records de Kouider et de sa femme + une « salle »
// pour jouer à deux en direct (chacun sur son téléphone, même piste / même image, positions échangées toutes les ~250 ms).
// La salle vit en mémoire (2 joueurs seulement, rien d'important à garder si le serveur redémarre).

export type GameId = 'rush' | 'oeil:facile' | 'oeil:normal' | 'oeil:difficile' | 'oeil:daily';
const GAMES: GameId[] = ['rush', 'oeil:facile', 'oeil:normal', 'oeil:difficile', 'oeil:daily'];
const BOARD_KEY = 'games:board';
const MAX_SCORE = 50_000_000;

interface Best { best: number; at: number; plays: number; last: number; wins: number }
type Board = Partial<Record<GameId, Partial<Record<Uid, Best>>>> & { daily?: { date: string; scores: Partial<Record<Uid, number>> } };

async function readBoard(): Promise<Board> {
  try { return JSON.parse((await kvGet(BOARD_KEY)) ?? '{}') as Board; } catch { return {}; }
}
const other = (u: Uid): Uid => (u === 'kouider' ? 'femme' : 'kouider');
export async function playerNames(): Promise<Record<Uid, string>> {
  const f = await getFormeProfile('femme').catch(() => null);
  return { kouider: 'Kouider', femme: f?.name?.trim() || 'Fatima' };
}

export async function gamesBoard(uid: Uid) {
  return { me: uid, names: await playerNames(), board: await readBoard() };
}

/** Score d'une partie → record perso, duel avec l'autre, Telegram à Kouider quand sa femme le dépasse. */
export async function submitScore(uid: Uid, game: string, score: number, date?: string) {
  if (!GAMES.includes(game as GameId)) throw new Error('jeu inconnu');
  const g = game as GameId;
  const s = Math.max(0, Math.min(MAX_SCORE, Math.round(Number(score) || 0)));
  const b = await readBoard();
  const row = (b[g] ??= {});
  const mine = (row[uid] ??= { best: 0, at: 0, plays: 0, last: 0, wins: 0 });
  const theirs = row[other(uid)];
  const wasBehind = !!theirs && mine.best <= theirs.best;
  mine.plays++; mine.last = s;
  const record = s > mine.best;
  if (record) { mine.best = s; mine.at = Date.now(); }
  const beat = record && wasBehind && !!theirs && s > theirs.best && theirs.best > 0;
  if (g === 'oeil:daily' && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    if (b.daily?.date !== date) b.daily = { date, scores: {} };
    b.daily.scores[uid] = Math.max(b.daily.scores[uid] ?? 0, s);
  }
  await kvSet(BOARD_KEY, JSON.stringify(b));
  if (beat && uid === 'femme') {
    const n = await playerNames();
    const label = g === 'rush' ? 'RUSH' : `L'ŒIL (${g.split(':')[1]})`;
    await queueTelegramMessage(`🎮 ${n.femme} vient de battre ton record à ${label} : ${s.toLocaleString('fr-FR')} (toi : ${(theirs?.best ?? 0).toLocaleString('fr-FR')}). À toi de jouer 😏`, undefined, 'kouider', undefined, true).catch(() => {});
  }
  return { record, beat, best: mine.best, board: b };
}

// ── Salle à deux (en direct) ─────────────────────────────────────────────────
export interface RoomPlayer { ready: boolean; seen: number; state: Record<string, unknown> | null; done: boolean; score: number }
export interface Room {
  id: string; game: 'rush' | 'oeil'; seed: number; mode: string; host: Uid; createdAt: number;
  players: Partial<Record<Uid, RoomPlayer>>; startAt: number | null; claims: Record<string, Uid>; ended: boolean;
}
let room: Room | null = null;
const ROOM_TTL = 15 * 60_000;
const alive = () => { if (room && Date.now() - room.createdAt > ROOM_TTL * 4) room = null; return room; };

function view(uid: Uid) {
  const r = alive();
  const now = Date.now();
  if (!r) return { now, room: null };
  // Un joueur qui ne donne plus de nouvelles depuis 20 s est considéré parti
  const gone = (p?: RoomPlayer) => !p || now - p.seen > 20_000;
  return { now, room: { ...r, me: uid, otherGone: gone(r.players[other(uid)]) } };
}

export async function roomAction(uid: Uid, body: Record<string, unknown>) {
  const action = String(body.action ?? '');
  const now = Date.now();
  const r = alive();
  const p = (u: Uid): RoomPlayer => (r!.players[u] ??= { ready: false, seen: now, state: null, done: false, score: 0 });
  if (action === 'invite') {
    const game = body.game === 'oeil' ? 'oeil' : 'rush';
    room = {
      id: Math.random().toString(36).slice(2, 8), game, seed: Math.floor(Math.random() * 1e9), mode: String(body.mode ?? 'normal').slice(0, 20),
      host: uid, createdAt: now, players: { [uid]: { ready: false, seen: now, state: null, done: false, score: 0 } }, startAt: null, claims: {}, ended: false,
    };
    const n = await playerNames();
    // Prévenir l'autre : Kouider sur Telegram ; elle verra l'invitation à l'ouverture du jeu
    if (uid === 'femme') await queueTelegramMessage(`🎮 ${n.femme} t'invite à jouer à ${game === 'rush' ? 'RUSH' : "L'ŒIL"} — ouvre JEUX dans l'app !`, undefined, 'kouider', undefined, true).catch(() => {});
    return view(uid);
  }
  if (!r) return view(uid);
  if (action === 'leave') {
    delete r.players[uid];
    if (!Object.keys(r.players).length || r.host === uid && !r.startAt) room = null;
    return view(uid);
  }
  const me = p(uid); me.seen = now;
  if (action === 'join') { me.ready = false; }
  if (action === 'ready') {
    me.ready = true;
    const both = (['kouider', 'femme'] as Uid[]).every(u => r.players[u]?.ready);
    if (both && !r.startAt) r.startAt = now + 3800;   // compte à rebours commun
  }
  if (action === 'state') {
    if (body.state && typeof body.state === 'object') me.state = body.state as Record<string, unknown>;
    if (typeof body.score === 'number') me.score = Math.max(0, Math.min(MAX_SCORE, body.score));
    if (body.done === true) me.done = true;
  }
  if (action === 'claim' && r.game === 'oeil') {
    // Différence trouvée : la 1re personne qui touche la gagne
    const k = String(body.idx ?? '');
    if (k && !r.claims[k]) r.claims[k] = uid;
    me.score = Object.values(r.claims).filter(x => x === uid).length;
  }
  if (action === 'rematch') {
    r.seed = Math.floor(Math.random() * 1e9); r.startAt = null; r.claims = {}; r.ended = false;
    if (typeof body.mode === 'string') r.mode = body.mode.slice(0, 20);
    for (const pl of Object.values(r.players)) { if (pl) { pl.ready = false; pl.done = false; pl.score = 0; pl.state = null; } }
  }
  const ps = Object.values(r.players);
  if (r.startAt && ps.length === 2 && ps.every(x => x?.done)) r.ended = true;
  return view(uid);
}
export function roomPeek(uid: Uid) { const v = view(uid); if (v.room?.players[uid]) v.room.players[uid]!.seen = Date.now(); return v; }
