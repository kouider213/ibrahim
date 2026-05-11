import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { isGroqAvailable, isGeminiAvailable, isOpenAIAvailable } from '../../integrations/llm-router.js';
import { redis } from '../../queue/queue.js';

const router = Router();

// GET /api/health-ai
// Returns AI provider availability, usage counts, fallback events for today.
router.get('/', requireMobileAuth, async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const providers = ['claude', 'groq', 'gemini', 'openai', 'ollama'] as const;

  // Batch Redis reads for calls + fallback counts
  const pipeline = redis.pipeline();
  for (const p of providers) {
    pipeline.get(`provider:calls:${today}:${p}`);
    pipeline.get(`provider:fallback:${today}:${p}`);
  }
  // Claude failure events (fallback chain entered)
  pipeline.get(`provider:fallback:${today}:claude`);

  let results: Array<string | null> = [];
  try {
    const raw = await pipeline.exec();
    results = (raw ?? []).map(([, v]) => v as string | null);
  } catch {
    // Redis unavailable — return zeros
  }

  // Parse counts — 2 values per provider (calls + fallback:success) + 1 for claude failures
  const callsIndex     = (i: number) => Number(results[i * 2]     ?? 0);
  const fallbackIndex  = (i: number) => Number(results[i * 2 + 1] ?? 0);
  const claudeFailures = Number(results[providers.length * 2]      ?? 0);

  const anthropicAvailable = !!process.env['ANTHROPIC_API_KEY'];

  const providerStatus: Record<string, {
    available: boolean;
    calls_today: number;
    fallback_success_today: number;
    emoji: string;
  }> = {
    claude: {
      available:              anthropicAvailable,
      calls_today:            callsIndex(0),
      fallback_success_today: fallbackIndex(0),
      emoji:                  anthropicAvailable ? '🟢' : '🔴',
    },
    groq: {
      available:              isGroqAvailable(),
      calls_today:            callsIndex(1),
      fallback_success_today: fallbackIndex(1),
      emoji:                  isGroqAvailable() ? '🟢' : '🔴',
    },
    gemini: {
      available:              isGeminiAvailable(),
      calls_today:            callsIndex(2),
      fallback_success_today: fallbackIndex(2),
      emoji:                  isGeminiAvailable() ? '🟢' : '🔴',
    },
    openai: {
      available:              isOpenAIAvailable(),
      calls_today:            callsIndex(3),
      fallback_success_today: fallbackIndex(3),
      emoji:                  isOpenAIAvailable() ? '🟢' : '🟡',
    },
    ollama: {
      available:              false,
      calls_today:            callsIndex(4),
      fallback_success_today: fallbackIndex(4),
      emoji:                  '🔴',
    },
  };

  // Determine active fallback (any non-claude provider with fallback_success > 0 today)
  const activeFallback = Object.entries(providerStatus)
    .filter(([k, v]) => k !== 'claude' && v.fallback_success_today > 0)
    .sort(([, a], [, b]) => b.fallback_success_today - a.fallback_success_today)
    .map(([k]) => k)[0] ?? null;

  // Survival status: can we respond without Claude?
  const canSurvive = isGroqAvailable() || isGeminiAvailable() || isOpenAIAvailable();

  res.json({
    status:                  'ok',
    date:                    today,
    providers:               providerStatus,
    active_fallback:         activeFallback,
    claude_failures_today:   claudeFailures,
    fallback_events_today:   claudeFailures,
    survival_status:         canSurvive ? '✅ Dzaryx survive sans Claude' : '❌ Aucun fallback disponible',
    survival_providers:      {
      groq:    isGroqAvailable(),
      gemini:  isGeminiAvailable(),
      openai:  isOpenAIAvailable(),
    },
  });
});

export default router;
