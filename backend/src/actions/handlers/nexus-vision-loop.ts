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
  callGemini, callClaudeVision, callOpenAIVision,
  isGeminiAvailable, isClaudeAvailable, isOpenAIAvailable,
} from '../../integrations/llm-router.js';
import { env } from '../../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VisionContext {
  pcId:              string;
  objective:         string | null;
  lastScreenshot:    string | null;   // '[captured]' when serialized externally
  lastAnalysis:      string | null;
  lastAnalysisError: string | null;   // last error from analyzeScreen (debug)
  lastRawResponse:   string | null;   // first 300 chars of last AI raw response
  lastOcrText:       string | null;
  lastActionType:    string | null;
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

// ── Safety ────────────────────────────────────────────────────────────────────

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

// Rate limiter — max 10 actions / minute (conservative)
const _actionTs: number[] = [];
const MAX_ACTIONS_PER_MIN = 10;

// Hard limit per vision loop run — overrides caller-supplied maxSteps
const MAX_AUTONOMOUS_STEPS = 5;

// Forbidden actions — never execute regardless of AI decision
const FORBIDDEN_ACTIONS = new Set<string>([
  'SHUTDOWN', 'RESTART', 'FORMAT', 'DELETE', 'KILL_PROCESS',
  'REGISTRY_EDIT', 'ADMIN_CMD', 'DISABLE_ANTIVIRUS',
]);

function _checkRate(): boolean {
  const now = Date.now();
  while (_actionTs.length > 0 && now - _actionTs[0]! > 60_000) _actionTs.shift();
  if (_actionTs.length >= MAX_ACTIONS_PER_MIN) return false;
  _actionTs.push(now);
  return true;
}

