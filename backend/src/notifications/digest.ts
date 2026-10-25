// Moins de messages, mais mieux (Kouider 24/10 : 346 messages en 7 jours, les importants se perdaient).
// Chaque message proactif est trié :
//  - 'drop'   : inutile (progression « image en cours », « aucune donnée », « journée terminée ») → jamais envoyé ;
//  - 'digest' : secondaire (bilans, stats, agenda, véhicules inactifs…) → gardé, envoyé en UN résumé à 12h30 et 19h ;
//  - 'now'    : tout le reste (clients, argent, réponses à ses demandes, alertes, rappels) → tout de suite, comme avant.
import { kvGet, kvSet } from '../integrations/app-store.js';

const DIGEST_KEY = 'digest:pending';
const MAX_ITEMS = 25;

const DROP: RegExp[] = [
  /^🎨 .{0,40}en cours/,                         // une image = 3 messages « en cours » (gpt-image, DALL-E, Flux) avant « Image prête »
  /Anomalies financières:\s*Aucune donnée/,
  /^✅ Journée terminée/,
  /Préparation du RDV[\s\S]{0,120}ORAL\s*:\s*AUCUN\s*$/,
  /^✅ Coûts Claude API aujourd'hui : \$0\.0/,
];

// Kouider 25/10 : « le message direct remet-les » → plus rien n'attend 12h30/19h, tout part tout de suite (seul l'inutile reste filtré).
const DIGEST: RegExp[] = [];

export type Route = 'drop' | 'digest' | 'now';

export function routeOf(text: string): Route {
  const t = text.trim();
  if (DROP.some(r => r.test(t))) return 'drop';
  if (DIGEST.some(r => r.test(t))) return 'digest';
  return 'now';
}

interface Item { at: number; text: string }

/** Range un message secondaire pour le prochain résumé (doublons app + Telegram fusionnés sur la 1re ligne). */
export async function addToDigest(text: string): Promise<void> {
  const items = JSON.parse((await kvGet(DIGEST_KEY).catch(() => null)) ?? '[]') as Item[];
  const head = text.trim().split('\n')[0]!.slice(0, 80);
  if (items.some(i => i.text.trim().split('\n')[0]!.slice(0, 80) === head)) return;
  items.push({ at: Date.now(), text: text.trim().slice(0, 1500) });
  await kvSet(DIGEST_KEY, JSON.stringify(items.slice(-MAX_ITEMS)), 2 * 86_400);
}

/** 12h30 / 19h : un seul message avec tout ce qui a été rangé. */
export async function jobDigest(): Promise<string> {
  const items = JSON.parse((await kvGet(DIGEST_KEY).catch(() => null)) ?? '[]') as Item[];
  if (!items.length) return 'rien à envoyer';
  await kvSet(DIGEST_KEY, '[]', 60);
  const text = `📋 Le point (${items.length} info${items.length > 1 ? 's' : ''} rangée${items.length > 1 ? 's' : ''} pour ne pas te déranger)\n\n` +
    items.map(i => i.text).join('\n\n— — —\n\n');
  const { queueTelegramMessage } = await import('./tg-outbox.js');
  await queueTelegramMessage(text.slice(0, 3900), undefined, 'kouider', undefined, true);
  const { emitProactive } = await import('./mobile-push.js');
  emitProactive(`📋 Le point : ${items.length} info${items.length > 1 ? 's' : ''}`, 'info', text, 'kouider', undefined, true);
  return `${items.length} info(s) envoyée(s)`;
}
