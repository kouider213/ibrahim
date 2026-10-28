import { createHash, randomBytes } from 'node:crypto';
import { kvGet, kvSet, kvDel } from './app-store.js';
import { supabase } from './supabase.js';
import { createAnthropic, QUALITY } from './anthropic-compat.js';
import { localNow } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { env } from '../config/env.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { sendWebPush } from '../notifications/web-push-service.js';
import type { PushSubscription } from 'web-push';

// FORME (Kouider 25/10, sur le modèle de l'app MacroSave qu'il a montrée) : app sport + nutrition + suivi du corps.
// Toujours : HALAL uniquement (jamais de porc, d'alcool, de gélatine de porc ; viande halal), magasins BELGES
// (Colruyt, Delhaize, Aldi, Lidl…), et — si le profil l'active — adaptation à un traitement GLP-1 (rappel d'injection,
// dose notée, portions adaptées ; jamais de conseil de dose).
// DEUX PROFILS : Kouider et sa femme, chacun ses repas, son suivi, ses photos. Elle utilise l'app en arabe littéraire
// (langue principale) ou en français. Seule la LISTE DE COURSES est commune au foyer : ce que l'un coche est coché chez
// l'autre (on n'achète pas 2 fois). Aucun des deux ne voit le suivi de l'autre ; Dzaryx suit Kouider (formeText → dossier)
// et ne lit le suivi de sa femme que si ELLE l'a autorisé dans ses réglages.
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
const FAV_K = (u: Uid) => `${u}:forme:favrecipes`;   // recettes favorites COMPLÈTES (à refaire quand on veut)    // prochaine séance refaite sur mesure (photo + objectif)
const SUB_K = (u: Uid) => `mobile:web_push_sub:${u}:forme`;
const WEEK_K = (u: Uid, start: string) => `${u}:forme:week:${start}`;
const WEEKS_K = (u: Uid) => `${u}:forme:weeks`;   // dates de début des plans (7 jours chacun)
const SENT_K = (u: Uid, what: string, date: string) => `${u}:forme:sent:${what}:${date}`;
const CHECKS_KEY = 'foyer:forme:checks';             // courses cochées, communes au foyer
const EXTRA_KEY = 'foyer:forme:extra';               // articles ajoutés à la main (lait du petit, lessive…)
const INVITE_K = (hash: string) => `forme:invite:${hash}`;
const INVITE_OF = (u: Uid) => `forme:invite-of:${u}`;
const CATALOG_KEY = 'forme:mealdb:catalog';
const IMG_KEY = 'forme:off:img3';
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

// ── Catalogue de vraies photos de plats (TheMealDB, gratuit) — filtré halal ──
interface MealDb { id: string; name: string; fr?: string; ar?: string; cat: string; area: string; thumb: string; ing: string[] }
const CAT_FR: Record<string, string> = { Beef: 'Bœuf', Breakfast: 'Petit-déj', Chicken: 'Poulet', Dessert: 'Dessert', Goat: 'Chèvre', Lamb: 'Agneau', Miscellaneous: 'Divers', Pasta: 'Pâtes', Seafood: 'Poisson', Side: 'Accompagnement', Starter: 'Entrée', Vegan: 'Vegan', Vegetarian: 'Végétarien' };
const CAT_AR: Record<string, string> = { Beef: 'لحم بقر', Breakfast: 'فطور', Chicken: 'دجاج', Dessert: 'حلوى', Goat: 'ماعز', Lamb: 'لحم ضأن', Miscellaneous: 'متنوع', Pasta: 'معكرونة', Seafood: 'سمك', Side: 'طبق جانبي', Starter: 'مقبلات', Vegan: 'نباتي صرف', Vegetarian: 'نباتي' };
const AREA_FR: Record<string, string> = { American: 'américain', British: 'anglais', Canadian: 'canadien', Chinese: 'chinois', Croatian: 'croate', Dutch: 'néerlandais', Egyptian: 'égyptien', Filipino: 'philippin', French: 'français', Greek: 'grec', Indian: 'indien', Irish: 'irlandais', Italian: 'italien', Jamaican: 'jamaïcain', Japanese: 'japonais', Kenyan: 'kényan', Malaysian: 'malaisien', Mexican: 'mexicain', Moroccan: 'marocain', Polish: 'polonais', Portuguese: 'portugais', Russian: 'russe', Spanish: 'espagnol', Thai: 'thaï', Tunisian: 'tunisien', Turkish: 'turc', Ukrainian: 'ukrainien', Vietnamese: 'vietnamien', Algerian: 'algérien', Syrian: 'syrien', Saudi: 'saoudien', Norwegian: 'norvégien', Venezulan: 'vénézuélien', Argentinian: 'argentin', Australian: 'australien', Belgian: 'belge' };

/** Noms des plats traduits (une fois, Claude Haiku), gardés dans le catalogue. */
async function translateNames(meals: MealDb[], lang: Lang): Promise<boolean> {
  const todo = meals.filter(m => !m[lang]);
  let changed = false;
  for (let i = 0; i < todo.length; i += 120) {
    const part = todo.slice(i, i + 120);
    try {
      const res = await createAnthropic().messages.create({ model: 'claude-haiku-5-5', max_tokens: 8000,
        system: `Traduis ces noms de plats en ${lang === 'ar' ? 'arabe littéraire (فصحى)' : 'français'} naturel et appétissant (comme sur une carte de restaurant), courts. Réponds UNIQUEMENT par un objet JSON {"id":"nom traduit"}.`,
        messages: [{ role: 'user', content: JSON.stringify(Object.fromEntries(part.map(m => [m.id, m.name]))) }] });
      const j = jsonOf<Record<string, string>>(textOf(res));
      for (const m of part) if (j[m.id]) { m[lang] = String(j[m.id]).slice(0, 80); changed = true; }
    } catch { /* on garde l'anglais pour ce lot */ }
  }
  return changed;
}
const HARAM = /\b(pork|bacon|ham|lard|prosciutto|pancetta|chorizo|salami|pepperoni|gammon|wine|beer|brandy|rum|sherry|cider|vodka|whisk(e)?y|bourbon|gelatin|marsala|kirsch|cognac|liqueur|sake|mirin|stout|ale|port|madeira|grand marnier|amaretto|tequila|gin|black pudding|sausage)s?\b/i;

