import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requirePcAuth } from '../middleware/auth.js';
import { generatePdfReceipt } from '../../integrations/phase5-finance.js';
import { logDocumentAccess } from '../../security/document-access-log.js';
import { queueTelegramMessage } from '../../notifications/tg-outbox.js';

// Données métier pour les panneaux de Nexus (PC de Kouider). Protégé par PC_AGENT_TOKEN, jamais par un jeton mobile.
const router = Router();
router.use(requirePcAuth);

const BUCKET = 'client-documents';
const DOC_TYPES = new Set(['passport', 'license', 'contract', 'other']);
const fail = (res: import('express').Response, err: unknown) =>
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });

// GET /api/nexus/data/bookings?limit=30&q=nom
router.get('/bookings', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query['limit'] ?? 30), 1), 500);
  const q = String(req.query['q'] ?? '').trim();
  try {
    let query = supabase.from('bookings').select('*, cars(name)').order('created_at', { ascending: false }).limit(limit);
    if (q) query = query.ilike('client_name', `%${q}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const bookings = (data ?? []).map((b: Record<string, unknown>) => ({
      id: b['id'], client_name: b['client_name'], client_phone: b['client_phone'],
      car: (b['cars'] as { name?: string } | null)?.name ?? null,
      start_date: b['start_date'], end_date: b['end_date'], status: b['status'], nb_days: b['nb_days'],
      final_price: b['final_price'], paid_amount: b['paid_amount'] ?? b['acompte_amount'] ?? 0,
      payment_status: b['payment_status'], created_at: b['created_at'],
    }));
    res.json({ bookings, count: bookings.length });
  } catch (err) { fail(res, err); }
});

// GET /api/nexus/data/documents?name=Mohamed&type=passport — lien signé 10 min, chaque consultation est journalisée
router.get('/documents', async (req, res) => {
  const name = String(req.query['name'] ?? '').trim();
  const type = String(req.query['type'] ?? '').trim();
  if (!name) { res.status(400).json({ error: 'name requis' }); return; }
  if (type && !DOC_TYPES.has(type)) { res.status(400).json({ error: 'type invalide' }); return; }
  try {
    let query = supabase.from('client_documents').select('*').ilike('client_name', `%${name}%`)
      .order('created_at', { ascending: false }).limit(12);
    if (type) query = query.eq('type', type);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const documents = await Promise.all((data ?? []).map(async (d: Record<string, unknown>) => {
      const path = d['storage_path'] as string | undefined;
      let url = d['file_url'] as string | undefined;
      if (path) {
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
        if (s?.signedUrl) url = s.signedUrl;
      }
      void logDocumentAccess({
        user_id: 0, action: 'view', doc_type: String(d['type'] ?? 'other'),
        client_name: String(d['client_name'] ?? ''), client_phone: String(d['client_phone'] ?? ''),
        is_admin: true, masked: false, timestamp: new Date().toISOString(), ip: 'nexus-pc',
      });
      return { id: d['id'], type: d['type'], client_name: d['client_name'], client_phone: d['client_phone'],
        notes: d['notes'], created_at: d['created_at'], url };
    }));
    res.json({ documents, count: documents.length });
  } catch (err) { fail(res, err); }
});

// POST /api/nexus/data/invoice { bookingId? , name? } — facture PDF (dernière réservation du client, ou la dernière tout court)
router.post('/invoice', async (req, res) => {
  const body = (req.body ?? {}) as { bookingId?: string; name?: string };
  try {
    let id = String(body.bookingId ?? '').trim();
    if (!id) {
      let query = supabase.from('bookings').select('id, client_name').order('created_at', { ascending: false }).limit(1);
      const name = String(body.name ?? '').trim();
      if (name) query = query.ilike('client_name', `%${name}%`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data?.length) { res.status(404).json({ error: name ? `Aucune réservation pour « ${name} »` : 'Aucune réservation' }); return; }
      id = String((data[0] as { id: string }).id);
    }
    const { data: b } = await supabase.from('bookings').select('client_name, final_price').eq('id', id).maybeSingle();
    const result = await generatePdfReceipt(id);
    res.json({ url: result.url, bookingId: id, client_name: (b as { client_name?: string } | null)?.client_name ?? null,
      total: (b as { final_price?: number } | null)?.final_price ?? null });
  } catch (err) { fail(res, err); }
});

// POST /api/nexus/data/notify { text } — message Telegram à Kouider (liens, récaps)
router.post('/notify', async (req, res) => {
  const text = String(((req.body ?? {}) as { text?: string }).text ?? '').trim().slice(0, 3500);
  if (!text) { res.status(400).json({ error: 'text requis' }); return; }
  try {
    await queueTelegramMessage(text);
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

export default router;
