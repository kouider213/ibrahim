import { kvGet, kvSet } from './app-store.js';
import { listAgendaRange, updateAgendaEvent, deleteAgendaEvent, type AgendaEvent } from './google-calendar.js';
import { getLocation } from './location.js';
import { geocode, drive, km } from './departures.js';
import { getRoutineConfig, routinePausedReason, routineCalledRecently, localNow, localTs, hm, TZ } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { callOwner, getPendingCall } from '../notifications/voice-call.js';

// COACH SPORTIF (demande de Kouider 2026-10-17) : chaque créneau sport de l'agenda FIK reçoit sa séance — PUSH DAY,
// PULL DAY, LEG DAY, CARDIO DAY… — avec les exercices, séries × répétitions, repos et la charge conseillée (progression
// d'après ses séances notées). Le programme s'adapte à l'agenda : la rotation suit les vrais créneaux, une séance ratée
// est refaite la fois suivante, un créneau raccourci (RDV qui chevauche) donne une séance plus courte.
// Rappels : au moment de partir → appel + lien Waze de la salle sur Telegram ; séance commencée et GPS loin de la salle
// → « tu as oublié le sport ? » (appel + lien Waze) ; arrivé à la salle → la séance du jour arrive sur Telegram.
// Page SPORT de l'app : mode séance (séries cochées, minuteur de repos parlé, charges pré-remplies), semaine, progrès.
// Programme adapté au dos (règles du coach dans life-coach.ts) : rien de lourd sur la colonne.

const STATE_KEY = 'kouider:sport:state';
const LOG_KEY = 'kouider:sport:log';
const MARK = '\n\n— Routine —\n';
const GYM_RADIUS_KM = 0.4;

export type Muscle = 'pecs' | 'dos' | 'epaules' | 'bras' | 'jambes' | 'abdos' | 'cardio';
export type SessionType = 'push' | 'pull' | 'legs' | 'cardio' | 'upper' | 'core';
export const ROTATION: SessionType[] = ['push', 'pull', 'legs', 'cardio', 'upper', 'core'];

export interface Exercise {
  id: string; name: string; muscle: Muscle; sets: number; reps: string; rest: number;   // reps : « 8-10 », « 40 s », « 10/côté »
  tip: string; alt: string[]; step?: number;                                           // step : kg ajoutés quand tout est réussi
}

const ex = (id: string, name: string, muscle: Muscle, sets: number, reps: string, rest: number, tip: string, alt: string[], step?: number): Exercise =>
  ({ id, name, muscle, sets, reps, rest, tip, alt, ...(step ? { step } : {}) });

export const SESSIONS: Record<SessionType, { label: string; emoji: string; focus: string; muscles: Muscle[]; warmup: string; exercises: Exercise[] }> = {
  push: {
    label: 'PUSH DAY', emoji: '💥', focus: 'Pecs · épaules · triceps', muscles: ['pecs', 'epaules', 'bras'],
    warmup: '8 min vélo facile + rotations d\'épaules + 2 séries légères au premier exercice',
    exercises: [
      ex('db_bench', 'Développé couché haltères', 'pecs', 4, '8-10', 90, 'Omoplates serrées, pieds au sol, descends lentement (3 s).', ['Développé machine convergente', 'Pompes'], 2),
      ex('incline_press', 'Développé incliné machine', 'pecs', 3, '10-12', 75, 'Dossier à 30°, ne verrouille pas les coudes.', ['Développé incliné haltères', 'Pompes pieds surélevés'], 2.5),
      ex('shoulder_press', 'Développé épaules assis (machine, dos calé)', 'epaules', 3, '10-12', 75, 'Dos bien collé au dossier, pas de cambrure.', ['Développé haltères assis avec dossier'], 2.5),
      ex('lateral_raise', 'Élévations latérales haltères', 'epaules', 3, '12-15', 60, 'Coudes légèrement fléchis, monte jusqu\'aux épaules, pas plus.', ['Élévations latérales poulie'], 1),
      ex('pec_deck', 'Pec deck / écarté poulie', 'pecs', 3, '12-15', 60, 'Serre 1 s en fin de mouvement.', ['Écarté haltères sur banc'], 2.5),
      ex('triceps_rope', 'Extension triceps poulie corde', 'bras', 3, '12-15', 60, 'Coudes collés au corps, écarte la corde en bas.', ['Dips machine assistée', 'Extension haltère au-dessus de la tête'], 2.5),
      ex('plank', 'Gainage planche', 'abdos', 3, '40 s', 45, 'Fessiers serrés, nombril rentré, dos plat.', ['Planche sur les genoux']),
    ],
  },
  pull: {
    label: 'PULL DAY', emoji: '🧲', focus: 'Dos · biceps', muscles: ['dos', 'bras'],
    warmup: '8 min rameur facile + tirages élastique / poulie légère',
    exercises: [
      ex('lat_pulldown', 'Tirage vertical poitrine', 'dos', 4, '8-10', 90, 'Tire vers le haut de la poitrine, buste légèrement incliné, pas d\'élan.', ['Tractions assistées (machine)'], 2.5),
      ex('seated_row', 'Rowing assis poulie (buste droit)', 'dos', 3, '10-12', 75, 'Dos droit, ramène les coudes en arrière, ne te balance pas.', ['Rowing machine poitrine appuyée'], 2.5),
      ex('db_row', 'Rowing unilatéral haltère (appui banc)', 'dos', 3, '10-12', 60, 'Main et genou sur le banc, dos plat, tire vers la hanche.', ['Rowing machine unilatéral'], 2),
      ex('face_pull', 'Face pull poulie', 'epaules', 3, '15', 60, 'Tire vers le front en écartant les mains : top pour la posture.', ['Oiseau haltères assis'], 2.5),
      ex('db_curl', 'Curl biceps haltères assis', 'bras', 3, '10-12', 60, 'Coudes fixes, descends lentement.', ['Curl poulie basse'], 1),
      ex('hammer_curl', 'Curl marteau', 'bras', 3, '12', 60, 'Prise neutre, pas d\'élan du dos.', ['Curl corde poulie'], 1),
      ex('bird_dog', 'Bird dog', 'abdos', 3, '10/côté', 45, 'À quatre pattes, bras et jambe opposés tendus, dos immobile 2 s.', ['Dead bug']),
    ],
  },
  legs: {
    label: 'LEG DAY', emoji: '🦵', focus: 'Jambes · fessiers (sans charge sur le dos)', muscles: ['jambes', 'abdos'],
    warmup: '8 min vélo + 10 squats au poids du corps + mobilité des hanches',
    exercises: [
      ex('leg_press', 'Presse à cuisses', 'jambes', 4, '10-12', 120, 'Bas du dos collé au dossier, ne descends pas au point où le bassin décolle.', ['Hack squat machine (léger)', 'Goblet squat léger'], 5),
      ex('leg_ext', 'Leg extension', 'jambes', 3, '12-15', 60, 'Monte en 1 s, tiens 1 s, descends en 3 s.', ['Fentes au poids du corps'], 2.5),
      ex('leg_curl', 'Leg curl (assis ou allongé)', 'jambes', 3, '12-15', 60, 'Bassin plaqué, mouvement contrôlé.', ['Pont ischios au sol'], 2.5),
      ex('hip_thrust', 'Hip thrust machine / pont fessier', 'jambes', 3, '12', 75, 'Pousse avec les fessiers, pas avec le bas du dos ; menton rentré.', ['Pont fessier au sol'], 5),
      ex('lunges', 'Fentes marchées haltères légers', 'jambes', 3, '10/jambe', 75, 'Buste droit, genou au-dessus de la cheville.', ['Fentes arrière au poids du corps'], 1),
      ex('calf', 'Mollets machine assis', 'jambes', 4, '15', 45, 'Amplitude complète, pause en haut.', ['Mollets debout à la presse'], 5),
      ex('dead_bug', 'Dead bug', 'abdos', 3, '10/côté', 45, 'Bas du dos plaqué au sol pendant tout le mouvement.', ['Bird dog']),
    ],
  },
  cardio: {
    label: 'CARDIO DAY', emoji: '❤️‍🔥', focus: 'Intervalles · endurance · gainage', muscles: ['cardio', 'abdos'],
    warmup: '8 min vélo ou elliptique facile, monter doucement le rythme',
    exercises: [
      ex('intervals', 'Rameur ou vélo : 10 × (40 s fort / 80 s facile)', 'cardio', 1, '20 min', 120, 'Fort = 8/10 d\'effort, tu ne peux plus parler ; facile = tu récupères.', ['Elliptique fractionné', 'Vélo fractionné']),
      ex('zone2', 'Elliptique zone 2', 'cardio', 1, '15 min', 60, 'Rythme où tu peux encore parler : c\'est là qu\'on brûle le gras.', ['Marche inclinée tapis', 'Vélo']),
      ex('plank_c', 'Gainage planche', 'abdos', 3, '45 s', 45, 'Dos plat, respire.', ['Planche sur les genoux']),
      ex('side_plank', 'Planche latérale', 'abdos', 3, '30 s/côté', 45, 'Corps aligné, hanche haute.', ['Planche latérale genoux au sol']),
      ex('mcgill_curl', 'McGill curl-up', 'abdos', 3, '8', 45, 'Une jambe pliée, mains sous le bas du dos, décolle juste la tête et les épaules.', ['Dead bug']),
      ex('incline_walk', 'Marche inclinée (retour au calme)', 'cardio', 1, '10 min', 0, 'Pente 8-10 %, 5 km/h.', ['Vélo facile']),
    ],
  },
  upper: {
    label: 'UPPER DAY', emoji: '💪', focus: 'Haut du corps complet · bras', muscles: ['pecs', 'dos', 'epaules', 'bras'],
    warmup: '8 min rameur + rotations d\'épaules',
    exercises: [
      ex('chest_press', 'Chest press machine', 'pecs', 3, '10-12', 75, 'Poignées à hauteur de poitrine.', ['Pompes'], 2.5),
      ex('assisted_pullup', 'Tractions assistées (machine)', 'dos', 3, '8-10', 90, 'Chaque semaine un peu moins d\'assistance.', ['Tirage vertical prise serrée'], -2.5),
      ex('row_machine', 'Tirage horizontal machine', 'dos', 3, '10-12', 75, 'Poitrine contre l\'appui, coudes vers l\'arrière.', ['Rowing poulie assis'], 2.5),
      ex('db_shoulder', 'Développé haltères assis (dossier)', 'epaules', 3, '10', 75, 'Dos calé, gainé.', ['Développé épaules machine'], 2),
      ex('superset_arms', 'Superset curl poulie + extension triceps poulie', 'bras', 3, '12 + 12', 60, 'Enchaîne les deux sans pause, puis repos.', ['Curl haltères + dips assistés'], 2.5),
      ex('plank_u', 'Gainage planche', 'abdos', 3, '45 s', 45, 'Fessiers serrés.', ['Planche sur les genoux']),
    ],
  },
  core: {
    label: 'CORE & MOBILITÉ', emoji: '🧘', focus: 'Dos solide · abdos · souplesse', muscles: ['abdos', 'cardio'],
    warmup: '10 min vélo ou elliptique très facile',
    exercises: [
      ex('cat_cow', 'Chat-vache', 'abdos', 2, '10', 30, 'Lentement, avec la respiration.', ['Rotations du bassin debout']),
      ex('bird_dog_c', 'Bird dog', 'abdos', 3, '10/côté', 45, 'Dos immobile, tiens 2 s.', ['Dead bug']),
      ex('dead_bug_c', 'Dead bug', 'abdos', 3, '10/côté', 45, 'Bas du dos plaqué.', ['Bird dog']),
      ex('glute_bridge', 'Pont fessier', 'jambes', 3, '15', 45, 'Serre les fessiers en haut 2 s.', ['Hip thrust machine léger']),
      ex('pallof', 'Pallof press poulie', 'abdos', 3, '12/côté', 45, 'Résiste à la rotation, bras tendus devant.', ['Planche latérale']),
      ex('side_plank_c', 'Planche latérale', 'abdos', 3, '30 s/côté', 45, 'Hanche haute.', ['Genoux au sol']),
      ex('stretch', 'Étirements ischios, psoas, pectoraux', 'abdos', 1, '8 min', 0, '30 s par position, respire, jamais de douleur.', ['Yoga mobilité']),
      ex('zone2_c', 'Elliptique zone 2', 'cardio', 1, '20 min', 0, 'Rythme confortable.', ['Marche inclinée']),
    ],
  },
};

