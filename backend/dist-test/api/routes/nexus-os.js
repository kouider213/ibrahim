"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const nexus_relay_js_1 = require("../../actions/handlers/nexus-relay.js");
const nexus_relay_js_2 = require("../../actions/handlers/nexus-relay.js");
const router = (0, express_1.Router)();
const guard = auth_js_1.requireMobileAuth;
// ── File Explorer ─────────────────────────────────────────────────────────────
// POST /api/nexus/os/file/list — { path? }
router.post('/file/list', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { path } = req.body;
    try {
        const r = await (0, nexus_relay_js_2.nexusFileList)(path);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// POST /api/nexus/os/file/search — { query, root?, max_results? }
router.post('/file/search', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { query, root, max_results } = req.body;
    if (!query?.trim()) {
        res.status(400).json({ ok: false, error: 'query required' });
        return;
    }
    try {
        const r = await (0, nexus_relay_js_2.nexusFileSearch)(query, root, max_results ?? 50);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// POST /api/nexus/os/file/read — { path }
router.post('/file/read', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { path } = req.body;
    if (!path?.trim()) {
        res.status(400).json({ ok: false, error: 'path required' });
        return;
    }
    try {
        const r = await (0, nexus_relay_js_2.nexusFileRead)(path);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// POST /api/nexus/os/file/send — { path, caption? } → Telegram
router.post('/file/send', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { path, caption } = req.body;
    if (!path?.trim()) {
        res.status(400).json({ ok: false, error: 'path required' });
        return;
    }
    try {
        const r = await (0, nexus_relay_js_2.nexusFileSend)(path, caption);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// POST /api/nexus/os/file/open — { path } → open in Explorer / default app
router.post('/file/open', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { path } = req.body;
    if (!path?.trim()) {
        res.status(400).json({ ok: false, error: 'path required' });
        return;
    }
    try {
        const r = await (0, nexus_relay_js_2.nexusFileOpen)(path);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// ── Window Manager ────────────────────────────────────────────────────────────
// GET /api/nexus/os/window/list
router.get('/window/list', guard, async (_req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    try {
        const r = await (0, nexus_relay_js_2.nexusWindowList)();
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// POST /api/nexus/os/window/focus — { title }
router.post('/window/focus', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { title } = req.body;
    if (!title?.trim()) {
        res.status(400).json({ ok: false, error: 'title required' });
        return;
    }
    try {
        const r = await (0, nexus_relay_js_2.nexusWindowFocus)(title);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// POST /api/nexus/os/window/close — { title }
router.post('/window/close', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { title } = req.body;
    if (!title?.trim()) {
        res.status(400).json({ ok: false, error: 'title required' });
        return;
    }
    try {
        const r = await (0, nexus_relay_js_2.nexusWindowClose)(title);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// POST /api/nexus/os/window/screenshot — { caption? } → Telegram
router.post('/window/screenshot', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { caption } = req.body;
    try {
        const r = await (0, nexus_relay_js_2.nexusWindowScreenshot)(caption);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// ── Process Manager ───────────────────────────────────────────────────────────
// GET /api/nexus/os/process/list?top=30&sort=ram
router.get('/process/list', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const top = Number(req.query['top']) || 30;
    const sort = req.query['sort'] || 'ram';
    try {
        const r = await (0, nexus_relay_js_2.nexusProcessList)(top, sort);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// POST /api/nexus/os/process/kill — { name } or { pid }
router.post('/process/kill', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { name, pid } = req.body;
    if (!name && !pid) {
        res.status(400).json({ ok: false, error: 'name or pid required' });
        return;
    }
    try {
        const r = await (0, nexus_relay_js_2.nexusProcessKill)(name, pid);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// ── App Launcher ──────────────────────────────────────────────────────────────
// POST /api/nexus/os/app/launch — { app }
// Available: chrome | vscode | telegram | spotify | terminal | notepad | explorer | dzaryx | capcut
router.post('/app/launch', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { app } = req.body;
    if (!app?.trim()) {
        res.status(400).json({ ok: false, error: 'app required' });
        return;
    }
    try {
        const r = await (0, nexus_relay_js_2.nexusAppLaunch)(app);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
// ── Screen Understanding ──────────────────────────────────────────────────────
// POST /api/nexus/os/screen/understand — { question?, send_to_telegram?, caption? }
router.post('/screen/understand', guard, async (req, res) => {
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        res.status(503).json({ ok: false, error: 'Nexus offline' });
        return;
    }
    const { question, send_to_telegram, caption } = req.body;
    try {
        const r = await (0, nexus_relay_js_2.nexusScreenUnderstand)(question, send_to_telegram ?? true, caption);
        res.json(r);
    }
    catch (e) {
        res.status(504).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
});
exports.default = router;
//# sourceMappingURL=nexus-os.js.map