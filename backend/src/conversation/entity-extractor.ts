/**
 * Entity Extractor — Conversation Engine V2
 * Extract structured entities from normalized user messages.
 * No external deps — regex + pattern matching.
 */

// ── Known entities ────────────────────────────────────────────────────────────

export const KNOWN_CARS = [
  'jumpy', 'berlingo', 'jogger', 'sandero', 'clio', 'alpine',
  'duster', 'creta', 'fiat 500', 'fiat500', 'i10',
];

const DOC_TYPES = {
  passport: /\b(passeport|passport|passeprt|paseport)\b/i,
  license:  /\b(permis|permit|licence|license)\b/i,
  voucher:  /\b(bon\s+de\s+r[ée]servation|voucher)\b/i,   // before receipt — more specific
  contract: /\b(contrat|contract)\b/i,
  receipt:  /\b(re[çc]u|re[çc]ue?|facture|invoice)\b/i,   // removed 'bon' — too generic
  document: /\b(document|doc|papier|pi[eè]ce)\b/i,
};

const ACTION_VERBS = {
  send:      /\b(envoie|envoyer|envoi|envoyes|balance|file|transmets?|partage)\b/i,
  show:      /\b(affiche|montre|dis|donne|vois|voir|regarde|pr[eé]sente)\b/i,
  open:      /\b(ouvre|lancer?|lance|d[eé]marre|start|mets?|ouvrir)\b/i,
  confirm:   /\b(confirme|ok|oui|d['']accord|go|vas-y|continue|valide)\b/i,
  cancel:    /\b(annule|non|stop|arr[eê]te|cancel|abandonne)\b/i,
  create:    /\b(cr[eé]e|cr[eé]er|ajoute|ajouter|nouvelle?|nouveau|nouvelle)\b/i,
  update:    /\b(modifie|modifier|change|changer|mets?\s+[aà]\s+jour|update)\b/i,
  delete:    /\b(supprime|supprimer|efface|effacer|d[eé]place)\b/i,
  check:     /\b(v[eé]rifie|check|regarde|cherche|trouve|dis-moi|c['']est\s+quoi)\b/i,
  generate:  /\b(g[eé]n[eè]re|g[eé]n[eé]rer|cr[eé]e|cr[eé]er|fais|faire|produis)\b/i,
};

// Date patterns (relative + absolute)
const DATE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\baujourd['']hui\b/i,                                    label: 'today' },
  { re: /\bdemain\b/i,                                            label: 'tomorrow' },
  { re: /\bapr[eè]s-demain\b/i,                                  label: 'day_after_tomorrow' },
  { re: /\bce\s+soir\b/i,                                        label: 'tonight' },
  { re: /\bcette\s+semaine\b/i,                                   label: 'this_week' },
  { re: /\bla\s+semaine\s+prochaine\b/i,                         label: 'next_week' },
  { re: /\bce\s+mois\b/i,                                        label: 'this_month' },
  { re: /\ble\s+mois\s+prochain\b/i,                             label: 'next_month' },
  { re: /\b(\d{1,2})\s+(jan|f[eé]v|mars?|avr|mai|juin|juil|ao[uû]|sep|oct|nov|d[eé]c)\w*\b/i, label: 'specific_date' },
  { re: /\b(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?\b/,      label: 'date_numeric' },
];

// Amount patterns
const AMOUNT_PATTERN = /(\d[\d\s.,]*)(?:\s*)(da|dzd|€|eur|euro|euros?|dinar|dinars?)/gi;

// ── Extracted entities ────────────────────────────────────────────────────────

export interface ExtractedEntities {
  clientName:  string | null;
  carName:     string | null;
  docType:     keyof typeof DOC_TYPES | null;
  action:      keyof typeof ACTION_VERBS | null;
  dates:       string[];
  amounts:     string[];
  isOriginalRequest: boolean;  // "l'original", "le vrai document"
  isAdminAction:     boolean;  // action requiring admin confirmation
}

export function extractEntities(
  text: string,
  knownClientNames: string[] = [],
): ExtractedEntities {
  const lower = text.toLowerCase();

  // ── Car name ─────────────────────────────────────────────────────────────
  let carName: string | null = null;
  for (const car of KNOWN_CARS) {
    if (lower.includes(car)) { carName = car; break; }
  }

  // ── Document type ─────────────────────────────────────────────────────────
  let docType: keyof typeof DOC_TYPES | null = null;
  for (const [type, re] of Object.entries(DOC_TYPES) as Array<[keyof typeof DOC_TYPES, RegExp]>) {
    if (re.test(text)) { docType = type; break; }
  }

  // ── Action verb ───────────────────────────────────────────────────────────
  let action: keyof typeof ACTION_VERBS | null = null;
  for (const [act, re] of Object.entries(ACTION_VERBS) as Array<[keyof typeof ACTION_VERBS, RegExp]>) {
    if (re.test(text)) { action = act; break; }
  }

  // ── Client name (from known list) ────────────────────────────────────────
  // Match: full name, first name, last name (word-level)
  let clientName: string | null = null;
  const textWords = lower.split(/\s+/);
  for (const name of knownClientNames) {
    const nameLower = name.toLowerCase();
    const nameParts = nameLower.split(/\s+/);
    // Check if any part of the name appears as a word in the text
    const matches = nameParts.some(part => textWords.includes(part));
    if (matches || lower.includes(nameLower)) {
      clientName = name;
      break;
    }
  }

  // ── Dates ─────────────────────────────────────────────────────────────────
  const dates: string[] = [];
  for (const { re, label } of DATE_PATTERNS) {
    if (re.test(text)) dates.push(label);
  }

  // ── Amounts ───────────────────────────────────────────────────────────────
  const amounts: string[] = [];
  let match: RegExpExecArray | null;
  const amtRe = new RegExp(AMOUNT_PATTERN.source, 'gi');
  while ((match = amtRe.exec(text)) !== null) {
    amounts.push(match[0].trim());
  }

  // ── Original document request ─────────────────────────────────────────────
  const isOriginalRequest = /\b(l['']original|le\s+vrai|vrai\s+document|document\s+original|sans\s+masque|complet)\b/i.test(text);

  // ── Admin action (requires confirmation) ──────────────────────────────────
  const isAdminAction = isOriginalRequest || action === 'delete' ||
    /\b(supprimer|effacer|d[eé]bloquer|admin|force)\b/i.test(text);

  return { clientName, carName, docType, action, dates, amounts, isOriginalRequest, isAdminAction };
}
