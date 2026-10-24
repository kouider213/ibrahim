import express, { Router } from 'express';
import { rdvPage, rdvBook } from '../../integrations/rdv-booking.js';

// Page publique « Être recontacté » (le commerçant donne ses disponibilités, Kouider fixe la date) (lien signé envoyé dans le mail de démo FIK Sites).
const router = Router();
router.use(express.urlencoded({ extended: false, limit: '4kb' }));

router.get('/:token', async (req, res) => {
  try { const r = await rdvPage(String(req.params['token'])); res.status(r.status).type('html').send(r.html); }
  catch (err) { console.error('[rdv]', err instanceof Error ? err.message : err); res.status(500).type('html').send('Erreur, réessayez plus tard.'); }
});
router.post('/:token', async (req, res) => {
  try { const r = await rdvBook(String(req.params['token']), String((req.body as { dispo?: string })?.dispo ?? ''), String((req.body as { tel?: string })?.tel ?? '')); res.status(r.status).type('html').send(r.html); }
  catch (err) { console.error('[rdv]', err instanceof Error ? err.message : err); res.status(500).type('html').send('Erreur, réessayez plus tard.'); }
});

export default router;
