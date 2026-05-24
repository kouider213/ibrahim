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
  custom:       { label: 'Autre / Personnalisé',  tools: [] },
};

// ── Register ──────────────────────────────────────────────────────
const registerSchema = z.object({
  email:         z.string().email(),
  password:      z.string().min(8),
  business_name: z.string().min(2).max(100),
  city:          z.string().min(2).max(100),
  country:       z.string().min(2).max(100),
  sector:        z.enum(['car_rental','restaurant','lawyer','doctor','real_estate','hotel','retail','custom']),
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

export default router;
