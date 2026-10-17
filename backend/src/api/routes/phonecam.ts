// Caméra du téléphone → écran Nexus du PC (widget en direct) + photos / vidéos rangées sur le PC.
// L'app envoie 2 à 3 images/s (monté sous /api/nexus/live : limite à part), et reçoit en retour les ordres de Nexus
// (« prends une photo », « filme 10 secondes ») qu'elle exécute en pleine qualité avant de renvoyer le fichier.
// Kouider seulement (comme l'écran du PC), jamais Houari.
import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { isNexusOnline, sendToNexus, emitToNexusWithAck } from '../../actions/handlers/nexus-relay.js';

const router = Router();

export type PhoneCamCmd = { id: string; cmd: 'photo' | 'video' | 'switch' | 'stop'; secs?: number; label?: string; at: number };
let pending: PhoneCamCmd[] = [];
let lastFrameAt = 0;

/** Ordre de Nexus pour l'app (appelé par /api/nexus/data/phonecam-cmd, jeton du PC). */
export function queuePhoneCamCmd(c: Omit<PhoneCamCmd, 'id' | 'at'>): PhoneCamCmd {
  const cmd = { ...c, id: Math.random().toString(36).slice(2, 10), at: Date.now() };
  pending = [...pending.filter(p => Date.now() - p.at < 30_000), cmd].slice(-5);
  return cmd;
}
export const phoneCamLive = () => Date.now() - lastFrameAt < 8_000;

router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.ownerKey === 'houari') { res.status(403).json({ ok: false, error: 'Réservé à Kouider' }); return; }
  next();
});

// POST /frame { data: jpeg base64, w, h } → { ok, pc, cmds }
router.post('/frame', (req, res) => {
  const { data, w, h } = req.body as { data?: string; w?: number; h?: number };
  const pc = isNexusOnline();
  if (data && data.length < 900_000 && pc) {
    lastFrameAt = Date.now();
    sendToNexus('nexus:phonecam_frame', { data, w, h, ts: lastFrameAt });
  }
  const cmds = pending.filter(p => Date.now() - p.at < 30_000);
  pending = [];
  res.json({ ok: true, pc, cmds });
});

// POST /media { kind: photo|video, data: base64, mime, label } → enregistré sur le PC (accusé de Nexus)
router.post('/media', async (req, res) => {
  const { kind, data, mime, label, cmdId } = req.body as { kind?: string; data?: string; mime?: string; label?: string; cmdId?: string };
  if (!data || (kind !== 'photo' && kind !== 'video')) { res.status(400).json({ ok: false, error: 'kind photo|video et data requis' }); return; }
  if (!isNexusOnline()) { res.status(409).json({ ok: false, error: 'PC non connecté' }); return; }
  try {
    const r = await emitToNexusWithAck<{ ok: boolean; path?: string; error?: string }>('nexus:phonecam_media',
      { kind, data, mime: String(mime ?? (kind === 'photo' ? 'image/jpeg' : 'video/webm')).slice(0, 60), label: String(label ?? '').slice(0, 80), cmdId }, 60_000);
    res.json(r);
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /ask { question } → Nexus regarde la dernière image et répond (lire un document, état d'une voiture, plaque…)
router.post('/ask', async (req, res) => {
  const question = String((req.body as { question?: string })?.question ?? '').trim().slice(0, 400);
  if (!question) { res.status(400).json({ ok: false, error: 'question requise' }); return; }
  if (!isNexusOnline()) { res.status(409).json({ ok: false, error: 'PC non connecté' }); return; }
  try {
    const r = await emitToNexusWithAck<{ ok: boolean; text?: string; error?: string }>('nexus:command_sync',
      { text: `tu vois ça ? ${question}`, timeout: 45 }, 50_000);
    res.json({ ok: r.ok !== false, text: r.text || r.error || 'Pas de réponse de Nexus.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /stop → le widget se ferme sur le PC
router.post('/stop', (_req, res) => {
  lastFrameAt = 0;
  if (isNexusOnline()) sendToNexus('nexus:phonecam_stop', {});
  res.json({ ok: true });
});

export default router;
