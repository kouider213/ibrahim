"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_js_1 = require("../../integrations/supabase.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// GET /api/tasks
router.get('/', auth_js_1.requireMobileAuth, async (req, res) => {
    const status = req.query['status'];
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    let query = supabase_js_1.supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (status)
        query = query.eq('status', status);
    const { data, error } = await query;
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ tasks: data ?? [] });
});
// GET /api/tasks/:id
router.get('/:id', auth_js_1.requireMobileAuth, async (req, res) => {
    const { data, error } = await supabase_js_1.supabase
        .from('tasks')
        .select('*, task_runs(*)')
        .eq('id', req.params['id'])
        .single();
    if (error || !data) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }
    res.json({ task: data });
});
// DELETE /api/tasks/:id/cancel
router.post('/:id/cancel', auth_js_1.requireMobileAuth, async (req, res) => {
    const { error } = await supabase_js_1.supabase
        .from('tasks')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', req.params['id'])
        .in('status', ['pending', 'queued']);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ success: true });
});
exports.default = router;
//# sourceMappingURL=tasks.js.map