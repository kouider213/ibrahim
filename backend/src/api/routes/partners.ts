import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { listPartners, upsertPartner, deletePartner, addOffer, updateOffer, deleteOffer, linkCars, OFFER_TYPES, PARTNER_STATUS } from '../../integrations/partners.js';

// Page « PARTENAIRES » de l'app (Kouider) : Houari, Karim… et tout ce qu'ils proposent (véhicules, immobilier, services, activités).
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});
const fail = (res: import('express').Response, err: unknown, code = 500) =>
  res.status(code).json({ error: err instanceof Error ? err.message : String(err) });
const body = (req: import('express').Request) => (req.body ?? {}) as Record<string, unknown>;

// GET /api/partners — tous les partenaires avec leurs offres (véhicules du parc = prix/photos à jour)
router.get('/', async (_req, res) => {
  try { res.json({ partners: await listPartners(), types: OFFER_TYPES, statuses: PARTNER_STATUS }); } catch (err) { fail(res, err); }
});
// POST /api/partners { name, role, phone, … } — nouveau partenaire
router.post('/', async (req, res) => {
  try { res.json({ partner: await upsertPartner(body(req)) }); } catch (err) { fail(res, err, 400); }
});
// PATCH /api/partners/:id — modifier la fiche
router.patch('/:id', async (req, res) => {
  try { res.json({ partner: await upsertPartner(body(req), req.params['id']) }); } catch (err) { fail(res, err, 400); }
});
// DELETE /api/partners/:id — retirer (les voitures/biens liés restent sur le site)
router.delete('/:id', async (req, res) => {
  try { await deletePartner(req.params['id']!); res.json({ ok: true }); } catch (err) { fail(res, err); }
});
// POST /api/partners/:id/offers { type, title, owner_price, client_price, unit, photos: base64[], add_to_fleet?, publish_site? }
router.post('/:id/offers', async (req, res) => {
  try { res.json(await addOffer(req.params['id']!, body(req))); } catch (err) { fail(res, err, 400); }
});
// PATCH /api/partners/:id/offers/:oid { …champs, photos?: base64[], remove_photos?: url[] }
router.patch('/:id/offers/:oid', async (req, res) => {
  try { res.json({ offer: await updateOffer(req.params['id']!, req.params['oid']!, body(req)) }); } catch (err) { fail(res, err, 400); }
});
// DELETE /api/partners/:id/offers/:oid?remove_linked=1
router.delete('/:id/offers/:oid', async (req, res) => {
  try { await deleteOffer(req.params['id']!, req.params['oid']!, req.query['remove_linked'] === '1'); res.json({ ok: true }); } catch (err) { fail(res, err); }
});
// POST /api/partners/:id/link-cars { car_ids: [] } — rattacher des voitures existantes du parc
router.post('/:id/link-cars', async (req, res) => {
  const ids = Array.isArray(body(req)['car_ids']) ? (body(req)['car_ids'] as unknown[]).map(String) : [];
  try { res.json({ linked: await linkCars(req.params['id']!, ids) }); } catch (err) { fail(res, err, 400); }
});

export default router;
