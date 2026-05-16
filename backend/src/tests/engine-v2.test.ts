/**
 * Conversation Engine V2 — tests (no env vars needed)
 * Run: npx tsx src/tests/engine-v2.test.ts
 *
 * Tests pure functions: normalizer, entity-extractor, pending-action resolveReply
 * These have no external deps (no Redis, no Supabase, no env).
 */

// Direct imports of pure modules (bypass env.ts)
import { normalizeMessage } from '../conversation/normalizer.js';
import { extractEntities }  from '../conversation/entity-extractor.js';

// resolveReply inline (pure function — avoids Redis import chain)
const CONFIRM_WORDS = /\b(oui|ok|okay|oki|go|vas-y|confirme|d['']accord|l['']original|continue|the\s+real|yes|proceed|fais-le|fait-le)\b/i;
const CANCEL_WORDS  = /\b(non|nan|nope|stop|annule|cancel|arr[eê]te|pas)\b/i;
function resolveReply(text: string): 'confirm' | 'cancel' | 'ambiguous' {
  const isConfirm = CONFIRM_WORDS.test(text);
  const isCancel  = CANCEL_WORDS.test(text);
  if (isConfirm && !isCancel) return 'confirm';
  if (isCancel && !isConfirm) return 'cancel';
  return 'ambiguous';
}

let passed = 0;
let failed = 0;

function ok(label: string)                              { console.log(`  ✅ ${label}`); passed++; }
function fail(label: string, got: unknown, want: unknown) { console.error(`  ❌ ${label}: got="${JSON.stringify(got)}" want="${JSON.stringify(want)}"`); failed++; }
function section(title: string)                         { console.log(`\n--- ${title} ---`); }

// ── normalizeMessage ──────────────────────────────────────────────────────────

section('Typo correction');

{
  const r = normalizeMessage("tu as le paseport de Mohamed ?");
  if (r.normalized.includes('passeport')) ok('paseport → passeport');
  else fail('paseport → passeport', r.normalized, 'contains passeport');
}

{
  const r = normalizeMessage("j'ai une réseravtion demain");
  if (r.normalized.includes('réservation')) ok('réseravtion → réservation');
  else fail('réseravtion → réservation', r.normalized, 'contains réservation');
}

{
  const r = normalizeMessage("le beringo est dispo");
  const n = r.normalized;
  if (n.includes('berlingo') && n.includes('disponible')) ok('beringo+dispo → berlingo+disponible');
  else fail('beringo+dispo', n, 'contains berlingo disponible');
}

{
  const r = normalizeMessage("envoie le permi de Ahmed");
  if (r.normalized.includes('permis')) ok('permi → permis');
  else fail('permi → permis', r.normalized, 'contains permis');
}

section('Short message expansion');

{
  const r = normalizeMessage("vas-y");
  if (r.normalized.includes('confirme')) ok(`"vas-y" → contains confirme: "${r.normalized}"`);
  else fail('vas-y expansion', r.normalized, 'contains confirme');
}

{
  const r = normalizeMessage("l'original");
  if (r.normalized.includes('original')) ok(`"l'original" preserved in: "${r.normalized}"`);
  else fail("l'original", r.normalized, 'contains original');
}

section('Synonym expansion');

{
  const r = normalizeMessage("montre-moi le passeport");
  if (r.normalized.includes('affiche')) ok(`montre-moi → affiche: "${r.normalized}"`);
  else fail('montre-moi → affiche', r.normalized, 'contains affiche');
}

{
  const r = normalizeMessage("il a ses papiers ?");
  if (r.normalized.includes('document')) ok(`papiers → documents: "${r.normalized}"`);
  else fail('papiers → documents', r.normalized, 'contains document');
}

section('No false positives');

{
  const r = normalizeMessage("Bonjour, comment tu vas ?");
  if (r.corrections.length === 0) ok('greeting: no corrections');
  else fail('greeting unchanged', r.corrections, []);
}

{
  const r = normalizeMessage("Le Clio est disponible le 12 août");
  if (r.normalized.includes('Clio')) ok('Clio sentence: Clio preserved');
  else fail('Clio unchanged', r.normalized, 'contains Clio');
}

section('isShort detection');

{
  const r = normalizeMessage("oui");
  if (r.isShort) ok('"oui" isShort=true');
  else fail('oui isShort', r.isShort, true);
}

{
  const r = normalizeMessage("j'ai une réservation pour demain matin avec le client Ahmed qui veut le Clio");
  if (!r.isShort) ok('long message isShort=false');
  else fail('long message isShort', r.isShort, false);
}

// ── extractEntities ───────────────────────────────────────────────────────────

section('Entity extraction — documents');