// Démo animée de chaque exercice : images libres de droits (free-exercise-db, domaine public), 2 positions alternées dans l'app.
const DEMO: Record<string, string> = {
  db_bench: 'Dumbbell_Bench_Press', incline_press: 'Leverage_Incline_Chest_Press', shoulder_press: 'Leverage_Shoulder_Press', lateral_raise: 'Side_Lateral_Raise',
  pec_deck: 'Butterfly', triceps_rope: 'Triceps_Pushdown_-_Rope_Attachment', plank: 'Plank', plank_c: 'Plank', plank_u: 'Plank',
  lat_pulldown: 'Wide-Grip_Lat_Pulldown', seated_row: 'Seated_Cable_Rows', db_row: 'One-Arm_Dumbbell_Row', face_pull: 'Face_Pull',
  db_curl: 'Dumbbell_Bicep_Curl', hammer_curl: 'Hammer_Curls', leg_press: 'Leg_Press', leg_ext: 'Leg_Extensions', leg_curl: 'Seated_Leg_Curl',
  hip_thrust: 'Barbell_Hip_Thrust', lunges: 'Dumbbell_Lunges', calf: 'Seated_Calf_Raise', dead_bug: 'Dead_Bug', dead_bug_c: 'Dead_Bug',
  intervals: 'Rowing_Stationary', zone2: 'Elliptical_Trainer', zone2_c: 'Elliptical_Trainer', side_plank: 'Side_Bridge', side_plank_c: 'Side_Bridge',
  incline_walk: 'Walking_Treadmill', chest_press: 'Leverage_Chest_Press', assisted_pullup: 'Band_Assisted_Pull-Up', row_machine: 'Leverage_Iso_Row',
  db_shoulder: 'Dumbbell_Shoulder_Press', superset_arms: 'Standing_Biceps_Cable_Curl', cat_cow: 'Cat_Stretch', glute_bridge: 'Barbell_Glute_Bridge',
  pallof: 'Pallof_Press', stretch: 'Hamstring_Stretch',
};
const DEMO_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
export const demoOf = (id: string): string[] => (DEMO[id] ? [0, 1].map(i => `${DEMO_BASE}/${DEMO[id]}/${i}.jpg`) : []);
export const videoOf = (name: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercice technique exécution`)}`;
export const ALL_EXERCISES = (): Exercise[] => [...Object.values(SESSIONS).flatMap(s => s.exercises), ...Object.values(customMap).flatMap(c => c.exercises)];

// ── PROGRAMME OFFICIEL de Kouider (demande du 20/10) ─────────────────────────────────────────────────────
// Par défaut le coach suit le programme ci-dessus. Quand Kouider envoie SES séances (texte, photo du programme de son
// coach…), elles remplacent ce programme PARTOUT : rotation, agenda (titres + détail), app, Telegram, appels. Chaque
// séance prend une des 6 cases (push, pull, legs… = juste des numéros internes, l'app et l'historique restent compatibles).
const PROGRAM_KEY = 'kouider:sport:program';
const DEFAULT_SESSIONS = structuredClone(SESSIONS);
const DEFAULT_ROTATION = [...ROTATION];
export interface ProgramExercise { name: string; sets?: number; reps?: string | number; rest?: number; tip?: string; muscle?: string; alt?: string[] }
export interface ProgramSession { label: string; emoji?: string; focus?: string; warmup?: string; exercises: ProgramExercise[] }
interface SportProgram { sessions: ProgramSession[]; source?: string; updatedAt: string }
let programLoadedAt = 0;
let programInfo: { source?: string; updatedAt: string; count: number } | null = null;

const slug = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
function guessMuscle(name: string, hint?: string): Muscle {
  const t = slug(`${hint ?? ''} ${name}`);
  if (/cardio|velo|tapis|rameur|elliptique|course|corde_a_sauter|hiit|marche/.test(t)) return 'cardio';
  if (/abdo|gainage|planche|crunch|core|dead_bug|bird_dog|pallof|releve_de_jambes/.test(t)) return 'abdos';
  if (/squat|presse|fente|leg|cuisse|mollet|ischio|fessier|hip_thrust|jambe|soulev/.test(t)) return 'jambes';
  if (/curl|biceps|triceps|bras|dips|barre_au_front/.test(t)) return 'bras';
  if (/epaule|militaire|elevation|lateral|oiseau|face_pull|arnold/.test(t)) return 'epaules';
  if (/tirage|rowing|traction|dos|lombaire|pull_over|row/.test(t)) return 'dos';
  if (/pec|couche|developpe|ecarte|pompe|chest|butterfly|bench/.test(t)) return 'pecs';
  return 'abdos';
}
function toSession(p: ProgramSession, slot: SessionType): typeof SESSIONS[SessionType] {
  const used = new Set<string>();
  const exercises: Exercise[] = p.exercises.slice(0, 15).map(e => {
    const known = findExerciseIn(Object.values(DEFAULT_SESSIONS).flatMap(x => x.exercises), e.name, 2);
    let id = known?.id ?? `${slot}_${slug(e.name)}`;
    if (used.has(id)) id = `${slot}_${slug(e.name)}_${used.size}`;
    used.add(id);
    const muscle = (['pecs', 'dos', 'epaules', 'bras', 'jambes', 'abdos', 'cardio'] as Muscle[]).includes(e.muscle as Muscle) ? e.muscle as Muscle : known?.muscle ?? guessMuscle(e.name, e.muscle);
    return ex(id, e.name.slice(0, 80), muscle, Math.max(1, Math.min(10, Math.round(Number(e.sets) || 3))), String(e.reps ?? '10-12').slice(0, 20),
      Math.max(0, Math.min(300, Math.round(Number(e.rest) || (muscle === 'cardio' || muscle === 'abdos' ? 45 : 90)))),
      (e.tip || known?.tip || 'Mouvement contrôlé, amplitude complète, pas d\'élan.').slice(0, 200), (e.alt?.length ? e.alt : known?.alt ?? []).slice(0, 3), known?.step);
  });
  const muscles = [...new Set(exercises.map(e => e.muscle))];
  return { label: p.label.slice(0, 40).toUpperCase(), emoji: p.emoji?.slice(0, 4) || DEFAULT_SESSIONS[slot].emoji,
    focus: (p.focus || muscles.join(' · ')).slice(0, 80), muscles, warmup: (p.warmup || '8 min cardio facile + 2 séries légères au premier exercice').slice(0, 200), exercises };
}
function applyProgram(p: SportProgram | null): void {
  for (const t of DEFAULT_ROTATION) SESSIONS[t] = structuredClone(DEFAULT_SESSIONS[t]);
  ROTATION.splice(0, ROTATION.length, ...DEFAULT_ROTATION);
  programInfo = null;
  if (!p?.sessions?.length) return;
  const slots = DEFAULT_ROTATION.slice(0, Math.min(6, p.sessions.length));
  slots.forEach((t, i) => { SESSIONS[t] = toSession(p.sessions[i]!, t); });
  ROTATION.splice(0, ROTATION.length, ...slots);
  programInfo = { source: p.source, updatedAt: p.updatedAt, count: slots.length };
}
async function loadProgram(force = false): Promise<void> {
  if (!force && Date.now() - programLoadedAt < 60_000) return;
  programLoadedAt = Date.now();
  try { applyProgram(JSON.parse((await kvGet(PROGRAM_KEY)) ?? 'null') as SportProgram | null); } catch { /* garde le programme en mémoire */ }
}
/** Remplace le programme (toutes les séances) ou une seule séance (index 1…n), puis réécrit l'agenda des 7 jours. */
export async function setSportProgram(o: { sessions?: ProgramSession[]; index?: number; session?: ProgramSession; reset?: boolean; source?: string }): Promise<string> {
  await loadProgram(true);
  if (o.reset) { await kvSet(PROGRAM_KEY, 'null'); applyProgram(null); }
  else {
    const cur = (JSON.parse((await kvGet(PROGRAM_KEY)) ?? 'null') as SportProgram | null)?.sessions
      ?? DEFAULT_ROTATION.map(t => ({ label: DEFAULT_SESSIONS[t].label, emoji: DEFAULT_SESSIONS[t].emoji, focus: DEFAULT_SESSIONS[t].focus, warmup: DEFAULT_SESSIONS[t].warmup,
        exercises: DEFAULT_SESSIONS[t].exercises.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, rest: e.rest, tip: e.tip, muscle: e.muscle, alt: e.alt })) }));
    let next: ProgramSession[];
    if (o.sessions?.length) next = o.sessions;
    else if (o.session && o.index) { next = [...cur]; next[Math.max(0, Math.min(5, o.index - 1))] = o.session; next = next.filter(Boolean); }
    else return '❌ Donne sessions (tout le programme) ou index + session (une seule séance).';
    next = next.filter(x => x?.label && x.exercises?.length).slice(0, 6);
    if (!next.length) return '❌ Chaque séance doit avoir un nom (label) et au moins un exercice.';
    const prog: SportProgram = { sessions: next, source: o.source?.slice(0, 120), updatedAt: new Date().toISOString() };
    await kvSet(PROGRAM_KEY, JSON.stringify(prog));
    applyProgram(prog);
  }
  const st = await getState();
  st.next = st.next % ROTATION.length;
  for (const [d, t] of Object.entries(st.overrides)) if (!ROTATION.includes(t)) delete st.overrides[d];
  await saveState(st);
  const r = await planSportWeek(true);
  return `${o.reset ? '✅ Programme du coach remis par défaut' : `✅ Programme enregistré (${ROTATION.length} séance(s) en rotation)`} : ${ROTATION.map(t => `${SESSIONS[t].emoji} ${SESSIONS[t].label} (${SESSIONS[t].exercises.length} exos)`).join(' → ')}. ` +
    `Agenda : ${r.note || 'à jour'} ; l'app et les messages utilisent déjà ces séances.`;
}
export function sportProgramText(): string {
  return [programInfo ? `📋 Programme OFFICIEL de Kouider${programInfo.source ? ` (${programInfo.source})` : ''}, depuis le ${programInfo.updatedAt.slice(8, 10)}/${programInfo.updatedAt.slice(5, 7)} :` : '📋 Programme du coach Dzaryx (par défaut) :',
    ...ROTATION.map((t, i) => `${i + 1}. ${SESSIONS[t].emoji} ${SESSIONS[t].label} — ${SESSIONS[t].focus}\n${SESSIONS[t].exercises.map(e => `   - ${e.name} : ${e.sets} × ${e.reps}, repos ${e.rest} s`).join('\n')}`)].join('\n');
}

export interface SetLog { ex: string; kg?: number; reps?: number }
export interface SessionLog { date: string; type: SessionType; at: string; durationMin?: number; rpe?: number; note?: string; sets: SetLog[] }
interface PlanSlot { type: SessionType; eventId: string; start: string; end: string; minutes: number; title: string }
type DayStatus = 'done' | 'missed' | 'skip';
export interface SportSettings { callBefore: boolean; gymCheck: boolean; playlist: boolean }
interface SportState {
  next: number;                                   // index ROTATION de la prochaine séance à faire
  plan: Record<string, PlanSlot>;                 // date → séance prévue
  plannedAt?: number;
  overrides: Record<string, SessionType>;         // date → type choisi par Kouider
  skips: Record<string, string>;                  // date → raison (malade, repos…)
  history: Record<string, DayStatus>;
  arrived: Record<string, number>;                // date → heure d'arrivée détectée par GPS
  alerts: Record<string, string[]>;               // date → alertes déjà envoyées (forgot, nogps, depart…)
  settings: SportSettings;
  deload?: { start: string; end: string; why: string };   // semaine allégée prévue / en cours
  deloadLast?: string;                            // fin de la dernière semaine allégée
  trainingSince?: string;
  form: Record<string, number>;                   // date → forme au réveil 1-5 (Kouider 21/10)
  goal?: WeekGoal;                                // objectif de la semaine (fixé au bilan du dimanche)
}
interface WeekGoal { week: string; kind: 'sessions' | 'lift'; target: number; ex?: string; text: string }

