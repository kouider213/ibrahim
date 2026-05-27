"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFocus = checkFocus;
exports.clearDedup = clearDedup;
exports.getSessionStats = getSessionStats;
const crypto_1 = require("crypto");
const queue_js_1 = require("../queue/queue.js");
const DEDUP_TTL_SEC = 10; // identical message within 10s = duplicate
const RATE_WINDOW_MS = 60_000; // 1-minute rate window
const RATE_MAX_MSGS = 30; // 30 msgs/min per session before throttle
const RATE_KEY_TTL = 65; // slightly > window to avoid race
function msgHash(sessionId, message) {
    return (0, crypto_1.createHash)('sha1')
        .update(`${sessionId}:${message.trim().toLowerCase()}`)
        .digest('hex')
        .slice(0, 20);
}
async function checkFocus(sessionId, message) {
    const hash = msgHash(sessionId, message);
    const dedupKey = `focus:dedup:${hash}`;
    const rateKey = `focus:rate:${sessionId}`;
    // Dedup check
    const dedupExists = await queue_js_1.redis.get(dedupKey).catch(() => null);
    if (dedupExists) {
        return {
            allowed: false,
            status: 'duplicate',
            retryAfterMs: DEDUP_TTL_SEC * 1000,
        };
    }
    // Rate check
    const rateRaw = await queue_js_1.redis.get(rateKey).catch(() => null);
    const rateData = rateRaw ? JSON.parse(rateRaw) : null;
    const now = Date.now();
    const windowActive = rateData !== null && now < rateData.reset;
    if (windowActive && rateData.count >= RATE_MAX_MSGS) {
        return {
            allowed: false,
            status: 'rate_limited',
            retryAfterMs: rateData.reset - now,
            sessionStats: { count: rateData.count, resetAt: rateData.reset },
        };
    }
    // Record dedup entry
    await queue_js_1.redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SEC).catch(() => { });
    // Update rate counter
    if (!windowActive) {
        const fresh = { count: 1, reset: now + RATE_WINDOW_MS };
        await queue_js_1.redis.set(rateKey, JSON.stringify(fresh), 'EX', RATE_KEY_TTL).catch(() => { });
        return { allowed: true, status: 'ok', sessionStats: { count: 1, resetAt: fresh.reset } };
    }
    const updated = { count: rateData.count + 1, reset: rateData.reset };
    await queue_js_1.redis.set(rateKey, JSON.stringify(updated), 'EX', RATE_KEY_TTL).catch(() => { });
    return {
        allowed: true,
        status: 'ok',
        sessionStats: { count: updated.count, resetAt: updated.reset },
    };
}
async function clearDedup(sessionId, message) {
    const hash = msgHash(sessionId, message);
    const dedupKey = `focus:dedup:${hash}`;
    await queue_js_1.redis.del(dedupKey).catch(() => { });
}
async function getSessionStats(sessionId) {
    const rateRaw = await queue_js_1.redis.get(`focus:rate:${sessionId}`).catch(() => null);
    if (!rateRaw)
        return { count: 0, resetAt: null };
    const data = JSON.parse(rateRaw);
    return { count: data.count, resetAt: data.reset };
}
//# sourceMappingURL=focus-manager.js.map