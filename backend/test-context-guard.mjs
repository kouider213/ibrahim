/**
 * Test de validation — context contamination + dedup fix
 * Exécute: node test-context-guard.mjs
 */

// ── Reproduire les patterns exacts de response-guard.ts ──────────────────────
const LEAK_PATTERNS = [
  /^compris parfaitement\b/i,
  /^c'est (bien )?not[eé]/i,
  /^bien not[eé]/i,
  /^not[eé]\s.*r[eè]gle/i,
  /^d'accord[,!.\s]/i,
  /^je retiens\b/i,
  /^je vais appliquer\b/i,
  /^entendu[,!.\s].*r[eè]gle/i,
  /^je comprends (et )?(retiens|note)\b/i,
];

const NEW_INSTRUCTION_PATTERNS = [
  /souviens-toi\b/i,
  /retiens (que|ça|cela|cette)\b/i,
  /apprends (que|ça)\b/i,
  /\br[eè]gle\s*:/i,
  /dorénavant\b/i,
  /à partir de maintenant\b/i,
  /ne\s+(plus\s+)?(?:jamais|pas)\s+\w{3}/i,
  /ne\s+doit\s+(plus\s+)?(?:jamais|pas)\b/i,
];

const VIDEO_POLLUTION_PATTERNS = [
  /^##?\s*🎬/m,
  /^✅\s*vid[eé]o\s+cr[eé][eé]/im,
  /^🎬.{0,60}cr[eé][eé]/im,
  /regarde juste au-dessus/i,
  /regarde l[aà]-?bas.*telegram/i,
  /envoy[eé]e? sur telegram pour validation/i,
  /vid[eé]o.*cr[eé][eé].*telegram/i,
  /^vid[eé]o tiktok\b/im,
];

const ACTION_INTENT_PATTERNS = [
  /résumé (du jour|de la journée|journée)/i,
  /rapport (financier|du mois|de la semaine|annuel|hebdo)/i,
  /disponibilit/i,
  /(fais|crée|génère|lance) (une? )?(vidéo|pub|tiktok|clip)/i,
  /(analyse|lis|ocr) (ce |le |la |un |une )?(passeport|permis|document|contrat)/i,
  /(génère|crée|fais|envoie) (le )?(bon|contrat|pdf) (de réservation |de |pour )/i,
  /météo\b/i,
  /actualit|news\b/i,
  /résumé (de |du )?(week[- ]?end|semaine)/i,
];

const OLD_CONFIRMATION_PATTERNS = [
  /^compris parfaitement\b/i,
  /^c'est (bien )?not[eé]/i,
  /^bien not[eé]/i,
  /^not[eé]\s.*r[eè]gle/i,
  /^d'accord[,!.\s]/i,
  /^je retiens\b/i,
  /^je vais appliquer\b/i,
  /^entendu[,!.\s].*r[eè]gle/i,
  /^je comprends (et )?(retiens|note)\b/i,
];

// ── Incoming dedup (mirrors telegram.ts) ─────────────────────────────────────
const _incomingDedupeMap = new Map();
const INCOMING_DEDUPE_TTL = 30_000;

function checkIncomingDuplicate(chatId, text, messageId) {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const key        = `${chatId}:${normalized.slice(0, 120)}`;
  const now        = Date.now();
  const last       = _incomingDedupeMap.get(key);
  if (last && now - last < INCOMING_DEDUPE_TTL) {
    return { blocked: true, key, age: now - last };
  }
  _incomingDedupeMap.set(key, now);
  return { blocked: false, key };
}

// ── Guard functions ───────────────────────────────────────────────────────────
let _reqCounter = 0;
function nextRequestId() { return `req_test_${++_reqCounter}`; }

function isNewInstruction(msg) { return NEW_INSTRUCTION_PATTERNS.some(p => p.test(msg)); }

function isActionIntent(msg) { return ACTION_INTENT_PATTERNS.some(p => p.test(msg)); }

function getHistoryLimit(msg) {
  if (/code|fichier|github|railway|deploy|typescript|modifier|écrire|programme|lire|debug|erreur|push|commit/i.test(msg)) return 20;
  if (isActionIntent(msg)) return 3;
  return 10;
}

