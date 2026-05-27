"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPcRelay = initPcRelay;
exports.registerPcAgent = registerPcAgent;
exports.unregisterPcAgent = unregisterPcAgent;
exports.isPcAgentConnected = isPcAgentConnected;
exports.handlePcRelay = handlePcRelay;
const constants_js_1 = require("../../config/constants.js");
let _io = null;
let _pcSocketId = null;
function initPcRelay(io) {
    _io = io;
}
function registerPcAgent(socketId) {
    _pcSocketId = socketId;
    console.log(`[pc-relay] PC agent connected: ${socketId}`);
}
function unregisterPcAgent(socketId) {
    if (_pcSocketId === socketId) {
        _pcSocketId = null;
        console.log('[pc-relay] PC agent disconnected');
    }
}
function isPcAgentConnected() {
    return _pcSocketId !== null;
}
async function handlePcRelay(payload) {
    if (!_io || !_pcSocketId) {
        return { success: false, error: 'pc_offline', message: "L'agent PC n'est pas connecté." };
    }
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            resolve({ success: false, error: 'timeout', message: "L'agent PC n'a pas répondu dans les délais." });
        }, 30_000);
        const correlationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        _io.once(`${constants_js_1.SOCKET_EVENTS.PC_RESULT}:${correlationId}`, (result) => {
            clearTimeout(timeout);
            resolve(result);
        });
        _io.to(_pcSocketId).emit(constants_js_1.SOCKET_EVENTS.PC_COMMAND, {
            correlationId,
            action: payload.action,
            params: payload.params,
        });
    });
}
//# sourceMappingURL=pc-relay.js.map