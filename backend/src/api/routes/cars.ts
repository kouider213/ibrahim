import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/cars — full car list with all fields
router.get('/', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('cars')
      .select('*')
      .order('name', { ascending: true });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ cars: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/cars/:id — single car
router.get('/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    const { data, error } = await supabase.from('cars').select('*').eq('id', id).single();
    if (error) { res.status(404).json({ error: 'Véhicule introuvable' }); return; }
    res.json({ car: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const carCreateSchema = z.object({
  name:         z.string().min(1),
  category:     z.string().optional(),
  available:    z.boolean().optional().default(true),
  base_price:   z.number().min(0),
  resale_price: z.number().min(0).optional().default(0),
  description:  z.string().optional(),
  seats:        z.number().int().min(1).optional(),
  fuel:         z.string().optional(),
  transmission: z.string().optional(),
  image_url:    z.string().url().optional(),
});

// POST /api/cars — create a new car
router.post('/', requireMobileAuth, async (req, res) => {
  const parsed = carCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }
  try {
    const { data, error } = await supabase
      .from('cars')
      .insert({ ...parsed.data, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ car: data, message: 'Véhicule ajouté' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const carUpdateSchema = z.object({
  name:         z.string().min(1).optional(),
  category:     z.string().optional(),
  available:    z.boolean().optional(),
  base_price:   z.number().min(0).optional(),
  resale_price: z.number().min(0).optional(),
  description:  z.string().optional(),
  seats:        z.number().int().min(1).optional(),
  fuel:         z.string().optional(),
  transmission: z.string().optional(),
});

// PATCH /api/cars/:id — update car fields (availability, price, etc.)
router.patch('/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = carUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }

  const updates = { ...parsed.data, updated_at: new Date().toISOString() };

  try {
    const { data, error } = await supabase
      .from('cars')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ car: data, message: 'Véhicule mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
