import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { sitesOverview, manageClientSite, createClientSite, getSite, markMessagesRead, openAsStaff } from '../../integrations/client-sites.js';
import { createDemoSite } from '../../integrations/demo-site.js';
import { editTarifs, tarifsText, getTarifs } from '../../integrations/site-tarifs.js';

// Page « Sites clients » de l'app Dzaryx (Kouider) : démos, vrais sites, abonnements, domaines, messages.
// Les actions passent par les mêmes fonctions que les outils vocaux (manage_client_site), donc même comportement.

const router = Router();

router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});

router.get('/overview', async (_req, res) => {
  try { res.json(await sitesOverview()); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur' }); }
});

router.post('/tarifs', async (req, res) => {
  const changes = String((req.body ?? {}).changes ?? '').trim();
  res.json({ message: changes ? await editTarifs(changes) : await tarifsText(), tarifs: await getTarifs() });
});

router.post('/demo', (req, res) => {
  const { link, notes } = (req.body ?? {}) as Record<string, unknown>;
  res.json({ message: createDemoSite({ link, notes }) });
});

router.post('/create', (req, res) => {
  res.json({ message: createClientSite(req.body ?? {}) });
});

const ACTIONS = ['info', 'pack', 'edit', 'pause', 'resume', 'account', 'account_off', 'domain', 'domain_check', 'domain_remove', 'billing', 'paid', 'notify'];

router.post('/:id/action', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = String(body['action'] ?? '');
  if (!ACTIONS.includes(action)) { res.status(400).json({ error: 'Action inconnue' }); return; }
  if (!(await getSite(String(req.params['id'])))) { res.status(404).json({ error: 'Site introuvable' }); return; }
  try { res.json({ message: await manageClientSite({ ...body, action, site: String(req.params['id']) }) }); }
  catch (err) { res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur' }); }
});

// Ouvre l'espace client du patron pour Kouider, sans toucher à son mot de passe.
router.post('/:id/open-admin', async (req, res) => {
  const s = await getSite(String(req.params['id']));
  if (!s) { res.status(404).json({ error: 'Site introuvable' }); return; }
  try { res.json({ url: await openAsStaff(s) }); }
  catch (err) { res.status(502).json({ error: err instanceof Error ? err.message : 'Erreur' }); }
});

router.post('/:id/messages/read', async (req, res) => {
  await markMessagesRead(String(req.params['id']));
  res.json({ ok: true });
});

export default router;
