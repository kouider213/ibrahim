"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_js_1 = require("../../integrations/supabase.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
const BUCKET = 'client-documents';
// POST /api/documents/upload — upload base64 file to Supabase Storage + save record
const uploadSchema = zod_1.z.object({
    clientPhone: zod_1.z.string().min(1),
    clientName: zod_1.z.string().min(1),
    bookingId: zod_1.z.string().optional(),
    type: zod_1.z.enum(['passport', 'license', 'contract', 'other']),
    fileName: zod_1.z.string().min(1),
    mimeType: zod_1.z.string().default('application/octet-stream'),
    base64: zod_1.z.string().min(1),
    notes: zod_1.z.string().optional(),
});
router.post('/upload', auth_js_1.requireMobileAuth, async (req, res) => {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
        return;
    }
    const { clientPhone, clientName, bookingId, type, fileName, mimeType, base64, notes } = parsed.data;
    try {
        const buffer = Buffer.from(base64, 'base64');
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${clientPhone}/${type}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase_js_1.supabase.storage
            .from(BUCKET)
            .upload(path, buffer, { contentType: mimeType, upsert: false });
        if (uploadError)
            throw new Error(`Storage upload failed: ${uploadError.message}`);
        const { data: urlData } = supabase_js_1.supabase.storage.from(BUCKET).getPublicUrl(path);
        const fileUrl = urlData.publicUrl;
        const doc = await (0, supabase_js_1.saveClientDocument)({
            client_phone: clientPhone,
            client_name: clientName,
            booking_id: bookingId,
            type,
            file_url: fileUrl,
            storage_path: path,
            notes,
        });
        res.json({
            success: true,
            doc,
            fileUrl,
            message: `✅ Document ${type} stocké pour ${clientName}`,
        });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/documents/:phone — list documents for a client
router.get('/:phone', auth_js_1.requireMobileAuth, async (req, res) => {
    const phone = decodeURIComponent(req.params['phone']);
    try {
        const { data, error } = await supabase_js_1.supabase
            .from('client_documents')
            .select('*')
            .eq('client_phone', phone)
            .order('created_at', { ascending: false });
        if (error)
            throw new Error(error.message);
        res.json({ documents: data ?? [], count: (data ?? []).length });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=documents.js.map