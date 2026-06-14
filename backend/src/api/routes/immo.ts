import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { env } from '../../config/env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME ?? '',
  api_key:    env.CLOUDINARY_API_KEY    ?? '',
  api_secret: env.CLOUDINARY_API_SECRET ?? '',
});

const router = Router();

// Upload une liste de photos (base64 ou URL) vers Cloudinary → renvoie les URLs.
async function uploadPhotos(list: unknown, folder: string): Promise<string[]> {
  if (!Array.isArray(list)) return [];
  const urls: string[] = [];
  for (const raw of list.slice(0, 15)) {
    const s = String(raw ?? '');
    if (!s) continue;
    try {
      if (s.startsWith('http')) { urls.push(s); continue; }
      const dataUri = s.startsWith('data:') ? s : `data:image/jpeg;base64,${s}`;
      const up = await cloudinary.uploader.upload(dataUri, { folder });
      urls.push(up.secure_url);
    } catch { /* skip cette photo */ }
  }
  return urls;
}

// Schéma UNIFIÉ app + site : un seul stock de biens. Le site (fikconciergerie)
// lit title/transaction/price/city/status='disponible'. L'app garde en plus
// monthly_rent/tenant_name pour la gestion interne (locations Houari).
// `name` = colonne legacy NOT NULL → toujours mirror de title.
// Statuts unifiés : disponible (visible site) | loué | vendu | en_travaux.

