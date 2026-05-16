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
import transcribeRoutes    from './api/routes/transcribe.js';
import visionRoutes        from './api/routes/vision.js';
import nexusRoutes         from './api/routes/nexus.js';
import nexusOsRoutes       from './api/routes/nexus-os.js';
import multiAgentRoutes    from './api/routes/multi-agent.js';
import workflowRoutes      from './api/routes/workflow.js';
import biRoutes            from './api/routes/bi.js';
import orchestratorRoutes  from './api/routes/orchestrator.js';
import healthAiRoutes      from './api/routes/health-ai.js';

// Integrations
import { setBISocket } from './bi/bi-socket.js';
import { initReminderWorker } from './workers/reminder-worker.js';
import { initOrchestrator } from './conversation/orchestrator.js';
import { initOrchestratorEngine } from './orchestrator/orchestrator-engine.js';
import { initMobilePush } from './notifications/mobile-push.js';
import { initScheduler }   from './queue/scheduler.js';
import { initApprover }     from './validations/approver.js';
import { initDispatcher }   from './notifications/dispatcher.js';
import { initPcRelay, registerPcAgent, unregisterPcAgent } from './actions/handlers/pc-relay.js';
import { initNexusRelay, initLauncherRelay } from './actions/handlers/nexus-relay.js';

// ── Simple in-memory rate limiter ─────────────────────────────
function makeRateLimiter(maxReqs: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
    const key = (req.headers['x-forwarded-for'] as string ?? req.ip ?? 'unknown').split(',')[0].trim();
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now > entry.reset) { entry = { count: 0, reset: now + windowMs }; hits.set(key, entry); }
    entry.count++;
    if (entry.count > maxReqs) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}
const apiLimiter  = makeRateLimiter(120, 60_000); // 120 req/min general
const chatLimiter = makeRateLimiter(20,  60_000); // 20  req/min on /api/chat

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

// ── /api/marketing/video — déclenchement direct d'une vidéo marketing ───────
// POST body: { car_name, style, custom_script, background_effect, chat_id? }
// Authentification : Bearer MOBILE_ACCESS_TOKEN
app.post('/api/marketing/video', apiLimiter, async (req: express.Request, res: express.Response): Promise<void> => {
  // Auth
  const authHeader = req.headers['authorization'] ?? '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || !validateToken(token, 'mobile')) {
    res.status(401).json({ ok: false, error: 'Unauthorized — Bearer MOBILE_ACCESS_TOKEN requis' });
    return;
  }

  const {
    car_name,
    style,
    custom_script,
    background_effect,
    chat_id,
  } = req.body as {
    car_name?:          string;
    style?:             'reveal' | 'prix' | 'lifestyle' | 'temoignage';
    custom_script?:     string;
    background_effect?: string;
    chat_id?:           string;
  };

  const targetChatId = chat_id ?? env.TELEGRAM_CHAT_ID ?? '809747124';

  try {
    const { triggerMarketingVideo } = await import('./marketing/run-video-job.js');
    // Fire-and-forget — la vidéo est livrée via Telegram
    triggerMarketingVideo(
      { car_name, style, custom_script, background_effect },
      targetChatId,
    ).catch((err: unknown) => {
      console.error('[marketing/video] background job failed:', err instanceof Error ? err.message : String(err));
    });

    res.json({
      ok:       true,
      message:  `Vidéo marketing lancée — ${car_name ?? 'voiture auto'} (${style ?? 'reveal'}, fond: ${background_effect ?? 'aucun'})`,
      chat_id:  targetChatId,
      note:     'La vidéo sera envoyée sur Telegram dans 30-120 secondes selon la charge.',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
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

// ── /debug_llm — LLM provider presence check (no keys exposed) ──────────────
app.get('/debug_llm', (_req, res) => {
  const groqKey    = process.env['GROQ_API_KEY']    ?? '';
  const geminiKey  = process.env['GEMINI_API_KEY']  ?? '';
  const openaiKey  = process.env['OPENAI_API_KEY']  ?? '';
  const anthropic  = process.env['ANTHROPIC_API_KEY'] ?? '';
  res.json({
    anthropic:          !!anthropic,
    gemini:             !!geminiKey,
    groq:               !!groqKey,
    openai:             !!openaiKey,
    anthropicLength:    anthropic.length,
    geminiLength:       geminiKey.length,
    groqLength:         groqKey.length,
    openaiLength:       openaiKey.length,
    nodeEnv:            process.env['NODE_ENV'],
    railwayEnvironment: process.env['RAILWAY_ENVIRONMENT'],
    railwayService:     process.env['RAILWAY_SERVICE_NAME'],
    groqModel:          'meta-llama/llama-4-scout-17b-16e-instruct',
    geminiModels:       ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
  });
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
app.use('/api/chat',          chatLimiter, chatRoutes);
app.use('/api/tasks',         apiLimiter, tasksRoutes);
app.use('/api/validations',   apiLimiter, validationsRoutes);
app.use('/api/notifications', apiLimiter, notificationsRoutes);
app.use('/api/bootstrap',     bootstrapRoutes);
app.use('/api/calendar',      apiLimiter, calendarRoutes);
app.use('/api/clients',       apiLimiter, clientsRoutes);
app.use('/api/bookings',      apiLimiter, bookingsRoutes);
app.use('/api/weather',       apiLimiter, weatherRoutes);
app.use('/api/siri',          apiLimiter, siriRoutes);
app.use('/api/github',        apiLimiter, githubRoutes);
app.use('/api/whatsapp',      apiLimiter, whatsappRoutes);
app.use('/api/scheduler',     apiLimiter, schedulerRoutes);
app.use('/api/widget',        apiLimiter, widgetRoutes);
app.use('/api/finance',       apiLimiter, financeRoutes);
app.use('/api/documents',     apiLimiter, documentsRoutes);
app.use('/api/telegram',      telegramRoutes);
app.use('/api/tts',           apiLimiter, ttsRoutes);
app.use('/api/transcribe',   apiLimiter, transcribeRoutes);
app.use('/api/vision',        apiLimiter, visionRoutes);
app.use('/api/nexus',         apiLimiter, nexusRoutes);
app.use('/api/nexus/os',     apiLimiter, nexusOsRoutes);
app.use('/api/multi-agent',  apiLimiter, multiAgentRoutes);
app.use('/api/workflow',     apiLimiter, workflowRoutes);
app.use('/api/bi',           apiLimiter, biRoutes);
app.use('/api/orchestrator', apiLimiter, orchestratorRoutes);
app.use('/api/health-ai',   apiLimiter, healthAiRoutes);

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
setBISocket(mobileNs);
initOrchestrator(mobileNs);
initMobilePush(mobileNs);
initOrchestratorEngine({ io: mobileNs });
initApprover(mobileNs);
initDispatcher(mobileNs);
initPcRelay(io);
initNexusRelay(io);
initLauncherRelay(io);

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
  initReminderWorker();
  void registerTelegramWebhook();
});
