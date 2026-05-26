import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { supabase } from '../../integrations/supabase.js';
import { signSaasToken, verifySaasToken } from '../../auth/saas-jwt.js';
import { extractBearerToken } from '../../auth/tokens.js';

const router = Router();

// ── Sectors available ─────────────────────────────────────────────
export const SECTORS: Record<string, { label: string; tools: string[] }> = {
  car_rental:   { label: 'Location de voitures', tools: ['create_booking','list_bookings','update_booking','cancel_booking','list_cars','get_financial_report','create_calendar_event'] },
  restaurant:   { label: 'Restaurant / Livraison', tools: ['manage_orders','manage_tables','manage_stock','manage_reservations','get_financial_report'] },
  lawyer:       { label: 'Avocat / Notaire',      tools: ['manage_dossiers','manage_appointments','manage_documents','manage_deadlines','get_financial_report'] },
  doctor:       { label: 'Médecin / Clinique',    tools: ['manage_patients','manage_appointments','manage_prescriptions','get_financial_report'] },
  real_estate:  { label: 'Immobilier',            tools: ['manage_properties','manage_leads','manage_visits','manage_contracts','get_financial_report'] },
  hotel:        { label: 'Hôtel / Riad',          tools: ['manage_rooms','create_booking','list_bookings','update_booking','get_financial_report','create_calendar_event'] },
  retail:       { label: 'Commerce / Boutique',   tools: ['manage_inventory','manage_orders','manage_clients','get_financial_report'] },
  beauty:       { label: 'Salon beauté / Coiffure', tools: ['manage_appointments','manage_clients','manage_services','get_financial_report'] },
  auto_school:  { label: 'Auto-école',             tools: ['manage_students','manage_lessons','manage_exams','get_financial_report'] },
  construction: { label: 'BTP / Construction',     tools: ['manage_projects','manage_quotes','manage_invoices','manage_materials','get_financial_report'] },
  ecommerce:    { label: 'E-commerce / Boutique en ligne', tools: ['manage_products','manage_orders','manage_deliveries','get_financial_report'] },
  custom:       { label: 'Autre / Personnalisé',   tools: [] },
};

// ── Register ──────────────────────────────────────────────────────
const registerSchema = z.object({
  email:         z.string().email(),
  password:      z.string().min(8),
  business_name: z.string().min(2).max(100),
  city:          z.string().min(2).max(100),
  country:       z.string().min(2).max(100),
  sector:        z.enum(['car_rental','restaurant','lawyer','doctor','real_estate','hotel','retail','beauty','auto_school','construction','ecommerce','custom']),
  language:      z.string().length(2).default('fr'), // fr, en, es, ar, ...
  currency:      z.string().length(3).default('DZD'),
  ai_name:       z.string().min(2).max(50).default('Dzaryx'),
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message });
    return;
  }

  const d = parsed.data;

  // Check email not taken
  const { data: existing } = await supabase
    .from('saas_auth')
    .select('id')
    .eq('email', d.email)
    .maybeSingle();

  if (existing) {
    res.status(409).json({ error: 'Email déjà utilisé' });
    return;
  }

  // Create owner_key from email slug
  const ownerKey = d.email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36);

  // 1. Create organization
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ owner_key: ownerKey, name: d.business_name, plan: 'starter' })
    .select('id')
    .single();

  if (orgErr || !org) {
    res.status(500).json({ error: 'Erreur création organisation' });
    return;
  }

  // 2. Create org_config
  const sectorTools = SECTORS[d.sector]?.tools ?? [];
  await supabase.from('org_configs').insert({
    org_id:        org.id,
    business_name: d.business_name,
    city:          d.city,
    country:       d.country,
    language:      d.language,
    currency:      d.currency,
    sector:        d.sector,
    ai_name:       d.ai_name,
    tools_enabled: sectorTools,
    plan:          'starter',
    messages_limit: 200,
  });

  // 3. Create organization_member (owner)
  await supabase.from('organization_members').insert({
    org_id:       org.id,
    owner_key:    ownerKey,
    display_name: d.business_name,
    role:         'owner',
    is_active:    true,
  });

  // 4. Create saas_auth (hashed password)
  const password_hash = await bcrypt.hash(d.password, 12);
  await supabase.from('saas_auth').insert({
    org_id:        org.id,
    email:         d.email,
    password_hash,
  });

  // 5. Return JWT
  const token = signSaasToken({ orgId: org.id, email: d.email, ownerKey, sector: d.sector });

  res.status(201).json({
    token,
    org_id:       org.id,
    owner_key:    ownerKey,
    business_name: d.business_name,
    sector:       d.sector,
    ai_name:      d.ai_name,
    message:      `Bienvenue ! Votre assistant ${d.ai_name} est prêt.`,
  });
});

// ── Login ─────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) { res.status(400).json({ error: 'Email et mot de passe requis' }); return; }

  const { data: auth } = await supabase
    .from('saas_auth')
    .select('id, org_id, password_hash')
    .eq('email', email)
    .maybeSingle();

  if (!auth) { res.status(401).json({ error: 'Email ou mot de passe incorrect' }); return; }

  const valid = await bcrypt.compare(password, auth.password_hash);
  if (!valid) { res.status(401).json({ error: 'Email ou mot de passe incorrect' }); return; }

  // Get org config
  const { data: cfg } = await supabase
    .from('org_configs')
    .select('sector, ai_name, business_name')
    .eq('org_id', auth.org_id)
    .maybeSingle();

  const { data: org } = await supabase
    .from('organizations')
    .select('owner_key')
    .eq('id', auth.org_id)
    .maybeSingle();

  // Update last login
  await supabase.from('saas_auth').update({ last_login_at: new Date().toISOString() }).eq('id', auth.id);

  const token = signSaasToken({
    orgId:    auth.org_id,
    email,
    ownerKey: org?.owner_key ?? '',
    sector:   cfg?.sector ?? 'custom',
  });

  res.json({ token, org_id: auth.org_id, ai_name: cfg?.ai_name ?? 'Dzaryx', business_name: cfg?.business_name });
});