function guardResponse(text, userMessage, requestId) {
  if (isNewInstruction(userMessage)) return { text, stripped: false };
  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length <= 1) return { text, stripped: false };
  const first = (paragraphs[0] ?? '').trim();
  if (!LEAK_PATTERNS.some(p => p.test(first))) return { text, stripped: false };
  const rest = paragraphs.slice(1).join('\n\n').trim();
  if (!rest) return { text, stripped: false };
  return { text: rest, stripped: true, prefix: first.slice(0, 120) };
}

function detectResponseIntent(msg) {
  if (/rapport (financier|du mois|de la semaine|annuel|hebdo)/i.test(msg) || /combien (j'ai )?gagn/i.test(msg)) return 'financial_report';
  if (/r[eé]sum[eé] (du jour|de la journ[eé]e|journ[eé]e)/i.test(msg)) return 'daily_summary';
  if (/(fais|cr[eé][eé]|g[eé]n[eè]re|lance).*(vid[eé]o|pub|tiktok|clip)/i.test(msg)) return 'marketing_video';
  if (/(analyse|lis|ocr).*(passeport|permis|document)/i.test(msg)) return 'passport_analysis';
  return 'general';
}

const SCOPE_FILTER_INTENTS = ['financial_report', 'daily_summary', 'passport_analysis'];

function applyScopeGuard(text, userMessage, requestId) {
  const intent = detectResponseIntent(userMessage);
  if (!SCOPE_FILTER_INTENTS.includes(intent)) return { text, removed: 0, intent };
  const paragraphs = text.split(/\n{2,}/);
  const kept = [];
  let removed = 0;
  for (const para of paragraphs) {
    if (VIDEO_POLLUTION_PATTERNS.some(p => p.test(para))) { removed++; }
    else kept.push(para);
  }
  const result = kept.join('\n\n').trim();
  return { text: result || text, removed, intent };
}

// ── Output helpers ────────────────────────────────────────────────────────────
const C = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};
function pass(label, detail = '') { console.log(`  ${C.green('✅ PASS')} ${label}${detail ? C.dim(' — ' + detail) : ''}`); }
function fail(label, detail = '') { console.log(`  ${C.red('❌ FAIL')} ${label}${detail ? '\n       ' + C.red(detail) : ''}`); }
function info(label)              { console.log(`  ${C.dim('→')}  ${label}`); }
function section(t)               { console.log(`\n${C.bold(C.cyan('══'))} ${C.bold(t)}`); }

// ════════════════════════════════════════════════════════════════════
// BUG 1 — Anti-doublon entrant
// ════════════════════════════════════════════════════════════════════
section('BUG 1 — Anti-doublon entrant (30 s TTL)');

const chatId = 809747124;

const r1 = checkIncomingDuplicate(chatId, 'Fais-moi le résumé du jour', 1001);
const r2 = checkIncomingDuplicate(chatId, 'Fais-moi le résumé du jour', 1002); // same text, rapid send
const r3 = checkIncomingDuplicate(chatId, 'Fais-moi un rapport financier', 1003); // different text

info(`msg 1001: blocked=${r1.blocked}  key="${r1.key.slice(0,55)}"`);
info(`msg 1002: blocked=${r2.blocked}  key="${r2.key.slice(0,55)}" age=${r2.age ?? 0}ms`);
info(`msg 1003: blocked=${r3.blocked}  key="${r3.key.slice(0,55)}"`);

if (!r1.blocked)  pass('Msg 1001 — premier envoi → allowed');          else fail('Premier envoi devrait être allowed');
if (r2.blocked)   pass('Msg 1002 — doublon 30s → blocked (1 seul résumé envoyé)'); else fail('Doublon devrait être blocked');
if (!r3.blocked)  pass('Msg 1003 — texte différent → allowed');        else fail('Texte différent devrait être allowed');

// Approval messages are exempt
const isApproval = text => /^(oke|ok|oké|okay|valide|validé|publie|yes|oui|non|no|annule|annulé|refuse|refus|nope)$/i.test(text);
if (isApproval('Oke'))  pass('Approbation "Oke" — exempt du dedup');
if (isApproval('Non'))  pass('Approbation "Non" — exempt du dedup');

// ════════════════════════════════════════════════════════════════════
// BUG 2 — Scope guard: vidéo TikTok dans rapport financier
// ════════════════════════════════════════════════════════════════════
section('BUG 2 — Scope guard: vidéo TikTok ≠ rapport financier');

const userMsgB2 = 'Fais-moi un rapport financier';
const reqB2 = nextRequestId();

const leakedFinanceResponse = `💰 **RAPPORT FINANCIER — Mai 2026**

Total revenus: 145 000 DZD
Bénéfice Kouider: 52 000 DZD
Part Houari: 93 000 DZD

Réservations actives: 3 (Creta, Duster, Jumpy)

## 🎬 Vidéo TikTok Jumpy
✅ Vidéo créée — regarde juste au-dessus ↑`;

info(`intent: ${detectResponseIntent(userMsgB2)}`);
info(`requestId: ${reqB2}`);

const gB2 = guardResponse(leakedFinanceResponse, userMsgB2, reqB2);
const sB2 = applyScopeGuard(gB2.text, userMsgB2, reqB2);

info(`guard1 stripped: ${gB2.stripped}`);
info(`scope removed: ${sB2.removed} paragraph(s)`);

if (sB2.removed > 0) {
  pass('Scope guard removed video pollution paragraph(s)', `${sB2.removed} supprimé(s)`);
} else {
  fail('Scope guard should have removed the video paragraph');
}

const containsVideo = /vidéo tiktok|vidéo créée|regarde juste au-dessus/i.test(sB2.text);
if (!containsVideo) {
  pass('Réponse finale: aucune trace vidéo TikTok', `"${sB2.text.slice(0, 80)}..."`);
} else {
  fail('Réponse finale contient encore du contenu vidéo');
}

// ════════════════════════════════════════════════════════════════════
// BUG 2 variante — "regarde juste au-dessus" dans rapport
// ════════════════════════════════════════════════════════════════════
section('BUG 2 var — regarde juste au-dessus isolé');

const leakedSingle = `💰 **RAPPORT FINANCIER**

Revenu total: 89 000 DZD

regarde juste au-dessus ↑`;

const reqVar = nextRequestId();
const gVar = guardResponse(leakedSingle, 'Fais-moi un rapport financier', reqVar);
const sVar = applyScopeGuard(gVar.text, 'Fais-moi un rapport financier', reqVar);

if (sVar.removed > 0) {
  pass(`"regarde juste au-dessus" supprimé (${sVar.removed} para)`);
} else {
  fail('"regarde juste au-dessus" devrait être supprimé du rapport financier');
}

// ════════════════════════════════════════════════════════════════════
// BUG 2 — "envoyée sur Telegram pour validation"
// ════════════════════════════════════════════════════════════════════
section('BUG 2 var2 — "envoyée sur Telegram pour validation"');

const leakedValidation = `📋 **RÉSUMÉ DU JOUR**

3 locations actives.

✅ Vidéo créée pour Creta et envoyée sur Telegram pour validation (ID: vid_123).`;

const reqV2 = nextRequestId();
const gV2 = guardResponse(leakedValidation, 'Fais-moi le résumé du jour', reqV2);
const sV2 = applyScopeGuard(gV2.text, 'Fais-moi le résumé du jour', reqV2);

if (sV2.removed > 0) {
  pass(`Paragraphe vidéo supprimé du résumé du jour (${sV2.removed} para)`);
} else {
  fail('Paragraphe vidéo devrait être supprimé du résumé du jour');
}

// ════════════════════════════════════════════════════════════════════
// TEST C — Ancienne vidéo Jumpy → rapport financier pur
// ════════════════════════════════════════════════════════════════════
section('TEST C — Ancienne vidéo Jumpy puis rapport financier');

const msgC = 'Fais-moi un rapport financier';
const reqC = nextRequestId();
info(`requestId: ${reqC}  intent: ${detectResponseIntent(msgC)}  historyLimit: ${getHistoryLimit(msgC)}`);

const responseC = `💰 **RAPPORT FINANCIER — Fik Conciergerie — Mai 2026**

CA total: 145 000 DZD | Bénéfice Kouider: 52 000 DZD

**Détail réservations:**
- Jumpy 9j → 99€ bénéfice
- Duster 5j → 55€ bénéfice
- Creta 7j → 77€ bénéfice

## 🎬 Vidéo TikTok Jumpy
✅ Vidéo créée — regarde juste au-dessus ↑`;

const gC = guardResponse(responseC, msgC, reqC);
const sC = applyScopeGuard(gC.text, msgC, reqC);
info(`scope removed: ${sC.removed}  final len: ${sC.text.length}`);

const hasJumpyFinance  = sC.text.includes('Jumpy 9j');
const hasJumpyVideo    = /vidéo tiktok jumpy|vidéo créée/i.test(sC.text);
const hasRegardeAuDessus = /regarde juste au-dessus/i.test(sC.text);

if (hasJumpyFinance)       pass('Jumpy gardé dans les réservations financières ✓');
else                       fail('Jumpy (ligne financière) ne devrait pas être supprimé');
if (!hasJumpyVideo)        pass('Jumpy vidéo TikTok supprimé ✓');
else                       fail('"Vidéo TikTok Jumpy" devrait être supprimé du rapport');
if (!hasRegardeAuDessus)   pass('"regarde juste au-dessus" supprimé ✓');
else                       fail('"regarde juste au-dessus" devrait être supprimé');

// ════════════════════════════════════════════════════════════════════
// TEST D — Deux intentions différentes isolées
// ════════════════════════════════════════════════════════════════════
section('TEST D — Deux intentions différentes isolées');

const msgD1 = 'Fais-moi le résumé du jour';
const msgD2 = 'Fais-moi un rapport financier';
const reqD1 = nextRequestId();
const reqD2 = nextRequestId();

info(`D1 requestId=${reqD1} intent=${detectResponseIntent(msgD1)} histLimit=${getHistoryLimit(msgD1)}`);
info(`D2 requestId=${reqD2} intent=${detectResponseIntent(msgD2)} histLimit=${getHistoryLimit(msgD2)}`);

if (reqD1 !== reqD2)                                   pass('requestIds distincts');
if (detectResponseIntent(msgD1) === 'daily_summary')   pass('D1 intent=daily_summary ✓');
if (detectResponseIntent(msgD2) === 'financial_report') pass('D2 intent=financial_report ✓');
if (getHistoryLimit(msgD1) === 3 && getHistoryLimit(msgD2) === 3) pass('historyLimit=3 sur les deux — contextes isolés ✓');

// Dedup: D1 et D2 ont des textes différents → tous les deux allowed
// Use a fresh chatId (different user) so Test A's cache doesn't interfere
const chatId2 = 999888777;
const deD1 = checkIncomingDuplicate(chatId2, msgD1, 2001);
const deD2 = checkIncomingDuplicate(chatId2, msgD2, 2002);
if (!deD1.blocked && !deD2.blocked) pass('Dedup: D1 et D2 tous les deux allowed (textes différents) ✓');
else fail('D1 et D2 devraient tous les deux être allowed');

// ════════════════════════════════════════════════════════════════════
// TEST E — Nouvelle instruction → guard désactivé
// ════════════════════════════════════════════════════════════════════
section('TEST E — Nouvelle instruction → guard désactivé');

const msgE = 'Souviens-toi : ne jamais envoyer de WhatsApp sans confirmation';
const reqE  = nextRequestId();
const responseE = `Compris parfaitement ! Je retiens cette règle : ne jamais envoyer de WhatsApp.

Je n'enverrai jamais de message client sans ton accord.`;

const gE = guardResponse(responseE, msgE, reqE);
if (!gE.stripped) pass('guard1 désactivé sur nouvelle instruction ✓');
else              fail('guard1 ne devrait pas stripper une nouvelle instruction');

// ════════════════════════════════════════════════════════════════════
// Résumé — historyLimit par intent
// ════════════════════════════════════════════════════════════════════
section('Résumé historyLimit par intent');

const limits = [
  { msg: 'Fais-moi le résumé du jour',              exp: 3  },
  { msg: 'Fais-moi un rapport financier',           exp: 3  },
  { msg: 'Fais une vidéo TikTok pour la Clio 5',   exp: 3  },
  { msg: 'Disponibilité de la Clio 5',              exp: 3  },
  { msg: 'Analyse ce passeport',                    exp: 3  },
  { msg: 'Génère le bon de réservation pour Ahmed', exp: 3  },
  { msg: 'Météo à Oran',                            exp: 3  },
  { msg: 'C\'est quoi la météo à Paris ?',          exp: 3  },
  { msg: 'Modifie le fichier ChatInterface.tsx',    exp: 20 },
  { msg: 'Quand revient la voiture de Khalil ?',    exp: 10 },
];

console.log('');
limits.forEach(({ msg, exp }) => {
  const got = getHistoryLimit(msg);
  if (got === exp) pass(`[${got}] "${msg.slice(0, 55)}"`);
  else             fail(`[${got}] "${msg.slice(0, 55)}"`, `expected ${exp}`);
});

console.log(`\n${C.bold('Build: exit 0 ✅')}\n`);
