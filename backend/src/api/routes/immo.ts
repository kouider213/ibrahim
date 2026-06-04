import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

interface Property {
  id: string;
  name: string;
  address?: string;
  type: string;
  status: string;
  monthly_rent?: number | null;
  tenant_name?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/immo/properties
router.get('/properties', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ properties: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/immo/properties
router.post('/properties', requireMobileAuth, async (req, res) => {
  const { name, address, type, status, monthly_rent, tenant_name, notes } = req.body as Partial<Property>;
  if (!name?.trim()) { res.status(400).json({ error: 'name requis' }); return; }
  try {
    const { data, error } = await supabase.from('properties').insert({
      name: name.trim(),
      address:      address?.trim()  || null,
      type:         type             || 'appartement',
      status:       status           || 'libre',
      monthly_rent: monthly_rent     || null,
      tenant_name:  tenant_name?.trim() || null,
      notes:        notes?.trim()    || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ property: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/immo/properties/:id
router.patch('/properties/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const updates = req.body as Partial<Property>;
  try {
    const { data, error } = await supabase
      .from('properties')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select().single();
    if (error) throw error;
    res.json({ property: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/immo/properties/:id
router.delete('/properties/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    const { error } = await supabase.from('properties').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── VENTE VÉHICULES (vehicles_for_sale) ──────────────────────────────────────

// GET /api/immo/vehicles-for-sale
router.get('/vehicles-for-sale', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('vehicles_for_sale')
      .select('id, brand, model, year, price, currency, status, mileage, image_url, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ vehicles: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/immo/vehicles-for-sale  (créer)
router.post('/vehicles-for-sale', requireMobileAuth, async (req, res) => {
  const b = req.body as Record<string, unknown>;
  if (!b['brand'] || !b['model']) { res.status(400).json({ error: 'brand et model requis' }); return; }
  try {
    const { data, error } = await supabase.from('vehicles_for_sale').insert([{
      brand:        b['brand'],
      model:        b['model'],
      year:         b['year']         ?? null,
      price:        b['price']        ?? null,
      currency:     b['currency']     ?? 'DZD',
      mileage:      b['mileage']      ?? null,
      fuel:         b['fuel']         ?? null,
      transmission: b['transmission'] ?? null,
      status:       b['status']       ?? 'disponible',
    }]).select().single();
    if (error) throw error;
    res.status(201).json({ vehicle: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/immo/vehicles-for-sale/:id  (ex: marquer vendu)
router.patch('/vehicles-for-sale/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const updates = req.body as Record<string, unknown>;
  try {
    const { data, error } = await supabase
      .from('vehicles_for_sale')
      .update(updates)
      .eq('id', id)
      .select().single();
    if (error) throw error;
    res.json({ vehicle: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
