import { Router } from 'express';
import { z } from 'zod';
import { requireMobileAuth } from '../middleware/auth.js';
import { getFileContent, updateFile, listDirectory, getRecentCommits, createClientSiteOnNetlify } from '../../integrations/github.js';

const router = Router();

// GET /api/github/site/files — lister les fichiers du site Fik Conciergerie
router.get('/site/files', requireMobileAuth, async (req, res) => {
  const dir = (req.query['dir'] as string) ?? '';
  const files = await listDirectory(dir);
  res.json({ files });
});

// GET /api/github/site/read — lire un fichier
router.get('/site/read', requireMobileAuth, async (req, res) => {
  const path = req.query['path'] as string;
  if (!path) { res.status(400).json({ error: 'path required' }); return; }
  const file = await getFileContent(path);
  if (!file) { res.status(404).json({ error: 'File not found' }); return; }
  res.json({ path, content: file.content, sha: file.sha });
});

// POST /api/github/site/update — modifier un fichier du site
const updateSchema = z.object({
  path:    z.string().min(1),
  content: z.string().min(1),
  message: z.string().min(1).default('Ibrahim: mise à jour du site'),
});

router.post('/site/update', requireMobileAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const result = await updateFile(parsed.data.path, parsed.data.content, parsed.data.message);
  if (!result) { res.status(500).json({ error: 'GitHub update failed' }); return; }
  res.json({ success: true, commitSha: result.commitSha });
});

// GET /api/github/site/commits — voir les derniers commits
router.get('/site/commits', requireMobileAuth, async (_req, res) => {
  const commits = await getRecentCommits();
  res.json({ commits });
});

// POST /api/github/clients/create — créer un site pour un client
const clientSiteSchema = z.object({
  clientName:   z.string().min(2),
  businessType: z.string().min(2),
  phone:        z.string().min(9),
  city:         z.string().min(2),
});

router.post('/clients/create', requireMobileAuth, async (req, res) => {
  const parsed = clientSiteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const site = await createClientSiteOnNetlify(parsed.data);
  if (!site) { res.status(500).json({ error: 'Site creation failed' }); return; }
  res.json({ success: true, ...site });
});

export default router;
