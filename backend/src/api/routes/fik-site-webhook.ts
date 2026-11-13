import { Router } from 'express';
import { env } from '../../config/env.js';
import { emitProactive } from '../../notifications/mobile-push.js';
import { autoCall } from '../../notifications/auto-call.js';
import { clientRisk } from '../../notifications/client-care.js';

const router = Router();

// POST /api/fik-site/notify
// Called by autolux-location site on new booking, review, etc.
// Auth: x-webhook-secret header
router.post('/notify', async (req, res) => {
  const secret = req.headers['x-webhook-secret'] as string | undefined;
  if (!secret || secret !== env.WEBHOOK_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { type, data } = req.body as {
    type: 'new_booking' | 'new_review' | 'booking_status' | string;
    data: Record<string, unknown>;
  };

  try {
    if (type === 'new_booking') {
      const msg = [
        `🚗 *Nouvelle réservation site Fik !*`,
        ``,
        `👤 ${data['client_name']} | 📞 ${data['client_phone']} | 🎂 ${data['client_age']} ans`,
        `🚙 ${data['car_name']}`,
        `📅 ${data['start_date']} → ${data['end_date']}`,
        `💶 Total: ${data['total']}€`,
        data['notes'] ? `📝 ${data['notes']}` : null,
        ``,
        `⏳ En attente de confirmation — réponds OUI/NON à Dzaryx pour accepter`,
      ].filter(Boolean).join('\n');

      const risk = await clientRisk(String(data['client_name'] ?? ''), data['client_phone'] as string | undefined).catch(() => null);
      // 13/11 : le site envoie déjà la notif Telegram (boutons Accepter/Refuser) → ici seulement ce que Dzaryx ajoute
      if (risk?.text) emitProactive(`${msg}\n\n${risk.text}`, 'alert', risk.text, 'kouider');
      void autoCall(`site-booking:${data['client_name']}:${data['start_date']}:${data['car_name']}`,
        `Nouvelle réservation sur le site : ${data['client_name']}, ${data['car_name']}, du ${data['start_date']} au ${data['end_date']}, ${data['total']} euros.${risk?.spoken ? ` ${risk.spoken}` : ''} Tu l'acceptes ?`);
    } else if (type === 'new_review') {
      const msg = [
        `⭐ Nouvel avis (${data['rating']}/5) — *${data['client_name']}*`,
        `"${data['comment']}"`,
        `→ Dzaryx: "approuve l'avis de ${data['client_name']}" pour le publier`,
      ].filter(Boolean).join('\n');

      void msg;   // 13/11 : notif Telegram déjà envoyée par le site (submit-review) → pas de doublon
    } else if (type === 'booking_status') {
      // 13/11 : changé par Kouider lui-même (bouton Telegram / admin) → pas besoin de le lui redire
      if (!data['via']) { const msg = `📋 Réservation ${data['car_name']} / ${data['client_name']} → ${data['status']}`; emitProactive(msg, 'info', msg, 'kouider'); }
    } else {
      const msg = String(data['message'] ?? JSON.stringify(data));
      emitProactive(msg, 'info', msg, 'kouider');
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[fik-site-webhook] Error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
