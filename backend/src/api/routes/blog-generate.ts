// Génération d'articles de blog SEO pour le site Fik Conciergerie.
// Réutilise les providers LLM (Groq gratuit → OpenAI) déjà configurés.
// POST /api/blog-generate { topic: string, lang?: 'fr' }
import { Router } from 'express';

const router = Router();
const GROQ_KEY   = process.env['GROQ_API_KEY'];
const OPENAI_KEY = process.env['OPENAI_API_KEY'];

interface Article { title: string; excerpt: string; body: string; }

function parseObj(out: string): Article | null {
  let s = out.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    const o = JSON.parse(s) as Partial<Article>;
    if (o.title && o.body) return { title: String(o.title), excerpt: String(o.excerpt ?? ''), body: String(o.body) };
  } catch { /* ignore */ }
  return null;
}

async function generate(topic: string): Promise<{ ok: boolean; article?: Article; error?: string }> {
  const sys =
    `Tu es rédacteur SEO pour "Fik Conciergerie", une agence à Oran (Algérie) : location de voitures sans caution, ` +
    `vente de véhicules, immobilier et packs séjour, au service de la diaspora algérienne. ` +
    `Rédige un article de blog en FRANÇAIS, ton professionnel et chaleureux, utile et concret (pas de blabla). ` +
    `Structure le corps en HTML simple : <h2>, <p>, <ul><li>. 500-700 mots. ` +
    `Termine par un appel à l'action vers la réservation WhatsApp. ` +
    `Réponds UNIQUEMENT en JSON : {"title": "...", "excerpt": "phrase d'accroche ~140 caractères", "body": "<h2>...</h2><p>...</p>"}`;

  const providers: Array<{ name: string; url: string; model: string; k?: string }> = [
    { name: 'groq',   url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', k: GROQ_KEY },
    { name: 'openai', url: 'https://api.openai.com/v1/chat/completions',      model: 'gpt-4o-mini',            k: OPENAI_KEY },
  ];

  let lastErr = `[keys groq=${!!GROQ_KEY} openai=${!!OPENAI_KEY}]`;
  const { default: axios } = await import('axios');
  for (const p of providers) {
    if (!p.k) continue;
    try {
      const { data } = await axios.post(p.url, {
        model: p.model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: `Sujet de l'article : ${topic}` }],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }, { headers: { Authorization: `Bearer ${p.k}` }, timeout: 45_000 });
      const out = (data.choices?.[0]?.message?.content as string | undefined) ?? '';
      const article = parseObj(out);
      if (article) return { ok: true, article };
      lastErr += ` || ${p.name}: format inattendu`;
    } catch (err) {
      lastErr += ` || ${p.name}: ` + (err instanceof Error ? err.message : String(err));
    }
  }
  return { ok: false, error: lastErr };
}

router.post('/', async (req, res) => {
  const { topic } = req.body as { topic?: string };
  if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
    res.status(400).json({ error: 'topic requis' }); return;
  }
  const r = await generate(topic.trim().slice(0, 200));
  if (!r.ok) { res.status(502).json({ error: r.error ?? 'génération échouée' }); return; }
  res.json({ article: r.article });
});

export default router;