export async function mealCatalog(lang: Lang = 'fr'): Promise<MealDb[]> {
  const cached = await readJson<{ at: number; meals: MealDb[] } | null>(CATALOG_KEY, null);
  if (cached && Date.now() - cached.at < 30 * 86_400_000 && cached.meals.length > 50) {
    if (!cached.meals.some(m => m[lang]) && await translateNames(cached.meals, lang)) await kvSet(CATALOG_KEY, JSON.stringify(cached));
    return cached.meals;
  }
  const out: MealDb[] = [];
  for (const l of 'abcdefghijklmnopqrstuvwyz') {
    try {
      const r = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?f=${l}`, { signal: AbortSignal.timeout(10_000) });
      const j = await r.json() as { meals: Array<Record<string, string | null>> | null };
      for (const m of j.meals ?? []) {
        const ing = Array.from({ length: 20 }, (_, i) => (m[`strIngredient${i + 1}`] ?? '').trim()).filter(Boolean);
        if (m.strCategory === 'Pork' || ing.some(x => HARAM.test(x)) || HARAM.test(m.strMeal ?? '')) continue;
        out.push({ id: m.idMeal!, name: m.strMeal!, cat: m.strCategory ?? '', area: m.strArea ?? '', thumb: m.strMealThumb!, ing });
      }
    } catch { /* lettre suivante */ }
  }
  if (out.length > 50) {
    const old = new Map((cached?.meals ?? []).map(m => [m.id, m]));
    for (const m of out) { m.fr = old.get(m.id)?.fr; m.ar = old.get(m.id)?.ar; }
    await translateNames(out, lang);
    await kvSet(CATALOG_KEY, JSON.stringify({ at: Date.now(), meals: out }));
  }
  return out.length ? out : cached?.meals ?? [];
}

const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; } return b; };

/** Plats à « swiper » (onboarding « ça te tente ? ») — vraies photos, déjà halal. */
export async function swipeCandidates(n = 14, lang: Lang = 'fr'): Promise<Array<{ id: string; name: string; cat: string; area: string; photo: string }>> {
  const cat = (await mealCatalog(lang)).filter(m => !['Dessert', 'Goat', 'Miscellaneous'].includes(m.cat));
  const byCat = new Map<string, MealDb[]>();
  for (const m of shuffle(cat)) byCat.set(m.cat, [...(byCat.get(m.cat) ?? []), m]);
  const pick: MealDb[] = [];
  while (pick.length < n && [...byCat.values()].some(v => v.length)) for (const v of byCat.values()) { const m = v.shift(); if (m && pick.length < n) pick.push(m); }
  return pick.map(m => ({ id: m.id, name: m[lang] ?? m.fr ?? m.name, cat: (lang === 'ar' ? CAT_AR : CAT_FR)[m.cat] ?? m.cat, area: lang === 'ar' ? '' : AREA_FR[m.area] ?? m.area, photo: `${m.thumb}/medium` }));
}

function photoFor(cat: MealDb[], q: { mealDbId?: string; photoQuery?: string; title?: string }): { photo: string; id?: string } {
  const byId = q.mealDbId ? cat.find(m => m.id === String(q.mealDbId)) : undefined;
  if (byId) return { photo: byId.thumb, id: byId.id };
  const words = `${q.photoQuery ?? ''} ${q.title ?? ''}`.toLowerCase().split(/[^a-zà-ÿ]+/).filter(w => w.length > 3);
  let best: MealDb | undefined; let score = 0;
  for (const m of cat) {
    const hay = `${m.name} ${m.cat} ${m.ing.join(' ')}`.toLowerCase();
    const s = words.reduce((a, w) => a + (m.name.toLowerCase().includes(w) ? 3 : hay.includes(w) ? 1 : 0), 0);
    if (s > score) { score = s; best = m; }
  }
  const m = best ?? cat[Math.floor(Math.random() * cat.length)];
  return { photo: m?.thumb ?? '', id: m?.id };
}

// ── Vraies photos de produits belges (Open Food Facts) ──────────────────────
const STORE_BRANDS: Record<string, RegExp> = {
  Colruyt: /boni|everyday|colruyt/i, Delhaize: /delhaize|365/i, Aldi: /aldi|milsani|lacura|cucina|golden seed/i,
  Lidl: /lidl|milbona|pilos|vitasia|deluxe|chef select/i, Carrefour: /carrefour/i, 'Albert Heijn': /\bah\b|albert heijn/i,
};

export async function offSearch(q: string, store?: string, n = 8): Promise<Array<{ code: string; name: string; brand: string | null; img: string | null; stores: string[]; kcal: number | null; p: number | null }>> {
  // Article bilingue « اسم (nom français) » → on cherche la partie française
  q = /\(([^)]+)\)/.exec(q)?.[1] ?? q;
  const u = new URL('https://search.openfoodfacts.org/search');
  u.searchParams.set('q', `${q} countries_tags:"en:belgium"`);
  u.searchParams.set('langs', 'fr');
  u.searchParams.set('page_size', '24');
  u.searchParams.set('fields', 'code,product_name,brands,image_front_small_url,stores,nutriments');
  const r = await fetch(u, { signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'Dzaryx-Forme/1.0' } });
  const j = await r.json() as { hits?: Array<{ code: string; product_name?: string; brands?: string[] | string; image_front_small_url?: string; stores?: string[] | string; nutriments?: Record<string, number> }> };
  const rows = (j.hits ?? []).filter(h => h.product_name).map(h => {
    const brands = Array.isArray(h.brands) ? h.brands : h.brands ? [h.brands] : [];
    const stores = Array.isArray(h.stores) ? h.stores : h.stores ? [h.stores] : [];
    return { code: h.code, name: h.product_name!, brand: brands[0]?.trim() ?? null, img: h.image_front_small_url ?? null, stores,
      kcal: h.nutriments?.['energy-kcal_100g'] ?? null, p: h.nutriments?.['proteins_100g'] ?? null };
  }).filter(x => !HARAM.test(`${x.name}`) && !/porc|jambon|lardon|bière|vin |peperoni|salami|chorizo|saucisson|bacon/i.test(x.name));
  // Pertinence : le mot principal cherché (« pâtes », « lentilles »…) doit être dans le nom — mieux vaut pas de photo qu'une fausse
  const norm = (t: string) => t.toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = norm(q).split(/[^a-z]+/).filter(w => w.length > 3 && !/^(boni|everyday|selection|delhaize|milbona|nature|naturel|boite|boites|pack|halal|maigre|demi|frais|fraiche|surgele|surgeles)$/.test(w));
  const stem = (w: string) => w.replace(/(es|s|x)$/, '').slice(0, 6);
  const score = (name: string) => { const nn = norm(name); return words.reduce((a, w, i) => a + (nn.includes(stem(w)) ? (i === 0 ? 3 : 1) : 0), 0); };
  if (words.length) {
    const ok = rows.filter(x => score(x.name) >= 3).sort((a, b) => score(b.name) - score(a.name));
    rows.splice(0, rows.length, ...ok);
  }
  const rx = store ? STORE_BRANDS[store] : undefined;
  const inStore = (x: typeof rows[number]) => !!store && (x.stores.some(s => s.toLowerCase().includes(store.toLowerCase())) || (!!rx && !!x.brand && rx.test(x.brand)));
  return [...rows.filter(inStore), ...rows.filter(x => !inStore(x))].filter(x => x.img).slice(0, n);
}

export async function offBarcode(code: string) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=product_name,brands,image_front_small_url,nutriments,ingredients_text_fr,ingredients_text,labels_tags,quantity,serving_size`, { signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'Dzaryx-Forme/1.0' } });
  const j = await r.json() as { status?: number; product?: { product_name?: string; brands?: string; image_front_small_url?: string; nutriments?: Record<string, number>; ingredients_text_fr?: string; ingredients_text?: string; labels_tags?: string[]; quantity?: string; serving_size?: string } };
  if (!j.product?.product_name) return null;
  const p = j.product, n0 = p.nutriments ?? {};
  const n = new Proxy(n0, { get: (o, k: string) => o[k] ?? o[k.replace('_100g', '_prepared_100g')] }) as Record<string, number>;
  const ingr = `${p.ingredients_text_fr ?? p.ingredients_text ?? ''}`;
  const haram = /porc|lard|jambon|gélatine(?! (de bœuf|de poisson|bovine|halal))|alcool|vin\b|bière|rhum|e120|carmin|e441|e542/i.test(`${ingr} ${p.product_name}`);
  return {
    code, name: p.product_name, brand: p.brands ?? null, img: p.image_front_small_url ?? null, quantity: p.quantity ?? null, serving: p.serving_size ?? null,
    per100: { kcal: n['energy-kcal_100g'] ?? null, p: n['proteins_100g'] ?? null, c: n['carbohydrates_100g'] ?? null, f: n['fat_100g'] ?? null, sugar: n['sugars_100g'] ?? null, fiber: n['fiber_100g'] ?? null },
    halal: (p.labels_tags ?? []).some(l => /halal/.test(l)) ? 'certifié halal' : haram ? 'NON halal (ingrédient interdit détecté)' : 'pas d\'ingrédient interdit détecté — vérifie le logo halal pour la viande',
    haram,
  };
}

