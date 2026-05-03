// Language detection for Dzaryx — score-based, no external dependency.
// Supports: French, Darija algérienne (Latin + Arabic script), Arabic standard, English, mix fr+darija.

export type DetectedLanguage = 'fr' | 'ar' | 'darija' | 'en' | 'fr+darija' | 'unknown';

export interface LanguageDetection {
  lang:       DetectedLanguage;
  label:      string;
  systemHint: string;
}

const ARABIC_CHARS = /[؀-ۿ]/g;
const PUNCT_DIGITS = /[\s\d!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

// ── Token patterns ────────────────────────────────────────────────────────────

const FR_TOKENS = /\b(?:le|la|les|de|du|des|je|tu|il|elle|nous|vous|ils|elles|un|une|et|est|sont|avec|pour|dans|sur|pas|plus|mais|comme|voiture|disponible|r[eé]servation|bonjour|bonsoir|merci|oui|non|ça|bien|faire|avoir|[eê]tre|mon|ma|mes|ton|ta|tes|son|sa|ses|ce|cet|cette|ces|moi|toi|lui|c'est|j'ai|qu'est|qu'il|fais|peut|veut|veux|suis|[eê]tes|avez|avons|aussi|donc|alors|très|trop|beaucoup|quel|quelle|quand|o[uù]|pourquoi|comment|combien|même|tout|toute|tous|toutes|autre|chaque|ici|l[aà]|déjà)\b/gi;

// Darija algérienne — romanisée (Latin script)
// NOTE: "fin" intentionally excluded — it is a common French word and causes false positives.
const DARIJA_TOKENS = /\b(?:wach|wesh|bghit|bgha|khoya|kho|khti|wlad|rani|raki|rak|wayed|bzzaf|bezzaf|nta|nti|ntuma|ana|hna|fhamt|tfhmt|barak|saha|mzyan|mzien|kima|kifah|kifash|mazal|mazel|sahbi|bsah|zwina|zwin|machi|shi|hadi|hada|hadak|hadik|bessah|deja|druk|daba|taah|seer|rouh|jib|dir(?:i)?|chof|chki|dyal|mta3|mte3|wakha|wakhha|bled|lblad|yallah|wallah|nshaAllah|hamdullah|tbarkallah|khlass|bach|ila|wila|kifkif|ghi|raho|rahi|howa|hiya|lazem|lazm|kh[ae]s|bghina|jina|ji|tjini|tji|ma?chi|maachi|zid|sah|3lash|3la|fe(?:in)?|hh+|salam|slam|kayna|kayn|labas|nkri|nakri)\b/gi;

// Arabic darija markers written in Arabic script (common Algerian/Maghrebi dialectal words)
const DARIJA_AR_TOKENS = /(?:راك|راكي|باغي|باغية|خويا|واش|بزاف|مزيان|كيما|كيفاه|دابا|درك|ماشي|هادي|هادا|صاحبي|بصح|والو|خلاص)/g;

const EN_TOKENS = /\b(?:the|this|that|is|are|was|were|have|has|do|does|will|would|can|could|should|my|your|his|her|our|their|hello|hi|hey|thanks|please|yes|no|okay|car|rental|available|booking|price|when|where|how|what|why|want|need|book|check|call|send|tell|get|go|come|see|i(?:'m|'ve|'ll|'d)?|we|you|they|it)\b/gi;

// ── Main detector ─────────────────────────────────────────────────────────────

export function detectLanguage(text: string): LanguageDetection {
  const fallback: LanguageDetection = {
    lang:       'unknown',
    label:      'Inconnu → français (fallback)',
    systemHint: 'LANGUE DÉTECTÉE: inconnue — répondre en français simple par défaut.',
  };

  if (!text || text.trim().length < 2) return fallback;

  const t = text.trim();

  // Arabic script ratio
  const arabicChars = (t.match(ARABIC_CHARS) ?? []).length;
  const latinBase   = t.replace(PUNCT_DIGITS, '').length || 1;
  const arabicRatio = arabicChars / latinBase;

  // Darija markers in Arabic script
  const darijaArScore = (t.match(DARIJA_AR_TOKENS) ?? []).length;

  // Pure Arabic script without dialectal markers → Arabic standard
  if (arabicRatio > 0.45 && darijaArScore === 0) {
    return {
      lang:       'ar',
      label:      'Arabe standard',
      systemHint: 'LANGUE DÉTECTÉE: arabe standard — répondre UNIQUEMENT en arabe standard (فصحى), aucun dialecte.',
    };
  }

  // Arabic script WITH darija markers, OR darija ratio > 30% of Arabic chars → darija in Arabic script
  if (arabicRatio > 0.35 && darijaArScore >= 1) {
    return {
      lang:       'darija',
      label:      'Darija (écriture arabe)',
      systemHint: 'LANGUE DÉTECTÉE: darija algérienne (écriture arabe) — répondre en darija algérienne naturelle.',
    };
  }

  // Score Latin-script languages
  const frScore     = (t.match(FR_TOKENS)     ?? []).length;
  const darijaScore = (t.match(DARIJA_TOKENS) ?? []).length + darijaArScore;
  const enScore     = (t.match(EN_TOKENS)     ?? []).length;

  // Mix French + Darija — even one French word + one darija word = mix
  if (frScore >= 1 && darijaScore >= 1) {
    return {
      lang:       'fr+darija',
      label:      'Mélange français + darija',
      systemHint: 'LANGUE DÉTECTÉE: mélange français + darija algérienne — répondre en mélangeant les deux langues dans la même proportion que le message, naturellement.',
    };
  }

  if (darijaScore >= 1) {
    return {
      lang:       'darija',
      label:      'Darija algérienne',
      systemHint: 'LANGUE DÉTECTÉE: darija algérienne — répondre en darija algérienne naturelle. Un peu de français est autorisé si le contexte le demande.',
    };
  }

  if (enScore >= 2 && enScore > frScore) {
    return {
      lang:       'en',
      label:      'Anglais',
      systemHint: 'LANGUE DÉTECTÉE: anglais — répondre en anglais professionnel.',
    };
  }

  if (frScore >= 1) {
    return {
      lang:       'fr',
      label:      'Français',
      systemHint: 'LANGUE DÉTECTÉE: français — répondre en français professionnel naturel.',
    };
  }

  return fallback;
}
