import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import Anthropic from '@anthropic-ai/sdk';
import { requireSaasAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import { signSaasToken } from '../../auth/saas-jwt.js';
import { env } from '../../config/env.js';
import { PLANS } from './saas.js';

const router   = Router();
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const ADMIN_EMAIL   = process.env.SAAS_ADMIN_EMAIL ?? 'kouiderpablo@gmail.com';
const TOKEN_KOUIDER = process.env.TOKEN_KOUIDER    ?? 'f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2';
const ADMIN_UNLIMITED = 9_999_999;

// ── GOD MODE admin chat history (in-memory) ─────────────────────────
const adminHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

// ── Auto-create + ensure admin org ──────────────────────────────────
async function ensureAdminOrg(): Promise<{ orgId: string; ownerKey: string } | null> {
  // Check existing
  const { data: existing } = await supabase
    .from('saas_auth').select('org_id').eq('email', ADMIN_EMAIL).maybeSingle();

  if (existing) {
    // Always ensure unlimited plan
    await supabase.from('org_configs')
      .update({ plan: 'ultimate', messages_limit: ADMIN_UNLIMITED })
      .eq('org_id', existing.org_id);
    const { data: org } = await supabase.from('organizations').select('owner_key').eq('id', existing.org_id).maybeSingle();
    return { orgId: existing.org_id as string, ownerKey: org?.owner_key ?? 'kouider_admin' };
  }

  // Create fresh admin org
  const ownerKey = 'kouider_admin_' + crypto.randomBytes(4).toString('hex');

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ owner_key: ownerKey, name: 'Dzaryx SaaS — GOD MODE', plan: 'ultimate' })
    .select('id').single();
  if (orgErr || !org) return null;

  const orgId = org.id as string;

  await Promise.all([
    supabase.from('org_configs').insert({
      org_id:         orgId,
      business_name:  'Dzaryx SaaS',
      sector:         'custom',
      ai_name:        'Dzaryx CEO',
      city:           'Bruxelles',
      country:        'Belgium',
      language:       'fr',
      currency:       'EUR',
      plan:           'ultimate',
      messages_limit: ADMIN_UNLIMITED,
      messages_used:  0,
    }),
    supabase.from('organization_members').insert({
      org_id: orgId, owner_key: ownerKey,
      display_name: 'Kouider — Admin', role: 'owner', is_active: true,
    }),
    supabase.from('saas_auth').insert({
      org_id: orgId, email: ADMIN_EMAIL,
      password_hash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
    }),
  ]);

  return { orgId, ownerKey };
}

// ── POST /api/saas/admin/autologin ──────────────────────────────────
// Dzaryx bearer token → SaaS JWT (Kouider only). Auto-creates admin org if missing.
router.post('/autologin', async (req: Request, res: Response): Promise<void> => {
  const bearer = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (bearer !== TOKEN_KOUIDER) { res.status(403).json({ error: 'Accès refusé' }); return; }

  const admin = await ensureAdminOrg();
  if (!admin) { res.status(500).json({ error: 'Impossible de créer le compte admin' }); return; }

  const token = signSaasToken({
    orgId:    admin.orgId,
    email:    ADMIN_EMAIL,
    ownerKey: admin.ownerKey,
    sector:   'god_mode',        // frontend detects this → uses admin chat
  });

  res.json({
    token,
    org_id:        admin.orgId,
    email:         ADMIN_EMAIL,
    ai_name:       'Dzaryx CEO',
    business_name: 'GOD MODE',
    sector:        'god_mode',
  });
});

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.saasActor?.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Accès refusé' }); return;
  }
  next();
}