const DEFAULT_STATE: SportState = { next: 0, plan: {}, overrides: {}, skips: {}, history: {}, arrived: {}, alerts: {}, form: {}, settings: { callBefore: true, gymCheck: true, playlist: true } };

async function getState(): Promise<SportState> {
  await loadProgram();
  try {
    const s = JSON.parse((await kvGet(STATE_KEY)) ?? '{}') as Partial<SportState>;
    deloadWin = s.deload ?? null;
    formMap = s.form ?? {};
    customMap = JSON.parse((await kvGet(CUSTOM_KEY).catch(() => null)) ?? '{}') as Record<string, CustomSession>;
    return { ...DEFAULT_STATE, ...s, settings: { ...DEFAULT_STATE.settings, ...s.settings } };
  }
  catch { return { ...DEFAULT_STATE }; }
}
async function saveState(s: SportState): Promise<void> {
  const keep = (r: Record<string, unknown>, days: number) => {
    const min = addDays(localNow().date, -days);
    for (const k of Object.keys(r)) if (k < min) delete r[k];
  };
  keep(s.plan, 7); keep(s.overrides, 7); keep(s.skips, 7); keep(s.arrived, 7); keep(s.alerts, 3); keep(s.form, 14); keep(s.history, 180);
  await kvSet(STATE_KEY, JSON.stringify(s));
}

export async function readSportLog(): Promise<SessionLog[]> {
  try { return JSON.parse((await kvGet(LOG_KEY)) ?? '[]') as SessionLog[]; } catch { return []; }
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dateOf = (iso: string) => localNow(Date.parse(iso)).date;
const isSport = (e: AgendaEvent) => !!e.start.dateTime && (/^🏋️/u.test(e.summary ?? '') || /\b(sport|muscu|gym|salle de sport|fitness)\b/i.test(e.summary ?? ''));
const reps = (r: string) => Number(r.match(/(\d+)\s*$/)?.[1] ?? r.match(/\d+/)?.[0] ?? 0);
const isTimed = (e: Exercise) => /(s|min)\b/.test(e.reps) && !/\//.test(e.reps.replace(/s\/côté/, ''));

// ── Semaine allégée (deload) ────────────────────────────────────────────────
// Kouider 21/10 : toutes les ~7 semaines d'entraînement (ou plus tôt si les RPE notés restent ≥ 8,5), une semaine
// allégée : mêmes exercices, ~40 % de séries en moins, charges −10 %, pas de finisher. Elle commence le lundi suivant.

let deloadWin: { start: string; end: string } | null = null;     // rafraîchi à chaque getState()
export const inDeload = (date = localNow().date) => !!deloadWin && date >= deloadWin.start && date <= deloadWin.end;
// Forme au réveil (1-5) : 1-2 = mauvaise nuit / crevé → séance courte (45 min max) et légère ce jour-là.
let formMap: Record<string, number> = {};
// SÉANCE SUR MESURE d'un jour précis (Kouider 25/10) : il envoie sa photo + ce qu'il veut perdre → Dzaryx / FORME
// refait la séance du lendemain (exercices, séries) pour CE jour seulement ; le programme habituel ne bouge pas.
const CUSTOM_KEY = 'kouider:sport:custom';
// exact (28/10) : séance dictée par Kouider (vidéo + consignes) → tous ses exercices dans SON ordre, pas de coupe ni de finisher ;
// blocks = cardio prévu (tapis 20 min…) comparé ensuite aux entraînements que Santé / la montre a vus.
interface CustomSession { label: string; focus: string; why: string; exercises: Exercise[]; at: number; exact?: boolean; warmup?: string; emoji?: string; blocks?: CardioBlock[] }
export interface CardioBlock { name: string; min: number; when: 'avant' | 'apres'; flex?: boolean }   // flex : « le temps qui reste » avant de partir
let customMap: Record<string, CustomSession> = {};   // rafraîchi à chaque getState()
const lowForm = (date = localNow().date) => (formMap[date] ?? 5) <= 2;
const DELOAD_EVERY_WEEKS = 7;

/** Programme la prochaine semaine allégée si c'est le moment ; renvoie le message à envoyer (sinon null). */
async function checkDeload(st: SportState): Promise<string | null> {
  const today = localNow().date;
  if (st.deload && st.deload.end >= today) return null;
  if (st.deload) { st.deloadLast = st.deload.end; delete st.deload; deloadWin = null; }
  const log = await readSportLog();
  st.trainingSince ??= log[0]?.date ?? today;
  const since = st.deloadLast ?? st.trainingSince;
  const weeks = (Date.parse(today) - Date.parse(since)) / (7 * 86_400_000);
  const done = new Set([...Object.entries(st.history).filter(([d, v]) => d > since && v === 'done').map(([d]) => d), ...log.filter(l => l.date > since).map(l => l.date)]).size;
  const rpes = log.filter(l => l.date > since && l.rpe).slice(-4).map(l => l.rpe!);
  const tired = weeks >= 5 && rpes.length >= 3 && rpes.reduce((a, b) => a + b, 0) / rpes.length >= 8.5;
  if (done < 12 || !(weeks >= DELOAD_EVERY_WEEKS || tired)) return null;
  const start = addDays(today, (8 - localNow().weekday) % 7 || 7);   // lundi prochain
  st.deload = { start, end: addDays(start, 6), why: tired ? 'fatigue (RPE élevé sur les dernières séances)' : `${Math.floor(weeks)} semaines d'entraînement d'affilée` };
  deloadWin = st.deload;
  return `🪶 Semaine allégée à partir de lundi ${start.slice(8)}/${start.slice(5, 7)} (${st.deload.why}).\nMêmes exercices, ~40 % de séries en moins et charges −10 %. C'est là que le corps récupère et que tu reviens plus fort la semaine d'après. Tes séances dans l'agenda sont déjà ajustées.`;
}

// ── Charges conseillées (progression) ───────────────────────────────────────

export interface Suggestion { kg: number | null; last?: string; up?: boolean }

/** Dernière perf sur l'exercice ; toutes les séries au haut de la fourchette → + step kg. */
export function suggestFor(e: Exercise, log: SessionLog[], date?: string): Suggestion {
  const s = suggestRaw(e, log);
  return (inDeload(date) || lowForm(date)) && s.kg ? { kg: Math.round(s.kg * 0.9 * 2) / 2, last: s.last } : s;
}
function suggestRaw(e: Exercise, log: SessionLog[]): Suggestion {
  for (let i = log.length - 1; i >= 0; i--) {
    const sets = log[i]!.sets.filter(s => s.ex === e.id && s.kg != null);
    if (!sets.length) continue;
    const top = Math.max(...sets.map(s => s.kg!));
    const atTop = sets.filter(s => s.kg === top);
    const allDone = atTop.length >= e.sets && atTop.every(s => (s.reps ?? 0) >= reps(e.reps));
    const last = `${atTop.length}×${atTop.map(s => s.reps ?? '?').join('/')} à ${top} kg (${log[i]!.date.slice(8)}/${log[i]!.date.slice(5, 7)})`;
    return e.step && allDone ? { kg: Math.max(0, Math.round((top + e.step) * 10) / 10), last, up: true } : { kg: top, last };
  }
  return { kg: null };
}

// ── Séance adaptée au créneau ───────────────────────────────────────────────

const exMinutes = (e: Exercise) => {
  const m = e.reps.match(/(\d+)\s*min/);
  if (m) return Number(m[1]) + e.rest / 60;
  return e.sets * (0.9 + e.rest / 60);
};

/** Exercices qui tiennent dans le créneau (minutes de vraie séance) ; créneau long → finisher cardio. */
export function fitSession(type: SessionType, minutes: number, date?: string): { exercises: Exercise[]; finisher?: string; express: boolean; estMin: number; deload: boolean; low: boolean } {
  const deload = inDeload(date), low = lowForm(date);
  if (low) minutes = Math.min(minutes, 45);
  const base = date && customMap[date] ? { ...SESSIONS[type], exercises: customMap[date]!.exercises } : SESSIONS[type];
  const s = deload || low ? { ...base, exercises: base.exercises.map(e => ({ ...e, sets: Math.min(e.sets, Math.max(2, Math.round(e.sets * 0.6))) })) } : base;
  if (date && customMap[date]?.exact) return { exercises: s.exercises, express: false, estMin: Math.round(s.exercises.reduce((a, e) => a + exMinutes(e), 0) + 5), deload, low };
  const budget = Math.max(20, minutes - 8 - 5);           // échauffement + retour au calme
  const out: Exercise[] = []; let used = 0;
  const core = s.exercises.filter(e => e.muscle === 'abdos').slice(-1);
  for (const e of s.exercises) {
    if (core.includes(e)) continue;
    if (used + exMinutes(e) > budget - (core[0] ? exMinutes(core[0]) : 0) && out.length >= 2) break;
    out.push(e); used += exMinutes(e);
  }
  if (core[0]) { out.push(core[0]); used += exMinutes(core[0]); }
  const left = budget - used;
  // Objectif de Kouider (25/10) : perdre le ventre et du poids en gardant le muscle → finisher brûle-graisse à chaque séance de muscu
  const finMin = Math.max(10, Math.min(25, Math.floor(left / 5) * 5));
  const finisher = !deload && !low && type !== 'cardio' && type !== 'core' ? (finMin >= 15 ? `Brûle-graisse : ${finMin} min de cardio zone 2 (vélo, elliptique ou marche inclinée 10 %) — c'est ce qui fait fondre le ventre` : `Brûle-graisse : 10 min de fractionné (30 s fort / 60 s facile au vélo ou rameur)`) : undefined;
  return { exercises: out, finisher, express: out.length < s.exercises.length, estMin: Math.round(used + 13 + (finisher ? finMin : 0)), deload, low };
}

export function sessionText(type: SessionType, minutes: number, log: SessionLog[], compact = false, date?: string): string {
  const c = date ? customMap[date] : undefined;
  const s = c ? { ...SESSIONS[type], label: c.label, focus: c.focus, ...(c.emoji ? { emoji: c.emoji } : {}), ...(c.warmup ? { warmup: c.warmup } : {}) } : SESSIONS[type];
  const fit = fitSession(type, minutes, date);
  const lines = fit.exercises.map((e, i) => {
    const sug = suggestFor(e, log, date);
    const kg = sug.kg != null ? ` — ${sug.kg} kg${sug.up ? ' ⬆️' : ''}` : '';
    return compact ? `${i + 1}. ${e.name} ${e.sets}×${e.reps}${kg}` : `${i + 1}. ${e.name} — ${e.sets} × ${e.reps}, repos ${e.rest ? `${e.rest} s` : '—'}${kg}\n   💡 ${e.tip}`;
  });
  return [
    `${s.emoji} ${s.label} — ${s.focus}${fit.express ? ` (version ${minutes} min)` : ''}`,
    fit.low ? `😴 Forme ${formMap[date ?? localNow().date]}/5 ce matin : version courte (45 min max) et légère, charges −10 %. L'important c'est d'y aller, pas de tout casser.` : '',
    fit.deload ? '🪶 SEMAINE ALLÉGÉE : moins de séries, charges −10 %, technique parfaite. On récupère pour repartir plus fort.' : '',
    `🔥 Échauffement : ${s.warmup}`,
    ...lines,
    fit.finisher ? `🏁 ${fit.finisher}` : '',
    compact ? '' : '🧊 Retour au calme : 5 min d\'étirements. Douleur vive au dos = stop.',
    compact ? '' : '📱 Mode séance (séries, repos, charges) : app Dzaryx → SPORT',
  ].filter(Boolean).join('\n');
}

// ── Planification sur l'agenda ──────────────────────────────────────────────

/** Minutes vraiment libres dans le créneau sport (un RDV qui chevauche le raccourcit). */
function freeMinutes(e: AgendaEvent, all: AgendaEvent[]): number {
  const s = Date.parse(e.start.dateTime!), en = Date.parse(e.end.dateTime!);
  let cut = 0;
  for (const o of all) {
    if (o === e || !o.start.dateTime || !o.end.dateTime || o.transparency === 'transparent' || isSport(o)) continue;
    if (/^(🚗|🟢|🚿|⏰)/u.test(o.summary ?? '')) continue;
    const a = Math.max(s, Date.parse(o.start.dateTime)), b = Math.min(en, Date.parse(o.end.dateTime));
    if (b > a) cut += b - a;
  }
  return Math.max(0, Math.round((en - s - cut) / 60_000));
}

/** Donne une séance à chaque créneau sport des 7 prochains jours et l'écrit dans l'agenda (titre + détail). */
export async function planSportWeek(write = true): Promise<{ slots: Array<PlanSlot & { date: string }>; note: string }> {
  const st = await getState();
  const log = await readSportLog();
  const today = localNow().date;
  const evs = await listAgendaRange(new Date(localTs(today, '00:00')).toISOString(), new Date(localTs(addDays(today, 7), '23:59')).toISOString(), 250);
  if (!evs) return { slots: [], note: 'agenda FIK injoignable' };
  const sport = evs.filter(isSport).filter(e => e.transparency !== 'transparent');
  const plan: Record<string, PlanSlot> = {};
  let idx = st.next; let changed = 0;
  for (const e of sport) {
    const date = dateOf(e.start.dateTime!);
    if (plan[date]) continue;                                    // un seul créneau sport par jour
    if (st.skips[date]) continue;
    if ((await routinePausedReason(date).catch(() => null))) continue;
    const doneLog = log.find(l => l.date === date);
    const type: SessionType = doneLog?.type ?? st.overrides[date] ?? ROTATION[idx % ROTATION.length]!;
    if (!doneLog && !st.overrides[date]) idx++;
    const minutes = freeMinutes(e, evs);
    const suffix = (e.summary ?? '').includes(' — ') ? (e.summary ?? '').split(' — ').slice(1).join(' — ') : 'salle';
    const title = `🏋️ ${customMap[date]?.label ?? SESSIONS[type].label}${inDeload(date) ? ' (allégée)' : lowForm(date) ? ' (courte)' : ''} — ${suffix}`;
    plan[date] = { type, eventId: e.id!, start: e.start.dateTime!, end: e.end.dateTime!, minutes, title };
    if (write && e.id) {
      const base = (e.description ?? '').includes(MARK) ? (e.description ?? '').split(MARK).pop()! : (e.description ?? '');
      const desc = `${sessionText(type, minutes, log, true, date)}${MARK}${base}`.slice(0, 7000);
      if (e.summary !== title || e.description !== desc) {
        if (await updateAgendaEvent(e.id, { title, description: desc }).catch(() => false)) changed++;
      }
    }
  }
  st.plan = { ...Object.fromEntries(Object.entries(st.plan).filter(([d]) => d < today)), ...plan };
  st.plannedAt = Date.now();
  await saveState(st);
  return { slots: Object.entries(plan).map(([date, p]) => ({ date, ...p })), note: write ? `${changed} créneau(x) mis à jour dans l'agenda` : '' };
}

/** Clôture des jours passés : séance faite → rotation avance ; ratée → refaite au prochain créneau. */
async function closePastDays(st: SportState): Promise<string[]> {
  const today = localNow().date, now = Date.now();
  const log = await readSportLog();
  const missed: string[] = [];
  for (const [date, p] of Object.entries(st.plan).sort()) {
    if (st.history[date] || date > today || Date.parse(p.end) > now) continue;
    if (st.skips[date]) st.history[date] = 'skip';
    else if (log.some(l => l.date === date) || st.arrived[date]) { st.history[date] = 'done'; if (!st.overrides[date]) st.next = (st.next + 1) % ROTATION.length; }
    else { st.history[date] = 'missed'; missed.push(`${SESSIONS[p.type].label} du ${date.slice(8)}/${date.slice(5, 7)}`); }
  }
  return missed;
}

/** Séance prévue un jour donné (texte complet) — pour le plan du coach et l'outil. */
export async function sportSessionFor(date: string): Promise<string | null> {
  const st = await getState();
  const p = st.plan[date];
  if (!p) return st.skips[date] ? `Pas de sport ce jour-là (${st.skips[date]}).` : null;
  return `${hm(Date.parse(p.start))}–${hm(Date.parse(p.end))} · ${sessionText(p.type, p.minutes, await readSportLog(), false, date)}`;
}

// ── Rappels : départ, arrivée, « tu as oublié » ─────────────────────────────

async function gymPoint(): Promise<{ lat: number; lng: number; address: string } | null> {
  const cfg = await getRoutineConfig();
  const g = await geocode(cfg.addresses.gym);
  return g ? { ...g, address: cfg.addresses.gym } : null;
}
const nav = (p: { lat: number; lng: number }) => `🧭 Waze : https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;   // Waze seulement (Kouider 20/10)
const sayTime = (ts: number) => hm(ts).replace('h', ' h ');

async function alertOnce(st: SportState, date: string, kind: string): Promise<boolean> {
  const list = st.alerts[date] ?? [];
  if (list.includes(kind)) return false;
  st.alerts[date] = [...list, kind];
  await saveState(st);
  return true;
}

/** Playlist de la séance du jour, une seule fois par jour (départ de la maison, rappel de départ ou arrivée). */
export async function sendSportPlaylist(date = localNow().date): Promise<boolean> {
  const st = await getState();
  const p = st.plan[date];
  if (!st.settings.playlist || st.skips[date] || !(await alertOnce(st, date, 'playlist'))) return false;
  const { sportPlaylistText } = await import('./presence.js');
  await queueTelegramMessage(await sportPlaylistText(p?.type ?? 'push', p ? SESSIONS[p.type].label : undefined));
  return true;
}

/** Appelée par departures.ts au moment du message « pars à… » d'un créneau sport : séance + lien Waze + appel. */
export async function sportDepartureNotice(o: { start: number; leaveBy: number; minutes: number; traffic: string }): Promise<void> {
  const st = await getState();
  const date = localNow(o.start).date;
  if (st.skips[date] || !(await alertOnce(st, date, 'depart'))) return;
  const p = st.plan[date];
  const label = p ? SESSIONS[p.type] : null;
  const gym = await gymPoint();
  if (gym) await queueTelegramMessage(`🏋️ Salle — ${label?.label ?? 'sport'}\n${nav(gym)}`);
  if (p) await queueTelegramMessage(`🏋️ Aujourd'hui : ${sessionText(p.type, p.minutes, await readSportLog(), true, date)}`);
  await sendSportPlaylist(date).catch(() => null);
  if (!st.settings.callBefore || await getPendingCall('kouider') || await routineCalledRecently(15)) return;
  await callOwner(`C'est l'heure du sport champion ! Aujourd'hui c'est ${label ? `${label.label.toLowerCase()}, ${label.focus.replace(/·/g, ',')}` : 'ta séance'}. Pars à ${sayTime(o.leaveBy)}, il y a ${o.minutes} minutes de route,${o.traffic.replace(/[🔴🟡🟢]/gu, '')}. Je t'ai envoyé le lien Waze de la salle et ta séance sur Telegram. Allez, on y va !`);
}