{
  const e = extractEntities("envoie le passeport de Mohamed");
  if (e.docType === 'passport') ok('docType=passport');
  else fail('docType passport', e.docType, 'passport');
  if (e.action === 'send') ok('action=send');
  else fail('action send', e.action, 'send');
}

{
  const e = extractEntities("tu as le permis du client ?");
  if (e.docType === 'license') ok('docType=license');
  else fail('docType license', e.docType, 'license');
}

{
  const e = extractEntities("génère le bon de réservation");
  if (e.docType === 'voucher') ok('docType=voucher');
  else fail('docType voucher', e.docType, 'voucher');
}

section('Entity extraction — cars');

{
  const e = extractEntities("le Jumpy est disponible demain ?");
  if (e.carName === 'jumpy') ok('carName=jumpy');
  else fail('carName jumpy', e.carName, 'jumpy');
  if (e.dates.includes('tomorrow')) ok('date=tomorrow');
  else fail('date tomorrow', e.dates, ['tomorrow']);
}

{
  const e = extractEntities("le clio revient ce soir");
  if (e.carName === 'clio') ok('carName=clio');
  else fail('carName clio', e.carName, 'clio');
  if (e.dates.includes('tonight')) ok('date=tonight');
  else fail('date tonight', e.dates, ['tonight']);
}

section('Entity extraction — clients from list');

{
  const e = extractEntities("résa pour Ahmed", ['Ahmed Benali', 'Mohamed Kaci', 'Sara Amrani']);
  if (e.clientName === 'Ahmed Benali') ok('clientName=Ahmed Benali (from list)');
  else fail('clientName Ahmed Benali', e.clientName, 'Ahmed Benali');
}

{
  const e = extractEntities("le client Mohamed a payé", ['Ahmed Benali', 'Mohamed Kaci']);
  if (e.clientName === 'Mohamed Kaci') ok('clientName=Mohamed Kaci (partial match)');
  else fail('clientName Mohamed Kaci', e.clientName, 'Mohamed Kaci');
}

section('Entity extraction — amounts');

{
  const e = extractEntities("le client a payé 5000 da");
  if (e.amounts.length > 0 && e.amounts[0].includes('5000')) ok(`amount detected: ${e.amounts[0]}`);
  else fail('amount 5000 da', e.amounts, ['5000 da']);
}

{
  const e = extractEntities("il reste 200€ à régler");
  if (e.amounts.length > 0 && e.amounts[0].includes('200')) ok(`amount detected: ${e.amounts[0]}`);
  else fail('amount 200€', e.amounts, ['200€']);
}

section('Entity extraction — original doc flag');

{
  const e = extractEntities("envoie l'original");
  if (e.isOriginalRequest) ok('isOriginalRequest=true for "l\'original"');
  else fail('isOriginalRequest', e.isOriginalRequest, true);
}

{
  const e = extractEntities("le vrai document");
  if (e.isOriginalRequest) ok('isOriginalRequest=true for "le vrai document"');
  else fail('isOriginalRequest le vrai', e.isOriginalRequest, true);
}

{
  const e = extractEntities("montre l'aperçu masqué");
  if (!e.isOriginalRequest) ok('isOriginalRequest=false for masked request');
  else fail('isOriginalRequest false masked', e.isOriginalRequest, false);
}

section('Entity extraction — admin action');

{
  const e = extractEntities("supprimer cette réservation");
  if (e.isAdminAction) ok('delete action → isAdminAction=true');
  else fail('delete isAdminAction', e.isAdminAction, true);
}

{
  const e = extractEntities("montre les réservations d'aujourd'hui");
  if (!e.isAdminAction) ok('show bookings → isAdminAction=false');
  else fail('show bookings isAdminAction', e.isAdminAction, false);
}

// ── resolveReply ──────────────────────────────────────────────────────────────

section('resolveReply');

const cases: Array<[string, 'confirm' | 'cancel' | 'ambiguous']> = [
  ['oui',             'confirm'],
  ['ok vas-y',        'confirm'],
  ['go',              'confirm'],
  ['confirme',        'confirm'],
  ["d'accord",        'confirm'],
  ["l'original",      'confirm'],
  ['non',             'cancel'],
  ['annule',          'cancel'],
  ['stop',            'cancel'],
  ['nan',             'cancel'],
  ['peut-être demain','ambiguous'],
  ['envoie-moi ça',   'ambiguous'],
];

for (const [input, expected] of cases) {
  const result = resolveReply(input);
  if (result === expected) ok(`"${input}" → ${result}`);
  else fail(`resolveReply "${input}"`, result, expected);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
console.log(`Tests: ${passed + failed} | ✅ ${passed} passed | ❌ ${failed} failed`);
if (failed > 0) process.exit(1);
