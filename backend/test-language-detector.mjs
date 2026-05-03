/**
 * Tests for language-detector.ts
 * Run after build: node backend/test-language-detector.mjs
 * The logic here mirrors language-detector.ts so tests run without compilation.
 */

// ── Inline detector (mirrors language-detector.ts) ──────────────────────────

const ARABIC_CHARS   = /[؀-ۿ]/g;
const PUNCT_DIGITS   = /[\s\d!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;
const FR_TOKENS      = /\b(?:le|la|les|de|du|des|je|tu|il|elle|nous|vous|ils|elles|un|une|et|est|sont|avec|pour|dans|sur|pas|plus|mais|comme|voiture|disponible|r[eé]servation|bonjour|bonsoir|merci|oui|non|ça|bien|faire|avoir|[eê]tre|mon|ma|mes|ton|ta|tes|son|sa|ses|ce|cet|cette|ces|moi|toi|lui|c'est|j'ai|qu'est|qu'il|fais|peut|veut|veux|suis|[eê]tes|avez|avons|aussi|donc|alors|très|trop|beaucoup|quel|quelle|quand|o[uù]|pourquoi|comment|combien|même|tout|toute|tous|toutes|autre|chaque|ici|l[aà]|déjà)\b/gi;
const DARIJA_TOKENS  = /\b(?:wach|wesh|bghit|bgha|khoya|kho|khti|wlad|rani|raki|rak|wayed|bzzaf|bezzaf|nta|nti|ntuma|ana|hna|fhamt|tfhmt|barak|saha|mzyan|mzien|kima|kifah|kifash|mazal|mazel|sahbi|bsah|zwina|zwin|machi|shi|hadi|hada|hadak|hadik|bessah|deja|druk|daba|taah|seer|rouh|jib|dir(?:i)?|chof|chki|dyal|mta3|mte3|wakha|wakhha|bled|lblad|yallah|wallah|nshaAllah|hamdullah|tbarkallah|khlass|bach|ila|wila|kifkif|ghi|raho|rahi|howa|hiya|lazem|lazm|kh[ae]s|bghina|jina|ji|tjini|tji|ma?chi|maachi|zid|kima|nti|sahbi|sah|3lash|3la|fe(?:in)?|fin|hh+)\b/gi;
const DARIJA_AR_TOKENS = /(?:راك|راكي|باغي|باغية|خويا|واش|بزاف|مزيان|كيما|كيفاه|دابا|درك|ماشي|هادي|هادا|صاحبي|بصح|والو|خلاص)/g;
const EN_TOKENS      = /\b(?:the|this|that|is|are|was|were|have|has|do|does|will|would|can|could|should|my|your|his|her|our|their|hello|hi|hey|thanks|please|yes|no|okay|car|rental|available|booking|price|when|where|how|what|why|want|need|book|check|call|send|tell|get|go|come|see|i(?:'m|'ve|'ll|'d)?|we|you|they|it)\b/gi;

function detectLanguage(text) {
  const fallback = { lang: 'unknown', label: 'Inconnu → français (fallback)' };
  if (!text || text.trim().length < 2) return fallback;
  const t = text.trim();
  const arabicChars  = (t.match(ARABIC_CHARS) ?? []).length;
  const latinBase    = t.replace(PUNCT_DIGITS, '').length || 1;
  const arabicRatio  = arabicChars / latinBase;
  const darijaArScore = (t.match(DARIJA_AR_TOKENS) ?? []).length;

  if (arabicRatio > 0.45 && darijaArScore === 0) return { lang: 'ar', label: 'Arabe standard' };
  if (arabicRatio > 0.35 && darijaArScore >= 1)  return { lang: 'darija', label: 'Darija (écriture arabe)' };

  const frScore     = (t.match(FR_TOKENS)     ?? []).length;
  const darijaScore = (t.match(DARIJA_TOKENS) ?? []).length + darijaArScore;
  const enScore     = (t.match(EN_TOKENS)     ?? []).length;

  if (frScore >= 1 && darijaScore >= 1) return { lang: 'fr+darija', label: 'Mélange français + darija' };
  if (darijaScore >= 1)                 return { lang: 'darija',    label: 'Darija algérienne' };
  if (enScore >= 2 && enScore > frScore) return { lang: 'en',       label: 'Anglais' };
  if (frScore >= 1)                      return { lang: 'fr',       label: 'Français' };
  return fallback;
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests = [
  // French
  { input: 'Bonjour, est-ce que la voiture est disponible pour ce week-end ?', expect: 'fr',       desc: 'French — availability question' },
  { input: 'Je voudrais réserver la Clio pour 3 jours, quel est le prix ?',    expect: 'fr',       desc: 'French — booking question' },
  { input: 'Rapport financier du mois de mai',                                  expect: 'fr',       desc: 'French — financial report' },
  { input: 'Fais le résumé du jour',                                            expect: 'fr',       desc: 'French — daily summary' },
  // Darija (Latin)
  { input: 'Wach la voiture disponible ce weekend sahbi ?',                     expect: 'fr+darija',desc: 'Mix fr+darija — availability' },
  { input: 'Wach daba disponible ? bghit nta3 Jumpy',                          expect: 'fr+darija',desc: 'Mix fr+darija — want Jumpy' },
  { input: 'wach rak khoya, labas ?',                                           expect: 'darija',   desc: 'Pure darija — greeting' },
  { input: 'bghit nkri voiture, wayed jdida wela machi ?',                     expect: 'fr+darija',desc: 'Mix darija + French word' },
  { input: 'nta sahbi, bezzaf kima hadak',                                      expect: 'darija',   desc: 'Pure darija — compliment' },
  { input: 'yallah wallah khlass',                                               expect: 'darija',   desc: 'Pure darija — closing' },
  // Arabic standard
  { input: 'هل السيارة متاحة هذا الأسبوع؟',                                    expect: 'ar',       desc: 'Arabic standard — availability' },
  { input: 'كم سعر الإيجار لمدة ثلاثة أيام؟',                                  expect: 'ar',       desc: 'Arabic standard — price' },
  // Darija in Arabic script
  { input: 'واش راك خويا، كيما باغي تكري؟',                                    expect: 'darija',   desc: 'Darija Arabic script — greeting + rent' },
  { input: 'راكي مزيان ماشي؟',                                                  expect: 'darija',   desc: 'Darija Arabic script' },
  // English
  { input: 'Hi, is the car available this weekend?',                             expect: 'en',       desc: 'English — availability' },
  { input: 'What is the rental price for 3 days?',                              expect: 'en',       desc: 'English — price' },
  { input: 'I would like to book the Jumpy please',                             expect: 'en',       desc: 'English — booking' },
  // Edge cases
  { input: 'ok',                                                                 expect: 'unknown',  desc: 'Too short — fallback' },
  { input: '',                                                                   expect: 'unknown',  desc: 'Empty — fallback' },
  { input: '!!!',                                                                expect: 'unknown',  desc: 'Punctuation only — fallback' },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const result = detectLanguage(t.input);
  const ok = result.lang === t.expect;
  if (ok) {
    passed++;
    console.log(`  ✅ [${result.lang}] ${t.desc}`);
  } else {
    failed++;
    console.log(`  ❌ [${result.lang} ≠ ${t.expect}] ${t.desc}`);
    console.log(`     Input: "${t.input.slice(0, 60)}"`);
    console.log(`     Label: ${result.label}`);
  }
}

console.log(`\n${passed}/${tests.length} tests passed${failed > 0 ? ` — ${failed} FAILED` : ' ✅'}`);
process.exit(failed > 0 ? 1 : 0);
