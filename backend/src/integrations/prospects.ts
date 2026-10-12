import axios from 'axios';
import { supabase } from './supabase.js';
import { env } from '../config/env.js';

// Prospection B2B de FIK Conciergerie (Oran) : propriétaires d'appartements, loueurs de voitures,
// agences de voyage, entreprises (TotalEnergies…). Distinct de client_leads (clients qui CHERCHENT un bien).

export const PROSPECT_SEGMENTS = ['proprietaire_appart', 'loueur_voitures', 'agence_voyage', 'entreprise', 'autre'] as const;
export const PROSPECT_STATUSES = ['a_contacter', 'contacte', 'a_repondu', 'interesse', 'client', 'refus', 'stop'] as const;
export type ProspectSegment = typeof PROSPECT_SEGMENTS[number];
export type ProspectStatus  = typeof PROSPECT_STATUSES[number];

export interface Prospect {
  id: string; company: string; contact_name: string | null; email: string | null; phone: string | null;
  segment: ProspectSegment; city: string; source: string | null; status: ProspectStatus;
  notes: string | null; last_contacted_at: string | null; created_at: string;
}

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS prospects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company           TEXT NOT NULL,
  contact_name      TEXT,
  email             TEXT,
  phone             TEXT,
  segment           TEXT NOT NULL DEFAULT 'autre',
  city              TEXT NOT NULL DEFAULT 'Oran',
  source            TEXT,
  status            TEXT NOT NULL DEFAULT 'a_contacter',
  notes             TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prospects_email_uniq ON prospects (lower(email)) WHERE email IS NOT NULL;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;`;

/** Crée la table au démarrage si absente (via l'API Management Supabase — le service key ne peut pas faire de DDL). */
export async function ensureProspectsTable(): Promise<void> {
  const { error } = await supabase.from('prospects').select('id').limit(1);
  if (!error) return;
  const ref = env.SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1];
  if (!env.SUPABASE_ACCESS_TOKEN || !ref) {
    console.warn('[prospects] table absente et SUPABASE_ACCESS_TOKEN manquant — création impossible');
    return;
  }
  try {
    await axios.post(`https://api.supabase.com/v1/projects/${ref}/database/query`, { query: CREATE_SQL },
      { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, timeout: 20_000 });
    // Recharge le cache de schéma PostgREST pour que la table soit visible tout de suite
    await axios.post(`https://api.supabase.com/v1/projects/${ref}/database/query`, { query: "NOTIFY pgrst, 'reload schema';" },
      { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, timeout: 20_000 });
    console.log('[prospects] ✅ table créée');
  } catch (err) {
    console.error('[prospects] création échouée:', err instanceof Error ? err.message : err);
  }
}

const norm = (s: string) => s.trim().toLowerCase();

export async function addProspect(p: {
  company: string; segment: ProspectSegment; email?: string; phone?: string;
  contact_name?: string; city?: string; source?: string; notes?: string;
}): Promise<{ prospect: Prospect; duplicate: boolean }> {
  // Doublon : même email, ou même nom d'entreprise dans la même ville
  const dupQuery = p.email
    ? supabase.from('prospects').select('*').ilike('email', norm(p.email))
    : supabase.from('prospects').select('*').ilike('company', p.company.trim()).eq('city', p.city ?? 'Oran');
  const { data: dup } = await dupQuery.limit(1).maybeSingle();
  if (dup) return { prospect: dup as Prospect, duplicate: true };

  const { data, error } = await supabase.from('prospects').insert({
    company: p.company.trim(), segment: p.segment, email: p.email ? norm(p.email) : null,
    phone: p.phone?.trim() || null, contact_name: p.contact_name?.trim() || null,
    city: p.city?.trim() || 'Oran', source: p.source?.trim() || null, notes: p.notes?.trim() || null,
  }).select('*').single();
  if (error) throw new Error(`Ajout prospect: ${error.message}`);
  return { prospect: data as Prospect, duplicate: false };
}

export async function listProspects(f: { segment?: string; status?: string; limit?: number } = {}): Promise<Prospect[]> {
  let q = supabase.from('prospects').select('*').order('created_at', { ascending: false })
    .limit(Math.min(Math.max(f.limit ?? 20, 1), 100));
  if (f.segment) q = q.eq('segment', f.segment);
  if (f.status)  q = q.eq('status', f.status);
  const { data, error } = await q;
  if (error) throw new Error(`Liste prospects: ${error.message}`);
  return (data ?? []) as Prospect[];
}

/** Trouve un prospect par email exact, sinon par nom d'entreprise (contient). */
export async function findProspect(query: string): Promise<Prospect[]> {
  const q = query.trim();
  const byEmail = q.includes('@')
    ? await supabase.from('prospects').select('*').ilike('email', norm(q)).limit(5)
    : await supabase.from('prospects').select('*').ilike('company', `%${q.replace(/[%_]/g, '')}%`).limit(5);
  return (byEmail.data ?? []) as Prospect[];
}

export async function updateProspect(id: string, patch: Partial<Pick<Prospect, 'status' | 'notes' | 'last_contacted_at' | 'email' | 'phone' | 'contact_name'>>): Promise<void> {
  const { error } = await supabase.from('prospects').update(patch).eq('id', id);
  if (error) throw new Error(`Mise à jour prospect: ${error.message}`);
}

/** Après un envoi : marque le prospect (si c'en est un) comme contacté. Silencieux si la table n'existe pas. */
export async function markProspectContacted(email: string): Promise<void> {
  const { data } = await supabase.from('prospects').select('id, status').ilike('email', norm(email)).limit(1).maybeSingle();
  if (!data) return;
  const row = data as { id: string; status: ProspectStatus };
  await supabase.from('prospects').update({
    last_contacted_at: new Date().toISOString(),
    ...(row.status === 'a_contacter' ? { status: 'contacte' } : {}),
  }).eq('id', row.id);
}

/** Vrai si l'adresse a demandé à ne plus être contactée (STOP) ou a refusé. */
export async function isOptedOut(email: string): Promise<boolean> {
  const { data } = await supabase.from('prospects').select('status').ilike('email', norm(email)).limit(1).maybeSingle();
  const status = (data as { status?: string } | null)?.status;
  return status === 'stop' || status === 'refus';
}
