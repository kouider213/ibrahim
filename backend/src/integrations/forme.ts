import { createHash, randomBytes } from 'node:crypto';
import { kvGet, kvSet, kvDel } from './app-store.js';
import { supabase } from './supabase.js';
import { createAnthropic, QUALITY } from './anthropic-compat.js';
import { localNow } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { sendWebPush } from '../notifications/web-push-service.js';
import type { PushSubscription } from 'web-push';

// FORME (Kouider 25/10) = depuis le 31/10 son app SPORT uniquement : séances, bibliothèque d'exercices, scanner de machines,
// photos du corps, poids, et — si le profil l'active — rappel d'un traitement GLP-1 (jamais de conseil de dose).
// Nutrition, repas et LISTE DE COURSES retirés définitivement le 31/10 (« je n'ai pas besoin de ça »).
// DEUX PROFILS : Kouider et sa femme (arabe littéraire ou français), chacun son suivi.
// Dzaryx suit Kouider (formeText → dossier) et ne lit le suivi de sa femme que si ELLE l'a autorisé.
// Sa femme se connecte avec un lien d'invitation : jeton valable UNIQUEMENT pour /api/forme, aucun accès au business.
// VIE PRIVÉE : dépôt PUBLIC → prénoms, poids, traitements, photos uniquement dans app_kv + bucket privé, jamais ici.

export type Uid = 'kouider' | 'femme';
export const UIDS: Uid[] = ['kouider', 'femme'];
export type Lang = 'fr' | 'ar';

const PK = (u: Uid) => `${u}:forme:profile`;
const DK = (u: Uid) => `${u}:forme:days`;
const PHK = (u: Uid) => `${u}:forme:photos`;
const PROG_K = (u: Uid) => `${u}:forme:program`;
const CUSTOM_K = (u: Uid) => `${u}:forme:custom`;
const SUB_K = (u: Uid) => `mobile:web_push_sub:${u}:forme`;
const WEEKS_K = (u: Uid) => `${u}:forme:weeks`;   // dates de début des plans (7 jours chacun)
const SENT_K = (u: Uid, what: string, date: string) => `${u}:forme:sent:${what}:${date}`;
const INVITE_K = (hash: string) => `forme:invite:${hash}`;
const INVITE_OF = (u: Uid) => `forme:invite-of:${u}`;
const BUCKET = 'forme-private';

export const STORES = ['Colruyt', 'Delhaize', 'Aldi', 'Lidl', 'Carrefour', 'Albert Heijn', 'Intermarché', 'Boucherie halal'] as const;
export const WEGOVY_DOSES = ['0,25 mg', '0,5 mg', '1 mg', '1,7 mg', '2,4 mg', '7,2 mg'];

export interface FormeProfile {
  onboarded: boolean; name: string; lang: Lang; shareWithDzaryx: boolean;
  goal: 'perte' | 'muscle' | 'recompo';
  sex: 'h' | 'f'; age: number; heightCm: number; weightKg: number; targetKg: number;
  sessionsPerWeek: number; gym: string; stores: string[]; mealsPerDay: number;
  budgetWeek: number; likes: string[]; dislikes: string[]; vegetarian: boolean;
  wegovy: { on: boolean; dose: string; day: number; hour: string; start?: string; doses?: Array<{ date: string; dose: string }> };
  photoEveryDays: number; weighDaily: boolean;
  notif: { meals: boolean; water: boolean; injection: boolean; photo: boolean; weigh: boolean; telegram?: boolean };
  waterGoal: number;
  fasting: 'off' | 'ramadan' | 'sunna';                // jeûne : Ramadan (s'hour + iftar) ou lundi/jeudi
  reminders: Array<{ id: string; label: string; time: string; days: number[] }>;   // rappels perso (vitamine D, médicament…)
  stepsGoal: number;
  restDays: number[];                                  // jours sans sport (sa femme : jeudi + dimanche)
  favorites: string[];                                 // recettes adorées (❤️) : reprises de temps en temps
}

const DEFAULTS: Record<Uid, FormeProfile> = {
  kouider: {
    onboarded: false, name: 'Kouider', lang: 'fr', shareWithDzaryx: true, goal: 'recompo', sex: 'h', age: 30, heightCm: 178, weightKg: 90, targetKg: 80,
    sessionsPerWeek: 4, gym: 'Basic-Fit', stores: ['Colruyt', 'Boucherie halal'], mealsPerDay: 3, budgetWeek: 60,
    likes: [], dislikes: [], vegetarian: false, wegovy: { on: false, dose: '', day: 0, hour: '20:00' },
    photoEveryDays: 7, weighDaily: false, notif: { meals: true, water: true, injection: true, photo: true, weigh: true, telegram: true }, waterGoal: 8,
    fasting: 'off', reminders: [], stepsGoal: 8000, restDays: [1, 4], favorites: [],
  },
  femme: {
    onboarded: false, name: '', lang: 'ar', shareWithDzaryx: false, goal: 'perte', sex: 'f', age: 28, heightCm: 165, weightKg: 75, targetKg: 65,
    sessionsPerWeek: 3, gym: 'À la maison', stores: ['Colruyt', 'Boucherie halal'], mealsPerDay: 3, budgetWeek: 50,
    likes: [], dislikes: [], vegetarian: false, wegovy: { on: false, dose: '', day: 0, hour: '20:00' },
    photoEveryDays: 7, weighDaily: false, notif: { meals: true, water: true, injection: true, photo: true, weigh: true }, waterGoal: 8,
    fasting: 'off', reminders: [], stepsGoal: 7000, restDays: [0, 4], favorites: [],
  },
};

export interface FoodItem { name: string; kcal: number; p: number; c: number; f: number; at?: number; src?: string }
export interface WorkoutLog { session: number; label: string; sets: Array<{ ex: string; kg?: number; reps?: number }>; durationMin?: number; rpe?: number; at: number }
export interface FormeDay {
  meals: Record<string, boolean>;       // `${recipeId}:${slot}` → mangé
  extra: FoodItem[];
  water: number; weight?: number;
  measures?: Partial<Record<'taille' | 'hanches' | 'poitrine' | 'bras' | 'cuisse', number>>;
  injection?: { at: number; site: string; dose?: string };
  sides?: Array<{ what: string; level: number; at: number }>;
  workout?: WorkoutLog;
  sleep?: number; steps?: number;
  activeKcal?: number;                  // calories actives de la montre (Raccourci Santé)
}

export interface Recipe {
  id: string; title: string; photo: string; minutes: number; kcal: number; p: number; c: number; f: number;
  tags: string[]; ingredients: Array<{ name: string; qty: string }>; steps: string[]; tip: string; mealDbId?: string;
}
export interface ShopItem { name: string; qty: string; aisle: string; store: string; price: number; halal?: boolean; img?: string | null; brand?: string | null; checked?: boolean; label?: string }
export interface WeekPlan {
  monday: string; at: number; note: string; budget: number; total: number; wishes?: string;
  recipes: Recipe[];
  days: Array<{ date: string; meals: Array<{ slot: string; recipe: string; portion: string }> }>;
  shopping: ShopItem[];
}

