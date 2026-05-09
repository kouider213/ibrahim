import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { isNexusOnline }     from '../../actions/handlers/nexus-relay.js';
import {
  nexusFileList, nexusFileSearch, nexusFileRead, nexusFileSend, nexusFileOpen,
  nexusWindowList, nexusWindowFocus, nexusWindowClose, nexusWindowScreenshot,
  nexusProcessList, nexusProcessKill,
  nexusAppLaunch,
  nexusScreenUnderstand,
} from '../../actions/handlers/nexus-relay.js';

const router = Router();
const guard  = requireMobileAuth;

// ── File Explorer ─────────────────────────────────────────────────────────────

// POST /api/nexus/os/file/list — { path? }
router.post('/file/list', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { path } = req.body as { path?: string };
  try {
    const r = await nexusFileList(path);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/nexus/os/file/search — { query, root?, max_results? }
router.post('/file/search', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { query, root, max_results } = req.body as { query?: string; root?: string; max_results?: number };
  if (!query?.trim()) { res.status(400).json({ ok: false, error: 'query required' }); return; }
  try {
    const r = await nexusFileSearch(query, root, max_results ?? 50);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/nexus/os/file/read — { path }
router.post('/file/read', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { path } = req.body as { path?: string };
  if (!path?.trim()) { res.status(400).json({ ok: false, error: 'path required' }); return; }
  try {
    const r = await nexusFileRead(path);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/nexus/os/file/send — { path, caption? } → Telegram
router.post('/file/send', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { path, caption } = req.body as { path?: string; caption?: string };
  if (!path?.trim()) { res.status(400).json({ ok: false, error: 'path required' }); return; }
  try {
    const r = await nexusFileSend(path, caption);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/nexus/os/file/open — { path } → open in Explorer / default app
router.post('/file/open', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { path } = req.body as { path?: string };
  if (!path?.trim()) { res.status(400).json({ ok: false, error: 'path required' }); return; }
  try {
    const r = await nexusFileOpen(path);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// ── Window Manager ────────────────────────────────────────────────────────────

// GET /api/nexus/os/window/list
router.get('/window/list', guard, async (_req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  try {
    const r = await nexusWindowList();
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/nexus/os/window/focus — { title }
router.post('/window/focus', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { title } = req.body as { title?: string };
  if (!title?.trim()) { res.status(400).json({ ok: false, error: 'title required' }); return; }
  try {
    const r = await nexusWindowFocus(title);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/nexus/os/window/close — { title }
router.post('/window/close', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { title } = req.body as { title?: string };
  if (!title?.trim()) { res.status(400).json({ ok: false, error: 'title required' }); return; }
  try {
    const r = await nexusWindowClose(title);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/nexus/os/window/screenshot — { caption? } → Telegram
router.post('/window/screenshot', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { caption } = req.body as { caption?: string };
  try {
    const r = await nexusWindowScreenshot(caption);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// ── Process Manager ───────────────────────────────────────────────────────────

// GET /api/nexus/os/process/list?top=30&sort=ram
router.get('/process/list', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const top  = Number(req.query['top'])  || 30;
  const sort = (req.query['sort'] as 'ram' | 'cpu') || 'ram';
  try {
    const r = await nexusProcessList(top, sort);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// POST /api/nexus/os/process/kill — { name } or { pid }
router.post('/process/kill', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { name, pid } = req.body as { name?: string; pid?: number };
  if (!name && !pid) { res.status(400).json({ ok: false, error: 'name or pid required' }); return; }
  try {
    const r = await nexusProcessKill(name, pid);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// ── App Launcher ──────────────────────────────────────────────────────────────

// POST /api/nexus/os/app/launch — { app }
// Available: chrome | vscode | telegram | spotify | terminal | notepad | explorer | dzaryx | capcut
router.post('/app/launch', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { app } = req.body as { app?: string };
  if (!app?.trim()) { res.status(400).json({ ok: false, error: 'app required' }); return; }
  try {
    const r = await nexusAppLaunch(app);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

// ── Screen Understanding ──────────────────────────────────────────────────────

// POST /api/nexus/os/screen/understand — { question?, send_to_telegram?, caption? }
router.post('/screen/understand', guard, async (req, res) => {
  if (!isNexusOnline()) { res.status(503).json({ ok: false, error: 'Nexus offline' }); return; }
  const { question, send_to_telegram, caption } = req.body as {
    question?: string; send_to_telegram?: boolean; caption?: string;
  };
  try {
    const r = await nexusScreenUnderstand(question, send_to_telegram ?? true, caption);
    res.json(r);
  } catch (e) { res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
});

export default router;
