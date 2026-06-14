// Newsletter depuis l'app : envoi de campagne (test + à tous) via le site (Resend).
// L'envoi réel + les templates + la traduction restent sur le site (source unique).
// Le backend proxy avec un token interne (INTERNAL_API_TOKEN) pour contourner
// la vérif de session Supabase admin de /api/newsletter-send.
import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();
const SITE = process.env['FIK_SITE_URL'] || 'https://fikconciergerie.com';

// GET /api/newsletter/stats — nombre d'abonnés actifs (lecture directe, même base)
router.get('/stats', requireMobileAuth, async (_req, res) => {
  try {
    const { count, error } = await supabase
      .from('newsletter_subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    if (error) throw new Error(error.message);
    res.json({ active: count ?? 0 });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/newsletter/send — envoie une campagne (test:true → email de test ; sinon à tous)
router.post('/send', requireMobileAuth, async (req, res) => {
  const { title, body, test, testEmail } = (req.body ?? {}) as
    { title?: string; body?: string; test?: boolean; testEmail?: string };
  if (!title || !body) { res.status(400).json({ error: 'titre + contenu requis' }); return; }

  const token = process.env['INTERNAL_API_TOKEN'];
  if (!token) { res.status(503).json({ error: 'INTERNAL_API_TOKEN non configuré sur Railway' }); return; }

  try {
    const r = await fetch(`${SITE}/api/newsletter-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': token },
      body: JSON.stringify({ title, body, test: !!test, testEmail }),
    });
    const j = (await r.json()) as Record<string, unknown>;
    if (!r.ok) { res.status(r.status).json(j); return; }
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
