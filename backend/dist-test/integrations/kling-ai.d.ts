/**
 * Kling AI — Génération de vidéo IA depuis une image (image-to-video)
 * API: https://klingai.com/api
 * Documentation: https://docs.klingai.com
 */
export interface KlingVideoOptions {
    /** URL publique de l'image source */
    imageUrl: string;
    /** Prompt décrivant le mouvement / scène souhaitée */
    prompt: string;
    /** Durée en secondes: 5 ou 10 (défaut: 5) */
    duration?: 5 | 10;
    /** Ratio: "16:9", "9:16", "1:1" (défaut: "9:16" pour TikTok) */
    aspectRatio?: '16:9' | '9:16' | '1:1';
    /** Mode: "std" (standard) ou "pro" (défaut: "std") */
    mode?: 'std' | 'pro';
    /** Négatif prompt */
    negativePrompt?: string;
    /** Seed (optionnel) */
    seed?: number;
}
export interface KlingVideoResult {
    taskId: string;
    status: 'submitted' | 'processing' | 'succeed' | 'failed';
    videoUrl?: string;
    buffer?: Buffer;
    error?: string;
}
/**
 * Soumettre une tâche image-to-video sur Kling AI
 */
export declare function createKlingVideoTask(opts: KlingVideoOptions): Promise<string>;
/**
 * Vérifier le statut d'une tâche Kling AI
 */
export declare function getKlingTaskStatus(taskId: string): Promise<KlingVideoResult>;
/**
 * Attendre la fin d'une tâche Kling AI (polling, timeout 4min)
 */
export declare function waitForKlingVideo(taskId: string, timeoutMs?: number): Promise<KlingVideoResult>;
/**
 * Pipeline complet: soumettre + attendre + retourner buffer vidéo
 */
export declare function generateKlingVideo(opts: KlingVideoOptions): Promise<Buffer>;
/** Vérifie si Kling AI est configuré */
export declare function isKlingAvailable(): boolean;
//# sourceMappingURL=kling-ai.d.ts.map