// 17/11 (Kouider) : « quand je clique sur une partie du corps ça me propose un entraînement de cette partie, tous les muscles
// possibles, plusieurs muscles en même temps, et je note ce que je veux pour cette partie (ex. moins graisseuse) ».
// → carte du corps cliquable dans FORME › Séance. Le CODE choisit les exercices (bibliothèque free-exercise-db + ce qu'il a déjà
// fait / scanné / mis en favori), sans IA : instantané, gratuit, toujours dispo. Objectifs par zone gardés dans app_kv.
import { kvGet, kvSet } from './app-store.js';
import { localNow } from './morning-routine.js';
import type { SessionType } from './sport-coach.js';

export type ZoneGoal = 'gras' | 'volume' | 'force' | 'dessin' | 'entretien';
export const ZONE_GOALS: Record<ZoneGoal, { label: string; emoji: string; sets: number; reps: string; rest: number }> = {
  gras: { label: 'Moins de gras', emoji: '🔥', sets: 3, reps: '15-20', rest: 45 },
  dessin: { label: 'Plus dessiné', emoji: '✨', sets: 3, reps: '12-15', rest: 60 },
  volume: { label: 'Plus gros', emoji: '💪', sets: 4, reps: '8-12', rest: 90 },
  force: { label: 'Plus fort', emoji: '🏋️', sets: 4, reps: '6-8', rest: 120 },
  entretien: { label: 'Juste entretenir', emoji: '🙂', sets: 3, reps: '10-12', rest: 75 },
};

/** Zones cliquables : muscles free-exercise-db (p = muscles principaux) + filtre de nom éventuel + case de séance pour le journal. */
export const ZONES: Array<{ id: string; label: string; m: string[]; re?: RegExp; not?: RegExp; type: SessionType; group: string }> = [
  { id: 'pecs', label: 'Pectoraux', m: ['chest'], type: 'push', group: 'pecs' },
  { id: 'epaules', label: 'Épaules', m: ['shoulders'], type: 'upper', group: 'epaules' },
  { id: 'biceps', label: 'Biceps', m: ['biceps'], type: 'pull', group: 'bras' },
  { id: 'triceps', label: 'Triceps', m: ['triceps'], type: 'push', group: 'bras' },
  { id: 'avantbras', label: 'Avant-bras', m: ['forearms'], type: 'pull', group: 'bras' },
  { id: 'abdos', label: 'Abdos', m: ['abdominals'], not: /oblique|twist|side|rotation|woodchop|lat[ée]ral/i, type: 'core', group: 'abdos' },
  { id: 'obliques', label: 'Obliques (poignées d\'amour)', m: ['abdominals'], re: /oblique|twist|side|rotation|woodchop|lat[ée]ral|saxon/i, type: 'core', group: 'abdos' },
  { id: 'trapezes', label: 'Trapèzes', m: ['traps'], type: 'pull', group: 'dos' },
  { id: 'dorsaux', label: 'Dos (largeur)', m: ['lats'], type: 'pull', group: 'dos' },
  { id: 'milieu_dos', label: 'Milieu du dos (épaisseur)', m: ['middle back'], type: 'pull', group: 'dos' },
  { id: 'lombaires', label: 'Bas du dos (lombaires)', m: ['lower back'], type: 'pull', group: 'dos' },
  { id: 'fessiers', label: 'Fessiers', m: ['glutes'], type: 'legs', group: 'jambes' },
  { id: 'quadriceps', label: 'Quadriceps (devant des cuisses)', m: ['quadriceps'], type: 'legs', group: 'jambes' },
  { id: 'ischios', label: 'Ischios (arrière des cuisses)', m: ['hamstrings'], type: 'legs', group: 'jambes' },
  { id: 'mollets', label: 'Mollets', m: ['calves'], type: 'legs', group: 'jambes' },
  { id: 'adducteurs', label: 'Adducteurs (intérieur des cuisses)', m: ['adductors'], type: 'legs', group: 'jambes' },
  { id: 'abducteurs', label: 'Abducteurs (extérieur des hanches)', m: ['abductors'], type: 'legs', group: 'jambes' },
  { id: 'cou', label: 'Cou', m: ['neck'], type: 'core', group: 'abdos' },
  { id: 'cardio', label: 'Cardio (brûler des calories)', m: [], type: 'cardio', group: 'cardio' },
];
const Z = (id: string) => ZONES.find(z => z.id === id);

