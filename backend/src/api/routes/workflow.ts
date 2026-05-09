/**
 * POST /api/workflow/test9
 * Lance le pipeline autonome end-to-end :
 *   1. Developer Agent détecte + patch (LLM)
 *   2. Nexus écrit le patch + exécute tsc --noEmit
 *   3. Code Reviewer valide ou refuse (LLM)
 *   4. Commit GitHub ou rollback automatique
 *   5. Rapport Telegram complet
 */
import { Router }            from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { runAutonomousPipeline } from '../../workflow/autonomous-pipeline.js';
import { isNexusOnline }     from '../../actions/handlers/nexus-relay.js';

const router = Router();

router.post('/test9', requireMobileAuth, async (req, res) => {
  const requestId = `pipeline_${Date.now()}`;
  console.log(`[workflow] ${requestId} — autonomous pipeline starting`);

  const nexusStatus = isNexusOnline();
  console.log(`[workflow] ${requestId} — nexus online: ${nexusStatus}`);

  try {
    const report = await runAutonomousPipeline(requestId);

    res.json({
      ok:           true,
      requestId,
      decision:     report.decision,
      commit_sha:   report.commitSha ?? null,
      rollback_reason: report.rollbackReason ?? null,
      total_ms:     report.totalMs,
      total_cost_usd: report.totalCostUsd,
      nexus_online: report.nexusOnline,
      telegram_sent: report.telegramSent,
      started_at:   report.startedAt,
      completed_at: report.completedAt,
      steps: report.steps.map(s => ({
        step:          s.step,
        status:        s.status,
        agent_id:      s.agentId ?? null,
        provider:      s.provider ?? null,
        model:         s.model ?? null,
        latency_ms:    s.latencyMs,
        input_tokens:  s.inputTokens ?? 0,
        output_tokens: s.outputTokens ?? 0,
        cost_usd:      s.costUsd ?? 0,
        output:        s.output.slice(0, 600),
        details:       s.details ?? null,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[workflow] ${requestId} CRASHED: ${msg}`);
    res.status(500).json({ ok: false, requestId, error: msg });
  }
});

// Quick status check
router.get('/status', requireMobileAuth, (_req, res) => {
  res.json({
    nexus_online:      isNexusOnline(),
    buggy_file:        'backend/src/test/buggy_rental_calc.ts',
    pipeline_endpoint: 'POST /api/workflow/test9',
    note:              'Nexus doit être connecté pour les étapes TSC et git. Sinon fallback statique.',
  });
});

export default router;
