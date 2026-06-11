// Traduction automatique du contenu (descriptions, FAQ, conditions, annonces…)
// vers AR / EN via Gemini (gratuit) + cache Redis 30 jours. Utilisé par le site.
import { Router } from 'express';
import { createHash } from 'crypto';
import { redis } from '../../queue/queue.js';

const router = Router();
const GEMINI_KEY = process.env['GEMINI_API_KEY'];
const TTL = 60 * 60 * 24 * 30; // 30 jours

const LANG_NAME: Record<string, string> = { ar: 'Arabic (Modern Standard)', en: 'English', fr: 'French' };
const key = (target: string, text: string) => `tr:${target}:${createHash('sha1').update(text).digest('hex')}`;

interface TransResult { result: string[]; ok: boolean; raw?: string; error?: string; }

async function geminiTranslate(texts: string[], target: string): Promise<TransResult> {
  if (!GEMINI_KEY) return { result: texts, ok: false, error: 'GEMINI_API_KEY manquant' };
  const lang = LANG_NAME[target] ?? target;
  const prompt = `Translate each item of this JSON array into ${lang}. ` +
    `Keep proper nouns (brand/car/place names), prices, numbers and URLs unchanged. ` +
    `Return ONLY a JSON array of strings, exactly the same length and order, no extra text, no markdown.\n` +
    JSON.stringify(texts);
  const { default: axios } = await import('axios');
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'];
  let lastErr = '';
  let lastRaw = '';
  for (const model of models) {
    try {
      const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' } },
        { timeout: 30_000 },
      );
      let out = (data.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined) ?? '';
      lastRaw = out;
      out = out.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
      // Extraction robuste du tableau JSON
      const s = out.indexOf('['); const e = out.lastIndexOf(']');
      if (s >= 0 && e > s) out = out.slice(s, e + 1);
      const arr = JSON.parse(out) as string[];
      if (Array.isArray(arr) && arr.length === texts.length) {
        return { result: arr.map((v, i) => String(v ?? texts[i])), ok: true };
      }
      lastErr = `longueur ${Array.isArray(arr) ? arr.length : 'NA'} ≠ ${texts.length}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      const ax = err as { response?: { data?: unknown } };
      if (ax.response?.data) lastErr += ' | ' + JSON.stringify(ax.response.data).slice(0, 200);
    }
  }
  return { result: texts, ok: false, raw: lastRaw.slice(0, 300), error: lastErr };
}

// POST /api/translate { texts: string[], target: 'ar'|'en' }
router.post('/', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  const { texts, target } = req.body as { texts?: unknown; target?: string };
  if (!Array.isArray(texts) || !target || !['ar', 'en', 'fr'].includes(target)) {
    res.status(400).json({ error: 'texts[] + target (ar|en|fr) requis' }); return;
  }
  const clean = texts.map(t => String(t ?? '')).slice(0, 60); // garde-fou
  if (target === 'fr') { res.json({ translations: clean }); return; }

  try {
    // 1) Cache Redis
    const cached = await Promise.all(clean.map(t => (t.trim() ? redis.get(key(target, t)) : Promise.resolve(t))));
    const missingIdx: number[] = [];
    const missingTxt: string[] = [];
    cached.forEach((v, i) => { if (v === null && clean[i].trim()) { missingIdx.push(i); missingTxt.push(clean[i]); } });

    // 2) Traduire les manquants (ne met en cache QUE les succès)
    let fresh: string[] = [];
    let dbg: TransResult | null = null;
    if (missingTxt.length > 0) {
      dbg = await geminiTranslate(missingTxt, target);
      fresh = dbg.result;
      if (dbg.ok) {
        await Promise.all(fresh.map((tr, j) => redis.set(key(target, missingTxt[j]), tr, 'EX', TTL))).catch(() => {});
      }
    }

    // 3) Recompose dans l'ordre
    const result = clean.map((t, i) => {
      if (!t.trim()) return t;
      const c = cached[i];
      if (c !== null) return c;
      const j = missingIdx.indexOf(i);
      return j >= 0 ? fresh[j] : t;
    });
    const payload: Record<string, unknown> = { translations: result };
    if ('debug' in req.query && dbg && !dbg.ok) { payload['_error'] = dbg.error; payload['_raw'] = dbg.raw; }
    res.json(payload);
  } catch (e) {
    res.json({ translations: clean }); // jamais d'erreur visible côté site
  }
});

export default router;
