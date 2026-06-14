// Programme de parrainage diaspora : codes parrain, suivi des utilisations.
import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = (name?: string) => {
  const base = (name || 'FIK').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'FIK';
  return base + Array.from({ length: 3 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
};

router.get('/', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase.from('referrals').select('*').order('created_at', { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    res.json({ referrals: data ?? [] });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

router.post('/', requireMobileAuth, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  try {
    let row, error, code;
    for (let i = 0; i < 5; i++) {
      code = genCode(b['referrer_name'] as string | undefined);
      ({ data: row, error } = await supabase.from('referrals').insert({
        code, referrer_name: b['referrer_name'] || null, referrer_phone: b['referrer_phone'] || null,
        reward: b['reward'] || null, note: b['note'] || null,
      }).select().single());
      if (!error) break;
      if (!String(error.message || '').toLowerCase().includes('duplicate')) break;
    }
    if (error) throw new Error(error.message);
    res.status(201).json({ referral: row });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

router.patch('/:id', requireMobileAuth, async (req, res) => {
  const b = req.body as { uses?: number; note?: string };
  const upd: Record<string, unknown> = {};
  if (typeof b.uses === 'number') upd['uses'] = Math.max(0, b.uses);
  if (b.note != null) upd['note'] = b.note;
  try {
    const { data, error } = await supabase.from('referrals').update(upd).eq('id', req.params['id']).select().single();
    if (error) throw new Error(error.message);
    res.json({ referral: data });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

router.delete('/:id', requireMobileAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('referrals').delete().eq('id', req.params['id']);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

export default router;
