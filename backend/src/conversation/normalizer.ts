/**
 * Message Normalizer — Conversation Engine V2
 * Normalize + fuzzy-correct user messages before intent detection.
 * No external deps — pure string logic.
 */

// ── Typo corrections (French / Darija / Business) ────────────────────────────

const TYPO_MAP: Record<string, string> = {
  // Documents
  'paseport':       'passeport',
  'pasport':        'passeport',
  'passaport':      'passeport',
  'passepoort':     'passeport',
  'passeprt':       'passeport',
  'permi':          'permis',
  'permit':         'permis',
  'permiss':        'permis',
  'permist':        'permis',
  // Réservation
  'réseravtion':    'réservation',
  'reservation':    'réservation',
  'resrvation':     'réservation',
  'reservaton':     'réservation',
  'réservaton':     'réservation',
  'resarvation':    'réservation',
  'resa':           'réservation',
  'reza':           'réservation',
  // Disponibilité
  'dispo':          'disponible',
  'disponibl':      'disponible',
  'disponiblee':    'disponible',
  // Voitures
  'beringo':        'berlingo',
  'brlingo':        'berlingo',
  'jougger':        'jogger',
  'jogger':         'jogger',
  'sandaro':        'sandero',
  'sanderos':       'sandero',
  'creeta':         'creta',
  'duster':         'duster',
  'jumpee':         'jumpy',
  'jumpyy':         'jumpy',
  // Paiement
  'payement':       'paiement',
  'paiment':        'paiement',
  'peyement':       'paiement',
  // Client
  'cleint':         'client',
  'clinet':         'client',
  // Envoyer
  'envoi':          'envoie',
  'envoyer':        'envoie',
  'envois':         'envoie',
  // Ouvrir
  'ouvrir':         'ouvre',
  'ouvres':         'ouvre',
  // Lancer
  'lancer':         'lance',
  'lances':         'lance',
  // WhatsApp
  'whatsap':        'whatsapp',
  'watsapp':        'whatsapp',
  'wattsapp':       'whatsapp',
};

// ── Synonym expansion ─────────────────────────────────────────────────────────

const SYNONYM_MAP: Record<string, string> = {
  // Document aliases
  "papier":         "document",
  "papiers":        "documents",
  "pièce":          "document",
  "pièces":         "documents",
  "doc":            "document",
  "docs":           "documents",
  "carte":          "document",
  "id":             "identité",
  // Action aliases
  "montre":         "affiche",
  "montre-moi":     "affiche",
  "vas-y":          "confirme",
  "go":             "confirme",
  "fais":           "exécute",
  "balance":        "envoie",
  "file":           "envoie",
  "mets":           "ouvre",
  "ouvre-le":       "ouvre",
  "lance-le":       "lance",
  // Rapport aliases
  "chiffres":       "rapport financier",
  "bilan":          "rapport financier",
  "stats":          "statistiques",
  // Disponibilité
  "libre":          "disponible",
  "occupée":        "indisponible",
  "prise":          "indisponible",
};

// ── Short-message expansion ───────────────────────────────────────────────────
// Maps ultra-short messages to clearer intent when no pending action exists

const SHORT_EXPAND: Record<string, string> = {
  'oui':        'oui, confirme',
  'non':        'non, annule',
  'ok':         'ok, continue',
  'oki':        'ok, continue',
  'd\'accord':  'ok, confirme',
  'yep':        'oui, confirme',
  'yup':        'oui, confirme',
  'nan':        'non, annule',
  'nope':       'non, annule',
  'envoie':     'envoie le document',
  'envoyer':    'envoie le document',
  'affiche':    'affiche le résultat',
  'montre':     'affiche le résultat',
  'le vrai':    'envoie l\'original',
  'l\'original':'envoie l\'original',
  'l\'original doc': 'envoie le document original',
};

// ── Normalizer pipeline ───────────────────────────────────────────────────────

export interface NormalizedMessage {
  original:  string;
  normalized: string;
  corrections: string[];
  isShort:   boolean;
}

export function normalizeMessage(raw: string): NormalizedMessage {
  const original = raw;
  let text = raw.trim();
  const corrections: string[] = [];

  // 1. Normalize whitespace
  text = text.replace(/\s+/g, ' ');

  // 2. Detect short message
  const isShort = text.split(/\s+/).length <= 3;

  // 3. Typo correction (word by word)
  const words = text.split(/\s+/);
  const fixedWords = words.map(word => {
    const lower = word.toLowerCase().replace(/[.,!?;:]+$/, '');
    if (TYPO_MAP[lower]) {
      corrections.push(`${lower} → ${TYPO_MAP[lower]}`);
      return word.replace(lower, TYPO_MAP[lower]);
    }
    return word;
  });
  text = fixedWords.join(' ');

  // 4. Synonym expansion (phrase-level, longest match first)
  const synonymEntries = Object.entries(SYNONYM_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of synonymEntries) {
    const re = new RegExp(`\\b${escapeRegex(from)}\\b`, 'gi');
    if (re.test(text)) {
      text = text.replace(re, to);
      corrections.push(`${from} → ${to}`);
    }
  }

  // 5. Short-message expansion (exact match)
  const lowerText = text.toLowerCase().trim();
  if (isShort && SHORT_EXPAND[lowerText]) {
    corrections.push(`[short] "${lowerText}" → "${SHORT_EXPAND[lowerText]}"`);
    text = SHORT_EXPAND[lowerText];
  }

  return { original, normalized: text, corrections, isShort };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
