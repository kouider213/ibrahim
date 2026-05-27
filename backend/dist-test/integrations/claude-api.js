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
exports.chatWithTools = chatWithTools;
exports.chat = chat;
exports.chatStream = chatStream;
exports.detectIntent = detectIntent;
exports.generateTikTokContent = generateTikTokContent;
exports.learnRule = learnRule;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const env_js_1 = require("../config/env.js");
const constants_js_1 = require("../config/constants.js");
const tools_js_1 = require("./tools.js");
const tool_executor_js_1 = require("./tool-executor.js");
const crypto_1 = require("crypto");
const compaction_js_1 = require("../conversation/compaction.js");
const client = new sdk_1.default({ apiKey: env_js_1.env.ANTHROPIC_API_KEY });
// ── System prompt avec cache_control — mis en cache côté Anthropic ──────────
const CACHED_SYSTEM = [
    {
        type: 'text',
        text: constants_js_1.Dzaryx.SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
    },
];
// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 1: FAST MODE — Questions simples = réponse ultra-rapide avec Haiku
// ══════════════════════════════════════════════════════════════════════════════
function isFastModeEligible(messages) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser)
        return false;
    const content = lastUser.content;
    const text = (typeof content === 'string' ? content : '').toLowerCase().trim();
    // Jamais fast mode pour les questions — nécessite contexte business + outils
    if (/^(qui|quel|quoi|comment|combien|où|quand|est-ce|pourquoi|lequel|laquelle|which|who|what|how|when|where|why|كم|من|ما|كيف|متى|أين)/i.test(text))
        return false;
    // Questions courtes (< 30 chars) sans action business
    if (text.length < 30) {
        const needsAction = /réserv|booking|modifi|change|crée|créer|créé|génère|générer|généré|génér|bon|bonz|voucher|contrat|supprimer|annuler|rapport|finance|combien|météo|actualité|cherche|search|trouve|image|photo|montre|envoie|rappel|remind|web|internet|info|client|voiture|doc|passeport|permis|agenda|paiement|facture/i.test(text);
        if (!needsAction)
            return true;
    }
    // Réponses purement conversationnelles — sans besoin d'outils
    const simplePatterns = /^(oui|non|ok|d'accord|parfait|merci|cool|super|nice|bien|compris|test|rien|salut|hello|bonjour|bonsoir|ciao|bye|wesh|salam|cv|ca va|ça va|\?|yo|ouais|nope|nan|quoi de neuf|quoi de 9|je t'écoute|alors)$/i;
    if (simplePatterns.test(text))
        return true;
    return false;
}
function analyzeComplexity(messages) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser)
        return { level: 'none', budget: 0 };
    const content = lastUser.content;
    const text = (typeof content === 'string' ? content : '').toLowerCase();
    // HIGH: Stratégie, optimisation, analyse approfondie
    if (/stratégi|optimis|analyse complète|plan d'action|business plan|prévision annuelle|comment améliorer|استراتيج|تحسين|تحليل|خطة|تطوير/i.test(text)) {
        return { level: 'high', budget: 10000 };
    }
    // MEDIUM: Tâches de codage — thinking aide à planifier avant d'écrire → moins d'erreurs → moins de redéploiements
    if (/debug.*erreur|typescript.*error|fix.*bug|implémenter.*feature|architecture|refactor|crée.*fichier|ajoute.*fonction|modifie.*code|écris.*fonction/i.test(text)) {
        return { level: 'medium', budget: 5000 };
    }
    // MEDIUM: Calculs financiers, comparaisons, rapports
    if (/combien.*gagn|bénéfice|rentabilité|comparaison|rapport financier|revenu.*mois|كم|ربح|مدخول|مقارنة|تقرير/i.test(text)) {
        return { level: 'medium', budget: 6000 };
    }
    if (/recommand|conseil|suggestion|meilleur|quel.*choix/i.test(text)) {
        return { level: 'medium', budget: 6000 };
    }
    // LOW: Questions de contexte, résumés
    if (/résumé|recap|qu'est-ce que|explique|c'est quoi|ملخص|اشرح/i.test(text)) {
        return { level: 'low', budget: 3000 };
    }
    // NONE: Questions factuelles, actions simples
    return { level: 'none', budget: 0 };
}
// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 4: WEB SEARCH NATIF ANTHROPIC — Server Tool automatique
// ══════════════════════════════════════════════════════════════════════════════
function needsWebSearch(messages) {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser)
        return false;
    const content = lastUser.content;
    const text = (typeof content === 'string' ? content : '').toLowerCase();
    const webSearchPatterns = /actualités?|news|dernières nouvelles|récent|aujourd'hui|cette semaine|ce mois|anthropic|claude.*nouveau|openai|gpt|prix.*actuel|cours|bourse|événement|match|score|météo.*monde|température.*à|qui a gagné|résultat|élection/i;
    return webSearchPatterns.test(text);
}
// Server tool web_search natif Anthropic
const ANTHROPIC_WEB_SEARCH_TOOL = {
    type: 'web_search_20250305',
    name: 'web_search',
};
// ── Extraction des citations depuis la réponse ────────────────────────────────
function extractCitations(content) {
    const citations = [];
    for (const block of content) {
        if (block.type === 'citation') {
            const citationBlock = block;
            citations.push({
                text: citationBlock.cited_text ?? '',
                source: citationBlock.source?.title ?? citationBlock.source?.url ?? 'source inconnue',
                startIndex: citationBlock.start_index ?? 0,
                endIndex: citationBlock.end_index ?? 0,
            });
        }
    }
    return citations;
}
// ── Tool-use chat (agentic loop) avec Tool Streaming + Compaction ────────────
async function chatWithTools(messages, systemExtra, sessionId, onToolStart, onToolDone, onTextChunk, imageBase64, imageMime, toolOverride) {
    const sid = sessionId ?? (0, crypto_1.randomUUID)();
    // ══════════════════════════════════════════════════════════════════════════
    // FAST MODE CHECK — Questions simples → Haiku sans outils
    // ══════════════════════════════════════════════════════════════════════════
    if (isFastModeEligible(messages)) {
        console.log('[claude] ⚡ FAST MODE: Question simple détectée');
        const systemBlocks = [...CACHED_SYSTEM];
        if (systemExtra)
            systemBlocks.push({ type: 'text', text: systemExtra });
        const response = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: systemBlocks,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
        });
        const text = response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');
        return {
            text,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            stopReason: response.stop_reason ?? 'end_turn',
            mode: 'fast',
            toolsExecuted: [], // fast mode: aucun outil appelé
        };
    }
    // ══════════════════════════════════════════════════════════════════════════
    // COMPACTION: Si historique trop long, résumer avant d'envoyer à Claude
    // ══════════════════════════════════════════════════════════════════════════
    let processedMessages = messages;
    if ((0, compaction_js_1.needsCompaction)(messages)) {
        console.log(`[compaction] Historique trop long (${messages.length} msgs) — compaction en cours…`);
        processedMessages = await (0, compaction_js_1.compactIfNeeded)(messages, sid);
        console.log(`[compaction] Réduit à ${processedMessages.length} messages`);
    }
    // Build system array with caching on the main system prompt
    const systemBlocks = [...CACHED_SYSTEM];
    if (systemExtra) {
        systemBlocks.push({ type: 'text', text: systemExtra });
    }
    // ══════════════════════════════════════════════════════════════════════════
    // ADAPTIVE THINKING: Ajuster le budget selon la complexité
    // ══════════════════════════════════════════════════════════════════════════
    const complexity = analyzeComplexity(processedMessages);
    const useThinking = complexity.level !== 'none';
    const thinkingBudget = complexity.budget;
    // ══════════════════════════════════════════════════════════════════════════
    // WEB SEARCH NATIF: Ajouter le server tool si nécessaire
    // ══════════════════════════════════════════════════════════════════════════
    const useWebSearch = needsWebSearch(processedMessages);
    // Phase 3: use agent-specific tool subset if provided, else full tool set
    const activeDzaryxTools = toolOverride ?? tools_js_1.Dzaryx_TOOLS;
    const baseTools = useWebSearch
        ? activeDzaryxTools.filter(t => t.name !== 'web_search')
        : activeDzaryxTools;
    const tools = useWebSearch
        ? [...baseTools, ANTHROPIC_WEB_SEARCH_TOOL]
        : baseTools;
    let apiMessages = processedMessages.map(m => ({
        role: m.role,
        content: m.content,
    }));
    // Guard: ignore oversized images (Claude limit ~5 MB decoded ≈ 6.7 MB base64)
    if (imageBase64 && imageBase64.length > 6_700_000) {
        console.warn('[vision] Image trop grande (%d chars b64) — ignorée', imageBase64.length);
        imageBase64 = undefined;
    }
    // Inject live camera frame into the last user message if provided
    if (imageBase64) {
        const mime = (imageMime ?? 'image/jpeg');
        const lastIdx = apiMessages.length - 1;
        const lastMsg = apiMessages[lastIdx];
        if (lastMsg && lastMsg.role === 'user') {
            const textContent = typeof lastMsg.content === 'string' ? lastMsg.content : '';
            apiMessages[lastIdx] = {
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: mime, data: imageBase64 } },
                    { type: 'text', text: textContent || '(Que vois-tu sur cette image ?)' },
                ],
            };
            console.log('[vision] 📷 Frame caméra injectée dans le message utilisateur');
        }
    }
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let thinkingTokens = 0;
    let finalText = '';
    let allCitations = [];
    const toolsExecuted = []; // ← tracking réel
    if (useThinking) {
        const lastContent = processedMessages[processedMessages.length - 1]?.content;
        const preview = typeof lastContent === 'string' ? lastContent.slice(0, 60) : '[image]';
        console.log(`[claude] 🧠 ADAPTIVE THINKING: ${complexity.level} (${thinkingBudget} tokens) pour: "${preview}..."`);
    }
    if (useWebSearch)
        console.log('[claude] 🌐 WEB SEARCH NATIF: Activé pour cette requête');
    // Agentic loop — max 30 tool rounds (more for coding tasks)
    const lastText = (processedMessages.at(-1)?.content ?? '').toString().toLowerCase();
    const isCodingTask = /code|fichier|github|modifier|écrire|lire|debug|railway|deploy|typescript|push|commit|programme|script/i.test(lastText);
    const maxRounds = isCodingTask ? 30 : 15;
    const loopDeadline = Date.now() + 5 * 60_000; // 5 min wall-clock max
    for (let round = 0; round < maxRounds; round++) {
        if (Date.now() > loopDeadline) {
            console.warn('[claude] ⏱ Wall-clock timeout — agentic loop interrompu après 5 min');
            break;
        }
        let response = null;
        let currentMessages = apiMessages;
        let streamChunkEmitted = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const createParams = {
                    model: 'claude-sonnet-4-6',
                    max_tokens: 16000,
                    system: systemBlocks,
                    tools: tools,
                    messages: currentMessages,
                };
                if (useThinking && thinkingBudget > 0) {
                    createParams.thinking = {
                        type: 'enabled',
                        budget_tokens: thinkingBudget,
                    };
                }
                const stream = client.messages.stream(createParams);
                for await (const event of stream) {
                    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                        streamChunkEmitted = true;
                        onTextChunk?.(event.delta.text);
                    }
                }
                response = await stream.finalMessage();
                break;
            }
            catch (err) {
                if (streamChunkEmitted)
                    throw err;
                const status = err.status;
                if (status === 429 && attempt < 2) {
                    console.warn(`[claude] Rate limit 429 — attente 65s (tentative ${attempt + 1}/3)`);
                    await new Promise(r => setTimeout(r, 65_000));
                }
                else if (status === 529 && attempt < 2) {
                    console.warn(`[claude] Overloaded 529 — attente 30s (tentative ${attempt + 1}/3)`);
                    await new Promise(r => setTimeout(r, 30_000));
                }
                else if (status === 422 && attempt < 2) {
                    console.warn('[claude] Context trop long 422 — emergency compaction');
                    const emergencyMessages = await (0, compaction_js_1.emergencyCompact)(currentMessages.map(m => ({
                        role: m.role,
                        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                    })), sid);
                    currentMessages = emergencyMessages.map(m => ({
                        role: m.role,
                        content: m.content,
                    }));
                    console.log(`[compaction] Emergency: réduit à ${currentMessages.length} messages`);
                }
                else {
                    throw err;
                }
            }
        }
        if (!response)
            throw new Error('Claude API unavailable after retries');
        inputTokens += response.usage.input_tokens;
        outputTokens += response.usage.output_tokens;
        const usage = response.usage;
        if (usage.cache_read_input_tokens)
            cacheReadTokens += usage.cache_read_input_tokens;
        if (usage.cache_creation_input_tokens)
            cacheWriteTokens += usage.cache_creation_input_tokens;
        if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
            console.log(`[claude-cache] read=${usage.cache_read_input_tokens ?? 0} write=${usage.cache_creation_input_tokens ?? 0} regular=${response.usage.input_tokens}`);
        }
        const thinkingBlocks = response.content.filter((b) => b.type === 'thinking');
        if (thinkingBlocks.length > 0) {
            const totalThinking = thinkingBlocks.reduce((sum, b) => sum + (b.thinking?.length ?? 0), 0);
            thinkingTokens += Math.ceil(totalThinking * 0.25);
            console.log(`[claude-thinking] ${thinkingBlocks.length} blocs de réflexion (${thinkingTokens} tokens estimés)`);
        }
        const textBlocks = response.content.filter(b => b.type === 'text');
        finalText = textBlocks.map(b => b.text).join('');
        const citations = extractCitations(response.content);
        if (citations.length > 0) {
            allCitations = [...allCitations, ...citations];
            console.log(`[claude-citations] ${citations.length} citation(s) extraite(s)`);
        }
        if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
            const mode = useThinking ? 'thinking' : 'normal';
            return {
                text: finalText,
                inputTokens,
                outputTokens,
                cacheReadTokens,
                cacheWriteTokens,
                thinkingTokens,
                stopReason: response.stop_reason,
                mode,
                citations: allCitations.length > 0 ? allCitations : undefined,
                toolsExecuted,
            };
        }
        if (response.stop_reason !== 'tool_use') {
            const mode = useThinking ? 'thinking' : 'normal';
            return {
                text: finalText,
                inputTokens,
                outputTokens,
                cacheReadTokens,
                cacheWriteTokens,
                thinkingTokens,
                stopReason: response.stop_reason ?? 'end_turn',
                mode,
                citations: allCitations.length > 0 ? allCitations : undefined,
                toolsExecuted,
            };
        }
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
        if (!toolUseBlocks.length)
            break;
        apiMessages = [...apiMessages, { role: 'assistant', content: response.content }];
        for (const block of toolUseBlocks) {
            if (onToolStart) {
                console.log(`[tool-stream] ▶ START: ${block.name}`);
                onToolStart(block.name, block.input);
            }
        }
        const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
            if (block.name === 'web_search') {
                console.log(`[tools] Server tool web_search exécuté par Anthropic`);
                return {
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: 'Recherche web effectuée par le serveur Anthropic.',
                };
            }
            console.log(`[tools] Executing: ${block.name}`, block.input);
            let raw;
            let toolSuccess = false;
            for (let t = 0;; t++) {
                try {
                    raw = await (0, tool_executor_js_1.executeTool)(block.name, block.input, sid);
                    // Considéré succès si pas de "Tool error:" et ne commence pas par ❌
                    toolSuccess = !raw.startsWith('Tool error:') && !raw.trimStart().startsWith('❌');
                    break;
                }
                catch (toolErr) {
                    if (t >= 2) {
                        raw = `Tool error: ${toolErr instanceof Error ? toolErr.message : String(toolErr)}`;
                        toolSuccess = false;
                        break;
                    }
                    await new Promise(r => setTimeout(r, 1_000 * 2 ** t));
                }
            }
            const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
            // ── Execution trace obligatoire ─────────────────────────────────
            toolsExecuted.push({ name: block.name, success: toolSuccess, result: content.slice(0, 300) });
            console.log(`[execution-trace] tool_name=${block.name} tool_called=true tool_success=${toolSuccess} result="${content.slice(0, 100).replace(/\n/g, '↵')}"`);
            console.log(`[tools] Result: ${content.slice(0, 200)}`);
            if (onToolDone) {
                console.log(`[tool-stream] ✅ DONE: ${block.name}`);
                onToolDone(block.name, content.slice(0, 500));
            }
            return {
                type: 'tool_result',
                tool_use_id: block.id,
                content,
            };
        }));
        apiMessages = [...apiMessages, { role: 'user', content: toolResults }];
    }
    const mode = useThinking ? 'thinking' : 'normal';
    return {
        text: finalText || 'Désolé, erreur interne.',
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        thinkingTokens,
        stopReason: 'end_turn',
        mode,
        citations: allCitations.length > 0 ? allCitations : undefined,
        toolsExecuted,
    };
}
// ── Simple chat (no tools) ────────────────────────────────────
async function chat(messages, systemExtra) {
    const systemBlocks = [...CACHED_SYSTEM];
    if (systemExtra)
        systemBlocks.push({ type: 'text', text: systemExtra });
    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemBlocks,
        messages,
    });
    const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    const today = new Date().toISOString().slice(0, 10);
    const { redis: r } = await Promise.resolve().then(() => __importStar(require('../queue/queue.js')));
    r.incrby(`claude:tokens:in:${today}`, response.usage.input_tokens).catch(() => { });
    r.incrby(`claude:tokens:out:${today}`, response.usage.output_tokens).catch(() => { });
    r.incr(`claude:calls:${today}`).catch(() => { });
    return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason ?? 'end_turn',
        toolsExecuted: [],
    };
}
// Streaming version — calls onChunk for each text delta, returns full response
async function chatStream(messages, systemExtra, onChunk) {
    const systemBlocks = [...CACHED_SYSTEM];
    if (systemExtra)
        systemBlocks.push({ type: 'text', text: systemExtra });
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = 'end_turn';
    const stream = client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemBlocks,
        messages,
    });
    for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            onChunk(event.delta.text);
        }
        else if (event.type === 'message_start') {
            inputTokens = event.message.usage.input_tokens;
        }
        else if (event.type === 'message_delta') {
            outputTokens = event.usage.output_tokens;
            stopReason = event.delta.stop_reason ?? 'end_turn';
        }
    }
    return { text: fullText, inputTokens, outputTokens, stopReason, toolsExecuted: [] };
}
async function detectIntent(userMessage, context) {
    const prompt = `Analyse ce message et retourne un JSON structuré pour exécuter l'action.

CONTEXTE ACTUEL (réservations, flotte, agenda):
${context}

Message utilisateur: "${userMessage}"

ACTIONS DISPONIBLES:
- update_reservation: params = { id (UUID de la réservation), + champs à modifier: client_name, end_date, start_date, car_id, final_price, rented_by, status, notes }
- create_reservation: params = { client_name, vehicle_id, vehicle_name, start_date, end_date, daily_rate }
- cancel_reservation: params = { id }
- list_reservations: params = { status?, vehicle_id?, date? }
- check_availability: params = { vehicle_id, start_date, end_date }
- get_financial_report: params = { year?, month? } — DÉCLENCHER POUR: "rapport financier", "combien j'ai gagné", "bénéfice depuis janvier", "total depuis début d'année", "part Houari", "part Kouider", "bilan", "chiffre d'affaires"
- set_booking_owner: params = { id, rented_by: "Kouider"|"Houari" }
- store_document: params = { clientPhone, clientName, type, fileName, base64 }
- read_site_file: params = { path }
- update_site_file: params = { path, content, message? }
- generate_tiktok: params = { topic, vehicle_name? }
- learn_rule: params = { instruction }
- reply_to_client: TOUJOURS requiresValidation=true

IMPORTANT: Si update_reservation → trouve l'ID UUID dans le contexte en cherchant par nom client ou véhicule mentionné.
IMPORTANT: Si message contient "depuis janvier", "début d'année", "cette année" → get_financial_report sans month param (rapport annuel).

Retourne UNIQUEMENT un JSON valide:
{
  "intent": "reservation|financial_report|content_generation|pc_command|query|conversation|rule_learning",
  "action": "action_name_or_null",
  "params": {},
  "requiresValidation": false,
  "reasoning": "courte explication"
}`;
    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
    });
    const res = {
        text: response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join(''),
    };
    try {
        const jsonMatch = res.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error('No JSON found');
        return JSON.parse(jsonMatch[0]);
    }
    catch {
        return { intent: 'conversation', requiresValidation: false };
    }
}
async function generateTikTokContent(topic, vehicleName) {
    const res = await chat([{
            role: 'user',
            content: `Crée un script TikTok engageant pour Fik Conciergerie Oran.
Sujet: ${topic}
${vehicleName ? `Véhicule: ${vehicleName}` : ''}
Format: accroche + contenu 30 secondes + CTA.
Style: énergie, luxe, algérien moderne.`,
        }]);
    return res.text;
}
async function learnRule(userInstruction) {
    const res = await chat([{
            role: 'user',
            content: `Transforme cette instruction métier en règle structurée JSON.

Instruction: "${userInstruction}"

Retourne UNIQUEMENT ce JSON:
{
  "category": "reservation|validation|pricing|communication|general",
  "rule": "description courte de la règle",
  "conditions": {},
  "action": {}
}`,
        }]);
    try {
        const jsonMatch = res.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error('No JSON');
        return JSON.parse(jsonMatch[0]);
    }
    catch {
        return {
            category: 'general',
            rule: userInstruction,
            conditions: {},
            action: {},
        };
    }
}
//# sourceMappingURL=claude-api.js.map