// Écran du PC en direct depuis le téléphone : images + doigt (clic, glisser, défiler) + clavier.
// Monté à part (/api/nexus/live) avec sa propre limite : 2 à 4 images par seconde ne doivent pas
// consommer la limite générale de l'app (120/min partagée par toutes les routes).
import { Router, type Request, type Response } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import {
  isNexusOnline, nexusScreenshotJpeg, nexusMouseClick, nexusMouseDrag, nexusMouseScroll,
  nexusKeyPress, nexusTypeText, nexusHotkey,
} from '../../actions/handlers/nexus-relay.js';
import { isCloudPcOnline, cloudEmit, cloudPcSince } from '../../actions/handlers/cloudpc-relay.js';

const router = Router();

type Pt = { x: number; y: number; nx?: number; ny?: number };
const pt = (p: Partial<Pt> | undefined): Pt => ({
  x: Number(p?.x) || 0, y: Number(p?.y) || 0,
  ...(p?.nx != null && p?.ny != null ? { nx: Number(p.nx), ny: Number(p.ny) } : {}),
});

// target='cloud' (body ou ?target=) → PC cloud du serveur (cloudpc-relay) ; sinon le laptop (Nexus).
const isCloud = (req: Request) => (req.body as { target?: string } | undefined)?.target === 'cloud' || req.query['target'] === 'cloud';

function online(res: Response, cloud = false): boolean {
  if (cloud ? isCloudPcOnline() : isNexusOnline()) return true;
  res.status(409).json({ ok: false, error: cloud ? 'PC cloud non connecté' : 'PC non connecté' });   // pas 503 : l'app basculerait sur le serveur de secours
  return false;
}

async function run(res: Response, fn: () => Promise<unknown>, cloud = false): Promise<void> {
  if (!online(res, cloud)) return;
  try { res.json(await fn()); }
  catch (err) { res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) }); }
}

// GET /targets → quels PC sont joignables (l'app choisit le laptop s'il est là, sinon le PC cloud)
router.get('/targets', requireMobileAuth, (_req, res) => {
  res.json({ ok: true, laptop: isNexusOnline(), cloud: isCloudPcOnline(), cloud_since: cloudPcSince() });
});

// POST /restart-browser → relancer le Chrome du PC cloud (profil et connexions gardés)
router.post('/restart-browser', requireMobileAuth, (_req, res) => {
  void run(res, () => cloudEmit('cloud:restart_browser', {}), true);
});

// POST /open { url, target:'cloud' } → ouvrir une adresse sur le PC cloud
router.post('/open', requireMobileAuth, (req, res) => {
  const url = String((req.body as { url?: string }).url ?? '').slice(0, 2000);
  void run(res, () => cloudEmit('cloud:open_url', { url }), true);
});

// POST /frame { quality?, scale? } → { image_base64, width, height }
router.post('/frame', requireMobileAuth, (req, res) => {
  const { quality, scale } = req.body as { quality?: number; scale?: number };
  const q = Math.min(90, Number(quality) || 50), sc = Math.min(1, Number(scale) || 0.5);
  if (isCloud(req)) { void run(res, () => cloudEmit('cloud:frame', { quality: q, scale: sc }, 15_000), true); return; }
  void run(res, () => nexusScreenshotJpeg(q, sc, 15_000));
});

// POST /click { x, y, nx, ny, button }
router.post('/click', requireMobileAuth, (req, res) => {
  const { button, target: _t, ...p } = req.body as Pt & { button?: 'left' | 'right' | 'double'; target?: string };
  const q = pt(p);
  if (isCloud(req)) { void run(res, () => cloudEmit('cloud:click', { x: q.x, y: q.y, nx: q.nx, ny: q.ny, button: button ?? 'left' }), true); return; }
  void run(res, () => nexusMouseClick(q.x, q.y, button ?? 'left', 3_000, q.nx != null ? { nx: q.nx, ny: q.ny ?? 0 } : undefined));
});

// POST /drag { from, to }
router.post('/drag', requireMobileAuth, (req, res) => {
  const { from, to } = req.body as { from?: Pt; to?: Pt };
  if (isCloud(req)) {
    const a = pt(from), b = pt(to);
    void run(res, () => cloudEmit('cloud:drag', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, nx1: a.nx, ny1: a.ny, nx2: b.nx, ny2: b.ny }), true);
    return;
  }
  void run(res, () => nexusMouseDrag(pt(from), pt(to)));
});

// POST /scroll { direction, amount }
router.post('/scroll', requireMobileAuth, (req, res) => {
  const { direction, amount } = req.body as { direction?: 'up' | 'down'; amount?: number };
  if (isCloud(req)) { void run(res, () => cloudEmit('cloud:scroll', { direction: direction === 'up' ? 'up' : 'down', amount: Math.max(1, Math.min(15, Number(amount) || 3)) }), true); return; }
  void run(res, () => nexusMouseScroll(direction === 'up' ? 'up' : 'down', Math.max(1, Math.min(15, Number(amount) || 3))));
});

// POST /key { key } | { keys: [...] } | { text }
router.post('/key', requireMobileAuth, (req, res) => {
  const { key, keys, text } = req.body as { key?: string; keys?: string[]; text?: string };
  if (isCloud(req)) {
    if (text) { void run(res, () => cloudEmit('cloud:type', { text: String(text).slice(0, 2000) }, 60_000), true); return; }
    if (Array.isArray(keys) && keys.length) { void run(res, () => cloudEmit('cloud:hotkey', { keys: keys.map(String).slice(0, 4) }), true); return; }
    if (key) { void run(res, () => cloudEmit('cloud:key', { key: String(key) }), true); return; }
    res.status(400).json({ ok: false, error: 'key, keys ou text requis' }); return;
  }
  if (text) { void run(res, () => nexusTypeText(String(text).slice(0, 500))); return; }
  if (Array.isArray(keys) && keys.length) { void run(res, () => nexusHotkey(keys.map(String).slice(0, 4))); return; }
  if (key) { void run(res, () => nexusKeyPress(String(key))); return; }
  res.status(400).json({ ok: false, error: 'key, keys ou text requis' });
});

export default router;
