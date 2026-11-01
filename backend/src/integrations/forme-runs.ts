import { kvGet, kvSet, kvDel } from './app-store.js';
import { getFormeProfile, type Uid } from './forme.js';
import { localNow } from './morning-routine.js';

// 🏃 COURSE GPS de FORME (Kouider 01/11, « comme Strava ») : footing, marche, vélo, rando enregistrés au GPS du téléphone.
// Chaque profil (Kouider, sa femme, son ami) a SES sorties, jamais mélangées.
// Le téléphone envoie les points bruts ; TOUT est recalculé ici (une seule vérité) : distance, temps en mouvement,
// allure, splits au km, dénivelé, meilleurs efforts (400 m → marathon), records, kcal, séries pour les graphiques.
// Stockage : `<uid>:forme:runs` (résumés) + `<uid>:forme:run:<id>` (trace complète). Positions = privées (app_kv).

export type RunType = 'run' | 'walk' | 'bike' | 'hike';
export const RUN_TYPES: RunType[] = ['run', 'walk', 'bike', 'hike'];
/** [lat, lng, t (s depuis le départ), altitude (m) | null, précision (m)] */
export type Pt = [number, number, number, number | null, number];

export interface Split { km: number; dist: number; sec: number; pace: number; elev: number }
export interface Effort { label: string; m: number; sec: number; pr?: boolean }
export interface RunSummary {
  id: string; uid: Uid; type: RunType; title: string; note?: string; feel?: number;
  startedAt: number; date: string; dist: number; elapsed: number; moving: number;
  pace: number | null;          // s/km (moyenne en mouvement)
  speed: number;                // km/h moyenne en mouvement
  maxSpeed: number;             // km/h (lissée sur 10 s)
  elevGain: number; elevLoss: number; altMin: number | null; altMax: number | null;
  kcal: number; splits: Split[]; efforts: Effort[]; laps: Array<{ n: number; dist: number; sec: number; pace: number | null }>;
  poly: Array<[number, number]>;  // trace simplifiée (miniature)
  bbox: [number, number, number, number] | null;
  prs: string[];                // records battus pendant cette sortie
  ghostOf?: string;             // « refaire ce parcours » : sortie comparée
  // 01/11 « pro » (forme-runs-pro.ts)
  weather?: { temp: number; wind: number; code: number; label: string; e: string; rain: boolean } | null;
  shoeId?: string; cadence?: number; workout?: { id: string; title: string }; coach?: string;
}
export interface RunCfg { weekGoalKm: number; autoPause: boolean; voiceEvery: number; type: RunType; targetPace: number | null }
const DEFAULT_CFG: RunCfg = { weekGoalKm: 15, autoPause: true, voiceEvery: 1, type: 'run', targetPace: null };

const LIST_K = (u: Uid) => `${u}:forme:runs`;
const RUN_K = (u: Uid, id: string) => `${u}:forme:run:${id}`;
const CFG_K = (u: Uid) => `${u}:forme:runcfg`;

const readJson = async <T,>(k: string, fb: T): Promise<T> => { try { const r = await kvGet(k); return r ? JSON.parse(r) as T : fb; } catch { return fb; } };
export const TYPE_LABEL: Record<RunType, string> = { run: 'Course', walk: 'Marche', bike: 'Vélo', hike: 'Rando' };
// Vitesse mini pour compter « en mouvement » et vitesse maxi plausible (au-delà = saut GPS)
const MOVE_MIN: Record<RunType, number> = { run: 0.8, walk: 0.45, hike: 0.35, bike: 1.6 };
const JUMP_MAX: Record<RunType, number> = { run: 9, walk: 4.5, hike: 4.5, bike: 25 };
// kcal ≈ poids × km × facteur (ACSM, ordre de grandeur honnête) + dénivelé
const KCAL_KM: Record<RunType, number> = { run: 1.0, walk: 0.55, hike: 0.65, bike: 0.28 };
const EFFORTS: Array<[string, number]> = [['400 m', 400], ['1 km', 1000], ['1 mile', 1609], ['5 km', 5000], ['10 km', 10000], ['Semi', 21097], ['Marathon', 42195]];
const BIKE_EFFORTS: Array<[string, number]> = [['5 km', 5000], ['10 km', 10000], ['20 km', 20000], ['40 km', 40000], ['50 km', 50000], ['100 km', 100000]];

