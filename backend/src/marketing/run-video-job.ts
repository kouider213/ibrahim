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
 *     car_name="Jumpy 9 Places",
 *     style="reveal"
 *   )
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { env } from '../config/env.js';
import { executeCreateMarketingVideo, type MarketingVideoInput, type MarketingVideoResult } from './create-marketing-video.js';
import { sendMessage as tgText } from '../integrations/telegram.js';

// ─── Configuration du job ──────────────────────────────────────────────────

/** Identifiant du chat Telegram où envoyer la vidéo et les logs */
function resolveChatId(): string {
  return env.TELEGRAM_CHAT_ID ?? '809747124';
}

// ─── Helpers internes ──────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toLocaleTimeString('fr-FR', { timeZone: 'Africa/Algiers' });
  console.log(`[run-video-job] [${ts}] ${msg}`);
}

async function notifyTelegram(chatId: string, msg: string): Promise<void> {
  try {
    await tgText(chatId, msg);
  } catch (err) {
    log(`⚠️ Telegram notify échoué: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Fonction principale exportée ──────────────────────────────────────────

/**
 * Déclenche le pipeline complet de création vidéo marketing :
 *  1. Recherche la voiture dans Supabase (ex: Jumpy 9 Places)
 *  2. Génère un script IA Claude en style "reveal" (ou utilise custom_script)
 *  3. Synthèse voix ElevenLabs (français)
 *  4. Montage FFmpeg HD 720×1280 (voiture + fond Pexels optionnel + voix + overlays texte)
 *  5. Upload Supabase Storage bucket "videos"
 *  6. Envoie le MP4 sur Telegram pour validation Oke/Non
 *  7. Retourne les métadonnées de la vidéo
 */
export async function triggerMarketingVideo(
  input: MarketingVideoInput,
  chatId?: string,
): Promise<MarketingVideoResult> {
  const targetChatId = chatId ?? resolveChatId();

  log(`🎬 Déclenchement vidéo marketing:`);
  log(`  car_name:          ${input.car_name ?? '(auto)'}`);
  log(`  style:             ${input.style ?? 'reveal'}`);
  log(`  background_effect: ${input.background_effect ?? '(aucun)'}`);
  log(`  custom_script:     ${input.custom_script ? `"${input.custom_script.slice(0, 60)}..."` : '(généré IA)'}`);
  log(`  target_chat_id:    ${targetChatId}`);

  await notifyTelegram(
    targetChatId,
    [
      `🎬 *Dzaryx Marketing — Vidéo en cours*`,
      ``,
      `🚗 Voiture : *${input.car_name ?? 'sélection auto'}*`,
      `🎨 Style : *${input.style ?? 'reveal'}*`,
      `🏖️ Fond : *${input.background_effect ?? 'aucun'}*`,
      ``,
      `⏳ Montage HD 1080×1920 en cours — voix ElevenLabs + FFmpeg + Pexels...`,
    ].join('\n'),
  );

  const result = await executeCreateMarketingVideo(input, targetChatId);

  const statusEmoji = result.telegram_delivered ? '✅' : '⚠️';
  const methodLabel = result.method === 'ffmpeg' ? 'FFmpeg HD 1080p' : 'Photo fallback';

  log(`${statusEmoji} Résultat:`);
  log(`  car_name:           ${result.car_name}`);
  log(`  method:             ${result.method}`);
  log(`  telegram_delivered: ${result.telegram_delivered}`);
  log(`  pending_id:         ${result.pending_id}`);
  log(`  public_url:         ${result.public_url.slice(0, 80)}...`);
  log(`  script (aperçu):    "${result.script.slice(0, 80)}..."`);

  if (!result.telegram_delivered) {
    log(`⚠️ La vidéo n'a pas pu être livrée sur Telegram. URL de secours: ${result.public_url}`);
  }

  // Résumé final dans les logs Railway (visible dans Railway → Logs)
  log(`─────────────────────────────────────────────────────`);
  log(`✅ JOB TERMINÉ — ${methodLabel} — ${result.car_name}`);
  log(`   pending_id: ${result.pending_id}`);
  log(`   hashtags: ${result.hashtags.join(' ')}`);
  log(`─────────────────────────────────────────────────────`);

  return result;
}

// ─── Exécution directe (CLI ou Railway Job) ────────────────────────────────
//
//  Paramètres pour le cas demandé :
//    car_name="Clio 5 Alpine"
//    style="prix"
//    custom_script="Cet été, profitez de la Clio 5 Alpine à seulement 50€ par jour !
//                   Une voiture sportive et élégante pour des vacances inoubliables à Oran.
//                   Réservez dès maintenant chez Fik Conciergerie !"
//    background_effect="plage"
//
if (process.argv[1]?.endsWith('run-video-job.js') || process.argv[1]?.endsWith('run-video-job.ts')) {
  triggerMarketingVideo({
    car_name:          'Clio 5 Alpine',
    style:             'prix',
    custom_script:     'Cet été, profitez de la Clio 5 Alpine à seulement 50€ par jour ! Une voiture sportive et élégante pour des vacances inoubliables à Oran. Réservez dès maintenant chez Fik Conciergerie !',
    background_effect: 'plage',
  })
    .then(result => {
      console.log('[run-video-job] ✅ Terminé:', JSON.stringify({ pending_id: result.pending_id, method: result.method, car_name: result.car_name }, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('[run-video-job] ❌ Erreur fatale:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
