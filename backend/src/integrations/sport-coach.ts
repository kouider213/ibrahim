import { kvGet, kvSet } from './app-store.js';
import { listAgendaRange, updateAgendaEvent, type AgendaEvent } from './google-calendar.js';
import { getLocation } from './location.js';
import { geocode, drive, km } from './departures.js';
import { getRoutineConfig, routinePausedReason, routineCalledRecently, localNow, localTs, hm, TZ } from './morning-routine.js';
import { queueTelegramMessage, queueTelegramLocation } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { callOwner, getPendingCall } from '../notifications/voice-call.js';

// COACH SPORTIF (demande de Kouider 2026-10-17) : chaque créneau sport de l'agenda FIK reçoit sa séance — PUSH DAY,
// PULL DAY, LEG DAY, CARDIO DAY… — avec les exercices, séries × répétitions, repos et la charge conseillée (progression
// d'après ses séances notées). Le programme s'adapte à l'agenda : la rotation suit les vrais créneaux, une séance ratée
// est refaite la fois suivante, un créneau raccourci (RDV qui chevauche) donne une séance plus courte.
// Rappels : au moment de partir → appel + point GPS de la salle sur Telegram ; séance commencée et GPS loin de la salle
// → « tu as oublié le sport ? » (appel + point GPS) ; arrivé à la salle → la séance du jour arrive sur Telegram.
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

export interface SetLog { ex: string; kg?: number; reps?: number }
export interface SessionLog { date: string; type: SessionType; at: string; durationMin?: number; rpe?: number; note?: string; sets: SetLog[] }
interface PlanSlot { type: SessionType; eventId: string; start: string; end: string; minutes: number; title: string }
type DayStatus = 'done' | 'missed' | 'skip';
export interface SportSettings { callBefore: boolean; gymCheck: boolean }
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
}

const DEFAULT_STATE: SportState = { next: 0, plan: {}, overrides: {}, skips: {}, history: {}, arrived: {}, alerts: {}, settings: { callBefore: true, gymCheck: true } };

