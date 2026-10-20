import { Router } from 'express';
import { airAlgerieLink } from '../../integrations/air-algerie.js';

// Lien court public des fiches billet (Telegram/app) : GET /api/vol?f=LIL&t=ORN&d=…&r=…&a=2&c=0&i=0
// → refait la recherche sur airalgerie.dz au moment du clic (le lien du site expire) et redirige vers les résultats.
const router = Router();

router.get('/', async (req, res) => {
  res.redirect(302, await airAlgerieLink(req.query as Record<string, unknown>));
});

export default router;