// ── Get config (authenticated) ────────────────────────────────────
router.get('/config', async (req: Request, res: Response): Promise<void> => {
  const raw = extractBearerToken(req);
  if (!raw) { res.status(401).json({ error: 'Token requis' }); return; }

  const payload = verifySaasToken(raw);
  if (!payload) { res.status(401).json({ error: 'Token invalide ou expiré' }); return; }

  const { data: cfg } = await supabase
    .from('org_configs')
    .select('*')
    .eq('org_id', payload.orgId)
    .maybeSingle();

  res.json({ ...cfg, sector_info: SECTORS[cfg?.sector ?? 'custom'] });
});

// ── List sectors (public) ─────────────────────────────────────────
router.get('/sectors', (_req: Request, res: Response) => {
  res.json(Object.entries(SECTORS).map(([key, val]) => ({ key, label: val.label })));
});

// ── Plans ─────────────────────────────────────────────────────────
export const PLANS: Record<string, {
  label: string;
  price_monthly: number;
  currency: string;
  messages_limit: number;
  features: string[];
}> = {
  starter: {
    label:          'Starter',
    price_monthly:  0,
    currency:       'EUR',
    messages_limit: 200,
    features:       ['200 messages/mois', 'Chat AI sectoriel', '5 items max', 'API CRUD basique'],
  },
  pro: {
    label:          'Pro',
    price_monthly:  29,
    currency:       'EUR',
    messages_limit: 2000,
    features:       ['2 000 messages/mois', 'Briefing quotidien', 'Items illimités', 'Stats avancées', 'Notifications', 'Support prioritaire'],
  },
  enterprise: {
    label:          'Enterprise',
    price_monthly:  99,
    currency:       'EUR',
    messages_limit: 99999,
    features:       ['Messages illimités', 'Tous les plans Pro', 'SLA 99.9%', 'Onboarding dédié', 'API webhooks', 'Marque blanche'],
  },
};

// GET /api/saas/plans (public)
router.get('/plans', (_req: Request, res: Response) => {
  res.json(Object.entries(PLANS).map(([key, val]) => ({ key, ...val })));
});

// POST /api/saas/upgrade — change plan (for now: no payment, just update limits)
router.post('/upgrade', async (req: Request, res: Response): Promise<void> => {
  const raw = extractBearerToken(req);
  if (!raw) { res.status(401).json({ error: 'Token requis' }); return; }
  const payload = verifySaasToken(raw);
  if (!payload) { res.status(401).json({ error: 'Token invalide' }); return; }

  const { plan } = req.body as { plan?: string };
  if (!plan || !PLANS[plan]) {
    res.status(400).json({ error: `Plan invalide. Choix: ${Object.keys(PLANS).join(', ')}` });
    return;
  }

  const { messages_limit } = PLANS[plan]!;
  const { data, error } = await supabase
    .from('org_configs')
    .update({ plan, messages_limit, updated_at: new Date().toISOString() })
    .eq('org_id', payload.orgId)
    .select('plan, messages_limit, messages_used')
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Also update organizations table
  await supabase.from('organizations').update({ plan }).eq('id', payload.orgId);

  res.json({
    plan,
    messages_limit,
    messages_used:  data.messages_used,
    plan_info:      PLANS[plan],
    message:        `Plan mis à jour : ${PLANS[plan]!.label} (${messages_limit} messages/mois)`,
  });
});

// POST /api/saas/reset-usage — admin: reset monthly counter
router.post('/reset-usage', async (req: Request, res: Response): Promise<void> => {
  const raw = extractBearerToken(req);
  if (!raw) { res.status(401).json({ error: 'Token requis' }); return; }
  const payload = verifySaasToken(raw);
  if (!payload) { res.status(401).json({ error: 'Token invalide' }); return; }

  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);
  nextReset.setDate(1);
  nextReset.setHours(0, 0, 0, 0);

  const { error } = await supabase
    .from('org_configs')
    .update({ messages_used: 0, reset_at: nextReset.toISOString() })
    .eq('org_id', payload.orgId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ message: 'Compteur réinitialisé', next_reset: nextReset.toISOString() });
});

// ── Update config (integrations, profile, settings) ───────────────
router.patch('/config', async (req: Request, res: Response): Promise<void> => {
  const raw = extractBearerToken(req);
  if (!raw) { res.status(401).json({ error: 'Token requis' }); return; }
  const payload = verifySaasToken(raw);
  if (!payload) { res.status(401).json({ error: 'Token invalide' }); return; }

  const allowed = ['integrations', 'business_profile', 'ai_name', 'language', 'currency'];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }
  if (Object.keys(update).length === 0) { res.status(400).json({ error: 'Rien à mettre à jour' }); return; }

  const { data, error } = await supabase
    .from('org_configs')
    .update(update)
    .eq('org_id', payload.orgId)
    .select().single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
