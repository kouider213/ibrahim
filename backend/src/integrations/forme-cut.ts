/**
 * 🔪 SÈCHE (Kouider 01/11 : « remplace la page Course par une page musculation + sèche, analyse 20 applis, la nôtre doit être
 * meilleure qu'elles toutes »). Tout est calculé sur SES vraies données, sans IA (gratuit, toujours dispo) :
 *  - poids TENDANCE lissé (Happy Scale / MacroFactor / Libra) au lieu du chiffre de la balance qui saute d'un jour à l'autre
 *  - vitesse de perte en % du poids / semaine, zone sûre 0,5-1 % (RP Diet / Carbon / MacroFactor)
 *  - DÉPENSE ADAPTATIVE (MacroFactor) : mangé réel + variation de la tendance → vraie dépense, comparée à la montre
 *  - force pendant la sèche : 1RM estimé (Epley) des exos principaux (Hevy / Strong / Alpha Progression) → alerte si ça baisse
 *  - score du jour : déficit + protéines + muscu + pas + sommeil (Whoop / Gravl / Fitbod)
 *  - bilan de la semaine avec UNE décision chiffrée qu'il applique d'un bouton (Carbon / MacroFactor check-in)
 *  - date d'arrivée à l'objectif, tour de taille, pause diète conseillée après 12 semaines ou si la force chute (RP Diet)
 * Ce qu'aucune de ces applis ne fait à la fois : la montre + le coach Telegram/appel + photo du plat algérien + séance
 * adaptée à la nuit, tout au même endroit. VIE PRIVÉE : dépôt public → données dans app_kv seulement.
 */
import { kvGet, kvSet } from './app-store.js';
import { localNow } from './morning-routine.js';
import { getFormeProfile, type Uid } from './forme.js';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const json = async <T,>(k: string, f: T): Promise<T> => { try { return (JSON.parse((await kvGet(k)) ?? 'null') as T) ?? f; } catch { return f; } };
const r1 = (n: number) => Math.round(n * 10) / 10;
const START_K = (u: Uid) => `${u}:forme:cutstart`;

interface Day { weight?: number; measures?: Record<string, number>; workout?: { label: string } }
interface Lift { name: string; now: number; before: number | null; pct: number | null; date: string }

/** Tendance lissée (moyenne mobile exponentielle, ~10 % par jour, trous comblés) */
function trendOf(w: Array<{ date: string; kg: number }>) {
  const out: Array<{ date: string; kg: number; trend: number }> = [];
  let t = 0, last = '';
  for (const x of w) {
    if (!last) t = x.kg;
    else { const gap = Math.max(1, dayDiff(last, x.date)); const a = 1 - Math.pow(0.9, gap); t = t + a * (x.kg - t); }
    out.push({ ...x, trend: r1(t * 10) / 10 }); last = x.date;
  }
  return out;
}
const trendAt = (tr: Array<{ date: string; trend: number }>, date: string) => [...tr].reverse().find(x => x.date <= date)?.trend ?? null;

/** 09/11 — UN SEUL rythme de perte pour toute l'app (Progrès disait « 2 kg/sem, arrivée le 16/11 », Sèche « 1,17 kg/sem, le 21/11 ») :
 *  vitesse sur la tendance lissée des 7 derniers jours (l'eau du jour ne compte pas), pas « 1re pesée − dernière pesée ». */
export function weightPace(weights: Array<{ date: string; kg: number }>, today: string, fallbackKg: number): { rateWeek: number | null; trend: number; real: number } {
  const tr = trendOf(weights);
  const cur = tr.length ? tr[tr.length - 1]!.trend : fallbackKg;
  const wAgo = trendAt(tr, addDays(today, -7));
  const rateWeek = wAgo != null && weights.length >= 5 && dayDiff(weights[0]!.date, today) >= 7 ? r1((wAgo - cur) * 10) / 10 : null;
  return { rateWeek, trend: cur, real: weights.length ? weights[weights.length - 1]!.kg : fallbackKg };
}

