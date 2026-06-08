import { Router } from 'express';
import { z } from 'zod';
import { requireMobileAuth } from '../middleware/auth.js';
import { saveBeforeState, saveAfterState, getVehicleHistory } from '../../integrations/vehicle-state.js';
import {
  savePropertyBeforeState, savePropertyAfterState, getPropertyHistory,
} from '../../integrations/property-state.js';

const router = Router();

const ownerKeyFrom = (sessionId?: string): 'kouider' | 'houari' =>
  sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider';

const postSchema = z.object({
  mode:       z.enum(['before', 'after']),
  client_name: z.string().min(1),
  subject:    z.string().min(1),           // car_name OU property_name
  image:      z.string().min(20),          // base64 (avec ou sans préfixe data:)
  mime:       z.string().optional().default('image/jpeg'),
  session_id: z.string().optional(),
  ref_id:     z.string().optional(),       // booking_id (véhicule) ou property_id (immo)
});

function stripDataUri(b64: string): string {
  const i = b64.indexOf('base64,');
  return i >= 0 ? b64.slice(i + 7) : b64;
}

// POST /api/inspections/vehicle
router.post('/vehicle', requireMobileAuth, async (req, res) => {
  const p = postSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid request', details: p.error.errors }); return; }
  const { mode, client_name, subject, mime, session_id, ref_id } = p.data;
  const owner = ownerKeyFrom(session_id);
  const b64   = stripDataUri(p.data.image);
  try {
    const result = mode === 'before'
      ? await saveBeforeState(client_name, subject, b64, mime, owner, ref_id)
      : await saveAfterState(client_name, subject, b64, mime, owner);
    res.status(result.success ? 200 : 422).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/inspections/property
router.post('/property', requireMobileAuth, async (req, res) => {
  const p = postSchema.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: 'Invalid request', details: p.error.errors }); return; }
  const { mode, client_name, subject, mime, session_id, ref_id } = p.data;
  const owner = ownerKeyFrom(session_id);
  const b64   = stripDataUri(p.data.image);
  try {
    const result = mode === 'before'
      ? await savePropertyBeforeState(client_name, subject, b64, mime, owner, ref_id)
      : await savePropertyAfterState(client_name, subject, b64, mime, owner);
    res.status(result.success ? 200 : 422).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/inspections/vehicle?client=&subject=&session_id=
router.get('/vehicle', requireMobileAuth, async (req, res) => {
  const client  = String(req.query.client  ?? '') || '%';
  const subject = String(req.query.subject ?? '') || '%';
  const owner   = ownerKeyFrom(String(req.query.session_id ?? ''));
  try {
    const states = await getVehicleHistory(client, subject, owner);
    res.json({ states });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/inspections/property?client=&subject=&session_id=
router.get('/property', requireMobileAuth, async (req, res) => {
  const client  = String(req.query.client  ?? '') || '%';
  const subject = String(req.query.subject ?? '') || '%';
  const owner   = ownerKeyFrom(String(req.query.session_id ?? ''));
  try {
    const states = await getPropertyHistory(client, subject, owner);
    res.json({ states });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
