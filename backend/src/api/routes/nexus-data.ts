import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requirePcAuth } from '../middleware/auth.js';
import { generatePdfReceipt } from '../../integrations/phase5-finance.js';
import { logDocumentAccess } from '../../security/document-access-log.js';
import { queueTelegramMessage } from '../../notifications/tg-outbox.js';
import { kvGet } from '../../integrations/app-store.js';

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

// GET /api/nexus/data/webcams?nearby=lat,lon,km  ou  ?offset=0..1000 (les plus regardées du monde) — caméras Windy pour le globe ;
// la clé reste côté serveur (env WINDY_WEBCAMS_KEY ou app_kv cfg:windy_webcams_key)
router.get('/webcams', async (req, res) => {
  const nearby = String(req.query['nearby'] ?? '');
  const offset = Number(req.query['offset'] ?? 0);
  if (nearby && !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+$/.test(nearby)) { res.status(400).json({ error: 'nearby=lat,lon,km invalide' }); return; }
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000) { res.status(400).json({ error: 'offset 0..1000' }); return; }
  try {
    const key = process.env['WINDY_WEBCAMS_KEY'] || await kvGet('cfg:windy_webcams_key');
    if (!key) { res.json({ webcams: [], total: 0, windy: false }); return; }
    const qs = new URLSearchParams({ limit: '50', lang: 'fr', include: 'location,images,player' });
    if (nearby) qs.set('nearby', nearby);
    else { qs.set('offset', String(offset)); qs.set('sortKey', 'popularity'); qs.set('sortDirection', 'desc'); }
    const r = await fetch(`https://api.windy.com/webcams/api/v3/webcams?${qs}`, { headers: { 'x-windy-api-key': key }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`windy ${r.status}`);
    const d = await r.json() as { webcams?: unknown[]; total?: number };
    res.json({ webcams: d.webcams ?? [], total: d.total ?? 0, windy: true });
  } catch (err) { fail(res, err); }
});

export default router;
