import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import {
  formeOverview, setFormeProfile, logForme,
  parseImage, addBodyPhoto, analyzeBodyPhoto, askFormeCoach, storeFormeSub, formeTargets,
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
    res.json({ ok: true, last: days[days.length - 1] ?? null, days: days.slice(-14), usual: { rhr: avg('rhr'), hrv: avg('hrv'), steps: avg('steps'), sleep_h: avg('sleep_h') },
      readiness: await w.readiness().catch(() => null), series: (await w.readinessSeries().catch(() => [])).slice(-14) });
  } catch (err) { fail(res, err); }
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

// Jeux du couple (RUSH, L'ŒIL) : records + salle pour jouer à deux en direct
router.get('/games', async (req, res) => {
  try { res.json(await gamesBoard(U(req))); } catch (err) { fail(res, err); }
});
router.post('/games/score', async (req, res) => {
  const b = req.body as { game?: string; score?: number; date?: string };
  try { res.json(await submitScore(U(req), String(b.game ?? ''), Number(b.score ?? 0), b.date)); } catch (err) { fail(res, err, 400); }
});
router.get('/games/island', async (_req, res) => { try { res.json(await getIsland()); } catch (err) { fail(res, err); } });
router.post('/games/island', async (req, res) => { try { res.json(await islandAction(U(req), (req.body ?? {}) as Record<string, unknown>)); } catch (err) { fail(res, err, 400); } });
router.get('/games/room', (req, res) => { res.json(roomPeek(U(req))); });
router.post('/games/room', async (req, res) => {
  try { res.json(await roomAction(U(req), (req.body ?? {}) as Record<string, unknown>)); } catch (err) { fail(res, err); }
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
  const b = req.body as { image?: string; pose?: string; goal?: string; adapt?: boolean };
  const pose = (['face', 'profil', 'dos'].includes(String(b.pose)) ? b.pose : 'face') as BodyPhoto['pose'];
  try {
    const ph = await addBodyPhoto(U(req), parseImage(String(b.image ?? '')), pose);
    const goal = String(b.goal ?? '').slice(0, 300);
    const analysis = await analyzeBodyPhoto(U(req), ph.id, goal).catch(e => ({ error: e instanceof Error ? e.message : String(e) }));
    // « Photo + adapter » : la séance de demain est refaite d'après la photo (et ce qu'il veut perdre)
    const adapted = b.adapt && !('error' in analysis) ? await adaptNextSession(U(req), { focus: goal, observations: `${analysis.summary} Zones : ${analysis.zones.map(z => `${z.label} (${z.trend})`).join(', ')}.` }).catch(e => ({ date: '', text: e instanceof Error ? e.message : String(e) })) : null;
    res.json({ photo: ph, analysis, adapted });
  } catch (err) { fail(res, err, 400); }
});

// POST /api/forme/analyze { id } — refaire l'analyse d'une photo
router.post('/analyze', async (req, res) => {
  try { res.json({ analysis: await analyzeBodyPhoto(U(req), String((req.body as { id?: string }).id ?? '')) }); } catch (err) { fail(res, err); }
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
router.post('/invite', async (req, res) => {
  if (U(req) !== 'kouider') { fail(res, 'Réservé à Kouider', 403); return; }
  const b = req.body as { name?: string; lang?: string };
  try {
    const token = await createInvite('femme', { name: String(b.name ?? '').slice(0, 30), lang: b.lang === 'fr' ? 'fr' : 'ar' });
    res.json({ link: `https://kouider213.github.io/ibrahim/forme/?invite=${token}` });
  } catch (err) { fail(res, err); }
});
router.delete('/invite', async (req, res) => {
  if (U(req) !== 'kouider') { fail(res, 'Réservé à Kouider', 403); return; }
  try { await revokeInvite('femme'); res.json({ ok: true }); } catch (err) { fail(res, err); }
});

export default router;