export interface ZoneGoalEntry { goal: ZoneGoal; note?: string; at: number }
const GK = (uid: string) => `${uid}:forme:zonegoals`;
export async function readZoneGoals(uid = 'kouider'): Promise<Record<string, ZoneGoalEntry>> {
  try { return JSON.parse((await kvGet(GK(uid))) ?? '{}') as Record<string, ZoneGoalEntry>; } catch { return {}; }
}
export async function setZoneGoals(uid: string, zones: string[], goal: ZoneGoal | null, note?: string): Promise<Record<string, ZoneGoalEntry>> {
  const cur = await readZoneGoals(uid);
  for (const id of zones.filter(z => Z(z))) {
    if (!goal) delete cur[id];
    else cur[id] = { goal, ...(note?.trim() ? { note: note.trim().slice(0, 200) } : {}), at: Date.now() };
  }
  await kvSet(GK(uid), JSON.stringify(cur));
  return cur;
}
/** Une ligne pour les cerveaux (dossier) et le plan photo. */
export async function zoneGoalsText(uid = 'kouider'): Promise<string> {
  const g = await readZoneGoals(uid);
  const e = Object.entries(g);
  if (!e.length) return '';
  return `Ce qu'il veut par zone du corps : ${e.map(([id, x]) => `${Z(id)?.label ?? id} → ${ZONE_GOALS[x.goal].label}${x.note ? ` (« ${x.note} »)` : ''}`).join(' ; ')}.`;
}

// Petites règles de sécurité : dos à ménager → pas de soulevé de terre / good morning lourds, sauf s'il choisit les lombaires
const RISKY = /deadlift|good_?morning|clean|snatch|jerk|behind.?the.?neck|derrière la nuque/i;
const SAFE_LOW_BACK = /hyperextension|superman|bird|back_?extension|extension (du|des) dos|pont|bridge/i;
const hash = (t: string) => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

export interface ZoneExercise { id: string; name: string; zone: string; img: string[]; sets: number; reps: string; rest: number; tip: string; known: boolean }
export interface ZoneSession { label: string; emoji: string; type: SessionType; zones: string[]; minutes: number; exercises: ZoneExercise[]; finisher: string | null; notes: string[] }

