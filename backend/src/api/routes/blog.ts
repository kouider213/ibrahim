// Blog depuis l'app : lister, publier (FR — le site auto-traduit l'affichage), basculer publié, supprimer.
// La rédaction IA passe par /api/blog-generate (existant). Table blog_posts (même base que le site).
import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();
const SITE = process.env['FIK_SITE_URL'] || 'https://fikconciergerie.com';

// POST /api/blog/cover — upload l'image d'affiche → url (via le site, bucket)
router.post('/cover', requireMobileAuth, async (req, res) => {
  const { base64, fileName, mimeType } = (req.body ?? {}) as { base64?: string; fileName?: string; mimeType?: string };
  if (!base64) { res.status(400).json({ error: 'base64 requis' }); return; }
  try {
    const r = await fetch(`${SITE}/api/upload-car-image`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, fileName: fileName || `blog-${Date.now()}.jpg`, mimeType: mimeType || 'image/jpeg' }),
    });
    const j = (await r.json()) as { url?: string; error?: string };
    if (!r.ok || !j.url) throw new Error(j.error || `upload ${r.status}`);
    res.json({ url: j.url });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

function slugify(s: string): string {
  const base = (s || 'article')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'article';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// GET /api/blog — liste des articles
router.get('/', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, slug, title_fr, excerpt_fr, cover_url, published, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    res.json({ posts: data ?? [] });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/blog — publie un article (FR). { title, excerpt, body, cover_url?, published? }
router.post('/', requireMobileAuth, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const title = String(b['title'] ?? '').trim();
  const body = String(b['body'] ?? '').trim();
  if (!title || !body) { res.status(400).json({ error: 'titre + contenu requis' }); return; }
  try {
    const { data, error } = await supabase.from('blog_posts').insert([{
      slug: slugify(title),
      title_fr: title, title_ar: '',
      excerpt_fr: String(b['excerpt'] ?? ''), excerpt_ar: '',
      body_fr: body, body_ar: '',
      cover_url: b['cover_url'] || '',
      published: b['published'] !== false,
    }]).select('id, slug, title_fr, published').single();
    if (error) throw new Error(error.message);
    res.status(201).json({ post: data });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// PATCH /api/blog/:id — publier / dépublier
router.patch('/:id', requireMobileAuth, async (req, res) => {
  const published = (req.body as { published?: boolean }).published;
  try {
    const { data, error } = await supabase.from('blog_posts').update({ published: !!published }).eq('id', req.params['id']).select('id, published').single();
    if (error) throw new Error(error.message);
    res.json({ post: data });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// DELETE /api/blog/:id
router.delete('/:id', requireMobileAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('blog_posts').delete().eq('id', req.params['id']);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
