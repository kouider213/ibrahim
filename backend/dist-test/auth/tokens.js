"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateToken = validateToken;
exports.extractBearerToken = extractBearerToken;
exports.signHmac = signHmac;
exports.verifyHmac = verifyHmac;
const crypto_1 = require("crypto");
const env_js_1 = require("../config/env.js");
const TOKEN_MAP = {
    'mobile': env_js_1.env.MOBILE_ACCESS_TOKEN,
    'pc-agent': env_js_1.env.PC_AGENT_TOKEN,
    'webhook': env_js_1.env.WEBHOOK_SECRET,
};
function validateToken(token, type) {
    const expected = TOKEN_MAP[type];
    if (!expected)
        return false;
    try {
        const a = Buffer.from(token.padEnd(64));
        const b = Buffer.from(expected.padEnd(64));
        return a.length === b.length && (0, crypto_1.timingSafeEqual)(a, b);
    }
    catch {
        return false;
    }
}
function extractBearerToken(req) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
        return null;
    return header.slice(7);
}
function signHmac(payload) {
    return (0, crypto_1.createHmac)('sha256', env_js_1.env.WEBHOOK_SECRET).update(payload).digest('hex');
}
function verifyHmac(payload, signature) {
    const expected = signHmac(payload);
    try {
        return (0, crypto_1.timingSafeEqual)(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=tokens.js.map