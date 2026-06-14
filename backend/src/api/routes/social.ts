// Machine à contenu social : génère captions TikTok/Instagram/Facebook + hashtags (Groq gratuit).
import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();
const GROQ_KEY   = process.env['GROQ_API_KEY'];
const OPENAI_KEY = process.env['OPENAI_API_KEY'];

router.post('/generate', requireMobileAuth, async (req, res) => {
  const { topic, platform, lang } = (req.body ?? {}) as { topic?: string; platform?: string; lang?: string };
  if (!topic || topic.trim().length < 2) { res.status(400).json({ error: 'sujet requis' }); return; }
  const plat = platform || 'Instagram';
  const langName = lang === 'ar' ? 'arabe darija oranaise' : lang === 'en' ? 'English' : 'français';
  const sys =
    `Tu es community manager pour "Fik Conciergerie" (Oran) : location voitures sans caution, vente, immobilier, ` +
    `packs séjour, pour la diaspora algérienne. Crée une publication ${plat} en ${langName}, accrocheuse, emojis, ` +
    `appel à l'action (réserver sur WhatsApp / site). Puis 12-15 hashtags pertinents (Oran, Algérie, diaspora, location voiture…). ` +
    `Réponds en JSON: {"caption":"...", "hashtags":"#... #..."}`;

  const providers = [
    { name: 'groq',   url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', k: GROQ_KEY },
    { name: 'openai', url: 'https://api.openai.com/v1/chat/completions',      model: 'gpt-4o-mini',            k: OPENAI_KEY },
  ];
  const { default: axios } = await import('axios');
  let lastErr = `[keys groq=${!!GROQ_KEY} openai=${!!OPENAI_KEY}]`;
  for (const p of providers) {
    if (!p.k) continue;
    try {
      const { data } = await axios.post(p.url, {
        model: p.model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: `Sujet : ${topic}` }],
        temperature: 0.8, response_format: { type: 'json_object' },
      }, { headers: { Authorization: `Bearer ${p.k}` }, timeout: 30_000 });
      let s = ((data.choices?.[0]?.message?.content as string | undefined) ?? '').replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
      const a = s.indexOf('{'); const b = s.lastIndexOf('}'); if (a >= 0 && b > a) s = s.slice(a, b + 1);
      const o = JSON.parse(s) as { caption?: string; hashtags?: string };
      if (o.caption) { res.json({ caption: String(o.caption), hashtags: String(o.hashtags ?? '') }); return; }
      lastErr += ` || ${p.name}: format`;
    } catch (err) { lastErr += ` || ${p.name}: ` + (err instanceof Error ? err.message : String(err)); }
  }
  res.status(502).json({ error: lastErr });
});

export default router;
