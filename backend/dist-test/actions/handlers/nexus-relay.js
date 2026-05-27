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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nexusScreenUnderstand = exports.nexusGetEnvironment = exports.nexusClaudeCodeStart = exports.nexusTerminalRun = exports.nexusOpenUrl = exports.nexusFocusApp = exports.nexusAppLaunch = exports.nexusProcessKill = exports.nexusProcessList = exports.nexusWindowScreenshot = exports.nexusWindowClose = exports.nexusWindowFocus = exports.nexusWindowList = exports.nexusFileOpen = exports.nexusFileSend = exports.nexusFileRead = exports.nexusFileSearch = exports.nexusFileList = void 0;
exports.setNexusBusy = setNexusBusy;
exports.clearNexusBusy = clearNexusBusy;
exports.isNexusBusy = isNexusBusy;
exports.getNexusBusyTask = getNexusBusyTask;
exports.getNexusBusyMs = getNexusBusyMs;
exports.getOrCreateJobEmitter = getOrCreateJobEmitter;
exports.deleteJobEmitter = deleteJobEmitter;
exports.getNexusJob = getNexusJob;
exports.listNexusJobs = listNexusJobs;
exports.initNexusRelay = initNexusRelay;
exports.initLauncherRelay = initLauncherRelay;
exports.isNexusOnline = isNexusOnline;
exports.getNexusWsState = getNexusWsState;
exports.isLauncherOnline = isLauncherOnline;
exports.getNexusMac = getNexusMac;
exports.getNexusIp = getNexusIp;
exports.sendToNexus = sendToNexus;
exports.getNexusStatus = getNexusStatus;
exports.nexusRunCommand = nexusRunCommand;
exports.nexusWriteFile = nexusWriteFile;
exports.nexusScreenshot = nexusScreenshot;
exports.nexusScreenshotBase64 = nexusScreenshotBase64;
exports.nexusSysinfo = nexusSysinfo;
exports.pingNexus = pingNexus;
exports.wakeNexus = wakeNexus;
exports.getLauncherStatus = getLauncherStatus;
exports.triggerWol = triggerWol;
exports.sendTelegramStructured = sendTelegramStructured;
const dgram_1 = __importDefault(require("dgram"));
const events_1 = require("events");
const orchestrator_js_1 = require("../../conversation/orchestrator.js");
const env_js_1 = require("../../config/env.js");
let _wsState = 'DISCONNECTED';
let _connectionSessionId = null;
let _reconnectAttempt = 0;
let _lastOfflineReason = null;
let _lastNotificationAt = 0;
let _nexusSocket = null;
let _launcherSocket = null;
let _nexusMac = '';
let _nexusPublicIp = '';
let _busyTask = null;
let _busySince = null;
let _offlineGraceTimer = null;
// Silent reconnect within 60s — no notification spam
const OFFLINE_GRACE_MS = 60 * 1_000;
// Minimum interval between same-kind Telegram notification
const NOTIFY_COOLDOWN_MS = 5 * 60 * 1_000;
let _lastNotifyKind = null;
function _notifyNexusOnce(kind, message) {
    const now = Date.now();
    if (_lastNotifyKind === kind && now - _lastNotificationAt < NOTIFY_COOLDOWN_MS) {
        console.log(`[NEXUS_WS] notify_suppressed kind=${kind} cooldown_remaining=${Math.round((NOTIFY_COOLDOWN_MS - (now - _lastNotificationAt)) / 1000)}s`);
        return;
    }
    _lastNotifyKind = kind;
    _lastNotificationAt = now;
    console.log(`[NEXUS_WS] notify kind=${kind}`);
    void _sendTelegram(message);
}
function setNexusBusy(task) {
    _busyTask = task;
    _busySince = Date.now();
}
function clearNexusBusy() {
    _busyTask = null;
    _busySince = null;
}
function isNexusBusy() { return _busyTask !== null; }
function getNexusBusyTask() { return _busyTask; }
function getNexusBusyMs() {
    return _busySince ? Date.now() - _busySince : null;
}
const _tel = {
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    totalConnections: 0,
    totalDisconnections: 0,
    lastDisconnectReason: null,
    lastHostname: null,
    lastSocketId: null,
    lastPythonExe: null,
    lastPythonVer: null,
    lastHeartbeatAt: null,
    lastHeartbeatLatency: null,
    missedHeartbeats: 0,
    lastOs: null,
    lastOsRelease: null,
    lastRamUsedMb: null,
    lastRamTotalMb: null,
    lastCpuPercent: null,
    lastUptimeS: null,
};
// ── Security: blocked command patterns ───────────────────────────────────────
const _DANGEROUS_PATTERNS = [
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
function _isDangerous(cmd) {
    for (const pat of _DANGEROUS_PATTERNS) {
        if (pat.test(cmd))
            return pat.toString();
    }
    return null;
}
// ── SSE streaming EventEmitter bus ───────────────────────────────────────────
// jobId → EventEmitter; chunks emitted by PC via nexus:terminal_chunk event.
const _jobEmitters = new Map();
function getOrCreateJobEmitter(jobId) {
    let em = _jobEmitters.get(jobId);
    if (!em) {
        em = new events_1.EventEmitter();
        em.setMaxListeners(5);
        _jobEmitters.set(jobId, em);
    }
    return em;
}
function deleteJobEmitter(jobId) {
    _jobEmitters.delete(jobId);
}
const _jobStore = new Map();
// ── Command Queue (offline buffering) ─────────────────────────────────────────
const MAX_QUEUE = 20;
const MAX_QUEUE_AGE_MS = 10 * 60 * 1_000; // 10 min TTL
const _commandQueue = [];
function _newJob(command, cwd) {
    const jobId = `njob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job = {
        jobId,
        command,
        cwd: cwd ?? null,
        status: 'pending',
        startedAt: new Date().toISOString(),
        retries: 0,
    };
    // Keep only last 100 jobs
    if (_jobStore.size >= 100) {
        const oldest = _jobStore.keys().next().value;
        if (oldest)
            _jobStore.delete(oldest);
    }
    _jobStore.set(jobId, job);
    return job;
}
function getNexusJob(jobId) {
    return _jobStore.get(jobId);
}
function listNexusJobs() {
    return [..._jobStore.values()];
}
// ── Heartbeat Watchdog ────────────────────────────────────────────────────────
let _heartbeatInterval = null;
function _startHeartbeat(socket, sessionId) {
    _stopHeartbeat();
    _tel.missedHeartbeats = 0;
    _heartbeatInterval = setInterval(() => {
        // Stale session guard — only active session drives heartbeat
        if (!_nexusSocket || _connectionSessionId !== sessionId) {
            _stopHeartbeat();
            return;
        }
        const t0 = Date.now();
        const timer = setTimeout(() => {
            _tel.missedHeartbeats += 1;
            console.warn(`[NEXUS_WS] ping_missed missed=${_tel.missedHeartbeats}/4 session=${sessionId.slice(-6)} state=${_wsState}`);
            if (_tel.missedHeartbeats >= 2 && _wsState === 'ONLINE') {
                _wsState = 'SUSPECT';
                console.warn(`[NEXUS_WS] state=SUSPECT missed=${_tel.missedHeartbeats} session=${sessionId.slice(-6)}`);
            }
            if (_tel.missedHeartbeats >= 4) {
                console.error(`[NEXUS_WS] state=OFFLINE_CONFIRMED missed=4 forcing_disconnect session=${sessionId.slice(-6)}`);
                _wsState = 'OFFLINE_CONFIRMED';
                _lastOfflineReason = 'heartbeat_timeout';
                _notifyNexusOnce('offline', '🖥️ *NEXUS* hors ligne — heartbeat timeout (4 pings manqués)');
                socket.disconnect(true);
                _stopHeartbeat();
            }
        }, 8_000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _nexusSocket.emit('nexus:ping', {}, (data) => {
            clearTimeout(timer);
            _tel.lastHeartbeatAt = new Date().toISOString();
            _tel.lastHeartbeatLatency = Date.now() - t0;
            _tel.missedHeartbeats = 0;
            if (_wsState === 'SUSPECT') {
                _wsState = 'ONLINE';
                console.log(`[NEXUS_WS] state=ONLINE reason=pong_recovered latency=${_tel.lastHeartbeatLatency}ms session=${sessionId.slice(-6)}`);
            }
            if (data?.hostname && data.hostname !== 'unknown') {
                _tel.lastHostname = data.hostname;
            }
        });
    }, 30_000);
}
function _stopHeartbeat() {
    if (_heartbeatInterval) {
        clearInterval(_heartbeatInterval);
        _heartbeatInterval = null;
    }
}
// ── Command Queue drain ────────────────────────────────────────────────────────
function _drainCommandQueue() {
    if (_commandQueue.length === 0)
        return;
    const now = Date.now();
    // Expire stale items first
    let expired = 0;
    while (_commandQueue.length > 0 && now - _commandQueue[0].createdAt > MAX_QUEUE_AGE_MS) {
        const stale = _commandQueue.shift();
        stale.reject(new Error(`Nexus command expired in queue after ${MAX_QUEUE_AGE_MS / 1000}s`));
        expired++;
    }
    if (expired)
        console.log(`[NEXUS_QUEUE] expired ${expired} stale commands`);
    const pending = _commandQueue.splice(0);
    if (pending.length === 0)
        return;
    console.log(`[NEXUS_QUEUE] draining ${pending.length} queued commands`);
    for (const item of pending) {
        nexusRunCommand(item.command, item.cwd, item.timeoutMs)
            .then(item.resolve)
            .catch(item.reject);
    }
}
// ── Init /nexus namespace ─────────────────────────────────────────────────────
function initNexusRelay(io) {
    const nexusNs = io.of('/nexus');
    nexusNs.use((socket, next) => {
        const token = socket.handshake.auth['token'];
        if (!token || token !== env_js_1.env.PC_AGENT_TOKEN) {
            return next(new Error('Unauthorized'));
        }
        next();
    });
    nexusNs.on('connection', (socket) => {
        const xfwd = socket.handshake.headers['x-forwarded-for'];
        _nexusPublicIp = (xfwd ? xfwd.split(',')[0] : socket.handshake.address).trim();
        const prevState = _wsState;
        const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        // ── Destroy stale socket (prevent duplicate listeners) ────────────────
        if (_nexusSocket && _nexusSocket.id !== socket.id) {
            console.warn(`[NEXUS_WS] stale_socket old=${_nexusSocket.id} new=${socket.id} — destroying stale`);
            _nexusSocket.removeAllListeners();
            _nexusSocket.disconnect(true);
        }
        _nexusSocket = socket;
        _connectionSessionId = sessionId;
        _wsState = 'ONLINE';
        _tel.lastConnectedAt = new Date().toISOString();
        _tel.lastSocketId = socket.id;
        _tel.totalConnections += 1;
        _startHeartbeat(socket, sessionId);
        console.log(`[NEXUS_WS] connected socketId=${socket.id} session=${sessionId.slice(-6)} prevState=${prevState} ip=${_nexusPublicIp}`);
        // ── Cancel grace timer (fast reconnect within 60s) ───────────────────
        if (_offlineGraceTimer) {
            clearTimeout(_offlineGraceTimer);
            _offlineGraceTimer = null;
            _reconnectAttempt += 1;
            console.log(`[NEXUS_WS] reconnect_fast attempt=${_reconnectAttempt} session=${sessionId.slice(-6)}`);
        }
        // ── Drain offline command queue ───────────────────────────────────────
        if (_commandQueue.length > 0) {
            console.log(`[NEXUS_QUEUE] reconnected — draining ${_commandQueue.length} queued commands`);
            setImmediate(_drainCommandQueue);
        }
        // ── Notify ONLINE only on first connect or confirmed-offline recovery ─
        if (prevState === 'DISCONNECTED' || prevState === 'OFFLINE_CONFIRMED') {
            _notifyNexusOnce('online', '🖥️ *NEXUS* en ligne — PC connecté');
        }
        else {
            console.log(`[NEXUS_WS] reconnect_silent prevState=${prevState} session=${sessionId.slice(-6)} no_notify`);
        }
        // ── Register MAC + full sysinfo ───────────────────────────────────────
        socket.on('nexus:register', (data) => {
            _nexusMac = data?.mac ?? '';
            if (data?.hostname)
                _tel.lastHostname = data.hostname;
            if (data?.python)
                _tel.lastPythonExe = data.python;
            if (data?.py_ver)
                _tel.lastPythonVer = data.py_ver;
            if (data?.os)
                _tel.lastOs = data.os;
            if (data?.os_release)
                _tel.lastOsRelease = data.os_release;
            if (data?.ram_used_mb != null)
                _tel.lastRamUsedMb = data.ram_used_mb;
            if (data?.ram_total_mb != null)
                _tel.lastRamTotalMb = data.ram_total_mb;
            if (data?.cpu_percent != null)
                _tel.lastCpuPercent = data.cpu_percent;
            if (data?.uptime_s != null)
                _tel.lastUptimeS = data.uptime_s;
            console.log(`[NEXUS] Registered: MAC=${_nexusMac} host=${_tel.lastHostname} py=${_tel.lastPythonExe} ram=${_tel.lastRamUsedMb}/${_tel.lastRamTotalMb}MB cpu=${_tel.lastCpuPercent}%`);
        });
        // ── Message NEXUS → AI → ack ──────────────────────────────────────────
        socket.on('nexus:message', async (data, ack) => {
            const { text } = data;
            console.log(`[NEXUS] → AI: ${text.slice(0, 70)}`);
            try {
                const result = await (0, orchestrator_js_1.processMessage)(text, 'nexus-kouider', true);
                if (typeof ack === 'function')
                    ack({ text: result.text });
            }
            catch (err) {
                const msg = `Erreur: ${err instanceof Error ? err.message : String(err)}`;
                console.error('[NEXUS] processMessage error:', err);
                if (typeof ack === 'function')
                    ack({ text: msg });
            }
        });
        // ── Journal → Telegram ────────────────────────────────────────────────
        socket.on('nexus:journal', (data) => {
            const text = data?.text ?? '';
            console.log(`[NEXUS journal] ${text}`);
            void _sendTelegram(`🖥️ *NEXUS*: ${text}`);
        });
        // ── Photo → Telegram ──────────────────────────────────────────────────
        socket.on('nexus:telegram_photo', (data) => {
            const { image, caption } = data;
            if (!image)
                return;
            console.log('[NEXUS] Photo → Telegram');
            void _sendTelegramPhoto(image, caption ?? '📸 Screenshot NEXUS');
        });
        // ── File → Telegram ───────────────────────────────────────────────────
        socket.on('nexus:telegram_file', (data) => {
            const { data: b64, filename, caption } = data;
            if (!b64 || !filename)
                return;
            console.log(`[NEXUS] File → Telegram: ${filename}`);
            void _sendTelegramDocument(b64, filename, caption ?? `📎 ${filename}`);
        });
        // ── Terminal streaming chunks (PC → SSE clients) ──────────────────────
        socket.on('nexus:terminal_chunk', (data) => {
            const { job_id, chunk, done, exit_code } = data ?? {};
            if (!job_id)
                return;
            const em = _jobEmitters.get(job_id);
            if (!em)
                return;
            if (chunk)
                em.emit('chunk', chunk);
            if (done) {
                em.emit('done', { exit_code: exit_code ?? 0 });
                // keep emitter alive 30s for late SSE clients
                setTimeout(() => deleteJobEmitter(job_id), 30_000);
            }
        });
        // ── Disconnect ────────────────────────────────────────────────────────
        socket.on('disconnect', (reason) => {
            // Only active session socket triggers state change
            if (_nexusSocket?.id !== socket.id) {
                console.log(`[NEXUS_WS] disconnect_ignored stale socketId=${socket.id} reason=${reason}`);
                return;
            }
            _nexusSocket = null;
            _lastOfflineReason = reason;
            _tel.lastDisconnectedAt = new Date().toISOString();
            _tel.lastDisconnectReason = reason;
            _tel.totalDisconnections += 1;
            _stopHeartbeat();
            _wsState = 'RECONNECTING';
            console.log(`[NEXUS_WS] state=RECONNECTING reason=${reason} grace=${OFFLINE_GRACE_MS / 1000}s session=${_connectionSessionId?.slice(-6) ?? '?'}`);
            // Grace: if PC reconnects within 60s → no notification (transport close = Railway restart)
            if (_offlineGraceTimer)
                clearTimeout(_offlineGraceTimer);
            _offlineGraceTimer = setTimeout(() => {
                _offlineGraceTimer = null;
                _wsState = 'OFFLINE_CONFIRMED';
                console.warn(`[NEXUS_WS] state=OFFLINE_CONFIRMED grace_expired reason=${reason}`);
                _notifyNexusOnce('offline', `🖥️ *NEXUS* hors ligne — ${reason}`);
            }, OFFLINE_GRACE_MS);
        });
    });
}
// ── Init /launcher namespace ──────────────────────────────────────────────────
function initLauncherRelay(io) {
    const launcherNs = io.of('/launcher');
    launcherNs.use((socket, next) => {
        const token = socket.handshake.auth['token'];
        if (!token || token !== env_js_1.env.PC_AGENT_TOKEN) {
            return next(new Error('Unauthorized'));
        }
        next();
    });
    launcherNs.on('connection', (socket) => {
        console.log(`[LAUNCHER] Service connecté: ${socket.id}`);
        _launcherSocket = socket;
        void _sendTelegram('🚀 *NEXUS Launcher* en ligne — PC joignable');
        socket.on('launcher:hello', (data) => {
            const nexusRunning = data['nexus_running'] ? '✅' : '⭕';
            console.log(`[LAUNCHER] Hello — nexus_running=${data['nexus_running']} hostname=${data['hostname']}`);
            void _sendTelegram(`🚀 *Launcher* connecté — Nexus: ${nexusRunning} | Host: ${data['hostname'] ?? 'PC'}`);
        });
        socket.on('disconnect', () => {
            console.log('[LAUNCHER] Service déconnecté');
            if (_launcherSocket?.id === socket.id)
                _launcherSocket = null;
            void _sendTelegram('⚠️ *NEXUS Launcher* hors ligne — PC injoignable');
        });
    });
}
// ── External API ──────────────────────────────────────────────────────────────
function isNexusOnline() { return _nexusSocket !== null && (_wsState === 'ONLINE' || _wsState === 'SUSPECT'); }
function getNexusWsState() { return _wsState; }
function isLauncherOnline() { return _launcherSocket !== null; }
function getNexusMac() { return _nexusMac; }
function getNexusIp() { return _nexusPublicIp; }
function sendToNexus(event, data) {
    if (!_nexusSocket)
        return false;
    _nexusSocket.emit(event, data);
    return true;
}
function getNexusStatus() {
    const allJobs = [..._jobStore.values()];
    const lastJob = allJobs.length > 0 ? allJobs[allJobs.length - 1] : null;
    return {
        online: isNexusOnline(),
        state: _wsState,
        last_seen: _tel.lastHeartbeatAt,
        socketId: _nexusSocket?.id ?? null,
        publicIp: _nexusPublicIp,
        mac: _nexusMac,
        busy: _busyTask !== null,
        busyTask: _busyTask,
        busyMs: _busySince ? Date.now() - _busySince : null,
        pending_commands: _commandQueue.length,
        last_command_status: lastJob?.status ?? null,
        connectionSessionId: _connectionSessionId,
        reconnectAttempt: _reconnectAttempt,
        lastOfflineReason: _lastOfflineReason,
        lastNotificationAt: _lastNotificationAt > 0 ? new Date(_lastNotificationAt).toISOString() : null,
        telemetry: { ..._tel },
    };
}
// ── nexusRunCommand ───────────────────────────────────────────────────────────
/** Run shell command on PC. Queued if offline; blocked if dangerous. */
function nexusRunCommand(command, cwd, timeoutMs = 45_000) {
    return new Promise((resolve, reject) => {
        if (!_nexusSocket) {
            if (_commandQueue.length >= MAX_QUEUE) {
                reject(new Error('Nexus offline — command queue full'));
                return;
            }
            const qId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            _commandQueue.push({ id: qId, command, cwd, timeoutMs, createdAt: Date.now(), resolve, reject });
            console.log(`[NEXUS_QUEUE] offline_queued id=${qId} total=${_commandQueue.length} cmd="${command.slice(0, 60)}"`);
            return;
        }
        // Security gate
        const blockedBy = _isDangerous(command);
        if (blockedBy) {
            const job = _newJob(command, cwd);
            job.status = 'blocked';
            job.completedAt = new Date().toISOString();
            job.stderr = `BLOCKED by security filter: ${blockedBy}`;
            console.warn(`[NEXUS SECURITY] Blocked: ${command.slice(0, 120)}`);
            resolve({ ok: false, exit_code: -2, stdout: '', stderr: job.stderr, command, jobId: job.jobId, blocked: true });
            return;
        }
        const job = _newJob(command, cwd);
        job.status = 'running';
        console.log(`[NEXUS_COMMAND] emit jobId=${job.jobId} timeout=${timeoutMs}ms cmd="${command.slice(0, 60)}"`);
        const timer = setTimeout(() => {
            job.status = 'timeout';
            job.completedAt = new Date().toISOString();
            job.error = `timeout ${timeoutMs}ms`;
            console.warn(`[NEXUS_COMMAND] timeout jobId=${job.jobId} cmd="${command.slice(0, 60)}"`);
            reject(new Error(`nexusRunCommand timeout ${timeoutMs}ms — jobId=${job.jobId}`));
        }, timeoutMs);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _nexusSocket.emit('nexus:run_command', { command, cwd: cwd ?? null, timeout: Math.max(5, Math.floor(timeoutMs / 1000) - 5) }, (data) => {
            clearTimeout(timer);
            job.status = (data?.ok ?? false) ? 'completed' : 'failed';
            job.completedAt = new Date().toISOString();
            job.exit_code = data?.exit_code ?? -1;
            job.stdout = data?.stdout ?? '';
            job.stderr = data?.stderr ?? '';
            console.log(`[NEXUS_COMMAND] ack jobId=${job.jobId} status=${job.status} exit=${job.exit_code} stdout_len=${job.stdout.length}`);
            resolve({
                ok: data?.ok ?? false,
                exit_code: data?.exit_code ?? -1,
                stdout: data?.stdout ?? '',
                stderr: data?.stderr ?? 'No ack from Nexus',
                command,
                jobId: job.jobId,
                blocked: data?.blocked,
            });
        });
    });
}
// ── Generic emit helper ───────────────────────────────────────────────────────
function _nexusEmit(event, data, timeoutMs) {
    return new Promise((resolve, reject) => {
        if (!_nexusSocket) {
            reject(new Error('Nexus not connected'));
            return;
        }
        const timer = setTimeout(() => reject(new Error(`${event} timeout ${timeoutMs}ms`)), timeoutMs);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _nexusSocket.emit(event, data ?? {}, (result) => {
            clearTimeout(timer);
            resolve(result ?? {});
        });
    });
}
// ── nexusWriteFile ────────────────────────────────────────────────────────────
function nexusWriteFile(filePath, content, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
        if (!_nexusSocket) {
            reject(new Error('Nexus not connected'));
            return;
        }
        const timer = setTimeout(() => reject(new Error(`nexusWriteFile timeout ${timeoutMs}ms`)), timeoutMs);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _nexusSocket.emit('nexus:write_file', { path: filePath, content }, (data) => {
            clearTimeout(timer);
            resolve({
                ok: data?.ok ?? false,
                path: data?.path ?? filePath,
                size: data?.size,
                error: data?.error,
            });
        });
    });
}
// ── nexusScreenshot ───────────────────────────────────────────────────────────
/**
 * Take a real desktop screenshot on the PC via the nexus:screenshot event.
 * The image is sent directly from PC → backend → Telegram (no stdout truncation).
 * Returns metadata only (size_bytes, timestamp, hostname).
 */
function nexusScreenshot(caption, timeoutMs = 30_000) {
    return new Promise((resolve, reject) => {
        if (!_nexusSocket) {
            reject(new Error('Nexus not connected'));
            return;
        }
        const timer = setTimeout(() => reject(new Error(`nexusScreenshot timeout ${timeoutMs}ms`)), timeoutMs);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _nexusSocket.emit('nexus:screenshot', { caption: caption ?? `📸 NEXUS — ${new Date().toISOString()}` }, (data) => {
            clearTimeout(timer);
            resolve({
                ok: data?.ok ?? false,
                sent_to_telegram: data?.sent_to_telegram,
                size_bytes: data?.size_bytes,
                timestamp: data?.timestamp,
                hostname: data?.hostname,
                error: data?.error,
            });
        });
    });
}
// ── nexusScreenshotBase64 ─────────────────────────────────────────────────────
/**
 * Take a real desktop screenshot and return the raw base64 in the ack.
 * Uses nexus:screenshot_base64 event (no Telegram send) — image returned directly.
 * Timeout: 35s (PowerShell screenshot takes ~5s on average).
 */
function nexusScreenshotBase64(timeoutMs = 35_000) {
    return _nexusEmit('nexus:screenshot_base64', {}, timeoutMs).then(r => ({
        ok: r.ok ?? false,
        image_base64: r.image_base64,
        size_bytes: r.size_bytes,
        size_kb: r.size_kb,
        timestamp: r.timestamp,
        hostname: r.hostname,
        error: r.error,
    }));
}
// ── nexusSysinfo ──────────────────────────────────────────────────────────────
function nexusSysinfo(timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
        if (!_nexusSocket) {
            reject(new Error('Nexus not connected'));
            return;
        }
        const timer = setTimeout(() => reject(new Error(`nexusSysinfo timeout ${timeoutMs}ms`)), timeoutMs);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _nexusSocket.emit('nexus:sysinfo', {}, (data) => {
            clearTimeout(timer);
            resolve({
                ok: (data?.ok ?? false),
                python_executable: data?.['python_executable'],
                python_version: data?.['python_version'],
                python_full: data?.['python_full'],
                hostname: data?.['hostname'],
                os: data?.['os'],
                os_version: data?.['os_version'],
                cwd: data?.['cwd'],
                pid: data?.['pid'],
            });
        });
    });
}
// ── pingNexus ─────────────────────────────────────────────────────────────────
function pingNexus() {
    return new Promise((resolve, reject) => {
        if (!_nexusSocket) {
            reject(new Error('Nexus not connected'));
            return;
        }
        const t0 = Date.now();
        const timer = setTimeout(() => reject(new Error('Ping timeout (5s)')), 5_000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _nexusSocket.emit('nexus:ping', {}, (data) => {
            clearTimeout(timer);
            resolve({
                time: data?.time ?? new Date().toISOString(),
                hostname: data?.hostname ?? 'unknown',
                latency_ms: Date.now() - t0,
            });
        });
    });
}
// ── wakeNexus / getLauncherStatus ─────────────────────────────────────────────
function wakeNexus() {
    return new Promise((resolve, reject) => {
        if (!_launcherSocket) {
            reject(new Error('Launcher hors ligne — exécuter install-nexus-launcher.bat'));
            return;
        }
        const timer = setTimeout(() => reject(new Error('Wake timeout (30s)')), 30_000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _launcherSocket.emit('launcher:wake', {}, (data) => {
            clearTimeout(timer);
            resolve({
                success: data?.success ?? false,
                status: data?.status ?? 'unknown',
                message: data?.message ?? 'Pas de réponse du launcher',
            });
        });
    });
}
function getLauncherStatus() {
    return new Promise((resolve, reject) => {
        if (!_launcherSocket) {
            reject(new Error('Launcher hors ligne'));
            return;
        }
        const timer = setTimeout(() => reject(new Error('Status timeout (8s)')), 8_000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _launcherSocket.emit('launcher:status_request', {}, (data) => {
            clearTimeout(timer);
            resolve(data ?? {});
        });
    });
}
// ── triggerWol ────────────────────────────────────────────────────────────────
async function triggerWol() {
    const mac = _nexusMac;
    const ip = _nexusPublicIp;
    if (!mac || mac.length < 12)
        return { sent: false, mac, ip };
    const sent = await _sendWolPacket(mac, ip || '255.255.255.255');
    console.log(`[NEXUS WoL] Sent to ${ip || 'broadcast'} MAC=${mac} → ${sent}`);
    return { sent, mac, ip };
}
function _sendWolPacket(mac, ip) {
    return new Promise((resolve) => {
        try {
            const clean = mac.replace(/[^0-9a-fA-F]/g, '');
            if (clean.length !== 12) {
                resolve(false);
                return;
            }
            const macBuf = Buffer.from(clean, 'hex');
            const magic = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(macBuf)]);
            const sock = dgram_1.default.createSocket('udp4');
            sock.once('listening', () => {
                try {
                    sock.setBroadcast(true);
                    sock.send(magic, 0, magic.length, 9, ip, (err) => { sock.close(); resolve(!err); });
                }
                catch {
                    sock.close();
                    resolve(false);
                }
            });
            sock.once('error', () => resolve(false));
            sock.bind();
        }
        catch {
            resolve(false);
        }
    });
}
const nexusFileList = (path, ms = 20_000) => _nexusEmit('nexus:file_list', { path }, ms);
exports.nexusFileList = nexusFileList;
const nexusFileSearch = (query, root, maxResults = 50, ms = 30_000) => _nexusEmit('nexus:file_search', { query, root, max_results: maxResults }, ms);
exports.nexusFileSearch = nexusFileSearch;
const nexusFileRead = (path, ms = 15_000) => _nexusEmit('nexus:file_read', { path }, ms);
exports.nexusFileRead = nexusFileRead;
const nexusFileSend = (path, caption, ms = 30_000) => _nexusEmit('nexus:file_send', { path, caption }, ms);
exports.nexusFileSend = nexusFileSend;
const nexusFileOpen = (path, ms = 10_000) => _nexusEmit('nexus:file_open', { path }, ms);
exports.nexusFileOpen = nexusFileOpen;
// ── OS Agent — Window Manager ─────────────────────────────────────────────────
const nexusWindowList = (ms = 10_000) => _nexusEmit('nexus:window_list', {}, ms);
exports.nexusWindowList = nexusWindowList;
const nexusWindowFocus = (title, ms = 10_000) => _nexusEmit('nexus:window_focus', { title }, ms);
exports.nexusWindowFocus = nexusWindowFocus;
const nexusWindowClose = (title, ms = 10_000) => _nexusEmit('nexus:window_close', { title }, ms);
exports.nexusWindowClose = nexusWindowClose;
const nexusWindowScreenshot = (caption, ms = 35_000) => _nexusEmit('nexus:window_screenshot', { caption }, ms);
exports.nexusWindowScreenshot = nexusWindowScreenshot;
// ── OS Agent — Process Manager ────────────────────────────────────────────────
const nexusProcessList = (top = 30, sort = 'ram', ms = 15_000) => _nexusEmit('nexus:process_list', { top, sort }, ms);
exports.nexusProcessList = nexusProcessList;
const nexusProcessKill = (name, pid, ms = 10_000) => _nexusEmit('nexus:process_kill', { name, pid }, ms);
exports.nexusProcessKill = nexusProcessKill;
// ── OS Agent — App Launcher ───────────────────────────────────────────────────
const nexusAppLaunch = (app, ms = 15_000) => _nexusEmit('nexus:app_launch', { app }, ms);
exports.nexusAppLaunch = nexusAppLaunch;
const nexusFocusApp = (app, ms = 10_000) => _nexusEmit('nexus:focus_app', { app }, ms);
exports.nexusFocusApp = nexusFocusApp;
const nexusOpenUrl = (url, ms = 10_000) => nexusRunCommand(`cmd /c start "" "${url.replace(/"/g, '')}"`, undefined, ms);
exports.nexusOpenUrl = nexusOpenUrl;
// ── Terminal Manager ──────────────────────────────────────────────────────────
const nexusTerminalRun = (command, project, cwd, timeoutS = 30, ms = (timeoutS + 10) * 1_000) => _nexusEmit('nexus:terminal_run', { command, project, cwd, timeout_s: timeoutS }, ms);
exports.nexusTerminalRun = nexusTerminalRun;
const nexusClaudeCodeStart = (project, prompt, timeoutS = 90, ms = (timeoutS + 15) * 1_000) => _nexusEmit('nexus:claude_code_start', { project, prompt, timeout_s: timeoutS }, ms);
exports.nexusClaudeCodeStart = nexusClaudeCodeStart;
const nexusGetEnvironment = (ms = 5_000) => _nexusEmit('nexus:get_environment', {}, ms);
exports.nexusGetEnvironment = nexusGetEnvironment;
// ── OS Agent — Screen Understanding ──────────────────────────────────────────
const nexusScreenUnderstand = (question, sendToTelegram = true, caption, ms = 60_000) => _nexusEmit('nexus:screen_understand', { question, send_to_telegram: sendToTelegram, caption }, ms);
exports.nexusScreenUnderstand = nexusScreenUnderstand;
// ── Telegram helpers ──────────────────────────────────────────────────────────
async function _sendTelegram(text) {
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
async function _sendTelegramDocument(base64, filename, caption) {
    const token = env_js_1.env.TELEGRAM_BOT_TOKEN;
    const chatId = env_js_1.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId)
        return;
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const FormData = (await Promise.resolve().then(() => __importStar(require('form-data')))).default;
        const buf = Buffer.from(base64, 'base64');
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', caption);
        form.append('document', buf, { filename });
        await axios.post(`https://api.telegram.org/bot${token}/sendDocument`, form, { headers: form.getHeaders(), timeout: 30_000 });
    }
    catch (e) {
        console.error('[NEXUS] Telegram document error:', e);
    }
}
async function _sendTelegramPhoto(base64, caption) {
    const token = env_js_1.env.TELEGRAM_BOT_TOKEN;
    const chatId = env_js_1.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId)
        return;
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const FormData = (await Promise.resolve().then(() => __importStar(require('form-data')))).default;
        const buf = Buffer.from(base64, 'base64');
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('caption', caption);
        form.append('photo', buf, { filename: 'screenshot.png', contentType: 'image/png' });
        await axios.post(`https://api.telegram.org/bot${token}/sendPhoto`, form, { headers: form.getHeaders(), timeout: 20_000 });
    }
    catch (e) {
        console.error('[NEXUS] Telegram photo error:', e);
    }
}
// ── Structured Telegram notification ─────────────────────────────────────────
// Formats ✅/❌/⚠️/ℹ️ + title + optional summary + optional details code block.
// details are truncated to 800 chars to stay within Telegram message limits.
const _STATUS_ICONS = { ok: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
async function sendTelegramStructured(opts) {
    const icon = _STATUS_ICONS[opts.status];
    const lines = [`${icon} *${opts.title}*`];
    if (opts.summary)
        lines.push(opts.summary);
    if (opts.durationMs)
        lines.push(`_Durée: ${(opts.durationMs / 1000).toFixed(1)}s_`);
    if (opts.details) {
        const snippet = opts.details.trim().slice(0, 800);
        lines.push('```', snippet, '```');
    }
    await _sendTelegram(lines.join('\n'));
}
//# sourceMappingURL=nexus-relay.js.map