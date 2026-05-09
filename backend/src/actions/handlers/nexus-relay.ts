import dgram                from 'dgram';
import type { Server as SocketServer, Socket } from 'socket.io';
import { processMessage }  from '../../conversation/orchestrator.js';
import { env }             from '../../config/env.js';

// ── State ─────────────────────────────────────────────────────────────────────

let _nexusSocket:    Socket | null = null;
let _launcherSocket: Socket | null = null;
let _nexusMac:       string        = '';
let _nexusPublicIp:  string        = '';

// ── Telemetry ─────────────────────────────────────────────────────────────────

interface NexusTelemetry {
  lastConnectedAt:      string | null;
  lastDisconnectedAt:   string | null;
  totalConnections:     number;
  totalDisconnections:  number;
  lastDisconnectReason: string | null;
  lastHostname:         string | null;
  lastSocketId:         string | null;
  lastPythonExe:        string | null;
  lastPythonVer:        string | null;
  lastHeartbeatAt:      string | null;
  lastHeartbeatLatency: number | null;
  missedHeartbeats:     number;
  lastOs:               string | null;
  lastOsRelease:        string | null;
  lastRamUsedMb:        number | null;
  lastRamTotalMb:       number | null;
  lastCpuPercent:       number | null;
  lastUptimeS:          number | null;
}

const _tel: NexusTelemetry = {
  lastConnectedAt:      null,
  lastDisconnectedAt:   null,
  totalConnections:     0,
  totalDisconnections:  0,
  lastDisconnectReason: null,
  lastHostname:         null,
  lastSocketId:         null,
  lastPythonExe:        null,
  lastPythonVer:        null,
  lastHeartbeatAt:      null,
  lastHeartbeatLatency: null,
  missedHeartbeats:     0,
  lastOs:               null,
  lastOsRelease:        null,
  lastRamUsedMb:        null,
  lastRamTotalMb:       null,
  lastCpuPercent:       null,
  lastUptimeS:          null,
};

// ── Security: blocked command patterns ───────────────────────────────────────

const _DANGEROUS_PATTERNS: RegExp[] = [
  /format\s+[a-z]:/i,
  /diskpart/i,
  /del\s+.*\/[fsq]/i,
  /rmdir\s+\/[sq]/i,
  /\brd\s+\/[sq]/i,
  /rm\s+-[rf]{1,2}\s+\//i,
  /shutdown\s+\/[rsf]/i,
  /mkformat/i,
  /bcdedit/i,
  /bootrec/i,
  /cipher\s+\/w/i,
];

function _isDangerous(cmd: string): string | null {
  for (const pat of _DANGEROUS_PATTERNS) {
    if (pat.test(cmd)) return pat.toString();
  }
  return null;
}

// ── Job store ─────────────────────────────────────────────────────────────────

export type NexusJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'blocked';

export interface NexusJob {
  jobId:        string;
  command:      string;
  cwd:          string | null;
  status:       NexusJobStatus;
  startedAt:    string;
  completedAt?: string;
  exit_code?:   number;
  stdout?:      string;
  stderr?:      string;
  error?:       string;
  retries:      number;
}

const _jobStore = new Map<string, NexusJob>();

