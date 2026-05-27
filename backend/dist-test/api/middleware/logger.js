"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
exports.errorHandler = errorHandler;
function requestLogger(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        const color = res.statusCode >= 500 ? '\x1b[31m'
            : res.statusCode >= 400 ? '\x1b[33m'
                : '\x1b[32m';
        console.log(`${color}[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} +${ms}ms\x1b[0m`);
    });
    next();
}
function errorHandler(err, _req, res, _next) {
    console.error('[error]', err.message, err.stack);
    res.status(500).json({ error: 'Internal server error', message: err.message });
}
//# sourceMappingURL=logger.js.map