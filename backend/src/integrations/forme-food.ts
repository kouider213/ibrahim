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
  confidence: 'haute' | 'moyenne' | 'basse'; note?: string; assumptions?: string; question?: string; thumb?: string; src: 'photo' | 'texte'; coach?: string;
}
export interface FoodCfg { on: boolean; deficit: number; telegram: boolean }
export interface Budget {
  date: string; bmr: number; active: number; activeSource: 'montre' | 'moyenne' | 'estimation'; burn: number;
  deficit: number; target: number; floor: number; eaten: { kcal: number; p: number; c: number; f: number };
  mode: 'deficit' | 'surplus'; surplus: number;   // objectif « muscle » = SURPLUS (prise de masse), sinon déficit
  left: number; proteinGoal: number; proteinLeft: number; pct: number; meals: MealLog[];
  /** 02/11 : brûlé JUSQU'À MAINTENANT (base au prorata de l'heure + activité déjà faite) — l'écran le montre en direct */
  burnedNow?: number; activeNow?: number; nowSource?: 'montre' | 'estimation'; asOf?: string;
  /** 02/11 (Kouider : « il me dit pas le max et min de glucides et lipides ») : fourchettes du jour en g, calées sur l'objectif kcal */
  macros?: { carbMin: number; carbMax: number; fatMin: number; fatMax: number };
}

