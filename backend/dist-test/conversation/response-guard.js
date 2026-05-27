"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHANTOM_REFUSAL = void 0;
exports.phantomGuard = phantomGuard;
exports.checkToolRequirements = checkToolRequirements;
exports.earlyToolAvailabilityCheck = earlyToolAvailabilityCheck;
exports.isNewInstruction = isNewInstruction;
exports.guardResponse = guardResponse;
exports.applyScopeGuard = applyScopeGuard;
const env_js_1 = require("../config/env.js");
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
const PHANTOM_ACTION_PATTERNS = [
    // ✅ + verbe d'action write (début de réponse ou de paragraphe)
    /^\s*✅\s*(corrig[eé]|modifi[eé]|cr[eé][eé]|envoy[eé]|supprim[eé]|annul[eé]|mis\s+[aà]\s+jour|ajout[eé]|publi[eé]|r[eé]par[eé]|g[eé]n[eé]r[eé]|lanc[eé]|ex[eé]cut[eé]|fix[eé]|d[eé]ploy[eé]|push[eé]|commit[eé]|enregistr[eé]|planifi[eé]|programm[eé]|effac[eé])/im,
    // j'ai + verbe write
    /j'ai\s+(corrig[eé]|modifi[eé]|cr[eé][eé]|envoy[eé]|supprim[eé]|annul[eé]|mis\s+[aà]\s+jour|ajout[eé]|publi[eé]|r[eé]par[eé]|g[eé]n[eé]r[eé]|lanc[eé]|ex[eé]cut[eé]|fix[eé]|d[eé]ploy[eé]|push[eé]|commit[eé]|enregistr[eé]|effac[eé])/im,
    // Claims directs sans formule j'ai
    /\b(site\s+mis\s+[aà]\s+jour|r[eé]servation\s+cr[eé][eé]e?|paiement\s+enregistr[eé]|agenda\s+mis\s+[aà]\s+jour|envoy[eé]e?\s+sur\s+telegram|fichier\s+modifi[eé]|code\s+corrig[eé]|bug\s+corrig[eé]|d[eé]ploy[eé]\s+sur\s+railway|vid[eé]o\s+cr[eé][eé]e?|image\s+g[eé]n[eé]r[eé]e?|rappel\s+programm[eé])\b/im,
];
exports.PHANTOM_REFUSAL = "⚠️ Je n'ai pas exécuté cette action. Aucun outil réel n'a été appelé — je ne peux pas confirmer avoir effectué quoi que ce soit.";
/**
 * Protection bloquante anti-phantom : si la réponse contient une affirmation
 * d'action write SANS qu'un outil write ait réellement été appelé avec succès,
 * retourne le PHANTOM_REFUSAL à la place.
 */
function phantomGuard(text, toolsExecuted, userMessage, requestId) {
    // Y a-t-il une affirmation d'action dans la réponse ?
    const hasActionClaim = PHANTOM_ACTION_PATTERNS.some(p => p.test(text));
    if (!hasActionClaim)
        return text;
    // Y a-t-il au moins un outil write qui a réussi ?
    const hasSuccessfulWriteTool = toolsExecuted.some(t => WRITE_TOOLS.has(t.name) && t.success);
    if (hasSuccessfulWriteTool)
        return text;
    // ⛔ PHANTOM DÉTECTÉ
    const toolNames = toolsExecuted.map(t => t.name).join(', ') || 'aucun';
    console.log(`[phantom-guard:${requestId}] ⛔ PHANTOM BLOQUÉ` +
        ` | tools_called=[${toolNames}]` +
        ` | msg="${userMessage.slice(0, 60)}"` +
        ` | resp_start="${text.slice(0, 80).replace(/\n/g, '↵')}"`);
    console.log(`[execution-trace] {` +
        `"execution_trace_id":"${requestId}",` +
        `"tool_called":${toolsExecuted.length > 0},` +
        `"write_tool_success":false,` +
        `"response_allowed":false,` +
        `"action_claim_detected":true` +
        `}`);
    return exports.PHANTOM_REFUSAL;
}
const TOOL_REQUIREMENTS = [
    {
        trigger: /(analyse|voir|montre|stats?|rapport|performance|compte).*(tiktok)/i,
        tool: 'run_tiktok_research',
        available: () => Boolean(env_js_1.env.APIFY_API_KEY),
        unavailableMsg: '⚠️ *Analyse TikTok indisponible* — aucune clé API Apify configurée.\n' +
            'Je ne peux pas accéder aux données réelles. Configure `APIFY_API_KEY` dans Railway pour activer cette fonctionnalité.',
        missingMsg: '⚠️ *Données TikTok non récupérées* — l\'outil `run_tiktok_research` n\'a pas été appelé ou a échoué.\n' +
            'Je ne génère pas de statistiques inventées.',
    },
    {
        trigger: /(tiktok).*(analyse|stats?|compte|profil|vues|followers|abonné)/i,
        tool: 'run_tiktok_research',
        available: () => Boolean(env_js_1.env.APIFY_API_KEY),
        unavailableMsg: '⚠️ *TikTok API indisponible* — clé Apify absente. Aucune donnée réelle disponible.',
        missingMsg: '⚠️ *Analyse TikTok sans données réelles* — l\'outil de scraping n\'a pas tourné.',
    },
];
/**
 * Check if the user's message requires a specific tool.
 * Returns a blocking message if the tool is unavailable or didn't succeed,
 * or null if the request is fine to proceed.
 *
 * Call BEFORE sending the message to Claude.
 */