export async function cutStatus(uid: Uid = 'kouider') {
  const today = localNow().date;
  const p = await getFormeProfile(uid);
  const days = await json<Record<string, Day>>(`${uid}:forme:days`, {});
  const weights = Object.entries(days).filter(([, d]) => d.weight).map(([date, d]) => ({ date, kg: d.weight! })).sort((a, b) => a.date.localeCompare(b.date));
  const tr = trendOf(weights);
  const pace = weightPace(weights, today, p.weightKg);
  const cur = pace.trend;          // tendance lissée → sert seulement à la vitesse
  // 07/11 Kouider : « il dit 79,4 alors que je me suis pesé à 78 hier » → le poids affiché = sa DERNIÈRE vraie pesée, pas la tendance
  const real = pace.real;
  const wAgo = trendAt(tr, addDays(today, -7)), w2Ago = trendAt(tr, addDays(today, -14));
  const rateWeek = pace.rateWeek;          // kg perdus / semaine (+ = perte)
  const ratePct = rateWeek != null ? Math.round(rateWeek / cur * 1000) / 10 : null;
  const prevRate = w2Ago != null && wAgo != null ? Math.round((w2Ago - wAgo) * 100) / 100 : null;

  // Mangé + dépense des 14 derniers jours (jours où il a noté au moins 2 repas = jour « complet »)
  const f = await import('./forme-food.js');
  const cfg = await f.foodCfg(uid);
  const hist: Array<{ date: string; eaten: number; p: number; burn: number; target: number; pGoal: number; complete: boolean }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const b = await f.foodBudget(uid, d);
    hist.push({ date: d, eaten: b.eaten.kcal, p: b.eaten.p, burn: b.burn, target: b.target, pGoal: b.proteinGoal, complete: b.meals.length >= 2 });
  }
  const full = hist.filter(h => h.complete && h.date < today);
  const avgEaten = full.length ? Math.round(full.reduce((a, h) => a + h.eaten, 0) / full.length) : null;
  const avgBurnWatch = full.length ? Math.round(full.reduce((a, h) => a + h.burn, 0) / full.length) : null;
  // Dépense adaptative : il faut ≥ 10 jours notés ET ≥ 10 jours de tendance de poids
  let adaptive: { tdee: number; vsWatch: number; days: number } | null = null;
  if (full.length >= 10 && tr.length >= 4) {
    const a = full[0]!.date, z = full[full.length - 1]!.date;
    const ta = trendAt(tr, a), tz = trendAt(tr, z), n = dayDiff(a, z);
    if (ta != null && tz != null && n >= 9) {
      const tdee = Math.round(avgEaten! + (ta - tz) * 7700 / n);
      adaptive = { tdee, vsWatch: tdee - avgBurnWatch!, days: full.length };
    }
  }

  // 7 derniers jours : déficit tenu ? protéines ? (aujourd'hui compris pour l'affichage)
  const week = hist.slice(-7).map(h => ({ date: h.date, logged: h.complete, deficitOk: h.complete && h.eaten <= h.target + 50, proteinOk: h.p >= h.pGoal * 0.9 }));

  // Force pendant la sèche : 1RM estimé (Epley) — journal du coach + fiches FORME
  const best = new Map<string, Array<{ date: string; e1: number }>>();
  const pretty = (n: string) => { const t = n.replace(/[_-]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const push = (raw: string, date: string, kg?: number, reps?: number) => {
    if (!kg || !reps || reps > 15 || kg < 5) return;
    const name = pretty(raw);
    const e1 = kg * (1 + reps / 30);
    const l = best.get(name) ?? []; const same = l.find(x => x.date === date);
    if (same) same.e1 = Math.max(same.e1, e1); else l.push({ date, e1 }); best.set(name, l);
  };
  if (uid === 'kouider') {
    const log = await import('./sport-coach.js').then(m => m.readSportLog()).catch(() => []);
    for (const s of log) for (const x of s.sets ?? []) push(x.ex, s.date, x.kg, x.reps);
  }
  const exlog = await json<Record<string, Array<{ date: string; kg?: number; reps?: number; name?: string }>>>(`${uid}:forme:exlog`, {});
  for (const [id, l] of Object.entries(exlog)) for (const x of l) push(x.name ?? id.replace(/_/g, ' '), x.date, x.kg, x.reps);
  const lifts: Lift[] = [...best.entries()].map(([name, l]) => {
    l.sort((a, b) => a.date.localeCompare(b.date));
    const last = l[l.length - 1]!;
    const old = [...l].reverse().find(x => dayDiff(x.date, last.date) >= 14) ?? null;
    return { name, now: r1(last.e1), before: old ? r1(old.e1) : null, pct: old && Math.abs((last.e1 - old.e1) / old.e1) <= 0.4 ? Math.round((last.e1 - old.e1) / old.e1 * 1000) / 10 : null, date: last.date, n: l.length };
  }).filter(x => dayDiff(x.date, today) <= 35).sort((a, b) => (b as Lift & { n: number }).n - (a as Lift & { n: number }).n).slice(0, 6).map(({ name, now, before, pct, date }) => ({ name, now, before, pct, date }));
  const dropping = lifts.filter(l => l.pct != null && l.pct <= -5);

  // Score du jour (0-100) : déficit 30, protéines 25, muscu ou 8 000 pas 20, sommeil 15, pesée 10
  const health = await json<Array<{ date: string; steps?: number; sleep_h?: number }>>('health:daily', []);
  const h = health.find(x => x.date === today);
  const t = hist[hist.length - 1]!;
  const trained = !!days[today]?.workout || (uid === 'kouider' && await import('./sport-coach.js').then(m => m.readSportLog()).then(l => l.some(s => s.date === today)).catch(() => false));
  const parts = [
    { k: 'Déficit', ok: t.eaten > 0 && t.eaten <= t.target + 50, pts: 30, hint: t.eaten ? `${t.eaten}/${t.target} kcal` : 'aucun repas noté' },
    { k: 'Protéines', ok: t.p >= t.pGoal * 0.9, pts: 25, hint: `${t.p}/${t.pGoal} g` },
    { k: 'Muscu ou 8 000 pas', ok: trained || (h?.steps ?? 0) >= 8000, pts: 20, hint: trained ? 'séance faite' : `${h?.steps ?? 0} pas` },
    { k: 'Sommeil 7 h', ok: (h?.sleep_h ?? 0) >= 7, pts: 15, hint: h?.sleep_h ? `${h.sleep_h} h` : 'pas reçu' },
    { k: 'Pesée', ok: !!days[today]?.weight, pts: 10, hint: days[today]?.weight ? `${days[today]!.weight} kg` : 'pas pesé ce matin' },
  ];
  const score = parts.reduce((a, x) => a + (x.ok ? x.pts : 0), 0);

  // Début de la sèche (1er repas noté, ou réglé à la main) → durée, pause diète
  let start = await kvGet(START_K(uid));
  if (!start) { start = hist.find(x => x.eaten > 0)?.date ?? today; await kvSet(START_K(uid), start).catch(() => {}); }
  const weeksIn = Math.floor(dayDiff(start, today) / 7);
  const goalKg = p.targetKg && p.targetKg < real ? p.targetKg : null;
  const toLose = goalKg ? r1(real - goalKg) : 0;
  const eta = goalKg && rateWeek && rateWeek > 0.05 ? addDays(today, Math.ceil(toLose / rateWeek * 7)) : null;
  const waist = Object.entries(days).filter(([, d]) => d.measures?.taille).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, cm: d.measures!.taille! }));

  // Bilan de la semaine : UNE décision (règles RP Diet / MacroFactor), qu'il applique d'un bouton
  let decision: { text: string; deficit: number | null; level: 'ok' | 'up' | 'down' | 'wait' | 'break' } = { text: '', deficit: null, level: 'wait' };
  const logged7 = week.filter(x => x.logged).length;
  if (rateWeek == null) decision = { level: 'wait', deficit: null, text: `Pèse-toi chaque matin (à jeun, après les toilettes) : il me faut 5 pesées sur au moins 7 jours pour calculer ta vraie vitesse de sèche (tu en as ${weights.length}).` };
  else if (logged7 < 4) decision = { level: 'wait', deficit: null, text: `Seulement ${logged7} jour(s) noté(s) sur 7 : note tous tes repas (photo) cette semaine, sinon on ne peut pas savoir si c'est le déficit ou les oublis.` };
  else if (weeksIn >= 12 || (dropping.length >= 2 && (ratePct ?? 0) > 0.7)) decision = { level: 'break', deficit: 0, text: weeksIn >= 12 ? `${weeksIn} semaines de sèche : fais 1 semaine de PAUSE DIÈTE au maintien (même sport, même protéines). Ton corps récupère, ta faim se calme, et la perte repart mieux après.` : `Ta force baisse sur ${dropping.length} exercices et tu perds vite : 1 semaine au maintien pour protéger ton muscle.` };
  else if (ratePct != null && ratePct > 1.1) decision = { level: 'up', deficit: Math.max(250, cfg.deficit - 150), text: `Tu perds ${rateWeek} kg/semaine (${ratePct} %) : trop vite, tu risques de perdre du muscle. On mange 150 kcal de plus par jour.` };
  else if (ratePct != null && ratePct < 0.25 && prevRate != null && prevRate < cur * 0.0025 && logged7 >= 5) decision = { level: 'down', deficit: Math.min(750, cfg.deficit + 100), text: `Ça stagne depuis 2 semaines (${rateWeek ?? 0} kg/sem) alors que tu notes bien : −100 kcal par jour OU +2 000 pas par jour (ton choix).` };
  else if (dropping.length) decision = { level: 'ok', deficit: null, text: `Bonne vitesse, mais ${dropping[0]!.name} baisse (${dropping[0]!.pct} %) : garde les charges lourdes, 2 g de protéines/kg, dors 7 h+. On ne touche pas aux calories.` };
  else decision = { level: 'ok', deficit: null, text: rateWeek != null ? `Parfait : ${rateWeek} kg/semaine (${ratePct} %), dans la zone 0,5-1 %. On ne change rien, continue.` : 'Continue comme ça cette semaine.' };

  return {
    today, start, weeksIn, deficit: cfg.deficit,
    weight: { current: r1(real), trend: r1(cur), last: weights[weights.length - 1] ?? null, goalKg, toLose, eta, rateWeek, ratePct, points: tr.slice(-60), loggedToday: !!days[today]?.weight },
    adaptive, avgEaten, avgBurnWatch, week, lifts, dropping: dropping.map(x => x.name),
    score, parts, decision, waist: waist.slice(-12), protein: { goal: t.pGoal, perKg: r1(t.pGoal / cur) },
  };
}
export type CutStatus = Awaited<ReturnType<typeof cutStatus>>;

