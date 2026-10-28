/**
 * LLM Router — Phase 2
 * RÈGLE KOUIDER: uniquement Claude ou Groq. Gemini/OpenAI ne sont PLUS utilisés dans le routing.
 * Groq (rapide/simple + vision secours) → Claude (agentique/outils/vision principale).
 */
import { Dzaryx } from '../config/constants.js';
import { CLAUDE_FAST, adaptRawRequest } from './anthropic-compat.js';
import { groqSystemPrompt } from './compact-prompt.js';

const GROQ_KEY    = process.env['GROQ_API_KEY'];
const OPENAI_KEY  = process.env['OPENAI_API_KEY'];
const GEMINI_KEY  = process.env['GEMINI_API_KEY'];

export type LLMProvider = 'claude' | 'groq' | 'openai' | 'gemini';

export interface RouteDecision {
  provider:   LLMProvider;
  fallback:   LLMProvider;
  fastPath:   boolean;   // true = skip agentic loop entirely
  reason:     string;
}

// ── Keywords that signal tools are required ──────────────────────────────────
// Robuste aux fautes de frappe courantes : pass?e?ports? matche passeport/paseport/
// passport/pasport ; envoi matche envoi/envoie/envoyer ; montre/affiche = demande de doc.
const TOOL_KEYWORDS = /réservation|booking|location|voiture|client|facture|paiement|caisse|finance|revenu|revenus|bénéfice|profit|gagné|gain|météo|news|agenda|calendrier|mails?\b|e-?mails?|gmail|appel|téléphon|prospect|démarch|demarch|r[ée]pond|github|deploy|railway|code|script|whatsapp|telegram|mémoire|souvien|rappelle|mémo|tiktok|vidéo|image|photo|pdf|document|contrat|pass?e?ports?|permis|cni|carte\s*(?:grise|id|identité)|envoi|montre|affiche|concurrent|concurrentiel|veille|recherche\s+con|actualité|actu|sport|foot|politique|économie|taux|dinar|dzd|dollar|euro|algérie|algérien|alger|oran|condition|visa|formalité|loi|règlement|info\s+sur|qu.est.ce\s+que|c.est\s+quoi|explique|comment\s+(?!ça|ca)|pourquoi|quand\s+(?!même)|où\s+(?!est|sont)|qui\s+est\s+(?!tu)|quel\s+(?!age|âge)|compta|comptable|export\s+compta|bilan\s+mensuel/i;

// ── Simple non-tool queries → Groq fast path ─────────────────────────────────
const SIMPLE_GREET  = /^(bonjour|salut|hello|hi|hey|bonsoir|salam|coucou|yo|wesh)[\s!?.]*$/i;
const SIMPLE_QUERY  = /^(comment (ça|ca) va|ça va|ca va|tu vas bien|quoi de neuf|what'?s up|merci|ok|oui|non|yes|no|d'?accord|parfait|super|gg|bravo)[\s!?.]*$/i;
const SIMPLE_WHOAMI = /^(qui es[- ]tu|c'est quoi dzaryx|présente[- ]toi|dis[- ]moi qui tu es|tu t'appelles comment)[\s!?.]*$/i;

