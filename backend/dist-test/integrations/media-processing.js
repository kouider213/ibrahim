"use strict";
/**
 * PHASE 14 — Traitement Image & Vidéo
 *
 * Module de traitement média pour Dzaryx
 * - Images: optimisation, redimensionnement, amélioration, variants sociaux
 * - Vidéos: découpe, sous-titres auto, optimisation plateforme, montage
 *
 * APIs utilisées:
 * - Cloudinary (images + vidéos)
 * - AssemblyAI (sous-titres automatiques)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeImage = analyzeImage;
exports.optimizeImage = optimizeImage;
exports.createSocialVariants = createSocialVariants;
exports.enhanceImage = enhanceImage;
exports.removeBackground = removeBackground;
exports.addTextOverlay = addTextOverlay;
exports.analyzeVideo = analyzeVideo;
exports.cutVideo = cutVideo;
exports.mergeVideos = mergeVideos;
exports.addSubtitles = addSubtitles;
exports.optimizeForPlatform = optimizeForPlatform;
exports.extractThumbnail = extractThumbnail;
exports.createVideoPreview = createVideoPreview;
exports.generateTikTokVideo = generateTikTokVideo;
exports.addBackgroundMusicUrl = addBackgroundMusicUrl;
const cloudinary_1 = require("cloudinary");
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
// ─── Configuration Cloudinary ────────────────────────────────────
cloudinary_1.v2.config({
    cloud_name: env_js_1.env.CLOUDINARY_CLOUD_NAME ?? '',
    api_key: env_js_1.env.CLOUDINARY_API_KEY ?? '',
    api_secret: env_js_1.env.CLOUDINARY_API_SECRET ?? '',
    secure: true,
});
const ASSEMBLYAI_API_KEY = env_js_1.env.ASSEMBLYAI_API_KEY ?? '';
// ─── IMAGE — Analyse ──────────────────────────────────────────────
async function analyzeImage(imageUrl) {
    try {
        // Upload vers Cloudinary pour analyse
        const result = await cloudinary_1.v2.uploader.upload(imageUrl, {
            resource_type: 'image',
            quality_analysis: true,
        });
        const sizeKB = result.bytes / 1024;
        const suggestions = [];
        // Analyse qualité
        let qualityScore = 70;
        if (result.width < 1080) {
            suggestions.push('⚠️ Résolution faible — idéal: min 1080px largeur');
            qualityScore -= 20;
        }
        if (sizeKB > 1000) {
            suggestions.push('📦 Fichier volumineux — compression recommandée');
            qualityScore -= 10;
        }
        if (result.format === 'png' && sizeKB > 500) {
            suggestions.push('🔄 Conversion PNG→JPG recommandée (réduction taille)');
        }
        if (result.width > 3000) {
            suggestions.push('✨ Haute résolution — excellent pour print/web');
            qualityScore += 20;
        }
        return {
            url: result.secure_url,
            format: result.format,
            width: result.width,
            height: result.height,
            size_kb: Math.round(sizeKB),
            quality_score: Math.min(100, qualityScore),
            suggestions,
        };
    }
    catch (error) {
        throw new Error(`Erreur analyse image: ${error.message}`);
    }
}
// ─── IMAGE — Optimisation ─────────────────────────────────────────
async function optimizeImage(imageUrl, usage = 'web') {
    try {
        const originalUpload = await cloudinary_1.v2.uploader.upload(imageUrl, {
            resource_type: 'image',
        });
        // Paramètres selon usage
        let quality = 'auto:good';
        let format = 'auto';
        let width;
        if (usage === 'web') {
            quality = 'auto:good';
            width = 1920;
        }
        else if (usage === 'social') {
            quality = 'auto:best';
            width = 1080;
        }
        else if (usage === 'print') {
            quality = 90;
            width = 3000;
        }
        const optimizedUrl = cloudinary_1.v2.url(originalUpload.public_id, {
            quality,
            format,
            width,
            crop: 'limit',
            fetch_format: 'auto',
        });
        // Estimation réduction (Cloudinary optimise automatiquement)
        const reductionPercent = usage === 'web' ? 40 : usage === 'social' ? 30 : 10;
        return {
            url: optimizedUrl,
            size_reduction_percent: reductionPercent,
        };
    }
    catch (error) {
        throw new Error(`Erreur optimisation image: ${error.message}`);
    }
}
// ─── IMAGE — Variants sociaux ─────────────────────────────────────
async function createSocialVariants(imageUrl) {
    try {
        const upload = await cloudinary_1.v2.uploader.upload(imageUrl, {
            resource_type: 'image',
        });
        const publicId = upload.public_id;
        return {
            // TikTok / Instagram Reels (9:16)
            tiktok: cloudinary_1.v2.url(publicId, {
                width: 1080,
                height: 1920,
                crop: 'fill',
                gravity: 'auto',
                quality: 'auto:best',
            }),
            // Instagram Feed (1:1)
            instagram_feed: cloudinary_1.v2.url(publicId, {
                width: 1080,
                height: 1080,
                crop: 'fill',
                gravity: 'auto',
                quality: 'auto:best',
            }),
            // Instagram Story (9:16)
            instagram_story: cloudinary_1.v2.url(publicId, {
                width: 1080,
                height: 1920,
                crop: 'fill',
                gravity: 'auto',
                quality: 'auto:best',
            }),
            // YouTube (16:9)
            youtube: cloudinary_1.v2.url(publicId, {
                width: 1920,
                height: 1080,
                crop: 'fill',
                gravity: 'auto',
                quality: 'auto:best',
            }),
        };
    }
    catch (error) {
        throw new Error(`Erreur création variants: ${error.message}`);
    }
}
// ─── IMAGE — Amélioration ─────────────────────────────────────────
async function enhanceImage(imageUrl) {
    try {
        const upload = await cloudinary_1.v2.uploader.upload(imageUrl, {
            resource_type: 'image',
        });
        // Amélioration automatique (contraste, luminosité, netteté)
        return cloudinary_1.v2.url(upload.public_id, {
            effect: 'improve',
            quality: 'auto:best',
            fetch_format: 'auto',
        });
    }
    catch (error) {
        throw new Error(`Erreur amélioration image: ${error.message}`);
    }
}
// ─── IMAGE — Suppression fond ─────────────────────────────────────
async function removeBackground(imageUrl) {
    try {
        const upload = await cloudinary_1.v2.uploader.upload(imageUrl, {
            resource_type: 'image',
        });
        // Suppression fond via Cloudinary AI
        return cloudinary_1.v2.url(upload.public_id, {
            effect: 'background_removal',
            format: 'png',
            quality: 'auto:best',
        });
    }
    catch (error) {
        throw new Error(`Erreur suppression fond: ${error.message}`);
    }
}
// ─── IMAGE — Texte overlay ────────────────────────────────────────
async function addTextOverlay(imageUrl, text, position = 'bottom') {
    try {
        const upload = await cloudinary_1.v2.uploader.upload(imageUrl, {
            resource_type: 'image',
        });
        let gravity = 'south';
        if (position === 'top')
            gravity = 'north';
        if (position === 'center')
            gravity = 'center';
        return cloudinary_1.v2.url(upload.public_id, {
            overlay: {
                text,
                font_family: 'Arial',
                font_size: 60,
                font_weight: 'bold',
            },
            gravity,
            y: 40,
            color: '#FFFFFF',
            effect: 'shadow',
        });
    }
    catch (error) {
        throw new Error(`Erreur ajout texte: ${error.message}`);
    }
}
// ─── VIDÉO — Analyse ──────────────────────────────────────────────
async function analyzeVideo(videoUrl) {
    try {
        const result = await cloudinary_1.v2.uploader.upload(videoUrl, {
            resource_type: 'video',
        });
        const sizeMB = result.bytes / (1024 * 1024);
        const suggestions = [];
        // Analyse
        if (result.duration > 60 && result.width < 1080) {
            suggestions.push('⚠️ Vidéo longue en basse résolution — compression recommandée');
        }
        if (sizeMB > 100) {
            suggestions.push('📦 Fichier très volumineux — optimisation nécessaire');
        }
        if (result.duration > 180) {
            suggestions.push('⏱️ Durée longue — créer des clips courts pour réseaux sociaux');
        }
        if (result.width >= 1920) {
            suggestions.push('✨ Excellente qualité vidéo');
        }
        return {
            url: result.secure_url,
            format: result.format,
            duration_seconds: Math.round(result.duration),
            width: result.width,
            height: result.height,
            size_mb: Math.round(sizeMB),
            fps: result.frame_rate || 30,
            bitrate: result.bit_rate || 'unknown',
            suggestions,
        };
    }
    catch (error) {
        throw new Error(`Erreur analyse vidéo: ${error.message}`);
    }
}
// ─── Helper: extraire le public_id d'une URL Cloudinary ──────────
function extractPublicId(url) {
    const uploadIdx = url.indexOf('/upload/');
    if (uploadIdx === -1)
        return null;
    let path = url.slice(uploadIdx + 8); // tout après "/upload/"
    // Supprimer le préfixe de version (ex: "v1234567890/")
    path = path.replace(/^v\d+\//, '');
    // Supprimer l'extension finale (.mp4, .mov, .jpg…)
    path = path.replace(/\.[^./]+$/, '');
    return path || null;
}
// ─── VIDÉO — Découpe ──────────────────────────────────────────────
async function cutVideo(videoUrl, startSeconds, endSeconds) {
    try {
        let publicId = null;
        if (videoUrl.includes('cloudinary.com')) {
            publicId = extractPublicId(videoUrl);
            console.log(`[media] cutVideo — extracted public_id: "${publicId}" from URL: ${videoUrl}`);
        }
        if (!publicId) {
            const upload = await cloudinary_1.v2.uploader.upload(videoUrl, { resource_type: 'video' });
            publicId = upload.public_id;
            console.log(`[media] cutVideo — uploaded, public_id: "${publicId}"`);
        }
        const transformed = cloudinary_1.v2.url(publicId, {
            resource_type: 'video',
            transformation: [{ start_offset: startSeconds, end_offset: endSeconds, quality: 'auto' }],
            format: 'mp4',
            secure: true,
        });
        console.log(`[media] cutVideo — result URL: ${transformed}`);
        return transformed;
    }
    catch (error) {
        throw new Error(`Erreur découpe vidéo: ${error.message}`);
    }
}
// ─── VIDÉO — Fusion ───────────────────────────────────────────────
async function mergeVideos(videoUrls) {
    try {
        if (videoUrls.length < 2) {
            throw new Error('Minimum 2 vidéos requises pour fusion');
        }
        const uploads = await Promise.all(videoUrls.map(url => cloudinary_1.v2.uploader.upload(url, { resource_type: 'video' })));
        const [first, ...rest] = uploads;
        const transformation = [];
        for (const upload of rest) {
            transformation.push({ flags: 'splice', overlay: `video:${upload.public_id.replace(/\//g, ':')}` }, { flags: 'layer_apply' });
        }
        return cloudinary_1.v2.url(first.public_id, { resource_type: 'video', transformation });
    }
    catch (error) {
        throw new Error(`Erreur fusion vidéos: ${error.message}`);
    }
}
// ─── VIDÉO — Sous-titres (AssemblyAI) ─────────────────────────────
async function addSubtitles(videoUrl, language = 'fr') {
    try {
        if (!ASSEMBLYAI_API_KEY) {
            throw new Error('ASSEMBLYAI_API_KEY non configuré');
        }
        // Upload vidéo sur Cloudinary
        const videoUpload = await cloudinary_1.v2.uploader.upload(videoUrl, {
            resource_type: 'video',
        });
        // Extraction audio (AssemblyAI travaille sur audio)
        const audioUrl = cloudinary_1.v2.url(videoUpload.public_id, {
            resource_type: 'video',
            format: 'mp3',
        });
        // Télécharger audio
        const audioResponse = await axios_1.default.get(audioUrl, { responseType: 'arraybuffer' });
        const audioBuffer = Buffer.from(audioResponse.data);
        // Upload audio vers AssemblyAI
        const uploadResponse = await axios_1.default.post('https://api.assemblyai.com/v2/upload', audioBuffer, {
            headers: {
                authorization: ASSEMBLYAI_API_KEY,
                'content-type': 'application/octet-stream',
            },
        });
        const uploadUrl = uploadResponse.data.upload_url;
        // Demander transcription
        const transcriptResponse = await axios_1.default.post('https://api.assemblyai.com/v2/transcript', {
            audio_url: uploadUrl,
            language_code: language === 'fr' ? 'fr' : language === 'ar' ? 'ar' : 'en',
        }, {
            headers: {
                authorization: ASSEMBLYAI_API_KEY,
                'content-type': 'application/json',
            },
        });
        const transcriptId = transcriptResponse.data.id;
        // Attendre transcription (polling)
        let transcriptData;
        let attempts = 0;
        while (attempts < 60) {
            const statusResponse = await axios_1.default.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
                headers: { authorization: ASSEMBLYAI_API_KEY },
            });
            transcriptData = statusResponse.data;
            if (transcriptData.status === 'completed')
                break;
            if (transcriptData.status === 'error') {
                throw new Error('Erreur transcription AssemblyAI');
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;
        }
        if (!transcriptData || transcriptData.status !== 'completed') {
            throw new Error('Timeout transcription');
        }
        const srtContent = generateSRT(transcriptData.words || []);
        // Upload SRT to Cloudinary then overlay on video
        const srtPublicId = `subtitles/${Date.now()}`;
        await new Promise((resolve, reject) => {
            const stream = cloudinary_1.v2.uploader.upload_stream({ resource_type: 'raw', public_id: srtPublicId, format: 'srt' }, (err) => err ? reject(err) : resolve());
            stream.end(Buffer.from(srtContent));
        });
        const videoWithSubs = cloudinary_1.v2.url(videoUpload.public_id, {
            resource_type: 'video',
            transformation: [
                { overlay: { public_id: srtPublicId, resource_type: 'subtitles' } },
                { flags: 'layer_apply' },
            ],
        });
        return {
            video_url: videoWithSubs,
            subtitles_url: 'data:text/plain;base64,' + Buffer.from(srtContent).toString('base64'),
            transcription: transcriptData.text || '',
        };
    }
    catch (error) {
        throw new Error(`Erreur sous-titres: ${error.message}`);
    }
}
// ─── VIDÉO — Optimisation plateforme ──────────────────────────────
async function optimizeForPlatform(videoUrl, platform) {
    try {
        const specs = {
            tiktok: { width: 1080, height: 1920, end_offset: 60 },
            instagram: { width: 1080, height: 1920, end_offset: 90 },
            youtube: { width: 1920, height: 1080 },
        };
        const s = specs[platform];
        let publicId = videoUrl.includes('cloudinary.com') ? extractPublicId(videoUrl) : null;
        if (!publicId) {
            const upload = await cloudinary_1.v2.uploader.upload(videoUrl, { resource_type: 'video' });
            publicId = upload.public_id;
        }
        const tf = { width: s.width, height: s.height, crop: 'fill', gravity: 'auto', quality: 'auto' };
        if (s.end_offset)
            tf['end_offset'] = s.end_offset;
        return cloudinary_1.v2.url(publicId, {
            resource_type: 'video',
            transformation: [tf],
            format: 'mp4',
            secure: true,
        });
    }
    catch (error) {
        throw new Error(`Erreur optimisation plateforme: ${error.message}`);
    }
}
// ─── VIDÉO — Miniature ────────────────────────────────────────────
async function extractThumbnail(videoUrl, timeSeconds = 0) {
    try {
        const upload = await cloudinary_1.v2.uploader.upload(videoUrl, {
            resource_type: 'video',
        });
        // Extraction frame à un moment précis
        return cloudinary_1.v2.url(upload.public_id, {
            resource_type: 'video',
            format: 'jpg',
            start_offset: timeSeconds,
            quality: 'auto:best',
        });
    }
    catch (error) {
        throw new Error(`Erreur extraction miniature: ${error.message}`);
    }
}
// ─── VIDÉO — Aperçu (preview) ─────────────────────────────────────
async function createVideoPreview(videoUrl, durationSeconds = 10) {
    try {
        // createVideoPreview = cutVideo de 0 → durationSeconds
        return cutVideo(videoUrl, 0, durationSeconds);
    }
    catch (error) {
        throw new Error(`Erreur création preview: ${error.message}`);
    }
}
// ─── Helpers ──────────────────────────────────────────────────────
function generateSRT(words) {
    let srt = '';
    let index = 1;
    let currentText = '';
    let startTime = 0;
    words.forEach((word, i) => {
        currentText += word.text + ' ';
        // Nouveau sous-titre tous les 5 mots ou fin
        if ((i + 1) % 5 === 0 || i === words.length - 1) {
            const endTime = word.end;
            srt += `${index}\n`;
            srt += `${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n`;
            srt += `${currentText.trim()}\n\n`;
            index++;
            currentText = '';
            startTime = endTime;
        }
    });
    return srt;
}
function formatSRTTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const milliseconds = ms % 1000;
    return `${pad(hours)}:${pad(minutes % 60)}:${pad(seconds % 60)},${pad(milliseconds, 3)}`;
}
function pad(num, size = 2) {
    return String(num).padStart(size, '0');
}
// ─── VIDÉO — Générer pub TikTok depuis images ────────────────────
const TIKTOK_MUSIC_URLS = {
    upbeat: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    chill: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    corporate: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    energetic: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    emotional: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
};
async function generateTikTokVideo(params) {
    const { image_urls, title = 'Fik Conciergerie Oran', subtitle, music = 'upbeat', duration_per_image = 3, } = params;
    if (!image_urls.length)
        throw new Error('Au moins 1 image requise');
    const tag = `tiktok_pub_${Date.now()}`;
    const delayCs = duration_per_image * 100; // secondes → centisecondes
    // Upload chaque image avec dimensions TikTok 9:16 + tag
    for (const url of image_urls) {
        const transformation = [
            { width: 1080, height: 1920, crop: 'fill', gravity: 'auto', quality: 'auto:best' },
        ];
        // Titre en haut
        if (title) {
            transformation.push({
                overlay: { font_family: 'Arial', font_size: 55, font_weight: 'bold', text: title.replace(/[,]/g, '%2C') },
                gravity: 'north', y: 80, color: '#FFFFFF', effect: 'shadow:15',
            });
            transformation.push({ flags: 'layer_apply' });
        }
        // Sous-titre en bas
        if (subtitle) {
            transformation.push({
                overlay: { font_family: 'Arial', font_size: 42, text: subtitle.replace(/[,]/g, '%2C') },
                gravity: 'south', y: 100, color: '#FFDD00', effect: 'shadow:10',
            });
            transformation.push({ flags: 'layer_apply' });
        }
        await cloudinary_1.v2.uploader.upload(url, {
            resource_type: 'image',
            tags: [tag],
            transformation,
        });
    }
    // Créer le slideshow video MP4 depuis les images taguées
    const result = await cloudinary_1.v2.uploader.multi(tag, {
        resource_type: 'image',
        format: 'mp4',
        delay: delayCs,
        transformation: [{ width: 1080, height: 1920, crop: 'pad', quality: 'auto:best' }],
    });
    let videoUrl = result.secure_url;
    // Ajouter musique de fond
    const musicUrl = TIKTOK_MUSIC_URLS[music] ?? TIKTOK_MUSIC_URLS['upbeat'];
    try {
        videoUrl = await addBackgroundMusicUrl(videoUrl, musicUrl, 35);
    }
    catch {
        // Si échec musique → garder vidéo sans musique
    }
    const thumbnailUrl = cloudinary_1.v2.url(result.public_id, {
        resource_type: 'video',
        format: 'jpg',
        start_offset: 0,
        quality: 'auto:best',
    });
    return { video_url: videoUrl, thumbnail_url: thumbnailUrl };
}
// ─── Add Background Music ────────────────────────────────────────
async function addBackgroundMusicUrl(videoUrl, musicUrl, volumePct = 30) {
    // Upload video to Cloudinary
    const upload = await cloudinary_1.v2.uploader.upload(videoUrl, { resource_type: 'video' });
    // Cloudinary audio overlay: underlay music track at given volume
    const musicVolume = Math.round(volumePct * 0.4); // Cloudinary volume 0..100 mapped from pct
    const url = cloudinary_1.v2.url(upload.public_id, {
        resource_type: 'video',
        transformation: [
            { overlay: { url: musicUrl }, flags: 'layer_apply', audio_codec: 'aac', volume: musicVolume },
        ],
    });
    return url;
}
//# sourceMappingURL=media-processing.js.map