/**
 * run-video-job.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Module de déclenchement autonome pour la création de vidéos marketing.
 *
 * Usage direct (CLI / Railway job) :
 *   npx ts-node --esm backend/src/marketing/run-video-job.ts
 *
 * Usage programmatique :
 *   import { triggerMarketingVideo } from './run-video-job.js'
 *   await triggerMarketingVideo({ car_name, style, custom_script, background_effect })
 *
 * Cas concret déclenché :
 *   create_marketing_video(
 *     car_name="Clio 5 Alpine",
 *     style="prix",
 *     custom_script="Cet été, profitez de la Clio 5 Alpine à seulement 50€ par jour !
 *                    Une voiture sportive et élégante pour des vacances inoubliables à Oran.
 *                    Réservez dès maintenant chez Fik Conciergerie !",
 *     background_effect="plage"
 *   )
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { type MarketingVideoInput, type MarketingVideoResult } from './create-marketing-video.js';
/**
 * Déclenche le pipeline complet de création vidéo marketing :
 *  1. Recherche la voiture dans Supabase (Clio 5 Alpine)
 *  2. Utilise le script personnalisé + effet plage
 *  3. Synthèse voix ElevenLabs
 *  4. Montage FFmpeg HD 1080×1920 (voiture + fond plage Pexels + voix + overlays)
 *  5. Upload Supabase Storage bucket "videos"
 *  6. Envoie le MP4 sur Telegram pour validation Oke/Non
 *  7. Retourne les métadonnées de la vidéo
 */
export declare function triggerMarketingVideo(input: MarketingVideoInput, chatId?: string): Promise<MarketingVideoResult>;
//# sourceMappingURL=run-video-job.d.ts.map