import express, { Router } from 'express';
import { contractPage, contractSign } from '../../integrations/site-contract.js';

// Page publique « Contrat FIK Sites » : lecture + signature (nom + « lu et approuvé »), lien signé envoyé par Kouider.
const router = Router();
router.use(express.urlencoded({ extended: false, limit: '8kb' }));

router.get('/:token', async (req, res) => {
  try { const r = await contractPage(String(req.params['token'])); res.status(r.status).type('html').send(r.html); }
  catch (err) { console.error('[contrat]', err instanceof Error ? err.message : err); res.status(500).type('html').send('Erreur, réessayez plus tard.'); }
});
router.post('/:token', async (req, res) => {
  try {
    const r = await contractSign(String(req.params['token']), (req.body ?? {}) as Record<string, unknown>, req.ip ?? '', String(req.headers['user-agent'] ?? ''));
    res.status(r.status).type('html').send(r.html);
  } catch (err) { console.error('[contrat]', err instanceof Error ? err.message : err); res.status(500).type('html').send('Erreur, réessayez plus tard.'); }
});

export default router;
