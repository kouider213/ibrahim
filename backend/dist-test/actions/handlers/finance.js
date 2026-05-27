"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleFinance = handleFinance;
const supabase_js_1 = require("../../integrations/supabase.js");
const finance_js_1 = require("../../integrations/finance.js");
const github_js_1 = require("../../integrations/github.js");
const phase5_finance_js_1 = require("../../integrations/phase5-finance.js");
const BUCKET = 'client-documents';
async function handleFinance(payload) {
    switch (payload.action) {
        // ── Existing ──────────────────────────────
        case 'get_financial_report':
            return financialReport(payload.params);
        case 'set_booking_owner':
            return setBookingOwner(payload.params);
        case 'store_document':
            return storeDocument(payload.params);
        case 'read_site_file':
            return readSiteFile(payload.params);
        case 'update_site_file':
            return updateSiteFile(payload.params);
        // ── Phase 5 ───────────────────────────────
        case 'get_payment_status':
            return handleGetPaymentStatus(payload.params);
        case 'record_payment':
            return handleRecordPayment(payload.params);
        case 'get_ca_report':
            return handleGetCAReport(payload.params);
        case 'check_unpaid':
            return handleCheckUnpaid();
        case 'generate_invoice':
            return handleGenerateInvoice(payload.params);
        case 'financial_dashboard':
            return handleDashboard();
        case 'check_anomalies':
            return handleCheckAnomalies();
        default:
            return { success: false, error: 'Unknown finance action', message: 'Action finance inconnue' };
    }
}
// ─────────────────────────────────────────────
// EXISTING HANDLERS
// ─────────────────────────────────────────────
async function financialReport(params) {
    const year = Number(params['year'] ?? new Date().getFullYear());
    const month = params['month'] ? Number(params['month']) : undefined;
    try {
        const report = await (0, finance_js_1.getFinancialReport)(year, month);
        const text = (0, finance_js_1.formatFinancialReport)(report);
        return { success: true, data: report, message: text };
    }
    catch (err) {
        return { success: false, error: String(err), message: `Erreur rapport financier: ${String(err)}` };
    }
}
async function setBookingOwner(params) {
    const { id, rented_by } = params;
    if (!id || !rented_by) {
        return { success: false, error: 'missing_params', message: 'id et rented_by requis' };
    }
    if (!['Kouider', 'Houari'].includes(rented_by)) {
        return { success: false, error: 'invalid_owner', message: 'rented_by doit être Kouider ou Houari' };
    }
    const { data, error } = await supabase_js_1.supabase
        .from('bookings')
        .update({ rented_by, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    if (error)
        return { success: false, error: error.message, message: `Erreur: ${error.message}` };
    return { success: true, data, message: `✅ Réservation attribuée à ${rented_by}` };
}
async function storeDocument(params) {
    const { clientPhone, clientName, bookingId, type, fileName, mimeType, base64, notes } = params;
    if (!clientPhone || !clientName || !type || !fileName || !base64) {
        return { success: false, error: 'missing_params', message: 'clientPhone, clientName, type, fileName, base64 requis' };
    }
    try {
        const buffer = Buffer.from(base64, 'base64');
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${clientPhone}/${type}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase_js_1.supabase.storage
            .from(BUCKET)
            .upload(path, buffer, { contentType: mimeType ?? 'application/octet-stream', upsert: false });
        if (uploadError)
            throw new Error(uploadError.message);
        const { data: urlData } = supabase_js_1.supabase.storage.from(BUCKET).getPublicUrl(path);
        const { data: doc, error: dbError } = await supabase_js_1.supabase
            .from('client_documents')
            .insert({
            client_phone: clientPhone,
            client_name: clientName,
            booking_id: bookingId,
            type,
            file_url: urlData.publicUrl,
            storage_path: path,
            notes,
        })
            .select()
            .single();
        if (dbError)
            throw new Error(dbError.message);
        return {
            success: true,
            data: doc,
            message: `✅ Document ${type} stocké pour ${clientName} — accessible à tout moment`,
        };
    }
    catch (err) {
        return { success: false, error: String(err), message: `Erreur stockage document: ${String(err)}` };
    }
}
async function readSiteFile(params) {
    const { path, repo } = params;
    if (!path)
        return { success: false, error: 'missing_path', message: 'path requis' };
    try {
        const result = await (0, github_js_1.getFileContent)(path, repo ?? 'autolux-location');
        if (!result)
            return { success: false, error: 'not_found', message: `Fichier non trouvé: ${path}` };
        return { success: true, data: { path, sha: result.sha }, message: result.content };
    }
    catch (err) {
        return { success: false, error: String(err), message: `Erreur lecture fichier: ${String(err)}` };
    }
}
async function updateSiteFile(params) {
    const { path, content, message, repo } = params;
    if (!path || !content)
        return { success: false, error: 'missing_params', message: 'path et content requis' };
    try {
        await (0, github_js_1.updateFile)(repo ?? 'autolux-location', path, content, message ?? `update: ${path}`);
        return { success: true, message: `✅ ${path} mis à jour — Vercel redéploie automatiquement` };
    }
    catch (err) {
        return { success: false, error: String(err), message: `Erreur mise à jour: ${String(err)}` };
    }
}
// ─────────────────────────────────────────────
// PHASE 5 HANDLERS
// ─────────────────────────────────────────────
async function handleGetPaymentStatus(params) {
    const bookingId = params['booking_id'];
    const msg = await (0, phase5_finance_js_1.getPaymentStatus)(bookingId);
    return { success: true, message: msg };
}
async function handleRecordPayment(params) {
    const { booking_id, amount, type, note } = params;
    if (!booking_id || !amount) {
        return { success: false, error: 'missing_params', message: 'booking_id et amount requis' };
    }
    const msg = await (0, phase5_finance_js_1.recordPayment)(booking_id, amount, type ?? 'partiel', note);
    return { success: true, message: msg };
}
async function handleGetCAReport(params) {
    const year = Number(params['year'] ?? new Date().getFullYear());
    const month = params['month'] ? Number(params['month']) : undefined;
    const week = params['week'] ? Number(params['week']) : undefined;
    const msg = await (0, phase5_finance_js_1.getCAReport)(year, month, week);
    return { success: true, message: msg };
}
async function handleCheckUnpaid() {
    const msg = await (0, phase5_finance_js_1.getUnpaidBookings)();
    return { success: true, message: msg };
}
async function handleGenerateInvoice(params) {
    const { booking_id } = params;
    if (!booking_id)
        return { success: false, error: 'missing_params', message: 'booking_id requis' };
    const msg = await (0, phase5_finance_js_1.generateReceipt)(booking_id);
    return { success: true, message: msg };
}
async function handleDashboard() {
    const msg = await (0, phase5_finance_js_1.getFinancialDashboard)();
    return { success: true, message: msg };
}
async function handleCheckAnomalies() {
    const msg = await (0, phase5_finance_js_1.checkAnomalies)();
    return { success: true, message: msg };
}
//# sourceMappingURL=finance.js.map