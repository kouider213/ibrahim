import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { getBilling, updateBilling, setEco } from '../../integrations/billing.js';

// Page « À PAYER » de l'app (Kouider) : ce qu'il faut payer pour garder Dzaryx actif.
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});

router.get('/', async (_req, res) => {
  try { res.json(await getBilling()); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/billing/eco { on } — mode économie Claude
router.post('/eco', async (req, res) => {
  try { await setEco((req.body as { on?: boolean }).on !== false); res.json({ ok: true, message: (req.body as { on?: boolean }).on !== false ? '🌱 Mode économie activé' : 'Mode économie coupé' }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/billing/:id { due?, amount?, balance?, note?, paid? }
router.post('/:id', async (req, res) => {
  const b = req.body as { due?: string; amount?: string; balance?: number; note?: string; paid?: boolean };
  try {
    res.json({ ok: true, message: await updateBilling(String(req.params['id']), {
      ...(b.due !== undefined ? { due: String(b.due) } : {}), ...(b.amount !== undefined ? { amount: String(b.amount) } : {}),
      ...(b.balance !== undefined && b.balance !== null ? { balance: Number(b.balance) } : {}), ...(b.note !== undefined ? { note: String(b.note) } : {}),
      ...(b.paid ? { paid: true } : {}),
    }) });
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : String(err) }); }
});

export default router;
