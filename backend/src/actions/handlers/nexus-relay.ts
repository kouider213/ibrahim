import dgram                from 'dgram';
import type { Server as SocketServer, Socket } from 'socket.io';
import { processMessage }  from '../../conversation/orchestrator.js';
import { env }             from '../../config/env.js';

let _nexusSocket:    Socket | null = null;
let _launcherSocket: Socket | null = null;
let _nexusMac:       string        = '';
let _nexusPublicIp:  string        = '';   // last known public IP of the PC

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
    // Capture public IP (works through Railway proxy via X-Forwarded-For)
    const xfwd = socket.handshake.headers['x-forwarded-for'] as string | undefined;
    _nexusPublicIp = (xfwd ? xfwd.split(',')[0] : socket.handshake.address).trim();
    console.log(`[NEXUS] PC Agent connected: ${socket.id} — IP: ${_nexusPublicIp}`);
    _nexusSocket = socket;
    void _sendTelegram('🖥️ *NEXUS* en ligne — PC connecté');

    // ── Register MAC for WoL ───────────────────────────────────────────────
    socket.on('nexus:register', (data: { mac?: string }) => {
      _nexusMac = data?.mac ?? '';
      console.log(`[NEXUS] MAC registered: ${_nexusMac} / IP: ${_nexusPublicIp}`);
    });

    // ── Message from NEXUS → Dzaryx AI → ack back to NEXUS ───────────────
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

    // ── Journal from NEXUS → Telegram ──────────────────────────────────────
    socket.on('nexus:journal', (data: { text?: string }) => {
      const text = data?.text ?? '';
      console.log(`[NEXUS journal] ${text}`);
      void _sendTelegram(`🖥️ *NEXUS*: ${text}`);
    });

    // ── Photo from NEXUS → Telegram ────────────────────────────────────────
    socket.on('nexus:telegram_photo', (data: { image: string; caption?: string }) => {
      const { image, caption } = data;
      if (!image) return;
      console.log('[NEXUS] Photo received for Telegram');
      void _sendTelegramPhoto(image, caption ?? '📸 Screenshot NEXUS');
    });

    // ── File (document) from NEXUS → Telegram ─────────────────────────────
    socket.on('nexus:telegram_file', (data: { data: string; filename: string; caption?: string }) => {
      const { data: b64, filename, caption } = data;
      if (!b64 || !filename) return;
      console.log(`[NEXUS] File received for Telegram: ${filename}`);
      void _sendTelegramDocument(b64, filename, caption ?? `📎 ${filename}`);
    });

    socket.on('disconnect', () => {
      console.log('[NEXUS] PC Agent disconnected');
      if (_nexusSocket?.id === socket.id) _nexusSocket = null;
      void _sendTelegram('🖥️ *NEXUS* hors ligne');
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

export function isNexusOnline(): boolean {
  return _nexusSocket !== null;
}

export function sendToNexus(event: string, data: unknown): boolean {
  if (!_nexusSocket) return false;
  _nexusSocket.emit(event, data);
  return true;
}

export function getNexusMac(): string { return _nexusMac; }
export function getNexusIp():  string { return _nexusPublicIp; }

export function isLauncherOnline(): boolean {
  return _launcherSocket !== null;
}

export function wakeNexus(): Promise<{ success: boolean; status: string; message: string }> {
  return new Promise((resolve, reject) => {
    if (!_launcherSocket) {
      reject(new Error('Launcher hors ligne — le PC doit être allumé avec install-nexus-launcher.bat exécuté'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('Wake timeout (30s) — Nexus ne démarre pas')), 30_000);
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

/** Run a shell command on the PC via Nexus, wait for result. */
export function nexusRunCommand(
  command:   string,
  cwd?:      string,
  timeoutMs  = 45_000,
): Promise<{ ok: boolean; exit_code: number; stdout: string; stderr: string; command: string }> {
  return new Promise((resolve, reject) => {
    if (!_nexusSocket) { reject(new Error('Nexus not connected')); return; }
    const timer = setTimeout(
      () => reject(new Error(`nexusRunCommand timeout ${timeoutMs}ms`)),
      timeoutMs,
    );
    (_nexusSocket as any).emit(
      'nexus:run_command',
      { command, cwd: cwd ?? null, timeout: Math.max(5, Math.floor(timeoutMs / 1000) - 5) },
      (data: { ok?: boolean; exit_code?: number; stdout?: string; stderr?: string; command?: string } | undefined) => {
        clearTimeout(timer);
        resolve({
          ok:        data?.ok        ?? false,
          exit_code: data?.exit_code ?? -1,
          stdout:    data?.stdout    ?? '',
          stderr:    data?.stderr    ?? 'No ack from Nexus',
          command,
        });
      },
    );
  });
}

/** Write text content to a file path on the PC via Nexus, wait for confirmation. */
export function nexusWriteFile(
  filePath:  string,
  content:   string,
  timeoutMs  = 15_000,
): Promise<{ ok: boolean; path: string; size?: number; error?: string }> {
  return new Promise((resolve, reject) => {
    if (!_nexusSocket) { reject(new Error('Nexus not connected')); return; }
    const timer = setTimeout(
      () => reject(new Error(`nexusWriteFile timeout ${timeoutMs}ms`)),
      timeoutMs,
    );
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

/** Ping NEXUS PC agent and wait for pong with real PC timestamp. */
export function pingNexus(): Promise<{ time: string; hostname: string; latency_ms: number }> {
  return new Promise((resolve, reject) => {
    if (!_nexusSocket) { reject(new Error('Nexus not connected')); return; }
    const t0 = Date.now();
    const timer = setTimeout(() => reject(new Error('Ping timeout (5s) — NEXUS ne répond pas')), 5_000);
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

/** Send Wake-on-LAN magic packet to last known PC IP.
 *  Requires router port forwarding: UDP 9 → PC local IP. */
export async function triggerWol(): Promise<{ sent: boolean; mac: string; ip: string }> {
  const mac = _nexusMac;
  const ip  = _nexusPublicIp;

  if (!mac || mac.length < 12) {
    return { sent: false, mac, ip };
  }

  const sent = await _sendWolPacket(mac, ip || '255.255.255.255');
  console.log(`[NEXUS WoL] Sent to ${ip || 'broadcast'} MAC=${mac} → ${sent}`);
  return { sent, mac, ip };
}

// ── WoL UDP implementation ────────────────────────────────────────────────────

function _sendWolPacket(mac: string, ip: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const clean = mac.replace(/[^0-9a-fA-F]/g, '');
      if (clean.length !== 12) { resolve(false); return; }

      const macBuf = Buffer.from(clean, 'hex');
      const magic  = Buffer.concat([Buffer.alloc(6, 0xff), ...Array<Buffer>(16).fill(macBuf)]);

      const sock = dgram.createSocket('udp4');
      sock.once('listening', () => {
        try {
          sock.setBroadcast(true);
          sock.send(magic, 0, magic.length, 9, ip, (err) => {
            sock.close();
            resolve(!err);
          });
        } catch {
          sock.close();
          resolve(false);
        }
      });
      sock.once('error', () => resolve(false));
      sock.bind();
    } catch {
      resolve(false);
    }
  });
}

// ── Helper: send Telegram text ────────────────────────────────────────────────

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
  } catch {
    // non-critical
  }
}

// ── Helper: send Telegram document (base64) ──────────────────────────────────

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
  } catch (e) {
    console.error('[NEXUS] Telegram document error:', e);
  }
}

// ── Helper: send Telegram photo (base64) ─────────────────────────────────────

async function _sendTelegramPhoto(base64: string, caption: string): Promise<void> {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const { default: axios } = await import('axios');
    const FormData = (await import('form-data')).default;
    const buf = Buffer.from(base64, 'base64');
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('photo', buf, { filename: 'screenshot.png', contentType: 'image/png' });
    await axios.post(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      form,
      { headers: form.getHeaders(), timeout: 20_000 },
    );
  } catch (e) {
    console.error('[NEXUS] Telegram photo error:', e);
  }
}
