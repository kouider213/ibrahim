import { Router } from 'express';
import { z } from 'zod';
import { supabase, saveClientDocument } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

const BUCKET = 'client-documents';

// POST /api/documents/upload — upload base64 file to Supabase Storage + save record
const uploadSchema = z.object({
  clientPhone: z.string().min(1),
  clientName:  z.string().min(1),
  bookingId:   z.string().optional(),
  type:        z.enum(['passport', 'license', 'contract', 'other']),
  fileName:    z.string().min(1),
  mimeType:    z.string().default('application/octet-stream'),
  base64:      z.string().min(1),
  notes:       z.string().optional(),
});

router.post('/upload', requireMobileAuth, async (req, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    return;
  }

  const { clientPhone, clientName, bookingId, type, fileName, mimeType, base64, notes } = parsed.data;

  try {
    const buffer  = Buffer.from(base64, 'base64');
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path    = `${clientPhone}/${type}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const fileUrl = urlData.publicUrl;

    const doc = await saveClientDocument({
      client_phone: clientPhone,
      client_name:  clientName,
      booking_id:   bookingId,
      type,
      file_url:     fileUrl,
      storage_path: path,
      notes,
    });

    res.json({
      success:  true,
      doc,
      fileUrl,
      message: `✅ Document ${type} stocké pour ${clientName}`,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/documents/:phone — list documents for a client
router.get('/:phone', requireMobileAuth, async (req, res) => {
  const phone = decodeURIComponent(req.params['phone'] as string);

  try {
    const { data, error } = await supabase
      .from('client_documents')
      .select('*')
      .eq('client_phone', phone)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    res.json({ documents: data ?? [], count: (data ?? []).length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
