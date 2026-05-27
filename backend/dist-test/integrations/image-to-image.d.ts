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
export interface ImageToImageOptions {
    /** URL publique de l'image source (Telegram, Supabase, etc.) */
    sourceImageUrl: string;
    /** Prompt de transformation en anglais */
    prompt: string;
    /** Intensité de la transformation 0-1 (0=fidèle source, 1=libre) */
    strength?: number;
    /** Style prédéfini */
    style?: 'realistic' | 'anime' | 'warrior' | 'background_only' | 'cinematic';
    /** Provider forcé */
    provider?: 'auto' | 'fal_ip_adapter' | 'fal_flux' | 'replicate';
}
export interface ImageToImageResult {
    url: string;
    provider: string;
    mode: string;
}
export declare function downloadImageAsBase64(imageUrl: string): Promise<{
    base64: string;
    mimeType: string;
    sizeKb: number;
}>;
export declare function transformImage(opts: ImageToImageOptions): Promise<ImageToImageResult>;
export declare function downloadTelegramImage(fileId: string): Promise<string>;
export declare function executeImageToImage(input: Record<string, unknown>, sessionId?: string): Promise<string>;
//# sourceMappingURL=image-to-image.d.ts.map