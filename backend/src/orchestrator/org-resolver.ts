import { supabase } from '../integrations/supabase.js';

export interface OrgMember {
  orgId:                string;                  // UUID
  ownerKey:             string;                  // 'kouider' — data-filter key
  role:                 'owner' | 'admin' | 'member';
  displayName:          string;
  systemPromptOverride?: string;                 // SaaS tenants: dynamic sector prompt
}

// Default member — Kouider, used as fallback if DB not yet set up
export const DEFAULT_MEMBER: OrgMember = {
  orgId:       '',
  ownerKey:    'kouider',
  role:        'owner',
  displayName: 'Kouider',
};

// 5-minute in-memory cache
const _cache = new Map<string, { member: OrgMember; ts: number }>();
const TTL = 5 * 60 * 1000;

export async function resolveOrgMember(telegramId: string | number): Promise<OrgMember | null> {
  const tid = String(telegramId);
  const cached = _cache.get(tid);
  if (cached && Date.now() - cached.ts < TTL) return cached.member;

  try {
    const { data } = await supabase
      .from('organization_members')
      .select('org_id, owner_key, role, display_name')
      .eq('telegram_id', tid)
      .eq('is_active', true)
      .maybeSingle();

    if (!data) return null;

    const member: OrgMember = {
      orgId:       data.org_id,
      ownerKey:    data.owner_key,
      role:        data.role as OrgMember['role'],
      displayName: data.display_name,
    };
    _cache.set(tid, { member, ts: Date.now() });
    return member;
  } catch {
    return null;
  }
}

export function clearMemberCache(telegramId: string | number): void {
  _cache.delete(String(telegramId));
}

// Auto-register: appelé au 1er message d'un telegram_id autorisé mais pas encore en DB
export async function autoRegisterMember(
  telegramId:  string | number,
  displayName: string,
  ownerKey   = 'kouider',
  role: OrgMember['role'] = 'owner',
): Promise<OrgMember> {
  const tid = String(telegramId);
  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_key', ownerKey)
      .maybeSingle();

    if (org) {
      await supabase.from('organization_members').upsert({
        org_id:       org.id,
        owner_key:    ownerKey,
        telegram_id:  tid,
        display_name: displayName,
        role,
        is_active:    true,
      }, { onConflict: 'telegram_id' });

      clearMemberCache(tid);
      const resolved = await resolveOrgMember(tid);
      if (resolved) return resolved;
    }
  } catch (e) {
    console.error('[org-resolver] autoRegister failed:', e instanceof Error ? e.message : e);
  }
  // Fallback — retourne le membre par défaut sans UUID
  return { orgId: '', ownerKey, role, displayName };
}
