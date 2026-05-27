/**
 * create-marketing-video.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Génération complète d'une vidéo marketing 9:16 (1080×1920) :
 *   1. Chercher la voiture dans la flotte Supabase (photos réelles)
 *   2. Générer un script IA via Claude si pas de custom_script
 *   3. Synthèse voix française ElevenLabs
 *   4. Montage FFmpeg : image voiture + voix + musique + overlays texte
 *   5. Upload dans Supabase Storage bucket "videos"
 *   6. Envoyer la vidéo MP4 dans le chat Telegram via bot
 *   7. Retourner l'URL publique + metadata
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface MarketingVideoInput {
    car_name?: string;
    style?: 'reveal' | 'prix' | 'lifestyle' | 'temoignage';
    custom_script?: string;
    background_effect?: string;
}
export interface MarketingVideoResult {
    public_url: string;
    car_name: string;
    script: string;
    caption: string;
    hashtags: string[];
    pending_id: string;
    method: 'ffmpeg' | 'photo_fallback';
    telegram_delivered: boolean;
}
/**
 * Vérifie qu'un Buffer est un vrai fichier MP4 :
 *  - taille > 50 KB (minimum pour une vidéo réelle)
 *  - magic bytes "ftyp" présents à l'offset 4 (standard MP4/MOV)
 */
export declare function isValidMp4Buffer(buf: Buffer): boolean;
/**
 * Merge a video buffer (Runway/Kling MP4) with an audio buffer (ElevenLabs MP3)
 * using FFmpeg. Video stream is copied as-is (no re-encode). Audio is encoded
 * to AAC 128k. Output stops when the shorter stream ends (-shortest).
 */
export declare function mergeVideoWithAudio(videoBuffer: Buffer, audioBuffer: Buffer): Promise<Buffer>;
export declare function executeCreateMarketingVideo(input: MarketingVideoInput, chatId: string): Promise<MarketingVideoResult>;
//# sourceMappingURL=create-marketing-video.d.ts.map