function classifyRequest(text: string, hasImage: boolean, messageCount: number): RouteDecision {
  // RÈGLE KOUIDER: tout passe par Claude ou Groq. JAMAIS Gemini/OpenAI.
  // Vision = Claude (rapide + natif images). Le tour vocal+image force la cascade rapide côté orchestrateur.
  if (hasImage) {
    return { provider: 'claude', fallback: 'groq', fastPath: false, reason: 'image/vision-claude' };
  }

  // Business tools keywords → Claude agentic loop
  if (TOOL_KEYWORDS.test(text)) {
    return { provider: 'claude', fallback: 'groq', fastPath: false, reason: 'tools required' };
  }

  // Long messages → Claude (raisonnement complexe probable)
  if (text.length > 300) {
    return { provider: 'claude', fallback: 'groq', fastPath: false, reason: 'long message' };
  }

  // "oui"/"ok" en pleine conversation = souvent la confirmation d'une action proposée
  // (ex: "Je l'envoie ?") → Claude avec outils, sinon l'action validée ne s'exécute jamais
  if (messageCount > 2 && /^(ok|okay|oui|ouais|yes|d'?accord|parfait|vas[- ]y|go)[\s!?.]*$/i.test(text.trim())) {
    return { provider: 'claude', fallback: 'groq', fastPath: false, reason: 'confirmation in conversation' };
  }

  // Pure greetings/ack → Groq (ni connaissance ni outils, ultra-rapide)
  // Check BEFORE the short-message block so greetings never fall through to Claude
  if (GROQ_KEY && (SIMPLE_GREET.test(text) || SIMPLE_QUERY.test(text) || SIMPLE_WHOAMI.test(text))) {
    return { provider: 'groq', fallback: 'claude', fastPath: true, reason: 'simple greeting' };
  }

  // Numeric replies in conversation → Claude agentic loop
  if (text.length <= 100) {
    const isNumericReply = /^[\+\d][\d\s\-().]{2,}$/.test(text.trim()) || /^\d+\s*(ans?|€|\$|eur|dzd|jours?|km)?$/i.test(text.trim());
    if (messageCount > 2 && isNumericReply) {
      return { provider: 'claude', fallback: 'groq', fastPath: false, reason: 'numeric reply in conversation' };
    }
  }

  // Multi-turn conversation context → Claude (has memory/context)
  if (messageCount > 2) {
    return { provider: 'claude', fallback: 'groq', fastPath: false, reason: 'conversation context' };
  }

  // Default: Claude with full agentic loop
  return { provider: 'claude', fallback: 'groq', fastPath: false, reason: 'default' };
}

// ── Groq Vision (Llama 4 Scout — vision-capable, free tier) ─────────────────
// llama-3.2-11b-vision-preview was decommissioned by Groq (April 2025)
export async function callGroqVision(
  userMessage:   string,
  systemExtra?:  string,
  imageBase64?:  string,
  imageMime      = 'image/jpeg',
  skipBasePrompt = false,
): Promise<string> {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY not configured');

  const systemPrompt = skipBasePrompt
    ? (systemExtra ?? '')
    : groqSystemPrompt(Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? '', 4_000);
  const userContent: unknown[] = [];
  if (imageBase64) {
    userContent.push({ type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } });
  }
  userContent.push({ type: 'text', text: userMessage });

  const { default: axios } = await import('axios');
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:       'qwen/qwen3.8-27b',
      messages:    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
      max_tokens:  1024,
      temperature: 0.2,
    },
    { headers: { Authorization: `Bearer ${GROQ_KEY}` }, timeout: 30_000 },
  );
  const text = (data.choices?.[0]?.message?.content as string | undefined) ?? '';
  if (!text) throw new Error('Groq Vision returned empty response');
  console.log(`[groq-vision] ✅ ${text.length} chars`);
  return text;
}

// ── Groq (OpenAI-compatible API, LLaMA 3.3 70B) ──────────────────────────────
export async function callGroq(userMessage: string, systemExtra?: string): Promise<string> {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY not configured');

  // Groq free = 8 000 tokens/min : prompt complet → 413, on passe au prompt court
  const systemPrompt = groqSystemPrompt(Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? '');
  const { default: axios } = await import('axios');
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:       'openai/gpt-oss-120b',
      messages:    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      max_tokens:  512,
      temperature: 0.7,
    },
    { headers: { Authorization: `Bearer ${GROQ_KEY}` }, timeout: 12_000 },
  );
  const text = (data.choices?.[0]?.message?.content as string | undefined) ?? '';
  if (!text) throw new Error('Groq returned empty response');
  console.log(`[groq] ✅ ${text.length} chars`);
  return text;
}