// Photo d'un article : vrai paquet belge (Open Food Facts) pour l'épicerie ; belle photo (Pexels) pour la viande
// de la boucherie, les fruits/légumes et ce qu'Open Food Facts ne connaît pas. « carottes, oignons, ail » → carottes.
const imgQuery = (name: string) => (/\(([^)]+)\)/.exec(name)?.[1] ?? name).split(/[,+&]| et /)[0]!.replace(/\b(halal|surgel[ée]s?|frais|fra[iî]che?s?|bio|nature|en conserve|en boîte)\b/gi, '').replace(/\s+/g, ' ').trim();
async function pexelsImage(q: string): Promise<string | null> {
  const key = env.PEXELS_API_KEY; if (!key || !q) return null;
  const u = new URL('https://api.pexels.com/v1/search'); u.searchParams.set('query', q); u.searchParams.set('per_page', '3'); u.searchParams.set('locale', 'fr-FR'); u.searchParams.set('orientation', 'square');
  const r = await fetch(u, { headers: { Authorization: key }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return null;
  const j = await r.json() as { photos?: Array<{ src?: { small?: string; tiny?: string } }> };
  return j.photos?.[0]?.src?.small ?? null;
}
async function productImages(items: ShopItem[], stores: string[]): Promise<void> {
  const cache = await readJson<Record<string, { img: string | null; brand: string | null }>>(IMG_KEY, {});
  const todo = items.filter(i => !i.img);
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const it = todo[i++]!;
      const k = `${it.store}|${it.name.toLowerCase()}`;
      if (!cache[k]) {
        const q = imgQuery(it.name); const fresh = /boucherie/i.test(it.store) || /fruits|légumes/i.test(it.aisle);
        const hit = fresh ? null : (await offSearch(q, it.store || stores[0], 1).catch(() => []))[0];
        const img = hit?.img ?? await pexelsImage(/boucherie/i.test(it.store) ? `${q} viande crue` : q).catch(() => null);
        cache[k] = { img, brand: hit?.brand ?? null };
      }
      it.img = cache[k]!.img; it.brand = cache[k]!.brand;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const keys = Object.keys(cache);
  await kvSet(IMG_KEY, JSON.stringify(Object.fromEntries(keys.slice(-800).map(k => [k, cache[k]])))).catch(() => {});
}

// ── Plan de la semaine (Claude) ──────────────────────────────────────────────
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

const rules = (p: FormeProfile) => `RÈGLES ABSOLUES :
- HALAL STRICT (musulman·e) : jamais de porc ni dérivés (lardons, jambon, chorizo, gélatine de porc), jamais d'alcool (même en cuisson : pas de vin, bière, mirin). Toute viande/volaille = « halal » dans le nom (ex. « blanc de poulet halal ») et achetée à la boucherie halal ou au rayon halal. Poisson, œufs, légumineuses OK.
${p.wegovy.on ? '- WEGOVY (sémaglutide, GLP-1) : appétit réduit et risque de nausées → petites portions denses en protéines, repas pas trop gras ni frits, peu de sucres rapides, beaucoup d\'eau, des fibres (légumes, légumineuses) contre la constipation, manger lentement, s\'arrêter dès qu\'il n\'y a plus faim. Jamais sauter les protéines (garder le muscle). Tu ne parles JAMAIS de dose ni de changer le traitement (c\'est le médecin).\n' : ''}- BELGIQUE : produits et rayons des magasins belges choisis, prix réalistes en euros en Belgique (2026), marques distributeur quand c'est moins cher (Boni chez Colruyt, 365 chez Delhaize, Milbona chez Lidl…).
- ${p.sex === 'h' ? 'Il fait de la muscu avec un dos à ménager.' : 'Elle fait du sport (renforcement + cardio).'} Cuisine simple, 30 min max en semaine, batch cooking bienvenu.${LANG_RULE(p.lang)}`;

const planSystem = (p: FormeProfile) => `Tu es le nutritionniste personnel de ${p.name || (p.sex === 'h' ? 'Kouider' : 'sa femme')} (Bruxelles). Tu composes SA semaine de repas et SA liste de courses.
${rules(p)}
Réponds UNIQUEMENT par un objet JSON valide (aucun texte autour, pas de \`\`\`) :
{"note":"une phrase motivante sur la semaine (≤ 140 car.)",
 "recipes":[{"id":"r1","title":"titre appétissant","mealDbId":"id du catalogue si un plat proche existe, sinon null","photoQuery":"2-4 mots EN pour trouver une photo","minutes":25,"kcal":520,"p":45,"c":40,"f":15,"tags":["riche en protéines","doux pour l'estomac"],"ingredients":[{"name":"blanc de poulet halal","qty":"150 g"}],"steps":["étape courte",...],"tip":"astuce Wegovy/prépa (≤ 120 car.)"}],
 "days":[{"date":"AAAA-MM-JJ","meals":[{"slot":"petit-déj|déjeuner|collation|dîner","recipe":"r1","portion":"1 part"}]}],
 "shopping":[{"name":"produit tel qu'en rayon","fr":"nom FRANÇAIS court et générique (ex. skyr nature, blanc de poulet halal)","qty":"600 g","aisle":"Fruits & légumes|Boucherie halal|Crèmerie|Épicerie|Surgelés|Boulangerie|Boissons","store":"un des magasins choisis","price":3.49,"halal":true}]}
Le champ "slot" et "aisle" restent TOUJOURS en français (valeurs ci-dessus). Contraintes : TOUS LES REPAS DIFFÉRENTS (Kouider 25/10) — jamais deux fois la même recette dans la journée NI dans la semaine : une recette = UN seul repas, donc autant de recettes que de repas de la semaine (ex. 7 jours × 3 repas = 21 recettes), chacune référencée UNE seule fois dans "days". Varie les protéines (poulet, bœuf, agneau, poisson, œufs, légumineuses) et les cuisines (algérienne, méditerranéenne, belge, orientale…). VIANDE : varie aussi les MORCEAUX — au maximum UNE recette à base de viande hachée (kefta, boulettes, kebab) par semaine ; le reste en morceaux entiers : escalopes/filets de poulet ou de dinde, cuisses et pilons, gigot ou épaule d'agneau en morceaux, côtelettes, brochettes, bœuf en cubes pour tajine, steak. Courses : noms génériques AU SINGULIER (« cuisse de poulet halal », pas « cuisses »), un article par produit (pas de lots « carottes, oignons, ail »). Pour rester court : 4 à 8 ingrédients et 3 à 4 étapes courtes par recette. ${p.wegovy.on ? 'Sous Wegovy pas de grosse assiette — ≤ 600 kcal par repas ; si la cible du jour ne rentre pas, ajoute une collation protéinée (elle aussi différente chaque jour). ' : ''}Chaque jour = le nombre de repas demandé, macros de la journée proches des cibles (protéines atteintes en priorité), total des courses ≤ budget, prix = prix unitaire estimé en € du paquet acheté. Viande → store "Boucherie halal" si le magasin n'a pas de halal sûr.`;

export async function generateWeek(uid: Uid = 'kouider', monday = localNow().date, force = false, wishes?: string): Promise<WeekPlan> {
  const existing = await readJson<WeekPlan | null>(WEEK_K(uid, monday), null);
  if (existing && !force) return existing;
  // « Cette semaine j'ai envie de… » : gardé sur la semaine (undefined = on reprend les envies déjà dites)
  const wish = (wishes ?? existing?.wishes ?? '').trim().slice(0, 500);
  const p = await getFormeProfile(uid);
  const cat = await mealCatalog(p.lang);
  const t = formeTargets(p);
  const nm = (m: MealDb) => m.fr ?? m.name;
  const liked = cat.filter(m => p.likes.includes(m.id)).map(nm);
  const disliked = cat.filter(m => p.dislikes.includes(m.id)).map(nm);
  const catalogLines = shuffle(cat).slice(0, 140).map(m => `${m.id} ${m.name} (${m.cat}, ${m.area})`).join('\n');
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const user = [
    `SEMAINE : ${dates.join(', ')}`,
    `OBJECTIF : ${p.goal === 'perte' ? 'perdre du poids en gardant le muscle' : p.goal === 'muscle' ? 'prendre du muscle' : 'perdre du gras et se muscler (recomposition)'} — ${p.sex === 'h' ? 'homme' : 'femme'}, ${p.weightKg} kg → ${p.targetKg} kg, ${p.age} ans, ${p.heightCm} cm, ${p.sessionsPerWeek} séances/semaine.`,
    `CIBLES PAR JOUR : ${t.kcal} kcal · protéines ${t.p} g · glucides ${t.c} g · lipides ${t.f} g · fibres ${t.fiber} g.`,
    `REPAS PAR JOUR : ${p.mealsPerDay} (${p.mealsPerDay <= 2 ? 'déjeuner + dîner' : p.mealsPerDay === 3 ? 'petit-déj + déjeuner + dîner' : 'petit-déj + déjeuner + collation + dîner'}).`,
    `MAGASINS : ${p.stores.join(', ')} · BUDGET COURSES : ${p.budgetWeek} € / semaine.`,
    p.vegetarian ? 'Végétarien.' : '',
    p.fasting === 'ramadan' ? 'RAMADAN : jeûne de l\'aube au coucher du soleil → chaque jour = « s\'hour » (avant l\'aube : protéines + fibres + eau, sucres lents) et « iftar » (dattes + eau + soupe/chorba puis plat léger riche en protéines) + éventuellement une collation le soir ; utilise slot « petit-déj » pour le s\'hour et « dîner » pour l\'iftar.' : p.fasting === 'sunna' ? 'Jeûne surérogatoire le LUNDI et le JEUDI : ces jours-là seulement s\'hour (slot petit-déj) + iftar (slot dîner).' : '',
    p.wegovy.on ? `Traitement Wegovy en cours (injection le ${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][p.wegovy.day]}) : le lendemain de l'injection, repas encore plus légers et doux.` : '',
    liked.length ? `A AIMÉ (swipe) : ${liked.join(', ')}` : '',
    disliked.length ? `N'AIME PAS : ${disliked.join(', ')}` : '',
    wish ? `ENVIES DE LA SEMAINE (dites par ${p.name || 'la personne'}, PRIORITÉ sur tout le reste sauf halal/santé) : « ${wish} » — place ces plats/ingrédients dans la semaine (jours précis s'ils sont donnés) et adapte les courses en conséquence.` : '',
    p.favorites.length ? `RECETTES ADORÉES (❤️) — reprends-en 2 ou 3 cette semaine, pas plus : ${shuffle(p.favorites).slice(0, 8).join(' ; ')}` : '',
    `CATALOGUE PHOTOS (id nom) — choisis mealDbId parmi eux quand le plat ressemble :\n${catalogLines}`,
  ].filter(Boolean).join('\n');
  // 21 à 28 recettes différentes : longue réponse → en streaming (le SDK refuse sinon)
  const res = await createAnthropic().messages.stream({ model: 'claude-sonnet-5-5', max_tokens: 32_000, system: planSystem(p), messages: [{ role: 'user', content: user }] }, QUALITY).finalMessage();
  const j = jsonOf<{ note?: string; recipes?: Array<Partial<Recipe> & { photoQuery?: string; mealDbId?: string | null }>; days?: WeekPlan['days']; shopping?: Array<ShopItem & { fr?: string }> }>(textOf(res));
  const recipes: Recipe[] = (j.recipes ?? []).filter(r => r.id && r.title).map(r => {
    const ph = photoFor(cat, { mealDbId: r.mealDbId ?? undefined, photoQuery: r.photoQuery, title: r.title });
    const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
    return { id: String(r.id), title: String(r.title).slice(0, 90), photo: ph.photo, mealDbId: ph.id, minutes: n(r.minutes) || 20,
      kcal: n(r.kcal), p: n(r.p), c: n(r.c), f: n(r.f), tags: (r.tags ?? []).map(String).slice(0, 4),
      ingredients: (r.ingredients ?? []).slice(0, 16).map(x => ({ name: String(x.name), qty: String(x.qty ?? '') })),
      steps: (r.steps ?? []).map(String).slice(0, 8), tip: String(r.tip ?? '').slice(0, 160) };
  });
  const ids = new Set(recipes.map(r => r.id));
  const days = dates.map(d => ({ date: d, meals: ((j.days ?? []).find(x => x.date === d)?.meals ?? []).filter(m => ids.has(m.recipe)).map(m => ({ slot: String(m.slot), recipe: m.recipe, portion: String(m.portion ?? '1 part') })) }));
  // Jamais deux fois le même repas : un doublon prend une recette pas encore servie
  const seen = new Set<string>();
  const spare = recipes.map(r => r.id).filter(id => !days.some(d => d.meals.some(m => m.recipe === id)));
  const dupSlots: Array<{ date: string; slot: string; m: { recipe: string } }> = [];
  for (const d of days) for (const m of d.meals) {
    if (seen.has(m.recipe)) { if (spare.length) m.recipe = spare.shift()!; else dupSlots.push({ date: d.date, slot: m.slot, m }); }
    seen.add(m.recipe);
  }
  // Pas assez de recettes : on en redemande juste pour les repas en double (jamais 2 fois le même plat)
  if (dupSlots.length) {
    const more = await createAnthropic().messages.stream({ model: 'claude-sonnet-5-5', max_tokens: 16_000,
      system: `Tu complètes une semaine de repas. ${rules(p)}\nCrée EXACTEMENT ${dupSlots.length} recettes NOUVELLES, toutes différentes entre elles et de celles déjà prévues. Réponds UNIQUEMENT en JSON : {"recipes":[{"slot":"…","title","photoQuery","minutes","kcal","p","c","f","tags":[],"ingredients":[{"name","qty"}],"steps":[],"tip"}]} dans l'ordre des repas demandés (4 à 8 ingrédients, 3 à 4 étapes).`,
      messages: [{ role: 'user', content: `Repas à remplir : ${dupSlots.map(x => `${x.date} ${x.slot}`).join(' ; ')}.\nDéjà prévues (interdit de les refaire) : ${recipes.map(r => r.title).join(' ; ')}.\nCibles/jour : ${t.kcal} kcal, ${t.p} g protéines.` }] }, QUALITY).finalMessage();
    const extra = jsonOf<{ recipes?: Array<Partial<Recipe> & { photoQuery?: string }> }>(textOf(more)).recipes ?? [];
    const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
    dupSlots.forEach((slot, i) => {
      const r = extra[i]; if (!r?.title) return;
      const ph = photoFor(cat, { photoQuery: r.photoQuery, title: r.title });
      const id = `x${i + 1}`;
      recipes.push({ id, title: String(r.title).slice(0, 90), photo: ph.photo, mealDbId: ph.id, minutes: n(r.minutes) || 20, kcal: n(r.kcal), p: n(r.p), c: n(r.c), f: n(r.f),
        tags: (r.tags ?? []).map(String).slice(0, 4), ingredients: (r.ingredients ?? []).slice(0, 16).map(x => ({ name: String(x.name), qty: String(x.qty ?? '') })), steps: (r.steps ?? []).map(String).slice(0, 8), tip: String(r.tip ?? '').slice(0, 160) });
      slot.m.recipe = id;
    });
  }
  // name = nom français (sert à fusionner les deux listes du foyer) ; label = nom affiché dans sa langue
  const shopping: ShopItem[] = (j.shopping ?? []).filter(s => s.name).slice(0, 60).map(s => ({
    name: String(s.fr || s.name).slice(0, 80), label: p.lang === 'ar' ? String(s.name).slice(0, 100) : undefined, qty: String(s.qty ?? ''), aisle: String(s.aisle ?? 'Épicerie'), store: String(s.store ?? p.stores[0]),
    price: Math.round((Number(s.price) || 0) * 100) / 100, halal: !!s.halal,
  }));
  await productImages(shopping, p.stores).catch(() => {});
  const plan: WeekPlan = { monday, at: Date.now(), note: String(j.note ?? '').slice(0, 160), budget: p.budgetWeek, ...(wish ? { wishes: wish } : {}),
    total: Math.round(shopping.reduce((a, s) => a + s.price, 0) * 100) / 100, recipes, days, shopping };
  await kvSet(WEEK_K(uid, monday), JSON.stringify(plan), 60 * 86_400);
  // Un plan refait au milieu d'un autre le remplace à partir de sa date de début
  const starts = (await planStarts(uid)).filter(s => s < addDays(monday, -6) || s > monday || s === monday);
  await kvSet(WEEKS_K(uid), JSON.stringify([...new Set([...starts.filter(s => s >= addDays(monday, -60)), monday])].sort()));
  return plan;
}

export async function getWeek(uid: Uid = 'kouider', start?: string): Promise<WeekPlan | null> {
  const s = start || await currentStart(uid);
  return s ? readJson<WeekPlan | null>(WEEK_K(uid, s), null) : null;
}
async function saveWeek(uid: Uid, w: WeekPlan) { await kvSet(WEEK_K(uid, w.monday), JSON.stringify(w), 60 * 86_400); }

// ── Favoris ❤️ : la recette entière est gardée (photo, ingrédients, étapes, macros) ──
export interface FavRecipe extends Recipe { savedAt: number }
export async function favRecipes(uid: Uid): Promise<FavRecipe[]> { return readJson<FavRecipe[]>(FAV_K(uid), []); }
export async function toggleFavorite(uid: Uid, recipe: Recipe, on: boolean): Promise<FavRecipe[]> {
  const list = (await favRecipes(uid)).filter(f => f.title !== recipe.title);
  if (on) list.unshift({ ...recipe, id: `fav-${Date.now().toString(36)}`, savedAt: Date.now() });
  await kvSet(FAV_K(uid), JSON.stringify(list.slice(0, 80)));
  const p = await getFormeProfile(uid);
  await setFormeProfile({ favorites: on ? [...new Set([...p.favorites, recipe.title])] : p.favorites.filter(t => t !== recipe.title) }, uid);
  return list;
}
/** Remettre un favori dans la semaine (jour + repas choisis) : il remplace le plat prévu, le reste ne bouge pas. */
export async function placeFavorite(uid: Uid, title: string, date: string, slot: string): Promise<WeekPlan | null> {
  const w = await getWeek(uid);
  const fav = (await favRecipes(uid)).find(f => f.title === title);
  if (!w || !fav) return w;
  const day = w.days.find(d => d.date === date);
  if (!day) throw new Error('ce jour n\'est pas dans la semaine en cours');
  const id = `f${Date.now().toString(36)}`;
  w.recipes.push({ ...fav, id });
  const m = day.meals.find(x => x.slot === slot);
  if (m) m.recipe = id; else day.meals.push({ slot, recipe: id, portion: '1 part' });
  await saveWeek(uid, w);
  return w;
}

// ── Courses du FOYER : les deux listes fusionnées, cases communes ───────────
// Clé de fusion : « cuisses de poulet halal » = « cuisse de poulet halal », « viande hachée de bœuf » = « bœuf haché »,
// « à braiser » = « à mijoter », « pois chiches en conserve » = « pois chiches » (le magasin n'entre pas en compte).
const SHOP_STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'en', 'et', 'd', 'l', 'halal', 'viande']);
const SHOP_SYN: Record<string, string> = { braiser: 'mijoter', ragout: 'mijoter', tajine: 'mijoter', bourguignon: 'mijoter', hachee: 'hache', blanc: 'filet', escalope: 'filet', aiguillette: 'filet', pilon: 'cuisse', haut: 'cuisse' };
const SHOP_VARIANT = new Set(['conserve', 'boite', 'nature', 'surgele', 'demi', 'ecreme', 'entier', 'bio', 'sec', 'cuit']);
const shopStem = (w: string) => w.length > 3 ? w.replace(/(es|s|x)$/, '').replace(/e+$/, '') : w;
const SHOP_SYN_S = Object.fromEntries(Object.entries(SHOP_SYN).map(([k, v]) => [shopStem(k), shopStem(v)]));
const SHOP_VARIANT_S = new Set([...SHOP_VARIANT].map(shopStem));
const shopTokens = (name: string) => (/\(([^)]+)\)/.exec(name)?.[1] ?? name).toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
  .filter(w => w && !SHOP_STOP.has(w)).map(shopStem).map(w => SHOP_SYN_S[w] ?? w);
