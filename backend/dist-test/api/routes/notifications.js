"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_js_1 = require("../../integrations/supabase.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// GET /api/notifications
router.get('/', auth_js_1.requireMobileAuth, async (req, res) => {
    const limit = Math.min(Number(req.query['limit'] ?? 30), 100);
    const { data, error } = await supabase_js_1.supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ notifications: data ?? [] });
});
// POST /api/notifications/:id/read
router.post('/:id/read', auth_js_1.requireMobileAuth, async (req, res) => {
    const { error } = await supabase_js_1.supabase
        .from('notifications')
        .update({ status: 'sent' })
        .eq('id', req.params['id']);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ success: true });
});
exports.default = router;
//# sourceMappingURL=notifications.js.map