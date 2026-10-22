import { redis } from '../queue/queue.js';

// Claude API pricing per 1M tokens (USD) — octobre 2026 (Haiku 5.5 : prompts ≤ 100K tokens)
const PRICING = {
  'claude-haiku-5-5':     { input: 0.10,  output: 0.50,   cacheRead: 0.01,  cacheWrite: 0.125 },
  'claude-sonnet-5-5':    { input: 2.00,  output: 10.00,  cacheRead: 0.20,  cacheWrite: 2.50  },
  'claude-opus-5-5':      { input: 4.00,  output: 20.00,  cacheRead: 0.20,  cacheWrite: 5.00  },
} as const;
type ModelKey = keyof typeof PRICING;

const ALERT_THRESHOLD_USD = 5.0; // alert when daily cost > $5
const TTL_SECONDS = 7 * 24 * 3600; // keep 7 days of data

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function redisKey(field: string): string {
  return `claude:cost:${todayKey()}:${field}`;
}

function modelKeyFor(model: string): ModelKey {
  if (model.includes('haiku'))  return 'claude-haiku-5-5';
  if (model.includes('opus'))   return 'claude-opus-5-5';
  return 'claude-sonnet-5-5'; // default
}

export async function trackTokenUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  source = '',
): Promise<void> {
  const key = modelKeyFor(model);
  const pipe = redis.pipeline();
  pipe.incrbyfloat(redisKey(`${key}:input`),      inputTokens);
  pipe.incrbyfloat(redisKey(`${key}:output`),     outputTokens);
  pipe.incrbyfloat(redisKey(`${key}:cache_read`), cacheReadTokens);
  pipe.incrbyfloat(redisKey(`${key}:cache_write`),cacheWriteTokens);
  // Refresh TTL on each write
  for (const k of Object.keys(PRICING) as ModelKey[]) {
    for (const field of ['input', 'output', 'cache_read', 'cache_write']) {
      pipe.expire(redisKey(`${k}:${field}`), TTL_SECONDS);
    }
  }
  // Compteur cumulé (sans expiration) : la page « À PAYER » estime le crédit Claude restant depuis la dernière recharge
  const pr = PRICING[key];
  const usd = (inputTokens * pr.input + outputTokens * pr.output + cacheReadTokens * pr.cacheRead + cacheWriteTokens * pr.cacheWrite) / 1_000_000;
  if (usd > 0) pipe.incrbyfloat('claude:spend:total_usd', usd);
  // Qui dépense ? (2026-10-22) : coût et nombre d'appels par origine (chat, mission, mentor…), pour la page À PAYER
  if (source && usd > 0) {
    const src = source.replace(/[^\w.-]/g, '_').slice(0, 40);
    pipe.incrbyfloat(redisKey(`src:${src}:usd`), usd);
    pipe.incrbyfloat(redisKey(`src:${src}:n`), 1);
    pipe.expire(redisKey(`src:${src}:usd`), TTL_SECONDS);
    pipe.expire(redisKey(`src:${src}:n`), TTL_SECONDS);
  }
  await pipe.exec();
}

/** Coût du jour par origine, du plus cher au moins cher. */
export async function getDailyCostBySource(date?: string): Promise<Array<{ source: string; usd: number; calls: number }>> {
  const d = date ?? todayKey();
  const { supabase } = await import('../integrations/supabase.js');
  const { data } = await supabase.from('app_kv').select('key, value').like('key', `claude:cost:${d}:src:%`).limit(500);
  const by: Record<string, { usd: number; calls: number }> = {};
  for (const r of (data ?? []) as Array<{ key: string; value: string }>) {
    const m = r.key.match(/:src:(.+):(usd|n)$/);
    if (!m) continue;
    const e = (by[m[1]] ??= { usd: 0, calls: 0 });
    if (m[2] === 'usd') e.usd = parseFloat(r.value) || 0; else e.calls = parseFloat(r.value) || 0;
  }
  // Valeurs encore en mémoire (pas encore recopiées dans app_kv) : la mémoire fait foi
  for (const src of Object.keys(by)) {
    const [u, n] = await Promise.all([redis.get(redisKey(`src:${src}:usd`)), redis.get(redisKey(`src:${src}:n`))]);
    if (u) by[src].usd = parseFloat(u); if (n) by[src].calls = parseFloat(n);
  }
  return Object.entries(by).map(([source, v]) => ({ source, ...v })).sort((a, b) => b.usd - a.usd);
}

export interface DailyCostReport {
  date: string;
  totalUSD: number;
  breakdown: Record<string, { inputTokens: number; outputTokens: number; cacheReadTokens: number; costUSD: number }>;
  alertTriggered: boolean;
}

export async function getDailyCostReport(date?: string): Promise<DailyCostReport> {
  const d = date ?? todayKey();
  const breakdown: DailyCostReport['breakdown'] = {};
  let totalUSD = 0;

  for (const [k, prices] of Object.entries(PRICING) as [ModelKey, typeof PRICING[ModelKey]][]) {
    const [inp, out, cr, cw] = await Promise.all([
      redis.get(`claude:cost:${d}:${k}:input`),
      redis.get(`claude:cost:${d}:${k}:output`),
      redis.get(`claude:cost:${d}:${k}:cache_read`),
      redis.get(`claude:cost:${d}:${k}:cache_write`),
    ]);
    const inputTokens      = parseFloat(inp  ?? '0');
    const outputTokens     = parseFloat(out  ?? '0');
    const cacheReadTokens  = parseFloat(cr   ?? '0');
    const cacheWriteTokens = parseFloat(cw   ?? '0');
    const costUSD =
      (inputTokens      / 1_000_000) * prices.input      +
      (outputTokens     / 1_000_000) * prices.output      +
      (cacheReadTokens  / 1_000_000) * prices.cacheRead   +
      (cacheWriteTokens / 1_000_000) * prices.cacheWrite;

    if (inputTokens + outputTokens > 0) {
      breakdown[k] = { inputTokens, outputTokens, cacheReadTokens, costUSD };
    }
    totalUSD += costUSD;
  }

  return { date: d, totalUSD, breakdown, alertTriggered: totalUSD >= ALERT_THRESHOLD_USD };
}

export async function checkCostAlert(): Promise<string | null> {
  const report = await getDailyCostReport();
  if (!report.alertTriggered) return null;

  const lines = [`💸 Coût Claude API aujourd'hui: $${report.totalUSD.toFixed(2)}`];
  for (const [model, data] of Object.entries(report.breakdown)) {
    const short = model.replace('claude-', '').replace('-4-5','').replace('-4-6','').replace('-4-7','');
    lines.push(`  ${short}: ${(data.inputTokens/1000).toFixed(0)}k→${(data.outputTokens/1000).toFixed(0)}k tok = $${data.costUSD.toFixed(2)}`);
  }
  lines.push(`⚠️ Seuil $${ALERT_THRESHOLD_USD} dépassé — vérifier l'usage`);
  return lines.join('\n');
}
