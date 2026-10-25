import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import {
  formeOverview, setFormeProfile, swipeCandidates, generateWeek, getWeek, mondayOf, swapRecipe, logForme,
  parseImage, analyzeMealPhoto, addBodyPhoto, analyzeBodyPhoto, offBarcode, offSearch, askFormeCoach, storeFormeSub, formeTargets,
  householdShopping, checkHouseItem, addHouseItem, removeHouseItem, adaptNextSession, doctorReport, formeAgenda, toggleFavorite, placeFavorite, translateAr, type Recipe, createInvite, revokeInvite, uidFromFormeToken, getProgram, programOverview, getFormeProfile,
  type FormeProfile, type BodyPhoto, type Uid,
} from '../../integrations/forme.js';
import type { PushSubscription } from 'web-push';
import { gamesBoard, submitScore, roomAction, roomPeek, getIsland, islandAction } from '../../integrations/couple-games.js';

// App « FORME » (sport + nutrition + suivi du corps) : page de l'app Dzaryx et appli à part sur l'écran d'accueil.
// Deux profils : Kouider (session Dzaryx) et sa femme (lien d'invitation → en-tête x-forme-token, valable ICI seulement).
// Santé / photos : base privée et bucket privé, jamais dans le code (dépôt public).
const router = Router();
const uidOf = new WeakMap<Request, Uid>();

router.use(async (req: Request, res: Response, next: NextFunction) => {
  const ft = req.headers['x-forme-token'];
  if (typeof ft === 'string' && ft) {
    const uid = await uidFromFormeToken(ft).catch(() => null);
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

// GET /api/forme/swipe — plats à swiper (vraies photos, halal), dans la langue du profil
router.get('/swipe', async (req, res) => {
  try { res.json({ meals: await swipeCandidates(14, (await getFormeProfile(U(req))).lang) }); } catch (err) { fail(res, err); }
});

// GET /api/forme/week?monday= — POST /api/forme/week { monday?, force? } → (re)compose la semaine + courses
router.get('/week', async (req, res) => {
  try { res.json({ week: await getWeek(U(req), isDate(req.query.monday) ? req.query.monday : undefined) }); } catch (err) { fail(res, err); }
});
router.post('/week', async (req, res) => {
  const b = req.body as { monday?: string; force?: boolean };
  try { res.json({ week: await generateWeek(U(req), isDate(b.monday) ? b.monday : mondayOf(), !!b.force) }); } catch (err) { fail(res, err); }
});

// GET /api/forme/shopping — la liste du FOYER (les deux semaines fusionnées) ; POST /api/forme/shop { key, checked }
router.get('/shopping', async (req, res) => {
  try { res.json(await householdShopping(U(req))); } catch (err) { fail(res, err); }
});
router.post('/shop', async (req, res) => {
  const b = req.body as { key?: string; checked?: boolean; home?: boolean };
  if (typeof b.key !== 'string' || !b.key) { fail(res, 'article invalide', 400); return; }
  try { await checkHouseItem(U(req), b.key.slice(0, 200), !!b.checked, !!b.home); res.json(await householdShopping(U(req))); } catch (err) { fail(res, err); }
});

// POST /api/forme/shop-add { name, qty?, store? } — article ajouté à la main ; POST /api/forme/shop-del { key }
router.post('/shop-add', async (req, res) => {
  const b = req.body as { name?: string; qty?: string; store?: string };
  if (!b.name?.trim()) { fail(res, 'nom manquant', 400); return; }
  try { await addHouseItem(U(req), { name: b.name.trim(), qty: b.qty, store: b.store }); res.json(await householdShopping(U(req))); } catch (err) { fail(res, err); }
});
router.post('/shop-del', async (req, res) => {
  const key = String((req.body as { key?: string }).key ?? '');
  if (!key.startsWith('extra|')) { fail(res, 'article invalide', 400); return; }
  try { await removeHouseItem(key); res.json(await householdShopping(U(req))); } catch (err) { fail(res, err); }
});

// POST /api/forme/swap { monday, recipe, wish? } — une autre recette, macros proches
router.post('/swap', async (req, res) => {
  const b = req.body as { monday?: string; recipe?: string; wish?: string };
  try { res.json({ week: await swapRecipe(U(req), isDate(b.monday) ? b.monday : '', String(b.recipe ?? ''), String(b.wish ?? '').slice(0, 120)) }); } catch (err) { fail(res, err); }
});

// POST /api/forme/log { kind, date?, … } — eau, poids, repas coché, aliment, protéines, mensurations, injection, effet, séance
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

// POST /api/forme/fav { recipe, on } — ❤️ garder / retirer une recette complète
router.post('/fav', async (req, res) => {
  const b = req.body as { recipe?: Recipe; on?: boolean };
  if (!b.recipe?.title) { fail(res, 'recette invalide', 400); return; }
  try { res.json({ favs: await toggleFavorite(U(req), b.recipe, !!b.on) }); } catch (err) { fail(res, err); }
});
// POST /api/forme/place { title, date, slot } — remettre un favori dans la semaine
router.post('/place', async (req, res) => {
  const b = req.body as { title?: string; date?: string; slot?: string };
  if (!b.title || !isDate(b.date) || !b.slot) { fail(res, 'jour ou repas manquant', 400); return; }
  try { res.json({ week: await placeFavorite(U(req), b.title, b.date, String(b.slot).slice(0, 20)) }); } catch (err) { fail(res, err, 400); }
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

// GET /api/forme/agenda — les 7 prochains jours (sport, repas, injection, rappels, repos)
router.get('/agenda', async (req, res) => {
  try { res.json({ days: await formeAgenda(U(req)) }); } catch (err) { fail(res, err); }
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

// POST /api/forme/meal-photo { image: dataURL } → estimation kcal/macros (pas encore notée)
router.post('/meal-photo', async (req, res) => {
  try { res.json(await analyzeMealPhoto(parseImage(String((req.body as { image?: string }).image ?? '')), U(req))); } catch (err) { fail(res, err, 400); }
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

// GET /api/forme/barcode/:code — produit Open Food Facts + verdict halal
router.get('/barcode/:code', async (req, res) => {
  if (!/^\d{6,14}$/.test(req.params.code)) { fail(res, 'code-barres invalide', 400); return; }
  try { const p = await offBarcode(req.params.code); if (!p) { fail(res, 'produit inconnu', 404); return; } res.json(p); } catch (err) { fail(res, err); }
});

// GET /api/forme/products?q=&store= — vrais produits vendus en Belgique
router.get('/products', async (req, res) => {
  try { res.json({ products: await offSearch(String(req.query.q ?? '').slice(0, 60), req.query.store ? String(req.query.store) : undefined, 12) }); } catch (err) { fail(res, err); }
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
