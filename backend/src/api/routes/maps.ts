import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { getTravelTime } from '../../integrations/maps.js';
import { getLocation } from '../../integrations/location.js';
import axios from 'axios';

const router = Router();

// Default depot origin — Douba Groupe, Haï Badr, Oran (M8GM+QMV)
const DEPOT_LAT = 35.6769;
const DEPOT_LNG = -0.6654;

// GET /api/maps/travel-time?destination=<addr>&origin_lat=<lat>&origin_lng=<lng>&from_depot=true
// from_depot=true → use Es Sénia as origin (for delivery calculator)
// No origin → use stored actor GPS → fallback Es Sénia
router.get('/travel-time', requireMobileAuth, async (req, res) => {
  const { destination, origin_lat, origin_lng, from_depot } = req.query as Record<string, string>;

  if (!destination?.trim()) {
    res.status(400).json({ ok: false, error: 'destination requis' });
    return;
  }

  let lat: number;
  let lng: number;

  if (from_depot === 'true') {
    lat = DEPOT_LAT;
    lng = DEPOT_LNG;
  } else if (origin_lat && origin_lng) {
    lat = parseFloat(origin_lat);
    lng = parseFloat(origin_lng);
    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ ok: false, error: 'origin_lat/origin_lng invalides' });
      return;
    }
  } else {
    const actorId = req.mobileActor!.id;
    const stored  = await getLocation(actorId);
    // Fallback to depot if no stored GPS — delivery calc always works
    lat = stored?.lat ?? DEPOT_LAT;
    lng = stored?.lng ?? DEPOT_LNG;
  }

  try {
    const result = await getTravelTime(lat, lng, destination.trim());
    res.json({
      ok:                   true,
      distance_km:          result.distance_km,
      travel_time_minutes:  result.travel_time_minutes,
      traffic:              result.traffic,
      waze_link:            result.waze_link,
      maps_link:            result.maps_link,
      destination_label:    result.destination_label,
      origin_lat:           lat,
      origin_lng:           lng,
      from_depot:           lat === DEPOT_LAT && lng === DEPOT_LNG,
      ...(result.error ? { warning: result.error } : {}),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/maps/autocomplete?input=<text>
// Google Places Autocomplete — returns real address suggestions
router.get('/autocomplete', requireMobileAuth, async (req, res) => {
  const { input } = req.query as Record<string, string>;
  if (!input?.trim() || input.trim().length < 2) {
    res.json({ ok: true, predictions: [] });
    return;
  }

  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) {
    res.json({ ok: true, predictions: [], warning: 'GOOGLE_MAPS_API_KEY manquant' });
    return;
  }

  try {
    const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
    const resp = await axios.get(url, {
      params: {
        input:    input.trim(),
        key,
        language: 'fr',
        types:    'geocode|establishment',
      },
      timeout: 5000,
    });

    type Prediction = { description: string; place_id: string };
    const data = resp.data as { status: string; predictions: Prediction[] };

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      res.json({ ok: false, predictions: [], error: `Places API: ${data.status}` });
      return;
    }

    res.json({
      ok:          true,
      predictions: (data.predictions ?? []).slice(0, 5).map(p => ({
        label:    p.description,
        place_id: p.place_id,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, predictions: [], error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/maps/autocomplete-public?input=<text>
// Version PUBLIQUE (sans auth) pour le site fikconciergerie — autocomplétion d'adresse
// dans l'admin. Min 3 caractères, biais Algérie, rate-limité (apiLimiter sur /api/maps).
router.get('/autocomplete-public', async (req, res) => {
  const input = String((req.query as Record<string, string>).input ?? '').trim();
  if (input.length < 3) { res.json({ ok: true, predictions: [] }); return; }
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) { res.json({ ok: true, predictions: [] }); return; }
  try {
    const resp = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
      params: { input, key, language: 'fr', components: 'country:dz', types: 'geocode|establishment' },
      timeout: 5000,
    });
    const data = resp.data as { status: string; predictions: { description: string; place_id: string }[] };
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') { res.json({ ok: false, predictions: [] }); return; }
    res.json({ ok: true, predictions: (data.predictions ?? []).slice(0, 5).map(p => ({ label: p.description, place_id: p.place_id })) });
  } catch {
    res.json({ ok: false, predictions: [] });
  }
});

export default router;
