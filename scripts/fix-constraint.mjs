#!/usr/bin/env node
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envFile = readFileSync(path.join(__dirname, '../.env'), 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPABASE_URL = env['SUPABASE_URL'];
const SERVICE_KEY  = env['SUPABASE_SERVICE_KEY'];
const PROJECT_REF  = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');

const sql = `
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('UNPAID', 'PENDING', 'PARTIAL', 'PAID'));
`;

console.log(`Fixing constraint on project: ${PROJECT_REF}`);

// Try Management API
async function tryManagementApi() {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (res.ok) { console.log('✅ Management API OK'); return true; }
  console.log(`⚠️  Management API ${res.status}: ${body.slice(0, 300)}`);
  return false;
}

// Try pg direct
async function tryPg() {
  let pg;
  try { pg = await import('pg'); } catch { console.log('pg not installed'); return false; }
  const { Client } = pg.default ?? pg;
  const regions = ['aws-0-eu-central-1', 'aws-0-eu-west-3', 'aws-0-us-east-1'];
  for (const region of regions) {
    const cs = `postgresql://postgres.${PROJECT_REF}:${SERVICE_KEY}@${region}.pooler.supabase.com:5432/postgres?sslmode=require`;
    try {
      const client = new Client({ connectionString: cs, connectionTimeoutMillis: 5000 });
      await client.connect();
      await client.query('ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check');
      await client.query(`ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check CHECK (payment_status IN ('UNPAID', 'PENDING', 'PARTIAL', 'PAID'))`);
      await client.end();
      console.log(`✅ pg OK via ${region}`);
      return true;
    } catch (e) { console.log(`  ${region}: ${e.message?.slice(0, 80)}`); }
  }
  return false;
}

(async () => {
  let ok = await tryManagementApi();
  if (!ok) ok = await tryPg();
  if (!ok) {
    console.log(`
❌ Auto-fix failed. Run manually in Supabase SQL editor:

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('UNPAID', 'PENDING', 'PARTIAL', 'PAID'));
`);
  }
})();