// ── Lecture / écriture ───────────────────────────────────────────────────────
const readJson = async <T,>(key: string, fallback: T): Promise<T> => {
  try { const raw = await kvGet(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
};
const textOf = (res: { content: Array<{ type: string }> }) => res.content.filter(b => b.type === 'text').map(b => (b as unknown as { text: string }).text).join('');
const jsonOf = <T,>(raw: string): T => JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as T;
const LANG_RULE = (l: Lang) => l === 'ar'
  ? '\nLANGUE : écris TOUS les textes destinés à l\'utilisatrice (titres, étapes, conseils, notes, résumés) en ARABE LITTÉRAIRE (فصحى) clair et simple. Pour les produits à acheter, écris « nom arabe (nom français du rayon belge) ».'
  : '';

export async function getFormeProfile(uid: Uid = 'kouider'): Promise<FormeProfile> {
  const p = await readJson<Partial<FormeProfile>>(PK(uid), {});
  const d = DEFAULTS[uid];
  return { ...d, ...p, wegovy: { ...d.wegovy, ...(p.wegovy ?? {}) }, notif: { ...d.notif, ...(p.notif ?? {}) } };
}

export async function setFormeProfile(patch: Partial<FormeProfile>, uid: Uid = 'kouider'): Promise<FormeProfile> {
  const cur = await getFormeProfile(uid);
  const num = (v: unknown, min: number, max: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const w = patch.wegovy;
  const dose = w?.dose != null ? String(w.dose).slice(0, 30) : cur.wegovy.dose;
  const next: FormeProfile = {
    ...cur,
    ...(patch.onboarded != null ? { onboarded: !!patch.onboarded } : {}),
    ...(typeof patch.name === 'string' && patch.name.trim() ? { name: patch.name.trim().slice(0, 30) } : {}),
    ...(patch.lang === 'fr' || patch.lang === 'ar' ? { lang: patch.lang } : {}),
    ...(patch.shareWithDzaryx != null && uid !== 'kouider' ? { shareWithDzaryx: !!patch.shareWithDzaryx } : {}),
    ...(patch.goal && ['perte', 'muscle', 'recompo'].includes(patch.goal) ? { goal: patch.goal } : {}),
    ...(patch.sex === 'h' || patch.sex === 'f' ? { sex: patch.sex } : {}),
    ...(patch.age != null ? { age: num(patch.age, 14, 90, cur.age) } : {}),
    ...(patch.heightCm != null ? { heightCm: num(patch.heightCm, 130, 220, cur.heightCm) } : {}),
    ...(patch.weightKg != null ? { weightKg: num(patch.weightKg, 35, 250, cur.weightKg) } : {}),
    ...(patch.targetKg != null ? { targetKg: num(patch.targetKg, 35, 250, cur.targetKg) } : {}),
    ...(patch.sessionsPerWeek != null ? { sessionsPerWeek: num(patch.sessionsPerWeek, 0, 7, cur.sessionsPerWeek) } : {}),
    ...(typeof patch.gym === 'string' ? { gym: patch.gym.slice(0, 40) } : {}),
    ...(Array.isArray(patch.stores) ? { stores: patch.stores.map(String).filter(s => (STORES as readonly string[]).includes(s)).slice(0, 6) } : {}),
    ...(patch.mealsPerDay != null ? { mealsPerDay: num(patch.mealsPerDay, 2, 5, cur.mealsPerDay) } : {}),
    ...(patch.budgetWeek != null ? { budgetWeek: num(patch.budgetWeek, 20, 300, cur.budgetWeek) } : {}),
    ...(Array.isArray(patch.likes) ? { likes: patch.likes.map(String).slice(0, 40) } : {}),
    ...(Array.isArray(patch.dislikes) ? { dislikes: patch.dislikes.map(String).slice(0, 40) } : {}),
    ...(patch.vegetarian != null ? { vegetarian: !!patch.vegetarian } : {}),
    ...(w ? { wegovy: { ...cur.wegovy, ...(w.on != null ? { on: !!w.on } : {}), ...(w.start ? { start: String(w.start).slice(0, 10) } : {}), dose,
      day: num(w.day ?? cur.wegovy.day, 0, 6, cur.wegovy.day), hour: /^\d{2}:\d{2}$/.test(String(w.hour)) ? String(w.hour) : cur.wegovy.hour,
      // Chaque changement de dose est gardé avec sa date (son médecin la fait monter par paliers)
      doses: dose && dose !== cur.wegovy.dose ? [...(cur.wegovy.doses ?? []), { date: localNow().date, dose }].slice(-20) : cur.wegovy.doses ?? [] } } : {}),
    ...(patch.photoEveryDays != null ? { photoEveryDays: num(patch.photoEveryDays, 3, 30, cur.photoEveryDays) } : {}),
    ...(patch.weighDaily != null ? { weighDaily: !!patch.weighDaily } : {}),
    ...(patch.notif ? { notif: { ...cur.notif, ...patch.notif } } : {}),
    ...(patch.waterGoal != null ? { waterGoal: num(patch.waterGoal, 4, 16, cur.waterGoal) } : {}),
    ...(patch.fasting && ['off', 'ramadan', 'sunna'].includes(patch.fasting) ? { fasting: patch.fasting } : {}),
    ...(Array.isArray(patch.reminders) ? { reminders: patch.reminders.slice(0, 12).filter(x => x?.label && /^\d{2}:\d{2}$/.test(String(x.time))).map(x => ({ id: String(x.id || Date.now().toString(36)).slice(0, 20), label: String(x.label).slice(0, 60), time: String(x.time), days: (Array.isArray(x.days) && x.days.length ? x.days : [0, 1, 2, 3, 4, 5, 6]).map(Number).filter(d => d >= 0 && d <= 6) })) } : {}),
    ...(Array.isArray(patch.restDays) ? { restDays: [...new Set(patch.restDays.map(Number).filter(d => d >= 0 && d <= 6))] } : {}),
    ...(Array.isArray(patch.favorites) ? { favorites: patch.favorites.map(x => String(x).slice(0, 90)).slice(-40) } : {}),
    ...(patch.stepsGoal != null ? { stepsGoal: num(patch.stepsGoal, 2000, 30000, cur.stepsGoal) } : {}),
  };
  if (!next.stores.length) next.stores = ['Colruyt'];
  await kvSet(PK(uid), JSON.stringify(next));
  return next;
}

async function readDays(uid: Uid): Promise<Record<string, FormeDay>> { return readJson(DK(uid), {}); }
async function saveDays(uid: Uid, d: Record<string, FormeDay>): Promise<void> {
  const keep = Object.keys(d).sort().slice(-200);
  await kvSet(DK(uid), JSON.stringify(Object.fromEntries(keep.map(k => [k, d[k]!]))));
}
const emptyDay = (): FormeDay => ({ meals: {}, extra: [], water: 0 });

export async function updateDay(uid: Uid, date: string, fn: (d: FormeDay) => void): Promise<FormeDay> {
  const days = await readDays(uid);
  const d = days[date] ?? emptyDay();
  fn(d);
  days[date] = d;
  await saveDays(uid, days);
  return d;
}

// ── Accès de sa femme : lien d'invitation (jeton FORME seulement) ───────────
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

export async function createInvite(uid: Uid, o: { name?: string; lang?: Lang }): Promise<string> {   // sa femme : arabe littéraire par défaut (Kouider 25/10)
  const old = await kvGet(INVITE_OF(uid));
  if (old) await kvDel(INVITE_K(old)).catch(() => {});   // un nouveau lien coupe l'ancien
  const token = randomBytes(24).toString('base64url');
  await kvSet(INVITE_K(sha(token)), uid);
  await kvSet(INVITE_OF(uid), sha(token));
  await setFormeProfile({ ...(o.name ? { name: o.name } : {}), ...(o.lang ? { lang: o.lang } : {}) }, uid);
  return token;
}
export async function revokeInvite(uid: Uid): Promise<void> {
  const old = await kvGet(INVITE_OF(uid));
  if (old) await kvDel(INVITE_K(old));
  await kvDel(INVITE_OF(uid));
}
export async function inviteActive(uid: Uid): Promise<boolean> { return !!await kvGet(INVITE_OF(uid)); }
export async function uidFromFormeToken(token: string): Promise<Uid | null> {
  if (!token || token.length < 20) return null;
  // Erreur base ≠ lien inconnu : on lève (→ 503) au lieu de renvoyer null (→ 401), sinon l'appli de sa femme
  // effaçait son lien au moindre hoquet Supabase et elle devait se reconnecter (26/10).
  for (let i = 0; ; i++) {
    const { data, error } = await supabase.from('app_kv').select('value').eq('key', INVITE_K(sha(token))).maybeSingle();
    if (!error) return (data as { value: string } | null)?.value === 'femme' ? 'femme' : null;
    if (i >= 1) throw new Error(`forme token: ${error.message}`);
    await new Promise(r => setTimeout(r, 400));
  }
}

// ── Besoins (Mifflin-St Jeor) adaptés au Wegovy ──────────────────────────────
export function formeTargets(p: FormeProfile) {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'h' ? 5 : -161);
  const tdee = bmr * (1.35 + Math.min(p.sessionsPerWeek, 6) * 0.04);
  const factor = p.goal === 'perte' ? 0.78 : p.goal === 'muscle' ? 1.08 : 0.88;
  // Sous Wegovy l'appétit chute : on ne descend jamais trop bas (perte de muscle, fatigue) — plancher 1500 / 1200 kcal.
  const kcal = Math.round(Math.max(p.sex === 'h' ? 1500 : 1200, tdee * factor) / 10) * 10;
  // Protéines hautes pour garder le muscle pendant la perte de poids (GLP-1) : 1,8 g/kg (1,6 pour une femme) du poids visé
  const p_ = Math.round(Math.min(2.2 * p.weightKg, (p.sex === 'h' ? 1.8 : 1.6) * Math.max(p.targetKg, p.weightKg * 0.8)));
  const f = Math.round(kcal * 0.27 / 9);
  const c = Math.max(60, Math.round((kcal - p_ * 4 - f * 9) / 4));
  return { kcal, p: p_, c, f, tdee: Math.round(tdee), bmr: Math.round(bmr), fiber: p.sex === 'h' ? 30 : 25, waterL: Math.round(p.waterGoal * 0.25 * 10) / 10 };
}

// ── Dates ──────────────────────────────────────────────
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
// Un plan = 7 jours à partir du jour où il est fait, puis chaque dimanche soir le suivant démarre le lendemain.
// « mondayOf » garde son nom dans l'API : c'est la date de début du plan.
async function planStarts(uid: Uid): Promise<string[]> { return readJson<string[]>(WEEKS_K(uid), []); }
export const mondayOf = (d = localNow().date) => d;
export async function currentStart(uid: Uid, date = localNow().date): Promise<string | null> {
  const starts = (await planStarts(uid)).sort();
  const cover = starts.filter(s => s <= date && date < addDays(s, 7)).pop();
  return cover ?? starts.find(s => s > date) ?? null;
}

// ── Séances de sa femme (Kouider a déjà son coach : sport-coach.ts, calé sur son agenda) ──
// Exercices de free-exercise-db (vraies photos, domaine public) — la démo = les 2 photos en alternance.
const EX_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const EX_LIB: Record<string, string> = {
  Bodyweight_Squat: 'jambes', Goblet_Squat: 'jambes', Dumbbell_Lunges: 'jambes', Barbell_Glute_Bridge: 'fessiers', Butt_Lift_Bridge: 'fessiers', Glute_Kickback: 'fessiers',
  Leg_Press: 'jambes', Seated_Leg_Curl: 'jambes', Leg_Extensions: 'jambes', Side_Lying_Groin_Stretch: 'mobilité', 'Step-up_with_Knee_Raise': 'jambes', Dumbbell_Step_Ups: 'jambes',
  Pushups: 'pecs', 'Incline_Push-Up': 'pecs', Dumbbell_Bench_Press: 'pecs', 'Wide-Grip_Lat_Pulldown': 'dos', Seated_Cable_Rows: 'dos', 'One-Arm_Dumbbell_Row': 'dos', 'Band_Assisted_Pull-Up': 'dos',
  Dumbbell_Shoulder_Press: 'épaules', Side_Lateral_Raise: 'épaules', Face_Pull: 'épaules', Dumbbell_Bicep_Curl: 'bras', Hammer_Curls: 'bras', 'Triceps_Pushdown_-_Rope_Attachment': 'bras', Bench_Dips: 'bras',
  Plank: 'abdos', Side_Bridge: 'abdos', Dead_Bug: 'abdos', Crunches: 'abdos', Mountain_Climbers: 'cardio', Star_Jump: 'cardio', Pallof_Press: 'abdos', Cat_Stretch: 'mobilité',
  Walking_Treadmill: 'cardio', Elliptical_Trainer: 'cardio', Rowing_Stationary: 'cardio', Bicycling_Stationary: 'cardio', Hamstring_Stretch: 'mobilité', Superman: 'dos',
};
export interface ProgEx { id: string; name: string; muscle: string; sets: number; reps: string; rest: number; tip: string; alt: string[]; timed: boolean; demo: string[]; video: string; suggestion: { kg: number | null; last?: string; up?: boolean } }
export interface ProgSession { label: string; emoji: string; focus: string; warmup: string; estMin: number; exercises: ProgEx[] }
export interface Program { at: number; days: number[]; sessions: ProgSession[] }

export async function getProgram(uid: Uid, force = false): Promise<Program> {
  const cur = await readJson<Program | null>(PROG_K(uid), null);
  const p = await getFormeProfile(uid);
  if (cur && !force && !cur.days.some(d => p.restDays.includes(d))) return cur;   // jours de repos changés → programme refait
  const allowed = [0, 1, 2, 3, 4, 5, 6].filter(d => !p.restDays.includes(d));
  const n = Math.max(2, Math.min(5, Math.min(allowed.length, p.sessionsPerWeek || 3)));
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 5000,
    system: `Tu es coach sportif. Tu crées un programme de ${n} séances/semaine pour ${p.sex === 'f' ? 'une femme' : 'un homme'} (${p.age} ans, ${p.weightKg} kg → ${p.targetKg} kg, objectif ${p.goal}, lieu : ${p.gym})${p.wegovy.on ? ', sous Wegovy (garder le muscle : renforcement prioritaire, intensité progressive, bien s\'hydrater)' : ''}.
Exercices UNIQUEMENT parmi ces identifiants : ${Object.entries(EX_LIB).map(([k, v]) => `${k} (${v})`).join(', ')}.${p.gym === 'À la maison' ? ' À la maison : poids du corps, haltères légers, élastique — pas de machines (Leg_Press, Seated_Leg_Curl, Leg_Extensions, Wide-Grip_Lat_Pulldown, Seated_Cable_Rows, Triceps_Pushdown, Face_Pull, Walking_Treadmill, Elliptical_Trainer, Rowing_Stationary, Bicycling_Stationary interdits).' : ''}
${LANG_RULE(p.lang)}
JOURS DE REPOS (jamais de séance) : ${p.restDays.map(d => ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d]).join(', ') || 'aucun'} → choisis les jours parmi ${allowed.join(', ')} (0=dimanche).
Réponds UNIQUEMENT en JSON : {"days":[jours de la semaine 0=dimanche…],"sessions":[{"label":"nom court","emoji":"🔥","focus":"muscles","warmup":"échauffement court","estMin":40,"exercises":[{"id":"Goblet_Squat","name":"nom affiché","sets":3,"reps":"12","rest":60,"tip":"consigne technique (≤ 100 car.)","alt":["variante"],"timed":false}]}]} — 5 à 7 exercices par séance, jours espacés.` ,
    messages: [{ role: 'user', content: 'Crée le programme.' }] }, QUALITY);
  const j = jsonOf<{ days?: number[]; sessions?: Array<Partial<ProgSession> & { exercises?: Array<Partial<ProgEx>> }> }>(textOf(res));
  const prog: Program = {
    at: Date.now(), days: (() => { const d0 = [...new Set((j.days ?? []).map(Number).filter(d => allowed.includes(d)))].slice(0, n); for (const d of [1, 3, 5, 2, 6, 0, 4]) if (d0.length < n && allowed.includes(d) && !d0.includes(d)) d0.push(d); return d0.sort(); })(),
    sessions: (j.sessions ?? []).slice(0, n).map(s => ({
      label: String(s.label ?? 'Séance').slice(0, 40), emoji: String(s.emoji ?? '🔥').slice(0, 4), focus: String(s.focus ?? '').slice(0, 80), warmup: String(s.warmup ?? '').slice(0, 160), estMin: Number(s.estMin) || 40,
      exercises: (s.exercises ?? []).filter(e => e.id && EX_LIB[String(e.id)]).map(e => ({
        id: String(e.id), name: String(e.name ?? e.id).slice(0, 60), muscle: EX_LIB[String(e.id)]!, sets: Number(e.sets) || 3, reps: String(e.reps ?? '12'), rest: Number(e.rest) || 60,
        tip: String(e.tip ?? '').slice(0, 140), alt: (e.alt ?? []).map(String).slice(0, 3), timed: !!e.timed,
        demo: [0, 1].map(i => `${EX_BASE}/${String(e.id)}/${i}.jpg`), video: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${String(e.id).replace(/_/g, ' ')} exercise form`)}`, suggestion: { kg: null },
      })),
    })),
  };
  await kvSet(PROG_K(uid), JSON.stringify(prog));
  return prog;
}

