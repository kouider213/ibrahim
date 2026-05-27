import { EventEmitter } from 'events';
import type { Server as SocketServer } from 'socket.io';
export type NexusWsState = 'DISCONNECTED' | 'ONLINE' | 'SUSPECT' | 'OFFLINE_CONFIRMED' | 'RECONNECTING';
export declare function setNexusBusy(task: string): void;
export declare function clearNexusBusy(): void;
export declare function isNexusBusy(): boolean;
export declare function getNexusBusyTask(): string | null;
export declare function getNexusBusyMs(): number | null;
interface NexusTelemetry {
    lastConnectedAt: string | null;
    lastDisconnectedAt: string | null;
    totalConnections: number;
    totalDisconnections: number;
    lastDisconnectReason: string | null;
    lastHostname: string | null;
    lastSocketId: string | null;
    lastPythonExe: string | null;
    lastPythonVer: string | null;
    lastHeartbeatAt: string | null;
    lastHeartbeatLatency: number | null;
    missedHeartbeats: number;
    lastOs: string | null;
    lastOsRelease: string | null;
    lastRamUsedMb: number | null;
    lastRamTotalMb: number | null;
    lastCpuPercent: number | null;
    lastUptimeS: number | null;
}
export declare function getOrCreateJobEmitter(jobId: string): EventEmitter;
export declare function deleteJobEmitter(jobId: string): void;
export type NexusJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'blocked';
export interface NexusJob {
    jobId: string;
    command: string;
    cwd: string | null;
    status: NexusJobStatus;
    startedAt: string;
    completedAt?: string;
    exit_code?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
    retries: number;
}
type NexusCommandResult = {
    ok: boolean;
    exit_code: number;
    stdout: string;
    stderr: string;
    command: string;
    jobId: string;
    blocked?: boolean;
};
export declare function getNexusJob(jobId: string): NexusJob | undefined;
export declare function listNexusJobs(): NexusJob[];
export declare function initNexusRelay(io: SocketServer): void;
export declare function initLauncherRelay(io: SocketServer): void;
export declare function isNexusOnline(): boolean;
export declare function getNexusWsState(): NexusWsState;
export declare function isLauncherOnline(): boolean;
export declare function getNexusMac(): string;
export declare function getNexusIp(): string;
export declare function sendToNexus(event: string, data: unknown): boolean;
export declare function getNexusStatus(): {
    online: boolean;
    state: NexusWsState;
    last_seen: string | null;
    socketId: string | null;
    publicIp: string;
    mac: string;
    busy: boolean;
    busyTask: string | null;
    busyMs: number | null;
    pending_commands: number;
    last_command_status: NexusJobStatus | null;
    connectionSessionId: string | null;
    reconnectAttempt: number;
    lastOfflineReason: string | null;
    lastNotificationAt: string | null;
    telemetry: NexusTelemetry;
};
/** Run shell command on PC. Queued if offline; blocked if dangerous. */
export declare function nexusRunCommand(command: string, cwd?: string, timeoutMs?: number): Promise<NexusCommandResult>;
export declare function nexusWriteFile(filePath: string, content: string, timeoutMs?: number): Promise<{
    ok: boolean;
    path: string;
    size?: number;
    error?: string;
}>;
/**
 * Take a real desktop screenshot on the PC via the nexus:screenshot event.
 * The image is sent directly from PC → backend → Telegram (no stdout truncation).
 * Returns metadata only (size_bytes, timestamp, hostname).
 */
export declare function nexusScreenshot(caption?: string, timeoutMs?: number): Promise<{
    ok: boolean;
    sent_to_telegram?: boolean;
    size_bytes?: number;
    timestamp?: string;
    hostname?: string;
    error?: string;
}>;
/**
 * Take a real desktop screenshot and return the raw base64 in the ack.
 * Uses nexus:screenshot_base64 event (no Telegram send) — image returned directly.
 * Timeout: 35s (PowerShell screenshot takes ~5s on average).
 */
export declare function nexusScreenshotBase64(timeoutMs?: number): Promise<{
    ok: boolean;
    image_base64?: string;
    size_bytes?: number;
    size_kb?: number;
    timestamp?: string;
    hostname?: string;
    error?: string;
}>;
export declare function nexusSysinfo(timeoutMs?: number): Promise<{
    ok: boolean;
    python_executable?: string;
    python_version?: string;
    python_full?: string;
    hostname?: string;
    os?: string;
    os_version?: string;
    cwd?: string;
    pid?: number;
}>;
export declare function pingNexus(): Promise<{
    time: string;
    hostname: string;
    latency_ms: number;
}>;
export declare function wakeNexus(): Promise<{
    success: boolean;
    status: string;
    message: string;
}>;
export declare function getLauncherStatus(): Promise<Record<string, unknown>>;
export declare function triggerWol(): Promise<{
    sent: boolean;
    mac: string;
    ip: string;
}>;
export interface OsResult {
    ok: boolean;
    job_id: string;
    error?: string;
    [k: string]: unknown;
}
export declare const nexusFileList: (path?: string, ms?: number) => Promise<OsResult>;
export declare const nexusFileSearch: (query: string, root?: string, maxResults?: number, ms?: number) => Promise<OsResult>;
export declare const nexusFileRead: (path: string, ms?: number) => Promise<OsResult>;
export declare const nexusFileSend: (path: string, caption?: string, ms?: number) => Promise<OsResult>;
export declare const nexusFileOpen: (path: string, ms?: number) => Promise<OsResult>;
export declare const nexusWindowList: (ms?: number) => Promise<OsResult>;
export declare const nexusWindowFocus: (title: string, ms?: number) => Promise<OsResult>;
export declare const nexusWindowClose: (title: string, ms?: number) => Promise<OsResult>;
export declare const nexusWindowScreenshot: (caption?: string, ms?: number) => Promise<OsResult>;
export declare const nexusProcessList: (top?: number, sort?: "ram" | "cpu", ms?: number) => Promise<OsResult>;
export declare const nexusProcessKill: (name?: string, pid?: number, ms?: number) => Promise<OsResult>;
export declare const nexusAppLaunch: (app: string, ms?: number) => Promise<OsResult>;
export declare const nexusFocusApp: (app: string, ms?: number) => Promise<OsResult>;
export declare const nexusOpenUrl: (url: string, ms?: number) => Promise<NexusCommandResult>;
export declare const nexusTerminalRun: (command: string, project?: string, cwd?: string, timeoutS?: number, ms?: number) => Promise<OsResult>;
export declare const nexusClaudeCodeStart: (project: string, prompt?: string, timeoutS?: number, ms?: number) => Promise<OsResult>;
export declare const nexusGetEnvironment: (ms?: number) => Promise<OsResult>;
export declare const nexusScreenUnderstand: (question?: string, sendToTelegram?: boolean, caption?: string, ms?: number) => Promise<OsResult>;
export declare function sendTelegramStructured(opts: {
    status: 'ok' | 'error' | 'warning' | 'info';
    title: string;
    summary?: string;
    details?: string;
    durationMs?: number;
}): Promise<void>;
export {};
//# sourceMappingURL=nexus-relay.d.ts.map