/** Applique la décision du bilan (nouveau déficit) */
export async function applyCutDecision(uid: Uid, deficit: number): Promise<number> {
  const f = await import('./forme-food.js');
  return (await f.setFoodCfg({ deficit }, uid)).deficit;
}

/** Ligne pour Dzaryx (dossier, appels) */
export async function cutText(): Promise<string> {
  const c = await cutStatus('kouider');
  return `SÈCHE (FORME → Sèche) : semaine ${c.weeksIn + 1}, poids ${c.weight.current} kg (dernière pesée)${c.weight.rateWeek != null ? ` (${c.weight.rateWeek} kg/sem, ${c.weight.ratePct} %)` : ''}${c.weight.eta ? `, objectif ${c.weight.goalKg} kg vers le ${c.weight.eta}` : ''}. Score du jour ${c.score}/100. ${c.adaptive ? `Vraie dépense mesurée ${c.adaptive.tdee} kcal (montre ${c.adaptive.vsWatch >= 0 ? 'sous-estime' : 'surestime'} de ${Math.abs(c.adaptive.vsWatch)}). ` : ''}${c.dropping.length ? `Force en baisse : ${c.dropping.join(', ')}. ` : ''}Bilan : ${c.decision.text}`;
}

// ── 🧠 ÉTAT PHYSIQUE pour TOUS les cerveaux (Kouider 01/11 : « Dzaryx doit utiliser toutes les infos de FORME, aussi
// pour le coach de vie et le reste ») : une ligne courte, en cache 10 min (le calcul complet prend ~3 s).
let snapCache: { at: number; text: string } | null = null;
export async function formeSnapshot(): Promise<string> {
  if (snapCache && Date.now() - snapCache.at < 10 * 60_000) return snapCache.text;
  const today = localNow().date;
  const [c, sport, ready, sleep, ins, photos] = await Promise.all([
    cutStatus('kouider').catch(() => null),
    import('./sport-coach.js').then(async m => { const log = await m.readSportLog(); const done = log.find(l => l.date === today); const planned = await m.sportSessionFor(today).catch(() => null); return { done, planned }; }).catch(() => null),
    import('./workout-live.js').then(m => m.readiness()).then(r => r?.line ?? '').catch(() => ''),
    import('./sleep-coach.js').then(m => m.sleepContextLine()).catch(() => ''),
    import('./forme-insights.js').then(m => m.formeInsights('kouider')).catch(() => null),
    import('./forme.js').then(m => m.readPhotos('kouider')).catch(() => []),
  ]);
  const lastPh = [...photos].reverse().find(p => p.analysis && p.analysis.visible !== 'non');
  const notTrained = ins ? Object.entries(ins.sets).filter(([, n]) => n === 0).map(([m]) => m) : [];
  const bits = [
    sport?.done ? `Sport aujourd'hui : FAIT (${sport.done.note?.startsWith('Fait en vrai') ? sport.done.note.split('·')[0]!.replace('Fait en vrai : ', '') : sport.done.type}${sport.done.durationMin ? `, ${sport.done.durationMin} min` : ''})` : sport?.planned ? `Sport aujourd'hui : prévu, pas encore fait (${String(sport.planned).split('\n')[0]!.slice(0, 80)})` : 'Pas de sport prévu aujourd\'hui',
    ins ? `semaine ${ins.week.done}/${ins.week.target} séances${notTrained.length ? `, muscles pas travaillés en 7 j : ${notTrained.join(', ')}` : ''}` : '',
    c ? `sèche semaine ${c.weeksIn + 1} : poids ${c.weight.current} kg (dernière pesée)${c.weight.rateWeek != null ? ` (${c.weight.rateWeek > 0 ? '−' : '+'}${Math.abs(c.weight.rateWeek)} kg/sem)` : ''}, objectif ${c.weight.goalKg ?? '?'} kg${c.weight.eta ? ` vers le ${c.weight.eta}` : ''} ; score du jour ${c.score}/100 (${c.parts.filter(p => !p.ok).map(p => `${p.k} manquant : ${p.hint}`).join(', ') || 'tout bon'})` : '',
    c?.dropping.length ? `force en baisse : ${c.dropping.join(', ')}` : '',
    c?.lifts?.length ? `charges actuelles (1RM estimé) : ${c.lifts.slice(0, 5).map((l: { name: string; now: number; pct: number | null }) => `${l.name} ${l.now} kg${l.pct != null ? ` (${l.pct > 0 ? '+' : ''}${l.pct} % en 2 sem.)` : ''}`).join(', ')}` : '',
    c ? `déficit visé ${c.deficit} kcal/j, protéines visées ${c.protein.goal} g/j` : '',
    ready, sleep,
    lastPh ? `dernière photo du corps (${lastPh.date}) : ${lastPh.analysis!.summary.slice(0, 160)}` : '',
  ].filter(Boolean);
  const text = `ÉTAT PHYSIQUE (app FORME + montre, à jour) : ${bits.join(' · ')}. UTILISE-LE partout (coach de vie, moral, business, planning) : nuit courte / récupération basse = journée plus douce et pas de grosses décisions le soir ; séance pas faite = propose le meilleur moment ; protéines ou déficit manquants = rappel au bon moment, sans sermon. Jamais de nourriture/repas dans l'agenda.`;
  snapCache = { at: Date.now(), text };
  return text;
}

