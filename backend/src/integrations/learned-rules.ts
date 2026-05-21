import { supabase } from './supabase.js';

export interface LearnedRule {
  id:          string;
  owner_key:   string;
  category:    string;
  rule:        string;
  context:     string | null;
  confidence:  number;
  priority:    number;
  active:      boolean;
  source:      string;
  apply_count: number;
  created_at:  string;
}

export interface SaveRuleParams {
  ownerKey:   string;
  category?:  'business' | 'client' | 'pricing' | 'communication' | 'operations' | 'reminder';
  rule:       string;
  context?:   string;
  confidence?: number;
  priority?:   number;
}

// Load active rules for a given owner (owner-specific + global)
export async function getLearnedRules(ownerKey: string, limit = 50): Promise<LearnedRule[]> {
  try {
    const { data, error } = await supabase
      .from('learned_rules')
      .select('*')
      .or(`owner_key.eq.${ownerKey},owner_key.eq.global`)
      .eq('active', true)
      .order('priority', { ascending: false })
      .order('apply_count', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as LearnedRule[];
  } catch (err) {
    console.error('[learned-rules] getLearnedRules failed:', (err as Error).message);
    return [];
  }
}

// Save or update a rule (upsert by owner_key + rule text truncated to 200 chars)
export async function saveLearnedRule(params: SaveRuleParams): Promise<{ ok: boolean; id?: string; operation?: string }> {
  const {
    ownerKey,
    category = 'business',
    rule,
    context,
    confidence = 0.85,
    priority = 5,
  } = params;

  try {
    // Check if a similar rule already exists (by owner + first 150 chars)
    const ruleSlice = rule.slice(0, 150);
    const { data: existing } = await supabase
      .from('learned_rules')
      .select('id, apply_count')
      .eq('owner_key', ownerKey)
      .ilike('rule', `${ruleSlice}%`)
      .eq('active', true)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('learned_rules')
        .update({
          rule,
          context:     context ?? null,
          confidence,
          apply_count: (existing.apply_count ?? 0) + 1,
          last_applied: new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) throw error;
      console.log(`[learned-rules] UPDATED rule owner=${ownerKey} category=${category}`);
      return { ok: true, id: existing.id, operation: 'updated' };
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('learned_rules')
      .insert({
        owner_key:  ownerKey,
        category,
        rule,
        context:    context ?? null,
        confidence,
        priority,
        active:     true,
        source:     'conversation',
      })
      .select('id')
      .single();

    if (insertErr) throw insertErr;
    console.log(`[learned-rules] CREATED rule owner=${ownerKey} category=${category}`);
    return { ok: true, id: (inserted as { id: string }).id, operation: 'created' };
  } catch (err) {
    console.error('[learned-rules] saveLearnedRule failed:', (err as Error).message);
    return { ok: false };
  }
}

// Deactivate a rule by ID
export async function deactivateRule(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('learned_rules')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch { return false; }
}

// Format rules for context injection
export function formatRulesForContext(rules: LearnedRule[]): string {
  if (rules.length === 0) return '';
  const byCategory: Record<string, LearnedRule[]> = {};
  for (const r of rules) {
    (byCategory[r.category] ??= []).push(r);
  }
  const lines: string[] = [];
  for (const [cat, catRules] of Object.entries(byCategory)) {
    lines.push(`[${cat.toUpperCase()}]`);
    for (const r of catRules) {
      lines.push(`  • ${r.rule}`);
    }
  }
  return lines.join('\n');
}

// Track pattern occurrence
export async function trackConversationPattern(
  ownerKey: string,
  patternType: string,
  exampleTrigger?: string,
  hour?: number,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('conversation_patterns')
      .select('id, occurrence_count')
      .eq('owner_key', ownerKey)
      .eq('pattern_type', patternType)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('conversation_patterns')
        .update({
          occurrence_count: (existing.occurrence_count ?? 0) + 1,
          last_seen_at:     new Date().toISOString(),
          ...(exampleTrigger ? { example_trigger: exampleTrigger.slice(0, 200) } : {}),
          ...(hour != null   ? { typical_hour: hour } : {}),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('conversation_patterns')
        .insert({
          owner_key:       ownerKey,
          pattern_type:    patternType,
          occurrence_count: 1,
          example_trigger: exampleTrigger?.slice(0, 200),
          typical_hour:    hour,
        });
    }
  } catch { /* non-blocking */ }
}