const shopKey = (s: Pick<ShopItem, 'name' | 'store'>) => [...new Set(shopTokens(s.name))].sort().join(' ');
/** Même article à une variante près (« lait » / « lait demi-écrémé ») ? */
function sameItem(a: string, b: string) {
  const A = new Set(shopTokens(a).filter(w => !SHOP_VARIANT_S.has(w))), B = new Set(shopTokens(b).filter(w => !SHOP_VARIANT_S.has(w)));
  if (!A.size || !B.size) return false;
  return [...A].every(w => B.has(w)) && [...B].every(w => A.has(w));
}
export interface HouseItem extends ShopItem { key: string; who: Array<{ uid: Uid; name: string; qty: string }>; by?: string; at?: number }

export async function householdShopping(uid: Uid): Promise<{ items: HouseItem[]; total: number; budget: number; shared: boolean }> {
  const [checks, femmeOn] = await Promise.all([readJson<Record<string, { by: string; at: number }>>(CHECKS_KEY, {}), inviteActive('femme')]);
  const users: Uid[] = femmeOn || uid === 'femme' ? ['kouider', 'femme'] : ['kouider'];
  const map = new Map<string, HouseItem>();
  let budget = 0;
  for (const u of users) {
    const [w, p] = await Promise.all([getWeek(u), getFormeProfile(u)]);
    if (!w) continue;
    budget += w.budget;
    for (const s of w.shopping) {
      let key = shopKey(s);
      if (!map.has(key)) for (const [k, it] of map) if (sameItem(it.name, s.name)) { key = k; break; }
      const who = { uid: u, name: p.name || (u === 'kouider' ? 'Kouider' : 'Elle'), qty: s.qty };
      const cur = map.get(key);
      if (cur) { cur.who.push(who); cur.price = Math.round((cur.price + s.price) * 100) / 100; if (u === uid && s.label) cur.label = s.label; }
      else map.set(key, { ...s, label: u === uid ? s.label : undefined, key, who: [who] });
    }
  }
  for (const e of await readJson<Array<ShopItem & { by: string; at: number }>>(EXTRA_KEY, [])) {
    const key = `extra|${e.at}`;
    map.set(key, { ...e, key, who: [{ uid: 'kouider', name: e.by, qty: e.qty }], aisle: 'Ajouté à la main' });
  }
  // Photos manquantes (listes déjà générées) : complétées et gardées en cache
  const missing = [...map.values()].filter(i => !i.img);
  if (missing.length) await Promise.race([productImages(missing, ['Colruyt']).catch(() => {}), new Promise(r => setTimeout(r, 8000))]);
  const items = [...map.values()].map(i => ({ ...i, checked: !!checks[i.key], by: checks[i.key]?.by, at: checks[i.key]?.at }));
  return { items, total: Math.round(items.reduce((a, i) => a + i.price, 0) * 100) / 100, budget, shared: users.length > 1 };
}