/** Toutes les 5 min : arrivé à la salle → séance sur Telegram ; séance commencée et GPS loin → appel « tu as oublié ? ». */
export async function jobSportWatch(): Promise<void> {
  await import('./gym-live.js').then(m => m.liveTick()).catch(e => console.warn('[gym-live]', e instanceof Error ? e.message : e));
  let st = await getState();
  if (!st.plannedAt || Date.now() - st.plannedAt > 3 * 3600_000) { await planSportWeek(true).catch(() => null); st = await getState(); }
  if (!st.settings.gymCheck) return;
  const { date } = localNow();
  const p = st.plan[date];
  if (!p || st.skips[date] || st.arrived[date]) return;
  if (await routinePausedReason(date).catch(() => null)) return;
  const now = Date.now(), start = Date.parse(p.start), end = Date.parse(p.end);
  if (now < start - 25 * 60_000 || now > end) return;
  const gym = await gymPoint();
  if (!gym) return;
  const loc = await getLocation('kouider').catch(() => null);
  const fresh = loc && now - Date.parse(loc.updated_at) < 15 * 60_000 ? { lat: loc.lat, lng: loc.lng } : null;
  const s = SESSIONS[p.type];

  if (fresh && km(fresh, gym) < GYM_RADIUS_KM) {
    st.arrived[date] = now;
    await saveState(st);
    const live = await import('./gym-live.js').then(m => m.startLive(date, now)).catch(() => '');
    const text = `💪 Bien arrivé à la salle ! C'est parti pour ${s.label}.\n\n${sessionText(p.type, p.minutes, await readSportLog(), false, date)}${live ? `\n\n${live}` : ''}`;
    await queueTelegramMessage(text);
    await sendSportPlaylist(date).catch(() => null);
    emitProactive(`💪 ${s.label} — ta séance est prête`, 'reminder', text, 'kouider', 'sport');
    return;
  }
  if (now < start + 10 * 60_000) return;
  if (fresh) {
    if (!(await alertOnce(st, date, 'forgot'))) return;
    const dist = km(fresh, gym);
    const t = await drive(fresh, gym);
    await queueTelegramMessage(`⏰ Ta séance ${s.label} a commencé à ${hm(start)} et tu n'es pas à la salle (tu es à ${dist.toFixed(1)} km${t ? `, ${t.min} min de route` : ''}).\nTu as oublié ? Itinéraire depuis où tu es :\n${nav(gym)}\nSi tu ne peux pas aujourd'hui, dis-moi « pas de sport aujourd'hui » : je décale la séance.`);
    emitProactive(`⏰ Tu as oublié le sport ? ${s.label} a commencé à ${hm(start)}`, 'reminder', undefined, 'kouider', 'sport');
    if (!(await getPendingCall('kouider'))) {
      await callOwner(`Kouider, c'est Dzaryx. Ta séance ${s.label.toLowerCase()} a commencé à ${sayTime(start)} et je vois que tu n'es pas à la salle, tu es à ${dist < 10 ? dist.toFixed(1).replace('.', ' virgule ') : Math.round(dist)} kilomètres${t ? `, soit ${t.min} minutes de route` : ''}. Tu as oublié le sport ? Je t'ai envoyé le lien Waze sur Telegram. Si tu ne peux pas aujourd'hui, dis-le-moi et je décale ta séance.`);
    }
  } else if (await alertOnce(st, date, 'nogps')) {
    await queueTelegramMessage(`🏋️ Ta séance ${s.label} a commencé à ${hm(start)} — tu es bien à la salle ?\nJe n'ai pas ta position : partage ta position en direct dans ce chat (📎 → Position → « jusqu'à désactivation ») et je vérifie tout seul, sans te déranger.`);
  }
}

/** Séance du jour pour l'assistant GPS (presence.ts). */
export async function sportToday(): Promise<{ date: string; slot: PlanSlot | null; label: string | null; arrived: boolean; skipped: boolean }> {
  const st = await getState();
  const { date } = localNow();
  const slot = st.plan[date] ?? null;
  return { date, slot, label: slot ? SESSIONS[slot.type].label : null, arrived: !!st.arrived[date], skipped: !!st.skips[date] };
}

const CHAIN = /^(🚗 Trajet → salle|🏋️|🚗 Retour maison|🚿 Douche)/u;

/** Arrivée EN AVANCE confirmée par Kouider (GPS + « oui ») : séance validée maintenant, plus d'alerte départ/« oublié »,
 *  et la matinée de l'agenda (trajet, séance, retour, douche) avancée d'autant. Le petit-déj en famille et le travail ne bougent pas. */
