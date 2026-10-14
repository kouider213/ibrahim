import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  type ClientSite, loginClient, sessionSite, logoutClient, changeClientPassword, cleanEdit, publishSite, saveSite,
  uploadPhoto, removePhotos, isOwnPhoto, MAX_PHOTOS,
} from '../../integrations/client-sites.js';

// API de l'espace client des sites FIK (page /admin/ de chaque site, sur Netlify). Auth : jeton de session du
// patron (Bearer), obtenu par /login — indépendant des jetons de l'app Dzaryx.

const router = Router();
type Authed = Request & { site?: ClientSite; token?: string };

const bearer = (req: Request) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();

async function auth(req: Authed, res: Response, next: NextFunction): Promise<void> {
  const token = bearer(req);
  const site = token ? await sessionSite(token).catch(() => null) : null;
  if (!site?.account) { res.status(401).json({ error: 'Non connecté' }); return; }
  req.site = site; req.token = token;
  next();
}

// Ce que le patron peut voir et modifier (jamais le hash du mot de passe ni les infos internes).
const editable = (s: ClientSite) => ({
  place: { name: s.place.name, address: s.place.address, phone: s.place.phone ?? '', hours: s.place.hours },
  content: { tagline: s.content.tagline, about: s.content.about, offerTitle: s.content.offerTitle, offerIntro: s.content.offerIntro,
    offer: s.content.offer, highlights: s.content.highlights, palette: s.content.palette },
  photos: s.photos,
});

router.post('/login', async (req, res) => {
  const { site, email, password } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof site !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'E-mail et mot de passe requis' }); return;
  }
  try {
    const token = await loginClient(site, email, password, req.ip ?? '');
    if (!token) { res.status(401).json({ error: 'E-mail ou mot de passe incorrect' }); return; }
    res.json({ token });
  } catch (err) {
    res.status(429).json({ error: err instanceof Error ? err.message : 'Trop d\'essais' });
  }
});

router.get('/me', auth, (req: Authed, res) => {
  res.json({ site: editable(req.site!), url: req.site!.url });
});

router.put('/me', auth, async (req: Authed, res) => {
  const s = req.site!;
  const body = (req.body ?? {}) as { place?: unknown; content?: Record<string, unknown>; photos?: unknown };
  // Le patron ne touche pas à la liste « inventé » (réservée à Kouider) ni aux polices.
  const { invented: _i, fonts: _f, ...content } = body.content ?? {};
  const photos = Array.isArray(body.photos) ? body.photos.filter((u): u is string => typeof u === 'string') : s.photos;
  if (photos.some(u => !s.photos.includes(u) || !isOwnPhoto(s.id, u))) { res.status(400).json({ error: 'Photo inconnue' }); return; }
  const edited = cleanEdit(s, { place: body.place, content });
  if (!edited.place.name) { res.status(400).json({ error: 'Le nom du commerce est obligatoire' }); return; }
  const removed = s.photos.filter(u => !photos.includes(u));
  Object.assign(s, edited, { name: edited.place.name, photos });
  try {
    const url = await publishSite(s);
    await removePhotos(removed);
    res.json({ site: editable(s), url });
  } catch (err) {
    console.error('[client-sites] publication', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'La mise en ligne a échoué, réessayez dans un instant.' });
  }
});

router.post('/me/photo', auth, async (req: Authed, res) => {
  const s = req.site!;
  const m = String((req.body as { data?: unknown })?.data ?? '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) { res.status(400).json({ error: 'Image invalide (JPEG, PNG ou WebP)' }); return; }
  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.length > 8 * 1024 * 1024) { res.status(413).json({ error: 'Photo trop lourde (8 Mo maximum)' }); return; }
  if (s.photos.length >= MAX_PHOTOS) { res.status(400).json({ error: `${MAX_PHOTOS} photos maximum` }); return; }
  try {
    const url = await uploadPhoto(s.id, buf, m[1]!);
    s.photos.push(url);
    await saveSite(s);
    res.json({ url });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Envoi impossible' });
  }
});

router.post('/me/password', auth, async (req: Authed, res) => {
  const { old, new: next } = (req.body ?? {}) as Record<string, unknown>;
  const err = await changeClientPassword(req.site!, String(old ?? ''), String(next ?? ''));
  if (err) { res.status(400).json({ error: err }); return; }
  res.json({ ok: true });
});

router.post('/logout', async (req, res) => {
  const token = bearer(req);
  if (token) await logoutClient(token).catch(() => {});
  res.json({ ok: true });
});

export default router;