export async function checkHouseItem(uid: Uid, key: string, checked: boolean, home = false): Promise<void> {
  const checks = await readJson<Record<string, { by: string; at: number }>>(CHECKS_KEY, {});
  if (checked) checks[key] = { by: home ? '🏠' : (await getFormeProfile(uid)).name || uid, at: Date.now() }; else delete checks[key];
  // On garde 3 semaines de cases (les listes changent chaque semaine)
  const old = Date.now() - 21 * 86_400_000;
  await kvSet(CHECKS_KEY, JSON.stringify(Object.fromEntries(Object.entries(checks).filter(([, v]) => v.at > old))));
}
export async function addHouseItem(uid: Uid, o: { name: string; qty?: string; store?: string }): Promise<void> {
  const list = await readJson<Array<ShopItem & { by: string; at: number }>>(EXTRA_KEY, []);
  list.push({ name: o.name.slice(0, 80), qty: String(o.qty ?? '').slice(0, 30), store: String(o.store || 'Colruyt').slice(0, 30), aisle: 'Ajouté à la main', price: 0, by: (await getFormeProfile(uid)).name || uid, at: Date.now() });
  await kvSet(EXTRA_KEY, JSON.stringify(list.slice(-60)));
}
export async function removeHouseItem(key: string): Promise<void> {
  const at = Number(key.split('|')[1]);
  await kvSet(EXTRA_KEY, JSON.stringify((await readJson<Array<{ at: number }>>(EXTRA_KEY, [])).filter(e => e.at !== at)));
}

/** Nouvelle semaine de courses : on décoche ce qui avait été coché avant aujourd'hui. */
async function resetChecksBefore(ts: number) {
  const checks = await readJson<Record<string, { by: string; at: number }>>(CHECKS_KEY, {});
  await kvSet(CHECKS_KEY, JSON.stringify(Object.fromEntries(Object.entries(checks).filter(([, v]) => v.at >= ts))));
  const extra = await readJson<Array<{ at: number }>>(EXTRA_KEY, []);
  await kvSet(EXTRA_KEY, JSON.stringify(extra.filter(e => !checks[`extra|${e.at}`])));   // articles à la main déjà achetés → retirés
}