export async function confirmGymArrival(at = Date.now()): Promise<{ text: string; shifted: string[] }> {
  const st = await getState();
  const { date } = localNow(at);
  st.arrived[date] = at;
  st.alerts[date] = [...new Set([...(st.alerts[date] ?? []), 'depart', 'forgot', 'nogps'])];
  const p = st.plan[date];
  const shifted: string[] = [];
  if (p) {
    const delta = at - Date.parse(p.start);
    if (delta < -10 * 60_000) {
      const evs = await listAgendaRange(new Date(localTs(date, '00:00')).toISOString(), new Date(localTs(date, '23:59')).toISOString(), 60).catch(() => null);
      for (const e of evs ?? []) {
        if (!e.id || !e.start.dateTime || !e.end.dateTime || !CHAIN.test(e.summary ?? '')) continue;
        const s = new Date(Date.parse(e.start.dateTime) + delta).toISOString(), en = new Date(Date.parse(e.end.dateTime) + delta).toISOString();
        if (await updateAgendaEvent(e.id, { start: s, end: en }).catch(() => false)) shifted.push(`${(e.summary ?? '').split(' — ')[0]} ${hm(Date.parse(s))}`);
        await kvSet(`dep:${e.id}`, JSON.stringify({ done: true }), 86_400).catch(() => {});   // plus de « pars à… » ni d'appel
        if (e.id === p.eventId) { p.start = s; p.end = en; }
      }
    }
  }
  await saveState(st);
  const s = p ? SESSIONS[p.type] : null;
  const live = p ? await import('./gym-live.js').then(m => m.startLive(date, at)).catch(() => '') : '';
  const text = p && s
    ? `💪 ${s.label} — validée à ${hm(at)}.\n\n${sessionText(p.type, p.minutes, await readSportLog(), false, date)}${live ? `\n\n${live}` : ''}`
    : `💪 Séance hors programme notée à ${hm(at)}. Dis-moi ce que tu fais (ex. « 4×10 squat à 40 kg ») et je le note.`;
  return { text, shifted };
}

/** 20h15 : clôture du jour, planning des 7 jours dans l'agenda (avant le plan du coach de 20h30). */
export async function jobSportPlan(): Promise<void> {
  const st = await getState();
  const missed = await closePastDays(st);
  const deloadMsg = await checkDeload(st).catch(() => null);
  await saveState(st);
  const r = await planSportWeek(true);
  if (deloadMsg) await queueTelegramMessage(deloadMsg);
  if (missed.length) {
    const next = r.slots.find(s => s.date > localNow().date);
    await queueTelegramMessage(`🏋️ Séance ratée : ${missed.join(', ')}. Pas grave, on ne la saute pas : elle passe ${next ? `au prochain créneau (${new Date(next.start).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long' })} ${hm(Date.parse(next.start))})` : 'au prochain créneau'}. 💪`);
  }
  console.log(`[sport] plan : ${r.slots.length} séances, ${r.note}${missed.length ? `, ratées : ${missed.join(', ')}` : ''}`);
}

// ── Notes de séance + stats ─────────────────────────────────────────────────

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
function findExerciseIn(list: Exercise[], q: string, minScore = 1): Exercise | null {
  const n = norm(q);
  const byId = list.find(e => e.id === q);
  if (byId) return byId;
  let best: Exercise | null = null; let score = 0;
  for (const e of list) {
    const words = [...new Set(norm(`${e.name} ${e.alt.join(' ')}`).split(/\s+/).filter(w => w.length > 3))];
    const sc = words.filter(w => n.includes(w)).length;
    if (sc > score) { score = sc; best = e; }
  }
  return score >= minScore ? best : null;
}
export function findExercise(q: string): Exercise | null {
  return findExerciseIn(ALL_EXERCISES(), q);
}

/** Enregistre une séance (ou ajoute des séries à celle du jour). Retourne les records battus. */
export async function logSportSession(entry: Omit<SessionLog, 'at'> & { at?: string }): Promise<{ prs: string[]; total: number }> {
  const log = await readSportLog();
  const prev = [...log];
  const i = log.findIndex(l => l.date === entry.date);
  const merged: SessionLog = i >= 0
    ? { ...log[i]!, ...entry, sets: [...log[i]!.sets, ...entry.sets], at: log[i]!.at }
    : { ...entry, at: entry.at ?? new Date().toISOString() };
  if (i >= 0) log[i] = merged; else log.push(merged);
  await kvSet(LOG_KEY, JSON.stringify(log.slice(-300)));
  const st = await getState();
  if (!st.history[entry.date] || st.history[entry.date] === 'missed') {
    if (st.history[entry.date] === 'missed') st.history[entry.date] = 'done';
    await saveState(st);
  }
  const prs: string[] = [];
  for (const s of entry.sets) {
    if (s.kg == null) continue;
    const before = prev.flatMap(l => l.sets).filter(x => x.ex === s.ex && x.kg != null).map(x => x.kg!);
    if (before.length && s.kg > Math.max(...before) && !prs.some(p => p.startsWith(findExercise(s.ex)?.name ?? s.ex))) prs.push(`${findExercise(s.ex)?.name ?? s.ex} : ${s.kg} kg`);
  }
  return { prs, total: merged.sets.length };
}

const RECOVERY_H: Record<Muscle, number> = { pecs: 72, dos: 72, jambes: 72, epaules: 48, bras: 48, abdos: 24, cardio: 24 };

export async function sportOverview() {
  let st = await getState();
  if (!st.plannedAt || Date.now() - st.plannedAt > 30 * 60_000) { await planSportWeek(true).catch(() => null); st = await getState(); }
  const log = await readSportLog();
  const today = localNow().date;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i)).map(d => {
    const p = st.plan[d];
    return { date: d, type: p?.type ?? null, label: p ? SESSIONS[p.type].label : null, emoji: p ? SESSIONS[p.type].emoji : null,
      start: p?.start ?? null, end: p?.end ?? null, minutes: p?.minutes ?? null, skip: st.skips[d] ?? null,
      status: log.some(l => l.date === d) || st.arrived[d] ? 'done' : st.history[d] ?? null };
  });
  const sessionOf = (date: string) => {
    const p = st.plan[date];
    if (!p) return null;
    const fit = fitSession(p.type, p.minutes, date);
    return { date, type: p.type, ...SESSIONS[p.type], ...(customMap[date] ? { label: customMap[date]!.label, focus: customMap[date]!.focus, custom: customMap[date]!.why } : {}), deload: fit.deload, low: fit.low, form: st.form[date] ?? null, exercises: fit.exercises.map(e => ({ ...e, suggestion: suggestFor(e, log, date), timed: isTimed(e), demo: demoOf(e.id), video: videoOf(e.name) })),
      finisher: fit.finisher ?? null, estMin: fit.estMin, start: p.start, end: p.end, minutes: p.minutes, arrived: st.arrived[date] ?? null };
  };
  const nextDate = week.find(w => w.type && w.status !== 'done' && (w.date > today || Date.parse(w.end!) > Date.now()))?.date;
  // Récupération par muscle (heures depuis le dernier travail)
  const lastHit: Partial<Record<Muscle, number>> = {};
  for (const l of log) {
    const t = Date.parse(l.at);
    const muscles = new Set<Muscle>(l.sets.map(s => findExercise(s.ex)?.muscle).filter(Boolean) as Muscle[]);
    if (!muscles.size) SESSIONS[l.type].muscles.forEach(m => muscles.add(m));
    for (const m of muscles) lastHit[m] = Math.max(lastHit[m] ?? 0, t);
  }
  const recovery = (Object.keys(RECOVERY_H) as Muscle[]).map(m => ({ muscle: m, pct: lastHit[m] ? Math.min(100, Math.round((Date.now() - lastHit[m]!) / 3600_000 / RECOVERY_H[m] * 100)) : 100 }));
  // Stats
  const hist = Object.entries(st.history).sort().map(([, v]) => v).filter(v => v !== 'skip');
  let streak = 0;
  for (let i = hist.length - 1; i >= 0 && hist[i] === 'done'; i--) streak++;
  const month = today.slice(0, 7);
  const volume = (l: SessionLog) => l.sets.reduce((a, s) => a + (s.kg ?? 0) * (s.reps ?? 0), 0);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = addDays(today, -7 * (8 - i) + 1), to = addDays(today, -7 * (7 - i));
    const ls = log.filter(l => l.date >= from && l.date <= to);
    return { from, sessions: ls.length, volume: Math.round(ls.reduce((a, l) => a + volume(l), 0)) };
  });
  const prs = ALL_EXERCISES().map(e => {
    const sets = log.flatMap(l => l.sets.filter(s => s.ex === e.id && s.kg != null).map(s => ({ ...s, date: l.date })));
    if (!sets.length) return null;
    const best = sets.reduce((a, b) => (b.kg! > a.kg! ? b : a));
    return { ex: e.name, kg: best.kg!, reps: best.reps ?? null, date: best.date };
  }).filter(Boolean).slice(0, 12);
  const cfg = await getRoutineConfig();
  const gym = await gymPoint().catch(() => null);
  const loc = await getLocation('kouider').catch(() => null);
  return {
    today: sessionOf(today), next: nextDate && nextDate !== today ? sessionOf(nextDate) : null, week,
    planned: week.filter(w => w.type).map(w => sessionOf(w.date)).filter(Boolean),   // toutes les séances de la semaine, pour les voir à l'avance
    objective: 'Perdre le ventre et du poids · pecs, dos, bras · tout le corps',
    recovery, stats: { streak, monthSessions: log.filter(l => l.date.startsWith(month)).length, total: log.length, weeks, prs },
    gym: gym ? { ...gym, distanceKm: loc && Date.now() - Date.parse(loc.updated_at) < 30 * 60_000 ? Math.round(km(loc, gym) * 10) / 10 : null } : { address: cfg.addresses.gym },
    settings: st.settings, deload: st.deload ?? null, goal: st.goal ? { ...st.goal, ...goalProgress(st, log) } : null, sessions: Object.fromEntries(ROTATION.map(t => [t, { label: SESSIONS[t].label, emoji: SESSIONS[t].emoji, focus: SESSIONS[t].focus }])),
    recent: log.slice(-5).reverse().map(l => ({ date: l.date, type: l.type, label: SESSIONS[l.type].label, sets: l.sets.length, volume: Math.round(volume(l)), durationMin: l.durationMin ?? null, rpe: l.rpe ?? null })),
  };
}

export async function setSportOverride(date: string, type: SessionType | null): Promise<void> {
  const st = await getState();
  if (type) st.overrides[date] = type; else delete st.overrides[date];
  await saveState(st);
  await planSportWeek(true);
}
/** Jour sans sport : trajet, séance, retour et douche de la routine enlevés de l'agenda ce jour-là (Kouider 20/10). */
async function removeSportDayFromAgenda(date: string): Promise<string[]> {
  if (date < localNow().date) return [];
  const evs = await listAgendaRange(new Date(localTs(date, '00:00')).toISOString(), new Date(localTs(date, '23:59')).toISOString(), 60).catch(() => null);
  const removed: string[] = [];
  for (const e of evs ?? []) {
    if (!e.id || !e.start.dateTime || !CHAIN.test(e.summary ?? '')) continue;
    if (await deleteAgendaEvent(e.id).catch(() => false)) removed.push(`${(e.summary ?? '').split(' — ')[0]} ${hm(Date.parse(e.start.dateTime))}`);
  }
  return removed;
}

export async function setSportSkip(date: string, reason: string | null): Promise<string[]> {
  const st = await getState();
  if (reason) st.skips[date] = reason; else delete st.skips[date];
  await saveState(st);
  let removed: string[] = [];
  if (reason) removed = await removeSportDayFromAgenda(date);
  else {
    // Sport remis : on recrée les séries de la routine (le créneau revient), puis on ré-enlève les autres jours annulés
    const { syncRoutineCalendar } = await import('./morning-routine.js');
    await syncRoutineCalendar().catch(() => null);
    for (const d of Object.keys(st.skips)) if (d >= localNow().date) await removeSportDayFromAgenda(d);
  }
  await planSportWeek(true);
  return removed;
}
export async function sportHistory(): Promise<{ history: Record<string, 'done' | 'missed' | 'skip'>; arrived: Record<string, number> }> {
  const st = await getState();
  return { history: st.history, arrived: st.arrived };
}
export async function isSportSkipped(date: string): Promise<boolean> {
  return !!(await getState()).skips[date];
}
export async function setSportSettings(patch: Partial<SportSettings>): Promise<SportSettings> {
  const st = await getState();
  st.settings = { ...st.settings, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v === 'boolean')) };
  await saveState(st);
  return st.settings;
}

