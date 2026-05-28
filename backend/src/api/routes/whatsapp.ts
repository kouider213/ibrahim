import { Router } from 'express';
import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { env } from '../../config/env.js';
import { notifyOwner } from '../../notifications/pushover.js';
import { buildContext } from '../../conversation/context-builder.js';
import { chatWithTools } from '../../integrations/claude-api.js';
import { saveConversationTurn, supabase } from '../../integrations/supabase.js';
import {
  detectLanguage, getClientSystemPrompt, isBookingRequest, isComplaint, sendWhatsApp,
} from '../../integrations/whatsapp.js';
import {
  getSession, saveSession,
  handleBookingFlow, handleClientDocument,
  sendPaymentInstructions, confirmPaymentAndRequestDocs, finalizeBooking,
} from '../../services/wa-booking-flow.js';

const router = Router();
router.use(express.urlencoded({ extended: false }));

// ── Twilio signature validation ────────────────────────────────────────────────
function validateTwilioSignature(req: express.Request): boolean {
  if (!env.TWILIO_AUTH_TOKEN) return true;
  const signature  = req.headers['x-twilio-signature'] as string | undefined;
  if (!signature) return false;
  const url        = `${env.BACKEND_URL}${req.originalUrl}`;
  const params     = req.body as Record<string, string>;
  const sortedKeys = Object.keys(params).sort();
  const str        = sortedKeys.reduce((acc, k) => acc + k + params[k], url);
  const expected   = crypto.createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(str).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ── Download Twilio media as base64 ───────────────────────────────────────────
async function downloadTwilioMedia(mediaUrl: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const response = await axios.get<ArrayBuffer>(mediaUrl, {
      responseType: 'arraybuffer',
      auth: { username: env.TWILIO_ACCOUNT_SID!, password: env.TWILIO_AUTH_TOKEN! },
      timeout: 15_000,
    });
    const mime   = (response.headers['content-type'] as string | undefined) ?? 'image/jpeg';
    const base64 = Buffer.from(response.data as ArrayBuffer).toString('base64');
    return { base64, mime };
  } catch (e) {
    console.error('[whatsapp] Media download failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ── POST /api/whatsapp/webhook ─────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send('<Response/>');

  if (!validateTwilioSignature(req)) {
    console.warn('[whatsapp] Invalid Twilio signature — ignored');
    return;
  }

  const body      = req.body as Record<string, string>;
  const from      = body['From']      ?? '';
  const text      = body['Body']      ?? '';
  const numMedia  = parseInt(body['NumMedia'] ?? '0', 10);
  const mediaUrl0 = body['MediaUrl0'] ?? '';
  const mediaMime = body['MediaContentType0'] ?? 'image/jpeg';

  if (!from) return;

  const phone     = from.replace('whatsapp:', '');
  const sessionId = `wa_${phone.replace(/\D/g, '')}`;
  const lang      = detectLanguage(text || 'fr');

  console.log(`[whatsapp] ${phone} [${lang}] media=${numMedia}: ${text.slice(0, 60)}`);

  // Save inbound message
  void supabase.from('whatsapp_messages').insert({
    from_number: phone, body: text || `[MEDIA × ${numMedia}]`,
    direction: 'inbound', media_count: numMedia,
  });

  // ── Handle media (photos) ──────────────────────────────────────
  if (numMedia > 0 && mediaUrl0) {
    const mediaMimeStr = mediaMime.startsWith('image') ? mediaMime : 'image/jpeg';
    const downloaded = await downloadTwilioMedia(mediaUrl0);
    if (downloaded) {
      try {
        const reply = await handleClientDocument(phone, lang, downloaded.base64, mediaMimeStr);
        await sendWhatsApp(phone, reply);
        if (text) {
          // Also process the text part below
          void supabase.from('conversations').insert([
            { session_id: sessionId, role: 'user', content: `[PHOTO] ${text}` },
            { session_id: sessionId, role: 'assistant', content: reply },
          ]);
        }
      } catch (e) {
        console.error('[whatsapp] Media processing error:', e instanceof Error ? e.message : e);
      }
    }
    // If no text accompanying, stop here
    if (!text) return;
  }

  if (!text) return;

  // Notify owner (fire-and-forget)
  notifyOwner(`📱 WhatsApp [${lang.toUpperCase()}]: ${phone}`, text.length > 200 ? text.slice(0, 200) + '…' : text, false).catch(() => {});

  try {
    const sess = await getSession(phone);

    // ── Booking flow state machine ─────────────────────────────
    const bookingIntent = isBookingRequest(text);
    const flowResult    = await handleBookingFlow(phone, text, lang, bookingIntent);

    if (flowResult.handled && flowResult.reply) {
      await sendWhatsApp(phone, flowResult.reply);
      await Promise.all([
        saveConversationTurn(sessionId, 'user',      text,           { source: 'whatsapp', lang }),
        saveConversationTurn(sessionId, 'assistant', flowResult.reply, { source: 'whatsapp', lang, flow: 'booking' }),
      ]);
      return;
    }

    // ── Generic Claude reply ───────────────────────────────────
    const clientSystemExtra = getClientSystemPrompt(lang);

    // Inject booking flow state awareness into system prompt
    const stateHint = sess.state !== 'idle'
      ? `\n\nÉTAT RÉSERVATION: ${sess.state}. Ne relance pas le processus de collecte d'infos — le système le gère automatiquement.`
      : '';

    const ctx = await buildContext(sessionId, text);
    const systemExtra = `${clientSystemExtra}${stateHint}\n\n${ctx.systemExtra}`;
    const response    = await chatWithTools(ctx.messages, systemExtra);
    const replyText   = response.text;

    // Plaintes + demandes réservation avec prix → validation avant envoi
    const needsValidation = isComplaint(text) || (bookingIntent && /DZD|\d+\s*€|\d+\s*DA/i.test(replyText));

    if (needsValidation) {
      // Send ack to client immediately
      const ack = lang === 'ar'
        ? 'شكراً لتواصلك. وكيلنا سيراجع ردنا ويتواصل معك قريباً. 🙏'
        : lang === 'en'
        ? 'Thank you for contacting us. An agent will review and get back to you shortly. 🙏'
        : 'Merci de votre message. Notre équipe va examiner et vous répondre très prochainement. 🙏';
      await sendWhatsApp(phone, ack);

      // Store for Kouider to validate and send manually
      await supabase.from('validations').insert({
        type:     'client_reply',
        context:  { description: `Réponse WhatsApp à ${phone} [${lang}]: "${text.slice(0, 120)}"`, phone, lang, isComplaint: isComplaint(text), isBooking: bookingIntent },
        proposed: { action: 'send_whatsapp', to: phone, message: replyText },
        status:   'pending',
      });
    } else {
      await sendWhatsApp(phone, replyText);
    }

    await Promise.all([
      saveConversationTurn(sessionId, 'user',      text,      { source: 'whatsapp', lang }),
      saveConversationTurn(sessionId, 'assistant', replyText, { source: 'whatsapp', lang, validated: !needsValidation }),
    ]);

  } catch (err) {
    console.error('[whatsapp] Processing error:', err instanceof Error ? err.message : String(err));
  }
});

// ── POST /api/whatsapp/send ────────────────────────────────────────────────────
router.post('/send', async (req, res) => {
  const { to, message } = req.body as { to?: string; message?: string };
  if (!to || !message) { res.status(400).json({ error: 'to and message required' }); return; }
  const ok = await sendWhatsApp(to, message);
  res.json({ ok });
});

// ── GET /api/whatsapp/requests ─────────────────────────────────────────────────
// Kouider fetches pending booking requests
router.get('/requests', async (_req, res) => {
  const { data, error } = await supabase
    .from('wa_booking_requests')
    .select('*')
    .in('status', ['pending_approval', 'payment_requested', 'docs_requested'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ requests: data ?? [] });
});

// ── POST /api/whatsapp/requests/:id/approve ────────────────────────────────────
// Kouider approves request → sends payment instructions
router.post('/requests/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { bank_account, daily_rate } = req.body as { bank_account?: string; daily_rate?: number };

  if (!bank_account || !daily_rate) {
    res.status(400).json({ error: 'bank_account and daily_rate required' });
    return;
  }

  await supabase.from('wa_booking_requests').update({
    status:       'payment_requested',
    validated_by: 'kouider',
    validated_at: new Date().toISOString(),
  }).eq('id', id);

  const ok = await sendPaymentInstructions(id, bank_account, Number(daily_rate));
  res.json({ ok });
});

