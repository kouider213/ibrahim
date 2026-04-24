import { Router } from 'express';
import {
  sendMessage, sendTyping, setWebhook, downloadFile, getFileUrl,
  type TelegramUpdate, type TelegramMessage,
} from '../../integrations/telegram.js';
import { chatWithTools } from '../../integrations/claude-api.js';
import { buildContext } from '../../conversation/context-builder.js';
import { saveConversationTurn, supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';
import Anthropic from '@anthropic-ai/sdk';

const router   = Router();
const BUCKET   = 'client-documents';
const anthropic = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] ?? '' });

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
    await sendMessage(chatId, `Salam ! Je suis Ibrahim 🚗\nEnvoie message, photo ou document.`);
    return;
  }

  // Photo ou document reçu
  if (msg.photo || msg.document) {
    const caption = msg.caption ?? '';

    // Si la légende contient un mot-clé d'enregistrement → stocker comme avant
    if (STORE_KEYWORDS.test(caption)) {
      await handleFileMessage(chatId, sessionId, msg);
      return;
    }

    // Sinon → analyser l'image avec Claude Vision et répondre intelligemment
    await handleImageAnalysis(chatId, sessionId, msg);
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
    })();

    const savePromise = Promise.all([
      saveConversationTurn(sessionId, 'user',      text,          { source: 'telegram' }),
      saveConversationTurn(sessionId, 'assistant', response.text, { source: 'telegram' }),
    ]).catch(e => console.error('[telegram] Save error:', e));

    await Promise.all([sendPromise, savePromise]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[telegram] Error:', msg);
    await sendMessage(chatId, `⚠️ Erreur: ${msg.slice(0, 300)}`);
  }
});

// ── Analyse image avec Claude Vision ──────────────────────────
async function handleImageAnalysis(chatId: number, sessionId: string, msg: TelegramMessage): Promise<void> {
  try {
    await sendTyping(chatId);

    // Récupérer le file_id
    let fileId: string;
    let mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

    if (msg.photo && msg.photo.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      if (!largest) { await sendMessage(chatId, '⚠️ Photo illisible.'); return; }
      fileId = largest.file_id;
      mimeType = 'image/jpeg';
    } else if (msg.document) {
      fileId = msg.document.file_id;
      const mime = msg.document.mime_type ?? '';
      if (mime === 'image/png')  mimeType = 'image/png';
      else if (mime === 'image/gif')  mimeType = 'image/gif';
      else if (mime === 'image/webp') mimeType = 'image/webp';
      else mimeType = 'image/jpeg';
    } else {
      return;
    }

    // Télécharger l'image en buffer
    const buffer = await downloadFile(fileId);
    if (!buffer) {
      await sendMessage(chatId, '⚠️ Impossible de télécharger la photo.');
      return;
    }

    const base64Image = buffer.toString('base64');
    const caption     = msg.caption ?? '';

    // Construire le prompt selon le contexte
    const userQuestion = caption
      ? `L'utilisateur a envoyé cette image avec le message: "${caption}". Analyse-la et réponds en conséquence.`
      : `L'utilisateur a envoyé cette image. Analyse son contenu et dis ce que tu vois, ou aide à résoudre le problème si c'est une capture d'écran d'un problème.`;

    // Appel Claude Vision directement
    const response = await anthropic.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 1024,
      system: `Tu es Ibrahim, l'assistant IA de Kouider (Fik Conciergerie Oran). 
Tu analyses les images envoyées par Kouider et tu réponds en français de manière utile et précise.
Si c'est une capture d'écran d'un site web → identifie les erreurs/problèmes affichés.
Si c'est un document → résume le contenu.
Si c'est une photo → décris ce que tu vois et aide si nécessaire.`,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: {
              type:       'base64',
              media_type: mimeType,
              data:       base64Image,
            },
          },
          {
            type: 'text',
            text: userQuestion,
          },
        ],
      }],
    });

    const analysisText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    // Sauvegarder dans la conversation pour que Ibrahim garde le contexte
    const userTurnText = caption
      ? `[Image envoyée avec message: "${caption}"]`
      : `[Image envoyée — analyse: ${analysisText.slice(0, 200)}...]`;

    await Promise.all([
      sendMessage(chatId, analysisText),
      saveConversationTurn(sessionId, 'user',      userTurnText,  { source: 'telegram', type: 'image' }),
      saveConversationTurn(sessionId, 'assistant', analysisText,  { source: 'telegram' }),
    ]);

  } catch (err) {
    console.error('[telegram] handleImageAnalysis error:', err instanceof Error ? err.message : String(err));
    await sendMessage(chatId, '⚠️ Impossible d\'analyser l\'image.');
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

    const caption = msg.caption ?? msg.text ?? '';
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
      `✅ ${label}${nameStr}${phoneStr} enregistré dans Supabase.${noteStr}\n🔗 ${urlData.publicUrl}`,
    );

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