/** Remplace une recette de la semaine par une autre aux macros proches (Claude). */
export async function swapRecipe(uid: Uid, monday: string, recipeId: string, wish = ''): Promise<WeekPlan | null> {
  const w = await getWeek(uid, monday || undefined);
  const old = w?.recipes.find(r => r.id === recipeId);
  if (!w || !old) return w;
  const p = await getFormeProfile(uid);
  const cat = await mealCatalog(p.lang);
  // La liste de courses suit (Kouider 26/10) : on ajoute ce qui manque pour la nouvelle recette et on retire ce qui ne servait qu'à l'ancienne
  const others = w.recipes.filter(r => r.id !== old.id).map(r => r.ingredients.map(x => x.name).join(', ')).join(' | ');
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 2500,
    system: `Tu remplaces UNE recette par une autre aux macros proches (±10 %). ${rules(p)}
Réponds UNIQUEMENT en JSON : {"recipe":{"title","mealDbId","photoQuery","minutes","kcal","p","c","f","tags":[],"ingredients":[{"name","qty"}],"steps":[],"tip"},
"add":[{"name":"produit tel qu'en rayon","fr":"nom FRANÇAIS court générique au singulier","qty":"…","aisle":"Fruits & légumes|Boucherie halal|Crèmerie|Épicerie|Surgelés|Boulangerie|Boissons","store":"un de : ${p.stores.join(', ')}","price":2.5,"halal":true}],
"remove":["nom EXACT d'un article de la liste qui ne sert plus à AUCUNE autre recette de la semaine"]}
"add" = seulement les ingrédients de la nouvelle recette absents de la liste actuelle ; "remove" = seulement ce qui ne servait qu'à l'ancienne recette.`,
    messages: [{ role: 'user', content: `À remplacer : ${old.title} (${old.kcal} kcal, P${old.p} C${old.c} L${old.f}) — ingrédients : ${old.ingredients.map(x => x.name).join(', ')}.${wish ? ` Envie : ${wish}.` : ''}${w.wishes ? ` Envies de la semaine : ${w.wishes}.` : ''}
Déjà dans la semaine (ne pas refaire) : ${w.recipes.map(r => r.title).join(' ; ')}.
Ingrédients des AUTRES recettes : ${others}
Liste de courses actuelle : ${w.shopping.map(x => x.name).join(' ; ')}
Catalogue photos : ${shuffle(cat).slice(0, 60).map(m => `${m.id} ${m.name}`).join(' | ')}` }] }, QUALITY);
  const out = jsonOf<{ recipe?: Partial<Recipe> & { photoQuery?: string; mealDbId?: string }; add?: Array<ShopItem & { fr?: string }>; remove?: string[] } & Partial<Recipe>>(textOf(res));
  const r = out.recipe ?? (out as Partial<Recipe> & { photoQuery?: string; mealDbId?: string });
  if (!r.title) throw new Error('pas de nouvelle recette, réessaie');
  const ph = photoFor(cat, { mealDbId: r.mealDbId, photoQuery: r.photoQuery, title: r.title });
  const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  Object.assign(old, { title: String(r.title ?? old.title).slice(0, 90), photo: ph.photo, mealDbId: ph.id, minutes: n(r.minutes) || old.minutes,
    kcal: n(r.kcal) || old.kcal, p: n(r.p), c: n(r.c), f: n(r.f), tags: (r.tags ?? []).map(String).slice(0, 4),
    ingredients: (r.ingredients ?? []).slice(0, 16).map(x => ({ name: String(x.name), qty: String(x.qty ?? '') })), steps: (r.steps ?? []).map(String).slice(0, 8), tip: String(r.tip ?? '').slice(0, 160) });
  const drop = new Set((out.remove ?? []).map(x => String(x).toLowerCase()));
  w.shopping = w.shopping.filter(x => !drop.has(x.name.toLowerCase()));
  const add: ShopItem[] = (out.add ?? []).filter(x => x.name && !w.shopping.some(y => sameItem(y.name, String(x.fr || x.name)))).slice(0, 10).map(x => ({
    name: String(x.fr || x.name).slice(0, 80), label: p.lang === 'ar' ? String(x.name).slice(0, 100) : undefined, qty: String(x.qty ?? ''), aisle: String(x.aisle ?? 'Épicerie'),
    store: String(x.store ?? p.stores[0]), price: Math.round((Number(x.price) || 0) * 100) / 100, halal: !!x.halal }));
  await productImages(add, p.stores).catch(() => {});
  w.shopping.push(...add);
  w.total = Math.round(w.shopping.reduce((a, x) => a + x.price, 0) * 100) / 100;
  await saveWeek(uid, w);
  return w;
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

// ── AGENDA dans l'app (7 jours) : sport, repas, injection, rappels, repos — sa femme n'a pas Google Agenda ──
export async function formeAgenda(uid: Uid) {
  const today = localNow().date;
  const [p, week, days] = await Promise.all([getFormeProfile(uid), getWeek(uid), readDays(uid)]);
  const inj = nextInjection(p, days);
  let sport: Record<string, { label: string; time?: string; custom?: string; done: boolean } | null> = {};
  if (uid === 'kouider') {
    const so = await (await import('./sport-coach.js')).sportOverview().catch(() => null);
    for (const w of so?.week ?? []) if (w.type && !w.skip) sport[w.date] = { label: `${w.emoji ?? '🏋️'} ${w.label}`, time: w.start ? new Date(w.start).toLocaleTimeString('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }) : undefined, done: w.status === 'done' };
    for (const x of [so?.today, so?.next]) if (x && sport[x.date] && (x as { custom?: string }).custom) sport[x.date]!.custom = (x as { custom?: string }).custom;
  } else {
    const [prog, custom] = await Promise.all([getProgram(uid), readJson<{ session: ProgSession; why: string; at: number; date?: string } | null>(CUSTOM_K(uid), null)]);
    const ov = await programOverview(uid);
    let k = ov.session?.index ?? 0;
    sport = {};
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i), wd = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (!prog.days.includes(wd)) continue;
      const done = !!days[d]?.workout;
      const isCustom = !!custom && custom.date === d && !done;
      const s = isCustom ? custom!.session : prog.sessions[k % Math.max(1, prog.sessions.length)];
      sport[d] = s ? { label: `${s.emoji} ${s.label}`, done, ...(isCustom ? { custom: custom!.why } : {}) } : null;
      if (!done) k++;
    }
  }
  return Array.from({ length: 7 }, (_, i) => addDays(today, i)).map(d => {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    const meals = (week?.days.find(x => x.date === d)?.meals ?? []).map(m => ({ slot: m.slot, title: week!.recipes.find(r => r.id === m.recipe)?.title ?? '', key: `${m.recipe}:${m.slot}`, eaten: !!days[d]?.meals[`${m.recipe}:${m.slot}`] }));
    return {
      date: d, rest: p.restDays.includes(wd) && !sport[d], sport: sport[d] ?? null, meals,
      injection: p.wegovy.on && inj?.date === d ? { hour: p.wegovy.hour, site: inj.site, done: !!days[d]?.injection } : null,
      reminders: p.reminders.filter(x => x.days.includes(wd)).map(x => ({ time: x.time, label: x.label })),
      fasting: p.fasting === 'ramadan' || (p.fasting === 'sunna' && (wd === 1 || wd === 4)),
    };
  });
}

/** Défi de la semaine (change chaque lundi) + progression d'après les 7 derniers jours. */
function weekChallenge(p: FormeProfile, week7: Array<{ p: number; water: number; steps: number | null; sleep: number | null }>, t: { p: number }) {
  const all = [
    { id: 'water', e: '💧', text: `Boire ${p.waterGoal} verres d'eau 5 jours`, goal: 5, got: week7.filter(d => d.water >= p.waterGoal).length },
    { id: 'protein', e: '🥩', text: `Atteindre ${t.p} g de protéines 4 jours`, goal: 4, got: week7.filter(d => d.p >= t.p).length },
    { id: 'steps', e: '🚶', text: `${p.stepsGoal.toLocaleString('fr-BE')} pas 4 jours`, goal: 4, got: week7.filter(d => (d.steps ?? 0) >= p.stepsGoal).length },
    { id: 'sleep', e: '😴', text: 'Dormir 7 h ou plus 4 nuits', goal: 4, got: week7.filter(d => (d.sleep ?? 0) >= 7).length },
  ];
  const wk = Math.floor(Date.parse(localNow().date) / 604_800_000);
  return all[wk % all.length]!;
}

