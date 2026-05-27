"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.isTelegramAdmin = isTelegramAdmin;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    ANTHROPIC_API_KEY: zod_1.z.string().min(1),
    SUPABASE_URL: zod_1.z.string().url(),
    SUPABASE_SERVICE_KEY: zod_1.z.string().min(1),
    REDIS_URL: zod_1.z.string().min(1),
    MOBILE_ACCESS_TOKEN: zod_1.z.string().min(16),
    PC_AGENT_TOKEN: zod_1.z.string().min(16),
    WEBHOOK_SECRET: zod_1.z.string().min(16),
    SESSION_SECRET: zod_1.z.string().min(16),
    PUSHOVER_USER_KEY: zod_1.z.string().min(1),
    PUSHOVER_APP_TOKEN: zod_1.z.string().min(1),
    ELEVENLABS_API_KEY: zod_1.z.string().min(1),
    ELEVENLABS_VOICE_ID: zod_1.z.string().min(1),
    GITHUB_TOKEN: zod_1.z.string().optional(),
    GITHUB_OWNER: zod_1.z.string().optional(),
    GITHUB_DEFAULT_REPO: zod_1.z.string().default('ibrahim'),
    GOOGLE_CLIENT_ID: zod_1.z.string().optional(),
    GOOGLE_CLIENT_SECRET: zod_1.z.string().optional(),
    GOOGLE_REDIRECT_URI: zod_1.z.string().optional(),
    VERCEL_TOKEN: zod_1.z.string().optional(),
    NETLIFY_TOKEN: zod_1.z.string().optional(),
    RAILWAY_TOKEN: zod_1.z.string().optional(),
    RAILWAY_PROJECT_ID: zod_1.z.string().optional(),
    RAILWAY_SERVICE_ID: zod_1.z.string().optional(),
    SUPABASE_ACCESS_TOKEN: zod_1.z.string().optional(),
    TWILIO_ACCOUNT_SID: zod_1.z.string().optional(),
    TWILIO_AUTH_TOKEN: zod_1.z.string().optional(),
    TWILIO_WHATSAPP_FROM: zod_1.z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_JSON: zod_1.z.string().optional(),
    PEXELS_API_KEY: zod_1.z.string().optional(),
    CLOUDINARY_CLOUD_NAME: zod_1.z.string().optional(),
    CLOUDINARY_API_KEY: zod_1.z.string().optional(),
    CLOUDINARY_API_SECRET: zod_1.z.string().optional(),
    ASSEMBLYAI_API_KEY: zod_1.z.string().optional(),
    TELEGRAM_BOT_TOKEN: zod_1.z.string().optional(),
    TELEGRAM_CHAT_ID: zod_1.z.string().optional(),
    TELEGRAM_ALLOWED_CHATS: zod_1.z.string().optional(),
    // Comma-separated Telegram chat IDs with full admin access (document storage, sensitive OCR, etc.)
    // Defaults to TELEGRAM_CHAT_ID if not set.
    TELEGRAM_ADMIN_IDS: zod_1.z.string().optional(),
    // ── TikTok Content Posting API ──
    TIKTOK_ACCESS_TOKEN: zod_1.z.string().optional(),
    TIKTOK_OPEN_ID: zod_1.z.string().optional(),
    // ── AI Generation APIs ───────────────────────────────────────────────────
    // ── Kling AI — Génération vidéo IA depuis image ──
    KLING_API_KEY: zod_1.z.string().optional(),
    // ── Replicate — Génération IA images (Flux.1) ──
    REPLICATE_API_TOKEN: zod_1.z.string().optional(),
    // ── fal.ai — Génération vidéos IA (Kling 1.6, WAN 2.1) ──
    FAL_KEY: zod_1.z.string().optional(), // nom officiel dans Railway
    FAL_API_KEY: zod_1.z.string().optional(), // fallback compatibilité
    // ── Runway — Génération vidéo IA haute fidélité (Gen-3 Alpha Turbo) — optionnel ──
    RUNWAY_API_KEY: zod_1.z.string().optional(),
    // ── Apify — Scraping TikTok concurrents ──
    APIFY_API_KEY: zod_1.z.string().optional(),
    // ── Jina AI — Recherche web (s.jina.ai) + fetch URL (r.jina.ai) ──
    JINA_API_KEY: zod_1.z.string().optional(),
    // ── Google Custom Search API — alternative web search ──
    GOOGLE_SEARCH_API_KEY: zod_1.z.string().optional(),
    GOOGLE_SEARCH_ENGINE_ID: zod_1.z.string().optional(),
    // ── Phase 2: Multi-LLM Router ────────────────────────────────────────────
    GROQ_API_KEY: zod_1.z.string().optional(), // LLaMA 3.3 70B — fast path (gratuit)
    OPENAI_API_KEY: zod_1.z.string().optional(), // GPT-4o — fallback Claude
    GEMINI_API_KEY: zod_1.z.string().optional(), // Gemini 1.5 Flash — long context + fallback
    PORT: zod_1.z.coerce.number().int().positive().default(3000),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    BACKEND_URL: zod_1.z.string().url().default('http://localhost:3000'),
    WS_URL: zod_1.z.string().default('ws://localhost:3000'),
});
function loadEnv() {
    // FAL_API_KEY accepted as alias — canonical name in Railway is FAL_KEY
    if (!process.env.FAL_KEY && process.env.FAL_API_KEY) {
        process.env.FAL_KEY = process.env.FAL_API_KEY;
    }
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        console.error('❌ Invalid environment variables:');
        result.error.errors.forEach(e => {
            console.error(`  ${e.path.join('.')}: ${e.message}`);
        });
        process.exit(1);
    }
    return result.data;
}
exports.env = loadEnv();
// ── Admin helpers ─────────────────────────────────────────────────────────────
let _adminSet = null;
function _getAdminSet() {
    if (_adminSet)
        return _adminSet;
    const raw = exports.env.TELEGRAM_ADMIN_IDS ?? exports.env.TELEGRAM_CHAT_ID ?? '';
    _adminSet = new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
    return _adminSet;
}
function isTelegramAdmin(chatId) {
    return _getAdminSet().has(String(chatId));
}
//# sourceMappingURL=env.js.map