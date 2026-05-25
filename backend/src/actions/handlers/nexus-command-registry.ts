/**
 * Nexus Command Registry — Phase 4
 * Centralized desktop action dispatch for all Jarvis/PC commands.
 * Each CommandType has a handler, security check, retry policy, and Telegram feedback.
 */
import {
  nexusScreenshotBase64,
  nexusFileList,
  nexusFileOpen,
  nexusAppLaunch,
  nexusFocusApp,
  nexusSysinfo,
  nexusRunCommand,
  nexusTerminalRun,
  nexusClaudeCodeStart,
  nexusGetEnvironment,
  isNexusOnline,
} from './nexus-relay.js';
import { resolveProject, updateEnvironment, getEnvironment, PROJECT_REGISTRY } from './nexus-environment.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CommandType =
  | 'SCREENSHOT_DESKTOP'
  | 'LIST_DESKTOP_FILES'
  | 'OPEN_FOLDER'
  | 'OPEN_URL'
  | 'OPEN_CHROME'
  | 'OPEN_VSCODE'
  | 'FOCUS_APP'
  | 'SYSTEM_INFO'
  | 'TERMINAL_COMMAND_SAFE'
  | 'TERMINAL_RUN'
  | 'PROJECT_OPEN'
  | 'PROJECT_STATUS'
  | 'CLAUDE_CODE_START';

export interface NexusCommandRecord {
  id:           string;
  type:         CommandType;
  payload:      Record<string, unknown>;
  created_at:   string;
  started_at:   string | null;
  completed_at: string | null;
  success:      boolean | null;
  result:       unknown;
  error:        string | null;
  retries:      number;
}

export interface NexusCapabilities {
  online:        boolean;
  screenshots:   boolean;
  file_browser:  boolean;
  app_launch:    boolean;
  chrome:        boolean;
  vscode:        boolean;
  focus_app:      boolean;
  terminal_safe:  boolean;
  terminal_run:   boolean;
  project_open:   boolean;
  claude_code:    boolean;
  system_info:    boolean;
  telegram_photo: boolean;
  commands:       CommandType[];
  projects:       string[];
}

// ── Command history (last 50) ─────────────────────────────────────────────────

const _history: NexusCommandRecord[] = [];
const MAX_HISTORY = 50;

