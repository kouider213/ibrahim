import { kvGet, kvSet } from './app-store.js';
import { createAnthropic } from './anthropic-compat.js';

// BIBLIOTHÈQUE D'EXERCICES de FORME (Kouider 26/10, « comme l'appli de la vidéo ») : ~800 exercices de free-exercise-db
// (domaine public : 2 photos par exercice, muscles principaux / secondaires, consignes en anglais). Noms et fiches
// traduits en français une seule fois par Claude Haiku, gardés dans app_kv. Les schémas des muscles sont dans l'app.
const DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
export const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const NAMES_K = 'sport:exlib:names:fr';
const DETAIL_K = (id: string) => `sport:exlib:fr:${id}`;
const MATCH_K = 'sport:exlib:match';
const HAIKU = 'claude-haiku-5-5';

interface RawEx { id: string; name: string; level: string; equipment: string | null; category: string; primaryMuscles: string[]; secondaryMuscles: string[]; instructions: string[]; images: string[] }
export interface LibItem { id: string; name: string; fr: string; p: string[]; s: string[]; eq: string; level: string; cat: string; img: string[] }
export interface LibDetail extends LibItem { steps: string[]; mistakes: string[]; breathing: string }

let cache: { at: number; list: RawEx[] } | null = null;
async function rawDb(): Promise<RawEx[]> {
  if (cache && Date.now() - cache.at < 24 * 3600_000) return cache.list;
  const r = await fetch(DB_URL, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`bibliothèque d'exercices indisponible (${r.status})`);
  const all = await r.json() as RawEx[];
  // Haltérophilie olympique / strongman : hors sujet pour une salle classique
  cache = { at: Date.now(), list: all.filter(e => e.images.length && !['strongman', 'olympic weightlifting'].includes(e.category)) };
  return cache.list;
}

const textOf = (res: { content: Array<{ type: string }> }) => res.content.filter(b => b.type === 'text').map(b => (b as unknown as { text: string }).text).join('');
const arrOf = (raw: string): unknown[] => { try { return JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)) as unknown[]; } catch { return []; } };

async function frNames(list: RawEx[]): Promise<Record<string, string>> {
  let map: Record<string, string> = {};
  try { map = JSON.parse((await kvGet(NAMES_K)) ?? '{}') as Record<string, string>; } catch { /* vide */ }
  const todo = list.filter(e => !map[e.id]);
  if (!todo.length) return map;
  // Par paquets de 60 en parallèle (une seule fois) : tableau ordonné, Haiku abîme les clés d'un objet
  const chunks = Array.from({ length: Math.ceil(todo.length / 60) }, (_, i) => todo.slice(i * 60, i * 60 + 60));
  await Promise.all(chunks.map(async c => {
    const res = await createAnthropic().messages.create({ model: HAIKU, max_tokens: 6000,
      system: 'Tu traduis des noms d\'exercices de musculation en français, comme on les dit en salle en France/Belgique (ex. « Dumbbell Bench Press » → « Développé couché haltères », « Lat Pulldown » → « Tirage vertical », « Romanian Deadlift » → « Soulevé de terre roumain »). Court, sans article. Réponds UNIQUEMENT par un tableau JSON de chaînes, même ordre, même longueur.',
      messages: [{ role: 'user', content: JSON.stringify(c.map(e => e.name)) }] }).catch(() => null);
    const out = res ? arrOf(textOf(res)) : [];
    if (out.length === c.length) c.forEach((e, i) => { if (typeof out[i] === 'string' && out[i]) map[e.id] = String(out[i]).slice(0, 80); });
  }));
  await kvSet(NAMES_K, JSON.stringify(map)).catch(() => {});
  return map;
}

const item = (e: RawEx, fr: Record<string, string>): LibItem => ({ id: e.id, name: e.name, fr: fr[e.id] ?? e.name, p: e.primaryMuscles, s: e.secondaryMuscles,
  eq: e.equipment ?? 'none', level: e.level, cat: e.category, img: e.images.slice(0, 2).map(i => `${IMG_BASE}/${i}`) });

export async function exerciseLibrary(): Promise<LibItem[]> {
  const list = await rawDb();
  const fr = await frNames(list);
  return list.map(e => item(e, fr));
}

