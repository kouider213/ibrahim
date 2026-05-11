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

// GET /api/health-ai/details
// Migration audit: which endpoints still call Anthropic directly vs using router
router.get('/details', requireMobileAuth, (_req, res) => {
  res.json({
    migration_status: {
      total_endpoints: 14,
      migrated: 8,
      partial: 2,
      not_migrated: 4,
      migration_pct: '57%',
    },
    migrated: [
      { endpoint: 'telegram.ts main chat',       provider: 'processWithOrchestration → Groq/OpenAI/Gemini fallback' },
      { endpoint: 'telegram.ts vision (image)',   provider: 'Gemini Vision → Claude fallback' },
      { endpoint: 'telegram.ts vision (video UI)', provider: 'Gemini Vision → Claude fallback' },
      { endpoint: 'telegram.ts OCR',             provider: 'Gemini Vision → Claude fallback' },
      { endpoint: 'telegram.ts folder suggest',  provider: 'Groq → Gemini → Haiku fallback' },
      { endpoint: 'vision.ts /analyze',          provider: 'Gemini Vision → Claude fallback' },
      { endpoint: 'vision.ts /scan',             provider: 'Gemini Vision → Claude fallback' },
      { endpoint: 'widget.ts /chat',             provider: 'Groq → Gemini → OpenAI → Haiku fallback' },
      { endpoint: 'compaction.ts summarize',     provider: 'Groq → Gemini → Haiku fallback' },
    ],
    partial: [
      { endpoint: 'orchestrator.ts main chat',   note: 'Has fallback chain (Groq→OpenAI→Gemini) but ONLY after Claude throws' },
      { endpoint: 'generate-voucher.ts',         note: 'Uses Anthropic for OCR — not user-facing chat path' },
    ],
    not_migrated: [
      { endpoint: 'agents/code-agent.ts',            note: 'Uses Claude tool_use — cannot migrate without rewrite' },
      { endpoint: 'agents/nexus-agent-runner.ts',    note: 'Uses Claude tool_use — cannot migrate without rewrite' },
      { endpoint: 'agents/code-audit-runner.ts',     note: 'Uses Claude tool_use — cannot migrate without rewrite' },
      { endpoint: 'agents/finance-agent-runner.ts',  note: 'Uses Claude tool_use — cannot migrate without rewrite' },
      { endpoint: 'agents/social-agent-runner.ts',   note: 'Uses Claude tool_use — cannot migrate without rewrite' },
    ],
    note: 'Tool-use agentic loops (code-agent, nexus-agent, etc.) require Anthropic tool_use feature — no drop-in replacement. These fail gracefully when Claude is down.',
    providers_active: {
      claude:  !!process.env['ANTHROPIC_API_KEY'],
      groq:    isGroqAvailable(),
      gemini:  isGeminiAvailable(),
      openai:  isOpenAIAvailable(),
      ollama:  false,
    },
  });
});

export default router;