// ── 🖼️ « Ce que j'ai VRAIMENT fait » en images (Kouider 01/11 : « parfois je connais pas les noms ») ─────────────
// Il choisit les exercices en photo (bibliothèque ou photo de la machine) → séries dans l'historique de chaque exercice,
// séance du jour corrigée partout (sport_coach did : journal, FORME, agenda ; la séance prévue reste pour la prochaine fois).
const LIB_TO_COACH: Record<string, string> = { chest: 'pecs', shoulders: 'epaules', biceps: 'bras', triceps: 'bras', forearms: 'bras', lats: 'dos', 'middle back': 'dos',
  'lower back': 'dos', traps: 'dos', abdominals: 'abdos', quadriceps: 'jambes', hamstrings: 'jambes', glutes: 'jambes', calves: 'jambes', adductors: 'jambes', abductors: 'jambes' };
const MUS_FR: Record<string, string> = { pecs: 'Pecs', dos: 'Dos', epaules: 'Épaules', bras: 'Bras', jambes: 'Jambes', abdos: 'Abdos' };
export interface DidEx { id: string; name: string; p: string[]; sets: number; kg?: number; reps?: number }
export async function logDidByImages(uid: Uid, date: string, list: DidEx[]): Promise<string> {
  const exs = list.filter(x => x.id && x.name).slice(0, 20);
  if (!exs.length) throw new Error('Choisis au moins un exercice.');
  const { addExSets } = await import('./forme.js');
  const rows = exs.flatMap(x => Array.from({ length: Math.max(1, Math.min(10, Math.round(x.sets) || 3)) }, () => ({ id: x.id, kg: x.kg, reps: x.reps })));
  await addExSets(uid, rows, date);
  // Muscles travaillés (séries) → séance du programme la plus proche
  const mus: Record<string, number> = {};
  for (const x of exs) { const m = LIB_TO_COACH[x.p[0] ?? '']; if (m) mus[m] = (mus[m] ?? 0) + (Math.round(x.sets) || 3); }
  const muscles = Object.entries(mus).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const label = `${muscles.map(m => MUS_FR[m]).join(' + ') || 'Séance'} : ${exs.map(x => x.name).join(', ')}`.slice(0, 150);
  if (uid !== 'kouider') {
    const { updateDay } = await import('./forme.js');
    await updateDay(uid, date, d => { d.workout = { ...(d.workout ?? { session: 0, sets: [], at: Date.now() }), label: label.slice(0, 60) }; });
    return `✅ Noté : ${label}`;
  }
  const sc = await import('./sport-coach.js');
  await sc.exerciseMuscles();   // charge le programme officiel (SESSIONS)
  const total = Object.values(mus).reduce((a, b) => a + b, 0) || 1;
  // séance du programme qui correspond dans les DEUX sens : ses séries tombent dans la séance (cover) ET la séance a été
  // vraiment faite (recall) — « juste biceps » ≠ « Dos & Biceps »
  let best: { type: string; score: number } | null = null;
  for (const t of sc.ROTATION) {
    const ms = (sc.SESSIONS[t].muscles as string[]).filter(m => m !== 'cardio' && m !== 'abdos');
    if (!ms.length) continue;
    const cover = Object.entries(mus).filter(([m]) => ms.includes(m)).reduce((a, [, n]) => a + n, 0) / total;
    const recall = ms.filter(m => mus[m]).length / ms.length;
    if (cover >= 0.7 && recall >= 0.5 && (!best || cover * recall > best.score)) best = { type: t, score: cover * recall };
  }
  const type = best?.type;
  const r = await sc.sportCoachTool({ action: 'did', date, ...(type ? { type } : {}), note: label });
  snapCache = null;
  return `${r}\n🖼️ ${exs.length} exercice(s) ajouté(s) à ton historique (${rows.length} séries)${type ? '' : ` — ${label}`}.`;
}
