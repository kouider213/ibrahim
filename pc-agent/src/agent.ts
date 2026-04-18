import 'dotenv/config';
import { io, Socket } from 'socket.io-client';
import { executeLocalCommand } from './executor.js';

const BACKEND_URL  = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
const PC_TOKEN     = process.env['PC_AGENT_TOKEN'] ?? '';
const RECONNECT_MS = 5_000;

interface PcCommand {
  correlationId: string;
  action:        string;
  params:        Record<string, unknown>;
}

let socket: Socket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function connect(): void {
  console.log(`[pc-agent] Connecting to ${BACKEND_URL}/pc ...`);

  socket = io(`${BACKEND_URL}/pc`, {
    auth:               { token: PC_TOKEN },
    transports:         ['websocket'],
    reconnection:       false,
    timeout:            10_000,
  });

  socket.on('connect', () => {
    console.log(`[pc-agent] ✅ Connected — socket: ${socket?.id}`);
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.on('pc:command', async (cmd: PcCommand) => {
    console.log(`[pc-agent] ← Command: ${cmd.action} (${cmd.correlationId})`);
    const result = await executeLocalCommand({ action: cmd.action, params: cmd.params });
    console.log(`[pc-agent] → Result: ${result.message}`);
    socket?.emit('pc:result', { correlationId: cmd.correlationId, result });
  });

  socket.on('pc:ping', () => socket?.emit('pc:pong'));

  socket.on('disconnect', reason => {
    console.warn(`[pc-agent] Disconnected: ${reason}`);
    scheduleReconnect();
  });

  socket.on('connect_error', err => {
    console.error(`[pc-agent] Connection error: ${err.message}`);
    scheduleReconnect();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(() => {
    console.log('[pc-agent] Attempting reconnect...');
    socket?.close();
    connect();
  }, RECONNECT_MS);
}

connect();

process.on('SIGINT', () => {
  console.log('[pc-agent] Shutting down...');
  socket?.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  socket?.close();
  process.exit(0);
});
