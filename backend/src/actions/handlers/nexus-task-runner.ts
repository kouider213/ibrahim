/**
 * Nexus Task Runner — High-level task decomposition and background execution.
 * Breaks objectives into typed steps with vision verification between actions.
 */
import { executeNexusCommand } from './nexus-command-registry.js';
import type { CommandType } from './nexus-command-registry.js';
import { runVisionLoop } from './nexus-vision-loop.js';
import { isNexusOnline } from './nexus-relay.js';
import {
  callGroq, callGemini,
  isGroqAvailable, isGeminiAvailable,
} from '../../integrations/llm-router.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'queued' | 'running' | 'waiting_vision' | 'waiting_user' | 'completed' | 'failed' | 'cancelled';

export type StepType   = 'COMMAND' | 'VISION_CHECK' | 'WAIT' | 'VISION_LOOP';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export interface TaskStep {
  id:          string;
  type:        StepType;
  description: string;
  command?:    CommandType;
  payload?:    Record<string, unknown>;
  visionQ?:    string;       // question for VISION_CHECK / VISION_LOOP
  confirm?:    boolean;      // reserved for future user-confirmation flow
  status:      StepStatus;
  startedAt:   string | null;
  doneAt:      string | null;
  result:      unknown;
  error:       string | null;
}

export interface NexusAutomationTask {
  id:           string;
  objective:    string;
  status:       TaskStatus;
  steps:        TaskStep[];
  createdAt:    string;
  startedAt:    string | null;
  completedAt:  string | null;
  error:        string | null;
  demoTelegram: boolean;
  actionsCount: number;
}

// ── Task store (last 100) ─────────────────────────────────────────────────────

const _tasks = new Map<string, NexusAutomationTask>();
const MAX_TASKS = 100;

