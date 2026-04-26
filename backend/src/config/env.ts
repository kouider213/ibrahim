import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY:    z.string().min(1),
  SUPABASE_URL:         z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  REDIS_URL:            z.string().min(1),
  MOBILE_ACCESS_TOKEN:  z.string().min(16),
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
  NETLIFY_TOKEN:        z.string().optional(),
  RAILWAY_TOKEN:        z.string().optional(),
  RAILWAY_PROJECT_ID:   z.string().optional(),
  RAILWAY_SERVICE_ID:   z.string().optional(),
  SUPABASE_ACCESS_TOKEN:z.string().optional(),
  TWILIO_ACCOUNT_SID:   z.string().optional(),
  TWILIO_AUTH_TOKEN:    z.string().optional(),
  TWILIO_WHATSAPP_FROM:          z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON:   z.string().optional(),
  PEXELS_API_KEY:        z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY:    z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  ASSEMBLYAI_API_KEY:    z.string().optional(),

  TELEGRAM_BOT_TOKEN:     z.string().optional(),
  TELEGRAM_CHAT_ID:       z.string().optional(),
  TELEGRAM_ALLOWED_CHATS: z.string().optional(),
  PORT:                 z.coerce.number().int().positive().default(3000),
  NODE_ENV:             z.enum(['development', 'production', 'test']).default('development'),
  BACKEND_URL:          z.string().url().default('http://localhost:3000'),
  WS_URL:               z.string().default('ws://localhost:3000'),
});

function loadEnv() {
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
