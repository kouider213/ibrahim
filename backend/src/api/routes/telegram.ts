import { Router } from 'express';
import { sendMessage, sendTyping, setWebhook, type TelegramUpdate } from '../../integrations/telegram.js';
import { buildContext } from '../../conversation/context-builder.js';
import { chat } from '../../integrations/claude-api.js';
import { saveConversationTurn } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// Authorized Telegram chat IDs (Kouider only)
// Set via env TELEGRAM_ALLOWED_CHATS="123456789,987654321"
function isAllowed(chatId: number): boolean {
  const allowed = process.env['TELEGRAM_ALLOWED_CHATS'] ?? '';
  if (!allowed) return true; // open if not configured
  return allowed.split(',').map(s => s.trim()).includes(String(chatId));
}

// POST /api/telegram/webhook — Telegram sends updates here
router.post('/webhook', async (req, res) => {
  // Respond immediately to Telegram (must be < 5s)
  res.sendStatus(200);

  const update = req.body as TelegramUpdate;
  const msg    = update.message;
  if (!msg?.text) return;

  const chatId    = msg.chat.id;
  const text      = msg.text.trim();
  const sessionId = `telegram_${chatId}`;

  if (!isAllowed(chatId)) {
    await sendMessage(chatId, '❌ Accès non autorisé.');
    return;
  }

  // Ignore commands
  if (text.startsWith('/start')) {
    await sendMessage(chatId, `Salam ! Je suis Ibrahim, ton assistant Fik Conciergerie 🚗\nEnvoie-moi ton message.`);
    return;
  }

  try {
    await sendTyping(chatId);

    const context  = await buildContext(sessionId, text);
    const response = await chat(context.messages, context.systemExtra);

    await saveConversationTurn(sessionId, 'user',      text,             { source: 'telegram', chatId });
    await saveConversationTurn(sessionId, 'assistant', response.text,    { source: 'telegram' });

    // Split long messages (Telegram limit = 4096 chars)
    const chunks = splitMessage(response.text, 4000);
    for (const chunk of chunks) {
      await sendMessage(chatId, chunk);
    }
  } catch (err) {
    console.error('[telegram] Error:', err instanceof Error ? err.message : String(err));
    await sendMessage(chatId, '⚠️ Erreur, réessaie dans un instant.');
  }
});

// POST /api/telegram/setup — register webhook with Telegram
router.post('/setup', requireMobileAuth, async (req, res) => {
  const { baseUrl } = req.body as { baseUrl?: string };
  const url = `${baseUrl ?? 'https://ibrahim-backend-production.up.railway.app'}/api/telegram/webhook`;
  const ok  = await setWebhook(url);
  res.json({ ok, webhookUrl: url });
});

// GET /api/telegram/setup — check webhook status
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
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    // Break at last newline before limit
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = maxLen;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return parts;
}

export default router;
