"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectChannel = detectChannel;
exports.buildOrchestratorContext = buildOrchestratorContext;
exports.formatChannelForLog = formatChannelForLog;
const queue_js_1 = require("../queue/queue.js");
const supabase_js_1 = require("../integrations/supabase.js");
function detectChannel(sessionId) {
    if (sessionId.startsWith('telegram_'))
        return 'telegram';
    if (sessionId.startsWith('voice_'))
        return 'mobile_voice';
    if (sessionId.startsWith('mobile_'))
        return 'mobile_text';
    return 'backend_internal';
}
async function getChannelInfo(sessionId) {
    const channel = detectChannel(sessionId);
    const [tzRaw, lastSeenRaw] = await Promise.all([
        queue_js_1.redis.get(`user:tz:${sessionId}`).catch(() => null),
        queue_js_1.redis.get(`session:lastseen:${sessionId}`).catch(() => null),
    ]);
    // Update last seen timestamp
    await queue_js_1.redis.set(`session:lastseen:${sessionId}`, String(Date.now()), 'EX', 7 * 86_400).catch(() => { });
    return {
        channel,
        sessionId,
        timezone: tzRaw,
        lastSeenMs: lastSeenRaw ? parseInt(lastSeenRaw, 10) : null,
    };
}
async function getCrossChannelMessages(sessionId, windowHours = 2, limit = 4) {
    // Map session → complementary channel pattern
    let likePattern = null;
    if (sessionId === 'voice_kouider') {
        likePattern = 'telegram_%';
    }
    else if (sessionId.startsWith('telegram_')) {
        likePattern = 'voice_kouider';
    }
    else if (sessionId.startsWith('mobile_')) {
        likePattern = 'telegram_%';
    }
    if (!likePattern)
        return [];
    const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
    try {
        const { data, error } = await supabase_js_1.supabase
            .from('conversations')
            .select('role, content, session_id, created_at')
            .like('session_id', likePattern)
            .in('role', ['user', 'assistant'])
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        return (data ?? [])
            .reverse()
            .map(row => ({
            channel: detectChannel(row.session_id),
            role: row.role,
            content: String(row.content).slice(0, 300),
            timestamp: row.created_at,
        }));
    }
    catch {
        return [];
    }
}
async function getFleetSnapshot() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase_js_1.supabase
            .from('bookings')
            .select('status, start_date, end_date')
            .in('status', ['CONFIRMED', 'ACTIVE', 'PENDING']);
        if (error)
            throw error;
        const bookings = (data ?? []);
        const activeRentals = bookings.filter(b => (b.status === 'CONFIRMED' || b.status === 'ACTIVE') &&
            b.start_date <= today && b.end_date >= today).length;
        const pendingBookings = bookings.filter(b => b.status === 'PENDING').length;
        return {
            activeRentals,
            pendingBookings,
            totalOpen: activeRentals + pendingBookings,
        };
    }
    catch {
        return { activeRentals: 0, pendingBookings: 0, totalOpen: 0 };
    }
}
async function buildOrchestratorContext(sessionId) {
    const [channel, crossChannel, fleet] = await Promise.all([
        getChannelInfo(sessionId),
        getCrossChannelMessages(sessionId),
        getFleetSnapshot(),
    ]);
    return {
        channel,
        crossChannel,
        fleet,
        builtAtMs: Date.now(),
    };
}
function formatChannelForLog(info) {
    return `channel=${info.channel} session=${info.sessionId.slice(0, 20)} tz=${info.timezone ?? 'unknown'}`;
}
//# sourceMappingURL=context-engine.js.map