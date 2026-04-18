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
