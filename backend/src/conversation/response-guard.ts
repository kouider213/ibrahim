// Note: \b does not work after accented chars (é, è, â…) in JS — use explicit char class instead.

// ── Leaked-confirmation guard ─────────────────────────────────────────────────
// Patterns matching an assistant response that starts by echoing an old instruction
// acknowledgement from a previous session.
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

// Patterns indicating the user is giving a NEW instruction — do not strip the confirmation.
const NEW_INSTRUCTION_PATTERNS: RegExp[] = [
  /souviens-toi\b/i,
  /retiens (que|ça|cela|cette)\b/i,
  /apprends (que|ça)\b/i,
  /\br[eè]gle\s*:/i,
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
 * Last-resort safety net — main fix is context-builder.ts history slimming.
 */
export function guardResponse(
  text:        string,
  userMessage: string,
  requestId:   string,
): string {
  if (isNewInstruction(userMessage)) return text;

  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length <= 1) return text;

  const first = (paragraphs[0] ?? '').trim();
  if (!LEAK_PATTERNS.some(p => p.test(first))) return text;

  const rest = paragraphs.slice(1).join('\n\n').trim();
  if (!rest) return text;

  console.log(`[guard:${requestId}] ⚠️ Stripped leaked prefix (${first.length}c): "${first.slice(0, 120)}"`);
  return rest;
}

// ── Scope guard — intent-based video-pollution filter ────────────────────────
// These patterns identify a paragraph that is an OLD video task result injected
// into a non-video response (financial report, daily summary, passport, etc.).
const VIDEO_POLLUTION_PATTERNS: RegExp[] = [
  /^##?\s*🎬/m,
  /^✅\s*vid[eé]o\s+cr[eé][eé]/im,
  /^🎬.{0,60}cr[eé][eé]/im,
  /regarde juste au-dessus/i,
  /regarde l[aà]-?bas.*telegram/i,
  /envoy[eé]e? sur telegram pour validation/i,
  /vid[eé]o.*cr[eé][eé].*telegram/i,
  /^vid[eé]o tiktok\b/im,
];

type ResponseIntent =
  | 'financial_report'
  | 'daily_summary'
  | 'marketing_video'
  | 'passport_analysis'
  | 'general';

function detectResponseIntent(userMessage: string): ResponseIntent {
  if (/rapport (financier|du mois|de la semaine|annuel|hebdo)/i.test(userMessage) ||
      /combien (j'ai )?gagn/i.test(userMessage)) return 'financial_report';
  if (/r[eé]sum[eé] (du jour|de la journ[eé]e|journ[eé]e)/i.test(userMessage)) return 'daily_summary';
  if (/(fais|cr[eé][eé]|g[eé]n[eè]re|lance).*(vid[eé]o|pub|tiktok|clip)/i.test(userMessage)) return 'marketing_video';
  if (/(analyse|lis|ocr).*(passeport|permis|document)/i.test(userMessage)) return 'passport_analysis';
  return 'general';
}

// Which intents must never contain video pollution paragraphs
const SCOPE_FILTER_INTENTS: ResponseIntent[] = [
  'financial_report',
  'daily_summary',
  'passport_analysis',
];

/**
 * Remove paragraphs that contain old video task results from non-video responses.
 * Applied AFTER guardResponse for a two-pass cleanup.
 */
export function applyScopeGuard(
  text:        string,
  userMessage: string,
  requestId:   string,
): string {
  const intent = detectResponseIntent(userMessage);

  if (!SCOPE_FILTER_INTENTS.includes(intent)) return text;

  const paragraphs = text.split(/\n{2,}/);
  const kept: string[] = [];
  let removed = 0;

  for (const para of paragraphs) {
    const isVideoLeak = VIDEO_POLLUTION_PATTERNS.some(p => p.test(para));
    if (isVideoLeak) {
      console.log(`[scope-guard:${requestId}] intent=${intent} removed paragraph: "${para.slice(0, 100)}"`);
      removed++;
    } else {
      kept.push(para);
    }
  }

  if (removed === 0) return text;

  const result = kept.join('\n\n').trim();
  console.log(`[scope-guard:${requestId}] intent=${intent} removed ${removed}/${paragraphs.length} paragraphs`);
  return result || text; // Never return empty
}
