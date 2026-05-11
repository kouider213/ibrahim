import { supabase } from '../integrations/supabase.js';
import { buildMemoryContext, type MemoryContextResult } from '../conversation/memory-selector.js';

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

export async function writeMemory(params: WriteMemoryParams): Promise<WriteMemoryResult> {
  const { key, value, domain, confidence = 0.9, source = 'orchestrator' } = params;

  try {
    // Check for existing active fact with same domain+key
    const { data: existing, error: fetchErr } = await supabase
      .from('memory_facts')
      .select('id')
      .eq('domain', domain)
      .eq('key', key)
      .eq('is_current', true)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (existing) {
      const { error: updateErr } = await supabase
        .from('memory_facts')
        .update({ value, confidence, updated_at: new Date().toISOString() })
        .eq('id', (existing as { id: string }).id);

      if (updateErr) throw updateErr;

      console.log(`[memory-engine] UPDATED domain=${domain} key="${key}" source=${source}`);
      return { success: true, id: (existing as { id: string }).id, operation: 'updated' };
    }

    // Insert new fact
    const { data: inserted, error: insertErr } = await supabase
      .from('memory_facts')
      .insert({ domain, key, value, confidence, is_current: true, source })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    console.log(`[memory-engine] CREATED domain=${domain} key="${key}" source=${source}`);
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
