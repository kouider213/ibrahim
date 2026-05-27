"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_js_1 = require("../middleware/auth.js");
const github_js_1 = require("../../integrations/github.js");
const router = (0, express_1.Router)();
// GET /api/github/site/files — lister les fichiers du site Fik Conciergerie
router.get('/site/files', auth_js_1.requireMobileAuth, async (req, res) => {
    const dir = req.query['dir'] ?? '';
    const files = await (0, github_js_1.listDirectory)(dir);
    res.json({ files });
});
// GET /api/github/site/read — lire un fichier
router.get('/site/read', auth_js_1.requireMobileAuth, async (req, res) => {
    const path = req.query['path'];
    if (!path) {
        res.status(400).json({ error: 'path required' });
        return;
    }
    const file = await (0, github_js_1.getFileContent)(path);
    if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
    }
    res.json({ path, content: file.content, sha: file.sha });
});
// POST /api/github/site/update — modifier un fichier du site
const updateSchema = zod_1.z.object({
    path: zod_1.z.string().min(1),
    content: zod_1.z.string().min(1),
    message: zod_1.z.string().min(1).default('Dzaryx: mise à jour du site'),
});
router.post('/site/update', auth_js_1.requireMobileAuth, async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors });
        return;
    }
    const result = await (0, github_js_1.updateFile)(parsed.data.path, parsed.data.content, parsed.data.message);
    if (!result) {
        res.status(500).json({ error: 'GitHub update failed' });
        return;
    }
    res.json({ success: true, commitSha: result.commitSha });
});
// GET /api/github/site/commits — voir les derniers commits
router.get('/site/commits', auth_js_1.requireMobileAuth, async (_req, res) => {
    const commits = await (0, github_js_1.getRecentCommits)();
    res.json({ commits });
});
// POST /api/github/clients/create — créer un site pour un client
const clientSiteSchema = zod_1.z.object({
    clientName: zod_1.z.string().min(2),
    businessType: zod_1.z.string().min(2),
    phone: zod_1.z.string().min(9),
    city: zod_1.z.string().min(2),
});
router.post('/clients/create', auth_js_1.requireMobileAuth, async (req, res) => {
    const parsed = clientSiteSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors });
        return;
    }
    const site = await (0, github_js_1.createClientSiteOnNetlify)(parsed.data);
    if (!site) {
        res.status(500).json({ error: 'Site creation failed' });
        return;
    }
    res.json({ success: true, ...site });
});
exports.default = router;
//# sourceMappingURL=github.js.map