/** Séance pour les zones choisies (dans l'ordre où il les a touchées), en ~`minutes`. */
export async function zoneWorkout(uid: string, zoneIds: string[], minutes = 60): Promise<ZoneSession> {
  const zones = [...new Set(zoneIds)].map(Z).filter(Boolean) as typeof ZONES;
  if (!zones.length) throw new Error('Touche au moins un muscle sur le corps');
  const goals = await readZoneGoals(uid);
  const { exerciseLibrary } = await import('./exercise-lib.js');
  const lib = await exerciseLibrary();
  // Ce qu'il connaît déjà : exercices notés, machines scannées, favoris → passent en premier (il sait les faire, il a les charges)
  const { readSportLog } = await import('./sport-coach.js');
  const done = new Map<string, number>();
  for (const l of (await readSportLog()).slice(-40)) for (const z of l.sets) { const b = z.ex.replace(/~.*$/, ''); done.set(b, (done.get(b) ?? 0) + 1); }
  let scans: string[] = [], favs: string[] = [];
  try { scans = (JSON.parse((await kvGet(`${uid}:forme:machines`)) ?? '[]') as Array<{ exercises: Array<{ id: string | null }> }>).flatMap(m => m.exercises.map(e => e.id ?? '')).filter(Boolean); } catch { /* */ }
  try { const f = JSON.parse((await kvGet(`${uid}:forme:exfav`)) ?? '[]') as unknown; favs = Array.isArray(f) ? f.map(x => typeof x === 'string' ? x : String((x as { id?: string }).id ?? '')) : Object.keys(f as object); } catch { /* */ }
  const day = localNow().date;
  const lift = zones.filter(z => z.id !== 'cardio');
  const n = Math.max(lift.length, Math.min(10, Math.round(Math.max(20, minutes - (zones.some(z => z.id === 'cardio') ? 15 : 0)) / 8)));
  // répartition : chaque zone au moins 1, les premières touchées en ont plus
  const per = new Map<string, number>(lift.map(z => [z.id, 1]));
  const SMALL = ['abdos', 'obliques', 'cou', 'avantbras', 'mollets', 'adducteurs', 'abducteurs', 'trapezes', 'lombaires'];
  const cap = (id: string) => SMALL.includes(id) ? (lift.length === 1 ? 4 : 3) : 4;
  for (let i = lift.length, k = 0, guard = 0; i < n && lift.length && guard < 60; k++, guard++) { const z = lift[k % lift.length]!; if (per.get(z.id)! < cap(z.id)) { per.set(z.id, per.get(z.id)! + 1); i++; } }
  const used = new Set<string>();
  const exercises: ZoneExercise[] = [];
  const notes: string[] = [];
  for (const z of lift) {
    const g = goals[z.id]?.goal ?? 'entretien';
    const p = ZONE_GOALS[g];
    const cands = lib.filter(x => (x.cat === 'strength' || x.cat === 'powerlifting') && x.level !== 'expert' && x.p.some(m => z.m.includes(m))
      && (!z.re || z.re.test(`${x.name} ${x.fr}`)) && (!z.not || !z.not.test(`${x.name} ${x.fr}`))
      && !['foam roll', 'exercise ball', 'medicine ball'].includes(x.eq) && (z.id === 'lombaires' ? SAFE_LOW_BACK.test(`${x.id} ${x.fr}`) || x.eq === 'machine' : !RISKY.test(`${x.id} ${x.fr}`)));
    const score = (x: typeof lib[number]) => (done.get(x.id) ? 6 + Math.min(4, done.get(x.id)!) : 0) + (scans.includes(x.id) ? 4 : 0) + (favs.includes(x.id) ? 4 : 0)
      + (['machine', 'cable', 'dumbbell'].includes(x.eq) ? 2 : x.eq === 'barbell' || x.eq === 'e-z curl bar' ? 1.5 : x.eq === 'body only' ? 1 : 0)
      + (x.level === 'beginner' ? 0.5 : 0) + (x.img.length ? 1 : -3) + (hash(day + x.id) % 100) / 60;   // un peu de variété d'un jour à l'autre
    const pick = cands.filter(x => !used.has(x.id)).sort((a, b) => score(b) - score(a));
    // variété de matériel : pas 2 fois le même matériel de suite si on peut l'éviter
    const chosen: typeof pick = [];
    for (const x of pick) { if (chosen.length >= per.get(z.id)!) break; if (chosen.some(c => c.eq === x.eq) && pick.filter(y => !chosen.includes(y) && !chosen.some(c => c.eq === y.eq)).length) continue; chosen.push(x); }
    for (const x of pick) { if (chosen.length >= per.get(z.id)!) break; if (!chosen.includes(x)) chosen.push(x); }
    if (!chosen.length) { notes.push(`Pas trouvé d'exercice pour ${z.label}`); continue; }
    for (const x of chosen) {
      used.add(x.id);
      exercises.push({ id: x.id, name: x.fr || x.name, zone: z.id, img: x.img, sets: p.sets, reps: x.eq === 'body only' && /plank|planche|gainage/i.test(x.fr) ? '30-45 s' : p.reps, rest: p.rest,
        tip: goals[z.id]?.note ? `Ton objectif : ${ZONE_GOALS[g].label.toLowerCase()} (« ${goals[z.id]!.note} »)` : `${ZONE_GOALS[g].emoji} ${ZONE_GOALS[g].label}`, known: !!done.get(x.id) });
    }
  }
  // Les gros mouvements d'abord, l'isolation et les abdos ensuite
  const order = (e: ZoneExercise) => (['abdos', 'obliques', 'cou', 'avantbras', 'mollets'].includes(e.zone) ? 2 : 0) + (lib.find(x => x.id === e.id)?.s.length ? 0 : 1);
  exercises.sort((a, b) => order(a) - order(b));
  const wantsFatLoss = lift.some(z => goals[z.id]?.goal === 'gras') || zones.some(z => z.id === 'cardio');
  const finisher = wantsFatLoss ? (zones.some(z => z.id === 'cardio') ? '🏃 15 min de cardio à la fin (tapis incliné 10-12 % à 5,5 km/h, ou elliptique) — c\'est ce qui brûle le gras' : '🔥 Finisher 8 min : 40 s d\'effort / 20 s de repos (vélo ou rameur) — pour brûler plus') : null;
  if (lift.some(z => goals[z.id]?.goal === 'gras')) notes.push('Vrai à savoir : on ne peut pas faire fondre le gras d\'une zone en la travaillant. Le gras part partout grâce au déficit (repas + pas + cardio) ; la séance muscle ce qu\'il y a dessous pour que ça se voie quand le gras part.');
  const label = zones.length <= 3 ? zones.map(z => z.label.replace(/ \(.*\)$/, '')).join(' + ') : `${zones.slice(0, 2).map(z => z.label.replace(/ \(.*\)$/, '')).join(' + ')} + ${zones.length - 2} autres`;
  const cnt = new Map<SessionType, number>();
  for (const e of exercises) { const t = Z(e.zone)!.type; cnt.set(t, (cnt.get(t) ?? 0) + 1); }
  const type = ([...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]) ?? zones[0]!.type;
  return { label, emoji: '🎯', type, zones: zones.map(z => z.id), minutes, exercises, finisher, notes };
}
