"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_2 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const env_js_1 = require("../../config/env.js");
const pushover_js_1 = require("../../notifications/pushover.js");
const context_builder_js_1 = require("../../conversation/context-builder.js");
const claude_api_js_1 = require("../../integrations/claude-api.js");
const supabase_js_1 = require("../../integrations/supabase.js");
const approver_js_1 = require("../../validations/approver.js");
const whatsapp_js_1 = require("../../integrations/whatsapp.js");
const router = (0, express_1.Router)();
// Parse URL-encoded bodies (Twilio sends form data)
router.use(express_2.default.urlencoded({ extended: false }));
// ── Twilio signature validation ────────────────────────────────
function validateTwilioSignature(req) {
    if (!env_js_1.env.TWILIO_AUTH_TOKEN)
        return true; // skip if not configured
    const signature = req.headers['x-twilio-signature'];
    if (!signature)
        return false;
    const url = `${env_js_1.env.BACKEND_URL}${req.originalUrl}`;
    const params = req.body;
    const sortedKeys = Object.keys(params).sort();
    const str = sortedKeys.reduce((acc, k) => acc + k + params[k], url);
    const expected = crypto_1.default.createHmac('sha1', env_js_1.env.TWILIO_AUTH_TOKEN).update(str).digest('base64');
    return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
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
    const body = req.body;
    const from = body['From'] ?? ''; // e.g. whatsapp:+213661234567
    const text = body['Body'] ?? '';
    const numMedia = parseInt(body['NumMedia'] ?? '0', 10);
    if (!from || !text)
        return;
    const phone = from.replace('whatsapp:', '');
    const sessionId = `wa_${phone.replace(/\D/g, '')}`;
    const lang = (0, whatsapp_js_1.detectLanguage)(text);
    console.log(`[whatsapp] ${phone} [${lang}]: ${text.slice(0, 80)}`);
    // Save inbound message (fire-and-forget)
    void supabase_js_1.supabase.from('whatsapp_messages').insert({
        from_number: phone,
        body: text,
        direction: 'inbound',
        media_count: numMedia,
    });
    // Notify owner
    (0, pushover_js_1.notifyOwner)(`📱 WhatsApp [${lang.toUpperCase()}]: ${phone}`, text.length > 200 ? text.slice(0, 200) + '…' : text, false).catch(() => { });
    try {
        // Build context with client-specific system prompt
        const clientSystemExtra = (0, whatsapp_js_1.getClientSystemPrompt)(lang);
        const ctx = await (0, context_builder_js_1.buildContext)(sessionId, text);
        // Merge: put client system at the front, then context extras
        const systemExtra = ctx.systemExtra
            ? `${clientSystemExtra}\n\n${ctx.systemExtra}`
            : clientSystemExtra;
        const response = await (0, claude_api_js_1.chatWithTools)(ctx.messages, systemExtra);
        const replyText = response.text;
        // Complaints and first-time booking requests → validate before sending
        const needsValidation = (0, whatsapp_js_1.isComplaint)(text) || ((0, whatsapp_js_1.isBookingRequest)(text) && replyText.includes('DZD'));
        if (needsValidation) {
            await (0, approver_js_1.requestValidation)('client_reply', {
                description: `Réponse WhatsApp à ${phone} [${lang.toUpperCase()}]: "${text.slice(0, 120)}"`,
                phone,
                lang,
                clientMessage: text,
                isComplaint: (0, whatsapp_js_1.isComplaint)(text),
                isBooking: (0, whatsapp_js_1.isBookingRequest)(text),
            }, {
                action: 'send_whatsapp',
                to: phone,
                message: replyText,
            });
            // Acknowledge immediately in detected language
            const ack = lang === 'ar'
                ? 'شكراً لتواصلك معنا. وكيلنا سيراجع طلبك ويرد عليك قريباً. 🙏'
                : lang === 'en'
                    ? 'Thank you for contacting us. An agent will review your request and reply shortly. 🙏'
                    : 'Merci de votre message. Un agent va examiner votre demande et vous répondre très prochainement. 🙏';
            await (0, whatsapp_js_1.sendWhatsApp)(phone, ack);
        }
        else {
            // Auto-reply directly
            await (0, whatsapp_js_1.sendWhatsApp)(phone, replyText);
        }
        // Save conversation
        await Promise.all([
            (0, supabase_js_1.saveConversationTurn)(sessionId, 'user', text, { source: 'whatsapp', lang }),
            (0, supabase_js_1.saveConversationTurn)(sessionId, 'assistant', replyText, { source: 'whatsapp', lang, validated: !needsValidation }),
        ]);
    }
    catch (err) {
        console.error('[whatsapp] Processing error:', err instanceof Error ? err.message : String(err));
    }
});
// ── POST /api/whatsapp/send ─────────────────────────────────────
// Outbound: owner or Dzaryx tool sends message to a client
router.post('/send', async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        res.status(400).json({ error: 'to and message are required' });
        return;
    }
    const ok = await (0, whatsapp_js_1.sendWhatsApp)(to, message);
    res.json({ ok });
});
// ── GET /api/whatsapp/status ───────────────────────────────────
router.get('/status', (_req, res) => {
    res.json({
        configured: !!(env_js_1.env.TWILIO_ACCOUNT_SID && env_js_1.env.TWILIO_AUTH_TOKEN),
        webhookUrl: `${env_js_1.env.BACKEND_URL}/api/whatsapp/webhook`,
        instructions: [
            '1. Créer un compte Twilio sur twilio.com',
            '2. Activer WhatsApp Sandbox: console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn',
            '3. Configurer le webhook URL vers: ' + env_js_1.env.BACKEND_URL + '/api/whatsapp/webhook',
            '4. Ajouter dans Railway: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (whatsapp:+14155238886)',
        ],
    });
});
exports.default = router;
//# sourceMappingURL=whatsapp.js.map