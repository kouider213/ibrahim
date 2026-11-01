import { randomBytes } from 'node:crypto';
import { kvGet, kvSet, kvDel } from './app-store.js';
import { getFormeProfile, type Uid } from './forme.js';
import { localNow } from './morning-routine.js';
import { createAnthropic } from './anthropic-compat.js';
import { runList, haversine, TYPE_LABEL, type RunSummary, type RunType, type Pt } from './forme-runs.js';

// 🏆 COURSE GPS « PRO » (01/11, après l'analyse des 20 applis : Strava, Garmin, Runna, Nike Run Club, Komoot…).
// Ce que les meilleures font, ici gratuit et sans montre :
//  · VO2max estimé + prédictions de course (Daniels/VDOT, comme Garmin/Runalyze)
//  · Charge d'entraînement : forme / fatigue / fraîcheur (CTL/ATL/TSB, comme « Fitness » de Strava Premium)
//  · Plans d'entraînement guidés 0→5 km, 5 km, 10 km, semi (comme Runna / Nike Run Club), séances fractionnées avec voix
//  · « Mes parcours » : sorties sur le même trajet reconnues toutes seules + classement perso (segments de Strava)
//  · Météo au départ, chaussures (km d'usure), défis du mois, export GPX, analyse du coach, suivi en direct (Beacon)
// Données privées : app_kv uniquement.

const read = async <T,>(k: string, fb: T): Promise<T> => { try { const r = await kvGet(k); return r ? JSON.parse(r) as T : fb; } catch { return fb; } };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fmtDur = (s: number) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtPace = (s: number) => { const r = Math.round(s); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };

// ───────────────────────── VDOT (Jack Daniels) ─────────────────────────
function vo2At(vMetersPerMin: number) { return -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin ** 2; }
function pctMax(tMin: number) { return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin); }
export function vdotOf(m: number, sec: number): number { const t = sec / 60; return vo2At(m / t) / pctMax(t); }
/** Temps prévu sur une distance pour un VDOT donné (bissection) */
export function predict(vdot: number, m: number): number {
  let lo = m / 1000 * 120, hi = m / 1000 * 1200;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (vdotOf(m, mid) > vdot) lo = mid; else hi = mid; }
  return Math.round((lo + hi) / 2);
}
/** Allures d'entraînement (s/km) à partir du VDOT */
export function trainingPaces(vdot: number) {
  const paceAt = (pct: number) => { // vitesse où VO2 = pct × VDOT
    const target = vdot * pct; let lo = 50, hi = 500;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (vo2At(mid) < target) lo = mid; else hi = mid; }
    return Math.round(1000 / ((lo + hi) / 2) * 60);
  };
  return { easy: paceAt(0.68), marathon: paceAt(0.8), threshold: paceAt(0.88), interval: paceAt(0.98), rep: paceAt(1.05) };
}

const RACES: Array<[string, number]> = [['5 km', 5000], ['10 km', 10000], ['Semi', 21097], ['Marathon', 42195]];

/** VO2max estimé : meilleur VDOT des 90 derniers jours (efforts ≥ 1 mile, course seulement) */
export function fitnessFrom(runs: RunSummary[], today: string) {
  const recent = runs.filter(r => r.type === 'run' && r.date >= addDays(today, -90));
  let best: { vdot: number; label: string; sec: number; date: string } | null = null;
  for (const r of recent) for (const e of r.efforts) if (e.m >= 1609 && e.sec > 0) { const v = vdotOf(e.m, e.sec); if (v > 20 && v < 85 && (!best || v > best.vdot)) best = { vdot: v, label: e.label, sec: e.sec, date: r.date }; }
  // pas d'effort ≥ 1 mile : la sortie entière la plus rapide ≥ 1 km (moins fiable)
  if (!best) for (const r of recent) if (r.dist >= 1000 && r.moving > 0) { const v = vdotOf(r.dist, r.moving); if (v > 20 && v < 85 && (!best || v > best.vdot)) best = { vdot: v, label: `${(r.dist / 1000).toFixed(1)} km`, sec: r.moving, date: r.date }; }
  if (!best) return null;
  const vdot = Math.round(best.vdot * 10) / 10;
  return { vdot, from: best, predictions: RACES.map(([label, m]) => ({ label, m, sec: predict(vdot, m) })), paces: trainingPaces(vdot) };
}