// Lipides : min = 0,8 g/kg (hormones) et ≥ 20 % des kcal ; max = 35 % des kcal. Glucides = le reste des kcal après protéines + lipides.
export function macroRange(target: number, protein: number, kg: number) {
  const fatMax = r0(target * 0.35 / 9);
  const fatMin = Math.min(fatMax - 10, Math.max(r0(0.8 * (kg || 75)), r0(target * 0.20 / 9)));
  const rest = target - protein * 4;
  return { carbMin: Math.max(0, r0((rest - fatMax * 9) / 4)), carbMax: Math.max(0, r0((rest - fatMin * 9) / 4)), fatMin, fatMax };
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
async function activeFor(date: string): Promise<{ kcal: number; source: Budget['activeSource']; today?: number; woK?: number }> {
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
  if (today > 50 && (dayDone || (med > 0 && today >= med))) return { kcal: r0(today), source: 'montre', today, woK };
  if (med) return { kcal: r0(Math.max(med, woK + 200, today)), source: 'moyenne', today, woK };
  return { kcal: r0(Math.max(350, woK + 250, today)), source: 'estimation', today, woK };
}

export const BULK_SURPLUS = { lent: 250, moyen: 350, rapide: 500 } as const;
export const BULK_KG_WEEK = { lent: 0.2, moyen: 0.3, rapide: 0.45 } as const;

/** Plan de prise de masse (après le questionnaire) : chiffres + conseils, sans IA (toujours dispo, gratuit) */
export async function bulkPlan(uid: Uid) {
  const p = await getFormeProfile(uid);
  const b = p.bulk; if (!b) return null;
  const t = formeTargets(p);
  const kcal = Math.round((t.tdee + BULK_SURPLUS[b.rate]) / 10) * 10;
  const kgWeek = BULK_KG_WEEK[b.rate];
  const toGain = Math.max(0, Math.round((p.targetKg - p.weightKg) * 10) / 10);
  const weeks = toGain ? Math.ceil(toGain / kgWeek) : 0;
  const eta = weeks ? new Date(Date.now() + weeks * 7 * 86_400_000).toISOString().slice(0, 10) : null;
  const prot = t.p, fat = Math.round(kcal * 0.25 / 9), carb = Math.round((kcal - prot * 4 - fat * 9) / 4);
  const meals = b.appetite === 'petit' ? 5 : b.appetite === 'gros' ? 3 : 4;
  const tips: string[] = [
    `Mange ${kcal} kcal par jour en moyenne, en ${meals} repas/collations. La balance doit monter d'environ ${String(kgWeek).replace('.', ',')} kg par semaine : pèse-toi le matin, à jeun, et regarde la moyenne de la semaine.`,
    `Protéines : ${prot} g par jour (≈ ${Math.round(prot / meals)} g à chaque repas) — poulet, bœuf haché, œufs, thon, skyr, fromage blanc, lentilles.`,
    `Glucides : ${carb} g par jour, surtout avant et après la salle (riz, pâtes, pain, pommes de terre, flocons d'avoine, fruits, dattes).`,
  ];
  if (b.appetite === 'petit') tips.push('Petit appétit : bois une partie de tes calories. Shake maison ≈ 750 kcal / 40 g de protéines : 400 ml de lait entier, 60 g de flocons d\'avoine, 1 banane, 2 c. à soupe de beurre de cacahuète, 1 skyr. Ne bois pas un grand verre d\'eau juste avant de manger.');
  if (b.appetite === 'petit' || b.body === 'maigre') tips.push('Aliments « denses » qui ajoutent des calories sans remplir : huile d\'olive (1 c. à soupe = 120 kcal) dans le riz et les pâtes, noix et amandes, dattes, fromage, avocat, granola.');
  if (b.body === 'gras') tips.push('Tu prends vite du gras : on reste en surplus léger. Si ton tour de taille grossit de plus de 1 cm par mois, on baisse un peu (réglage « rythme »).');
  if (b.body === 'maigre') tips.push('Tu « ne grossis pas » ? En général on mange moins qu\'on ne croit : note TOUT pendant 2 semaines (photo du plat). Si la balance ne bouge pas en 2 semaines, ajoute 200 kcal.');
  tips.push(b.level === 'debutant' ? 'Débutant : c\'est le moment où on prend le plus de muscle. 3 à 4 séances par semaine, et ajoute un peu de charge ou une répétition à chaque séance.' : 'Charge progressive : le surplus ne sert à rien si la barre ne monte pas. Vise +1 répétition ou +2,5 kg chaque semaine sur tes exercices de base.');
  if (b.sports) tips.push(`Tu fais aussi ${b.sports} : les jours où tu en fais, ajoute une collation (≈ 300-400 kcal) pour ne pas « brûler » ta prise de masse.`);
  tips.push('Sommeil 7 à 9 h : c\'est la nuit que le muscle se construit.');
  return { kcal, surplus: BULK_SURPLUS[b.rate], tdee: t.tdee, kgWeek, kgMonth: Math.round(kgWeek * 4.3 * 10) / 10, toGain, weeks, eta, prot, carb, fat, meals, tips, bulk: b, weightKg: p.weightKg, targetKg: p.targetKg };
}

export async function foodBudget(uid: Uid = 'kouider', date = localNow().date): Promise<Budget> {
  const [p, cfg, meals] = await Promise.all([getFormeProfile(uid), foodCfg(uid), mealsOf(uid, date)]);
  const t = formeTargets(p);
  const act = uid === 'kouider' ? await activeFor(date) : { kcal: r0(t.tdee - t.bmr), source: 'estimation' as const };
  // Sorties GPS de FORME ce jour-là : comptées seulement si la montre n'a pas mesuré la journée (sinon déjà dedans)
  const runKcal = act.source === 'montre' ? 0 : await import('./forme-runs.js').then(async m => (await m.runList(uid)).filter(r => r.date === date).reduce((a, r) => a + r.kcal, 0)).catch(() => 0);
  const burn = t.bmr + act.kcal + runKcal;
  const floor = p.sex === 'h' ? 1500 : 1200;
  const eaten = sumOf(meals);
  // 02/11 (Kouider : « il doit noter tout le temps combien j'ai déjà brûlé, instantané ») : base au prorata des minutes
  // écoulées + activité déjà faite (montre si elle a envoyé, sinon moyenne répartie de 6h à 22h, jamais moins que les séances du jour)
  const ln = localNow(), isToday = date === ln.date;
  const minNow = isToday ? Number(ln.hhmm.slice(0, 2)) * 60 + Number(ln.hhmm.slice(3)) : 1440;
  // 04/11 (Kouider : « réveillé à 8h, resté au lit avec mon fils, comment déjà 920 de déficit ? ») : l'activité estimée
  // démarre à SON réveil (montre / raccourci sommeil), pas à 6h ; tant que le réveil est inconnu, rien d'estimé avant 8h
  const wk = isToday ? await readJson<{ date?: string; hhmm?: string } | null>('kouider:woke', null) : null;
  const wakeMin = wk?.date === ln.date && wk.hhmm ? Number(wk.hhmm.slice(0, 2)) * 60 + Number(wk.hhmm.slice(3, 5)) : 480;
  const wakeFrac = Math.max(0, Math.min(1, (minNow - wakeMin) / Math.max(240, 1320 - wakeMin)));
  const watchNow = 'today' in act ? (act.today ?? 0) : 0, woNow = 'woK' in act ? (act.woK ?? 0) : 0;
  const activeNow = !isToday || act.source === 'montre' ? act.kcal + runKcal : r0(Math.max(watchNow, woNow + runKcal, (act.kcal + runKcal) * wakeFrac));
  const live = { burnedNow: r0(t.bmr * minNow / 1440 + activeNow), activeNow, nowSource: (watchNow > 50 && watchNow >= activeNow ? 'montre' : act.source === 'montre' ? 'montre' : 'estimation') as 'montre' | 'estimation', asOf: isToday ? ln.hhmm : '23:59' };
  // Kouider garde son DÉFICIT même si son objectif sport est « muscle » (recompo) — sauf s'il fait lui-même le questionnaire
  if (p.goal === 'muscle' && (uid !== 'kouider' || p.bulk)) {
    // PRISE DE MASSE (01/11, son ami) : dépense + surplus selon le rythme choisi au questionnaire
    const surplus = BULK_SURPLUS[p.bulk?.rate ?? 'moyen'];
    const target = Math.round((burn + surplus) / 10) * 10;
    return { date, bmr: t.bmr, active: act.kcal, activeSource: act.source, burn, deficit: 0, mode: 'surplus', surplus, target, floor, eaten,
      left: target - eaten.kcal, proteinGoal: t.p, proteinLeft: Math.max(0, t.p - eaten.p), pct: Math.round(eaten.kcal / target * 100), meals, ...live, macros: macroRange(target, t.p, p.weightKg) };
  }
  const deficit = Math.min(cfg.deficit, Math.round(burn * 0.25));
  const target = Math.max(floor, Math.round((burn - deficit) / 10) * 10);
  return { date, bmr: t.bmr, active: act.kcal, activeSource: act.source, burn, deficit: burn - target, mode: 'deficit', surplus: 0, target, floor, eaten,
    left: target - eaten.kcal, proteinGoal: t.p, proteinLeft: Math.max(0, t.p - eaten.p), pct: Math.round(eaten.kcal / target * 100), meals, ...live, macros: macroRange(target, t.p, p.weightKg) };
}

/** Ce que coûte un dépassement, en vrai (MET) : marche rapide et pompes, selon son poids. */
export function burnEquivalent(kcal: number, kg: number): string {
  if (kcal <= 0) return '';
  const walkMin = Math.round(kcal / (4.3 * 3.5 * kg / 200));      // marche rapide ~6 km/h
  const stairsMin = Math.round(kcal / (8 * 3.5 * kg / 200));      // escaliers / tapis incliné
  const pompes = Math.round(kcal / (0.0048 * kg));                 // ≈ 0,43 kcal la pompe à 90 kg
  return `≈ ${walkMin} min de marche rapide, ou ${stairsMin} min d'escaliers / tapis incliné${pompes <= 150 ? `, ou ${pompes} pompes (en séries de 10-15)` : ''}`;
}

// ── 🔥 Déficit RÉEL du jour + exercices maison (Kouider 01/11) ─────────────
// « il me montre les calories mais pas combien j'en brûle → je sais pas si j'atteins mon déficit ; vers 21h si je ne suis
// pas en déficit il doit me donner des exercices, sachant que je suis à la maison ». Brûlé = base + montre ; déficit réel =
// brûlé − mangé ; manque = déficit visé − déficit réel. Circuit sans matériel, calculé en MET (pas d'IA = toujours dispo, gratuit),
// intensité modérée (il se couche tôt : rien d'explosif juste avant le lit), jamais de jambes lourdes ni de charge sur le dos.
export interface DeficitStatus { burned: number; eaten: number; real: number; goal: number; missing: number; ok: boolean; measured: boolean }
export function deficitStatus(b: Budget): DeficitStatus {
  const real = b.burn - b.eaten.kcal;
  const goal = b.deficit;
  const missing = Math.max(0, goal - real);
  return { burned: b.burn, eaten: b.eaten.kcal, real, goal, missing, ok: missing <= 30, measured: b.activeSource === 'montre' };
}
export interface HomeBurn { kcal: number; minutes: number; rounds: number; perRound: number; circuit: Array<{ name: string; how: string }>; walkMin: number; capped: boolean; text: string }
const CIRCUIT = [
  { name: 'Marche rapide sur place', how: '1 min, genoux à hauteur des hanches, bras actifs', met: 4.5 },
  { name: 'Jumping jacks (ou pas chassés)', how: '1 min, sans sauter si ça tire au dos', met: 7.5 },
  { name: 'Shadow boxing', how: '1 min, directs + crochets, poings rapides', met: 6 },
  { name: 'Pompes', how: '45 s (sur les genoux si besoin) + 15 s de repos', met: 4 },
  { name: 'Gainage planche', how: '45 s + 15 s de repos, ventre serré, dos droit', met: 3.8 },
];
export function homeBurnPlan(kcal: number, kg: number): HomeBurn {
  const perMin = (met: number) => met * 3.5 * kg / 200;
  const perRound = Math.round(CIRCUIT.reduce((a, c) => a + perMin(c.met), 0));        // 5 min par tour
  const want = Math.max(1, Math.ceil(kcal / perRound));
  const rounds = Math.min(6, want);                                                     // 30 min max le soir
  const minutes = rounds * 5;
  const walkMin = Math.round(kcal / perMin(4.3));
  const capped = want > rounds;
  const text = [`🏠 Circuit maison (sans matériel) : ${rounds} tour${rounds > 1 ? 's' : ''} de 5 min = ${minutes} min ≈ ${rounds * perRound} kcal`,
    ...CIRCUIT.map((c, i) => `${i + 1}. ${c.name} — ${c.how}`),
    'Entre deux tours : 30 s pour boire. Commence doucement le 1er tour (échauffement).',
    `Ou à la place : ${walkMin} min de marche rapide dehors (≈ 6 km/h).`,
    capped ? `⚠️ Il manque ${kcal} kcal : plus que ce qu'on brûle raisonnablement ce soir. Fais les ${minutes} min, et le reste n'est pas grave : demain on reprend normalement (jamais sauter un repas pour compenser).` : '',
    'Douleur au dos ou vertige → stop.'].filter(Boolean).join('\n');
  return { kcal, minutes, rounds, perRound, circuit: CIRCUIT.map(({ name, how }) => ({ name, how })), walkMin, capped, text };
}
/** Message du soir (21h) ou à la demande : déficit tenu ? sinon les exercices maison pour l'atteindre. */
export async function deficitCheckText(uid: Uid = 'kouider', forJob = false): Promise<string | null> {
  const b = await foodBudget(uid);
  if (b.mode !== 'deficit') return forJob ? null : 'Objectif prise de masse : pas de déficit à atteindre.';
  const d = deficitStatus(b);
  if (forJob && !b.meals.length) return null;    // rien noté aujourd'hui : on ne peut pas juger, on ne l'embête pas
  const src = d.measured ? 'mesuré par ta montre' : 'estimé : ta montre n\'a pas encore envoyé ta journée, lance le raccourci « Dzaryx Santé » pour le chiffre exact';
  const head = `🔥 Bilan ${localNow().hhmm}\nBrûlé : ${d.burned} kcal (${src})\nMangé : ${d.eaten} kcal\n→ Déficit réel : ${d.real >= 0 ? d.real : `0 (tu es ${-d.real} kcal AU-DESSUS de ta dépense)`} / ${d.goal} kcal visés`;
  if (d.ok) return forJob ? null : `${head}\n✅ Déficit atteint, bravo ! Rien à rattraper ce soir.`;
  const kg = (await getFormeProfile(uid)).weightKg;
  return `${head}\n⚠️ Il te manque ${d.missing} kcal pour ton déficit.\n\n${homeBurnPlan(d.missing, kg).text}\n\nDis-moi « c'est fait » quand tu as fini 💪`;
}

// ── Photo d'un plat → aliments + macros ─────────────────────────────────────
export const VISION_PROMPT = (note: string) => `Tu es un nutritionniste expert du comptage de calories par photo (comme l'appli Cal AI), spécialiste de la cuisine algérienne / maghrébine (couscous, chorba, hrira, karantika, rechta, chakhchoukha, loubia, mhadjeb, garantita, tajines, msemen, kesra, bourek, makrout…), belge et fast-food halal (tacos, kebab, pizza…).
Regarde la photo et liste CHAQUE aliment visible. Pour chacun, estime le POIDS en grammes à partir des repères (assiette ~26 cm, couverts, main, emballage, verre 25 cl), en comptant l'huile / le beurre / la sauce de cuisson probables, puis calcule kcal, protéines, glucides et lipides avec les tables nutritionnelles classiques (CIQUAL / USDA).
PRODUIT EXACT : si un emballage, une marque ou une étiquette est lisible, écris la marque + le nom exact du produit (ex. « Thon entier à l'huile Petit Navire », « Skyr nature Danone ») et utilise les valeurs nutritionnelles imprimées (pour 100 g) ; si un code-barres est lisible, recopie ses chiffres dans "barcode". Sinon, nomme précisément ce que tu vois (« thon en boîte à l'huile égoutté » ≠ « steak de thon grillé », « pain de mie » ≠ « baguette » ≠ « kesra »).
Repères de poids : 1 œuf ≈ 50 g sans coquille ; 1 tranche de pain de mie ≈ 25 g ; 1 tranche de pain/baguette ≈ 30-35 g ; une miche de pain maison ≈ 600-800 g (1/4 ≈ 150-200 g) ; 1 galette de kesra ≈ 300-400 g ; 1 boîte de thon ≈ 110-140 g égoutté ; 1 c. à soupe d'huile ≈ 10 g = 90 kcal.
COMPTE avant d'estimer : nombre d'œufs (= nombre de jaunes), de tranches, de morceaux, de cuillères ; puis la taille de chaque portion par rapport à l'assiette / la poêle / la main. Un aliment caché ou empilé (sous une tranche, dans la sauce) compte aussi.
PROTÉINES précises (c'est ce qu'il suit pour sa sèche) : œuf 6,5 g/pièce ; viande/poulet/poisson cuits 25-30 g/100 g ; thon en boîte 25 g/100 g ; fromage blanc/skyr 8-10 g/100 g ; pain 8-9 g/100 g ; légumineuses cuites 7-9 g/100 g. Vérifie que kcal ≈ 4×P + 4×G + 9×L.
Si tu HÉSITES sur ce qu'est un aliment (ex. msemen ou fromage fondu, poulet ou dinde, frit ou grillé), choisis le plus probable ET pose la question.
Si un aliment est AMBIGU et que ça change beaucoup les chiffres (nom qui n'existe pas ou mal dicté, cuisson inconnue, taille de portion floue), garde l'hypothèse la plus probable, dis-la dans "assumptions" et pose UNE question courte dans "question" (sinon "").
Sois précis et réaliste, ni optimiste ni pessimiste. Boisson visible = un aliment aussi, mais l'EAU seule n'est pas un repas (0 kcal, ne la liste pas).${note ? `\nCe que Kouider précise (PRIORITAIRE sur ton estimation : quantités, sans huile, etc.) : « ${note} »` : ''}
Réponds UNIQUEMENT en JSON : {"title":"nom court du plat en français","items":[{"name":"aliment","grams":0,"kcal":0,"p":0,"c":0,"f":0}],"confidence":"haute|moyenne|basse","barcode":"","assumptions":"hypothèses faites, courtes (ou vide)","question":"","tip":"1 remarque utile en 1 phrase (ex. la sauce pèse lourd)"}
Si la photo ne montre pas de nourriture : {"title":"","items":[],"confidence":"basse","tip":"pas de nourriture visible"}`;

interface RawMeal { title?: string; items?: Array<Partial<FoodPart>>; confidence?: string; tip?: string; barcode?: string; assumptions?: string; question?: string }
function cleanItems(items: RawMeal['items']): FoodPart[] {
  return (items ?? []).slice(0, 15).map(x => ({
    name: String(x.name ?? '').slice(0, 60), grams: Math.max(0, r0(x.grams ?? 0)),
    kcal: Math.max(0, r0(x.kcal ?? 0)), p: Math.max(0, r0(x.p ?? 0)), c: Math.max(0, r0(x.c ?? 0)), f: Math.max(0, r0(x.f ?? 0)),
  })).filter(x => x.name && x.kcal >= 0 && !(x.kcal === 0 && /^eau\b/i.test(x.name)))   // l'eau n'est pas un repas (01/11 : « 1 L d'eau » noté comme repas)
    // garde-fou : kcal cohérentes avec les macros (4/4/9) si le modèle s'est trompé de beaucoup
    .map(x => { const m = x.p * 4 + x.c * 4 + x.f * 9; return m > 30 && Math.abs(m - x.kcal) / m > 0.35 ? { ...x, kcal: m } : x; });
}

async function storeMeal(uid: Uid, raw: RawMeal, o: { src: MealLog['src']; note?: string; thumb?: string; slot?: MealSlot; date?: string }): Promise<MealLog> {
  const items = cleanItems(raw.items);
  if (!items.length && ((raw.items ?? []).some(x => /^eau\b/i.test(String(x.name ?? ''))) || /\beau\b/i.test(o.note ?? ''))) throw new Error('💧 De l\'eau = 0 kcal, je ne la compte pas comme un repas. Bien joué pour l\'hydratation !');
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
    ...(raw.assumptions ? { assumptions: String(raw.assumptions).slice(0, 220) } : {}),
    ...(raw.question ? { question: String(raw.question).slice(0, 200) } : {}),
  };
  await saveMeals(uid, date, [...await mealsOf(uid, date), meal]);
  return meal;
}

