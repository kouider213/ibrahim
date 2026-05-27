"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setBISocket = setBISocket;
exports.emitBIRefresh = emitBIRefresh;
let _ns = null;
function setBISocket(ns) {
    _ns = ns;
}
function emitBIRefresh(type) {
    _ns?.emit('bi:refresh', { type, timestamp: new Date().toISOString() });
}
//# sourceMappingURL=bi-socket.js.map