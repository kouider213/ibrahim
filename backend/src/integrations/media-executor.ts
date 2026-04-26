/**
 * PHASE 14 — Exécuteur Outils Média
 * 
 * Gère l'exécution des outils de traitement image et vidéo
 */

import * as media from './media-processing.js';

// ─── Helper: Convertir MM:SS ou HH:MM:SS → secondes ──────────────

function parseTimeToSeconds(time: string | number): number {
  if (typeof time === 'number') return time;
  
  const parts = time.split(':').map(Number);
  
  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return parseInt(time) || 0;
}

export async function executeMediaTool(toolName: string, args: any): Promise<string> {
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

${result.suggestions.length > 0 ? '💡 **Suggestions:**\n' + result.suggestions.map((s: string) => `   ${s}`).join('\n') : '✅ Image optimale !'}

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
        const result = await media.addTextOverlay(
          args.image_url,
          args.text,
          args.position || 'bottom'
        );
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

${result.suggestions.length > 0 ? '💡 **Suggestions:**\n' + result.suggestions.map((s: string) => `   ${s}`).join('\n') : '✅ Vidéo optimale !'}

🔗 **URL:** ${result.url}`;
      }

      case 'cut_video': {
        // Parse MM:SS ou HH:MM:SS → secondes
        const startSeconds = parseTimeToSeconds(args.start_time);
        const endSeconds = parseTimeToSeconds(args.end_time);
        
        const result = await media.cutVideo(
          args.video_url,
          startSeconds,
          endSeconds
        );
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
        const specs: any = {
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
        const result = await media.extractThumbnail(
          args.video_url,
          args.time_seconds || 0
        );
        return `🖼️ **MINIATURE EXTRAITE**

⏱️ **Moment:** ${args.time_seconds || 0}s
🔗 **URL:** ${result}

✅ Frame extraite en haute qualité (JPG optimisé).`;
      }

      case 'add_background_music': {
        const volume = args.volume ?? 30;
        const music: string = args.music ?? 'chill';
        // Cloudinary audio overlay — free royalty-free music via public audio URLs
        const MUSIC_URLS: Record<string, string> = {
          upbeat:    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          chill:     'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
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
        const result = await media.createVideoPreview(
          args.video_url,
          args.duration_seconds || 10
        );
        return `🎬 **PREVIEW VIDÉO CRÉÉE**

⏱️ **Durée:** ${args.duration_seconds || 10}s
🔗 **URL:** ${result}

✅ Aperçu créé (extrait du début de la vidéo).
💡 Parfait pour teaser sur réseaux sociaux !`;
      }

      default:
        return `❌ Outil média inconnu: ${toolName}`;
    }
  } catch (error: any) {
    return `❌ **ERREUR ${toolName}**\n\n${error.message}`;
  }
}
