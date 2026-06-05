import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// Champs modifiables (whitelist — pas de mass-assignment sur id/created_at).
const PACK_WRITABLE = new Set([
  'title', 'tier', 'tagline', 'description', 'price', 'price_type', 'currency', 'duration',
  'car_id', 'property_id', 'inc_car', 'inc_apartment', 'inc_villa', 'inc_jetski', 'inc_driver',
  'features', 'status', 'featured', 'image_url', 'position',
]);

// GET /api/packs — liste avec véhicule + bien liés
router.get('/', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('packs')
      .select('*, pack_photos(url, position), car:cars(id, name, available), property:properties(id, title, status)')
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ packs: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/packs — créer
router.post('/', requireMobileAuth, async (req, res) => {
  const b = req.body as Record<string, any>;
  const title = b.title?.toString().trim();
  if (!title) { res.status(400).json({ error: 'title requis' }); return; }
  try {
    const { data, error } = await supabase.from('packs').insert({
      title,
      tier:        b.tier || 'entree',
      tagline:     b.tagline?.toString().trim() || null,
      description: b.description?.toString().trim() || null,
      price:       b.price != null ? Number(b.price) : null,
      price_type:  b.price_type || 'sejour',
      currency:    b.currency || 'DZD',
      duration:    b.duration?.toString().trim() || null,
      car_id:      b.car_id || null,
      property_id: b.property_id || null,
      inc_car:       b.inc_car === true,
      inc_apartment: b.inc_apartment === true,
      inc_villa:     b.inc_villa === true,
      inc_jetski:    b.inc_jetski === true,
      inc_driver:    b.inc_driver === true,
      features:    Array.isArray(b.features) ? b.features : null,
      status:      b.status || 'disponible',
      featured:    b.featured === true,
      image_url:   b.image_url?.toString().trim() || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ pack: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/packs/:id
router.patch('/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PACK_WRITABLE.has(k)) updates[k] = v;
  try {
    const { data, error } = await supabase.from('packs').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json({ pack: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/packs/:id
router.delete('/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  try {
    const { error } = await supabase.from('packs').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