// ── Forme au réveil ─────────────────────────────────────────────────────────

/** Note de forme du matin (1-5) : 1-2 → séance du jour courte et légère (agenda réécrit). */
export async function setMorningForm(date: string, score: number): Promise<string> {
  const n = Math.max(1, Math.min(5, Math.round(score)));
  const st = await getState();
  st.form[date] = n; formMap = st.form;
  await saveState(st);
  const p = st.plan[date];
  if (p) await planSportWeek(true).catch(() => null);
  if (!p) return `Forme ${n}/5 notée (pas de séance prévue ce jour-là).`;
  const s = SESSIONS[p.type];
  return n <= 2 ? `😴 Forme ${n}/5 : ${s.label} passe en version courte (45 min max) et légère, charges −10 % (agenda mis à jour). Encourage-le à y aller quand même ; s'il est malade → sport_coach rest.`
    : n === 3 ? `Forme 3/5 : ${s.label} normale, sans forcer les charges max.` : `💪 Forme ${n}/5 : ${s.label} à fond, c'est le jour pour monter les charges.`;
}

/** Réponse au message du réveil : « 2 », « 4/5 », « forme 3 »… → note de forme (seulement un chiffre clair). */
export function parseFormScore(msg: string): number | null {
  // « 2 min j'arrive », « 1 seconde », « 3h » : une durée, pas une note de forme
  if (/^\s*[1-5]\s*(?:min|mn|sec|s\b|h\b|heure|km|fois|jour|x\b)/i.test(msg)) return null;
  const m = /^\s*(?:forme\s*:?\s*)?([1-5])(?:\s*\/\s*5)?(?:\s|[.!,]|$)/i.exec(msg) ?? /\b(?:forme|nuit)\s*:?\s*([1-5])\s*(?:\/\s*5)?\b/i.exec(msg) ?? /(?:^|\s)([1-5])\s*\/\s*5\b/.exec(msg);
  return m ? Number(m[1]) : null;
}

// ── Bilan du dimanche + objectif de la semaine ──────────────────────────────
// Kouider 21/10 : chaque dimanche 20h, un message : la semaine (séances, records, volume), la semaine qui vient,
// l'objectif de la semaine passée (atteint ou pas) et le nouvel objectif, niveau du jeu.

const mondayOf = (date: string) => addDays(date, -((localNow(localTs(date, '12:00')).weekday + 6) % 7));
const volumeOf = (l: SessionLog) => l.sets.reduce((a, x) => a + (x.kg ?? 0) * (x.reps ?? 0), 0);
function doneDates(st: SportState, log: SessionLog[], from: string, to: string): string[] {
  const d = new Set<string>();
  for (const l of log) if (l.date >= from && l.date <= to) d.add(l.date);
  for (const [k, v] of Object.entries(st.history)) if (v === 'done' && k >= from && k <= to) d.add(k);
  for (const k of Object.keys(st.arrived)) if (k >= from && k <= to) d.add(k);
  return [...d].sort();
}
function goalProgress(st: SportState, log: SessionLog[]): { done: number; reached: boolean } {
  const g = st.goal!;
  const to = addDays(g.week, 6);
  if (g.kind === 'sessions') { const n = doneDates(st, log, g.week, to).length; return { done: n, reached: n >= g.target }; }
  const best = Math.max(0, ...log.filter(l => l.date >= g.week && l.date <= to).flatMap(l => l.sets).filter(x => x.ex === g.ex && x.kg != null).map(x => x.kg!));
  return { done: best, reached: best >= g.target };
}

