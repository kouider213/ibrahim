// Avis clients depuis l'app : lister, approuver/masquer, supprimer (table reviews, même base que le site).
import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/reviews — tous les avis (récents d'abord) + compteurs
router.get('/', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, client_name, rating, comment, approved, verified, created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ rating: number; approved: boolean }>;
    const approved = rows.filter(r => r.approved).length;
    const avg = approved > 0
      ? rows.filter(r => r.approved).reduce((s, r) => s + (Number(r.rating) || 0), 0) / approved
      : 0;
    res.json({ reviews: rows, counts: { total: rows.length, approved, pending: rows.length - approved, avg: Math.round(avg * 10) / 10 } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// PATCH /api/reviews/:id — approuver / masquer
router.patch('/:id', requireMobileAuth, async (req, res) => {
  const approved = (req.body as { approved?: boolean }).approved;
  try {
    const { data, error } = await supabase.from('reviews').update({ approved: !!approved }).eq('id', req.params['id']).select().single();
    if (error) throw new Error(error.message);
    res.json({ review: data });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// DELETE /api/reviews/:id
router.delete('/:id', requireMobileAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('reviews').delete().eq('id', req.params['id']);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
