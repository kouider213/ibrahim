/**
 * 🍽️ CALORIES (Kouider 31/10, « style Cal AI ») — il prend son plat en photo dans FORME → chaque aliment, son poids estimé,
 * kcal + protéines/glucides/lipides. Relié au cerveau de Dzaryx et à sa montre :
 *  - dépense du jour = métabolisme de base (profil FORME) + calories actives de l'Apple Watch (raccourci Santé, séances)
 *  - objectif = dépense − déficit voulu (500 par défaut), jamais sous un plancher de sécurité
 *  - après chaque photo : message Telegram « il te reste X kcal, garde de la place pour ce soir, mange plutôt ça »,
 *    et si ça dépasse : l'équivalent honnête en marche rapide / pompes
 *  - au fil de la journée (Telegram) : bilan de la nuit au réveil (sommeil → sport, business, moral), collations,
 *    « il te reste X pour ce soir », et le soir avant de dormir : bilan + heure de coucher.
 * Estimations (une photo ne donne jamais le poids exact : ±15-20 %) → il peut corriger les grammes dans l'app.
 * VIE PRIVÉE : dépôt PUBLIC → tout dans app_kv, rien de perso ici. Jamais de conseil de dose d'un traitement.
 */
import { kvGet, kvSet } from './app-store.js';
import { localNow } from './morning-routine.js';
import { getFormeProfile, formeTargets, type Uid } from './forme.js';

export type MealSlot = 'matin' | 'midi' | 'collation' | 'soir';
export interface FoodPart { name: string; grams: number; kcal: number; p: number; c: number; f: number }
export interface MealLog {
  id: string; at: number; date: string; time: string; slot: MealSlot; title: string;
  items: FoodPart[]; kcal: number; p: number; c: number; f: number;
  confidence: 'haute' | 'moyenne' | 'basse'; note?: string; thumb?: string; src: 'photo' | 'texte'; coach?: string;
}
export interface FoodCfg { on: boolean; deficit: number; telegram: boolean }
export interface Budget {
  date: string; bmr: number; active: number; activeSource: 'montre' | 'moyenne' | 'estimation'; burn: number;
  deficit: number; target: number; floor: number; eaten: { kcal: number; p: number; c: number; f: number };
  left: number; proteinGoal: number; proteinLeft: number; pct: number; meals: MealLog[];
}

const MEALS_K = (u: Uid, date: string) => `${u}:forme:food:${date}`;
const CFG_K = (u: Uid) => `${u}:forme:foodcfg`;
const SENT_K = (what: string, date: string) => `kouider:forme:foodsent:${what}:${date}`;
const DEFAULT_CFG: FoodCfg = { on: true, deficit: 500, telegram: true };

