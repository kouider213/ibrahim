// Note: \b does not work after accented chars (é, è, â…) in JS — use explicit char class instead.
import type { ToolExecution } from '../integrations/claude-api.js';

// ── Phantom action guard ──────────────────────────────────────────────────────
// Outils write: leur succès légitime une confirmation d'action
const WRITE_TOOLS = new Set([
  'create_booking', 'update_booking', 'cancel_booking', 'delete_booking',
  'record_payment', 'store_document',
  'github_write_file', 'github_patch_file', 'update_site_file',
  'send_telegram_message', 'send_whatsapp_to_client',
  'create_calendar_event', 'update_calendar_event', 'sync_calendar', 'delete_calendar_event',
  'remember_info', 'learn_rule', 'record_feedback', 'rate_client',
  'netlify_deploy', 'railway_wait_deploy',
  'generate_reservation_voucher', 'generate_receipt',
  'publish_to_socials', 'schedule_reminder',
  'execute_code_task', 'create_new_project',
  'send_nexus_command', 'wake_nexus',
  'create_marketing_video', 'edit_marketing_video', 'generate_ai_video',
  'animate_car_photo', 'create_scenario_video', 'create_video_project',
  'generate_tiktok_video', 'generate_image',
  'merge_videos', 'run_tiktok_research',
  'optimize_image', 'enhance_image', 'remove_background',
  'add_text_overlay', 'add_subtitles', 'add_background_music',
  'cut_video', 'optimize_for_platform',
]);

// Patterns qui indiquent que Claude prétend avoir exécuté une action write
const PHANTOM_ACTION_PATTERNS: RegExp[] = [
  // ✅ + verbe d'action write (début de réponse ou de paragraphe)
  /^\s*✅\s*(corrig[eé]|modifi[eé]|cr[eé][eé]|envoy[eé]|supprim[eé]|annul[eé]|mis\s+[aà]\s+jour|ajout[eé]|publi[eé]|r[eé]par[eé]|g[eé]n[eé]r[eé]|lanc[eé]|ex[eé]cut[eé]|fix[eé]|d[eé]ploy[eé]|push[eé]|commit[eé]|enregistr[eé]|planifi[eé]|programm[eé]|effac[eé])/im,
  // j'ai + verbe write
  /j'ai\s+(corrig[eé]|modifi[eé]|cr[eé][eé]|envoy[eé]|supprim[eé]|annul[eé]|mis\s+[aà]\s+jour|ajout[eé]|publi[eé]|r[eé]par[eé]|g[eé]n[eé]r[eé]|lanc[eé]|ex[eé]cut[eé]|fix[eé]|d[eé]ploy[eé]|push[eé]|commit[eé]|enregistr[eé]|effac[eé])/im,
  // Claims directs sans formule j'ai
  /\b(site\s+mis\s+[aà]\s+jour|r[eé]servation\s+cr[eé][eé]e?|paiement\s+enregistr[eé]|agenda\s+mis\s+[aà]\s+jour|envoy[eé]e?\s+sur\s+telegram|fichier\s+modifi[eé]|code\s+corrig[eé]|bug\s+corrig[eé]|d[eé]ploy[eé]\s+sur\s+railway|vid[eé]o\s+cr[eé][eé]e?|image\s+g[eé]n[eé]r[eé]e?|rappel\s+programm[eé])\b/im,
];

export const PHANTOM_REFUSAL =
  "⚠️ Je n'ai pas exécuté cette action. Aucun outil réel n'a été appelé — je ne peux pas confirmer avoir effectué quoi que ce soit.";

/**
 * Protection bloquante anti-phantom : si la réponse contient une affirmation
 * d'action write SANS qu'un outil write ait réellement été appelé avec succès,
 * retourne le PHANTOM_REFUSAL à la place.
 */
export function phantomGuard(
  text:          string,
  toolsExecuted: ToolExecution[],
  userMessage:   string,
  requestId:     string,
): string {
  // Y a-t-il une affirmation d'action dans la réponse ?
  const hasActionClaim = PHANTOM_ACTION_PATTERNS.some(p => p.test(text));
  if (!hasActionClaim) return text;

  // Y a-t-il au moins un outil write qui a réussi ?
  const hasSuccessfulWriteTool = toolsExecuted.some(t => WRITE_TOOLS.has(t.name) && t.success);
  if (hasSuccessfulWriteTool) return text;

  // ⛔ PHANTOM DÉTECTÉ
  const toolNames = toolsExecuted.map(t => t.name).join(', ') || 'aucun';
  console.log(
    `[phantom-guard:${requestId}] ⛔ PHANTOM BLOQUÉ` +
    ` | tools_called=[${toolNames}]` +
    ` | msg="${userMessage.slice(0, 60)}"` +
    ` | resp_start="${text.slice(0, 80).replace(/\n/g, '↵')}"`,
  );
  console.log(`[execution-trace] {` +
    `"execution_trace_id":"${requestId}",` +
    `"tool_called":${toolsExecuted.length > 0},` +
    `"write_tool_success":false,` +
    `"response_allowed":false,` +
    `"action_claim_detected":true` +
    `}`);
  return PHANTOM_REFUSAL;
}

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
