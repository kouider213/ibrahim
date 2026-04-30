import { Router } from 'express';
import axios from 'axios';
import {
  sendMessage, sendTyping, setWebhook, downloadFile, sendPhoto, sendVideo, sendDocument,
  type TelegramUpdate, type TelegramMessage,
} from '../../integrations/telegram.js';
import { chatWithTools } from '../../integrations/claude-api.js';
import { buildContext } from '../../conversation/context-builder.js';
import { saveConversationTurn, supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { getLatestPendingVideo, approveVideo, rejectVideo } from '../../marketing/approval-store.js';
import { publishVideo, buildSharePackage } from '../../marketing/social-poster.js';
import { addVideoToBuffer } from '../../marketing/video-buffer.js';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';

const router   = Router();
const BUCKET   = 'client-documents';
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Cloudinary import dynamique (CommonJS compatible)
let cloudinary: any;
(async () => {
  const { v2 } = await import('cloudinary');
  const { env: e } = await import('../../config/env.js');
  cloudinary = v2;
  cloudinary.config({
    cloud_name: e.CLOUDINARY_CLOUD_NAME ?? '',
    api_key:    e.CLOUDINARY_API_KEY    ?? '',
    api_secret: e.CLOUDINARY_API_SECRET ?? '',
    secure: true,
  });
})();

function isAllowed(chatId: number): boolean {
  const allowed = env.TELEGRAM_ALLOWED_CHATS ?? '';
  if (!allowed) return true;
  return allowed.split(',').map(s => s.trim()).includes(String(chatId));
}

// Mots-clés qui indiquent explicitement qu'on veut enregistrer un document
const STORE_KEYWORDS = /passport|passeport|permis|license|licence|contrat|contract|enregistre|sauvegarde|stocke|store/i;

// POST /api/telegram/webhook
router.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const update = req.body as TelegramUpdate;
  const msg    = update.message;
  if (!msg) return;

  const chatId    = msg.chat.id;
  const sessionId = `telegram_${chatId}`;

  if (!isAllowed(chatId)) {
    await sendMessage(chatId, '❌ Accès non autorisé.');
    return;
  }

  // /start
  if (msg.text?.startsWith('/start')) {
    await sendMessage(chatId, `Salam Kouider ! Je suis Dzaryx 🚗\n\nEnvoie-moi:\n📸 Photo → je l'analyse et modifie\n🎥 Vidéo → je la découpe, optimise, sous-titre\n💬 Message → je réponds à tout\n\nTape /help pour voir toutes mes commandes.`);
    return;
  }

  // /help
  if (msg.text?.startsWith('/help')) {
    await sendMessage(chatId, `🤖 *Dzaryx — Commandes disponibles*\n\n` +
      `*📋 RÉSERVATIONS*\n` +
      `"liste les réservations" — voir toutes les réservations\n` +
      `"crée une réservation pour [client] du [date] au [date]"\n` +
      `"annule la réservation de [client]"\n` +
      `"état de la flotte" — quelles voitures sont dispo/louées\n\n` +
      `*💰 FINANCES*\n` +
      `"rapport financier" — CA du mois\n` +
      `"qui a pas payé" — réservations impayées\n` +
      `"enregistre un paiement de X€ pour [client]"\n` +
      `"génère le bon de réservation pour [client]"\n\n` +
      `*📸 PHOTOS & VIDÉOS*\n` +
      `Envoie une photo → analyse automatique\n` +
      `Envoie photo + "passeport" → OCR + stockage\n` +
      `Envoie une vidéo → traitement Cloudinary\n` +
      `"fais une vidéo TikTok pour [voiture]"\n` +
      `"génère une image IA de [description]"\n` +
      `"anime la photo de [voiture]"\n\n` +
      `*📅 CALENDRIER*\n` +
      `"synchronise le calendrier"\n` +
      `"prochains événements agenda"\n\n` +
      `*🔍 INFORMATIONS*\n` +
      `"météo Oran" — météo en temps réel\n` +
      `"qui n'a pas rendu la voiture" — retards\n` +
      `"regarde les concurrents TikTok"\n\n` +
      `*✅ APPROBATION VIDÉO*\n` +
      `\`Oke\` → publier la vidéo en attente\n` +
      `\`Non\` → annuler la vidéo en attente`);
    return;
  }

  // /health
  if (msg.text?.startsWith('/health')) {
    await sendTyping(chatId);
    const checks: Array<{ name: string; ok: boolean; note?: string }> = [];
    checks.push({ name: 'Telegram', ok: true });
    try {
      const { error } = await supabase.from('bookings').select('id').limit(1);
      checks.push({ name: 'Supabase', ok: !error, note: error?.message });
    } catch { checks.push({ name: 'Supabase', ok: false, note: 'ping échoué' }); }
    checks.push({ name: 'ElevenLabs TTS', ok: Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID), note: env.ELEVENLABS_API_KEY ? undefined : 'clé manquante' });
    const clOk = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
    checks.push({ name: 'Cloudinary', ok: clOk, note: clOk ? undefined : '3 variables manquantes' });
    checks.push({ name: 'Google Calendar', ok: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON), note: env.GOOGLE_SERVICE_ACCOUNT_JSON ? undefined : 'GOOGLE_SERVICE_ACCOUNT_JSON manquant' });
    const twOk = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM);
    checks.push({ name: 'WhatsApp Twilio', ok: twOk, note: twOk ? undefined : 'Variables Twilio manquantes' });
    const pvOk = Boolean(env.PUSHOVER_USER_KEY && env.PUSHOVER_APP_TOKEN);
    checks.push({ name: 'Pushover', ok: pvOk, note: pvOk ? undefined : 'Pushover vars manquantes' });
    checks.push({ name: 'GitHub', ok: Boolean(env.GITHUB_TOKEN), note: env.GITHUB_TOKEN ? undefined : 'GITHUB_TOKEN manquant' });
    checks.push({ name: 'fal.ai (Kling IA)', ok: Boolean(env.FAL_KEY), note: env.FAL_KEY ? undefined : 'FAL_KEY manquant' });
    checks.push({ name: 'Replicate (Flux.1)', ok: Boolean(env.REPLICATE_API_TOKEN), note: env.REPLICATE_API_TOKEN ? undefined : 'REPLICATE_API_TOKEN manquant' });
    checks.push({ name: 'Pexels', ok: Boolean(env.PEXELS_API_KEY), note: env.PEXELS_API_KEY ? undefined : 'PEXELS_API_KEY manquant' });
    const tkOk = Boolean(env.TIKTOK_ACCESS_TOKEN && env.TIKTOK_OPEN_ID);
    checks.push({ name: 'TikTok API', ok: tkOk, note: tkOk ? undefined : 'Tokens TikTok manquants' });
    const ok = checks.filter(c => c.ok).length;
    const lines = checks.map(c => `${c.ok ? '🟢' : '🔴'} *${c.name}*${c.note ? ` — ${c.note}` : ''}`);
    await sendMessage(chatId, `🏥 *DZARYX HEALTH CHECK*\n\n${lines.join('\n')}\n\n_${ok}/${checks.length} services opérationnels_`);
    return;
  }

  // /capabilities
  if (msg.text?.startsWith('/capabilities')) {
    const has = (v: unknown) => Boolean(v);
    const feats = [
      { n: 'Chat IA + mémoire permanente',        ok: true },
      { n: 'Réservations + flotte',               ok: true },
      { n: 'Finances + impayés + rapport CA',     ok: true },
      { n: 'Bon de réservation PDF',              ok: true },
      { n: 'OCR passeport / permis',              ok: true },
      { n: 'Documents clients (stockage + recherche)', ok: true },
      { n: 'Rappels personnalisés (BullMQ)',       ok: true },
      { n: 'Météo + actualités',                  ok: true },
      { n: 'Web search + fetch URL',              ok: true },
      { n: 'Code Agent autonome',                 ok: has(env.GITHUB_TOKEN) },
      { n: 'Google Calendar sync',                ok: has(env.GOOGLE_SERVICE_ACCOUNT_JSON) },
      { n: 'ElevenLabs voix (TTS)',               ok: has(env.ELEVENLABS_API_KEY) },
      { n: 'Vidéo TikTok FFmpeg (local)',         ok: has(env.ELEVENLABS_API_KEY) },
      { n: 'Traitement image/vidéo (Cloudinary)', ok: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) },
      { n: 'Vidéo IA Kling (fal.ai)',             ok: has(env.FAL_KEY) },
      { n: 'Image IA Flux.1 (Replicate)',         ok: has(env.REPLICATE_API_TOKEN) },
      { n: 'Recherche images Pexels',             ok: has(env.PEXELS_API_KEY) },
      { n: 'WhatsApp clients (Twilio)',           ok: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM) },
      { n: 'Publication TikTok automatique',      ok: Boolean(env.TIKTOK_ACCESS_TOKEN && env.TIKTOK_OPEN_ID) },
      { n: 'SQL SELECT Supabase',                 ok: has(env.SUPABASE_ACCESS_TOKEN) },
    ];
    const ready = feats.filter(f => f.ok);
    const missing = feats.filter(f => !f.ok);
    const capMsg = `⚡ *DZARYX CAPABILITIES — ${ready.length}/${feats.length}*\n\n✅ *Opérationnel*\n${ready.map(f => `  • ${f.n}`).join('\n')}\n\n❌ *Non configuré*\n${missing.map(f => `  • ${f.n}`).join('\n')}`;
    await sendMessage(chatId, capMsg);
    return;
  }

  // /selftest
  if (msg.text?.startsWith('/selftest')) {
    await sendTyping(chatId);
    await sendMessage(chatId, '🧪 *Self-test Dzaryx...*\n_Tests réels en cours._');
    const res: Array<{ t: string; ok: boolean; d: string }> = [];

    // Supabase bookings
    try {
      const { data, error } = await supabase.from('bookings').select('id').limit(1);
      res.push({ t: 'Supabase bookings', ok: !error, d: error?.message ?? `accessible (${data?.length ?? 0} ligne)` });
    } catch (e) { res.push({ t: 'Supabase bookings', ok: false, d: String(e) }); }

    // Supabase cars
    try {
      const { data, error } = await supabase.from('cars').select('id, name').limit(3);
      res.push({ t: 'Supabase cars', ok: !error && (data?.length ?? 0) > 0, d: error?.message ?? `${data?.length ?? 0} voiture(s)` });
    } catch (e) { res.push({ t: 'Supabase cars', ok: false, d: String(e) }); }

    // Mémoire
    try {
      const { error } = await supabase.from('ibrahim_memory').select('id').limit(1);
      res.push({ t: 'Table mémoire', ok: !error, d: error?.message ?? 'accessible' });
    } catch (e) { res.push({ t: 'Table mémoire', ok: false, d: String(e) }); }

    // Météo Open-Meteo (sans clé API)
    try {
      const { default: ax } = await import('axios');
      const r = await ax.get('https://api.open-meteo.com/v1/forecast?latitude=35.7&longitude=-0.63&current=temperature_2m&timezone=Africa%2FAlgiers', { timeout: 8000 });
      const temp = (r.data as any)?.current?.temperature_2m;
      res.push({ t: 'Météo API', ok: temp !== undefined, d: temp !== undefined ? `${temp}°C Oran` : 'Pas de réponse' });
    } catch (e) { res.push({ t: 'Météo API', ok: false, d: e instanceof Error ? e.message : String(e) }); }

    // FFmpeg
    try {
      const { default: ffmpegStatic } = await import('ffmpeg-static');
      const bin = ffmpegStatic as string | null;
      res.push({ t: 'FFmpeg (vidéo)', ok: Boolean(bin), d: bin ?? 'ffmpeg-static absent' });
    } catch (e) { res.push({ t: 'FFmpeg (vidéo)', ok: false, d: String(e) }); }

    // ElevenLabs config
    res.push({ t: 'ElevenLabs TTS', ok: Boolean(env.ELEVENLABS_API_KEY), d: env.ELEVENLABS_API_KEY ? `voix: ${env.ELEVENLABS_VOICE_ID}` : 'clé absente' });

    // Cloudinary config
    const clOk2 = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
    res.push({ t: 'Cloudinary', ok: clOk2, d: clOk2 ? `cloud: ${env.CLOUDINARY_CLOUD_NAME}` : '3 variables manquantes' });

    // Google Calendar
    res.push({ t: 'Google Calendar', ok: Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON), d: env.GOOGLE_SERVICE_ACCOUNT_JSON ? 'service account présent' : 'GOOGLE_SERVICE_ACCOUNT_JSON absent' });

    const passed = res.filter(r => r.ok).length;
    const lines = res.map(r => `${r.ok ? '✅' : '❌'} *${r.t}* — ${r.d}`);
    await sendMessage(chatId, `🧪 *RÉSULTATS SELF-TEST*\n\n${lines.join('\n')}\n\n_${passed}/${res.length} tests passés_`);
    return;
  }

  // ── VIDÉO REÇUE ──
  if (msg.video) {
    // Store file_id in buffer so merge_videos tool can retrieve it
    addVideoToBuffer(sessionId, msg.video.file_id);
    await handleVideoMessage(chatId, sessionId, msg);
    return;
  }

  // ── PHOTO OU DOCUMENT IMAGE REÇU ──
  if (msg.photo || msg.document) {
    const caption = msg.caption ?? '';

    // Si la légende contient un mot-clé d'enregistrement → stocker comme avant
    if (STORE_KEYWORDS.test(caption)) {
      await handleFileMessage(chatId, sessionId, msg);
      return;
    }

    // Sinon → analyser l'image avec Claude Vision ET proposer traitement
    await handleImageMessage(chatId, sessionId, msg);
    return;
  }

  // Text message
  if (!msg.text) return;
  const text = msg.text.trim();

  // ── Marketing video approval: "Oke" or "Non" ──────────────
  const isOke = /^(oke|ok|oké|okay|valide|validé|publie|yes|oui)$/i.test(text);
  const isNon = /^(non|no|annule|annulé|refuse|refus|nope)$/i.test(text);

  if (isOke || isNon) {
    const pending = getLatestPendingVideo();
    if (pending) {
      if (isOke) {
        approveVideo(pending.id);
        const tiktokConfigured = Boolean(env.TIKTOK_ACCESS_TOKEN && env.TIKTOK_OPEN_ID);

        if (tiktokConfigured) {
          await sendMessage(chatId, '✅ *Vidéo validée !* Publication TikTok en cours...');
          const result = await publishVideo(pending);
          if (result.success) {
            await sendMessage(chatId, `🚀 *${result.message}*\n${result.url ?? ''}`);
          } else {
            await sendMessage(chatId, `⚠️ Publication TikTok échouée: ${result.message}\n\n${buildSharePackage(pending)}`);
          }
        } else {
          // TikTok non configuré → paquet manuel directement, sans fausse promesse
          await sendMessage(chatId, `✅ *Vidéo validée !*\n\n${buildSharePackage(pending)}`);
        }
      } else {
        rejectVideo(pending.id);
        await sendMessage(chatId, '❌ Vidéo annulée. Dis "fais une vidéo marketing" quand tu veux en créer une nouvelle !');
      }
      return;
    }
    // No pending video — let Claude handle naturally
  }

  try {
    await sendTyping(chatId);
    const ctx      = await buildContext(sessionId, text);
    const response = await chatWithTools(ctx.messages, ctx.systemExtra, sessionId);

    const sendPromise = (async () => {
      for (const chunk of splitMessage(response.text, 4000)) {
        await sendMessage(chatId, chunk);
      }
      // Si la réponse contient une URL Supabase (public ou signed) → envoyer la photo
      const docUrls = response.text.match(/https:\/\/[^\s\n\])"']+supabase[^\s\n\])"']+(?:client-documents|object\/sign)[^\s\n\])"']*/g);
      if (docUrls) {
        for (const url of docUrls) {
          await sendPhoto(chatId, url).catch(async () => {
            await sendDocument(chatId, url).catch(() => {});
          });
        }
      }
    })();

    const savePromise = Promise.all([
      saveConversationTurn(sessionId, 'user',      text,          { source: 'telegram' }),
      saveConversationTurn(sessionId, 'assistant', response.text, { source: 'telegram' }),
    ]).catch(e => console.error('[telegram] Save error:', e));

    await Promise.all([sendPromise, savePromise]);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[telegram] Error:', errMsg);
    await sendMessage(chatId, `⚠️ Erreur: ${errMsg.slice(0, 300)}`);
  }
});

