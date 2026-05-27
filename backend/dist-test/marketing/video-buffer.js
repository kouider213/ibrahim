"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addVideoToBuffer = addVideoToBuffer;
exports.getVideoBuffer = getVideoBuffer;
exports.clearVideoBuffer = clearVideoBuffer;
const sessionBuffers = new Map();
function addVideoToBuffer(sessionId, fileId) {
    const existing = sessionBuffers.get(sessionId) ?? [];
    existing.push(fileId);
    sessionBuffers.set(sessionId, existing.slice(-10));
}
function getVideoBuffer(sessionId) {
    return sessionBuffers.get(sessionId) ?? [];
}
function clearVideoBuffer(sessionId) {
    sessionBuffers.delete(sessionId);
}
//# sourceMappingURL=video-buffer.js.map