async function getState(): Promise<SportState> {
  try { const s = JSON.parse((await kvGet(STATE_KEY)) ?? '{}') as Partial<SportState>; return { ...DEFAULT_STATE, ...s, settings: { ...DEFAULT_STATE.settings, ...s.settings } }; }
  catch { return { ...DEFAULT_STATE }; }
}
async function saveState(s: SportState): Promise<void> {
  const keep = (r: Record<string, unknown>, days: number) => {
    const min = addDays(localNow().date, -days);
    for (const k of Object.keys(r)) if (k < min) delete r[k];
  };
  keep(s.plan, 7); keep(s.overrides, 7); keep(s.skips, 7); keep(s.arrived, 7); keep(s.alerts, 3); keep(s.history, 180);
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

// ── Charges conseillées (progression) ───────────────────────────────────────

export interface Suggestion { kg: number | null; last?: string; up?: boolean }

/** Dernière perf sur l'exercice ; toutes les séries au haut de la fourchette → + step kg. */
export function suggestFor(e: Exercise, log: SessionLog[]): Suggestion {
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
export function fitSession(type: SessionType, minutes: number): { exercises: Exercise[]; finisher?: string; express: boolean; estMin: number } {
  const s = SESSIONS[type];
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
  const finisher = type !== 'cardio' && type !== 'core' && left >= 12 ? `Cardio zone 2 : ${Math.min(25, Math.floor(left / 5) * 5)} min (vélo, elliptique ou marche inclinée)` : undefined;
  return { exercises: out, finisher, express: out.length < s.exercises.length, estMin: Math.round(used + 13 + (finisher ? Math.min(25, Math.floor(left / 5) * 5) : 0)) };
}

export function sessionText(type: SessionType, minutes: number, log: SessionLog[], compact = false): string {
  const s = SESSIONS[type];
  const fit = fitSession(type, minutes);
  const lines = fit.exercises.map((e, i) => {
    const sug = suggestFor(e, log);
    const kg = sug.kg != null ? ` — ${sug.kg} kg${sug.up ? ' ⬆️' : ''}` : '';
    return compact ? `${i + 1}. ${e.name} ${e.sets}×${e.reps}${kg}` : `${i + 1}. ${e.name} — ${e.sets} × ${e.reps}, repos ${e.rest ? `${e.rest} s` : '—'}${kg}\n   💡 ${e.tip}`;
  });
  return [
    `${s.emoji} ${s.label} — ${s.focus}${fit.express ? ` (version ${minutes} min)` : ''}`,
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
    const title = `🏋️ ${SESSIONS[type].label} — ${suffix}`;
    plan[date] = { type, eventId: e.id!, start: e.start.dateTime!, end: e.end.dateTime!, minutes, title };
    if (write && e.id) {
      const base = (e.description ?? '').includes(MARK) ? (e.description ?? '').split(MARK).pop()! : (e.description ?? '');
      const desc = `${sessionText(type, minutes, log, true)}${MARK}${base}`.slice(0, 7000);
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
  return `${hm(Date.parse(p.start))}–${hm(Date.parse(p.end))} · ${sessionText(p.type, p.minutes, await readSportLog())}`;
}

// ── Rappels : départ, arrivée, « tu as oublié » ─────────────────────────────

async function gymPoint(): Promise<{ lat: number; lng: number; address: string } | null> {
  const cfg = await getRoutineConfig();
  const g = await geocode(cfg.addresses.gym);
  return g ? { ...g, address: cfg.addresses.gym } : null;
}
const nav = (p: { lat: number; lng: number }) => `🧭 Waze : https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes\n🗺️ Maps : https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
const sayTime = (ts: number) => hm(ts).replace('h', ' h ');

async function alertOnce(st: SportState, date: string, kind: string): Promise<boolean> {
  const list = st.alerts[date] ?? [];
  if (list.includes(kind)) return false;
  st.alerts[date] = [...list, kind];
  await saveState(st);
  return true;
}

/** Appelée par departures.ts au moment du message « pars à… » d'un créneau sport : séance + point GPS + appel. */
export async function sportDepartureNotice(o: { start: number; leaveBy: number; minutes: number; traffic: string }): Promise<void> {
  const st = await getState();
  const date = localNow(o.start).date;
  if (st.skips[date] || !(await alertOnce(st, date, 'depart'))) return;
  const p = st.plan[date];
  const label = p ? SESSIONS[p.type] : null;
  const gym = await gymPoint();
  if (gym) await queueTelegramLocation(gym.lat, gym.lng, `🏋️ Salle — ${label?.label ?? 'sport'}`, gym.address);
  if (p) await queueTelegramMessage(`🏋️ Aujourd'hui : ${sessionText(p.type, p.minutes, await readSportLog(), true)}`);
  if (!st.settings.callBefore || await getPendingCall('kouider') || await routineCalledRecently(15)) return;
  await callOwner(`C'est l'heure du sport champion ! Aujourd'hui c'est ${label ? `${label.label.toLowerCase()}, ${label.focus.replace(/·/g, ',')}` : 'ta séance'}. Pars à ${sayTime(o.leaveBy)}, il y a ${o.minutes} minutes de route,${o.traffic.replace(/[🔴🟡🟢]/gu, '')}. Je t'ai envoyé le point GPS de la salle et ta séance sur Telegram. Allez, on y va !`);
}

/** Toutes les 5 min : arrivé à la salle → séance sur Telegram ; séance commencée et GPS loin → appel « tu as oublié ? ». */
export async function jobSportWatch(): Promise<void> {
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
    const text = `💪 Bien arrivé à la salle ! C'est parti pour ${s.label}.\n\n${sessionText(p.type, p.minutes, await readSportLog())}`;
    await queueTelegramMessage(text);
    emitProactive(`💪 ${s.label} — ta séance est prête`, 'reminder', text, 'kouider', 'sport');
    return;
  }
  if (now < start + 10 * 60_000) return;
  if (fresh) {
    if (!(await alertOnce(st, date, 'forgot'))) return;
    const dist = km(fresh, gym);
    const t = await drive(fresh, gym);
    await queueTelegramLocation(gym.lat, gym.lng, `🏋️ Salle — ${s.label}`, gym.address);
    await queueTelegramMessage(`⏰ Ta séance ${s.label} a commencé à ${hm(start)} et tu n'es pas à la salle (tu es à ${dist.toFixed(1)} km${t ? `, ${t.min} min de route` : ''}).\nTu as oublié ? Le point GPS est juste au-dessus.\n${nav(gym)}\nSi tu ne peux pas aujourd'hui, dis-moi « pas de sport aujourd'hui » : je décale la séance.`);
    emitProactive(`⏰ Tu as oublié le sport ? ${s.label} a commencé à ${hm(start)}`, 'reminder', undefined, 'kouider', 'sport');
    if (!(await getPendingCall('kouider'))) {
      await callOwner(`Kouider, c'est Dzaryx. Ta séance ${s.label.toLowerCase()} a commencé à ${sayTime(start)} et je vois que tu n'es pas à la salle, tu es à ${dist < 10 ? dist.toFixed(1).replace('.', ' virgule ') : Math.round(dist)} kilomètres${t ? `, soit ${t.min} minutes de route` : ''}. Tu as oublié le sport ? Je t'ai envoyé le point GPS sur Telegram. Si tu ne peux pas aujourd'hui, dis-le-moi et je décale ta séance.`);
    }
  } else if (await alertOnce(st, date, 'nogps')) {
    await queueTelegramLocation(gym.lat, gym.lng, `🏋️ Salle — ${s.label}`, gym.address);
    await queueTelegramMessage(`🏋️ Ta séance ${s.label} a commencé à ${hm(start)} — tu es bien à la salle ?\nJe n'ai pas ta position : partage ta position en direct dans ce chat (📎 → Position → « jusqu'à désactivation ») et je vérifie tout seul, sans te déranger.`);
  }
}

/** 20h15 : clôture du jour, planning des 7 jours dans l'agenda (avant le plan du coach de 20h30). */
export async function jobSportPlan(): Promise<void> {
  const st = await getState();
  const missed = await closePastDays(st);
  await saveState(st);
  const r = await planSportWeek(true);
  if (missed.length) {
    const next = r.slots.find(s => s.date > localNow().date);
    await queueTelegramMessage(`🏋️ Séance ratée : ${missed.join(', ')}. Pas grave, on ne la saute pas : elle passe ${next ? `au prochain créneau (${new Date(next.start).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long' })} ${hm(Date.parse(next.start))})` : 'au prochain créneau'}. 💪`);
  }
  console.log(`[sport] plan : ${r.slots.length} séances, ${r.note}${missed.length ? `, ratées : ${missed.join(', ')}` : ''}`);
}

// ── Notes de séance + stats ─────────────────────────────────────────────────

const ALL_EX = Object.values(SESSIONS).flatMap(s => s.exercises);
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
export function findExercise(q: string): Exercise | null {
  const n = norm(q);
  const byId = ALL_EX.find(e => e.id === q);
  if (byId) return byId;
  let best: Exercise | null = null; let score = 0;
  for (const e of ALL_EX) {
    const words = norm(`${e.name} ${e.alt.join(' ')}`).split(/\s+/).filter(w => w.length > 3);
    const sc = words.filter(w => n.includes(w)).length;
    if (sc > score) { score = sc; best = e; }
  }
  return best;
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
    const fit = fitSession(p.type, p.minutes);
    return { date, type: p.type, ...SESSIONS[p.type], exercises: fit.exercises.map(e => ({ ...e, suggestion: suggestFor(e, log), timed: isTimed(e) })),
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
  const prs = ALL_EX.map(e => {
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
    recovery, stats: { streak, monthSessions: log.filter(l => l.date.startsWith(month)).length, total: log.length, weeks, prs },
    gym: gym ? { ...gym, distanceKm: loc && Date.now() - Date.parse(loc.updated_at) < 30 * 60_000 ? Math.round(km(loc, gym) * 10) / 10 : null } : { address: cfg.addresses.gym },
    settings: st.settings, sessions: Object.fromEntries(ROTATION.map(t => [t, { label: SESSIONS[t].label, emoji: SESSIONS[t].emoji, focus: SESSIONS[t].focus }])),
    recent: log.slice(-5).reverse().map(l => ({ date: l.date, type: l.type, label: SESSIONS[l.type].label, sets: l.sets.length, volume: Math.round(volume(l)), durationMin: l.durationMin ?? null, rpe: l.rpe ?? null })),
  };
}

export async function setSportOverride(date: string, type: SessionType | null): Promise<void> {
  const st = await getState();
  if (type) st.overrides[date] = type; else delete st.overrides[date];
  await saveState(st);
  await planSportWeek(true);
}
export async function setSportSkip(date: string, reason: string | null): Promise<void> {
  const st = await getState();
  if (reason) st.skips[date] = reason; else delete st.skips[date];
  await saveState(st);
  await planSportWeek(true);
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

// ── Outil sport_coach ───────────────────────────────────────────────────────

const parseDate = (v: unknown): string => {
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
    await setSportSkip(date, reason);
    return `✅ Pas de sport le ${fmt(date)} (${reason}) : pas d'appel ni d'alerte de départ ce jour-là, et la séance passe au créneau suivant.`;
  }
  if (action === 'unskip') { await setSportSkip(date, null); return `✅ Sport remis le ${fmt(date)}.`; }
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
    });
    return `✅ Appel avant le sport : ${s.callBefore ? 'oui' : 'non'} · vérif GPS « tu as oublié ? » : ${s.gymCheck ? 'oui' : 'non'}.`;
  }
  if (action === 'progress') {
    const o = await sportOverview();
    return [
      `🔥 Série en cours : ${o.stats.streak} séance(s) d'affilée · ce mois : ${o.stats.monthSessions} · total : ${o.stats.total}`,
      o.stats.prs.length ? `🏆 Records : ${o.stats.prs.map(p => `${p!.ex} ${p!.kg} kg`).join(' · ')}` : '🏆 Pas encore de charges notées.',
      `🔋 Récupération : ${o.recovery.map(r => `${r.muscle} ${r.pct}%`).join(' · ')}`,
    ].join('\n');
  }
  if (action === 'sync') { const r = await planSportWeek(true); return `✅ ${r.slots.length} séance(s) planifiées, ${r.note}.`; }
  // week
  const r = await planSportWeek(action === 'sync_week');
  if (!r.slots.length) return `Aucun créneau sport dans les 7 prochains jours${r.note ? ` (${r.note})` : ''}.`;
  return ['🗓️ Ton programme sport (calé sur ton agenda) :', ...r.slots.map(s => `- ${fmt(s.date)} ${hm(Date.parse(s.start))}–${hm(Date.parse(s.end))} : ${SESSIONS[s.type].emoji} ${SESSIONS[s.type].label} (${SESSIONS[s.type].focus})${s.minutes < 60 ? ` — version ${s.minutes} min` : ''}`)].join('\n');
}
