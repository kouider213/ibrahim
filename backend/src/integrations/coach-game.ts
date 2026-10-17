import { kvGet, kvSet } from './app-store.js';
import { readSportLog, sportHistory, findExercise, ALL_EXERCISES, SESSIONS, ROTATION } from './sport-coach.js';
import { readLog, type CoachLog } from './life-coach.js';
import { localNow } from './morning-routine.js';

// LE JEU DU COACH (demande de Kouider 2026-10-17) : chaque bonne action rapporte des points — séance faite, séries,
// records, arrivée à la salle, repas cochés, eau, respiration, gratitude, humeur et pesée notées. Niveaux, badges,
// quêtes de la semaine. Tout est recalculé depuis l'historique (rien à tricher, rien à perdre).
// La pesée rapporte des points pour la RÉGULARITÉ, jamais pour la perte de poids (sécurité : pas de pression sur la balance).

const CHECKS_KEY = 'kouider:coach:checks';
const TARGET_KEY = 'kouider:coach:target';

export interface DayChecks { meals: string[]; water: number; breath: number; gratitude: string[] }
export type Checks = Record<string, DayChecks>;
const empty = (): DayChecks => ({ meals: [], water: 0, breath: 0, gratitude: [] });

export async function readChecks(): Promise<Checks> {
  try { return JSON.parse((await kvGet(CHECKS_KEY)) ?? '{}') as Checks; } catch { return {}; }
}
export async function updateChecks(date: string, fn: (d: DayChecks) => void): Promise<DayChecks> {
  const all = await readChecks();
  const d = { ...empty(), ...all[date] };
  fn(d);
  all[date] = d;
  const min = new Date(Date.parse(`${date}T12:00:00Z`) - 200 * 86_400_000).toISOString().slice(0, 10);
  for (const k of Object.keys(all)) if (k < min) delete all[k];
  await kvSet(CHECKS_KEY, JSON.stringify(all));
  return d;
}
export async function getTarget(): Promise<number | null> {
  const v = Number(await kvGet(TARGET_KEY).catch(() => null));
  return v > 30 && v < 250 ? v : null;
}
export const setTarget = (kg: number | null) => kvSet(TARGET_KEY, kg ? String(kg) : '');

export const XP = { session: 100, set: 5, pr: 50, arrival: 60, streak: 25, meal: 10, water: 2, breath: 15, gratitude: 10, mood: 15, weigh: 15, perfect: 50, badge: 100 };
const TITLES = ['Recrue', 'Débutant motivé', 'Régulier', 'Costaud', 'Guerrier', 'Machine', 'Lion', 'Titan', 'Légende de Wemmel', 'Champion FIK'];
export const levelFloor = (l: number) => 150 * l * (l - 1);        // niveau 2 = 300 pts, 3 = 900, 4 = 1 800, 5 = 3 000…

interface Gain { date: string; xp: number; label: string; at: number }

const dayOf = (iso: string) => localNow(Date.parse(iso)).date;
const weekStart = (date: string) => {
  const t = Date.parse(`${date}T12:00:00Z`); const wd = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - wd * 86_400_000).toISOString().slice(0, 10);
};

