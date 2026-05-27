"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAvailable = isAvailable;
exports.defaultModel = defaultModel;
exports.callProvider = callProvider;
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
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
// ── Cost table (USD per million tokens: [input_rate, output_rate]) ────────────
const COST_PER_MTok = {
    claude: [3.00, 15.00], // claude-sonnet-4-6
    openai: [2.50, 10.00], // gpt-4o
    gemini: [0.075, 0.30], // gemini-1.5-flash
    groq: [0.59, 0.79], // llama-3.3-70b
};
function estimateCost(p, inp, out) {
    const [ri, ro] = COST_PER_MTok[p];
    return (inp * ri + out * ro) / 1_000_000;
}
// ── Availability check ────────────────────────────────────────────────────────
function isAvailable(p) {
    switch (p) {
        case 'claude': return !!env_js_1.env.ANTHROPIC_API_KEY;
        case 'openai': return !!env_js_1.env.OPENAI_API_KEY;
        case 'gemini': return !!env_js_1.env.GEMINI_API_KEY;
        case 'groq': return !!env_js_1.env.GROQ_API_KEY;
    }
}
function defaultModel(p) {
    switch (p) {
        case 'claude': return 'claude-sonnet-4-6';
        case 'openai': return 'gpt-4o';
        case 'gemini': return 'gemini-2.0-flash';
        case 'groq': return 'llama-3.3-70b-versatile';
    }
}
// ── Provider-specific callers ─────────────────────────────────────────────────
async function _claude(msg, sys, model, temp, maxTok) {
    const client = new sdk_1.default({ apiKey: env_js_1.env.ANTHROPIC_API_KEY });
    const r = await client.messages.create({
        model, max_tokens: maxTok, temperature: temp,
        system: sys,
        messages: [{ role: 'user', content: msg }],
    });
    const text = r.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    return { text, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
}
async function _openai(msg, sys, model, temp, maxTok) {
    const { data } = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
        model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }],
        max_tokens: maxTok,
        temperature: temp,
    }, { headers: { Authorization: `Bearer ${env_js_1.env.OPENAI_API_KEY}` }, timeout: 60_000 });
    return {
        text: data.choices?.[0]?.message?.content ?? '',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
    };
}
async function _gemini(msg, sys, model, temp, maxTok) {
    const { data } = await axios_1.default.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env_js_1.env.GEMINI_API_KEY}`, {
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: msg }] }],
        generationConfig: { maxOutputTokens: maxTok, temperature: temp },
    }, { timeout: 60_000 });
    return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
}
async function _groq(msg, sys, model, temp, maxTok) {
    const { data } = await axios_1.default.post('https://api.groq.com/openai/v1/chat/completions', {
        model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }],
        max_tokens: maxTok,
        temperature: temp,
    }, { headers: { Authorization: `Bearer ${env_js_1.env.GROQ_API_KEY}` }, timeout: 30_000 });
    return {
        text: data.choices?.[0]?.message?.content ?? '',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
    };
}
// ── Main unified call (with fallback + timeout) ───────────────────────────────
async function callProvider(config, userMessage, systemPrompt, timeoutMs, testOptions) {
    const t0 = Date.now();
    let provider = config.provider;
    let model = config.model;
    let usedFallback = false;
    const forcedDown = testOptions?.forceUnavailable ?? [];
    // isAvailableEff: respects both real availability and forced-down list
    const isAvailableEff = (p) => !forcedDown.includes(p) && isAvailable(p);
    // Resolve provider availability
    if (!isAvailableEff(provider)) {
        const fb = config.fallback ?? 'claude';
        if (isAvailableEff(fb)) {
            console.log(`[provider-mgr] ${provider} unavail → fallback ${fb}${forcedDown.includes(provider) ? ' [forced-down]' : ''}`);
            provider = fb;
            model = defaultModel(fb);
            usedFallback = true;
        }
        else if (isAvailableEff('claude')) {
            console.log(`[provider-mgr] ${provider} + ${config.fallback ?? 'none'} unavail → claude${forcedDown.includes(provider) ? ' [forced-down]' : ''}`);
            provider = 'claude';
            model = defaultModel('claude');
            usedFallback = true;
        }
        else {
            throw new Error(`[provider-mgr] No LLM available (wanted: ${config.provider})`);
        }
    }
    // Timeout wrapper
    const withTimeout = (p) => Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`provider timeout ${timeoutMs}ms`)), timeoutMs)),
    ]);
    const callForProvider = (p) => {
        switch (p) {
            case 'claude': return withTimeout(_claude(userMessage, systemPrompt, model, config.temperature, config.maxTokens));
            case 'openai': return withTimeout(_openai(userMessage, systemPrompt, model, config.temperature, config.maxTokens));
            case 'gemini': return withTimeout(_gemini(userMessage, systemPrompt, model, config.temperature, config.maxTokens));
            case 'groq': return withTimeout(_groq(userMessage, systemPrompt, model, config.temperature, config.maxTokens));
        }
    };
    let r;
    try {
        r = await callForProvider(provider);
    }
    catch (primaryErr) {
        // Runtime error (429, network, etc.) — try fallback even if primary was "available"
        const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        const is429 = errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('quota');
        const fb = config.fallback ?? 'claude';
        if (fb !== provider && isAvailableEff(fb)) {
            console.warn(`[provider-mgr] ${provider} RUNTIME ERR (${errMsg.slice(0, 60)}) → fallback ${fb}`);
            provider = fb;
            model = defaultModel(fb);
            usedFallback = true;
            r = await callForProvider(provider);
        }
        else if (is429 && isAvailableEff('claude') && provider !== 'claude') {
            console.warn(`[provider-mgr] ${provider} 429 → hard fallback claude`);
            provider = 'claude';
            model = defaultModel('claude');
            usedFallback = true;
            r = await callForProvider(provider);
        }
        else {
            throw primaryErr;
        }
    }
    const latencyMs = Date.now() - t0;
    const costEstUsd = estimateCost(provider, r.inputTokens, r.outputTokens);
    console.log(`[provider-mgr] ${provider}/${model} ✅ ` +
        `len=${r.text.length} in=${r.inputTokens} out=${r.outputTokens} ` +
        `${latencyMs}ms $${costEstUsd.toFixed(6)}` +
        (usedFallback ? ` [fallback from ${config.provider}]` : ''));
    return { ...r, latencyMs, provider, model, usedFallback, costEstUsd };
}
//# sourceMappingURL=provider-manager.js.map