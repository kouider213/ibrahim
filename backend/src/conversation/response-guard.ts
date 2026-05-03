// Patterns matching a Claude response that starts by echoing an old instruction acknowledgement.
// These are "leaked confirmations" — Claude repeating what it said in a previous session
// before answering the actual current request.
// Note: \b does not work after accented chars (é, è, â…) in JS — use explicit delimiters instead.
const LEAK_PATTERNS: RegExp[] = [
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

// Patterns indicating the user is giving a NEW instruction right now.
// In that case the confirmation IS the correct reply — do not strip it.
const NEW_INSTRUCTION_PATTERNS: RegExp[] = [
  /souviens-toi\b/i,
  /retiens (que|ça|cela|cette)\b/i,
  /apprends (que|ça)\b/i,
  /\brègle\s*:/i,
  /dorénavant\b/i,
  /à partir de maintenant\b/i,
  /ne\s+(plus\s+)?(?:jamais|pas)\s+\w{3}/i,
  /ne\s+doit\s+(plus\s+)?(?:jamais|pas)\b/i,
];

export function isNewInstruction(userMessage: string): boolean {
  return NEW_INSTRUCTION_PATTERNS.some(p => p.test(userMessage));
}

/**
 * Strip a leaked confirmation prefix from a Claude response.
 *
 * When old conversation history contains an assistant confirmation like
 * "Compris parfaitement ! Les messages ne s'envoient PAS automatiquement...",
 * Claude sometimes starts its NEW response with that exact text before answering
 * the current request.  This guard detects and removes that prefix.
 *
 * It is a last-resort safety net — the main fixes are the system-prompt rule and
 * the history slimming in context-builder.ts.
 */
export function guardResponse(
  text:        string,
  userMessage: string,
  requestId:   string,
): string {
  // Never strip when the user is actively giving a new rule/instruction
  if (isNewInstruction(userMessage)) return text;

  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length <= 1) return text;

  const first = (paragraphs[0] ?? '').trim();
  if (!LEAK_PATTERNS.some(p => p.test(first))) return text;

  const rest = paragraphs.slice(1).join('\n\n').trim();
  if (!rest) return text; // Don't return empty string

  console.log(`[guard:${requestId}] ⚠️ Stripped leaked prefix (${first.length}c): "${first.slice(0, 120)}"`);
  return rest;
}