// ── TRAITEMENT VIDÉO AUTOMATIQUE ──────────────────────────────────
async function handleVideoMessage(chatId: number, sessionId: string, msg: TelegramMessage): Promise<void> {
  try {
    if (!cloudinary) {
      await sendMessage(chatId, '⚠️ Cloudinary non configuré.');
      return;
    }

    await sendTyping(chatId);

    const videoFile = msg.video;
    if (!videoFile) return;

    const caption = msg.caption ?? '';

    // 1. Télécharger depuis Telegram
    await sendMessage(chatId, '⏳ Téléchargement...');
    const buffer = await downloadFile(videoFile.file_id);
    if (!buffer) {
      await sendMessage(chatId, '⚠️ Impossible de télécharger la vidéo.');
      return;
    }

    // 2. Upload sur Cloudinary
    await sendMessage(chatId, '☁️ Upload sur Cloudinary...');
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'video', folder: 'telegram_videos' },
        (error: any, result: any) => { if (error) reject(error); else resolve(result); }
      );
      uploadStream.end(buffer);
    });
    const videoUrl      = uploadResult.secure_url as string;
    const videoPublicId = uploadResult.public_id  as string;

    // Détecte si c'est une référence UI (design à copier)
    const UI_KEYWORDS = /ressemble|interface|design|style|ui|apparence|copie|même look|même style|jarvis|modifie l'interface|change l'interface/i;
    const isUIRef = UI_KEYWORDS.test(caption);

    // 3a. SI référence UI → extraire frame + analyse Vision → modifier interface
    if (isUIRef) {
      await sendMessage(chatId, '🎨 Analyse du design dans la vidéo...');

      // Cloudinary extrait automatiquement la première frame en ajoutant .jpg
      const frameUrl = videoUrl.replace(/\.(mp4|mov|avi|webm)$/i, '.jpg')
        .replace('/video/upload/', '/video/upload/so_0,f_jpg/');

      // Télécharger la frame
      const frameBuffer = await axios.get(frameUrl, { responseType: 'arraybuffer', timeout: 15_000 })
        .then((r: { data: ArrayBuffer }) => Buffer.from(r.data))
        .catch(() => null);

      if (frameBuffer) {
        const base64Frame = frameBuffer.toString('base64');

        const visionResp = await anthropic.messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 2048,
          system: `Analyse cette interface UI avec TOUS les détails visuels:
- Couleurs exactes (background, texte, boutons, bordures) avec codes hex si possible
- Layout et disposition des éléments
- Typographie (police, taille, poids)
- Effets visuels (gradient, glow, blur, ombre)
- Composants présents (boutons, cartes, barres, cercles, vagues)
- Style général (futuriste, minimal, glassmorphism, neon, etc.)
Sois TRÈS précis — cette description servira à reproduire exactement ce design.`,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Frame } },
              { type: 'text',  text: `Demande: "${caption}" — Décris ce design en détail.` },
            ],
          }],
        });

        const uiDescription = visionResp.content
          .filter(b => b.type === 'text')
          .map(b => (b as Anthropic.TextBlock).text)
          .join('');

        const actionMessage = `[Référence UI extraite d'une vidéo — analyse visuelle:\n${uiDescription}]\n\nDemande de Kouider: "${caption}"\n\nModifie l'interface mobile Dzaryx pour qu'elle ressemble à ce design.\nFichiers dans repo "ibrahim":\n- mobile/src/components/ChatInterface.tsx\n- mobile/src/components/ChatInterface.css\n\nProcédure: github_read_file les deux → modifier → github_write_file → Netlify redéploie.`;

        const ctx      = await buildContext(sessionId, actionMessage);
        const response = await chatWithTools(ctx.messages, ctx.systemExtra, sessionId);
        await sendMessage(chatId, response.text);
        await saveConversationTurn(sessionId, 'user', `[Vidéo UI ref — "${caption}"]`, { source: 'telegram', type: 'video_ui', url: videoUrl });
        return;
      }

      await sendMessage(chatId, '⚠️ Impossible d\'extraire la frame. Essaie avec une photo à la place.');
      return;
    }

    // 3b. Traitement vidéo normal
    await sendMessage(chatId, '🤖 Dzaryx traite ta demande...');

    const userRequest = caption
      ? `Vidéo reçue via Telegram et uploadée sur Cloudinary.\nURL: ${videoUrl}\nCloudinary public_id: ${videoPublicId}\n\nDemande de Kouider: "${caption}"\n\nUtilise l'outil approprié:\n- cut_video: pour couper/limiter la durée (video_url="${videoUrl}", start_seconds=0, end_seconds=N)\n- create_video_preview: pour garder uniquement les N premières secondes (video_url="${videoUrl}", duration_seconds=N)\n- optimize_for_platform: pour TikTok/YouTube (video_url="${videoUrl}", platform="tiktok"|"youtube")\nRetourne l'URL résultante dans ta réponse.`
      : `Vidéo reçue via Telegram.\nURL: ${videoUrl}\n\nAucune instruction. Analyse et propose ce que je peux en faire.`;

    const ctx = await buildContext(sessionId, userRequest);
    const response = await chatWithTools(ctx.messages, ctx.systemExtra, sessionId);

    await sendMessage(chatId, response.text);

    // Extraire et renvoyer la vidéo Cloudinary modifiée
    // Le regex accepte les URLs Cloudinary avec ou sans extension .mp4 dans le path
    const urlMatch = response.text.match(/https:\/\/res\.cloudinary\.com\/[^\s\n)"']+/);
    if (urlMatch && urlMatch[0] !== videoUrl) {
      await sendVideo(chatId, urlMatch[0]);
    }

    await saveConversationTurn(sessionId, 'user',
      `[Vidéo Telegram${caption ? ` — "${caption}"` : ''}]`,
      { source: 'telegram', type: 'video', url: videoUrl }
    );

  } catch (err) {
    console.error('[telegram] handleVideoMessage error:', err instanceof Error ? err.message : String(err));
    await sendMessage(chatId, `⚠️ Erreur: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── TRAITEMENT IMAGE — Claude Vision complet ─────────────────────
async function handleImageMessage(chatId: number, sessionId: string, msg: TelegramMessage): Promise<void> {
  try {
    await sendTyping(chatId);

    const caption = msg.caption ?? '';

    // ── Récupérer le fileId et mimeType ──────────────────────────
    let fileId: string;
    let mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

    if (msg.photo && msg.photo.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      if (!largest) { await sendMessage(chatId, '⚠️ Photo illisible.'); return; }
      fileId = largest.file_id;
    } else if (msg.document) {
      fileId = msg.document.file_id;
      const mime = msg.document.mime_type ?? '';
      if (mime === 'image/png')       mimeType = 'image/png';
      else if (mime === 'image/gif')  mimeType = 'image/gif';
      else if (mime === 'image/webp') mimeType = 'image/webp';
    } else {
      return;
    }

    // ── Télécharger l'image ───────────────────────────────────────
    const buffer = await downloadFile(fileId);
    if (!buffer) { await sendMessage(chatId, '⚠️ Impossible de télécharger la photo.'); return; }

    const base64Image = buffer.toString('base64');

    // ── Vision Claude — analyse complète en une seule passe ───────
    // Le system prompt donne à Claude tout le contexte Dzaryx
    const visionPrompt = caption
      ? `Photo reçue sur Telegram avec ce message: "${caption}"\n\nAnalyse d'abord l'image en détail, puis réponds à la demande.`
      : `Photo reçue sur Telegram sans message. Analyse-la et dis-moi ce que tu vois avec tous les détails utiles (texte visible, personnes, documents, interface, voiture, lieu, etc.).`;

    const visionResp = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `Tu es Dzaryx, assistant IA personnel de Kouider — fondateur de Fik Conciergerie à Oran.
Tu analyses les images envoyées sur Telegram avec une précision maximale.

SELON LE TYPE D'IMAGE:
- Passeport/permis → extrais TOUS les champs: nom complet, numéro, date naissance, expiration, nationalité
- Capture d'écran d'une réservation/tableau → liste toutes les données visibles (noms, prix, dates, statuts)
- Photo de voiture → identifie le modèle, état, plaque si visible, remarques
- Interface/design → décris couleurs exactes, layout, composants, effets visuels (pour reproduire)
- Facture/document commercial → extrais montants, dates, parties concernées
- Photo générale → décris le contenu de façon précise et utile

RÈGLES:
- Répondre en FRANÇAIS
- Sois EXHAUSTIF — mentionne TOUS les détails visibles
- Si c'est un document client → propose directement de l'enregistrer (store_document)
- Si c'est une interface UI → propose de modifier l'app pour y ressembler
- Si c'est une voiture → fais le lien avec la flotte Fik Conciergerie si pertinent
- Ton conversationnel naturel — tu es Dzaryx, pas un robot d'analyse`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          { type: 'text',  text: visionPrompt },
        ],
      }],
    });

    const visionText = visionResp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // ── Passer la description Vision à Dzaryx avec tous ses outils ─
    const fullMessage = caption
      ? `[Photo reçue sur Telegram]\n\nVision Claude:\n${visionText}\n\nMessage de Kouider: "${caption}"`
      : `[Photo reçue sur Telegram]\n\nVision Claude:\n${visionText}`;

    const ctx      = await buildContext(sessionId, fullMessage);
    const response = await chatWithTools(ctx.messages, ctx.systemExtra, sessionId);

    // Envoyer la réponse de Dzaryx
    for (const chunk of splitMessage(response.text, 4000)) {
      await sendMessage(chatId, chunk);
    }

    // Uploader sur Cloudinary en background (pour les outils media si besoin)
    let imageUrl = '';
    if (cloudinary) {
      try {
        const uploadResult = await new Promise<any>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: 'image', folder: 'telegram_images' },
            (err: any, res: any) => { if (err) reject(err); else resolve(res); },
          );
          stream.end(buffer);
        });
        imageUrl = uploadResult.secure_url as string;
      } catch { /* cloudinary optionnel */ }
    }

    await Promise.all([
      saveConversationTurn(sessionId, 'user',
        `[Photo Telegram${caption ? ` — "${caption}"` : ''}]\n${visionText.slice(0, 500)}`,
        { source: 'telegram', type: 'image', url: imageUrl, vision: visionText },
      ),
      saveConversationTurn(sessionId, 'assistant', response.text, { source: 'telegram' }),
    ]).catch(e => console.error('[telegram] save error:', e));

  } catch (err) {
    console.error('[telegram] handleImageMessage error:', err instanceof Error ? err.message : String(err));
    await sendMessage(chatId, `⚠️ Erreur analyse photo: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Enregistrement document (passeport, permis, contrat) ──────
async function handleFileMessage(chatId: number, sessionId: string, msg: TelegramMessage): Promise<void> {
  try {
    await sendTyping(chatId);

    let fileId:   string;
    let fileName: string;
    let mimeType: string;

    if (msg.photo && msg.photo.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      if (!largest) { await sendMessage(chatId, '⚠️ Photo illisible.'); return; }
      fileId   = largest.file_id;
      fileName = `photo_${Date.now()}.jpg`;
      mimeType = 'image/jpeg';
    } else if (msg.document) {
      fileId   = msg.document.file_id;
      fileName = msg.document.file_name ?? `doc_${Date.now()}`;
      mimeType = msg.document.mime_type ?? 'application/octet-stream';
    } else {
      return;
    }

    const buffer = await downloadFile(fileId);
    if (!buffer) {
      await sendMessage(chatId, '⚠️ Impossible de télécharger le fichier.');
      return;
    }

    const caption = msg.caption ?? '';
    const { docType, clientName, clientPhone, bookingNote } = parseCaption(caption);

    await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

    const safeName    = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const phone       = clientPhone ?? 'inconnu';
    const storagePath = `${phone}/${docType}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error('[telegram] Storage upload failed:', uploadError.message);
      await sendMessage(chatId, `⚠️ Erreur stockage: ${uploadError.message}`);
      return;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    // OCR automatique pour passeports et permis
    let ocrExtracted: Record<string, string> = {};
    let ocrText = '';
    if ((docType === 'passport' || docType === 'license') && mimeType.startsWith('image/')) {
      try {
        const base64Image = buffer.toString('base64');
        const prompt = docType === 'passport'
          ? 'Extrais les infos de ce passeport. JSON UNIQUEMENT:\n{"name":"","passport_number":"","birth_date":"","expiry_date":"","nationality":""}'
          : 'Extrais les infos de ce permis de conduire. JSON UNIQUEMENT:\n{"name":"","license_number":"","birth_date":"","expiry_date":"","category":""}';

        const ocrResp = await anthropic.messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 256,
          messages:   [{
            role:    'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64Image } },
              { type: 'text',  text: prompt },
            ],
          }],
        });

        const raw = ocrResp.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('');
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          ocrExtracted = JSON.parse(match[0]) as Record<string, string>;
          if (docType === 'passport') {
            ocrText = `\n\n📋 *Info extraite:*\n• Nom: ${ocrExtracted['name'] || '?'}\n• N°: ${ocrExtracted['passport_number'] || '?'}\n• Né(e): ${ocrExtracted['birth_date'] || '?'}\n• Expire: ${ocrExtracted['expiry_date'] || '?'}\n• Nationalité: ${ocrExtracted['nationality'] || '?'}`;
          } else {
            ocrText = `\n\n📋 *Info extraite:*\n• Nom: ${ocrExtracted['name'] || '?'}\n• N°: ${ocrExtracted['license_number'] || '?'}\n• Né(e): ${ocrExtracted['birth_date'] || '?'}\n• Expire: ${ocrExtracted['expiry_date'] || '?'}\n• Catégorie: ${ocrExtracted['category'] || '?'}`;
          }
        }
      } catch (ocrErr) {
        console.error('[telegram] OCR failed:', ocrErr instanceof Error ? ocrErr.message : String(ocrErr));
      }
    }

    const notesValue = Object.keys(ocrExtracted).length > 0
      ? JSON.stringify(ocrExtracted)
      : (bookingNote ?? caption ?? null);

    // Auto-link: chercher la réservation active du client pour lier booking_id
    const resolvedName  = clientName ?? ocrExtracted['name'] ?? null;
    const resolvedPhone = clientPhone ?? null;
    let linkedBookingId: string | null = null;
    let linkedBookingInfo = '';

    try {
      let bQuery = supabase
        .from('bookings')
        .select('id, client_name, cars(name), start_date, end_date')
        .in('status', ['CONFIRMED', 'ACTIVE', 'PENDING'])
        .order('start_date', { ascending: false })
        .limit(1);

      if (resolvedPhone) {
        bQuery = bQuery.ilike('client_phone', `%${resolvedPhone.replace(/\D/g, '').slice(-8)}%`);
      } else if (resolvedName) {
        const firstName = resolvedName.split(' ')[0] ?? '';
        bQuery = bQuery.ilike('client_name', `%${firstName}%`);
      }

      const { data: bookings } = await bQuery;
      if (bookings?.[0]) {
        const b = bookings[0] as unknown as { id: string; client_name: string; cars?: { name: string } | { name: string }[]; start_date: string; end_date: string };
        const carName = Array.isArray(b.cars) ? b.cars[0]?.name : b.cars?.name;
        linkedBookingId  = b.id;
        linkedBookingInfo = ` | 🔗 Lié à: ${b.client_name} — ${carName ?? '?'} (${b.start_date} → ${b.end_date})`;
      }
    } catch { /* lookup optionnel */ }

    const { error: dbError } = await supabase.from('client_documents').insert({
      client_phone: phone,
      client_name:  resolvedName ?? 'Inconnu',
      type:         docType,
      file_url:     urlData.publicUrl,
      storage_path: storagePath,
      notes:        notesValue,
      ...(linkedBookingId ? { booking_id: linkedBookingId } : {}),
    });

    if (dbError) console.error('[telegram] DB insert failed:', dbError.message);

    const label = docType === 'passport' ? 'Passeport'
                : docType === 'license'  ? 'Permis'
                : docType === 'contract' ? 'Contrat'
                : 'Document';

    const nameStr  = resolvedName  ? ` de *${resolvedName}*` : '';
    const phoneStr = resolvedPhone ? ` (${resolvedPhone})`   : '';
    const noteStr  = bookingNote && !ocrText ? `\n📝 Note: ${bookingNote}` : '';

    await sendMessage(chatId,
      `✅ ${label}${nameStr}${phoneStr} enregistré.${noteStr}${ocrText}${linkedBookingInfo}`,
    );

    // Renvoyer le fichier directement dans le chat — sendPhoto pour photo, sendDocument sinon
    const fileCaption = `📄 ${label}${nameStr}${phoneStr} — enregistré ✅`;
    if (msg.photo) {
      await sendPhoto(chatId, fileId, fileCaption);
    } else {
      await sendDocument(chatId, fileId, fileCaption);
    }

    await saveConversationTurn(sessionId, 'user',
      `[Document reçu: ${label}${nameStr}${phoneStr} — stocké dans Supabase Storage: ${urlData.publicUrl}]`,
      { source: 'telegram', type: 'document' },
    );

  } catch (err) {
    console.error('[telegram] handleFileMessage error:', err instanceof Error ? err.message : String(err));
    await sendMessage(chatId, '⚠️ Erreur traitement fichier.');
  }
}

