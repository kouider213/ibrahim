"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.audit = audit;
exports.consoleLog = consoleLog;
const supabase_js_1 = require("../integrations/supabase.js");
async function audit(entry) {
    const { error } = await supabase_js_1.supabase.from('audit_logs').insert({
        actor: entry.actor ?? 'Dzaryx',
        action: entry.action,
        target: entry.target,
        target_id: entry.targetId,
        before: entry.before,
        after: entry.after,
        ip: entry.ip,
    });
    if (error) {
        console.error('[audit] Failed to write log:', error.message);
    }
}
function emit(entry) {
    const line = JSON.stringify(entry);
    if (entry.level === 'error') {
        process.stderr.write(line + '\n');
    }
    else {
        process.stdout.write(line + '\n');
    }
}
exports.logger = {
    debug(module, msg, data) {
        if (process.env['LOG_LEVEL'] === 'debug') {
            emit({ ts: new Date().toISOString(), level: 'debug', module, msg, data });
        }
    },
    info(module, msg, data) {
        emit({ ts: new Date().toISOString(), level: 'info', module, msg, data });
    },
    warn(module, msg, data) {
        emit({ ts: new Date().toISOString(), level: 'warn', module, msg, data });
    },
    error(module, msg, data) {
        emit({ ts: new Date().toISOString(), level: 'error', module, msg, data });
    },
    /** Wrap an async fn and emit its duration + outcome */
    async time(module, label, fn) {
        const start = Date.now();
        try {
            const result = await fn();
            emit({ ts: new Date().toISOString(), level: 'info', module, msg: label, ms: Date.now() - start });
            return result;
        }
        catch (err) {
            emit({
                ts: new Date().toISOString(), level: 'error', module,
                msg: `${label} FAILED`, ms: Date.now() - start,
                data: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    },
};
// ── Legacy helper kept for backward compat ────────────────────
function consoleLog(level, ...args) {
    exports.logger[level]('app', args.map(String).join(' '));
}
//# sourceMappingURL=logger.js.map