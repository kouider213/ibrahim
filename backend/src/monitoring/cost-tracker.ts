import { redis } from '../queue/queue.js';

// Claude API pricing per 1M tokens (USD) — May 2025
const PRICING = {
  'claude-haiku-4-5':     { input: 0.80,  output: 4.00,   cacheRead: 0.08,  cacheWrite: 1.00  },
  'claude-sonnet-4-6':    { input: 3.00,  output: 15.00,  cacheRead: 0.30,  cacheWrite: 3.75  },
  'claude-opus-4-7':      { input: 15.00, output: 75.00,  cacheRead: 1.50,  cacheWrite: 18.75 },
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
  if (model.includes('haiku'))  return 'claude-haiku-4-5';
  if (model.includes('opus'))   return 'claude-opus-4-7';
  return 'claude-sonnet-4-6'; // default
}

export async function trackTokenUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
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
  await pipe.exec();
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
