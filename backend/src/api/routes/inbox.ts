import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { inboxList, inboxAct } from '../../integrations/inbox.js';

// 27/11 : boîte de réception de la page Aujourd'hui (WhatsApp, TikTok, relances, réservations, site) — compte Kouider seulement.
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});
router.get('/', async (_req, res) => { try { res.json(await inboxList()); } catch (e) { res.status(500).json({ error: (e as Error).message }); } });
router.post('/act', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!b['id'] || !b['action']) { res.status(400).json({ error: 'id + action requis' }); return; }
    const r = await inboxAct({ id: String(b['id']), action: String(b['action']), text: b['text'] != null ? String(b['text']) : undefined, how: b['how'] != null ? String(b['how']) : undefined,
      to: b['to'] != null ? String(b['to']) : undefined, car: b['car'] != null ? String(b['car']) : undefined, hours: b['hours'] != null ? Number(b['hours']) : undefined,
      reason: b['reason'] != null ? String(b['reason']) : undefined, own: !!b['own'] });
    res.status(r.ok || r.gone ? 200 : 400).json(r);
  } catch (e) { res.status(500).json({ ok: false, message: (e as Error).message }); }
});
export default router;
