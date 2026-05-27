"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Tests financiers purs (aucune connexion Supabase requise).
 * Run: npx tsx src/tests/financial-calculations.test.ts
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const finance_js_1 = require("../integrations/finance.js");
let passed = 0;
let failed = 0;
function ok(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) { console.error(`  ❌ ${label}: ${detail}`); failed++; }
function section(title) { console.log(`\n── ${title} ──`); }
// ─── Helpers ──────────────────────────────────────────────────────────────────
const BASE = { start_date: '2026-05-01', end_date: '2026-05-06' }; // 5 jours
// ─── 1. Remise : Jumpy loué 50€/j (pas 55€ catalogue) ────────────────────────
section('1. Remise — prix réel vs catalogue');
{
    const r = (0, finance_js_1.computeBookingFinancials)({
        ...BASE,
        final_price: null,
        client_price_per_day: 50, // prix réel négocié (ex: Jumpy remisé)
        owner_price_per_day: 40,
        nb_days: 5,
    });
    try {
        strict_1.default.equal(r.client_price_per_day, 50, 'client_ppd = 50 (pas 55 catalogue)');
        strict_1.default.equal(r.price_source, 'explicit', 'source = explicit');
        ok('Jumpy à 50€/j réel — pas 55€ catalogue');
    }
    catch (e) {
        fail('Remise Jumpy', e.message);
    }
}
{
    const r = (0, finance_js_1.computeBookingFinancials)({
        ...BASE,
        final_price: null,
        client_price_per_day: 50,
        owner_price_per_day: 40,
        nb_days: 5,
    });
    try {
        strict_1.default.equal(r.kouider_profit, 50, 'profit = (50-40) × 5 = 50€');
        strict_1.default.equal(r.owner_total, 200, 'owner_total = 40 × 5 = 200€');
        strict_1.default.equal(r.final_price, 250, 'final = 50 × 5 = 250€');
        ok('Profit Kouider correct (50-40)×5=50€, owner_total 40×5=200€');
    }
    catch (e) {
        fail('Profit avec remise', e.message);
    }
}
// ─── 2. Profit = null si owner_price_per_day absent ──────────────────────────
section('2. Profit inconnu si owner_ppd absent');
{
    const r = (0, finance_js_1.computeBookingFinancials)({
        ...BASE,
        final_price: 300,
        client_price_per_day: 60,
        owner_price_per_day: null, // non renseigné
        nb_days: 5,
    });
    try {
        strict_1.default.equal(r.owner_price_per_day, null, 'owner_ppd = null');
        strict_1.default.equal(r.owner_total, null, 'owner_total = null');
        strict_1.default.equal(r.kouider_profit, null, 'profit = null (pas inventé)');
        strict_1.default.equal(r.data_complete, false, 'data_complete = false');
        ok('owner_ppd absent → profit null (jamais inventé)');
    }
    catch (e) {
        fail('Profit manquant', e.message);
    }
}
// ─── 3. client_ppd calculé depuis final_price si pas explicit ─────────────────
section('3. client_ppd computed from final_price');
{
    const r = (0, finance_js_1.computeBookingFinancials)({
        ...BASE,
        final_price: 250, // prix total réel
        client_price_per_day: null, // pas encore renseigné
        owner_price_per_day: 40,
        nb_days: 5,
    });
    try {
        strict_1.default.equal(r.client_price_per_day, 50, 'client_ppd = 250/5 = 50€');
        strict_1.default.equal(r.price_source, 'computed', 'source = computed');
        strict_1.default.equal(r.kouider_profit, 50, 'profit = (50-40)×5 = 50€');
        ok('client_ppd calculé depuis final_price (250/5=50€)');
    }
    catch (e) {
        fail('Computed from final_price', e.message);
    }
}
// ─── 4. Aucune donnée → null (pas de catalogue inventé) ──────────────────────
section('4. Anti-hallucination — aucune donnée financière');
{
    const r = (0, finance_js_1.computeBookingFinancials)({
        ...BASE,
        final_price: null,
        client_price_per_day: null,
        owner_price_per_day: null,
        nb_days: 5,
    });
    try {
        strict_1.default.equal(r.client_price_per_day, null, 'client_ppd = null (pas de catalogue)');
        strict_1.default.equal(r.owner_price_per_day, null, 'owner_ppd = null');
        strict_1.default.equal(r.final_price, null, 'final_price = null');
        strict_1.default.equal(r.owner_total, null, 'owner_total = null');
        strict_1.default.equal(r.kouider_profit, null, 'profit = null');
        strict_1.default.equal(r.price_source, 'missing', 'source = missing');
        strict_1.default.equal(r.data_complete, false, 'data_complete = false');
        ok('Aucune donnée → tout null, pas de catalogue inventé');
    }
    catch (e) {
        fail('Anti-hallucination', e.message);
    }
}
// ─── 5. Durée calculée automatiquement si nb_days absent ─────────────────────
section('5. Calcul durée automatique');
{
    const r = (0, finance_js_1.computeBookingFinancials)({
        start_date: '2026-05-01',
        end_date: '2026-05-08', // 7 jours
        final_price: null,
        client_price_per_day: 50,
        owner_price_per_day: 40,
        // nb_days absent — doit être calculé
    });
    try {
        strict_1.default.equal(r.nb_days, 7, 'nb_days calculé = 7');
        strict_1.default.equal(r.final_price, 350, 'final = 50×7 = 350€');
        strict_1.default.equal(r.kouider_profit, 70, 'profit = (50-40)×7 = 70€');
        ok('Durée auto (7 jours), final=350€, profit=70€');
    }
    catch (e) {
        fail('Durée auto', e.message);
    }
}
// ─── 6. Réservation Houari → profit Kouider = 0 (connu, pas null) ─────────────
section('6. Réservation Houari → profit = 0 (non null)');
{
    const r = (0, finance_js_1.computeBookingFinancials)({
        ...BASE,
        final_price: 200,
        client_price_per_day: 40,
        owner_price_per_day: null, // owner_ppd absent mais Houari → profit forcément 0
        nb_days: 5,
        rented_by: 'Houari',
    });
    try {
        strict_1.default.equal(r.kouider_profit, 0, 'profit Kouider = 0 (Houari prend tout)');
        ok('Résa Houari → profit Kouider = 0 (pas null)');
    }
    catch (e) {
        fail('Résa Houari', e.message);
    }
}
// ─── 7. CA mensuel correct — somme des prix réels ─────────────────────────────
section('7. CA mensuel — somme prix réels, pas catalogue');
{
    const bookings = [
        { final_price: null, client_price_per_day: 50, owner_price_per_day: 40, nb_days: 5 },
        { final_price: null, client_price_per_day: 70, owner_price_per_day: 55, nb_days: 3 },
        { final_price: 200, client_price_per_day: null, owner_price_per_day: 35, nb_days: 4 }, // computed
    ];
    const base = { start_date: '2026-05-01', end_date: '2026-05-06' };
    const results = bookings.map(b => (0, finance_js_1.computeBookingFinancials)({ ...base, ...b }));
    const grossCA = results.reduce((s, r) => s + (r.final_price ?? 0), 0);
    const totalProfit = results.reduce((s, r) => s + (r.kouider_profit ?? 0), 0);
    // Expected: 50×5=250 + 70×3=210 + 200 = 660
    // Profits: (50-40)×5=50 + (70-55)×3=45 + (50-35)×4=60 = 155
    try {
        strict_1.default.equal(grossCA, 660, `CA = 250+210+200 = 660€ (got ${grossCA})`);
        strict_1.default.equal(totalProfit, 155, `Profit = 50+45+60 = 155€ (got ${totalProfit})`);
        ok(`CA mensuel: 660€ réel | Profit: 155€ réel`);
    }
    catch (e) {
        fail('CA mensuel', e.message);
    }
}
// ─── 8. discount_applied préservé ─────────────────────────────────────────────
section('8. Remise appliquée (discount_applied)');
{
    const r = (0, finance_js_1.computeBookingFinancials)({
        ...BASE,
        final_price: 225, // après remise
        client_price_per_day: 45, // prix remisé (catalogue aurait été 55)
        owner_price_per_day: 40,
        nb_days: 5,
        discount_applied: 50, // 55→45 × 5 jours
    });
    try {
        strict_1.default.equal(r.discount_applied, 50, 'discount_applied préservé = 50€');
        strict_1.default.equal(r.client_price_per_day, 45, 'client_ppd = 45 (remisé)');
        strict_1.default.equal(r.kouider_profit, 25, 'profit = (45-40)×5 = 25€');
        ok('discount_applied=50€ préservé, profit recalculé sur prix remisé');
    }
    catch (e) {
        fail('Discount preserved', e.message);
    }
}
// ─── Résumé ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Résultats: ✅ ${passed} passés | ❌ ${failed} échoués`);
if (failed > 0)
    process.exit(1);
//# sourceMappingURL=financial-calculations.test.js.map