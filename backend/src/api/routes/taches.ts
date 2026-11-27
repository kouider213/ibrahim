import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { tachesList, tacheAdd, tacheAct } from '../../integrations/taches.js';

// 27/11 : MES TÂCHES (page Aujourd'hui) — compte Kouider seulement.
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});
router.get('/', async (_req, res) => { try { res.json(await tachesList()); } catch (e) { res.status(500).json({ error: (e as Error).message }); } });
router.post('/', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = await tacheAdd({ text: String(b['text'] ?? ''), due: b['due'], time: b['time'], cat: b['cat'] as string, who: b['who'] as string, repeat: b['repeat'] as string, lieu: b['lieu'] as string | null, source: 'app' });
    res.json('dup' in r ? { ok: true, task: r.dup, dup: true } : { ok: true, task: r });
  } catch (e) { res.status(400).json({ ok: false, message: (e as Error).message }); }
});
router.post('/act', async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const a = String(b['action'] ?? '');
  if (!b['id'] || !['done', 'undo', 'tomorrow', 'hour', 'move', 'remove', 'edit'].includes(a)) { res.status(400).json({ ok: false, message: 'id + action requis' }); return; }
  try { const r = await tacheAct(String(b['id']), a as 'done', { due: b['due'], time: b['time'], text: b['text'] as string }); res.status(r.ok ? 200 : 404).json(r); }
  catch (e) { res.status(500).json({ ok: false, message: (e as Error).message }); }
});
// Cocher un point d'une check-list client (arrivée / retour) ou de voyage
router.post('/check', async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (!b['id'] || !b['label']) { res.status(400).json({ ok: false, message: 'id + label requis' }); return; }
  try { const r = await (await import('../../integrations/trips.js')).tickTripItem(String(b['id']), String(b['label']), b['done'] !== false); res.status(r.ok ? 200 : 404).json(r); }
  catch (e) { res.status(500).json({ ok: false, message: (e as Error).message }); }
});
export default router;