/** Fiche complète : étapes, erreurs fréquentes, respiration (en français, faite une fois puis gardée). */
export async function exerciseDetail(id: string): Promise<LibDetail | null> {
  const list = await rawDb();
  const e = list.find(x => x.id === id);
  if (!e) return null;
  const base = item(e, await frNames([e]));
  try { const c = JSON.parse((await kvGet(DETAIL_K(id))) ?? 'null') as Pick<LibDetail, 'steps' | 'mistakes' | 'breathing'> | null; if (c?.steps?.length) return { ...base, ...c }; } catch { /* refaite */ }
  const res = await createAnthropic().messages.create({ model: HAIKU, max_tokens: 1500,
    system: 'Tu es coach de musculation. À partir des consignes (en anglais) d\'un exercice, écris la fiche EN FRANÇAIS, tutoiement, phrases courtes. Réponds UNIQUEMENT en JSON : {"steps":["3 à 6 étapes : position de départ, mouvement, retour"],"mistakes":["2 ou 3 erreurs fréquentes à éviter (dos, élan, amplitude…)"],"breathing":"une phrase sur la respiration"}',
    messages: [{ role: 'user', content: `${e.name} (${e.equipment ?? 'sans matériel'})\n${e.instructions.join('\n')}` }] });
  const raw = textOf(res);
  let j: { steps?: unknown[]; mistakes?: unknown[]; breathing?: unknown } = {};
  try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as typeof j; } catch { /* consignes brutes ci-dessous */ }
  const d = { steps: (j.steps ?? e.instructions).map(String).slice(0, 8), mistakes: (j.mistakes ?? []).map(String).slice(0, 4), breathing: String(j.breathing ?? '').slice(0, 200) };
  if (j.steps?.length) await kvSet(DETAIL_K(id), JSON.stringify(d)).catch(() => {});
  return { ...base, ...d };
}

/** 09/11 — exercices courants reconnus PAR LE CODE (du plus précis au plus général) : la bonne photo sort tout de suite, sans IA
 *  (qui peut être en panne de quota, ou se tromper de matériel : « développé couché barre » montrait des haltères). */
const KNOWN: Array<[RegExp, string]> = [
  [/developpe.*incline.*(barre|smith)/, 'Barbell_Incline_Bench_Press_-_Medium_Grip'], [/developpe.*incline.*halter/, 'Incline_Dumbbell_Press'], [/developpe.*incline/, 'Leverage_Incline_Chest_Press'],
  [/developpe.*decline/, 'Decline_Barbell_Bench_Press'], [/developpe.*couche.*halter/, 'Dumbbell_Bench_Press'], [/developpe.*couche.*smith/, 'Smith_Machine_Bench_Press'],
  [/developpe.*(couche.*)?(machine|convergent)/, 'Leverage_Chest_Press'], [/developpe.*couche|bench press/, 'Barbell_Bench_Press_-_Medium_Grip'],
  [/developpe.*(militaire|epaule).*halter|developpe.*halter.*epaule/, 'Dumbbell_Shoulder_Press'], [/developpe.*militaire/, 'Standing_Military_Press'], [/arnold/, 'Arnold_Dumbbell_Press'],
  [/ecarte.*(poulie|cable|vis a vis)|cable cross/, 'Cable_Crossover'], [/ecarte.*halter/, 'Dumbbell_Flyes'], [/ecarte|butterfly|pec deck|papillon/, 'Butterfly'],
  [/pompes?\b/, 'Pushups'], [/dips.*banc/, 'Bench_Dips'], [/\bdips\b/, 'Dips_-_Chest_Version'],
  [/tirage.*(serre|supination)/, 'Close-Grip_Front_Lat_Pulldown'], [/tirage.*(haut|vertical|poitrine|nuque)|lat pulldown/, 'Wide-Grip_Lat_Pulldown'], [/tirage.*(bas|horizontal|assis)|rowing.*(assis|poulie)/, 'Seated_Cable_Rows'],
  [/rowing.*barre.*t|t bar/, 'T-Bar_Row_with_Handle'], [/rowing.*barre/, 'Bent_Over_Barbell_Row'], [/rowing.*(halter|un bras|1 bras)/, 'One-Arm_Dumbbell_Row'],
  [/tractions?.*supination|chin up/, 'Chin-Up'], [/tractions?\b/, 'Pullups'], [/face pull/, 'Face_Pull'], [/shrug|haussement/, 'Barbell_Shrug'], [/lombaire|hyperextension|banc a lombaires/, 'Hyperextensions_Back_Extensions'],
  [/elevations?.*laterale/, 'Side_Lateral_Raise'], [/elevations?.*frontale/, 'Front_Dumbbell_Raise'], [/oiseau|elevations?.*posterieure.*halter/, 'Reverse_Flyes'],
  [/curl.*(pupitre|larry scott)/, 'Preacher_Curl'], [/curl.*(marteau|hammer)/, 'Hammer_Curls'], [/curl.*concentr/, 'Concentration_Curls'], [/curl.*barre/, 'Barbell_Curl'], [/curl.*halter/, 'Dumbbell_Bicep_Curl'],
  [/(triceps|poulie haute).*corde|corde.*triceps/, 'Triceps_Pushdown_-_Rope_Attachment'], [/barre au front|skull/, 'EZ-Bar_Skullcrusher'], [/(extension|tirage).*triceps.*(poulie|barre)|pushdown/, 'Triceps_Pushdown'],
  [/squat.*goblet|goblet/, 'Goblet_Squat'], [/squat.*bulgare|fente.*bulgare/, 'Split_Squat_with_Dumbbells'], [/\bsquat/, 'Barbell_Squat'], [/presse.*(cuisse|jambe)|leg press/, 'Leg_Press'],
  [/leg extension|extension.*(jambe|cuisse)/, 'Leg_Extensions'], [/leg curl.*allonge|ischio.*allonge/, 'Lying_Leg_Curls'], [/leg curl|ischio/, 'Seated_Leg_Curl'],
  [/souleve de terre.*(roumain|jambes tendues)/, 'Romanian_Deadlift'], [/souleve de terre|deadlift/, 'Barbell_Deadlift'], [/fentes?\b/, 'Dumbbell_Lunges'], [/hip thrust/, 'Barbell_Hip_Thrust'], [/mollet/, 'Standing_Calf_Raises'],
  [/planche laterale|gainage lateral/, 'Side_Bridge'], [/planche|gainage/, 'Plank'], [/dead bug/, 'Dead_Bug'], [/pallof/, 'Pallof_Press'], [/releve.*jambes.*(suspendu|barre)/, 'Hanging_Leg_Raise'],
  [/releve.*jambes/, 'Flat_Bench_Lying_Leg_Raise'], [/crunch.*(poulie|cable)/, 'Cable_Crunch'], [/crunch.*invers/, 'Reverse_Crunch'], [/crunch.*machine/, 'Ab_Crunch_Machine'], [/crunch/, 'Crunches'],
  [/russian twist|rotation russe/, 'Russian_Twist'], [/roue abdo|ab wheel/, 'Ab_Roller'], [/mountain climber/, 'Mountain_Climbers'],
];

