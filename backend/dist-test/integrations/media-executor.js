"use strict";
/**
 * PHASE 14 — Exécuteur Outils Média
 *
 * Gère l'exécution des outils de traitement image et vidéo
 */
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
exports.executeMediaTool = executeMediaTool;
const media = __importStar(require("./media-processing.js"));
const env_js_1 = require("../config/env.js");
// ─── Helper: Convertir MM:SS ou HH:MM:SS → secondes ──────────────
function parseTimeToSeconds(time) {
    if (typeof time === 'number')
        return time;
    const parts = time.split(':').map(Number);
    if (parts.length === 2) {
        // MM:SS
        return parts[0] * 60 + parts[1];
    }
    else if (parts.length === 3) {
        // HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parseInt(time) || 0;
}
async function executeMediaTool(toolName, args) {
    if (!env_js_1.env.CLOUDINARY_CLOUD_NAME || !env_js_1.env.CLOUDINARY_API_KEY || !env_js_1.env.CLOUDINARY_API_SECRET) {
        return `❌ Cloudinary non configuré — ajoute CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET dans Railway pour activer le traitement image/vidéo.`;
    }
    try {
        switch (toolName) {
            // ─── IMAGE ──────────────────────────────────────────────────
            case 'analyze_image': {
                const result = await media.analyzeImage(args.image_url);
                return `📊 **ANALYSE IMAGE**

📐 **Dimensions:** ${result.width} × ${result.height}px
📦 **Taille:** ${result.size_kb} KB
📄 **Format:** ${result.format.toUpperCase()}
⭐ **Score qualité:** ${result.quality_score}/100

${result.suggestions.length > 0 ? '💡 **Suggestions:**\n' + result.suggestions.map((s) => `   ${s}`).join('\n') : '✅ Image optimale !'}

🔗 **URL:** ${result.url}`;
            }
            case 'optimize_image': {
                const result = await media.optimizeImage(args.image_url, args.usage || 'web');
                return `✅ **IMAGE OPTIMISÉE**

📦 **Réduction taille:** ~${result.size_reduction_percent}%
🎯 **Usage:** ${args.usage || 'web'}
🔗 **URL optimisée:** ${result.url}

💡 L'image a été automatiquement compressée et convertie au format optimal.`;
            }
            case 'create_social_variants': {
                const result = await media.createSocialVariants(args.image_url);
                return `✅ **VARIANTS SOCIAUX CRÉÉS**

📱 **TikTok / Reels** (9:16 - 1080×1920):
${result.tiktok}

📷 **Instagram Feed** (1:1 - 1080×1080):
${result.instagram_feed}

📲 **Instagram Story** (9:16 - 1080×1920):
${result.instagram_story}

🎥 **YouTube** (16:9 - 1920×1080):
${result.youtube}

💡 Tous les formats sont optimisés pour chaque plateforme.`;
            }
            case 'enhance_image': {
                const result = await media.enhanceImage(args.image_url);
                return `✨ **IMAGE AMÉLIORÉE**

🔗 **URL:** ${result}

✅ Améliorations appliquées:
   • Contraste optimisé
   • Luminosité ajustée
   • Netteté améliorée
   • Couleurs corrigées`;
            }
            case 'remove_background': {
                const result = await media.removeBackground(args.image_url);
                return `🎨 **FOND SUPPRIMÉ**

🔗 **URL (PNG transparent):** ${result}

✅ Le fond a été supprimé automatiquement par IA.
💡 Parfait pour créer des visuels publicitaires ou logos.`;
            }
            case 'add_text_overlay': {
                const result = await media.addTextOverlay(args.image_url, args.text, args.position || 'bottom');
                return `✅ **TEXTE AJOUTÉ**

📝 **Texte:** "${args.text}"
📍 **Position:** ${args.position || 'bottom'}
🔗 **URL:** ${result}

✅ Le texte a été ajouté avec style professionnel (ombre, police lisible).`;
            }
            // ─── VIDÉO ──────────────────────────────────────────────────
            case 'analyze_video': {
                const result = await media.analyzeVideo(args.video_url);
                return `📊 **ANALYSE VIDÉO**

📐 **Dimensions:** ${result.width} × ${result.height}px
⏱️ **Durée:** ${result.duration_seconds}s (${Math.floor(result.duration_seconds / 60)}min ${result.duration_seconds % 60}s)
📦 **Taille:** ${result.size_mb} MB
📄 **Format:** ${result.format.toUpperCase()}
🎬 **FPS:** ${result.fps}
📡 **Bitrate:** ${result.bitrate}

${result.suggestions.length > 0 ? '💡 **Suggestions:**\n' + result.suggestions.map((s) => `   ${s}`).join('\n') : '✅ Vidéo optimale !'}

🔗 **URL:** ${result.url}`;
            }
            case 'cut_video': {
                // Parse MM:SS ou HH:MM:SS → secondes
                const startSeconds = parseTimeToSeconds(args.start_time);
                const endSeconds = parseTimeToSeconds(args.end_time);
                const result = await media.cutVideo(args.video_url, startSeconds, endSeconds);
                const duration = endSeconds - startSeconds;
                return `✂️ **VIDÉO DÉCOUPÉE**

⏱️ **Segment:** ${startSeconds}s → ${endSeconds}s (durée: ${duration}s)
🔗 **URL:** ${result}

✅ Le clip a été extrait avec succès.`;
            }
            case 'merge_videos': {
                const result = await media.mergeVideos(args.video_urls);
                return `🔗 **FUSION VIDÉOS**

📊 **Nombre de vidéos:** ${args.video_urls.length}
🔗 **Résultat:** ${result}

✅ Les vidéos ont été fusionnées via Cloudinary splice.`;
            }
            case 'add_subtitles': {
                const result = await media.addSubtitles(args.video_url, args.language || 'fr');
                return `📝 **SOUS-TITRES GÉNÉRÉS**

🌍 **Langue:** ${args.language || 'fr'}
🎬 **Vidéo:** ${result.video_url}
📄 **Sous-titres (SRT):** ${result.subtitles_url}

📝 **Transcription:**
${result.transcription}

✅ Les sous-titres ont été générés automatiquement par IA (AssemblyAI).
💡 Tu peux télécharger le fichier SRT et l'ajouter manuellement à la vidéo.`;
            }
            case 'optimize_for_platform': {
                const result = await media.optimizeForPlatform(args.video_url, args.platform);
                const specs = {
                    tiktok: '9:16 (1080×1920), max 60s',
                    instagram: '9:16 (1080×1920), max 90s',
                    youtube: '16:9 (1920×1080)',
                };
                return `✅ **VIDÉO OPTIMISÉE POUR ${args.platform.toUpperCase()}**

📱 **Format:** ${specs[args.platform]}
🔗 **URL:** ${result}

✅ La vidéo a été:
   • Redimensionnée au format optimal
   • Recadrée intelligemment (IA)
   • Compressée pour performance
   ${args.platform !== 'youtube' ? `• Limitée à ${args.platform === 'tiktok' ? '60s' : '90s'}` : ''}`;
            }
            case 'extract_thumbnail': {
                const result = await media.extractThumbnail(args.video_url, args.time_seconds || 0);
                return `🖼️ **MINIATURE EXTRAITE**

⏱️ **Moment:** ${args.time_seconds || 0}s
🔗 **URL:** ${result}

✅ Frame extraite en haute qualité (JPG optimisé).`;
            }
            case 'add_background_music': {
                const volume = args.volume ?? 30;
                const music = args.music ?? 'chill';
                // Cloudinary audio overlay — free royalty-free music via public audio URLs
                const MUSIC_URLS = {
                    upbeat: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                    chill: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
                    corporate: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
                    energetic: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
                    emotional: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
                };
                const musicUrl = MUSIC_URLS[music] ?? MUSIC_URLS['chill'];
                const result = await media.addBackgroundMusicUrl(args.video_url, musicUrl, volume);
                return `🎵 **MUSIQUE DE FOND AJOUTÉE**

🎼 **Style:** ${music}
🔊 **Volume musique:** ${volume}%
🔗 **URL:** ${result}

✅ La musique a été mixée automatiquement avec la vidéo.`;
            }
            case 'create_video_preview': {
                const result = await media.createVideoPreview(args.video_url, args.duration_seconds || 10);
                return `🎬 **PREVIEW VIDÉO CRÉÉE**

⏱️ **Durée:** ${args.duration_seconds || 10}s
🔗 **URL:** ${result}

✅ Aperçu créé (extrait du début de la vidéo).
💡 Parfait pour teaser sur réseaux sociaux !`;
            }
            case 'generate_tiktok_video': {
                const imageUrls = Array.isArray(args.image_urls)
                    ? args.image_urls
                    : (typeof args.image_urls === 'string' ? args.image_urls.split(',').map((s) => s.trim()) : []);
                const result = await media.generateTikTokVideo({
                    image_urls: imageUrls,
                    title: args.title,
                    subtitle: args.subtitle,
                    music: args.music,
                    duration_per_image: args.duration_per_image ? Number(args.duration_per_image) : undefined,
                });
                return `🎬 **VIDÉO TIKTOK GÉNÉRÉE** ✅

🎥 **Vidéo (MP4 9:16 TikTok):**
${result.video_url}

🖼️ **Miniature:**
${result.thumbnail_url}

✅ Vidéo prête — 1080×1920px, musique de fond, texte en overlay.
💡 Poste directement sur TikTok, Instagram Reels ou Facebook Reels.`;
            }
            default:
                return `❌ Outil média inconnu: ${toolName}`;
        }
    }
    catch (error) {
        return `❌ **ERREUR ${toolName}**\n\n${error.message}`;
    }
}
//# sourceMappingURL=media-executor.js.map