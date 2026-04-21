import { Router } from 'express';
import { schedulerQueue, triggerJob } from '../../queue/scheduler.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/scheduler/jobs — list repeatable jobs
router.get('/jobs', requireMobileAuth, async (_req, res) => {
  try {
    const repeatable = await schedulerQueue.getRepeatableJobs();
    res.json({ jobs: repeatable.map(j => ({ name: j.name, cron: j.pattern, next: j.next })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/scheduler/trigger/:name — manual trigger
router.post('/trigger/:name', requireMobileAuth, async (req, res) => {
  const { name } = req.params as { name: string };
  const ok = await triggerJob(name);
  if (!ok) {
    res.status(404).json({ error: `Unknown job: ${name}` });
    return;
  }
  res.json({ triggered: true, job: name });
});

export default router;
