import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications
router.get('/', requireMobileAuth, async (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 30), 100);

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ notifications: data ?? [] });
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireMobileAuth, async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'sent' })
    .eq('id', req.params['id']);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ success: true });
});

export default router;
