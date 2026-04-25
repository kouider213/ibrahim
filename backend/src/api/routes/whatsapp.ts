import { Router } from 'express';
import express from 'express';
import crypto from 'crypto';
import { env } from '../../config/env.js';
import { notifyOwner } from '../../notifications/pushover.js';
import { buildContext } from '../../conversation/context-builder.js';
import { chatWithTools } from '../../integrations/claude-api.js';
import { saveConversationTurn, supabase } from '../../integrations/supabase.js';
import { requestValidation } from '../../validations/approver.js';
import {
  detectLanguage,
  getClientSystemPrompt,
  isBookingRequest,
  isComplaint,
  sendWhatsApp,
} from '../../integrations/whatsapp.js';

const router = Router();

// Parse URL-encoded bodies (Twilio sends form data)
router.use(express.urlencoded({ extended: false }));

// ── Twilio signature validation ────────────────────────────────
function validateTwilioSignature(req: express.Request): boolean {
  if (!env.TWILIO_AUTH_TOKEN) return true; // skip if not configured
  const signature  = req.headers['x-twilio-signature'] as string | undefined;
  if (!signature) return false;
  const url        = `${env.BACKEND_URL}${req.originalUrl}`;
  const params     = req.body as Record<string, string>;
  const sortedKeys = Object.keys(params).sort();
  const str        = sortedKeys.reduce((acc, k) => acc + k + params[k], url);
  const expected   = crypto.createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(str).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ── POST /api/whatsapp/webhook ─────────────────────────────────
router.post('/webhook', async (req, res) => {
  // Twilio expects 200 immediately
  res.set('Content-Type', 'text/xml');
  res.send('<Response/>');

  if (!validateTwilioSignature(req)) {
    console.warn('[whatsapp] Invalid Twilio signature — ignored');
    return;
  }

  const body     = req.body as Record<string, string>;
  const from     = body['From']     ?? '';  // e.g. whatsapp:+213661234567
  const text     = body['Body']     ?? '';
  const numMedia = parseInt(body['NumMedia'] ?? '0', 10);

  if (!from || !text) return;

  const phone     = from.replace('whatsapp:', '');
  const sessionId = `wa_${phone.replace(/\D/g, '')}`;
  const lang      = detectLanguage(text);

  console.log(`[whatsapp] ${phone} [${lang}]: ${text.slice(0, 80)}`);

  // Save inbound message (fire-and-forget)
  void supabase.from('whatsapp_messages').insert({
    from_number: phone,
    body:        text,
    direction:   'inbound',
    media_count: numMedia,
  });

  // Notify owner
  notifyOwner(
    `📱 WhatsApp [${lang.toUpperCase()}]: ${phone}`,
    text.length > 200 ? text.slice(0, 200) + '…' : text,
    false,
  ).catch(() => {});

  try {
    // Build context with client-specific system prompt
    const clientSystemExtra = getClientSystemPrompt(lang);
    const ctx = await buildContext(sessionId, text);

    // Merge: put client system at the front, then context extras
    const systemExtra = ctx.systemExtra
      ? `${clientSystemExtra}\n\n${ctx.systemExtra}`
      : clientSystemExtra;

    const response = await chatWithTools(ctx.messages, systemExtra);
    const replyText = response.text;

    // Complaints and first-time booking requests → validate before sending
    const needsValidation = isComplaint(text) || (isBookingRequest(text) && replyText.includes('DZD'));

    if (needsValidation) {
      await requestValidation(
        'client_reply',
        {
          description: `Réponse WhatsApp à ${phone} [${lang.toUpperCase()}]: "${text.slice(0, 120)}"`,
          phone,
          lang,
          clientMessage: text,
          isComplaint:   isComplaint(text),
          isBooking:     isBookingRequest(text),
        },
        {
          action:    'send_whatsapp',
          to:        phone,
          message:   replyText,
        },
      );

      // Acknowledge immediately in detected language
      const ack = lang === 'ar'
        ? 'شكراً لتواصلك معنا. وكيلنا سيراجع طلبك ويرد عليك قريباً. 🙏'
        : lang === 'en'
        ? 'Thank you for contacting us. An agent will review your request and reply shortly. 🙏'
        : 'Merci de votre message. Un agent va examiner votre demande et vous répondre très prochainement. 🙏';

      await sendWhatsApp(phone, ack);
    } else {
      // Auto-reply directly
      await sendWhatsApp(phone, replyText);
    }

    // Save conversation
    await Promise.all([
      saveConversationTurn(sessionId, 'user',      text,      { source: 'whatsapp', lang }),
      saveConversationTurn(sessionId, 'assistant', replyText, { source: 'whatsapp', lang, validated: !needsValidation }),
    ]);

  } catch (err) {
    console.error('[whatsapp] Processing error:', err instanceof Error ? err.message : String(err));
  }
});

// ── POST /api/whatsapp/send ─────────────────────────────────────
// Outbound: owner or Ibrahim tool sends message to a client
router.post('/send', async (req, res) => {
  const { to, message } = req.body as { to?: string; message?: string };
  if (!to || !message) {
    res.status(400).json({ error: 'to and message are required' });
    return;
  }
  const ok = await sendWhatsApp(to, message);
  res.json({ ok });
});

// ── GET /api/whatsapp/status ───────────────────────────────────
router.get('/status', (_req, res) => {
  res.json({
    configured:  !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
    webhookUrl:  `${env.BACKEND_URL}/api/whatsapp/webhook`,
    instructions: [
      '1. Créer un compte Twilio sur twilio.com',
      '2. Activer WhatsApp Sandbox: console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn',
      '3. Configurer le webhook URL vers: ' + env.BACKEND_URL + '/api/whatsapp/webhook',
      '4. Ajouter dans Railway: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (whatsapp:+14155238886)',
    ],
  });
});

export default router;
