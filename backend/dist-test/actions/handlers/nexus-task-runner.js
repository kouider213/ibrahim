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
exports.getTask = getTask;
exports.listTasks = listTasks;
exports.cancelTask = cancelTask;
exports.createAndStartTask = createAndStartTask;
/**
 * Nexus Task Runner — High-level task decomposition and background execution.
 * Breaks objectives into typed steps with vision verification between actions.
 */
const nexus_command_registry_js_1 = require("./nexus-command-registry.js");
const nexus_vision_loop_js_1 = require("./nexus-vision-loop.js");
const nexus_relay_js_1 = require("./nexus-relay.js");
const llm_router_js_1 = require("../../integrations/llm-router.js");
const env_js_1 = require("../../config/env.js");
// ── Task store (last 100) ─────────────────────────────────────────────────────
const _tasks = new Map();
const MAX_TASKS = 100;
function _newTask(objective, demo) {
    const id = `nt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    if (_tasks.size >= MAX_TASKS) {
        const oldest = _tasks.keys().next().value;
        if (oldest)
            _tasks.delete(oldest);
    }
    const task = {
        id, objective, status: 'queued', steps: [],
        createdAt: new Date().toISOString(),
        startedAt: null, completedAt: null, error: null,
        demoTelegram: demo, actionsCount: 0,
    };
    _tasks.set(id, task);
    return task;
}
function getTask(id) {
    return _tasks.get(id) ?? null;
}
function listTasks(limit = 20) {
    return [..._tasks.values()].reverse().slice(0, limit);
}
function cancelTask(id) {
    const t = _tasks.get(id);
    if (!t || t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
        return false;
    t.status = 'cancelled';
    t.completedAt = new Date().toISOString();
    console.log(`[NEXUS_TASK] cancelled taskId=${id}`);
    return true;
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
// ── Step execution ────────────────────────────────────────────────────────────
async function _execStep(step, task) {
    if (task.status === 'cancelled') {
        step.status = 'cancelled';
        return;
    }
    step.status = 'running';
    step.startedAt = new Date().toISOString();
    console.log(`[NEXUS_TASK] step_start taskId=${task.id} type=${step.type} desc="${step.description.slice(0, 60)}"`);
    if (task.demoTelegram)
        void _notify(`⚡ *${step.description}*`);
    try {
        switch (step.type) {
            case 'COMMAND': {
                if (!step.command)
                    throw new Error('command required for COMMAND step');
                const rec = await (0, nexus_command_registry_js_1.executeNexusCommand)(step.command, step.payload ?? {});
                step.result = rec.result;
                if (!rec.success)
                    throw new Error(rec.error ?? `${step.command} failed`);
                task.actionsCount++;
                step.status = 'completed';
                break;
            }
            case 'WAIT': {
                const ms = Math.min(step.payload?.['ms'] ?? 2_000, 30_000);
                await new Promise(r => setTimeout(r, ms));
                step.result = { waited_ms: ms };
                step.status = 'completed';
                break;
            }
            case 'VISION_CHECK': {
                const rec = await (0, nexus_command_registry_js_1.executeNexusCommand)('SCREENSHOT_DESKTOP', { notify_telegram: task.demoTelegram });
                step.result = rec.result;
                if (!rec.success)
                    throw new Error(rec.error ?? 'Screenshot failed');
                task.actionsCount++;
                step.status = 'completed';
                break;
            }
            case 'VISION_LOOP': {
                task.status = 'waiting_vision';
                const lr = await (0, nexus_vision_loop_js_1.runVisionLoop)(step.visionQ ?? task.objective, {
                    maxSteps: 10,
                    stepDelay: 2_000,
                    demoTelegram: task.demoTelegram,
                    taskId: `${task.id}_vl`,
                });
                step.result = lr;
                task.actionsCount += lr.steps;
                if (lr.status !== 'completed')
                    throw new Error(lr.error ?? lr.status);
                step.status = 'completed';
                task.status = 'running';
                break;
            }
        }
    }
    catch (err) {
        step.status = 'failed';
        step.error = err instanceof Error ? err.message : String(err);
        console.error(`[NEXUS_TASK] step_fail taskId=${task.id} err="${step.error?.slice(0, 100)}"`);
    }
    finally {
        step.doneAt = new Date().toISOString();
    }
}
// ── Task decomposition via AI ─────────────────────────────────────────────────
const DECOMPOSE_EXTRA = `Tu es Dzaryx. Décompose une tâche PC en étapes concrètes.
StepTypes: COMMAND (executer CommandType), WAIT (payload:{ms}), VISION_CHECK (screenshot), VISION_LOOP (boucle vision autonome).
CommandTypes disponibles: SCREENSHOT_DESKTOP, LIST_DESKTOP_FILES, OPEN_FOLDER, OPEN_URL, OPEN_CHROME, OPEN_VSCODE, SYSTEM_INFO, TERMINAL_COMMAND_SAFE.
Réponds UNIQUEMENT en JSON: {"steps":[{"type":"COMMAND","description":"...","command":"OPEN_CHROME","payload":{}},{"type":"WAIT","description":"Attendre","payload":{"ms":2000}},...]}`;
function _parseSteps(raw, taskId) {
    const m = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? raw.match(/(\{[\s\S]+\})/s);
    if (!m)
        return [];
    try {
        const p = JSON.parse((m[1] ?? m[2] ?? '').trim());
        if (!Array.isArray(p.steps) || p.steps.length === 0)
            return [];
        return p.steps.map((s, i) => ({
            id: `${taskId}_s${i}`,
            type: s['type'] ?? 'COMMAND',
            description: s['description'] ?? `Étape ${i + 1}`,
            command: s['command'],
            payload: s['payload'] ?? {},
            visionQ: s['visionQ'],
            confirm: s['confirm'] ?? false,
            status: 'pending', startedAt: null, doneAt: null, result: null, error: null,
        }));
    }
    catch {
        return [];
    }
}
function _fallbackStep(objective, taskId) {
    return [{
            id: `${taskId}_s0`, type: 'VISION_LOOP', description: `Exécution autonome: ${objective}`,
            visionQ: objective, confirm: false,
            status: 'pending', startedAt: null, doneAt: null, result: null, error: null,
        }];
}
async function _decompose(objective, taskId) {
    const prompt = `Décompose cette tâche PC en étapes: "${objective}"`;
    let raw = '';
    try {
        if ((0, llm_router_js_1.isGroqAvailable)())
            raw = await (0, llm_router_js_1.callGroq)(prompt, DECOMPOSE_EXTRA);
        else if ((0, llm_router_js_1.isGeminiAvailable)())
            raw = await (0, llm_router_js_1.callGemini)(prompt, DECOMPOSE_EXTRA);
        else
            return _fallbackStep(objective, taskId);
    }
    catch (err) {
        console.warn(`[NEXUS_TASK] decompose_error: ${err instanceof Error ? err.message : String(err)}`);
        return _fallbackStep(objective, taskId);
    }
    const steps = _parseSteps(raw, taskId);
    console.log(`[NEXUS_TASK] decomposed "${objective.slice(0, 50)}" → ${steps.length} steps`);
    return steps.length > 0 ? steps : _fallbackStep(objective, taskId);
}
// ── Task runner (background) ──────────────────────────────────────────────────
// TypeScript narrows task.status after assignment, so we use this helper to prevent false positives
function _cancelled(t) { return t.status === 'cancelled'; }
async function _runTask(task) {
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    console.log(`[NEXUS_TASK] start taskId=${task.id} steps=${task.steps.length} obj="${task.objective.slice(0, 60)}"`);
    if (task.demoTelegram) {
        void _notify(`🤖 *Tâche démarrée*\n_${task.objective}_\n${task.steps.length} étapes planifiées`);
    }
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        task.status = 'failed';
        task.error = 'Nexus hors ligne';
        task.completedAt = new Date().toISOString();
        console.error(`[NEXUS_TASK] nexus_offline taskId=${task.id}`);
        return;
    }
    for (const step of task.steps) {
        if (_cancelled(task)) {
            step.status = 'cancelled';
            continue;
        }
        await _execStep(step, task);
        if (step.status === 'failed') {
            task.status = 'failed';
            task.error = `"${step.description}": ${step.error ?? 'unknown'}`;
            task.completedAt = new Date().toISOString();
            if (task.demoTelegram)
                void _notify(`❌ *Tâche échouée*\n_${task.objective}_\n${task.error}`);
            console.error(`[NEXUS_TASK] failed taskId=${task.id} at="${step.description}"`);
            return;
        }
    }
    if (!_cancelled(task)) {
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        console.log(`[NEXUS_TASK] completed taskId=${task.id} actions=${task.actionsCount}`);
        if (task.demoTelegram)
            void _notify(`✅ *Tâche complétée!*\n_${task.objective}_\n${task.actionsCount} actions`);
    }
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Create task from objective (AI-decomposed) or predefined steps, run in background.
 * Returns the task immediately — poll GET /api/nexus/tasks/:id for live status.
 */
async function createAndStartTask(objective, steps, demoTelegram = true) {
    const task = _newTask(objective, demoTelegram);
    if (steps && steps.length > 0) {
        task.steps = steps.map((s, i) => ({
            id: `${task.id}_s${i}`,
            type: (s.type ?? 'COMMAND'),
            description: s.description ?? `Étape ${i + 1}`,
            command: s.command,
            payload: s.payload ?? {},
            visionQ: s.visionQ,
            confirm: s.confirm ?? false,
            status: 'pending', startedAt: null, doneAt: null, result: null, error: null,
        }));
    }
    else {
        task.steps = await _decompose(objective, task.id);
    }
    console.log(`[NEXUS_TASK] created taskId=${task.id} steps=${task.steps.length}`);
    void _runTask(task);
    return task;
}
//# sourceMappingURL=nexus-task-runner.js.map