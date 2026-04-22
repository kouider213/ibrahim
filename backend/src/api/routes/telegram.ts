import { Router } from 'express';
import {
  sendMessage, sendTyping, setWebhook, downloadFile,
  type TelegramUpdate, type TelegramMessage,
} from '../../integrations/telegram.js';
import { processMessage } from '../../conversation/orchestrator.js';
import { saveConversationTurn, supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();
const BUCKET = 'client-documents';

function isAllowed(chatId: number): boolean {
  const allowed = process.env['TELEGRAM_ALLOWED_CHATS'] ?? '';
  if (!allowed) return true;
  return allowed.split(',').map(s => s.trim()).includes(String(chatId));
}

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

  // Photo or document → store as client document
  if (msg.photo || msg.document) {
    await handleFileMessage(chatId, sessionId, msg);
    return;
  }

  // Text message
  if (!msg.text) return;
  const text = msg.text.trim();

  try {
    await sendTyping(chatId);
    // textOnly=true → orchestrator exécute les actions MAIS pas de voice/audio
    const result = await processMessage(text, sessionId, true);
    for (const chunk of splitMessage(result.text, 4000)) {
      await sendMessage(chatId, chunk);
    }
  } catch (err) {
    console.error('[telegram] Error:', err instanceof Error ? err.message : String(err));
    await sendMessage(chatId, '⚠️ Erreur, réessaie dans un instant.');
  }
});

async function handleFileMessage(chatId: number, sessionId: string, msg: TelegramMessage): Promise<void> {
  try {
    await sendTyping(chatId);

    // Get file_id: photo = largest size, document = file_id
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

    // Download from Telegram
    const buffer = await downloadFile(fileId);
    if (!buffer) {
      await sendMessage(chatId, '⚠️ Impossible de télécharger le fichier.');
      return;
    }

    // Parse caption to detect type + client name
    const caption = msg.caption ?? msg.text ?? '';
    const { docType, clientName, clientPhone, bookingNote } = parseCaption(caption);

    // Ensure bucket exists
    await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

    // Upload to Supabase Storage
    const safeName  = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const phone     = clientPhone ?? 'inconnu';
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

    // Save to client_documents
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

    const nameStr  = clientName  ? ` de *${clientName}*`   : '';
    const phoneStr = clientPhone ? ` (${clientPhone})`     : '';
    const noteStr  = bookingNote ? `\n📝 Note: ${bookingNote}` : '';

    await sendMessage(chatId,
      `✅ ${label}${nameStr}${phoneStr} enregistré dans Supabase.${noteStr}\n🔗 ${urlData.publicUrl}`,
    );

    // Also save to conversation so Ibrahim remembers
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

  // Extract phone number
  const phoneMatch = caption.match(/(?:\+213|0)([\d\s]{8,11})/);
  const clientPhone = phoneMatch ? phoneMatch[0].replace(/\s/g, '') : undefined;

  // Extract name: word after keyword
  const nameMatch = caption.match(/(?:pour|de|client)\s+([A-ZÀ-Ö][a-zà-ö]+(?:\s+[A-ZÀ-Ö][a-zà-ö]+)?)/i);
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
