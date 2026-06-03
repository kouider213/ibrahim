/**
 * LLM Router — Phase 2
 * RÈGLE KOUIDER: uniquement Claude ou Groq. Gemini/OpenAI ne sont PLUS utilisés dans le routing.
 * Groq (rapide/simple + vision secours) → Claude (agentique/outils/vision principale).
 */
import { Dzaryx } from '../config/constants.js';

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
const TOOL_KEYWORDS = /réservation|booking|location|voiture|client|facture|paiement|caisse|finance|revenu|revenus|bénéfice|profit|gagné|gain|météo|news|agenda|calendrier|github|deploy|railway|code|script|whatsapp|telegram|mémoire|souvien|rappelle|mémo|tiktok|vidéo|image|photo|pdf|document|contrat|passeport|permis|envoie|concurrent|concurrentiel|veille|recherche\s+con|actualité|actu|sport|foot|politique|économie|taux|dinar|dzd|dollar|euro|algérie|algérien|alger|oran|condition|visa|formalité|loi|règlement|info\s+sur|qu.est.ce\s+que|c.est\s+quoi|explique|comment\s+(?!ça|ca)|pourquoi|quand\s+(?!même)|où\s+(?!est|sont)|qui\s+est\s+(?!tu)|quel\s+(?!age|âge)|compta|comptable|export\s+compta|bilan\s+mensuel/i;

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
    : [Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? ''].filter(Boolean).join('\n\n');
  const userContent: unknown[] = [];
  if (imageBase64) {
    userContent.push({ type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } });
  }
  userContent.push({ type: 'text', text: userMessage });

  const { default: axios } = await import('axios');
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:       'meta-llama/llama-4-scout-17b-16e-instruct',
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

  const systemPrompt = [Dzaryx.SYSTEM_PROMPT as string, systemExtra ?? ''].filter(Boolean).join('\n\n');
  const { default: axios } = await import('axios');
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:       'llama-3.3-70b-versatile',
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
  const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
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
  const { data } = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    },
    {
      headers: {
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      timeout: 30_000,
    },
  );
  const text = (data.content?.[0]?.text as string | undefined) ?? '';
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
