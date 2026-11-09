import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import {
  formeOverview, setFormeProfile, logForme,
  parseImage, addBodyPhoto, removeBodyPhoto, analyzeBodyPhoto, askFormeCoach, storeFormeSub, formeTargets,
  adaptNextSession, doctorReport, translateAr, createInvite, revokeInvite, uidFromFormeToken, getProgram, programOverview,
  type FormeProfile, type BodyPhoto, type Uid,
  scanMachine, machineHistory, deleteMachine, exFavs, toggleExFav, exHistory, addExSet, delExSet, addExSets, exLast, routines, saveRoutine, deleteRoutine, type RoutineEx,
} from '../../integrations/forme.js';
import type { PushSubscription } from 'web-push';
import { exerciseLibrary, exerciseDetail, matchExercise } from '../../integrations/exercise-lib.js';
import { gamesBoard, submitScore, roomAction, roomPeek, getIsland, islandAction } from '../../integrations/couple-games.js';

// App « FORME » (sport + suivi du corps ; nutrition retirée le 31/10) : page de l'app Dzaryx et appli à part sur l'écran d'accueil.
// Deux profils : Kouider (session Dzaryx) et sa femme (lien d'invitation → en-tête x-forme-token, valable ICI seulement).
// Santé / photos : base privée et bucket privé, jamais dans le code (dépôt public).
const router = Router();
const uidOf = new WeakMap<Request, Uid>();