export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Douglas-Peucker (en mètres, approx. plane locale) */
function simplify(pts: Array<[number, number]>, tolM: number): Array<[number, number]> {
  if (pts.length < 3) return pts;
  const lat0 = pts[0]![0] * Math.PI / 180;
  const xy = pts.map(p => [p[1] * 111320 * Math.cos(lat0), p[0] * 110540] as const);
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = xy[s]!, [x2, y2] = xy[e]!;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    let best = -1, bi = -1;
    for (let i = s + 1; i < e; i++) { const [x, y] = xy[i]!; const d = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / L; if (d > best) { best = d; bi = i; } }
    if (best > tolM && bi > 0) { keep[bi] = 1; stack.push([s, bi], [bi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

interface Track { cum: number[]; t: number[]; mt: number[]; alt: Array<number | null>; moving: boolean[]; pts: Pt[] }
/** Nettoie la trace : précision, sauts GPS, pauses manuelles (pas de distance comptée à travers une pause). */
function clean(type: RunType, raw: Pt[], pauses: Array<[number, number]>): Track {
  const good = raw.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)
    .sort((a, b) => a[2] - b[2]);
  const accOk = good.filter(p => (p[4] ?? 99) <= 35);
  const src = accOk.length >= Math.max(2, good.length * 0.3) ? accOk : good;   // tout mauvais (forêt) : on garde quand même
  const inPause = (t: number) => pauses.some(([a, b]) => t > a && t <= b);
  const cum: number[] = [], t: number[] = [], alt: Array<number | null> = [], moving: boolean[] = [], pts: Pt[] = [];
  let last: Pt | null = null, d = 0, pausedSince = false;
  for (const p of src) {
    if (inPause(p[2])) { pausedSince = true; continue; }
    if (last) {
      const dt = p[2] - last[2];
      if (dt <= 0) continue;
      const seg = haversine([last[0], last[1]], [p[0], p[1]]);
      if (seg / dt > JUMP_MAX[type] && dt < 60) continue;          // saut GPS : on ignore ce point
      if (seg < 1.5 && dt < 20) continue;                            // bruit à l'arrêt
      if (!pausedSince) d += seg;
      moving.push(!pausedSince && seg / dt >= MOVE_MIN[type] && dt <= 45);
    } else moving.push(false);
    pausedSince = false;
    cum.push(d); t.push(p[2]); alt.push(p[3] != null && Number.isFinite(p[3]) ? p[3] : null); pts.push(p); last = p;
  }
  // temps en mouvement cumulé (splits façon Strava : les pauses ne comptent pas)
  const mt: number[] = []; for (let i = 0; i < t.length; i++) mt.push(i ? mt[i - 1]! + (moving[i] ? t[i]! - t[i - 1]! : 0) : 0);
  return { cum, t, mt, alt, moving, pts };
}

/** Meilleur temps sur une distance (fenêtre glissante, interpolée) */
function bestEffort(tr: Track, m: number): number | null {
  const { cum, t } = tr; const n = cum.length;
  if (!n || cum[n - 1]! < m) return null;
  let best = Infinity, j = 0;
  for (let i = 0; i < n; i++) {
    while (j < n && cum[j]! - cum[i]! < m) j++;
    if (j >= n) break;
    const over = cum[j]! - cum[i]! - m, segD = cum[j]! - cum[j - 1]!, segT = t[j]! - t[j - 1]!;
    const tEnd = t[j]! - (segD > 0 ? over / segD * segT : 0);
    best = Math.min(best, tEnd - t[i]!);
  }
  return Number.isFinite(best) ? Math.round(best) : null;
}

const timeAt = (tr: Track, m: number, useMoving = false): number | null => {
  const { cum } = tr; const t = useMoving ? tr.mt : tr.t;
  for (let i = 1; i < cum.length; i++) if (cum[i]! >= m) { const f = (m - cum[i - 1]!) / ((cum[i]! - cum[i - 1]!) || 1); return t[i - 1]! + f * (t[i]! - t[i - 1]!); }
  return null;
};
const smoothAlt = (alt: Array<number | null>): Array<number | null> => alt.map((_, i) => {
  const w = alt.slice(Math.max(0, i - 3), i + 4).filter((x): x is number => x != null);
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
});

export function computeRun(type: RunType, raw: Pt[], o: { pauses?: Array<[number, number]>; laps?: number[]; weightKg: number }) {
  const tr = clean(type, raw, o.pauses ?? []);
  const n = tr.cum.length;
  const dist = n ? Math.round(tr.cum[n - 1]!) : 0;
  const elapsed = raw.length ? Math.round(Math.max(...raw.map(p => p[2] || 0))) : 0;
  let moving = 0;
  for (let i = 1; i < n; i++) if (tr.moving[i]) moving += tr.t[i]! - tr.t[i - 1]!;
  moving = Math.round(Math.min(elapsed || moving, moving || elapsed));
  // Dénivelé : altitude lissée + hystérésis 3 m (le GPS du téléphone tremble)
  const sa = smoothAlt(tr.alt);
  let gain = 0, loss = 0, ref: number | null = null;
  for (const a of sa) { if (a == null) continue; if (ref == null) { ref = a; continue; } if (a - ref >= 3) { gain += a - ref; ref = a; } else if (ref - a >= 3) { loss += ref - a; ref = a; } }
  const alts = sa.filter((x): x is number => x != null);
  // Vitesse max sur 10 s
  let maxSp = 0;
  for (let i = 0, j = 0; i < n; i++) { while (j < n && tr.t[j]! - tr.t[i]! < 10) j++; if (j < n && tr.t[j]! - tr.t[i]! <= 25) maxSp = Math.max(maxSp, (tr.cum[j]! - tr.cum[i]!) / (tr.t[j]! - tr.t[i]!)); }
  maxSp = Math.min(maxSp, JUMP_MAX[type]);
  // Splits au km (vélo : tous les 5 km)
  const step = type === 'bike' ? 5000 : 1000;
  const splits: Split[] = [];
  let prevT = 0, prevAlt = sa.find(x => x != null) ?? null;
  for (let k = 1; k * step <= dist + (dist % step > step * 0.15 ? step : 0); k++) {
    const m = Math.min(k * step, dist);
    const tt = timeAt(tr, m, true) ?? tr.mt[n - 1]!;
    const idx = tr.cum.findIndex(c => c >= m); const altNow = idx >= 0 ? sa[idx] ?? null : sa[n - 1] ?? null;
    const dd = m - (k - 1) * step; const sec = Math.round(tt - prevT);
    if (dd > 0) splits.push({ km: k, dist: Math.round(dd), sec, pace: Math.round(sec / (dd / 1000)), elev: prevAlt != null && altNow != null ? Math.round(altNow - prevAlt) : 0 });
    prevT = tt; prevAlt = altNow ?? prevAlt;
    if (m >= dist) break;
  }
  const efforts: Effort[] = (type === 'bike' ? BIKE_EFFORTS : EFFORTS).map(([label, m]) => ({ label, m, sec: bestEffort(tr, m) ?? -1 })).filter(e => e.sec > 0);
  // Tours manuels (bouton « Tour »)
  const laps: RunSummary['laps'] = [];
  const marks = [...(o.laps ?? []).filter(x => Number.isFinite(x)).sort((a, b) => a - b), tr.t[n - 1] ?? 0];
  let lt = tr.t[0] ?? 0, ld = 0;
  if ((o.laps ?? []).length) for (const [i, mt] of marks.entries()) {
    const idx = tr.t.findIndex(x => x >= mt); const dAt = idx >= 0 ? tr.cum[idx]! : dist;
    const dd = dAt - ld, sec = Math.round(mt - lt);
    if (sec > 0) laps.push({ n: i + 1, dist: Math.round(dd), sec, pace: dd > 50 ? Math.round(sec / (dd / 1000)) : null });
    lt = mt; ld = dAt;
  }
  const lat = tr.pts.map(p => p[0]), lng = tr.pts.map(p => p[1]);
  // Séries pour les graphiques (~200 points) : distance, allure lissée, vitesse, altitude
  const series: Array<{ d: number; t: number; pace: number | null; kmh: number; alt: number | null }> = [];
  const every = Math.max(1, Math.floor(n / 200));
  for (let i = 0; i < n; i += every) {
    let j = i; while (j > 0 && tr.t[i]! - tr.t[j]! < 20) j--;
    const dd = tr.cum[i]! - tr.cum[j]!, dt = tr.t[i]! - tr.t[j]!;
    const v = dt > 0 ? dd / dt : 0;
    series.push({ d: Math.round(tr.cum[i]!), t: Math.round(tr.t[i]!), pace: v > MOVE_MIN[type] ? Math.round(1000 / v) : null, kmh: Math.round(v * 36) / 10, alt: sa[i] != null ? Math.round(sa[i]!) : null });
  }
  const kcal = Math.round(o.weightKg * (dist / 1000) * KCAL_KM[type] + o.weightKg * gain / 1000 * 2.5);
  return {
    dist, elapsed, moving, pace: dist > 100 && moving > 0 ? Math.round(moving / (dist / 1000)) : null,
    speed: moving > 0 ? Math.round(dist / moving * 36) / 10 : 0, maxSpeed: Math.round(maxSp * 36) / 10,
    elevGain: Math.round(gain), elevLoss: Math.round(loss), altMin: alts.length ? Math.round(Math.min(...alts)) : null, altMax: alts.length ? Math.round(Math.max(...alts)) : null,
    kcal, splits, efforts, laps,
    poly: simplify(tr.pts.map(p => [p[0], p[1]] as [number, number]), 6).map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5] as [number, number]).slice(0, 600),
    bbox: n ? [Math.min(...lat), Math.min(...lng), Math.max(...lat), Math.max(...lng)] as [number, number, number, number] : null,
    series, cum: tr.cum.map(Math.round), times: tr.t.map(Math.round),
    // Trace pour la carte, colorée par l'allure (≤ 800 points) : [lat, lng, s/km | null]
    line: (() => { const k = Math.max(1, Math.ceil(n / 800)); const out: Array<[number, number, number | null]> = [];
      for (let i = 0; i < n; i += k) { let j = i; while (j > 0 && tr.t[i]! - tr.t[j]! < 15) j--; const dt = tr.t[i]! - tr.t[j]!, v = dt > 0 ? (tr.cum[i]! - tr.cum[j]!) / dt : 0;
        out.push([Math.round(tr.pts[i]![0] * 1e6) / 1e6, Math.round(tr.pts[i]![1] * 1e6) / 1e6, v > MOVE_MIN[type] ? Math.round(1000 / v) : null]); }
      if (n && (n - 1) % k) out.push([tr.pts[n - 1]![0], tr.pts[n - 1]![1], null]);
      return out; })(),
  };
}

export async function runList(uid: Uid): Promise<RunSummary[]> { return readJson<RunSummary[]>(LIST_K(uid), []); }
export async function runCfg(uid: Uid): Promise<RunCfg> { return { ...DEFAULT_CFG, ...await readJson<Partial<RunCfg>>(CFG_K(uid), {}) }; }
export async function setRunCfg(uid: Uid, p: Partial<RunCfg>): Promise<RunCfg> {
  const c = await runCfg(uid);
  const n = { ...c,
    ...(p.weekGoalKm != null && Number.isFinite(Number(p.weekGoalKm)) ? { weekGoalKm: Math.min(300, Math.max(0, Number(p.weekGoalKm))) } : {}),
    ...(p.autoPause != null ? { autoPause: !!p.autoPause } : {}),
    ...(p.voiceEvery != null && [0, 0.5, 1, 2, 5].includes(Number(p.voiceEvery)) ? { voiceEvery: Number(p.voiceEvery) } : {}),
    ...(p.type && RUN_TYPES.includes(p.type) ? { type: p.type } : {}),
    ...('targetPace' in p ? { targetPace: p.targetPace && Number(p.targetPace) >= 120 && Number(p.targetPace) <= 1200 ? Math.round(Number(p.targetPace)) : null } : {}),
  };
  await kvSet(CFG_K(uid), JSON.stringify(n));
  return n;
}

const fmtPace = (s: number | null) => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km` : '—';
const fmtDur = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.round(s % 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
function autoTitle(type: RunType, at: number): string {
  const h = Number(new Date(at).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', hour: '2-digit', hour12: false }));
  const moment = h < 11 ? 'du matin' : h < 14 ? 'du midi' : h < 18 ? "de l'après-midi" : h < 22 ? 'du soir' : 'de nuit';
  return `${TYPE_LABEL[type]} ${moment}`;
}

export async function saveRun(uid: Uid, b: { type?: string; startedAt?: number; points?: unknown; pauses?: unknown; laps?: unknown; title?: string; note?: string; feel?: number; ghostOf?: string; shoeId?: string; cadence?: number; workoutId?: string }): Promise<{ run: RunSummary }> {
  const type: RunType = RUN_TYPES.includes(b.type as RunType) ? b.type as RunType : 'run';
  const pts = (Array.isArray(b.points) ? b.points : []).slice(0, 30000).map(p => (Array.isArray(p) ? [Number(p[0]), Number(p[1]), Number(p[2]), p[3] == null ? null : Number(p[3]), Number(p[4] ?? 20)] : null)).filter(Boolean) as Pt[];
  if (pts.length < 2) throw new Error('Pas assez de points GPS pour enregistrer la sortie');
  const pauses = (Array.isArray(b.pauses) ? b.pauses : []).filter((x): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite)).slice(0, 500);
  const laps = (Array.isArray(b.laps) ? b.laps : []).map(Number).filter(Number.isFinite).slice(0, 200);
  const p = await getFormeProfile(uid);
  const c = computeRun(type, pts, { pauses, laps, weightKg: p.weightKg });
  if (c.dist < 50) throw new Error('Moins de 50 m parcourus — sortie non enregistrée');
  const startedAt = Number(b.startedAt) || Date.now();
  const list = await runList(uid);
  // Records : meilleur effort de ce type jamais fait ?
  const prs: string[] = [];
  const efforts = c.efforts.map(e => {
    const prev = list.filter(r => r.type === type).flatMap(r => r.efforts.filter(x => x.m === e.m).map(x => x.sec));
    const pr = !prev.length || e.sec < Math.min(...prev);
    if (pr && prev.length) prs.push(`${e.label} en ${fmtDur(e.sec)}`);
    return { label: e.label, m: e.m, sec: e.sec, ...(pr ? { pr: true } : {}) };
  });
  const sameType = list.filter(r => r.type === type);
  if (sameType.length && c.dist > Math.max(...sameType.map(r => r.dist))) prs.push(`plus longue ${TYPE_LABEL[type].toLowerCase()} (${(c.dist / 1000).toFixed(2)} km)`);
  if (sameType.length && c.elevGain > 20 && c.elevGain > Math.max(...sameType.map(r => r.elevGain))) prs.push(`plus gros dénivelé (${c.elevGain} m)`);
  const id = `${startedAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const run: RunSummary = {
    id, uid, type, title: String(b.title ?? '').trim().slice(0, 60) || autoTitle(type, startedAt), ...(b.note ? { note: String(b.note).slice(0, 400) } : {}),
    ...(Number(b.feel) >= 1 && Number(b.feel) <= 5 ? { feel: Math.round(Number(b.feel)) } : {}),
    startedAt, date: new Date(startedAt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' }),
    dist: c.dist, elapsed: c.elapsed, moving: c.moving, pace: c.pace, speed: c.speed, maxSpeed: c.maxSpeed,
    elevGain: c.elevGain, elevLoss: c.elevLoss, altMin: c.altMin, altMax: c.altMax, kcal: c.kcal,
    splits: c.splits, efforts, laps: c.laps, poly: c.poly, bbox: c.bbox, prs,
    ...(typeof b.ghostOf === 'string' && list.some(r => r.id === b.ghostOf) ? { ghostOf: b.ghostOf } : {}),
    ...(typeof b.shoeId === 'string' && b.shoeId ? { shoeId: b.shoeId.slice(0, 20) } : {}),
    ...(Number(b.cadence) >= 60 && Number(b.cadence) <= 260 ? { cadence: Math.round(Number(b.cadence)) } : {}),
  };
  const pro = await import('./forme-runs-pro.js');
  run.weather = await pro.weatherAt(pts[0]![0], pts[0]![1], startedAt);
  if (typeof b.workoutId === 'string') {
    const plan = await pro.getPlan(uid); const w = plan?.workouts.find(x => x.id === b.workoutId);
    if (w) { run.workout = { id: w.id, title: w.title }; await pro.markWorkoutDone(uid, w.id, id); }
  }
  await kvSet(RUN_K(uid, id), JSON.stringify({ points: pts, pauses, laps }));
  await kvSet(LIST_K(uid), JSON.stringify([...list, run].sort((a, z) => a.startedAt - z.startedAt).slice(-500)));
  return { run };
}

export async function runDetail(uid: Uid, id: string) {
  const run = (await runList(uid)).find(r => r.id === id);
  if (!run) return null;
  const raw = await readJson<{ points: Pt[]; pauses: Array<[number, number]>; laps: number[] }>(RUN_K(uid, id), { points: [], pauses: [], laps: [] });
  const p = await getFormeProfile(uid);
  const c = computeRun(run.type, raw.points, { pauses: raw.pauses, laps: raw.laps, weightKg: p.weightKg });
  const route = (await import('./forme-runs-pro.js')).routeRanking(await runList(uid), run);
  return { run, track: c.line, series: c.series, ghost: { cum: c.cum, t: c.times }, route };
}

export async function updateRun(uid: Uid, id: string, patch: { title?: string; note?: string; feel?: number; type?: string; shoeId?: string; coach?: string }): Promise<RunSummary | null> {
  const list = await runList(uid);
  const r = list.find(x => x.id === id); if (!r) return null;
  if (typeof patch.title === 'string' && patch.title.trim()) r.title = patch.title.trim().slice(0, 60);
  if (typeof patch.note === 'string') r.note = patch.note.slice(0, 400);
  if (Number(patch.feel) >= 1 && Number(patch.feel) <= 5) r.feel = Math.round(Number(patch.feel));
  if (patch.type && RUN_TYPES.includes(patch.type as RunType)) r.type = patch.type as RunType;
  if (typeof patch.shoeId === 'string') { if (patch.shoeId) r.shoeId = patch.shoeId.slice(0, 20); else delete r.shoeId; }
  if (typeof patch.coach === 'string') r.coach = patch.coach.slice(0, 1500);
  await kvSet(LIST_K(uid), JSON.stringify(list));
  return r;
}
export async function deleteRun(uid: Uid, id: string): Promise<void> {
  await kvSet(LIST_K(uid), JSON.stringify((await runList(uid)).filter(r => r.id !== id)));
  await kvDel(RUN_K(uid, id)).catch(() => {});
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (d: string) => { const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; return addDays(d, -wd); };

/** Tableau de bord : totaux semaine / mois / année / tout, 12 semaines, records, série de semaines, objectif */
export async function runStats(uid: Uid, type?: RunType) {
  const all = await runList(uid);
  const list = type ? all.filter(r => r.type === type) : all;
  const today = localNow().date, mon = mondayOf(today);
  const sum = (rs: RunSummary[]) => ({ n: rs.length, km: Math.round(rs.reduce((a, r) => a + r.dist, 0) / 100) / 10, sec: rs.reduce((a, r) => a + r.moving, 0), elev: rs.reduce((a, r) => a + r.elevGain, 0), kcal: rs.reduce((a, r) => a + r.kcal, 0) });
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(mon, (i - 11) * 7)).map(w => ({ week: w, ...sum(list.filter(r => r.date >= w && r.date < addDays(w, 7))) }));
  let streakWeeks = 0;
  for (let i = weeks.length - 1; i >= 0; i--) { if (weeks[i]!.n) streakWeeks++; else if (i < weeks.length - 1) break; }
  const records: Array<{ label: string; m: number; sec: number; runId: string; date: string; type: RunType }> = [];
  for (const t of RUN_TYPES) for (const [label, m] of (t === 'bike' ? BIKE_EFFORTS : EFFORTS)) {
    let best: (typeof records)[number] | null = null;
    for (const r of all.filter(x => x.type === t)) for (const e of r.efforts) if (e.m === m && (!best || e.sec < best.sec)) best = { label, m, sec: e.sec, runId: r.id, date: r.date, type: t };
    if (best) records.push(best);
  }
  const longest = RUN_TYPES.map(t => all.filter(r => r.type === t).sort((a, b) => b.dist - a.dist)[0]).filter(Boolean).map(r => ({ type: r!.type, km: Math.round(r!.dist / 100) / 10, runId: r!.id, date: r!.date }));
  const cfg = await runCfg(uid);
  const week = sum(list.filter(r => r.date >= mon));
  // Jours actifs sur 6 mois (calendrier façon GitHub)
  const days: Record<string, number> = {};
  for (const r of list) if (r.date >= addDays(today, -182)) days[r.date] = Math.round(((days[r.date] ?? 0) + r.dist / 1000) * 10) / 10;
  // Allure moyenne qui progresse ? (4 dernières semaines vs 4 d'avant, course seulement)
  const runsOnly = all.filter(r => r.type === 'run' && r.pace);
  const avgPace = (rs: RunSummary[]) => { const d = rs.reduce((a, r) => a + r.dist, 0); return d ? Math.round(rs.reduce((a, r) => a + r.moving, 0) / (d / 1000)) : null; };
  const pro = await import('./forme-runs-pro.js');
  const fitness = pro.fitnessFrom(all, today);
  const load = pro.trainingLoad(all, today, fitness?.paces.threshold ?? null);
  const [plan, shoes] = await Promise.all([pro.getPlan(uid), pro.shoes(uid)]);
  return {
    fitness, load: { ...load, series: load.series.filter((_, i) => i % 2 === 1 || i === load.series.length - 1) }, challenges: pro.challenges(all, today), plan: pro.planView(plan, today), shoes,
    cfg, week: { ...week, goalKm: cfg.weekGoalKm, pct: cfg.weekGoalKm ? Math.min(100, Math.round(week.km / cfg.weekGoalKm * 100)) : 0 },
    month: sum(list.filter(r => r.date.slice(0, 7) === today.slice(0, 7))), year: sum(list.filter(r => r.date.slice(0, 4) === today.slice(0, 4))), total: sum(list),
    weeks, streakWeeks, records, longest, days,
    paceTrend: { last4: avgPace(runsOnly.filter(r => r.date >= addDays(today, -28))), prev4: avgPace(runsOnly.filter(r => r.date < addDays(today, -28) && r.date >= addDays(today, -56))) },
    recent: list.slice(-30).reverse(),
  };
}

/** Une ligne pour le dossier de Dzaryx (Kouider seulement) */
export async function runText(uid: Uid = 'kouider'): Promise<string> {
  const s = await runStats(uid).catch(() => null);
  if (!s || !s.total.n) return '';
  const last = s.recent[0]!;
  return `COURSE GPS (FORME) : semaine ${s.week.km} km / objectif ${s.week.goalKm} km (${s.week.n} sorties) · dernière : ${last.date} ${TYPE_LABEL[last.type]} ${(last.dist / 1000).toFixed(2)} km en ${fmtDur(last.moving)} (${fmtPace(last.pace)}, D+ ${last.elevGain} m)${last.prs.length ? ` · records : ${last.prs.join(', ')}` : ''}.`;
}

/** Points GPS bruts d'une sortie (export GPX) */
export async function runPoints(uid: Uid, id: string): Promise<Pt[]> {
  return (await readJson<{ points: Pt[] }>(RUN_K(uid, id), { points: [] })).points;
}