// ───────────────────────── Charge d'entraînement ─────────────────────────
/** Charge d'une sortie (≈ rTSS) : 1 h au seuil = 100. Marche/rando/vélo : barème par heure. */
export function runLoad(r: RunSummary, thresholdPace: number | null): number {
  const h = r.moving / 3600;
  if (r.type === 'run' && r.pace && thresholdPace) { const IF = Math.min(1.25, thresholdPace / r.pace); return Math.round(h * IF * IF * 100 + r.elevGain / 10); }
  const perH: Record<RunType, number> = { run: 65, walk: 25, hike: 40, bike: 45 };
  return Math.round(h * perH[r.type] + r.elevGain / 15);
}
export function trainingLoad(runs: RunSummary[], today: string, thresholdPace: number | null) {
  const byDay: Record<string, number> = {};
  for (const r of runs) byDay[r.date] = (byDay[r.date] ?? 0) + runLoad(r, thresholdPace);
  const start = addDays(today, -119);
  let ctl = 0, atl = 0; const series: Array<{ date: string; ctl: number; atl: number; tsb: number; load: number }> = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const l = byDay[d] ?? 0;
    const tsb = ctl - atl;   // fraîcheur du matin = avant la séance du jour
    ctl += (l - ctl) / 42; atl += (l - atl) / 7;
    series.push({ date: d, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, tsb: Math.round(tsb * 10) / 10, load: l });
  }
  const last = series[series.length - 1]!;
  const prev = series[series.length - 8];
  const ramp = prev ? Math.round((last.ctl - prev.ctl) * 10) / 10 : 0;
  const tsb = last.ctl - last.atl;
  const status = !last.ctl && !last.atl ? 'Pas encore de données' : tsb > 15 ? 'Très frais — idéal pour une course ou un record' : tsb > 3 ? 'Frais — prêt pour une séance dure' : tsb > -10 ? 'Équilibré — tu progresses' : tsb > -25 ? 'Fatigué — fais une sortie facile' : 'Très fatigué — repos ou marche, risque de blessure';
  const warn = ramp > 8 ? `Charge en hausse de ${ramp} en 7 jours : trop vite (> 8), risque de blessure.` : null;
  return { series: series.slice(-90), ctl: last.ctl, atl: last.atl, tsb: Math.round(tsb * 10) / 10, ramp, status, warn };
}

// ───────────────────────── Mes parcours (segments perso) ─────────────────────────
const sameRoute = (a: RunSummary, b: RunSummary) => {
  if (a.type !== b.type || !a.poly.length || !b.poly.length) return false;
  if (Math.abs(a.dist - b.dist) > Math.max(250, a.dist * 0.08)) return false;
  const s = haversine(a.poly[0]!, b.poly[0]!), e = haversine(a.poly[a.poly.length - 1]!, b.poly[b.poly.length - 1]!);
  if (s > 200 || e > 200) return false;
  // la moitié des points de a doivent être à < 60 m d'un point de b
  const step = Math.max(1, Math.floor(a.poly.length / 25)); let ok = 0, n = 0;
  for (let i = 0; i < a.poly.length; i += step) { n++; if (b.poly.some(q => haversine(a.poly[i]!, q) < 60)) ok++; }
  return n > 0 && ok / n >= 0.75;
};
export function routeRanking(runs: RunSummary[], run: RunSummary) {
  const same = runs.filter(r => r.id === run.id || sameRoute(run, r)).sort((a, b) => a.moving - b.moving);
  if (same.length < 2) return null;
  return { count: same.length, rank: same.findIndex(r => r.id === run.id) + 1, best: { id: same[0]!.id, sec: same[0]!.moving, date: same[0]!.date },
    list: same.slice(0, 10).map(r => ({ id: r.id, date: r.date, sec: r.moving, pace: r.pace })) };
}

