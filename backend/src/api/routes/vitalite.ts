import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { vitaliteState, vitaliteTool, askVitalite, planText, factsFor } from '../../integrations/vitalite.js';

// Onglet COACH › 🔥 Vitalité (privé, Kouider seulement — jamais accessible avec un lien FORME invité).
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});
const err = (res: import('express').Response, e: unknown) => res.status(500).json({ error: e instanceof Error ? e.message : String(e) });

router.get('/', async (_req, res) => {
  try { const s = await vitaliteState(); res.json({ state: s, plan: planText(s), facts: await factsFor() }); } catch (e) { err(res, e); }
});
router.post('/action', async (req, res) => {
  try { const message = await vitaliteTool((req.body ?? {}) as Record<string, unknown>, 'kouider'); res.json({ message, state: await vitaliteState() }); } catch (e) { err(res, e); }
});
router.post('/ask', async (req, res) => {
  try { const q = String(req.body?.question ?? '').trim(); if (!q) { res.status(400).json({ error: 'question' }); return; } res.json({ answer: await askVitalite(q) }); } catch (e) { err(res, e); }
});
export default router;
