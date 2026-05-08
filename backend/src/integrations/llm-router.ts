/**
 * LLM Router — Phase 2
 * Groq (fast/simple) → Claude (agentic/tools) → OpenAI (fallback)
 */
import { Dzaryx } from '../config/constants.js';

const GROQ_KEY   = process.env['GROQ_API_KEY'];
const OPENAI_KEY = process.env['OPENAI_API_KEY'];

export type LLMProvider = 'claude' | 'groq' | 'openai';

export interface RouteDecision {
  provider:   LLMProvider;
  fallback:   LLMProvider;
  fastPath:   boolean;   // true = skip agentic loop entirely
  reason:     string;
}

// ── Keywords that signal tools are required ──────────────────────────────────
const TOOL_KEYWORDS = /réservation|booking|location|voiture|client|facture|paiement|caisse|finance|météo|news|agenda|calendrier|github|deploy|railway|code|script|whatsapp|telegram|mémoire|souvien|rappelle|mémo|tiktok|vidéo|image|photo|pdf|document|contrat/i;

// ── Simple non-tool queries → Groq fast path ─────────────────────────────────
const SIMPLE_GREET  = /^(bonjour|salut|hello|hi|hey|bonsoir|salam|coucou|yo|wesh)[\s!?.]*$/i;
const SIMPLE_QUERY  = /^(comment (ça|ca) va|ça va|ca va|tu vas bien|quoi de neuf|what'?s up|merci|ok|oui|non|yes|no|d'?accord|parfait|super|gg|bravo)[\s!?.]*$/i;
const SIMPLE_WHOAMI = /^(qui es[- ]tu|c'est quoi dzaryx|présente[- ]toi|dis[- ]moi qui tu es|tu t'appelles comment)[\s!?.]*$/i;

function classifyRequest(text: string, hasImage: boolean, messageCount: number): RouteDecision {
  // Vision always needs Claude
  if (hasImage) {
    return { provider: 'claude', fallback: 'openai', fastPath: false, reason: 'image/vision' };
  }

  // Business tools keywords → Claude agentic loop
  if (TOOL_KEYWORDS.test(text)) {
    return { provider: 'claude', fallback: 'openai', fastPath: false, reason: 'tools required' };
  }

  // Long messages → Claude (complex reasoning likely needed)
  if (text.length > 300) {
    return { provider: 'claude', fallback: 'openai', fastPath: false, reason: 'long message' };
  }

  // Multi-turn conversation context → Claude (has memory/context)
  if (messageCount > 2) {
    return { provider: 'claude', fallback: 'openai', fastPath: false, reason: 'conversation context' };
  }

  // Simple greetings/chitchat → Groq if available (ultra-fast, no tools needed)
  if (GROQ_KEY && (SIMPLE_GREET.test(text) || SIMPLE_QUERY.test(text) || SIMPLE_WHOAMI.test(text))) {
    return { provider: 'groq', fallback: 'claude', fastPath: true, reason: 'simple greeting' };
  }

  // Default: Claude with full agentic loop
  return { provider: 'claude', fallback: OPENAI_KEY ? 'openai' : 'claude', fastPath: false, reason: 'default' };
}

// ── Groq (OpenAI-compatible API) ─────────────────────────────────────────────
export async function callGroq(userMessage: string, systemExtra?: string): Promise<string> {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY not configured');

  const systemPrompt = [
    Dzaryx.SYSTEM_PROMPT as string,
    systemExtra ?? '',
  ].filter(Boolean).join('\n\n');

  const { default: axios } = await import('axios');
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model:       'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      max_tokens:  512,
      temperature: 0.7,
    },
    {
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      timeout: 12_000,
    },
  );

  const text = (data.choices?.[0]?.message?.content as string | undefined) ?? '';
  if (!text) throw new Error('Groq returned empty response');
  console.log(`[groq] ✅ ${text.length} chars`);
  return text;
}

// ── OpenAI fallback (no tools — emergency fallback only) ─────────────────────
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
      model:      'gpt-4o',
      messages:   [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 2048,
      temperature: 0.7,
    },
    {
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30_000,
    },
  );

  const text = (data.choices?.[0]?.message?.content as string | undefined) ?? '';
  if (!text) throw new Error('OpenAI returned empty response');
  console.log(`[openai-fallback] ✅ ${text.length} chars`);
  return text;
}

// ── Main export: route + execute ──────────────────────────────────────────────
export { classifyRequest };

export function isGroqAvailable():  boolean { return !!GROQ_KEY; }
export function isOpenAIAvailable(): boolean { return !!OPENAI_KEY; }
