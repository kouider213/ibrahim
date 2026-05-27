"use strict";
/**
 * image-to-image.ts
 *
 * Pipeline image-to-image avec conservation du visage / identité.
 *
 * PROVIDERS (par ordre de préférence):
 *  1. fal-ai/ip-adapter-face-id   — face preservation forte (fal.ai)
 *  2. fal-ai/flux/dev/image-to-image — style transfer avec prompt (fal.ai)
 *  3. Replicate — tencentarc/photomaker — photo réaliste portrait (Replicate)
 *
 * Le pipeline:
 *  1. Reçoit une image (Telegram file_id OU URL publique)
 *  2. Télécharge et encode en base64
 *  3. Envoie au provider avec le prompt de transformation
 *  4. Retourne l'URL de l'image résultante
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadImageAsBase64 = downloadImageAsBase64;
exports.transformImage = transformImage;
exports.downloadTelegramImage = downloadTelegramImage;
exports.executeImageToImage = executeImageToImage;
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
const telegram_js_1 = require("./telegram.js");
// ── Style presets → prompt enrichi ────────────────────────────────────────────
const STYLE_PRESETS = {
    realistic: 'ultra-realistic photography, natural lighting, photorealistic, 4K, DSLR quality',
    anime: 'anime style, vibrant colors, cel shading, Studio Ghibli quality, detailed illustration',
    warrior: 'Algerian warrior costume, traditional North African attire, dramatic lighting, cinematic, epic portrait',
    background_only: 'keep the person exactly as-is, change only the background environment, photorealistic',
    cinematic: 'cinematic photography, film grain, dramatic lighting, movie scene, professional camera',
};
function buildPrompt(userPrompt, style) {
    const styleModifier = style ? (STYLE_PRESETS[style] ?? '') : '';
    const combined = styleModifier ? `${userPrompt}, ${styleModifier}` : userPrompt;
    return combined;
}
// ── Télécharger une image en base64 ──────────────────────────────────────────
async function downloadImageAsBase64(imageUrl) {
    const resp = await axios_1.default.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30_000,
    });
    const buf = Buffer.from(resp.data);
    const sizeKb = Math.round(buf.length / 1024);
    const contentType = resp.headers['content-type'] ?? 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();
    const base64 = buf.toString('base64');
    return { base64, mimeType, sizeKb };
}
// ── fal.ai queue helper (réutilisé depuis tool-executor) ─────────────────────
async function falGenerate(modelId, input, falKey, maxMs = 180_000) {
    let submitResp;
    try {
        submitResp = await axios_1.default.post(`https://queue.fal.run/${modelId}`, input, { headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' }, timeout: 30_000 });
    }
    catch (err) {
        if (err.response) {
            throw new Error(`fal.ai (${modelId}): HTTP ${err.response.status} — ${JSON.stringify(err.response.data).slice(0, 300)}`);
        }
        throw err;
    }
    const queued = submitResp.data;
    const { request_id, response_url, status_url } = queued;
    const pollUrl = status_url ?? `https://queue.fal.run/${modelId}/requests/${request_id}/status`;
    const resultUrl = response_url ?? `https://queue.fal.run/${modelId}/requests/${request_id}`;
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        await new Promise(r => setTimeout(r, 5000));
        const statusResp = await axios_1.default.get(pollUrl, {
            headers: { Authorization: `Key ${falKey}` },
            timeout: 15_000,
            validateStatus: () => true,
        });
        const jobStatus = statusResp.data?.status ?? '';
        if (jobStatus === 'COMPLETED')
            break;
        if (jobStatus === 'FAILED' || jobStatus === 'ERROR') {
            throw new Error(`fal.ai: job échoué (status=${jobStatus})`);
        }
    }
    const resultResp = await axios_1.default.get(resultUrl, {
        headers: { Authorization: `Key ${falKey}` },
        timeout: 15_000,
    });
    const result = resultResp.data;
    const images = result['images'];
    if (images?.[0]?.url)
        return images[0].url;
    const singleImage = result['image']?.url;
    if (singleImage)
        return singleImage;
    throw new Error(`fal.ai: aucune image dans la réponse — ${JSON.stringify(result).slice(0, 300)}`);
}
// ── Replicate helper ──────────────────────────────────────────────────────────
async function replicateGenerate(model, input, token, maxMs = 180_000) {
    const createResp = await axios_1.default.post(`https://api.replicate.com/v1/models/${model}/predictions`, { input }, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'wait=10',
        },
        timeout: 30_000,
    });
    let pred = createResp.data;
    if (pred.status === 'succeeded') {
        const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
        return String(out);
    }
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        await new Promise(r => setTimeout(r, 3000));
        const poll = await axios_1.default.get(`https://api.replicate.com/v1/predictions/${pred.id}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15_000,
        });
        pred = poll.data;
        if (pred.status === 'succeeded') {
            const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
            return String(out);
        }
        if (pred.status === 'failed' || pred.status === 'canceled') {
            throw new Error(`Replicate: ${pred.error ?? 'prediction failed'}`);
        }
    }
    throw new Error('Replicate: timeout après 3 minutes');
}
// ── PROVIDER 1: fal-ai/ip-adapter-face-id ────────────────────────────────────
// Conserve le visage exact de la personne, applique le prompt pour le reste
async function transformWithIpAdapter(sourceImageUrl, prompt, falKey) {
    console.log(`[i2i:ip-adapter] prompt="${prompt.slice(0, 80)}" sourceUrl=${sourceImageUrl.slice(0, 80)}`);
    // fal-ai/ip-adapter-face-id utilise des images de référence visage
    // Le modèle garde le visage et génère l'environnement selon le prompt
    const url = await falGenerate('fal-ai/ip-adapter-face-id', {
        face_image_url: sourceImageUrl,
        prompt,
        negative_prompt: 'deformed face, distorted features, ugly, blurry, low quality, cartoon, anime, painting, sketch',
        num_inference_steps: 30,
        guidance_scale: 7.5,
        face_strength: 1.0, // 1.0 = conservation maximale du visage
        image_strength: 0.6, // 0.6 = liberté de génération du décor
        num_images: 1,
    }, falKey, 180_000);
    console.log(`[i2i:ip-adapter] ✅ url=${url.slice(0, 80)}`);
    return url;
}
// ── PROVIDER 2: fal-ai/flux/dev/image-to-image ────────────────────────────────
// Style transfer fort avec fidélité variable au source
async function transformWithFlux(sourceImageUrl, prompt, strength, falKey) {
    console.log(`[i2i:flux] strength=${strength} prompt="${prompt.slice(0, 80)}"`);
    const url = await falGenerate('fal-ai/flux/dev/image-to-image', {
        image_url: sourceImageUrl,
        prompt,
        strength, // 0.0 = copie exacte, 1.0 = libre, 0.7 recommandé pour face
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        output_format: 'jpeg',
    }, falKey, 180_000);
    console.log(`[i2i:flux] ✅ url=${url.slice(0, 80)}`);
    return url;
}
// ── PROVIDER 3: Replicate — tencentarc/photomaker ────────────────────────────
// Modèle portrait haute fidélité — garde l'identité visuelle du sujet
async function transformWithPhotomaker(sourceImageUrl, prompt, replicateToken) {
    console.log(`[i2i:photomaker] prompt="${prompt.slice(0, 80)}"`);
    // PhotoMaker a besoin du token [img] dans le prompt pour marquer le sujet
    const photomakerPrompt = prompt.includes('[img]') ? prompt : `img ${prompt}`;
    const url = await replicateGenerate('tencentarc/photomaker', {
        prompt: photomakerPrompt,
        input_image: sourceImageUrl,
        num_steps: 20,
        style_strength_ratio: 20, // 20 = fidélité identité forte
        num_outputs: 1,
        guidance_scale: 5,
    }, replicateToken, 180_000);
    console.log(`[i2i:photomaker] ✅ url=${url.slice(0, 80)}`);
    return url;
}
// ── Fonction principale exportée ──────────────────────────────────────────────
async function transformImage(opts) {
    const falKey = env_js_1.env.FAL_KEY;
    const replicateKey = env_js_1.env.REPLICATE_API_TOKEN;
    const strength = opts.strength ?? 0.65;
    const forceProvider = opts.provider ?? 'auto';
    const fullPrompt = buildPrompt(opts.prompt, opts.style);
    console.log(`[i2i] sourceUrl=${opts.sourceImageUrl.slice(0, 80)}`);
    console.log(`[i2i] prompt="${fullPrompt.slice(0, 120)}" strength=${strength} provider=${forceProvider}`);
    // Vérifier l'image source
    try {
        await axios_1.default.head(opts.sourceImageUrl, { timeout: 8_000 });
    }
    catch (err) {
        throw new Error(`Image source inaccessible: ${err.message}`);
    }
    // ── PROVIDER FORCÉ ────────────────────────────────────────────────────────
    if (forceProvider === 'fal_ip_adapter') {
        if (!falKey)
            throw new Error('FAL_KEY non configurée dans Railway');
        const url = await transformWithIpAdapter(opts.sourceImageUrl, fullPrompt, falKey);
        return { url, provider: 'fal.ai IP-Adapter FaceID', mode: 'face-preservation' };
    }
    if (forceProvider === 'fal_flux') {
        if (!falKey)
            throw new Error('FAL_KEY non configurée dans Railway');
        const url = await transformWithFlux(opts.sourceImageUrl, fullPrompt, strength, falKey);
        return { url, provider: 'fal.ai Flux Dev I2I', mode: 'image-to-image' };
    }
    if (forceProvider === 'replicate') {
        if (!replicateKey)
            throw new Error('REPLICATE_API_TOKEN non configuré dans Railway');
        const url = await transformWithPhotomaker(opts.sourceImageUrl, fullPrompt, replicateKey);
        return { url, provider: 'Replicate PhotoMaker', mode: 'face-preservation' };
    }
    // ── AUTO: cascade IP-Adapter → Flux → PhotoMaker ─────────────────────────
    const errors = [];
    // 1. IP-Adapter FaceID (meilleure conservation visage)
    if (falKey) {
        try {
            const url = await transformWithIpAdapter(opts.sourceImageUrl, fullPrompt, falKey);
            return { url, provider: 'fal.ai IP-Adapter FaceID', mode: 'face-preservation' };
        }
        catch (err) {
            errors.push(`IP-Adapter: ${err.message}`);
            console.warn(`[i2i] IP-Adapter échoué → Flux fallback: ${err.message}`);
        }
    }
    // 2. Flux Dev image-to-image (bon équilibre fidélité/créativité)
    if (falKey) {
        try {
            const url = await transformWithFlux(opts.sourceImageUrl, fullPrompt, strength, falKey);
            return { url, provider: 'fal.ai Flux Dev I2I', mode: 'image-to-image' };
        }
        catch (err) {
            errors.push(`Flux: ${err.message}`);
            console.warn(`[i2i] Flux échoué → PhotoMaker fallback: ${err.message}`);
        }
    }
    // 3. PhotoMaker via Replicate (portrait haute fidélité)
    if (replicateKey) {
        try {
            const url = await transformWithPhotomaker(opts.sourceImageUrl, fullPrompt, replicateKey);
            return { url, provider: 'Replicate PhotoMaker', mode: 'face-preservation' };
        }
        catch (err) {
            errors.push(`PhotoMaker: ${err.message}`);
            console.error(`[i2i] PhotoMaker aussi échoué: ${err.message}`);
        }
    }
    if (!falKey && !replicateKey) {
        throw new Error('Aucun provider configuré. Ajoute FAL_KEY ou REPLICATE_API_TOKEN dans Railway → Variables.');
    }
    throw new Error(`Tous les providers ont échoué:\n${errors.join('\n')}`);
}
// ── Outil Telegram ─────────────────────────────────────────────────────────────
// Reçoit le file_id Telegram d'une image, la télécharge via Bot API, la transforme, renvoie
async function downloadTelegramImage(fileId) {
    const botToken = env_js_1.env.TELEGRAM_BOT_TOKEN;
    if (!botToken)
        throw new Error('TELEGRAM_BOT_TOKEN non configuré');
    const fileResp = await axios_1.default.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`, { timeout: 15_000 });
    const filePath = fileResp.data?.result?.file_path;
    if (!filePath)
        throw new Error('Impossible de récupérer le chemin du fichier Telegram');
    return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}
// ── Tool handler exporté (appelé depuis tool-executor.ts) ────────────────────
async function executeImageToImage(input, sessionId) {
    const chatId = sessionId?.startsWith('telegram_')
        ? sessionId.slice('telegram_'.length)
        : (env_js_1.env.TELEGRAM_CHAT_ID ?? '');
    // Récupérer l'image source
    let sourceImageUrl = input['image_url'];
    const telegramFileId = input['telegram_file_id'];
    // Si Telegram file_id fourni → convertir en URL
    if (!sourceImageUrl && telegramFileId) {
        try {
            sourceImageUrl = await downloadTelegramImage(telegramFileId);
        }
        catch (err) {
            return `❌ Impossible de télécharger l'image Telegram: ${err.message}`;
        }
    }
    if (!sourceImageUrl) {
        return '❌ image_url ou telegram_file_id requis — envoie une photo puis utilise cet outil.';
    }
    const userPrompt = input['prompt'] ?? '';
    if (!userPrompt) {
        return '❌ prompt requis — décris la transformation souhaitée (ex: "enfant dans une savane avec un lion, ambiance cinématique réaliste")';
    }
    const style = input['style'];
    const strength = input['strength'] ? Number(input['strength']) : undefined;
    const provider = input['provider'] ?? 'auto';
    // Notification
    if (chatId) {
        await (0, telegram_js_1.sendMessage)(chatId, `🎨 *Transformation image IA*\n_"${userPrompt.slice(0, 80)}"_\n${style ? `Style: ${style} | ` : ''}Provider: ${provider}\n⏳ 20-60 secondes...`).catch(() => { });
    }
    console.log(`[executeImageToImage] sourceUrl=${sourceImageUrl.slice(0, 80)} prompt="${userPrompt.slice(0, 80)}" style=${style} provider=${provider}`);
    let result;
    try {
        result = await transformImage({
            sourceImageUrl,
            prompt: userPrompt,
            strength,
            style,
            provider,
        });
    }
    catch (err) {
        const errMsg = err.message;
        console.error('[executeImageToImage] FAILED:', errMsg);
        if (chatId) {
            await (0, telegram_js_1.sendMessage)(chatId, `❌ Transformation échouée: ${errMsg.slice(0, 200)}`).catch(() => { });
        }
        return `❌ Transformation image échouée: ${errMsg.slice(0, 300)}`;
    }
    console.log(`[executeImageToImage] ✅ provider=${result.provider} mode=${result.mode} url=${result.url.slice(0, 80)}`);
    // Envoyer le résultat sur Telegram
    const caption = [
        `🎨 *Image transformée — ${result.provider}*`,
        `_Mode: ${result.mode}_`,
        `_Prompt: "${userPrompt.slice(0, 80)}"_`,
    ].join('\n');
    let delivered = false;
    if (chatId) {
        try {
            await (0, telegram_js_1.sendPhoto)(chatId, result.url, caption);
            delivered = true;
        }
        catch (err) {
            console.error('[executeImageToImage] sendTelegramPhoto failed:', err.message);
            try {
                await (0, telegram_js_1.sendMessage)(chatId, `${caption}\n\n📎 [Voir l'image](${result.url})`);
                delivered = true;
            }
            catch { /* both failed */ }
        }
    }
    if (delivered) {
        return [
            `✅ Image transformée par ${result.provider} (${result.mode})`,
            `🖼️ Envoyée sur Telegram ↑`,
            ``,
            `📊 Détails:`,
            `- Provider: ${result.provider}`,
            `- Mode: ${result.mode}`,
            `- Prompt: "${userPrompt.slice(0, 100)}"`,
            `- Style: ${style ?? 'aucun'}`,
            `- URL: ${result.url}`,
        ].join('\n');
    }
    return [
        `✅ Image transformée par ${result.provider} (${result.mode})`,
        `⚠️ Envoi Telegram échoué — URL directe:`,
        result.url,
    ].join('\n');
}
//# sourceMappingURL=image-to-image.js.map