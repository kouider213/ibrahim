import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Server as SocketServer } from 'socket.io';

import { env } from './config/env.js';
import { SOCKET_EVENTS } from './config/constants.js';
import { validateToken } from './auth/tokens.js';

// Middleware
import { requestLogger, errorHandler } from './api/middleware/logger.js';

// Routes
import chatRoutes         from './api/routes/chat.js';
import tasksRoutes        from './api/routes/tasks.js';
import validationsRoutes  from './api/routes/validations.js';
import notificationsRoutes from './api/routes/notifications.js';
import bootstrapRoutes     from './api/routes/bootstrap.js';
import calendarRoutes      from './api/routes/calendar.js';
import clientsRoutes       from './api/routes/clients.js';
import bookingsRoutes      from './api/routes/bookings.js';
import weatherRoutes       from './api/routes/weather.js';

// Integrations
import { initOrchestrator } from './conversation/orchestrator.js';
import { initApprover }     from './validations/approver.js';
import { initDispatcher }   from './notifications/dispatcher.js';
import { initPcRelay, registerPcAgent, unregisterPcAgent } from './actions/handlers/pc-relay.js';

// ── Express setup ─────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(requestLogger);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ibrahim', time: new Date().toISOString() });
});

// API routes
app.use('/api/chat',          chatRoutes);
app.use('/api/tasks',         tasksRoutes);
app.use('/api/validations',   validationsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/bootstrap',     bootstrapRoutes);
app.use('/api/calendar',      calendarRoutes);
app.use('/api/clients',       clientsRoutes);
app.use('/api/bookings',      bookingsRoutes);
app.use('/api/weather',       weatherRoutes);

app.use(errorHandler);

// ── Socket.IO setup ───────────────────────────────────────────
const io = new SocketServer(server, {
  cors:              { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout:       30_000,
  pingInterval:      10_000,
  maxHttpBufferSize: 5 * 1024 * 1024,
});

// Initialize all services with Socket.IO instance
initOrchestrator(io);
initApprover(io);
initDispatcher(io);
initPcRelay(io);

// Mobile clients namespace
const mobileNs = io.of('/mobile');

mobileNs.use((socket, next) => {
  const token = socket.handshake.auth['token'] as string | undefined;
  if (!token || !validateToken(token, 'mobile')) {
    next(new Error('Unauthorized'));
    return;
  }
  next();
});

mobileNs.on('connection', socket => {
  console.log(`[socket/mobile] Connected: ${socket.id}`);

  socket.on(SOCKET_EVENTS.MESSAGE, async (data: { message: string; sessionId: string }) => {
    try {
      const { processMessage } = await import('./conversation/orchestrator.js');
      await processMessage(data.message, data.sessionId);
    } catch (err) {
      socket.emit('error', { message: err instanceof Error ? err.message : String(err) });
    }
  });

  socket.on(SOCKET_EVENTS.VALIDATION_REPLY, async (data: {
    validationId: string; decision: 'approved' | 'rejected'; note?: string;
  }) => {
    const { processValidationReply } = await import('./validations/approver.js');
    await processValidationReply(data.validationId, data.decision, data.note);
    socket.emit('validation_processed', { validationId: data.validationId, decision: data.decision });
  });

  socket.on('disconnect', () => {
    console.log(`[socket/mobile] Disconnected: ${socket.id}`);
  });
});

// PC Agent namespace
const pcNs = io.of('/pc');

pcNs.use((socket, next) => {
  const token = socket.handshake.auth['token'] as string | undefined;
  if (!token || !validateToken(token, 'pc-agent')) {
    next(new Error('Unauthorized'));
    return;
  }
  next();
});

pcNs.on('connection', socket => {
  registerPcAgent(socket.id);

  socket.on(SOCKET_EVENTS.PC_PING, () => socket.emit(SOCKET_EVENTS.PC_PONG));

  socket.on(SOCKET_EVENTS.PC_RESULT, (data: { correlationId: string; result: unknown }) => {
    io.emit(`${SOCKET_EVENTS.PC_RESULT}:${data.correlationId}`, data.result);
  });

  socket.on('disconnect', () => unregisterPcAgent(socket.id));
});

// ── Start server ──────────────────────────────────────────────
server.listen(env.PORT, () => {
  console.log(`\n🤖 Ibrahim backend running on port ${env.PORT}`);
  console.log(`   REST  → http://localhost:${env.PORT}/api`);
  console.log(`   WS    → ws://localhost:${env.PORT}`);
  console.log(`   Env   → ${env.NODE_ENV}\n`);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
