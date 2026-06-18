import { Router } from 'express';
import { z } from 'zod';
import { supabase, getClientHistory, getClientDocuments, saveClientDocument } from '../../integrations/supabase.js';
import { scanIdentity } from '../../integrations/tool-executor.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { updateClientIntelFromBooking } from '../../orchestrator/client-intelligence.js';

const router = Router();

// GET /api/clients — list clients filtered by actor (rented_by)
router.get('/', requireMobileAuth, async (req, res) => {
  const actorName = req.mobileActor
    ? req.mobileActor.ownerKey.charAt(0).toUpperCase() + req.mobileActor.ownerKey.slice(1)
    : 'Kouider';
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('client_name, client_phone, client_email, status, final_price, created_at, start_date, end_date, cars(name)')
      .eq('rented_by', actorName)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Group by phone. `types` = activités du client (loc_auto/loc_immo/achat_auto/achat_immo)
    type ClientType = 'loc_auto' | 'loc_immo' | 'achat_auto' | 'achat_immo' | 'demande';
    const clientMap = new Map<string, {
      name: string; phone: string; email: string; bookingCount: number;
      totalSpent: number; lastBooking: string; types: Set<ClientType>;
      lastCarName: string | null; lastBookingDate: string | null;
    }>();

    for (const b of (data ?? []) as Array<{
      client_name: string; client_phone: string; client_email: string;
      status: string; final_price: number; created_at: string;
      start_date: string | null; end_date: string | null; cars?: { name?: string } | null;
    }>) {
      const key = b.client_phone ?? b.client_email ?? b.client_name;
      const existing = clientMap.get(key);
      if (existing) {
        existing.bookingCount++;
        existing.types.add('loc_auto');
        if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') existing.totalSpent += b.final_price ?? 0;
        if (b.created_at > existing.lastBooking) existing.lastBooking = b.created_at;
      } else {
        // 1er vu = résa la plus récente (données triées created_at DESC) → dernière voiture louée
        clientMap.set(key, {
          name:         b.client_name,
          phone:        b.client_phone,
          email:        b.client_email,
          bookingCount: 1,
          totalSpent:   b.status === 'CONFIRMED' ? (b.final_price ?? 0) : 0,
          lastBooking:  b.created_at,
          types:        new Set<ClientType>(['loc_auto']),
          lastCarName:     b.cars?.name ?? null,
          // Date de LOCATION (début), pas created_at, pour cohérence avec l'historique affiché.
          lastBookingDate: b.start_date ?? b.created_at,
        });
      }
    }

    // Merge client_deals (immobilier + vente voiture) — by phone, fallback name
    const dealTypeMap: Record<string, ClientType> = {
      location_immo: 'loc_immo', vente_immo: 'achat_immo', vente_voiture: 'achat_auto',
      demande_specifique: 'demande', demande: 'demande',
    };
    const { data: deals } = await supabase
      .from('client_deals')
      .select('client_name, client_phone, deal_type, amount, status, created_at');
    for (const d of (deals ?? []) as Array<{
      client_name: string; client_phone: string | null; deal_type: string;
      amount: number | null; status: string | null; created_at: string;
    }>) {
      const t = dealTypeMap[d.deal_type];
      if (!t) continue;
      const key = d.client_phone ?? d.client_name;
      const existing = clientMap.get(key)
        ?? Array.from(clientMap.values()).find(c => c.name === d.client_name);
      if (existing) {
        existing.types.add(t);
        if (d.created_at > existing.lastBooking) existing.lastBooking = d.created_at;
      } else {
        clientMap.set(key, {
          name:         d.client_name,
          phone:        d.client_phone ?? '',
          email:        '',
          bookingCount: 0,
          totalSpent:   0,
          lastBooking:  d.created_at,
          types:        new Set<ClientType>([t]),
          lastCarName:     null,
          lastBookingDate: d.created_at,
        });
      }
    }

    const clients = Array.from(clientMap.values()).map(c => ({ ...c, types: Array.from(c.types) }));
    res.json({ clients });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/clients/intelligence — list client profiles from client_intelligence table
router.get('/intelligence', requireMobileAuth, async (req, res) => {
  const ownerId = (req.query['owner'] as string | undefined) ?? req.mobileActor?.ownerKey ?? 'kouider';
  const limit   = Number(req.query['limit'] ?? 100);
  try {
    const { data, error } = await supabase
      .from('client_intelligence')
      .select('*')
      .eq('owner_id', ownerId)
      .order('total_spent', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    res.json({ clients: data ?? [], count: (data ?? []).length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/clients/intelligence — modifier le profil d'un client (négociation, fiabilité…)
const intelPatchSchema = z.object({
  client_name:           z.string().min(1),
  owner:                 z.string().optional(),
  negotiation_style:     z.string().optional(),
  payment_reliability:   z.string().optional(),
  typical_duration_days: z.number().optional(),
  notes:                 z.string().nullable().optional(),
  preferred_cars:        z.array(z.string()).optional(),
});
router.patch('/intelligence', requireMobileAuth, async (req, res) => {
  const parsed = intelPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }
  const { client_name, owner, ...fields } = parsed.data;
  const ownerId = owner ?? req.mobileActor?.ownerKey ?? 'kouider';
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) update[k] = v;
  if (Object.keys(update).length === 0) { res.status(400).json({ error: 'Aucun champ à modifier' }); return; }
  try {
    const { data, error } = await supabase
      .from('client_intelligence')
      .update(update)
      .eq('owner_id', ownerId)
      .eq('client_name', client_name)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) { res.status(404).json({ error: `Client "${client_name}" introuvable` }); return; }
    res.json({ client: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/clients/backfill — rebuild client_intelligence from all historical bookings
router.post('/backfill', requireMobileAuth, async (_req, res) => {
  const ownerId = 'kouider';
  try {
    // 1. Clear existing intelligence records for this owner
    const { error: delError } = await supabase
      .from('client_intelligence')
      .delete()
      .eq('owner_id', ownerId);
    if (delError) throw new Error(`Clear failed: ${delError.message}`);

    // 2. Fetch all cars for id→name mapping
    const { data: carsData } = await supabase.from('cars').select('id, name');
    const carMap = new Map<string, string>();
    for (const c of (carsData ?? []) as Array<{ id: string; name: string }>) {
      carMap.set(c.id, c.name);
    }

    // 3. Fetch all non-rejected bookings ordered by date
    const { data: bookings, error: bErr } = await supabase
      .from('bookings')
      .select('client_name, client_phone, car_id, start_date, end_date, nb_days, client_price_per_day, final_price, discount_applied, status, payment_status, paid_amount')
      .neq('status', 'REJECTED')
      .order('start_date', { ascending: true });
    if (bErr) throw new Error(bErr.message);

    // 4. Process each booking sequentially (updateClientIntelFromBooking handles upsert)
    let processed = 0;
    let errors    = 0;
    for (const b of (bookings ?? []) as Array<{
      client_name: string; client_phone: string | null; car_id: string;
      start_date: string; end_date: string; nb_days: number | null;
      client_price_per_day: number | null; final_price: number | null;
      discount_applied: number | null; status: string;
      payment_status: string | null; paid_amount: number | null;
    }>) {
      const carName = carMap.get(b.car_id) ?? 'Véhicule';
      const nbDays  = b.nb_days ?? Math.max(1, Math.round(
        (new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86_400_000,
      ) + 1); // jours inclus
      try {
        await updateClientIntelFromBooking({
          client_name:          b.client_name,
          client_phone:         b.client_phone ?? undefined,
          car_name:             carName,
          start_date:           b.start_date,
          end_date:             b.end_date,
          nb_days:              nbDays,
          client_price_per_day: b.client_price_per_day,
          final_price:          b.final_price,
          discount_applied:     b.discount_applied ?? 0,
          status:               b.status,
          payment_status:       b.payment_status ?? undefined,
          paid_amount:          b.paid_amount ?? undefined,
        }, ownerId);
        processed++;
      } catch { errors++; }
    }

    // 5. Count unique profiles created
    const { count } = await supabase
      .from('client_intelligence')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', ownerId);

    res.json({
      ok:                 true,
      bookings_processed: processed,
      bookings_errors:    errors,
      clients_created:    count ?? 0,
      message: `Backfill terminé : ${processed} réservations → ${count ?? 0} profils clients créés`,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/clients/:phone/notes — update personal notes on client_intelligence
router.patch('/:phone/notes', requireMobileAuth, async (req, res) => {
  const phone   = decodeURIComponent(req.params['phone'] as string);
  const { notes } = req.body as { notes?: string };
  const ownerId = (req.query['owner'] as string | undefined) ?? 'kouider';
  try {
    const { data, error } = await supabase
      .from('client_intelligence')
      .update({ notes: notes?.trim() || null })
      .eq('client_phone', phone)
      .eq('owner_id', ownerId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, client: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/clients/leads — demandes/leads clients (recherches en cours)
router.get('/leads', requireMobileAuth, async (req, res) => {
  const status = (req.query['status'] as string | undefined)?.trim();
  try {
    let q = supabase.from('client_leads')
      .select('id, client_name, client_phone, category, criteria, budget_max, currency, city, status, notes, created_at')
      .order('created_at', { ascending: false }).limit(200);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json({ leads: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/clients/leads/:id — changer statut d'un lead
router.patch('/leads/:id', requireMobileAuth, async (req, res) => {
  const id = req.params['id'] as string;
  const body = req.body as { status?: string; notes?: string };
  try {
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) upd['status'] = body.status;
    if (body.notes != null) upd['notes'] = body.notes;
    const { data, error } = await supabase.from('client_leads').update(upd).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    res.json({ lead: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/clients/leads — créer un lead depuis l'app
router.post('/leads', requireMobileAuth, async (req, res) => {
  const b = req.body as Record<string, unknown>;
  if (!b['client_name'] || !b['criteria']) { res.status(400).json({ error: 'client_name et criteria requis' }); return; }
  try {
    const { data, error } = await supabase.from('client_leads').insert([{
      client_name: b['client_name'], client_phone: b['client_phone'] ?? null,
      category: b['category'] ?? 'immo_location', criteria: b['criteria'],
      budget_max: b['budget_max'] ?? null, currency: b['currency'] ?? 'DZD',
      city: b['city'] ?? null, status: 'nouveau',
    }]).select().single();
    if (error) throw new Error(error.message);
    res.status(201).json({ lead: data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/clients/operations — TOUTES les opérations immo/vente/demandes (vue RESAS)
router.get('/operations', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('client_deals')
      .select('id, client_name, client_phone, deal_type, item_label, amount, currency, status, created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    res.json({ operations: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/clients/deals?name=&phone= — opérations immo/vente/demandes du client
router.get('/deals', requireMobileAuth, async (req, res) => {
  const name  = (req.query['name']  as string | undefined)?.trim();
  const phone = (req.query['phone'] as string | undefined)?.trim();
  if (!name && !phone) { res.status(400).json({ error: 'name ou phone requis' }); return; }
  try {
    let q = supabase
      .from('client_deals')
      .select('id, client_name, client_phone, deal_type, item_label, amount, currency, status, created_at')
      .order('created_at', { ascending: false });
    if (phone) q = q.eq('client_phone', phone);
    else if (name) q = q.ilike('client_name', name);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json({ deals: data ?? [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/clients/:phone — full client profile + history (must be LAST — catches all)
router.get('/:phone', requireMobileAuth, async (req, res) => {
  const phone = decodeURIComponent(req.params['phone'] as string);
  try {
    const history = await getClientHistory(phone);
    const documents = await getClientDocuments(phone);
    // Enrichit chaque résa avec le nom du véhicule (car_id → name)
    const carIds = [...new Set(history.bookings.map(b => (b as { car_id?: string }).car_id).filter(Boolean))] as string[];
    let carMap = new Map<string, string>();
    if (carIds.length > 0) {
      const { data: cars } = await supabase.from('cars').select('id, name').in('id', carIds);
      carMap = new Map((cars ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    }
    const bookings = history.bookings.map(b => ({
      ...b, car_name: carMap.get((b as { car_id?: string }).car_id ?? '') ?? null,
    }));
    res.json({ phone, ...history, bookings, documents });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/clients/documents — upload document reference
const docSchema = z.object({
  clientPhone: z.string().min(1),
  clientName:  z.string().min(1),
  bookingId:   z.string().uuid().optional(),
  type:        z.enum(['passport', 'license', 'contract', 'other']),
  fileUrl:     z.string().url(),
  storagePath: z.string().min(1),
  notes:       z.string().optional(),
});

router.post('/documents', requireMobileAuth, async (req, res) => {
  const parsed = docSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }
  try {
    const doc = await saveClientDocument({
      client_phone: parsed.data.clientPhone,
      client_name:  parsed.data.clientName,
      booking_id:   parsed.data.bookingId,
      type:         parsed.data.type,
      file_url:     parsed.data.fileUrl,
      storage_path: parsed.data.storagePath,
      notes:        parsed.data.notes,
    });
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/clients/scan-document — scanne une pièce (OCR) + l'enregistre dans le
// dossier du client ET la rattache à sa réservation (n° passeport sur la résa).
// Permet d'ajouter un passeport DIRECTEMENT depuis la fiche client, sans le chat.
const scanDocSchema = z.object({
  base64:      z.string().min(100),
  mime:        z.string().optional(),
  isPermis:    z.boolean().optional(),
  clientName:  z.string().optional(),
  clientPhone: z.string().optional(),
});
router.post('/scan-document', requireMobileAuth, async (req, res) => {
  const parsed = scanDocSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }
  try {
    const buf = Buffer.from(parsed.data.base64, 'base64');
    const text = await scanIdentity(
      buf, parsed.data.mime ?? 'image/jpeg', !!parsed.data.isPermis, undefined,
      { clientName: parsed.data.clientName, clientPhone: parsed.data.clientPhone },
    );
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// DELETE /api/clients/documents/:id — supprime une pièce du dossier client
// (ex: passeport ajouté par erreur). Retire la ligne + le fichier du bucket (best-effort).
router.delete('/documents/:id', requireMobileAuth, async (req, res) => {
  const id = req.params.id;
  if (!id) { res.status(400).json({ error: 'id requis' }); return; }
  try {
    const { data: doc } = await supabase
      .from('client_documents')
      .select('storage_path')
      .eq('id', id)
      .single();
    if (doc?.storage_path) {
      await supabase.storage.from('client-documents').remove([doc.storage_path as string]).catch(() => {});
    }
    const { error } = await supabase.from('client_documents').delete().eq('id', id);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
