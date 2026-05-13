/**
 * Anti-hallucination unit tests.
 * Run: npx tsx src/tests/anti-hallucination.test.ts
 * No external dependencies (pure function tests).
 */
import assert from 'assert';
import { checkAntiHallucination } from '../orchestrator/anti-hallucination.js';
import { phantomGuard, PHANTOM_REFUSAL } from '../conversation/response-guard.js';
import { maskPassportOcr, maskLicenseOcr, maskSensitiveText } from '../security/document-mask.js';
import type { ToolExecution } from '../integrations/claude-api.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ ${name}\n     ${msg}`);
    failed++;
  }
}

const RID = 'test_001';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tool(name: string, success = true): ToolExecution {
  return { name, success, result: 'ok' };
}

// ── 1. Gate 1: phantom write blocked ─────────────────────────────────────────
console.log('\n--- Gate 1: Phantom write ---');

test('phantom: "J\'ai créé la réservation" sans write tool → bloqué', () => {
  const result = phantomGuard(
    'J\'ai créé la réservation pour M. Dupont.',
    [],
    'crée une réservation',
    RID,
  );
  assert.strictEqual(result, PHANTOM_REFUSAL, `Expected PHANTOM_REFUSAL, got: "${result}"`);
});

test('phantom: "J\'ai créé la réservation" avec create_booking ✅ → autorisé', () => {
  const result = phantomGuard(
    'J\'ai créé la réservation pour M. Dupont.',
    [tool('create_booking')],
    'crée une réservation',
    RID,
  );
  assert.notStrictEqual(result, PHANTOM_REFUSAL);
});

test('phantom: réponse normale sans claim d\'action → autorisée', () => {
  const result = phantomGuard(
    'Voici les disponibilités pour la semaine prochaine.',
    [],
    'quelles sont les dispos',
    RID,
  );
  assert.notStrictEqual(result, PHANTOM_REFUSAL);
});

// ── 2. Gate 2: financial claim without data tool ──────────────────────────────
console.log('\n--- Gate 2: Financial claim ---');

test('Gate2: "Bénéfice total: 500 000 DA" sans data tool → bloqué', () => {
  const check = checkAntiHallucination(
    'Rapport financier — Bénéfice total: 500 000 DA sur le mois.',
    [],
    'rapport financier',
    RID,
  );
  assert.strictEqual(check.safe, false, 'Expected safe=false');
  assert.strictEqual(check.reason, 'financial_claim_no_data');
  assert.ok(check.blocked, 'Expected blocked message');
});

test('Gate2: rapport financier avec get_financial_report ✅ → autorisé', () => {
  const check = checkAntiHallucination(
    'Rapport financier — Bénéfice total: 500 000 DA sur le mois.',
    [tool('get_financial_report')],
    'rapport financier',
    RID,
  );
  assert.strictEqual(check.safe, true, 'Expected safe=true when data tool ran');
});

test('Gate2: texte normal sans pattern financier → autorisé', () => {
  const check = checkAntiHallucination(
    'Bonjour ! Comment puis-je vous aider aujourd\'hui ?',
    [],
    'bonjour',
    RID,
  );
  assert.strictEqual(check.safe, true);
});

// ── 3. Gate 3: system state claim without tools ───────────────────────────────
console.log('\n--- Gate 3: System state claim ---');

test('Gate3: "J\'ai vérifié vos réservations" sans outil → bloqué', () => {
  const check = checkAntiHallucination(
    'J\'ai vérifié vos réservations — vous avez 3 clients ce week-end.',
    [],
    'vérifie les réservations',
    RID,
  );
  assert.strictEqual(check.safe, false, 'Expected safe=false');
  assert.strictEqual(check.reason, 'system_state_claim');
});

test('Gate3: "J\'ai vérifié vos réservations" avec list_bookings ✅ → autorisé', () => {
  const check = checkAntiHallucination(
    'J\'ai vérifié vos réservations — vous avez 3 clients ce week-end.',
    [tool('list_bookings')],
    'vérifie les réservations',
    RID,
  );
  assert.strictEqual(check.safe, true);
});

// ── 4. Document masking ───────────────────────────────────────────────────────
console.log('\n--- Document masking ---');

test('maskPassportOcr: nom masqué correctement', () => {
  const result = maskPassportOcr({
    name: 'Ibrahim Kouider',
    passport_number: 'AB1234567',
    birth_date: '01/05/1990',
    expiry_date: '2030-01-01',
    nationality: 'DZ',
  });
  assert.strictEqual(result['name'], 'I. K***');
  assert.strictEqual(result['passport_number'], '***567');
  assert.strictEqual(result['birth_date'], '01/**/1990');
  assert.strictEqual(result['expiry_date'], '2030-01-01');
});

test('maskLicenseOcr: numéro de permis masqué', () => {
  const result = maskLicenseOcr({
    name: 'Ahmed Ben Ali',
    license_number: 'DZ9876543',
    birth_date: '1985-06-15',
    expiry_date: '2028-06-15',
    category: 'B',
  });
  assert.strictEqual(result['license_number'], '***543');
  assert.ok(result['name']?.startsWith('A.'), `Expected "A." prefix, got "${result['name']}"`);
});

test('maskSensitiveText: MRZ masqué dans texte libre', () => {
  const text = 'P<DZNKOUIDER<<IBRAHIM<<<<<<<<<<<<<<<<<<<<<<<<';
  const masked = maskSensitiveText(text);
  assert.ok(!masked.includes('KOUIDER'), `MRZ not masked: "${masked}"`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Tests: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
if (failed > 0) process.exit(1);