// ── Vision : photo d'assiette → macros ; photos du corps → évolution entourée ─
type Img = { media: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };
export function parseImage(dataUrl: string): Img {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) throw new Error('image invalide');
  if (m[2]!.length > 9_000_000) throw new Error('photo trop lourde');
  return { media: m[1] as Img['media'], data: m[2]! };
}
const imgBlock = (i: Img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.media, data: i.data } });

export async function analyzeMealPhoto(img: Img, uid: Uid = 'kouider'): Promise<FoodItem & { items: string[]; advice: string; halalNote: string }> {
  const p = await getFormeProfile(uid);
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 700,
    system: `Tu estimes les calories et macros d'une assiette en photo (personne ${p.wegovy.on ? 'sous Wegovy, ' : ''}halal, sport). Réponds UNIQUEMENT en JSON : {"name":"nom court","items":["aliment + grammes estimés"],"kcal":0,"p":0,"c":0,"f":0,"advice":"1 conseil court (≤ 140 car.)","halalNote":"vide, ou un doute halal visible (ex. charcuterie, sauce au vin)"}${LANG_RULE(p.lang)}`,
    messages: [{ role: 'user', content: [imgBlock(img), { type: 'text', text: 'Estime cette assiette.' }] }] }, QUALITY);
  const j = jsonOf<Record<string, unknown>>(textOf(res));
  const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  return { name: String(j.name ?? 'Repas').slice(0, 60), kcal: n(j.kcal), p: n(j.p), c: n(j.c), f: n(j.f), items: (j.items as string[] ?? []).map(String).slice(0, 8), advice: String(j.advice ?? '').slice(0, 200), halalNote: String(j.halalNote ?? '').slice(0, 160), src: 'photo' };
}

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
        system: 'Traduis ces textes d\'une application de nutrition et de sport (repas halal, exercices, conseils, courses en Belgique) du français vers l\'ARABE LITTÉRAIRE MODERNE (فصحى), simple et naturel ; l\'utilisatrice est une femme (féminin). Garde tels quels : emojis, nombres, unités (kg, g, kcal, cm, min, €, mg), noms de marques et de magasins (Colruyt, Delhaize, Aldi, Lidl, Boni, Wegovy, Dzaryx, Basic-Fit), les marqueurs comme « · ». On te donne une liste numérotée : réponds UNIQUEMENT par un objet JSON {"ar": ["traduction 1", "traduction 2", …]} avec EXACTEMENT le même nombre d\'éléments, dans le même ordre.',
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

// ── Coach à qui poser une question (resto, fast-food belge, envie de sucre…) ──
export async function askFormeCoach(question: string, uid: Uid = 'kouider', mode = ''): Promise<string> {
  const p = await getFormeProfile(uid);
  let ctx = await formeText(uid);
  if (mode === 'batch') { const w = await getWeek(uid); ctx += w ? `\nRECETTES DE LA SEMAINE :\n${w.recipes.map(r => `- ${r.title} : ${r.ingredients.map(i => `${i.name} ${i.qty}`).join(', ')}`).join('\n')}\nDonne un plan de BATCH COOKING du dimanche (2 h max) : ordre des étapes minuté, ce qui se congèle, boîtes à préparer.` : ''; }
  if (mode === 'fridge') ctx += '\nIl/elle te donne ce qu\'il y a dans son frigo/placard : propose 2 recettes halal rapides avec SEULEMENT ça (+ basiques : sel, poivre, huile, épices), avec quantités, kcal et protéines estimées.';
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 900,
    system: `Tu es le coach FORME de ${p.name || 'cette personne'} (nutrition + sport), qui vit à Bruxelles. ${rules(p)}\nRéponds simplement, concret, chaleureux, ${mode ? '20' : '8'} lignes max, avec des produits/enseignes belges quand c'est utile (Colruyt, Delhaize, Quick, friterie, snack halal…). Questions médicales (dose, effets graves : douleur au ventre forte et persistante, vomissements répétés, malaise) → son médecin ou le 112 en urgence.${p.lang === 'ar' ? ' Réponds en arabe littéraire.' : ' Réponds en français.'}`,
    messages: [{ role: 'user', content: `${ctx}\n\nQUESTION : ${question.slice(0, 800)}` }] }, QUALITY);
  return textOf(res).trim();
}

// ── Vue d'ensemble pour l'app ────────────────────────────────────────────────
const SITES = ['ventre gauche', 'ventre droit', 'cuisse gauche', 'cuisse droite', 'bras gauche', 'bras droit'];

