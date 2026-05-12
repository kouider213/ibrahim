/**
 * Nexus Memory — Persistent learning for the vision loop.
 * All functions fail gracefully if tables are missing (just logs a warning).
 */
import { supabase } from '../../integrations/supabase.js';

// djb2-like hash — not cryptographic, just identity
export function hashText(text: string): string {
  let h = 5381;
  const s = text.toLowerCase().trim().slice(0, 200);
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NexusTask {
  task_id:     string;
  objective:   string;
  status:      string;
  steps:       number;
  screenshots: number;
  provider:    string | null;
  duration_ms: number;
  error:       string | null;
  action_log:  string[];
  created_at?: string;
}

export interface NexusTaskStep {
  task_id:     string;
  step:        number;
  action:      string;
  payload:     Record<string, unknown>;
  success:     boolean;
  error:       string | null;
  screen_hash: string | null;
  provider:    string | null;
  latency_ms:  number;
  confidence:  number;
}

export interface NexusWorkflow {
  objective_hash:  string;
  objective:       string;
  action_sequence: string[];
  success_count:   number;
  fail_count:      number;
  reliability:     number;
  avg_steps:       number;
  avg_duration_ms: number;
  last_used_at:    string;
}

export interface NexusProviderStat {
  provider:       string;
  success_count:  number;
  fail_count:     number;
  avg_latency_ms: number;
  last_error:     string | null;
  last_error_at:  string | null;
  last_used_at:   string | null;
  cooldown_until: string | null;
  reliability:    number;
}

// ── Task History ──────────────────────────────────────────────────────────────

export async function saveTask(task: NexusTask): Promise<void> {
  try {
    const { error } = await supabase
      .from('nexus_tasks')
      .upsert(task, { onConflict: 'task_id' });
    if (error) console.warn('[NEXUS_MEM] saveTask:', error.message);
    else console.log(`[NEXUS_MEM] saved task=${task.task_id} status=${task.status}`);
  } catch (e) { console.warn('[NEXUS_MEM] saveTask ex:', e instanceof Error ? e.message : e); }
}

export async function saveStep(step: NexusTaskStep): Promise<void> {
  try {
    const { error } = await supabase.from('nexus_task_steps').insert(step);
    if (error) console.warn('[NEXUS_MEM] saveStep:', error.message);
  } catch (e) { console.warn('[NEXUS_MEM] saveStep ex:', e instanceof Error ? e.message : e); }
}

export async function getRecentTasks(limit = 10): Promise<NexusTask[]> {
  try {
    const { data } = await supabase
      .from('nexus_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as NexusTask[];
  } catch { return []; }
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export async function saveWorkflow(
  objective:  string,
  actions:    string[],
  success:    boolean,
  steps:      number,
  durationMs: number,
): Promise<void> {
  try {
    const hash = hashText(objective);
    const { data: ex } = await supabase
      .from('nexus_workflows')
      .select('*')
      .eq('objective_hash', hash)
      .maybeSingle();

    if (ex) {
      const total = (ex.success_count ?? 0) + (ex.fail_count ?? 0) + 1;
      await supabase.from('nexus_workflows').update({
        success_count:   (ex.success_count ?? 0) + (success ? 1 : 0),
        fail_count:      (ex.fail_count    ?? 0) + (success ? 0 : 1),
        action_sequence: success ? actions : ex.action_sequence,
        avg_steps:       (((ex.avg_steps ?? 0) * (total - 1)) + steps) / total,
        avg_duration_ms: (((ex.avg_duration_ms ?? 0) * (total - 1)) + durationMs) / total,
        last_used_at:    new Date().toISOString(),
      }).eq('objective_hash', hash);
    } else {
      await supabase.from('nexus_workflows').insert({
        objective_hash: hash, objective,
        action_sequence: actions,
        success_count: success ? 1 : 0,
        fail_count:    success ? 0 : 1,
        avg_steps: steps, avg_duration_ms: durationMs,
        last_used_at: new Date().toISOString(),
      });
    }
  } catch (e) { console.warn('[NEXUS_MEM] saveWorkflow:', e instanceof Error ? e.message : e); }
}

export async function getSuccessfulWorkflow(objective: string): Promise<NexusWorkflow | null> {
  try {
    const { data } = await supabase
      .from('nexus_workflows')
      .select('*')
      .eq('objective_hash', hashText(objective))
      .maybeSingle();
    if (!data) return null;
    const total = (data.success_count ?? 0) + (data.fail_count ?? 0);
    return {
      ...data,
      action_sequence: Array.isArray(data.action_sequence) ? data.action_sequence : [],
      reliability: total > 0 ? (data.success_count ?? 0) / total : 0,
    } as NexusWorkflow;
  } catch { return null; }
}

export async function getTopWorkflows(limit = 5): Promise<NexusWorkflow[]> {
  try {
    const { data } = await supabase
      .from('nexus_workflows')
      .select('*')
      .order('success_count', { ascending: false })
      .limit(limit);
    return ((data ?? []) as NexusWorkflow[]).map(w => ({
      ...w,
      action_sequence: Array.isArray(w.action_sequence) ? w.action_sequence : [],
      reliability: (w.success_count + w.fail_count) > 0
        ? w.success_count / (w.success_count + w.fail_count) : 0,
    }));
  } catch { return []; }
}

// ── Provider Stats + Dynamic Ranking ─────────────────────────────────────────

const COOLDOWN_MS       = 15 * 60_000; // 15 min after N consecutive fails
const COOLDOWN_THRESHOLD = 3;           // N consecutive fails to trigger cooldown

export async function updateProviderStats(
  provider:  string,
  success:   boolean,
  latencyMs: number,
  error:     string | null = null,
): Promise<void> {
  try {
    const { data: ex } = await supabase
      .from('nexus_provider_stats')
      .select('*')
      .eq('provider', provider)
      .maybeSingle();
    const now = new Date().toISOString();

    if (ex) {
      const total  = (ex.success_count ?? 0) + (ex.fail_count ?? 0) + 1;
      const avgLat = (((ex.avg_latency_ms ?? 0) * (total - 1)) + latencyMs) / total;
      const newFail = (ex.fail_count ?? 0) + (success ? 0 : 1);
      // Set cooldown when fail count hits a multiple of threshold
      const setCooldown = !success && newFail % COOLDOWN_THRESHOLD === 0;
      await supabase.from('nexus_provider_stats').update({
        success_count:  (ex.success_count ?? 0) + (success ? 1 : 0),
        fail_count:     newFail,
        avg_latency_ms: avgLat,
        last_error:     success ? ex.last_error : (error?.slice(0, 200) ?? null),
        last_error_at:  success ? ex.last_error_at : now,
        last_used_at:   now,
        cooldown_until: setCooldown
          ? new Date(Date.now() + COOLDOWN_MS).toISOString()
          : (success ? null : ex.cooldown_until),
      }).eq('provider', provider);
    } else {
      await supabase.from('nexus_provider_stats').insert({
        provider,
        success_count: success ? 1 : 0,
        fail_count:    success ? 0 : 1,
        avg_latency_ms: latencyMs,
        last_error:    error?.slice(0, 200) ?? null,
        last_error_at: success ? null : now,
        last_used_at:  now,
        cooldown_until: null,
      });
    }
  } catch (e) { console.warn('[NEXUS_MEM] updateProviderStats:', e instanceof Error ? e.message : e); }
}

export async function getProviderStats(): Promise<NexusProviderStat[]> {
  try {
    const { data } = await supabase
      .from('nexus_provider_stats')
      .select('*')
      .order('success_count', { ascending: false });
    return ((data ?? []) as NexusProviderStat[]).map(p => ({
      ...p,
      reliability: (p.success_count + p.fail_count) > 0
        ? p.success_count / (p.success_count + p.fail_count) : 0,
    }));
  } catch { return []; }
}

/**
 * Rank available providers by historical performance.
 * Providers in cooldown are excluded.
 * complexityHint influences provider preference (groq=simple, claude=complex).
 */
export function rankProviders(
  stats:          NexusProviderStat[],
  available:      string[],
  complexityHint: 'simple' | 'complex' = 'simple',
): string[] {
  const now = new Date();
  const scored = available.map(p => {
    const st = stats.find(s => s.provider === p);
    if (st?.cooldown_until && new Date(st.cooldown_until) > now) {
      console.log(`[NEXUS_MEM] provider=${p} in cooldown until ${st.cooldown_until}`);
      return { p, score: -1 };
    }
    let score = 0.5;
    if (st) {
      const total = st.success_count + st.fail_count;
      if (total >= 3) score = st.success_count / total;
    }
    if (p === 'groq')   score += complexityHint === 'simple' ? 0.20 : 0.05;
    if (p === 'claude') score += complexityHint === 'complex' ? 0.15 : 0;
    return { p, score };
  });
  return scored.filter(s => s.score >= 0).sort((a, b) => b.score - a.score).map(s => s.p);
}

// ── UI Patterns ───────────────────────────────────────────────────────────────

export async function rememberUiPattern(windowTitle: string, appName: string): Promise<void> {
  try {
    const { data: ex } = await supabase
      .from('nexus_ui_patterns')
      .select('id, seen_count')
      .eq('window_title', windowTitle.slice(0, 200))
      .maybeSingle();
    if (ex) {
      await supabase.from('nexus_ui_patterns')
        .update({ seen_count: (ex.seen_count ?? 0) + 1, last_seen_at: new Date().toISOString() })
        .eq('id', ex.id);
    } else {
      await supabase.from('nexus_ui_patterns').insert({
        window_title: windowTitle.slice(0, 200),
        app_name:     appName.slice(0, 100),
        seen_count:   1, last_seen_at: new Date().toISOString(),
      });
    }
  } catch { /* non-critical */ }
}

// ── Failure Patterns ──────────────────────────────────────────────────────────

export async function recordFailure(pattern: string, context?: string): Promise<void> {
  try {
    const key = pattern.slice(0, 200);
    const { data: ex } = await supabase
      .from('nexus_failures')
      .select('id, count')
      .eq('pattern', key)
      .maybeSingle();
    if (ex) {
      await supabase.from('nexus_failures')
        .update({ count: (ex.count ?? 0) + 1, last_seen_at: new Date().toISOString(), context: context?.slice(0, 500) })
        .eq('id', ex.id);
    } else {
      await supabase.from('nexus_failures').insert({
        pattern: key, context: context?.slice(0, 500),
        count: 1, last_seen_at: new Date().toISOString(),
      });
    }
  } catch { /* non-critical */ }
}

export async function getFailurePatterns(limit = 10): Promise<Array<{ pattern: string; count: number }>> {
  try {
    const { data } = await supabase
      .from('nexus_failures')
      .select('pattern, count')
      .order('count', { ascending: false })
      .limit(limit);
    return (data ?? []) as Array<{ pattern: string; count: number }>;
  } catch { return []; }
}

// ── Screenshots Meta ──────────────────────────────────────────────────────────

export async function saveScreenshotMeta(meta: {
  task_id:     string;
  step:        number;
  screen_hash: string;
  size_kb?:    number;
  ui_elements?: string[];
}): Promise<void> {
  try {
    await supabase.from('nexus_screenshots_meta').insert({
      ...meta, ui_elements: meta.ui_elements ?? [],
    });
  } catch { /* non-critical */ }
}

// ── Aggregated Vision Stats ───────────────────────────────────────────────────

export async function getVisionStats(): Promise<{
  total:        number;
  completed:    number;
  successRate:  number;
  avgDuration:  number;
  bestProvider: string;
}> {
  try {
    const { data } = await supabase
      .from('nexus_tasks')
      .select('status, duration_ms, provider');
    if (!data?.length) return { total: 0, completed: 0, successRate: 0, avgDuration: 0, bestProvider: 'none' };
    const total     = data.length;
    const completed = data.filter(t => t.status === 'completed').length;
    const avgDur    = Math.round(data.reduce((s, t) => s + (t.duration_ms ?? 0), 0) / total);
    const pc: Record<string, number> = {};
    data.filter(t => t.status === 'completed' && t.provider)
      .forEach(t => { pc[t.provider] = (pc[t.provider] ?? 0) + 1; });
    const bestProvider = Object.entries(pc).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
    return { total, completed, successRate: Math.round((completed / total) * 100), avgDuration: avgDur, bestProvider };
  } catch { return { total: 0, completed: 0, successRate: 0, avgDuration: 0, bestProvider: 'none' }; }
}
