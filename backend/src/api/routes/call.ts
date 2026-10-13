import { Router, type Request } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { answerCall, declineCall, getPendingCall, callOwner, type CallActor } from '../../notifications/voice-call.js';
import { processMessage } from '../../conversation/orchestrator.js';
import { synthesizeVoice } from '../../notifications/dispatcher.js';
import { DEFAULT_MEMBER, type OrgMember } from '../../orchestrator/org-resolver.js';
import { env } from '../../config/env.js';

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

// POST /api/call/turn { message, textOnly? } — un tour de parole pendant un vrai appel (Telegram) :
// réponse SYNCHRONE de Dzaryx (texte + audio mp3), même session que la voix de l'app.
router.post('/turn', requireMobileAuth, async (req, res) => {
  const { message, textOnly } = req.body as { message?: string; textOnly?: boolean };
  if (!message?.trim()) { res.status(400).json({ error: 'message required' }); return; }
  const who = callActor(req);
  const actor: OrgMember = who === 'houari'
    ? { orgId: '', ownerKey: 'houari', role: 'admin', displayName: env.PARTNER_NAME }
    : DEFAULT_MEMBER;
  try {
    // Dzaryx doit savoir qu'il est DÉJÀ au téléphone : sinon « tu m'entends ? » relance call_me.
    const inCall = `[APPEL TÉLÉPHONIQUE EN COURS : tu parles en direct avec lui. Réponds à l'oral, 1 à 2 phrases courtes. N'utilise pas call_me, vous êtes déjà en ligne.]\n${message.trim().slice(0, 2000)}`;
    const out = await processMessage(inCall, `voice_${who}`, true, undefined, 'image/jpeg', actor);
    const text = (out.text ?? '').trim() || 'Pardon, je n\'ai pas compris.';
    const buf = textOnly ? null : await synthesizeVoice(text.replace(/[*_#`>|]/g, '').slice(0, 900), true);
    res.json({ text, audio: buf ? buf.toString('base64') : null });
  } catch (err) {
    console.error('[call] turn:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'turn failed' });
  }
});

export default router;
