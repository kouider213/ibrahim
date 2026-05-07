import type { Server as SocketServer, Socket } from 'socket.io';
import { processMessage }  from '../../conversation/orchestrator.js';
import { env }             from '../../config/env.js';

let _nexusSocket: Socket | null = null;
let _nexusMac:    string        = '';

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
    console.log('[NEXUS] PC Agent connected:', socket.id);
    _nexusSocket = socket;

    // ── Register MAC for WoL ───────────────────────────────────────────────
    socket.on('nexus:register', (data: { mac?: string }) => {
      _nexusMac = data?.mac ?? '';
      console.log(`[NEXUS] MAC registered: ${_nexusMac}`);
    });

    // ── Message from NEXUS → Dzaryx AI → ack back to NEXUS ───────────────
    socket.on('nexus:message', async (
      data: { text: string; source?: string; session?: string },
      ack: (r: { text: string }) => void,
    ) => {
      const { text } = data;
      console.log(`[NEXUS] → AI: ${text.slice(0, 70)}`);
      try {
        // textOnly=true: NEXUS handles its own ElevenLabs audio locally
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

    socket.on('disconnect', () => {
      console.log('[NEXUS] PC Agent disconnected');
      if (_nexusSocket?.id === socket.id) _nexusSocket = null;
      void _sendTelegram('🖥️ *NEXUS* hors ligne');
    });
  });
}

// ── External API (used by telegram.ts) ───────────────────────────────────────

export function isNexusOnline(): boolean {
  return _nexusSocket !== null;
}

export function sendToNexus(event: string, data: unknown): boolean {
  if (!_nexusSocket) return false;
  _nexusSocket.emit(event, data);
  return true;
}

export function getNexusMac(): string {
  return _nexusMac;
}

// ── Helper: send Telegram notification ───────────────────────────────────────

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
