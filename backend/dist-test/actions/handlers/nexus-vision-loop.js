"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVisionContext = getVisionContext;
exports.getLoopStatus = getLoopStatus;
exports.listLoops = listLoops;
exports.triggerEmergencyStop = triggerEmergencyStop;
exports.clearEmergencyStop = clearEmergencyStop;
exports.isEmergencyStopped = isEmergencyStopped;
exports.performLocalOcr = performLocalOcr;
exports.analyzeScreen = analyzeScreen;
exports.runVisionLoop = runVisionLoop;
exports.startVisionLoop = startVisionLoop;
/**
 * Nexus Vision Loop — Autonomous screen control with persistent learning.
 * Flow: pre-OCR context → screenshot → AI vision → execute → verify → loop
 * Memory: saves tasks, steps, workflows, provider stats to Supabase.
 */
const nexus_relay_js_1 = require("./nexus-relay.js");
const nexus_command_registry_js_1 = require("./nexus-command-registry.js");
const llm_router_js_1 = require("../../integrations/llm-router.js");
const nexus_memory_js_1 = require("./nexus-memory.js");
const env_js_1 = require("../../config/env.js");
// ── Singleton context ─────────────────────────────────────────────────────────
const _ctx = {
    pcId: 'default',
    objective: null,
    lastScreenshot: null,
    lastAnalysis: null,
    lastAnalysisError: null,
    lastRawResponse: null,
    lastOcrText: null,
    lastActionType: null,
    lastProvider: null,
    actionHistory: [],
    updatedAt: null,
};
function getVisionContext() {
    return { ..._ctx, lastScreenshot: _ctx.lastScreenshot ? '[captured]' : null };
}
const _loopStore = new Map();
function getLoopStatus(taskId) { return _loopStore.get(taskId) ?? null; }
function listLoops() {
    return [..._loopStore.entries()].map(([taskId, e]) => ({ taskId, ...e }));
}
// ── Safety ────────────────────────────────────────────────────────────────────
let _emergencyStop = false;
function triggerEmergencyStop() { _emergencyStop = true; console.warn('[NEXUS_VISION] EMERGENCY_STOP'); }
function clearEmergencyStop() { _emergencyStop = false; console.log('[NEXUS_VISION] emergency_stop cleared'); }
function isEmergencyStopped() { return _emergencyStop; }
const MAX_ACTIONS_PER_MIN = 10;
const MAX_AUTONOMOUS_STEPS = 5;
const MAX_CONSECUTIVE_ERRORS = 3;
const MAX_SAME_ACTION = 3;
const MAX_SAME_SCREENSHOT = 3;
const MIN_CONFIDENCE_BASE = 0.35;
const MIN_CONFIDENCE_RISKY = 0.60;
// Actions requiring high confidence before execution
const RISKY_ACTIONS = new Set(['TERMINAL_COMMAND_SAFE', 'OPEN_FOLDER', 'REGISTRY_EDIT']);
// Actions that must never execute — hard block regardless of AI
const FORBIDDEN_ACTIONS = new Set([
    'SHUTDOWN', 'RESTART', 'FORMAT', 'DELETE', 'KILL_PROCESS',
    'REGISTRY_EDIT', 'ADMIN_CMD', 'DISABLE_ANTIVIRUS',
    'SYSTEM32', 'POWERSHELL_ADMIN',
]);
const _actionTs = [];
function _checkRate() {
    const now = Date.now();
    while (_actionTs.length && now - _actionTs[0] > 60_000)
        _actionTs.shift();
    if (_actionTs.length >= MAX_ACTIONS_PER_MIN)
        return false;
    _actionTs.push(now);
    return true;
}
// Fast djb2 fingerprint for screenshot dedup
function _hashScreen(b64) {
    let h = 5381;
    const s = b64.slice(0, 5000);
    for (let i = 0; i < s.length; i++)
        h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).padStart(8, '0');
}
// ── Telegram ──────────────────────────────────────────────────────────────────
async function _notify(text) {
    const t = env_js_1.env.TELEGRAM_BOT_TOKEN, c = env_js_1.env.TELEGRAM_CHAT_ID;
    if (!t || !c)
        return;
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        await axios.post(`https://api.telegram.org/bot${t}/sendMessage`, { chat_id: c, text, parse_mode: 'Markdown' }, { timeout: 8_000 });
    }
    catch { /* non-critical */ }
}
async function _sendFinalSummary(result, screenshots, provider, actionLog) {
    const e = result.status === 'completed' ? '✅' : result.status === 'stopped' ? '🛑' : '⚠️';
    const dur = (result.durationMs / 1000).toFixed(1);
    const actions = actionLog.length > 0 ? actionLog.slice(-8).join(' → ') : 'aucune';
    await _notify([
        `${e} *Vision — Rapport Final*`,
        `*Objectif:* ${result.objective.slice(0, 80)}`,
        `*Statut:* \`${result.status}\``,
        `*Étapes:* ${result.steps} | *Screenshots:* ${screenshots}`,
        `*Provider:* ${provider} | *Durée:* ${dur}s`,
        `*Actions:* ${actions.slice(0, 200)}`,
        result.error ? `*Erreur:* ${result.error.slice(0, 120)}` : '',
    ].filter(Boolean).join('\n'));
}
// ── OCR / Context Awareness ───────────────────────────────────────────────────
async function performLocalOcr(timeoutMs = 15_000) {
    const cmd = `powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -ExpandProperty MainWindowTitle | Sort-Object -Unique"`;
    console.log('[NEXUS_OCR] local_ocr window_titles');
    try {
        const r = await (0, nexus_relay_js_1.nexusRunCommand)(cmd, undefined, timeoutMs);
        const windows = r.stdout.split('\n').map(l => l.trim()).filter(Boolean);
        console.log(`[NEXUS_OCR] ${windows.length} window_titles ok=${r.ok}`);
        // Record known UI patterns in memory (fire and forget)
        for (const w of windows) {
            const app = w.split(' - ').pop() ?? w;
            void (0, nexus_memory_js_1.rememberUiPattern)(w, app.slice(0, 40));
        }
        return { ok: r.ok, windows, text: windows.join('\n') };
    }
    catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[NEXUS_OCR] failed: ${error}`);
        return { ok: false, windows: [], text: '', error };
    }
}
// Internet connectivity check via PC ping
async function _checkInternet() {
    try {
        const r = await (0, nexus_relay_js_1.nexusRunCommand)('ping -n 1 -w 2000 8.8.8.8', undefined, 8_000);
        return r.ok && (r.stdout.includes('TTL=') || r.stdout.includes('ttl='));
    }
    catch {
        return false;
    }
}
// Build context hint from current window state
async function _buildContextHint() {
    try {
        const ocr = await performLocalOcr(12_000);
        if (!ocr.ok || ocr.windows.length === 0)
            return { hint: '', openApps: [] };
        const openApps = [];
        if (ocr.windows.some(w => /chrome|google/i.test(w)))
            openApps.push('Chrome');
        if (ocr.windows.some(w => /visual studio code|vs code/i.test(w)))
            openApps.push('VS Code');
        if (ocr.windows.some(w => /github/i.test(w)))
            openApps.push('GitHub');
        if (ocr.windows.some(w => /not responding/i.test(w)))
            openApps.push('APP_BLOQUÉE');
        const hint = `FENÊTRES OUVERTES: ${ocr.windows.slice(0, 8).join(', ')}`;
        return { hint, openApps };
    }
    catch {
        return { hint: '', openApps: [] };
    }
}
// ── Screen Analysis ───────────────────────────────────────────────────────────
const VISION_EXTRA = `RÔLE: Tu es le cerveau de contrôle PC de Dzaryx. Tu analyses des captures d'écran Windows.
RÈGLE: Réponds UNIQUEMENT en JSON valide — aucun texte avant ou après.
ACTIONS: SCREENSHOT_DESKTOP, LIST_DESKTOP_FILES, OPEN_FOLDER, OPEN_URL (payload:{url}), OPEN_CHROME, OPEN_VSCODE, FOCUS_APP (payload:{app:"vscode"|"chrome"|"telegram"}), SYSTEM_INFO, TERMINAL_COMMAND_SAFE (payload:{command}), WAIT (payload:{ms:2000}), LOCAL_OCR, DONE.
DONE = objectif atteint. WAIT = attendre chargement.
RÈGLES APP:
- Après OPEN_VSCODE/OPEN_CHROME: l'app se lance ET se met en premier plan automatiquement.
- Si app non visible dans screenshot mais CONTEXTE dit qu'elle est ouverte → utilise FOCUS_APP pour la ramener.
- Ne jamais relancer une app déjà ouverte. Vérifier via LOCAL_OCR d'abord.`;
function _parseDecision(raw) {
    const m = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? raw.match(/(\{[\s\S]+\})/s);
    if (!m)
        return null;
    try {
        return JSON.parse((m[1] ?? m[2] ?? '').trim());
    }
    catch {
        return null;
    }
}
// Normalize base64: strip data URI prefix, detect MIME, strip whitespace (Python encodebytes \n)
function _normalizeB64(raw) {
    let data = raw;
    let mime = 'image/jpeg';
    if (raw.startsWith('data:')) {
        const comma = raw.indexOf(',');
        const header = comma > 0 ? raw.slice(0, comma) : '';
        data = comma > 0 ? raw.slice(comma + 1) : raw;
        const m = header.match(/data:(image\/[^;]+);base64/);
        const declared = m?.[1] ?? '';
        const valid = ['image/jpeg', 'image/png', 'image/webp'];
        mime = (valid.includes(declared) ? declared : 'image/jpeg');
    }
    else {
        mime = raw.startsWith('iVBORw0KGgo') ? 'image/png'
            : raw.startsWith('UklGR') ? 'image/webp'
                : 'image/jpeg';
    }
    data = data.replace(/\s/g, ''); // strip whitespace — Python encodebytes inserts \n every 76 chars
    return { b64: data, mime };
}
async function analyzeScreen(objective, base64, actionHistory, step, maxSteps, contextHint, // pre-OCR window state for first step
providerStats) {
    const history = actionHistory.slice(-5).join(' → ') || 'aucune';
    const { b64: cleanB64, mime } = _normalizeB64(base64);
    const ctxLine = contextHint ? `\nCONTEXTE PC: ${contextHint}` : '';
    const prompt = `OBJECTIF: ${objective}${ctxLine}\nÉTAPE: ${step}/${maxSteps}\nHISTORIQUE: ${history}\n\nAnalyse l'écran. JSON uniquement:\n{"screen_analysis":"...","ui_elements":["..."],"detected_errors":[],"objective_status":"in_progress|completed|failed|blocked","next_action":{"type":"...","payload":{}},"reasoning":"...","confidence":0.0}`;
    // Build available providers
    const available = [
        ...((0, llm_router_js_1.isGroqAvailable)() ? ['groq'] : []),
        ...((0, llm_router_js_1.isGeminiAvailable)() ? ['gemini'] : []),
        ...((0, llm_router_js_1.isClaudeAvailable)() ? ['claude'] : []),
        ...((0, llm_router_js_1.isOpenAIAvailable)() ? ['openai'] : []),
    ];
    // Dynamic ranking: use historical stats if available, else default order
    const providerOrder = (providerStats && providerStats.length > 0)
        ? (0, nexus_memory_js_1.rankProviders)(providerStats, available)
        : available;
    if (providerOrder.length === 0) {
        console.error('[NEXUS_VISION] no_vision_provider');
        return null;
    }
    console.log(`[NEXUS_VISION] analyze step=${step}/${maxSteps} providers=[${providerOrder.join(',')}] mime=${mime} b64len=${cleanB64.length}`);
    const _call = (p) => {
        if (p === 'groq')
            return (0, llm_router_js_1.callGroqVision)(prompt, VISION_EXTRA, cleanB64, mime, true);
        if (p === 'gemini')
            return (0, llm_router_js_1.callGemini)(prompt, VISION_EXTRA, cleanB64, mime);
        if (p === 'openai')
            return (0, llm_router_js_1.callOpenAIVision)(prompt, VISION_EXTRA, cleanB64, mime);
        return (0, llm_router_js_1.callClaudeVision)(prompt, VISION_EXTRA, cleanB64, mime, true);
    };
    let raw = '';
    const providerErrors = [];
    for (const p of providerOrder) {
        const t0 = Date.now();
        try {
            raw = await _call(p);
            const lat = Date.now() - t0;
            _ctx.lastProvider = p;
            _ctx.lastAnalysisError = null;
            console.log(`[NEXUS_VISION] provider=${p} ok mime=${mime} len=${raw.length} latency=${lat}ms`);
            void (0, nexus_memory_js_1.updateProviderStats)(p, true, lat); // fire and forget
            break;
        }
        catch (err) {
            const lat = Date.now() - t0;
            const axiosBody = err
                .response?.data?.error;
            const bodyDetail = axiosBody ? ` [${axiosBody.type ?? ''}:${axiosBody.message ?? ''}]` : '';
            const baseMsg = err instanceof Error ? err.message : String(err);
            const msg = `${baseMsg}${bodyDetail}`;
            providerErrors.push(`${p}: ${msg.slice(0, 100)}`);
            console.warn(`[NEXUS_VISION] provider=${p} fail="${msg.slice(0, 120)}" lat=${lat}ms — trying next`);
            void (0, nexus_memory_js_1.updateProviderStats)(p, false, lat, msg.slice(0, 200)); // fire and forget
        }
    }
    if (!raw) {
        const allErrors = providerErrors.join(' | ');
        console.error(`[NEXUS_VISION] all_providers_failed errors="${allErrors}"`);
        _ctx.lastAnalysisError = `all_failed: ${allErrors}`;
        void (0, nexus_memory_js_1.recordFailure)('all_providers_failed', allErrors.slice(0, 300));
        return null;
    }
    _ctx.lastRawResponse = raw.slice(0, 300);
    _ctx.lastAnalysisError = null;
    const d = _parseDecision(raw);
    if (!d) {
        const parseErr = `json_parse_failed raw="${raw.slice(0, 200)}"`;
        console.warn(`[NEXUS_VISION] ${parseErr}`);
        _ctx.lastAnalysisError = parseErr;
    }
    else {
        console.log(`[NEXUS_VISION] decision status=${d.objective_status} next=${d.next_action.type} conf=${d.confidence}`);
    }
    return d;
}
// ── Vision Loop ───────────────────────────────────────────────────────────────
const COMMAND_TYPES = new Set([
    'SCREENSHOT_DESKTOP', 'LIST_DESKTOP_FILES', 'OPEN_FOLDER', 'OPEN_URL',
    'OPEN_CHROME', 'OPEN_VSCODE', 'FOCUS_APP', 'SYSTEM_INFO', 'TERMINAL_COMMAND_SAFE',
]);
// App launch commands: need extra time for window to appear before next screenshot
const APP_LAUNCH_COMMANDS = new Set(['OPEN_CHROME', 'OPEN_VSCODE', 'OPEN_URL', 'OPEN_FOLDER']);
const APP_LAUNCH_DELAY_MS = 6_000;
async function runVisionLoop(objective, options) {
    const taskId = options?.taskId ?? `vl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const maxSteps = Math.min(options?.maxSteps ?? MAX_AUTONOMOUS_STEPS, MAX_AUTONOMOUS_STEPS);
    const stepDelay = options?.stepDelay ?? 2_000;
    const demoTelegram = options?.demoTelegram ?? true;
    const t0 = Date.now();
    const startedAt = new Date().toISOString();
    console.log(`[NEXUS_VISION] loop_start taskId=${taskId} maxSteps=${maxSteps} obj="${objective.slice(0, 60)}"`);
    _ctx.objective = objective;
    // ── Pre-loop: load memory + context ──────────────────────────────────────
    const [providerStats, prevWorkflow] = await Promise.all([
        (0, nexus_memory_js_1.getProviderStats)(),
        (0, nexus_memory_js_1.getSuccessfulWorkflow)(objective),
    ]);
    // Adaptive confidence: loosen threshold for reliable workflows, tighten for failing ones
    const total = (prevWorkflow?.success_count ?? 0) + (prevWorkflow?.fail_count ?? 0);
    const reliability = prevWorkflow?.reliability ?? 0;
    const adaptiveFactor = (reliability >= 0.75 && total >= 3) ? 0.80 : // proven workflow → more permissive
        (reliability < 0.30 && total >= 5) ? 1.30 : // repeatedly failing → stricter
            1.00;
    const effectiveMinConf = MIN_CONFIDENCE_BASE * adaptiveFactor;
    const effectiveMinConfRisky = MIN_CONFIDENCE_RISKY * adaptiveFactor;
    if (prevWorkflow) {
        console.log(`[NEXUS_VISION] workflow_found reliability=${reliability.toFixed(2)} factor=${adaptiveFactor} runs=${total}`);
        if (demoTelegram && total >= 3) {
            void _notify(`🧠 *Workflow connu* — fiabilité ${(reliability * 100).toFixed(0)}% (${total} runs)\n_Confiance ajustée: ×${adaptiveFactor}_`);
        }
    }
    // Tracking state
    const actionHistory = [];
    const screenshotHashes = new Map();
    let screenshotCount = 0;
    let consecutiveErrors = 0;
    let sameActionCount = 0;
    let resetHashOnNextStep = false; // true after app-launch: window may still be loading
    let prevActionType = '';
    let contextHint = '';
    const done = (status, steps, error) => ({ taskId, objective, status, steps, lastAnalysis: _ctx.lastAnalysis, error, durationMs: Date.now() - t0, startedAt });
    // finish(): wraps done() + persists to memory + sends Telegram summary
    const finish = (status, steps, error) => {
        const r = done(status, steps, error);
        const success = status === 'completed';
        // Persist task (fire and forget)
        void (0, nexus_memory_js_1.saveTask)({
            task_id: taskId, objective, status,
            steps, screenshots: screenshotCount,
            provider: _ctx.lastProvider,
            duration_ms: r.durationMs,
            error: error?.slice(0, 500) ?? null,
            action_log: actionHistory,
        });
        // Persist workflow pattern
        void (0, nexus_memory_js_1.saveWorkflow)(objective, actionHistory, success, steps, r.durationMs);
        // Record failure patterns
        if (error)
            void (0, nexus_memory_js_1.recordFailure)(error.slice(0, 200), objective.slice(0, 100));
        // Telegram final summary
        if (demoTelegram)
            void _sendFinalSummary(r, screenshotCount, _ctx.lastProvider ?? 'aucun', actionHistory);
        return r;
    };
    if (demoTelegram)
        void _notify(`👁️ *Dzaryx Vision — Démarrage*\n_Objectif:_ ${objective}`);
    // ── Pre-flight checks ─────────────────────────────────────────────────────
    // Internet check
    console.log('[NEXUS_VISION] checking internet...');
    const hasInternet = await _checkInternet();
    if (!hasInternet) {
        console.warn('[NEXUS_VISION] no_internet');
        if (demoTelegram)
            void _notify('❌ *NEXUS — Pas de connexion internet*');
        return finish('failed', 0, 'Pas de connexion internet sur le PC');
    }
    // Pre-OCR: get current window state for context injection
    console.log('[NEXUS_VISION] pre-ocr context...');
    const { hint, openApps } = await _buildContextHint();
    contextHint = hint;
    if (openApps.length > 0) {
        console.log(`[NEXUS_VISION] open_apps=[${openApps.join(',')}]`);
        if (openApps.includes('APP_BLOQUÉE')) {
            if (demoTelegram)
                void _notify('⚠️ *NEXUS — App bloquée détectée (Not Responding)*');
        }
    }
    // ── Main loop ─────────────────────────────────────────────────────────────
    for (let step = 1; step <= maxSteps; step++) {
        if (_emergencyStop) {
            console.warn(`[NEXUS_VISION] emergency_stop step=${step}`);
            if (demoTelegram)
                void _notify('🛑 *NEXUS Vision — Arrêt d\'urgence*');
            return finish('stopped', step - 1, 'Emergency stop');
        }
        if (!(0, nexus_relay_js_1.isNexusOnline)())
            return finish('failed', step - 1, 'Nexus hors ligne');
        if (!_checkRate()) {
            console.warn(`[NEXUS_VISION] rate_limit step=${step} — waiting 10s`);
            await new Promise(r => setTimeout(r, 10_000));
            continue;
        }
        // Screenshot
        console.log(`[NEXUS_VISION] screenshot step=${step}/${maxSteps}`);
        let base64;
        try {
            const shot = await (0, nexus_relay_js_1.nexusScreenshotBase64)(35_000);
            if (!shot.ok || !shot.image_base64)
                throw new Error(shot.error ?? 'empty');
            base64 = shot.image_base64;
            _ctx.lastScreenshot = base64;
            _ctx.updatedAt = Date.now();
            screenshotCount++;
        }
        catch (err) {
            return finish('failed', step - 1, `Screenshot: ${err instanceof Error ? err.message : String(err)}`);
        }
        // Anti-loop: same screen hash
        const hash = _hashScreen(base64);
        // After an app-launch action, reset hash counters: the window is still loading
        // and the unchanged screenshot is expected, not a loop.
        if (resetHashOnNextStep) {
            screenshotHashes.clear();
            resetHashOnNextStep = false;
            console.log(`[NEXUS_VISION] hash_reset after app_launch step=${step}`);
        }
        const hashCount = (screenshotHashes.get(hash) ?? 0) + 1;
        screenshotHashes.set(hash, hashCount);
        // Save screenshot meta (fire and forget)
        void (0, nexus_memory_js_1.saveScreenshotMeta)({ task_id: taskId, step, screen_hash: hash });
        if (hashCount > MAX_SAME_SCREENSHOT) {
            console.warn(`[NEXUS_VISION] same_screen hash=${hash} count=${hashCount} — abort`);
            return finish('failed', step - 1, `Écran identique depuis ${hashCount} étapes — boucle détectée`);
        }
        // AI Analysis: pass contextHint on step 1 OR whenever updated by LOCAL_OCR
        const d = await analyzeScreen(objective, base64, actionHistory, step, maxSteps, contextHint || undefined, providerStats.length > 0 ? providerStats : undefined);
        if (step === 1)
            contextHint = ''; // clear initial pre-OCR hint after first use; LOCAL_OCR updates will re-populate
        if (!d) {
            consecutiveErrors++;
            console.warn(`[NEXUS_VISION] analysis_failed consecutive=${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}`);
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                return finish('failed', step - 1, `Vision AI indisponible (${MAX_CONSECUTIVE_ERRORS} erreurs consécutives)`);
            }
            await new Promise(r => setTimeout(r, stepDelay));
            continue;
        }
        consecutiveErrors = 0;
        _ctx.lastAnalysis = d.screen_analysis;
        _ctx.lastOcrText = d.ui_elements.join(', ');
        if (demoTelegram) {
            void _notify(`🧠 *Étape ${step}/${maxSteps}* [${_ctx.lastProvider ?? '?'}]\n` +
                `${d.screen_analysis.slice(0, 160)}\n` +
                `→ \`${d.next_action.type}\` conf=${(d.confidence * 100).toFixed(0)}%`);
        }
        const at = d.next_action.type;
        const ap = d.next_action.payload ?? {};
        // Save step analysis immediately — before any early returns so every step is persisted
        void (0, nexus_memory_js_1.saveStep)({
            task_id: taskId, step, action: at,
            payload: ap,
            success: d.objective_status !== 'failed',
            error: d.objective_status === 'failed' ? d.reasoning?.slice(0, 500) ?? null : null,
            screen_hash: hash,
            provider: _ctx.lastProvider,
            latency_ms: 0,
            confidence: d.confidence,
        });
        // Objective complete
        if (d.objective_status === 'completed' || at === 'DONE') {
            console.log(`[NEXUS_VISION] completed step=${step}`);
            return finish('completed', step, null);
        }
        if (d.objective_status === 'failed') {
            return finish('failed', step, d.reasoning);
        }
        // Forbidden action guard — absolute block
        if (FORBIDDEN_ACTIONS.has(at.toUpperCase())) {
            console.error(`[NEXUS_VISION] forbidden_action="${at}" step=${step}`);
            if (demoTelegram)
                void _notify(`🚫 *Action interdite bloquée:* \`${at}\``);
            _emergencyStop = true;
            return finish('stopped', step, `Forbidden action: ${at}`);
        }
        // Confidence threshold (adaptive)
        const isRisky = RISKY_ACTIONS.has(at.toUpperCase());
        const minConf = isRisky ? effectiveMinConfRisky : effectiveMinConf;
        if (d.confidence < minConf) {
            console.warn(`[NEXUS_VISION] low_confidence=${d.confidence.toFixed(2)} < ${minConf.toFixed(2)} action=${at} — WAIT 3s`);
            actionHistory.push(`WAIT_LOW_CONF(${at})`);
            await new Promise(r => setTimeout(r, 3_000));
            continue;
        }
        // Same action loop guard
        if (at !== 'WAIT' && at === prevActionType) {
            sameActionCount++;
            if (sameActionCount >= MAX_SAME_ACTION) {
                console.warn(`[NEXUS_VISION] same_action_loop action="${at}" count=${sameActionCount}`);
                return finish('failed', step, `Action "${at}" répétée ${sameActionCount}x — boucle détectée`);
            }
        }
        else {
            sameActionCount = 0;
        }
        prevActionType = at;
        actionHistory.push(at);
        _ctx.lastActionType = at;
        _ctx.actionHistory = actionHistory.slice(-10);
        // Execute action
        if (at === 'WAIT') {
            const ms = Math.min(ap['ms'] ?? 2_000, 10_000);
            console.log(`[NEXUS_AUTOMATION] WAIT ms=${ms} step=${step}`);
            await new Promise(r => setTimeout(r, ms));
        }
        else if (at === 'LOCAL_OCR') {
            console.log(`[NEXUS_AUTOMATION] LOCAL_OCR step=${step}`);
            const ocr = await performLocalOcr();
            _ctx.lastOcrText = ocr.text;
            // Inject OCR result into context for next analysis step
            if (ocr.windows.length > 0) {
                contextHint = `FENÊTRES OUVERTES (OCR step ${step}): ${ocr.windows.slice(0, 10).join(' | ')}`;
                console.log(`[NEXUS_AUTOMATION] LOCAL_OCR context_updated windows=${ocr.windows.length}`);
            }
            if (demoTelegram && ocr.windows.length > 0) {
                void _notify(`🔍 *Fenêtres:*\n${ocr.windows.slice(0, 8).map(w => `• ${w}`).join('\n')}`);
            }
        }
        else if (COMMAND_TYPES.has(at)) {
            const isLaunch = APP_LAUNCH_COMMANDS.has(at);
            const delay = isLaunch ? APP_LAUNCH_DELAY_MS : stepDelay;
            console.log(`[NEXUS_AUTOMATION] action=${at} step=${step} delay=${delay}ms payload=${JSON.stringify(ap).slice(0, 80)}`);
            if (demoTelegram)
                void _notify(`🖱️ *Action:* \`${at}\``);
            try {
                const rec = await (0, nexus_command_registry_js_1.executeNexusCommand)(at, { ...ap, notify_telegram: false });
                if (!rec.success) {
                    console.warn(`[NEXUS_AUTOMATION] failed action=${at} err="${rec.error?.slice(0, 80)}"`);
                    void (0, nexus_memory_js_1.recordFailure)(`action_failed:${at}`, rec.error?.slice(0, 200));
                }
            }
            catch (err) {
                console.error(`[NEXUS_AUTOMATION] error ${at}: ${err instanceof Error ? err.message : String(err)}`);
            }
            // App-launch: next screenshot may still show old foreground app while new app loads
            if (isLaunch)
                resetHashOnNextStep = true;
            await new Promise(r => setTimeout(r, delay));
        }
        else {
            console.warn(`[NEXUS_VISION] unknown_action="${at}" step=${step} — skip`);
            await new Promise(r => setTimeout(r, stepDelay));
        }
    }
    console.warn(`[NEXUS_VISION] max_steps taskId=${taskId}`);
    return finish('max_steps', maxSteps, null);
}
// ── Background launcher ───────────────────────────────────────────────────────
function startVisionLoop(objective, options) {
    const taskId = `vl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const entry = { status: 'running', startedAt: new Date().toISOString() };
    _loopStore.set(taskId, entry);
    void runVisionLoop(objective, { ...options, taskId }).then(result => {
        _loopStore.set(taskId, { ...entry, status: 'done', result });
        console.log(`[NEXUS_VISION] loop_stored taskId=${taskId} status=${result.status}`);
    }).catch(err => {
        const error = err instanceof Error ? err.message : String(err);
        _loopStore.set(taskId, { ...entry, status: 'done', result: {
                taskId, objective, status: 'failed', steps: 0,
                lastAnalysis: null, error, durationMs: 0, startedAt: entry.startedAt,
            } });
    });
    return taskId;
}
//# sourceMappingURL=nexus-vision-loop.js.map