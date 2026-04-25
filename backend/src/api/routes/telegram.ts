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
import Anthropic from '@anthropic-ai/sdk';
import {
  analyzeImage, optimizeImage, enhanceImage, removeBackground, createSocialVariants,
} from '../../integrations/media-processing.js';

const router   = Router();
const BUCKET   = 'client-documents';
const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] ?? '' });

// Cloudinary import dynamique (CommonJS compatible)
let cloudinary: any;
(async () => {
  const { v2 } = await import('cloudinary');
  cloudinary = v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'demo',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
    secure: true,
  });
})();

function isAllowed(chatId: number): boolean {
  const allowed = process.env['TELEGRAM_ALLOWED_CHATS'] ?? '';
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
    await sendMessage(chatId, `Salam Kouider ! Je suis Ibrahim 🚗\n\nEnvoie-moi:\n📸 Photo → je l'analyse et modifie\n🎥 Vidéo → je la découpe, optimise, sous-titre\n💬 Message → je réponds à tout\n\nTu peux me dire ce que tu veux faire avec tes médias !`);
    return;
  }

  // ── VIDÉO REÇUE ──
  if (msg.video) {
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

  try {
    await sendTyping(chatId);
    const ctx      = await buildContext(sessionId, text);
    const response = await chatWithTools(ctx.messages, ctx.systemExtra);

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

        const actionMessage = `[Référence UI extraite d'une vidéo — analyse visuelle:\n${uiDescription}]\n\nDemande de Kouider: "${caption}"\n\nModifie l'interface mobile Ibrahim pour qu'elle ressemble à ce design.\nFichiers dans repo "ibrahim":\n- mobile/src/components/ChatInterface.tsx\n- mobile/src/components/ChatInterface.css\n\nProcédure: github_read_file les deux → modifier → github_write_file → Netlify redéploie.`;

        const ctx      = await buildContext(sessionId, actionMessage);
        const response = await chatWithTools(ctx.messages, ctx.systemExtra);
        await sendMessage(chatId, response.text);
        await saveConversationTurn(sessionId, 'user', `[Vidéo UI ref — "${caption}"]`, { source: 'telegram', type: 'video_ui', url: videoUrl });
        return;
      }

      await sendMessage(chatId, '⚠️ Impossible d\'extraire la frame. Essaie avec une photo à la place.');
      return;
    }

    // 3b. Traitement vidéo normal
    await sendMessage(chatId, '🤖 Ibrahim traite ta demande...');

    const userRequest = caption
      ? `Vidéo reçue via Telegram et uploadée sur Cloudinary.\nURL: ${videoUrl}\nCloudinary public_id: ${videoPublicId}\n\nDemande de Kouider: "${caption}"\n\nUtilise l'outil approprié:\n- cut_video: pour couper/limiter la durée (video_url="${videoUrl}", start_seconds=0, end_seconds=N)\n- create_video_preview: pour garder uniquement les N premières secondes (video_url="${videoUrl}", duration_seconds=N)\n- optimize_for_platform: pour TikTok/YouTube (video_url="${videoUrl}", platform="tiktok"|"youtube")\nRetourne l'URL résultante dans ta réponse.`
      : `Vidéo reçue via Telegram.\nURL: ${videoUrl}\n\nAucune instruction. Analyse et propose ce que je peux en faire.`;

    const ctx = await buildContext(sessionId, userRequest);
    const response = await chatWithTools(ctx.messages, ctx.systemExtra);

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

