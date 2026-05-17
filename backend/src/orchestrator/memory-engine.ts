import { supabase } from '../integrations/supabase.js';
import { buildMemoryContext, type MemoryContextResult } from '../conversation/memory-selector.js';
import crypto from 'crypto';

export type MemoryDomain =
  | 'identity'
  | 'business'
  | 'health'
  | 'family'
  | 'goal'
  | 'habit'
  | 'preference'
  | 'note';

export interface WriteMemoryParams {
  key:         string;
  value:       string;
  domain:      MemoryDomain;
  confidence?: number;
  source?:     string;
  userId?:     string;
}

export interface WriteMemoryResult {
  success:   boolean;
  id:        string | null;
  operation: 'created' | 'updated' | 'failed';
  error?:    string;
}

export interface MemoryStats {
  total:   number;
  domains: Record<string, number>;
}

interface MemoryFactRow {
  id:         string;
  domain:     string;
  key:        string;
  value:      string;
  confidence: number;
  is_current: boolean;
  updated_at: string;
}

// ── Normalize content for dedup comparison ───────────────────────────────────
// Lowercase, trim, strip simple punctuation, collapse whitespace
function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .trim()
    .replace(/[.!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Build a SHA256 dedup_key from normalized content + domain + user_id ──────
function buildDedupKey(value: string, domain: string, userId: string): string {
  const normalized = normalizeContent(value);
  const raw = `${normalized}|${domain}|${userId}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Exported for callers (e.g. rememberInfo) to compute a stable key before calling writeMemory.
 * Passing this as the `key` param means writeMemory's Step 2 domain+key check catches
 * normalized near-duplicates (punctuation/case variations of the same fact).
 */
export function computeMemoryKey(content: string, domain: string, userId = 'kouider'): string {
  return buildDedupKey(content, domain, userId);
}

export async function writeMemory(params: WriteMemoryParams): Promise<WriteMemoryResult> {
  const { key, value, domain, confidence = 0.9, source = 'orchestrator', userId: userIdParam } = params;
  const userId = userIdParam ?? 'kouider';
  const dedupKey = buildDedupKey(value, domain, userId);

  try {
    // ── Step 1: Dedup check via normalized SHA256 hash ───────────────────────
    // Try to use the dedup_key column if it exists in the schema.
    // If the column does not exist, Supabase returns an error — we catch it and
    // fall back to a fuzzy ILIKE search on the first 100 chars of normalised value.
    let existingId: string | null = null;

    const { data: dedupHit, error: dedupErr } = await supabase
      .from('memory_facts')
      .select('id')
      .eq('dedup_key', dedupKey)
      .eq('is_current', true)
      .maybeSingle();

    if (!dedupErr && dedupHit) {
      // Exact hash match — definitive duplicate
      existingId = (dedupHit as { id: string }).id;
      console.log(`[memory-engine] DUPLICATE_SKIPPED (hash) domain=${domain} dedup_key=${dedupKey.slice(0, 16)}… source=${source}`);
      return { success: true, id: existingId, operation: 'updated' };
    }

    if (dedupErr) {
      // dedup_key column probably doesn't exist yet → fallback: ILIKE on normalised content
      const normalizedSlice = normalizeContent(value).slice(0, 100);
      const { data: ilikHit } = await supabase
        .from('memory_facts')
        .select('id')
        .eq('domain', domain)
        .ilike('value', `%${normalizedSlice}%`)
        .eq('is_current', true)
        .maybeSingle();

      if (ilikHit) {
        existingId = (ilikHit as { id: string }).id;
        console.log(`[memory-engine] DUPLICATE_SKIPPED (ilike fallback) domain=${domain} source=${source}`);
        return { success: true, id: existingId, operation: 'updated' };
      }
    }

    // ── Step 2: Check for existing fact with same domain+key (for update) ────
    const { data: existing, error: fetchErr } = await supabase
      .from('memory_facts')
      .select('id')
      .eq('user_id', userId)
      .eq('domain', domain)
      .eq('key', key)
      .eq('is_current', true)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (existing) {
      // Build update payload — include dedup_key if column exists
      const updatePayload: Record<string, unknown> = {
        value,
        confidence,
        updated_at: new Date().toISOString(),
      };
      if (!dedupErr) updatePayload['dedup_key'] = dedupKey;

      const { error: updateErr } = await supabase
        .from('memory_facts')
        .update(updatePayload)
        .eq('id', (existing as { id: string }).id);

      if (updateErr) throw updateErr;

      console.log(`[memory-engine] UPDATED domain=${domain} key="${key}" source=${source}`);
      return { success: true, id: (existing as { id: string }).id, operation: 'updated' };
    }

    // ── Step 3: Insert new fact with dedup_key if column exists ──────────────
    const insertPayload: Record<string, unknown> = {
      user_id: userId, domain, key, value, confidence, is_current: true, source,
    };
    if (!dedupErr) insertPayload['dedup_key'] = dedupKey;

    const { data: inserted, error: insertErr } = await supabase
      .from('memory_facts')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    console.log(`[memory-engine] CREATED domain=${domain} key="${key}" dedup_key=${dedupKey.slice(0, 16)}… source=${source}`);
    return { success: true, id: (inserted as { id: string }).id, operation: 'created' };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[memory-engine] WRITE FAILED domain=${domain} key="${key}": ${error}`);
    return { success: false, id: null, operation: 'failed', error };
  }
}

export async function invalidateMemory(domain: MemoryDomain, key: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('memory_facts')
      .update({ is_current: false, updated_at: new Date().toISOString() })
      .eq('domain', domain)
      .eq('key', key)
      .eq('is_current', true);

    if (error) throw error;

    console.log(`[memory-engine] INVALIDATED domain=${domain} key="${key}"`);
    return true;
  } catch (err) {
    console.error(`[memory-engine] INVALIDATE FAILED ${domain}/${key}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

// Read: delegates to existing scored memory-selector
export async function readMemory(query: string, maxTokens = 300): Promise<MemoryContextResult> {
  return buildMemoryContext(query, maxTokens);
}

export async function getMemoryStats(): Promise<MemoryStats> {
  try {
    const { data, error } = await supabase
      .from('memory_facts')
      .select('domain')
      .eq('is_current', true);

    if (error) throw error;

    const domains: Record<string, number> = {};
    for (const row of (data as Array<{ domain: string }>) ?? []) {
      domains[row.domain] = (domains[row.domain] ?? 0) + 1;
    }

    return { total: (data ?? []).length, domains };
  } catch {
    return { total: 0, domains: {} };
  }
}

export async function listMemoryByDomain(domain: MemoryDomain, limit = 20): Promise<MemoryFactRow[]> {
  try {
    const { data, error } = await supabase
      .from('memory_facts')
      .select('id, domain, key, value, confidence, is_current, updated_at')
      .eq('domain', domain)
      .eq('is_current', true)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as MemoryFactRow[];
  } catch {
    return [];
  }
}
