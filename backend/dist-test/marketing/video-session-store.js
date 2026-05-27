"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveVideoSession = saveVideoSession;
exports.getLatestVideoSession = getLatestVideoSession;
exports.getVideoSessionById = getVideoSessionById;
const _sessions = new Map();
let _latestSessionId = null;
function saveVideoSession(session) {
    const id = `vsess_${Date.now()}`;
    const full = { ...session, id, createdAt: new Date().toISOString() };
    _sessions.set(id, full);
    _latestSessionId = id;
    // keep only last 10 sessions
    if (_sessions.size > 10) {
        const oldest = [..._sessions.keys()][0];
        _sessions.delete(oldest);
    }
    return full;
}
function getLatestVideoSession() {
    if (!_latestSessionId)
        return null;
    return _sessions.get(_latestSessionId) ?? null;
}
function getVideoSessionById(id) {
    return _sessions.get(id) ?? null;
}
//# sourceMappingURL=video-session-store.js.map