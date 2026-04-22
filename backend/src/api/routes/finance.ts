import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { getFinancialReport, seedPricingTable } from '../../integrations/finance.js';
import { VEHICLE_PRICING } from '../../config/pricing.js';

const router = Router();

// GET /api/finance/report?year=2026&month=4
router.get('/report', requireMobileAuth, async (req, res) => {
  const year  = Number(req.query['year']  ?? new Date().getFullYear());
  const month = req.query['month'] ? Number(req.query['month']) : undefined;

  if (isNaN(year)) {
    res.status(400).json({ error: 'year must be a number' });
    return;
  }

  try {
    const report = await getFinancialReport(year, month);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/finance/pricing — grille tarifaire
router.get('/pricing', requireMobileAuth, (_req, res) => {
  res.json({ pricing: VEHICLE_PRICING });
});

// POST /api/finance/seed — one-time setup, creates pricing rows in Supabase
router.post('/seed', requireMobileAuth, async (_req, res) => {
  try {
    await seedPricingTable();
    res.json({ success: true, message: `${VEHICLE_PRICING.length} véhicules chargés dans la table pricing` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// PATCH /api/finance/bookings/:id/owner — set rented_by on a booking
import { supabase } from '../../integrations/supabase.js';

router.patch('/bookings/:id/owner', requireMobileAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const { rented_by } = req.body as { rented_by: string };

  if (!['Kouider', 'Houari'].includes(rented_by)) {
    res.status(400).json({ error: 'rented_by must be "Kouider" or "Houari"' });
    return;
  }

  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({ rented_by, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.json({ booking: data, message: `Réservation attribuée à ${rented_by}` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
