"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const orchestrator_engine_js_1 = require("../../orchestrator/orchestrator-engine.js");
const auth_js_1 = require("../middleware/auth.js");
const supabase_js_1 = require("../../integrations/supabase.js");
const queue_js_1 = require("../../queue/queue.js");
const timezone_js_1 = require("../../utils/timezone.js");
const router = (0, express_1.Router)();
const messageSchema = zod_1.z.object({
    message: zod_1.z.string().min(1).max(4000),
    sessionId: zod_1.z.string().min(1).max(128),
    textOnly: zod_1.z.boolean().optional().default(false),
    imageBase64: zod_1.z.string().optional(),
    imageMime: zod_1.z.string().optional().default('image/jpeg'),
});
// POST /api/chat — send a message to Dzaryx
router.post('/', auth_js_1.requireMobileAuth, async (req, res) => {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
        return;
    }
    const { message, sessionId, textOnly, imageBase64, imageMime } = parsed.data;
    const _channel = sessionId.startsWith('voice_') ? 'mobile_voice' : 'mobile_text';
    console.log(`[MOBILE_RUNTIME] channel=${_channel} endpoint=/api/chat session=${sessionId.slice(0, 30)} len=${message.length} has_image=${!!imageBase64} base64_length=${imageBase64?.length ?? 0} router_used=true legacy=false`);
    if (imageBase64) {
        if (imageBase64.length < 1000) {
            res.status(400).json({ error: 'Image caméra non reçue.' });
            return;
        }
        console.log(`[VISION_RUNTIME] source=mobile_scanner has_image=true base64_length=${imageBase64.length} mime=${imageMime}`);
    }
    // Persist timezone from X-Timezone header — used by schedule_reminder priority chain
    const headerTz = req.headers['x-timezone'];
    if (headerTz && (0, timezone_js_1.isValidTimezone)(headerTz)) {
        queue_js_1.redis.set(`user:tz:${sessionId}`, headerTz, 'EX', 7 * 86_400).catch(() => { });
        queue_js_1.redis.set('user:tz', headerTz, 'EX', 7 * 86_400).catch(() => { }); // global fallback
    }
    // Acknowledge immediately — result delivered via Socket.IO (Dzaryx:text_complete + audio chunks)
    res.status(202).json({ status: 'processing', sessionId });
    (0, orchestrator_engine_js_1.processWithOrchestration)(message, sessionId, textOnly, imageBase64, imageMime).catch(err => {
        console.error('[chat] processWithOrchestration error:', err instanceof Error ? err.message : String(err));
    });
});
// GET /api/chat/:sessionId/history
router.get('/:sessionId/history', auth_js_1.requireMobileAuth, async (req, res) => {
    const sessionId = req.params['sessionId'];
    const limit = Number(req.query['limit'] ?? 30);
    try {
        const history = await (0, supabase_js_1.getConversationHistory)(sessionId, Math.min(limit, 100));
        res.json({ history });
    }
    catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error });
    }
});
exports.default = router;
//# sourceMappingURL=chat.js.map