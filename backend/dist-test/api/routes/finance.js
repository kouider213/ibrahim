"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const finance_js_1 = require("../../integrations/finance.js");
const pricing_js_1 = require("../../config/pricing.js");
const phase5_finance_js_1 = require("../../integrations/phase5-finance.js");
const router = (0, express_1.Router)();
// GET /api/finance/report?year=2026&month=4
router.get('/report', auth_js_1.requireMobileAuth, async (req, res) => {
    const year = Number(req.query['year'] ?? new Date().getFullYear());
    const month = req.query['month'] ? Number(req.query['month']) : undefined;
    if (isNaN(year)) {
        res.status(400).json({ error: 'year must be a number' });
        return;
    }
    try {
        const report = await (0, finance_js_1.getFinancialReport)(year, month);
        res.json(report);
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/finance/pricing — grille tarifaire
router.get('/pricing', auth_js_1.requireMobileAuth, (_req, res) => {
    res.json({ pricing: pricing_js_1.VEHICLE_PRICING });
});
// POST /api/finance/seed — one-time setup, creates pricing rows in Supabase
router.post('/seed', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        await (0, finance_js_1.seedPricingTable)();
        res.json({ success: true, message: `${pricing_js_1.VEHICLE_PRICING.length} véhicules chargés dans la table pricing` });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// PATCH /api/finance/bookings/:id/owner — set rented_by on a booking
const supabase_js_1 = require("../../integrations/supabase.js");
router.patch('/bookings/:id/owner', auth_js_1.requireMobileAuth, async (req, res) => {
    const { id } = req.params;
    const { rented_by } = req.body;
    if (!['Kouider', 'Houari'].includes(rented_by)) {
        res.status(400).json({ error: 'rented_by must be "Kouider" or "Houari"' });
        return;
    }
    try {
        const { data, error } = await supabase_js_1.supabase
            .from('bookings')
            .update({ rented_by, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new Error(error.message);
        res.json({ booking: data, message: `Réservation attribuée à ${rented_by}` });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/finance/dashboard — données structurées pour le dashboard mobile
router.get('/dashboard', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const data = await (0, phase5_finance_js_1.getDashboardData)();
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/finance/receipts/:id — générer la facture PDF
router.post('/receipts/:id', auth_js_1.requireMobileAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await (0, phase5_finance_js_1.generatePdfReceipt)(id);
        res.json({ url: result.url, message: result.text });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/finance/payments — statut paiements
router.get('/payments', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const text = await (0, phase5_finance_js_1.getPaymentStatus)();
        res.json({ text });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/finance/unpaid — liste impayés
router.get('/unpaid', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const text = await (0, phase5_finance_js_1.getUnpaidBookings)();
        res.json({ text });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=finance.js.map