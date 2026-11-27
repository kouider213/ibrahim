import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { monArgentOverview, monArgentAdd, monArgentUndo, monArgentBalances, monArgentAdvise, fikInsights, departDetail, setGoals, monArgentSettings, setSnusStock, snusArrivage, monArgentExpense, monArgentTransfer } from '../../integrations/mon-argent.js';

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
// 27/11 soir : objectifs, stock, arrivage, dépense, dépôt/retrait, PDF du mois
const act = (f: (b: Record<string, unknown>) => Promise<unknown>) => async (req: import('express').Request, res: import('express').Response) => {
  try { const message = await f((req.body ?? {}) as Record<string, unknown>); res.json({ message: typeof message === 'string' ? message : 'OK', overview: await monArgentOverview() }); } catch (e) { fail(res, e); }
};
router.post('/settings', act(b => monArgentSettings({ dayPieces: b['dayPieces'] as number | undefined, monthEur: b['monthEur'] as number | undefined })));
router.post('/stock', act(b => setSnusStock(Number(b['pieces']))));
router.post('/arrivage', act(b => snusArrivage(Number(b['pieces']), Number(b['cost']), b['cash'] !== false)));
router.post('/depense', act(b => monArgentExpense(String(b['cat']), Number(b['amount']), b['cash'] === true, b['label'] ? String(b['label']) : undefined)));
router.post('/transfert', act(b => monArgentTransfer(b['kind'] === 'retrait' ? 'retrait' : 'depot', Number(b['amount']), b['why'] ? String(b['why']) : undefined)));
router.post('/recap', act(async () => { const { localNow } = await import('../../integrations/morning-routine.js'); const t = localNow().date; await (await import('../../integrations/argent-recap.js')).sendRecap(`${t.slice(0, 7)}-01`, t, 'de ce mois'); return '📄 Récap du mois envoyé sur Telegram'; }));
// Analyse FIK (quand les clients écrivent, délai avant réservation, évolution par mois)
router.get('/fik-insights', async (_req, res) => { try { res.json(await fikInsights()); } catch (e) { fail(res, e); } });

export default router;