export async function programOverview(uid: Uid) {
  const [prog, days] = await Promise.all([getProgram(uid), readDays(uid)]);
  const today = localNow().date, wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const logs = Object.entries(days).filter(([, d]) => d.workout).sort(([a], [b]) => a.localeCompare(b));
  const doneN = logs.length;
  // La séance suivante = celle qui suit la dernière faite (on ne saute pas une séance ratée)
  const idx = prog.sessions.length ? (logs.length ? (logs[logs.length - 1]![1].workout!.session + 1) % prog.sessions.length : 0) : 0;
  const lastKg = (ex: string) => { for (let i = logs.length - 1; i >= 0; i--) { const s = logs[i]![1].workout!.sets.filter(x => x.ex === ex && x.kg); if (s.length) return Math.max(...s.map(x => x.kg!)); } return null; };
  const custom = await readJson<{ session: ProgSession; why: string; at: number } | null>(CUSTOM_K(uid), null);
  const usedCustom = !!custom && !logs.some(([, d]) => d.workout!.at > custom.at);
  const s = usedCustom ? custom!.session : prog.sessions[idx];
  const session = s ? { ...s, index: idx, custom: usedCustom ? custom!.why : undefined, exercises: s.exercises.map(e => ({ ...e, suggestion: { kg: lastKg(e.id), last: lastKg(e.id) ? `${lastKg(e.id)} kg` : undefined } })) } : null;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - ((wd + 6) % 7))).map(d => ({ date: d, planned: prog.days.includes(new Date(`${d}T12:00:00Z`).getUTCDay()), done: !!days[d]?.workout }));
  return { session, todayPlanned: prog.days.includes(wd), doneToday: !!days[today]?.workout, week, total: doneN, sessions: prog.sessions.map(x => ({ label: x.label, emoji: x.emoji, focus: x.focus })), days: prog.days };
}

// ── « Voilà ma photo, je veux perdre le ventre » → la séance de DEMAIN refaite sur mesure ──
export async function adaptNextSession(uid: Uid, o: { focus: string; observations?: string }): Promise<{ date: string; text: string }> {
  const p = await getFormeProfile(uid);
  const photos = await readPhotos(uid);
  const lastA = [...photos].reverse().find(x => x.analysis)?.analysis;
  // Rien précisé : le coach choisit d'après la dernière analyse photo (zones « à travailler »)
  if (!o.focus.trim()) o.focus = lastA ? `${lastA.zones.filter(z => z.trend === 'à travailler').map(z => z.label).join(', ') || lastA.focus.join(', ')} (choisi par le coach d'après ses photos)` : 'perte de gras générale + renforcement du tronc (choisi par le coach)';
  const obs = [o.observations, lastA ? `Dernière analyse photo : ${lastA.summary} Zones : ${lastA.zones.map(z => `${z.label} (${z.trend})`).join(', ')}. Priorités : ${lastA.focus.join(', ')}.` : ''].filter(Boolean).join('\n');
  const sc = await import('./sport-coach.js');
  const next = uid === 'kouider' ? await sc.nextSessionDate() : null;
  const lib = uid === 'kouider' ? sc.exerciseLibraryText() : Object.entries(EX_LIB).map(([k, v]) => `${k} (${v})`).join(', ');
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 3000,
    system: `Tu es son coach sportif. Il/elle t'a dit ce qu'il/elle veut perdre ou améliorer${obs ? ' et tu as ses photos analysées' : ''}. Tu refais SA PROCHAINE SÉANCE, exercice par exercice, précise et faisable (~${p.sex === 'h' ? '60-75' : '40-50'} min, lieu : ${p.gym}). Vérité utile : on ne « fond » pas une zone précise — la graisse part avec le déficit calorique + les protéines ; la séance renforce la zone visée, augmente la dépense (circuits, cardio en fin) et améliore la posture. Dis-le en une phrase dans "why".${p.sex === 'h' ? ' Dos à ménager : pas de charge lourde sur la colonne (pas de soulevé de terre lourd ni squat barre lourde).' : ''}${p.wegovy.on ? ' Traitement GLP-1 : renforcement prioritaire pour garder le muscle, hydratation.' : ''}
Exercices de préférence parmi : ${lib}.${uid === 'femme' ? ' UNIQUEMENT ces identifiants dans "id".' : ''}${LANG_RULE(p.lang)}
Réponds UNIQUEMENT en JSON : {"label":"nom court","emoji":"🔥","focus":"zones travaillées","warmup":"échauffement","why":"pourquoi cette séance (≤ 180 car.)","exercises":[{"id":"(femme : identifiant)","name":"nom","sets":3,"reps":"12","rest":60,"tip":"consigne précise (≤ 110 car.)","muscle":"pecs|dos|epaules|bras|jambes|abdos|cardio","alt":["variante"]}]} — 6 à 8 exercices dont un finisher cardio.`,
    messages: [{ role: 'user', content: `OBJECTIF : ${o.focus.slice(0, 300)}\n${obs}` }] }, QUALITY);
  const j = jsonOf<{ label?: string; emoji?: string; focus?: string; warmup?: string; why?: string; exercises?: Array<Partial<ProgEx> & { muscle?: string }> }>(textOf(res));
  const why = String(j.why ?? o.focus).slice(0, 200);
  if (uid === 'kouider') {
    if (!next) throw new Error('aucune séance prévue dans les 7 prochains jours (dis à Dzaryx « cale mes séances »)');
    const text = await sc.setCustomSession(next.date, { label: String(j.label ?? 'Séance sur mesure'), emoji: j.emoji, focus: j.focus, warmup: j.warmup,
      exercises: (j.exercises ?? []).map(e => ({ name: String(e.name), sets: Number(e.sets) || 3, reps: String(e.reps ?? '12'), rest: Number(e.rest) || 60, tip: e.tip, muscle: e.muscle, alt: e.alt })) }, why);
    return { date: next.date, text: `${why}\n\n${text}` };
  }
  const session: ProgSession = { label: String(j.label ?? 'Séance sur mesure').slice(0, 40), emoji: String(j.emoji ?? '🎯').slice(0, 4), focus: String(j.focus ?? '').slice(0, 80), warmup: String(j.warmup ?? '').slice(0, 160), estMin: 45,
    exercises: (j.exercises ?? []).filter(e => e.id && EX_LIB[String(e.id)]).map(e => ({ id: String(e.id), name: String(e.name ?? e.id).slice(0, 60), muscle: EX_LIB[String(e.id)]!, sets: Number(e.sets) || 3, reps: String(e.reps ?? '12'), rest: Number(e.rest) || 60,
      tip: String(e.tip ?? '').slice(0, 140), alt: (e.alt ?? []).map(String).slice(0, 3), timed: false, demo: [0, 1].map(i => `${EX_BASE}/${String(e.id)}/${i}.jpg`), video: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${String(e.id).replace(/_/g, ' ')} exercise form`)}`, suggestion: { kg: null } })) };
  // Sa prochaine séance prévue à partir de demain (jamais un jour de repos)
  const prog = await getProgram(uid);
  let date = addDays(localNow().date, 1);
  for (let i = 1; i <= 7; i++) { const d = addDays(localNow().date, i); if (prog.days.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) { date = d; break; } }
  await kvSet(CUSTOM_K(uid), JSON.stringify({ session, why, at: Date.now(), date }));
  return { date, text: `${why}\n\n${session.exercises.map((e, i) => `${i + 1}. ${e.name} — ${e.sets} × ${e.reps}`).join('\n')}` };
}