// Champs acceptés en écriture (whitelist — évite le mass-assignment sur id/created_at).
const PROP_WRITABLE = new Set([
  'title', 'type', 'transaction', 'status', 'price', 'price_type', 'currency',
  'city', 'district', 'surface', 'rooms', 'bedrooms', 'bathrooms', 'floor',
  'image_url', 'description', 'conditions', 'featured',
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
  const num = (v: unknown) => (v != null && v !== '' ? Number(v) : null);
  try {
    const { data, error } = await supabase.from('properties').insert({
      title,
      name:         title,                                  // legacy NOT NULL = mirror
      type:         b.type   || 'appartement',
      transaction,
      status:       normStatus(b.status) || 'disponible',
      price,
      price_type:   transaction === 'vente' ? 'total' : 'mois',
      currency:     b.currency?.toString().trim() || 'DZD',
      city:         b.city?.toString().trim()     || 'Oran',
      district:     b.district?.toString().trim() || null,
      address:      b.address?.toString().trim()  || null,
      surface:      num(b.surface),
      rooms:        num(b.rooms),
      bedrooms:     num(b.bedrooms),
      bathrooms:    num(b.bathrooms),
      floor:        num(b.floor),
      description:  b.description?.toString().trim() || null,
      conditions:   b.conditions?.toString().trim()  || null,
      featured:     b.featured === true || b.featured === 'true',
      image_url:    b.image_url?.toString().trim() || null,
      monthly_rent: transaction === 'location' ? price : null,
      tenant_name:  b.tenant_name?.toString().trim() || null,
      notes:        b.notes?.toString().trim()       || null,
    }).select().single();
    if (error) throw error;

    // Photos jointes (base64/URL) → Cloudinary + property_photos + image_url principale
    const urls = await uploadPhotos(b.photos, `properties/${data.id}`);
    if (urls.length) {
      await supabase.from('property_photos').insert(urls.map((url, i) => ({ property_id: data.id, url, position: i })));
      await supabase.from('properties').update({ image_url: urls[0] }).eq('id', data.id);
      data.image_url = urls[0];
    }
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

// POST /api/immo/properties/:id/photos — ajoute des photos à un bien EXISTANT
router.post('/properties/:id/photos', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const photos = (req.body as { photos?: unknown }).photos;
  try {
    const urls = await uploadPhotos(photos, `properties/${id}`);
    if (!urls.length) { res.status(400).json({ error: 'aucune photo valide' }); return; }
    const { count } = await supabase.from('property_photos').select('*', { count: 'exact', head: true }).eq('property_id', id);
    const base = count ?? 0;
    await supabase.from('property_photos').insert(urls.map((url, i) => ({ property_id: id, url, position: base + i })));
    const { data: prop } = await supabase.from('properties').select('image_url').eq('id', id).single();
    if (!(prop as { image_url?: string } | null)?.image_url) await supabase.from('properties').update({ image_url: urls[0] }).eq('id', id);
    res.json({ ok: true, added: urls.length, count: base + urls.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/immo/properties/:id/photos — liste les photos d'un bien
router.get('/properties/:id/photos', requireMobileAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('property_photos').select('url, position').eq('property_id', req.params['id']).order('position', { ascending: true });
    if (error) throw error;
    res.json({ photos: data ?? [] });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// DELETE /api/immo/properties/:id/photos  body { url }
router.delete('/properties/:id/photos', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const url = (req.body as { url?: string }).url;
  if (!url) { res.status(400).json({ error: 'url requise' }); return; }
  try {
    await supabase.from('property_photos').delete().eq('property_id', id).eq('url', url);
    const { data: rest } = await supabase.from('property_photos').select('url').eq('property_id', id).order('position', { ascending: true }).limit(1);
    await supabase.from('properties').update({ image_url: (rest as { url?: string }[] | null)?.[0]?.url ?? null }).eq('id', id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
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
      city:         b['city']         ?? null,
      description:  b['description']  ?? null,
      condition:    b['condition']    ?? null,
      featured:     b['featured'] === true || b['featured'] === 'true',
      status:       b['status']       ?? 'disponible',
    }]).select().single();
    if (error) throw error;

    const urls = await uploadPhotos(b['photos'], `vehicles_sale/${data.id}`);
    if (urls.length) {
      await supabase.from('vehicle_sale_photos').insert(urls.map((url, i) => ({ vehicle_id: data.id, url, position: i })));
      await supabase.from('vehicles_for_sale').update({ image_url: urls[0] }).eq('id', data.id);
      data.image_url = urls[0];
    }
    res.status(201).json({ vehicle: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/immo/vehicles-for-sale/:id  (ex: marquer vendu)
const VFS_WRITABLE = new Set([
  'brand', 'model', 'year', 'price', 'currency', 'mileage', 'fuel', 'transmission',
  'city', 'description', 'condition', 'featured', 'status', 'image_url',
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

// POST /api/immo/vehicles-for-sale/:id/photos — ajoute des photos à un véhicule EXISTANT
router.post('/vehicles-for-sale/:id/photos', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const photos = (req.body as { photos?: unknown }).photos;
  try {
    const urls = await uploadPhotos(photos, `vehicles_sale/${id}`);
    if (!urls.length) { res.status(400).json({ error: 'aucune photo valide' }); return; }
    const { count } = await supabase.from('vehicle_sale_photos').select('*', { count: 'exact', head: true }).eq('vehicle_id', id);
    const base = count ?? 0;
    await supabase.from('vehicle_sale_photos').insert(urls.map((url, i) => ({ vehicle_id: id, url, position: base + i })));
    const { data: v } = await supabase.from('vehicles_for_sale').select('image_url').eq('id', id).single();
    if (!(v as { image_url?: string } | null)?.image_url) await supabase.from('vehicles_for_sale').update({ image_url: urls[0] }).eq('id', id);
    res.json({ ok: true, added: urls.length, count: base + urls.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/immo/vehicles-for-sale/:id/photos
router.get('/vehicles-for-sale/:id/photos', requireMobileAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('vehicle_sale_photos').select('url, position').eq('vehicle_id', req.params['id']).order('position', { ascending: true });
    if (error) throw error;
    res.json({ photos: data ?? [] });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// DELETE /api/immo/vehicles-for-sale/:id/photos  body { url }
router.delete('/vehicles-for-sale/:id/photos', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const url = (req.body as { url?: string }).url;
  if (!url) { res.status(400).json({ error: 'url requise' }); return; }
  try {
    await supabase.from('vehicle_sale_photos').delete().eq('vehicle_id', id).eq('url', url);
    const { data: rest } = await supabase.from('vehicle_sale_photos').select('url').eq('vehicle_id', id).order('position', { ascending: true }).limit(1);
    await supabase.from('vehicles_for_sale').update({ image_url: (rest as { url?: string }[] | null)?.[0]?.url ?? null }).eq('id', id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

export default router;
