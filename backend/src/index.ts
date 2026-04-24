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
import siriRoutes          from './api/routes/siri.js';
import githubRoutes        from './api/routes/github.js';
import whatsappRoutes      from './api/routes/whatsapp.js';
import schedulerRoutes     from './api/routes/scheduler.js';
import widgetRoutes        from './api/routes/widget.js';
import financeRoutes       from './api/routes/finance.js';
import documentsRoutes     from './api/routes/documents.js';
import telegramRoutes      from './api/routes/telegram.js';
import ttsRoutes           from './api/routes/tts.js';

// Integrations
import { initOrchestrator } from './conversation/orchestrator.js';
import { initScheduler }   from './queue/scheduler.js';
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
  res.json({ status: 'ok', service: 'ibrahim', version: '2.0-chatWithTools', time: new Date().toISOString() });
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
app.use('/api/siri',          siriRoutes);
app.use('/api/github',        githubRoutes);
app.use('/api/whatsapp',      whatsappRoutes);
app.use('/api/scheduler',     schedulerRoutes);
app.use('/api/widget',        widgetRoutes);
app.use('/api/finance',       financeRoutes);
app.use('/api/documents',     documentsRoutes);
app.use('/api/telegram',      telegramRoutes);
app.use('/api/tts',           ttsRoutes);

app.use(errorHandler);

// ── Socket.IO setup ───────────────────────────────────────────
const io = new SocketServer(server, {
  cors:              { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout:       30_000,
  pingInterval:      10_000,
  maxHttpBufferSize: 5 * 1024 * 1024,
});

// Mobile clients namespace (must be created before init calls)
const mobileNs = io.of('/mobile');

// Initialize services with the mobile namespace so events reach mobile clients
initOrchestrator(mobileNs);
initApprover(mobileNs);
initDispatcher(mobileNs);
initPcRelay(io);

mobileNs.use((socket, next) => {
  const token = socket.handshake.auth['token'] as string | undefined;
  if (!token || !validateToken(token)) {
    return next(new Error('Unauthorized'));
  }
  next();
});

mobileNs.on('connection', (socket) => {
  console.log(`[Socket] Mobile client connected: ${socket.id}`);

  socket.on(SOCKET_EVENTS.PC_REGISTER, (data) => {
    registerPcAgent(socket, data);
  });

  socket.on('disconnect', () => {
    unregisterPcAgent(socket.id);
    console.log(`[Socket] Mobile client disconnected: ${socket.id}`);
  });
});

// Desktop clients namespace
const desktopNs = io.of('/desktop');

desktopNs.use((socket, next) => {
  const token = socket.handshake.auth['token'] as string | undefined;
  if (!token || !validateToken(token)) {
    return next(new Error('Unauthorized'));
  }
  next();
});

desktopNs.on('connection', (socket) => {
  console.log(`[Socket] Desktop client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket] Desktop client disconnected: ${socket.id}`);
  });
});

// ── Start server ──────────────────────────────────────────────
const PORT = env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Ibrahim backend running on port ${PORT}`);
  initScheduler();
});