// ── Vision : photos du corps → évolution entourée ─
type Img = { media: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };
export function parseImage(dataUrl: string): Img {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) throw new Error('image invalide');
  if (m[2]!.length > 9_000_000) throw new Error('photo trop lourde');
  return { media: m[1] as Img['media'], data: m[2]! };
}
const imgBlock = (i: Img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.media, data: i.data } });

export interface Zone { label: string; x: number; y: number; r: number; bx?: number; by?: number; br?: number; trend: 'mieux' | 'pareil' | 'à travailler'; note: string }
export interface BodyAnalysis { at: number; vs: string | null; summary: string; zones: Zone[]; advice: string[]; focus: string[]; score: number }
export interface BodyPhoto { id: string; date: string; pose: 'face' | 'profil' | 'dos'; path: string; weight?: number; analysis?: BodyAnalysis }

async function ensureBucket() { await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {}); }

export async function readPhotos(uid: Uid = 'kouider'): Promise<BodyPhoto[]> { return readJson<BodyPhoto[]>(PHK(uid), []); }

export async function addBodyPhoto(uid: Uid, img: Img, pose: BodyPhoto['pose']): Promise<BodyPhoto> {
  await ensureBucket();
  const date = localNow().date;
  const id = `${date}-${pose}-${Date.now().toString(36)}`;
  const path = `${uid}/${id}.${img.media.split('/')[1]}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(img.data, 'base64'), { contentType: img.media, upsert: true });
  if (error) throw new Error(`stockage photo : ${error.message}`);
  const days = await readDays(uid);
  const weight = [...Object.entries(days)].sort().reverse().find(([, d]) => d.weight)?.[1].weight ?? (await getFormeProfile(uid)).weightKg;
  const photos = await readPhotos(uid);
  const ph: BodyPhoto = { id, date, pose, path, weight };
  photos.push(ph);
  await kvSet(PHK(uid), JSON.stringify(photos.slice(-120)));
  return ph;
}

async function photoB64(path: string): Promise<Img> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error('photo introuvable');
  const ext = path.split('.').pop();
  return { media: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', data: Buffer.from(await data.arrayBuffer()).toString('base64') };
}

export async function signedPhotoUrls(photos: BodyPhoto[]): Promise<Record<string, string>> {
  if (!photos.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(photos.map(p => p.path), 3600);
  const out: Record<string, string> = {};
  (data ?? []).forEach((d, i) => { if (d.signedUrl) out[photos[i]!.id] = d.signedUrl; });
  return out;
}

/** Photo + grille graduée (0,1 … 0,9) : Claude place ses cercles beaucoup plus juste qu'à l'œil nu. */
async function gridImage(img: Img): Promise<Img> {
  try {
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const im = await loadImage(Buffer.from(img.data, 'base64'));
    const s = Math.min(1, 1100 / Math.max(im.width, im.height));
    const w = Math.round(im.width * s), h = Math.round(im.height * s);
    const c = createCanvas(w, h); const g = c.getContext('2d');
    g.drawImage(im, 0, 0, w, h);
    g.lineWidth = 1; g.font = 'bold 16px sans-serif';
    for (let i = 1; i < 10; i++) {
      g.strokeStyle = 'rgba(0,255,255,0.55)';
      g.beginPath(); g.moveTo(w * i / 10, 0); g.lineTo(w * i / 10, h); g.stroke();
      g.beginPath(); g.moveTo(0, h * i / 10); g.lineTo(w, h * i / 10); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(w * i / 10 - 14, 0, 30, 20); g.fillRect(0, h * i / 10 - 10, 30, 20);
      g.fillStyle = '#0ff'; g.fillText(`.${i}`, w * i / 10 - 10, 15); g.fillText(`.${i}`, 3, h * i / 10 + 6);
    }
    return { media: 'image/jpeg', data: c.toBuffer('image/jpeg', 85).toString('base64') };
  } catch { return img; }
}

const bodySystem = (p: FormeProfile) => `Tu es le coach physique de ${p.sex === 'h' ? 'Kouider (muscu' : 'cette femme (renforcement'} + perte de gras${p.wegovy.on ? ' sous Wegovy' : ''}). On te donne sa photo AVANT (image 1) et MAINTENANT (image 2), même pose, ou une seule photo de départ.
Analyse objectivement et avec bienveillance ce qui a changé : épaules, bras, ventre/taille, dos, hanches, jambes, posture. Ne commente jamais le visage. Pas de jugement sur le corps, juste du concret et motivant.
Réponds UNIQUEMENT en JSON :
{"summary":"2-3 phrases : ce qui a changé (ou point de départ)","score":0-100 (progression visible, 50 = pareil),
 "zones":[{"label":"Ventre","x":0.5,"y":0.55,"r":0.12,"bx":0.5,"by":0.55,"br":0.13,"trend":"mieux|pareil|à travailler","note":"≤ 90 car."}],
 "advice":["conseil d'entraînement ou d'habitude précis (≤ 120 car.)", "..."],"focus":["muscles à travailler en priorité"]}
Les photos portent une GRILLE cyan graduée .1 à .9 (horizontal = x, vertical = y) : sers-t'en pour placer chaque cercle EXACTEMENT sur la partie du corps (ventre = sous la poitrine au niveau du nombril, pas sur le fond ni la tête). x,y = centre du cercle sur la photo MAINTENANT (fractions 0-1 de la largeur/hauteur), r = rayon en fraction de la largeur, PETIT (0,04 à 0,12 : le cercle entoure juste la zone) ; bx,by,br = même zone sur la photo AVANT (omet-les s'il n'y a qu'une photo). 3 à 5 zones qui ne se chevauchent pas, JAMAIS sur le visage ni la tête (épaules = au bord des épaules). Le champ "trend" reste TOUJOURS en français (mieux / pareil / à travailler).${p.sex === 'h' ? ' Conseils compatibles avec un dos à ménager.' : ''}${LANG_RULE(p.lang)}`;

export async function analyzeBodyPhoto(uid: Uid, id: string, goal = ''): Promise<BodyAnalysis> {
  const photos = await readPhotos(uid);
  const cur = photos.find(p => p.id === id);
  if (!cur) throw new Error('photo introuvable');
  const before = photos.filter(p => p.pose === cur.pose && p.date < cur.date)[0] ?? null;
  const imgs = await Promise.all([before ? photoB64(before.path).then(gridImage) : null, photoB64(cur.path).then(gridImage)]);
  const prof = await getFormeProfile(uid);
  const t = formeTargets(prof);
  const content = [
    ...(imgs[0] ? [imgBlock(imgs[0])] : []), imgBlock(imgs[1]!),
    { type: 'text' as const, text: before
      ? `AVANT : ${before.date}${before.weight ? `, ${before.weight} kg` : ''}. MAINTENANT : ${cur.date}${cur.weight ? `, ${cur.weight} kg` : ''}. Pose : ${cur.pose}. Cibles : ${t.p} g de protéines/jour.`
      : `Photo de départ (${cur.date}${cur.weight ? `, ${cur.weight} kg` : ''}), pose ${cur.pose}. Pas de photo d'avant : décris le point de départ et les zones à travailler.` },
    { type: 'text' as const, text: goal.trim() ? `CE QU'IL/ELLE VEUT PERDRE OU AMÉLIORER : ${goal.slice(0, 300)} — entoure surtout ces zones (trend « à travailler » si c'est encore à faire) et donne des conseils précis pour ça.` : 'Il/elle n\'a rien précisé : dis TOI-MÊME, avec tact, ce qu\'il/elle devrait perdre ou travailler en priorité (zones « à travailler » entourées), et pourquoi.' },
  ];
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 1500, system: bodySystem(prof), messages: [{ role: 'user', content }] }, QUALITY);
  const j = jsonOf<Partial<BodyAnalysis>>(textOf(res));
  const f01 = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d; };
  const a: BodyAnalysis = {
    at: Date.now(), vs: before?.id ?? null, summary: String(j.summary ?? '').slice(0, 500), score: Math.round(f01(Number(j.score) / 100, 0.5) * 100),
    zones: (j.zones ?? []).slice(0, 6).map(z => ({ label: String(z.label).slice(0, 30), x: f01(z.x, 0.5), y: f01(z.y, 0.5), r: Math.min(0.15, Math.max(0.04, f01(z.r, 0.1))),
      ...(before && z.bx != null ? { bx: f01(z.bx, 0.5), by: f01(z.by, 0.5), br: Math.min(0.15, Math.max(0.04, f01(z.br, 0.1))) } : {}),
      trend: (['mieux', 'pareil', 'à travailler'].includes(z.trend as string) ? z.trend : 'pareil') as Zone['trend'], note: String(z.note ?? '').slice(0, 120) })),
    advice: (j.advice ?? []).map(String).slice(0, 5), focus: (j.focus ?? []).map(String).slice(0, 5),
  };
  cur.analysis = a;
  await kvSet(PHK(uid), JSON.stringify(photos.slice(-120)));
  return a;
}

