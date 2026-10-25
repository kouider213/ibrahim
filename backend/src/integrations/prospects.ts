import { supabase } from './supabase.js';
import { runSql } from './app-store.js';

// Prospection B2B de FIK Conciergerie (Oran) : propriétaires d'appartements, loueurs de voitures,
// agences de voyage, entreprises (TotalEnergies…). Distinct de client_leads (clients qui CHERCHENT un bien).

export const PROSPECT_SEGMENTS = ['proprietaire_appart', 'loueur_voitures', 'agence_voyage', 'entreprise', 'grand_compte', 'organisme', 'autre', 'site_web'] as const;  // site_web = commerce sans site (démarchage FIK Sites)
export const PROSPECT_STATUSES = ['a_contacter', 'contacte', 'a_repondu', 'interesse', 'client', 'refus', 'stop'] as const;
export type ProspectSegment = typeof PROSPECT_SEGMENTS[number];
export type ProspectStatus  = typeof PROSPECT_STATUSES[number];

export interface Prospect {
  id: string; company: string; contact_name: string | null; email: string | null; phone: string | null;
  segment: ProspectSegment; city: string; source: string | null; status: ProspectStatus;
  notes: string | null; last_contacted_at: string | null; created_at: string;
  // Suivi Gmail (démarchage auto) : conversation, dernier mail reçu, réponse proposée par Dzaryx
  gmail_thread_id: string | null; last_subject: string | null; reply_message_id: string | null;
  reply_seen_id: string | null; last_reply_text: string | null; suggested_reply: string | null;
  // Grands comptes : décideurs trouvés sur LinkedIn + leur email pro + mail préparé (Kouider l'envoie lui-même)
  website: string | null; linkedin_contacts: LinkedinContact[];
  // Langue du mail envoyé (fr, en, ar…) + son texte, pour que Kouider le relise dans la page
  lang: string | null; last_sent_text: string | null;
  // Relance (une seule, 5 jours sans réponse), lien de suivi du site (?ref=), date de la réponse reçue
  followup_at: string | null; ref_code: string | null; site_visit_at: string | null; site_visits: number; replied_at: string | null;
  // Partenaires sans email : message WhatsApp préparé (Kouider l'envoie en un clic depuis la page)
  whatsapp_message: string | null; whatsapp_sent_at: string | null;
  // Société intéressée : lignes de devis proposées (montants à saisir par Kouider) + créneaux libres proposés
  quote_draft: QuoteDraftLine[] | null; proposed_slots: string[] | null;
}

export interface QuoteDraftLine { label: string; currency: string }

// email : adresse pro trouvée telle quelle sur le web (jamais devinée). Sans email, le décideur n'est plus proposé
// (envoyer un message LinkedIn à quelqu'un qu'on ne connaît pas est payant). subject : objet du mail préparé.
export interface LinkedinContact { name: string; title: string; url: string; message: string; sent_at: string | null; email?: string | null; subject?: string | null }

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

const AUTOPILOT_SQL = `
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS gmail_thread_id  TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_subject     TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reply_message_id TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reply_seen_id    TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_reply_text  TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS suggested_reply  TEXT;
CREATE INDEX IF NOT EXISTS prospects_thread_idx ON prospects (gmail_thread_id);
CREATE TABLE IF NOT EXISTS prospect_autopilot (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled    BOOLEAN NOT NULL DEFAULT true,
  per_day    INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO prospect_autopilot (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE prospect_autopilot ENABLE ROW LEVEL SECURITY;`;

const LINKEDIN_SQL = `
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website           TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS linkedin_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;`;

const LANG_SQL = `
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS lang           TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_sent_text TEXT;`;

const GROWTH_SQL = `
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS followup_at      TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ref_code         TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS site_visit_at    TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS site_visits      INT NOT NULL DEFAULT 0;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS replied_at       TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS whatsapp_message TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS quote_draft      JSONB;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS proposed_slots   JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS prospects_ref_uniq ON prospects (ref_code) WHERE ref_code IS NOT NULL;`;

