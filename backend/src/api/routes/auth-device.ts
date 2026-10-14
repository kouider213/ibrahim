import { Router } from 'express';
import { extractBearerToken } from '../../auth/tokens.js';
import {
  verifyPassword, setPassword, issueDeviceToken, revokeDeviceToken, revokeAllDevices,
  listDevices, legacyMobileAllowed, type DeviceActor,
} from '../../auth/device-auth.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { queueTelegramMessage } from '../../notifications/tg-outbox.js';

// Connexion de l'app : identifiant + mot de passe vérifiés côté serveur → jeton propre à l'appareil.
// Anti-devinette : 5 échecs / 15 min par adresse IP, et 20 échecs / heure au total (puis blocage 1 h + alerte Telegram).

const router = Router();
const USERS: Record<string, DeviceActor> = { kouider: 'kouider', houari: 'houari' };

const ipFails = new Map<string, number[]>();
let globalFails: number[] = [];
let lockedUntil = 0;

function tooMany(ip: string): string | null {
  const now = Date.now();
  if (now < lockedUntil) return 'Trop d’essais. Connexion bloquée pendant une heure.';
  const mine = (ipFails.get(ip) ?? []).filter(t => now - t < 15 * 60_000);
  ipFails.set(ip, mine);
  if (mine.length >= 5) return 'Trop d’essais. Réessaie dans 15 minutes.';
  return null;
}

function recordFail(ip: string, user: string): void {
  const now = Date.now();
  ipFails.set(ip, [...(ipFails.get(ip) ?? []), now]);
  globalFails = [...globalFails.filter(t => now - t < 3_600_000), now];
  if (globalFails.length >= 20 && now >= lockedUntil) {
    lockedUntil = now + 3_600_000;
    void queueTelegramMessage(`🔐 Alerte : 20 mauvais mots de passe en une heure sur l'app Dzaryx (dernier essai : « ${user} »). Les nouvelles connexions sont bloquées 1 h ; tes appareils déjà connectés continuent de marcher.`).catch(() => {});
  }
}

// POST /api/auth/login { user, password, label? } → { token, actor }
router.post('/login', async (req, res) => {
  // Derrière le proxy Railway : la dernière adresse de X-Forwarded-For est celle ajoutée par le proxy (non falsifiable)
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',').map(x => x.trim()).filter(Boolean).pop() ?? req.ip ?? 'unknown';
  const blocked = tooMany(ip);
  if (blocked) { res.status(429).json({ error: blocked }); return; }

  const body = (req.body ?? {}) as { user?: string; password?: string; label?: string };
  const actor = USERS[String(body.user ?? '').toLowerCase().trim()];
  const password = String(body.password ?? '');
  if (!actor || !password || !(await verifyPassword(actor, password))) {
    recordFail(ip, String(body.user ?? '').slice(0, 30));
    res.status(401).json({ error: 'Identifiants incorrects' });
    return;
  }

  const label = String(body.label ?? req.headers['user-agent'] ?? 'appareil').slice(0, 80);
  const token = await issueDeviceToken(actor, label);
  console.log(`[auth] connexion ${actor} — ${label}`);

  res.json({ token, actor });
});

// GET /api/auth/me → { actor }
router.get('/me', requireMobileAuth, (req, res) => {
  res.json({ actor: req.mobileActor?.id, legacy: legacyMobileAllowed() });
});

// POST /api/auth/password { current, next, logoutOthers? } — changer son mot de passe
router.post('/password', requireMobileAuth, async (req, res) => {
  const actor = req.mobileActor?.id as DeviceActor;
  const { current, next, logoutOthers } = (req.body ?? {}) as { current?: string; next?: string; logoutOthers?: boolean };
  if (!next || next.length < 6) { res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères.' }); return; }
  if (!current || !(await verifyPassword(actor, current))) { res.status(401).json({ error: 'Mot de passe actuel incorrect' }); return; }
  await setPassword(actor, next);
  const n = logoutOthers ? await revokeAllDevices(actor, extractBearerToken(req) ?? undefined) : 0;
  res.json({ ok: true, loggedOut: n });
});

// POST /api/auth/logout — déconnecte cet appareil
router.post('/logout', requireMobileAuth, async (req, res) => {
  const token = extractBearerToken(req) ?? '';
  res.json({ ok: await revokeDeviceToken(token) });
});

// GET /api/auth/devices — appareils connectés (Kouider voit tout)
router.get('/devices', requireMobileAuth, (req, res) => {
  const actor = req.mobileActor?.id as DeviceActor;
  const list = listDevices(actor === 'kouider' ? undefined : actor)
    .map(d => ({ id: d.h.slice(0, 10), actor: d.actor, label: d.label, created: d.created, last: d.last ?? null }));
  res.json({ devices: list });
});

export default router;
