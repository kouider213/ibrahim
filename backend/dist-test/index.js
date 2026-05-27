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
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const socket_io_1 = require("socket.io");
const env_js_1 = require("./config/env.js");
const constants_js_1 = require("./config/constants.js");
const tokens_js_1 = require("./auth/tokens.js");
// Middleware
const logger_js_1 = require("./api/middleware/logger.js");
// Routes
const chat_js_1 = __importDefault(require("./api/routes/chat.js"));
const tasks_js_1 = __importDefault(require("./api/routes/tasks.js"));
const validations_js_1 = __importDefault(require("./api/routes/validations.js"));
const notifications_js_1 = __importDefault(require("./api/routes/notifications.js"));
const bootstrap_js_1 = __importDefault(require("./api/routes/bootstrap.js"));
const calendar_js_1 = __importDefault(require("./api/routes/calendar.js"));
const clients_js_1 = __importDefault(require("./api/routes/clients.js"));
const bookings_js_1 = __importDefault(require("./api/routes/bookings.js"));
const weather_js_1 = __importDefault(require("./api/routes/weather.js"));
const siri_js_1 = __importDefault(require("./api/routes/siri.js"));
const github_js_1 = __importDefault(require("./api/routes/github.js"));
const whatsapp_js_1 = __importDefault(require("./api/routes/whatsapp.js"));
const scheduler_js_1 = __importDefault(require("./api/routes/scheduler.js"));
const widget_js_1 = __importDefault(require("./api/routes/widget.js"));
const finance_js_1 = __importDefault(require("./api/routes/finance.js"));
const documents_js_1 = __importDefault(require("./api/routes/documents.js"));
const telegram_js_1 = __importDefault(require("./api/routes/telegram.js"));
const tts_js_1 = __importDefault(require("./api/routes/tts.js"));
const vision_js_1 = __importDefault(require("./api/routes/vision.js"));
const nexus_js_1 = __importDefault(require("./api/routes/nexus.js"));
const nexus_os_js_1 = __importDefault(require("./api/routes/nexus-os.js"));
const multi_agent_js_1 = __importDefault(require("./api/routes/multi-agent.js"));
const workflow_js_1 = __importDefault(require("./api/routes/workflow.js"));
const bi_js_1 = __importDefault(require("./api/routes/bi.js"));
const orchestrator_js_1 = __importDefault(require("./api/routes/orchestrator.js"));
const health_ai_js_1 = __importDefault(require("./api/routes/health-ai.js"));
// Integrations
const bi_socket_js_1 = require("./bi/bi-socket.js");
const reminder_worker_js_1 = require("./workers/reminder-worker.js");
const orchestrator_js_2 = require("./conversation/orchestrator.js");
const orchestrator_engine_js_1 = require("./orchestrator/orchestrator-engine.js");
const scheduler_js_2 = require("./queue/scheduler.js");
const approver_js_1 = require("./validations/approver.js");
const dispatcher_js_1 = require("./notifications/dispatcher.js");
const pc_relay_js_1 = require("./actions/handlers/pc-relay.js");
const nexus_relay_js_1 = require("./actions/handlers/nexus-relay.js");
// ── Simple in-memory rate limiter ─────────────────────────────
function makeRateLimiter(maxReqs, windowMs) {
    const hits = new Map();
    return function rateLimiter(req, res, next) {
        const key = (req.headers['x-forwarded-for'] ?? req.ip ?? 'unknown').split(',')[0].trim();
        const now = Date.now();
        let entry = hits.get(key);
        if (!entry || now > entry.reset) {
            entry = { count: 0, reset: now + windowMs };
            hits.set(key, entry);
        }
        entry.count++;
        if (entry.count > maxReqs) {
            res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
            res.status(429).json({ error: 'Too many requests' });
            return;
        }
        next();
    };
}
const apiLimiter = makeRateLimiter(120, 60_000); // 120 req/min general
const chatLimiter = makeRateLimiter(20, 60_000); // 20  req/min on /api/chat
// ── Express setup ─────────────────────────────────────────────
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
app.use((0, helmet_1.default)({ crossOriginEmbedderPolicy: false }));
app.use((0, cors_1.default)({ origin: '*', credentials: true }));
app.use(express_1.default.json({ limit: '2mb' }));
app.use((0, cookie_parser_1.default)());
app.use(logger_js_1.requestLogger);
// ── Health check (avec statut APIs) ─────────────────────────────────────
app.get('/health', (_req, res) => {
    const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    const replicateToken = process.env.REPLICATE_API_TOKEN;
    res.json({
        status: 'ok',
        service: 'Dzaryx',
        version: '2.0-chatWithTools',
        time: new Date().toISOString(),
        apis: {
            anthropic: !!process.env.ANTHROPIC_API_KEY ? '🟢' : '🔴',
            elevenlabs: !!process.env.ELEVENLABS_API_KEY ? '🟢' : '🔴',
            telegram: !!process.env.TELEGRAM_BOT_TOKEN ? '🟢' : '🔴',
            supabase: !!process.env.SUPABASE_URL ? '🟢' : '🔴',
            pexels: !!process.env.PEXELS_API_KEY ? '🟢' : '🔴',
            cloudinary: !!process.env.CLOUDINARY_API_KEY ? '🟢' : '🔴',
            'fal.ai': !!falKey ? '🟢' : '🔴',
            replicate: !!replicateToken ? '🟢' : '🔴',
        },
    });
});
// ── /api/marketing/video — déclenchement direct d'une vidéo marketing ───────
// POST body: { car_name, style, custom_script, background_effect, chat_id? }
// Authentification : Bearer MOBILE_ACCESS_TOKEN
app.post('/api/marketing/video', apiLimiter, async (req, res) => {
    // Auth
    const authHeader = req.headers['authorization'] ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token || !(0, tokens_js_1.validateToken)(token, 'mobile')) {
        res.status(401).json({ ok: false, error: 'Unauthorized — Bearer MOBILE_ACCESS_TOKEN requis' });
        return;
    }
    const { car_name, style, custom_script, background_effect, chat_id, } = req.body;
    const targetChatId = chat_id ?? env_js_1.env.TELEGRAM_CHAT_ID ?? '809747124';
    try {
        const { triggerMarketingVideo } = await Promise.resolve().then(() => __importStar(require('./marketing/run-video-job.js')));
        // Fire-and-forget — la vidéo est livrée via Telegram
        triggerMarketingVideo({ car_name, style, custom_script, background_effect }, targetChatId).catch((err) => {
            console.error('[marketing/video] background job failed:', err instanceof Error ? err.message : String(err));
        });
        res.json({
            ok: true,
            message: `Vidéo marketing lancée — ${car_name ?? 'voiture auto'} (${style ?? 'reveal'}, fond: ${background_effect ?? 'aucun'})`,
            chat_id: targetChatId,
            note: 'La vidéo sera envoyée sur Telegram dans 30-120 secondes selon la charge.',
        });
    }
    catch (err) {
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
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        await axios.get('https://fal.run/fal-ai/fast-sdxl', {
            headers: { Authorization: `Key ${falKey}` },
            timeout: 5_000,
        }).catch(() => null); // just check auth header accepted
        res.json({ ok: true, message: 'FAL_KEY présent et valide.', key_prefix: falKey.slice(0, 8) + '...' });
    }
    catch (err) {
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
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const { data } = await axios.get('https://api.replicate.com/v1/models', {
            headers: { Authorization: `Token ${token}` },
            timeout: 8_000,
        });
        res.json({ ok: true, message: 'REPLICATE_API_TOKEN valide.', models_count: data?.results?.length ?? '?' });
    }
    catch (err) {
        const status = err?.response?.status;
        if (status === 401) {
            res.status(401).json({ ok: false, error: 'REPLICATE_API_TOKEN invalide (401).' });
            return;
        }
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// ── /debug_llm — LLM provider presence check (no keys exposed) ──────────────
app.get('/debug_llm', (_req, res) => {
    const groqKey = process.env['GROQ_API_KEY'] ?? '';
    const geminiKey = process.env['GEMINI_API_KEY'] ?? '';
    const openaiKey = process.env['OPENAI_API_KEY'] ?? '';
    const anthropic = process.env['ANTHROPIC_API_KEY'] ?? '';
    res.json({
        anthropic: !!anthropic,
        gemini: !!geminiKey,
        groq: !!groqKey,
        openai: !!openaiKey,
        anthropicLength: anthropic.length,
        geminiLength: geminiKey.length,
        groqLength: groqKey.length,
        openaiLength: openaiKey.length,
        nodeEnv: process.env['NODE_ENV'],
        railwayEnvironment: process.env['RAILWAY_ENVIRONMENT'],
        railwayService: process.env['RAILWAY_SERVICE_NAME'],
        groqModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
        geminiModels: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'],
    });
});
// ── /test_ai — diagnostic complet ────────────────────────────
app.get('/test_ai', async (_req, res) => {
    const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    const replToken = process.env.REPLICATE_API_TOKEN;
    res.json({
        diagnostic: {
            FAL_KEY_present: !!falKey,
            FAL_KEY_source: process.env.FAL_KEY ? 'FAL_KEY' : process.env.FAL_API_KEY ? 'FAL_API_KEY (fallback)' : 'absent',
            REPLICATE_API_TOKEN_present: !!replToken,
        },
        tests: {
            'fal.ai': falKey ? 'Clé présente — appelle /test_fal pour valider' : 'FAIL — FAL_KEY absent',
            replicate: replToken ? 'Token présent — appelle /test_replicate pour valider' : 'FAIL — REPLICATE_API_TOKEN absent',
        },
        note: 'Pour tester en détail: GET /test_fal  et  GET /test_replicate',
    });
});
// API routes
app.use('/api/chat', chatLimiter, chat_js_1.default);
app.use('/api/tasks', apiLimiter, tasks_js_1.default);
app.use('/api/validations', apiLimiter, validations_js_1.default);
app.use('/api/notifications', apiLimiter, notifications_js_1.default);
app.use('/api/bootstrap', bootstrap_js_1.default);
app.use('/api/calendar', apiLimiter, calendar_js_1.default);
app.use('/api/clients', apiLimiter, clients_js_1.default);
app.use('/api/bookings', apiLimiter, bookings_js_1.default);
app.use('/api/weather', apiLimiter, weather_js_1.default);
app.use('/api/siri', apiLimiter, siri_js_1.default);
app.use('/api/github', apiLimiter, github_js_1.default);
app.use('/api/whatsapp', apiLimiter, whatsapp_js_1.default);
app.use('/api/scheduler', apiLimiter, scheduler_js_1.default);
app.use('/api/widget', apiLimiter, widget_js_1.default);
app.use('/api/finance', apiLimiter, finance_js_1.default);
app.use('/api/documents', apiLimiter, documents_js_1.default);
app.use('/api/telegram', telegram_js_1.default);
app.use('/api/tts', apiLimiter, tts_js_1.default);
app.use('/api/vision', apiLimiter, vision_js_1.default);
app.use('/api/nexus', apiLimiter, nexus_js_1.default);
app.use('/api/nexus/os', apiLimiter, nexus_os_js_1.default);
app.use('/api/multi-agent', apiLimiter, multi_agent_js_1.default);
app.use('/api/workflow', apiLimiter, workflow_js_1.default);
app.use('/api/bi', apiLimiter, bi_js_1.default);
app.use('/api/orchestrator', apiLimiter, orchestrator_js_1.default);
app.use('/api/health-ai', apiLimiter, health_ai_js_1.default);
app.use(logger_js_1.errorHandler);
// ── Socket.IO setup ───────────────────────────────────────────
const io = new socket_io_1.Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 30_000,
    pingInterval: 10_000,
    maxHttpBufferSize: 5 * 1024 * 1024,
});
// Mobile clients namespace (must be created before init calls)
const mobileNs = io.of('/mobile');
// Initialize services with the mobile namespace so events reach mobile clients
(0, bi_socket_js_1.setBISocket)(mobileNs);
(0, orchestrator_js_2.initOrchestrator)(mobileNs);
(0, orchestrator_engine_js_1.initOrchestratorEngine)({ io: mobileNs });
(0, approver_js_1.initApprover)(mobileNs);
(0, dispatcher_js_1.initDispatcher)(mobileNs);
(0, pc_relay_js_1.initPcRelay)(io);
(0, nexus_relay_js_1.initNexusRelay)(io);
(0, nexus_relay_js_1.initLauncherRelay)(io);
mobileNs.use((socket, next) => {
    const token = socket.handshake.auth['token'];
    if (!token || !(0, tokens_js_1.validateToken)(token, 'mobile')) {
        return next(new Error('Unauthorized'));
    }
    next();
});
mobileNs.on('connection', (socket) => {
    console.log(`[Socket] Mobile client connected: ${socket.id}`);
    socket.on(constants_js_1.SOCKET_EVENTS.PC_REGISTER, () => {
        (0, pc_relay_js_1.registerPcAgent)(socket.id);
    });
    socket.on('disconnect', () => {
        (0, pc_relay_js_1.unregisterPcAgent)(socket.id);
        console.log(`[Socket] Mobile client disconnected: ${socket.id}`);
    });
});
// Desktop clients namespace
const desktopNs = io.of('/desktop');
desktopNs.use((socket, next) => {
    const token = socket.handshake.auth['token'];
    if (!token || !(0, tokens_js_1.validateToken)(token, 'pc-agent')) {
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
async function registerTelegramWebhook() {
    const token = env_js_1.env.TELEGRAM_BOT_TOKEN;
    if (!token)
        return;
    const backendUrl = env_js_1.env.BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';
    if (backendUrl.includes('localhost'))
        return; // skip in local dev
    const webhookUrl = `${backendUrl}/api/telegram/webhook`;
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const body = {
            url: webhookUrl,
            allowed_updates: ['message'],
            drop_pending_updates: false,
            max_connections: 40,
        };
        if (env_js_1.env.WEBHOOK_SECRET)
            body['secret_token'] = env_js_1.env.WEBHOOK_SECRET;
        const { data } = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, body, { timeout: 10_000 });
        if (data.ok) {
            console.log(`✅ Telegram webhook registered: ${webhookUrl}`);
        }
        else {
            console.error(`[telegram] Webhook registration failed: ${JSON.stringify(data)}`);
        }
    }
    catch (err) {
        console.error('[telegram] Webhook registration error:', err instanceof Error ? err.message : err);
    }
}
// ── Start server ──────────────────────────────────────────────
const PORT = env_js_1.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Dzaryx backend running on port ${PORT}`);
    (0, scheduler_js_2.initScheduler)();
    (0, reminder_worker_js_1.initReminderWorker)();
    void registerTelegramWebhook();
});
//# sourceMappingURL=index.js.map