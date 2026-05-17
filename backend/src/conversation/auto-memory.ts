/**
 * Auto-memory extraction — passive learning after each conversation turn.
 * Runs in background (non-blocking). Extracts key facts from user messages
 * using regex patterns — no LLM call, zero latency overhead.
 */
import { writeMemory, computeMemoryKey, type MemoryDomain } from '../orchestrator/memory-engine.js';

interface ExtractedFact {
  domain: MemoryDomain;
  key:    string;
  value:  string;
}

// ── Client preference patterns ─────────────────────────────────────────────────
const CLIENT_PATTERNS: Array<{ re: RegExp; toFact: (m: RegExpMatchArray) => ExtractedFact }> = [
  // "Ahmed préfère la Clio" / "Ahmed aime la Clio 5"
  {
    re: /([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?)\s+(?:préfère|aime|veut toujours|demande toujours|prend toujours)\s+(la |le |les |l')?(\w[\w\s-]+)/i,
    toFact: m => ({ domain: 'client' as MemoryDomain, key: `pref_vehicule_${m[1].toLowerCase().replace(/\s/g, '_')}`, value: `${m[1]} préfère ${m[3]}` }),
  },
  // "Ahmed loue toujours en juillet"
  {
    re: /([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?)\s+(?:loue|réserve|vient)\s+(?:toujours|souvent|en général)\s+en\s+(\w+)/i,
    toFact: m => ({ domain: 'client' as MemoryDomain, key: `period_${m[1].toLowerCase().replace(/\s/g, '_')}`, value: `${m[1]} loue généralement en ${m[2]}` }),
  },
  // "Ahmed paie toujours en espèces" / "Ahmed paie rarement"
  {
    re: /([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?)\s+(?:paie|paye)\s+(toujours|souvent|rarement|jamais|en espèces|par virement|cash)/i,
    toFact: m => ({ domain: 'client' as MemoryDomain, key: `payment_${m[1].toLowerCase().replace(/\s/g, '_')}`, value: `${m[1]} ${m[2]}` }),
  },
];

// ── Business patterns ──────────────────────────────────────────────────────────
const BUSINESS_PATTERNS: Array<{ re: RegExp; toFact: (m: RegExpMatchArray) => ExtractedFact }> = [
  // "la Clio est toujours demandée en été"
  {
    re: /([\w\s]+)\s+est\s+(?:toujours|souvent|très)\s+demand[eé]e?\s+en\s+(\w+)/i,
    toFact: m => ({ domain: 'business', key: `demand_${m[1].trim().toLowerCase().replace(/\s/g, '_')}`, value: `${m[1].trim()} très demandée en ${m[2]}` }),
  },
  // "notre prix habituel pour la Clio c'est 50€/jour"
  {
    re: /prix\s+(?:habituel|standard|normal)\s+(?:pour\s+)?([\w\s]+)\s+(?:c'est|est)\s+(\d+)(?:€|dinar|da)?/i,
    toFact: m => ({ domain: 'business', key: `prix_${m[1].trim().toLowerCase().replace(/\s/g, '_')}`, value: `Prix habituel ${m[1].trim()}: ${m[2]}€/jour` }),
  },
];

// ── Kouider preferences ────────────────────────────────────────────────────────
const PREFERENCE_PATTERNS: Array<{ re: RegExp; toFact: (m: RegExpMatchArray) => ExtractedFact }> = [
  // "je préfère les réponses courtes" / "je veux des réponses plus détaillées"
  {
    re: /je\s+(?:préfère|veux|aime|veux)\s+(?:des?\s+)?(?:réponses?)\s+(courtes?|longues?|détaillées?|concises?|brèves?)/i,
    toFact: m => ({ domain: 'preference', key: 'style_reponse', value: `Kouider préfère les réponses ${m[1]}` }),
  },
  // "ne me dis pas ..." / "dis-moi toujours ..."
  {
    re: /(?:ne\s+me\s+dis\s+(?:jamais|plus)|dis-moi\s+toujours)\s+(.{10,60})/i,
    toFact: m => ({ domain: 'preference', key: `pref_${Date.now()}`, value: m[0].slice(0, 80) }),
  },
];

// ── Darija / Arabic patterns (Houari interactions) ────────────────────────────
const DARIJA_PATTERNS: Array<{ re: RegExp; toFact: (m: RegExpMatchArray) => ExtractedFact }> = [
  // "X yeheb el Clio" (X aime la Clio) / "X ma yehebsh"
  {
    re: /([A-ZÀ-Üa-zà-ü]{3,})\s+(?:yeheb|y7eb|kayen|dima)\s+(el\s+|la\s+)?([\w\s-]{3,20})/i,
    toFact: m => ({ domain: 'client' as MemoryDomain, key: `pref_${m[1].toLowerCase()}`, value: `${m[1]} préfère ${m[3]}` }),
  },
  // "X 3ando mochkil fi X" / "3ando wahed X"
  {
    re: /3ando\s+(?:wahed\s+|l\s+)?([\w\s]{3,30})/i,
    toFact: m => ({ domain: 'general' as MemoryDomain, key: `note_darija_${Date.now()}`, value: m[0].slice(0, 80) }),
  },
  // "safi nrenda X" (on loue X) — capture car name
  {
    re: /(?:safi|wakha)\s+n?r(?:enda|end)\s+(el\s+|la\s+)?([\w\s-]{3,20})/i,
    toFact: m => ({ domain: 'business' as MemoryDomain, key: `loc_darija_${m[2].trim().toLowerCase().replace(/\s/g, '_')}`, value: `Location ${m[2].trim()} confirmée (darija)` }),
  },
];

// ── Health / lifestyle patterns ────────────────────────────────────────────────
const HEALTH_PATTERNS: Array<{ re: RegExp; toFact: (m: RegExpMatchArray) => ExtractedFact }> = [
  // "je prends X mg de vitamine Y"
  {
    re: /(?:je\s+prends?|je\s+prend)\s+(\d+\s*mg)\s+(?:de\s+)?([\w\s]{2,20})/i,
    toFact: m => ({ domain: 'health' as MemoryDomain, key: `supplement_${m[2].trim().toLowerCase().replace(/\s/g, '_')}`, value: `${m[2].trim()}: ${m[1]}` }),
  },
  // "je dors X heures"
  {
    re: /(?:je\s+dors?)\s+(?:environ\s+)?(\d+)\s+h(?:eures?)?/i,
    toFact: m => ({ domain: 'health' as MemoryDomain, key: 'sleep_hours', value: `Kouider dort environ ${m[1]}h par nuit` }),
  },
];

function extractFacts(userMessage: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const allPatterns = [...CLIENT_PATTERNS, ...BUSINESS_PATTERNS, ...PREFERENCE_PATTERNS, ...DARIJA_PATTERNS, ...HEALTH_PATTERNS];
  for (const { re, toFact } of allPatterns) {
    const m = userMessage.match(re);
    if (m) {
      try { facts.push(toFact(m)); } catch { /* bad match */ }
    }
  }
  return facts;
}

export async function autoExtractMemory(
  userMessage: string,
  userId = 'kouider',
): Promise<void> {
  const facts = extractFacts(userMessage);
  if (facts.length === 0) return;

  console.log(`[auto-memory] extracting ${facts.length} fact(s) from message for user=${userId}`);

  for (const fact of facts) {
    try {
      const key = computeMemoryKey(fact.value, fact.domain, userId);
      await writeMemory({ key, value: fact.value, domain: fact.domain, source: 'auto_extract', userId });
    } catch (err) {
      console.warn(`[auto-memory] write failed for [${fact.domain}] ${fact.key}:`, err instanceof Error ? err.message : err);
    }
  }
}