// ───────────────────────── Défis & badges ─────────────────────────
export function challenges(runs: RunSummary[], today: string) {
  const month = today.slice(0, 7);
  const m = runs.filter(r => r.date.slice(0, 7) === month);
  const kmMonth = m.reduce((a, r) => a + r.dist, 0) / 1000;
  const elevMonth = m.reduce((a, r) => a + r.elevGain, 0);
  const activeDays = new Set(m.map(r => r.date)).size;
  const tiers = (v: number, steps: number[]) => { const next = steps.find(s => v < s) ?? steps[steps.length - 1]!; return { v: Math.round(v * 10) / 10, next, pct: Math.min(100, Math.round(v / next * 100)), done: steps.filter(s => v >= s) }; };
  const all = runs;
  const ever = (f: (r: RunSummary) => boolean) => all.some(f);
  const badges = [
    { id: 'first', e: '👟', l: '1re sortie', ok: all.length > 0 },
    { id: '5k', e: '🎽', l: '5 km d\'un coup', ok: ever(r => r.dist >= 5000 && r.type === 'run') },
    { id: '10k', e: '🔟', l: '10 km d\'un coup', ok: ever(r => r.dist >= 10000 && r.type === 'run') },
    { id: 'semi', e: '🥈', l: 'Semi-marathon', ok: ever(r => r.dist >= 21097 && r.type === 'run') },
    { id: 'early', e: '🌅', l: 'Lève-tôt (avant 7 h)', ok: ever(r => new Date(r.startedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', hour: '2-digit', hour12: false }) < '07') },
    { id: 'night', e: '🌙', l: 'Sortie de nuit (après 21 h)', ok: ever(r => new Date(r.startedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', hour: '2-digit', hour12: false }) >= '21') },
    { id: 'climb', e: '⛰️', l: '100 m de D+ en une sortie', ok: ever(r => r.elevGain >= 100) },
    { id: 'rain', e: '🌧️', l: 'Sorti sous la pluie', ok: ever(r => !!r.weather?.rain) },
    { id: 'cold', e: '🥶', l: 'Sorti sous 3 °C', ok: ever(r => r.weather != null && r.weather.temp <= 3) },
    { id: 'pr', e: '🏆', l: '1er record battu', ok: ever(r => r.prs.length > 0) },
    { id: '100k', e: '💯', l: '100 km au total', ok: all.reduce((a, r) => a + r.dist, 0) >= 100_000 },
    { id: 'plan', e: '📋', l: 'Séance de plan réussie', ok: ever(r => !!r.workout) },
  ];
  return { month, km: tiers(kmMonth, [10, 25, 50, 100, 150, 200]), elev: tiers(elevMonth, [100, 250, 500, 1000, 2000]), days: tiers(activeDays, [4, 8, 12, 16, 20]), badges };
}

// ───────────────────────── Météo au départ (Open-Meteo, gratuit) ─────────────────────────
export interface RunWeather { temp: number; wind: number; code: number; label: string; e: string; rain: boolean }
const WMO: Array<[number[], string, string]> = [
  [[0], 'Ciel dégagé', '☀️'], [[1, 2], 'Peu nuageux', '🌤️'], [[3], 'Couvert', '☁️'], [[45, 48], 'Brouillard', '🌫️'],
  [[51, 53, 55, 56, 57], 'Bruine', '🌦️'], [[61, 63, 65, 66, 67, 80, 81, 82], 'Pluie', '🌧️'], [[71, 73, 75, 77, 85, 86], 'Neige', '🌨️'], [[95, 96, 99], 'Orage', '⛈️'],
];
export async function weatherAt(lat: number, lng: number, at: number): Promise<RunWeather | null> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&hourly=temperature_2m,weather_code,wind_speed_10m&past_days=2&forecast_days=1&timezone=UTC`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = await r.json() as { hourly?: { time: string[]; temperature_2m: number[]; weather_code: number[]; wind_speed_10m: number[] } };
    const h = j.hourly; if (!h?.time.length) return null;
    const want = new Date(at).toISOString().slice(0, 13);
    let i = h.time.findIndex(t => t.slice(0, 13) === want); if (i < 0) i = h.time.length - 1;
    const code = h.weather_code[i] ?? 0; const w = WMO.find(([cs]) => cs.includes(code)) ?? WMO[0]!;
    return { temp: Math.round(h.temperature_2m[i] ?? 0), wind: Math.round(h.wind_speed_10m[i] ?? 0), code, label: w[1], e: w[2], rain: code >= 51 && code < 70 || code >= 80 };
  } catch { return null; }
}

// ───────────────────────── Chaussures ─────────────────────────
export interface Shoe { id: string; name: string; maxKm: number; retired?: boolean; at: number }
const SHOES_K = (u: Uid) => `${u}:forme:shoes`;
export async function shoes(uid: Uid) {
  const list = await read<Shoe[]>(SHOES_K(uid), []);
  const runs = await runList(uid);
  return list.map(s => { const km = Math.round(runs.filter(r => r.shoeId === s.id).reduce((a, r) => a + r.dist, 0) / 100) / 10; return { ...s, km, pct: Math.min(100, Math.round(km / (s.maxKm || 700) * 100)) }; });
}
export async function shoeAction(uid: Uid, b: { action?: string; id?: string; name?: string; maxKm?: number }) {
  const list = await read<Shoe[]>(SHOES_K(uid), []);
  if (b.action === 'add' && b.name?.trim()) list.push({ id: randomBytes(4).toString('hex'), name: b.name.trim().slice(0, 40), maxKm: Math.min(2000, Math.max(100, Number(b.maxKm) || 700)), at: Date.now() });
  if (b.action === 'retire') { const s = list.find(x => x.id === b.id); if (s) s.retired = !s.retired; }
  if (b.action === 'delete') { const i = list.findIndex(x => x.id === b.id); if (i >= 0) list.splice(i, 1); }
  await kvSet(SHOES_K(uid), JSON.stringify(list));
  return shoes(uid);
}

// ───────────────────────── Plans d'entraînement guidés ─────────────────────────
export type StepKind = 'warm' | 'run' | 'rec' | 'cool' | 'walk';
export interface Step { kind: StepKind; sec?: number; m?: number; pace?: number | null; label: string }
export interface Workout { id: string; date: string; week: number; title: string; kind: 'easy' | 'long' | 'tempo' | 'interval' | 'walkrun' | 'race'; desc: string; steps: Step[]; km: number; done?: string }
export interface Plan { id: string; goal: PlanGoal; start: string; race: string; days: number[]; vdot: number | null; paces: ReturnType<typeof trainingPaces> | null; weeks: number; workouts: Workout[]; at: number }
export type PlanGoal = 'start5k' | '5k' | '10k' | 'semi';
const PLAN_K = (u: Uid) => `${u}:forme:runplan`;
export const GOAL_LABEL: Record<PlanGoal, string> = { start5k: 'Débuter : 0 → 5 km', '5k': '5 km plus vite', '10k': '10 km', semi: 'Semi-marathon' };

const st = (kind: StepKind, o: { sec?: number; m?: number; pace?: number | null }, label: string): Step => ({ kind, ...o, label });

export function buildWorkouts(goal: PlanGoal, weeks: number, days: number[], start: string, P: ReturnType<typeof trainingPaces> | null): Workout[] {
  const out: Workout[] = [];
  const mondays = Array.from({ length: weeks }, (_, w) => addDays(start, w * 7));
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).slice(0, 5);
  for (let w = 0; w < weeks; w++) {
    const prog = weeks > 1 ? w / (weeks - 1) : 1;
    const taper = w === weeks - 1, deload = !taper && w > 0 && (w + 1) % 4 === 0;
    const k = taper ? 0.6 : deload ? 0.75 : 1;
    const daysOfWeek = sorted.map(d => addDays(mondays[w]!, (d + 6) % 7));
    const sess: Array<Omit<Workout, 'id' | 'date' | 'week'>> = [];
    if (goal === 'start5k') {
      // Course/marche alternées, du 1 min de course au 30 min d'affilée (style « Couch to 5K »)
      const runMin = Math.round(1 + prog * 29), walkMin = Math.max(0, Math.round(2 - prog * 2));
      for (let i = 0; i < Math.min(3, sorted.length); i++) {
        if (taper && i === sorted.length - 1 || taper && i === 2) { sess.push({ title: 'Ton premier 5 km !', kind: 'race', desc: 'Le jour J : 5 km à ton rythme, sans t\'arrêter.', steps: [st('warm', { sec: 300 }, 'Marche rapide d\'échauffement'), st('run', { m: 5000 }, '5 km, sans t\'arrêter'), st('cool', { sec: 300 }, 'Marche pour récupérer')], km: 5.5 }); continue; }
        const reps = walkMin ? Math.max(2, Math.round(24 / (runMin + walkMin))) : 1;
        const steps: Step[] = [st('warm', { sec: 300 }, 'Marche rapide d\'échauffement')];
        for (let r = 0; r < reps; r++) { steps.push(st('run', { sec: Math.round(runMin * 60 * k) }, `Course ${runMin} min, tranquille`)); if (walkMin && r < reps - 1) steps.push(st('walk', { sec: walkMin * 60 }, `Marche ${walkMin} min`)); }
        steps.push(st('cool', { sec: 300 }, 'Marche pour récupérer'));
        sess.push({ title: walkMin ? `${reps} × ${runMin} min de course` : `${Math.round(runMin * k)} min de course continue`, kind: 'walkrun', desc: 'Allure où tu peux parler. Si c\'est dur, ralentis — ne t\'arrête pas.', steps, km: Math.round(reps * runMin * 0.15 * 10) / 10 });
      }
    } else {
      const base = { '5k': [4, 6, 8], '10k': [5, 8, 12], semi: [6, 10, 18] }[goal];
      const peakLong = base[2]! * (0.6 + 0.4 * prog) * k;
      const easyKm = Math.round(base[0]! * (0.8 + 0.4 * prog) * k * 2) / 2;
      const E = P?.easy ?? null, T = P?.threshold ?? null, I = P?.interval ?? null, R = P?.rep ?? null;
      const quality = (i: number): Omit<Workout, 'id' | 'date' | 'week'> => {
        if (taper && i === 0) return { title: `Jour de course : ${GOAL_LABEL[goal]}`, kind: 'race', desc: 'Pars prudemment le 1er km, accélère sur la fin.', steps: [st('warm', { sec: 600 }, 'Échauffement très facile'), st('run', { m: { '5k': 5000, '10k': 10000, semi: 21097 }[goal] }, 'La course !'), st('cool', { sec: 300 }, 'Retour au calme')], km: { '5k': 7, '10k': 12, semi: 23 }[goal] };
        if (w % 2 === 0) { // fractionné
          const n = Math.round((goal === '5k' ? 5 : goal === '10k' ? 5 : 4) + prog * 3); const m = goal === 'semi' ? 1000 : goal === '10k' ? 800 : 400;
          const steps: Step[] = [st('warm', { sec: 600, pace: E }, 'Échauffement facile')];
          for (let r = 0; r < n; r++) { steps.push(st('run', { m, pace: m <= 400 ? R : I }, `Fractionné ${r + 1}/${n} : ${m} m vite`)); if (r < n - 1) steps.push(st('rec', { sec: m <= 400 ? 90 : 120 }, 'Récupération en trottinant')); }
          steps.push(st('cool', { sec: 300, pace: E }, 'Retour au calme'));
          return { title: `${n} × ${m} m`, kind: 'interval', desc: 'Fractionné : vite mais régulier, la dernière aussi rapide que la première.', steps, km: Math.round((n * m + 3000) / 100) / 10 };
        }
        const tMin = Math.round((goal === 'semi' ? 20 : 12) + prog * (goal === 'semi' ? 20 : 13));
        return { title: `Tempo ${tMin} min`, kind: 'tempo', desc: 'Allure « confortablement dure » : tu peux dire 3-4 mots, pas plus.', steps: [st('warm', { sec: 600, pace: E }, 'Échauffement facile'), st('run', { sec: tMin * 60, pace: T }, `${tMin} min au seuil`), st('cool', { sec: 300, pace: E }, 'Retour au calme')], km: Math.round((tMin * 60 / (T ?? 330) + 2.5) * 10) / 10 };
      };
      const n = sorted.length;
      for (let i = 0; i < n; i++) {
        if (taper && i === n - 1) sess.push(quality(0));                        // dernier jour du plan = la course
        else if (taper) sess.push({ title: `Footing léger ${String(Math.max(3, easyKm)).replace('.', ',')} km`, kind: 'easy', desc: 'Semaine de course : on garde les jambes fraîches. 4 accélérations de 15 s à la fin.', steps: [st('run', { m: Math.max(3, easyKm) * 1000, pace: E }, 'Footing léger')], km: Math.max(3, easyKm) });
        else if (i === 0 && n >= 2) sess.push(quality(0));
        else if (i === n - 1 && !taper) { const kmL = Math.round(peakLong * 2) / 2; sess.push({ title: `Sortie longue ${String(kmL).replace('.', ',')} km`, kind: 'long', desc: 'Lent, régulier, on doit pouvoir parler tout du long. C\'est elle qui construit l\'endurance.', steps: [st('run', { m: kmL * 1000, pace: E ? E + 10 : null }, `${String(kmL).replace('.', ',')} km tranquille`)], km: kmL }); }
        else sess.push({ title: `Footing ${String(easyKm).replace('.', ',')} km`, kind: 'easy', desc: 'Facile, en aisance respiratoire. Ça doit rester agréable.', steps: [st('run', { m: easyKm * 1000, pace: E }, `${String(easyKm).replace('.', ',')} km facile`)], km: easyKm });
      }
    }
    sess.forEach((s, i) => { const date = daysOfWeek[i]; if (date) out.push({ ...s, id: `${w}-${i}`, date, week: w + 1 }); });
  }
  return out;
}

export async function getPlan(uid: Uid): Promise<Plan | null> { return read<Plan | null>(PLAN_K(uid), null); }
export async function createPlan(uid: Uid, b: { goal?: string; weeks?: number; days?: number[]; start?: string }): Promise<Plan> {
  const goal: PlanGoal = (['start5k', '5k', '10k', 'semi'] as const).includes(b.goal as PlanGoal) ? b.goal as PlanGoal : '5k';
  const weeks = Math.min(20, Math.max(4, Math.round(Number(b.weeks) || { start5k: 9, '5k': 8, '10k': 10, semi: 12 }[goal])));
  const days = (Array.isArray(b.days) ? b.days.map(Number).filter(d => d >= 0 && d <= 6) : []).filter((d, i, a) => a.indexOf(d) === i);
  const useDays = days.length >= 2 ? days : [2, 4, 0];
  const today = localNow().date;
  const mon = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const start = typeof b.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.start) ? b.start : mon;
  const fit = fitnessFrom(await runList(uid), today);
  const plan: Plan = { id: randomBytes(4).toString('hex'), goal, start, race: addDays(start, weeks * 7 - 1), days: useDays, vdot: fit?.vdot ?? null, paces: fit?.paces ?? null, weeks, workouts: buildWorkouts(goal, weeks, useDays, start, fit?.paces ?? null), at: Date.now() };
  await kvSet(PLAN_K(uid), JSON.stringify(plan));
  return plan;
}
export async function deletePlan(uid: Uid) { await kvDel(PLAN_K(uid)).catch(() => {}); }
export async function markWorkoutDone(uid: Uid, workoutId: string, runId: string) {
  const p = await getPlan(uid); if (!p) return;
  const w = p.workouts.find(x => x.id === workoutId); if (!w) return;
  w.done = runId; await kvSet(PLAN_K(uid), JSON.stringify(p));
}
export function planView(p: Plan | null, today: string) {
  if (!p) return null;
  const next = p.workouts.find(w => !w.done && w.date >= today) ?? null;
  const todayW = p.workouts.find(w => w.date === today) ?? null;
  const past = p.workouts.filter(w => w.date < today);
  return { ...p, label: GOAL_LABEL[p.goal], today: todayW, next, done: p.workouts.filter(w => w.done).length, total: p.workouts.length, missed: past.filter(w => !w.done).length,
    week: Math.min(p.weeks, Math.max(1, Math.floor((Date.parse(today) - Date.parse(p.start)) / 86_400_000 / 7) + 1)) };
}

// ───────────────────────── Export GPX ─────────────────────────
export function gpx(run: RunSummary, pts: Pt[]): string {
  const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
  const trk = pts.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}">${p[3] != null ? `<ele>${p[3]}</ele>` : ''}<time>${new Date(run.startedAt + p[2] * 1000).toISOString()}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="FORME" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${esc(run.title)}</name><time>${new Date(run.startedAt).toISOString()}</time></metadata>\n<trk><name>${esc(run.title)}</name><type>${run.type === 'bike' ? 'cycling' : run.type === 'run' ? 'running' : run.type === 'hike' ? 'hiking' : 'walking'}</type><trkseg>\n${trk}\n</trkseg></trk>\n</gpx>\n`;
}

// ───────────────────────── Analyse du coach (IA) ─────────────────────────
export async function coachDebrief(uid: Uid, run: RunSummary, runs: RunSummary[]): Promise<string> {
  const p = await getFormeProfile(uid);
  const prev = runs.filter(r => r.type === run.type && r.id !== run.id).slice(-6);
  const fit = fitnessFrom(runs, localNow().date);
  const ctx = [
    `Sortie : ${TYPE_LABEL[run.type]} le ${run.date}, ${(run.dist / 1000).toFixed(2)} km en ${fmtDur(run.moving)} (allure ${run.pace ? fmtPace(run.pace) : '—'}/km, ${run.speed} km/h), D+ ${run.elevGain} m, ressenti ${run.feel ?? '?'}/5${run.cadence ? `, cadence ${run.cadence} pas/min` : ''}${run.weather ? `, météo ${run.weather.temp} °C ${run.weather.label}, vent ${run.weather.wind} km/h` : ''}.`,
    `Splits : ${run.splits.map(s => `${s.km}:${fmtPace(s.pace)}${s.elev ? `(${s.elev > 0 ? '+' : ''}${s.elev}m)` : ''}`).join(' ')}`,
    run.prs.length ? `Records : ${run.prs.join(', ')}` : '',
    run.workout ? `C'était la séance de plan : ${run.workout.title}` : '',
    prev.length ? `Sorties précédentes : ${prev.map(r => `${r.date} ${(r.dist / 1000).toFixed(1)} km ${r.pace ? fmtPace(r.pace) : ''}`).join(' · ')}` : 'Première sortie de ce type.',
    fit ? `VO2max estimé ${fit.vdot}, allure facile conseillée ${fmtPace(fit.paces.easy)}/km.` : '',
    `Profil : ${p.sex === 'h' ? 'homme' : 'femme'}, ${p.age} ans, ${p.weightKg} kg.`,
  ].filter(Boolean).join('\n');
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 600,
    system: `Tu es un coach de course à pied bienveillant mais franc. Analyse cette sortie en 4 à 6 phrases courtes, en ${p.lang === 'ar' ? 'arabe littéraire' : 'français simple, tutoiement'} : 1) ce qui est bien (chiffre précis), 2) ce qui se voit dans les splits (départ trop rapide ? régularité ? côtes ?), 3) comparaison avec ses sorties d'avant, 4) UN conseil concret pour la prochaine sortie (allure en min/km ou durée). Pas de titre, pas de liste, pas d'emoji sauf un à la fin.`,
    messages: [{ role: 'user', content: ctx }] });
  return res.content.filter(b => b.type === 'text').map(b => (b as unknown as { text: string }).text).join('').trim().slice(0, 1200);
}

// ───────────────────────── Suivi en direct (comme Strava Beacon / Garmin LiveTrack) ─────────────────────────
// Pendant la sortie, le téléphone envoie sa position toutes les ~20 s ; un lien secret permet à un proche de suivre la carte.
interface LiveState { token: string; uid: Uid; name: string; type: RunType; startedAt: number; at: number; pts: Array<[number, number]>; dist: number; moving: number; ended?: boolean }
const LIVE_OF = (u: Uid) => `${u}:forme:livetok`;
const LIVE_K = (t: string) => `forme:live:${t}`;
export async function liveStart(uid: Uid, type: RunType): Promise<string> {
  const token = randomBytes(12).toString('base64url');
  const p = await getFormeProfile(uid);
  const s: LiveState = { token, uid, name: p.name || 'Ton proche', type, startedAt: Date.now(), at: Date.now(), pts: [], dist: 0, moving: 0 };
  const old = await kvGet(LIVE_OF(uid)); if (old) await kvDel(LIVE_K(old)).catch(() => {});
  await kvSet(LIVE_K(token), JSON.stringify(s), 24 * 3600); await kvSet(LIVE_OF(uid), token, 24 * 3600);
  return token;
}
export async function liveUpdate(uid: Uid, b: { pts?: unknown; dist?: number; moving?: number; ended?: boolean }) {
  const token = await kvGet(LIVE_OF(uid)); if (!token) return { ok: false };
  const s = await read<LiveState | null>(LIVE_K(token), null); if (!s) return { ok: false };
  const add = (Array.isArray(b.pts) ? b.pts : []).filter((x): x is [number, number] => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1])).slice(0, 200).map(x => [Math.round(x[0] * 1e5) / 1e5, Math.round(x[1] * 1e5) / 1e5] as [number, number]);
  s.pts = [...s.pts, ...add].slice(-3000); s.dist = Number(b.dist) || s.dist; s.moving = Number(b.moving) || s.moving; s.at = Date.now(); if (b.ended) s.ended = true;
  await kvSet(LIVE_K(token), JSON.stringify(s), 24 * 3600);
  return { ok: true };
}
/** Lecture PUBLIQUE (lien secret) : seulement la trace en cours, rien d'autre du profil */
export async function livePublic(token: string) {
  if (!/^[\w-]{10,40}$/.test(token)) return null;
  const s = await read<LiveState | null>(LIVE_K(token), null); if (!s) return null;
  return { name: s.name, type: s.type, startedAt: s.startedAt, at: s.at, pts: s.pts, dist: s.dist, moving: s.moving, ended: !!s.ended || Date.now() - s.at > 30 * 60_000 };
}
