import { Router, type Request, type Response, type NextFunction } from 'express';
import { extractBearerToken, validateToken } from '../../auth/tokens.js';
import { nextJobForWorker, updateJobFromWorker } from '../../integrations/browser-relay.js';

// Routes du navigateur du serveur (browser-worker/ sur le VPS) — token de l'agent PC uniquement.
function requireWorker(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (token && validateToken(token, 'pc-agent')) { next(); return; }
  res.status(403).json({ error: 'forbidden' });
}

const router = Router();

// POST /api/browser/next → { job: { id, task, status: 'queued'|'answered', answer? } | null }
router.post('/next', requireWorker, async (_req, res) => {
  const job = await nextJobForWorker().catch(() => null);
  res.json({ job: job ? { id: job.id, task: job.task, status: job.status, answer: job.answer ?? null } : null });
});

// POST /api/browser/update { id, status: 'waiting'|'done'|'error', text }
router.post('/update', requireWorker, async (req, res) => {
  const { id, status, text } = req.body as { id?: string; status?: string; text?: string };
  if (!id || !['waiting', 'done', 'error'].includes(String(status))) { res.status(400).json({ error: 'bad request' }); return; }
  const ok = await updateJobFromWorker(id, { status: status as 'waiting' | 'done' | 'error', text: String(text ?? '').slice(0, 4000) });
  res.json({ ok });
});

export default router;
