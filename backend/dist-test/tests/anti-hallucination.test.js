"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Anti-hallucination unit tests.
 * Run: npx tsx src/tests/anti-hallucination.test.ts
 * No external dependencies (pure function tests).
 */
const assert_1 = __importDefault(require("assert"));
const anti_hallucination_js_1 = require("../orchestrator/anti-hallucination.js");
const response_guard_js_1 = require("../conversation/response-guard.js");
const document_mask_js_1 = require("../security/document-mask.js");
let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ ${name}\n     ${msg}`);
        failed++;
    }
}
const RID = 'test_001';
// ── Helpers ───────────────────────────────────────────────────────────────────
function tool(name, success = true) {
    return { name, success, result: 'ok' };
}
// ── 1. Gate 1: phantom write blocked ─────────────────────────────────────────
console.log('\n--- Gate 1: Phantom write ---');
test('phantom: "J\'ai créé la réservation" sans write tool → bloqué', () => {
    const result = (0, response_guard_js_1.phantomGuard)('J\'ai créé la réservation pour M. Dupont.', [], 'crée une réservation', RID);
    assert_1.default.strictEqual(result, response_guard_js_1.PHANTOM_REFUSAL, `Expected PHANTOM_REFUSAL, got: "${result}"`);
});
test('phantom: "J\'ai créé la réservation" avec create_booking ✅ → autorisé', () => {
    const result = (0, response_guard_js_1.phantomGuard)('J\'ai créé la réservation pour M. Dupont.', [tool('create_booking')], 'crée une réservation', RID);
    assert_1.default.notStrictEqual(result, response_guard_js_1.PHANTOM_REFUSAL);
});
test('phantom: réponse normale sans claim d\'action → autorisée', () => {
    const result = (0, response_guard_js_1.phantomGuard)('Voici les disponibilités pour la semaine prochaine.', [], 'quelles sont les dispos', RID);
    assert_1.default.notStrictEqual(result, response_guard_js_1.PHANTOM_REFUSAL);
});
// ── 2. Gate 2: financial claim without data tool ──────────────────────────────
console.log('\n--- Gate 2: Financial claim ---');
test('Gate2: "Bénéfice total: 500 000 DA" sans data tool → bloqué', () => {
    const check = (0, anti_hallucination_js_1.checkAntiHallucination)('Rapport financier — Bénéfice total: 500 000 DA sur le mois.', [], 'rapport financier', RID);
    assert_1.default.strictEqual(check.safe, false, 'Expected safe=false');
    assert_1.default.strictEqual(check.reason, 'financial_claim_no_data');
    assert_1.default.ok(check.blocked, 'Expected blocked message');
});
test('Gate2: rapport financier avec get_financial_report ✅ → autorisé', () => {
    const check = (0, anti_hallucination_js_1.checkAntiHallucination)('Rapport financier — Bénéfice total: 500 000 DA sur le mois.', [tool('get_financial_report')], 'rapport financier', RID);
    assert_1.default.strictEqual(check.safe, true, 'Expected safe=true when data tool ran');
});
test('Gate2: texte normal sans pattern financier → autorisé', () => {
    const check = (0, anti_hallucination_js_1.checkAntiHallucination)('Bonjour ! Comment puis-je vous aider aujourd\'hui ?', [], 'bonjour', RID);
    assert_1.default.strictEqual(check.safe, true);
});
// ── 3. Gate 3: system state claim without tools ───────────────────────────────
console.log('\n--- Gate 3: System state claim ---');
test('Gate3: "J\'ai vérifié vos réservations" sans outil → bloqué', () => {
    const check = (0, anti_hallucination_js_1.checkAntiHallucination)('J\'ai vérifié vos réservations — vous avez 3 clients ce week-end.', [], 'vérifie les réservations', RID);
    assert_1.default.strictEqual(check.safe, false, 'Expected safe=false');
    assert_1.default.strictEqual(check.reason, 'system_state_claim');
});
test('Gate3: "J\'ai vérifié vos réservations" avec list_bookings ✅ → autorisé', () => {
    const check = (0, anti_hallucination_js_1.checkAntiHallucination)('J\'ai vérifié vos réservations — vous avez 3 clients ce week-end.', [tool('list_bookings')], 'vérifie les réservations', RID);
    assert_1.default.strictEqual(check.safe, true);
});
// ── 4. Document masking ───────────────────────────────────────────────────────
console.log('\n--- Document masking ---');
test('maskPassportOcr: nom masqué correctement', () => {
    const result = (0, document_mask_js_1.maskPassportOcr)({
        name: 'Ibrahim Kouider',
        passport_number: 'AB1234567',
        birth_date: '01/05/1990',
        expiry_date: '2030-01-01',
        nationality: 'DZ',
    });
    assert_1.default.strictEqual(result['name'], 'I. K***');
    assert_1.default.strictEqual(result['passport_number'], '***567');
    assert_1.default.strictEqual(result['birth_date'], '01/**/1990');
    assert_1.default.strictEqual(result['expiry_date'], '2030-01-01');
});
test('maskLicenseOcr: numéro de permis masqué', () => {
    const result = (0, document_mask_js_1.maskLicenseOcr)({
        name: 'Ahmed Ben Ali',
        license_number: 'DZ9876543',
        birth_date: '1985-06-15',
        expiry_date: '2028-06-15',
        category: 'B',
    });
    assert_1.default.strictEqual(result['license_number'], '***543');
    assert_1.default.ok(result['name']?.startsWith('A.'), `Expected "A." prefix, got "${result['name']}"`);
});
test('maskSensitiveText: MRZ masqué dans texte libre', () => {
    const text = 'P<DZNKOUIDER<<IBRAHIM<<<<<<<<<<<<<<<<<<<<<<<<';
    const masked = (0, document_mask_js_1.maskSensitiveText)(text);
    assert_1.default.ok(!masked.includes('KOUIDER'), `MRZ not masked: "${masked}"`);
});
// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Tests: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
if (failed > 0)
    process.exit(1);
//# sourceMappingURL=anti-hallucination.test.js.map