function dayTotals(day: FormeDay | undefined, week: WeekPlan | null, date: string) {
  const tot = { kcal: 0, p: 0, c: 0, f: 0 };
  if (!day) return tot;
  const plan = week?.days.find(d => d.date === date);
  for (const m of plan?.meals ?? []) {
    if (!day.meals[`${m.recipe}:${m.slot}`]) continue;
    const r = week!.recipes.find(x => x.id === m.recipe);
    if (r) { tot.kcal += r.kcal; tot.p += r.p; tot.c += r.c; tot.f += r.f; }
  }
  for (const e of day.extra) { tot.kcal += e.kcal; tot.p += e.p; tot.c += e.c; tot.f += e.f; }
  return tot;
}

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
  const [p, days, week, photos, femmeInvite] = await Promise.all([getFormeProfile(uid), readDays(uid), getWeek(uid), readPhotos(uid), uid === 'kouider' ? inviteActive('femme') : Promise.resolve(false)]);
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
  let streak = 0;
  for (let i = 0; i < 200; i++) { const d = days[addDays(today, -i)]; if (d && (Object.values(d.meals).some(Boolean) || d.extra.length || d.water)) streak++; else if (i > 0) break; }
  const week7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map(d => ({ date: d, ...dayTotals(days[d], week, d), water: days[d]?.water ?? 0, sleep: days[d]?.sleep ?? null, steps: days[d]?.steps ?? null }));
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
    { id: 'protein', label: 'Protéines atteintes', emoji: '🥩', ok: week7.some(d => d.p >= t.p) },
    { id: 'water', label: 'Hydraté', emoji: '💧', ok: week7.some(d => d.water >= p.waterGoal) },
    { id: 'photo', label: 'Avant / après', emoji: '📸', ok: photos.length >= 2 },
    { id: 'kg2', label: '−2 kg', emoji: '⚖️', ok: weights.length > 0 && weights[0]!.kg - curW >= 2 },
    { id: 'kg5', label: '−5 kg', emoji: '🏅', ok: weights.length > 0 && weights[0]!.kg - curW >= 5 },
    { id: 'inj4', label: '4 injections notées', emoji: '💉', ok: injections.length >= 4 },
  ];
  return {
    favs: await favRecipes(uid),
    uid, today, profile: p, targets: t, day, eaten: dayTotals(day, week, today), week, week7, streak, badges,
    weights, measures, injections, sides, nextInjection: nextInjection(p, days), doses: WEGOVY_DOSES,
    photos: shown.map(ph => ({ ...ph, url: urls[ph.id] ?? null })).reverse(), photoDue,
    weightRate: ratePerWeek != null ? Math.round(ratePerWeek * 10) / 10 : null,
    tooFast: ratePerWeek != null && ratePerWeek > curW * 0.012,
    challenge: weekChallenge(p, week7, t),
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
  const [p, days, week, photos] = await Promise.all([getFormeProfile(uid), readDays(uid), getWeek(uid), readPhotos(uid)]);
  const who = uid === 'kouider' ? 'Kouider' : p.name || 'sa femme';
  if (!p.onboarded && !Object.keys(days).length) return uid === 'kouider' ? 'APP FORME (sport + nutrition) : pas encore configurée — propose-lui d\'ouvrir la page FORME de l\'app pour la régler (2 minutes).' : '';
  const today = localNow().date, t = formeTargets(p);
  const lastDays = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).map(d => {
    const x = days[d]; if (!x) return null;
    const tot = dayTotals(x, week, d);
    return `- ${d} : ${tot.kcal} kcal, ${tot.p} g prot., eau ${x.water}/${p.waterGoal}${x.weight ? `, ${x.weight} kg` : ''}${x.injection ? `, 💉 injection (${x.injection.site}${x.injection.dose ? `, ${x.injection.dose}` : ''})` : ''}${x.workout ? `, séance ${x.workout.label}` : ''}${x.sleep ? `, sommeil ${x.sleep} h` : ''}${x.steps != null ? `, ${x.steps} pas` : ''}${x.sides?.length ? `, effets : ${x.sides.map(s => `${s.what} ${s.level}/3`).join(', ')}` : ''}`;
  }).filter(Boolean);
  const weights = Object.entries(days).filter(([, d]) => d.weight).sort(([a], [b]) => a.localeCompare(b));
  const inj = nextInjection(p, days);
  const lastA = [...photos].reverse().find(ph => ph.analysis);
  const todayPlan = week?.days.find(d => d.date === today)?.meals.map(m => `${m.slot} : ${week.recipes.find(r => r.id === m.recipe)?.title ?? '?'}${days[today]?.meals[`${m.recipe}:${m.slot}`] ? ' ✅' : ''}`).join(' · ');
  const lines = [
    uid === 'kouider'
      ? 'APP FORME (son app sport + nutrition, page FORME de l\'app Dzaryx et appli à part sur son écran) — tu suis TOUT ce qu\'elle voit. Outil `forme` pour lire/noter. Il mange UNIQUEMENT HALAL. Il vit en Belgique (courses ' + p.stores.join(', ') + '). Liste de courses commune avec sa femme (ce que l\'un coche est coché chez l\'autre).'
      : `SUIVI FORME DE ${who.toUpperCase()} (elle a accepté de le partager avec Dzaryx ; reste discret et bienveillant, n'en parle qu'à Kouider ou à elle) :`,
    `Objectif : ${p.goal} · ${weights.length ? `${weights[0]![1].weight} kg au départ → ${weights[weights.length - 1]![1].weight} kg aujourd'hui` : `${p.weightKg} kg`} → visé ${p.targetKg} kg. Cibles/jour : ${t.kcal} kcal, ${t.p} g protéines, ${p.waterGoal} verres d'eau.`,
    p.wegovy.on ? `TRAITEMENT WEGOVY (privé ; jamais de conseil de dose → médecin) : ${p.wegovy.dose ? `dose actuelle ${p.wegovy.dose}, ` : ''}injection le ${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][p.wegovy.day]} ${p.wegovy.hour}${inj ? `, prochaine ${inj.inDays === 0 ? "AUJOURD'HUI" : `dans ${inj.inDays} j`} (site conseillé : ${inj.site})` : ''}.` : '',
    todayPlan ? `Menu d'aujourd'hui : ${todayPlan}` : '',
    lastDays.length ? `7 DERNIERS JOURS :\n${lastDays.join('\n')}` : '',
    lastA?.analysis ? `DERNIÈRE ANALYSE PHOTO (${lastA.date}) : ${lastA.analysis.summary} À travailler : ${lastA.analysis.focus.join(', ')}.` : '',
    p.fasting !== 'off' ? `Jeûne : ${p.fasting === 'ramadan' ? 'Ramadan (s\'hour + iftar)' : 'lundi et jeudi'}.` : '',
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

/** Toutes les 15 min, 7h-22h, pour chacun : injection, repas, eau, pesée, photo. Une seule fois par jour pour chaque. */
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
    const week = await getWeek(uid);
    const plan = week?.days.find(x => x.date === date);
    if (p.notif.meals && plan) {
      const lunch = plan.meals.find(m => m.slot === 'déjeuner'), dinner = plan.meals.find(m => m.slot === 'dîner');
      const title = (id?: string) => week!.recipes.find(r => r.id === id)?.title ?? '';
      if (lunch && at('12:15') && !at('14:00') && !d.meals[`${lunch.recipe}:déjeuner`] && await notify(uid, 'lunch', title(lunch.recipe))) sent.push('déjeuner');
      if (dinner && at('19:00') && !at('21:00') && !d.meals[`${dinner.recipe}:dîner`] && await notify(uid, 'dinner', title(dinner.recipe))) sent.push('dîner');
    }
    if (p.notif.water && at('15:00') && !at('17:00') && d.water < p.waterGoal / 2 && await notify(uid, 'water', `${d.water}/${p.waterGoal}`)) sent.push('eau');
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

/** Dimanche 19h : bilan FORME de Kouider sur Telegram + semaine suivante composée pour chacun. */
export async function jobFormeWeekly(): Promise<void> {
  const p = await getFormeProfile('kouider');
  if (p.onboarded) {
    const o = await formeOverview('kouider');
    const avg = (k: 'kcal' | 'p') => Math.round(o.week7.reduce((a, d) => a + d[k], 0) / 7);
    const w = o.weights.filter(x => x.date >= addDays(o.today, -7));
    const delta = w.length >= 2 ? Math.round((w[w.length - 1]!.kg - w[0]!.kg) * 10) / 10 : null;
    await queueTelegramMessage([
      '📊 Bilan FORME de la semaine',
      `🍽️ Moyenne ${avg('kcal')} kcal/jour (cible ${o.targets.kcal}) · 🥩 ${avg('p')} g de protéines (cible ${o.targets.p})`,
      delta != null ? `⚖️ ${delta > 0 ? '+' : ''}${delta} kg cette semaine${o.tooFast ? ' — un peu rapide : on monte les protéines pour garder le muscle' : ''}` : '⚖️ Pense à te peser lundi matin',
      `💧 ${o.week7.filter(d => d.water >= p.waterGoal).length}/7 jours bien hydraté · 🔥 série ${o.streak} j`,
      o.photoDue ? '📸 Photo de suivi à faire cette semaine' : '',
      'Nouvelle semaine de repas et liste de courses (du foyer) prête dans FORME 🛒',
    ].filter(Boolean).join('\n')).catch(() => {});
  }
  const tomorrow = addDays(localNow().date, 1);
  for (const uid of UIDS) {
    if (!(await getFormeProfile(uid)).onboarded) continue;
    await generateWeek(uid, tomorrow, true).catch(err => console.error(`[forme] semaine suivante ${uid} :`, err instanceof Error ? err.message : err));
  }
  await resetChecksBefore(Date.now() - 3600_000);
}

// ── Outil Dzaryx `forme` (Kouider seulement : son suivi à lui) ───────────────
export async function formeTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input.action ?? 'status');
  if (a === 'status') return await formeText('kouider');
  if (a === 'log') {
    const kind = String(input.kind ?? '');
    if (!['water', 'weight', 'food', 'protein', 'injection', 'side', 'measures'].includes(kind)) return 'kind invalide (water, weight, food, protein, injection, side, measures)';
    await logForme(kind, input);
    return `✅ Noté dans FORME (${kind}).`;
  }
  if (a === 'week') {
    const w = await getWeek('kouider') ?? await generateWeek('kouider');
    return w.days.map(d => `${d.date} : ${d.meals.map(m => `${m.slot} ${w.recipes.find(r => r.id === m.recipe)?.title}`).join(' · ')}`).join('\n');
  }
  if (a === 'shopping') {
    const h = await householdShopping('kouider');
    const by = new Map<string, HouseItem[]>();
    for (const s of h.items) by.set(s.store, [...(by.get(s.store) ?? []), s]);
    return [...by].map(([st, items]) => `🛒 ${st}\n${items.map(i => `${i.checked ? `✅ (${i.by})` : '▫️'} ${i.name} ${i.who.map(w => w.qty).join(' + ')} ≈ ${i.price.toFixed(2)} €`).join('\n')}`).join('\n\n') + `\nTotal ≈ ${h.total.toFixed(2)} € (budget ${h.budget} €)${h.shared ? ' — liste commune avec sa femme' : ''}`;
  }
  if (a === 'regenerate') { const w = await generateWeek('kouider', localNow().date, true, typeof input['wishes'] === 'string' ? input['wishes'] : undefined); return `✅ Nouvelle semaine : ${w.recipes.length} recettes, courses ≈ ${w.total} €. ${w.note}`; }
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