function _record(type: CommandType, payload: Record<string, unknown>): NexusCommandRecord {
  const rec: NexusCommandRecord = {
    id:           `nc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    payload,
    created_at:   new Date().toISOString(),
    started_at:   null,
    completed_at: null,
    success:      null,
    result:       null,
    error:        null,
    retries:      0,
  };
  if (_history.length >= MAX_HISTORY) _history.shift();
  _history.push(rec);
  return rec;
}

export function getCommandHistory(): NexusCommandRecord[] {
  return [..._history].reverse();
}

export function getCommandById(id: string): NexusCommandRecord | undefined {
  return _history.find(r => r.id === id);
}

// ── Retry ─────────────────────────────────────────────────────────────────────

const RETRY_PATTERNS    = /timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i;
const NO_RETRY_PATTERNS = /permission|EPERM|EACCES|blocked|not connected|offline|queue full|SECURITY/i;

function _shouldRetry(err: string): boolean {
  if (NO_RETRY_PATTERNS.test(err)) return false;
  return RETRY_PATTERNS.test(err);
}

async function _withRetry<T>(fn: () => Promise<T>, maxRetry = 2): Promise<{ result: T; retries: number }> {
  let lastErr: Error = new Error('unknown');
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const result = await fn();
      return { result, retries: attempt };
    } catch (err) {
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

const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^[a-z]:\\windows/i,
  /^[a-z]:\\system32/i,
  /^[a-z]:\\syswow64/i,
  /^[a-z]:\\boot/i,
  /^[a-z]:\\recovery/i,
  /^[a-z]:\\programdata\\microsoft/i,
];

function _sanitizePath(rawPath: string): { ok: boolean; path: string; reason?: string } {
  const path = rawPath.trim().replace(/^["']|["']$/g, '');
  for (const pat of BLOCKED_PATH_PATTERNS) {
    if (pat.test(path)) {
      console.warn(`[NEXUS_SECURITY] blocked_path path="${path}"`);
      return { ok: false, path, reason: `Chemin système protégé: ${path}` };
    }
  }
  return { ok: true, path };
}

function _sanitizeUrl(rawUrl: string): { ok: boolean; url: string; reason?: string } {
  const trimmed = rawUrl.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.warn(`[NEXUS_SECURITY] blocked_url url="${trimmed}" reason=protocol`);
      return { ok: false, url: trimmed, reason: 'Protocole non autorisé (http/https uniquement)' };
    }
    return { ok: true, url: parsed.href };
  } catch {
    return { ok: false, url: trimmed, reason: 'URL invalide' };
  }
}

// TERMINAL_COMMAND_SAFE — strict whitelist matching PC _ALLOWED_PREFIXES
const SAFE_CMD_PATTERNS: RegExp[] = [
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

function _isSafeCommand(cmd: string): { ok: boolean; reason?: string } {
  const trimmed = cmd.trim();
  for (const pat of SAFE_CMD_PATTERNS) {
    if (pat.test(trimmed)) return { ok: true };
  }
  console.warn(`[NEXUS_SECURITY] unsafe_terminal_rejected cmd="${trimmed.slice(0, 80)}"`);
  return { ok: false, reason: `Commande non autorisée: "${trimmed.slice(0, 60)}"` };
}

// ── App notification helper ───────────────────────────────────────────────────

async function _notify(text: string): Promise<void> {
  try {
    const { emitProactive } = await import('../../notifications/mobile-push.js');
    const clean = text.replace(/\*/g, '').replace(/_/g, '').trim();
    emitProactive(clean.slice(0, 120), 'info', clean, 'kouider');
  } catch { /* non-critical */ }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

type Handler = (payload: Record<string, unknown>) => Promise<unknown>;

const _handlers: Record<CommandType, Handler> = {

  async SCREENSHOT_DESKTOP(payload) {
    const caption = (payload['caption'] as string | undefined)
      ?? `📸 NEXUS — ${new Date().toLocaleString('fr-FR')}`;
    console.log(`[NEXUS_SCREENSHOT] capturing caption="${caption.slice(0, 50)}"`);
    const { result, retries } = await _withRetry(() => nexusScreenshotBase64(35_000));
    if (!result.ok) throw new Error(result.error ?? 'Screenshot failed');
    console.log(`[NEXUS_SCREENSHOT] ok size_kb=${result.size_kb} hostname=${result.hostname} retries=${retries}`);
    if (payload['notify_telegram'] !== false) {
      void _notify(`📸 *Screenshot NEXUS* capturé\n${result.hostname} — ${result.size_kb}KB`);
    }
    return {
      size_bytes:   result.size_bytes,
      size_kb:      result.size_kb,
      hostname:     result.hostname,
      timestamp:    result.timestamp,
      image_base64: result.image_base64,
    };
  },

  async LIST_DESKTOP_FILES(payload) {
    // path=undefined → Python defaults to Desktop; pass absolute path for other dirs
    const path = (payload['path'] as string | undefined) || undefined;
    console.log(`[NEXUS_ACTION] LIST_DESKTOP_FILES path=${path ?? 'Desktop(default)'}`);
    const { result } = await _withRetry(() => nexusFileList(path, 20_000));
    const count = (result as { count?: number }).count ?? 0;
    console.log(`[NEXUS_ACTION] LIST_DESKTOP_FILES count=${count}`);
    if (payload['notify_telegram']) {
      void _notify(`📂 *${count} fichiers* sur ${(result as { path?: string }).path ?? 'Bureau'}`);
    }
    return result;
  },

  async OPEN_FOLDER(payload) {
    const rawPath = (payload['path'] as string | undefined) ?? '';
    if (!rawPath) throw new Error('path requis');
    const sec = _sanitizePath(rawPath);
    if (!sec.ok) throw new Error(sec.reason);
    console.log(`[NEXUS_ACTION] OPEN_FOLDER path="${sec.path}"`);
    const { result } = await _withRetry(() => nexusFileOpen(sec.path, 10_000));
    if (!(result as { ok?: boolean }).ok) throw new Error((result as { error?: string }).error ?? 'Path not accessible');
    if (payload['notify_telegram']) void _notify(`📁 Dossier ouvert: \`${sec.path}\``);
    return result;
  },

  async OPEN_URL(payload) {
    const rawUrl = (payload['url'] as string | undefined) ?? '';
    if (!rawUrl) throw new Error('url requis');
    const sec = _sanitizeUrl(rawUrl);
    if (!sec.ok) throw new Error(sec.reason);
    // cmd /c start ensures cmd.exe handles the URL protocol regardless of parent shell
    const cmd = `cmd /c start "" "${sec.url}"`;
    console.log(`[NEXUS_ACTION] OPEN_URL url="${sec.url}"`);
    const { result } = await _withRetry(() => nexusRunCommand(cmd, undefined, 10_000));
    if (payload['notify_telegram']) void _notify(`🌐 URL ouverte: ${sec.url}`);
    return result;
  },

  async OPEN_CHROME(_payload) {
    console.log('[NEXUS_ACTION] OPEN_CHROME');
    const { result } = await _withRetry(() => nexusAppLaunch('chrome', 12_000));
    if (!(result as { ok?: boolean }).ok) throw new Error((result as { error?: string }).error ?? 'Chrome launch failed');
    void _notify('🌐 *Chrome* lancé depuis NEXUS');
    return result;
  },

  async OPEN_VSCODE(_payload) {
    console.log('[NEXUS_VSCODE] attempt');
    // nexusAppLaunch now includes auto-focus (wait+AppActivate loop in os_agent.py)
    const { result } = await _withRetry(() => nexusAppLaunch('vscode', 20_000));
    const r = result as { ok?: boolean; error?: string; path?: string; focused?: boolean; verified?: boolean };
    console.log(`[NEXUS_VSCODE] launched=${r.ok} focused=${r.focused ?? 'n/a'} verified=${r.verified ?? 'n/a'} path=${r.path ?? 'n/a'} error=${r.error ?? 'none'}`);
    if (!r.ok) throw new Error(r.error ?? 'VS Code launch failed');
    void _notify(`💻 *VS Code* lancé${r.focused ? ' et mis au premier plan' : ''} depuis NEXUS`);
    return result;
  },

  async FOCUS_APP(payload) {
    const app = (payload['app'] as string | undefined) ?? 'vscode';
    console.log(`[NEXUS_FOCUS] app=${app}`);
    const { result } = await _withRetry(() => nexusFocusApp(app, 10_000));
    const r = result as { ok?: boolean; focused?: boolean; detail?: string };
    console.log(`[NEXUS_FOCUS] app=${app} success=${r.ok} focused=${r.focused} detail=${r.detail ?? ''}`);
    if (!r.ok) throw new Error(`Focus failed for ${app}: ${r.detail ?? 'unknown'}`);
    void _notify(`🎯 *${app}* mis au premier plan`);
    return result;
  },

  async SYSTEM_INFO(_payload) {
    console.log('[NEXUS_SYSTEM] fetching sysinfo');
    const { result: base } = await _withRetry(() => nexusSysinfo(12_000));

    // Disk info (optional — desktop only)
    let disk: { raw: string } | null = null;
    try {
      const r = await nexusRunCommand(
        'wmic logicaldisk where "drivetype=3" get caption,freespace,size /format:csv',
        undefined, 10_000,
      );
      if (r.ok && r.stdout?.trim()) disk = { raw: r.stdout.trim() };
    } catch { /* optional */ }

    // Battery (optional — laptops only, silently skip on desktops)
    let battery: { raw: string } | null = null;
    try {
      const r = await nexusRunCommand(
        'wmic path win32_battery get estimatedchargeremaining,batterystatus /format:csv',
        undefined, 8_000,
      );
      if (r.ok && r.stdout?.includes(',')) battery = { raw: r.stdout.trim() };
    } catch { /* optional */ }

    console.log(`[NEXUS_SYSTEM] ok hostname=${base.hostname} os="${base.os}" disk=${!!disk} battery=${!!battery}`);
    return { ...base, disk, battery };
  },

  async TERMINAL_COMMAND_SAFE(payload) {
    const cmd = (payload['command'] as string | undefined)?.trim() ?? '';
    if (!cmd) throw new Error('command requis');
    const sec = _isSafeCommand(cmd);
    if (!sec.ok) throw new Error(sec.reason);
    const cwd       = payload['cwd'] as string | undefined;
    const timeoutMs = Math.min((payload['timeout_ms'] as number | undefined) ?? 15_000, 30_000);
    console.log(`[NEXUS_ACTION] TERMINAL_COMMAND_SAFE cmd="${cmd.slice(0, 80)}" timeout=${timeoutMs}ms`);
    const { result, retries } = await _withRetry(
      () => nexusRunCommand(cmd, cwd, timeoutMs),
    );
    console.log(`[NEXUS_ACTION] TERMINAL_COMMAND_SAFE exit=${result.exit_code} stdout_len=${result.stdout.length} retries=${retries}`);
    return result;
  },

  // ── TERMINAL_RUN — extended dev command whitelist, project-aware ──────────
  async TERMINAL_RUN(payload) {
    const command   = (payload['command'] as string | undefined)?.trim() ?? '';
    const project   = (payload['project'] as string | undefined)?.trim().toLowerCase();
    const cwd       = (payload['cwd'] as string | undefined)?.trim();
    const timeoutS  = Math.min((payload['timeout_s'] as number | undefined) ?? 30, 60);
    if (!command) throw new Error('command requis');
    console.log(`[NEXUS_ACTION] TERMINAL_RUN cmd="${command.slice(0, 80)}" project=${project ?? '-'} timeout=${timeoutS}s`);
    const { result } = await _withRetry(
      () => nexusTerminalRun(command, project, cwd, timeoutS),
    );
    const r = result as Record<string, unknown>;
    console.log(`[NEXUS_ACTION] TERMINAL_RUN exit=${r['exit_code']} elapsed=${r['elapsed_ms']}ms ok=${r['ok']}`);
    if (!r['ok']) throw new Error((r['error'] as string | undefined) ?? `Command failed (exit ${r['exit_code']})`);
    updateEnvironment({
      activeProject:        project ?? null,
      activeWorkingDir:     (r['cwd'] as string | undefined) ?? null,
      lastCommand:          command,
      lastCommandStatus:    'ok',
      lastCommandOutput:    ((r['stdout'] as string | undefined) ?? '').slice(0, 500),
      lastCommandElapsedMs: (r['elapsed_ms'] as number | undefined) ?? null,
    });
    return result;
  },

  // ── PROJECT_OPEN — open VS Code in project directory ─────────────────────
  async PROJECT_OPEN(payload) {
    const raw = (payload['project'] as string | undefined)?.trim() ?? '';
    if (!raw) throw new Error('project requis');
    const proj = resolveProject(raw);
    if (!proj) {
      throw new Error(`Projet inconnu: "${raw}". Disponibles: ${Object.keys(PROJECT_REGISTRY).join(', ')}`);
    }
    console.log(`[NEXUS_ACTION] PROJECT_OPEN project=${proj.key} path=${proj.path}`);
    // Launch VS Code in project directory
    const { result } = await _withRetry(
      () => nexusAppLaunch('vscode', 20_000),
    );
    // Also send OPEN_FOLDER so VS Code opens the right directory
    void nexusRunCommand(
      `"${String.raw`C:\Users\douba\AppData\Local\Programs\Microsoft VS Code\Code.exe`}" "${proj.path}"`,
      undefined, 10_000,
    ).catch(() => {/* non-critical */});
    updateEnvironment({ activeProject: proj.key, activeWorkingDir: proj.path });
    void _notify(`📂 *${proj.key}* ouvert dans VS Code\n\`${proj.path}\``);
    return { ok: true, project: proj.key, path: proj.path, vscode: result };
  },

  // ── PROJECT_STATUS — return environment + last command status ────────────
  async PROJECT_STATUS(_payload) {
    console.log('[NEXUS_ACTION] PROJECT_STATUS');
    const env_ = getEnvironment();
    const r = await nexusGetEnvironment(5_000);
    const pcEnv = r.result as Record<string, unknown> | undefined;
    return { ok: true, environment: env_, pc_environment: pcEnv };
  },

  // ── CLAUDE_CODE_START — run claude CLI in project with optional prompt ────
  async CLAUDE_CODE_START(payload) {
    const raw     = (payload['project'] as string | undefined)?.trim() ?? 'dzaryx';
    const prompt  = (payload['prompt'] as string | undefined)?.trim();
    const timeoutS = Math.min((payload['timeout_s'] as number | undefined) ?? 90, 180);

    const proj = resolveProject(raw) ?? resolveProject('dzaryx')!;
    console.log(`[NEXUS_ACTION] CLAUDE_CODE_START project=${proj.key} prompt="${(prompt ?? '').slice(0, 60)}" timeout=${timeoutS}s`);

    const { result } = await _withRetry(
      () => nexusClaudeCodeStart(proj.key, prompt, timeoutS),
    );
    const r = result as Record<string, unknown>;

    if (r['output']) {
      const outputPreview = (r['output'] as string).slice(0, 800);
      void _notify(`🤖 *Claude Code* \\(${proj.key}\\)\n\n${outputPreview}`);
      updateEnvironment({
        activeProject:        proj.key,
        activeWorkingDir:     proj.path,
        lastCommand:          prompt ? `claude --print "${prompt.slice(0, 60)}"` : 'claude',
        lastCommandStatus:    r['ok'] ? 'ok' : 'error',
        lastCommandOutput:    outputPreview.slice(0, 500),
        lastCommandElapsedMs: (r['elapsed_ms'] as number | undefined) ?? null,
      });
    }

    if (!r['ok'] && !r['launched']) {
      throw new Error((r['error'] as string | undefined) ?? 'Claude Code failed');
    }
    return result;
  },
};

