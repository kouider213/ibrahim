import { kvGet } from './app-store.js';
import { localNow } from './morning-routine.js';
import { getFormeProfile, type Uid } from './forme.js';

// STATS « PRO » de FORME (Kouider 31/10 : « regarde les 10 plus grosses applis… FORME doit être la meilleure ») :
// - objectif de la semaine (anneau Apple Fitness / Hevy), - séries par muscle sur 7 jours vs zone utile 10-20 (JEFIT /
// Alpha Progression / Hevy), - calendrier des séances 12 semaines (Hevy / Strava), - séries de semaines tenues + badges
// (Strava / Peloton / Hevy), - tendances santé de la montre (Fitbit / Garmin). Tout est calculé depuis ce qui existe déjà :
// journal du coach (kouider:sport:log), historique des fiches (<uid>:forme:exlog), séances FORME (<uid>:forme:days), santé.
const G_LIB: Record<string, string> = { chest: 'pecs', shoulders: 'epaules', biceps: 'bras', triceps: 'bras', forearms: 'bras', lats: 'dos', 'middle back': 'dos',
  'lower back': 'dos', traps: 'dos', neck: 'dos', abdominals: 'abdos', quadriceps: 'jambes', hamstrings: 'jambes', glutes: 'jambes', calves: 'jambes', adductors: 'jambes', abductors: 'jambes' };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monday = (d: string) => { const wd = new Date(`${d}T12:00:00Z`).getUTCDay(); return addDays(d, -((wd + 6) % 7)); };
const json = async <T,>(k: string, f: T): Promise<T> => { try { return JSON.parse((await kvGet(k)) ?? 'null') as T ?? f; } catch { return f; } };

export async function formeInsights(uid: Uid) {
  const today = localNow().date;
  const p = await getFormeProfile(uid);
  const exlog = await json<Record<string, Array<{ date: string; kg?: number; reps?: number }>>>(`${uid}:forme:exlog`, {});
  const days = await json<Record<string, { workout?: { label: string; sets: unknown[] } }>>(`${uid}:forme:days`, {});
  const coach = uid === 'kouider' ? await import('./sport-coach.js').then(async m => ({ log: await m.readSportLog(), mus: await m.exerciseMuscles() })).catch(() => ({ log: [] as Awaited<ReturnType<typeof import('./sport-coach.js')['readSportLog']>>, mus: {} as Record<string, { muscle: string; name: string }> })) : { log: [] as Awaited<ReturnType<typeof import('./sport-coach.js')['readSportLog']>>, mus: {} as Record<string, { muscle: string; name: string }> };
  // Jours d'entraînement (toutes sources)
  const trained = new Map<string, string>();
  for (const s of coach.log) trained.set(s.date, s.type);
  for (const [d, x] of Object.entries(days)) if (x.workout) trained.set(d, trained.get(d) ?? x.workout.label);
  for (const l of Object.values(exlog)) for (const x of l) if (!trained.has(x.date)) trained.set(x.date, 'libre');
  // Séries par muscle, 7 derniers jours (journal du coach ; fiches seulement les jours sans séance du coach → pas de double compte)
  const since = addDays(today, -6);
  const coachDays = new Set(coach.log.filter(s => s.date >= since).map(s => s.date));
  const sets: Record<string, number> = { pecs: 0, dos: 0, epaules: 0, bras: 0, jambes: 0, abdos: 0 };
  for (const s of coach.log) if (s.date >= since) for (const x of s.sets) { const m = coach.mus[x.ex]?.muscle; if (m && m in sets) sets[m]!++; }
  const lib = await import('./exercise-lib.js').then(m => m.exerciseLibrary()).catch(() => []);
  const libP = new Map(lib.map(e => [e.id, e.p]));
  for (const [id, l] of Object.entries(exlog)) for (const x of l) if (x.date >= since && !coachDays.has(x.date)) { const g = G_LIB[libP.get(id)?.[0] ?? '']; if (g) sets[g]!++; }
  // Semaine en cours + séries de semaines tenues
  const target = Math.max(1, p.sessionsPerWeek || 3);
  const mon = monday(today);
  const doneWeek = [...trained.keys()].filter(d => d >= mon && d <= today).length;
  let weekStreak = 0;
  for (let w = 1; w < 60; w++) { const a = addDays(mon, -7 * w), b = addDays(a, 6); const n = [...trained.keys()].filter(d => d >= a && d <= b).length; if (n >= Math.min(target, 2)) weekStreak++; else break; }
  if (doneWeek >= Math.min(target, 2)) weekStreak++;
  // Calendrier 12 semaines
  const start = addDays(mon, -7 * 11);
  const calendar = Array.from({ length: 84 }, (_, i) => addDays(start, i)).map(d => ({ date: d, done: trained.has(d), future: d > today }));
  // Badges
  const total = trained.size;
  const prs = Object.values(exlog).filter(l => l.length > 1).length;
  const badges = [
    { e: '🚀', l: 'Première séance', ok: total >= 1 }, { e: '🔟', l: '10 séances', ok: total >= 10 }, { e: '💯', l: '50 séances', ok: total >= 50 },
    { e: '🔥', l: '4 semaines tenues', ok: weekStreak >= 4 }, { e: '🏔️', l: '12 semaines tenues', ok: weekStreak >= 12 },
    { e: '📸', l: 'Machine scannée', ok: (await json<unknown[]>(`${uid}:forme:machines`, [])).length > 0 }, { e: '📈', l: '5 exercices suivis', ok: prs >= 5 },
    { e: '⚖️', l: 'Équilibré (6 muscles cette semaine)', ok: Object.values(sets).every(n => n > 0) },
  ];
  // Santé de la montre (Kouider)
  const health = uid === 'kouider' ? (await json<Array<{ date: string; steps?: number; rhr?: number; hrv?: number; sleep_h?: number }>>('health:daily', [])).slice(-30) : [];
  const load = uid === 'kouider' ? await import('./workout-live.js').then(m => m.loadLine()).catch(() => '') : '';
  return { week: { done: doneWeek, target }, weekStreak, total, sets, calendar, badges, health, load };
}
