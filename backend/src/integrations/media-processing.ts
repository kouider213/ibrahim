/**
 * PHASE 14 — Traitement Image & Vidéo
 * 
 * Module de traitement média pour Ibrahim
 * - Images: optimisation, redimensionnement, amélioration, variants sociaux
 * - Vidéos: découpe, sous-titres auto, optimisation plateforme, montage
 * 
 * APIs utilisées:
 * - Cloudinary (images + vidéos)
 * - AssemblyAI (sous-titres automatiques)
 */

import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import { env } from '../config/env.js';

// ─── Configuration Cloudinary ────────────────────────────────────

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME ?? '',
  api_key:    env.CLOUDINARY_API_KEY    ?? '',
  api_secret: env.CLOUDINARY_API_SECRET ?? '',
  secure: true,
});

const ASSEMBLYAI_API_KEY = env.ASSEMBLYAI_API_KEY ?? '';

// ─── Types ────────────────────────────────────────────────────────

interface ImageAnalysis {
  url: string;
  format: string;
  width: number;
  height: number;
  size_kb: number;
  quality_score: number; // 0-100
  suggestions: string[];
}

interface VideoAnalysis {
  url: string;
  format: string;
  duration_seconds: number;
  width: number;
  height: number;
  size_mb: number;
  fps: number;
  bitrate: string;
  suggestions: string[];
}

interface SocialVariants {
  tiktok: string;      // 9:16
  instagram_feed: string;  // 1:1
  instagram_story: string; // 9:16
  youtube: string;     // 16:9
}

// ─── IMAGE — Analyse ──────────────────────────────────────────────

export async function analyzeImage(imageUrl: string): Promise<ImageAnalysis> {
  try {
    // Upload vers Cloudinary pour analyse
    const result = await cloudinary.uploader.upload(imageUrl, {
      resource_type: 'image',
      quality_analysis: true,
    });

    const sizeKB = result.bytes / 1024;
    const suggestions: string[] = [];

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
  } catch (error: any) {
    throw new Error(`Erreur analyse image: ${error.message}`);
  }
}

// ─── IMAGE — Optimisation ─────────────────────────────────────────

