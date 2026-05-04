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
import visionRoutes        from './api/routes/vision.js';

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

// ── Health check (avec statut APIs) ─────────────────────────────────────
app.get('/health', (_req, res) => {
  const falKey         = process.env.FAL_KEY || process.env.FAL_API_KEY;
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  res.json({
    status:  'ok',
    service: 'Dzaryx',
    version: '2.0-chatWithTools',
    time:    new Date().toISOString(),
    apis: {
      anthropic:   !!process.env.ANTHROPIC_API_KEY  ? '🟢' : '🔴',
      elevenlabs:  !!process.env.ELEVENLABS_API_KEY ? '🟢' : '🔴',
      telegram:    !!process.env.TELEGRAM_BOT_TOKEN ? '🟢' : '🔴',
      supabase:    !!process.env.SUPABASE_URL        ? '🟢' : '🔴',
      pexels:      !!process.env.PEXELS_API_KEY      ? '🟢' : '🔴',
      cloudinary:  !!process.env.CLOUDINARY_API_KEY  ? '🟢' : '🔴',
      'fal.ai':    !!falKey          ? '🟢' : '🔴',
      replicate:   !!replicateToken  ? '🟢' : '🔴',
    },
  });
});

// ── /test_fal — test fal.ai connectivity ─────────────────────
app.get('/test_fal', async (_req, res) => {
  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!falKey) {
    res.status(400).json({ ok: false, error: 'FAL_KEY manquant ou invalide. Ajoute FAL_KEY dans Railway.' });
    return;
  }
  try {
    const { default: axios } = await import('axios');
    await axios.get('https://fal.run/fal-ai/fast-sdxl', {
      headers: { Authorization: `Key ${falKey}` },
      timeout: 5_000,
    }).catch(() => null); // just check auth header accepted
    res.json({ ok: true, message: 'FAL_KEY présent et valide.', key_prefix: falKey.slice(0, 8) + '...' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ── /test_replicate — test Replicate connectivity ─────────────
app.get('/test_replicate', async (_req, res) => {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    res.status(400).json({ ok: false, error: 'REPLICATE_API_TOKEN manquant. Ajoute REPLICATE_API_TOKEN dans Railway.' });
    return;
  }
  try {
    const { default: axios } = await import('axios');
    const { data } = await axios.get('https://api.replicate.com/v1/models', {
      headers: { Authorization: `Token ${token}` },
      timeout: 8_000,
    });
    res.json({ ok: true, message: 'REPLICATE_API_TOKEN valide.', models_count: data?.results?.length ?? '?' });
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401) { res.status(401).json({ ok: false, error: 'REPLICATE_API_TOKEN invalide (401).' }); return; }
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ── /test_ai — diagnostic complet ────────────────────────────
app.get('/test_ai', async (_req, res) => {
  const falKey    = process.env.FAL_KEY || process.env.FAL_API_KEY;
  const replToken = process.env.REPLICATE_API_TOKEN;
  res.json({
    diagnostic: {
      FAL_KEY_present:              !!falKey,
      FAL_KEY_source:               process.env.FAL_KEY ? 'FAL_KEY' : process.env.FAL_API_KEY ? 'FAL_API_KEY (fallback)' : 'absent',
      REPLICATE_API_TOKEN_present:  !!replToken,
    },
    tests: {
      'fal.ai':  falKey    ? 'Clé présente — appelle /test_fal pour valider'  : 'FAIL — FAL_KEY absent',
      replicate: replToken ? 'Token présent — appelle /test_replicate pour valider' : 'FAIL — REPLICATE_API_TOKEN absent',
    },
    note: 'Pour tester en détail: GET /test_fal  et  GET /test_replicate',
  });
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
app.use('/api/vision',        visionRoutes);

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
  if (!token || !validateToken(token, 'mobile')) {
    return next(new Error('Unauthorized'));
  }
  next();
});

mobileNs.on('connection', (socket) => {
  console.log(`[Socket] Mobile client connected: ${socket.id}`);

  socket.on(SOCKET_EVENTS.PC_REGISTER, () => {
    registerPcAgent(socket.id);
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
  if (!token || !validateToken(token, 'pc-agent')) {
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

// ── Telegram webhook auto-registration ───────────────────────
async function registerTelegramWebhook(): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const backendUrl = env.BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';
  if (backendUrl.includes('localhost')) return; // skip in local dev
  const webhookUrl = `${backendUrl}/api/telegram/webhook`;
  try {
    const { default: axios } = await import('axios');
    const body: Record<string, unknown> = {
      url:                  webhookUrl,
      allowed_updates:      ['message'],
      drop_pending_updates: false,
      max_connections:      40,
    };
    if (env.WEBHOOK_SECRET) body['secret_token'] = env.WEBHOOK_SECRET;
    const { data } = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, body, { timeout: 10_000 });
    if (data.ok) {
      console.log(`✅ Telegram webhook registered: ${webhookUrl}`);
    } else {
      console.error(`[telegram] Webhook registration failed: ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.error('[telegram] Webhook registration error:', err instanceof Error ? err.message : err);
  }
}

// ── Start server ──────────────────────────────────────────────
const PORT = env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Dzaryx backend running on port ${PORT}`);
  initScheduler();
  void registerTelegramWebhook();
});
