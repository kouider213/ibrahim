"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_js_1 = require("../../integrations/supabase.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
// GET /api/clients/:phone — full client profile + history
router.get('/:phone', auth_js_1.requireMobileAuth, async (req, res) => {
    const phone = decodeURIComponent(req.params['phone']);
    try {
        const history = await (0, supabase_js_1.getClientHistory)(phone);
        const documents = await (0, supabase_js_1.getClientDocuments)(phone);
        res.json({ phone, ...history, documents });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/clients — list all clients with booking counts
router.get('/', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const { data, error } = await supabase_js_1.supabase
            .from('bookings')
            .select('client_name, client_phone, client_email, status, final_price, created_at')
            .order('created_at', { ascending: false });
        if (error)
            throw new Error(error.message);
        // Group by phone
        const clientMap = new Map();
        for (const b of (data ?? [])) {
            const key = b.client_phone ?? b.client_email ?? b.client_name;
            const existing = clientMap.get(key);
            if (existing) {
                existing.bookingCount++;
                if (b.status === 'CONFIRMED' || b.status === 'COMPLETED')
                    existing.totalSpent += b.final_price ?? 0;
                if (b.created_at > existing.lastBooking)
                    existing.lastBooking = b.created_at;
            }
            else {
                clientMap.set(key, {
                    name: b.client_name,
                    phone: b.client_phone,
                    email: b.client_email,
                    bookingCount: 1,
                    totalSpent: b.status === 'CONFIRMED' ? (b.final_price ?? 0) : 0,
                    lastBooking: b.created_at,
                });
            }
        }
        res.json({ clients: Array.from(clientMap.values()) });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/clients/documents — upload document reference
const docSchema = zod_1.z.object({
    clientPhone: zod_1.z.string().min(1),
    clientName: zod_1.z.string().min(1),
    bookingId: zod_1.z.string().uuid().optional(),
    type: zod_1.z.enum(['passport', 'license', 'contract', 'other']),
    fileUrl: zod_1.z.string().url(),
    storagePath: zod_1.z.string().min(1),
    notes: zod_1.z.string().optional(),
});
router.post('/documents', auth_js_1.requireMobileAuth, async (req, res) => {
    const parsed = docSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
        return;
    }
    try {
        const doc = await (0, supabase_js_1.saveClientDocument)({
            client_phone: parsed.data.clientPhone,
            client_name: parsed.data.clientName,
            booking_id: parsed.data.bookingId,
            type: parsed.data.type,
            file_url: parsed.data.fileUrl,
            storage_path: parsed.data.storagePath,
            notes: parsed.data.notes,
        });
        res.json({ doc });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=clients.js.map