/** Nom libre d'exercice (« Élévations frontales alternées ») → identifiant de la bibliothèque le plus proche (cache app_kv). */
export async function matchExerciseId(name: string): Promise<string | null> {
  const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
  if (!key) return null;
  const known = KNOWN.find(([re]) => re.test(key));
  if (known) return known[1];
  let map: Record<string, string> = {};
  try { map = JSON.parse((await kvGet(MATCH_K)) ?? '{}') as Record<string, string>; } catch { /* vide */ }
  if (!(key in map)) {
    const list = await rawDb();
    const res = await createAnthropic().messages.create({ model: HAIKU, max_tokens: 60,
      system: 'On te donne un exercice de musculation (souvent en français) et une liste d\'identifiants d\'exercices. Réponds UNIQUEMENT par l\'identifiant EXACT le plus proche (même mouvement, même matériel si possible ; sinon le même mouvement avec un autre matériel), ou "none" si rien ne correspond.',
      messages: [{ role: 'user', content: `Exercice : ${name}\nListe : ${list.map(e => e.id).join(' ')}` }] }).catch(() => null);
    const got = res ? textOf(res).trim().split(/\s+/)[0]!.replace(/["'`.]/g, '') : '';
    if (!res) return null;   // panne : on réessaiera, sans mémoriser « rien »
    map[key] = list.some(e => e.id === got) ? got : '';
    try { const cur = JSON.parse((await kvGet(MATCH_K)) ?? '{}') as Record<string, string>; map = { ...cur, [key]: map[key]! }; } catch { /* */ }
    await kvSet(MATCH_K, JSON.stringify(map)).catch(() => {});
  }
  return map[key] || null;
}

/** Photos (2 images = mouvement) de la bibliothèque pour un exercice nommé librement — [] si introuvable. */
export async function demoForName(name: string): Promise<string[]> {
  const id = await matchExerciseId(name);
  if (!id) return [];
  const e = (await rawDb()).find(x => x.id === id);
  return e ? e.images.slice(0, 2).map(i => `${IMG_BASE}/${i}`) : [];
}

/** Exercice d'une séance (nom libre, ex. « Développé incliné haltères ») → fiche de la bibliothèque la plus proche. */
export async function matchExercise(name: string): Promise<LibDetail | null> {
  const id = await matchExerciseId(name);
  return id ? exerciseDetail(id) : null;
}

/** Remplit les images manquantes (exercices sur mesure sans photo) — en parallèle, plafonné à ~9 s pour ne pas bloquer l'écran.
 *  Ce qui n'est pas trouvé à temps sera prêt (cache) à la prochaine ouverture. */
export async function fillDemos(exs: Array<{ name: string; demo: string[] }>): Promise<void> {
  const todo = exs.filter(e => !e.demo?.length && e.name);
  if (!todo.length) return;
  const byName = new Map<string, Array<{ name: string; demo: string[] }>>();
  for (const e of todo) byName.set(e.name, [...(byName.get(e.name) ?? []), e]);
  await Promise.race([
    Promise.all([...byName].map(async ([name, list]) => { const d = await demoForName(name).catch(() => []); if (d.length) for (const e of list) e.demo = d; })),
    new Promise(r => setTimeout(r, 9000)),
  ]);
}
