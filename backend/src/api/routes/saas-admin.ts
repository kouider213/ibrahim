import { Router, Request, Response, NextFunction } from 'express';
import { requireSaasAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import { PLANS } from './saas.js';

const router = Router();
const ADMIN_EMAIL = process.env.SAAS_ADMIN_EMAIL ?? 'kouiderpablo@gmail.com';

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.saasActor?.email !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Accès refusé' }); return;
  }
  next();
}

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

  const cfgMap = new Map((cfgRes.data ?? []).map(c => [c.org_id as string, c]));
  const authMap = new Map((authRes.data ?? []).map(a => [a.org_id as string, a]));

  const result = orgs.map(o => ({
    org_id:        o.id,
    name:          o.name,
    plan:          cfgMap.get(o.id as string)?.plan ?? o.plan ?? 'starter',
    sector:        cfgMap.get(o.id as string)?.sector ?? 'custom',
    ai_name:       cfgMap.get(o.id as string)?.ai_name ?? 'Dzaryx',
    city:          cfgMap.get(o.id as string)?.city ?? '',
    country:       cfgMap.get(o.id as string)?.country ?? '',
    email:         authMap.get(o.id as string)?.email ?? '',
    last_login_at: authMap.get(o.id as string)?.last_login_at ?? null,
    messages_used:  cfgMap.get(o.id as string)?.messages_used ?? 0,
    messages_limit: cfgMap.get(o.id as string)?.messages_limit ?? 200,
    created_at:    o.created_at,
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

  const total_orgs   = orgs.length;
  const pro_orgs     = orgs.filter(o => o.plan === 'pro').length;
  const ent_orgs     = orgs.filter(o => o.plan === 'enterprise').length;
  const free_orgs    = total_orgs - pro_orgs - ent_orgs;
  const total_msgs   = cfgs.reduce((s, c) => s + (c.messages_used as number ?? 0), 0);
  const est_revenue  = pro_orgs * 2900 + ent_orgs * 9900;

  res.json({ total_orgs, pro_orgs, enterprise_orgs: ent_orgs, free_orgs, total_messages: total_msgs, estimated_revenue_dzd: est_revenue });
});

// ── PATCH /api/saas/admin/org/:orgId/plan ────────────────────────
router.patch('/org/:orgId/plan', requireSaasAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;
  const { plan } = req.body as { plan?: string };
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
  res.json({ ok: true, message: 'Compte suspendu (quota = 0)' });
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
