/**
 * Nexus Vision Loop — Autonomous screen control with persistent learning.
 * Flow: pre-OCR context → screenshot → AI vision → execute → verify → loop
 * Memory: saves tasks, steps, workflows, provider stats to Supabase.
 */
import {
  nexusScreenshotBase64,
  nexusRunCommand,
  isNexusOnline,
} from './nexus-relay.js';
import { executeNexusCommand } from './nexus-command-registry.js';
import type { CommandType } from './nexus-command-registry.js';
import {
  callGemini, callClaudeVision, callOpenAIVision, callGroqVision,
  isGeminiAvailable, isClaudeAvailable, isOpenAIAvailable, isGroqAvailable,
} from '../../integrations/llm-router.js';
import {
  saveTask, saveStep, saveWorkflow, getSuccessfulWorkflow,
  updateProviderStats, getProviderStats, rankProviders,
  rememberUiPattern, recordFailure, saveScreenshotMeta,
  type NexusProviderStat,
} from './nexus-memory.js';
import { env } from '../../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VisionContext {
  pcId:              string;
  objective:         string | null;
  lastScreenshot:    string | null;
  lastAnalysis:      string | null;
  lastAnalysisError: string | null;
  lastRawResponse:   string | null;
  lastOcrText:       string | null;
  lastActionType:    string | null;
  lastProvider:      string | null;
  actionHistory:     string[];
  updatedAt:         number | null;
}

export interface VisionDecision {
  screen_analysis:  string;
  ui_elements:      string[];
  detected_errors:  string[];
  objective_status: 'in_progress' | 'completed' | 'failed' | 'blocked';
  next_action: {
    type:    string;
    payload: Record<string, unknown>;
  };
  reasoning:  string;
  confidence: number;
}

export interface VisionLoopResult {
  taskId:       string;
  objective:    string;
  status:       'completed' | 'failed' | 'stopped' | 'max_steps';
  steps:        number;
  lastAnalysis: string | null;
  error:        string | null;
  durationMs:   number;
  startedAt:    string;
}

export interface OcrResult {
  ok:      boolean;
  windows: string[];
  text:    string;
  error?:  string;
}

interface LoopEntry {
  status:    'running' | 'done';
  startedAt: string;
  result?:   VisionLoopResult;
}

// ── Singleton context ─────────────────────────────────────────────────────────

const _ctx: VisionContext = {
  pcId:              'default',
  objective:         null,
  lastScreenshot:    null,
  lastAnalysis:      null,
  lastAnalysisError: null,
  lastRawResponse:   null,
  lastOcrText:       null,
  lastActionType:    null,
  lastProvider:      null,
  actionHistory:     [],
  updatedAt:         null,
};

export function getVisionContext(): VisionContext {
  return { ..._ctx, lastScreenshot: _ctx.lastScreenshot ? '[captured]' : null };
}

const _loopStore = new Map<string, LoopEntry>();
export function getLoopStatus(taskId: string): LoopEntry | null { return _loopStore.get(taskId) ?? null; }
export function listLoops(): Array<{ taskId: string } & LoopEntry> {
  return [..._loopStore.entries()].map(([taskId, e]) => ({ taskId, ...e }));
}

// ── Safety ────────────────────────────────────────────────────────────────────

let _emergencyStop = false;
export function triggerEmergencyStop(): void  { _emergencyStop = true;  console.warn('[NEXUS_VISION] EMERGENCY_STOP'); }
export function clearEmergencyStop(): void    { _emergencyStop = false; console.log('[NEXUS_VISION] emergency_stop cleared'); }
export function isEmergencyStopped(): boolean { return _emergencyStop; }

const MAX_ACTIONS_PER_MIN    = 10;
const MAX_AUTONOMOUS_STEPS   = 5;
const MAX_CONSECUTIVE_ERRORS = 3;
const MAX_SAME_ACTION        = 3;
const MAX_SAME_SCREENSHOT    = 3;

const MIN_CONFIDENCE_BASE    = 0.35;
const MIN_CONFIDENCE_RISKY   = 0.60;

// Actions requiring high confidence before execution
const RISKY_ACTIONS = new Set<string>(['TERMINAL_COMMAND_SAFE', 'OPEN_FOLDER', 'REGISTRY_EDIT']);

