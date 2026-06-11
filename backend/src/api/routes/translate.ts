// Traduction automatique du contenu (descriptions, FAQ, conditions, annonces…)
// vers AR / EN via Gemini (gratuit) + cache Redis 30 jours. Utilisé par le site.
import { Router } from 'express';
import { createHash } from 'crypto';
import { redis } from '../../queue/queue.js';

const router = Router();
const GEMINI_KEY = process.env['GEMINI_API_KEY'];
const GROQ_KEY   = process.env['GROQ_API_KEY'];
const OPENAI_KEY = process.env['OPENAI_API_KEY'];
const TTL = 60 * 60 * 24 * 30; // 30 jours

const LANG_NAME: Record<string, string> = { ar: 'Arabic (Modern Standard)', en: 'English', fr: 'French' };
const key = (target: string, text: string) => `tr:${target}:${createHash('sha1').update(text).digest('hex')}`;

interface TransResult { result: string[]; ok: boolean; raw?: string; error?: string; }

function parseArray(out: string, n: number): string[] | null {
  let s = out.replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
  const a = s.indexOf('['); const b = s.lastIndexOf(']');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    const arr = JSON.parse(s) as unknown;
    if (Array.isArray(arr) && arr.length === n) return arr.map(v => String(v ?? ''));
  } catch { /* ignore */ }
  return null;
}

// Provider OpenAI-compatible (Groq / OpenAI) — renvoie le texte de la réponse
async function chatJSON(url: string, model: string, apiKey: string, lang: string, texts: string[]): Promise<string> {
  const { default: axios } = await import('axios');
  const sys = `You are a professional translator. Translate each string of the user's JSON array into ${lang}. ` +
    `Keep proper nouns (brand/car/place names), prices, numbers and URLs unchanged. ` +
    `Return ONLY a JSON object {"t": [...]} where t is the array of translations, same length and order.`;
  const { data } = await axios.post(url, {
    model,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(texts) }],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 30_000 });
  return (data.choices?.[0]?.message?.content as string | undefined) ?? '';
}

async function translateTexts(texts: string[], target: string): Promise<TransResult> {
  const lang = LANG_NAME[target] ?? target;
  let lastErr = '';

  // 1) Groq (gratuit, gros quota) puis 2) OpenAI — via objet JSON {"t":[...]}
  const oai: Array<{ name: string; url: string; model: string; k?: string }> = [
    { name: 'groq',   url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', k: GROQ_KEY },
    { name: 'openai', url: 'https://api.openai.com/v1/chat/completions',      model: 'gpt-4o-mini',            k: OPENAI_KEY },
  ];
  for (const p of oai) {
    if (!p.k) continue;
    try {
      const out = await chatJSON(p.url, p.model, p.k, lang, texts);
      let parsed: string[] | null = null;
      try { const o = JSON.parse(out) as { t?: unknown }; if (Array.isArray(o.t) && o.t.length === texts.length) parsed = o.t.map(v => String(v ?? '')); } catch { /* try array */ }
      if (!parsed) parsed = parseArray(out, texts.length);
      if (parsed) return { result: parsed, ok: true };
      lastErr = `${p.name}: format inattendu`;
    } catch (err) {
      lastErr = `${p.name}: ` + (err instanceof Error ? err.message : String(err));
      const ax = err as { response?: { data?: unknown } };
      if (ax.response?.data) lastErr += ' | ' + JSON.stringify(ax.response.data).slice(0, 150);
    }
  }

  // 3) Gemini (free tier — peut être en quota 429)
  if (GEMINI_KEY) {
    const { default: axios } = await import('axios');
    const prompt = `Translate each item of this JSON array into ${lang}. Keep proper nouns, prices, numbers, URLs unchanged. Return ONLY a JSON array of strings, same length and order.\n${JSON.stringify(texts)}`;
    for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const { data } = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' } },
          { timeout: 30_000 },
        );
        const out = (data.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined) ?? '';
        const parsed = parseArray(out, texts.length);
        if (parsed) return { result: parsed, ok: true };
      } catch (err) {
        lastErr = 'gemini: ' + (err instanceof Error ? err.message : String(err));
      }
    }
  }

  return { result: texts, ok: false, error: lastErr };
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
      dbg = await translateTexts(missingTxt, target);
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
