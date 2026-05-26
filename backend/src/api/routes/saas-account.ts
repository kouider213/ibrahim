import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { requireSaasAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import { redis } from '../../queue/queue.js';
import { sendVerificationCode, sendPasswordResetEmail, sendChangeConfirmedEmail } from '../../notifications/email.js';
import { signSaasToken } from '../../auth/saas-jwt.js';

const router = Router();
const APP_URL = process.env.SAAS_APP_URL ?? 'https://kouider213.github.io/ibrahim/';

function makeCode()  { return Math.floor(100000 + Math.random() * 900000).toString(); }
function redisKey(orgId: string, type: string) { return `saas:verify:${orgId}:${type}`; }
function resetKey(token: string) { return `saas:reset:${token}`; }

// ── POST /api/saas/account/request-change ────────────────────────
// Sends 6-digit code to current email before applying change
router.post('/request-change', requireSaasAuth, async (req: Request, res: Response): Promise<void> => {
  const { type } = req.body as { type?: string; value?: string };
  if (!type || !['email', 'password'].includes(type)) {
    res.status(400).json({ error: 'Type invalide (email ou password)' }); return;
  }

  const saasActor = req.saasActor!;
  const { data: auth } = await supabase.from('saas_auth').select('email').eq('org_id', saasActor.orgId).maybeSingle();
  if (!auth?.email) { res.status(404).json({ error: 'Compte non trouvé' }); return; }

  const code = makeCode();
  await redis.set(redisKey(saasActor.orgId, type), JSON.stringify({ code, value: req.body.value ?? '', expires: Date.now() + 900_000 }), 'EX', 900);

  const label = type === 'email' ? 'changement d\'adresse email' : 'changement de mot de passe';
  await sendVerificationCode(auth.email, code, label).catch(e => console.error('[account] email error:', e));

  res.json({ ok: true, message: `Code envoyé sur ${auth.email}` });
});

// ── POST /api/saas/account/confirm-change ────────────────────────
router.post('/confirm-change', requireSaasAuth, async (req: Request, res: Response): Promise<void> => {
  const { type, code } = req.body as { type?: string; code?: string };
  if (!type || !code) { res.status(400).json({ error: 'Type et code requis' }); return; }

  const saasActor = req.saasActor!;
  const raw = await redis.get(redisKey(saasActor.orgId, type));
  if (!raw) { res.status(400).json({ error: 'Code expiré ou inexistant — demandez un nouveau code' }); return; }

  const stored = JSON.parse(raw) as { code: string; value: string; expires: number };
  if (Date.now() > stored.expires) {
    await redis.del(redisKey(saasActor.orgId, type));
    res.status(400).json({ error: 'Code expiré — demandez un nouveau code' }); return;
  }
  if (stored.code !== code) { res.status(400).json({ error: 'Code incorrect' }); return; }

  await redis.del(redisKey(saasActor.orgId, type));

  const { data: auth } = await supabase.from('saas_auth').select('email').eq('org_id', saasActor.orgId).maybeSingle();

  if (type === 'email') {
    const newEmail = stored.value;
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      res.status(400).json({ error: 'Nouvelle adresse email invalide' }); return;
    }
    const { data: existing } = await supabase.from('saas_auth').select('id').eq('email', newEmail).maybeSingle();
    if (existing) { res.status(409).json({ error: 'Cet email est déjà utilisé' }); return; }
    await supabase.from('saas_auth').update({ email: newEmail }).eq('org_id', saasActor.orgId);
    await sendChangeConfirmedEmail(newEmail, 'adresse email').catch(() => {});
    const { data: cfg } = await supabase.from('org_configs').select('sector, ai_name').eq('org_id', saasActor.orgId).maybeSingle();
    const { data: org } = await supabase.from('organizations').select('owner_key').eq('id', saasActor.orgId).maybeSingle();
    const newToken = signSaasToken({ orgId: saasActor.orgId, email: newEmail, ownerKey: org?.owner_key ?? '', sector: cfg?.sector ?? 'custom' });
    res.json({ ok: true, message: 'Email modifié avec succès', new_token: newToken });

  } else if (type === 'password') {
    const newPassword = stored.value;
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'Mot de passe trop court' }); return;
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await supabase.from('saas_auth').update({ password_hash: hash }).eq('org_id', saasActor.orgId);
    if (auth?.email) await sendChangeConfirmedEmail(auth.email, 'mot de passe').catch(() => {});
    res.json({ ok: true, message: 'Mot de passe modifié avec succès' });
  }
});

