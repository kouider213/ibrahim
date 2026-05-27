"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const action_engine_js_1 = require("../../orchestrator/action-engine.js");
const router = (0, express_1.Router)();
// GET /api/orchestrator/actions/:sessionId
// Returns the last N ActionRecords from Redis action:history:{sessionId}
// Used to verify recordToolExecution is writing correctly after deploy.
router.get('/actions/:sessionId', auth_js_1.requireMobileAuth, async (req, res) => {
    const sessionId = req.params['sessionId'];
    const limit = Math.min(Number(req.query['limit'] ?? 50), 50);
    console.log(`[orchestrator-api] GET /actions/${sessionId} limit=${limit}`);
    try {
        const [records, total] = await Promise.all([
            (0, action_engine_js_1.getActionHistory)(sessionId, limit),
            (0, action_engine_js_1.getSessionActionCount)(sessionId),
        ]);
        if (records.length === 0) {
            console.log(`[orchestrator-api] session=${sessionId} empty=true`);
            res.json({
                empty: true,
                sessionId,
                total: 0,
                records: [],
                redis_key: `action:history:${sessionId}`,
            });
            return;
        }
        console.log(`[orchestrator-api] session=${sessionId}` +
            ` total=${total} returned=${records.length}` +
            ` tools=[${records.slice(0, 5).map((r) => r.toolName).join(',')}...]`);
        res.json({
            empty: false,
            sessionId,
            total,
            returned: records.length,
            redis_key: `action:history:${sessionId}`,
            records,
        });
    }
    catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[orchestrator-api] ERROR session=${sessionId}: ${error}`);
        res.status(500).json({ error, sessionId });
    }
});
// GET /api/orchestrator/health
// Quick sanity check — confirms action-engine module loaded
router.get('/health', auth_js_1.requireMobileAuth, (_req, res) => {
    res.json({
        status: 'ok',
        module: 'orchestrator-engine',
        version: 'p15',
        features: ['action-engine', 'focus-manager', 'priority-engine', 'context-engine'],
    });
});
exports.default = router;
//# sourceMappingURL=orchestrator.js.map