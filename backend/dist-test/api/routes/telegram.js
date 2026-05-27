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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const telegram_js_1 = require("../../integrations/telegram.js");
const claude_api_js_1 = require("../../integrations/claude-api.js");
const context_builder_js_1 = require("../../conversation/context-builder.js");
const supabase_js_1 = require("../../integrations/supabase.js");
const auth_js_1 = require("../middleware/auth.js");
const approval_store_js_1 = require("../../marketing/approval-store.js");
const nexus_relay_js_1 = require("../../actions/handlers/nexus-relay.js");
const nexus_nl_router_js_1 = require("../../actions/handlers/nexus-nl-router.js");
const nexus_vision_loop_js_1 = require("../../actions/handlers/nexus-vision-loop.js");
const nexus_memory_js_1 = require("../../actions/handlers/nexus-memory.js");
const create_marketing_video_js_1 = require("../../marketing/create-marketing-video.js");
const social_poster_js_1 = require("../../marketing/social-poster.js");
const video_buffer_js_1 = require("../../marketing/video-buffer.js");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const env_js_1 = require("../../config/env.js");
const orchestrator_engine_js_1 = require("../../orchestrator/orchestrator-engine.js");
const document_mask_js_1 = require("../../security/document-mask.js");
const document_access_log_js_1 = require("../../security/document-access-log.js");
const llm_router_js_1 = require("../../integrations/llm-router.js");
const router = (0, express_1.Router)();
const BUCKET = 'client-documents';
const anthropic = new sdk_1.default({ apiKey: env_js_1.env.ANTHROPIC_API_KEY });
// ── AI Router helpers — Gemini first, Claude fallback ──────────────────────────
// Vision: Gemini Flash Vision primary, OpenAI Vision fallback — never Anthropic direct
async function callVisionGemini(base64, mimeType, systemExtra, userPrompt, _maxTokens = 2048) {
    if ((0, llm_router_js_1.isGeminiAvailable)()) {
        try {
            const text = await (0, llm_router_js_1.callGemini)(userPrompt, systemExtra, base64, mimeType);
            console.log(`[AI_ROUTER] task=vision provider=gemini fallback_reason=primary`);
            return text;
        }
        catch (gErr) {
            const _gAxErr = gErr;
            console.warn(`[AI_ROUTER] task=vision provider=gemini FAILED status=${_gAxErr.response?.status ?? 'network'} body=${JSON.stringify(_gAxErr.response?.data ?? {}).slice(0, 150)} msg="${_gAxErr.message ?? ''}" — trying openai`);
        }
    }
    if ((0, llm_router_js_1.isOpenAIAvailable)()) {
        try {
            const text = await (0, llm_router_js_1.callOpenAIVision)(userPrompt, systemExtra, base64, mimeType);
            console.log(`[AI_ROUTER] task=vision provider=openai fallback_reason=gemini_failed`);
            return text;
        }
        catch (oErr) {
            const _oAxErr = oErr;
            console.warn(`[AI_ROUTER] task=vision provider=openai FAILED status=${_oAxErr.response?.status ?? 'network'} body=${JSON.stringify(_oAxErr.response?.data ?? {}).slice(0, 150)} — all vision providers exhausted`);
        }
    }
    // Claude Vision fallback — Haiku (cheap, supports images natively)
    if (env_js_1.env.ANTHROPIC_API_KEY) {
        try {
            const r = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: _maxTokens,
                system: systemExtra,
                messages: [{
                        role: 'user',
                        content: [
                            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
                            { type: 'text', text: userPrompt },
                        ],
                    }],
            });
            console.log('[AI_ROUTER] task=vision provider=claude-haiku fallback_reason=gemini+openai_failed');
            return r.content[0].text.trim();
        }
        catch (cErr) {
            console.error('[AI_ROUTER] task=vision provider=claude-haiku FAILED:', cErr instanceof Error ? cErr.message : cErr);
        }
    }
    console.error(`[AI_ROUTER] task=vision ALL_PROVIDERS_FAILED gemini=${(0, llm_router_js_1.isGeminiAvailable)()} openai=${(0, llm_router_js_1.isOpenAIAvailable)()} anthropic=${!!env_js_1.env.ANTHROPIC_API_KEY}`);
    throw new Error('Vision indisponible: Gemini, OpenAI et Claude ont tous échoué. Envoie une description textuelle à la place.');
}
// Simple text: Groq (free/fast) → Gemini → Haiku fallback
async function callTextWithFallback(prompt, maxTokens = 80) {
    if ((0, llm_router_js_1.isGroqAvailable)()) {
        try {
            const t = await (0, llm_router_js_1.callGroq)(prompt);
            console.log('[AI_ROUTER] provider=groq task=text');
            return t;
        }
        catch { }
    }
    if ((0, llm_router_js_1.isGeminiAvailable)()) {
        try {
            const t = await (0, llm_router_js_1.callGemini)(prompt);
            console.log('[AI_ROUTER] provider=gemini task=text');
            return t;
        }
        catch { }
    }
    console.log('[AI_ROUTER] provider=claude-haiku task=text fallback=true');
    const r = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
    });
    return r.content[0].text.trim();
}
// chatWithTools with Groq → OpenAI → Gemini fallback when Claude fails
async function chatWithFallback(messages, systemExtra, userText, sessionId) {
    try {
        return await (0, claude_api_js_1.chatWithTools)(messages, systemExtra, sessionId);
    }
    catch (claudeErr) {
        console.warn(`[AI_ROUTER] provider=claude status=failed reason="${claudeErr instanceof Error ? claudeErr.message.slice(0, 60) : 'unknown'}" session=${sessionId}`);
        const plain = messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));
        if ((0, llm_router_js_1.isGroqAvailable)()) {
            try {
                const t = await (0, llm_router_js_1.callGroq)(userText, systemExtra);
                console.log(`[AI_ROUTER] provider=groq fallback=true`);
                return { text: t };
            }
            catch { }
        }
        if ((0, llm_router_js_1.isOpenAIAvailable)()) {
            try {
                const t = await (0, llm_router_js_1.callOpenAI)(plain, systemExtra);
                console.log(`[AI_ROUTER] provider=openai fallback=true`);
                return { text: t };
            }
            catch { }
        }
        if ((0, llm_router_js_1.isGeminiAvailable)()) {
            try {
                const t = await (0, llm_router_js_1.callGemini)(userText, systemExtra);
                console.log(`[AI_ROUTER] provider=gemini fallback=true`);
                return { text: t };
            }
            catch { }
        }
        throw claudeErr;
    }
}
// ── Incoming request dedup — blocks identical text sent twice within 30 s ────
// Applied BEFORE buildContext / Claude API / any tool — no second résumé/report.
const _incomingDedupeMap = new Map();
const INCOMING_DEDUPE_TTL = 30_000; // 30 seconds
function checkIncomingDuplicate(chatId, text, messageId) {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    const key = `${chatId}:${normalized.slice(0, 120)}`;
    const now = Date.now();
    const last = _incomingDedupeMap.get(key);
    if (last && now - last < INCOMING_DEDUPE_TTL) {
        console.log(`[incoming-dedupe] blocked=true key="${key.slice(0, 60)}" messageId=${messageId} age=${now - last}ms`);
        return true;
    }
    _incomingDedupeMap.set(key, now);
    // Cleanup stale entries every 100 insertions
    if (_incomingDedupeMap.size > 200) {
        for (const [k, ts] of _incomingDedupeMap) {
            if (now - ts > INCOMING_DEDUPE_TTL * 2)
                _incomingDedupeMap.delete(k);
        }
    }
    console.log(`[incoming-dedupe] allowed=true key="${key.slice(0, 60)}" messageId=${messageId}`);
    return false;
}
// Cloudinary import dynamique (CommonJS compatible)
let cloudinary;
let _cloudinaryReady = false;
const _cloudinaryInit = (async () => {
    const { v2 } = await Promise.resolve().then(() => __importStar(require('cloudinary')));
    const { env: e } = await Promise.resolve().then(() => __importStar(require('../../config/env.js')));
    cloudinary = v2;
    cloudinary.config({
        cloud_name: e.CLOUDINARY_CLOUD_NAME ?? '',
        api_key: e.CLOUDINARY_API_KEY ?? '',
        api_secret: e.CLOUDINARY_API_SECRET ?? '',
        secure: true,
    });
    _cloudinaryReady = true;
})().catch(err => console.error('[telegram] Cloudinary init failed:', err));
function isAllowed(chatId) {
    const allowed = env_js_1.env.TELEGRAM_ALLOWED_CHATS ?? '';
    if (!allowed)
        return true;
    return allowed.split(',').map(s => s.trim()).includes(String(chatId));
}
// Mots-clés qui indiquent explicitement qu'on veut enregistrer un document
const STORE_KEYWORDS = /passport|passeport|permis|license|licence|contrat|contract|enregistre|sauvegarde|stocke|store/i;
// POST /api/telegram/webhook
router.post('/webhook', async (req, res) => {
    // Verify Telegram secret token to reject forged requests
    const incoming = req.headers['x-telegram-bot-api-secret-token'];
    if (!env_js_1.env.WEBHOOK_SECRET || incoming !== env_js_1.env.WEBHOOK_SECRET) {
        res.sendStatus(403);
        return;
    }
    res.sendStatus(200);
    const update = req.body;
    const msg = update.message;
    if (!msg)
        return;
    const chatId = msg.chat.id;
    const sessionId = `telegram_${chatId}`;
    if (!isAllowed(chatId)) {
        await (0, telegram_js_1.sendMessage)(chatId, '❌ Accès non autorisé.');
        return;
    }
    // /start
    if (msg.text?.startsWith('/start')) {
        await (0, telegram_js_1.sendMessage)(chatId, `Salam Kouider ! Je suis Dzaryx 🚗\n\nEnvoie-moi:\n📸 Photo → je l'analyse et modifie\n🎥 Vidéo → je la découpe, optimise, sous-titre\n💬 Message → je réponds à tout\n\nTape /help pour voir toutes mes commandes.`);
        return;
    }
    // /help
    if (msg.text?.startsWith('/help')) {
        await (0, telegram_js_1.sendMessage)(chatId, `🤖 *Dzaryx — Commandes disponibles*\n\n` +
            `*📋 RÉSERVATIONS*\n` +
            `"liste les réservations" — voir toutes les réservations\n` +
            `"crée une réservation pour [client] du [date] au [date]"\n` +
            `"annule la réservation de [client]"\n` +
            `"état de la flotte" — quelles voitures sont dispo/louées\n\n` +
            `*💰 FINANCES*\n` +
            `"rapport financier" — CA du mois\n` +
            `"qui a pas payé" — réservations impayées\n` +
            `"enregistre un paiement de X€ pour [client]"\n` +
            `"génère le bon de réservation pour [client]"\n\n` +
            `*📸 PHOTOS & VIDÉOS*\n` +
            `Envoie une photo → analyse automatique\n` +
            `Envoie photo + "passeport" → OCR + stockage\n` +
            `Envoie une vidéo → traitement Cloudinary\n` +
            `"fais une vidéo TikTok pour [voiture]"\n` +
            `"génère une image IA de [description]"\n` +
            `"anime la photo de [voiture]"\n\n` +
            `*📅 CALENDRIER*\n` +
            `"synchronise le calendrier"\n` +
            `"prochains événements agenda"\n\n` +
            `*🔍 INFORMATIONS*\n` +
            `"météo Oran" — météo en temps réel\n` +
            `"qui n'a pas rendu la voiture" — retards\n` +
            `"regarde les concurrents TikTok"\n\n` +
            `*✅ APPROBATION VIDÉO*\n` +
            `\`Oke\` → publier la vidéo en attente\n` +
            `\`Non\` → annuler la vidéo en attente\n\n` +
            `*🔧 DIAGNOSTICS*\n` +
            `/health — état de tous les services\n` +
            `/capabilities — fonctions disponibles\n` +
            `/selftest — tests réels (Supabase, météo...)\n` +
            `/test_fal_light — vérifie clé fal.ai sans générer (rapide)\n` +
            `/test_fal — vrai test génération vidéo fal.ai (~120s)\n` +
            `/test_replicate — vrai test génération image Replicate (~30s)\n` +
            `/test_ai — diagnostic light clé + auth (sans génération)\n\n` +
            `*🖥️ NEXUS OPERATOR MODE*\n` +
            `/tasks — dernières tâches vision\n` +
            `/memory — workflows mémorisés\n` +
            `/providers — stats providers IA\n` +
            `/visionstats — taux succès vision\n` +
            `/abort — arrêt d'urgence vision\n` +
            `/workflow <objectif> — détails workflow`);
        return;
    }
    // /health
    if (msg.text?.startsWith('/health')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const checks = [];
        checks.push({ name: 'Telegram', ok: true });
        try {
            const { error } = await supabase_js_1.supabase.from('bookings').select('id').limit(1);
            checks.push({ name: 'Supabase', ok: !error, note: error?.message });
        }
        catch {
            checks.push({ name: 'Supabase', ok: false, note: 'ping échoué' });
        }
        checks.push({ name: 'ElevenLabs TTS', ok: Boolean(env_js_1.env.ELEVENLABS_API_KEY && env_js_1.env.ELEVENLABS_VOICE_ID), note: env_js_1.env.ELEVENLABS_API_KEY ? undefined : 'clé manquante' });
        const clOk = Boolean(env_js_1.env.CLOUDINARY_CLOUD_NAME && env_js_1.env.CLOUDINARY_API_KEY && env_js_1.env.CLOUDINARY_API_SECRET);
        checks.push({ name: 'Cloudinary', ok: clOk, note: clOk ? undefined : '3 variables manquantes' });
        checks.push({ name: 'Google Calendar', ok: Boolean(env_js_1.env.GOOGLE_SERVICE_ACCOUNT_JSON), note: env_js_1.env.GOOGLE_SERVICE_ACCOUNT_JSON ? undefined : 'GOOGLE_SERVICE_ACCOUNT_JSON manquant' });
        const twOk = Boolean(env_js_1.env.TWILIO_ACCOUNT_SID && env_js_1.env.TWILIO_AUTH_TOKEN && env_js_1.env.TWILIO_WHATSAPP_FROM);
        checks.push({ name: 'WhatsApp Twilio', ok: twOk, note: twOk ? undefined : 'Variables Twilio manquantes' });
        const pvOk = Boolean(env_js_1.env.PUSHOVER_USER_KEY && env_js_1.env.PUSHOVER_APP_TOKEN);
        checks.push({ name: 'Pushover', ok: pvOk, note: pvOk ? undefined : 'Pushover vars manquantes' });
        checks.push({ name: 'GitHub', ok: Boolean(env_js_1.env.GITHUB_TOKEN), note: env_js_1.env.GITHUB_TOKEN ? undefined : 'GITHUB_TOKEN manquant' });
        checks.push({ name: 'fal.ai (Kling IA)', ok: Boolean(env_js_1.env.FAL_KEY), note: env_js_1.env.FAL_KEY ? undefined : 'FAL_KEY manquant' });
        checks.push({ name: 'Replicate (Flux.1)', ok: Boolean(env_js_1.env.REPLICATE_API_TOKEN), note: env_js_1.env.REPLICATE_API_TOKEN ? undefined : 'REPLICATE_API_TOKEN manquant' });
        checks.push({ name: 'Pexels', ok: Boolean(env_js_1.env.PEXELS_API_KEY), note: env_js_1.env.PEXELS_API_KEY ? undefined : 'PEXELS_API_KEY manquant' });
        const tkOk = Boolean(env_js_1.env.TIKTOK_ACCESS_TOKEN && env_js_1.env.TIKTOK_OPEN_ID);
        checks.push({ name: 'TikTok API', ok: tkOk, note: tkOk ? undefined : 'Tokens TikTok manquants' });
        const ok = checks.filter(c => c.ok).length;
        const lines = checks.map(c => `${c.ok ? '🟢' : '🔴'} *${c.name}*${c.note ? ` — ${c.note}` : ''}`);
        await (0, telegram_js_1.sendMessage)(chatId, `🏥 *DZARYX HEALTH CHECK*\n\n${lines.join('\n')}\n\n_${ok}/${checks.length} services opérationnels_`);
        return;
    }
    // /capabilities
    if (msg.text?.startsWith('/capabilities')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const has = (v) => Boolean(v);
        // Live auth check — POST {} to fal.ai queue (422 = key valid, no generation started)
        let falOk = false;
        let falNote = 'FAL_KEY manquant';
        if (env_js_1.env.FAL_KEY) {
            try {
                const { default: ax } = await Promise.resolve().then(() => __importStar(require('axios')));
                const r = await ax.post('https://queue.fal.run/fal-ai/kling-video/v1.6/standard/text-to-video', {}, { headers: { Authorization: `Key ${env_js_1.env.FAL_KEY}`, 'Content-Type': 'application/json' }, timeout: 10_000, validateStatus: () => true });
                falOk = r.status === 422 || r.status === 200 || r.status === 201 || r.status === 202;
                falNote = falOk ? 'clé valide' : (r.status === 401 || r.status === 403 ? `clé invalide (${r.status})` : `HTTP ${r.status}`);
            }
            catch {
                falNote = 'erreur réseau';
            }
        }
        // Live auth check — GET /v1/account on Replicate (no generation)
        let repOk = false;
        let repNote = 'REPLICATE_API_TOKEN manquant';
        if (env_js_1.env.REPLICATE_API_TOKEN) {
            try {
                const { default: ax } = await Promise.resolve().then(() => __importStar(require('axios')));
                const r = await ax.get('https://api.replicate.com/v1/account', {
                    headers: { Authorization: `Bearer ${env_js_1.env.REPLICATE_API_TOKEN}` },
                    timeout: 10_000,
                    validateStatus: () => true,
                });
                repOk = r.status === 200;
                repNote = repOk ? 'token valide' : (r.status === 401 ? 'token invalide (401)' : `HTTP ${r.status}`);
            }
            catch {
                repNote = 'erreur réseau';
            }
        }
        const feats = [
            { n: 'Chat IA + mémoire permanente', ok: true },
            { n: 'Réservations + flotte', ok: true },
            { n: 'Finances + impayés + rapport CA', ok: true },
            { n: 'Bon de réservation PDF', ok: true },
            { n: 'OCR passeport / permis', ok: true },
            { n: 'Documents clients (stockage + recherche)', ok: true },
            { n: 'Rappels personnalisés (BullMQ)', ok: true },
            { n: 'Météo + actualités', ok: true },
            { n: 'Web search + fetch URL', ok: true },
            { n: 'Code Agent autonome', ok: has(env_js_1.env.GITHUB_TOKEN) },
            { n: 'Google Calendar sync', ok: has(env_js_1.env.GOOGLE_SERVICE_ACCOUNT_JSON) },
            { n: 'ElevenLabs voix (TTS)', ok: has(env_js_1.env.ELEVENLABS_API_KEY) },
            { n: 'Vidéo TikTok FFmpeg (local)', ok: has(env_js_1.env.ELEVENLABS_API_KEY) },
            { n: 'Traitement image/vidéo (Cloudinary)', ok: Boolean(env_js_1.env.CLOUDINARY_CLOUD_NAME && env_js_1.env.CLOUDINARY_API_KEY && env_js_1.env.CLOUDINARY_API_SECRET) },
            { n: `Vidéo IA Kling (fal.ai) — ${falNote}`, ok: falOk },
            { n: `Image IA Flux.1 (Replicate) — ${repNote}`, ok: repOk },
            { n: 'Recherche images Pexels', ok: has(env_js_1.env.PEXELS_API_KEY) },
            { n: 'WhatsApp clients (Twilio)', ok: Boolean(env_js_1.env.TWILIO_ACCOUNT_SID && env_js_1.env.TWILIO_AUTH_TOKEN && env_js_1.env.TWILIO_WHATSAPP_FROM) },
            { n: 'Publication TikTok automatique', ok: Boolean(env_js_1.env.TIKTOK_ACCESS_TOKEN && env_js_1.env.TIKTOK_OPEN_ID) },
            { n: 'SQL SELECT Supabase', ok: has(env_js_1.env.SUPABASE_ACCESS_TOKEN) },
        ];
        const ready = feats.filter(f => f.ok);
        const missing = feats.filter(f => !f.ok);
        const capMsg = `⚡ *DZARYX CAPABILITIES — ${ready.length}/${feats.length}*\n\n✅ *Opérationnel*\n${ready.map(f => `  • ${f.n}`).join('\n')}\n\n❌ *Non configuré ou invalide*\n${missing.map(f => `  • ${f.n}`).join('\n')}\n\n_Note: fal.ai ✅ = auth clé OK. Génération vidéo réelle → /test\\_fal_`;
        await (0, telegram_js_1.sendMessage)(chatId, capMsg);
        return;
    }
    // /selftest
    if (msg.text?.startsWith('/selftest')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        await (0, telegram_js_1.sendMessage)(chatId, '🧪 *Self-test Dzaryx...*\n_Tests réels en cours._');
        const res = [];
        // Supabase bookings
        try {
            const { data, error } = await supabase_js_1.supabase.from('bookings').select('id').limit(1);
            res.push({ t: 'Supabase bookings', ok: !error, d: error?.message ?? `accessible (${data?.length ?? 0} ligne)` });
        }
        catch (e) {
            res.push({ t: 'Supabase bookings', ok: false, d: String(e) });
        }
        // Supabase cars
        try {
            const { data, error } = await supabase_js_1.supabase.from('cars').select('id, name').limit(3);
            res.push({ t: 'Supabase cars', ok: !error && (data?.length ?? 0) > 0, d: error?.message ?? `${data?.length ?? 0} voiture(s)` });
        }
        catch (e) {
            res.push({ t: 'Supabase cars', ok: false, d: String(e) });
        }
        // Mémoire
        try {
            const { error } = await supabase_js_1.supabase.from('ibrahim_memory').select('id').limit(1);
            res.push({ t: 'Table mémoire', ok: !error, d: error?.message ?? 'accessible' });
        }
        catch (e) {
            res.push({ t: 'Table mémoire', ok: false, d: String(e) });
        }
        // Météo Open-Meteo (sans clé API)
        try {
            const { default: ax } = await Promise.resolve().then(() => __importStar(require('axios')));
            const r = await ax.get('https://api.open-meteo.com/v1/forecast?latitude=35.7&longitude=-0.63&current=temperature_2m&timezone=Africa%2FAlgiers', { timeout: 8000 });
            const temp = r.data?.current?.temperature_2m;
            res.push({ t: 'Météo API', ok: temp !== undefined, d: temp !== undefined ? `${temp}°C Oran` : 'Pas de réponse' });
        }
        catch (e) {
            res.push({ t: 'Météo API', ok: false, d: e instanceof Error ? e.message : String(e) });
        }
        // FFmpeg
        try {
            const { default: ffmpegStatic } = await Promise.resolve().then(() => __importStar(require('ffmpeg-static')));
            const bin = ffmpegStatic;
            res.push({ t: 'FFmpeg (vidéo)', ok: Boolean(bin), d: bin ?? 'ffmpeg-static absent' });
        }
        catch (e) {
            res.push({ t: 'FFmpeg (vidéo)', ok: false, d: String(e) });
        }
        // ElevenLabs config
        res.push({ t: 'ElevenLabs TTS', ok: Boolean(env_js_1.env.ELEVENLABS_API_KEY), d: env_js_1.env.ELEVENLABS_API_KEY ? `voix: ${env_js_1.env.ELEVENLABS_VOICE_ID}` : 'clé absente' });
        // Cloudinary config
        const clOk2 = Boolean(env_js_1.env.CLOUDINARY_CLOUD_NAME && env_js_1.env.CLOUDINARY_API_KEY && env_js_1.env.CLOUDINARY_API_SECRET);
        res.push({ t: 'Cloudinary', ok: clOk2, d: clOk2 ? `cloud: ${env_js_1.env.CLOUDINARY_CLOUD_NAME}` : '3 variables manquantes' });
        // Google Calendar
        res.push({ t: 'Google Calendar', ok: Boolean(env_js_1.env.GOOGLE_SERVICE_ACCOUNT_JSON), d: env_js_1.env.GOOGLE_SERVICE_ACCOUNT_JSON ? 'service account présent' : 'GOOGLE_SERVICE_ACCOUNT_JSON absent' });
        const passed = res.filter(r => r.ok).length;
        const lines = res.map(r => `${r.ok ? '✅' : '❌'} *${r.t}* — ${r.d}`);
        await (0, telegram_js_1.sendMessage)(chatId, `🧪 *RÉSULTATS SELF-TEST*\n\n${lines.join('\n')}\n\n_${passed}/${res.length} tests passés_`);
        return;
    }
    // /test_fal_light — vérifie clé + endpoint SANS lancer de génération
    // POST body vide → 422 = auth OK (input invalide, pas de job créé) — doit être avant /test_fal
    if (msg.text?.startsWith('/test_fal_light')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const falKey = env_js_1.env.FAL_KEY;
        if (!falKey) {
            await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — FAL\\_KEY manquant*\n\nVariable à ajouter dans Railway → Variables : \`FAL_KEY\`\n_Alias accepté : \`FAL_API_KEY\`_`);
            return;
        }
        await (0, telegram_js_1.sendMessage)(chatId, '🧪 *Test fal.ai light (sans génération)...*');
        try {
            const { default: ax } = await Promise.resolve().then(() => __importStar(require('axios')));
            const r = await ax.post('https://queue.fal.run/fal-ai/kling-video/v1.6/standard/text-to-video', {}, { headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' }, timeout: 15_000, validateStatus: () => true });
            const s = r.status;
            // 422 = input validation (auth passed, payload vide rejeté → aucun job lancé)
            // 200/201/202 = job créé (rare avec payload vide)
            if (s === 422 || s === 200 || s === 201 || s === 202) {
                await (0, telegram_js_1.sendMessage)(chatId, `✅ *fal.ai — Clé valide*\n\n• FAL\\_KEY : présent ✅\n• Endpoint Kling 1.6 : auth OK (HTTP ${s}) ✅\n• Aucun crédit consommé (payload vide)\n\n_Tape /test\\_fal pour un vrai test de génération._`);
            }
            else if (s === 401 || s === 403) {
                await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — Clé invalide (HTTP ${s})*\n\n• FAL\\_KEY : présent mais invalide ❌\n\nVérifie la valeur dans Railway → Variables.`);
            }
            else if (s === 404) {
                await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — Endpoint introuvable (404)*\n\n• Modèle Kling 1.6 peut avoir changé d'URL.`);
            }
            else if (s === 405) {
                await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — FAIL (HTTP 405 Method Not Allowed)*\n\n• L'endpoint rejette la méthode utilisée.\n• Ce n'est PAS OK — 405 ≠ succès.`);
            }
            else {
                await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — HTTP ${s}*\n\n• Réponse inattendue. Vérifie Railway logs.`);
            }
        }
        catch (e) {
            await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — Erreur réseau*\n\n• FAL\\_KEY : présent ✅\n• Erreur : ${e.message}`);
        }
        return;
    }
    // /test_fal — vrai test génération vidéo (~60-120s, crédits consommés)
    if (msg.text?.startsWith('/test_fal')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const falKey = env_js_1.env.FAL_KEY;
        if (!falKey) {
            await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — FAL\\_KEY manquant*\n\nVariable à ajouter dans Railway → Variables : \`FAL_KEY\``);
            return;
        }
        const MODEL = 'fal-ai/kling-video/v1.6/standard/text-to-video';
        await (0, telegram_js_1.sendMessage)(chatId, `🎬 *Test génération fal.ai*\n• Modèle : \`${MODEL}\`\n• Endpoint : queue.fal.run\n⏳ 60-120 secondes...`);
        try {
            const { default: ax } = await Promise.resolve().then(() => __importStar(require('axios')));
            // Step 1 — submit job, capture response_url + status_url provided by fal.ai
            let submitStatus = 0;
            let request_id = '';
            let response_url = '';
            let status_url = '';
            try {
                const submitResp = await ax.post(`https://queue.fal.run/${MODEL}`, { prompt: 'red sports car driving on a road, cinematic', duration: '5', aspect_ratio: '9:16' }, { headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' }, timeout: 30_000, validateStatus: () => true });
                submitStatus = submitResp.status;
                if (submitStatus < 200 || submitStatus >= 300) {
                    await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — Submit FAIL*\n\n• Étape : soumission job\n• URL : https://queue.fal.run/${MODEL}\n• HTTP : ${submitStatus}\n• Body : ${JSON.stringify(submitResp.data).slice(0, 200)}`);
                    return;
                }
                const d = submitResp.data;
                request_id = d.request_id ?? '';
                response_url = d.response_url ?? '';
                status_url = d.status_url ?? '';
            }
            catch (e) {
                await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — Submit erreur réseau*\n\n• ${e.message}`);
                return;
            }
            if (!request_id) {
                await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — Pas de request\\_id*\n\nLa soumission a réussi (HTTP ${submitStatus}) mais la réponse ne contient pas de request\\_id.`);
                return;
            }
            // Use URLs from fal.ai response — never construct (constructed URLs gave 405)
            const pollUrl = status_url || `https://queue.fal.run/${MODEL}/requests/${request_id}/status`;
            const resultUrl = response_url || `https://queue.fal.run/${MODEL}/requests/${request_id}`;
            // Step 2 — poll until COMPLETED (240s timeout, 6s interval)
            // HTTP 200 or 202 during polling = still in progress → continue
            // Only FAIL on 401/403/404/405/5xx or status=FAILED in body
            const TIMEOUT_MS = 240_000;
            const POLL_INTERVAL = 6_000;
            const startPoll = Date.now();
            let pollCount = 0;
            let videoUrl = null;
            let lastJobStatus = '';
            let pollFail = '';
            while (Date.now() - startPoll < TIMEOUT_MS) {
                await new Promise(r => setTimeout(r, POLL_INTERVAL));
                pollCount++;
                const elapsed = Math.round((Date.now() - startPoll) / 1000);
                const st = await ax.get(pollUrl, { headers: { Authorization: `Key ${falKey}` }, timeout: 15_000, validateStatus: () => true });
                const httpStatus = st.status;
                const body = st.data;
                const jobStatus = body?.status ?? body?.state ?? '';
                lastJobStatus = jobStatus || `HTTP ${httpStatus}`;
                console.log(`[test_fal] poll #${pollCount} — HTTP ${httpStatus} — status="${jobStatus}" — ${elapsed}s`);
                // Fatal HTTP errors — abort immediately
                if (httpStatus === 401 || httpStatus === 403) {
                    pollFail = `Auth rejetée (HTTP ${httpStatus}) — clé invalide`;
                    break;
                }
                if (httpStatus === 404) {
                    pollFail = `Endpoint introuvable (404)`;
                    break;
                }
                if (httpStatus === 405) {
                    pollFail = `Méthode rejetée (405)`;
                    break;
                }
                if (httpStatus >= 500) {
                    pollFail = `Erreur serveur fal.ai (HTTP ${httpStatus})`;
                    break;
                }
                // Job failure in body
                if (jobStatus === 'FAILED' || jobStatus === 'ERROR') {
                    pollFail = `Job échoué — status=${jobStatus}`;
                    break;
                }
                // Job complete — fetch result
                if (jobStatus === 'COMPLETED') {
                    const res = await ax.get(resultUrl, { headers: { Authorization: `Key ${falKey}` }, timeout: 15_000, validateStatus: () => true });
                    if (res.status !== 200) {
                        pollFail = `Result fetch HTTP ${res.status} — body: ${JSON.stringify(res.data).slice(0, 150)}`;
                        break;
                    }
                    videoUrl = res.data?.video?.url ?? null;
                    break;
                }
                // HTTP 200/202 + status IN_QUEUE/IN_PROGRESS/PENDING/empty → continue polling
                // (202 = Accepted, job still running — NOT a failure)
            }
            const totalElapsed = Math.round((Date.now() - startPoll) / 1000);
            if (pollFail) {
                await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — Polling FAIL*\n\n• request\\_id : \`${request_id.slice(0, 20)}...\`\n• Cause : ${pollFail}\n• Dernier status : ${lastJobStatus}\n• Polls : ${pollCount}\n• Durée : ${totalElapsed}s`);
                return;
            }
            if (!videoUrl) {
                await (0, telegram_js_1.sendMessage)(chatId, `⏳ *fal.ai — Timeout ${totalElapsed}s*\n\nLa génération n'est pas terminée après ${totalElapsed}s.\n• request\\_id : \`${request_id.slice(0, 20)}...\`\n• Dernier status : ${lastJobStatus}\n• Polls : ${pollCount}\n\nRéessaie /test\\_fal dans quelques minutes.`);
                return;
            }
            // Step 3 — download + validate MP4
            const dlResp = await ax.get(videoUrl, { responseType: 'arraybuffer', timeout: 60_000 });
            const buf = Buffer.from(dlResp.data);
            const validMp4 = (0, create_marketing_video_js_1.isValidMp4Buffer)(buf);
            // Step 4 — send video to Telegram
            let tgVideoOk = false;
            if (validMp4) {
                try {
                    await (0, telegram_js_1.sendVideoBuffer)(chatId, buf, `🎬 *Test fal.ai — Kling 1.6*\n_Vidéo test générée avec succès_`);
                    tgVideoOk = true;
                }
                catch { /* report in summary */ }
            }
            await (0, telegram_js_1.sendMessage)(chatId, `${tgVideoOk ? '✅' : '⚠️'} *fal.ai — Test génération ${tgVideoOk ? 'OK' : 'partiel'}*\n\n` +
                `• Modèle : \`${MODEL}\`\n` +
                `• request\\_id : \`${request_id.slice(0, 20)}...\`\n` +
                `• Polls : ${pollCount} (${totalElapsed}s total)\n` +
                `• video\\_url reçue : ✅\n` +
                `• MP4 téléchargé : ✅ (${(buf.length / 1024).toFixed(0)} KB)\n` +
                `• MP4 valide (ftyp) : ${validMp4 ? '✅' : '❌ corrompu'}\n` +
                `• Telegram sendVideo : ${tgVideoOk ? '✅' : '❌ (voir logs)'}`);
        }
        catch (e) {
            const s = e?.response?.status;
            await (0, telegram_js_1.sendMessage)(chatId, `❌ *fal.ai — Erreur inattendue*\n\n• ${s ? `HTTP ${s}` : e.message}`);
        }
        return;
    }
    // /test_replicate — vrai test génération image Flux.1 (~15-30s, crédits consommés)
    // Télécharge l'image immédiatement pour valider avant expiration de l'URL
    if (msg.text?.startsWith('/test_replicate')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const token = env_js_1.env.REPLICATE_API_TOKEN;
        if (!token) {
            await (0, telegram_js_1.sendMessage)(chatId, `❌ *Replicate — REPLICATE\\_API\\_TOKEN manquant*\n\nVariable à ajouter dans Railway → Variables : \`REPLICATE_API_TOKEN\``);
            return;
        }
        const MODEL_REP = 'black-forest-labs/flux-1.1-pro';
        await (0, telegram_js_1.sendMessage)(chatId, `🎨 *Test génération Replicate*\n• Modèle : \`${MODEL_REP}\`\n⏳ 15-30 secondes...`);
        try {
            const { default: ax } = await Promise.resolve().then(() => __importStar(require('axios')));
            // Step 1 — submit prediction
            const createResp = await ax.post(`https://api.replicate.com/v1/models/${MODEL_REP}/predictions`, { input: { prompt: 'red sports car, 4K', aspect_ratio: '1:1', output_format: 'jpg', output_quality: 50 } }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=10' }, timeout: 30_000 });
            let pred = createResp.data;
            // Step 2 — poll until succeeded (max 90s)
            const deadline = Date.now() + 90_000;
            while (pred.status !== 'succeeded' && Date.now() < deadline) {
                if (pred.status === 'failed' || pred.status === 'canceled')
                    throw new Error(`Replicate: ${pred.error ?? 'prediction failed'}`);
                await new Promise(r => setTimeout(r, 3000));
                const poll = await ax.get(`https://api.replicate.com/v1/predictions/${pred.id}`, {
                    headers: { Authorization: `Bearer ${token}` }, timeout: 15_000,
                });
                pred = poll.data;
            }
            if (pred.status !== 'succeeded')
                throw new Error('Replicate: timeout 90s dépassé');
            const imageUrl = String(Array.isArray(pred.output) ? pred.output[0] : pred.output);
            // Step 3 — télécharge IMMÉDIATEMENT (l'URL expire vite)
            const dlResp = await ax.get(imageUrl, { responseType: 'arraybuffer', timeout: 30_000, validateStatus: () => true });
            const dlStatus = dlResp.status;
            const contentType = String(dlResp.headers['content-type'] ?? '');
            const buf = Buffer.from(dlResp.data);
            const isImage = contentType.startsWith('image/') && buf.length > 0;
            if (!isImage || dlStatus !== 200) {
                await (0, telegram_js_1.sendMessage)(chatId, `⚠️ *Replicate — Image générée mais téléchargement FAIL*\n\n• prediction\\_id : ${pred.id}\n• URL : ${imageUrl.slice(0, 60)}...\n• HTTP téléchargement : ${dlStatus}\n• Content-Type : ${contentType || 'inconnu'}\n• Taille : ${buf.length} bytes\n\n_URL Replicate expirée ou inaccessible._`);
                return;
            }
            // Step 4 — envoie l'image dans Telegram pour confirmation visuelle
            let tgOk = false;
            try {
                await (0, telegram_js_1.sendPhoto)(chatId, imageUrl, `🎨 *Test Replicate — Flux.1 Pro*\n_Image test générée avec succès_`);
                tgOk = true;
            }
            catch { /* fallback — on déjà validé le download */ }
            await (0, telegram_js_1.sendMessage)(chatId, `✅ *Replicate — Test génération OK*\n\n• Modèle : \`${MODEL_REP}\`\n• prediction\\_id : ${pred.id}\n• Image générée : ✅\n• Téléchargement : ✅ (${(buf.length / 1024).toFixed(0)} KB)\n• Content-Type : ${contentType}\n• Telegram sendPhoto : ${tgOk ? '✅' : '⚠️ fallback (URL déjà expirée pour Telegram)'}`);
        }
        catch (e) {
            const status = e?.response?.status;
            await (0, telegram_js_1.sendMessage)(chatId, status === 401
                ? `❌ *Replicate — Token invalide (401)*\n\n• REPLICATE\\_API\\_TOKEN rejeté ❌\n\nVérifie la valeur dans Railway.`
                : `❌ *Replicate — Test FAIL*\n\n• Erreur : ${status ? `HTTP ${status}` : e.message}`);
        }
        return;
    }
    // /test_ai — diagnostic light (clé + auth, sans génération)
    if (msg.text?.startsWith('/test_ai')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        await (0, telegram_js_1.sendMessage)(chatId, '🧪 *Diagnostic IA (light — sans génération)...*');
        const falKey = env_js_1.env.FAL_KEY;
        const repToken = env_js_1.env.REPLICATE_API_TOKEN;
        const diag = [
            `• FAL\\_KEY présent : ${falKey ? '✅ oui' : '❌ non'}`,
            `• REPLICATE\\_API\\_TOKEN présent : ${repToken ? '✅ oui' : '❌ non'}`,
        ];
        // fal.ai auth check — POST {} → 422 = clé valide
        if (!falKey) {
            diag.push('• fal.ai auth endpoint : ⏭ SKIP (FAL\\_KEY absent)');
        }
        else {
            try {
                const { default: ax } = await Promise.resolve().then(() => __importStar(require('axios')));
                const r = await ax.post('https://queue.fal.run/fal-ai/kling-video/v1.6/standard/text-to-video', {}, { headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' }, timeout: 15_000, validateStatus: () => true });
                const s = r.status;
                const ok = s === 422 || s === 200 || s === 201 || s === 202;
                const label = ok ? `✅ OK (HTTP ${s} — clé valide)` :
                    s === 401 || s === 403 ? `❌ FAIL (HTTP ${s} — clé invalide)` :
                        s === 405 ? `❌ FAIL (HTTP 405 — méthode rejetée, pas OK)` :
                            `❌ FAIL (HTTP ${s})`;
                diag.push(`• fal.ai auth endpoint : ${label}`);
            }
            catch (e) {
                diag.push(`• fal.ai auth endpoint : ❌ FAIL (${e.message})`);
            }
        }
        // Replicate auth check — GET /v1/account
        if (!repToken) {
            diag.push('• Replicate auth endpoint : ⏭ SKIP (REPLICATE\\_API\\_TOKEN absent)');
        }
        else {
            try {
                const { default: ax } = await Promise.resolve().then(() => __importStar(require('axios')));
                const r = await ax.get('https://api.replicate.com/v1/account', {
                    headers: { Authorization: `Bearer ${repToken}` },
                    timeout: 10_000,
                    validateStatus: () => true,
                });
                const ok = r.status === 200;
                diag.push(`• Replicate auth endpoint : ${ok ? `✅ OK (compte: ${r.data?.username ?? 'ok'})` : `❌ FAIL (HTTP ${r.status})`}`);
            }
            catch (e) {
                diag.push(`• Replicate auth endpoint : ❌ FAIL (${e.message})`);
            }
        }
        diag.push('\n_Tape /test\\_fal ou /test\\_replicate pour un vrai test de génération (crédits consommés)._');
        await (0, telegram_js_1.sendMessage)(chatId, `🤖 *DIAGNOSTIC IA — DZARYX*\n\n${diag.join('\n')}`);
        return;
    }
    // ── VIDÉO REÇUE ──
    if (msg.video) {
        // Dedup: block Telegram retries on the same video within 30s
        const videoKey = `${chatId}:video:${msg.video.file_id}`;
        if (checkIncomingDuplicate(msg.chat.id, videoKey, msg.message_id))
            return;
        // Store file_id in buffer so merge_videos tool can retrieve it
        (0, video_buffer_js_1.addVideoToBuffer)(sessionId, msg.video.file_id);
        // Wait for Cloudinary init before processing (race condition fix)
        if (!_cloudinaryReady)
            await _cloudinaryInit;
        await handleVideoMessage(chatId, sessionId, msg);
        return;
    }
    // ── PHOTO OU DOCUMENT REÇU ──
    if (msg.photo || msg.document) {
        const caption = msg.caption ?? '';
        // Dedup: block Telegram retries on the same photo/doc within 30s
        const mediaKey = msg.photo
            ? `photo:${msg.photo[msg.photo.length - 1]?.file_id ?? ''}`
            : `doc:${msg.document.file_id}`;
        if (checkIncomingDuplicate(msg.chat.id, mediaKey, msg.message_id))
            return;
        // Si la légende contient un mot-clé d'enregistrement → stocker comme avant
        if (STORE_KEYWORDS.test(caption)) {
            await handleFileMessage(chatId, sessionId, msg);
            return;
        }
        // Documents non-image (PDF, Word, etc.) → traiter comme fichier, pas comme image
        if (msg.document) {
            const mime = msg.document.mime_type ?? '';
            const isImage = mime.startsWith('image/');
            if (!isImage) {
                await handleFileMessage(chatId, sessionId, msg);
                return;
            }
        }
        // Sinon → analyser l'image avec Claude Vision ET proposer traitement
        await handleImageMessage(chatId, sessionId, msg);
        return;
    }
    // Text message
    if (!msg.text)
        return;
    const text = msg.text.trim();
    // ── Incoming dedup — must be FIRST, before any processing ──
    // Single-word approval messages (Oke/Non) are exempt — they need to reach the approval flow.
    const isApproval = /^(oke|ok|oké|okay|valide|validé|publie|yes|oui|non|no|annule|annulé|refuse|refus|nope)$/i.test(text);
    if (!isApproval && checkIncomingDuplicate(msg.chat.id, text, msg.message_id))
        return;
    // ── Marketing video approval: "Oke" or "Non" ──────────────
    const isOke = /^(oke|ok|oké|okay|valide|validé|publie|yes|oui)$/i.test(text);
    const isNon = /^(non|no|annule|annulé|refuse|refus|nope)$/i.test(text);
    if (isOke || isNon) {
        const pending = (0, approval_store_js_1.getLatestPendingVideo)();
        if (pending) {
            if (isOke) {
                (0, approval_store_js_1.approveVideo)(pending.id);
                const tiktokConfigured = Boolean(env_js_1.env.TIKTOK_ACCESS_TOKEN && env_js_1.env.TIKTOK_OPEN_ID);
                if (tiktokConfigured) {
                    await (0, telegram_js_1.sendMessage)(chatId, '✅ *Vidéo validée !* Publication TikTok en cours...');
                    const result = await (0, social_poster_js_1.publishVideo)(pending);
                    if (result.success) {
                        await (0, telegram_js_1.sendMessage)(chatId, `🚀 *${result.message}*\n${result.url ?? ''}`);
                    }
                    else {
                        await (0, telegram_js_1.sendMessage)(chatId, `⚠️ Publication TikTok échouée: ${result.message}\n\n${(0, social_poster_js_1.buildSharePackage)(pending)}`);
                    }
                }
                else {
                    // TikTok non configuré → paquet manuel directement, sans fausse promesse
                    await (0, telegram_js_1.sendMessage)(chatId, `✅ *Vidéo validée !*\n\n${(0, social_poster_js_1.buildSharePackage)(pending)}`);
                }
            }
            else {
                (0, approval_store_js_1.rejectVideo)(pending.id);
                await (0, telegram_js_1.sendMessage)(chatId, '❌ Vidéo annulée. Dis "fais une vidéo marketing" quand tu veux en créer une nouvelle !');
            }
            return;
        }
        // No pending video — let Claude handle naturally
    }
    // ── NEXUS Operator Mode ────────────────────────────────────────────────
    if (msg.text?.startsWith('/tasks')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const tasks = await (0, nexus_memory_js_1.getRecentTasks)(8);
        if (!tasks.length) {
            await (0, telegram_js_1.sendMessage)(chatId, '📋 *Aucune tâche vision.*\n_Lance: "nexus ouvre chrome"_');
            return;
        }
        const lines = tasks.map(t => {
            const e = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⚠️';
            return `${e} \`${t.task_id.slice(-6)}\` ${t.objective.slice(0, 45)} | ${t.steps}s ${((t.duration_ms ?? 0) / 1000).toFixed(0)}s`;
        });
        await (0, telegram_js_1.sendMessage)(chatId, `📋 *NEXUS — Tâches récentes*\n\n${lines.join('\n')}`);
        return;
    }
    if (msg.text?.startsWith('/memory')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const wf = await (0, nexus_memory_js_1.getTopWorkflows)(6);
        if (!wf.length) {
            await (0, telegram_js_1.sendMessage)(chatId, '🧠 *Aucun workflow mémorisé.*\n_Nexus apprend après chaque tâche._');
            return;
        }
        const lines = wf.map(w => `• \`${(w.reliability * 100).toFixed(0)}%\` — ${w.objective.slice(0, 55)} (${w.success_count}✅/${w.fail_count}❌)`);
        await (0, telegram_js_1.sendMessage)(chatId, `🧠 *NEXUS — Mémoire workflows*\n\n${lines.join('\n')}`);
        return;
    }
    if (msg.text?.startsWith('/providers')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const stats = await (0, nexus_memory_js_1.getProviderStats)();
        if (!stats.length) {
            await (0, telegram_js_1.sendMessage)(chatId, '📊 *Aucune statistique provider.*');
            return;
        }
        const lines = stats.map(s => {
            const rel = `${(s.reliability * 100).toFixed(0)}%`;
            const lat = s.avg_latency_ms > 0 ? `${s.avg_latency_ms.toFixed(0)}ms` : '?';
            const cd = s.cooldown_until && new Date(s.cooldown_until) > new Date() ? ' ❄️CD' : '';
            return `• *${s.provider}* — ${rel} (${s.success_count}✅/${s.fail_count}❌) ~${lat}${cd}`;
        });
        await (0, telegram_js_1.sendMessage)(chatId, `📊 *NEXUS — Providers*\n\n${lines.join('\n')}`);
        return;
    }
    if (msg.text?.startsWith('/visionstats')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const vs = await (0, nexus_memory_js_1.getVisionStats)();
        const ctx = (0, nexus_vision_loop_js_1.getVisionContext)();
        await (0, telegram_js_1.sendMessage)(chatId, `👁️ *NEXUS Vision — Stats*\n\n` +
            `• Total tâches: ${vs.total}\n` +
            `• Complétées: ${vs.completed} (${vs.successRate}%)\n` +
            `• Durée moyenne: ${(vs.avgDuration / 1000).toFixed(1)}s\n` +
            `• Meilleur provider: *${vs.bestProvider}*\n` +
            `• Dernier objectif: _${ctx.objective?.slice(0, 60) ?? 'aucun'}_\n` +
            `• Provider actuel: ${ctx.lastProvider ?? '?'}`);
        return;
    }
    if (msg.text?.startsWith('/abort')) {
        (0, nexus_vision_loop_js_1.triggerEmergencyStop)();
        await (0, telegram_js_1.sendMessage)(chatId, '🛑 *NEXUS Vision — Arrêt d\'urgence déclenché.*\nToutes les boucles actives s\'arrêtent immédiatement.');
        return;
    }
    if (msg.text?.startsWith('/workflow')) {
        await (0, telegram_js_1.sendTyping)(chatId);
        const arg = msg.text.replace('/workflow', '').trim();
        if (!arg) {
            const workflows = await (0, nexus_memory_js_1.getTopWorkflows)(4);
            if (!workflows.length) {
                await (0, telegram_js_1.sendMessage)(chatId, '🔄 *Aucun workflow.*');
                return;
            }
            const lines = workflows.map(w => `• \`${w.objective_hash}\` ${w.objective.slice(0, 40)} — ${(w.reliability * 100).toFixed(0)}% (${w.success_count + w.fail_count} runs)`);
            await (0, telegram_js_1.sendMessage)(chatId, `🔄 *Workflows disponibles:*\n${lines.join('\n')}`);
        }
        else {
            const wf = await (0, nexus_memory_js_1.getSuccessfulWorkflow)(arg);
            if (!wf) {
                await (0, telegram_js_1.sendMessage)(chatId, `❌ Workflow \`${arg}\` non trouvé.`);
            }
            else {
                await (0, telegram_js_1.sendMessage)(chatId, `🔄 *${wf.objective.slice(0, 60)}*\n\n` +
                    `• Fiabilité: ${(wf.reliability * 100).toFixed(0)}%\n` +
                    `• Succès/Échecs: ${wf.success_count}/${wf.fail_count}\n` +
                    `• Séquence: ${wf.action_sequence.join(' → ')}\n` +
                    `• Étapes moy: ${wf.avg_steps.toFixed(1)} | Durée moy: ${(wf.avg_duration_ms / 1000).toFixed(1)}s`);
            }
        }
        return;
    }
    // ── END Operator Mode ────────────────────────────────────────────────────
    // ── NEXUS triggers ──────────────────────────────────────────────────────
    const NEXUS_WAKE_RE = /nexus\s*(r[eé]veille[\s-]toi|wake[\s-]up|en[\s-]ligne|allume|d[eé]marre)/i;
    const NEXUS_CMD_RE = /^nexus[,\s:]+(.+)/is;
    if (NEXUS_WAKE_RE.test(text)) {
        if ((0, nexus_relay_js_1.isNexusOnline)()) {
            (0, nexus_relay_js_1.sendToNexus)('nexus:wake', { source: 'telegram', chatId });
            await (0, telegram_js_1.sendMessage)(chatId, '🖥️ Signal de réveil envoyé à *NEXUS*. Il répond sous peu.');
        }
        else {
            // Try Wake-on-LAN to wake the PC
            const mac = (0, nexus_relay_js_1.getNexusMac)();
            (0, nexus_relay_js_1.getNexusIp)();
            if (mac) {
                await (0, telegram_js_1.sendMessage)(chatId, `🖥️ *NEXUS* est hors ligne — envoi signal WoL au PC...\n_MAC: ${mac}_`);
                const wol = await (0, nexus_relay_js_1.triggerWol)();
                if (wol.sent) {
                    await (0, telegram_js_1.sendMessage)(chatId, '📡 Paquet WoL envoyé. Le PC devrait se réveiller dans 10-30 secondes.\n' +
                        '_NEXUS démarre automatiquement après le réveil._\n\n' +
                        '⚠️ Si le PC est complètement éteint \\(pas en veille\\), cette méthode ne fonctionne ' +
                        'que si la redirection UDP port 9 est configurée sur ton routeur.');
                }
                else {
                    await (0, telegram_js_1.sendMessage)(chatId, '❌ WoL échoué \\(PC peut-être éteint ou routeur non configuré\\).\n' +
                        'Allume le PC manuellement — NEXUS démarrera automatiquement.');
                }
            }
            else {
                await (0, telegram_js_1.sendMessage)(chatId, '🖥️ *NEXUS* est hors ligne et aucune adresse PC mémorisée.\n' +
                    'Démarre le PC — NEXUS se lance automatiquement au démarrage.');
            }
        }
        return;
    }
    const nexusCmdMatch = NEXUS_CMD_RE.exec(text);
    if (nexusCmdMatch) {
        if (!(0, nexus_relay_js_1.isNexusOnline)()) {
            await (0, telegram_js_1.sendMessage)(chatId, '🖥️ *NEXUS* est hors ligne. Lance *start.bat* sur ton PC.');
            return;
        }
        const nlResult = await (0, nexus_nl_router_js_1.routeNexusMessage)(text);
        for (const log of nlResult.logs)
            console.log(log);
        if (nlResult.handled) {
            for (const msg of nlResult.messages)
                await (0, telegram_js_1.sendMessage)(chatId, msg);
            return;
        }
        // Unknown intent — fall through to Python AI
        const cmd = nexusCmdMatch[1].trim();
        (0, nexus_relay_js_1.sendToNexus)('nexus:command', { text: cmd, source: 'telegram', chatId });
        await (0, telegram_js_1.sendMessage)(chatId, `📡 Commande envoyée à *NEXUS*:\n_${cmd}_`);
        return;
    }
    // ── Auto-route PC/music commands to NEXUS ───────────────────────────────
    // Guard: réservation/booking keywords → jamais routé vers Nexus
    const BOOKING_GUARD_RE = /\b(r[eé]servation|r[eé]server|booking|cr[eé]e[rz]?\s+une?\s+r[eé]sa|agenda\s+(?:pour|de|du|les?)|voiture|location|locataire|prix\s+de\s+\d|client\s+(?:pour|de)|passeport|carte\s+d.identit[eé])\b/i;
    // mets?/mettre/joue/lance/écoute doivent être suivis d'un terme musical explicite
    const NEXUS_MUSIC_RE = /\b(joue[rz]?\s+(?:la\s+)?(?:spotify|youtube|musique|chanson)|lance[rz]?\s+(?:spotify|youtube|musique)|play\b|[eé]coute[rz]?\s+(?:la\s+)?(?:musique|chanson)|mets?\s+(?:la\s+)?(?:musique|chanson|spotify|youtube)|mettre\s+(?:la\s+)?(?:musique|chanson)|d[eé]marre[rz]?\s+(?:spotify|youtube|musique)|ouvre[rz]?\s+(?:spotify|youtube)|musique\b|chanson\b|lacrim|jul\b|soolking|sch\b|nekfeu|booba|kaaris)\b/i;
    const NEXUS_VOL_RE = /\b(volume|son)\s*\d+/i;
    const NEXUS_PAUSE_RE = /\b(pause|stop|arr[eê]te)\b.*\b(musique|chanson|son|spotify|youtube)\b|\b(musique|chanson)\b.*\b(pause|stop|arr[eê]te)\b/i;
    const NEXUS_MEDIA_RE = /\b(piste\s+suivante|next\s+track|chanson\s+suivante|piste\s+pr[eé]c|previous\s+track)\b/i;
    const NEXUS_SCREEN_RE = /\b(screenshot|capture\s+[eé]cran|[eé]cran\s+PC|[eé]teins?\s+(le\s+)?[eé]cran|[eé]cran\s+noir|verrouille?\s+(le\s+)?PC|d[eé]verrouille?\s+(le\s+)?PC)\b/i;
    const isNexusPCCmd = (0, nexus_relay_js_1.isNexusOnline)() && !BOOKING_GUARD_RE.test(text) && (NEXUS_MUSIC_RE.test(text) ||
        NEXUS_VOL_RE.test(text) ||
        NEXUS_PAUSE_RE.test(text) ||
        NEXUS_MEDIA_RE.test(text) ||
        NEXUS_SCREEN_RE.test(text));
    if (isNexusPCCmd) {
        (0, nexus_relay_js_1.sendToNexus)('nexus:command', { text, source: 'telegram', chatId });
        return;
    }
    // ── END NEXUS triggers ───────────────────────────────────────────────────
    try {
        console.log(`[TELEGRAM_RUNTIME] handler=main_text message="${text.slice(0, 60)}" len=${text.length} session=${sessionId} router=processWithOrchestration`);
        await (0, telegram_js_1.sendTyping)(chatId);
        // Full P15 pipeline: focus-manager + priority-engine + Groq → OpenAI → Gemini fallback
        const response = await (0, orchestrator_engine_js_1.processWithOrchestration)(text, sessionId, true);
        const safeText = response.text;
        for (const chunk of splitMessage(safeText, 4000)) {
            await (0, telegram_js_1.sendMessage)(chatId, chunk);
        }
        // Supabase document URLs → send as photo/document
        const docUrls = safeText.match(/https:\/\/[^\s\n\])"']+supabase[^\s\n\])"']+(?:client-documents|object\/sign)[^\s\n\])"']*/g);
        if (docUrls) {
            for (const url of docUrls) {
                await (0, telegram_js_1.sendPhoto)(chatId, url).catch(async () => {
                    await (0, telegram_js_1.sendDocument)(chatId, url).catch(() => { });
                });
            }
        }
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[telegram] Error:', errMsg);
        await (0, telegram_js_1.sendMessage)(chatId, `⚠️ Erreur: ${errMsg.slice(0, 300)}`);
    }
});
// ── TRAITEMENT VIDÉO AUTOMATIQUE ──────────────────────────────────
async function handleVideoMessage(chatId, sessionId, msg) {
    try {
        console.log(`[TELEGRAM_RUNTIME] handler=video session=${sessionId} caption="${(msg.caption ?? '').slice(0, 40)}" vision=callVisionGemini`);
        if (!cloudinary) {
            await (0, telegram_js_1.sendMessage)(chatId, '⚠️ Cloudinary non configuré.');
            return;
        }
        await (0, telegram_js_1.sendTyping)(chatId);
        const videoFile = msg.video;
        if (!videoFile)
            return;
        const caption = msg.caption ?? '';
        // 1. Télécharger depuis Telegram
        await (0, telegram_js_1.sendMessage)(chatId, '⏳ Téléchargement...');
        const buffer = await (0, telegram_js_1.downloadFile)(videoFile.file_id);
        if (!buffer) {
            await (0, telegram_js_1.sendMessage)(chatId, '⚠️ Impossible de télécharger la vidéo.');
            return;
        }
        // 2. Upload sur Cloudinary
        await (0, telegram_js_1.sendMessage)(chatId, '☁️ Upload sur Cloudinary...');
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream({ resource_type: 'video', folder: 'telegram_videos' }, (error, result) => { if (error)
                reject(error);
            else
                resolve(result); });
            uploadStream.end(buffer);
        });
        const videoUrl = uploadResult.secure_url;
        // Détecte si c'est une référence UI (design à copier)
        const UI_KEYWORDS = /ressemble|interface|design|style|ui|apparence|copie|même look|même style|jarvis|modifie l'interface|change l'interface/i;
        const isUIRef = UI_KEYWORDS.test(caption);
        // 3a. SI référence UI → extraire frame + analyse Vision → modifier interface
        if (isUIRef) {
            await (0, telegram_js_1.sendMessage)(chatId, '🎨 Analyse du design dans la vidéo...');
            // Cloudinary extrait automatiquement la première frame en ajoutant .jpg
            const frameUrl = videoUrl.replace(/\.(mp4|mov|avi|webm)$/i, '.jpg')
                .replace('/video/upload/', '/video/upload/so_0,f_jpg/');
            // Télécharger la frame
            const frameBuffer = await axios_1.default.get(frameUrl, { responseType: 'arraybuffer', timeout: 15_000 })
                .then((r) => Buffer.from(r.data))
                .catch(() => null);
            if (frameBuffer) {
                const base64Frame = frameBuffer.toString('base64');
                const uiDescription = await callVisionGemini(base64Frame, 'image/jpeg', `Analyse cette interface UI avec TOUS les détails visuels:
- Couleurs exactes (background, texte, boutons, bordures) avec codes hex si possible
- Layout et disposition des éléments
- Typographie (police, taille, poids)
- Effets visuels (gradient, glow, blur, ombre)
- Composants présents (boutons, cartes, barres, cercles, vagues)
- Style général (futuriste, minimal, glassmorphism, neon, etc.)
Sois TRÈS précis — cette description servira à reproduire exactement ce design.`, `Demande: "${caption}" — Décris ce design en détail.`);
                const actionMessage = `[Référence UI extraite d'une vidéo — analyse visuelle:\n${uiDescription}]\n\nDemande de Kouider: "${caption}"\n\nModifie l'interface mobile Dzaryx pour qu'elle ressemble à ce design.\nFichiers dans repo "ibrahim":\n- mobile/src/components/ChatInterface.tsx\n- mobile/src/components/ChatInterface.css\n\nProcédure: github_read_file les deux → modifier → github_write_file → Netlify redéploie.`;
                const ctx = await (0, context_builder_js_1.buildContext)(sessionId, actionMessage);
                const response = await chatWithFallback(ctx.messages, ctx.systemExtra, actionMessage, sessionId);
                await (0, telegram_js_1.sendMessage)(chatId, response.text);
                await (0, supabase_js_1.saveConversationTurn)(sessionId, 'user', `[Vidéo UI ref — "${caption}"]`, { source: 'telegram', type: 'video_ui', url: videoUrl });
                return;
            }
            await (0, telegram_js_1.sendMessage)(chatId, '⚠️ Impossible d\'extraire la frame. Essaie avec une photo à la place.');
            return;
        }
        // 3b. Traitement vidéo normal
        await (0, telegram_js_1.sendMessage)(chatId, '🤖 Dzaryx traite ta demande...');
        const userRequest = caption
            ? `Vidéo reçue via Telegram et uploadée sur Cloudinary.\nURL: ${videoUrl}\n\nDemande de Kouider: "${caption}"\n\nUtilise l'outil approprié:\n- cut_video: pour couper/limiter la durée (video_url="${videoUrl}", start_seconds=0, end_seconds=N)\n- create_video_preview: pour garder uniquement les N premières secondes (video_url="${videoUrl}", duration_seconds=N)\n- optimize_for_platform: pour TikTok/YouTube (video_url="${videoUrl}", platform="tiktok"|"youtube")\nRetourne l'URL résultante dans ta réponse.`
            : `Vidéo reçue via Telegram.\nURL: ${videoUrl}\n\nAucune instruction. Analyse et propose ce que je peux en faire.`;
        const ctx = await (0, context_builder_js_1.buildContext)(sessionId, userRequest);
        const response = await chatWithFallback(ctx.messages, ctx.systemExtra, userRequest, sessionId);
        await (0, telegram_js_1.sendMessage)(chatId, response.text);
        // Extraire et renvoyer la vidéo Cloudinary modifiée
        // Le regex accepte les URLs Cloudinary avec ou sans extension .mp4 dans le path
        const urlMatch = response.text.match(/https:\/\/res\.cloudinary\.com\/[^\s\n)"']+/);
        if (urlMatch && urlMatch[0] !== videoUrl) {
            await (0, telegram_js_1.sendVideo)(chatId, urlMatch[0]);
        }
        await (0, supabase_js_1.saveConversationTurn)(sessionId, 'user', `[Vidéo Telegram${caption ? ` — "${caption}"` : ''}]`, { source: 'telegram', type: 'video', url: videoUrl });
    }
    catch (err) {
        console.error('[telegram] handleVideoMessage error:', err instanceof Error ? err.message : String(err));
        await (0, telegram_js_1.sendMessage)(chatId, `⚠️ Erreur: ${err instanceof Error ? err.message : String(err)}`);
    }
}
// ── TRAITEMENT IMAGE — Claude Vision complet ─────────────────────
const DISPLAY_PC_RE = /affiche?.*(?:sur\s+(?:le|mon)\s+(?:pc|[eé]cran))|montre.*(?:sur\s+(?:le|mon)\s+pc)|mets?\s+(?:ça\s+)?(?:sur|à\s+l[a'])\s*[eé]cran|display.*pc/i;
const SAVE_PC_RE = /(?:sauvegarde?|enregistre?|range?|classe?|mets?\s+dans\s+(?:un\s+)?dossier|stocke?|archive?|garde?)\s*(?:sur\s+(?:le\s+)?pc|(?:dans|en)\s+(?:un\s+)?dossier|(?:ça\s+)?(?:sur|dans)\s+(?:le\s+)?(?:pc|ordinateur))|(?:nexus\s+)?(?:classe?|range?|organise?|sauvegarde?)\s*(?:ça|cette?\s+photo|ce\s+fichier|ces?\s+photos?)/i;
async function handleImageMessage(chatId, sessionId, msg) {
    try {
        console.log(`[TELEGRAM_RUNTIME] handler=image session=${sessionId} caption="${(msg.caption ?? '').slice(0, 40)}" vision=callVisionGemini chat=chatWithFallback`);
        await (0, telegram_js_1.sendTyping)(chatId);
        const caption = msg.caption ?? '';
        // ── Récupérer le fileId et mimeType ──────────────────────────
        let fileId;
        let mimeType = 'image/jpeg';
        if (msg.photo && msg.photo.length > 0) {
            const largest = msg.photo[msg.photo.length - 1];
            if (!largest) {
                await (0, telegram_js_1.sendMessage)(chatId, '⚠️ Photo illisible.');
                return;
            }
            fileId = largest.file_id;
        }
        else if (msg.document) {
            fileId = msg.document.file_id;
            const mime = msg.document.mime_type ?? '';
            if (mime === 'image/png')
                mimeType = 'image/png';
            else if (mime === 'image/gif')
                mimeType = 'image/gif';
            else if (mime === 'image/webp')
                mimeType = 'image/webp';
        }
        else {
            return;
        }
        // ── Télécharger l'image ───────────────────────────────────────
        const buffer = await (0, telegram_js_1.downloadFile)(fileId);
        if (!buffer) {
            await (0, telegram_js_1.sendMessage)(chatId, '⚠️ Impossible de télécharger la photo.');
            return;
        }
        const base64Image = buffer.toString('base64');
        // ── Vision Claude — analyse complète en une seule passe ───────
        // Le system prompt donne à Claude tout le contexte Dzaryx
        const visionPrompt = caption
            ? `Photo reçue sur Telegram avec ce message: "${caption}"\n\nAnalyse d'abord l'image en détail, puis réponds à la demande.`
            : `Photo reçue sur Telegram sans message. Analyse-la et dis-moi ce que tu vois avec tous les détails utiles (texte visible, personnes, documents, interface, voiture, lieu, etc.).`;
        const visionText = await callVisionGemini(base64Image, mimeType, `Tu analyses les images envoyées sur Telegram avec une précision maximale.

SELON LE TYPE D'IMAGE:
- Passeport/permis → extrais TOUS les champs: nom complet, numéro, date naissance, expiration, nationalité
- Capture d'écran d'une réservation/tableau → liste toutes les données visibles (noms, prix, dates, statuts)
- Photo de voiture → identifie le modèle, état, plaque si visible, remarques
- Interface/design → décris couleurs exactes, layout, composants, effets visuels (pour reproduire)
- Facture/document commercial → extrais montants, dates, parties concernées
- Photo générale → décris le contenu de façon précise et utile

RÈGLES:
- Répondre en FRANÇAIS
- Sois EXHAUSTIF — mentionne TOUS les détails visibles
- Si c'est un document client → propose directement de l'enregistrer
- Si c'est une interface UI → propose de modifier l'app pour y ressembler
- Si c'est une voiture → fais le lien avec la flotte Fik Conciergerie si pertinent
- Ton conversationnel naturel — tu es Dzaryx, pas un robot d'analyse`, visionPrompt);
        // ── Afficher sur PC (nexus:display_image) ─────────────────────
        const wantDisplay = DISPLAY_PC_RE.test(caption) && (0, nexus_relay_js_1.isNexusOnline)();
        // ── Sauvegarder dans dossier organisé (nexus:save_file) ───────
        const wantSave = SAVE_PC_RE.test(caption) && (0, nexus_relay_js_1.isNexusOnline)();
        if (wantDisplay && !wantSave) {
            const ext = mimeType === 'image/png' ? 'png' : 'jpg';
            const filename = `photo_${Date.now()}.${ext}`;
            (0, nexus_relay_js_1.sendToNexus)('nexus:display_image', { data: base64Image, filename, caption });
            await (0, telegram_js_1.sendMessage)(chatId, '🖥️ Photo envoyée à NEXUS — affichage sur le PC...');
        }
        if (wantSave && (0, nexus_relay_js_1.isNexusOnline)()) {
            // Demander à Claude de suggérer le nom de dossier le plus pertinent
            try {
                const folderRaw = await callTextWithFallback(`Caption utilisateur: "${caption}"\nDescription image: "${visionText.slice(0, 400)}"\n\nSuggère un chemin de dossier Windows court et logique pour classer ce fichier. Format: "Dossier/SousDossier". Un seul chemin, rien d'autre. Exemples: "Accidents/2025-05-08", "Factures/2025", "Documents Clients/Passeports", "Flotte/Photos", "Incidents/Parking".`, 60);
                const folder = folderRaw.trim().replace(/[<>:"|?*]/g, '_').slice(0, 80);
                const ext = mimeType === 'image/png' ? 'png' : 'jpg';
                const filename = `photo_${Date.now()}.${ext}`;
                (0, nexus_relay_js_1.sendToNexus)('nexus:save_file', {
                    data: base64Image, filename, folder, caption,
                    display: wantDisplay || DISPLAY_PC_RE.test(caption),
                });
                await (0, telegram_js_1.sendMessage)(chatId, `🖥️ Sauvegarde sur le PC dans *${folder}*...`);
            }
            catch (e) {
                console.error('[telegram] folder suggestion failed:', e);
                const ext = mimeType === 'image/png' ? 'png' : 'jpg';
                const filename = `photo_${Date.now()}.${ext}`;
                (0, nexus_relay_js_1.sendToNexus)('nexus:save_file', { data: base64Image, filename, folder: 'Divers', caption, display: wantDisplay });
                await (0, telegram_js_1.sendMessage)(chatId, '🖥️ Sauvegarde sur le PC dans *Divers*...');
            }
        }
        // ── Passer la description Vision à Dzaryx avec tous ses outils ─
        const fullMessage = caption
            ? `[Photo reçue sur Telegram]\n\nVision Claude:\n${visionText}\n\nMessage de Kouider: "${caption}"`
            : `[Photo reçue sur Telegram]\n\nVision Claude:\n${visionText}`;
        const ctx = await (0, context_builder_js_1.buildContext)(sessionId, fullMessage);
        const response = await chatWithFallback(ctx.messages, ctx.systemExtra, fullMessage, sessionId);
        // Envoyer la réponse de Dzaryx
        for (const chunk of splitMessage(response.text, 4000)) {
            await (0, telegram_js_1.sendMessage)(chatId, chunk);
        }
        // Uploader sur Cloudinary en background (pour les outils media si besoin)
        let imageUrl = '';
        if (cloudinary) {
            try {
                const uploadResult = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream({ resource_type: 'image', folder: 'telegram_images' }, (err, res) => { if (err)
                        reject(err);
                    else
                        resolve(res); });
                    stream.end(buffer);
                });
                imageUrl = uploadResult.secure_url;
            }
            catch { /* cloudinary optionnel */ }
        }
        await Promise.all([
            (0, supabase_js_1.saveConversationTurn)(sessionId, 'user', `[Photo Telegram${caption ? ` — "${caption}"` : ''}]\n${visionText.slice(0, 500)}`, { source: 'telegram', type: 'image', url: imageUrl, vision: visionText }),
            (0, supabase_js_1.saveConversationTurn)(sessionId, 'assistant', response.text, { source: 'telegram' }),
        ]).catch(e => console.error('[telegram] save error:', e));
    }
    catch (err) {
        console.error('[telegram] handleImageMessage error:', err instanceof Error ? err.message : String(err));
        await (0, telegram_js_1.sendMessage)(chatId, `⚠️ Erreur analyse photo: ${err instanceof Error ? err.message : String(err)}`);
    }
}
// ── Enregistrement document (passeport, permis, contrat) ──────
async function handleFileMessage(chatId, sessionId, msg) {
    const isAdmin = (0, env_js_1.isTelegramAdmin)(chatId);
    const ts = new Date().toISOString();
    try {
        console.log(`[TELEGRAM_RUNTIME] handler=file session=${sessionId} admin=${isAdmin} caption="${(msg.caption ?? '').slice(0, 40)}" vision=callVisionGemini`);
        await (0, telegram_js_1.sendTyping)(chatId);
        let fileId;
        let fileName;
        let mimeType;
        if (msg.photo && msg.photo.length > 0) {
            const largest = msg.photo[msg.photo.length - 1];
            if (!largest) {
                await (0, telegram_js_1.sendMessage)(chatId, '⚠️ Photo illisible.');
                return;
            }
            fileId = largest.file_id;
            fileName = `photo_${Date.now()}.jpg`;
            mimeType = 'image/jpeg';
        }
        else if (msg.document) {
            fileId = msg.document.file_id;
            fileName = msg.document.file_name ?? `doc_${Date.now()}`;
            mimeType = msg.document.mime_type ?? 'application/octet-stream';
        }
        else {
            return;
        }
        const caption = msg.caption ?? '';
        const { docType, clientName, clientPhone, bookingNote } = parseCaption(caption);
        // ── Non-admin gate: download + OCR only, no storage, masked preview ──────
        if (!isAdmin) {
            void (0, document_access_log_js_1.logDocumentAccess)({
                user_id: chatId, action: 'refused', doc_type: docType,
                client_name: clientName, client_phone: clientPhone,
                is_admin: false, masked: true, timestamp: ts,
            });
            await (0, telegram_js_1.sendMessage)(chatId, '🔒 *Accès refusé* — stockage de documents réservé au compte administrateur.\n' +
                'Ce document n\'a pas été enregistré. Contacte l\'admin pour valider.');
            return;
        }
        // ── Admin path: download, OCR, store, send back ───────────────────────────
        const buffer = await (0, telegram_js_1.downloadFile)(fileId);
        if (!buffer) {
            await (0, telegram_js_1.sendMessage)(chatId, '⚠️ Impossible de télécharger le fichier.');
            return;
        }
        await supabase_js_1.supabase.storage.createBucket(BUCKET, { public: true }).catch(() => { });
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const phone = clientPhone ?? 'inconnu';
        const storagePath = `${phone}/${docType}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase_js_1.supabase.storage
            .from(BUCKET)
            .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
        if (uploadError) {
            console.error('[telegram] Storage upload failed:', uploadError.message);
            await (0, telegram_js_1.sendMessage)(chatId, `⚠️ Erreur stockage: ${uploadError.message}`);
            return;
        }
        const { data: urlData } = supabase_js_1.supabase.storage.from(BUCKET).getPublicUrl(storagePath);
        // OCR automatique pour passeports et permis
        let ocrExtracted = {};
        let ocrText = '';
        if ((docType === 'passport' || docType === 'license') && mimeType.startsWith('image/')) {
            try {
                const base64Image = buffer.toString('base64');
                const prompt = docType === 'passport'
                    ? 'Extrais les infos de ce passeport. JSON UNIQUEMENT:\n{"name":"","passport_number":"","birth_date":"","expiry_date":"","nationality":""}'
                    : 'Extrais les infos de ce permis de conduire. JSON UNIQUEMENT:\n{"name":"","license_number":"","birth_date":"","expiry_date":"","category":""}';
                const raw = await callVisionGemini(base64Image, mimeType, 'IMPORTANT: Réponds uniquement avec du JSON pur, aucun texte supplémentaire.', prompt, 256);
                const match = raw.match(/\{[\s\S]*\}/);
                if (match) {
                    ocrExtracted = JSON.parse(match[0]);
                    // Admin: show full OCR. Non-admin: already blocked above, but mask as safety net.
                    const display = isAdmin ? ocrExtracted
                        : docType === 'passport' ? (0, document_mask_js_1.maskPassportOcr)(ocrExtracted)
                            : (0, document_mask_js_1.maskLicenseOcr)(ocrExtracted);
                    if (docType === 'passport') {
                        ocrText = `\n\n📋 *Info extraite:*\n• Nom: ${display['name'] || '?'}\n• N°: ${display['passport_number'] || '?'}\n• Né(e): ${display['birth_date'] || '?'}\n• Expire: ${display['expiry_date'] || '?'}\n• Nationalité: ${display['nationality'] || '?'}`;
                    }
                    else {
                        ocrText = `\n\n📋 *Info extraite:*\n• Nom: ${display['name'] || '?'}\n• N°: ${display['license_number'] || '?'}\n• Né(e): ${display['birth_date'] || '?'}\n• Expire: ${display['expiry_date'] || '?'}\n• Catégorie: ${display['category'] || '?'}`;
                    }
                }
            }
            catch (ocrErr) {
                console.error('[telegram] OCR failed:', ocrErr instanceof Error ? ocrErr.message : String(ocrErr));
            }
        }
        const notesValue = Object.keys(ocrExtracted).length > 0
            ? JSON.stringify(ocrExtracted)
            : (bookingNote ?? caption ?? null);
        // Auto-link: chercher la réservation active du client pour lier booking_id
        const resolvedName = clientName ?? ocrExtracted['name'] ?? null;
        const resolvedPhone = clientPhone ?? null;
        let linkedBookingId = null;
        let linkedBookingInfo = '';
        try {
            let bQuery = supabase_js_1.supabase
                .from('bookings')
                .select('id, client_name, cars(name), start_date, end_date')
                .in('status', ['CONFIRMED', 'ACTIVE', 'PENDING'])
                .order('start_date', { ascending: false })
                .limit(1);
            if (resolvedPhone) {
                bQuery = bQuery.ilike('client_phone', `%${resolvedPhone.replace(/\D/g, '').slice(-8)}%`);
            }
            else if (resolvedName) {
                const firstName = resolvedName.split(' ')[0] ?? '';
                bQuery = bQuery.ilike('client_name', `%${firstName}%`);
            }
            const { data: bookings } = await bQuery;
            if (bookings?.[0]) {
                const b = bookings[0];
                const carName = Array.isArray(b.cars) ? b.cars[0]?.name : b.cars?.name;
                linkedBookingId = b.id;
                linkedBookingInfo = ` | 🔗 Lié à: ${b.client_name} — ${carName ?? '?'} (${b.start_date} → ${b.end_date})`;
            }
        }
        catch { /* lookup optionnel */ }
        const { error: dbError } = await supabase_js_1.supabase.from('client_documents').insert({
            client_phone: phone,
            client_name: resolvedName ?? 'Inconnu',
            type: docType,
            file_url: urlData.publicUrl,
            storage_path: storagePath,
            notes: notesValue,
            ...(linkedBookingId ? { booking_id: linkedBookingId } : {}),
        });
        if (dbError)
            console.error('[telegram] DB insert failed:', dbError.message);
        void (0, document_access_log_js_1.logDocumentAccess)({
            user_id: chatId, action: 'store', doc_type: docType,
            client_name: resolvedName ?? undefined,
            client_phone: resolvedPhone ?? undefined,
            is_admin: true, masked: false, timestamp: ts,
        });
        const label = docType === 'passport' ? 'Passeport'
            : docType === 'license' ? 'Permis'
                : docType === 'contract' ? 'Contrat'
                    : 'Document';
        const nameStr = resolvedName ? ` de *${resolvedName}*` : '';
        const phoneStr = resolvedPhone ? ` (${resolvedPhone})` : '';
        const noteStr = bookingNote && !ocrText ? `\n📝 Note: ${bookingNote}` : '';
        await (0, telegram_js_1.sendMessage)(chatId, `✅ ${label}${nameStr}${phoneStr} enregistré.${noteStr}${ocrText}${linkedBookingInfo}`);
        // Renvoyer le fichier directement dans le chat — sendPhoto pour photo, sendDocument sinon
        const fileCaption = `📄 ${label}${nameStr}${phoneStr} — enregistré ✅`;
        if (msg.photo) {
            await (0, telegram_js_1.sendPhoto)(chatId, fileId, fileCaption);
        }
        else {
            await (0, telegram_js_1.sendDocument)(chatId, fileId, fileCaption);
        }
        await (0, supabase_js_1.saveConversationTurn)(sessionId, 'user', `[Document reçu: ${label}${nameStr}${phoneStr} — stocké dans Supabase Storage: ${urlData.publicUrl}]`, { source: 'telegram', type: 'document' });
    }
    catch (err) {
        console.error('[telegram] handleFileMessage error:', err instanceof Error ? err.message : String(err));
        await (0, telegram_js_1.sendMessage)(chatId, '⚠️ Erreur traitement fichier.');
    }
}
function parseCaption(caption) {
    const lower = caption.toLowerCase();
    let docType = 'other';
    if (/passport|passeport/.test(lower))
        docType = 'passport';
    else if (/permis|license|licence/.test(lower))
        docType = 'license';
    else if (/contrat|contract/.test(lower))
        docType = 'contract';
    const phoneMatch = caption.match(/(?:\+213|0)([\d\s]{8,11})/);
    const clientPhone = phoneMatch ? phoneMatch[0].replace(/\s/g, '') : undefined;
    const nameMatch = caption.match(/(?:pour|de|client)\s+([A-ZÀ-Ö][a-zà-ö]+(?:\s+[A-ZÀ-Ö][a-zà-ö]+)?)/i);
    const clientName = nameMatch ? nameMatch[1] : undefined;
    return { docType, clientName, clientPhone, bookingNote: caption || undefined };
}
// POST /api/telegram/setup
router.post('/setup', auth_js_1.requireMobileAuth, async (req, res) => {
    const { baseUrl } = req.body;
    const url = `${baseUrl ?? 'https://ibrahim-backend-production.up.railway.app'}/api/telegram/webhook`;
    const ok = await (0, telegram_js_1.setWebhook)(url, env_js_1.env.WEBHOOK_SECRET);
    res.json({ ok, webhookUrl: url });
});
// GET /api/telegram/setup
router.get('/setup', auth_js_1.requireMobileAuth, async (_req, res) => {
    const token = env_js_1.env.TELEGRAM_BOT_TOKEN ?? '';
    try {
        const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
        const { data } = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
        res.json(data);
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
function splitMessage(text, maxLen) {
    if (text.length <= maxLen)
        return [text];
    const parts = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            parts.push(remaining);
            break;
        }
        let cut = remaining.lastIndexOf('\n', maxLen);
        if (cut <= 0)
            cut = maxLen;
        parts.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut).trimStart();
    }
    return parts;
}
exports.default = router;
//# sourceMappingURL=telegram.js.map