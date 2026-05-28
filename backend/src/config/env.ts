import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY:    z.string().min(1),
  SUPABASE_URL:         z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  REDIS_URL:            z.string().min(1),
  MOBILE_ACCESS_TOKEN:  z.string().min(16),
  MOBILE_TOKEN_HOUARI:  z.string().min(16).optional(), // Accès Houari — associé Fik Conciergerie
  OWNER_NAME:           z.string().default('Kouider'),
  PARTNER_NAME:         z.string().default('Houari'),
  BUSINESS_NAME:        z.string().default('Fik Conciergerie Oran'),
  PC_AGENT_TOKEN:       z.string().min(16),
  WEBHOOK_SECRET:       z.string().min(16),
  SESSION_SECRET:       z.string().min(16),
  PUSHOVER_USER_KEY:    z.string().min(1),
  PUSHOVER_APP_TOKEN:   z.string().min(1),
  ELEVENLABS_API_KEY:   z.string().min(1),
  ELEVENLABS_VOICE_ID:  z.string().min(1),
  GITHUB_TOKEN:         z.string().optional(),
  GITHUB_OWNER:         z.string().optional(),
  GITHUB_DEFAULT_REPO:  z.string().default('ibrahim'),
  GOOGLE_CLIENT_ID:     z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI:  z.string().optional(),
  VERCEL_TOKEN:         z.string().optional(),
  NETLIFY_TOKEN:        z.string().optional(),
  RAILWAY_TOKEN:        z.string().optional(),
  RAILWAY_PROJECT_ID:   z.string().optional(),
  RAILWAY_SERVICE_ID:   z.string().optional(),
  SUPABASE_ACCESS_TOKEN:z.string().optional(),
  TWILIO_ACCOUNT_SID:   z.string().optional(),
  TWILIO_AUTH_TOKEN:    z.string().optional(),
  TWILIO_WHATSAPP_FROM:          z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON:   z.string().optional(),
  PERSONAL_GCAL_ID:              z.string().optional(), // kouiderpablo@gmail.com personal calendar
  HOUARI_GCAL_ID:                z.string().optional(), // houari personal calendar
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  VAPID_PUBLIC_KEY:  z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL:       z.string().optional(),
  PEXELS_API_KEY:        z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY:    z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  ASSEMBLYAI_API_KEY:    z.string().optional(),
  TELEGRAM_BOT_TOKEN:     z.string().optional(),
  TELEGRAM_CHAT_ID:       z.string().optional(),
  TELEGRAM_ALLOWED_CHATS: z.string().optional(),
  // Comma-separated Telegram chat IDs with full admin access (document storage, sensitive OCR, etc.)
  // Defaults to TELEGRAM_CHAT_ID if not set.
  TELEGRAM_ADMIN_IDS:     z.string().optional(),
  // ── TikTok Content Posting API ──
  TIKTOK_ACCESS_TOKEN: z.string().optional(),
  TIKTOK_OPEN_ID:      z.string().optional(),
  // ── AI Generation APIs ───────────────────────────────────────────────────
  // ── Kling AI — Génération vidéo IA depuis image ──
  KLING_API_KEY:       z.string().optional(),
  // ── Replicate — Génération IA images (Flux.1) ──
  REPLICATE_API_TOKEN: z.string().optional(),
  // ── fal.ai — Génération vidéos IA (Kling 1.6, WAN 2.1) ──
  FAL_KEY:             z.string().optional(),   // nom officiel dans Railway
  FAL_API_KEY:         z.string().optional(),   // fallback compatibilité
  // ── Runway — Génération vidéo IA haute fidélité (Gen-3 Alpha Turbo) — optionnel ──
  RUNWAY_API_KEY:      z.string().optional(),
  // ── Apify — Scraping TikTok concurrents ──
  APIFY_API_KEY:       z.string().optional(),
  // ── Jina AI — Recherche web (s.jina.ai) + fetch URL (r.jina.ai) ──
  JINA_API_KEY:        z.string().optional(),
  // ── Google Custom Search API — alternative web search ──
  GOOGLE_MAPS_API_KEY:       z.string().optional(),
  GOOGLE_SEARCH_API_KEY:    z.string().optional(),
  GOOGLE_SEARCH_ENGINE_ID:  z.string().optional(),
  // ── Phase 2: Multi-LLM Router ────────────────────────────────────────────
  GROQ_API_KEY:        z.string().optional(),   // LLaMA 3.3 70B — fast path (gratuit)
  OPENAI_API_KEY:      z.string().optional(),   // GPT-4o — fallback Claude
  GEMINI_API_KEY:      z.string().optional(),   // Gemini 1.5 Flash — long context + fallback
  SAAS_JWT_SECRET:      z.string().min(32).optional(),
  PORT:                 z.coerce.number().int().positive().default(3000),
  NODE_ENV:             z.enum(['development', 'production', 'test']).default('development'),
  BACKEND_URL:          z.string().url().default('http://localhost:3000'),
  WS_URL:               z.string().default('ws://localhost:3000'),
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

export const env = loadEnv();
export type Env = typeof env;