export async function optimizeImage(
  imageUrl: string,
  usage: 'web' | 'social' | 'print' = 'web'
): Promise<{ url: string; size_reduction_percent: number }> {
  try {
    const originalUpload = await cloudinary.uploader.upload(imageUrl, {
      resource_type: 'image',
    });
    // Paramètres selon usage
    let quality: number | string = 'auto:good';
    let format = 'auto';
    let width: number | undefined;

    if (usage === 'web') {
      quality = 'auto:good';
      width = 1920;
    } else if (usage === 'social') {
      quality = 'auto:best';
      width = 1080;
    } else if (usage === 'print') {
      quality = 90;
      width = 3000;
    }

    const optimizedUrl = cloudinary.url(originalUpload.public_id, {
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
  } catch (error: any) {
    throw new Error(`Erreur optimisation image: ${error.message}`);
  }
}

// ─── IMAGE — Variants sociaux ─────────────────────────────────────

export async function createSocialVariants(imageUrl: string): Promise<SocialVariants> {
  try {
    const upload = await cloudinary.uploader.upload(imageUrl, {
      resource_type: 'image',
    });

    const publicId = upload.public_id;

    return {
      // TikTok / Instagram Reels (9:16)
      tiktok: cloudinary.url(publicId, {
        width: 1080,
        height: 1920,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto:best',
      }),

      // Instagram Feed (1:1)
      instagram_feed: cloudinary.url(publicId, {
        width: 1080,
        height: 1080,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto:best',
      }),

      // Instagram Story (9:16)
      instagram_story: cloudinary.url(publicId, {
        width: 1080,
        height: 1920,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto:best',
      }),

      // YouTube (16:9)
      youtube: cloudinary.url(publicId, {
        width: 1920,
        height: 1080,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto:best',
      }),
    };
  } catch (error: any) {
    throw new Error(`Erreur création variants: ${error.message}`);
  }
}

// ─── IMAGE — Amélioration ─────────────────────────────────────────

export async function enhanceImage(imageUrl: string): Promise<string> {
  try {
    const upload = await cloudinary.uploader.upload(imageUrl, {
      resource_type: 'image',
    });

    // Amélioration automatique (contraste, luminosité, netteté)
    return cloudinary.url(upload.public_id, {
      effect: 'improve',
      quality: 'auto:best',
      fetch_format: 'auto',
    });
  } catch (error: any) {
    throw new Error(`Erreur amélioration image: ${error.message}`);
  }
}

// ─── IMAGE — Suppression fond ─────────────────────────────────────

export async function removeBackground(imageUrl: string): Promise<string> {
  try {
    const upload = await cloudinary.uploader.upload(imageUrl, {
      resource_type: 'image',
    });

    // Suppression fond via Cloudinary AI
    return cloudinary.url(upload.public_id, {
      effect: 'background_removal',
      format: 'png',
      quality: 'auto:best',
    });
  } catch (error: any) {
    throw new Error(`Erreur suppression fond: ${error.message}`);
  }
}

// ─── IMAGE — Texte overlay ────────────────────────────────────────

export async function addTextOverlay(
  imageUrl: string,
  text: string,
  position: 'top' | 'center' | 'bottom' = 'bottom'
): Promise<string> {
  try {
    const upload = await cloudinary.uploader.upload(imageUrl, {
      resource_type: 'image',
    });

    let gravity = 'south';
    if (position === 'top') gravity = 'north';
    if (position === 'center') gravity = 'center';

    return cloudinary.url(upload.public_id, {
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
  } catch (error: any) {
    throw new Error(`Erreur ajout texte: ${error.message}`);
  }
}

// ─── VIDÉO — Analyse ──────────────────────────────────────────────

export async function analyzeVideo(videoUrl: string): Promise<VideoAnalysis> {
  try {
    const result = await cloudinary.uploader.upload(videoUrl, {
      resource_type: 'video',
    });

    const sizeMB = result.bytes / (1024 * 1024);
    const suggestions: string[] = [];

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
  } catch (error: any) {
    throw new Error(`Erreur analyse vidéo: ${error.message}`);
  }
}

// ─── Helper: extraire le public_id d'une URL Cloudinary ──────────

function extractPublicId(url: string): string | null {
  const uploadIdx = url.indexOf('/upload/');
  if (uploadIdx === -1) return null;

  let path = url.slice(uploadIdx + 8); // tout après "/upload/"

  // Supprimer le préfixe de version (ex: "v1234567890/")
  path = path.replace(/^v\d+\//, '');

  // Supprimer l'extension finale (.mp4, .mov, .jpg…)
  path = path.replace(/\.[^./]+$/, '');

  return path || null;
}

// ─── VIDÉO — Découpe ──────────────────────────────────────────────

export async function cutVideo(
  videoUrl: string,
  startSeconds: number,
  endSeconds: number
): Promise<string> {
  try {
    let publicId: string | null = null;

    if (videoUrl.includes('cloudinary.com')) {
      publicId = extractPublicId(videoUrl);
      console.log(`[media] cutVideo — extracted public_id: "${publicId}" from URL: ${videoUrl}`);
    }

    if (!publicId) {
      const upload = await cloudinary.uploader.upload(videoUrl, { resource_type: 'video' });
      publicId = upload.public_id;
      console.log(`[media] cutVideo — uploaded, public_id: "${publicId}"`);
    }

    const transformed = cloudinary.url(publicId, {
      resource_type: 'video',
      transformation: [{ start_offset: startSeconds, end_offset: endSeconds, quality: 'auto' }],
      format: 'mp4',
      secure: true,
    });

    console.log(`[media] cutVideo — result URL: ${transformed}`);
    return transformed;
  } catch (error: any) {
    throw new Error(`Erreur découpe vidéo: ${error.message}`);
  }
}

// ─── VIDÉO — Fusion ───────────────────────────────────────────────

export async function mergeVideos(videoUrls: string[]): Promise<string> {
  try {
    if (videoUrls.length < 2) {
      throw new Error('Minimum 2 vidéos requises pour fusion');
    }

    const uploads = await Promise.all(
      videoUrls.map(url => cloudinary.uploader.upload(url, { resource_type: 'video' }))
    );

    const [first, ...rest] = uploads;
    const transformation: object[] = [];
    for (const upload of rest) {
      transformation.push(
        { flags: 'splice', overlay: `video:${upload.public_id.replace(/\//g, ':')}` },
        { flags: 'layer_apply' },
      );
    }

    return cloudinary.url(first.public_id, { resource_type: 'video', transformation });
  } catch (error: any) {
    throw new Error(`Erreur fusion vidéos: ${error.message}`);
  }
}

// ─── VIDÉO — Sous-titres (AssemblyAI) ─────────────────────────────

export async function addSubtitles(
  videoUrl: string,
  language: 'fr' | 'ar' | 'en' = 'fr'
): Promise<{ video_url: string; subtitles_url: string; transcription: string }> {
  try {
    if (!ASSEMBLYAI_API_KEY) {
      throw new Error('ASSEMBLYAI_API_KEY non configuré');
    }

    // Upload vidéo sur Cloudinary
    const videoUpload = await cloudinary.uploader.upload(videoUrl, {
      resource_type: 'video',
    });

    // Extraction audio (AssemblyAI travaille sur audio)
    const audioUrl = cloudinary.url(videoUpload.public_id, {
      resource_type: 'video',
      format: 'mp3',
    });

    // Télécharger audio
    const audioResponse = await axios.get(audioUrl, { responseType: 'arraybuffer' });
    const audioBuffer = Buffer.from(audioResponse.data);

    // Upload audio vers AssemblyAI
    const uploadResponse = await axios.post('https://api.assemblyai.com/v2/upload', audioBuffer, {
      headers: {
        authorization: ASSEMBLYAI_API_KEY,
        'content-type': 'application/octet-stream',
      },
    });

    const uploadUrl = uploadResponse.data.upload_url;

    // Demander transcription
    const transcriptResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: uploadUrl,
        language_code: language === 'fr' ? 'fr' : language === 'ar' ? 'ar' : 'en',
      },
      {
        headers: {
          authorization: ASSEMBLYAI_API_KEY,
          'content-type': 'application/json',
        },
      }
    );

    const transcriptId = transcriptResponse.data.id;

    // Attendre transcription (polling)
    let transcriptData: any;
    let attempts = 0;
    while (attempts < 60) {
      const statusResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: { authorization: ASSEMBLYAI_API_KEY },
        }
      );
      transcriptData = statusResponse.data;

      if (transcriptData.status === 'completed') break;
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
    await new Promise<void>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', public_id: srtPublicId, format: 'srt' },
        (err) => err ? reject(err) : resolve(),
      );
      stream.end(Buffer.from(srtContent));
    });

    const videoWithSubs = cloudinary.url(videoUpload.public_id, {
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
  } catch (error: any) {
    throw new Error(`Erreur sous-titres: ${error.message}`);
  }
}

// ─── VIDÉO — Optimisation plateforme ──────────────────────────────

export async function optimizeForPlatform(
  videoUrl: string,
  platform: 'tiktok' | 'instagram' | 'youtube'
): Promise<string> {
  try {
    const specs: Record<string, { width: number; height: number; end_offset?: number }> = {
      tiktok:    { width: 1080, height: 1920, end_offset: 60 },
      instagram: { width: 1080, height: 1920, end_offset: 90 },
      youtube:   { width: 1920, height: 1080 },
    };
    const s = specs[platform]!;

    let publicId = videoUrl.includes('cloudinary.com') ? extractPublicId(videoUrl) : null;
    if (!publicId) {
      const upload = await cloudinary.uploader.upload(videoUrl, { resource_type: 'video' });
      publicId = upload.public_id;
    }

    const tf: Record<string, unknown> = { width: s.width, height: s.height, crop: 'fill', gravity: 'auto', quality: 'auto' };
    if (s.end_offset) tf['end_offset'] = s.end_offset;

    return cloudinary.url(publicId, {
      resource_type: 'video',
      transformation: [tf],
      format: 'mp4',
      secure: true,
    });
  } catch (error: any) {
    throw new Error(`Erreur optimisation plateforme: ${error.message}`);
  }
}

// ─── VIDÉO — Miniature ────────────────────────────────────────────

export async function extractThumbnail(
  videoUrl: string,
  timeSeconds: number = 0
): Promise<string> {
  try {
    const upload = await cloudinary.uploader.upload(videoUrl, {
      resource_type: 'video',
    });

    // Extraction frame à un moment précis
    return cloudinary.url(upload.public_id, {
      resource_type: 'video',
      format: 'jpg',
      start_offset: timeSeconds,
      quality: 'auto:best',
    });
  } catch (error: any) {
    throw new Error(`Erreur extraction miniature: ${error.message}`);
  }
}

// ─── VIDÉO — Aperçu (preview) ─────────────────────────────────────

export async function createVideoPreview(
  videoUrl: string,
  durationSeconds: number = 10
): Promise<string> {
  try {
    // createVideoPreview = cutVideo de 0 → durationSeconds
    return cutVideo(videoUrl, 0, durationSeconds);
  } catch (error: any) {
    throw new Error(`Erreur création preview: ${error.message}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function generateSRT(words: any[]): string {
  let srt = '';
  let index = 1;
  let currentText = '';
  let startTime = 0;

  words.forEach((word: any, i: number) => {
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

function formatSRTTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const milliseconds = ms % 1000;

  return `${pad(hours)}:${pad(minutes % 60)}:${pad(seconds % 60)},${pad(milliseconds, 3)}`;
}

function pad(num: number, size: number = 2): string {
  return String(num).padStart(size, '0');
}
