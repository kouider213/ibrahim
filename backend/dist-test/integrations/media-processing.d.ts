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
interface ImageAnalysis {
    url: string;
    format: string;
    width: number;
    height: number;
    size_kb: number;
    quality_score: number;
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
    tiktok: string;
    instagram_feed: string;
    instagram_story: string;
    youtube: string;
}
export declare function analyzeImage(imageUrl: string): Promise<ImageAnalysis>;
export declare function optimizeImage(imageUrl: string, usage?: 'web' | 'social' | 'print'): Promise<{
    url: string;
    size_reduction_percent: number;
}>;
export declare function createSocialVariants(imageUrl: string): Promise<SocialVariants>;
export declare function enhanceImage(imageUrl: string): Promise<string>;
export declare function removeBackground(imageUrl: string): Promise<string>;
export declare function addTextOverlay(imageUrl: string, text: string, position?: 'top' | 'center' | 'bottom'): Promise<string>;
export declare function analyzeVideo(videoUrl: string): Promise<VideoAnalysis>;
export declare function cutVideo(videoUrl: string, startSeconds: number, endSeconds: number): Promise<string>;
export declare function mergeVideos(videoUrls: string[]): Promise<string>;
export declare function addSubtitles(videoUrl: string, language?: 'fr' | 'ar' | 'en'): Promise<{
    video_url: string;
    subtitles_url: string;
    transcription: string;
}>;
export declare function optimizeForPlatform(videoUrl: string, platform: 'tiktok' | 'instagram' | 'youtube'): Promise<string>;
export declare function extractThumbnail(videoUrl: string, timeSeconds?: number): Promise<string>;
export declare function createVideoPreview(videoUrl: string, durationSeconds?: number): Promise<string>;
export declare function generateTikTokVideo(params: {
    image_urls: string[];
    title?: string;
    subtitle?: string;
    music?: string;
    duration_per_image?: number;
}): Promise<{
    video_url: string;
    thumbnail_url: string;
}>;
export declare function addBackgroundMusicUrl(videoUrl: string, musicUrl: string, volumePct?: number): Promise<string>;
export {};
//# sourceMappingURL=media-processing.d.ts.map