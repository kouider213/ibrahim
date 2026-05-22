import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { getTravelTime } from '../../integrations/maps.js';
import { getLocation } from '../../integrations/location.js';

const router = Router();

// GET /api/maps/travel-time?destination=<addr>&origin_lat=<lat>&origin_lng=<lng>
// Returns real distance + time using stored GPS or provided coords.
// No fee calculation — frontend handles that if needed.
router.get('/travel-time', requireMobileAuth, async (req, res) => {
  const { destination, origin_lat, origin_lng } = req.query as Record<string, string>;

  if (!destination?.trim()) {
    res.status(400).json({ ok: false, error: 'destination requis' });
    return;
  }

  let lat: number;
  let lng: number;

  if (origin_lat && origin_lng) {
    lat = parseFloat(origin_lat);
    lng = parseFloat(origin_lng);
    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ ok: false, error: 'origin_lat/origin_lng invalides' });
      return;
    }
  } else {
    const actorId = req.mobileActor!.id;
    const stored  = await getLocation(actorId);
    if (!stored) {
      res.status(400).json({ ok: false, error: 'Position GPS non disponible — partage ta position dans Paramètres d\'abord.' });
      return;
    }
    lat = stored.lat;
    lng = stored.lng;
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
      ...(result.error ? { warning: result.error } : {}),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