// ── Main dispatch ─────────────────────────────────────────────────────────────

export async function executeNexusCommand(
  type:    CommandType,
  payload: Record<string, unknown> = {},
): Promise<NexusCommandRecord> {
  const rec = _record(type, payload);
  console.log(`[NEXUS_ACTION] start id=${rec.id} type=${type}`);

  if (!isNexusOnline()) {
    rec.completed_at = new Date().toISOString();
    rec.success      = false;
    rec.error        = 'Nexus hors ligne';
    console.warn(`[NEXUS_ACTION] offline id=${rec.id} type=${type}`);
    return rec;
  }

  const handler = _handlers[type];
  if (!handler) {
    rec.completed_at = new Date().toISOString();
    rec.success      = false;
    rec.error        = `Type de commande inconnu: ${type}`;
    return rec;
  }

  rec.started_at = new Date().toISOString();
  try {
    rec.result       = await handler(payload);
    rec.success      = true;
    rec.completed_at = new Date().toISOString();
    const ms = Date.now() - new Date(rec.started_at).getTime();
    console.log(`[NEXUS_ACTION] done id=${rec.id} type=${type} ms=${ms}`);
  } catch (err) {
    rec.success      = false;
    rec.error        = err instanceof Error ? err.message : String(err);
    rec.completed_at = new Date().toISOString();
    const ms = Date.now() - new Date(rec.started_at as string).getTime();
    console.error(`[NEXUS_ACTION] fail id=${rec.id} type=${type} ms=${ms} err="${rec.error?.slice(0, 120)}"`);
  }

  return rec;
}

// ── Capabilities ──────────────────────────────────────────────────────────────

export function getNexusCapabilities(): NexusCapabilities {
  return {
    online:         isNexusOnline(),
    screenshots:    true,
    file_browser:   true,
    app_launch:     true,
    chrome:         true,
    vscode:         true,
    focus_app:      true,
    terminal_safe:  true,
    system_info:    true,
    telegram_photo: true,
    terminal_run:   true,
    project_open:   true,
    claude_code:    true,
    commands:       Object.keys(_handlers) as CommandType[],
    projects:       Object.keys(PROJECT_REGISTRY),
  };
}
