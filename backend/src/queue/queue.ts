import { KvRedis } from './kv-redis.js';

// Ancien client Upstash Redis remplacé : Upstash était rate-limité et faisait tomber notifs, jobs,
// verrous, compteurs… `redis` garde la même interface (get/set/incr/lpush/…) mais stocke en mémoire
// + Supabase `app_kv`. Les files BullMQ (actions/voice/notify) n'avaient plus de worker : supprimées.
export const redis = new KvRedis();

// Sauvegarde les dernières écritures avant l'arrêt (redéploiement Railway)
/** Tâches rapides à faire avant l'arrêt (ex. garder les questions en cours, brain-retry.ts). */
export const shutdownHooks: Array<() => Promise<void>> = [];
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => {
    void Promise.race([Promise.allSettled(shutdownHooks.map(h => h())), new Promise(r => setTimeout(r, 2500))])
      .then(() => redis.flush()).finally(() => process.exit(0));
  });
}

export interface ExecuteActionJob {
  action:    string;
  params:    Record<string, unknown>;
  taskId?:   string;
  sessionId: string;
}
