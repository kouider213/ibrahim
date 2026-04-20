import { Router } from 'express';
import { z } from 'zod';
import { supabase, getClientHistory, getClientDocuments, saveClientDocument } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/clients/:phone — full client profile + history
router.get('/:phone', requireMobileAuth, async (req, res) => {
  const phone = decodeURIComponent(req.params['phone'] as string);
  try {
    const history = await getClientHistory(phone);
    const documents = await getClientDocuments(phone);
    res.json({ phone, ...history, documents });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/clients — list all clients with booking counts
router.get('/', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select('client_name, client_phone, client_email, status, final_price, created_at')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    // Group by phone
    const clientMap = new Map<string, {
      name: string; phone: string; email: string; bookingCount: number; totalSpent: number; lastBooking: string;
    }>();

    for (const b of (data ?? []) as Array<{
      client_name: string; client_phone: string; client_email: string;
      status: string; final_price: number; created_at: string;
    }>) {
      const key = b.client_phone ?? b.client_email ?? b.client_name;
      const existing = clientMap.get(key);
      if (existing) {
        existing.bookingCount++;
        if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') existing.totalSpent += b.final_price ?? 0;
        if (b.created_at > existing.lastBooking) existing.lastBooking = b.created_at;
      } else {
        clientMap.set(key, {
          name:         b.client_name,
          phone:        b.client_phone,
          email:        b.client_email,
          bookingCount: 1,
          totalSpent:   b.status === 'CONFIRMED' ? (b.final_price ?? 0) : 0,
          lastBooking:  b.created_at,
        });
      }
    }

    res.json({ clients: Array.from(clientMap.values()) });
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

export default router;
