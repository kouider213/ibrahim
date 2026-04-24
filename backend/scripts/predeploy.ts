#!/usr/bin/env tsx
/**
 * Ibrahim Pre-Deploy Verification Script
 * Run before every Railway / Netlify push.
 * Checks: TypeScript, env vars, package-lock sync, critical imports.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

let exitCode = 0;

function pass(msg: string)  { console.log(`  ✅ ${msg}`); }
function fail(msg: string)  { console.error(`  ❌ ${msg}`); exitCode = 1; }
function warn(msg: string)  { console.warn(`  ⚠️  ${msg}`); }
function title(msg: string) { console.log(`\n▶ ${msg}`); }

// ── 1. TypeScript compilation ─────────────────────────────────
title('TypeScript check');
try {
  execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe' });
  pass('Zero TypeScript errors');
} catch (err: any) {
  const out = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
  const count = (out.match(/error TS/g) ?? []).length;
  fail(`${count} TypeScript error(s) found`);
  console.error(out.slice(0, 2000));
}

// ── 2. package.json ↔ package-lock.json sync ─────────────────
title('package-lock.json sync');
const pkgPath      = path.join(ROOT, 'package.json');
const lockPath     = path.join(ROOT, 'package-lock.json');
const pkg          = JSON.parse(readFileSync(pkgPath, 'utf8'));
const lock         = JSON.parse(readFileSync(lockPath, 'utf8'));
const lockPackages = lock.packages?.['']?.dependencies ?? lock.dependencies ?? {};

const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const missing: string[] = [];

for (const dep of Object.keys(allDeps)) {
  const inLock =
    lockPackages[dep] != null ||
    lock.packages?.[`node_modules/${dep}`] != null;
  if (!inLock) missing.push(dep);
}

if (missing.length === 0) {
  pass('package-lock.json is in sync');
} else {
  fail(`These packages are in package.json but NOT in package-lock.json: ${missing.join(', ')}`);
  fail('Run: cd backend && npm install');
}

// ── 3. Required environment variables ────────────────────────
title('Environment variables');
const REQUIRED_ENV = [
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'REDIS_URL',
  'MOBILE_ACCESS_TOKEN',
  'PC_AGENT_TOKEN',
  'WEBHOOK_SECRET',
  'SESSION_SECRET',
  'PUSHOVER_USER_KEY',
  'PUSHOVER_APP_TOKEN',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_VOICE_ID',
];
const OPTIONAL_ENV = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'TELEGRAM_BOT_TOKEN',
  'GITHUB_TOKEN',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'NETLIFY_TOKEN',
  'RAILWAY_TOKEN',
];

const env = process.env;
const missingEnv = REQUIRED_ENV.filter(k => !env[k]);
if (missingEnv.length === 0) {
  pass(`All ${REQUIRED_ENV.length} required env vars present`);
} else {
  fail(`Missing required env vars: ${missingEnv.join(', ')}`);
}
const missingOpt = OPTIONAL_ENV.filter(k => !env[k]);
if (missingOpt.length > 0) {
  warn(`Optional env vars not set (features disabled): ${missingOpt.join(', ')}`);
}

// ── 4. Critical files exist ───────────────────────────────────
title('Critical files');
const CRITICAL_FILES = [
  'src/index.ts',
  'src/config/env.ts',
  'src/config/constants.ts',
  'src/integrations/supabase.ts',
  'src/integrations/claude-api.ts',
  'src/integrations/tool-executor.ts',
  'src/integrations/tools.ts',
  'src/conversation/context-builder.ts',
  'src/conversation/orchestrator.ts',
  'src/queue/scheduler.ts',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
];

const missingFiles = CRITICAL_FILES.filter(f => !existsSync(path.join(ROOT, f)));
if (missingFiles.length === 0) {
  pass(`All ${CRITICAL_FILES.length} critical files present`);
} else {
  fail(`Missing critical files: ${missingFiles.join(', ')}`);
}

// ── 5. No conflict markers in source ─────────────────────────
title('Merge conflict check');
try {
  const out = execSync(
    'grep -rl "<<<<<<< \\|>>>>>>> \\|=======" src/',
    { cwd: ROOT, stdio: 'pipe' }
  ).toString().trim();
  if (out) {
    fail(`Merge conflict markers found in: ${out.split('\n').join(', ')}`);
  } else {
    pass('No merge conflict markers found');
  }
} catch {
  pass('No merge conflict markers found');
}

// ── 6. Node version ──────────────────────────────────────────
title('Node.js version');
const nodeVer = process.version;
const major   = parseInt(nodeVer.slice(1));
if (major >= 18) {
  pass(`Node ${nodeVer} (≥18 required)`);
} else {
  fail(`Node ${nodeVer} is too old — Railway requires ≥18`);
}

// ── Summary ───────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
if (exitCode === 0) {
  console.log('✅ Pre-deploy: ALL CHECKS PASSED — safe to push');
} else {
  console.error('❌ Pre-deploy: CHECKS FAILED — fix errors before pushing');
}
console.log('─'.repeat(50) + '\n');

process.exit(exitCode);
