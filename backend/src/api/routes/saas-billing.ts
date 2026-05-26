import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { requireSaasAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import { PLANS } from './saas.js';
import { sendWelcomeEmail } from '../../notifications/email.js';

const router = Router();

const CHARGILY_BASE   = 'https://pay.chargily.net/api/v2';
const CHARGILY_KEY    = process.env.CHARGILY_SECRET_KEY ?? '';
const CHARGILY_SECRET = process.env.CHARGILY_WEBHOOK_SECRET ?? '';
const APP_URL         = process.env.SAAS_APP_URL ?? 'https://kouider213.github.io/ibrahim/';
const BACKEND_URL     = process.env.BACKEND_URL  ?? 'https://ibrahim-backend-production.up.railway.app';

// DZD prices (whole dinars — Chargily uses integer amounts)
const PLAN_PRICES: Record<string, { amount: number; currency: string; label: string }> = {
  pro:        { amount: 2900,  currency: 'dzd', label: 'Dzaryx Pro — 1 mois' },
  enterprise: { amount: 9900,  currency: 'dzd', label: 'Dzaryx Enterprise — 1 mois' },
};

// ── POST /api/saas/billing/checkout ──────────────────────────────────
router.post('/checkout', requireSaasAuth, async (req: Request, res: Response): Promise<void> => {
  const { plan } = req.body as { plan?: string };
  if (!plan || !PLAN_PRICES[plan]) {
    res.status(400).json({ error: 'Plan invalide. Choisir: pro, enterprise' });
    return;
  }
  if (!CHARGILY_KEY) {
    res.status(503).json({ error: 'Paiement non configuré — contactez le support' });
    return;
  }

  const saasActor = req.saasActor!;
  const price = PLAN_PRICES[plan]!;

  const [{ data: cfg }, { data: auth }] = await Promise.all([
    supabase.from('org_configs').select('business_name').eq('org_id', saasActor.orgId).maybeSingle(),
    supabase.from('saas_auth').select('email').eq('org_id', saasActor.orgId).maybeSingle(),
  ]);

  try {
    const { data: chargilyRes } = await axios.post<{ checkout_url: string }>(
      `${CHARGILY_BASE}/checkouts`,
      {
        amount:           price.amount,
        currency:         price.currency,
        success_url:      `${APP_URL}?payment=success&plan=${plan}`,
        failure_url:      `${APP_URL}?payment=failed`,
        webhook_endpoint: `${BACKEND_URL}/api/saas/billing/webhook`,
        description:      `${price.label} — ${cfg?.business_name ?? saasActor.email}`,
        locale:           'fr',
        metadata:         { org_id: saasActor.orgId, plan, email: auth?.email ?? saasActor.email },
      },
      { headers: { Authorization: `Bearer ${CHARGILY_KEY}`, 'Content-Type': 'application/json' } }
    );
    res.json({ checkout_url: chargilyRes.checkout_url, plan, amount: price.amount, currency: price.currency });
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    console.error('[chargily] checkout error:', err.response?.data ?? err.message);
    res.status(502).json({ error: 'Erreur création paiement — réessayez' });
  }
});

// ── POST /api/saas/billing/webhook — called by Chargily ──────────────
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  if (CHARGILY_SECRET) {
    const sig      = req.headers['x-chargily-signature'] as string | undefined;
    const raw      = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', CHARGILY_SECRET).update(raw).digest('hex');
    if (sig !== expected) {
      console.warn('[chargily] invalid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  const event = req.body as {
    type?: string;
    data?: { metadata?: { org_id?: string; plan?: string; email?: string } };
  };

  if (event.type !== 'checkout.paid') { res.json({ ok: true }); return; }

  const meta = event.data?.metadata ?? {};
  const { org_id, plan, email } = meta;
  if (!org_id || !plan || !PLANS[plan]) {
    res.status(400).json({ error: 'Metadata manquant' });
    return;
  }

  const planData = PLANS[plan]!;
  const nextReset = new Date();
  nextReset.setMonth(nextReset.getMonth() + 1);
  nextReset.setDate(1);
  nextReset.setHours(0, 0, 0, 0);

  const { error } = await supabase
    .from('org_configs')
    .update({ plan, messages_limit: planData.messages_limit, reset_at: nextReset.toISOString() })
    .eq('org_id', org_id);

  if (error) {
    console.error('[billing] plan upgrade error:', error);
    res.status(500).json({ error: error.message });
    return;
  }

  await supabase.from('organizations').update({ plan }).eq('id', org_id);

  if (email) {
    await sendWelcomeEmail(email, plan, planData.label).catch(e => console.error('[billing] email error:', e));
  }

  console.log(`[billing] ✅ org ${org_id} → plan ${plan}`);
  res.json({ ok: true });
});

// ── GET /api/saas/billing/usage ──────────────────────────────────────
router.get('/usage', requireSaasAuth, async (req: Request, res: Response): Promise<void> => {
  const saasActor = req.saasActor!;
  const { data } = await supabase
    .from('org_configs')
    .select('plan, messages_used, messages_limit, reset_at')
    .eq('org_id', saasActor.orgId)
    .maybeSingle();

  if (!data) { res.status(404).json({ error: 'Organisation non trouvée' }); return; }
  res.json({ ...data, plan_info: PLANS[data.plan as string] });
});

export default router;