// ── Photo entourée (avant | maintenant) pour Telegram ───────────────────────
export async function annotatePhoto(uid: Uid, id: string): Promise<string | null> {
  const photos = await readPhotos(uid);
  const cur = photos.find(p => p.id === id);
  if (!cur?.analysis) return null;
  const before = cur.analysis.vs ? photos.find(p => p.id === cur.analysis!.vs) ?? null : null;
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const imgs = await Promise.all([before ? photoB64(before.path) : null, photoB64(cur.path)]);
  const load = async (i: Img | null) => i ? loadImage(Buffer.from(i.data, 'base64')) : null;
  const [bi, ci] = await Promise.all([load(imgs[0]), load(imgs[1])]);
  if (!ci) return null;
  const H = 1000, wOf = (im: { width: number; height: number }) => Math.round(im.width * H / im.height);
  const cw = wOf(ci), bw = bi ? wOf(bi) : 0, gap = bi ? 16 : 0, top = 90;
  const c = createCanvas(bw + gap + cw, H + top + 10);
  const g = c.getContext('2d');
  g.fillStyle = '#211d1c'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ffffff'; g.font = 'bold 46px sans-serif';
  g.fillText(bi ? 'AVANT' : 'POINT DE DÉPART', 20, 62);
  if (bi) { g.fillStyle = '#ff7a45'; g.fillText('MAINTENANT', bw + gap + 20, 62); }
  const COL: Record<string, string> = { 'mieux': '#22c55e', 'pareil': '#f2a516', 'à travailler': '#ff4b2b' };
  const draw = (im: Awaited<ReturnType<typeof loadImage>>, x0: number, w: number, isBefore: boolean) => {
    g.drawImage(im, x0, top, w, H);
    cur.analysis!.zones.forEach((z, i) => {
      const x = isBefore ? z.bx : z.x, y = isBefore ? z.by : z.y, rr = isBefore ? z.br : z.r;
      if (x == null || y == null || rr == null) return;
      const cx = x0 + x * w, cy = top + y * H, rad = rr * w;
      g.lineWidth = 9; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 6; g.strokeStyle = COL[z.trend] ?? '#ff4b2b'; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
      g.fillStyle = COL[z.trend] ?? '#ff4b2b'; g.beginPath(); g.arc(cx - rad * 0.72, cy - rad * 0.72, 24, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.fillText(String(i + 1), cx - rad * 0.72 - 8, cy - rad * 0.72 + 10);
    });
  };
  if (bi) draw(bi, 0, bw, true);
  draw(ci, bw + gap, cw, false);
  const path = `${uid}/annot-${id}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, c.toBuffer('image/jpeg', 85), { contentType: 'image/jpeg', upsert: true });
  if (error) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 86_400);
  return data?.signedUrl ?? null;
}

/** Dernière photo reçue sur Telegram (gardée 30 min, privée) → pour « voilà ma photo, je veux perdre le ventre ». */
const TG_PHOTO_KEY = 'kouider:forme:tg-photo';
export async function stashTelegramPhoto(b64: string, mime: string): Promise<void> {
  if (b64.length > 9_000_000) return;
  await kvSet(TG_PHOTO_KEY, JSON.stringify({ b64, mime, at: Date.now() }), 1800);
}

/** Dernière photo envoyée à Dzaryx sur Telegram (30 min) — sans la consommer (ex. la transférer sur WhatsApp). */
export async function lastTelegramPhoto(): Promise<{ b64: string; mime: string } | null> {
  const raw = await kvGet(TG_PHOTO_KEY).catch(() => null);
  return raw ? JSON.parse(raw) as { b64: string; mime: string } : null;
}

/** Photo de lui envoyée à Dzaryx : stockée, analysée (avant / maintenant), séance de demain refaite partout, photo entourée. */
export async function bodyFromTelegram(o: { focus?: string; pose?: string; adapt?: boolean }): Promise<string> {
  const raw = await kvGet(TG_PHOTO_KEY);
  if (!raw) return '❌ Je n\'ai pas de photo récente (30 min max) : renvoie-moi ta photo.';
  const { b64, mime } = JSON.parse(raw) as { b64: string; mime: string };
  const pose = (['face', 'profil', 'dos'].includes(String(o.pose)) ? o.pose : 'face') as BodyPhoto['pose'];
  const ph = await addBodyPhoto('kouider', { media: (/png|webp/.test(mime) ? mime : 'image/jpeg') as Img['media'], data: b64 }, pose);
  await kvDel(TG_PHOTO_KEY);
  const a = await analyzeBodyPhoto('kouider', ph.id, o.focus ?? '');
  const url = await annotatePhoto('kouider', ph.id).catch(() => null);
  let session = '';
  if (o.adapt !== false) {
    const r = await adaptNextSession('kouider', { focus: o.focus ?? '', observations: `${a.summary} Zones : ${a.zones.map(z => `${z.label} (${z.trend})`).join(', ')}.` }).catch(e => ({ date: '', text: `(séance non modifiée : ${e instanceof Error ? e.message : e})` }));
    session = r.date ? `\n\n🏋️ SÉANCE DU ${r.date} REFAITE (programme, agenda et app FORME mis à jour) :\n${r.text}` : `\n\n${r.text}`;
  }
  return [
    `📸 Photo enregistrée dans FORME (${pose}) et analysée${a.vs ? ' — comparée à la précédente' : ''}. Score de progression : ${a.score}/100.`,
    a.summary,
    `ZONES (numéros sur la photo) :\n${a.zones.map((z, i) => `${i + 1}. ${z.label} — ${z.trend} : ${z.note}`).join('\n')}`,
    `CONSEILS :\n${a.advice.map(x => `• ${x}`).join('\n')}`,
    session,
    url ? `\nRecopie TEL QUEL à la fin de ta réponse (c'est la photo entourée, elle partira en image) : ![Avant / maintenant](${url})` : '',
  ].filter(Boolean).join('\n');
}

/** Bilan à montrer au médecin (suivi du traitement) : poids, doses, injections, effets, mensurations. */
export async function doctorReport(uid: Uid): Promise<string> {
  const [p, days] = await Promise.all([getFormeProfile(uid), readDays(uid)]);
  const e = Object.entries(days).sort(([a], [b]) => a.localeCompare(b));
  const w = e.filter(([, d]) => d.weight);
  const inj = e.filter(([, d]) => d.injection);
  const sides = e.flatMap(([date, d]) => (d.sides ?? []).map(s => `${date} : ${s.what} (${['léger', 'moyen', 'fort'][s.level - 1]})`));
  const m = e.filter(([, d]) => d.measures?.taille);
  const t = formeTargets(p);
  const weeks = w.length >= 2 ? (Date.parse(w[w.length - 1]![0]) - Date.parse(w[0]![0])) / 604_800_000 : 0;
  return [
    `BILAN DE SUIVI — ${p.name || ''} — ${localNow().date}`,
    `Taille ${p.heightCm} cm · âge ${p.age} ans · objectif ${p.targetKg} kg`,
    w.length ? `Poids : ${w[0]![1].weight} kg (${w[0]![0]}) → ${w[w.length - 1]![1].weight} kg (${w[w.length - 1]![0]})${weeks >= 1 ? ` · ${((w[0]![1].weight! - w[w.length - 1]![1].weight!) / weeks).toFixed(2)} kg/semaine` : ''} · IMC ${(w[w.length - 1]![1].weight! / (p.heightCm / 100) ** 2).toFixed(1)}` : 'Poids : pas encore de pesée notée',
    m.length ? `Tour de taille : ${m[0]![1].measures!.taille} cm → ${m[m.length - 1]![1].measures!.taille} cm` : '',
    p.wegovy.on ? `Traitement : dose actuelle ${p.wegovy.dose || '?'} ; paliers : ${(p.wegovy.doses ?? []).map(x => `${x.dose} (${x.date})`).join(' → ') || '—'}` : '',
    p.wegovy.on ? `Injections notées : ${inj.length}${inj.length ? ` (dernière le ${inj[inj.length - 1]![0]})` : ''}` : '',
    `Effets ressentis (30 derniers) : ${sides.slice(-30).join(' ; ') || 'aucun noté'}`,
    `Apports visés : ${t.kcal} kcal/j, ${t.p} g de protéines/j · activité : ${p.sessionsPerWeek} séances/semaine`,
    'Généré par l\'app FORME (données notées par le patient).',
  ].filter(Boolean).join('\n');
}

// ── Traduction à la volée (mode arabe) : tout texte français encore à l'écran → arabe littéraire, mis en cache ──
const TR_KEY = 'forme:tr:ar';
let trMem: Record<string, string> | null = null;
export async function translateAr(texts: string[]): Promise<Record<string, string>> {
  trMem ??= await readJson<Record<string, string>>(TR_KEY, {});
  const want = [...new Set(texts.map(t => String(t).trim()).filter(t => t.length >= 2 && t.length <= 600))].slice(0, 80);
  const out: Record<string, string> = {};
  const todo = want.filter(t => { const h = trMem![t]; if (h) out[t] = h; return !h; });
  for (let i = 0; i < todo.length; i += 40) {
    const part = todo.slice(i, i + 40);
    try {
      const res = await createAnthropic().messages.create({ model: 'claude-haiku-5-5', max_tokens: 6000,
        system: 'Traduis ces textes d\'une application de sport (séances, exercices, machines de salle, suivi du corps) du français vers l\'ARABE LITTÉRAIRE MODERNE (فصحى), simple et naturel ; l\'utilisatrice est une femme (féminin). Garde tels quels : emojis, nombres, unités (kg, g, kcal, cm, min, €, mg), noms de marques et de magasins (Colruyt, Delhaize, Aldi, Lidl, Boni, Wegovy, Dzaryx, Basic-Fit), les marqueurs comme « · ». On te donne une liste numérotée : réponds UNIQUEMENT par un objet JSON {"ar": ["traduction 1", "traduction 2", …]} avec EXACTEMENT le même nombre d\'éléments, dans le même ordre.',
        messages: [{ role: 'user', content: JSON.stringify(part) }] });
      const arr = jsonOf<{ ar?: unknown[] }>(textOf(res)).ar ?? [];
      if (arr.length === part.length) part.forEach((t, k) => { const v = arr[k]; if (typeof v === 'string' && v.trim()) { out[t] = v; trMem![t] = v; } });
    } catch { /* on réessaiera au prochain affichage */ }
  }
  if (todo.length) {
    const keys = Object.keys(trMem);
    if (keys.length > 6000) for (const k of keys.slice(0, keys.length - 6000)) delete trMem[k];
    await kvSet(TR_KEY, JSON.stringify(trMem)).catch(() => {});
  }
  return out;
}

// ── Coach sport à qui poser une question (technique, machine, douleur, récup) ──
export async function askFormeCoach(question: string, uid: Uid = 'kouider', mode = ''): Promise<string> {
  const p = await getFormeProfile(uid);
  let ctx = await formeText(uid);
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 900,
    system: `Tu es le coach SPORT FORME de ${p.name || 'cette personne'} (musculation, cardio, technique, récupération, salle), qui vit à Bruxelles. Tu ne donnes AUCUN conseil de nourriture / régime / recettes (retiré de FORME le 31/10) : si on t'en demande, dis gentiment que FORME s'occupe du sport.\nRéponds simplement, concret, chaleureux, ${mode ? '20' : '8'} lignes max. Questions médicales (dose, effets graves : douleur au ventre forte et persistante, vomissements répétés, malaise) → son médecin ou le 112 en urgence.${p.lang === 'ar' ? ' Réponds en arabe littéraire.' : ' Réponds en français.'}`,
    messages: [{ role: 'user', content: `${ctx}\n\nQUESTION : ${question.slice(0, 800)}` }] }, QUALITY);
  return textOf(res).trim();
}