function _newTask(objective: string, demo: boolean): NexusAutomationTask {
  const id = `nt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  if (_tasks.size >= MAX_TASKS) {
    const oldest = _tasks.keys().next().value;
    if (oldest) _tasks.delete(oldest);
  }
  const task: NexusAutomationTask = {
    id, objective, status: 'queued', steps: [],
    createdAt: new Date().toISOString(),
    startedAt: null, completedAt: null, error: null,
    demoTelegram: demo, actionsCount: 0,
  };
  _tasks.set(id, task);
  return task;
}

export function getTask(id: string): NexusAutomationTask | null {
  return _tasks.get(id) ?? null;
}

export function listTasks(limit = 20): NexusAutomationTask[] {
  return [..._tasks.values()].reverse().slice(0, limit);
}

export function cancelTask(id: string): boolean {
  const t = _tasks.get(id);
  if (!t || t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') return false;
  t.status      = 'cancelled';
  t.completedAt = new Date().toISOString();
  console.log(`[NEXUS_TASK] cancelled taskId=${id}`);
  return true;
}

// ── App notification helper ───────────────────────────────────────────────────

async function _notify(text: string): Promise<void> {
  try {
    const { emitProactive } = await import('../../notifications/mobile-push.js');
    const clean = text.replace(/\*/g, '').replace(/_/g, '').trim();
    emitProactive(clean.slice(0, 120), 'info', clean, 'kouider');
  } catch { /* non-critical */ }
}

// ── Step execution ────────────────────────────────────────────────────────────

async function _execStep(step: TaskStep, task: NexusAutomationTask): Promise<void> {
  if (task.status === 'cancelled') { step.status = 'cancelled'; return; }

  step.status    = 'running';
  step.startedAt = new Date().toISOString();
  console.log(`[NEXUS_TASK] step_start taskId=${task.id} type=${step.type} desc="${step.description.slice(0, 60)}"`);
  if (task.demoTelegram) void _notify(`⚡ *${step.description}*`);

  try {
    switch (step.type) {
      case 'COMMAND': {
        if (!step.command) throw new Error('command required for COMMAND step');
        const rec = await executeNexusCommand(step.command, step.payload ?? {});
        step.result = rec.result;
        if (!rec.success) throw new Error(rec.error ?? `${step.command} failed`);
        task.actionsCount++;
        step.status = 'completed';
        break;
      }

      case 'WAIT': {
        const ms = Math.min((step.payload?.['ms'] as number | undefined) ?? 2_000, 30_000);
        await new Promise(r => setTimeout(r, ms));
        step.result = { waited_ms: ms };
        step.status = 'completed';
        break;
      }

      case 'VISION_CHECK': {
        const rec = await executeNexusCommand('SCREENSHOT_DESKTOP', { notify_telegram: task.demoTelegram });
        step.result = rec.result;
        if (!rec.success) throw new Error(rec.error ?? 'Screenshot failed');
        task.actionsCount++;
        step.status = 'completed';
        break;
      }

      case 'VISION_LOOP': {
        task.status = 'waiting_vision';
        const lr = await runVisionLoop(step.visionQ ?? task.objective, {
          maxSteps:     10,
          stepDelay:    2_000,
          demoTelegram: task.demoTelegram,
          taskId:       `${task.id}_vl`,
        });
        step.result     = lr;
        task.actionsCount += lr.steps;
        if (lr.status !== 'completed') throw new Error(lr.error ?? lr.status);
        step.status = 'completed';
        task.status = 'running';
        break;
      }
    }
  } catch (err) {
    step.status = 'failed';
    step.error  = err instanceof Error ? err.message : String(err);
    console.error(`[NEXUS_TASK] step_fail taskId=${task.id} err="${step.error?.slice(0, 100)}"`);
  } finally {
    step.doneAt = new Date().toISOString();
  }
}

// ── Task decomposition via AI ─────────────────────────────────────────────────

const DECOMPOSE_EXTRA = `Tu es Dzaryx. Décompose une tâche PC en étapes concrètes.
StepTypes: COMMAND (executer CommandType), WAIT (payload:{ms}), VISION_CHECK (screenshot), VISION_LOOP (boucle vision autonome).
CommandTypes disponibles: SCREENSHOT_DESKTOP, LIST_DESKTOP_FILES, OPEN_FOLDER, OPEN_URL, OPEN_CHROME, OPEN_VSCODE, SYSTEM_INFO, TERMINAL_COMMAND_SAFE.
Réponds UNIQUEMENT en JSON: {"steps":[{"type":"COMMAND","description":"...","command":"OPEN_CHROME","payload":{}},{"type":"WAIT","description":"Attendre","payload":{"ms":2000}},...]}`;

function _parseSteps(raw: string, taskId: string): TaskStep[] {
  const m = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? raw.match(/(\{[\s\S]+\})/s);
  if (!m) return [];
  try {
    const p = JSON.parse((m[1] ?? m[2] ?? '').trim()) as { steps?: Array<Record<string, unknown>> };
    if (!Array.isArray(p.steps) || p.steps.length === 0) return [];
    return p.steps.map((s, i): TaskStep => ({
      id:          `${taskId}_s${i}`,
      type:        (s['type'] as StepType)      ?? 'COMMAND',
      description: (s['description'] as string) ?? `Étape ${i + 1}`,
      command:     s['command']  as CommandType | undefined,
      payload:     (s['payload'] as Record<string, unknown>) ?? {},
      visionQ:     s['visionQ'] as string | undefined,
      confirm:     (s['confirm'] as boolean | undefined) ?? false,
      status: 'pending', startedAt: null, doneAt: null, result: null, error: null,
    }));
  } catch { return []; }
}

function _fallbackStep(objective: string, taskId: string): TaskStep[] {
  return [{
    id: `${taskId}_s0`, type: 'VISION_LOOP', description: `Exécution autonome: ${objective}`,
    visionQ: objective, confirm: false,
    status: 'pending', startedAt: null, doneAt: null, result: null, error: null,
  }];
}

async function _decompose(objective: string, taskId: string): Promise<TaskStep[]> {
  const prompt = `Décompose cette tâche PC en étapes: "${objective}"`;
  let raw = '';
  try {
    if (isGroqAvailable())        raw = await callGroq(prompt, DECOMPOSE_EXTRA);
    else if (isGeminiAvailable()) raw = await callGemini(prompt, DECOMPOSE_EXTRA);
    else return _fallbackStep(objective, taskId);
  } catch (err) {
    console.warn(`[NEXUS_TASK] decompose_error: ${err instanceof Error ? err.message : String(err)}`);
    return _fallbackStep(objective, taskId);
  }
  const steps = _parseSteps(raw, taskId);
  console.log(`[NEXUS_TASK] decomposed "${objective.slice(0, 50)}" → ${steps.length} steps`);
  return steps.length > 0 ? steps : _fallbackStep(objective, taskId);
}

// ── Task runner (background) ──────────────────────────────────────────────────

// TypeScript narrows task.status after assignment, so we use this helper to prevent false positives
function _cancelled(t: NexusAutomationTask): boolean { return t.status === 'cancelled'; }

async function _runTask(task: NexusAutomationTask): Promise<void> {
  (task as { status: TaskStatus }).status = 'running';
  task.startedAt = new Date().toISOString();
  console.log(`[NEXUS_TASK] start taskId=${task.id} steps=${task.steps.length} obj="${task.objective.slice(0, 60)}"`);

  if (task.demoTelegram) {
    void _notify(`🤖 *Tâche démarrée*\n_${task.objective}_\n${task.steps.length} étapes planifiées`);
  }

  if (!isNexusOnline()) {
    task.status = 'failed'; task.error = 'Nexus hors ligne';
    task.completedAt = new Date().toISOString();
    console.error(`[NEXUS_TASK] nexus_offline taskId=${task.id}`);
    return;
  }

  for (const step of task.steps) {
    if (_cancelled(task)) { step.status = 'cancelled'; continue; }
    await _execStep(step, task);
    if (step.status === 'failed') {
      (task as { status: TaskStatus }).status = 'failed';
      task.error       = `"${step.description}": ${step.error ?? 'unknown'}`;
      task.completedAt = new Date().toISOString();
      if (task.demoTelegram) void _notify(`❌ *Tâche échouée*\n_${task.objective}_\n${task.error}`);
      console.error(`[NEXUS_TASK] failed taskId=${task.id} at="${step.description}"`);
      return;
    }
  }

  if (!_cancelled(task)) {
    task.status = 'completed'; task.completedAt = new Date().toISOString();
    console.log(`[NEXUS_TASK] completed taskId=${task.id} actions=${task.actionsCount}`);
    if (task.demoTelegram) void _notify(`✅ *Tâche complétée!*\n_${task.objective}_\n${task.actionsCount} actions`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create task from objective (AI-decomposed) or predefined steps, run in background.
 * Returns the task immediately — poll GET /api/nexus/tasks/:id for live status.
 */
export async function createAndStartTask(
  objective:    string,
  steps?:       Array<Partial<TaskStep>>,
  demoTelegram  = true,
): Promise<NexusAutomationTask> {
  const task = _newTask(objective, demoTelegram);

  if (steps && steps.length > 0) {
    task.steps = steps.map((s, i): TaskStep => ({
      id:          `${task.id}_s${i}`,
      type:        (s.type ?? 'COMMAND') as StepType,
      description: s.description ?? `Étape ${i + 1}`,
      command:     s.command as CommandType | undefined,
      payload:     s.payload ?? {},
      visionQ:     s.visionQ,
      confirm:     s.confirm ?? false,
      status:      'pending', startedAt: null, doneAt: null, result: null, error: null,
    }));
  } else {
    task.steps = await _decompose(objective, task.id);
  }

  console.log(`[NEXUS_TASK] created taskId=${task.id} steps=${task.steps.length}`);
  void _runTask(task);
  return task;
}