// ── Gemini 1.5 Flash (Google AI, long context + vision) ──────────────────────
export async function callGemini(
  userMessage: string,
  systemExtra?: string,
  imageBase64?: string,
  imageMime    = 'image/jpeg',
): Promise<string> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');

  const systemPrompt = [Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? ''].filter(Boolean).join('\n\n');

  // Build parts — image MUST come before text for Gemini multimodal
  const parts: unknown[] = [];
  if (imageBase64) {
    parts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
    parts.push({ text: userMessage });
  } else {
    parts.push({ text: `${systemPrompt}\n\nUtilisateur: ${userMessage}` });
  }

  const requestBody: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
  };
  // Use systemInstruction for vision requests (avoids stuffing system into user turn)
  if (imageBase64) {
    requestBody['systemInstruction'] = { parts: [{ text: systemPrompt }] };
  }

  const { default: axios } = await import('axios');
  const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
  let lastErr = '';
  for (const model of GEMINI_MODELS) {
    try {
      const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        requestBody,
        { timeout: 30_000 },
      );
      const text = (data.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined) ?? '';
      if (!text) throw new Error(`${model} empty response`);
      console.log(`[gemini/${model}] ✅ ${text.length} chars`);
      return text;
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      lastErr = err instanceof Error ? err.message : String(err);
      if (status === 429 || status === 503) {
        console.warn(`[gemini/${model}] ${status} quota/overload — trying next model`);
        continue;
      }
      throw err; // non-quota errors: rethrow immediately
    }
  }
  throw new Error(`Gemini all models failed: ${lastErr}`);
}

// ── OpenAI GPT-4o (fallback — no tools, degraded mode) ───────────────────────
export async function callOpenAI(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemExtra?: string,
): Promise<string> {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');

  const systemPrompt = [
    Dzaryx.SYSTEM_PROMPT as string,
    systemExtra ?? '',
    '⚠️ Mode dégradé: certains outils ne sont pas disponibles dans cette réponse.',
  ].filter(Boolean).join('\n\n');

  const { default: axios } = await import('axios');
  const { data } = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model:       'gpt-4o',
      messages:    [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens:  2048,
      temperature: 0.7,
    },
    { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 30_000 },
  );
  const text = (data.choices?.[0]?.message?.content as string | undefined) ?? '';
  if (!text) throw new Error('OpenAI returned empty response');
  console.log(`[openai-fallback] ✅ ${text.length} chars`);
  return text;
}

// ── OpenAI GPT-4o Vision (image fallback when Gemini Vision fails) ────────────
export async function callOpenAIVision(
  userMessage: string,
  systemExtra?: string,
  imageBase64?: string,
  imageMime = 'image/jpeg',
): Promise<string> {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');

  const systemPrompt = [Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? ''].filter(Boolean).join('\n\n');

  const userContent: unknown[] = [];
  if (imageBase64) {
    userContent.push({ type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } });
  }
  userContent.push({ type: 'text', text: userMessage });

  const { default: axios } = await import('axios');
  const { data } = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model:       'gpt-4o',
      messages:    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
      max_tokens:  2048,
      temperature: 0.7,
    },
    { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 30_000 },
  );
  const text = (data.choices?.[0]?.message?.content as string | undefined) ?? '';
  if (!text) throw new Error('OpenAI Vision returned empty response');
  console.log(`[openai-vision] ✅ ${text.length} chars`);
  return text;
}

// ── Claude Vision (lightweight, no tool loop — fallback when Gemini+OpenAI fail) ─
const ANTHROPIC_KEY = process.env['ANTHROPIC_API_KEY'];