// ── Vue d'ensemble pour l'app ────────────────────────────────────────────────
const SITES = ['ventre gauche', 'ventre droit', 'cuisse gauche', 'cuisse droite', 'bras gauche', 'bras droit'];

export function nextInjection(p: FormeProfile, days: Record<string, FormeDay>) {
  if (!p.wegovy.on) return null;
  const today = localNow().date;
  const last = Object.entries(days).filter(([, d]) => d.injection).sort(([a], [b]) => a.localeCompare(b)).pop();
  let next = today;
  for (let i = 0; i < 8; i++) { const d = addDays(today, i); if (new Date(`${d}T12:00:00Z`).getUTCDay() === p.wegovy.day) { next = d; break; } }
  if (last && last[0] === next) next = addDays(next, 7);
  const lastSite = last?.[1].injection?.site;
  const site = SITES[(SITES.indexOf(lastSite ?? '') + 1) % SITES.length]!;
  return { date: next, hour: p.wegovy.hour, inDays: Math.round((Date.parse(next) - Date.parse(today)) / 86_400_000), site, last: last ? { date: last[0], site: lastSite ?? '' } : null };
}

export async function formeOverview(uid: Uid = 'kouider') {
  const today = localNow().date;
  const [p, days, photos, femmeInvite] = await Promise.all([getFormeProfile(uid), readDays(uid), readPhotos(uid), uid === 'kouider' ? inviteActive('femme') : Promise.resolve(false)]);
  const day = days[today] ?? emptyDay();
  // Journée très active (montre) : la cible de base compte déjà une activité normale (~400 kcal) → on rend la moitié
  // du surplus, plafonné à +300 kcal, en glucides (énergie pour la séance)
  const t0 = formeTargets(p);
  const bonusKcal = Math.min(300, Math.max(0, Math.round(((day.activeKcal ?? 0) - 400) * 0.5 / 10) * 10));
  const t = bonusKcal ? { ...t0, kcal: t0.kcal + bonusKcal, c: t0.c + Math.round(bonusKcal / 4), bonusKcal, activeKcal: day.activeKcal } : t0;
  const weights = Object.entries(days).filter(([, d]) => d.weight).map(([date, d]) => ({ date, kg: d.weight! })).sort((a, b) => a.date.localeCompare(b.date));
  const measures = Object.entries(days).filter(([, d]) => d.measures && Object.keys(d.measures).length).map(([date, d]) => ({ date, ...d.measures })).sort((a, b) => a.date.localeCompare(b.date));
  const injections = Object.entries(days).filter(([, d]) => d.injection).map(([date, d]) => ({ date, ...d.injection! })).sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  const sides = Object.entries(days).flatMap(([date, d]) => (d.sides ?? []).map(s => ({ date, ...s }))).sort((a, b) => b.at - a.at).slice(0, 15);
  // Série = jours de suivi d'affilée (poids, séance, pas, photo) — plus de repas depuis le 31/10
  let streak = 0;
  for (let i = 0; i < 200; i++) { const d = days[addDays(today, -i)]; if (d && (d.weight || d.workout || d.steps || d.injection)) streak++; else if (i > 0) break; }
  const week7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map(d => ({ date: d, sleep: days[d]?.sleep ?? null, steps: days[d]?.steps ?? null, workout: !!days[d]?.workout }));
  const shown = photos.slice(-24);
  const urls = await signedPhotoUrls(shown).catch(() => ({} as Record<string, string>));
  const lastPhoto = photos[photos.length - 1];
  const photoDue = !lastPhoto || (Date.parse(today) - Date.parse(lastPhoto.date)) / 86_400_000 >= p.photoEveryDays;
  // Perte trop rapide (> 1,2 %/semaine sur 3 semaines) = risque de perdre du muscle → alerte douce
  const w21 = weights.filter(w => w.date >= addDays(today, -21));
  const ratePerWeek = w21.length >= 2 ? (w21[0]!.kg - w21[w21.length - 1]!.kg) / Math.max(1, (Date.parse(w21[w21.length - 1]!.date) - Date.parse(w21[0]!.date)) / 604_800_000) : null;
  const curW = weights[weights.length - 1]?.kg ?? p.weightKg;
  const badges = [
    { id: 'start', label: 'Premier pas', emoji: '🚀', ok: p.onboarded },
    { id: 'streak7', label: '7 jours de suivi', emoji: '🔥', ok: streak >= 7 },
    { id: 'workout', label: 'Séance de la semaine', emoji: '🏋️', ok: week7.some(d => d.workout) },
    { id: 'photo', label: 'Avant / après', emoji: '📸', ok: photos.length >= 2 },
    { id: 'kg2', label: '−2 kg', emoji: '⚖️', ok: weights.length > 0 && weights[0]!.kg - curW >= 2 },
    { id: 'kg5', label: '−5 kg', emoji: '🏅', ok: weights.length > 0 && weights[0]!.kg - curW >= 5 },
    { id: 'inj4', label: '4 injections notées', emoji: '💉', ok: injections.length >= 4 },
  ];
  return {
    uid, today, profile: p, targets: t, day, week7, streak, badges,
    weights, measures, injections, sides, nextInjection: nextInjection(p, days), doses: WEGOVY_DOSES,
    photos: shown.map(ph => ({ ...ph, url: urls[ph.id] ?? null })).reverse(), photoDue,
    weightRate: ratePerWeek != null ? Math.round(ratePerWeek * 10) / 10 : null,
    tooFast: ratePerWeek != null && ratePerWeek > curW * 0.012,
    // Date estimée pour atteindre le poids visé, au rythme des 3 dernières semaines
    eta: ratePerWeek && ratePerWeek > 0.05 && curW > p.targetKg ? addDays(today, Math.round((curW - p.targetKg) / ratePerWeek * 7)) : null,
    ...(uid === 'kouider' ? { femme: { active: femmeInvite, name: (await getFormeProfile('femme')).name } } : {}),
  };
}

export async function logForme(kind: string, b: Record<string, unknown>, date = localNow().date, uid: Uid = 'kouider'): Promise<FormeDay> {
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const d = await updateDay(uid, date, d => {
    if (kind === 'water') d.water = Math.max(0, Math.min(30, d.water + (n(b.delta) || 1)));
    else if (kind === 'weight' && n(b.kg) > 30) d.weight = Math.round(n(b.kg) * 10) / 10;
    else if (kind === 'meal') d.meals[String(b.key)] = !!b.eaten;
    else if (kind === 'food') d.extra.push({ name: String(b.name ?? 'Aliment').slice(0, 60), kcal: Math.round(n(b.kcal)), p: Math.round(n(b.p)), c: Math.round(n(b.c)), f: Math.round(n(b.f)), at: Date.now(), src: String(b.src ?? 'manuel').slice(0, 20) });
    else if (kind === 'food-del') d.extra.splice(n(b.index), 1);
    else if (kind === 'protein') d.extra.push({ name: String(b.name ?? 'Protéines').slice(0, 60), kcal: Math.round(n(b.p) * 4.5), p: Math.round(n(b.p)), c: 0, f: 0, at: Date.now(), src: 'rapide' });
    else if (kind === 'measures') d.measures = { ...(d.measures ?? {}), ...Object.fromEntries(Object.entries(b.measures as Record<string, unknown> ?? {}).filter(([k, v]) => ['taille', 'hanches', 'poitrine', 'bras', 'cuisse'].includes(k) && n(v) > 10).map(([k, v]) => [k, n(v)])) };
    else if (kind === 'injection') d.injection = { at: Date.now(), site: String(b.site ?? '').slice(0, 30), ...(b.dose ? { dose: String(b.dose).slice(0, 20) } : {}) };
    else if (kind === 'injection-del') delete d.injection;
    else if (kind === 'side') (d.sides ??= []).push({ what: String(b.what ?? '').slice(0, 40), level: Math.min(3, Math.max(1, n(b.level) || 1)), at: Date.now() });
    else if (kind === 'sleep' && n(b.hours) > 0) d.sleep = Math.min(14, Math.round(n(b.hours) * 2) / 2);
    else if (kind === 'steps' && n(b.steps) >= 0) d.steps = Math.min(80000, Math.round(n(b.steps)));
    else if (kind === 'workout') d.workout = { session: n(b.session), label: String(b.label ?? '').slice(0, 40), sets: (Array.isArray(b.sets) ? b.sets as WorkoutLog['sets'] : []).slice(0, 80).map(s => ({ ex: String(s.ex), ...(n(s.kg) > 0 ? { kg: n(s.kg) } : {}), ...(n(s.reps) > 0 ? { reps: n(s.reps) } : {}) })), ...(n(b.durationMin) > 0 ? { durationMin: n(b.durationMin) } : {}), ...(n(b.rpe) > 0 ? { rpe: n(b.rpe) } : {}), at: Date.now() };
  });
  if (kind === 'weight' && n(b.kg) > 30) await setFormeProfile({ weightKg: n(b.kg) }, uid).catch(() => {});
  return d;
}

