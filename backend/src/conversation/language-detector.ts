// Language detection for Dzaryx — score-based, no external dependency.
// Supports: French, Darija algérienne (Latin + Arabic script), Arabic standard, English, Spanish, mix fr+darija.

export type DetectedLanguage = 'fr' | 'ar' | 'darija' | 'en' | 'es' | 'fr+darija' | 'unknown';

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
// Darija algérienne romanisée (Latin / arabizi) — lexique large.
// Regroupé par familles pour rester lisible. Évite les mots trop courts qui
// collisionnent avec le français (pas de "ma", "w", "la", "de"…).
const DARIJA_TOKENS = new RegExp('\\b(?:' + [
  // pronoms / être (rani…)
  'ana','nta','nti','ntuma','huma','houma','hna','7na','rani','rak','raki','rahi','raho','rahou','rahum','rahoum','rahna','rahmin','wahdi','wahdek',
  // interrogatifs
  'wach','wesh','wache','wechta','ch7al','chhal','ch7el','qadach','gdach','9adach','kifah','kifach','kifch','kifech','win','wine','winta','weqtach','waqtach','3lah','3lach','3la','chkun','chkoun','achmen','kach','kech','kayech','kayach','wa3lah','wa3lach','3lache',
  // verbes courants
  'gouli','goul','goulili','gououli','guli','kuli','dir','diri','diro','ndir','ndiro','dar','jib','jibli','jab','aji','arwah','rou7','rouh','rohi','rwah','rah','mcha','mchit','jit','klit','chrit','chra','bi3','ba3','7ab','7abit','7abbit','nheb','n7eb','t7eb','bgha','bghit','bghina','chaf','chouf','chof','chft','chki','sma3','sme3','sma3t','sma7','smah','samhli','smahli','fhamt','fhem','fhemt','fhmt','tfhmt','3raft','3ref','3arf','dert','khdmt','khdem','nakhdem','kteb','ktebt','qra','qrit','sken','sakn','gles','glest','qum','wsel','wselt','lqit','tlaqit','3tit','3ta','khllas','khlas','khlass','sali','saliti','zid','zidi','wlit','wliti','ji','tji','tjini','jina',
  // adjectifs / états
  'mli7','mlih','mle7','mzyan','mzien','zwin','zwina','khayb','khayba','kbir','kbira','sghir','sghira','jdid','jdida','jadid','qdim','bnin','s5oun','skhoun','bared','b3id','qrib','ghali','rkhis','sahel','s3ib','fer7an','ta3ban','3yan','mrid','mabrouk','mberkat',
  // noms
  'drahem','flous','swardet','tomobil','tonobil','karoussa','dar','blassa','khedma','khdma','sa3a','nhar','nhara','lyoum','lyum','lioum','lbareh','lbarah','ghedwa','weqt','triq','3icha','makla','weld','bent','mra','rajel','sahbi','sahab','khoya','kho','khti','wlad','3aila','3ami','khalti','3ami','jiran','3ers',
  // connecteurs / divers
  'bsah','bessah','sah','saraha','sara7a','ghir','ghi','hata','7ata','kamel','kaml','walou','walo','kayn','kayen','kayna','kaynin','makanch','makach','maranich','makayench','mazal','mazel','deja','daba','derk','dork','twa','taw','b3da','mba3d','qbel','b7al','kima','willa','wila','ila','ya3ni','nichan','bzaf','bzzaf','bezzaf','bzaf','chwiya','shwiya','ktir','qlil','nchallah','nshaallah','hamdoullah','hamdullah','tbarkallah','wallah','wlh','yallah','saha','sa7a','barakallah','slam','salam','labas','bikhir','b5ir','ma3lich','ma3lish','mouchkil','mochkil','machi','shi','hadi','hada','hadak','hadik','hadou','hadouk','haduk','hadok','dyal','mta3','mte3','ta3','te3','wakha',
  // oranais spécifiques
  'yezi','mahu','wgila','hbes','yesah','3jbni','3jbatni','nkri','nakri','kraw','wahran','ghaya',
].join('|') + ')\\b', 'gi');

// Arabic darija markers written in Arabic script (common Algerian/Maghrebi dialectal words)
const DARIJA_AR_TOKENS = /(?:راك|راكي|باغي|باغية|خويا|واش|بزاف|مزيان|كيما|كيفاه|دابا|درك|ماشي|هادي|هادا|صاحبي|بصح|والو|خلاص)/g;

const EN_TOKENS = /\b(?:the|this|that|is|are|was|were|have|has|do|does|will|would|can|could|should|my|your|his|her|our|their|hello|hi|hey|thanks|please|yes|no|okay|car|rental|available|booking|price|when|where|how|what|why|want|need|book|check|call|send|tell|get|go|come|see|i(?:'m|'ve|'ll|'d)?|we|you|they|it)\b/gi;

// Español — clientes espagnols de Fik Conciergerie
const ES_TOKENS = /\b(?:el|la|los|las|de|del|un|una|unos|unas|y|es|son|con|para|en|por|no|s[íi]|hola|gracias|coche|auto|reserva|reservar|disponible|precio|cu[áa]nto|cu[áa]ndo|d[óo]nde|c[óo]mo|qu[eé]|qui[eé]n|necesito|quiero|puedo|puede|tengo|tiene|bueno|buena|bien|muy|tambi[eé]n|pero|como|todo|todos|este|esta|estos|estas|mi|tu|su|nuestro|vuestra|hace|hacer|tener|ser|estar|ir|voy|vengo|venir|d[íi]as|semana|mes|alquiler|alquilar|carro|coche|moto)\b/gi;

// ── Main detector ─────────────────────────────────────────────────────────────

export function detectLanguage(text: string): LanguageDetection {
  const fallback: LanguageDetection = {
    lang:       'unknown',
    label:      'Inconnu → français (fallback)',
    systemHint: 'LANGUE DÉTECTÉE: inconnue — répondre en français simple par défaut.',
  };

  if (!text || text.trim().length < 2) return fallback;

  const t = text.trim();

  // Numeric-only messages (phone numbers, prices, amounts, dates) → treat as French
  if (/^[\+\d][\d\s\-().]+$/.test(t) || /^\d+[€$]?$/.test(t)) {
    return {
      lang:       'fr',
      label:      'Français (réponse numérique)',
      systemHint: 'LANGUE DÉTECTÉE: français — répondre en français professionnel naturel.',
    };
  }

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

  // Arabizi : darija écrite avec des chiffres-lettres (3=ع, 7=ح, 9=ق, 5=خ, 2=ء).
  // Ex: "3andi", "ch7al", "m3a", "9adach" → forte marque de darija.
  const arabiziBonus = (t.split(/\s+/).filter(w =>
    /[a-z]/i.test(w) && /[235679]/.test(w) && /[a-z][235679]|[235679][a-z]/i.test(w)
  ) ?? []).length;

  // Score Latin-script languages
  const frScore     = (t.match(FR_TOKENS)     ?? []).length;
  const darijaScore = (t.match(DARIJA_TOKENS) ?? []).length + darijaArScore + arabiziBonus;
  const enScore     = (t.match(EN_TOKENS)     ?? []).length;
  const esScore     = (t.match(ES_TOKENS)     ?? []).length;

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

  if (esScore >= 2 && esScore > frScore && esScore > enScore) {
    return {
      lang:       'es',
      label:      'Español',
      systemHint: 'LANGUE DÉTECTÉE: español — responder ÚNICAMENTE en español profesional. El cliente es hispanohablante.',
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
