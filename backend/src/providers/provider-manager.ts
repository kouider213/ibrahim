/**
 * Provider Manager — Unified LLM interface for multi-agent orchestration.
 * Each agent can specify its own provider, model, temperature, and maxTokens.
 * Falls back to Claude when the desired provider is not configured.
 *
 * Supported providers:
 *   claude  → Anthropic claude-sonnet-4-6 / claude-haiku-4-5
 *   openai  → GPT-4o (requires OPENAI_API_KEY)
 *   gemini  → Gemini 1.5 Flash (requires GEMINI_API_KEY)
 *   groq    → LLaMA 3.3 70B (requires GROQ_API_KEY)
 */
import Anthropic from '@anthropic-ai/sdk';
import axios     from 'axios';
import { env }   from '../config/env.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProviderName = 'claude' | 'openai' | 'gemini' | 'groq';

export interface LLMConfig {
  provider:    ProviderName;
  model:       string;
  temperature: number;
  maxTokens:   number;
  fallback?:   ProviderName;   // used if primary unavailable
}

export interface ProviderResult {
  text:         string;
  inputTokens:  number;
  outputTokens: number;
  latencyMs:    number;
  provider:     ProviderName;  // actual provider used
  model:        string;        // actual model used
  usedFallback: boolean;       // true = fell back from desired provider
  costEstUsd:   number;        // cost estimate in USD
}

// ── Cost table (USD per million tokens: [input_rate, output_rate]) ────────────
const COST_PER_MTok: Record<ProviderName, [number, number]> = {
  claude: [3.00,  15.00],   // claude-sonnet-4-6
  openai: [2.50,  10.00],   // gpt-4o
  gemini: [0.075,  0.30],   // gemini-1.5-flash
  groq:   [0.59,   0.79],   // llama-3.3-70b
};

function estimateCost(p: ProviderName, inp: number, out: number): number {
  const [ri, ro] = COST_PER_MTok[p];
  return (inp * ri + out * ro) / 1_000_000;
}

// ── Availability check ────────────────────────────────────────────────────────
export function isAvailable(p: ProviderName): boolean {
  switch (p) {
    case 'claude': return !!env.ANTHROPIC_API_KEY;
    case 'openai': return !!env.OPENAI_API_KEY;
    case 'gemini': return !!env.GEMINI_API_KEY;
    case 'groq':   return !!env.GROQ_API_KEY;
  }
}

export function defaultModel(p: ProviderName): string {
  switch (p) {
    case 'claude': return 'claude-sonnet-4-6';
    case 'openai': return 'gpt-4o';
    case 'gemini': return 'gemini-1.5-flash';
    case 'groq':   return 'llama-3.3-70b-versatile';
  }
}

// ── Provider-specific callers ─────────────────────────────────────────────────

async function _claude(
  msg: string, sys: string, model: string, temp: number, maxTok: number,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model, max_tokens: maxTok, temperature: temp,
    system: sys,
    messages: [{ role: 'user', content: msg }],
  });
  const text = r.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');
  return { text, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
}

async function _openai(
  msg: string, sys: string, model: string, temp: number, maxTok: number,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { data } = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages:    [{ role: 'system', content: sys }, { role: 'user', content: msg }],
      max_tokens:  maxTok,
      temperature: temp,
    },
    { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, timeout: 60_000 },
  );
  return {
    text:         (data.choices?.[0]?.message?.content as string) ?? '',
    inputTokens:  data.usage?.prompt_tokens    ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

async function _gemini(
  msg: string, sys: string, model: string, temp: number, maxTok: number,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      system_instruction: { parts: [{ text: sys }] },
      contents:           [{ role: 'user', parts: [{ text: msg }] }],
      generationConfig:   { maxOutputTokens: maxTok, temperature: temp },
    },
    { timeout: 60_000 },
  );
  return {
    text:         (data.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? '',
    inputTokens:  data.usageMetadata?.promptTokenCount     ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function _groq(
  msg: string, sys: string, model: string, temp: number, maxTok: number,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model,
      messages:    [{ role: 'system', content: sys }, { role: 'user', content: msg }],
      max_tokens:  maxTok,
      temperature: temp,
    },
    { headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, timeout: 30_000 },
  );
  return {
    text:         (data.choices?.[0]?.message?.content as string) ?? '',
    inputTokens:  data.usage?.prompt_tokens    ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ── Main unified call (with fallback + timeout) ───────────────────────────────

export async function callProvider(
  config:       LLMConfig,
  userMessage:  string,
  systemPrompt: string,
  timeoutMs:    number,
): Promise<ProviderResult> {
  const t0 = Date.now();
  let provider     = config.provider;
  let model        = config.model;
  let usedFallback = false;

  // Resolve provider availability
  if (!isAvailable(provider)) {
    const fb = config.fallback ?? 'claude';
    if (isAvailable(fb)) {
      console.log(`[provider-mgr] ${provider} unavail → fallback ${fb}`);
      provider = fb; model = defaultModel(fb); usedFallback = true;
    } else if (isAvailable('claude')) {
      console.log(`[provider-mgr] ${provider} + ${config.fallback ?? 'none'} unavail → claude`);
      provider = 'claude'; model = defaultModel('claude'); usedFallback = true;
    } else {
      throw new Error(`[provider-mgr] No LLM available (wanted: ${config.provider})`);
    }
  }

  // Timeout wrapper
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`provider timeout ${timeoutMs}ms`)), timeoutMs)),
    ]);

  let r: { text: string; inputTokens: number; outputTokens: number };
  switch (provider) {
    case 'claude': r = await withTimeout(_claude(userMessage, systemPrompt, model, config.temperature, config.maxTokens)); break;
    case 'openai': r = await withTimeout(_openai(userMessage, systemPrompt, model, config.temperature, config.maxTokens)); break;
    case 'gemini': r = await withTimeout(_gemini(userMessage, systemPrompt, model, config.temperature, config.maxTokens)); break;
    case 'groq':   r = await withTimeout(_groq(userMessage, systemPrompt, model, config.temperature, config.maxTokens)); break;
  }

  const latencyMs  = Date.now() - t0;
  const costEstUsd = estimateCost(provider, r.inputTokens, r.outputTokens);

  console.log(
    `[provider-mgr] ${provider}/${model} ✅ ` +
    `len=${r.text.length} in=${r.inputTokens} out=${r.outputTokens} ` +
    `${latencyMs}ms $${costEstUsd.toFixed(6)}` +
    (usedFallback ? ` [fallback from ${config.provider}]` : ''),
  );

  return { ...r, latencyMs, provider, model, usedFallback, costEstUsd };
}