export async function sportWeeklyReport(send = false): Promise<string> {
  const st = await getState();
  const log = await readSportLog();
  const today = localNow().date;
  const from = mondayOf(today), to = addDays(from, 6);
  const done = doneDates(st, log, from, to);
  const missed = Object.entries(st.history).filter(([d, v]) => v === 'missed' && d >= from && d <= to).map(([d]) => d);
  const planned = new Set([...done, ...missed, ...Object.keys(st.plan).filter(d => d >= from && d <= to && !st.skips[d])]).size;
  const week = log.filter(l => l.date >= from && l.date <= to), prevW = log.filter(l => l.date >= addDays(from, -7) && l.date < from);
  const vol = Math.round(week.reduce((a, l) => a + volumeOf(l), 0)), prevVol = Math.round(prevW.reduce((a, l) => a + volumeOf(l), 0));
  const prs: string[] = [];
  for (const e of ALL_EXERCISES()) {
    const kgs = (ls: SessionLog[]) => ls.flatMap(l => l.sets).filter(x => x.ex === e.id && x.kg != null).map(x => x.kg!);
    const now = kgs(week), before = kgs(log.filter(l => l.date < from));
    if (now.length && before.length && Math.max(...now) > Math.max(...before)) prs.push(`${e.name} ${Math.max(...now)} kg`);
  }
  const fmtD = (d: string) => new Date(localTs(d, '12:00')).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric' });
  // Objectif de la semaine passée
  let goalLine = '';
  if (st.goal && st.goal.week === from) {
    const g = goalProgress(st, log);
    goalLine = `🎯 Objectif de la semaine : ${st.goal.text} → ${g.reached ? '✅ ATTEINT, bravo !' : `❌ pas cette fois (${st.goal.kind === 'sessions' ? `${g.done}/${st.goal.target} séances` : g.done ? `meilleur ${g.done} kg` : 'pas noté'})`}`;
  }
  // Semaine prochaine (séances déjà calées sur l'agenda)
  const r = await planSportWeek(send).catch(() => ({ slots: [] as Array<PlanSlot & { date: string }>, note: '' }));
  const next = r.slots.filter(x => x.date > today);
  // Nouvel objectif : régularité d'abord ; si la semaine est pleine, une charge à battre
  const nextMon = addDays(from, 7);
  let goal: WeekGoal = { week: nextMon, kind: 'sessions', target: Math.max(1, next.length), text: `${Math.max(1, next.length)} séance(s) sur ${Math.max(1, next.length)}` };
  if (planned && done.length >= planned) {
    const nextTypes = new Set(next.map(x => x.type));
    const up = ALL_EXERCISES().map(e => ({ e, sug: suggestFor(e, log, nextMon) })).find(x => x.sug.up && x.sug.kg && [...nextTypes].some(t => SESSIONS[t].exercises.some(y => y.id === x.e.id)));
    if (up && !inDeload(nextMon)) goal = { week: nextMon, kind: 'lift', target: up.sug.kg!, ex: up.e.id, text: `${up.e.name} à ${up.sug.kg} kg` };
  }
  if (send) { const fresh = await getState(); fresh.goal = goal; await saveState(fresh); }   // planSportWeek vient de réécrire le plan
  const game = await (await import('./coach-game.js')).computeGame().catch(() => null);
  const health = await import('./jarvis-hub.js').then(m => m.healthWeekLine()).catch(() => '');
  const text = [
    `📊 Bilan sport de la semaine`,
    `✅ Séances : ${done.length}/${planned || done.length}${missed.length ? ` (ratée : ${missed.map(fmtD).join(', ')})` : ''}`,
    vol ? `🏋️ Volume soulevé : ${vol.toLocaleString('fr-FR')} kg${prevVol ? ` (${vol >= prevVol ? '+' : ''}${Math.round((vol - prevVol) / prevVol * 100)} % vs semaine d'avant)` : ''}` : '',
    prs.length ? `🏆 Records battus : ${prs.join(' · ')}` : '',
    goalLine,
    health,
    '',
    next.length ? `🗓️ Semaine prochaine${inDeload(nextMon) ? ' — 🪶 SEMAINE ALLÉGÉE' : ''} :\n${next.map(x => `- ${fmtD(x.date)} ${hm(Date.parse(x.start))} : ${SESSIONS[x.type].emoji} ${SESSIONS[x.type].label}${x.minutes < 60 ? ` (${x.minutes} min)` : ''}`).join('\n')}` : '🗓️ Pas de séance calée la semaine prochaine.',
    `🎯 Nouvel objectif : ${goal.text}`,
    game ? `🎮 Niveau ${game.level} — ${game.title} · ${game.total} pts` : '',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n').trim();
  return text;
}

export async function jobSportWeekly(): Promise<void> {
  if (await routinePausedReason(localNow().date).catch(() => null)) return;
  const text = await sportWeeklyReport(true);
  await queueTelegramMessage(text);
  emitProactive('📊 Ton bilan sport de la semaine', 'reminder', text, 'kouider', 'sport');
}

// ── Outil sport_coach ───────────────────────────────────────────────────────

export const parseDate = (v: unknown): string => {
  const today = localNow().date;
  const s = String(v ?? '').toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s === 'tomorrow' || s === 'demain') return addDays(today, 1);
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const d = days.findIndex(n => s.startsWith(n.slice(0, 3)));
  if (d >= 0) return addDays(today, ((d - localNow().weekday + 7) % 7));
  return today;
};
const parseType = (v: unknown): SessionType | null => {
  const s = norm(String(v ?? ''));
  if (!s.trim()) return null;
  if ((ROTATION as string[]).includes(s.trim())) return s.trim() as SessionType;
  // Programme officiel : « séance A », « haut du corps », « 2 » (numéro dans la rotation)
  const num = /^\s*(?:seance\s*)?(\d)\s*$/.exec(s);
  if (num && ROTATION[Number(num[1]) - 1]) return ROTATION[Number(num[1]) - 1]!;
  const byLabel = ROTATION.find(t => { const l = norm(SESSIONS[t].label).trim(); return l && (s.includes(l) || l.includes(s.trim())); });
  if (byLabel) return byLabel;
  if (programInfo) return ROTATION.find(t => norm(`${SESSIONS[t].label} ${SESSIONS[t].focus}`).split(/\s+/).some(w => w.length > 3 && s.includes(w))) ?? null;
  if (/push|pec|poitrine/.test(s)) return 'push';
  if (/pull|dos|tirage/.test(s)) return 'pull';
  if (/leg|jambe/.test(s)) return 'legs';
  if (/cardio/.test(s)) return 'cardio';
  if (/upper|haut|bras/.test(s)) return 'upper';
  if (/core|abdo|mobil|gainage|souplesse/.test(s)) return 'core';
  return null;
};

export async function sportCoachTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const action = String(input['action'] ?? 'week');
  const date = parseDate(input['date']);
  const fmt = (d: string) => new Date(localTs(d, '12:00')).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });

  if (action === 'session' || action === 'today') {
    const t = await sportSessionFor(date);
    return t ? `🏋️ ${fmt(date)} — ${t}` : `Pas de créneau sport à l'agenda le ${fmt(date)}.`;
  }
  if (action === 'swap') {
    const type = parseType(input['type']);
    if (!type) return '❌ Quel type ? push, pull, legs, cardio, upper ou core.';
    await setSportOverride(date, type);
    return `✅ ${fmt(date)} : ${SESSIONS[type].emoji} ${SESSIONS[type].label} (agenda mis à jour).`;
  }
  if (action === 'skip') {
    const reason = String(input['reason'] ?? 'repos').slice(0, 60);
    const removed = await setSportSkip(date, reason);
    return `✅ Pas de sport le ${fmt(date)} (${reason}) : pas de message ni d'appel de réveil, pas d'alerte de départ, et la séance passe au créneau suivant. Agenda : ${removed.length ? `enlevé ${removed.join(', ')}` : 'rien à enlever (ou agenda injoignable)'}.`;
  }
  if (action === 'rest' || action === 'rest_off') {
    const { setRestDay, restDayReason } = await import('../notifications/rest-day.js');
    if (action === 'rest_off') {
      const was = await restDayReason(date);
      await setRestDay(date, null);
      if ((await getState()).skips[date]?.startsWith('🛌')) await setSportSkip(date, null);
      return was ? `✅ Fin du mode repos le ${fmt(date)} : sport, appels et routine reprennent.` : `Pas de mode repos le ${fmt(date)}.`;
    }
    const reason = String(input['reason'] ?? 'repos').slice(0, 50);
    await setRestDay(date, reason);
    const removed = await setSportSkip(date, `🛌 ${reason}`);
    return `🛌 Mode repos le ${fmt(date)} (${reason}) : pas de sport (séance décalée au prochain créneau${removed.length ? `, enlevé de l'agenda : ${removed.join(', ')}` : ''}), pas de réveil ni de routine du matin, aucun appel de ta part (gardés pour plus tard). Les messages passent toujours. Souhaite-lui bon rétablissement en une phrase, sans conseil de nutrition.`;
  }
  if (action === 'form') {
    const n = Number(input['score']);
    if (!(n >= 1 && n <= 5)) return '❌ score de 1 (crevé) à 5 (au top).';
    return setMorningForm(date, n);
  }
  if (action === 'weekly') return sportWeeklyReport(false);
  if (action === 'deload') {
    const st = await getState();
    const mode = String(input['mode'] ?? 'status');
    if (mode === 'on') {
      st.deload = { start: date, end: addDays(date, 6), why: String(input['reason'] ?? 'demandée par Kouider').slice(0, 60) };
      await saveState(st); deloadWin = st.deload;
      await planSportWeek(true);
      return `🪶 Semaine allégée du ${fmt(date)} au ${fmt(st.deload.end)} : ~40 % de séries en moins, charges −10 %, pas de finisher. Agenda mis à jour.`;
    }
    if (mode === 'off') {
      if (st.deload) { st.deloadLast = localNow().date; delete st.deload; deloadWin = null; await saveState(st); await planSportWeek(true); return '✅ Semaine allégée annulée : retour au programme normal (agenda mis à jour).'; }
      return 'Pas de semaine allégée prévue.';
    }
    const since = st.deloadLast ?? st.trainingSince ?? (await readSportLog())[0]?.date;
    return st.deload ? `🪶 Semaine allégée prévue du ${fmt(st.deload.start)} au ${fmt(st.deload.end)} (${st.deload.why}).`
      : `Pas de semaine allégée prévue. Elle arrive toute seule après ~${DELOAD_EVERY_WEEKS} semaines d'entraînement${since ? ` (compteur depuis le ${fmt(since)})` : ''}, ou plus tôt si tes RPE restent ≥ 8,5.`;
  }
  if (action === 'playlist') {
    const st = await getState();
    const type = parseType(input['type']) ?? st.plan[date]?.type ?? ROTATION[st.next]!;
    const { sportPlaylistText } = await import('./presence.js');
    return sportPlaylistText(type, SESSIONS[type].label);
  }
  if (action === 'unskip') { await setSportSkip(date, null); return `✅ Sport remis le ${fmt(date)} (créneau remis dans l'agenda).`; }
  if (action === 'log') {
    const done = input['done'] === true || input['done'] === 'true';
    const exName = String(input['exercise'] ?? '');
    const st = await getState();
    const type = parseType(input['type']) ?? st.plan[date]?.type ?? ROTATION[st.next]!;
    const sets: SetLog[] = [];
    if (exName) {
      const e = findExercise(exName);
      if (!e) return `❌ Exercice « ${exName} » inconnu — dis-le autrement (ex. « développé couché », « presse »).`;
      const n = Math.max(1, Math.min(10, Number(input['sets'] ?? 1)));
      for (let i = 0; i < n; i++) sets.push({ ex: e.id, ...(Number(input['kg']) > 0 ? { kg: Number(input['kg']) } : {}), ...(Number(input['reps']) > 0 ? { reps: Number(input['reps']) } : {}) });
    } else if (!done) return '❌ Donne l\'exercice (+ séries, reps, kg) ou done=true pour noter la séance faite.';
    const r = await logSportSession({ date, type, sets, ...(Number(input['rpe']) > 0 ? { rpe: Number(input['rpe']) } : {}), ...(input['note'] ? { note: String(input['note']).slice(0, 200) } : {}),
      ...(Number(input['duration_min']) > 0 ? { durationMin: Number(input['duration_min']) } : {}) });
    return `✅ Noté (${SESSIONS[type].label}, ${r.total} série(s) aujourd'hui).${r.prs.length ? ` 🏆 NOUVEAU RECORD : ${r.prs.join(', ')} — félicite-le !` : ''}`;
  }
  if (action === 'settings') {
    const s = await setSportSettings({
      ...(input['call_before'] !== undefined ? { callBefore: input['call_before'] === true || input['call_before'] === 'true' } : {}),
      ...(input['gym_check'] !== undefined ? { gymCheck: input['gym_check'] === true || input['gym_check'] === 'true' } : {}),
      ...(input['playlist'] !== undefined ? { playlist: input['playlist'] === true || input['playlist'] === 'true' } : {}),
    });
    return `✅ Appel avant le sport : ${s.callBefore ? 'oui' : 'non'} · vérif GPS « tu as oublié ? » : ${s.gymCheck ? 'oui' : 'non'} · playlist de séance : ${s.playlist ? 'oui' : 'non'}.`;
  }
  if (action === 'progress') {
    const o = await sportOverview();
    const game = await (await import('./coach-game.js')).computeGame().catch(() => null);
    return [
      game ? `🎮 Niveau ${game.level} — ${game.title} · ${game.total} pts (${game.pct}% vers le niveau ${game.level + 1}) · aujourd'hui +${game.today}` : '',
      `🔥 Série en cours : ${o.stats.streak} séance(s) d'affilée · ce mois : ${o.stats.monthSessions} · total : ${o.stats.total}`,
      o.stats.prs.length ? `🏆 Records : ${o.stats.prs.map(p => `${p!.ex} ${p!.kg} kg`).join(' · ')}` : '🏆 Pas encore de charges notées.',
      `🔋 Récupération : ${o.recovery.map(r => `${r.muscle} ${r.pct}%`).join(' · ')}`,
      o.goal ? `🎯 Objectif de la semaine : ${o.goal.text} — ${o.goal.reached ? '✅ atteint' : o.goal.kind === 'sessions' ? `${o.goal.done}/${o.goal.target}` : `meilleur ${o.goal.done} kg`}` : '',
    ].join('\n');
  }
  if (action === 'live') return (await import('./gym-live.js')).liveTool(input);
  if (action === 'home_by') {
    const { setHomeBy } = await import('./gym-live.js');
    const h = String(input['home_by'] ?? '');
    if (/^(non|off|aucune?)$/i.test(h)) { await setHomeBy(date, null); return `✅ Plus d'heure de retour imposée le ${fmt(date)}.`; }
    if (!/^\d{1,2}[:h]\d{2}$/.test(h)) return '❌ Donne l\'heure où il doit être à la maison (HH:MM).';
    await setHomeBy(date, h.replace('h', ':').padStart(5, '0'));
    return `✅ ${fmt(date)} : à la maison à ${h.replace(':', 'h')}. À la salle je calcule le départ avec le trafic, je l'appelle pour partir et le cardio de fin prend le temps qui reste.`;
  }
  if (action === 'sync') { const r = await planSportWeek(true); return `✅ ${r.slots.length} séance(s) planifiées, ${r.note}.`; }
  if (action === 'program') { await getState(); return sportProgramText(); }
  if (action === 'plan_day') {
    const arr = <T,>(v: unknown): T[] => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return []; } } return Array.isArray(v) ? v as T[] : []; };
    return planCustomDay({ date, ...(input['start'] ? { start: String(input['start']) } : {}), ...(input['home_by'] ? { homeBy: String(input['home_by']) } : {}), ...(input['label'] ? { label: String(input['label']) } : {}),
      exercises: arr<ProgramExercise>(input['exercises']), before: arr(input['before']), after: arr(input['after']), ...(input['source'] ? { source: String(input['source']) } : {}) });
  }
  if (action === 'set_program' || action === 'edit_session' || action === 'reset_program') {
    const asArr = (v: unknown) => { if (typeof v === 'string') { try { return JSON.parse(v) as unknown; } catch { return null; } } return v; };
    const sessions = asArr(input['sessions']) as ProgramSession[] | null;
    const session = asArr(input['session']) as ProgramSession | null;
    return setSportProgram({ reset: action === 'reset_program', source: input['source'] ? String(input['source']) : undefined,
      ...(Array.isArray(sessions) ? { sessions } : {}), ...(session && typeof session === 'object' ? { session, index: Number(input['index'] ?? 0) || (parseType(input['type']) ? ROTATION.indexOf(parseType(input['type'])!) + 1 : 0) } : {}) });
  }
  // week
  const r = await planSportWeek(action === 'sync_week');
  if (!r.slots.length) return `Aucun créneau sport dans les 7 prochains jours${r.note ? ` (${r.note})` : ''}.`;
  return ['🗓️ Ton programme sport (calé sur ton agenda) :', ...r.slots.map(s => `- ${fmt(s.date)} ${hm(Date.parse(s.start))}–${hm(Date.parse(s.end))} : ${SESSIONS[s.type].emoji} ${SESSIONS[s.type].label} (${SESSIONS[s.type].focus})${s.minutes < 60 ? ` — version ${s.minutes} min` : ''}`)].join('\n');
}

/** Prochain jour avec une séance prévue à partir de demain (pour « adapte ma séance de demain »). */
export async function nextSessionDate(from = addDays(localNow().date, 1)): Promise<{ date: string; type: SessionType } | null> {
  const st = await getState();
  if (!st.plannedAt || Date.now() - st.plannedAt > 30 * 60_000) await planSportWeek(true).catch(() => null);
  const plan = (await getState()).plan;
  const d = Object.keys(plan).filter(x => x >= from).sort()[0];
  return d ? { date: d, type: plan[d]!.type } : null;
}

/** Séance sur mesure pour UN jour (photo + objectif) : remplace les exercices de ce jour-là, agenda réécrit. */
export async function setCustomSession(date: string, p: ProgramSession, why: string, opts: { exact?: boolean; blocks?: CardioBlock[] } = {}): Promise<string> {
  const st = await getState();
  const type = st.plan[date]?.type ?? 'core';
  const sess = toSession(p, type);
  const all = JSON.parse((await kvGet(CUSTOM_KEY)) ?? '{}') as Record<string, CustomSession>;
  for (const k of Object.keys(all)) if (k < addDays(localNow().date, -3)) delete all[k];
  all[date] = { label: sess.label, focus: sess.focus, why: why.slice(0, 200), exercises: sess.exercises, at: Date.now(),
    ...(opts.exact ? { exact: true, emoji: sess.emoji, ...(p.warmup ? { warmup: sess.warmup } : {}) } : {}), ...(opts.blocks?.length ? { blocks: opts.blocks } : {}) };
  await kvSet(CUSTOM_KEY, JSON.stringify(all));
  customMap = all;
  await planSportWeek(true).catch(() => null);
  const log = await readSportLog();
  return sessionText(type, st.plan[date]?.minutes ?? 75, log, false, date);
}

// ── Séance dictée (28/10) : « vendredi 20 min tapis, puis dos + triceps de la vidéo, 20 min elliptique » ──────
const CARDIO_KIND: Array<[string, RegExp]> = [
  ['tapis', /tapis|treadmill|course|running|\brun\b|marche|walk/i], ['elliptique', /ellipti/i], ['vélo', /v[ée]lo|cycl|bike|spinning/i],
  ['rameur', /rameur|rowing|\brow/i], ['escalier', /escalier|stair|stepper/i],
];
const cardioKind = (n: string) => CARDIO_KIND.find(([, re]) => re.test(n))?.[0] ?? null;
const LIFT_RE = /strength|renfo|muscu|force|functional|fonctionnel|halt[ée]ro|weight|poids/i;