// ── POST /api/saas/admin/chat ────────────────────────────────────────
// Dedicated GOD MODE Dzaryx — knows the SaaS platform inside out
router.post('/chat', requireSaasAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { message, sessionId } = req.body as { message?: string; sessionId?: string };
  if (!message || !sessionId) { res.status(400).json({ error: 'message + sessionId requis' }); return; }

  // Build live SaaS context
  const [orgsRes, cfgRes, authRes] = await Promise.all([
    supabase.from('organizations').select('id, name, plan, created_at'),
    supabase.from('org_configs').select('org_id, sector, city, country, messages_used, messages_limit, plan'),
    supabase.from('saas_auth').select('org_id, email, last_login_at'),
  ]);

  const orgs = orgsRes.data ?? [];
  const cfgs = cfgRes.data ?? [];
  const auths = authRes.data ?? [];

  const cfgMap  = new Map(cfgs.map(c  => [c.org_id  as string, c]));
  const authMap = new Map(auths.map(a => [a.org_id  as string, a]));

  const now = new Date();
  const total  = orgs.length;
  const pro    = orgs.filter(o => o.plan === 'pro').length;
  const ent    = orgs.filter(o => o.plan === 'enterprise').length;
  const ult    = orgs.filter(o => o.plan === 'ultimate').length;
  const free   = total - pro - ent - ult;
  const mrr    = pro * 29 + ent * 99 + ult * 199;
  const totalMsgs = cfgs.reduce((s, c) => s + ((c.messages_used as number) ?? 0), 0);

  const recentOrgs = orgs
    .filter(o => {
      const days = (now.getTime() - new Date(o.created_at as string).getTime()) / 86_400_000;
      return days <= 30;
    })
    .slice(0, 10)
    .map(o => {
      const cfg  = cfgMap.get(o.id as string);
      const auth = authMap.get(o.id as string);
      return `• ${o.name} (${cfg?.sector ?? '?'}) — ${o.plan} — ${cfg?.city ?? ''}${cfg?.country ? ', ' + cfg.country : ''} — ${auth?.email ?? '?'}`;
    });

  const suspended = orgs.filter(o => (cfgMap.get(o.id as string)?.messages_limit ?? 1) === 0);

  const context = `
=== DZARYX SAAS — TABLEAU DE BORD CEO ===
Date : ${now.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

MRR ESTIMÉ : ${mrr} € / mois
  → Pro (29€)        : ${pro} comptes
  → Enterprise (99€) : ${ent} comptes
  → Ultimate (199€)  : ${ult} comptes
  → Gratuit (0€)     : ${free} comptes
  → TOTAL clients    : ${total}
  → Messages IA envoyés ce mois : ${totalMsgs}

NOUVEAUX CLIENTS (30 jours) :
${recentOrgs.length > 0 ? recentOrgs.join('\n') : 'Aucun nouveau client ce mois.'}

COMPTES SUSPENDUS : ${suspended.length}
${suspended.map(o => `• ${o.name}`).join('\n') || 'Aucun.'}
=== FIN DASHBOARD ===`;

  const systemPrompt = `Tu es DZARYX, l'assistant IA personnel du fondateur et PDG de la plateforme SaaS Dzaryx.
Tu es comme si tu étais le bras droit ultra-intelligent de Kouider — tu connais CHAQUE chiffre, CHAQUE client, CHAQUE euro.
Tu parles en tant que partenaire stratégique : direct, précis, proactif, sans bullshit.
Tu aides Kouider à : piloter la croissance, gérer les clients, prendre des décisions produit, définir la stratégie, monitorer le MRR et les performances.
Tu ne parles PAS de Fik Conciergerie ici — tu es dans le COCKPIT du SaaS.
Tu réponds toujours en français (ou dans la langue de Kouider s'il écrit différemment).
Sois bref et percutant pour les questions courtes. Détaillé pour les analyses stratégiques.
${context}`;

  const history = adminHistory.get(sessionId) ?? [];
  history.push({ role: 'user', content: message });
  if (history.length > 40) history.splice(0, history.length - 40);

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   history,
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    history.push({ role: 'assistant', content: text });
    adminHistory.set(sessionId, history);

    res.json({ text, ai_name: 'Dzaryx CEO' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur IA. Réessayez.' });
  }
});

