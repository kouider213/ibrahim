"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGroqVision = callGroqVision;
exports.callGroq = callGroq;
exports.callGemini = callGemini;
exports.callOpenAI = callOpenAI;
exports.callOpenAIVision = callOpenAIVision;
exports.callClaudeVision = callClaudeVision;
exports.classifyRequest = classifyRequest;
exports.isGroqAvailable = isGroqAvailable;
exports.isOpenAIAvailable = isOpenAIAvailable;
exports.isGeminiAvailable = isGeminiAvailable;
exports.isClaudeAvailable = isClaudeAvailable;
/**
 * LLM Router — Phase 2
 * Groq (fast/simple) → Claude (agentic/tools) → OpenAI / Gemini (fallback)
 */
const constants_js_1 = require("../config/constants.js");
const GROQ_KEY = process.env['GROQ_API_KEY'];
const OPENAI_KEY = process.env['OPENAI_API_KEY'];
const GEMINI_KEY = process.env['GEMINI_API_KEY'];
// ── Keywords that signal tools are required ──────────────────────────────────
const TOOL_KEYWORDS = /réservation|reserv|booking|location|voiture|client|facture|paiement|caisse|finance|météo|news|agenda|calendrier|github|deploy|railway|code|script|whatsapp|telegram|mémoire|souvien|rappelle|mémo|tiktok|vidéo|image|photo|pdf|document|contrat|passep|paseport|pasport|passport|permis|permi|identit|envoie|envoi|envo\b/i;
// ── Long-context keywords → Gemini (1M token window) ─────────────────────────
const LONG_CONTEXT_KEYWORDS = /analyse (ce|cet|ce long|tout ce|l'ensemble)|résume (ce|cet|tout)|lis (ce|cet|tout le)|compare (ces|les deux|plusieurs)/i;
// ── Simple non-tool queries → Groq fast path ─────────────────────────────────
const SIMPLE_GREET = /^(bonjour|salut|hello|hi|hey|bonsoir|salam|coucou|yo|wesh)[\s!?.]*$/i;
const SIMPLE_QUERY = /^(comment (ça|ca) va|ça va|ca va|tu vas bien|quoi de neuf|what'?s up|merci|ok|oui|non|yes|no|d'?accord|parfait|super|gg|bravo)[\s!?.]*$/i;
const SIMPLE_WHOAMI = /^(qui es[- ]tu|c'est quoi dzaryx|présente[- ]toi|dis[- ]moi qui tu es|tu t'appelles comment)[\s!?.]*$/i;
function classifyRequest(text, hasImage, messageCount) {
    // Vision: Gemini Flash first (cheaper, 1M context), OpenAI Vision fallback
    if (hasImage) {
        return GEMINI_KEY
            ? { provider: 'gemini', fallback: OPENAI_KEY ? 'openai' : 'claude', fastPath: true, reason: 'image/vision-gemini' }
            : { provider: 'claude', fallback: 'gemini', fastPath: false, reason: 'image/vision' };
    }
    // Business tools keywords → Claude agentic loop
    if (TOOL_KEYWORDS.test(text)) {
        return { provider: 'claude', fallback: 'openai', fastPath: false, reason: 'tools required' };
    }
    // Very long messages + long-context keywords → Gemini (1M token window, cheap)
    if (text.length > 2000 && GEMINI_KEY && LONG_CONTEXT_KEYWORDS.test(text)) {
        return { provider: 'gemini', fallback: 'claude', fastPath: true, reason: 'long context' };
    }
    // Long messages → Claude (complex reasoning likely needed)
    if (text.length > 300) {
        return { provider: 'claude', fallback: OPENAI_KEY ? 'openai' : 'gemini', fastPath: false, reason: 'long message' };
    }
    // Short messages (≤ 100 chars, no tools needed) → cheap provider FIRST
    // EXCEPT: numeric replies (phone, price, age) in ongoing conversations need the agentic loop
    if (text.length <= 100) {
        const isNumericReply = /^[\+\d][\d\s\-().]{2,}$/.test(text.trim()) || /^\d+\s*(ans?|€|\$|eur|dzd|jours?|km)?$/i.test(text.trim());
        if (messageCount > 2 && isNumericReply) {
            return { provider: 'claude', fallback: OPENAI_KEY ? 'openai' : 'gemini', fastPath: false, reason: 'numeric reply in conversation' };
        }
        if (GROQ_KEY)
            return { provider: 'groq', fallback: 'claude', fastPath: true, reason: 'short/groq-first' };
        if (GEMINI_KEY)
            return { provider: 'gemini', fallback: 'claude', fastPath: true, reason: 'short/gemini-first' };
    }
    // Multi-turn conversation context → Claude (has memory/context)
    if (messageCount > 2) {
        return { provider: 'claude', fallback: OPENAI_KEY ? 'openai' : 'gemini', fastPath: false, reason: 'conversation context' };
    }
    // Simple greetings/chitchat → Groq if available (ultra-fast, no tools needed)
    if (GROQ_KEY && (SIMPLE_GREET.test(text) || SIMPLE_QUERY.test(text) || SIMPLE_WHOAMI.test(text))) {
        return { provider: 'groq', fallback: 'claude', fastPath: true, reason: 'simple greeting' };
    }
    // Default: Claude with full agentic loop
    const fallback = OPENAI_KEY ? 'openai' : GEMINI_KEY ? 'gemini' : 'claude';
    return { provider: 'claude', fallback, fastPath: false, reason: 'default' };
}
// ── Groq Vision (Llama 4 Scout — vision-capable, free tier) ─────────────────
// llama-3.2-11b-vision-preview was decommissioned by Groq (April 2025)
async function callGroqVision(userMessage, systemExtra, imageBase64, imageMime = 'image/jpeg', skipBasePrompt = false) {
    if (!GROQ_KEY)
        throw new Error('GROQ_API_KEY not configured');
    const systemPrompt = skipBasePrompt
        ? (systemExtra ?? '')
        : [constants_js_1.Dzaryx.SYSTEM_PROMPT, systemExtra ?? ''].filter(Boolean).join('\n\n');
    const userContent = [];
    if (imageBase64) {
        userContent.push({ type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } });
    }
    userContent.push({ type: 'text', text: userMessage });
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const { data } = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        max_tokens: 1024,
        temperature: 0.2,
    }, { headers: { Authorization: `Bearer ${GROQ_KEY}` }, timeout: 30_000 });
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text)
        throw new Error('Groq Vision returned empty response');
    console.log(`[groq-vision] ✅ ${text.length} chars`);
    return text;
}
// ── Groq (OpenAI-compatible API, LLaMA 3.3 70B) ──────────────────────────────
async function callGroq(userMessage, systemExtra) {
    if (!GROQ_KEY)
        throw new Error('GROQ_API_KEY not configured');
    const systemPrompt = [constants_js_1.Dzaryx.SYSTEM_PROMPT, systemExtra ?? ''].filter(Boolean).join('\n\n');
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const { data } = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        max_tokens: 512,
        temperature: 0.7,
    }, { headers: { Authorization: `Bearer ${GROQ_KEY}` }, timeout: 12_000 });
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text)
        throw new Error('Groq returned empty response');
    console.log(`[groq] ✅ ${text.length} chars`);
    return text;
}
// ── Gemini 1.5 Flash (Google AI, long context + vision) ──────────────────────
async function callGemini(userMessage, systemExtra, imageBase64, imageMime = 'image/jpeg') {
    if (!GEMINI_KEY)
        throw new Error('GEMINI_API_KEY not configured');
    const systemPrompt = [constants_js_1.Dzaryx.SYSTEM_PROMPT, systemExtra ?? ''].filter(Boolean).join('\n\n');
    // Build parts — image MUST come before text for Gemini multimodal
    const parts = [];
    if (imageBase64) {
        parts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
        parts.push({ text: userMessage });
    }
    else {
        parts.push({ text: `${systemPrompt}\n\nUtilisateur: ${userMessage}` });
    }
    const requestBody = {
        contents: [{ role: 'user', parts }],
    };
    // Use systemInstruction for vision requests (avoids stuffing system into user turn)
    if (imageBase64) {
        requestBody['systemInstruction'] = { parts: [{ text: systemPrompt }] };
    }
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
    let lastErr = '';
    for (const model of GEMINI_MODELS) {
        try {
            const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, requestBody, { timeout: 30_000 });
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (!text)
                throw new Error(`${model} empty response`);
            console.log(`[gemini/${model}] ✅ ${text.length} chars`);
            return text;
        }
        catch (err) {
            const status = err.response?.status;
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
async function callOpenAI(messages, systemExtra) {
    if (!OPENAI_KEY)
        throw new Error('OPENAI_API_KEY not configured');
    const systemPrompt = [
        constants_js_1.Dzaryx.SYSTEM_PROMPT,
        systemExtra ?? '',
        '⚠️ Mode dégradé: certains outils ne sont pas disponibles dans cette réponse.',
    ].filter(Boolean).join('\n\n');
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const { data } = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 2048,
        temperature: 0.7,
    }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 30_000 });
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text)
        throw new Error('OpenAI returned empty response');
    console.log(`[openai-fallback] ✅ ${text.length} chars`);
    return text;
}
// ── OpenAI GPT-4o Vision (image fallback when Gemini Vision fails) ────────────
async function callOpenAIVision(userMessage, systemExtra, imageBase64, imageMime = 'image/jpeg') {
    if (!OPENAI_KEY)
        throw new Error('OPENAI_API_KEY not configured');
    const systemPrompt = [constants_js_1.Dzaryx.SYSTEM_PROMPT, systemExtra ?? ''].filter(Boolean).join('\n\n');
    const userContent = [];
    if (imageBase64) {
        userContent.push({ type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } });
    }
    userContent.push({ type: 'text', text: userMessage });
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const { data } = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        max_tokens: 2048,
        temperature: 0.7,
    }, { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 30_000 });
    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text)
        throw new Error('OpenAI Vision returned empty response');
    console.log(`[openai-vision] ✅ ${text.length} chars`);
    return text;
}
// ── Claude Vision (lightweight, no tool loop — fallback when Gemini+OpenAI fail) ─
const ANTHROPIC_KEY = process.env['ANTHROPIC_API_KEY'];
async function callClaudeVision(userMessage, systemExtra, imageBase64, imageMime = 'image/jpeg', skipBasePrompt = false) {
    if (!ANTHROPIC_KEY)
        throw new Error('ANTHROPIC_API_KEY not configured');
    const systemPrompt = skipBasePrompt
        ? (systemExtra ?? '')
        : [constants_js_1.Dzaryx.SYSTEM_PROMPT, systemExtra ?? ''].filter(Boolean).join('\n\n');
    const SAFE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    const safeMedia = (SAFE_MIMES.has(imageMime) ? imageMime : 'image/jpeg');
    const userContent = [];
    if (imageBase64) {
        userContent.push({ type: 'image', source: { type: 'base64', media_type: safeMedia, data: imageBase64 } });
    }
    userContent.push({ type: 'text', text: userMessage });
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const { data } = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
    }, {
        headers: {
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
        timeout: 30_000,
    });
    const text = data.content?.[0]?.text ?? '';
    if (!text)
        throw new Error('Claude Vision returned empty response');
    console.log(`[claude-vision] ✅ ${text.length} chars`);
    return text;
}
function isGroqAvailable() { return !!GROQ_KEY; }
function isOpenAIAvailable() { return !!OPENAI_KEY; }
function isGeminiAvailable() { return !!GEMINI_KEY; }
function isClaudeAvailable() { return !!ANTHROPIC_KEY; }
//# sourceMappingURL=llm-router.js.map