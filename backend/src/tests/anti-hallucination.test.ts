/**
 * Anti-hallucination unit tests.
 * Run: npx tsx src/tests/anti-hallucination.test.ts
 * No external dependencies (pure function tests).
 */
import assert from 'assert';
import { checkAntiHallucination, fastPathGuard, FAST_PATH_REFUSAL } from '../orchestrator/anti-hallucination.js';
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

// ── 5. Gate 4: booking count claims ──────────────────────────────────────────
console.log('\n--- Gate 4: Booking count claim ---');

test('Gate4: "tu as 5 réservations en cours" sans outil → bloqué', () => {
  const check = checkAntiHallucination(
    'Tu as 5 réservations en cours ce mois.',
    [],
    'combien de réservations',
    RID,
  );
  assert.strictEqual(check.safe, false);
  assert.strictEqual(check.reason, 'booking_count_claim');
});

test('Gate4: "tu as 5 réservations" avec list_bookings ✅ → autorisé', () => {
  const check = checkAntiHallucination(
    'Tu as 5 réservations en cours ce mois.',
    [tool('list_bookings')],
    'combien de réservations',
    RID,
  );
  assert.strictEqual(check.safe, true);
});

test('Gate4: "aucune réservation ce mois" sans outil → bloqué', () => {
  const check = checkAntiHallucination(
    'Aucune réservation ce mois.',
    [],
    'résa?',
    RID,
  );
  assert.strictEqual(check.safe, false);
  assert.strictEqual(check.reason, 'booking_count_claim');
});

// ── 6. Gate 4b: car availability claims ──────────────────────────────────────
console.log('\n--- Gate 4b: Car availability ---');

test('Gate4b: "Clio est disponible" sans fleet tool → bloqué', () => {
  const check = checkAntiHallucination(
    'Le Clio est disponible pour cette période.',
    [],
    'dispo clio?',
    RID,
  );
  assert.strictEqual(check.safe, false);
  assert.strictEqual(check.reason, 'car_avail_claim');
});

test('Gate4b: "Sandero disponible" avec check_car_availability ✅ → autorisé', () => {
  const check = checkAntiHallucination(
    'Le Sandero est disponible.',
    [tool('check_car_availability')],
    'dispo sandero',
    RID,
  );
  assert.strictEqual(check.safe, true);
});

test('Gate4b: "Jogger indisponible, en location" sans outil → bloqué', () => {
  const check = checkAntiHallucination(
    'Le Jogger est indisponible, il est en location.',
    [],
    'jogger?',
    RID,
  );
  assert.strictEqual(check.safe, false);
  assert.strictEqual(check.reason, 'car_avail_claim');
});

// ── 7. Gate 4c: payment claims ────────────────────────────────────────────────
console.log('\n--- Gate 4c: Payment claims ---');

test('Gate4c: "montant impayé de 5000 da" sans payment tool → bloqué', () => {
  const check = checkAntiHallucination(
    'Il y a un montant impayé de 5000 da.',
    [],
    'impayés?',
    RID,
  );
  assert.strictEqual(check.safe, false);
  assert.strictEqual(check.reason, 'payment_claim');
});

test('Gate4c: "montant impayé" avec get_unpaid_bookings ✅ → autorisé', () => {
  const check = checkAntiHallucination(
    'Il y a un montant impayé de 5000 da.',
    [tool('get_unpaid_bookings')],
    'impayés?',
    RID,
  );
  assert.strictEqual(check.safe, true);
});

// ── 8. fastPathGuard ──────────────────────────────────────────────────────────
console.log('\n--- fastPathGuard (Groq/Gemini/OpenAI) ---');

test('fastPath: greeting → autorisé', () => {
  const result = fastPathGuard('Bonjour ! Comment puis-je vous aider ?', 'salut', RID);
  assert.notStrictEqual(result, FAST_PATH_REFUSAL);
});

test('fastPath: weather → autorisé', () => {
  const result = fastPathGuard('Aujourd\'hui à Oran il fait 28°C.', 'météo oran', RID);
  assert.notStrictEqual(result, FAST_PATH_REFUSAL);
});

test('fastPath: claim "20000 da" → bloqué', () => {
  const result = fastPathGuard('Tes revenus ce mois sont 20000 da.', 'revenus?', RID);
  assert.strictEqual(result, FAST_PATH_REFUSAL);
});

test('fastPath: "3 réservations" → bloqué', () => {
  const result = fastPathGuard('Tu as 3 réservations en cours.', 'combien résa', RID);
  assert.strictEqual(result, FAST_PATH_REFUSAL);
});

test('fastPath: "disponible maintenant" → bloqué', () => {
  const result = fastPathGuard('Le Clio est disponible maintenant.', 'dispo clio', RID);
  assert.strictEqual(result, FAST_PATH_REFUSAL);
});

test('fastPath: "d\'après mes données" → bloqué', () => {
  const result = fastPathGuard('D\'après mes données, tu as 2 retards.', 'retards', RID);
  assert.strictEqual(result, FAST_PATH_REFUSAL);
});

test('fastPath: "bénéfice de 8000 da" → bloqué', () => {
  const result = fastPathGuard('Le bénéfice de 8000 da ce mois.', 'profit', RID);
  assert.strictEqual(result, FAST_PATH_REFUSAL);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Tests: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
if (failed > 0) process.exit(1);
