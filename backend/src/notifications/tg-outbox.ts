// Messages écrits envoyés à Kouider depuis le compte Telegram de Dzaryx.
// Le service tgcall (VPS) les récupère à chaque /api/call/pending (toutes les quelques secondes) et les envoie.
// Sert aux résultats qui arrivent après coup : mise à jour de Nexus, capture d'écran du PC demandée en appel…
import { kvGet, kvSet } from '../integrations/app-store.js';

export interface TgOutMessage { text: string; image?: string; file?: { url: string; name: string } }   // image = JPEG en base64 ; file = lien que tgcall télécharge et envoie en document

const key = (actor: string) => `tg:outbox:${actor}`;
const MAX_IMAGE_B64 = 900_000;

async function read(actor: string): Promise<TgOutMessage[]> {
  try { return JSON.parse((await kvGet(key(actor))) ?? '[]') as TgOutMessage[]; }
  catch { return []; }
}

export async function queueTelegramMessage(text: string, image?: string, actor = 'kouider', file?: TgOutMessage['file']): Promise<void> {
  const list = await read(actor);
  list.push({ text: text.slice(0, 4000), ...(image && image.length <= MAX_IMAGE_B64 ? { image } : {}), ...(file ? { file } : {}) });
  await kvSet(key(actor), JSON.stringify(list.slice(-10)), 24 * 3600);
}

export async function takeTelegramMessages(actor: string): Promise<TgOutMessage[]> {
  const list = await read(actor);
  if (list.length) await kvSet(key(actor), '[]', 60);
  return list;
}