export async function computeGame() {
  const [sport, { history, arrived }, coachLog, checks] = await Promise.all([readSportLog(), sportHistory(), readLog(), readChecks()]);
  const gains: Gain[] = [];
  const g = (date: string, xp: number, label: string, at = Date.parse(`${date}T12:00:00Z`)) => gains.push({ date, xp, label, at });

  // Sport : séances, séries, records (dans l'ordre), série d'affilée
  const best: Record<string, number> = {};
  let prCount = 0; let maxVolume = 0;
  const sorted = [...sport].sort((a, b) => a.at.localeCompare(b.at));
  for (const l of sorted) {
    const at = Date.parse(l.at);
    g(l.date, XP.session, `${SESSIONS[l.type].emoji} ${SESSIONS[l.type].label} terminée`, at);
    if (l.sets.length) g(l.date, l.sets.length * XP.set, `${l.sets.length} séries cochées`, at);
    for (const s of l.sets) {
      if (s.kg == null) continue;
      if (best[s.ex] != null && s.kg > best[s.ex]!) { prCount++; g(l.date, XP.pr, `🏆 Record ${findExercise(s.ex)?.name ?? s.ex} : ${s.kg} kg`, at); }
      best[s.ex] = Math.max(best[s.ex] ?? 0, s.kg);
    }
    maxVolume = Math.max(maxVolume, l.sets.reduce((a, s) => a + (s.kg ?? 0) * (s.reps ?? 0), 0));
  }
  const loggedDays = new Set(sport.map(l => l.date));
  for (const [d, ts] of Object.entries(arrived)) if (!loggedDays.has(d)) g(d, XP.arrival, '📍 Arrivé à la salle', ts);
  const hist = Object.entries(history).sort();
  let run = 0, bestRun = 0;
  for (const [d, v] of hist) {
    if (v === 'skip') continue;
    run = v === 'done' ? run + 1 : 0; bestRun = Math.max(bestRun, run);
    if (v === 'done' && run >= 3) g(d, XP.streak, `🔥 ${run} séances d'affilée`);
  }

  // Coach : humeur, pesée (1 par jour chacune)
  const moodDays = new Set<string>(), weighDays = new Set<string>();
  for (const c of coachLog as CoachLog[]) {
    const d = dayOf(c.at), at = Date.parse(c.at);
    if (c.mood != null && !moodDays.has(d)) { moodDays.add(d); g(d, XP.mood, '🧠 Humeur notée', at); }
    if (c.weight != null && !weighDays.has(d)) { weighDays.add(d); g(d, XP.weigh, '⚖️ Pesée', at); }
  }
  // Nutrition + mental (cases cochées)
  const perfectDays: string[] = [];
  for (const [d, c] of Object.entries(checks)) {
    if (c.meals.length) g(d, c.meals.length * XP.meal, `🍽️ ${c.meals.length} repas suivis`);
    if (c.water) g(d, Math.min(10, c.water) * XP.water, `💧 ${c.water} verres d'eau`);
    if (c.breath) g(d, Math.min(2, c.breath) * XP.breath, '🌬️ Respiration');
    if (c.gratitude.length) g(d, Math.min(3, c.gratitude.length) * XP.gratitude, '🙏 Gratitude');
    const sportOk = history[d] !== 'missed';
    if (c.meals.length >= 4 && c.water >= 8 && (c.breath > 0 || c.gratitude.length > 0) && sportOk) { perfectDays.push(d); g(d, XP.perfect, '⭐ Journée parfaite'); }
  }

  // Badges
  const types = new Set(sport.map(l => l.type));
  const BADGES: Array<{ id: string; icon: string; name: string; how: string; ok: boolean }> = [
    { id: 'first', icon: '🥇', name: 'Premier pas', how: '1re séance terminée', ok: sport.length >= 1 },
    { id: 's10', icon: '💪', name: 'Habitué', how: '10 séances', ok: sport.length >= 10 },
    { id: 's25', icon: '🦾', name: 'Acharné', how: '25 séances', ok: sport.length >= 25 },
    { id: 's50', icon: '🦁', name: 'Lion de la salle', how: '50 séances', ok: sport.length >= 50 },
    { id: 'pr1', icon: '🏆', name: 'Premier record', how: 'Battre un record', ok: prCount >= 1 },
    { id: 'pr10', icon: '👑', name: 'Collectionneur', how: '10 records', ok: prCount >= 10 },
    { id: 'run3', icon: '🔥', name: 'En feu', how: '3 séances d\'affilée', ok: bestRun >= 3 },
    { id: 'run12', icon: '☄️', name: 'Inarrêtable', how: '12 séances d\'affilée', ok: bestRun >= 12 },
    { id: 'all6', icon: '🎯', name: 'Complet', how: 'Les 6 types de séance', ok: ROTATION.every(t => types.has(t)) },
    { id: 'ton', icon: '🏗️', name: 'Une tonne', how: '1 000 kg soulevés en une séance', ok: maxVolume >= 1000 },
    { id: 'weigh7', icon: '⚖️', name: 'Suivi sérieux', how: '7 pesées', ok: weighDays.size >= 7 },
    { id: 'mood7', icon: '🧠', name: 'À l\'écoute', how: '7 humeurs notées', ok: moodDays.size >= 7 },
    { id: 'perfect', icon: '⭐', name: 'Journée parfaite', how: '4 repas + 8 verres + mental', ok: perfectDays.length >= 1 },
    { id: 'perfect7', icon: '🌟', name: 'Semaine en or', how: '7 journées parfaites', ok: perfectDays.length >= 7 },
  ];
  for (const b of BADGES) if (b.ok) g(localNow().date, XP.badge, `${b.icon} Badge « ${b.name} »`, 0);

  // Quêtes de la semaine en cours (lundi → dimanche)
  const today = localNow().date, ws = weekStart(today);
  const inWeek = (d: string) => d >= ws && d <= today;
  const weekChecks = Object.entries(checks).filter(([d]) => inWeek(d)).map(([, c]) => c);
  const QUESTS = [
    { icon: '🏋️', name: '3 séances cette semaine', have: sport.filter(l => inWeek(l.date)).length, need: 3, xp: 150 },
    { icon: '🍽️', name: '5 jours avec les 4 repas', have: weekChecks.filter(c => c.meals.length >= 4).length, need: 5, xp: 100 },
    { icon: '🧠', name: 'Humeur notée 5 jours', have: [...moodDays].filter(inWeek).length, need: 5, xp: 100 },
    { icon: '⚖️', name: '2 pesées', have: [...weighDays].filter(inWeek).length, need: 2, xp: 50 },
    { icon: '🏆', name: '1 record battu', have: gains.filter(x => x.label.startsWith('🏆 Record') && inWeek(x.date)).length, need: 1, xp: 75 },
  ];
  // Quêtes réussies (cette semaine et les précédentes) → points
  const weeks = new Set([...Object.keys(checks), ...sport.map(l => l.date), ...moodDays, ...weighDays].map(weekStart));
  for (const w of weeks) {
    const end = new Date(Date.parse(`${w}T12:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
    const inW = (d: string) => d >= w && d <= end;
    const wc = Object.entries(checks).filter(([d]) => inW(d)).map(([, c]) => c);
    const done = [
      sport.filter(l => inW(l.date)).length >= 3, wc.filter(c => c.meals.length >= 4).length >= 5,
      [...moodDays].filter(inW).length >= 5, [...weighDays].filter(inW).length >= 2,
      gains.some(x => x.label.startsWith('🏆 Record') && inW(x.date)),
    ];
    done.forEach((ok, i) => { if (ok) g(end > today ? today : end, QUESTS[i]!.xp, `🎯 Quête « ${QUESTS[i]!.name} »`); });
  }

  const total = gains.reduce((a, x) => a + x.xp, 0);
  let level = 1; while (total >= levelFloor(level + 1)) level++;
  const floor = levelFloor(level), next = levelFloor(level + 1);
  // Jours actifs d'affilée (au moins une action)
  const activeDays = new Set(gains.filter(x => x.at > 0).map(x => x.date));
  let streakDays = 0;
  for (let d = today; activeDays.has(d); d = new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)) streakDays++;
  return {
    total, level, title: TITLES[Math.min(level - 1, TITLES.length - 1)]! + (level > TITLES.length ? ` +${level - TITLES.length}` : ''),
    floor, next, pct: Math.round((total - floor) / (next - floor) * 100),
    today: gains.filter(x => x.date === today && x.at > 0).reduce((a, x) => a + x.xp, 0),
    streakDays, prCount,
    feed: gains.filter(x => x.at > 0).sort((a, b) => b.at - a.at).slice(0, 15).map(x => ({ date: x.date, xp: x.xp, label: x.label })),
    badges: BADGES.map(({ ok, ...b }) => ({ ...b, ok })),
    quests: QUESTS.map(q => ({ ...q, done: q.have >= q.need })),
    xpRules: XP,
  };
}

/** Courbes d'évolution : charge max par exercice, poids du corps (+ objectif), humeur. */
export async function evolution() {
  const [sport, coachLog, target] = await Promise.all([readSportLog(), readLog(), getTarget()]);
  const exercises: Record<string, { name: string; points: Array<{ date: string; kg: number }> }> = {};
  for (const l of [...sport].sort((a, b) => a.date.localeCompare(b.date))) {
    const byEx: Record<string, number> = {};
    for (const s of l.sets) if (s.kg != null) byEx[s.ex] = Math.max(byEx[s.ex] ?? 0, s.kg);
    for (const [ex, kg] of Object.entries(byEx)) {
      const e = ALL_EXERCISES().find(x => x.id === ex);
      (exercises[ex] ??= { name: e?.name ?? ex, points: [] }).points.push({ date: l.date, kg });
    }
  }
  const lastPerDay = <T,>(arr: Array<{ date: string; v: T }>) => Object.values(Object.fromEntries(arr.map(x => [x.date, x]))) as Array<{ date: string; v: T }>;
  const weights = lastPerDay((coachLog as CoachLog[]).filter(c => c.weight != null).map(c => ({ date: dayOf(c.at), v: c.weight! }))).map(x => ({ date: x.date, kg: x.v }));
  const moods = lastPerDay((coachLog as CoachLog[]).filter(c => c.mood != null).map(c => ({ date: dayOf(c.at), v: c.mood! }))).map(x => ({ date: x.date, mood: x.v }));
  return { exercises, weights: weights.slice(-90), moods: moods.slice(-60), target };
}
