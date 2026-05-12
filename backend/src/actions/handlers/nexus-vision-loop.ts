/**
 * Nexus Vision Loop — Screen capture, AI visual analysis, autonomous action execution.
 * Flow: screenshot → AI vision → next action → execute → verify → loop
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
import { env } from '../../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VisionContext {
  pcId:              string;
  objective:         string | null;
  lastScreenshot:    string | null;   // '[captured]' when serialized externally
  lastAnalysis:      string | null;
  lastAnalysisError: string | null;
  lastRawResponse:   string | null;   // first 300 chars of last AI raw response
  lastOcrText:       string | null;
  lastActionType:    string | null;
  lastProvider:      string | null;   // which AI provider succeeded last
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

// ── Vision context (singleton) ────────────────────────────────────────────────

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

// ── Background loop store ─────────────────────────────────────────────────────

const _loopStore = new Map<string, LoopEntry>();

export function getLoopStatus(taskId: string): LoopEntry | null {
  return _loopStore.get(taskId) ?? null;
}

export function listLoops(): Array<{ taskId: string } & LoopEntry> {
  return [..._loopStore.entries()].map(([taskId, e]) => ({ taskId, ...e }));
}

// ── Safety constants ──────────────────────────────────────────────────────────

let _emergencyStop = false;
export function triggerEmergencyStop(): void {
  _emergencyStop = true;
  console.warn('[NEXUS_VISION] EMERGENCY_STOP triggered');
}
export function clearEmergencyStop(): void {
  _emergencyStop = false;
  console.log('[NEXUS_VISION] emergency_stop cleared');
}
export function isEmergencyStopped(): boolean { return _emergencyStop; }

const MAX_ACTIONS_PER_MIN    = 10;
const MAX_AUTONOMOUS_STEPS   = 5;
const MAX_CONSECUTIVE_ERRORS = 3;   // AI failures before aborting loop
const MAX_SAME_ACTION        = 3;   // Same action repeated before aborting
const MAX_SAME_SCREENSHOT    = 3;   // Same screen hash before aborting

const MIN_CONFIDENCE         = 0.35; // Below this: skip action, WAIT instead
const MIN_CONFIDENCE_RISKY   = 0.60; // For terminal/file commands

// Actions that require higher confidence
const RISKY_ACTIONS = new Set<string>(['TERMINAL_COMMAND_SAFE', 'OPEN_FOLDER', 'REGISTRY_EDIT', 'ADMIN_CMD']);

// Actions that must never execute
const FORBIDDEN_ACTIONS = new Set<string>([
  'SHUTDOWN', 'RESTART', 'FORMAT', 'DELETE', 'KILL_PROCESS',
  'REGISTRY_EDIT', 'ADMIN_CMD', 'DISABLE_ANTIVIRUS',
]);

// Rate limiter
const _actionTs: number[] = [];

function _checkRate(): boolean {
  const now = Date.now();
  while (_actionTs.length > 0 && now - _actionTs[0]! > 60_000) _actionTs.shift();
  if (_actionTs.length >= MAX_ACTIONS_PER_MIN) return false;
  _actionTs.push(now);
  return true;
}

// Fast djb2-like fingerprint — not cryptographic, just screen identity
function _hashScreen(b64: string): string {
  let h = 5381;
  const sample = b64.slice(0, 5000);
  for (let i = 0; i < sample.length; i++) h = (((h << 5) + h) + sample.charCodeAt(i)) | 0;
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
  result:       VisionLoopResult,
  screenshots:  number,
  provider:     string,
  actionLog:    string[],
): Promise<void> {
  const e   = result.status === 'completed' ? '✅' : result.status === 'stopped' ? '🛑' : '⚠️';
  const dur = (result.durationMs / 1000).toFixed(1);
  const actions = actionLog.length > 0
    ? actionLog.slice(-8).join(' → ')
    : 'aucune';
  const msg = [
    `${e} *Vision — Rapport Final*`,
    `*Objectif:* ${result.objective.slice(0, 80)}`,
    `*Statut:* \`${result.status}\``,
    `*Étapes:* ${result.steps} | *Screenshots:* ${screenshots}`,
    `*Provider:* ${provider} | *Durée:* ${dur}s`,
    `*Actions:* ${actions.slice(0, 200)}`,
    result.error ? `*Erreur:* ${result.error.slice(0, 120)}` : '',
  ].filter(Boolean).join('\n');
  await _notify(msg);
}

// ── Local OCR ─────────────────────────────────────────────────────────────────

export async function performLocalOcr(timeoutMs = 15_000): Promise<OcrResult> {
  const cmd = `powershell -NoProfile -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -ExpandProperty MainWindowTitle | Sort-Object -Unique"`;
  console.log('[NEXUS_OCR] local_ocr window_titles');
  try {
    const r = await nexusRunCommand(cmd, undefined, timeoutMs);
    const windows = r.stdout.split('\n').map(l => l.trim()).filter(Boolean);
    console.log(`[NEXUS_OCR] extracted ${windows.length} window_titles ok=${r.ok}`);
    return { ok: r.ok, windows, text: windows.join('\n') };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[NEXUS_OCR] failed: ${error}`);
    return { ok: false, windows: [], text: '', error };
  }
}

// ── Screen analysis ───────────────────────────────────────────────────────────

const VISION_EXTRA = `RÔLE: Tu es le cerveau de contrôle PC de Dzaryx. Tu analyses des captures d'écran Windows.
RÈGLE: Réponds UNIQUEMENT en JSON valide — aucun texte avant ou après.
ACTIONS: SCREENSHOT_DESKTOP, LIST_DESKTOP_FILES, OPEN_FOLDER, OPEN_URL (payload:{url}), OPEN_CHROME, OPEN_VSCODE, SYSTEM_INFO, TERMINAL_COMMAND_SAFE (payload:{command}), WAIT (payload:{ms:2000}), LOCAL_OCR, DONE.
DONE = objectif atteint. WAIT = attendre chargement.`;

function _parseDecision(raw: string): VisionDecision | null {
  const m = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? raw.match(/(\{[\s\S]+\})/s);
  if (!m) return null;
  try { return JSON.parse((m[1] ?? m[2] ?? '').trim()) as VisionDecision; } catch { return null; }
}

// Normalize base64: strip data URI prefix, detect MIME, strip whitespace
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
    mime = (valid.includes(declared as 'image/jpeg') ? declared : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';
  } else {
    mime = raw.startsWith('iVBORw0KGgo') ? 'image/png'
      : raw.startsWith('UklGR') ? 'image/webp'
      : 'image/jpeg';
  }

  // Strip whitespace — Python encodebytes() inserts \n every 76 chars
  data = data.replace(/\s/g, '');

  return { b64: data, mime };
}

export async function analyzeScreen(
  objective:     string,
  base64:        string,
  actionHistory: string[],
  step:          number,
  maxSteps:      number,
): Promise<VisionDecision | null> {
  const history  = actionHistory.slice(-5).join(' → ') || 'aucune';
  const { b64: cleanB64, mime } = _normalizeB64(base64);
  const prompt   = `OBJECTIF: ${objective}\nÉTAPE: ${step}/${maxSteps}\nHISTORIQUE: ${history}\n\nAnalyse l'écran. JSON uniquement:\n{"screen_analysis":"...","ui_elements":["..."],"detected_errors":[],"objective_status":"in_progress|completed|failed|blocked","next_action":{"type":"...","payload":{}},"reasoning":"...","confidence":0.0}`;

  const providerOrder = [
    ...(isGroqAvailable()    ? ['groq']    : []),
    ...(isGeminiAvailable()  ? ['gemini']  : []),
    ...(isClaudeAvailable()  ? ['claude']  : []),
    ...(isOpenAIAvailable()  ? ['openai']  : []),
  ] as Array<'groq' | 'gemini' | 'claude' | 'openai'>;

  if (providerOrder.length === 0) { console.error('[NEXUS_VISION] no_vision_provider'); return null; }
  console.log(`[NEXUS_VISION] analyze step=${step}/${maxSteps} providers=[${providerOrder.join(',')}] mime=${mime} b64len=${cleanB64.length}`);

  const _call = (p: 'groq' | 'gemini' | 'claude' | 'openai') =>
    p === 'groq'   ? callGroqVision(prompt, VISION_EXTRA, cleanB64, mime, true)
    : p === 'gemini' ? callGemini(prompt, VISION_EXTRA, cleanB64, mime)
    : p === 'openai' ? callOpenAIVision(prompt, VISION_EXTRA, cleanB64, mime)
    : callClaudeVision(prompt, VISION_EXTRA, cleanB64, mime, true);

  let raw = '';
  const providerErrors: string[] = [];
  for (const p of providerOrder) {
    try {
      raw = await _call(p);
      _ctx.lastProvider      = p;
      _ctx.lastAnalysisError = null;
      console.log(`[NEXUS_VISION] provider=${p} ok mime=${mime} len=${raw.length}`);
      break;
    } catch (err) {
      const axiosBody = (err as { response?: { data?: { error?: { message?: string; type?: string } } } })
        .response?.data?.error;
      const bodyDetail = axiosBody ? ` [${axiosBody.type ?? ''}:${axiosBody.message ?? ''}]` : '';
      const baseMsg    = err instanceof Error ? err.message : String(err);
      const msg        = `${baseMsg}${bodyDetail}`;
      providerErrors.push(`${p}: ${msg.slice(0, 100)}`);
      console.warn(`[NEXUS_VISION] provider=${p} fail="${msg.slice(0, 120)}" — trying next`);
    }
  }

  if (!raw) {
    const allErrors = providerErrors.join(' | ');
    console.error(`[NEXUS_VISION] all_providers_failed errors="${allErrors}"`);
    _ctx.lastAnalysisError = `all_failed: ${allErrors}`;
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

  // Tracking state
  const actionHistory:    string[] = [];
  const screenshotHashes           = new Map<string, number>();
  let screenshotCount              = 0;
  let consecutiveErrors            = 0;
  let sameActionCount              = 0;
  let prevActionType               = '';

  const done = (status: VisionLoopResult['status'], steps: number, error: string | null): VisionLoopResult =>
    ({ taskId, objective, status, steps, lastAnalysis: _ctx.lastAnalysis, error, durationMs: Date.now() - t0, startedAt });

  // Wraps done() + sends Telegram final summary on every exit path
  const finish = (status: VisionLoopResult['status'], steps: number, error: string | null): VisionLoopResult => {
    const r = done(status, steps, error);
    if (demoTelegram) void _sendFinalSummary(r, screenshotCount, _ctx.lastProvider ?? 'aucun', actionHistory);
    return r;
  };

  if (demoTelegram) void _notify(`👁️ *Dzaryx Vision — Démarrage*\n_Objectif:_ ${objective}`);

  for (let step = 1; step <= maxSteps; step++) {

    // ── Guards ────────────────────────────────────────────────────────────────
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

    // ── Screenshot ────────────────────────────────────────────────────────────
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
    if (hashCount > MAX_SAME_SCREENSHOT) {
      console.warn(`[NEXUS_VISION] same_screen hash=${hash} count=${hashCount} — abort`);
      return finish('failed', step - 1, `Écran identique depuis ${hashCount} étapes — boucle détectée`);
    }

    // ── AI Analysis ───────────────────────────────────────────────────────────
    const d = await analyzeScreen(objective, base64, actionHistory, step, maxSteps);
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

    // ── Objective complete / failed ───────────────────────────────────────────
    if (d.objective_status === 'completed' || d.next_action.type === 'DONE') {
      console.log(`[NEXUS_VISION] completed step=${step}`);
      return finish('completed', step, null);
    }
    if (d.objective_status === 'failed') {
      return finish('failed', step, d.reasoning);
    }

    // ── Action selection ──────────────────────────────────────────────────────
    const at = d.next_action.type;
    const ap = d.next_action.payload ?? {};

    // Forbidden action guard
    if (FORBIDDEN_ACTIONS.has(at.toUpperCase())) {
      console.error(`[NEXUS_VISION] forbidden_action="${at}" step=${step}`);
      if (demoTelegram) void _notify(`🚫 *Action interdite bloquée:* \`${at}\``);
      _emergencyStop = true;
      return finish('stopped', step, `Forbidden action: ${at}`);
    }

    // Confidence threshold
    const minConf = RISKY_ACTIONS.has(at.toUpperCase()) ? MIN_CONFIDENCE_RISKY : MIN_CONFIDENCE;
    if (d.confidence < minConf) {
      console.warn(`[NEXUS_VISION] low_confidence=${d.confidence.toFixed(2)} < ${minConf} action=${at} step=${step} — WAIT`);
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

    // ── Execute ───────────────────────────────────────────────────────────────
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
      console.log(`[NEXUS_AUTOMATION] action=${at} step=${step} payload=${JSON.stringify(ap).slice(0, 80)}`);
      if (demoTelegram) void _notify(`🖱️ *Action:* \`${at}\``);
      try {
        const rec = await executeNexusCommand(at as CommandType, { ...ap, notify_telegram: false });
        if (!rec.success) {
          console.warn(`[NEXUS_AUTOMATION] failed action=${at} err="${rec.error?.slice(0, 80)}"`);
        }
      } catch (err) {
        console.error(`[NEXUS_AUTOMATION] error ${at}: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise(r => setTimeout(r, stepDelay));

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
  const taskId   = `vl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
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