/** Programme une séance précise un jour donné (agenda créé ou mis à jour, app, Telegram) + cardio avant / après à vérifier avec Santé. */
export async function planCustomDay(o: { date: string; start?: string; label?: string; exercises: ProgramExercise[]; before?: Array<{ name: string; min: number; flex?: boolean }>; after?: Array<{ name: string; min: number; flex?: boolean }>; source?: string; homeBy?: string }): Promise<string> {
  const { date } = o;
  if (date < localNow().date) return '❌ Cette date est passée.';
  const homeBy = /^\d{1,2}[:h]\d{2}$/.test(o.homeBy ?? '') ? o.homeBy!.replace('h', ':').padStart(5, '0') : null;
  // min 0 / flex = « le temps qui me reste » : calé en direct sur l'heure où il doit partir (gym-live.ts)
  const blk = (l: Array<{ name: string; min: number; flex?: boolean }> | undefined, when: CardioBlock['when']): CardioBlock[] =>
    (l ?? []).filter(b => b?.name).map(b => { const flex = !!b.flex || Number(b.min) === 0; return { name: String(b.name).slice(0, 40), min: flex ? 15 : Math.max(1, Math.min(120, Math.round(Number(b.min) || 20))), when, ...(flex ? { flex } : {}) }; });
  const blocks = [...blk(o.before, 'avant'), ...blk(o.after, 'apres')];
  const cardioEx = (b: CardioBlock): ProgramExercise => ({ name: b.name, sets: 1, reps: `${b.min} min`, rest: 0, muscle: 'cardio', tip: b.when === 'avant' ? 'Échauffement : allure régulière, tu dois pouvoir parler.' : 'Zone 2 : allure où tu peux parler en phrases courtes — c\'est ce qui fait fondre le ventre.' });
  const lifts = (o.exercises ?? []).filter(e => e?.name).slice(0, 12);
  if (!lifts.length && !blocks.length) return '❌ Donne-moi les exercices (ceux de la vidéo / photo) et/ou le cardio.';
  const st = await getState();
  if (st.skips[date]) await setSportSkip(date, null);
  // Type de la journée (pour la rotation et les stats) d'après les muscles dominants — le jour garde SES exercices
  const ms = lifts.map(e => guessMuscle(e.name, e.muscle));
  const has = (m: Muscle) => ms.filter(x => x === m).length;
  const type: SessionType = !lifts.length ? 'cardio' : has('jambes') > lifts.length / 2 ? 'legs' : has('dos') && (has('pecs') || has('epaules')) ? 'upper'
    : has('dos') ? 'pull' : has('pecs') || has('epaules') ? 'push' : has('abdos') > lifts.length / 2 ? 'core' : 'upper';
  const st2 = await getState(); st2.overrides[date] = type; await saveState(st2);
  const label = (o.label || (lifts.length ? [...new Set(ms.filter(m => m !== 'cardio'))].map(m => ({ pecs: 'Pecs', dos: 'Dos', epaules: 'Épaules', bras: 'Bras', jambes: 'Jambes', abdos: 'Abdos', cardio: 'Cardio' })[m]).join(' + ') : 'Cardio')).slice(0, 40);
  const p: ProgramSession = { label, emoji: '🎯', ...(blocks.some(b => b.when === 'avant') ? { warmup: `${blocks.filter(b => b.when === 'avant').map(b => `${b.min} min ${b.name}`).join(' + ')} (fait l'échauffement) + 1 série légère au 1er exercice` } : {}),
    exercises: [...blocks.filter(b => b.when === 'avant').map(cardioEx), ...lifts, ...blocks.filter(b => b.when === 'apres').map(cardioEx)] };
  // Durée réelle : cardio + muscu (séries × (effort + repos)) + 5 min de battement, arrondie au quart d'heure
  const est = blocks.reduce((a, b) => a + b.min, 0) + lifts.reduce((a, e) => a + (Number(e.sets) || 3) * (0.9 + (Number(e.rest) || 90) / 60), 0) + 5;
  const total = Math.max(30, Math.ceil(est / 15) * 15);
  const evs = await listAgendaRange(new Date(localTs(date, '00:00')).toISOString(), new Date(localTs(date, '23:59')).toISOString(), 60).catch(() => null);
  const slot = (evs ?? []).find(e => isSport(e) && e.transparency !== 'transparent');
  const cfg = await getRoutineConfig();
  const dow = new Date(localTs(date, '12:00')).getUTCDay();
  const hhmm = /^\d{1,2}[:h]\d{2}$/.test(o.start ?? '') ? o.start!.replace('h', ':').padStart(5, '0') : null;
  const startMs = hhmm ? localTs(date, hhmm) : slot?.start.dateTime ? Date.parse(slot.start.dateTime) : localTs(date, cfg.days[dow]?.sport?.[0] ?? '06:00');
  let endMs = startMs + total * 60_000;
  let homeNote = '';
  if (homeBy) {
    const { setHomeBy, gymToHomeMin } = await import('./gym-live.js');
    await setHomeBy(date, homeBy);
    const road = await gymToHomeMin().catch(() => 20);
    const leave = localTs(date, homeBy) - (road + 3) * 60_000;
    if (leave > startMs + 20 * 60_000) endMs = leave;
    homeNote = `\n\n🏠 À la maison à ${homeBy.replace(':', 'h')} : départ de la salle vers ${hm(leave)} (≈ ${road} min de route, recalculé avec le trafic le jour même). À la salle je te suis en direct : je te dis ce qu'il reste, je te demande tes charges à chaque série et je t'appelle quand il faut partir.`;
  }
  let agenda: string;
  if (slot?.id) {
    const ok = await updateAgendaEvent(slot.id, { start: new Date(startMs).toISOString(), end: new Date(Math.max(endMs, hhmm ? 0 : Date.parse(slot.end.dateTime!))).toISOString() }).catch(() => false);
    agenda = ok ? 'créneau sport de l\'agenda mis à jour' : 'agenda injoignable (séance gardée quand même)';
  } else {
    const { createAgendaEvent } = await import('./google-calendar.js');
    const id = await createAgendaEvent(`🏋️ ${label.toUpperCase()} — salle`, new Date(startMs).toISOString(), new Date(endMs).toISOString()).catch(() => null);
    agenda = id ? 'créneau créé dans ton agenda' : 'agenda injoignable (séance gardée quand même)';
  }
  const text = await setCustomSession(date, p, o.source ?? 'séance dictée par Kouider', { exact: true, blocks });
  const fmt = new Date(startMs).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const check = [...blocks.map(b => `${b.name} ${b.flex ? 'le temps qui reste' : `${b.min} min`}`), ...(lifts.length ? ['la muscu'] : [])].join(', ');
  return `✅ ${fmt}, ${hm(startMs)}–${hm(endMs)} (${Math.round((endMs - startMs) / 60_000)} min) : ${agenda}, séance aussi dans l'app et dans ton appel du matin.\n\n${text}${homeNote}\n\n⌚ Je vérifierai avec Santé / Forme de l'iPhone : ${check}. Lance un entraînement par partie sur ta montre (Tapis / Muscu / Elliptique) pour que je voie chaque bloc.`;
}

/** Séance du jour découpée pour le coach en direct (gym-live.ts) : cardio avant, muscu, cardio après. */
export async function liveSessionPlan(date: string): Promise<{ type: SessionType; label: string; exercises: Exercise[]; before: CardioBlock[]; after: CardioBlock[] }> {
  const st = await getState();
  const p = st.plan[date], c = customMap[date];
  const type = st.overrides[date] ?? p?.type ?? ROTATION[st.next]!;
  const blocks = c?.blocks ?? [];
  const exercises = fitSession(type, p?.minutes ?? 75, date).exercises.filter(e => !(e.muscle === 'cardio' && blocks.some(b => b.name === e.name)));
  return { type, label: c?.label ?? SESSIONS[type].label, exercises, before: blocks.filter(b => b.when === 'avant'), after: blocks.filter(b => b.when === 'apres') };
}

/** Ce que Santé a vu ce jour-là comparé à la séance dictée (bloc par bloc). null si rien de dicté ou déjà dit. */
export async function compareWithWatch(date: string, items: Array<{ name: string; min: number }>): Promise<string | null> {
  await getState();
  const c = customMap[date];
  if (!c?.exact || !items.length) return null;
  const sig = items.map(i => `${i.name}:${Math.round(i.min)}`).join('|');
  if ((await kvGet(`kouider:sport:watchcheck:${date}`).catch(() => null)) === sig) return null;
  await kvSet(`kouider:sport:watchcheck:${date}`, sig, 3 * 86_400);
  const used = new Set<number>();
  const lines: string[] = []; let missing = 0;
  const take = (ok: (n: string) => boolean) => { const i = items.findIndex((x, k) => !used.has(k) && ok(x.name)); if (i >= 0) used.add(i); return i >= 0 ? items[i]! : null; };
  for (const b of c.blocks ?? []) {
    const kind = cardioKind(b.name);
    const w = take(n => kind ? cardioKind(n) === kind : !LIFT_RE.test(n));
    if (!w) { lines.push(`❌ ${b.name} ${b.min} min : pas vu`); missing++; }
    else if (w.min > 0 && w.min < b.min * 0.8) lines.push(`⚠️ ${b.name} : ${Math.round(w.min)} min sur ${b.min}`);
    else lines.push(`✅ ${b.name}${w.min > 0 ? ` ${Math.round(w.min)} min` : ''}`);
  }
  if (c.exercises.some(e => e.muscle !== 'cardio')) {
    const w = take(n => LIFT_RE.test(n) || !cardioKind(n));
    if (w) lines.push(`✅ Muscu (${c.label})${w.min > 0 ? ` ${Math.round(w.min)} min` : ''}`); else { lines.push(`❌ Muscu (${c.label}) : pas vue`); missing++; }
  }
  const head = !missing ? '🎯 Séance faite comme prévu, bravo !' : missing === lines.length ? '🤔 Rien de ta séance prévue dans Santé' : '📋 Séance faite en partie';
  return `${head}\n${lines.join('\n')}${missing ? '\nSi tu l\'as faite sans la montre, dis-le-moi et je la coche.' : ''}`;
}

export const exerciseLibraryText = () => Object.values(DEFAULT_SESSIONS).flatMap(x => x.exercises).map(e => `${e.name} (${e.muscle})`).filter((v, i, a) => a.indexOf(v) === i).join(', ');

// ── Apple Watch (Raccourci Santé, 28/10) ─────────────────────────────────────
/** Note de forme donnée par la montre (cœur / VFC) — seulement s'il ne l'a pas donnée lui-même ce matin. */
export async function setFormFromWatch(date: string, score: number): Promise<string | null> {
  const st = await getState();
  if (st.form[date] != null) return null;
  return setMorningForm(date, score);
}

/** Entraînement enregistré par la montre → séance cochée (journal + FORME), sans qu'il ait à le dire. */
export async function markWatchWorkout(date: string, minutes: number, name: string): Promise<string | null> {
  const log = await readSportLog();
  if (log.some(l => l.date === date)) return null;            // déjà notée (par lui ou un envoi précédent)
  const st = await getState();
  const type: SessionType = st.overrides[date] ?? st.plan[date]?.type ?? (/cardio|course|run|marche|walk|vélo|cycl|elliptique|rameur|row/i.test(name) ? 'cardio' : ROTATION[st.next] ?? 'push');
  await logSportSession({ date, type, ...(minutes > 0 ? { durationMin: Math.round(minutes) } : {}), note: `Apple Watch : ${name}`.slice(0, 80), sets: [] });
  await import('./forme.js').then(f => f.updateDay('kouider', date, d => {
    if (!d.workout) d.workout = { session: 0, label: SESSIONS[type].label, sets: [], ...(minutes > 0 ? { durationMin: Math.round(minutes) } : {}), at: Date.now() };
  })).catch(() => {});
  return `🏋️ Séance${minutes > 0 ? ` de ${Math.round(minutes)} min` : ''} (${name}) vue par ta montre → ${SESSIONS[type].label} cochée dans ton coach.`;
}
