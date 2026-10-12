import axios from 'axios';
import { supabase } from './supabase.js';
import { env } from '../config/env.js';
import { redis } from '../queue/queue.js';

// Petit stockage durable dans Supabase pour ce qui DOIT survivre quand Upstash Redis est saturé :
// jetons de notification, préférences, historique des notifications, verrous des tâches planifiées.

/** Exécute du SQL (DDL) via l'API Management Supabase — le service key ne peut pas créer de table. */
export async function runSql(query: string): Promise<boolean> {
  const ref = env.SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1];
  if (!env.SUPABASE_ACCESS_TOKEN || !ref) return false;
  const post = (q: string) => axios.post(`https://api.supabase.com/v1/projects/${ref}/database/query`, { query: q },
    { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, timeout: 20_000 });
  await post(query);
  // Recharge le cache de schéma PostgREST pour que les changements soient visibles tout de suite
  await post("NOTIFY pgrst, 'reload schema';");
  return true;
}

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS app_kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE app_kv ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS proactive_history (
  id         BIGSERIAL PRIMARY KEY,
  actor      TEXT NOT NULL,
  type       TEXT NOT NULL,
  text       TEXT NOT NULL,
  deep_link  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proactive_history_actor_idx ON proactive_history (actor, created_at DESC);
ALTER TABLE proactive_history ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS job_runs (
  job        TEXT NOT NULL,
  slot       TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job, slot)
);
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;`;

export async function ensureAppStoreTables(): Promise<void> {
  try {
    const checks = await Promise.all(['app_kv', 'proactive_history', 'job_runs'].map(t => supabase.from(t).select('*').limit(1)));
    if (checks.every(c => !c.error)) return;
    if (await runSql(CREATE_SQL)) console.log('[app-store] ✅ tables app_kv / proactive_history / job_runs créées');
    else console.warn('[app-store] tables absentes et SUPABASE_ACCESS_TOKEN manquant — création impossible');
  } catch (err) {
    console.error('[app-store] migration échouée:', err instanceof Error ? err.message : err);
  }
}

// ── Clé/valeur (expiration optionnelle) ──
export async function kvGet(key: string): Promise<string | null> {
  const { data } = await supabase.from('app_kv').select('value, expires_at').eq('key', key).maybeSingle();
  const row = data as { value: string; expires_at: string | null } | null;
  if (!row || (row.expires_at && new Date(row.expires_at).getTime() < Date.now())) return null;
  return row.value;
}

export async function kvSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const expires_at = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
  const { error } = await supabase.from('app_kv').upsert({ key, value, expires_at, updated_at: new Date().toISOString() });
  if (error) throw new Error(`app_kv ${key}: ${error.message}`);
}

export async function kvDel(key: string): Promise<void> {
  await supabase.from('app_kv').delete().eq('key', key);
}

/**
 * Verrou anti-doublon d'une tâche planifiée : vrai pour la 1re instance qui prend ce créneau
 * (évite qu'un chevauchement de déploiement Railway lance deux fois le même job).
 * Si Supabase ne répond pas, on exécute quand même (mieux vaut un doublon rare qu'un job perdu).
 */
export async function claimJobRun(job: string, slot: string): Promise<boolean> {
  const { error } = await supabase.from('job_runs').insert({ job, slot });
  if (!error) return true;
  return error.code !== '23505';  // 23505 = déjà pris par une autre instance
}

/** Verrous du jour, marqueurs « déjà envoyé »… : même stockage que `redis` (mémoire + Supabase app_kv). */
export const durableKv = {
  get: (key: string) => redis.get(key),
  set: (key: string, value: string, ...args: Array<string | number>) => redis.set(key, value, ...args),
  del: (key: string) => redis.del(key),
};
