/**
 * Episode Tracker — auto-classify and save notable conversation turns to memory_episodes.
 * Called non-blocking from orchestrator after each AI response.
 *
 * Only saves turns where real tools were used (booking, financial, document).
 * Skips small-talk / fast-path responses.
 */

import { addMemoryEpisode, type EpisodeType } from '../integrations/supabase.js';

interface ToolExecuted { name: string; success: boolean; result?: string }

interface EpisodeCtx {
  sessionId:     string;
  userMessage:   string;
  aiResponse:    string;
  toolsExecuted: ToolExecuted[];
  source:        'telegram' | 'app' | 'cron' | 'nexus' | 'system' | 'manual';
  actorUserId:   string;
}

// Map tool → episode type + importance
const TOOL_EPISODE_MAP: Array<{
  tools:      string[];
  type:       EpisodeType;
  importance: 1 | 2 | 3 | 4 | 5;
}> = [
  {
    tools:      ['create_booking'],
    type:       'booking_event',
    importance: 5,
  },
  {
    tools:      ['update_booking', 'cancel_booking', 'delete_booking'],
    type:       'booking_event',
    importance: 4,
  },
  {
    tools:      ['record_payment', 'generate_receipt'],
    type:       'financial_event',
    importance: 4,
  },
  {
    tools:      ['get_financial_report', 'get_revenue_report', 'get_finance_dashboard', 'check_anomalies'],
    type:       'financial_event',
    importance: 3,
  },
  {
    tools:      ['store_document', 'get_client_document'],
    type:       'document_scan',
    importance: 3,
  },
  {
    tools:      ['schedule_reminder', 'learn_rule'],
    type:       'user_request',
    importance: 2,
  },
];

function classifyEpisode(tools: ToolExecuted[]): {
  type:       EpisodeType;
  importance: 1 | 2 | 3 | 4 | 5;
} | null {
  const successNames = new Set(tools.filter(t => t.success).map(t => t.name));
  if (successNames.size === 0) return null;

  for (const mapping of TOOL_EPISODE_MAP) {
    if (mapping.tools.some(n => successNames.has(n))) {
      return { type: mapping.type, importance: mapping.importance };
    }
  }
  return null;
}

export async function trackEpisode(ctx: EpisodeCtx): Promise<void> {
  try {
    const classification = classifyEpisode(ctx.toolsExecuted);
    if (!classification) return;

    const summary = ctx.userMessage.length > 200
      ? `${ctx.userMessage.slice(0, 200)}…`
      : ctx.userMessage;

    // Booking events live 90 days; financial 30 days; document 60 days; others 30 days
    const expiryDays = classification.type === 'booking_event'  ? 90
                     : classification.type === 'document_scan'  ? 60
                     : 30;
    const expires_at = new Date(Date.now() + expiryDays * 86_400_000).toISOString();

    await addMemoryEpisode({
      episode_type: classification.type,
      summary,
      entities: {
        toolsUsed:       ctx.toolsExecuted.filter(t => t.success).map(t => t.name),
        actorUserId:     ctx.actorUserId,
        responsePreview: ctx.aiResponse.slice(0, 300),
      },
      sentiment:   'neutral',
      importance:  classification.importance,
      session_id:  ctx.sessionId,
      source:      ctx.source,
      expires_at,
    });

    console.log(`[episode-tracker] ${classification.type} (importance=${classification.importance}) saved for session=${ctx.sessionId}`);
  } catch (err) {
    // Non-critical — never crash the main flow
    console.warn('[episode-tracker] save failed:', err instanceof Error ? err.message : String(err));
  }
}