// Actions that must never execute — hard block regardless of AI
const FORBIDDEN_ACTIONS = new Set<string>([
  'SHUTDOWN', 'RESTART', 'FORMAT', 'DELETE', 'KILL_PROCESS',
  'REGISTRY_EDIT', 'ADMIN_CMD', 'DISABLE_ANTIVIRUS',
  'SYSTEM32', 'POWERSHELL_ADMIN',
]);

const _actionTs: number[] = [];
function _checkRate(): boolean {
  const now = Date.now();
  while (_actionTs.length && now - _actionTs[0]! > 60_000) _actionTs.shift();
  if (_actionTs.length >= MAX_ACTIONS_PER_MIN) return false;
  _actionTs.push(now);
  return true;
}

// Fast djb2 fingerprint for screenshot dedup
function _hashScreen(b64: string): string {
  let h = 5381;
  const s = b64.slice(0, 5000);
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function _notify(text: string): Promise<void> {
  const t = env.TELEGRAM_BOT_TOKEN, c = env.TELEGRAM_CHAT_ID;
  if (!t || !c) return;
  try {
    const { default: axios } = await import('axios');
    await axios.post(`https://api.telegram.org/bot${t}/sendMessage`,
      { chat_id: c, text, parse_mode: 'Markdown' }, { timeout: 8_000 });
  } catch { /* non-critical */ }
}

async function _sendFinalSummary(
  result:      VisionLoopResult,
  screenshots: number,
  provider:    string,
  actionLog:   string[],
): Promise<void> {
  const e   = result.status === 'completed' ? '✅' : result.status === 'stopped' ? '🛑' : '⚠️';
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

export async function performLocalOcr(timeoutMs = 15_000): Promise<OcrResult> {
  const cmd = `powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -ExpandProperty MainWindowTitle | Sort-Object -Unique"`;
  console.log('[NEXUS_OCR] local_ocr window_titles');
  try {
    const r = await nexusRunCommand(cmd, undefined, timeoutMs);
    const windows = r.stdout.split('\n').map(l => l.trim()).filter(Boolean);
    console.log(`[NEXUS_OCR] ${windows.length} window_titles ok=${r.ok}`);
    // Record known UI patterns in memory (fire and forget)
    for (const w of windows) {
      const app = w.split(' - ').pop() ?? w;
      void rememberUiPattern(w, app.slice(0, 40));
    }
    return { ok: r.ok, windows, text: windows.join('\n') };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[NEXUS_OCR] failed: ${error}`);
    return { ok: false, windows: [], text: '', error };
  }
}

// Internet connectivity check via PC ping
async function _checkInternet(): Promise<boolean> {
  try {
    const r = await nexusRunCommand('ping -n 1 -w 2000 8.8.8.8', undefined, 8_000);
    return r.ok && (r.stdout.includes('TTL=') || r.stdout.includes('ttl='));
  } catch { return false; }
}

// Build context hint from current window state
async function _buildContextHint(): Promise<{ hint: string; openApps: string[] }> {
  try {
    const ocr = await performLocalOcr(12_000);
    if (!ocr.ok || ocr.windows.length === 0) return { hint: '', openApps: [] };
    const openApps: string[] = [];
    if (ocr.windows.some(w => /chrome|google/i.test(w)))              openApps.push('Chrome');
    if (ocr.windows.some(w => /visual studio code|vs code/i.test(w))) openApps.push('VS Code');
    if (ocr.windows.some(w => /github/i.test(w)))                     openApps.push('GitHub');
    if (ocr.windows.some(w => /not responding/i.test(w)))             openApps.push('APP_BLOQUÉE');
    const hint = `FENÊTRES OUVERTES: ${ocr.windows.slice(0, 8).join(', ')}`;
    return { hint, openApps };
  } catch { return { hint: '', openApps: [] }; }
}

// ── Screen Analysis ───────────────────────────────────────────────────────────

const VISION_EXTRA = `RÔLE: Tu es le cerveau de contrôle PC de Dzaryx. Tu analyses des captures d'écran Windows.
RÈGLE: Réponds UNIQUEMENT en JSON valide — aucun texte avant ou après.
ACTIONS: SCREENSHOT_DESKTOP, LIST_DESKTOP_FILES, OPEN_FOLDER, OPEN_URL (payload:{url}), OPEN_CHROME, OPEN_VSCODE, SYSTEM_INFO, TERMINAL_COMMAND_SAFE (payload:{command}), WAIT (payload:{ms:2000}), LOCAL_OCR, DONE.
DONE = objectif atteint. WAIT = attendre chargement.`;

function _parseDecision(raw: string): VisionDecision | null {
  const m = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? raw.match(/(\{[\s\S]+\})/s);
  if (!m) return null;
  try { return JSON.parse((m[1] ?? m[2] ?? '').trim()) as VisionDecision; } catch { return null; }
}

// Normalize base64: strip data URI prefix, detect MIME, strip whitespace (Python encodebytes \n)
function _normalizeB64(raw: string): { b64: string; mime: 'image/jpeg' | 'image/png' | 'image/webp' } {
  let data = raw;
  let mime: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    const header = comma > 0 ? raw.slice(0, comma) : '';
    data = comma > 0 ? raw.slice(comma + 1) : raw;
    const m = header.match(/data:(image\/[^;]+);base64/);
    const declared = m?.[1] ?? '';
    const valid: Array<'image/jpeg' | 'image/png' | 'image/webp'> = ['image/jpeg', 'image/png', 'image/webp'];
    mime = (valid.includes(declared as 'image/jpeg') ? declared : 'image/jpeg') as typeof mime;
  } else {
    mime = raw.startsWith('iVBORw0KGgo') ? 'image/png'
      : raw.startsWith('UklGR') ? 'image/webp'
      : 'image/jpeg';
  }
  data = data.replace(/\s/g, ''); // strip whitespace — Python encodebytes inserts \n every 76 chars
  return { b64: data, mime };
}

export async function analyzeScreen(
  objective:     string,
  base64:        string,
  actionHistory: string[],
  step:          number,
  maxSteps:      number,
  contextHint?:  string,              // pre-OCR window state for first step
  providerStats?: NexusProviderStat[], // for dynamic provider ranking
): Promise<VisionDecision | null> {
  const history  = actionHistory.slice(-5).join(' → ') || 'aucune';
  const { b64: cleanB64, mime } = _normalizeB64(base64);
  const ctxLine  = contextHint ? `\nCONTEXTE PC: ${contextHint}` : '';
  const prompt   = `OBJECTIF: ${objective}${ctxLine}\nÉTAPE: ${step}/${maxSteps}\nHISTORIQUE: ${history}\n\nAnalyse l'écran. JSON uniquement:\n{"screen_analysis":"...","ui_elements":["..."],"detected_errors":[],"objective_status":"in_progress|completed|failed|blocked","next_action":{"type":"...","payload":{}},"reasoning":"...","confidence":0.0}`;

  // Build available providers
  const available = [
    ...(isGroqAvailable()   ? ['groq']   : []),
    ...(isGeminiAvailable() ? ['gemini'] : []),
    ...(isClaudeAvailable() ? ['claude'] : []),
    ...(isOpenAIAvailable() ? ['openai'] : []),
  ];

  // Dynamic ranking: use historical stats if available, else default order
  const providerOrder = (providerStats && providerStats.length > 0)
    ? rankProviders(providerStats, available)
    : available;

  if (providerOrder.length === 0) {
    console.error('[NEXUS_VISION] no_vision_provider');
    return null;
  }
  console.log(`[NEXUS_VISION] analyze step=${step}/${maxSteps} providers=[${providerOrder.join(',')}] mime=${mime} b64len=${cleanB64.length}`);

  const _call = (p: string) => {
    if (p === 'groq')   return callGroqVision(prompt, VISION_EXTRA, cleanB64, mime, true);
    if (p === 'gemini') return callGemini(prompt, VISION_EXTRA, cleanB64, mime);
    if (p === 'openai') return callOpenAIVision(prompt, VISION_EXTRA, cleanB64, mime);
    return callClaudeVision(prompt, VISION_EXTRA, cleanB64, mime, true);
  };

  let raw = '';
  const providerErrors: string[] = [];

  for (const p of providerOrder) {
    const t0 = Date.now();
    try {
      raw = await _call(p);
      const lat = Date.now() - t0;
      _ctx.lastProvider      = p;
      _ctx.lastAnalysisError = null;
      console.log(`[NEXUS_VISION] provider=${p} ok mime=${mime} len=${raw.length} latency=${lat}ms`);
      void updateProviderStats(p, true, lat); // fire and forget
      break;
    } catch (err) {
      const lat        = Date.now() - t0;
      const axiosBody  = (err as { response?: { data?: { error?: { message?: string; type?: string } } } })
        .response?.data?.error;
      const bodyDetail = axiosBody ? ` [${axiosBody.type ?? ''}:${axiosBody.message ?? ''}]` : '';
      const baseMsg    = err instanceof Error ? err.message : String(err);
      const msg        = `${baseMsg}${bodyDetail}`;
      providerErrors.push(`${p}: ${msg.slice(0, 100)}`);
      console.warn(`[NEXUS_VISION] provider=${p} fail="${msg.slice(0, 120)}" lat=${lat}ms — trying next`);
      void updateProviderStats(p, false, lat, msg.slice(0, 200)); // fire and forget
    }
  }

  if (!raw) {
    const allErrors = providerErrors.join(' | ');
    console.error(`[NEXUS_VISION] all_providers_failed errors="${allErrors}"`);
    _ctx.lastAnalysisError = `all_failed: ${allErrors}`;
    void recordFailure('all_providers_failed', allErrors.slice(0, 300));
    return null;
  }

  _ctx.lastRawResponse   = raw.slice(0, 300);
  _ctx.lastAnalysisError = null;

  const d = _parseDecision(raw);
  if (!d) {
    const parseErr = `json_parse_failed raw="${raw.slice(0, 200)}"`;
    console.warn(`[NEXUS_VISION] ${parseErr}`);
    _ctx.lastAnalysisError = parseErr;
  } else {
    console.log(`[NEXUS_VISION] decision status=${d.objective_status} next=${d.next_action.type} conf=${d.confidence}`);
  }
  return d;
}

// ── Vision Loop ───────────────────────────────────────────────────────────────

const COMMAND_TYPES = new Set<string>([
  'SCREENSHOT_DESKTOP', 'LIST_DESKTOP_FILES', 'OPEN_FOLDER', 'OPEN_URL',
  'OPEN_CHROME', 'OPEN_VSCODE', 'SYSTEM_INFO', 'TERMINAL_COMMAND_SAFE',
]);

// App launch commands: need extra time for window to appear before next screenshot
const APP_LAUNCH_COMMANDS = new Set<string>(['OPEN_CHROME', 'OPEN_VSCODE', 'OPEN_URL', 'OPEN_FOLDER']);
const APP_LAUNCH_DELAY_MS = 6_000;

export async function runVisionLoop(
  objective: string,
  options?: {
    taskId?:       string;
    maxSteps?:     number;
    stepDelay?:    number;
    demoTelegram?: boolean;
  },
): Promise<VisionLoopResult> {
  const taskId       = options?.taskId      ?? `vl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const maxSteps     = Math.min(options?.maxSteps ?? MAX_AUTONOMOUS_STEPS, MAX_AUTONOMOUS_STEPS);
  const stepDelay    = options?.stepDelay   ?? 2_000;
  const demoTelegram = options?.demoTelegram ?? true;
  const t0           = Date.now();
  const startedAt    = new Date().toISOString();

  console.log(`[NEXUS_VISION] loop_start taskId=${taskId} maxSteps=${maxSteps} obj="${objective.slice(0, 60)}"`);
  _ctx.objective = objective;

  // ── Pre-loop: load memory + context ──────────────────────────────────────
  const [providerStats, prevWorkflow] = await Promise.all([
    getProviderStats(),
    getSuccessfulWorkflow(objective),
  ]);

  // Adaptive confidence: loosen threshold for reliable workflows, tighten for failing ones
  const total = (prevWorkflow?.success_count ?? 0) + (prevWorkflow?.fail_count ?? 0);
  const reliability = prevWorkflow?.reliability ?? 0;
  const adaptiveFactor =
    (reliability >= 0.75 && total >= 3) ? 0.80 :  // proven workflow → more permissive
    (reliability <  0.30 && total >= 5) ? 1.30 :  // repeatedly failing → stricter
    1.00;

  const effectiveMinConf      = MIN_CONFIDENCE_BASE  * adaptiveFactor;
  const effectiveMinConfRisky = MIN_CONFIDENCE_RISKY * adaptiveFactor;

  if (prevWorkflow) {
    console.log(`[NEXUS_VISION] workflow_found reliability=${reliability.toFixed(2)} factor=${adaptiveFactor} runs=${total}`);
    if (demoTelegram && total >= 3) {
      void _notify(`🧠 *Workflow connu* — fiabilité ${(reliability * 100).toFixed(0)}% (${total} runs)\n_Confiance ajustée: ×${adaptiveFactor}_`);
    }
  }

  // Tracking state
  const actionHistory:    string[] = [];
  const screenshotHashes           = new Map<string, number>();
  let screenshotCount              = 0;
  let consecutiveErrors            = 0;
  let sameActionCount              = 0;
  let prevActionType               = '';
  let contextHint                  = '';

  const done = (status: VisionLoopResult['status'], steps: number, error: string | null): VisionLoopResult =>
    ({ taskId, objective, status, steps, lastAnalysis: _ctx.lastAnalysis, error, durationMs: Date.now() - t0, startedAt });

  // finish(): wraps done() + persists to memory + sends Telegram summary
  const finish = (status: VisionLoopResult['status'], steps: number, error: string | null): VisionLoopResult => {
    const r = done(status, steps, error);
    const success = status === 'completed';

    // Persist task (fire and forget)
    void saveTask({
      task_id: taskId, objective, status,
      steps, screenshots: screenshotCount,
      provider: _ctx.lastProvider,
      duration_ms: r.durationMs,
      error: error?.slice(0, 500) ?? null,
      action_log: actionHistory,
    });

    // Persist workflow pattern
    void saveWorkflow(objective, actionHistory, success, steps, r.durationMs);

    // Record failure patterns
    if (error) void recordFailure(error.slice(0, 200), objective.slice(0, 100));

    // Telegram final summary
    if (demoTelegram) void _sendFinalSummary(r, screenshotCount, _ctx.lastProvider ?? 'aucun', actionHistory);

    return r;
  };

  if (demoTelegram) void _notify(`👁️ *Dzaryx Vision — Démarrage*\n_Objectif:_ ${objective}`);

  // ── Pre-flight checks ─────────────────────────────────────────────────────

  // Internet check
  console.log('[NEXUS_VISION] checking internet...');
  const hasInternet = await _checkInternet();
  if (!hasInternet) {
    console.warn('[NEXUS_VISION] no_internet');
    if (demoTelegram) void _notify('❌ *NEXUS — Pas de connexion internet*');
    return finish('failed', 0, 'Pas de connexion internet sur le PC');
  }

  // Pre-OCR: get current window state for context injection
  console.log('[NEXUS_VISION] pre-ocr context...');
  const { hint, openApps } = await _buildContextHint();
  contextHint = hint;
  if (openApps.length > 0) {
    console.log(`[NEXUS_VISION] open_apps=[${openApps.join(',')}]`);
    if (openApps.includes('APP_BLOQUÉE')) {
      if (demoTelegram) void _notify('⚠️ *NEXUS — App bloquée détectée (Not Responding)*');
    }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  for (let step = 1; step <= maxSteps; step++) {

    if (_emergencyStop) {
      console.warn(`[NEXUS_VISION] emergency_stop step=${step}`);
      if (demoTelegram) void _notify('🛑 *NEXUS Vision — Arrêt d\'urgence*');
      return finish('stopped', step - 1, 'Emergency stop');
    }
    if (!isNexusOnline()) return finish('failed', step - 1, 'Nexus hors ligne');
    if (!_checkRate()) {
      console.warn(`[NEXUS_VISION] rate_limit step=${step} — waiting 10s`);
      await new Promise(r => setTimeout(r, 10_000));
      continue;
    }

    // Screenshot
    console.log(`[NEXUS_VISION] screenshot step=${step}/${maxSteps}`);
    let base64: string;
    try {
      const shot = await nexusScreenshotBase64(35_000);
      if (!shot.ok || !shot.image_base64) throw new Error(shot.error ?? 'empty');
      base64 = shot.image_base64;
      _ctx.lastScreenshot = base64;
      _ctx.updatedAt      = Date.now();
      screenshotCount++;
    } catch (err) {
      return finish('failed', step - 1, `Screenshot: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Anti-loop: same screen hash
    const hash = _hashScreen(base64);
    const hashCount = (screenshotHashes.get(hash) ?? 0) + 1;
    screenshotHashes.set(hash, hashCount);

    // Save screenshot meta (fire and forget)
    void saveScreenshotMeta({ task_id: taskId, step, screen_hash: hash });

    if (hashCount > MAX_SAME_SCREENSHOT) {
      console.warn(`[NEXUS_VISION] same_screen hash=${hash} count=${hashCount} — abort`);
      return finish('failed', step - 1, `Écran identique depuis ${hashCount} étapes — boucle détectée`);
    }

    // AI Analysis (pass context hint only on step 1, then clear it)
    const hint1 = step === 1 ? contextHint : undefined;
    const d = await analyzeScreen(objective, base64, actionHistory, step, maxSteps, hint1, providerStats.length > 0 ? providerStats : undefined);

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

    _ctx.lastAnalysis  = d.screen_analysis;
    _ctx.lastOcrText   = d.ui_elements.join(', ');

    if (demoTelegram) {
      void _notify(
        `🧠 *Étape ${step}/${maxSteps}* [${_ctx.lastProvider ?? '?'}]\n` +
        `${d.screen_analysis.slice(0, 160)}\n` +
        `→ \`${d.next_action.type}\` conf=${(d.confidence * 100).toFixed(0)}%`,
      );
    }

    const at = d.next_action.type;
    const ap = d.next_action.payload ?? {};

    // Save step analysis immediately — before any early returns so every step is persisted
    void saveStep({
      task_id: taskId, step, action: at,
      payload: ap as Record<string, unknown>,
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
      if (demoTelegram) void _notify(`🚫 *Action interdite bloquée:* \`${at}\``);
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
    } else {
      sameActionCount = 0;
    }
    prevActionType = at;

    actionHistory.push(at);
    _ctx.lastActionType = at;
    _ctx.actionHistory  = actionHistory.slice(-10);

    // Execute action
    if (at === 'WAIT') {
      const ms = Math.min((ap['ms'] as number | undefined) ?? 2_000, 10_000);
      console.log(`[NEXUS_AUTOMATION] WAIT ms=${ms} step=${step}`);
      await new Promise(r => setTimeout(r, ms));

    } else if (at === 'LOCAL_OCR') {
      console.log(`[NEXUS_AUTOMATION] LOCAL_OCR step=${step}`);
      const ocr = await performLocalOcr();
      _ctx.lastOcrText = ocr.text;
      if (demoTelegram && ocr.windows.length > 0) {
        void _notify(`🔍 *Fenêtres:*\n${ocr.windows.slice(0, 8).map(w => `• ${w}`).join('\n')}`);
      }

    } else if (COMMAND_TYPES.has(at)) {
      const delay = APP_LAUNCH_COMMANDS.has(at) ? APP_LAUNCH_DELAY_MS : stepDelay;
      console.log(`[NEXUS_AUTOMATION] action=${at} step=${step} delay=${delay}ms payload=${JSON.stringify(ap).slice(0, 80)}`);
      if (demoTelegram) void _notify(`🖱️ *Action:* \`${at}\``);
      try {
        const rec = await executeNexusCommand(at as CommandType, { ...ap, notify_telegram: false });
        if (!rec.success) {
          console.warn(`[NEXUS_AUTOMATION] failed action=${at} err="${rec.error?.slice(0, 80)}"`);
          void recordFailure(`action_failed:${at}`, rec.error?.slice(0, 200));
        }
      } catch (err) {
        console.error(`[NEXUS_AUTOMATION] error ${at}: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise(r => setTimeout(r, delay));

    } else {
      console.warn(`[NEXUS_VISION] unknown_action="${at}" step=${step} — skip`);
      await new Promise(r => setTimeout(r, stepDelay));
    }
  }

  console.warn(`[NEXUS_VISION] max_steps taskId=${taskId}`);
  return finish('max_steps', maxSteps, null);
}

// ── Background launcher ───────────────────────────────────────────────────────

export function startVisionLoop(
  objective: string,
  options?: { maxSteps?: number; stepDelay?: number; demoTelegram?: boolean },
): string {
  const taskId = `vl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const entry: LoopEntry = { status: 'running', startedAt: new Date().toISOString() };
  _loopStore.set(taskId, entry);

  void runVisionLoop(objective, { ...options, taskId }).then(result => {
    _loopStore.set(taskId, { ...entry, status: 'done', result });
    console.log(`[NEXUS_VISION] loop_stored taskId=${taskId} status=${result.status}`);
  }).catch(err => {
    const error = err instanceof Error ? err.message : String(err);
    _loopStore.set(taskId, { ...entry, status: 'done', result: {
      taskId, objective, status: 'failed', steps: 0,
      lastAnalysis: null, error, durationMs: 0, startedAt: entry.startedAt,
    }});
  });

  return taskId;
}
