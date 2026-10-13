import { Router, type Request } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { answerCall, declineCall, getPendingCall, callOwner, type CallActor } from '../../notifications/voice-call.js';

const router = Router();

// Même règle que /api/chat : jeton partagé → l'acteur vient de l'app (Houari connecté dans le simulateur).
function callActor(req: Request): CallActor {
  if (req.mobileActor?.ownerKey === 'houari') return 'houari';
  const fromApp = (req.body as { actor?: string } | undefined)?.actor ?? req.query['actor'];
  return fromApp === 'houari' ? 'houari' : 'kouider';
}

// POST /api/call/pending — appel de Dzaryx en train de sonner ? (POST : jamais servi par le cache hors-ligne de l'app)
router.post('/pending', requireMobileAuth, async (req, res) => {
  const call = await getPendingCall(callActor(req));
  res.json({ call: call ? { id: call.id, reason: call.reason, createdAt: call.createdAt } : null });
});

// POST /api/call/answer { callId? } — décrocher (ou lancer l'appel) → phrase d'accueil + audio
router.post('/answer', requireMobileAuth, async (req, res) => {
  try {
    const { callId } = req.body as { callId?: string };
    res.json(await answerCall(callActor(req), callId));
  } catch (err) {
    console.error('[call] answer:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'answer failed' });
  }
});

// POST /api/call/decline { callId? } — refuser / appel manqué
router.post('/decline', requireMobileAuth, async (req, res) => {
  const { callId } = req.body as { callId?: string };
  await declineCall(callActor(req), callId);
  res.json({ ok: true });
});

// POST /api/call/test — fait sonner l'app (test de bout en bout)
router.post('/test', requireMobileAuth, async (req, res) => {
  const { id } = await callOwner('Ceci est un appel de test. Tu m\'entends bien ?', callActor(req));
  res.json({ ok: true, id });
});

export default router;
