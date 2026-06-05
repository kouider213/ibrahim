import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// Schéma UNIFIÉ app + site : un seul stock de biens. Le site (fikconciergerie)
// lit title/transaction/price/city/status='disponible'. L'app garde en plus
// monthly_rent/tenant_name pour la gestion interne (locations Houari).
// `name` = colonne legacy NOT NULL → toujours mirror de title.
// Statuts unifiés : disponible (visible site) | loué | vendu | en_travaux.

// Champs acceptés en écriture (whitelist — évite le mass-assignment sur id/created_at).
const PROP_WRITABLE = new Set([
  'title', 'type', 'transaction', 'status', 'price', 'price_type',
  'city', 'district', 'surface', 'rooms', 'floor', 'image_url', 'description',
  'monthly_rent', 'tenant_name', 'address', 'notes',
]);

// Normalise un statut hérité de l'app ('libre') vers le vocabulaire site.
function normStatus(s?: string | null): string | undefined {
  if (!s) return undefined;
  return s === 'libre' ? 'disponible' : s;
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

// POST /api/immo/properties — crée un bien visible app + site
router.post('/properties', requireMobileAuth, async (req, res) => {
  const b = req.body as Record<string, any>;
  const title = (b.title ?? b.name)?.toString().trim();
  if (!title) { res.status(400).json({ error: 'title (ou name) requis' }); return; }

  const transaction = b.transaction === 'vente' ? 'vente' : 'location';
  // Prix canonique = price ; en location le loyer mensuel = price (miroir monthly_rent).
  const price = b.price != null ? Number(b.price)
              : b.monthly_rent != null ? Number(b.monthly_rent)
              : null;
  try {
    const { data, error } = await supabase.from('properties').insert({
      title,
      name:         title,                                  // legacy NOT NULL = mirror
      type:         b.type   || 'appartement',
      transaction,
      status:       normStatus(b.status) || 'disponible',
      price,
      price_type:   transaction === 'vente' ? 'total' : 'mois',
      city:         b.city?.toString().trim()     || 'Oran',
      district:     b.district?.toString().trim() || null,
      surface:      b.surface != null ? Number(b.surface) : null,
      rooms:        b.rooms   != null ? Number(b.rooms)   : null,
      image_url:    b.image_url?.toString().trim() || null,
      monthly_rent: transaction === 'location' ? price : null,
      tenant_name:  b.tenant_name?.toString().trim() || null,
      address:      b.address?.toString().trim()     || null,
      notes:        b.notes?.toString().trim()       || null,
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
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PROP_WRITABLE.has(k)) updates[k] = v;

  if ('status' in updates) updates['status'] = normStatus(updates['status'] as string);
  if ('title' in updates && updates['title']) updates['name'] = updates['title']; // garde le mirror legacy
  // En location, garde monthly_rent synchro avec price si le prix change.
  if ('price' in updates && (body['transaction'] ?? '') !== 'vente') updates['monthly_rent'] = updates['price'];
  updates['updated_at'] = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from('properties')
      .update(updates)
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
const VFS_WRITABLE = new Set([
  'brand', 'model', 'year', 'price', 'currency', 'mileage', 'fuel', 'transmission', 'status', 'image_url',
]);
router.patch('/vehicles-for-sale/:id', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (VFS_WRITABLE.has(k)) updates[k] = v;
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
