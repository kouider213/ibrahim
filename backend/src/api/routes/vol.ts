import { Router } from 'express';
import { airAlgerieLink } from '../../integrations/air-algerie.js';

// Lien court public des fiches billet (Telegram/app) : GET /api/vol?f=LIL&t=ORN&d=…&r=…&a=2&c=0&i=0
// → refait la recherche sur airalgerie.dz au moment du clic (le lien du site expire) et redirige vers les résultats.
const router = Router();

// Suivi public d'un vol pour la famille : /api/vol/suivi/<jeton> (page) et /api/vol/suivi/<jeton>.json (données)
router.get('/suivi/:token', async (req, res) => {
  const raw = String(req.params['token']);
  const { flightByToken, trackPage } = await import('../../integrations/flight-live.js');
  if (raw.endsWith('.json')) {
    const v = await flightByToken(raw.slice(0, -5)).catch(() => null);
    if (!v) { res.status(404).json({ error: 'introuvable' }); return; }
    const { id: _id, ...pub } = v;
    res.set('Cache-Control', 'no-store').json(pub);
    return;
  }
  res.removeHeader('Content-Security-Policy');   // helmet bloquerait le script et la carte (Leaflet, tuiles CARTO)
  res.set('Content-Type', 'text/html; charset=utf-8').send(trackPage(raw));
});

router.get('/', async (req, res) => {
  res.redirect(302, await airAlgerieLink(req.query as Record<string, unknown>));
});

export default router;