/** Code-barres lisible sur la photo → vraies valeurs Open Food Facts (gratuit) pour le 1er article, au poids estimé. */
async function applyBarcode(j: RawMeal): Promise<void> {
  const code = String(j.barcode ?? '').replace(/\D/g, '');
  if (!/^\d{8}$|^\d{12,14}$/.test(code) || !j.items?.length) return;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments`, { headers: { 'User-Agent': 'Dzaryx-FORME/1.0' }, signal: AbortSignal.timeout(6000) });
    const d = await r.json() as { status?: number; product?: { product_name?: string; brands?: string; nutriments?: Record<string, number> } };
    const n = d.product?.nutriments; if (d.status !== 1 || !n || !Number.isFinite(n['energy-kcal_100g'])) return;
    const it = j.items[0]!; const g = Number(it.grams) || 100, k = g / 100;
    Object.assign(it, { name: `${d.product!.brands ? `${d.product!.brands.split(',')[0]} – ` : ''}${d.product!.product_name || it.name}`.slice(0, 60),
      kcal: n['energy-kcal_100g']! * k, p: (n.proteins_100g ?? 0) * k, c: (n.carbohydrates_100g ?? 0) * k, f: (n.fat_100g ?? 0) * k });
    j.confidence = 'haute';
    j.assumptions = [`valeurs officielles du produit (code-barres ${code}) pour ${g} g`, j.assumptions].filter(Boolean).join(' ; ');
  } catch { /* hors ligne : on garde l'estimation */ }
}

export async function analyzeMealPhoto(uid: Uid, img: { base64: string; mime: string }, o: { note?: string; thumb?: string; slot?: MealSlot } = {}): Promise<{ meal: MealLog; budget: Budget; message: string }> {
  const { vision, jsonOf } = await import('./media-util.js');
  const raw = await vision([img], VISION_PROMPT(o.note ?? ''), { quality: true, maxTokens: 1400 });
  const j = jsonOf<RawMeal>(raw);
  if (!j) throw new Error('Je n\'ai pas réussi à lire la photo — réessaie avec toute l\'assiette dans le cadre, bien éclairée.');
  await applyBarcode(j);
  const meal = await storeMeal(uid, j, { src: 'photo', ...o });
  return afterMeal(uid, meal);
}

/** « J'ai mangé 2 œufs et une tartine » (tool / app) → même calcul, sans photo. */
export async function logMealText(uid: Uid, text: string, slot?: MealSlot): Promise<{ meal: MealLog; budget: Budget; message: string }> {
  const { ai, jsonOf } = await import('./ai-util.js');
  const raw = await ai(`${VISION_PROMPT(text).replace('Regarde la photo et liste CHAQUE aliment visible.', `Voici ce qu'il a mangé (pas de photo) : « ${text} ». Liste chaque aliment, avec une portion normale si la quantité n'est pas dite.`)}`, { quality: true, max: 1200 });
  const j = jsonOf<RawMeal>(raw);
  if (!j) throw new Error('Je n\'ai pas compris ce repas — redis-le avec les quantités.');
  // Même repas déjà noté il y a moins de 5 min (03/11 : « 250 g de skyr » noté 2× à 24 s d'écart — le cerveau a rappelé
  // meal_text) → on ne le compte pas une 2e fois
  const kcalNew = cleanItems(j.items).reduce((a, x) => a + x.kcal, 0);
  const twin = (await mealsOf(uid)).find(m => m.src === 'texte' && Date.now() - m.at < 5 * 60_000 && kcalNew > 0 && Math.abs(m.kcal - kcalNew) <= Math.max(25, kcalNew * 0.15));
  if (twin) { const b = await foodBudget(uid, twin.date); return { meal: twin, budget: b, message: `ℹ️ Déjà noté à ${twin.time} : ${twin.title} (${twin.kcal} kcal) — PAS compté une 2e fois. Si c'en est vraiment un autre, redis-le dans 5 min.` }; }
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
/** « Non c'est du thon en boîte », « le pain c'était 200 g » → corrige le DERNIER repas (ou celui dont le titre correspond). */
export async function fixMeal(uid: Uid, text: string, o: { date?: string; id?: string } = {}): Promise<string> {
  const date = o.date ?? localNow().date;
  const meals = await mealsOf(uid, date);
  if (!meals.length) return 'Aucun repas noté aujourd\'hui à corriger.';
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const m = (o.id && meals.find(x => x.id === o.id))
    || [...meals].reverse().find(x => words.some(w => `${x.title} ${x.items.map(i => i.name).join(' ')}`.toLowerCase().includes(w)))
    || meals[meals.length - 1]!;
  const { ai, jsonOf } = await import('./ai-util.js');
  const prompt = `${VISION_PROMPT(text).replace('Regarde la photo et liste CHAQUE aliment visible.', `Repas déjà noté « ${m.title} » : ${JSON.stringify(m.items)}${m.note ? ` (il avait dit : « ${m.note} »)` : ''}. Il CORRIGE : « ${text} ». Refais la liste COMPLÈTE corrigée (garde ce qu'il ne change pas, remplace ce qu'il corrige, ajoute ce qu'il ajoute).`)}`;
  const j = jsonOf<RawMeal>(await ai(prompt, { quality: true, max: 1200 }));
  const items = cleanItems(j?.items);
  if (!items.length) return 'Je n\'ai pas compris la correction — redis-moi l\'aliment et la quantité.';
  const before = m.kcal;
  m.items = items; Object.assign(m, sumOf(items));
  if (j?.title) m.title = String(j.title).slice(0, 70);
  m.note = [m.note, `correction : ${text}`].filter(Boolean).join(' · ').slice(0, 300);
  delete m.question; if (j?.assumptions) m.assumptions = String(j.assumptions).slice(0, 220); else delete m.assumptions;
  if (m.confidence === 'basse') m.confidence = 'moyenne';
  await saveMeals(uid, date, meals);
  const b = await foodBudget(uid, date);
  return `✏️ Corrigé : ${m.title} — ${m.kcal} kcal (avant ${before}) · ${m.p} g protéines\n${items.map(i => `• ${i.name} ${i.grams} g : ${i.kcal} kcal · ${i.p} g P`).join('\n')}${j?.question ? `\n❓ ${j.question}` : ''}\n\n📊 Aujourd'hui : ${b.eaten.kcal} / ${b.target} kcal · protéines ${b.eaten.p}/${b.proteinGoal} g → ${b.left >= 0 ? `il te reste ${b.left} kcal` : `dépassé de ${-b.left} kcal`}.`;
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

async function coachSay(facts: string, ask: string, max = 450, uid: Uid = 'kouider'): Promise<string> {
  const { ai } = await import('./ai-util.js');
  return (await ai(`${facts}\n\n${ask}`, { system: await coachSys(uid), max }).catch(() => '')).replace(/\*\*/g, '').trim();
}
/** Coach de chacun : Kouider = Dzaryx (déficit) ; sa femme / son ami = coach FORME neutre, selon SON objectif */
async function coachSys(uid: Uid): Promise<string> {
  if (uid === 'kouider') return COACH_SYS;
  const p = await getFormeProfile(uid);
  const goal = p.goal === 'muscle' ? 'PRENDRE DU MUSCLE (prise de masse) : il/elle doit manger ASSEZ — atteindre son objectif de calories et de protéines chaque jour est la priorité ; ne jamais lui dire de manger moins ou de faire du sport pour « compenser »'
    : 'rester en DÉFICIT CALORIQUE sans perdre de muscle (protéines hautes)';
  return `Tu es le coach nutrition de l'appli FORME${p.name ? ` de ${p.name}` : ''}. Chaleureux, direct, tutoiement, ${p.lang === 'ar' ? 'arabe littéraire simple' : 'français simple'}, phrases courtes, quelques emojis, pas de markdown.
Son but : ${goal}. Tu utilises UNIQUEMENT les chiffres donnés, tu n'inventes rien.
Idées de repas : simples, halal, faciles à trouver en Belgique (Colruyt, Lidl, boucherie halal) ou faits maison, avec les kcal et protéines approximatives.
Sécurité : jamais de régime extrême ; jamais de conseil sur un médicament (→ médecin).`;
}

export function budgetFacts(b: Budget): string {
  return [`Date ${b.date}, heure ${localNow().hhmm}.`,
    `Dépense estimée du jour : ${b.burn} kcal (base ${b.bmr} + activité ${b.active} ${b.activeSource === 'montre' ? 'mesurée par sa montre' : b.activeSource === 'moyenne' ? '(moyenne de ses 14 derniers jours sur la montre)' : '(estimation, pas encore de données montre)'}).`,
    b.mode === 'surplus' ? `Objectif PRISE DE MASSE : manger AU MOINS ${b.target} kcal (surplus de ${b.surplus} kcal au-dessus de sa dépense).` : `Objectif pour être en déficit : ${b.target} kcal (déficit ${b.deficit} kcal ; plancher de sécurité ${b.floor}).`,
    `Mangé : ${b.eaten.kcal} kcal (${b.pct} %), protéines ${b.eaten.p}/${b.proteinGoal} g, glucides ${b.eaten.c} g (fourchette du jour ${b.macros?.carbMin}–${b.macros?.carbMax} g), lipides ${b.eaten.f} g (fourchette ${b.macros?.fatMin}–${b.macros?.fatMax} g).`,
    `Il reste : ${b.left} kcal et ${b.proteinLeft} g de protéines.`,
    b.meals.length ? `Repas du jour : ${b.meals.map(m => `${m.time} ${SLOT_LABEL[m.slot]} « ${m.title} » ${m.kcal} kcal / ${m.p} g P`).join(' ; ')}.` : 'Aucun repas noté aujourd\'hui.'].join('\n');
}

async function afterMeal(uid: Uid, meal: MealLog): Promise<{ meal: MealLog; budget: Budget; message: string }> {
  const b = await foodBudget(uid, meal.date);
  const kg = (await getFormeProfile(uid)).weightKg;
  const over = -b.left;
  const surplus = b.mode === 'surplus';
  const head = `🍽️ ${meal.title} — ${meal.kcal} kcal · ${meal.p} g protéines · ${meal.c} g glucides · ${meal.f} g lipides${meal.confidence === 'basse' ? ' (estimation peu sûre : corrige les grammes dans FORME si besoin)' : ''}\n${meal.items.map(i => `• ${i.name} ${i.grams} g : ${i.kcal} kcal · ${i.p} g P`).join('\n')}${meal.assumptions ? `\nℹ️ J'ai compté : ${meal.assumptions}` : ''}${meal.question ? `\n❓ ${meal.question} (réponds-moi et je corrige)` : ''}\n\n📊 Aujourd'hui : ${b.eaten.kcal} / ${b.target} kcal · protéines ${b.eaten.p}/${b.proteinGoal} g → ${b.left >= 0 ? `il te reste ${b.left} kcal${surplus ? ' à manger' : ''}` : surplus ? `objectif atteint ✅ (+${over} kcal)` : `tu as dépassé de ${over} kcal`}.`;
  const hh = Number(localNow().hhmm.slice(0, 2));
  const ask = surplus
    ? (b.left <= 0
      ? `Objectif de la journée ATTEINT (${b.eaten.kcal}/${b.target} kcal). Félicite-le en 2-3 phrases${-b.left > 600 ? ` ; il est ${-b.left} kcal au-dessus : pas grave pour une prise de masse, mais dis-lui de ne pas dépasser autant tous les jours (sinon du gras en plus du muscle)` : ''} ; protéines ${b.eaten.p}/${b.proteinGoal} g${b.proteinLeft > 0 ? ` — il manque ${b.proteinLeft} g de protéines, propose 1 idée` : ''}.`
      : hh >= 18 && b.pct < 70
        ? `Il est ${localNow().hhmm} et il n'a mangé que ${b.pct} % de son objectif : il lui manque ${b.left} kcal pour prendre du muscle aujourd'hui. Dis-le-lui gentiment mais clairement en 3-4 phrases et propose 2 idées CONCRÈTES riches en calories et faciles à avaler ce soir (ex. shake lait + avoine + banane + beurre de cacahuète, plat de riz/pâtes avec huile d'olive, dattes + amandes), avec les kcal.`
        : `En 2-3 phrases : un retour sur ce repas (assez de protéines ? assez de calories pour une prise de masse ?), puis ce qu'il lui reste à manger aujourd'hui (${b.left} kcal, ${b.proteinLeft} g de protéines) avec 1 idée de prochain repas bien calorique.`)
    : over > 0
    ? `Ce repas le fait DÉPASSER son objectif de ${over} kcal. Équivalent pour rattraper : ${burnEquivalent(over, kg)}. Dis-le calmement en 3-4 phrases : pas de drame, ce qu'il peut faire (une des options sport chiffrées ci-dessus OU accepter un jour au maintien), et ce qu'il mange encore aujourd'hui s'il a faim (très léger, protéiné).`
    : b.pct >= 75
      ? `Il approche de la limite (${b.pct} %). Avertis-le en 3-4 phrases : « fais attention, laisse de la place pour ce soir », et propose 2 idées précises pour le reste de la journée qui tiennent dans ${b.left} kcal avec le plus de protéines possible.`
      : `En 2-3 phrases : un retour sur ce repas (protéines suffisantes ? bon choix ?), puis ce qu'il garde pour la suite (${b.left} kcal, ${b.proteinLeft} g de protéines) avec 1 idée pour le prochain repas.`;
  const say = await coachSay(`${budgetFacts(b)}\nRepas qu'il vient d'envoyer : ${meal.title} (${meal.items.map(i => `${i.name} ${i.grams} g`).join(', ')})${meal.coach ? ` — remarque : ${meal.coach}` : ''}.`, ask, 450, uid);
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
  // 04/11 banc : photo + « je peux manger ça ce soir ? » → le repas était ENREGISTRÉ comme mangé. Question / hésitation
  // → on regarde la photo, on donne kcal + reste du jour, RIEN n'est noté.
  const ask = `${ph.caption ?? ''} ${note}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(je peux|j'?peux|est-ce que|est ce que|si je mange|je mange (ca|ça)\s*\?|c'?est bon pour|ca passe|ça passe|je devrais|tu me conseilles|ca rentre|combien de (calories|kcal))\b|\?\s*$/.test(ask)
      && !/\b(j'?ai mange|je viens de manger|je mange (ca|ça)$|note|enregistre)\b/.test(ask)) {
    const { vision } = await import('./media-util.js');
    const seen = await vision([{ base64: ph.b64, mime: ph.mime }], 'Décris en une phrase en français ce qu\'il y a à manger sur cette photo, avec les quantités visibles (ex. « 3 parts de pizza aux légumes et fromage »). Rien d\'autre.', { quality: true, maxTokens: 200 }).catch(() => '');
    if (seen) return `${await checkFood(seen.trim())}\n\n(Pas noté dans FORME : dis « je l'ai mangé » pour l'enregistrer.)`;
  }
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
  // 01/11 : le raccourci part bien à l'alarme mais la case « sleep » arrive vide → le dire tel quel (ce n'est pas la montre)
  const sentEmpty = !t?.sleep_h && t && await kvGet('health:lastraw:any').then(r => /"sleep\\?"\s*:\s*\\?"\\?"/.test(String(r ?? ''))).catch(() => false);
  const sleepLine = t?.sleep_h ? `Sommeil cette nuit (${(t as { sleep_src?: string }).sleep_src === 'telephone' ? 'estimé par le téléphone : coucher → réveil, sans montre' : 'Apple Watch'}) : ${t.sleep_h} h${usual ? ` (moyenne habituelle ${usual} h)` : ''}${t.hrv ? `, VFC ${t.hrv} ms` : ''}${t.rhr ? `, cœur au repos ${t.rhr}` : ''}.` : sentEmpty ? 'Sommeil de cette nuit : le raccourci Santé a bien envoyé ce matin (cœur, VFC, pas OK) MAIS la case sommeil était VIDE — le réglage « sommeil » du raccourci est à corriger (pas la montre). Demande-lui simplement combien il a dormi (« j\'ai dormi 7 h » suffit).' : 'Sommeil de cette nuit : PAS ENCORE REÇU (le raccourci Santé n\'a rien envoyé ce matin).';
  const week = await import('./sleep-coach.js').then(m => m.sleepContextLine()).catch(() => '');
  const ready = await import('./workout-live.js').then(m => m.readiness()).then(r => r?.line ?? '').catch(() => '');
  // Nuit courte → la séance du jour s'allège toute seule (comme pour le cœur / la VFC)
  let lighter = '';
  if (t?.sleep_h && t.sleep_h < 6) {
    const r = await import('./sport-coach.js').then(m => m.setFormFromWatch(date, 2)).catch(() => null);
    if (r && !/pas de séance/i.test(r)) lighter = 'La séance du jour vient d\'être passée en version courte et légère automatiquement (−10 % sur les charges).';
  }
  const facts = [sleepLine, week ? `Semaine : ${week}` : '', ready, lighter, yLine, `Budget d'aujourd'hui : ${b.target} kcal (déficit ${b.deficit}), protéines ${b.proteinGoal} g.`, await dayContext(date)].filter(Boolean).join('\n');
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
  const adv = await import('./sleep-coach.js').then(m => m.bedtimeAdvance()).catch(() => ({ minutes: 0, why: '' }));
  const bed = wake ? (() => { const [h, m] = wake.split(':').map(Number); const t = (h! * 60 + m! - 7.5 * 60 - 15 - adv.minutes + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })() : null;
  const all = await health();
  const last = all.find(x => x.date === date)?.sleep_h;
  const facts = [budgetFacts(b), wake ? `Réveil demain : ${wake} → pour 7 h 30 de sommeil il doit être au lit vers ${bed}${adv.minutes ? ` (avancé de ${adv.minutes} min : ${adv.why})` : ''}.` : '', last ? `Nuit dernière : ${last} h.` : '', await dayContext(addDays(date, 1)).then(x => x ? `DEMAIN — ${x}` : '')].filter(Boolean).join('\n');
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
  // 21h : pas en déficit → exercices maison pour l'atteindre (avant le message du coucher)
  if (at('21:00') && !at('22:00') && await once('deficit-21h', date, () => deficitCheckText('kouider', true))) sent.push('déficit 21h');
  if (at('21:00') && !at('22:30') && await once('evening', date, eveningSleepMessage)) sent.push('soir');
  return sent.join(', ') || 'rien';
}

/** Ligne pour le dossier de Dzaryx (chat, appels) : où il en est aujourd'hui. */
export async function foodText(): Promise<string> {
  const cfg = await foodCfg();
  if (!cfg.on) return 'COMPTEUR CALORIES FORME : coupé par Kouider.';
  const b = await foodBudget('kouider');
  return `COMPTEUR CALORIES (FORME → Repas, photo du plat ; objectif = rester en DÉFICIT) : ${b.eaten.kcal}/${b.target} kcal aujourd'hui (dépense ${b.burn}, déficit visé ${b.deficit}), protéines ${b.eaten.p}/${b.proteinGoal} g, glucides ${b.eaten.c} g (${b.macros?.carbMin}–${b.macros?.carbMax}), lipides ${b.eaten.f} g (${b.macros?.fatMin}–${b.macros?.fatMax}), reste ${b.left} kcal. Déficit VISÉ = minimum à garder en mangeant tout son budget ; déficit RÉEL = brûlé − mangé (plus grand s'il ne mange plus).${b.meals.length ? ` Repas : ${b.meals.map(m => `${m.time} ${m.title} ${m.kcal} kcal`).join(' ; ')}.` : ''} ${(() => { const d = deficitStatus(b); return ` BRÛLÉ aujourd'hui ${d.burned} kcal (${d.measured ? 'montre' : 'estimé'}) − mangé ${d.eaten} = DÉFICIT RÉEL ${d.real} / ${d.goal} visés${d.ok ? ' ✅' : ` → il manque ${d.missing} kcal`}.`; })()} Outil forme : meal_photo (photo de plat sur Telegram), meal_text (« j'ai mangé… »), food_check (« si je mange ça ? »), food_today, food_settings, home_burn (« je suis en déficit ? », « donne-moi des exos pour mon déficit » → bilan brûlé/mangé + circuit maison chiffré).`;
}

/** 04/11 (Kouider : « il me dit que les trucs d'aujourd'hui, pas de la semaine et les jours passés ») : 7 derniers jours. */
export interface FoodDay { date: string; eaten: number; p: number; proteinGoal: number; burn: number; real: number; goal: number; mode: 'deficit' | 'surplus'; measured: boolean; meals: number; today: boolean }
export async function foodWeek(uid: Uid = 'kouider', days = 7): Promise<{ days: FoodDay[]; avgReal: number | null; logged: number }> {
  const today = localNow().date;
  const list = await Promise.all(Array.from({ length: days }, (_, i) => addDays(today, -i)).map(async date => {
    const b = await foodBudget(uid, date);
    const burn = date === today ? (b.burnedNow ?? b.burn) : b.burn;
    return { date, eaten: b.eaten.kcal, p: b.eaten.p, proteinGoal: b.proteinGoal, burn, real: burn - b.eaten.kcal, goal: b.mode === 'surplus' ? b.surplus : b.deficit, mode: b.mode, measured: b.activeSource === 'montre', meals: b.meals.length, today: date === today } satisfies FoodDay;
  }));
  // moyenne seulement sur les jours finis où il a noté des repas (un jour sans repas noté = déficit faux)
  const done = list.filter(d => !d.today && d.meals > 0);
  return { days: list, avgReal: done.length ? r0(done.reduce((a, d) => a + d.real, 0) / done.length) : null, logged: done.length };
}