/** Crée la table (et les colonnes du démarchage auto) au démarrage si absentes (via l'API Management Supabase — le service key ne peut pas faire de DDL). */
export async function ensureProspectsTable(): Promise<void> {
  try {
    const { error } = await supabase.from('prospects').select('id').limit(1);
    if (error && await runSql(CREATE_SQL)) console.log('[prospects] ✅ table créée');
    const { error: colErr } = await supabase.from('prospects').select('suggested_reply').limit(1);
    const { error: apErr }  = await supabase.from('prospect_autopilot').select('id').limit(1);
    if ((colErr || apErr) && await runSql(AUTOPILOT_SQL)) console.log('[prospects] ✅ colonnes démarchage auto créées');
    else if (colErr || apErr) console.warn('[prospects] colonnes absentes et SUPABASE_ACCESS_TOKEN manquant — création impossible');
    const { error: liErr } = await supabase.from('prospects').select('linkedin_contacts').limit(1);
    if (liErr && await runSql(LINKEDIN_SQL)) console.log('[prospects] ✅ colonnes grands comptes / LinkedIn créées');
    const { error: langErr } = await supabase.from('prospects').select('last_sent_text').limit(1);
    if (langErr && await runSql(LANG_SQL)) console.log('[prospects] ✅ colonnes langue / texte envoyé créées');
    const { error: grErr } = await supabase.from('prospects').select('proposed_slots').limit(1);
    if (grErr && await runSql(GROWTH_SQL)) console.log('[prospects] ✅ colonnes relance / suivi site / WhatsApp / devis créées');
  } catch (err) {
    console.error('[prospects] migration échouée:', err instanceof Error ? err.message : err);
  }
}

const norm = (s: string) => s.trim().toLowerCase();

const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|aol|gmx|proton(mail)?|laposte|orange|free|sfr|wanadoo)\./;

