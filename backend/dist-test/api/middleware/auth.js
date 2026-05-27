"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireMobileAuth = requireMobileAuth;
exports.requirePcAuth = requirePcAuth;
const tokens_js_1 = require("../../auth/tokens.js");
function requireAuth(tokenType) {
    return (req, res, next) => {
        const token = (0, tokens_js_1.extractBearerToken)(req);
        if (!token) {
            res.status(401).json({ error: 'Missing authorization token' });
            return;
        }
        if (!(0, tokens_js_1.validateToken)(token, tokenType)) {
            res.status(403).json({ error: 'Invalid token' });
            return;
        }
        next();
    };
}
function requireMobileAuth(req, res, next) {
    requireAuth('mobile')(req, res, next);
}
function requirePcAuth(req, res, next) {
    requireAuth('pc-agent')(req, res, next);
}
//# sourceMappingURL=auth.js.map