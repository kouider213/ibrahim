// Écran du PC en direct depuis le téléphone : images + doigt (clic, glisser, défiler) + clavier.
// Monté à part (/api/nexus/live) avec sa propre limite : 2 à 4 images par seconde ne doivent pas
// consommer la limite générale de l'app (120/min partagée par toutes les routes).
import { Router, type Response } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import {
  isNexusOnline, nexusScreenshotJpeg, nexusMouseClick, nexusMouseDrag, nexusMouseScroll,
  nexusKeyPress, nexusTypeText, nexusHotkey,
} from '../../actions/handlers/nexus-relay.js';

const router = Router();

type Pt = { x: number; y: number; nx?: number; ny?: number };
const pt = (p: Partial<Pt> | undefined): Pt => ({
  x: Number(p?.x) || 0, y: Number(p?.y) || 0,
  ...(p?.nx != null && p?.ny != null ? { nx: Number(p.nx), ny: Number(p.ny) } : {}),
});

function online(res: Response): boolean {
  if (isNexusOnline()) return true;
  res.status(409).json({ ok: false, error: 'PC non connecté' });   // pas 503 : l'app basculerait sur le serveur de secours
  return false;
}

async function run(res: Response, fn: () => Promise<unknown>): Promise<void> {
  if (!online(res)) return;
  try { res.json(await fn()); }
  catch (err) { res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) }); }
}

// POST /frame { quality?, scale? } → { image_base64, width, height }
router.post('/frame', requireMobileAuth, (req, res) => {
  const { quality, scale } = req.body as { quality?: number; scale?: number };
  void run(res, () => nexusScreenshotJpeg(Math.min(90, Number(quality) || 50), Math.min(1, Number(scale) || 0.5), 15_000));
});

// POST /click { x, y, nx, ny, button }
router.post('/click', requireMobileAuth, (req, res) => {
  const { button, ...p } = req.body as Pt & { button?: 'left' | 'right' | 'double' };
  const q = pt(p);
  void run(res, () => nexusMouseClick(q.x, q.y, button ?? 'left', 3_000, q.nx != null ? { nx: q.nx, ny: q.ny ?? 0 } : undefined));
});

// POST /drag { from, to }
router.post('/drag', requireMobileAuth, (req, res) => {
  const { from, to } = req.body as { from?: Pt; to?: Pt };
  void run(res, () => nexusMouseDrag(pt(from), pt(to)));
});

// POST /scroll { direction, amount }
router.post('/scroll', requireMobileAuth, (req, res) => {
  const { direction, amount } = req.body as { direction?: 'up' | 'down'; amount?: number };
  void run(res, () => nexusMouseScroll(direction === 'up' ? 'up' : 'down', Math.max(1, Math.min(15, Number(amount) || 3))));
});

// POST /key { key } | { keys: [...] } | { text }
router.post('/key', requireMobileAuth, (req, res) => {
  const { key, keys, text } = req.body as { key?: string; keys?: string[]; text?: string };
  if (text) { void run(res, () => nexusTypeText(String(text).slice(0, 500))); return; }
  if (Array.isArray(keys) && keys.length) { void run(res, () => nexusHotkey(keys.map(String).slice(0, 4))); return; }
  if (key) { void run(res, () => nexusKeyPress(String(key))); return; }
  res.status(400).json({ ok: false, error: 'key, keys ou text requis' });
});

export default router;