function parseCaption(caption: string): {
  docType:     'passport' | 'license' | 'contract' | 'other';
  clientName?: string;
  clientPhone?: string;
  bookingNote?: string;
} {
  const lower = caption.toLowerCase();

  let docType: 'passport' | 'license' | 'contract' | 'other' = 'other';
  if (/passport|passeport/.test(lower))          docType = 'passport';
  else if (/permis|license|licence/.test(lower)) docType = 'license';
  else if (/contrat|contract/.test(lower))       docType = 'contract';

  const phoneMatch  = caption.match(/(?:\+213|0)([\d\s]{8,11})/);
  const clientPhone = phoneMatch ? phoneMatch[0].replace(/\s/g, '') : undefined;

  const nameMatch  = caption.match(/(?:pour|de|client)\s+([A-ZÀ-Ö][a-zà-ö]+(?:\s+[A-ZÀ-Ö][a-zà-ö]+)?)/i);
  const clientName = nameMatch ? nameMatch[1] : undefined;

  return { docType, clientName, clientPhone, bookingNote: caption || undefined };
}

// POST /api/telegram/setup
router.post('/setup', requireMobileAuth, async (req, res) => {
  const { baseUrl } = req.body as { baseUrl?: string };
  const url = `${baseUrl ?? 'https://ibrahim-backend-production.up.railway.app'}/api/telegram/webhook`;
  const ok  = await setWebhook(url);
  res.json({ ok, webhookUrl: url });
});

// GET /api/telegram/setup
router.get('/setup', requireMobileAuth, async (_req, res) => {
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  try {
    const { default: axios } = await import('axios');
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { parts.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = maxLen;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return parts;
}

export default router;
