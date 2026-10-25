import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import {
  formeOverview, setFormeProfile, swipeCandidates, generateWeek, getWeek, mondayOf, swapRecipe, logForme,
  parseImage, analyzeMealPhoto, addBodyPhoto, analyzeBodyPhoto, offBarcode, offSearch, askFormeCoach, storeFormeSub, formeTargets,
  householdShopping, checkHouseItem, addHouseItem, removeHouseItem, adaptNextSession, createInvite, revokeInvite, uidFromFormeToken, getProgram, programOverview, getFormeProfile,
  type FormeProfile, type BodyPhoto, type Uid,
} from '../../integrations/forme.js';
import type { PushSubscription } from 'web-push';

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
  const b = req.body as { key?: string; checked?: boolean };
  if (typeof b.key !== 'string' || !b.key) { fail(res, 'article invalide', 400); return; }
  try { await checkHouseItem(U(req), b.key.slice(0, 200), !!b.checked); res.json(await householdShopping(U(req))); } catch (err) { fail(res, err); }
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

// POST /api/forme/adapt { focus } — « je veux perdre le ventre » (+ ses photos analysées) → prochaine séance sur mesure
router.post('/adapt', async (req, res) => {
  const focus = String((req.body as { focus?: string }).focus ?? '').trim();
  if (!focus) { fail(res, 'dis ce que tu veux perdre ou améliorer', 400); return; }
  try { res.json(await adaptNextSession(U(req), { focus })); } catch (err) { fail(res, err); }
});

// POST /api/forme/meal-photo { image: dataURL } → estimation kcal/macros (pas encore notée)
router.post('/meal-photo', async (req, res) => {
  try { res.json(await analyzeMealPhoto(parseImage(String((req.body as { image?: string }).image ?? '')), U(req))); } catch (err) { fail(res, err, 400); }
});

// POST /api/forme/body-photo { image, pose } → stockée en privé puis analysée (avant / maintenant)
router.post('/body-photo', async (req, res) => {
  const b = req.body as { image?: string; pose?: string };
  const pose = (['face', 'profil', 'dos'].includes(String(b.pose)) ? b.pose : 'face') as BodyPhoto['pose'];
  try {
    const ph = await addBodyPhoto(U(req), parseImage(String(b.image ?? '')), pose);
    const analysis = await analyzeBodyPhoto(U(req), ph.id).catch(e => ({ error: e instanceof Error ? e.message : String(e) }));
    res.json({ photo: ph, analysis });
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
  try { res.json({ answer: await askFormeCoach(String((req.body as { question?: string }).question ?? ''), U(req)) }); } catch (err) { fail(res, err); }
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
