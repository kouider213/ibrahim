import { Router } from 'express';
import { respondToClient } from '../../conversation/client-responder.js';
import { emitProactive } from '../../notifications/mobile-push.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

const VERIFY_TOKEN = process.env['WHATSAPP_VERIFY_TOKEN'] || '';
const WA_TOKEN     = process.env['WHATSAPP_TOKEN'] || '';
const WA_PHONE_ID  = process.env['WHATSAPP_PHONE_ID'] || '';

// Envoie un message texte via l'API Meta Cloud (si configurée).
async function sendWhatsApp(to: string, body: string): Promise<void> {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.log(`[whatsapp] (non configuré) -> ${to}: ${body.slice(0, 80)}`);
    return;
  }
  try {
    await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
  } catch (err) {
    console.error('[whatsapp] send fail:', err instanceof Error ? err.message : err);
  }
}

// ── Vérification du webhook (Meta) ───────────────────────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === VERIFY_TOKEN) {
    res.status(200).send(String(challenge));
    return;
  }
  res.sendStatus(403);
});

// ── Réception des messages clients (Meta) ────────────────────────────────────
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // ACK immédiat (Meta exige < 5s)
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg   = entry?.messages?.[0];
    if (!msg || msg.type !== 'text') return;
    const from = msg.from as string;
    const text = msg.text?.body as string;
    if (!from || !text) return;

    const { reply, leadCreated } = await respondToClient(text, { clientPhone: from, sessionId: `wa_${from}` });
    await sendWhatsApp(from, reply);

    // Handoff : prévenir Kouider pour qu'il reprenne le relais.
    if (leadCreated) {
      emitProactive(
        `Nouveau lead WhatsApp — ${from}`,
        'alert',
        `📲 Client WhatsApp (${from})\n« ${text.slice(0, 140)} »\n\nDzaryx a capturé la demande. Recontacte-le pour la disponibilité.`,
        'kouider',
        'clients',
      );
    }
  } catch (err) {
    console.error('[whatsapp] webhook error:', err instanceof Error ? err.message : err);
  }
});

// ── Endpoint de TEST (sans Meta) — simule un message client ──────────────────
// POST /api/whatsapp/test  { "message": "...", "phone": "+213..." }   (auth mobile)
router.post('/test', requireMobileAuth, async (req, res) => {
  const { message, phone } = req.body as { message?: string; phone?: string };
  if (!message) { res.status(400).json({ error: 'message requis' }); return; }
  try {
    const result = await respondToClient(message, { clientPhone: phone, sessionId: `watest_${phone || 'x'}` });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