// ── TRAITEMENT IMAGE AUTOMATIQUE ──────────────────────────────────
async function handleImageMessage(chatId: number, sessionId: string, msg: TelegramMessage): Promise<void> {
  try {
    if (!cloudinary) {
      await sendMessage(chatId, '⚠️ Cloudinary en cours de chargement, réessaie dans 2 secondes...');
      return;
    }

    await sendTyping(chatId);

    let fileId: string;
    let mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

    if (msg.photo && msg.photo.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      if (!largest) { await sendMessage(chatId, '⚠️ Photo illisible.'); return; }
      fileId   = largest.file_id;
      mimeType = 'image/jpeg';
    } else if (msg.document) {
      fileId = msg.document.file_id;
      const mime = msg.document.mime_type ?? '';
      if (mime === 'image/png')       mimeType = 'image/png';
      else if (mime === 'image/gif')  mimeType = 'image/gif';
      else if (mime === 'image/webp') mimeType = 'image/webp';
      else                            mimeType = 'image/jpeg';
    } else {
      return;
    }

    const caption = msg.caption ?? '';

    // 1. Télécharger l'image depuis Telegram
    await sendMessage(chatId, '⏳ Téléchargement de l\'image...');
    const buffer = await downloadFile(fileId);
    if (!buffer) {
      await sendMessage(chatId, '⚠️ Impossible de télécharger l\'image.');
      return;
    }

    // 2. Upload sur Cloudinary
    await sendMessage(chatId, '☁️ Upload sur Cloudinary...');
    
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'image', folder: 'telegram_images' },
        (error: any, result: any) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(buffer);
    });

    const imageUrl = uploadResult.secure_url;

    // 3. ANALYSE VISION CLAUDE pour comprendre l'image
    await sendMessage(chatId, '👁️ Analyse de l\'image...');
    const base64Image = buffer.toString('base64');

    // Détecter si c'est une référence d'interface UI
    const UI_KEYWORDS = /ressemble|interface|design|style|ui|apparence|copie|même look|même style|jarvis|modifie l'interface|change l'interface/i;
    const isUIReference = caption && UI_KEYWORDS.test(caption);

    const visionSystemPrompt = isUIReference
      ? `Tu es Ibrahim, assistant IA de Kouider. Analyse cette image d'interface UI avec TOUS les détails visuels:
- Couleurs exactes (background, texte, boutons, bordures) avec codes hex si possible
- Layout et disposition des éléments
- Typographie (police, taille, poids)
- Effets visuels (gradient, glow, blur, ombre, animation si visible)
- Composants présents (boutons, cartes, barres, cercles, vagues)
- Style général (futuriste, minimal, glassmorphism, neon, etc.)
Sois TRÈS précis et exhaustif — cette description servira à reproduire exactement ce design.`
      : `Tu es Ibrahim, assistant IA de Kouider (Fik Conciergerie Oran).
Analyse précisément cette image. Si c'est un tableau/dashboard → liste tous les noms, prix, données visibles.
Si c'est une capture d'écran → identifie le contenu exact. Sois exhaustif et précis.`;

    const visionResponse = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: isUIReference ? 2048 : 1024,
      system: visionSystemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          { type: 'text',  text: caption ? `Message joint: "${caption}"` : 'Décris ce que tu vois en détail.' },
        ],
      }],
    });

    const imageDescription = visionResponse.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    // 4. Détecter si c'est une ACTION à exécuter
    const ACTION_KEYWORDS = /modif|chang|corrig|mett|updat|prix|montant|réserv|client|supprim|créé|ajoute|ressemble|interface|design|style|ui|apparence|copie|jarvis/i;

    if (caption && ACTION_KEYWORDS.test(caption)) {
      await sendMessage(chatId, isUIReference ? '🎨 Analyse du design... Je vais modifier mon interface.' : '⚙️ Exécution de l\'action...');

      const actionMessage = isUIReference
        ? `[Référence UI reçue — analyse visuelle détaillée:\n${imageDescription}]\n\nDemande de Kouider: "${caption}"\n\nTu dois modifier ton interface mobile pour qu'elle ressemble à cette référence.\nFichiers à modifier dans le repo "ibrahim":\n- mobile/src/components/ChatInterface.tsx\n- mobile/src/components/ChatInterface.css\n\nProcédure: github_read_file les deux fichiers → modifier CSS/TSX pour reproduire le design → github_write_file → Netlify redéploie auto.`
        : `[Capture d'écran reçue — contenu visible: ${imageDescription}]\n\nDemande de Kouider: ${caption}`;

      const ctx      = await buildContext(sessionId, actionMessage);
      const response = await chatWithTools(ctx.messages, ctx.systemExtra);

      await sendMessage(chatId, response.text);

      await Promise.all([
        saveConversationTurn(sessionId, 'user',      actionMessage,  { source: 'telegram', type: 'image_action', url: imageUrl }),
        saveConversationTurn(sessionId, 'assistant', response.text,  { source: 'telegram' }),
      ]);

      return;
    }

    // 5. SINON → Traitement image selon demande
    const lowerCaption = caption.toLowerCase();
    let processedUrl = imageUrl;
    let action = 'Image reçue et analysée';

    if (/optim|compress|rédui|léger|web/i.test(lowerCaption)) {
      await sendMessage(chatId, '🔧 Optimisation de l\'image...');
      const optimized = await optimizeImage(imageUrl, 'web');
      processedUrl = optimized.url;
      action = `Optimisée (${optimized.size_reduction_percent}% plus légère)`;
    } else if (/améliore|enhance|qualité|nettet/i.test(lowerCaption)) {
      await sendMessage(chatId, '✨ Amélioration qualité...');
      processedUrl = await enhanceImage(imageUrl);
      action = 'Qualité améliorée (contraste, luminosité, netteté)';
    } else if (/fond|background|détour/i.test(lowerCaption)) {
      await sendMessage(chatId, '🎭 Suppression du fond...');
      processedUrl = await removeBackground(imageUrl);
      action = 'Fond supprimé (PNG transparent)';
    } else if (/social|tiktok|insta|facebook|story|post/i.test(lowerCaption)) {
      await sendMessage(chatId, '📱 Création variantes réseaux sociaux...');
      const variants = await createSocialVariants(imageUrl);
      
      await sendMessage(chatId,
        `✅ **Variantes créées:**\n\n` +
        `📸 **TikTok/Reels (9:16)**\n${variants.tiktok}\n\n` +
        `📸 **Instagram Post (1:1)**\n${variants.instagram_feed}\n\n` +
        `📸 **Instagram Story (9:16)**\n${variants.instagram_story}\n\n` +
        `📸 **YouTube (16:9)**\n${variants.youtube}`
      );

      await sendPhoto(chatId, variants.tiktok);
      action = 'Variantes réseaux sociaux créées';
    }

    // 6. Analyse qualité
    const analysis = await analyzeImage(imageUrl);

    // 7. Envoyer résultat
    const resultMsg = `✅ **Image traitée** — ${action}\n\n` +
      `👁️ **Vision:**\n${imageDescription}\n\n` +
      `📊 **Analyse technique:**\n` +
      `• Résolution: ${analysis.width}x${analysis.height}\n` +
      `• Taille: ${analysis.size_kb} KB\n` +
      `• Format: ${analysis.format}\n` +
      `• Score qualité: ${analysis.quality_score}/100\n\n` +
      (analysis.suggestions.length > 0 ? `💡 **Suggestions:**\n${analysis.suggestions.join('\n')}\n\n` : '') +
      `🔗 Lien: ${processedUrl}`;

    await sendMessage(chatId, resultMsg);

    // Envoyer l'image traitée si différente de l'originale
    if (processedUrl !== imageUrl) {
      await sendPhoto(chatId, processedUrl);
    }

    await saveConversationTurn(sessionId, 'user',
      `[Image reçue${caption ? ` — "${caption}"` : ''} → ${action}]`,
      { source: 'telegram', type: 'image', url: processedUrl, vision: imageDescription }
    );

  } catch (err) {
    console.error('[telegram] handleImageMessage error:', err instanceof Error ? err.message : String(err));
    await sendMessage(chatId, `⚠️ Erreur traitement image: ${err instanceof Error ? err.message : String(err)}`);
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

    const { error: dbError } = await supabase.from('client_documents').insert({
      client_phone: phone,
      client_name:  clientName ?? 'Inconnu',
      type:         docType,
      file_url:     urlData.publicUrl,
      storage_path: storagePath,
      notes:        bookingNote ?? caption ?? null,
    });

    if (dbError) console.error('[telegram] DB insert failed:', dbError.message);

    const label = docType === 'passport' ? 'Passeport'
                : docType === 'license'  ? 'Permis'
                : docType === 'contract' ? 'Contrat'
                : 'Document';

    const nameStr  = clientName  ? ` de *${clientName}*` : '';
    const phoneStr = clientPhone ? ` (${clientPhone})`   : '';
    const noteStr  = bookingNote ? `\n📝 Note: ${bookingNote}` : '';

    await sendMessage(chatId,
      `✅ ${label}${nameStr}${phoneStr} enregistré dans Supabase.${noteStr}`,
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
  const token = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
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
