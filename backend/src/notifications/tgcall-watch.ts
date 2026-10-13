// Surveillance du service d'appels Telegram (tgcall/ sur le VPS) : il envoie un battement toutes les minutes.
// Plus de battement depuis DOWN_MIN minutes (VPS coupé, service planté, Telegram déconnecté) → alerte à Kouider, une fois ;
// message « rétabli » quand il revient.
import { kvGet, kvSet, kvDel } from '../integrations/app-store.js';
import { emitProactive } from './mobile-push.js';

const BEAT_KEY = 'tgcall:heartbeat';
const DOWN_KEY = 'tgcall:down';
const DOWN_MIN = 5;

export async function recordTgcallHeartbeat(connected: boolean): Promise<void> {
  if (!connected) return;  // service vivant mais Telegram déconnecté = appels impossibles → compté comme panne
  await kvSet(BEAT_KEY, new Date().toISOString());
  const downSince = await kvGet(DOWN_KEY);
  if (downSince) {
    await kvDel(DOWN_KEY);
    const min = Math.round((Date.now() - new Date(downSince).getTime()) / 60_000);
    emitProactive('📞 Appels Telegram rétablis.', 'info',
      `📞 Le service d'appels Telegram remarche (coupé environ ${min} min). Tu peux de nouveau appeler Dzaryx et il peut t'appeler.`, 'kouider');
  }
}

export async function checkTgcallAlive(): Promise<void> {
  const last = await kvGet(BEAT_KEY);
  if (!last) return;  // jamais reçu de battement (service pas encore à jour) → rien à dire
  const ageMin = (Date.now() - new Date(last).getTime()) / 60_000;
  if (ageMin < DOWN_MIN || await kvGet(DOWN_KEY)) return;
  await kvSet(DOWN_KEY, last);
  emitProactive('⚠️ Appels Telegram en panne.', 'alert',
    `⚠️ Le service d'appels Telegram ne répond plus depuis ${Math.round(ageMin)} min (dernier signe de vie ${new Date(last).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' })}).\n` +
    'Tant que ça dure : Dzaryx ne peut ni t\'appeler ni décrocher sur Telegram. Les appels auto passent par l\'app.\n' +
    'Je te préviens dès que ça remarche. Si ça dure, dis « vérifie le service d\'appels » à Claude Code.', 'kouider');
}