function _newJob(command: string, cwd?: string): NexusJob {
  const jobId = `njob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const job: NexusJob = {
    jobId,
    command,
    cwd:       cwd ?? null,
    status:    'pending',
    startedAt: new Date().toISOString(),
    retries:   0,
  };
  // Keep only last 100 jobs
  if (_jobStore.size >= 100) {
    const oldest = _jobStore.keys().next().value;
    if (oldest) _jobStore.delete(oldest);
  }
  _jobStore.set(jobId, job);
  return job;
}

export function getNexusJob(jobId: string): NexusJob | undefined {
  return _jobStore.get(jobId);
}

export function listNexusJobs(): NexusJob[] {
  return [..._jobStore.values()];
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

let _heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function _startHeartbeat(socket: Socket): void {
  _stopHeartbeat();
  _tel.missedHeartbeats = 0;
  _heartbeatInterval = setInterval(() => {
    if (!_nexusSocket) { _stopHeartbeat(); return; }
    const t0 = Date.now();
    const timer = setTimeout(() => {
      _tel.missedHeartbeats += 1;
      console.warn(`[NEXUS] Heartbeat missed (${_tel.missedHeartbeats}/3)`);
      if (_tel.missedHeartbeats >= 3) {
        console.error('[NEXUS] 3 missed heartbeats — forcing disconnect');
        void _sendTelegram('⚠️ *NEXUS* — heartbeat timeout, connexion zombie détectée');
        socket.disconnect(true);
        _stopHeartbeat();
      }
    }, 8_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_nexusSocket as any).emit('nexus:ping', {}, (data: { time?: string; hostname?: string } | undefined) => {
      clearTimeout(timer);
      _tel.lastHeartbeatAt      = new Date().toISOString();
      _tel.lastHeartbeatLatency = Date.now() - t0;
      _tel.missedHeartbeats     = 0;
      if (data?.hostname && data.hostname !== 'unknown') {
        _tel.lastHostname = data.hostname;
      }
    });
  }, 30_000);
}

function _stopHeartbeat(): void {
  if (_heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
}

// ── Init /nexus namespace ─────────────────────────────────────────────────────

export function initNexusRelay(io: SocketServer): void {
  const nexusNs = io.of('/nexus');

  nexusNs.use((socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined;
    if (!token || token !== env.PC_AGENT_TOKEN) {
      return next(new Error('Unauthorized'));
    }
    next();
  });

  nexusNs.on('connection', (socket: Socket) => {
    const xfwd = socket.handshake.headers['x-forwarded-for'] as string | undefined;
    _nexusPublicIp = (xfwd ? xfwd.split(',')[0] : socket.handshake.address).trim();
    console.log(`[NEXUS] PC Agent connected: ${socket.id} — IP: ${_nexusPublicIp}`);
    _nexusSocket            = socket;
    _tel.lastConnectedAt    = new Date().toISOString();
    _tel.lastSocketId       = socket.id;
    _tel.totalConnections  += 1;
    _startHeartbeat(socket);
    void _sendTelegram('🖥️ *NEXUS* en ligne — PC connecté');

    // ── Register MAC + full sysinfo ───────────────────────────────────────
    socket.on('nexus:register', (data: {
      mac?: string; hostname?: string; python?: string; py_ver?: string;
      os?: string; os_release?: string;
      ram_used_mb?: number; ram_total_mb?: number; cpu_percent?: number; uptime_s?: number;
    }) => {
      _nexusMac = data?.mac ?? '';
      if (data?.hostname)    _tel.lastHostname    = data.hostname;
      if (data?.python)      _tel.lastPythonExe   = data.python;
      if (data?.py_ver)      _tel.lastPythonVer   = data.py_ver;
      if (data?.os)          _tel.lastOs          = data.os;
      if (data?.os_release)  _tel.lastOsRelease   = data.os_release;
      if (data?.ram_used_mb  != null) _tel.lastRamUsedMb  = data.ram_used_mb;
      if (data?.ram_total_mb != null) _tel.lastRamTotalMb = data.ram_total_mb;
      if (data?.cpu_percent  != null) _tel.lastCpuPercent = data.cpu_percent;
      if (data?.uptime_s     != null) _tel.lastUptimeS    = data.uptime_s;
      console.log(`[NEXUS] Registered: MAC=${_nexusMac} host=${_tel.lastHostname} py=${_tel.lastPythonExe} ram=${_tel.lastRamUsedMb}/${_tel.lastRamTotalMb}MB cpu=${_tel.lastCpuPercent}%`);
    });

    // ── Message NEXUS → AI → ack ──────────────────────────────────────────
    socket.on('nexus:message', async (
      data: { text: string; source?: string; session?: string },
      ack: (r: { text: string }) => void,
    ) => {
      const { text } = data;
      console.log(`[NEXUS] → AI: ${text.slice(0, 70)}`);
      try {
        const result = await processMessage(text, 'nexus-kouider', true);
        if (typeof ack === 'function') ack({ text: result.text });
      } catch (err) {
        const msg = `Erreur: ${err instanceof Error ? err.message : String(err)}`;
        console.error('[NEXUS] processMessage error:', err);
        if (typeof ack === 'function') ack({ text: msg });
      }
    });

    // ── Journal → Telegram ────────────────────────────────────────────────
    socket.on('nexus:journal', (data: { text?: string }) => {
      const text = data?.text ?? '';
      console.log(`[NEXUS journal] ${text}`);
      void _sendTelegram(`🖥️ *NEXUS*: ${text}`);
    });

    // ── Photo → Telegram ──────────────────────────────────────────────────
    socket.on('nexus:telegram_photo', (data: { image: string; caption?: string }) => {
      const { image, caption } = data;
      if (!image) return;
      console.log('[NEXUS] Photo → Telegram');
      void _sendTelegramPhoto(image, caption ?? '📸 Screenshot NEXUS');
    });

    // ── File → Telegram ───────────────────────────────────────────────────
    socket.on('nexus:telegram_file', (data: { data: string; filename: string; caption?: string }) => {
      const { data: b64, filename, caption } = data;
      if (!b64 || !filename) return;
      console.log(`[NEXUS] File → Telegram: ${filename}`);
      void _sendTelegramDocument(b64, filename, caption ?? `📎 ${filename}`);
    });

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', (reason: string) => {
      console.log('[NEXUS] PC Agent disconnected:', reason);
      if (_nexusSocket?.id === socket.id) {
        _nexusSocket                  = null;
        _tel.lastDisconnectedAt       = new Date().toISOString();
        _tel.lastDisconnectReason     = reason;
        _tel.totalDisconnections     += 1;
        _stopHeartbeat();
      }
      void _sendTelegram(`🖥️ *NEXUS* hors ligne — reason: ${reason}`);
    });
  });
}

// ── Init /launcher namespace ──────────────────────────────────────────────────

export function initLauncherRelay(io: SocketServer): void {
  const launcherNs = io.of('/launcher');

  launcherNs.use((socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined;
    if (!token || token !== env.PC_AGENT_TOKEN) {
      return next(new Error('Unauthorized'));
    }
    next();
  });

  launcherNs.on('connection', (socket: Socket) => {
    console.log(`[LAUNCHER] Service connecté: ${socket.id}`);
    _launcherSocket = socket;
    void _sendTelegram('🚀 *NEXUS Launcher* en ligne — PC joignable');

    socket.on('launcher:hello', (data: Record<string, unknown>) => {
      const nexusRunning = data['nexus_running'] ? '✅' : '⭕';
      console.log(`[LAUNCHER] Hello — nexus_running=${data['nexus_running']} hostname=${data['hostname']}`);
      void _sendTelegram(`🚀 *Launcher* connecté — Nexus: ${nexusRunning} | Host: ${data['hostname'] ?? 'PC'}`);
    });

    socket.on('disconnect', () => {
      console.log('[LAUNCHER] Service déconnecté');
      if (_launcherSocket?.id === socket.id) _launcherSocket = null;
      void _sendTelegram('⚠️ *NEXUS Launcher* hors ligne — PC injoignable');
    });
  });
}

// ── External API ──────────────────────────────────────────────────────────────

export function isNexusOnline(): boolean   { return _nexusSocket !== null; }
export function isLauncherOnline(): boolean { return _launcherSocket !== null; }
export function getNexusMac(): string       { return _nexusMac; }
export function getNexusIp():  string       { return _nexusPublicIp; }

export function sendToNexus(event: string, data: unknown): boolean {
  if (!_nexusSocket) return false;
  _nexusSocket.emit(event, data);
  return true;
}

export function getNexusStatus(): {
  online:    boolean;
  socketId:  string | null;
  publicIp:  string;
  mac:       string;
  telemetry: NexusTelemetry;
} {
  return {
    online:    _nexusSocket !== null,
    socketId:  _nexusSocket?.id ?? null,
    publicIp:  _nexusPublicIp,
    mac:       _nexusMac,
    telemetry: { ..._tel },
  };
}

// ── nexusRunCommand ───────────────────────────────────────────────────────────

/** Run shell command on PC. Blocked if command matches dangerous patterns. */
export function nexusRunCommand(
  command:   string,
  cwd?:      string,
  timeoutMs  = 45_000,
): Promise<{ ok: boolean; exit_code: number; stdout: string; stderr: string; command: string; jobId: string; blocked?: boolean }> {
  return new Promise((resolve, reject) => {
    if (!_nexusSocket) { reject(new Error('Nexus not connected')); return; }

    // Security gate
    const blockedBy = _isDangerous(command);
    if (blockedBy) {
      const job = _newJob(command, cwd);
      job.status      = 'blocked';
      job.completedAt = new Date().toISOString();
      job.stderr      = `BLOCKED by security filter: ${blockedBy}`;
      console.warn(`[NEXUS SECURITY] Blocked: ${command.slice(0, 120)}`);
      resolve({ ok: false, exit_code: -2, stdout: '', stderr: job.stderr, command, jobId: job.jobId, blocked: true });
      return;
    }

    const job = _newJob(command, cwd);
    job.status = 'running';

    const timer = setTimeout(() => {
      job.status      = 'timeout';
      job.completedAt = new Date().toISOString();
      job.error       = `timeout ${timeoutMs}ms`;
      reject(new Error(`nexusRunCommand timeout ${timeoutMs}ms — jobId=${job.jobId}`));
    }, timeoutMs);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_nexusSocket as any).emit(
      'nexus:run_command',
      { command, cwd: cwd ?? null, timeout: Math.max(5, Math.floor(timeoutMs / 1000) - 5) },
      (data: { ok?: boolean; exit_code?: number; stdout?: string; stderr?: string; blocked?: boolean } | undefined) => {
        clearTimeout(timer);
        job.status      = (data?.ok ?? false) ? 'completed' : 'failed';
        job.completedAt = new Date().toISOString();
        job.exit_code   = data?.exit_code ?? -1;
        job.stdout      = data?.stdout ?? '';
        job.stderr      = data?.stderr ?? '';
        resolve({
          ok:        data?.ok        ?? false,
          exit_code: data?.exit_code ?? -1,
          stdout:    data?.stdout    ?? '',
          stderr:    data?.stderr    ?? 'No ack from Nexus',
          command,
          jobId:     job.jobId,
          blocked:   data?.blocked,
        });
      },
    );
  });
}

// ── nexusWriteFile ────────────────────────────────────────────────────────────

export function nexusWriteFile(
  filePath:  string,
  content:   string,
  timeoutMs  = 15_000,
): Promise<{ ok: boolean; path: string; size?: number; error?: string }> {
  return new Promise((resolve, reject) => {
    if (!_nexusSocket) { reject(new Error('Nexus not connected')); return; }
    const timer = setTimeout(() => reject(new Error(`nexusWriteFile timeout ${timeoutMs}ms`)), timeoutMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_nexusSocket as any).emit(
      'nexus:write_file',
      { path: filePath, content },
      (data: { ok?: boolean; path?: string; size?: number; error?: string } | undefined) => {
        clearTimeout(timer);
        resolve({
          ok:    data?.ok    ?? false,
          path:  data?.path  ?? filePath,
          size:  data?.size,
          error: data?.error,
        });
      },
    );
  });
}

// ── nexusScreenshot ───────────────────────────────────────────────────────────

/**
 * Take a real desktop screenshot on the PC via the nexus:screenshot event.
 * The image is sent directly from PC → backend → Telegram (no stdout truncation).
 * Returns metadata only (size_bytes, timestamp, hostname).
 */
export function nexusScreenshot(
  caption?:  string,
  timeoutMs  = 30_000,
): Promise<{ ok: boolean; sent_to_telegram?: boolean; size_bytes?: number; timestamp?: string; hostname?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    if (!_nexusSocket) { reject(new Error('Nexus not connected')); return; }
    const timer = setTimeout(() => reject(new Error(`nexusScreenshot timeout ${timeoutMs}ms`)), timeoutMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_nexusSocket as any).emit(
      'nexus:screenshot',
      { caption: caption ?? `📸 NEXUS — ${new Date().toISOString()}` },
      (data: { ok?: boolean; sent_to_telegram?: boolean; size_bytes?: number; timestamp?: string; hostname?: string; error?: string } | undefined) => {
        clearTimeout(timer);
        resolve({
          ok:               data?.ok               ?? false,
          sent_to_telegram: data?.sent_to_telegram,
          size_bytes:       data?.size_bytes,
          timestamp:        data?.timestamp,
          hostname:         data?.hostname,
          error:            data?.error,
        });
      },
    );
  });
}

// ── nexusSysinfo ──────────────────────────────────────────────────────────────

export function nexusSysinfo(
  timeoutMs = 10_000,
): Promise<{ ok: boolean; python_executable?: string; python_version?: string; python_full?: string; hostname?: string; os?: string; os_version?: string; cwd?: string; pid?: number }> {
  return new Promise((resolve, reject) => {
    if (!_nexusSocket) { reject(new Error('Nexus not connected')); return; }
    const timer = setTimeout(() => reject(new Error(`nexusSysinfo timeout ${timeoutMs}ms`)), timeoutMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_nexusSocket as any).emit(
      'nexus:sysinfo',
      {},
      (data: Record<string, unknown> | undefined) => {
        clearTimeout(timer);
        resolve({
          ok:               (data?.ok ?? false) as boolean,
          python_executable: data?.['python_executable'] as string | undefined,
          python_version:    data?.['python_version'] as string | undefined,
          python_full:       data?.['python_full'] as string | undefined,
          hostname:          data?.['hostname'] as string | undefined,
          os:                data?.['os'] as string | undefined,
          os_version:        data?.['os_version'] as string | undefined,
          cwd:               data?.['cwd'] as string | undefined,
          pid:               data?.['pid'] as number | undefined,
        });
      },
    );
  });
}

// ── pingNexus ─────────────────────────────────────────────────────────────────

export function pingNexus(): Promise<{ time: string; hostname: string; latency_ms: number }> {
  return new Promise((resolve, reject) => {
    if (!_nexusSocket) { reject(new Error('Nexus not connected')); return; }
    const t0 = Date.now();
    const timer = setTimeout(() => reject(new Error('Ping timeout (5s)')), 5_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_nexusSocket as any).emit('nexus:ping', {}, (data: { time?: string; hostname?: string } | undefined) => {
      clearTimeout(timer);
      resolve({
        time:       data?.time     ?? new Date().toISOString(),
        hostname:   data?.hostname ?? 'unknown',
        latency_ms: Date.now() - t0,
      });
    });
  });
}

// ── wakeNexus / getLauncherStatus ─────────────────────────────────────────────

export function wakeNexus(): Promise<{ success: boolean; status: string; message: string }> {
  return new Promise((resolve, reject) => {
    if (!_launcherSocket) {
      reject(new Error('Launcher hors ligne — exécuter install-nexus-launcher.bat'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('Wake timeout (30s)')), 30_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_launcherSocket as any).emit('launcher:wake', {}, (data: { success?: boolean; status?: string; message?: string } | undefined) => {
      clearTimeout(timer);
      resolve({
        success: data?.success ?? false,
        status:  data?.status  ?? 'unknown',
        message: data?.message ?? 'Pas de réponse du launcher',
      });
    });
  });
}

export function getLauncherStatus(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (!_launcherSocket) { reject(new Error('Launcher hors ligne')); return; }
    const timer = setTimeout(() => reject(new Error('Status timeout (8s)')), 8_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_launcherSocket as any).emit('launcher:status_request', {}, (data: Record<string, unknown> | undefined) => {
      clearTimeout(timer);
      resolve(data ?? {});
    });
  });
}

// ── triggerWol ────────────────────────────────────────────────────────────────

export async function triggerWol(): Promise<{ sent: boolean; mac: string; ip: string }> {
  const mac = _nexusMac;
  const ip  = _nexusPublicIp;
  if (!mac || mac.length < 12) return { sent: false, mac, ip };
  const sent = await _sendWolPacket(mac, ip || '255.255.255.255');
  console.log(`[NEXUS WoL] Sent to ${ip || 'broadcast'} MAC=${mac} → ${sent}`);
  return { sent, mac, ip };
}

function _sendWolPacket(mac: string, ip: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const clean = mac.replace(/[^0-9a-fA-F]/g, '');
      if (clean.length !== 12) { resolve(false); return; }
      const macBuf = Buffer.from(clean, 'hex');
      const magic  = Buffer.concat([Buffer.alloc(6, 0xff), ...Array<Buffer>(16).fill(macBuf)]);
      const sock   = dgram.createSocket('udp4');
      sock.once('listening', () => {
        try {
          sock.setBroadcast(true);
          sock.send(magic, 0, magic.length, 9, ip, (err) => { sock.close(); resolve(!err); });
        } catch { sock.close(); resolve(false); }
      });
      sock.once('error', () => resolve(false));
      sock.bind();
    } catch { resolve(false); }
  });
}

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function _sendTelegram(text: string): Promise<void> {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const { default: axios } = await import('axios');
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: chatId, text, parse_mode: 'Markdown' },
      { timeout: 8_000 },
    );
  } catch { /* non-critical */ }
}

async function _sendTelegramDocument(base64: string, filename: string, caption: string): Promise<void> {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const { default: axios } = await import('axios');
    const FormData = (await import('form-data')).default;
    const buf  = Buffer.from(base64, 'base64');
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('document', buf, { filename });
    await axios.post(
      `https://api.telegram.org/bot${token}/sendDocument`,
      form,
      { headers: form.getHeaders(), timeout: 30_000 },
    );
  } catch (e) { console.error('[NEXUS] Telegram document error:', e); }
}

async function _sendTelegramPhoto(base64: string, caption: string): Promise<void> {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const { default: axios } = await import('axios');
    const FormData = (await import('form-data')).default;
    const buf  = Buffer.from(base64, 'base64');
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('photo', buf, { filename: 'screenshot.png', contentType: 'image/png' });
    await axios.post(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      form,
      { headers: form.getHeaders(), timeout: 20_000 },
    );
  } catch (e) { console.error('[NEXUS] Telegram photo error:', e); }
}