function checkToolRequirements(userMessage, toolsExecuted, requestId) {
    for (const req of TOOL_REQUIREMENTS) {
        if (!req.trigger.test(userMessage))
            continue;
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
            if (req.available && req.available())
                return null; // tool available — let Claude decide
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
function earlyToolAvailabilityCheck(userMessage, requestId) {
    for (const req of TOOL_REQUIREMENTS) {
        if (!req.trigger.test(userMessage))
            continue;
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
const LEAK_PATTERNS = [
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
const NEW_INSTRUCTION_PATTERNS = [
    /souviens-toi\b/i,
    /retiens (que|ça|cela|cette)\b/i,
    /apprends (que|ça)\b/i,
    /\br[eè]gle\s*:/i,
    /dorénavant\b/i,
    /à partir de maintenant\b/i,
    /ne\s+(plus\s+)?(?:jamais|pas)\s+\w{3}/i,
    /ne\s+doit\s+(plus\s+)?(?:jamais|pas)\b/i,
];
function isNewInstruction(userMessage) {
    return NEW_INSTRUCTION_PATTERNS.some(p => p.test(userMessage));
}
/**
 * Strip a leaked confirmation prefix from a Claude response.
 * Last-resort safety net — main fix is context-builder.ts history slimming.
 */
function guardResponse(text, userMessage, requestId) {
    if (isNewInstruction(userMessage))
        return text;
    const paragraphs = text.split(/\n{2,}/);
    if (paragraphs.length <= 1)
        return text;
    const first = (paragraphs[0] ?? '').trim();
    if (!LEAK_PATTERNS.some(p => p.test(first)))
        return text;
    const rest = paragraphs.slice(1).join('\n\n').trim();
    if (!rest)
        return text;
    console.log(`[guard:${requestId}] ⚠️ Stripped leaked prefix (${first.length}c): "${first.slice(0, 120)}"`);
    return rest;
}
// ── Scope guard — intent-based video-pollution filter ────────────────────────
// These patterns identify a paragraph that is an OLD video task result injected
// into a non-video response (financial report, daily summary, passport, etc.).
const VIDEO_POLLUTION_PATTERNS = [
    /^##?\s*🎬/m,
    /^✅\s*vid[eé]o\s+cr[eé][eé]/im,
    /^🎬.{0,60}cr[eé][eé]/im,
    /regarde juste au-dessus/i,
    /regarde l[aà]-?bas.*telegram/i,
    /envoy[eé]e? sur telegram pour validation/i,
    /vid[eé]o.*cr[eé][eé].*telegram/i,
    /^vid[eé]o tiktok\b/im,
];
function detectResponseIntent(userMessage) {
    if (/rapport (financier|du mois|de la semaine|annuel|hebdo)/i.test(userMessage) ||
        /combien (j'ai )?gagn/i.test(userMessage))
        return 'financial_report';
    if (/r[eé]sum[eé] (du jour|de la journ[eé]e|journ[eé]e)/i.test(userMessage))
        return 'daily_summary';
    if (/(fais|cr[eé][eé]|g[eé]n[eè]re|lance).*(vid[eé]o|pub|tiktok|clip)/i.test(userMessage))
        return 'marketing_video';
    if (/(analyse|lis|ocr).*(passeport|permis|document)/i.test(userMessage))
        return 'passport_analysis';
    return 'general';
}
// Which intents must never contain video pollution paragraphs
const SCOPE_FILTER_INTENTS = [
    'financial_report',
    'daily_summary',
    'passport_analysis',
];
/**
 * Remove paragraphs that contain old video task results from non-video responses.
 * Applied AFTER guardResponse for a two-pass cleanup.
 */
function applyScopeGuard(text, userMessage, requestId) {
    const intent = detectResponseIntent(userMessage);
    if (!SCOPE_FILTER_INTENTS.includes(intent))
        return text;
    const paragraphs = text.split(/\n{2,}/);
    const kept = [];
    let removed = 0;
    for (const para of paragraphs) {
        const isVideoLeak = VIDEO_POLLUTION_PATTERNS.some(p => p.test(para));
        if (isVideoLeak) {
            console.log(`[scope-guard:${requestId}] intent=${intent} removed paragraph: "${para.slice(0, 100)}"`);
            removed++;
        }
        else {
            kept.push(para);
        }
    }
    if (removed === 0)
        return text;
    const result = kept.join('\n\n').trim();
    console.log(`[scope-guard:${requestId}] intent=${intent} removed ${removed}/${paragraphs.length} paragraphs`);
    return result || text; // Never return empty
}
//# sourceMappingURL=response-guard.js.map