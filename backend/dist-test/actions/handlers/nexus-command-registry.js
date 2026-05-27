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
exports.getCommandHistory = getCommandHistory;
exports.getCommandById = getCommandById;
exports.executeNexusCommand = executeNexusCommand;
exports.getNexusCapabilities = getNexusCapabilities;
/**
 * Nexus Command Registry — Phase 4
 * Centralized desktop action dispatch for all Jarvis/PC commands.
 * Each CommandType has a handler, security check, retry policy, and Telegram feedback.
 */
const nexus_relay_js_1 = require("./nexus-relay.js");
const env_js_1 = require("../../config/env.js");
const nexus_environment_js_1 = require("./nexus-environment.js");
// ── Command history (last 50) ─────────────────────────────────────────────────
const _history = [];
const MAX_HISTORY = 50;
function _record(type, payload) {
    const rec = {
        id: `nc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type,
        payload,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        success: null,
        result: null,
        error: null,
        retries: 0,
    };
    if (_history.length >= MAX_HISTORY)
        _history.shift();
    _history.push(rec);
    return rec;
}
function getCommandHistory() {
    return [..._history].reverse();
}
function getCommandById(id) {
    return _history.find(r => r.id === id);
}
// ── Retry ─────────────────────────────────────────────────────────────────────
const RETRY_PATTERNS = /timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i;
const NO_RETRY_PATTERNS = /permission|EPERM|EACCES|blocked|not connected|offline|queue full|SECURITY/i;
function _shouldRetry(err) {
    if (NO_RETRY_PATTERNS.test(err))
        return false;
    return RETRY_PATTERNS.test(err);
}
async function _withRetry(fn, maxRetry = 2) {
    let lastErr = new Error('unknown');
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
        try {
            const result = await fn();
            return { result, retries: attempt };
        }
        catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
            if (attempt < maxRetry && _shouldRetry(lastErr.message)) {
                const delay = attempt === 0 ? 500 : 1_500;
                console.warn(`[NEXUS_ACTION] retry attempt=${attempt + 1}/${maxRetry} delay=${delay}ms err="${lastErr.message.slice(0, 60)}"`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            break;
        }
    }
    throw lastErr;
}
// ── Security ──────────────────────────────────────────────────────────────────
const BLOCKED_PATH_PATTERNS = [
    /^[a-z]:\\windows/i,
    /^[a-z]:\\system32/i,
    /^[a-z]:\\syswow64/i,
    /^[a-z]:\\boot/i,
    /^[a-z]:\\recovery/i,
    /^[a-z]:\\programdata\\microsoft/i,
];
function _sanitizePath(rawPath) {
    const path = rawPath.trim().replace(/^["']|["']$/g, '');
    for (const pat of BLOCKED_PATH_PATTERNS) {
        if (pat.test(path)) {
            console.warn(`[NEXUS_SECURITY] blocked_path path="${path}"`);
            return { ok: false, path, reason: `Chemin système protégé: ${path}` };
        }
    }
    return { ok: true, path };
}
function _sanitizeUrl(rawUrl) {
    const trimmed = rawUrl.trim();
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const parsed = new URL(withScheme);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            console.warn(`[NEXUS_SECURITY] blocked_url url="${trimmed}" reason=protocol`);
            return { ok: false, url: trimmed, reason: 'Protocole non autorisé (http/https uniquement)' };
        }
        return { ok: true, url: parsed.href };
    }
    catch {
        return { ok: false, url: trimmed, reason: 'URL invalide' };
    }
}
// TERMINAL_COMMAND_SAFE — strict whitelist matching PC _ALLOWED_PREFIXES
const SAFE_CMD_PATTERNS = [
    /^dir(\s|\/|$)/i,
    /^echo\s/i,
    /^type\s/i,
    /^ipconfig(\s|\/|$)/i,
    /^ping\s/i,
    /^netstat(\s|\/|$)/i,
    /^tasklist(\s|\/|$)/i,
    /^systeminfo$/i,
    /^wmic\s/i,
    /^where\s/i,
    /^which\s/i,
    /^powershell\s+-(?:command|noprofile)/i,
    /^git\s+(status|log|branch|diff|remote|show)(\s|$)/i,
    /^node\s+--version$/i,
    /^npm\s+(--version|list|outdated)(\s|$)/i,
    /^python\s+(--version|-m\s+pip\s+list)$/i,
    /^py\s+(--version|-m\s+pip\s+list)$/i,
    /^whoami$/i,
    /^hostname$/i,
];
function _isSafeCommand(cmd) {
    const trimmed = cmd.trim();
    for (const pat of SAFE_CMD_PATTERNS) {
        if (pat.test(trimmed))
            return { ok: true };
    }
    console.warn(`[NEXUS_SECURITY] unsafe_terminal_rejected cmd="${trimmed.slice(0, 80)}"`);
    return { ok: false, reason: `Commande non autorisée: "${trimmed.slice(0, 60)}"` };
}
// ── Telegram helper ───────────────────────────────────────────────────────────
async function _notify(text) {
    const token = env_js_1.env.TELEGRAM_BOT_TOKEN;
    const chatId = env_js_1.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId)
        return;
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text, parse_mode: 'Markdown' }, { timeout: 8_000 });
    }
    catch { /* non-critical */ }
}
const _handlers = {
    async SCREENSHOT_DESKTOP(payload) {
        const caption = payload['caption']
            ?? `📸 NEXUS — ${new Date().toLocaleString('fr-FR')}`;
        console.log(`[NEXUS_SCREENSHOT] capturing caption="${caption.slice(0, 50)}"`);
        const { result, retries } = await _withRetry(() => (0, nexus_relay_js_1.nexusScreenshotBase64)(35_000));
        if (!result.ok)
            throw new Error(result.error ?? 'Screenshot failed');
        console.log(`[NEXUS_SCREENSHOT] ok size_kb=${result.size_kb} hostname=${result.hostname} retries=${retries}`);
        if (payload['notify_telegram'] !== false) {
            void _notify(`📸 *Screenshot NEXUS* capturé\n${result.hostname} — ${result.size_kb}KB`);
        }
        return {
            size_bytes: result.size_bytes,
            size_kb: result.size_kb,
            hostname: result.hostname,
            timestamp: result.timestamp,
            image_base64: result.image_base64,
        };
    },
    async LIST_DESKTOP_FILES(payload) {
        // path=undefined → Python defaults to Desktop; pass absolute path for other dirs
        const path = payload['path'] || undefined;
        console.log(`[NEXUS_ACTION] LIST_DESKTOP_FILES path=${path ?? 'Desktop(default)'}`);
        const { result } = await _withRetry(() => (0, nexus_relay_js_1.nexusFileList)(path, 20_000));
        const count = result.count ?? 0;
        console.log(`[NEXUS_ACTION] LIST_DESKTOP_FILES count=${count}`);
        if (payload['notify_telegram']) {
            void _notify(`📂 *${count} fichiers* sur ${result.path ?? 'Bureau'}`);
        }
        return result;
    },
    async OPEN_FOLDER(payload) {
        const rawPath = payload['path'] ?? '';
        if (!rawPath)
            throw new Error('path requis');
        const sec = _sanitizePath(rawPath);
        if (!sec.ok)
            throw new Error(sec.reason);
        console.log(`[NEXUS_ACTION] OPEN_FOLDER path="${sec.path}"`);
        const { result } = await _withRetry(() => (0, nexus_relay_js_1.nexusFileOpen)(sec.path, 10_000));
        if (!result.ok)
            throw new Error(result.error ?? 'Path not accessible');
        if (payload['notify_telegram'])
            void _notify(`📁 Dossier ouvert: \`${sec.path}\``);
        return result;
    },
    async OPEN_URL(payload) {
        const rawUrl = payload['url'] ?? '';
        if (!rawUrl)
            throw new Error('url requis');
        const sec = _sanitizeUrl(rawUrl);
        if (!sec.ok)
            throw new Error(sec.reason);
        // cmd /c start ensures cmd.exe handles the URL protocol regardless of parent shell
        const cmd = `cmd /c start "" "${sec.url}"`;
        console.log(`[NEXUS_ACTION] OPEN_URL url="${sec.url}"`);
        const { result } = await _withRetry(() => (0, nexus_relay_js_1.nexusRunCommand)(cmd, undefined, 10_000));
        if (payload['notify_telegram'])
            void _notify(`🌐 URL ouverte: ${sec.url}`);
        return result;
    },
    async OPEN_CHROME(_payload) {
        console.log('[NEXUS_ACTION] OPEN_CHROME');
        const { result } = await _withRetry(() => (0, nexus_relay_js_1.nexusAppLaunch)('chrome', 12_000));
        if (!result.ok)
            throw new Error(result.error ?? 'Chrome launch failed');
        void _notify('🌐 *Chrome* lancé depuis NEXUS');
        return result;
    },
    async OPEN_VSCODE(_payload) {
        console.log('[NEXUS_VSCODE] attempt');
        // nexusAppLaunch now includes auto-focus (wait+AppActivate loop in os_agent.py)
        const { result } = await _withRetry(() => (0, nexus_relay_js_1.nexusAppLaunch)('vscode', 20_000));
        const r = result;
        console.log(`[NEXUS_VSCODE] launched=${r.ok} focused=${r.focused ?? 'n/a'} verified=${r.verified ?? 'n/a'} path=${r.path ?? 'n/a'} error=${r.error ?? 'none'}`);
        if (!r.ok)
            throw new Error(r.error ?? 'VS Code launch failed');
        void _notify(`💻 *VS Code* lancé${r.focused ? ' et mis au premier plan' : ''} depuis NEXUS`);
        return result;
    },
    async FOCUS_APP(payload) {
        const app = payload['app'] ?? 'vscode';
        console.log(`[NEXUS_FOCUS] app=${app}`);
        const { result } = await _withRetry(() => (0, nexus_relay_js_1.nexusFocusApp)(app, 10_000));
        const r = result;
        console.log(`[NEXUS_FOCUS] app=${app} success=${r.ok} focused=${r.focused} detail=${r.detail ?? ''}`);
        if (!r.ok)
            throw new Error(`Focus failed for ${app}: ${r.detail ?? 'unknown'}`);
        void _notify(`🎯 *${app}* mis au premier plan`);
        return result;
    },
    async SYSTEM_INFO(_payload) {
        console.log('[NEXUS_SYSTEM] fetching sysinfo');
        const { result: base } = await _withRetry(() => (0, nexus_relay_js_1.nexusSysinfo)(12_000));
        // Disk info (optional — desktop only)
        let disk = null;
        try {
            const r = await (0, nexus_relay_js_1.nexusRunCommand)('wmic logicaldisk where "drivetype=3" get caption,freespace,size /format:csv', undefined, 10_000);
            if (r.ok && r.stdout?.trim())
                disk = { raw: r.stdout.trim() };
        }
        catch { /* optional */ }
        // Battery (optional — laptops only, silently skip on desktops)
        let battery = null;
        try {
            const r = await (0, nexus_relay_js_1.nexusRunCommand)('wmic path win32_battery get estimatedchargeremaining,batterystatus /format:csv', undefined, 8_000);
            if (r.ok && r.stdout?.includes(','))
                battery = { raw: r.stdout.trim() };
        }
        catch { /* optional */ }
        console.log(`[NEXUS_SYSTEM] ok hostname=${base.hostname} os="${base.os}" disk=${!!disk} battery=${!!battery}`);
        return { ...base, disk, battery };
    },
    async TERMINAL_COMMAND_SAFE(payload) {
        const cmd = payload['command']?.trim() ?? '';
        if (!cmd)
            throw new Error('command requis');
        const sec = _isSafeCommand(cmd);
        if (!sec.ok)
            throw new Error(sec.reason);
        const cwd = payload['cwd'];
        const timeoutMs = Math.min(payload['timeout_ms'] ?? 15_000, 30_000);
        console.log(`[NEXUS_ACTION] TERMINAL_COMMAND_SAFE cmd="${cmd.slice(0, 80)}" timeout=${timeoutMs}ms`);
        const { result, retries } = await _withRetry(() => (0, nexus_relay_js_1.nexusRunCommand)(cmd, cwd, timeoutMs));
        console.log(`[NEXUS_ACTION] TERMINAL_COMMAND_SAFE exit=${result.exit_code} stdout_len=${result.stdout.length} retries=${retries}`);
        return result;
    },
    // ── TERMINAL_RUN — extended dev command whitelist, project-aware ──────────
    async TERMINAL_RUN(payload) {
        const command = payload['command']?.trim() ?? '';
        const project = payload['project']?.trim().toLowerCase();
        const cwd = payload['cwd']?.trim();
        const timeoutS = Math.min(payload['timeout_s'] ?? 30, 60);
        if (!command)
            throw new Error('command requis');
        console.log(`[NEXUS_ACTION] TERMINAL_RUN cmd="${command.slice(0, 80)}" project=${project ?? '-'} timeout=${timeoutS}s`);
        const { result } = await _withRetry(() => (0, nexus_relay_js_1.nexusTerminalRun)(command, project, cwd, timeoutS));
        const r = result;
        console.log(`[NEXUS_ACTION] TERMINAL_RUN exit=${r['exit_code']} elapsed=${r['elapsed_ms']}ms ok=${r['ok']}`);
        if (!r['ok'])
            throw new Error(r['error'] ?? `Command failed (exit ${r['exit_code']})`);
        (0, nexus_environment_js_1.updateEnvironment)({
            activeProject: project ?? null,
            activeWorkingDir: r['cwd'] ?? null,
            lastCommand: command,
            lastCommandStatus: 'ok',
            lastCommandOutput: (r['stdout'] ?? '').slice(0, 500),
            lastCommandElapsedMs: r['elapsed_ms'] ?? null,
        });
        return result;
    },
    // ── PROJECT_OPEN — open VS Code in project directory ─────────────────────
    async PROJECT_OPEN(payload) {
        const raw = payload['project']?.trim() ?? '';
        if (!raw)
            throw new Error('project requis');
        const proj = (0, nexus_environment_js_1.resolveProject)(raw);
        if (!proj) {
            throw new Error(`Projet inconnu: "${raw}". Disponibles: ${Object.keys(nexus_environment_js_1.PROJECT_REGISTRY).join(', ')}`);
        }
        console.log(`[NEXUS_ACTION] PROJECT_OPEN project=${proj.key} path=${proj.path}`);
        // Launch VS Code in project directory
        const { result } = await _withRetry(() => (0, nexus_relay_js_1.nexusAppLaunch)('vscode', 20_000));
        // Also send OPEN_FOLDER so VS Code opens the right directory
        void (0, nexus_relay_js_1.nexusRunCommand)(`"${String.raw `C:\Users\douba\AppData\Local\Programs\Microsoft VS Code\Code.exe`}" "${proj.path}"`, undefined, 10_000).catch(() => { });
        (0, nexus_environment_js_1.updateEnvironment)({ activeProject: proj.key, activeWorkingDir: proj.path });
        void _notify(`📂 *${proj.key}* ouvert dans VS Code\n\`${proj.path}\``);
        return { ok: true, project: proj.key, path: proj.path, vscode: result };
    },
    // ── PROJECT_STATUS — return environment + last command status ────────────
    async PROJECT_STATUS(_payload) {
        console.log('[NEXUS_ACTION] PROJECT_STATUS');
        const env_ = (0, nexus_environment_js_1.getEnvironment)();
        const r = await (0, nexus_relay_js_1.nexusGetEnvironment)(5_000);
        const pcEnv = r.result;
        return { ok: true, environment: env_, pc_environment: pcEnv };
    },
    // ── CLAUDE_CODE_START — run claude CLI in project with optional prompt ────
    async CLAUDE_CODE_START(payload) {
        const raw = payload['project']?.trim() ?? 'dzaryx';
        const prompt = payload['prompt']?.trim();
        const timeoutS = Math.min(payload['timeout_s'] ?? 90, 180);
        const proj = (0, nexus_environment_js_1.resolveProject)(raw) ?? (0, nexus_environment_js_1.resolveProject)('dzaryx');
        console.log(`[NEXUS_ACTION] CLAUDE_CODE_START project=${proj.key} prompt="${(prompt ?? '').slice(0, 60)}" timeout=${timeoutS}s`);
        const { result } = await _withRetry(() => (0, nexus_relay_js_1.nexusClaudeCodeStart)(proj.key, prompt, timeoutS));
        const r = result;
        if (r['output']) {
            const outputPreview = r['output'].slice(0, 800);
            void _notify(`🤖 *Claude Code* \\(${proj.key}\\)\n\n${outputPreview}`);
            (0, nexus_environment_js_1.updateEnvironment)({
                activeProject: proj.key,
                activeWorkingDir: proj.path,
                lastCommand: prompt ? `claude --print "${prompt.slice(0, 60)}"` : 'claude',
                lastCommandStatus: r['ok'] ? 'ok' : 'error',
                lastCommandOutput: outputPreview.slice(0, 500),
                lastCommandElapsedMs: r['elapsed_ms'] ?? null,
            });
        }
        if (!r['ok'] && !r['launched']) {
            throw new Error(r['error'] ?? 'Claude Code failed');
        }
        return result;
    },
};
// ── Main dispatch ─────────────────────────────────────────────────────────────
async function executeNexusCommand(type, payload = {}) {
    const rec = _record(type, payload);
    console.log(`[NEXUS_ACTION] start id=${rec.id} type=${type}`);
    if (!(0, nexus_relay_js_1.isNexusOnline)()) {
        rec.completed_at = new Date().toISOString();
        rec.success = false;
        rec.error = 'Nexus hors ligne';
        console.warn(`[NEXUS_ACTION] offline id=${rec.id} type=${type}`);
        return rec;
    }
    const handler = _handlers[type];
    if (!handler) {
        rec.completed_at = new Date().toISOString();
        rec.success = false;
        rec.error = `Type de commande inconnu: ${type}`;
        return rec;
    }
    rec.started_at = new Date().toISOString();
    try {
        rec.result = await handler(payload);
        rec.success = true;
        rec.completed_at = new Date().toISOString();
        const ms = Date.now() - new Date(rec.started_at).getTime();
        console.log(`[NEXUS_ACTION] done id=${rec.id} type=${type} ms=${ms}`);
    }
    catch (err) {
        rec.success = false;
        rec.error = err instanceof Error ? err.message : String(err);
        rec.completed_at = new Date().toISOString();
        const ms = Date.now() - new Date(rec.started_at).getTime();
        console.error(`[NEXUS_ACTION] fail id=${rec.id} type=${type} ms=${ms} err="${rec.error?.slice(0, 120)}"`);
    }
    return rec;
}
// ── Capabilities ──────────────────────────────────────────────────────────────
function getNexusCapabilities() {
    return {
        online: (0, nexus_relay_js_1.isNexusOnline)(),
        screenshots: true,
        file_browser: true,
        app_launch: true,
        chrome: true,
        vscode: true,
        focus_app: true,
        terminal_safe: true,
        system_info: true,
        telegram_photo: true,
        terminal_run: true,
        project_open: true,
        claude_code: true,
        commands: Object.keys(_handlers),
        projects: Object.keys(nexus_environment_js_1.PROJECT_REGISTRY),
    };
}
//# sourceMappingURL=nexus-command-registry.js.map