// 📍 Suivi en direct PUBLIC (lien secret envoyé à un proche pendant une sortie) — AVANT le contrôle d'accès
router.get('/live/:token', async (req, res) => {
  try { const d = await (await import('../../integrations/forme-runs-pro.js')).livePublic(String(req.params.token)); if (!d) { res.status(404).json({ error: 'Suivi terminé ou lien invalide' }); return; } res.json(d); } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.use(async (req: Request, res: Response, next: NextFunction) => {
  const ft = req.headers['x-forme-token'];
  if (typeof ft === 'string' && ft) {
    let uid: Uid | null;
    try { uid = await uidFromFormeToken(ft); } catch { res.status(503).json({ error: 'Serveur occupé, réessaie dans un instant' }); return; }
    if (!uid) { res.status(401).json({ error: 'Lien expiré — demande un nouveau lien à Kouider' }); return; }
    uidOf.set(req, uid); next(); return;
  }
  requireMobileAuth(req, res, () => {
    if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
    uidOf.set(req, 'kouider'); next();
  });
});
const U = (req: Request): Uid => uidOf.get(req) ?? 'kouider';
const CU = (req: Request) => U(req) as Exclude<Uid, 'ami'>;   // jeux : le middleware /games a déjà refusé « ami »
const fail = (res: Response, err: unknown, code = 500) =>
  res.status(code).json({ error: err instanceof Error ? err.message : String(err) });
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// GET /api/forme — tout l'écran
router.get('/', async (req, res) => {
  try { res.json(await formeOverview(U(req))); } catch (err) { fail(res, err); }
});

// POST /api/forme/profile { …champs du profil } → profil + cibles recalculées
router.post('/profile', async (req, res) => {
  try { const p = await setFormeProfile(req.body as Partial<FormeProfile>, U(req)); res.json({ profile: p, targets: formeTargets(p) }); } catch (err) { fail(res, err); }
});

// POST /api/forme/swap { monday, recipe, wish? } — une autre recette, macros proches
// Bibliothèque d'exercices : GET /exlib (liste), /exlib/:id (fiche), /exlib-match?name= (exercice d'une séance → fiche)
router.get('/exlib', async (_req, res) => {
  try { res.set('Cache-Control', 'private, max-age=3600'); res.json({ items: await exerciseLibrary() }); } catch (err) { fail(res, err); }
});
router.get('/exlib-match', async (req, res) => {
  try { res.json({ ex: await matchExercise(String(req.query.name ?? '').slice(0, 100)) }); } catch (err) { fail(res, err); }
});
router.get('/exlib/:id', async (req, res) => {
  try { const ex = await exerciseDetail(String(req.params.id).slice(0, 100)); if (!ex) { res.status(404).json({ error: 'exercice inconnu' }); return; } res.json({ ex }); } catch (err) { fail(res, err); }
});

// 📷 Scan d'une machine : POST /machine { image: dataURL, thumb?: petite dataURL } → appareil + exercices (images, vidéo)
router.post('/machine', async (req, res) => {
  const b = req.body as { image?: string; thumb?: string };
  try { res.json({ scan: await scanMachine(U(req), parseImage(String(b.image ?? '')), typeof b.thumb === 'string' ? b.thumb : undefined) }); } catch (err) { fail(res, err, 400); }
});
router.get('/machines', async (req, res) => { try { res.json({ machines: await machineHistory(U(req)) }); } catch (err) { fail(res, err); } });
router.delete('/machines/:id', async (req, res) => { try { res.json({ machines: await deleteMachine(U(req), String(req.params.id)) }); } catch (err) { fail(res, err); } });
// Marque-pages + historique par exercice (fiche : À propos / Historique / Progrès)
router.get('/exfav', async (req, res) => { try { res.json({ ids: await exFavs(U(req)) }); } catch (err) { fail(res, err); } });
router.post('/exfav', async (req, res) => {
  const b = req.body as { id?: string; on?: boolean };
  try { res.json({ ids: await toggleExFav(U(req), String(b.id ?? '').slice(0, 100), !!b.on) }); } catch (err) { fail(res, err); }
});
router.get('/exlog/:id', async (req, res) => { try { res.json({ sets: await exHistory(U(req), String(req.params.id).slice(0, 100)) }); } catch (err) { fail(res, err); } });
router.post('/exlog', async (req, res) => {
  const b = req.body as { id?: string; kg?: number; reps?: number; del?: number };
  const id = String(b.id ?? '').slice(0, 100);
  if (!id) { fail(res, 'id manquant', 400); return; }
  try { res.json({ sets: b.del ? await delExSet(U(req), id, Number(b.del)) : await addExSet(U(req), id, Number(b.kg) || undefined, Number(b.reps) || undefined) }); } catch (err) { fail(res, err); }
});

// POST /api/forme/log { kind, date?, … } — eau, poids, repas coché, aliment, protéines, mensurations, injection, effet, séance
// Fin de séance : toutes les séries → historique des exercices ; dernières séries de plusieurs exercices (colonne « Précédent »)
router.post('/exlog-batch', async (req, res) => {
  const sets = Array.isArray((req.body as { sets?: unknown }).sets) ? (req.body as { sets: Array<{ id: string; kg?: number; reps?: number; fb?: 'easy' | 'ok' | 'hard' }> }).sets : [];
  try { res.json({ n: await addExSets(U(req), sets.map(x => ({ id: String(x.id ?? '').slice(0, 100), kg: Number(x.kg) || undefined, reps: Number(x.reps) || undefined, fb: x.fb }))) }); } catch (err) { fail(res, err); }
});
router.get('/exlast', async (req, res) => {
  try { res.json({ last: await exLast(U(req), String(req.query.ids ?? '').split(',').filter(Boolean).slice(0, 30)) }); } catch (err) { fail(res, err); }
});
// Mes routines (séances perso)
router.get('/routines', async (req, res) => { try { res.json({ routines: await routines(U(req)) }); } catch (err) { fail(res, err); } });
router.post('/routines', async (req, res) => {
  const b = req.body as { id?: string; name?: string; exercises?: RoutineEx[] };
  if (!b.name || !Array.isArray(b.exercises) || !b.exercises.length) { fail(res, 'nom et exercices requis', 400); return; }
  try { res.json({ routines: await saveRoutine(U(req), { id: b.id, name: b.name, exercises: b.exercises }) }); } catch (err) { fail(res, err); }
});
router.delete('/routines/:id', async (req, res) => { try { res.json({ routines: await deleteRoutine(U(req), String(req.params.id)) }); } catch (err) { fail(res, err); } });

// 🍽️ CALORIES (31/10, style Cal AI) : photo du plat → aliments + kcal/protéines ; budget = dépense montre − déficit
const food = () => import('../../integrations/forme-food.js');
router.get('/food', async (req, res) => {
  try { const f = await food(); const date = isDate(req.query.date) ? req.query.date : undefined; res.json({ budget: await f.foodBudget(U(req), date), cfg: await f.foodCfg(U(req)) }); } catch (err) { fail(res, err); }
});
// GET /api/forme/food/week — les 7 derniers jours (mangé / brûlé / déficit / protéines)
router.get('/food/week', async (req, res) => {
  try { res.json(await (await food()).foodWeek(U(req))); } catch (err) { fail(res, err); }
});
// GET /api/forme/food/burn — déficit réel (brûlé − mangé) + circuit maison pour le manque
// 02/11 : heure du dernier envoi de la montre (Raccourci « Dzaryx Santé ») → l'app le relance tout seul s'il est vieux
router.get('/watch-sync', async (req, res) => {
  if (U(req) !== 'kouider') { res.json({ at: null }); return; }
  const { kvGet } = await import('../../integrations/app-store.js');
  const at = Number(await kvGet('health:lastsync').catch(() => null)) || null;
  res.json({ at });
});

router.get('/food/burn', async (req, res) => {
  try {
    const f = await food(); const uid = U(req); const b = await f.foodBudget(uid); const d = f.deficitStatus(b);
    const { getFormeProfile } = await import('../../integrations/forme.js');
    res.json({ status: d, plan: d.missing > 0 && b.mode === 'deficit' ? f.homeBurnPlan(d.missing, (await getFormeProfile(uid)).weightKg) : null });
  } catch (err) { fail(res, err); }
});
router.post('/food/photo', async (req, res) => {
  const b = req.body as { image?: string; thumb?: string; note?: string; slot?: string };
  try {
    const img = parseImage(String(b.image ?? ''));
    const f = await food();
    const r = await f.analyzeMealPhoto(U(req), { base64: img.data, mime: img.media }, { note: typeof b.note === 'string' ? b.note.slice(0, 200) : undefined, thumb: typeof b.thumb === 'string' ? b.thumb : undefined, slot: b.slot && b.slot in f.SLOT_LABEL ? b.slot as never : undefined });
    res.json(r);
  } catch (err) { fail(res, err, 400); }
});
router.post('/food/text', async (req, res) => {
  const b = req.body as { text?: string; slot?: string; date?: string };
  if (!b.text?.trim()) { fail(res, 'texte manquant', 400); return; }
  try { const f = await food(); res.json(await f.logMealText(U(req), b.text.slice(0, 300), b.slot && b.slot in f.SLOT_LABEL ? b.slot as never : undefined, isDate(b.date) && b.date <= new Date().toISOString().slice(0, 10) ? b.date : undefined)); } catch (err) { fail(res, err, 400); }
});
router.post('/food/edit', async (req, res) => {
  const b = req.body as { date?: string; id?: string; items?: never; title?: string; slot?: never; scale?: number; del?: boolean };
  if (!isDate(b.date) || !b.id) { fail(res, 'date et id requis', 400); return; }
  try {
    const f = await food();
    if (b.del) await f.deleteMeal(U(req), b.date, b.id); else await f.editMeal(U(req), b.date, b.id, { items: b.items, title: b.title, slot: b.slot, scale: Number(b.scale) || undefined });
    res.json({ budget: await f.foodBudget(U(req), b.date) });
  } catch (err) { fail(res, err, 400); }
});
// 💪 Questionnaire PRISE DE MASSE (01/11) : objectif « muscle » → surplus calorique + plan chiffré
router.get('/bulk', async (req, res) => { try { res.json({ plan: await (await food()).bulkPlan(U(req)) }); } catch (err) { fail(res, err); } });
router.post('/bulk', async (req, res) => {
  const b = (req.body ?? {}) as { bulk?: Record<string, unknown>; weightKg?: number; targetKg?: number; heightCm?: number; age?: number; sessionsPerWeek?: number };
  try {
    const before = await (await import('../../integrations/forme.js')).getFormeProfile(U(req));
    await setFormeProfile({ goal: 'muscle', bulk: b.bulk as never, ...(b.weightKg ? { weightKg: Number(b.weightKg) } : {}), ...(b.targetKg ? { targetKg: Number(b.targetKg) } : {}),
      ...(b.heightCm ? { heightCm: Number(b.heightCm) } : {}), ...(b.age ? { age: Number(b.age) } : {}), ...(b.sessionsPerWeek ? { sessionsPerWeek: Number(b.sessionsPerWeek) } : {}) }, U(req));
    // passe en prise de masse → son programme de muscu est refait pour l'hypertrophie (en fond, l'IA prend ~30 s)
    if (U(req) !== 'kouider' && (before.goal !== 'muscle' || !before.bulk)) void getProgram(U(req), true).catch(() => {});
    res.json({ plan: await (await food()).bulkPlan(U(req)), overview: await formeOverview(U(req)) });
  } catch (err) { fail(res, err); }
});
router.post('/food/cfg', async (req, res) => {
  try { const f = await food(); const cfg = await f.setFoodCfg(req.body as never, U(req)); res.json({ cfg, budget: await f.foodBudget(U(req)) }); } catch (err) { fail(res, err); }
});

// ⌚ FORME DU JOUR (façon Whoop / Fitbit) : ce que la montre envoie via l'iPhone (raccourci Santé → /api/jarvis/health)
// + score de récupération Dzaryx. Kouider seulement (la montre est la sienne).
router.get('/watch', async (req, res) => {
  if (U(req) !== 'kouider') { res.json({ ok: false }); return; }
  try {
    const { kvGet } = await import('../../integrations/app-store.js');
    const w = await import('../../integrations/workout-live.js');
    const days = JSON.parse((await kvGet('health:daily')) ?? '[]') as Array<{ date: string; sleep_h?: number; steps?: number; rhr?: number; hrv?: number; active_kcal?: number; weight?: number }>;
    const prev = days.slice(-15, -1);
    const avg = (k: 'rhr' | 'hrv' | 'steps' | 'sleep_h') => { const v = prev.map(x => Number(x[k] ?? 0)).filter(x => x > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
    const eff = w.effectiveToday(days as never) as { day: typeof days[number] } | null;   // 02/11 : VFC/cœur les plus récents si la montre n'a pas encore envoyé ce matin
    res.json({ ok: true, last: eff ? { ...days[days.length - 1], ...eff.day } : days[days.length - 1] ?? null, lastSync: days[days.length - 1]?.date ?? null, at: Date.now(), days: days.slice(-14), usual: { rhr: avg('rhr'), hrv: avg('hrv'), steps: avg('steps'), sleep_h: avg('sleep_h') },
      readiness: await w.readiness().catch(() => null), series: (await w.readinessSeries().catch(() => [])).slice(-14) });
  } catch (err) { fail(res, err); }
});

// 🏃 COURSE GPS (01/11, façon Strava) : sorties enregistrées au GPS, tout recalculé côté serveur
const runs = () => import('../../integrations/forme-runs.js');
router.get('/runs', async (req, res) => {
  try { const m = await runs(); const t = String(req.query.type ?? ''); res.json(await m.runStats(U(req), m.RUN_TYPES.includes(t as never) ? t as never : undefined)); } catch (err) { fail(res, err); }
});
router.post('/runs', async (req, res) => {
  try { res.json(await (await runs()).saveRun(U(req), (req.body ?? {}) as never)); } catch (err) { fail(res, err, 400); }
});
const pro = () => import('../../integrations/forme-runs-pro.js');
router.get('/runs/plan', async (req, res) => {
  try { const m = await pro(); res.json({ plan: m.planView(await m.getPlan(U(req)), (await import('../../integrations/morning-routine.js')).localNow().date) }); } catch (err) { fail(res, err); }
});
router.post('/runs/plan', async (req, res) => {
  try { const m = await pro(); await m.createPlan(U(req), (req.body ?? {}) as never); res.json({ plan: m.planView(await m.getPlan(U(req)), (await import('../../integrations/morning-routine.js')).localNow().date) }); } catch (err) { fail(res, err); }
});
router.delete('/runs/plan', async (req, res) => { try { await (await pro()).deletePlan(U(req)); res.json({ ok: true }); } catch (err) { fail(res, err); } });
router.post('/runs/shoes', async (req, res) => { try { res.json({ shoes: await (await pro()).shoeAction(U(req), (req.body ?? {}) as never) }); } catch (err) { fail(res, err); } });
router.post('/runs/live', async (req, res) => {
  const b = (req.body ?? {}) as { start?: boolean; type?: string };
  try { const m = await pro(); if (b.start) { const token = await m.liveStart(U(req), (['run', 'walk', 'bike', 'hike'].includes(String(b.type)) ? b.type : 'run') as never); res.json({ link: `https://kouider213.github.io/ibrahim/forme/?suivi=${token}` }); return; } res.json(await m.liveUpdate(U(req), b as never)); } catch (err) { fail(res, err); }
});
router.get('/runs/:id/gpx', async (req, res) => {
  try {
    const R = await runs(); const id = String(req.params.id).slice(0, 40);
    const run = (await R.runList(U(req))).find(r => r.id === id); if (!run) { fail(res, 'sortie introuvable', 404); return; }
    const raw = await R.runPoints(U(req), id);
    res.json({ name: `forme-${run.date}-${run.type}.gpx`, gpx: (await pro()).gpx(run, raw) });   // JSON : l'app passe par son jeton
  } catch (err) { fail(res, err); }
});
router.post('/runs/:id/coach', async (req, res) => {
  try {
    const R = await runs(); const id = String(req.params.id).slice(0, 40); const list = await R.runList(U(req));
    const run = list.find(r => r.id === id); if (!run) { fail(res, 'sortie introuvable', 404); return; }
    if (run.coach && !(req.body as { again?: boolean } | undefined)?.again) { res.json({ coach: run.coach }); return; }
    const coach = await (await pro()).coachDebrief(U(req), run, list);
    await R.updateRun(U(req), id, { coach });
    res.json({ coach });
  } catch (err) { fail(res, err); }
});
router.post('/runs/cfg', async (req, res) => {
  try { res.json({ cfg: await (await runs()).setRunCfg(U(req), (req.body ?? {}) as never) }); } catch (err) { fail(res, err); }
});
router.get('/runs/:id', async (req, res) => {
  try { const d = await (await runs()).runDetail(U(req), String(req.params.id).slice(0, 40)); if (!d) { fail(res, 'sortie introuvable', 404); return; } res.json(d); } catch (err) { fail(res, err); }
});
router.post('/runs/:id', async (req, res) => {
  try { const r = await (await runs()).updateRun(U(req), String(req.params.id).slice(0, 40), (req.body ?? {}) as never); if (!r) { fail(res, 'sortie introuvable', 404); return; } res.json({ run: r }); } catch (err) { fail(res, err); }
});
router.delete('/runs/:id', async (req, res) => {
  try { await (await runs()).deleteRun(U(req), String(req.params.id).slice(0, 40)); res.json({ ok: true }); } catch (err) { fail(res, err); }
});

// 📊 Stats pro : objectif semaine, séries par muscle, calendrier, badges, tendances montre
router.post('/did', async (req, res) => {
  const b = req.body as { date?: string; exercises?: unknown };
  try {
    const list = (Array.isArray(b.exercises) ? b.exercises : []).map((x: Record<string, unknown>) => ({ id: String(x.id ?? '').slice(0, 100), name: String(x.name ?? '').slice(0, 80), p: Array.isArray(x.p) ? (x.p as unknown[]).map(String).slice(0, 4) : [], sets: Number(x.sets) || 3, kg: Number(x.kg) || undefined, reps: Number(x.reps) || undefined }));
    const date = typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : (await import('../../integrations/morning-routine.js')).localNow().date;
    res.json({ message: await import('../../integrations/forme-cut.js').then(m => m.logDidByImages(U(req), date, list)) });
  } catch (err) { fail(res, err); }
});
router.get('/cut', async (req, res) => {
  try { res.json(await import('../../integrations/forme-cut.js').then(m => m.cutStatus(U(req)))); } catch (err) { fail(res, err); }
});
router.post('/cut/apply', async (req, res) => {
  try { const d = Number((req.body as { deficit?: unknown }).deficit); if (!Number.isFinite(d)) throw new Error('déficit manquant'); res.json({ deficit: await import('../../integrations/forme-cut.js').then(m => m.applyCutDecision(U(req), d)) }); } catch (err) { fail(res, err); }
});
// 06/11 bilans : GET /api/forme/day?date=AAAA-MM-JJ (jour du calendrier en détail) · GET /api/forme/report?kind=day|week|month&send=1
router.get('/day', async (req, res) => {
  try {
    if (U(req) !== 'kouider') { res.status(403).json({ error: 'réservé' }); return; }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query['date'] ?? '')) ? String(req.query['date']) : new Date().toISOString().slice(0, 10);
    res.json(await import('../../integrations/forme-report.js').then(m => m.formeDayDetail(date)));
  } catch (err) { fail(res, err); }
});
router.get('/report', async (req, res) => {
  try {
    if (U(req) !== 'kouider') { res.status(403).json({ error: 'réservé' }); return; }
    const kind = (['day', 'week', 'month'] as const).find(k => k === req.query['kind']) ?? 'week';
    const m = await import('../../integrations/forme-report.js');
    if (req.query['send'] === '1') { res.json({ text: await m.sendReport(kind, undefined, true), sent: true }); return; }
    const r = await m.buildReport(kind, undefined, false);
    res.json({ title: r.title, text: r.text, scores: r.scores, prevScores: r.prevScores, totals: r.totals, strengths: r.strengths, weaknesses: r.weaknesses, actions: r.actions, progression: r.progression,
      days: await m.reportSeries(kind).catch(() => []) });
  } catch (err) { fail(res, err); }
});
// 06/11 : POST /api/forme/adapt → objectif vérifié + programme refait partout (agenda, FORME) · POST /api/forme/priority { muscles: ['dos'] }
router.post('/adapt', async (req, res) => {
  try { if (U(req) !== 'kouider') { res.status(403).json({ error: 'réservé' }); return; } res.json(await import('../../integrations/forme-adapt.js').then(m => m.adaptProgram())); } catch (err) { fail(res, err); }
});
router.post('/priority', async (req, res) => {
  try {
    if (U(req) !== 'kouider') { res.status(403).json({ error: 'réservé' }); return; }
    const muscles = Array.isArray((req.body as { muscles?: unknown })?.muscles) ? ((req.body as { muscles: unknown[] }).muscles).map(String) : [];
    res.json({ text: await import('../../integrations/forme-adapt.js').then(m => m.prioritize(muscles)) });
  } catch (err) { fail(res, err); }
});
router.get('/goal-status', async (req, res) => {
  try { if (U(req) !== 'kouider') { res.status(403).json({ error: 'réservé' }); return; } res.json(await import('../../integrations/forme-adapt.js').then(m => m.goalStatus())); } catch (err) { fail(res, err); }
});
router.get('/insights', async (req, res) => {
  try { res.json(await import('../../integrations/forme-insights.js').then(m => m.formeInsights(U(req)))); } catch (err) { fail(res, err); }
});

router.post('/log', async (req, res) => {
  const b = req.body as Record<string, unknown>;
  try { await logForme(String(b.kind ?? ''), b, isDate(b.date) ? b.date : undefined, U(req)); res.json(await formeOverview(U(req))); } catch (err) { fail(res, err); }
});

// GET /api/forme/program — séances de sa femme (Kouider a /api/sport) ; POST pour refaire le programme
router.get('/program', async (req, res) => {
  try { res.json(await programOverview(U(req))); } catch (err) { fail(res, err); }
});
router.post('/program', async (req, res) => {
  try { await getProgram(U(req), true); res.json(await programOverview(U(req))); } catch (err) { fail(res, err); }
});

// POST /api/forme/translate { texts } — mode arabe : les textes encore en français à l'écran
router.post('/translate', async (req, res) => {
  const texts = (req.body as { texts?: unknown[] }).texts;
  if (!Array.isArray(texts)) { fail(res, 'texts manquant', 400); return; }
  try { res.json({ map: await translateAr(texts.map(String)) }); } catch (err) { fail(res, err); }
});

// Jeux du couple (RUSH, L'ŒIL) : records + salle pour jouer à deux en direct — PAS pour son ami
router.use('/games', (req, res, next) => { if (U(req) === 'ami') { res.status(403).json({ error: 'Jeux réservés au couple' }); return; } next(); });
router.get('/games', async (req, res) => {
  try { res.json(await gamesBoard(CU(req))); } catch (err) { fail(res, err); }
});
router.post('/games/score', async (req, res) => {
  const b = req.body as { game?: string; score?: number; date?: string };
  try { res.json(await submitScore(CU(req), String(b.game ?? ''), Number(b.score ?? 0), b.date)); } catch (err) { fail(res, err, 400); }
});
router.get('/games/island', async (_req, res) => { try { res.json(await getIsland()); } catch (err) { fail(res, err); } });
router.post('/games/island', async (req, res) => { try { res.json(await islandAction(CU(req), (req.body ?? {}) as Record<string, unknown>)); } catch (err) { fail(res, err, 400); } });
router.get('/games/room', (req, res) => { res.json(roomPeek(CU(req))); });
router.post('/games/room', async (req, res) => {
  try { res.json(await roomAction(CU(req), (req.body ?? {}) as Record<string, unknown>)); } catch (err) { fail(res, err); }
});

// GET /api/forme/doctor — bilan texte pour le médecin
router.get('/doctor', async (req, res) => {
  try { res.json({ text: await doctorReport(U(req)) }); } catch (err) { fail(res, err); }
});

// POST /api/forme/adapt { focus } — « je veux perdre le ventre » (+ ses photos analysées) → prochaine séance sur mesure
router.post('/adapt', async (req, res) => {
  const focus = String((req.body as { focus?: string }).focus ?? '').trim();   // vide = le coach choisit d'après les photos
  try { res.json(await adaptNextSession(U(req), { focus })); } catch (err) { fail(res, err); }
});

// POST /api/forme/body-photo { image, pose } → stockée en privé puis analysée (avant / maintenant)
router.post('/body-photo', async (req, res) => {
  const b = req.body as { image?: string; pose?: string; goal?: string; adapt?: boolean; replace?: string; vs?: string };
  const pose = (['face', 'profil', 'dos'].includes(String(b.pose)) ? b.pose : 'face') as BodyPhoto['pose'];
  try {
    const ph = await addBodyPhoto(U(req), parseImage(String(b.image ?? '')), pose);
    // replace = « reprendre la photo » : l'ancienne disparaît, la comparaison garde la même photo AVANT
    if (b.replace) await removeBodyPhoto(U(req), String(b.replace)).catch(() => null);
    const goal = String(b.goal ?? '').slice(0, 300);
    const analysis = await analyzeBodyPhoto(U(req), ph.id, goal, String(b.vs ?? '')).catch(e => ({ error: e instanceof Error ? e.message : String(e) }));
    // « Photo + adapter » : la séance de demain est refaite d'après la photo (et ce qu'il veut perdre)
    const adapted = b.adapt && !('error' in analysis) ? await adaptNextSession(U(req), { focus: goal, observations: `${analysis.summary} Zones : ${analysis.zones.map(z => `${z.label} (${z.trend})`).join(', ')}.` }).catch(e => ({ date: '', text: e instanceof Error ? e.message : String(e) })) : null;
    res.json({ photo: ph, analysis, adapted });
  } catch (err) { fail(res, err, 400); }
});

// 🎯 OBJECTIFS & DÉFIS (02/11) : dernière photo → niveau, exercices, délai, jalons ; image « toi à l'arrivée » ; défis
const goals = () => import('../../integrations/forme-goals.js');
router.get('/goals', async (req, res) => { try { res.json(await (await goals()).goalsOverview(U(req))); } catch (err) { fail(res, err); } });
router.post('/goals', async (req, res) => {
  const b = (req.body ?? {}) as { zones?: unknown; note?: unknown; photoId?: unknown; priority?: unknown; wantBy?: unknown };
  try {
    const g = await goals();
    await g.makeGoalPlan(U(req), { zones: Array.isArray(b.zones) ? b.zones.map(String) : undefined, note: typeof b.note === 'string' ? b.note : undefined, photoId: typeof b.photoId === 'string' ? b.photoId : undefined, priority: Array.isArray(b.priority) ? b.priority.map(String) : undefined, wantBy: typeof b.wantBy === 'string' ? b.wantBy : undefined });
    res.json(await g.goalsOverview(U(req)));
  } catch (err) { fail(res, err, 400); }
});
router.post('/goals/prefs', async (req, res) => {
  try { const g = await goals(); await g.setGoalPrefs(U(req), (req.body ?? {}) as never); res.json(await g.goalsOverview(U(req))); } catch (err) { fail(res, err, 400); }
});
router.post('/goals/chat', async (req, res) => {
  const b = (req.body ?? {}) as { message?: string; clear?: boolean };
  try {
    const g = await goals();
    if (b.clear) { await g.clearGoalChat(U(req)); res.json({ answer: '', changed: false, overview: await g.goalsOverview(U(req)) }); return; }
    const r2 = await g.goalChat(U(req), String(b.message ?? ''));
    res.json({ ...r2, overview: await g.goalsOverview(U(req)) });
  } catch (err) { fail(res, err, 400); }
});
// « Mettre dans mes séances » : la prochaine séance est refaite autour des priorités du plan
router.post('/goals/apply', async (req, res) => {
  try {
    const st = (await (await goals()).goalsOverview(U(req))).state;
    if (!st.plan) throw new Error('Pas encore de plan');
    const pr = (st.priority.length ? st.priority : st.plan.focus.zones).map(z => st.plan!.zones.find(x => x.id === z)?.label ?? z);
    res.json(await adaptNextSession(U(req), { focus: `Priorité : ${pr.join(', ')}. ${st.note}`.slice(0, 300), observations: `${st.plan.summary} ${st.plan.focus.why} Exercices conseillés : ${st.plan.exercises.map(e => e.id).join(', ')}.` }));
  } catch (err) { fail(res, err, 400); }
});
router.post('/goals/check', async (req, res) => {
  try { const g = await goals(); const e = await g.goalsCheck(U(req), true); res.json({ entry: e, overview: await g.goalsOverview(U(req)) }); } catch (err) { fail(res, err, 400); }
});
router.post('/goals/vision', async (req, res) => { try { res.json({ vision: await (await goals()).startVision(U(req)) }); } catch (err) { fail(res, err, 400); } });
router.post('/goals/milestone', async (req, res) => {
  const b = (req.body ?? {}) as { i?: number; done?: boolean };
  try { const g = await goals(); await g.toggleMilestone(U(req), Number(b.i), !!b.done); res.json(await g.goalsOverview(U(req))); } catch (err) { fail(res, err, 400); }
});
router.post('/goals/challenge', async (req, res) => {
  try { const g = await goals(); await g.challengeAction(U(req), (req.body ?? {}) as never); res.json(await g.goalsOverview(U(req))); } catch (err) { fail(res, err, 400); }
});

// POST /api/forme/analyze { id, vs? } — refaire l'analyse d'une photo (vs = photo « avant » choisie)
router.post('/analyze', async (req, res) => {
  const b = req.body as { id?: string; vs?: string };
  try { res.json({ analysis: await analyzeBodyPhoto(U(req), String(b.id ?? ''), '', String(b.vs ?? '')) }); } catch (err) { fail(res, err); }
});

// POST /api/forme/ask { question } — le coach répond (resto, envie de sucre, nausée…)
router.post('/ask', async (req, res) => {
  const b = req.body as { question?: string; mode?: string };
  try { res.json({ answer: await askFormeCoach(String(b.question ?? ''), U(req), ['batch', 'fridge'].includes(String(b.mode)) ? String(b.mode) : '') }); } catch (err) { fail(res, err); }
});

// POST /api/forme/push — abonnement notifications de l'appli FORME (écran d'accueil)
router.post('/push', async (req, res) => {
  const sub = req.body as PushSubscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh) { fail(res, 'abonnement invalide', 400); return; }
  try { await storeFormeSub(sub, U(req)); res.json({ ok: true }); } catch (err) { fail(res, err); }
});

// POST /api/forme/invite { name, lang } — Kouider crée (ou recrée) le lien de sa femme ; DELETE = le couper
// { who: 'ami' } (01/11) = le lien de son ami : son propre suivi, en français par défaut
const whoOf = (v: unknown): 'femme' | 'ami' => (v === 'ami' ? 'ami' : 'femme');
router.post('/invite', async (req, res) => {
  if (U(req) !== 'kouider') { fail(res, 'Réservé à Kouider', 403); return; }
  const b = req.body as { name?: string; lang?: string; who?: string };
  const who = whoOf(b.who);
  try {
    const lang = b.lang === 'ar' ? 'ar' : b.lang === 'fr' ? 'fr' : who === 'ami' ? 'fr' : 'ar';
    const token = await createInvite(who, { name: String(b.name ?? '').slice(0, 30), lang });
    // &l= : l'appli s'ouvre directement dans sa langue (évite le passage par l'arabe + rechargement)
    res.json({ link: `https://kouider213.github.io/ibrahim/forme/?invite=${token}&l=${lang}` });
  } catch (err) { fail(res, err); }
});
router.delete('/invite', async (req, res) => {
  if (U(req) !== 'kouider') { fail(res, 'Réservé à Kouider', 403); return; }
  try { await revokeInvite(whoOf(req.query.who ?? (req.body as { who?: string } | undefined)?.who)); res.json({ ok: true }); } catch (err) { fail(res, err); }
});

export default router;
