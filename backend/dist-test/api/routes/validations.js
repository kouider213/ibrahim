"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const approver_js_1 = require("../../validations/approver.js");
const auth_js_1 = require("../middleware/auth.js");
const supabase_js_1 = require("../../integrations/supabase.js");
const router = (0, express_1.Router)();
// GET /api/validations — pending list
router.get('/', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const pending = await (0, approver_js_1.getPendingValidations)();
        res.json({ validations: pending });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/validations/:id
router.get('/:id', auth_js_1.requireMobileAuth, async (req, res) => {
    const { data, error } = await supabase_js_1.supabase
        .from('validations')
        .select('*')
        .eq('id', req.params['id'])
        .single();
    if (error || !data) {
        res.status(404).json({ error: 'Validation not found' });
        return;
    }
    res.json({ validation: data });
});
const decisionSchema = zod_1.z.object({
    decision: zod_1.z.enum(['approved', 'rejected']),
    note: zod_1.z.string().optional(),
});
// POST /api/validations/:id/decide
router.post('/:id/decide', auth_js_1.requireMobileAuth, async (req, res) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid decision', details: parsed.error.errors });
        return;
    }
    const { decision, note } = parsed.data;
    const validation = await (0, approver_js_1.processValidationReply)(req.params['id'], decision, note, 'owner');
    if (!validation) {
        res.status(404).json({ error: 'Validation not found or already decided' });
        return;
    }
    res.json({ success: true, decision, validationId: req.params['id'] });
});
exports.default = router;
//# sourceMappingURL=validations.js.map