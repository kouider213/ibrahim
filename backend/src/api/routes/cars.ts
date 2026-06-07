import { Router } from 'express';
import { z } from 'zod';
import { v2 as cloudinary } from 'cloudinary';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { redis } from '../../queue/queue.js';
import { env } from '../../config/env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME ?? '',
  api_key:    env.CLOUDINARY_API_KEY    ?? '',
  api_secret: env.CLOUDINARY_API_SECRET ?? '',
});

const router = Router();

// POST /api/cars/photos — upload multi-photos d'un véhicule → Cloudinary + car_photos
// Body: { message?, car_name?, images: base64[] }. Reconnaît la voiture via car_name ou le message.
const photosSchema = z.object({
  message:  z.string().optional().default(''),
  car_name: z.string().optional(),
  images:   z.array(z.string().min(10)).min(1).max(15),
});
router.post('/photos', requireMobileAuth, async (req, res) => {
  const parsed = photosSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid request' }); return; }
  const { message, car_name, images } = parsed.data;
  try {
    const { data: cars } = await supabase.from('cars').select('id, name, image_url');
    const list = (cars ?? []) as { id: string; name: string; image_url: string | null }[];
    const hint = (car_name ?? message).toLowerCase();
    const sorted = [...list].sort((a, b) => b.name.length - a.name.length);
    // 1) nom complet présent dans le message → match direct
    let car = sorted.find(c => c.name && hint.includes(c.name.toLowerCase())) ?? null;
    // 2) sinon score = nb de tokens distinctifs (≥3 lettres) du nom présents dans le message
    if (!car) {
      let best: { car: typeof list[number]; score: number } | null = null;
      for (const c of sorted) {
        if (!c.name) continue;
        const toks = c.name.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
        if (!toks.length) continue;
        const score = toks.filter(t => hint.includes(t)).length;
        if (score > 0 && (!best || score > best.score)) best = { car: c, score };
      }
      car = best?.car ?? null;
    }
    if (!car) { res.json({ text: '❌ Je n\'ai pas reconnu la voiture. Précise le nom exact (ex: "Clio 5 Alpine", "Jumpy").' }); return; }

    const { data: existing } = await supabase.from('car_photos').select('position').eq('car_id', car.id).order('position', { ascending: false }).limit(1);
    let pos = existing && existing.length ? Number((existing[0] as { position: number }).position) + 1 : 0;
    const firstPos = pos;

    const urls: string[] = [];
    for (const b64 of images) {
      const dataUri = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
      const up = await cloudinary.uploader.upload(dataUri, { folder: `cars/${car.id}` });
      urls.push(up.secure_url);
      await supabase.from('car_photos').insert({ car_id: car.id, url: up.secure_url, position: pos++ });
    }
    // Si la voiture n'a pas de photo principale → mettre la première
    if (!car.image_url && urls.length && firstPos === 0) {
      await supabase.from('cars').update({ image_url: urls[0] }).eq('id', car.id);
    }
    res.json({ text: `✅ ${urls.length} photo(s) enregistrée(s) pour ${car.name}. Dis "montre les photos du ${car.name}" pour les revoir/envoyer.`, count: urls.length, car: car.name });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/cars/session-photos — upload des photos jointes dans le chat → Cloudinary,
// puis cache des URLs en Redis (clé session). Quand Dzaryx crée une annonce
// (add_car / create_property / add_vehicle_for_sale / create_pack) il récupère
// ces photos et les attache automatiquement à la nouvelle annonce.
const sessionPhotosSchema = z.object({
  sessionId: z.string().min(1).max(128),
  images:    z.array(z.string().min(10)).min(1).max(15),
});
router.post('/session-photos', requireMobileAuth, async (req, res) => {
  const parsed = sessionPhotosSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid request' }); return; }
  const { sessionId, images } = parsed.data;
  try {
    const urls: string[] = [];
    for (const b64 of images) {
      const dataUri = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
      const up = await cloudinary.uploader.upload(dataUri, { folder: `pending/${sessionId}` });
      urls.push(up.secure_url);
    }
    await redis.set(`session:photos:${sessionId}`, JSON.stringify(urls), 'EX', 900);
    res.json({ count: urls.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

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

  const updates = { ...parsed.data };

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
