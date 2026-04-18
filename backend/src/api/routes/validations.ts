import { Router } from 'express';
import { z } from 'zod';
import { getPendingValidations, processValidationReply } from '../../validations/approver.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';

const router = Router();

// GET /api/validations — pending list
router.get('/', requireMobileAuth, async (_req, res) => {
  try {
    const pending = await getPendingValidations();
    res.json({ validations: pending });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/validations/:id
router.get('/:id', requireMobileAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('validations')
    .select('*')
    .eq('id', req.params['id'])
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Validation not found' });
    return;
  }
  res.json({ validation: data });
});

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note:     z.string().optional(),
});

// POST /api/validations/:id/decide
router.post('/:id/decide', requireMobileAuth, async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid decision', details: parsed.error.errors });
    return;
  }

  const { decision, note } = parsed.data;
  const validation = await processValidationReply(
    req.params['id'] as string,
    decision,
    note,
    'owner',
  );

  if (!validation) {
    res.status(404).json({ error: 'Validation not found or already decided' });
    return;
  }

  res.json({ success: true, decision, validationId: req.params['id'] });
});

export default router;
