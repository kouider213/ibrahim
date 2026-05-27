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
const llm_router_js_1 = require("../../integrations/llm-router.js");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const env_js_1 = require("../../config/env.js");
const anthropic = new sdk_1.default({ apiKey: env_js_1.env.ANTHROPIC_API_KEY });
const router = (0, express_1.Router)();
const SMART_VISION_PROMPT = `Tu es Dzaryx, assistant IA avec vision. Analyse cette image et donne une réponse concise en français (max 3 phrases) adaptée à ce que tu vois.

RÈGLES SELON CE QUE TU DÉTECTES:

1. PASSEPORT / CARTE D'IDENTITÉ / PERMIS DE CONDUIRE:
   → Extrais immédiatement: nom complet, numéro, date naissance, nationalité, expiration
   → Format: "Passeport de [NOM]. Numéro [X], né le [X], expire le [X]."
   → Si illisible: dis-le clairement

2. VOITURE / VÉHICULE:
   → Identifie le modèle si possible
   → Évalue l'état: dommages visibles, égratignures, bosses
   → Format: "Je vois [MODÈLE]. [État général]."

3. DOCUMENT / CONTRAT / PAPIER TEXTE:
   → Lis et résume le contenu principal
   → Traduis si c'est en arabe ou autre langue

4. TEXTE EN ARABE:
   → Traduis en français immédiatement

5. REÇU / FACTURE / PRIX:
   → Lis les montants et informations clés

6. AUTRE:
   → Décris naturellement et utilement en 1-2 phrases

IMPORTANT: Sois direct, précis, actionnable. Parle comme si tu aidais quelqu'un en temps réel.`;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
function sanitizeMime(m) {
    return (ALLOWED_MIMES.has(m ?? '') ? m : 'image/jpeg');
}
// Vision: Gemini Flash Vision primary, OpenAI Vision fallback — never Anthropic direct
async function analyzeImageWithFallback(imageBase64, mime, systemExtra, userPrompt, _maxTokens) {
    if ((0, llm_router_js_1.isGeminiAvailable)()) {
        try {
            const text = await (0, llm_router_js_1.callGemini)(userPrompt, systemExtra, imageBase64, mime);
            console.log('[AI_ROUTER] task=vision provider=gemini fallback_reason=primary route=vision.ts');
            return text;
        }
        catch (gErr) {
            const _gAxErr = gErr;
            console.warn(`[AI_ROUTER] task=vision provider=gemini FAILED status=${_gAxErr.response?.status ?? 'network'} body=${JSON.stringify(_gAxErr.response?.data ?? {}).slice(0, 150)} — trying openai`);
        }
    }
    if ((0, llm_router_js_1.isOpenAIAvailable)()) {
        try {
            const text = await (0, llm_router_js_1.callOpenAIVision)(userPrompt, systemExtra, imageBase64, mime);
            console.log('[AI_ROUTER] task=vision provider=openai fallback_reason=gemini_failed route=vision.ts');
            return text;
        }
        catch (oErr) {
            const _oAxErr = oErr;
            console.warn(`[AI_ROUTER] task=vision provider=openai FAILED status=${_oAxErr.response?.status ?? 'network'} body=${JSON.stringify(_oAxErr.response?.data ?? {}).slice(0, 150)}`);
        }
    }
    // Claude Vision fallback — Haiku (cheap, natively supports images)
    if (env_js_1.env.ANTHROPIC_API_KEY) {
        try {
            const r = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: _maxTokens,
                system: systemExtra,
                messages: [{
                        role: 'user',
                        content: [
                            { type: 'image', source: { type: 'base64', media_type: mime, data: imageBase64 } },
                            { type: 'text', text: userPrompt },
                        ],
                    }],
            });
            console.log('[AI_ROUTER] task=vision provider=claude-haiku fallback_reason=gemini+openai_failed route=vision.ts');
            return r.content[0].text.trim();
        }
        catch (cErr) {
            console.error('[AI_ROUTER] task=vision provider=claude-haiku FAILED:', cErr instanceof Error ? cErr.message : cErr);
        }
    }
    console.error(`[AI_ROUTER] task=vision ALL_PROVIDERS_FAILED gemini=${(0, llm_router_js_1.isGeminiAvailable)()} openai=${(0, llm_router_js_1.isOpenAIAvailable)()} anthropic=${!!env_js_1.env.ANTHROPIC_API_KEY}`);
    throw new Error('Vision indisponible: Gemini, OpenAI et Claude ont tous échoué.');
}
// POST /api/vision/analyze — original endpoint (kept for compatibility)
router.post('/analyze', async (req, res) => {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
        res.status(400).json({ error: 'imageBase64 required' });
        return;
    }
    const mime = sanitizeMime(mimeType);
    console.log(`[MOBILE_RUNTIME] channel=mobile endpoint=/api/vision/analyze task=vision len=${imageBase64.length} mime=${mime}`);
    try {
        const text = await analyzeImageWithFallback(imageBase64, mime, SMART_VISION_PROMPT, 'Analyse cette image.', 300);
        console.log(`[MOBILE_RUNTIME] endpoint=/api/vision/analyze task=vision status=success chars=${text.length}`);
        res.json({ description: text });
    }
    catch (err) {
        console.error(`[MOBILE_RUNTIME] endpoint=/api/vision/analyze task=vision status=FAILED error="${err instanceof Error ? err.message : String(err)}"`);
        res.status(500).json({ error: 'Vision indisponible. Réessaie dans quelques secondes.' });
    }
});
// POST /api/vision/scan — real-time SCAN endpoint with document detection
router.post('/scan', async (req, res) => {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
        res.status(400).json({ error: 'imageBase64 required' });
        return;
    }
    const mime = sanitizeMime(mimeType);
    console.log(`[MOBILE_RUNTIME] channel=mobile endpoint=/api/vision/scan task=vision len=${imageBase64.length} mime=${mime}`);
    try {
        // Step 1: detect what's in the image
        const detectedRaw = await analyzeImageWithFallback(imageBase64, mime, 'Réponds avec UN seul mot en majuscules: PASSPORT, LICENSE, CONTRACT, VEHICLE, ARABIC, RECEIPT, or SCENE.', 'What type of content is in this image?', 50);
        const detectedType = detectedRaw.trim().toUpperCase().split(/\s/)[0] ?? 'SCENE';
        // Step 2: Smart analysis based on type
        let prompt = SMART_VISION_PROMPT;
        let maxTokens = 300;
        if (['PASSPORT', 'LICENSE'].includes(detectedType)) {
            prompt = `Extrais TOUTES les informations de ce document d'identité en français.
Format JSON STRICT dans ta réponse (entouré de backticks):
\`\`\`json
{"type":"passport","name":"","document_number":"","birth_date":"","expiry_date":"","nationality":"","readable":true}
\`\`\`
Puis une phrase naturelle résumant le document pour être lue à voix haute.`;
            maxTokens = 400;
        }
        else if (detectedType === 'VEHICLE') {
            prompt = `Analyse ce véhicule. Identifie:
1. Le modèle/marque si visible
2. La couleur
3. L'état général: dommages, bosses, égratignures
Réponds en 2 phrases max, naturellement, comme si tu décrivais à quelqu'un en direct.`;
            maxTokens = 200;
        }
        else if (detectedType === 'ARABIC') {
            prompt = 'Traduis ce texte arabe en français. Donne la traduction directement, sans introduction.';
            maxTokens = 300;
        }
        else if (detectedType === 'RECEIPT') {
            prompt = 'Lis ce reçu/facture. Indique le total, la date, et les articles principaux en 2 phrases.';
            maxTokens = 200;
        }
        const rawText = await analyzeImageWithFallback(imageBase64, mime, '', prompt, maxTokens);
        // Extract JSON if document
        let extractedData = null;
        let spokenText = rawText;
        if (['PASSPORT', 'LICENSE'].includes(detectedType)) {
            const match = rawText.match(/```json\s*([\s\S]*?)```/);
            if (match) {
                try {
                    extractedData = JSON.parse(match[1]);
                }
                catch { /* ignore */ }
            }
            spokenText = rawText.replace(/```json[\s\S]*?```/g, '').trim();
            if (!spokenText && extractedData) {
                const name = extractedData['name'] || '';
                const num = extractedData['document_number'] || '';
                spokenText = `Document de ${name}${num ? `, numéro ${num}` : ''}. Voulez-vous que je l'enregistre ?`;
            }
        }
        res.json({
            description: spokenText,
            type: detectedType.toLowerCase(),
            extractedData: extractedData ?? undefined,
        });
    }
    catch (err) {
        console.error(`[MOBILE_RUNTIME] endpoint=/api/vision/scan task=vision status=FAILED error="${err instanceof Error ? err.message : String(err)}"`);
        res.status(500).json({ error: 'Vision indisponible. Réessaie dans quelques secondes.' });
    }
});
// ── Live relay: forward camera frame from app to NEXUS PC ────────────────────
router.post('/relay-frame', async (req, res) => {
    res.sendStatus(200); // Respond immediately — no blocking
    const { data } = req.body;
    if (!data)
        return;
    try {
        const { isNexusOnline, sendToNexus } = await Promise.resolve().then(() => __importStar(require('../../actions/handlers/nexus-relay.js')));
        if (isNexusOnline()) {
            sendToNexus('nexus:live_frame', { data });
        }
    }
    catch (_) { }
});
exports.default = router;
//# sourceMappingURL=vision.js.map