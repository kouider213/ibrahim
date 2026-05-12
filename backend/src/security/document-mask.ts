// Masquage de données sensibles pour accès non-admin.
// Règle : toujours retourner une valeur non-vide pour ne pas perdre le contexte.

// ── Passport OCR masking ──────────────────────────────────────────────────────

export function maskPassportOcr(data: Record<string, string>): Record<string, string> {
  return {
    name:            maskName(data['name'] ?? ''),
    passport_number: maskId(data['passport_number'] ?? ''),
    birth_date:      maskDate(data['birth_date'] ?? ''),
    expiry_date:     data['expiry_date'] ?? '',   // expiry not sensitive
    nationality:     data['nationality'] ?? '',   // nationality not sensitive
  };
}

// ── License OCR masking ───────────────────────────────────────────────────────

export function maskLicenseOcr(data: Record<string, string>): Record<string, string> {
  return {
    name:           maskName(data['name'] ?? ''),
    license_number: maskId(data['license_number'] ?? ''),
    birth_date:     maskDate(data['birth_date'] ?? ''),
    expiry_date:    data['expiry_date'] ?? '',
    category:       data['category'] ?? '',
  };
}

// ── Free-text masking (MRZ, addresses, IDs embedded in strings) ───────────────

const SENSITIVE_PATTERNS: Array<{ re: RegExp; replace: string }> = [
  // MRZ lines (2 lines of 44 chars with < separators)
  { re: /[A-Z0-9<]{40,44}/g,                    replace: '[MRZ masqué]' },
  // Passport / ID numbers  (letter + 6-9 digits)
  { re: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,            replace: '***' },
  // Algerian national ID (10-18 digits)
  { re: /\b\d{10,18}\b/g,                        replace: '***' },
  // Birth date — partial mask  DD/MM/YYYY → DD/**/YYYY or DD/MM/**
  { re: /\b(\d{1,2})\/(\d{2})\/(\d{4})\b/g,     replace: '$1/**/$3' },
  // Full address patterns
  { re: /\b\d{1,4}\s+(?:rue|av|avenue|bd|boulevard|allée|impasse)\b.{0,50}/gi, replace: '[adresse masquée]' },
];

export function maskSensitiveText(text: string): string {
  let out = text;
  for (const { re, replace } of SENSITIVE_PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskName(name: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  // Keep first name initial + last name initial: "Ibrahim Kouider" → "I. K***"
  return parts.map((p, i) =>
    i === 0 ? p[0] + '.' : (p[0] ?? '') + '***',
  ).join(' ');
}

function maskId(id: string): string {
  if (!id || id.length < 4) return '***';
  // Show last 3 chars only: "AB1234567" → "***567"
  return '***' + id.slice(-3);
}

function maskDate(date: string): string {
  if (!date) return '';
  // DD/MM/YYYY → DD/**/YYYY  |  YYYY-MM-DD → YYYY-**-DD
  return date
    .replace(/^(\d{1,2})\/\d{2}\/(\d{4})$/, '$1/**/$2')
    .replace(/^(\d{4})-\d{2}-(\d{2})$/, '$1-**-$2')
    .replace(/^(\d{4})$/, '****');         // year-only → keep as-is
}
