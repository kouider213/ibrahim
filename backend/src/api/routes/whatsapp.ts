import { Router } from 'express';
import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { env } from '../../config/env.js';
import { notifyOwner } from '../../notifications/pushover.js';
import { processMessage } from '../../conversation/orchestrator.js';
import { supabase } from '../../integrations/supabase.js';

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

// ── Send WhatsApp reply via Twilio ─────────────────────────────
async function sendWhatsAppReply(to: string, body: string): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) return;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  await axios.post(url, new URLSearchParams({
    From: env.TWILIO_WHATSAPP_FROM,
    To:   to,
    Body: body,
  }), {
    auth: { username: env.TWILIO_ACCOUNT_SID, password: env.TWILIO_AUTH_TOKEN },
  });
}

// ── POST /api/whatsapp/webhook ────────────────────────────────
// Twilio calls this URL when a WhatsApp message arrives
router.post('/webhook', async (req, res) => {
  // Validate Twilio signature
  if (!validateTwilioSignature(req)) {
    res.status(403).send('Forbidden');
    return;
  }

  const body   = req.body as Record<string, string>;
  const from   = body['From']  ?? '';   // e.g. whatsapp:+213661234567
  const text   = body['Body']  ?? '';
  const numMedia = parseInt(body['NumMedia'] ?? '0', 10);

  if (!from || !text) {
    res.status(200).send('<Response/>'); // TwiML empty response
    return;
  }

  const phone = from.replace('whatsapp:', '');
  console.log(`[whatsapp] Message from ${phone}: ${text.slice(0, 80)}`);

  // Save to Supabase for history
  try {
    await supabase.from('whatsapp_messages').insert({
      from_number: phone,
      body:        text,
      direction:   'inbound',
      media_count: numMedia,
    });
  } catch { /* table might not exist yet */ }

  // Notify owner via Pushover
  await notifyOwner(
    `📱 WhatsApp: ${phone}`,
    text.length > 200 ? text.slice(0, 200) + '…' : text,
    false,
  );

  // Process with Ibrahim (use phone as session ID so context is per-contact)
  const sessionId = `wa_${phone.replace(/\D/g, '')}`;
  try {
    const response = await processMessage(text, sessionId, true);

    // Auto-reply with Ibrahim's response
    if (response.text && env.TWILIO_ACCOUNT_SID) {
      await sendWhatsAppReply(from, response.text);
    }

    // TwiML response (Twilio expects XML)
    res.set('Content-Type', 'text/xml');
    // If no Twilio creds, just acknowledge; Twilio auto-reply isn't used
    res.send('<Response/>');
  } catch (err) {
    console.error('[whatsapp] Processing error:', err);
    res.set('Content-Type', 'text/xml');
    res.send('<Response/>');
  }
});

// ── GET /api/whatsapp/status ──────────────────────────────────
router.get('/status', (_req, res) => {
  res.json({
    configured: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
    webhookUrl: `${env.BACKEND_URL}/api/whatsapp/webhook`,
    instructions: [
      '1. Créer un compte Twilio sur twilio.com',
      '2. Activer WhatsApp Sandbox: console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn',
      '3. Configurer le webhook URL vers: ' + env.BACKEND_URL + '/api/whatsapp/webhook',
      '4. Ajouter dans Railway: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (whatsapp:+14155238886)',
    ],
  });
});

export default router;