// ── POST /api/saas/account/request-delete ───────────────────────
router.post('/request-delete', requireSaasAuth, async (req: Request, res: Response): Promise<void> => {
  const saasActor = req.saasActor!;
  const { data: auth } = await supabase.from('saas_auth').select('email').eq('org_id', saasActor.orgId).maybeSingle();
  if (!auth?.email) { res.status(404).json({ error: 'Compte non trouvé' }); return; }

  const code = makeCode();
  await redis.set(redisKey(saasActor.orgId, 'delete'), JSON.stringify({ code, expires: Date.now() + 900_000 }), 'EX', 900);
  await sendVerificationCode(auth.email, code, 'suppression de compte').catch(e => console.error('[account] delete email error:', e));
  res.json({ ok: true, message: `Code de confirmation envoyé sur ${auth.email}` });
});

// ── DELETE /api/saas/account ─────────────────────────────────────
router.delete('/', requireSaasAuth, async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: 'Code de confirmation requis' }); return; }

  const saasActor = req.saasActor!;
  const raw = await redis.get(redisKey(saasActor.orgId, 'delete'));
  if (!raw) { res.status(400).json({ error: 'Code expiré — demandez un nouveau' }); return; }
  const stored = JSON.parse(raw) as { code: string; expires: number };
  if (Date.now() > stored.expires || stored.code !== code) {
    res.status(400).json({ error: 'Code incorrect ou expiré' }); return;
  }

  const orgId = saasActor.orgId;
  await Promise.all([
    supabase.from('saas_bookings').delete().eq('org_id', orgId),
    supabase.from('saas_items').delete().eq('org_id', orgId),
    supabase.from('org_configs').delete().eq('org_id', orgId),
    supabase.from('organization_members').delete().eq('org_id', orgId),
    supabase.from('saas_auth').delete().eq('org_id', orgId),
    supabase.from('organizations').delete().eq('id', orgId),
    redis.del(redisKey(orgId, 'delete')),
  ]);

  res.json({ ok: true, message: 'Compte supprimé définitivement' });
});

// ── POST /api/saas/account/cancel-plan ──────────────────────────
router.post('/cancel-plan', requireSaasAuth, async (req: Request, res: Response): Promise<void> => {
  const saasActor = req.saasActor!;
  await supabase.from('org_configs').update({ plan: 'starter', messages_limit: 200 }).eq('org_id', saasActor.orgId);
  await supabase.from('organizations').update({ plan: 'starter' }).eq('id', saasActor.orgId);
  res.json({ ok: true, message: 'Plan annulé — retour au plan Gratuit' });
});

// ── POST /api/saas/auth/forgot-password (public) ─────────────────
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: 'Email requis' }); return; }

  const { data: auth } = await supabase.from('saas_auth').select('org_id').eq('email', email).maybeSingle();
  // Always return ok (don't leak if email exists)
  if (auth) {
    const token = crypto.randomBytes(32).toString('hex');
    await redis.set(resetKey(token), auth.org_id, 'EX', 3600);
    const resetUrl = `${APP_URL}?reset=${token}`;
    await sendPasswordResetEmail(email, resetUrl).catch(e => console.error('[account] reset email error:', e));
  }
  res.json({ ok: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé' });
});

// ── POST /api/saas/auth/reset-password (public) ──────────────────
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };
  if (!token || !password) { res.status(400).json({ error: 'Token et mot de passe requis' }); return; }
  if (password.length < 8) { res.status(400).json({ error: 'Mot de passe minimum 8 caractères' }); return; }

  const orgId = await redis.get(resetKey(token));
  if (!orgId) { res.status(400).json({ error: 'Lien expiré ou invalide — demandez un nouveau' }); return; }

  const hash = await bcrypt.hash(password, 12);
  await supabase.from('saas_auth').update({ password_hash: hash }).eq('org_id', orgId);
  await redis.del(resetKey(token));
  res.json({ ok: true, message: 'Mot de passe réinitialisé — vous pouvez vous connecter' });
});

export default router;