/** Nom de société comparable : sans accents, parenthèses (« (bureau) »), formes juridiques ni ponctuation. */
export function companyKey(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(sarl|eurl|spa|sas|snc|sa|ltd|inc|group|groupe|algerie|algeria|dz|oran)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/** Domaine d'entreprise de l'email (null pour gmail, yahoo… qui ne disent rien de la société). */
function companyDomain(email?: string): string | null {
  const d = email?.split('@')[1]?.trim().toLowerCase();
  return d && !FREE_MAIL.test(d) ? d : null;
}

/** Société déjà dans le fichier ? (même email, même domaine d'entreprise, ou même nom une fois nettoyé) */
async function findDuplicate(p: { company: string; email?: string }): Promise<Prospect | null> {
  if (p.email) {
    const { data } = await supabase.from('prospects').select('*').ilike('email', norm(p.email)).limit(1).maybeSingle();
    if (data) return data as Prospect;
  }
  const domain = companyDomain(p.email);
  if (domain) {
    const { data } = await supabase.from('prospects').select('*').ilike('email', `%@${domain.replace(/[%_]/g, '')}`).limit(1).maybeSingle();
    if (data) return data as Prospect;
  }
  const key = companyKey(p.company);
  if (key.length < 3) return null;
  const { data } = await supabase.from('prospects').select('*').limit(2000);
  return ((data ?? []) as Prospect[]).find(r => companyKey(r.company) === key) ?? null;
}

export async function addProspect(p: {
  company: string; segment: ProspectSegment; email?: string; phone?: string;
  contact_name?: string; city?: string; source?: string; notes?: string;
  website?: string; linkedin_contacts?: LinkedinContact[];
}): Promise<{ prospect: Prospect; duplicate: boolean }> {
  // Une société = un seul contact (jamais 2 mails à la même société via 2 adresses)
  const dup = await findDuplicate(p);
  if (dup) return { prospect: dup, duplicate: true };

  const { data, error } = await supabase.from('prospects').insert({
    company: p.company.trim(), segment: p.segment, email: p.email ? norm(p.email) : null,
    phone: p.phone?.trim() || null, contact_name: p.contact_name?.trim() || null,
    city: p.city?.trim() || 'Oran', source: p.source?.trim() || null, notes: p.notes?.trim() || null,
    ...(p.website ? { website: p.website.trim() } : {}),
    ...(p.linkedin_contacts?.length ? { linkedin_contacts: p.linkedin_contacts } : {}),
  }).select('*').single();
  if (error) throw new Error(`Ajout prospect: ${error.message}`);
  return { prospect: data as Prospect, duplicate: false };
}

export async function listProspects(f: { segment?: string; status?: string; limit?: number; visited?: boolean } = {}): Promise<Prospect[]> {
  // visited : ceux qui ont ouvert le lien du mail et visité le site, les plus récents d'abord
  let q = (f.visited
    ? supabase.from('prospects').select('*').not('site_visit_at', 'is', null).order('site_visit_at', { ascending: false })
    : supabase.from('prospects').select('*').order('created_at', { ascending: false }))
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
  if (byEmail.data?.length || q.includes('@')) return (byEmail.data ?? []) as Prospect[];
  // Rien trouvé : nom mal orthographié (« hiponne azure » → Agence Hippone Azur, 25/10) → recherche tolérante
  const words = fuzzy(q).split(' ').filter(w => w.length >= 3);
  if (!words.length) return [];
  const { data } = await supabase.from('prospects').select('id, company, email');
  const ids = ((data ?? []) as Array<{ id: string; company: string | null; email: string | null }>)
    .filter(r => { const hay = fuzzy(`${r.company ?? ''} ${r.email ?? ''}`).replace(/ /g, ''); return words.every(w => hay.includes(w)); })
    .slice(0, 5).map(r => r.id);
  if (!ids.length) return [];
  const full = await supabase.from('prospects').select('*').in('id', ids);
  return (full.data ?? []) as Prospect[];
}

/** Minuscules, sans accents ni lettres doublées, fin de mot en e/s retirée : « Hiponne Azure » ≈ « Hippone Azur ». */
function fuzzy(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .replace(/(.)\1+/g, '$1').split(' ').map(w => w.length > 4 ? w.replace(/[es]+$/, '') : w).join(' ').trim();
}

export async function updateProspect(id: string, patch: Partial<Omit<Prospect, 'id' | 'created_at'>>): Promise<void> {
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

/** Vrai si l'adresse a demandé à ne plus être contactée (STOP) ou a refusé — sur n'importe laquelle de ses fiches. */
export async function isOptedOut(email: string): Promise<boolean> {
  const { data } = await supabase.from('prospects').select('status').ilike('email', norm(email)).in('status', ['stop', 'refus']).limit(1);
  return !!data?.length;
}

/** Réponse « STOP » : toutes les fiches de cette adresse passent en « Pas intéressé » (refus) → plus aucun mail ni relance. */
export async function optOutEmail(email: string, note: string): Promise<void> {
  const { data } = await supabase.from('prospects').select('id, status, notes').ilike('email', norm(email));
  const day = new Date().toISOString().slice(0, 10);
  for (const r of (data ?? []) as Array<{ id: string; status: ProspectStatus; notes: string | null }>) {
    if (r.status === 'client') continue;
    await updateProspect(r.id, { status: 'refus', suggested_reply: null,
      notes: [r.notes, `[${day}] ${note}`].filter(Boolean).join('\n') });
  }
}

// ── Démarchage automatique : réglages (une seule ligne) ──
export interface AutopilotSettings { enabled: boolean; per_day: number }

export async function getAutopilot(): Promise<AutopilotSettings> {
  const { data } = await supabase.from('prospect_autopilot').select('enabled, per_day').eq('id', 1).maybeSingle();
  return (data as AutopilotSettings | null) ?? { enabled: false, per_day: 0 };  // table absente → rien n'est envoyé
}

export async function setAutopilot(patch: Partial<AutopilotSettings>): Promise<AutopilotSettings> {
  const { data, error } = await supabase.from('prospect_autopilot')
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }).select('enabled, per_day').single();
  if (error) throw new Error(`Réglage démarchage: ${error.message}`);
  return data as AutopilotSettings;
}

/** Prospects ayant répondu, avec une réponse proposée par Dzaryx en attente de l'accord de Kouider. */
export async function listPendingReplies(query?: string): Promise<Prospect[]> {
  let q = supabase.from('prospects').select('*').not('suggested_reply', 'is', null)
    .order('last_contacted_at', { ascending: false }).limit(10);
  if (query?.trim()) {
    const t = query.trim().replace(/[%_,()]/g, '');
    q = t.includes('@') ? q.ilike('email', norm(t)) : q.ilike('company', `%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`Réponses prospects: ${error.message}`);
  return (data ?? []) as Prospect[];
}
