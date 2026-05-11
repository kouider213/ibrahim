import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import {
  getActionHistory,
  getSessionActionCount,
  type ActionRecord,
} from '../../orchestrator/action-engine.js';

const router = Router();

// GET /api/orchestrator/actions/:sessionId
// Returns the last N ActionRecords from Redis action:history:{sessionId}
// Used to verify recordToolExecution is writing correctly after deploy.
router.get('/actions/:sessionId', requireMobileAuth, async (req, res) => {
  const sessionId = req.params['sessionId'] as string;
  const limit     = Math.min(Number(req.query['limit'] ?? 50), 50);

  console.log(`[orchestrator-api] GET /actions/${sessionId} limit=${limit}`);

  try {
    const [records, total] = await Promise.all([
      getActionHistory(sessionId, limit),
      getSessionActionCount(sessionId),
    ]);

    if (records.length === 0) {
      console.log(`[orchestrator-api] session=${sessionId} empty=true`);
      res.json({
        empty:     true,
        sessionId,
        total:     0,
        records:   [],
        redis_key: `action:history:${sessionId}`,
      });
      return;
    }

    console.log(
      `[orchestrator-api] session=${sessionId}` +
      ` total=${total} returned=${records.length}` +
      ` tools=[${records.slice(0, 5).map((r: ActionRecord) => r.toolName).join(',')}...]`,
    );

    res.json({
      empty:     false,
      sessionId,
      total,
      returned:  records.length,
      redis_key: `action:history:${sessionId}`,
      records,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator-api] ERROR session=${sessionId}: ${error}`);
    res.status(500).json({ error, sessionId });
  }
});

// GET /api/orchestrator/health
// Quick sanity check — confirms action-engine module loaded
router.get('/health', requireMobileAuth, (_req, res) => {
  res.json({
    status:   'ok',
    module:   'orchestrator-engine',
    version:  'p15',
    features: ['action-engine', 'focus-manager', 'priority-engine', 'context-engine'],
  });
});

export default router;