export async function callClaudeVision(
  userMessage:    string,
  systemExtra?:   string,
  imageBase64?:   string,
  imageMime       = 'image/jpeg',
  skipBasePrompt  = false,   // true for structured JSON calls — skip Dzaryx persona
): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const systemPrompt = skipBasePrompt
    ? (systemExtra ?? '')
    : [Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? ''].filter(Boolean).join('\n\n');
  const SAFE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
  const safeMedia  = (SAFE_MIMES.has(imageMime) ? imageMime : 'image/jpeg') as
    'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  const userContent: unknown[] = [];
  if (imageBase64) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: safeMedia, data: imageBase64 } });
  }
  userContent.push({ type: 'text', text: userMessage });

  const { default: axios } = await import('axios');
  const req = adaptRawRequest(
    {
      model:      CLAUDE_FAST,
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    },
    {
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
  );
  const { data } = await axios.post('https://api.anthropic.com/v1/messages', req.body, { headers: req.headers, timeout: 30_000 });
  const text = ((data.content as Array<{ type: string; text?: string }> | undefined)?.find(b => b.type === 'text')?.text) ?? '';
  if (!text) throw new Error('Claude Vision returned empty response');
  console.log(`[claude-vision] ✅ ${text.length} chars`);
  return text;
}

// ── Exports ───────────────────────────────────────────────────────────────────
export { classifyRequest };
export function isGroqAvailable():   boolean { return !!GROQ_KEY; }
export function isOpenAIAvailable(): boolean { return !!OPENAI_KEY; }
export function isGeminiAvailable(): boolean { return !!GEMINI_KEY; }
export function isClaudeAvailable(): boolean { return !!ANTHROPIC_KEY; }

// ── Lecture d'un document (photo ou PDF) sans persona : Claude d'abord, puis les cerveaux gratuits ──
// 27/10 : crédit Claude à 0 → passeport/permis du client jamais lus (résa enregistrée « Client (+33…) »)
export async function readDocVision(prompt: string, base64: string, mime = 'image/jpeg', maxTokens = 600): Promise<string> {
  const isPdf = /pdf/i.test(mime);
  const tries: Array<[string, () => Promise<string>]> = [];
  tries.push(['claude', async () => {
    const { createAnthropic, claudeKnownDead } = await import('./anthropic-compat.js');
    if (claudeKnownDead()) throw new Error('claude: crédit épuisé (connu)');
    const r = await createAnthropic().messages.create({
      model: 'claude-haiku-5-5', max_tokens: maxTokens,
      messages: [{ role: 'user', content: [
        isPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
          : { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg', data: base64 } },
        { type: 'text', text: prompt },
      ] }],
    } as never);
    const rr = r as { model?: string; content: Array<{ type: string; text?: string }> };
    // Sans crédit, createAnthropic rejoue sur un cerveau de secours qui ne voit pas forcément la pièce jointe → on passe à Gemini
    if (String(rr.model ?? '').startsWith('fallback:')) throw new Error('claude: crédit épuisé');
    const t = rr.content.map(b => b.type === 'text' ? b.text ?? '' : '').join('');
    if (!t.trim()) throw new Error('claude: réponse vide');
    return t;
  }]);
  if (GEMINI_KEY) tries.push(['gemini', async () => {
    const { default: axios } = await import('axios');
    const body = { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: isPdf ? 'application/pdf' : mime, data: base64 } }, { text: prompt }] }] };
    let last = '';
    for (const model of ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest']) {
      try {
        const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, body, { timeout: 60_000 });
        const t = ((data.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string }>).map(p => p.text ?? '').join('');
        if (t.trim()) return t;
        last = `${model} vide`;
      } catch (e) { last = e instanceof Error ? e.message : String(e); }
    }
    throw new Error(`gemini: ${last}`);
  }]);
  if (!isPdf) {
    if (GROQ_KEY)   tries.push(['groq',   () => callGroqVision(prompt, '', base64, mime, true)]);
    if (OPENAI_KEY) tries.push(['openai', () => callOpenAIVision(prompt, 'Tu lis des documents. Réponds exactement au format demandé.', base64, mime)]);
  }
  let lastErr = '';
  for (const [name, fn] of tries) {
    try { return await fn(); } catch (e) { lastErr = `${name}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`; console.warn(`[doc-vision] ${lastErr}`); }
  }
  throw new Error(`lecture du document impossible (${lastErr})`);
}
