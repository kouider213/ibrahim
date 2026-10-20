// Messages écrits envoyés à Kouider depuis le compte Telegram de Dzaryx.
// Le service tgcall (VPS) les récupère à chaque /api/call/pending (toutes les quelques secondes) et les envoie.
// Sert aux résultats qui arrivent après coup : mise à jour de Nexus, capture d'écran du PC demandée en appel…
import { kvGet, kvSet } from '../integrations/app-store.js';
import { dndAllowsMessage, getDnd } from './dnd.js';

export interface TgOutMessage { text: string; image?: string; file?: { url: string; name: string }; album?: { url: string }[]; location?: { lat: number; lng: number; title: string; address: string } }   // image = JPEG en base64 ; file = lien que tgcall télécharge et envoie en document

const key = (actor: string) => `tg:outbox:${actor}`;
const MAX_IMAGE_B64 = 900_000;

async function read(actor: string): Promise<TgOutMessage[]> {
  try { return JSON.parse((await kvGet(key(actor))) ?? '[]') as TgOutMessage[]; }
  catch { return []; }
}

// « Ne pas déranger » (dnd.ts) : les messages pour Kouider attendent ici, puis partent d'un bloc à la fin du silence
const HELD_KEY = 'tg:outbox:held';
const HELD_MAX_AGE_MS = 4 * 3600_000;    // au-delà, l'info est périmée (« je te vois partir… ») : jetée
type Held = TgOutMessage & { at: number };

async function readHeld(): Promise<Held[]> {
  try { return (JSON.parse((await kvGet(HELD_KEY)) ?? '[]') as Held[]).filter(h => Date.now() - h.at < HELD_MAX_AGE_MS); }
  catch { return []; }
}

async function push(actor: string, m: TgOutMessage): Promise<void> {
  if (actor === 'kouider' && !(await dndAllowsMessage())) {
    const held = await readHeld();
    held.push({ ...m, at: Date.now() });
    await kvSet(HELD_KEY, JSON.stringify(held.slice(-15)), 86_400);
    return;
  }
  const list = await read(actor);
  list.push(m);
  await kvSet(key(actor), JSON.stringify(list.slice(-10)), 24 * 3600);
}

export async function queueTelegramMessage(text: string, image?: string, actor = 'kouider', file?: TgOutMessage['file']): Promise<void> {
  await push(actor, { text: text.slice(0, 4000), ...(image && image.length <= MAX_IMAGE_B64 ? { image } : {}), ...(file ? { file } : {}) });
}

/** Album de photos (liens publics, ex. Cloudinary) : tgcall l'envoie par groupes de 10, légende sur la 1re. */
export async function queueTelegramAlbum(text: string, urls: string[], actor = 'kouider'): Promise<void> {
  await push(actor, { text: text.slice(0, 1000), album: urls.slice(0, 50).map(url => ({ url })) });
}

/** Point GPS (lieu épinglé, s'ouvre dans Maps/Waze) envoyé sur Telegram. */
export async function queueTelegramLocation(lat: number, lng: number, title: string, address: string, actor = 'kouider'): Promise<void> {
  await push(actor, { text: '', location: { lat, lng, title: title.slice(0, 100), address: address.slice(0, 200) } });
}

export async function takeTelegramMessages(actor: string): Promise<TgOutMessage[]> {
  const list = await read(actor);
  if (list.length) await kvSet(key(actor), '[]', 60);
  if (actor !== 'kouider' || !(await kvGet(HELD_KEY))) return list;
  if (await getDnd()) return list;                       // silence pas fini : les messages gardés attendent
  const held = await readHeld();
  await kvSet(HELD_KEY, '[]', 60);
  if (!held.length) return list;
  const t = (ts: number) => new Date(ts).toLocaleTimeString('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
  return [{ text: `🔔 Pendant ta pause, j'ai gardé ${held.length} message${held.length > 1 ? 's' : ''} (de ${t(held[0]!.at)} à ${t(held[held.length - 1]!.at)}) :` },
    ...held.map(({ at: _at, ...m }) => m), ...list];
}
