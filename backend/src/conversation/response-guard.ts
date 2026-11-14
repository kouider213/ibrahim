// Note: \b does not work after accented chars (é, è, â…) in JS — use explicit char class instead.
import type { ToolExecution } from '../integrations/claude-api.js';
import { env } from '../config/env.js';

// ── Phantom action guard ──────────────────────────────────────────────────────
// Outils write: leur succès légitime une confirmation d'action
const WRITE_TOOLS = new Set([
  'create_booking', 'update_booking', 'cancel_booking', 'delete_booking',
  'record_payment', 'store_document', 'record_expense', 'delete_expense', 'record_car_km', 'update_vehicle_maintenance', 'set_car_papers',
  'github_write_file', 'github_patch_file', 'update_site_file',
  'send_telegram_message', 'send_whatsapp_to_client', 'send_email', 'whatsapp_web',
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

// Outils qui envoient / créent quelque chose (leur succès suffit à confirmer l'action)
const ACTION_TOOLS = new Set([
  'send_doc_pdf', 'create_presentation_doc', 'create_google_doc', 'create_google_sheet', 'export_excel',
  'get_car_photo', 'send_photos', 'get_client_document', 'partners', 'family_care', 'papa_time', 'forme', 'update_car', 'add_car', 'delete_car', 'business_mentor', 'kouider_dossier',
  // Jarvis : outils qui lancent un vrai travail (escouade, atelier…) et répondent « 🏭 … lancée » (30/10 : usine_business bloqué à tort)
  'site_admin', 'usine_business', 'atelier', 'se_coder', 'chasseur_voitures', 'commercial', 'radar_concurrence', 'auto_amelioration', 'autonomie', 'liberte', 'vitalite', 'vie', 'grand_coach', 'sport_coach', 'esprit',
]);

// Patterns qui indiquent que Claude prétend avoir exécuté une action write
const PHANTOM_ACTION_PATTERNS: RegExp[] = [
  // 13/11 : 11/11 18h07 « C'est fait, le message a été envoyé au client. ✅ » alors que whatsapp_web n'avait fait qu'une relecture
  /^\s*(✅\s*)?c.est\s+(fait|parti|envoy[ée])\b/im,
  /\b(a|ont|est|sont)\s+(bien\s+)?(été\s+)?(envoy[ée]e?s?|parti?e?s?)\s+(au|à|a|aux|chez|sur|par)\s/im,
  /\b(message|mail|e-?mail|whatsapp|vocal|sms|photo|pdf|devis|contrat|facture)\s+(est\s+|a\s+été\s+)?(bien\s+)?(parti|envoy[ée])/im,
  // ✅ + verbe d'action write (début de réponse ou de paragraphe)
  /^\s*✅\s*(corrig[eé]|modifi[eé]|cr[eé][eé]|envoy[eé]|supprim[eé]|annul[eé]|mis\s+[aà]\s+jour|ajout[eé]|publi[eé]|r[eé]par[eé]|g[eé]n[eé]r[eé]|lanc[eé]|ex[eé]cut[eé]|fix[eé]|d[eé]ploy[eé]|push[eé]|commit[eé]|enregistr[eé]|planifi[eé]|programm[eé]|effac[eé])/im,
  // j'ai + verbe write
  /j'ai\s+(corrig[eé]|modifi[eé]|cr[eé][eé]|envoy[eé]|supprim[eé]|annul[eé]|mis\s+[aà]\s+jour|ajout[eé]|publi[eé]|r[eé]par[eé]|g[eé]n[eé]r[eé]|lanc[eé]|ex[eé]cut[eé]|fix[eé]|d[eé]ploy[eé]|push[eé]|commit[eé]|enregistr[eé]|effac[eé])/im,
  // Claims directs sans formule j'ai
  // 03/11 argent : « ✅ **Cash +400 €** enregistré » (gras entre ✅ et le verbe) / « c'est noté, 2 600 € en cash » sans rien écrire
  /✅[^\n]{0,60}(cash|caisse|liquide|[ée]pargne|vente|€)[^\n]{0,40}(enregistr[eé]|not[eé]|mis\s+[aà]\s+jour|ajout[eé])/im,
  /c.est\s+not[eé][^\n]{0,60}(cash|caisse|liquide|[ée]pargne|€)/im,
  // 07/11 Djillali : « c'est noté, il rend le 10 à 6h, jour offert » sans update_booking → la résa restait au 9
  /(c.est\s+not[eé]|je\s+(l.)?ai\s+not[eé]|^\s*✅?\s*not[eé](?![a-z])|bien\s+not[eé])[^\n]{0,120}(rend|retour|ram[eè]ne|prolong|offert|gratuit|r[ée]sa|r[ée]servation|location|d[ée]cal)/im,
  /\b(location|r[ée]servation|r[ée]sa)\s+(bien\s+)?(prolong[ée]e?|d[ée]cal[ée]e?|modifi[ée]e?)\b|\bjour\s+offert\s+(not[ée]|enregistr[ée]|ajout[ée])\b/im,
  // 14/11 : « 2 marquée lu » → « Noté. ✅ Les 2 sont marqués lus. » sans aucun outil
  /(✅|\bsont|\best|\bj.ai|\bont\s+été|\ba\s+été)[^\n]{0,40}\b(marqu[ée]e?s?\s+(comme\s+)?(non[\s-])?lue?s?|archiv[ée]e?s?)\b/im,
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
  // 09/11 : sport_coach ❌ puis « C'est fait ! » (agenda jamais changé) : le dernier outil a échoué → on dit la vérité
  const lastTool = toolsExecuted.at(-1);
  if (lastTool && (!lastTool.success || /^\s*❌/.test(lastTool.result ?? '')) && /^\s*(✅|c.est\s+(fait|bon|ok)\b|voil[aà]\b|termin[eé]\b|parfait\b)/i.test(text)) {
    return `⚠️ Ça n'a pas marché, rien n'a changé. ${(lastTool.result ?? '').replace(/^\s*❌\s*/, '').slice(0, 300)}`.trim();
  }
  // 10/11 19h59 : update_agenda_event ❌ puis 3 lectures ✅ → « C'est fait » ; l'agenda n'avait pas bougé (redit 4 fois).
  // Une écriture d'agenda ratée et jamais réussie ensuite = on ne dit pas « fait » sans le dire.
  const AGENDA_W = /^(create|update|delete)_agenda_event$/;
  const lastAgendaW = [...toolsExecuted].reverse().find(t => AGENDA_W.test(t.name));
  if (lastAgendaW && (!lastAgendaW.success || /^\s*❌/.test(lastAgendaW.result ?? ''))
    && /c.est\s+(fait|bon|corrig)|✅|d[ée]plac[ée]|mis\s+[àa]\s+jour|enlev[ée]|retir[ée]|ajout[ée]|modifi[ée]/i.test(text)) {
    return `${text.trim()}\n\n⚠️ Attention : la modification dans l'agenda FIK n'a PAS marché (${(lastAgendaW.result ?? 'erreur').replace(/^\s*❌\s*/, '').slice(0, 160)}). Vérifie dans l'agenda ou redis-le-moi.`;
  }
  // Y a-t-il une affirmation d'action dans la réponse ?
  const hasActionClaim = PHANTOM_ACTION_PATTERNS.some(p => p.test(text));
  if (!hasActionClaim) return text;

  // Y a-t-il au moins un outil write qui a réussi ?
  // whatsapp_web : seul un vrai envoi (« ✅ Envoyé… ») compte, pas une lecture ni une relecture
  // + tout outil qui a VRAIMENT agi et le dit (« ✅ … », « 📄 … ») : sans ça, un PDF/une photo réellement envoyés
  // étaient pris pour une invention → relance → Dzaryx refaisait les actions des messages précédents (doublons, 18/10).
  const hasSuccessfulWriteTool = toolsExecuted.some(t => t.success && (
    (WRITE_TOOLS.has(t.name) && (t.name !== 'whatsapp_web' || /^\s*✅ Envoyé/.test(t.result ?? '')))
    || ACTION_TOOLS.has(t.name)
    || /^\s*(✅|📄|🗑️|⏳ Dossier)/.test(t.result ?? '')));
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

// ── Tool-required guard ───────────────────────────────────────────────────────
// Certain user requests REQUIRE a specific real tool to have succeeded.
// If the tool didn't run successfully, block any response that claims data or results.

interface ToolRequirement {
  /** Regex matching user messages that trigger this requirement */
  trigger:    RegExp;
  /** The tool name that must have succeeded */
  tool:       string;
  /** Check whether the tool is even available (key configured, etc.) */
  available?: () => boolean;
  /** Message returned when tool is unavailable */
  unavailableMsg: string;
  /** Message returned when tool is available but didn't run/succeed */
  missingMsg: string;
}

const TOOL_REQUIREMENTS: ToolRequirement[] = [
  {
    trigger:      /(analyse|voir|montre|stats?|rapport|performance|compte).*(tiktok)/i,
    tool:         'run_tiktok_research',
    available:    () => Boolean(env.APIFY_API_KEY),
    unavailableMsg:
      '⚠️ *Analyse TikTok indisponible* — aucune clé API Apify configurée.\n' +
      'Je ne peux pas accéder aux données réelles. Configure `APIFY_API_KEY` dans Railway pour activer cette fonctionnalité.',
    missingMsg:
      '⚠️ *Données TikTok non récupérées* — l\'outil `run_tiktok_research` n\'a pas été appelé ou a échoué.\n' +
      'Je ne génère pas de statistiques inventées.',
  },
  {
    trigger:      /(tiktok).*(analyse|stats?|compte|profil|vues|followers|abonné)/i,
    tool:         'run_tiktok_research',
    available:    () => Boolean(env.APIFY_API_KEY),
    unavailableMsg:
      '⚠️ *TikTok API indisponible* — clé Apify absente. Aucune donnée réelle disponible.',
    missingMsg:
      '⚠️ *Analyse TikTok sans données réelles* — l\'outil de scraping n\'a pas tourné.',
  },
];

/**
 * Check if the user's message requires a specific tool.
 * Returns a blocking message if the tool is unavailable or didn't succeed,
 * or null if the request is fine to proceed.
 *
 * Call BEFORE sending the message to Claude.
 */
export function checkToolRequirements(
  userMessage:   string,
  toolsExecuted: ToolExecution[],
  requestId:     string,
): string | null {
  for (const req of TOOL_REQUIREMENTS) {
    if (!req.trigger.test(userMessage)) continue;

    // Tool available at all?
    if (req.available && !req.available()) {
      console.log(`[tool-required:${requestId}] tool=${req.tool} unavailable (API key missing)`);
      return req.unavailableMsg;
    }

    // Tool ran and succeeded?
    const ranOk = toolsExecuted.some(t => t.name === req.tool && t.success);
    if (!ranOk) {
      // Only block if we're POST-response — if called pre-response, return null to allow Claude to call the tool.
      // Callers use this for PRE-response checks (return the unavailable message right away).
      // For POST-response phantom check, phantomGuard handles it.
      if (req.available && req.available()) return null; // tool available — let Claude decide
      return req.missingMsg;
    }
  }
  return null;
}

/**
 * Early-exit check for requests that require unavailable tools.
 * Returns a refusal string if the required API key is missing, null otherwise.
 * Call BEFORE invoking Claude.
 */
export function earlyToolAvailabilityCheck(userMessage: string, requestId: string): string | null {
  for (const req of TOOL_REQUIREMENTS) {
    if (!req.trigger.test(userMessage)) continue;
    if (req.available && !req.available()) {
      console.log(`[tool-available:${requestId}] BLOCKED tool=${req.tool} msg="${userMessage.slice(0, 60)}"`);
      return req.unavailableMsg;
    }
  }
  return null;
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

// 14/11 : bilan « semaine ratée » → « marche rapide 10 min pendant tes pauses boulot, étirements au bureau ».
// Au travail Kouider n'a AUCUNE pause (WORK_FACT) : le cerveau l'oublie parfois → le CODE retire la phrase/la puce.
const WORK_BREAK_RE = /(pendant\s+(tes|ta|les|une)\s+pauses?|[àa]\s+(la|ta)\s+pause|pauses?\s+(boulot|au\s+(travail|boulot|taf)|d[ée]j(eu|eû)ner|de\s+midi|caf[ée])|au\s+bureau|[àa]\s+midi\s+au\s+(travail|boulot)|sur\s+ton\s+lieu\s+de\s+travail)/i;
const WORK_BREAK_SAFE = /s[ée]ries?|r[ée]cup|entre\s+(deux|les)\s+(s[ée]ries|exercices)|aucune\s+pause|pas\s+de\s+pause/i;
export function stripWorkBreak(text: string): string {
  if (!text || !WORK_BREAK_RE.test(text)) return text;
  const lines = text.split('\n').flatMap(line => {
    if (!WORK_BREAK_RE.test(line)) return [line];
    if (/^\s*([-•*·]|\d+[.)])\s/.test(line)) return WORK_BREAK_SAFE.test(line) ? [line] : [];   // puce entière
    const kept = line.split(/(?<=[.!?])\s+/).filter(s => !WORK_BREAK_RE.test(s) || WORK_BREAK_SAFE.test(s)).join(' ');
    return kept.trim() ? [kept] : [];
  });
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (out !== text.trim()) console.log('[work-break-guard] phrase « pause au travail » retirée');
  return out || text;
}
