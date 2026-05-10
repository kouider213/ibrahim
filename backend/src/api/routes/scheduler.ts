import { Router } from 'express';
import { schedulerQueue, triggerJob, triggerCustomReminder, getSchedulerStatus } from '../../queue/scheduler.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/scheduler/jobs — list repeatable jobs with next fire time
router.get('/jobs', requireMobileAuth, async (_req, res) => {
  try {
    const repeatable = await schedulerQueue.getRepeatableJobs();
    res.json({ jobs: repeatable.map(j => ({ name: j.name, cron: j.pattern, next: j.next })) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/scheduler/status — queue health (waiting/active/completed/failed + Redis ping)
router.get('/status', requireMobileAuth, async (_req, res) => {
  try {
    const status = await getSchedulerStatus();
    res.json({ ok: true, ...status, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/scheduler/trigger/:name — manual trigger any known cron job
router.post('/trigger/:name', requireMobileAuth, async (req, res) => {
  const { name } = req.params as { name: string };
  const ok = await triggerJob(name);
  if (!ok) {
    res.status(404).json({ error: `Unknown job: ${name}` });
    return;
  }
  res.json({ triggered: true, job: name, queued_at: new Date().toISOString() });
});

// POST /api/scheduler/test-telegram — fire a custom-reminder → real Telegram message (P11 runtime proof)
router.post('/test-telegram', requireMobileAuth, async (req, res) => {
  const { message } = req.body as { message?: string };
  const msg = message?.trim() || `🧪 P11 BullMQ Test — ${new Date().toISOString()} — scheduler worker ALIVE`;
  const idempotencyKey = `p11_test_${Date.now()}`;
  try {
    const jobId = await triggerCustomReminder(msg, idempotencyKey);
    res.json({
      ok:               true,
      job_id:           jobId,
      idempotency_key:  idempotencyKey,
      message:          msg,
      queued_at:        new Date().toISOString(),
      note:             'Check Telegram — message should arrive in <5s if worker is alive',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