// ── Ce que Dzaryx sait (dossier : chat, appels, message du matin) ───────────
export async function formeText(uid: Uid = 'kouider'): Promise<string> {
  // 31/10 : FORME = SPORT seulement (Kouider : « enlève tout ce qui concerne la nourriture ») → plus de repas, kcal, eau ni courses ici.
  const [p, days, photos, machines] = await Promise.all([getFormeProfile(uid), readDays(uid), readPhotos(uid), machineHistory(uid)]);
  const who = uid === 'kouider' ? 'Kouider' : p.name || 'sa femme';
  if (!p.onboarded && !Object.keys(days).length) return uid === 'kouider' ? 'APP FORME (sport) : pas encore configurée — propose-lui d\'ouvrir la page FORME de l\'app.' : '';
  const today = localNow().date;
  const lastDays = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).map(d => {
    const x = days[d]; if (!x) return null;
    const bits = [x.weight ? `${x.weight} kg` : '', x.injection ? `💉 injection (${x.injection.site}${x.injection.dose ? `, ${x.injection.dose}` : ''})` : '', x.workout ? `séance ${x.workout.label}` : '', x.sleep ? `sommeil ${x.sleep} h` : '', x.steps != null ? `${x.steps} pas` : '', x.sides?.length ? `effets : ${x.sides.map(s => `${s.what} ${s.level}/3`).join(', ')}` : ''].filter(Boolean);
    return bits.length ? `- ${d} : ${bits.join(', ')}` : null;
  }).filter(Boolean);
  const weights = Object.entries(days).filter(([, d]) => d.weight).sort(([a], [b]) => a.localeCompare(b));
  const inj = nextInjection(p, days);
  const lastA = [...photos].reverse().find(ph => ph.analysis);
  const lines = [
    uid === 'kouider'
      ? 'APP FORME (son app SPORT : séances, bibliothèque d\'exercices, scan des machines de la salle, photos du corps — page FORME de l\'app Dzaryx et appli à part). AUCUNE nutrition : ne parle jamais de repas, kcal ou courses à cause de FORME. Outil `forme` pour lire/noter.'
      : `SUIVI FORME DE ${who.toUpperCase()} (elle a accepté de le partager avec Dzaryx ; reste discret et bienveillant, n'en parle qu'à Kouider ou à elle) :`,
    `Objectif : ${p.goal} · ${weights.length ? `${weights[0]![1].weight} kg au départ → ${weights[weights.length - 1]![1].weight} kg aujourd'hui` : `${p.weightKg} kg`} → visé ${p.targetKg} kg.`,
    p.wegovy.on ? `TRAITEMENT WEGOVY (privé ; jamais de conseil de dose → médecin) : ${p.wegovy.dose ? `dose actuelle ${p.wegovy.dose}, ` : ''}injection le ${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][p.wegovy.day]} ${p.wegovy.hour}${inj ? `, prochaine ${inj.inDays === 0 ? "AUJOURD'HUI" : `dans ${inj.inDays} j`} (site conseillé : ${inj.site})` : ''}.` : '',
    lastDays.length ? `7 DERNIERS JOURS :\n${lastDays.join('\n')}` : '',
    lastA?.analysis ? `DERNIÈRE ANALYSE PHOTO (${lastA.date}) : ${lastA.analysis.summary} À travailler : ${lastA.analysis.focus.join(', ')}.` : '',
    machines.length ? `Machines scannées récemment : ${machines.slice(0, 5).map(m => `${m.machine} (${m.date})`).join(', ')}.` : '',
    p.reminders.length ? `Rappels perso : ${p.reminders.map(x => `${x.label} ${x.time}`).join(', ')}.` : '',
    `Photos de suivi : ${photos.length}${photos.length ? `, dernière le ${photos[photos.length - 1]!.date}` : ''} (rappel tous les ${p.photoEveryDays} j).`,
  ];
  let out = lines.filter(Boolean).join('\n');
  if (uid === 'kouider') {
    const fp = await getFormeProfile('femme');
    if (fp.onboarded && fp.shareWithDzaryx) out += `\n${await formeText('femme')}`;
  }
  return out;
}

// ── SCAN DE MACHINE (Kouider 31/10, « je prends une machine en photo → il me dit les exercices en image + un lien vidéo ») ──
// Une photo (machine, banc, poulie, haltères…) → la vision (gratuite par défaut, cf. anthropic-compat) reconnaît l'appareil et
// choisit dans la bibliothèque (free-exercise-db : photos + muscles) les exercices faisables dessus. Lien YouTube = recherche.
export interface MachineEx { id: string | null; name: string; muscles: string[]; tip: string; img: string[]; video: string }
export interface MachineScan { id: string; at: number; date: string; machine: string; what: string; setup: string; exercises: MachineEx[]; thumb?: string }
const MACH_K = (uid: Uid) => `${uid}:forme:machines`;
export async function machineHistory(uid: Uid): Promise<MachineScan[]> { return readJson<MachineScan[]>(MACH_K(uid), []); }
const ytSearch = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} technique musculation`)}`;

export async function scanMachine(uid: Uid, img: Img, thumb?: string): Promise<MachineScan> {
  const { exerciseLibrary } = await import('./exercise-lib.js');
  const { vision, jsonOf } = await import('./media-util.js');
  const lib = await exerciseLibrary();
  const gym = lib.filter(e => e.cat === 'strength' || e.cat === 'powerlifting' || e.cat === 'stretching' || e.cat === 'cardio');
  const ids = gym.map(e => e.id).join(' ');
  const lang = (await getFormeProfile(uid)).lang;
  const raw = await vision([{ base64: img.data, mime: img.media }], `Voici une photo prise à la salle de sport (une machine, une poulie, un banc, des haltères, une barre, un appareil de cardio…).
1) Reconnais l'appareil (nom courant en salle${lang === 'ar' ? ', en arabe' : ' en français'}).
2) Choisis de 4 à 8 exercices qu'on peut faire DESSUS (ou avec), du plus classique au plus avancé. Pour chacun, prends l'identifiant EXACT le plus proche dans cette liste (même mouvement, même matériel), ou null s'il n'y en a pas :
${ids}
Tutoie (« règle », « place-toi »). Réponds UNIQUEMENT en JSON : {"machine":"nom de l'appareil","what":"à quoi il sert en 1 phrase","setup":"comment le régler / se placer en 1-2 phrases (siège, coussins, poids, prise)","exercises":[{"id":"Identifiant_Exact ou null","name":"nom ${lang === 'ar' ? 'en arabe' : 'en français'} comme on le dit en salle","muscles":["muscles principaux${lang === 'ar' ? ' en arabe' : ' en français'}"],"tip":"le conseil clé en 1 phrase"}]}
Si la photo ne montre aucun matériel de sport : {"machine":"","what":"pas de matériel de sport visible","setup":"","exercises":[]}`, { maxTokens: 1500 });
  const j = jsonOf<{ machine?: string; what?: string; setup?: string; exercises?: Array<{ id?: string | null; name?: string; muscles?: string[]; tip?: string }> }>(raw);
  if (!j) throw new Error('Je n\'ai pas réussi à lire la photo — réessaie de plus près, avec toute la machine dans le cadre.');
  const byId = new Map(lib.map(e => [e.id, e]));
  const exercises: MachineEx[] = (j.exercises ?? []).slice(0, 8).map(x => {
    const e = x.id ? byId.get(String(x.id)) : undefined;
    const name = String(x.name || e?.fr || '').slice(0, 80);
    return { id: e?.id ?? null, name, muscles: (x.muscles ?? []).map(String).slice(0, 4), tip: String(x.tip ?? '').slice(0, 220), img: e?.img ?? [], video: ytSearch(e?.name ?? name) };
  }).filter(x => x.name);
  const scan: MachineScan = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), date: localNow().date, machine: String(j.machine ?? '').slice(0, 80), what: String(j.what ?? '').slice(0, 240), setup: String(j.setup ?? '').slice(0, 400), exercises, thumb: thumb && thumb.length < 60_000 ? thumb : undefined };
  if (scan.machine && exercises.length) {
    const hist = await machineHistory(uid);
    await kvSet(MACH_K(uid), JSON.stringify([scan, ...hist.filter(h => h.machine.toLowerCase() !== scan.machine.toLowerCase())].slice(0, 30)));
  }
  return scan;
}
export async function deleteMachine(uid: Uid, id: string): Promise<MachineScan[]> {
  const hist = (await machineHistory(uid)).filter(h => h.id !== id);
  await kvSet(MACH_K(uid), JSON.stringify(hist));
  return hist;
}

// ── Historique / progrès par exercice de la bibliothèque (onglets « Historique » et « Progrès » de la fiche) ──
export interface ExSet { at: number; date: string; kg?: number; reps?: number }
const EXLOG_K = (uid: Uid) => `${uid}:forme:exlog`;
async function readExLog(uid: Uid): Promise<Record<string, ExSet[]>> { return readJson<Record<string, ExSet[]>>(EXLOG_K(uid), {}); }
export async function exHistory(uid: Uid, id: string): Promise<ExSet[]> { return (await readExLog(uid))[id] ?? []; }
export async function addExSet(uid: Uid, id: string, kg?: number, reps?: number): Promise<ExSet[]> {
  const all = await readExLog(uid);
  const row: ExSet = { at: Date.now(), date: localNow().date, ...(kg && kg > 0 ? { kg: Math.round(kg * 10) / 10 } : {}), ...(reps && reps > 0 ? { reps: Math.round(reps) } : {}) };
  all[id] = [...(all[id] ?? []), row].slice(-300);
  await kvSet(EXLOG_K(uid), JSON.stringify(all));
  return all[id]!;
}
export async function delExSet(uid: Uid, id: string, at: number): Promise<ExSet[]> {
  const all = await readExLog(uid);
  all[id] = (all[id] ?? []).filter(x => x.at !== at);
  await kvSet(EXLOG_K(uid), JSON.stringify(all));
  return all[id]!;
}

/** Plusieurs séries d'un coup (fin de séance) → historique de chaque exercice de la bibliothèque. */
export async function addExSets(uid: Uid, sets: Array<{ id: string; kg?: number; reps?: number }>): Promise<number> {
  const all = await readExLog(uid);
  const date = localNow().date; let n = 0; const t = Date.now();
  for (const x of sets.slice(0, 120)) {
    if (!x.id) continue;
    const row: ExSet = { at: t + n, date, ...(x.kg && x.kg > 0 ? { kg: Math.round(x.kg * 10) / 10 } : {}), ...(x.reps && x.reps > 0 ? { reps: Math.round(x.reps) } : {}) };
    all[x.id] = [...(all[x.id] ?? []), row].slice(-300); n++;
  }
  await kvSet(EXLOG_K(uid), JSON.stringify(all));
  return n;
}
/** Dernière séance notée pour chaque exercice (colonne « Précédent » des routines). */
export async function exLast(uid: Uid, ids: string[]): Promise<Record<string, ExSet[]>> {
  const all = await readExLog(uid); const out: Record<string, ExSet[]> = {};
  for (const id of ids) { const l = all[id] ?? []; const d = l[l.length - 1]?.date; if (d) out[id] = l.filter(x => x.date === d); }
  return out;
}

