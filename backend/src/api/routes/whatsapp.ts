import { Router } from 'express';
import express from 'express';
import crypto from 'crypto';
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
router.use(express.json());

// ── Meta webhook signature validation ─────────────────────────────────────────
function validateMetaSignature(req: express.Request): boolean {
  if (!env.WHATSAPP_TOKEN) return true; // skip if not configured
  const sig = req.headers['x-hub-signature-256'] as string | undefined;
  if (!sig) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', env.WHATSAPP_TOKEN)
    .update(JSON.stringify(req.body))
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Download Meta media as base64 ─────────────────────────────────────────────
async function downloadMetaMedia(mediaId: string): Promise<{ base64: string; mime: string } | null> {
  if (!env.WHATSAPP_TOKEN) return null;
  try {
    // Step 1: get download URL
    const urlRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
    });
    if (!urlRes.ok) return null;
    const urlData = await urlRes.json() as { url?: string; mime_type?: string };
    if (!urlData.url) return null;

    // Step 2: download binary
    const mediaRes = await fetch(urlData.url, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
    });
    if (!mediaRes.ok) return null;
    const buf    = Buffer.from(await mediaRes.arrayBuffer());
    const mime   = urlData.mime_type ?? 'image/jpeg';
    const base64 = buf.toString('base64');
    return { base64, mime };
  } catch (e) {
    console.error('[whatsapp] Media download failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// ── GET /api/whatsapp/webhook — Meta verification challenge ───────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode']         as string | undefined;
  const token     = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge']    as string | undefined;

  if (mode === 'subscribe' && token === (env.WHATSAPP_VERIFY_TOKEN ?? 'dzaryx_verify')) {
    res.status(200).send(challenge ?? '');
  } else {
    res.sendStatus(403);
  }
});

// ── POST /api/whatsapp/webhook ─────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Meta requires 200 immediately

  if (!validateMetaSignature(req)) {
    console.warn('[whatsapp] Invalid Meta signature — ignored');
    return;
  }

  type MetaMsg = {
    from?: string; type?: string; text?: { body?: string };
    image?: { id?: string; mime_type?: string };
    document?: { id?: string; mime_type?: string };
    id?: string;
  };

  const value = (req.body as {
    entry?: Array<{ changes?: Array<{ value?: { messages?: MetaMsg[] } }> }>
  }).entry?.[0]?.changes?.[0]?.value;

  const messages = value?.messages;
  if (!messages || messages.length === 0) return;

  const msg    = messages[0] as MetaMsg;
  const from   = msg.from ?? '';
  if (!from) return;

  const text      = msg.text?.body ?? '';
  const mediaId   = msg.image?.id ?? msg.document?.id ?? null;
  const mediaMime = msg.image ? (msg.image.mime_type ?? 'image/jpeg') : (msg.document?.mime_type ?? 'application/pdf');

  const phone     = from.replace(/^\+/, '');
  const sessionId = `wa_${phone.replace(/\D/g, '')}`;
  const lang      = detectLanguage(text || 'fr');

  console.log(`[whatsapp] ${phone} [${lang}] media=${mediaId ? 1 : 0}: ${text.slice(0, 60)}`);

  void supabase.from('whatsapp_messages').insert({
    from_number: phone, body: text || '[MEDIA]',
    direction: 'inbound', media_count: mediaId ? 1 : 0,
  });

  // ── Handle media (photos / docs) ──────────────────────────────
  if (mediaId) {
    const downloaded = await downloadMetaMedia(mediaId);
    if (downloaded) {
      try {
        const reply = await handleClientDocument(phone, lang, downloaded.base64, mediaMime);
        await sendWhatsApp(phone, reply);
        if (text) {
          void supabase.from('conversations').insert([
            { session_id: sessionId, role: 'user', content: `[MEDIA] ${text}` },
            { session_id: sessionId, role: 'assistant', content: reply },
          ]);
        }
      } catch (e) {
        console.error('[whatsapp] Media processing error:', e instanceof Error ? e.message : e);
      }
    }
    if (!text) return;
  }

  if (!text) return;

  notifyOwner(`📱 WhatsApp [${lang.toUpperCase()}]: ${phone}`, text.length > 200 ? text.slice(0, 200) + '…' : text, false).catch(() => {});

  try {
    const sess = await getSession(phone);

    const bookingIntent = isBookingRequest(text);
    const flowResult    = await handleBookingFlow(phone, text, lang, bookingIntent);

    if (flowResult.handled && flowResult.reply) {
      await sendWhatsApp(phone, flowResult.reply);
      await Promise.all([
        saveConversationTurn(sessionId, 'user',      text,             { source: 'whatsapp', lang }),
        saveConversationTurn(sessionId, 'assistant', flowResult.reply, { source: 'whatsapp', lang, flow: 'booking' }),
      ]);
      return;
    }

    const clientSystemExtra = getClientSystemPrompt(lang);
    const stateHint = sess.state !== 'idle'
      ? `\n\nÉTAT RÉSERVATION: ${sess.state}. Ne relance pas le processus de collecte d'infos — le système le gère automatiquement.`
      : '';

    const ctx = await buildContext(sessionId, text);
    const systemExtra = `${clientSystemExtra}${stateHint}\n\n${ctx.systemExtra}`;
    const response    = await chatWithTools(ctx.messages, systemExtra);
    const replyText   = response.text;

    const needsValidation = isComplaint(text) || (bookingIntent && /DZD|\d+\s*€|\d+\s*DA/i.test(replyText));

    if (needsValidation) {
      const ack = lang === 'ar'
        ? 'شكراً لتواصلك. وكيلنا سيراجع ردنا ويتواصل معك قريباً. 🙏'
        : lang === 'en'
        ? 'Thank you for contacting us. An agent will review and get back to you shortly. 🙏'
        : 'Merci de votre message. Notre équipe va examiner et vous répondre très prochainement. 🙏';
      await sendWhatsApp(phone, ack);

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
    const sess = await getSession(r.phone);
    await saveSession({ ...sess, state: 'idle', requestId: undefined });
  }

  await supabase.from('wa_booking_requests').update({
    status: 'cancelled', rejection_reason: reason,
  }).eq('id', id);

  res.json({ ok: true });
});

// ── POST /api/whatsapp/requests/:id/confirm-payment ───────────────────────────
router.post('/requests/:id/confirm-payment', async (_req, res) => {
  const { id } = _req.params;
  const ok = await confirmPaymentAndRequestDocs(id);
  res.json({ ok });
});

// ── POST /api/whatsapp/requests/:id/finalize ──────────────────────────────────
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
    configured:  !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID),
    webhookUrl:  `${env.BACKEND_URL}/api/whatsapp/webhook`,
    provider:    'Meta WhatsApp Cloud API (free tier)',
    instructions: [
      '1. Créer une app Meta Developers: developers.facebook.com',
      '2. Ajouter produit "WhatsApp" → Business account',
      '3. Récupérer Phone Number ID et Token permanent',
      '4. Configurer webhook URL: ' + env.BACKEND_URL + '/api/whatsapp/webhook',
      '5. Ajouter dans Railway: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN',
    ],
  });
});

export default router;
