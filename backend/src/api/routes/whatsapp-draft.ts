// Assistant WhatsApp rédactionnel : Dzaryx rédige une réponse client dans sa langue.
// LLM gratuit (Groq → OpenAI fallback). POST /api/whatsapp/draft
import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();
const GROQ_KEY   = process.env['GROQ_API_KEY'];
const OPENAI_KEY = process.env['OPENAI_API_KEY'];

const LANG_NAME: Record<string, string> = {
  fr: 'français',
  ar: "arabe darija oranaise (mélange darija + arabe, ton local algérien, garder les noms propres et montants)",
  en: 'English',
};

async function draft(clientMsg: string, context: string, lang: string, tone: string): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const langName = LANG_NAME[lang] ?? LANG_NAME.fr;
  const sys =
    `Tu es l'assistant de "Fik Conciergerie" (Oran, Algérie) : location de voitures sans caution, vente véhicules, ` +
    `immobilier, packs séjour, au service de la diaspora algérienne. ` +
    `Rédige UNE réponse WhatsApp à envoyer au client, en ${langName}. ` +
    `Ton ${tone || 'professionnel et chaleureux'}, concis (style WhatsApp, 2-5 phrases), poli, orienté solution. ` +
    `N'invente pas de prix ou de dispo précise si on ne te les donne pas — propose de confirmer. ` +
    `Réponds UNIQUEMENT par le texte du message, sans guillemets ni préambule.`;
  const user = `Message du client : "${clientMsg}"\n${context ? `Contexte / infos à utiliser : ${context}` : ''}`;

  const providers = [
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
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0.7,
      }, { headers: { Authorization: `Bearer ${p.k}` }, timeout: 30_000 });
      const out = (data.choices?.[0]?.message?.content as string | undefined)?.trim();
      if (out) return { ok: true, reply: out };
      lastErr += ` || ${p.name}: vide`;
    } catch (err) {
      lastErr += ` || ${p.name}: ` + (err instanceof Error ? err.message : String(err));
    }
  }
  return { ok: false, error: lastErr };
}

router.post('/draft', requireMobileAuth, async (req, res) => {
  const { clientMessage, context, lang, tone } = (req.body ?? {}) as
    { clientMessage?: string; context?: string; lang?: string; tone?: string };
  if ((!clientMessage || clientMessage.trim().length < 1) && (!context || context.trim().length < 1)) {
    res.status(400).json({ error: 'message client ou contexte requis' }); return;
  }
  const r = await draft((clientMessage || '').slice(0, 1000), (context || '').slice(0, 600), lang || 'fr', tone || '');
  if (!r.ok) { res.status(502).json({ error: r.error ?? 'rédaction échouée' }); return; }
  res.json({ reply: r.reply });
});

export default router;