// ── POST /api/whatsapp/requests/:id/reject ─────────────────────────────────────
router.post('/requests/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body as { reason?: string };

  const { data: reqData } = await supabase
    .from('wa_booking_requests')
    .select('phone, lang')
    .eq('id', id)
    .single();

  if (reqData) {
    const r = reqData as { phone: string; lang: string };
    const msg = r.lang === 'ar'
      ? `عذراً، لا يمكننا تأكيد حجزك في هذه المرحلة.${reason ? ` السبب: ${reason}` : ''} لا تتردد في التواصل معنا لتواريخ أخرى. 🙏`
      : r.lang === 'en'
      ? `We're sorry, we cannot confirm your booking at this time.${reason ? ` Reason: ${reason}` : ''} Feel free to contact us for other dates. 🙏`
      : `Nous sommes désolés, nous ne pouvons pas confirmer votre réservation pour le moment.${reason ? ` Motif : ${reason}` : ''} N'hésitez pas à nous recontacter pour d'autres dates. 🙏`;
    await sendWhatsApp(r.phone, msg);
    // Clear session
    const sess = await getSession(r.phone);
    await saveSession({ ...sess, state: 'idle', requestId: undefined });
  }

  await supabase.from('wa_booking_requests').update({
    status: 'cancelled', rejection_reason: reason,
  }).eq('id', id);

  res.json({ ok: true });
});

// ── POST /api/whatsapp/requests/:id/confirm-payment ───────────────────────────
// Kouider confirms acompte received → request docs
router.post('/requests/:id/confirm-payment', async (_req, res) => {
  const { id } = _req.params;
  const ok = await confirmPaymentAndRequestDocs(id);
  res.json({ ok });
});

// ── POST /api/whatsapp/requests/:id/finalize ──────────────────────────────────
// Kouider finalizes: create booking + calendar + confirm to client
router.post('/requests/:id/finalize', async (req, res) => {
  const { id } = req.params;
  const { car_id } = req.body as { car_id?: string };
  if (!car_id) { res.status(400).json({ error: 'car_id required' }); return; }
  const ok = await finalizeBooking(id, car_id);
  res.json({ ok });
});

// ── GET /api/whatsapp/status ───────────────────────────────────────────────────
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
