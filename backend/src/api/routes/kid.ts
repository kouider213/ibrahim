import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { getKidProfile, logKidTime } from '../../integrations/papa-time.js';

// Page « FENNOU » de l'app : le compagnon de jeu du fils de Kouider. Seulement le prénom, la mascotte et ce qu'il aime
// (pour les jeux) + le journal des parties (pour les rappels « temps avec le petit » et le bilan du dimanche).
// Rien du business ici. Les photos de la famille restent sur l'appareil, jamais envoyées.
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});

// GET /api/kid/profile
router.get('/profile', async (_req, res) => {
  try { const p = await getKidProfile(); res.json({ name: p.name, mascot: p.mascot, likes: p.likes }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/kid/session { game, minutes, wins } — une partie jouée dans l'app
router.post('/session', async (req, res) => {
  const b = req.body as { game?: string; minutes?: number; wins?: number };
  const minutes = Number(b.minutes);
  if (!(minutes > 0)) { res.status(400).json({ error: 'durée invalide' }); return; }
  try {
    await logKidTime({ kind: 'jeu', minutes, what: String(b.game ?? 'jeu').slice(0, 40), wins: Math.max(0, Math.round(Number(b.wins) || 0)) });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

export default router;