// Loop detection — 3 identical consecutive actions
function _isLooping(history: string[]): boolean {
  if (history.length < 3) return false;
  const tail = history.slice(-3);
  return tail.every(a => a === tail[0]);
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

// ── Local OCR via Windows Get-Process window titles ───────────────────────────

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

// ── Screen analysis via AI vision ─────────────────────────────────────────────

const VISION_EXTRA = `RÔLE: Tu es le cerveau de contrôle PC de Dzaryx. Tu analyses des captures d'écran Windows.
RÈGLE: Réponds UNIQUEMENT en JSON valide — aucun texte avant ou après.
ACTIONS: SCREENSHOT_DESKTOP, LIST_DESKTOP_FILES, OPEN_FOLDER, OPEN_URL (payload:{url}), OPEN_CHROME, OPEN_VSCODE, SYSTEM_INFO, TERMINAL_COMMAND_SAFE (payload:{command}), WAIT (payload:{ms:2000}), LOCAL_OCR, DONE.
DONE = objectif atteint. WAIT = attendre chargement.`;

function _parseDecision(raw: string): VisionDecision | null {
  const m = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? raw.match(/(\{[\s\S]+\})/s);
  if (!m) return null;
  try { return JSON.parse((m[1] ?? m[2] ?? '').trim()) as VisionDecision; } catch { return null; }
}

// Normalize base64: strip data URI prefix + detect MIME
function _normalizeB64(raw: string): { b64: string; mime: 'image/jpeg' | 'image/png' | 'image/webp' } {
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    const header = comma > 0 ? raw.slice(0, comma) : '';
    const data   = comma > 0 ? raw.slice(comma + 1) : raw;
    const m      = header.match(/data:(image\/[^;]+);base64/);
    const declared = m?.[1] ?? '';
    const valid: Array<'image/jpeg' | 'image/png' | 'image/webp'> = ['image/jpeg', 'image/png', 'image/webp'];
    const mime = (valid.includes(declared as 'image/jpeg') ? declared : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';
    return { b64: data, mime };
  }
  // Raw base64 — detect from magic bytes
  const mime = raw.startsWith('iVBORw0KGgo') ? 'image/png'
    : raw.startsWith('UklGR') ? 'image/webp'
    : 'image/jpeg';
  return { b64: raw, mime };
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

  // Provider chain: try each in order, skip on 429, abort on hard error
  const providerOrder = [
    ...(isGeminiAvailable()  ? ['gemini']  : []),
    ...(isClaudeAvailable()  ? ['claude']  : []),
    ...(isOpenAIAvailable()  ? ['openai']  : []),
  ] as Array<'gemini' | 'claude' | 'openai'>;

  if (providerOrder.length === 0) { console.error('[NEXUS_VISION] no_vision_provider'); return null; }
  console.log(`[NEXUS_VISION] analyze step=${step}/${maxSteps} providers=[${providerOrder.join(',')}] mime=${mime} obj="${objective.slice(0, 50)}"`);

  const _call = (p: 'gemini' | 'claude' | 'openai') =>
    p === 'gemini' ? callGemini(prompt, VISION_EXTRA, cleanB64, mime)
    : p === 'openai' ? callOpenAIVision(prompt, VISION_EXTRA, cleanB64, mime)
    : callClaudeVision(prompt, VISION_EXTRA, cleanB64, mime, true);

  let raw = '';
  let lastErr = '';
  for (const p of providerOrder) {
    try {
      raw = await _call(p);
      _ctx.lastAnalysisError = null;
      console.log(`[NEXUS_VISION] provider=${p} ok mime=${mime}`);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = `${p}: ${msg.slice(0, 80)}`;
      console.warn(`[NEXUS_VISION] provider=${p} fail="${msg.slice(0, 80)}" — trying next`);
      // Try next provider regardless of error type (429, 400, 500 etc.)
      continue;
    }
  }
  if (!raw) {
    console.error(`[NEXUS_VISION] all_providers_failed last="${lastErr}"`);
    _ctx.lastAnalysisError = `all_failed: ${lastErr}`;
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

  const done = (status: VisionLoopResult['status'], steps: number, error: string | null): VisionLoopResult =>
    ({ taskId, objective, status, steps, lastAnalysis: _ctx.lastAnalysis, error, durationMs: Date.now() - t0, startedAt });

  if (demoTelegram) void _notify(`👁️ *Dzaryx analyse l'écran*\n_Objectif:_ ${objective}`);

  const actionHistory: string[] = [];

  for (let step = 1; step <= maxSteps; step++) {
    if (_emergencyStop) {
      console.warn(`[NEXUS_VISION] emergency_stop step=${step}`);
      if (demoTelegram) void _notify('🛑 *NEXUS Vision — Arrêt d\'urgence*');
      return done('stopped', step - 1, 'Emergency stop');
    }
    if (!isNexusOnline()) return done('failed', step - 1, 'Nexus hors ligne');
    if (!_checkRate()) {
      console.warn(`[NEXUS_VISION] rate_limit step=${step} — waiting 10s`);
      await new Promise(r => setTimeout(r, 10_000));
      continue;
    }
    if (_isLooping(actionHistory)) {
      console.warn(`[NEXUS_VISION] loop_detected repeated="${actionHistory.slice(-1)[0]}"`);
      if (demoTelegram) void _notify(`⚠️ *Boucle détectée* — arrêt\n_Répété:_ ${actionHistory.slice(-1)[0]}`);
      return done('failed', step - 1, 'Boucle détectée');
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
    } catch (err) {
      return done('failed', step - 1, `Screenshot: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Analyze
    const d = await analyzeScreen(objective, base64, actionHistory, step, maxSteps);
    if (!d) { await new Promise(r => setTimeout(r, stepDelay)); continue; }

    _ctx.lastAnalysis   = d.screen_analysis;
    _ctx.lastOcrText    = d.ui_elements.join(', ');

    if (demoTelegram) {
      void _notify(`🧠 *Étape ${step}/${maxSteps}*\n${d.screen_analysis.slice(0, 180)}\n→ \`${d.next_action.type}\``);
    }

    if (d.objective_status === 'completed' || d.next_action.type === 'DONE') {
      console.log(`[NEXUS_VISION] completed step=${step}`);
      if (demoTelegram) void _notify(`✅ *Objectif atteint!*\n_${objective}_`);
      return done('completed', step, null);
    }
    if (d.objective_status === 'failed') {
      if (demoTelegram) void _notify(`❌ *Objectif échoué*\n${d.reasoning}`);
      return done('failed', step, d.reasoning);
    }

    // Execute
    const at = d.next_action.type;
    const ap = d.next_action.payload ?? {};

    // Forbidden action guard — hard block regardless of AI decision
    if (FORBIDDEN_ACTIONS.has(at.toUpperCase())) {
      console.error(`[NEXUS_VISION] forbidden_action="${at}" step=${step} — emergency_stop`);
      if (demoTelegram) void _notify(`🚫 *Action interdite bloquée:* \`${at}\` — arrêt d'urgence`);
      _emergencyStop = true;
      return done('stopped', step, `Forbidden action: ${at}`);
    }

    actionHistory.push(at);
    _ctx.lastActionType = at;
    _ctx.actionHistory  = actionHistory.slice(-10);

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
      console.log(`[NEXUS_AUTOMATION] action=${at} step=${step}`);
      if (demoTelegram) void _notify(`🖱️ *Action:* \`${at}\``);
      try {
        const rec = await executeNexusCommand(at as CommandType, { ...ap, notify_telegram: false });
        if (!rec.success) console.warn(`[NEXUS_AUTOMATION] failed action=${at} err="${rec.error?.slice(0, 80)}"`);
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
  if (demoTelegram) void _notify(`⚠️ *Limite atteinte* (${maxSteps} étapes)\n_${objective}_`);
  return done('max_steps', maxSteps, null);
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
