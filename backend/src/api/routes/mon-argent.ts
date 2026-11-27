import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { monArgentOverview, monArgentAdd, monArgentUndo, monArgentBalances, monArgentAdvise, fikInsights, departDetail, setGoals } from '../../integrations/mon-argent.js';

// Page « MON ARGENT » de l'app (27/11) : ventes hors FIK, soldes, meilleurs jours. PRIVÉ : compte Kouider seulement.
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});
const fail = (res: import('express').Response, err: unknown) => res.status(400).json({ error: err instanceof Error ? err.message : String(err) });

router.get('/', async (_req, res) => { try { res.json(await monArgentOverview()); } catch (e) { fail(res, e); } });
router.post('/add', async (req, res) => {
  try { const b = req.body ?? {}; const message = await monArgentAdd(b); res.json({ message, overview: await monArgentOverview() }); } catch (e) { fail(res, e); }
});
router.post('/undo', async (req, res) => {
  try { const ok = await monArgentUndo(req.body?.key != null ? String(req.body.key) : Number(req.body?.at)); res.json({ ok, overview: await monArgentOverview() }); } catch (e) { fail(res, e); }
});
router.post('/balances', async (req, res) => {
  try { const b = req.body ?? {}; await monArgentBalances(b.compte != null ? Number(b.compte) : undefined, b.cash != null ? Number(b.cash) : undefined); res.json({ overview: await monArgentOverview() }); } catch (e) { fail(res, e); }
});
// Conseiller : idée de business / dépense → avis chiffré avec son capital et son départ
router.post('/advise', async (req, res) => { try { res.json({ answer: await monArgentAdvise(String(req.body?.question ?? '')) }); } catch (e) { fail(res, e); } });
// Plan par étapes (maison, voiture, départ…) + leviers + 20 options ; ses étapes à lui
router.get('/plan', async (req, res) => { try { res.json(await departDetail(req.query['force'] === '1')); } catch (e) { fail(res, e); } });
router.post('/goals', async (req, res) => { try { await setGoals(Array.isArray(req.body?.goals) ? req.body.goals : []); res.json(await departDetail()); } catch (e) { fail(res, e); } });
// Analyse FIK (quand les clients écrivent, délai avant réservation, évolution par mois)
router.get('/fik-insights', async (_req, res) => { try { res.json(await fikInsights()); } catch (e) { fail(res, e); } });

export default router;
