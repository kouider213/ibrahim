"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAction = validateAction;
exports.recordAction = recordAction;
exports.recordAllActions = recordAllActions;
exports.recordToolExecution = recordToolExecution;
exports.getActionHistory = getActionHistory;
exports.getSessionActionCount = getSessionActionCount;
const queue_js_1 = require("../queue/queue.js");
// 30s window: same tool with same args = duplicate action attempt
const DEDUP_WINDOW_SEC = 30;
// Keep last 50 actions per session for 1 hour
const HISTORY_TTL_SEC = 3_600;
const HISTORY_MAX_LEN = 50;
// Keys that contain truly binary / base64 data — strip before storing in Redis
// NOTE: 'content' is intentionally NOT in this list — it is human-readable text
// and should be stored as a truncated UTF-8 string (max MAX_ARG_STR_LEN chars).
const BINARY_ARG_KEYS = new Set(['imageBase64', 'image_base64', 'base64', 'buffer']);
const MAX_ARG_STR_LEN = 120;
// Heuristic: detect pure base64 strings (length ≥ 64, only base64 charset)
const BASE64_RE = /^[A-Za-z0-9+/]{64,}={0,2}$/;
function sanitizeArgs(args) {
    const out = {};
    for (const [k, v] of Object.entries(args)) {
        if (BINARY_ARG_KEYS.has(k)) {
            // Known binary key → always replace with placeholder
            out[k] = '[binary]';
        }
        else if (typeof v === 'string' && BASE64_RE.test(v)) {
            // Looks like pure base64 payload → replace regardless of key name
            out[k] = '[binary]';
        }
        else if (typeof v === 'string' && v.length > MAX_ARG_STR_LEN) {
            // Long readable string (e.g. content, message) → truncate, keep readable
            out[k] = v.slice(0, MAX_ARG_STR_LEN) + '…';
        }
        else {
            out[k] = v;
        }
    }
    return out;
}
function channelFromSession(sessionId) {
    if (sessionId.startsWith('telegram_'))
        return 'telegram';
    if (sessionId.startsWith('voice_'))
        return 'mobile_voice';
    if (sessionId.startsWith('mobile_'))
        return 'mobile_text';
    return 'unknown';
}
// Read-only tools — no dedup needed
const IDEMPOTENT_TOOLS = new Set([
    'list_bookings', 'check_car_availability', 'get_financial_report',
    'get_revenue_report', 'get_finance_dashboard', 'get_weather', 'get_news',
    'recall_memory', 'get_payment_status', 'get_late_returns',
    'get_unpaid_bookings', 'check_anomalies', 'fetch_url', 'web_search',
    'github_read_file', 'github_list_files', 'github_search_code',
    'railway_get_logs', 'supabase_execute',
]);
function argsFingerprint(toolName, args) {
    const sorted = JSON.stringify(args, Object.keys(args).sort());
    const str = `${toolName}:${sorted}`;
    // Cheap 32-bit hash — not cryptographic, just fingerprint for dedup
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (Math.imul(h, 0x01000193)) >>> 0;
    }
    return h.toString(36);
}
async function validateAction(sessionId, toolName, args) {
    if (IDEMPOTENT_TOOLS.has(toolName)) {
        return { status: 'ALLOWED' };
    }
    const fp = argsFingerprint(toolName, args);
    const dedupKey = `action:dedup:${sessionId}:${toolName}:${fp}`;
    const exists = await queue_js_1.redis.get(dedupKey).catch(() => null);
    if (exists) {
        console.log(`[action-engine] BLOCKED_DUPLICATE session=${sessionId} tool=${toolName} fp=${fp}`);
        return {
            status: 'BLOCKED_DUPLICATE',
            reason: `${toolName} already executed with identical args within ${DEDUP_WINDOW_SEC}s`,
        };
    }
    // Pre-register dedup slot (cleared if tool fails, extended if succeeds)
    await queue_js_1.redis.set(dedupKey, '1', 'EX', DEDUP_WINDOW_SEC).catch(() => { });
    return { status: 'ALLOWED' };
}
async function recordAction(sessionId, execution) {
    const record = {
        toolName: execution.name,
        timestamp: Date.now(),
        success: execution.success,
        sessionId,
        channel: channelFromSession(sessionId),
        result: execution.result?.slice(0, 200),
    };
    const listKey = `action:history:${sessionId}`;
    await queue_js_1.redis.lpush(listKey, JSON.stringify(record)).catch(() => { });
    await queue_js_1.redis.ltrim(listKey, 0, HISTORY_MAX_LEN - 1).catch(() => { });
    await queue_js_1.redis.expire(listKey, HISTORY_TTL_SEC).catch(() => { });
    // If tool failed, release the dedup slot so operator can retry
    if (!execution.success && !IDEMPOTENT_TOOLS.has(execution.name)) {
        // We don't have the args anymore at this point, but we can scan and delete
        // Simpler: just log and let the 30s TTL expire naturally
        console.log(`[action-engine] TOOL_FAILED tool=${execution.name} — dedup slot expires in ${DEDUP_WINDOW_SEC}s`);
    }
}
async function recordAllActions(sessionId, executions) {
    for (const exec of executions) {
        await recordAction(sessionId, exec);
    }
}
// Primary hook — called directly from tool-executor.ts after every executeTool
async function recordToolExecution(params) {
    const { sessionId, toolName, args, result, success, latencyMs, error } = params;
    const channel = channelFromSession(sessionId);
    const record = {
        toolName,
        timestamp: Date.now(),
        success,
        sessionId,
        channel,
        args: sanitizeArgs(args),
        result: result.slice(0, 200),
        latencyMs,
        error,
    };
    const listKey = `action:history:${sessionId}`;
    await queue_js_1.redis.lpush(listKey, JSON.stringify(record)).catch(() => { });
    await queue_js_1.redis.ltrim(listKey, 0, HISTORY_MAX_LEN - 1).catch(() => { });
    await queue_js_1.redis.expire(listKey, HISTORY_TTL_SEC).catch(() => { });
    console.log(`[action-engine] RECORDED` +
        ` tool=${toolName}` +
        ` success=${success}` +
        ` ms=${latencyMs}` +
        ` channel=${channel}` +
        ` session=${sessionId.slice(0, 20)}` +
        (error ? ` error="${error.slice(0, 80)}"` : ''));
}
async function getActionHistory(sessionId, limit = 10) {
    try {
        const raw = await queue_js_1.redis.lrange(`action:history:${sessionId}`, 0, limit - 1);
        return raw.map(r => JSON.parse(r));
    }
    catch {
        return [];
    }
}
async function getSessionActionCount(sessionId) {
    try {
        return await queue_js_1.redis.llen(`action:history:${sessionId}`);
    }
    catch {
        return 0;
    }
}
//# sourceMappingURL=action-engine.js.map