// ── GET /api/saas/admin/orgs ─────────────────────────────────────
router.get('/orgs', requireSaasAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, plan, created_at, owner_key')
    .order('created_at', { ascending: false });

  if (!orgs) { res.json([]); return; }

  const orgIds = orgs.map(o => o.id as string);

  const [cfgRes, authRes] = await Promise.all([
    supabase.from('org_configs')
      .select('org_id, sector, ai_name, business_name, city, country, language, messages_used, messages_limit, plan')
      .in('org_id', orgIds),
    supabase.from('saas_auth')
      .select('org_id, email, last_login_at')
      .in('org_id', orgIds),
  ]);

  const cfgMap  = new Map((cfgRes.data  ?? []).map(c => [c.org_id  as string, c]));
  const authMap = new Map((authRes.data ?? []).map(a => [a.org_id  as string, a]));

  const result = orgs.map(o => ({
    org_id:         o.id,
    name:           o.name,
    plan:           cfgMap.get(o.id as string)?.plan          ?? o.plan ?? 'starter',
    sector:         cfgMap.get(o.id as string)?.sector        ?? 'custom',
    ai_name:        cfgMap.get(o.id as string)?.ai_name       ?? 'Dzaryx',
    city:           cfgMap.get(o.id as string)?.city          ?? '',
    country:        cfgMap.get(o.id as string)?.country       ?? '',
    email:          authMap.get(o.id as string)?.email        ?? '',
    last_login_at:  authMap.get(o.id as string)?.last_login_at ?? null,
    messages_used:  cfgMap.get(o.id as string)?.messages_used  ?? 0,
    messages_limit: cfgMap.get(o.id as string)?.messages_limit ?? 200,
    created_at:     o.created_at,
  }));

  res.json(result);
});

// ── GET /api/saas/admin/stats ────────────────────────────────────
router.get('/stats', requireSaasAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [orgsRes, cfgRes] = await Promise.all([
    supabase.from('organizations').select('id, plan'),
    supabase.from('org_configs').select('plan, messages_used, messages_limit'),
  ]);

  const orgs = orgsRes.data ?? [];
  const cfgs = cfgRes.data ?? [];

  const total_orgs  = orgs.length;
  const pro_orgs    = orgs.filter(o => o.plan === 'pro').length;
  const ent_orgs    = orgs.filter(o => o.plan === 'enterprise').length;
  const ult_orgs    = orgs.filter(o => o.plan === 'ultimate').length;
  const free_orgs   = total_orgs - pro_orgs - ent_orgs - ult_orgs;
  const total_msgs  = cfgs.reduce((s, c) => s + ((c.messages_used as number) ?? 0), 0);
  const est_revenue_eur = pro_orgs * 29 + ent_orgs * 99 + ult_orgs * 199;

  res.json({ total_orgs, pro_orgs, enterprise_orgs: ent_orgs, ultimate_orgs: ult_orgs, free_orgs, total_messages: total_msgs, estimated_revenue_eur: est_revenue_eur });
});

// ── PATCH /api/saas/admin/org/:orgId/plan ────────────────────────
router.patch('/org/:orgId/plan', requireSaasAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;
  const { plan }  = req.body as { plan?: string };
  if (!plan || !PLANS[plan]) { res.status(400).json({ error: 'Plan invalide' }); return; }

  const planData = PLANS[plan]!;
  await supabase.from('org_configs').update({ plan, messages_limit: planData.messages_limit }).eq('org_id', orgId);
  await supabase.from('organizations').update({ plan }).eq('id', orgId);
  res.json({ ok: true, message: `Plan mis à jour → ${plan}` });
});

// ── POST /api/saas/admin/org/:orgId/suspend ──────────────────────
router.post('/org/:orgId/suspend', requireSaasAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;
  await supabase.from('org_configs').update({ messages_limit: 0 }).eq('org_id', orgId);
  res.json({ ok: true, message: 'Compte suspendu' });
});

// ── POST /api/saas/admin/org/:orgId/unsuspend ────────────────────
router.post('/org/:orgId/unsuspend', requireSaasAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;
  const { data: cfg } = await supabase.from('org_configs').select('plan').eq('org_id', orgId).maybeSingle();
  const limit = PLANS[cfg?.plan as string]?.messages_limit ?? 200;
  await supabase.from('org_configs').update({ messages_limit: limit }).eq('org_id', orgId);
  res.json({ ok: true, message: 'Compte réactivé' });
});

// ── DELETE /api/saas/admin/org/:orgId ───────────────────────────
router.delete('/org/:orgId', requireSaasAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;
  await Promise.all([
    supabase.from('saas_bookings').delete().eq('org_id', orgId),
    supabase.from('saas_items').delete().eq('org_id', orgId),
    supabase.from('org_configs').delete().eq('org_id', orgId),
    supabase.from('organization_members').delete().eq('org_id', orgId),
    supabase.from('saas_auth').delete().eq('org_id', orgId),
    supabase.from('organizations').delete().eq('id', orgId),
  ]);
  res.json({ ok: true, message: 'Organisation supprimée' });
});

export default router;
