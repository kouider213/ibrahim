#!/usr/bin/env node
/**
 * Migrate Supabase schema via Management API + direct pg fallback
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
const envFile = readFileSync(path.join(__dirname, '../.env'), 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const SUPABASE_URL  = env['SUPABASE_URL'];
const SERVICE_KEY   = env['SUPABASE_SERVICE_KEY'];
const PROJECT_REF   = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

console.log(`\n🗄️  Migrating Supabase project: ${PROJECT_REF}\n`);

const sql = readFileSync(path.join(__dirname, '../supabase/schema-phase1.sql'), 'utf-8');

// ── Approach 1: Supabase Management API ──────────────────────
async function tryManagementApi() {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (res.ok) {
    console.log('✅ Migration via Management API succeeded');
    return true;
  }
  const body = await res.text();
  console.log(`⚠️  Management API: ${res.status} — ${body.slice(0, 200)}`);
  return false;
}

// ── Approach 2: Supabase JS client (individual table checks) ─
async function trySupabaseClient() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Trying Supabase client approach...');

  // Check if tables already exist by trying to select from them
  const tablesToCheck = [
    'projects', 'tasks', 'task_runs', 'validations', 'notifications',
    'conversations', 'user_preferences', 'integrations', 'audit_logs',
    'ibrahim_rules', 'reservations', 'vehicles',
  ];

  const results = [];
  for (const table of tablesToCheck) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error?.code === 'PGRST116' || error?.message?.includes('does not exist')) {
      results.push({ table, exists: false });
    } else {
      results.push({ table, exists: true });
    }
  }

  const existing = results.filter(r => r.exists).map(r => r.table);
  const missing  = results.filter(r => !r.exists).map(r => r.table);

  if (existing.length > 0) console.log(`✅ Tables already exist: ${existing.join(', ')}`);
  if (missing.length > 0) console.log(`⚠️  Tables missing: ${missing.join(', ')}`);

  return missing.length === 0;
}

// ── Approach 3: pg direct connection via Supabase pooler ─────
async function tryPgConnection() {
  let pg;
  try {
    pg = await import('pg');
  } catch {
    console.log('pg not installed, skipping direct connection');
    return false;
  }

  const { Client } = pg.default ?? pg;

  // Try pooler regions in order of likelihood
  const regions = [
    'aws-0-eu-central-1',
    'aws-0-eu-west-3',
    'aws-0-us-east-1',
    'aws-0-ap-southeast-1',
  ];

  for (const region of regions) {
    const connectionString = `postgresql://postgres.${PROJECT_REF}:${SERVICE_KEY}@${region}.pooler.supabase.com:5432/postgres?sslmode=require`;
    try {
      const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
      await client.connect();
      console.log(`✅ Connected via ${region}`);

      // Execute SQL in chunks (split on statement boundaries)
      const statements = sql
        .split(/;\s*\n/)
        .map(s => s.trim())
        .filter(s => s.length > 5 && !s.startsWith('--'));

      let ok = 0;
      let fail = 0;
      for (const stmt of statements) {
        try {
          await client.query(stmt + ';');
          ok++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes('already exists') && !msg.includes('duplicate')) {
            console.log(`  ⚠️  ${msg.slice(0, 100)}`);
            fail++;
          } else {
            ok++; // Already exists = fine
          }
        }
      }

      await client.end();
      console.log(`✅ Migration done: ${ok} succeeded, ${fail} failed`);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  Region ${region}: ${msg.slice(0, 80)}`);
    }
  }
  return false;
}

// ── Run all approaches ────────────────────────────────────────
(async () => {
  let success = await tryManagementApi();
  if (!success) success = await tryPgConnection();
  if (!success) success = await trySupabaseClient();

  if (!success) {
    console.log(`
⚠️  Migration automatique impossible sans le mot de passe Postgres.

   → Ouvre https://supabase.com/dashboard/project/${PROJECT_REF}/sql
   → Colle le contenu de supabase/schema-phase1.sql
   → Clique Run

   Le backend fonctionnera dès que les tables sont créées.
`);
  }
})();