const readJson = async <T,>(key: string, fallback: T): Promise<T> => {
  try { const raw = await kvGet(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
};
const r0 = (n: number) => Math.round(Number(n) || 0);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const slotOf = (hhmm: string): MealSlot => hhmm < '10:30' ? 'matin' : hhmm < '15:00' ? 'midi' : hhmm < '18:00' ? 'collation' : 'soir';
export const SLOT_LABEL: Record<MealSlot, string> = { matin: 'Petit-déj', midi: 'Midi', collation: 'Collation', soir: 'Soir' };

export async function foodCfg(uid: Uid = 'kouider'): Promise<FoodCfg> { return { ...DEFAULT_CFG, ...await readJson<Partial<FoodCfg>>(CFG_K(uid), {}) }; }
export async function setFoodCfg(patch: Partial<FoodCfg>, uid: Uid = 'kouider'): Promise<FoodCfg> {
  const cur = await foodCfg(uid);
  const next: FoodCfg = {
    on: patch.on != null ? !!patch.on : cur.on,
    telegram: patch.telegram != null ? !!patch.telegram : cur.telegram,
    // Déficit raisonnable : 0 (maintien) à 750 kcal/j (≈ 0,7 kg/semaine) — au-delà on perd du muscle
    deficit: patch.deficit != null && Number.isFinite(Number(patch.deficit)) ? Math.min(750, Math.max(0, Math.round(Number(patch.deficit) / 50) * 50)) : cur.deficit,
  };
  await kvSet(CFG_K(uid), JSON.stringify(next));
  return next;
}

export async function mealsOf(uid: Uid, date = localNow().date): Promise<MealLog[]> { return readJson<MealLog[]>(MEALS_K(uid, date), []); }
async function saveMeals(uid: Uid, date: string, meals: MealLog[]): Promise<void> {
  await kvSet(MEALS_K(uid, date), JSON.stringify(meals.slice(-25)), 120 * 86_400);
}
const sumOf = (items: Array<{ kcal: number; p: number; c: number; f: number }>) =>
  items.reduce((a, x) => ({ kcal: a.kcal + r0(x.kcal), p: a.p + r0(x.p), c: a.c + r0(x.c), f: a.f + r0(x.f) }), { kcal: 0, p: 0, c: 0, f: 0 });

// ── Dépense du jour (montre) et objectif ────────────────────────────────────
interface HDay { date: string; active_kcal?: number; steps?: number; sleep_h?: number; rhr?: number; hrv?: number }
async function activeFor(date: string): Promise<{ kcal: number; source: Budget['activeSource'] }> {
  const all = await readJson<HDay[]>('health:daily', []);
  const today = all.find(x => x.date === date)?.active_kcal ?? 0;
  // Séances vues par la montre aujourd'hui (début/fin envoyés en direct) → au moins ça + la vie de tous les jours
  const wo = await import('./workout-live.js').then(m => m.readWorkouts()).catch(() => []);
  const woK = wo.filter(w => String(w.at).slice(0, 10) === date).reduce((a, w) => a + (w.kcal ?? 0), 0);
  const past = all.filter(x => x.date < date && x.date >= addDays(date, -14) && (x.active_kcal ?? 0) > 50).map(x => x.active_kcal!).sort((a, b) => a - b);
  const med = past.length >= 3 ? past[Math.floor(past.length / 2)]! : 0;
  // Valeur de la montre = journée complète seulement le soir (envoi 22h) ou un jour passé ; un envoi du matin
  // (réveil) ne compte que quelques kcal → on garde la moyenne tant que la journée n'est pas finie.
  const dayDone = date < localNow().date || localNow().hhmm >= '20:00';
  if (today > 50 && (dayDone || today >= med)) return { kcal: r0(today), source: 'montre' };
  if (med) return { kcal: r0(Math.max(med, woK + 200, today)), source: 'moyenne' };
  return { kcal: r0(Math.max(350, woK + 250, today)), source: 'estimation' };
}

export async function foodBudget(uid: Uid = 'kouider', date = localNow().date): Promise<Budget> {
  const [p, cfg, meals] = await Promise.all([getFormeProfile(uid), foodCfg(uid), mealsOf(uid, date)]);
  const t = formeTargets(p);
  const act = uid === 'kouider' ? await activeFor(date) : { kcal: r0(t.tdee - t.bmr), source: 'estimation' as const };
  const burn = t.bmr + act.kcal;
  const floor = p.sex === 'h' ? 1500 : 1200;
  const deficit = Math.min(cfg.deficit, Math.round(burn * 0.25));
  const target = Math.max(floor, Math.round((burn - deficit) / 10) * 10);
  const eaten = sumOf(meals);
  return { date, bmr: t.bmr, active: act.kcal, activeSource: act.source, burn, deficit: burn - target, target, floor, eaten,
    left: target - eaten.kcal, proteinGoal: t.p, proteinLeft: Math.max(0, t.p - eaten.p), pct: Math.round(eaten.kcal / target * 100), meals };
}

/** Ce que coûte un dépassement, en vrai (MET) : marche rapide et pompes, selon son poids. */
export function burnEquivalent(kcal: number, kg: number): string {
  if (kcal <= 0) return '';
  const walkMin = Math.round(kcal / (4.3 * 3.5 * kg / 200));      // marche rapide ~6 km/h
  const stairsMin = Math.round(kcal / (8 * 3.5 * kg / 200));      // escaliers / tapis incliné
  const pompes = Math.round(kcal / (0.0048 * kg));                 // ≈ 0,43 kcal la pompe à 90 kg
  return `≈ ${walkMin} min de marche rapide, ou ${stairsMin} min d'escaliers / tapis incliné${pompes <= 150 ? `, ou ${pompes} pompes (en séries de 10-15)` : ''}`;
}

// ── Photo d'un plat → aliments + macros ─────────────────────────────────────
export const VISION_PROMPT = (note: string) => `Tu es un nutritionniste expert du comptage de calories par photo (comme l'appli Cal AI), spécialiste de la cuisine algérienne / maghrébine (couscous, chorba, hrira, karantika, rechta, chakhchoukha, loubia, mhadjeb, garantita, tajines, msemen, kesra, bourek, makrout…), belge et fast-food halal (tacos, kebab, pizza…).
Regarde la photo et liste CHAQUE aliment visible. Pour chacun, estime le POIDS en grammes à partir des repères (assiette ~26 cm, couverts, main, emballage, verre 25 cl), en comptant l'huile / le beurre / la sauce de cuisson probables, puis calcule kcal, protéines, glucides et lipides avec les tables nutritionnelles classiques (CIQUAL / USDA).
Sois précis et réaliste, ni optimiste ni pessimiste. Boisson visible = un aliment aussi.${note ? `\nCe que Kouider précise (PRIORITAIRE sur ton estimation : quantités, sans huile, etc.) : « ${note} »` : ''}
Réponds UNIQUEMENT en JSON : {"title":"nom court du plat en français","items":[{"name":"aliment","grams":0,"kcal":0,"p":0,"c":0,"f":0}],"confidence":"haute|moyenne|basse","tip":"1 remarque utile en 1 phrase (ex. la sauce pèse lourd)"}
Si la photo ne montre pas de nourriture : {"title":"","items":[],"confidence":"basse","tip":"pas de nourriture visible"}`;

interface RawMeal { title?: string; items?: Array<Partial<FoodPart>>; confidence?: string; tip?: string }
function cleanItems(items: RawMeal['items']): FoodPart[] {
  return (items ?? []).slice(0, 15).map(x => ({
    name: String(x.name ?? '').slice(0, 60), grams: Math.max(0, r0(x.grams ?? 0)),
    kcal: Math.max(0, r0(x.kcal ?? 0)), p: Math.max(0, r0(x.p ?? 0)), c: Math.max(0, r0(x.c ?? 0)), f: Math.max(0, r0(x.f ?? 0)),
  })).filter(x => x.name && x.kcal >= 0)
    // garde-fou : kcal cohérentes avec les macros (4/4/9) si le modèle s'est trompé de beaucoup
    .map(x => { const m = x.p * 4 + x.c * 4 + x.f * 9; return m > 30 && Math.abs(m - x.kcal) / m > 0.35 ? { ...x, kcal: m } : x; });
}

async function storeMeal(uid: Uid, raw: RawMeal, o: { src: MealLog['src']; note?: string; thumb?: string; slot?: MealSlot; date?: string }): Promise<MealLog> {
  const items = cleanItems(raw.items);
  if (!items.length) throw new Error(raw.tip && !/pas de nourriture/i.test(raw.tip) ? raw.tip : 'Je ne vois pas de nourriture sur la photo — reprends ton assiette en entier, vue d\'en haut.');
  const { date: today, hhmm } = localNow();
  const date = o.date ?? today;
  const tot = sumOf(items);
  const meal: MealLog = {
    id: Math.random().toString(36).slice(2, 10), at: Date.now(), date, time: hhmm, slot: o.slot ?? slotOf(hhmm),
    title: String(raw.title || items.map(i => i.name).slice(0, 3).join(', ')).slice(0, 70), items, ...tot,
    confidence: (['haute', 'moyenne', 'basse'].includes(String(raw.confidence)) ? raw.confidence : 'moyenne') as MealLog['confidence'],
    ...(o.note ? { note: o.note.slice(0, 200) } : {}), ...(o.thumb && o.thumb.length < 60_000 ? { thumb: o.thumb } : {}), src: o.src,
    ...(raw.tip ? { coach: String(raw.tip).slice(0, 220) } : {}),
  };
  await saveMeals(uid, date, [...await mealsOf(uid, date), meal]);
  return meal;
}

export async function analyzeMealPhoto(uid: Uid, img: { base64: string; mime: string }, o: { note?: string; thumb?: string; slot?: MealSlot } = {}): Promise<{ meal: MealLog; budget: Budget; message: string }> {
  const { vision, jsonOf } = await import('./media-util.js');
  const raw = await vision([img], VISION_PROMPT(o.note ?? ''), { quality: true, maxTokens: 1400 });
  const j = jsonOf<RawMeal>(raw);
  if (!j) throw new Error('Je n\'ai pas réussi à lire la photo — réessaie avec toute l\'assiette dans le cadre, bien éclairée.');
  const meal = await storeMeal(uid, j, { src: 'photo', ...o });
  return afterMeal(uid, meal);
}

/** « J'ai mangé 2 œufs et une tartine » (tool / app) → même calcul, sans photo. */
export async function logMealText(uid: Uid, text: string, slot?: MealSlot): Promise<{ meal: MealLog; budget: Budget; message: string }> {
  const { ai, jsonOf } = await import('./ai-util.js');
  const raw = await ai(`${VISION_PROMPT(text).replace('Regarde la photo et liste CHAQUE aliment visible.', `Voici ce qu'il a mangé (pas de photo) : « ${text} ». Liste chaque aliment, avec une portion normale si la quantité n'est pas dite.`)}`, { quality: true, max: 1200 });
  const j = jsonOf<RawMeal>(raw);
  if (!j) throw new Error('Je n\'ai pas compris ce repas — redis-le avec les quantités.');
  const meal = await storeMeal(uid, j, { src: 'texte', note: text, slot });
  return afterMeal(uid, meal);
}

/** Avant de manger : « si je mange ça ? » → kcal estimées + verdict + compensation. Rien n'est enregistré. */
export async function checkFood(text: string): Promise<string> {
  const { ai, jsonOf } = await import('./ai-util.js');
  const j = jsonOf<RawMeal>(await ai(VISION_PROMPT(text).replace('Regarde la photo et liste CHAQUE aliment visible.', `Il hésite à manger : « ${text} ». Liste chaque aliment avec une portion normale si la quantité n'est pas dite.`), { quality: true, max: 900 }));
  const items = cleanItems(j?.items);
  if (!items.length) return 'Je n\'ai pas compris ce que tu veux manger — redis-le simplement.';
  const tot = sumOf(items), b = await foodBudget('kouider'), kg = (await getFormeProfile('kouider')).weightKg;
  const after = b.left - tot.kcal;
  return [`🤔 ${j?.title || text} ≈ ${tot.kcal} kcal (${tot.p} g de protéines).`,
    after >= 0 ? `✅ Tu peux : il te resterait ${after} kcal aujourd'hui.` : `⚠️ Tu dépasserais ton déficit de ${-after} kcal. Pour rattraper : ${burnEquivalent(-after, kg)}.`].join('\n');
}

export async function editMeal(uid: Uid, date: string, id: string, patch: { items?: FoodPart[]; title?: string; slot?: MealSlot; scale?: number }): Promise<MealLog[]> {
  const meals = await mealsOf(uid, date);
  const m = meals.find(x => x.id === id);
  if (!m) throw new Error('repas introuvable');
  if (Array.isArray(patch.items)) m.items = cleanItems(patch.items);
  if (patch.scale && patch.scale > 0 && patch.scale <= 4) m.items = m.items.map(x => ({ ...x, grams: r0(x.grams * patch.scale!), kcal: r0(x.kcal * patch.scale!), p: r0(x.p * patch.scale!), c: r0(x.c * patch.scale!), f: r0(x.f * patch.scale!) }));
  if (patch.title) m.title = String(patch.title).slice(0, 70);
  if (patch.slot && SLOT_LABEL[patch.slot]) m.slot = patch.slot;
  Object.assign(m, sumOf(m.items));
  await saveMeals(uid, date, meals);
  return meals;
}
export async function deleteMeal(uid: Uid, date: string, id: string): Promise<MealLog[]> {
  const meals = (await mealsOf(uid, date)).filter(x => x.id !== id);
  await saveMeals(uid, date, meals);
  return meals;
}

// ── Le coach (cerveau de Dzaryx) ────────────────────────────────────────────
const COACH_SYS = `Tu es Dzaryx, le bras droit de Kouider (Algérien d'Oran installé en Belgique, musulman → HALAL uniquement, loueur de voitures FIK, sport le matin à la salle, papa d'un petit garçon). Tu es son coach nutrition + santé : chaleureux, direct, comme un grand frère, tutoiement, français simple, phrases courtes, quelques emojis, PAS de markdown (Telegram texte brut).
Son but : rester en DÉFICIT CALORIQUE sans perdre de muscle (protéines hautes). Tu utilises UNIQUEMENT les chiffres donnés, tu n'inventes rien.
Idées de repas / collations : simples, halal, faciles à trouver en Belgique (Colruyt, Lidl, boucherie halal) ou à la maison algérienne (chorba, poulet, œufs, lben, skyr, fromage blanc, thon, lentilles, pois chiches, fruits, amandes, galette de riz…), avec les kcal et protéines approximatives.
Sécurité : jamais de régime extrême, jamais sauter un repas pour « compenser », jamais sous le plancher donné ; jamais de conseil sur un médicament ou un traitement (→ son médecin). Le sport de compensation est une option, pas une punition.`;

async function coachSay(facts: string, ask: string, max = 450): Promise<string> {
  const { ai } = await import('./ai-util.js');
  return (await ai(`${facts}\n\n${ask}`, { system: COACH_SYS, max }).catch(() => '')).replace(/\*\*/g, '').trim();
}

export function budgetFacts(b: Budget): string {
  return [`Date ${b.date}, heure ${localNow().hhmm}.`,
    `Dépense estimée du jour : ${b.burn} kcal (base ${b.bmr} + activité ${b.active} ${b.activeSource === 'montre' ? 'mesurée par sa montre' : b.activeSource === 'moyenne' ? '(moyenne de ses 14 derniers jours sur la montre)' : '(estimation, pas encore de données montre)'}).`,
    `Objectif pour être en déficit : ${b.target} kcal (déficit ${b.deficit} kcal ; plancher de sécurité ${b.floor}).`,
    `Mangé : ${b.eaten.kcal} kcal (${b.pct} %), protéines ${b.eaten.p}/${b.proteinGoal} g, glucides ${b.eaten.c} g, lipides ${b.eaten.f} g.`,
    `Il reste : ${b.left} kcal et ${b.proteinLeft} g de protéines.`,
    b.meals.length ? `Repas du jour : ${b.meals.map(m => `${m.time} ${SLOT_LABEL[m.slot]} « ${m.title} » ${m.kcal} kcal / ${m.p} g P`).join(' ; ')}.` : 'Aucun repas noté aujourd\'hui.'].join('\n');
}

async function afterMeal(uid: Uid, meal: MealLog): Promise<{ meal: MealLog; budget: Budget; message: string }> {
  const b = await foodBudget(uid, meal.date);
  const kg = (await getFormeProfile(uid)).weightKg;
  const over = -b.left;
  const head = `🍽️ ${meal.title} — ${meal.kcal} kcal · ${meal.p} g protéines · ${meal.c} g glucides · ${meal.f} g lipides${meal.confidence === 'basse' ? ' (estimation peu sûre : corrige les grammes dans FORME si besoin)' : ''}\n${meal.items.map(i => `• ${i.name} ${i.grams} g : ${i.kcal} kcal`).join('\n')}\n\n📊 Aujourd'hui : ${b.eaten.kcal} / ${b.target} kcal · protéines ${b.eaten.p}/${b.proteinGoal} g → ${b.left >= 0 ? `il te reste ${b.left} kcal` : `tu as dépassé de ${over} kcal`}.`;
  const ask = over > 0
    ? `Ce repas le fait DÉPASSER son objectif de ${over} kcal. Équivalent pour rattraper : ${burnEquivalent(over, kg)}. Dis-le calmement en 3-4 phrases : pas de drame, ce qu'il peut faire (une des options sport chiffrées ci-dessus OU accepter un jour au maintien), et ce qu'il mange encore aujourd'hui s'il a faim (très léger, protéiné).`
    : b.pct >= 75
      ? `Il approche de la limite (${b.pct} %). Avertis-le en 3-4 phrases : « fais attention, laisse de la place pour ce soir », et propose 2 idées précises pour le reste de la journée qui tiennent dans ${b.left} kcal avec le plus de protéines possible.`
      : `En 2-3 phrases : un retour sur ce repas (protéines suffisantes ? bon choix ?), puis ce qu'il garde pour la suite (${b.left} kcal, ${b.proteinLeft} g de protéines) avec 1 idée pour le prochain repas.`;
  const say = await coachSay(`${budgetFacts(b)}\nRepas qu'il vient d'envoyer : ${meal.title} (${meal.items.map(i => `${i.name} ${i.grams} g`).join(', ')})${meal.coach ? ` — remarque : ${meal.coach}` : ''}.`, ask);
  const message = `${head}${say ? `\n\n${say}` : ''}`;
  meal.coach = say || meal.coach;
  const meals = await mealsOf(uid, meal.date);
  const m = meals.find(x => x.id === meal.id); if (m) { m.coach = meal.coach; await saveMeals(uid, meal.date, meals); }
  if (uid === 'kouider' && (await foodCfg()).telegram) await (await import('./ai-util.js')).tg(message);
  return { meal, budget: b, message };
}

// ── Photo envoyée sur Telegram (outil forme action meal_photo) ──────────────
export async function mealFromTelegram(note = ''): Promise<string> {
  const { lastTelegramPhoto } = await import('./forme.js');
  const ph = await lastTelegramPhoto();
  if (!ph) return '❌ Je n\'ai pas de photo récente : renvoie la photo de ton plat (ou prends-la dans FORME → Repas).';
  const r = await analyzeMealPhoto('kouider', { base64: ph.b64, mime: ph.mime }, { note });
  return `${r.message}\n\n(déjà envoyé sur son Telegram et enregistré dans FORME → Repas)`;
}

// ── Sommeil : matin au réveil, soir avant de dormir ─────────────────────────
async function health(): Promise<HDay[]> { return readJson<HDay[]>('health:daily', []); }
function sleepUsual(all: HDay[], date: string): number | null {
  const v = all.filter(x => x.date < date && x.date >= addDays(date, -14) && (x.sleep_h ?? 0) > 2).map(x => x.sleep_h!);
  return v.length >= 3 ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null;
}

async function dayContext(date: string): Promise<string> {
  const bits: string[] = [];
  const sp = await import('./sport-coach.js').then(m => m.sportToday()).catch(() => null);
  if (sp?.label) bits.push(`Séance de sport prévue aujourd'hui : ${sp.label}${sp.skipped ? ' (annulée)' : ''}.`);
  const { localTs } = await import('./morning-routine.js');
  const ev = await import('./google-calendar.js').then(m => m.listAgendaRange(new Date(localTs(date, '00:00')).toISOString(), new Date(localTs(date, '23:59')).toISOString(), 15)).then(x => x ?? []).catch(() => []);
  if (ev.length) bits.push(`Agenda (FIK) : ${ev.slice(0, 8).map(e => `${e.start?.dateTime ? localNow(Date.parse(e.start.dateTime)).hhmm : ''} ${e.summary ?? ''}`.trim()).join(' ; ')}.`);
  const mood = await import('./life-coach.js').then(m => m.readLog()).then(l => l.slice(-3).map(x => JSON.stringify(x).slice(0, 160)).join(' | ')).catch(() => '');
  if (mood) bits.push(`Derniers points du coach de vie (moral, notes) : ${mood}`);
  return bits.join('\n');
}

/** Message du réveil : la nuit (montre) → conseils sport / business / moral + budget calories du jour. */
export async function morningSleepMessage(force = false): Promise<string | null> {
  const { date } = localNow();
  if (!force && await kvGet(SENT_K('morning', date))) return null;
  const all = await health();
  const t = all.find(x => x.date === date);
  const usual = sleepUsual(all, date);
  const y = await foodBudget('kouider', addDays(date, -1));
  const b = await foodBudget('kouider', date);
  const yLine = y.meals.length ? `Hier : mangé ${y.eaten.kcal} kcal pour une dépense ${y.activeSource === 'montre' ? 'mesurée' : 'estimée'} de ${y.burn} → ${y.burn - y.eaten.kcal >= 0 ? `déficit réel ${y.burn - y.eaten.kcal} kcal` : `surplus ${y.eaten.kcal - y.burn} kcal`} ; protéines ${y.eaten.p}/${y.proteinGoal} g.` : 'Hier : aucun repas noté dans FORME.';
  const sleepLine = t?.sleep_h ? `Sommeil cette nuit (Apple Watch) : ${t.sleep_h} h${usual ? ` (moyenne habituelle ${usual} h)` : ''}${t.hrv ? `, VFC ${t.hrv} ms` : ''}${t.rhr ? `, cœur au repos ${t.rhr}` : ''}.` : 'Sommeil de cette nuit : PAS ENCORE REÇU (le raccourci Santé n\'a rien envoyé ce matin).';
  const ready = await import('./workout-live.js').then(m => m.readiness()).then(r => r?.line ?? '').catch(() => '');
  // Nuit courte → la séance du jour s'allège toute seule (comme pour le cœur / la VFC)
  let lighter = '';
  if (t?.sleep_h && t.sleep_h < 6) {
    const r = await import('./sport-coach.js').then(m => m.setFormFromWatch(date, 2)).catch(() => null);
    if (r && !/pas de séance/i.test(r)) lighter = 'La séance du jour vient d\'être passée en version courte et légère automatiquement (−10 % sur les charges).';
  }
  const facts = [sleepLine, ready, lighter, yLine, `Budget d'aujourd'hui : ${b.target} kcal (déficit ${b.deficit}), protéines ${b.proteinGoal} g.`, await dayContext(date)].filter(Boolean).join('\n');
  const say = await coachSay(facts, `C'est le MESSAGE DU RÉVEIL (6-9 lignes max). 1) Sa nuit en une phrase honnête (si pas reçue : dis-lui de lancer le raccourci « Dzaryx Santé » ou de te dire combien il a dormi). 2) Ce que ça change AUJOURD'HUI, concrètement, pour : le SPORT (plus léger ? moins de séries ? garder ?), le BUSINESS (les tâches importantes quand ? éviter les grosses décisions après 15h si nuit courte), le MORAL (patience, pause, respiration, famille) — mauvaise nuit = plus de faim et d'envies sucrées : préviens-le. 3) Hier côté calories en une phrase. 4) Son budget du jour + une idée de petit-déj protéiné qui va avec.`, 600);
  if (!say) return null;
  await kvSet(SENT_K('morning', date), '1', 2 * 86_400);
  return `🌅 Ta nuit & ta journée\n${say}`;
}

/** Message du soir avant de dormir : bilan calories + coucher (heure selon le réveil de demain) + montre. */
export async function eveningSleepMessage(): Promise<string | null> {
  const { date, weekday } = localNow();
  const b = await foodBudget('kouider', date);
  const cfg = await import('./morning-routine.js').then(m => m.getRoutineConfig()).catch(() => null);
  const tomorrow = cfg?.days[(weekday + 1) % 7];
  const wake = tomorrow?.wake ?? null;
  const bed = wake ? (() => { const [h, m] = wake.split(':').map(Number); const t = (h! * 60 + m! - 7.5 * 60 - 15 + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })() : null;
  const all = await health();
  const last = all.find(x => x.date === date)?.sleep_h;
  const facts = [budgetFacts(b), wake ? `Réveil demain : ${wake} → pour 7 h 30 de sommeil il doit être au lit vers ${bed}.` : '', last ? `Nuit dernière : ${last} h.` : '', await dayContext(addDays(date, 1)).then(x => x ? `DEMAIN — ${x}` : '')].filter(Boolean).join('\n');
  const say = await coachSay(facts, `C'est le MESSAGE DU SOIR avant de dormir (5-7 lignes). 1) Bilan calories du jour (déficit tenu ? protéines ?) honnête et encourageant ; s'il reste de la place et qu'il a faim : une collation légère protéinée chiffrée ; s'il a dépassé : pas de drame, demain on reprend (pas de restriction). 2) L'heure où il doit être couché${bed ? ` (${bed})` : ''}, écrans coupés 30 min avant. 3) Rappel : garde la montre au poignet pour la nuit (chargée ?), que je puisse te dire demain matin comment tu as dormi. 4) Une phrase pour le moral / la journée de demain.`, 500);
  return say ? `🌙 Avant de dormir\n${say}` : null;
}

// ── Les messages de la journée (Telegram), une fois chacun ─────────────────
async function once(what: string, date: string, fn: () => Promise<string | null>): Promise<boolean> {
  if (await kvGet(SENT_K(what, date))) return false;
  const msg = await fn();
  await kvSet(SENT_K(what, date), '1', 2 * 86_400);
  if (!msg) return false;
  await (await import('./ai-util.js')).tg(msg);
  return true;
}

/** Toutes les 15 min (5h-22h). Kouider seulement. */
export async function jobFoodCoach(): Promise<string> {
  const cfg = await foodCfg();
  if (!cfg.on || !cfg.telegram) return 'off';
  const { dndAllowsMessage } = await import('../notifications/dnd.js');
  if (!(await dndAllowsMessage().catch(() => true))) return 'silence';
  const { date, hhmm } = localNow();
  const at = (h: string) => hhmm >= h;
  const sent: string[] = [];
  // Réveil : dès que la montre a envoyé la nuit, ou dès qu'il a donné signe de vie, sinon 9h30 au plus tard
  if (at('04:30') && !at('11:00') && !(await kvGet(SENT_K('morning', date)))) {
    const t = (await health()).find(x => x.date === date);
    const lastAct = await import('./morning-routine.js').then(m => m.lastKouiderActivity()).catch(() => 0);
    const awake = lastAct && localNow(lastAct).date === date && localNow(lastAct).hhmm >= '04:30';
    if (t?.sleep_h || awake || at('09:30')) { const m = await morningSleepMessage(); if (m) { await (await import('./ai-util.js')).tg(m); sent.push('réveil'); } }
  }
  const b = () => foodBudget('kouider', date);
  const snack = (label: string) => async () => {
    const x = await b();
    if (x.left < 120) return null;   // plus de place : on ne pousse pas à manger
    return `🥜 ${label}\n${await coachSay(budgetFacts(x), `Collation de ${label.toLowerCase()} : dis-lui à quoi il a DROIT maintenant (2 idées chiffrées, 150-${Math.min(300, x.left)} kcal, riches en protéines) en gardant assez pour la suite de la journée. 3 lignes max.`, 250)}`;
  };
  if (at('10:00') && !at('11:30') && await once('snack-am', date, snack('Collation du matin'))) sent.push('collation matin');
  if (at('13:45') && !at('15:00') && await once('lunch-check', date, async () => {
    const x = await b();
    return x.meals.some(m => m.slot === 'midi') ? null : `📸 Tu as mangé à midi ? Envoie-moi la photo de ton plat (FORME → Repas, ou ici sur Telegram) pour que je garde ton compte juste. Il te reste ${x.left} kcal aujourd'hui.`;
  })) sent.push('rappel midi');
  if (at('16:00') && !at('17:30') && await once('snack-pm', date, snack('Goûter'))) sent.push('goûter');
  if (at('18:30') && !at('20:00') && await once('dinner', date, async () => {
    const x = await b();
    const ask = x.left <= 150
      ? `Il a déjà presque tout mangé (${x.left} kcal restantes). En 3-4 phrases : pour rester en déficit ce soir, propose un dîner TRÈS léger et protéiné chiffré (ou dis honnêtement que manger un peu au-dessus n'est pas grave si la journée est dure), jamais sauter le dîner s'il a faim.`
      : `Dis-lui « pour ce soir il te reste ${x.left} kcal et ${x.proteinLeft} g de protéines » et propose 2 dîners halal précis chiffrés qui tiennent dedans (portion en grammes). 4 lignes max.`;
    return `🍲 Ce soir\n${await coachSay(budgetFacts(x), ask, 350)}`;
  })) sent.push('dîner');
  if (at('21:00') && !at('22:30') && await once('evening', date, eveningSleepMessage)) sent.push('soir');
  return sent.join(', ') || 'rien';
}

/** Ligne pour le dossier de Dzaryx (chat, appels) : où il en est aujourd'hui. */
export async function foodText(): Promise<string> {
  const cfg = await foodCfg();
  if (!cfg.on) return 'COMPTEUR CALORIES FORME : coupé par Kouider.';
  const b = await foodBudget('kouider');
  return `COMPTEUR CALORIES (FORME → Repas, photo du plat ; objectif = rester en DÉFICIT) : ${b.eaten.kcal}/${b.target} kcal aujourd'hui (dépense ${b.burn}, déficit visé ${b.deficit}), protéines ${b.eaten.p}/${b.proteinGoal} g, reste ${b.left} kcal.${b.meals.length ? ` Repas : ${b.meals.map(m => `${m.time} ${m.title} ${m.kcal} kcal`).join(' ; ')}.` : ''} Outil forme : meal_photo (photo de plat sur Telegram), meal_text (« j'ai mangé… »), food_check (« si je mange ça ? »), food_today, food_settings.`;
}
