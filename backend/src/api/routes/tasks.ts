import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/tasks
router.get('/', requireMobileAuth, async (req, res) => {
  const status = req.query['status'] as string | undefined;
  const limit  = Math.min(Number(req.query['limit'] ?? 50), 200);

  let query = supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ tasks: data ?? [] });
});

// GET /api/tasks/:id
router.get('/:id', requireMobileAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_runs(*)')
    .eq('id', req.params['id'])
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json({ task: data });
});

// DELETE /api/tasks/:id/cancel
router.post('/:id/cancel', requireMobileAuth, async (req, res) => {
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', req.params['id'])
    .in('status', ['pending', 'queued']);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ success: true });
});

export default router;