// ── MES ROUTINES (façon Hevy) : séances perso composées depuis la bibliothèque ──
export interface RoutineEx { id: string; name: string; img: string[]; sets: number; reps: string; rest: number }
export interface Routine { id: string; name: string; at: number; exercises: RoutineEx[] }
const ROUT_K = (uid: Uid) => `${uid}:forme:routines`;
export async function routines(uid: Uid): Promise<Routine[]> { return readJson<Routine[]>(ROUT_K(uid), []); }
export async function saveRoutine(uid: Uid, r: Partial<Routine> & { name: string; exercises: RoutineEx[] }): Promise<Routine[]> {
  const list = await routines(uid);
  const clean: Routine = { id: r.id && /^[\w-]{4,20}$/.test(r.id) ? r.id : Math.random().toString(36).slice(2, 10), name: String(r.name).slice(0, 60), at: Date.now(),
    exercises: r.exercises.slice(0, 20).map(e => ({ id: String(e.id).slice(0, 100), name: String(e.name).slice(0, 80), img: (e.img ?? []).slice(0, 2).map(String), sets: Math.min(10, Math.max(1, Number(e.sets) || 3)), reps: String(e.reps || '10').slice(0, 10), rest: Math.min(600, Math.max(15, Number(e.rest) || 90)) })) };
  const next = [clean, ...list.filter(x => x.id !== clean.id)].slice(0, 30);
  await kvSet(ROUT_K(uid), JSON.stringify(next));
  return next;
}
export async function deleteRoutine(uid: Uid, id: string): Promise<Routine[]> {
  const next = (await routines(uid)).filter(x => x.id !== id);
  await kvSet(ROUT_K(uid), JSON.stringify(next));
  return next;
}

// ── Exercices favoris (le petit marque-page de la vidéo) ──
const EXFAV_K = (uid: Uid) => `${uid}:forme:exfav`;
export async function exFavs(uid: Uid): Promise<string[]> { return readJson<string[]>(EXFAV_K(uid), []); }
export async function toggleExFav(uid: Uid, id: string, on: boolean): Promise<string[]> {
  const cur = (await exFavs(uid)).filter(x => x !== id);
  const next = on ? [id, ...cur].slice(0, 200) : cur;
  await kvSet(EXFAV_K(uid), JSON.stringify(next));
  return next;
}

// ── Notifications (push de l'appli FORME de chacun ; Kouider : aussi l'app Dzaryx) ──
export async function storeFormeSub(sub: PushSubscription, uid: Uid = 'kouider') { await kvSet(SUB_K(uid), JSON.stringify(sub)); }

const MSG = {
  fr: {
    custom: ['⏰ Rappel', (t: string) => t],
    inj: ['💉 Wegovy ce soir', (site: string) => `C'est le jour de ton injection. Site conseillé : ${site}. Note-la dans FORME une fois faite.`],
    weigh: ['⚖️ Pesée du matin', () => 'À jeun, après les toilettes : 10 secondes et c\'est noté.'],
    lunch: ['🍽️ Ton déjeuner', (t: string) => `${t} — petites bouchées, arrête-toi dès que tu n'as plus faim.`],
    dinner: ['🍽️ Ce soir', (t: string) => `${t}. Coche-le dans FORME quand c'est mangé.`],
    water: ['💧 Bois un verre', (n: string) => `Tu es à ${n} verres — l'eau aide contre la nausée et la fatigue.`],
    photo: ['📸 Photo de suivi', () => 'Même endroit, même lumière : face, profil et dos. L\'app te montre ce qui a changé.'],
  },
  ar: {
    custom: ['⏰ تذكير', (t: string) => t],
    inj: ['💉 موعد حقنة ويغوفي', (site: string) => `اليوم موعد حقنتك. الموضع المقترح: ${site}. سجّليها في التطبيق بعد أخذها.`],
    weigh: ['⚖️ وزن الصباح', () => 'على الريق وبعد دخول الحمّام: عشر ثوانٍ فقط.'],
    lunch: ['🍽️ غداؤك', (t: string) => `${t} — لقيمات صغيرة، وتوقّفي عند الشعور بالشبع.`],
    dinner: ['🍽️ عشاء الليلة', (t: string) => `${t}. ضعي علامة في التطبيق بعد الأكل.`],
    water: ['💧 اشربي كوب ماء', (n: string) => `وصلتِ إلى ${n} أكواب — الماء يخفّف الغثيان والتعب.`],
    photo: ['📸 صورة المتابعة', () => 'نفس المكان ونفس الإضاءة: من الأمام والجانب والخلف.'],
  },
} as const;

/** Notification directe sur le téléphone (appli FORME), même fermée — ex. invitation à jouer. */
export async function pushForme(uid: Uid, title: string, body: string, url: string, type = 'forme'): Promise<boolean> {
  const sub = await readJson<PushSubscription | null>(SUB_K(uid), null);
  if (!sub) return false;
  await sendWebPush(sub, title, body, { url, type }, { urgency: 'high', TTL: 600 }).catch(() => {});
  return true;
}

async function notify(uid: Uid, what: keyof typeof MSG.fr, arg: string, date = localNow().date, tag = ''): Promise<boolean> {
  if (await kvGet(SENT_K(uid, what + tag, date))) return false;
  await kvSet(SENT_K(uid, what + tag, date), '1', 2 * 86_400);
  const lang = (await getFormeProfile(uid)).lang;
  const [title, body] = [MSG[lang][what][0], (MSG[lang][what][1] as (a: string) => string)(arg)];
  const sub = await readJson<PushSubscription | null>(SUB_K(uid), null);
  if (sub) await sendWebPush(sub, title, body, { url: 'https://kouider213.github.io/ibrahim/forme/', type: 'forme' }).catch(() => {});
  if (uid === 'kouider') {
    emitProactive(`${title} — ${body}`, 'reminder', undefined, 'kouider', 'sport', true);
    if ((await getFormeProfile(uid)).notif.telegram !== false) await queueTelegramMessage(`${title}\n${body}`).catch(() => {});
  }
  return true;
}

/** Toutes les 15 min, 7h-22h, pour chacun : injection, pesée, photo, rappels perso. Une seule fois par jour pour chaque. */
export async function jobFormeReminders(): Promise<string> {
  const out: string[] = [];
  for (const uid of UIDS) {
    const p = await getFormeProfile(uid);
    if (!p.onboarded) continue;
    const { date, hhmm } = localNow();
    const days = await readDays(uid);
    const d = days[date] ?? emptyDay();
    const sent: string[] = [];
    const at = (h: string) => hhmm >= h;
    const inj = nextInjection(p, days);
    if (p.notif.injection && inj?.inDays === 0 && !d.injection && at(p.wegovy.hour) && await notify(uid, 'inj', inj.site)) sent.push('injection');
    if (p.notif.weigh && at('07:30') && !at('10:00') && !d.weight && (p.weighDaily || new Date(`${date}T12:00:00Z`).getUTCDay() === 1) && await notify(uid, 'weigh', '')) sent.push('pesée');
    // 31/10 : plus de rappels repas / eau (FORME = sport seulement)
    const photos = await readPhotos(uid);
    const last = photos[photos.length - 1];
    if (p.notif.photo && at('09:00') && (!last || (Date.parse(date) - Date.parse(last.date)) / 86_400_000 >= p.photoEveryDays) && await notify(uid, 'photo', '')) sent.push('photo');
    // Rappels perso (vitamine D, médicament…) : à l'heure dite, les jours choisis
    const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const rm of p.reminders) if (rm.days.includes(wd) && at(rm.time) && hhmm < `${String(Math.min(23, Number(rm.time.slice(0, 2)) + 2)).padStart(2, '0')}${rm.time.slice(2)}` && await notify(uid, 'custom', rm.label, date, rm.id)) sent.push(rm.label);
    if (sent.length) out.push(`${uid}: ${sent.join(', ')}`);
  }
  return out.join(' · ') || 'rien';
}

/** Dimanche 19h : avant, bilan nutrition + semaine de repas. 31/10 : nutrition retirée de FORME → plus rien ici
 * (le bilan sport du dimanche, c'est sport-weekly à 20h). Gardé pour ne pas casser le planning. */
export async function jobFormeWeekly(): Promise<void> { /* rien : FORME = sport seulement */ }

// ── Outil Dzaryx `forme` (Kouider seulement : son suivi à lui) ───────────────
export async function formeTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input.action ?? 'status');
  if (a === 'status') return await formeText('kouider');
  if (a === 'log') {
    const kind = String(input.kind ?? '');
    if (!['weight', 'injection', 'side', 'measures'].includes(kind)) return 'kind invalide (weight, injection, side, measures) — FORME ne suit plus la nourriture';
    await logForme(kind, input);
    return `✅ Noté dans FORME (${kind}).`;
  }
  if (a === 'machines') {
    const h = await machineHistory('kouider');
    return h.length ? h.slice(0, 10).map(m => `${m.date} · ${m.machine} : ${m.exercises.map(e => e.name).join(', ')}`).join('\n') : 'Aucune machine scannée pour l\'instant (FORME → Scanner).';
  }
  if (a === 'ask') return await askFormeCoach(String(input.question ?? ''));
  if (a === 'profile') {
    const patch = input as Partial<FormeProfile> & { dose?: string };
    if (patch.dose) patch.wegovy = { ...(await getFormeProfile()).wegovy, dose: patch.dose };
    await setFormeProfile(patch); return '✅ Profil FORME mis à jour.';
  }
  if (a === 'body_photo') return await bodyFromTelegram({ focus: input.focus ? String(input.focus) : '', pose: input.pose ? String(input.pose) : undefined, adapt: input.adapt !== false });
  if (a === 'doctor') return await doctorReport('kouider');
  if (a === 'adapt_tomorrow') {
    const r = await adaptNextSession('kouider', { focus: String(input.focus ?? input.question ?? ''), observations: input.observations ? String(input.observations) : undefined });
    return `✅ Séance du ${r.date} refaite sur mesure (agenda + app FORME mis à jour) :\n${r.text}`;
  }
  if (a === 'photos') {
    const ph = (await readPhotos()).filter(x => x.analysis).slice(-3);
    return ph.length ? ph.map(x => `${x.date} (${x.pose}) : ${x.analysis!.summary}\nConseils : ${x.analysis!.advice.join(' · ')}`).join('\n\n') : 'Aucune photo analysée pour l\'instant.';
  }
  return 'action inconnue';
}
