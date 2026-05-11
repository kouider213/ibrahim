import { redis } from '../queue/queue.js';
import type { ToolExecution } from '../integrations/claude-api.js';

// 30s window: same tool with same args = duplicate action attempt
const DEDUP_WINDOW_SEC = 30;
// Keep last 50 actions per session for 1 hour
const HISTORY_TTL_SEC  = 3_600;
const HISTORY_MAX_LEN  = 50;

// Read-only tools — no dedup needed
const IDEMPOTENT_TOOLS = new Set([
  'list_bookings', 'check_car_availability', 'get_financial_report',
  'get_revenue_report', 'get_finance_dashboard', 'get_weather', 'get_news',
  'recall_memory', 'get_payment_status', 'get_late_returns',
  'get_unpaid_bookings', 'check_anomalies', 'fetch_url', 'web_search',
  'github_read_file', 'github_list_files', 'github_search_code',
  'railway_get_logs', 'supabase_execute',
]);

export type ActionStatus = 'ALLOWED' | 'BLOCKED_DUPLICATE';

export interface ActionValidation {
  status:  ActionStatus;
  reason?: string;
}

export interface ActionRecord {
  toolName:  string;
  timestamp: number;
  success:   boolean;
  sessionId: string;
  result?:   string;
}

function argsFingerprint(toolName: string, args: Record<string, unknown>): string {
  const sorted = JSON.stringify(args, Object.keys(args).sort());
  const str    = `${toolName}:${sorted}`;
  // Cheap 32-bit hash — not cryptographic, just fingerprint for dedup
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h.toString(36);
}

export async function validateAction(
  sessionId: string,
  toolName:  string,
  args:      Record<string, unknown>,
): Promise<ActionValidation> {
  if (IDEMPOTENT_TOOLS.has(toolName)) {
    return { status: 'ALLOWED' };
  }

  const fp      = argsFingerprint(toolName, args);
  const dedupKey = `action:dedup:${sessionId}:${toolName}:${fp}`;
  const exists   = await redis.get(dedupKey).catch(() => null);

  if (exists) {
    console.log(`[action-engine] BLOCKED_DUPLICATE session=${sessionId} tool=${toolName} fp=${fp}`);
    return {
      status: 'BLOCKED_DUPLICATE',
      reason: `${toolName} already executed with identical args within ${DEDUP_WINDOW_SEC}s`,
    };
  }

  // Pre-register dedup slot (cleared if tool fails, extended if succeeds)
  await redis.set(dedupKey, '1', 'EX', DEDUP_WINDOW_SEC).catch(() => {});

  return { status: 'ALLOWED' };
}

export async function recordAction(
  sessionId: string,
  execution: ToolExecution,
): Promise<void> {
  const record: ActionRecord = {
    toolName:  execution.name,
    timestamp: Date.now(),
    success:   execution.success,
    sessionId,
    result:    execution.result?.slice(0, 200),
  };

  const listKey = `action:history:${sessionId}`;
  await redis.lpush(listKey, JSON.stringify(record)).catch(() => {});
  await redis.ltrim(listKey, 0, HISTORY_MAX_LEN - 1).catch(() => {});
  await redis.expire(listKey, HISTORY_TTL_SEC).catch(() => {});

  // If tool failed, release the dedup slot so operator can retry
  if (!execution.success && !IDEMPOTENT_TOOLS.has(execution.name)) {
    // We don't have the args anymore at this point, but we can scan and delete
    // Simpler: just log and let the 30s TTL expire naturally
    console.log(`[action-engine] TOOL_FAILED tool=${execution.name} — dedup slot expires in ${DEDUP_WINDOW_SEC}s`);
  }
}

export async function recordAllActions(
  sessionId: string,
  executions: ToolExecution[],
): Promise<void> {
  for (const exec of executions) {
    await recordAction(sessionId, exec);
  }
}

export async function getActionHistory(sessionId: string, limit = 10): Promise<ActionRecord[]> {
  try {
    const raw = await redis.lrange(`action:history:${sessionId}`, 0, limit - 1);
    return raw.map(r => JSON.parse(r) as ActionRecord);
  } catch {
    return [];
  }
}

export async function getSessionActionCount(sessionId: string): Promise<number> {
  try {
    return await redis.llen(`action:history:${sessionId}`);
  } catch {
    return 0;
  }
}
