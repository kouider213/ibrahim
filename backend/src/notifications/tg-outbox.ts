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
  // UN seul message récap (Kouider 20/10 : « il m'a envoyé plusieurs messages d'un coup ») : les textes sont regroupés,
  // seuls photos / fichiers / points GPS restent à part. Doublons et alertes sport d'un jour annulé jetés.
  const { isSportSkipped } = await import('../integrations/sport-coach.js');
  const { localNow } = await import('../integrations/morning-routine.js');
  const keep: Held[] = [];
  for (const h of held) {
    if (/^(🏋️|⏰ Ta séance|💪)/u.test(h.text) && await isSportSkipped(localNow(h.at).date).catch(() => false)) continue;
    if (!h.image && !h.file && !h.album && !h.location && keep.some(k => k.text === h.text)) continue;
    keep.push(h);
  }
  if (!keep.length) return list;
  const texts = keep.filter(h => !h.image && !h.file && !h.album && !h.location && h.text.trim());
  const media = keep.filter(h => h.image || h.file || h.album || h.location).map(({ at: _at, ...m }) => m);
  // « (06h19 → 06h19) » quand tout tient dans la même minute : une seule heure (22/10)
  const from = t(keep[0]!.at), to = t(keep[keep.length - 1]!.at);
  const head = `🔔 Pendant ta pause${from === to ? '' : ` (${from} → ${to})`}, j'ai gardé ça pour toi :`;
  // Les lignes d'agenda « • 06h20 … » déjà passées au moment de l'envoi sont retirées (le récap arrivait à 6h28 avec 6h20 et 6h30)
  const nowHm = t(Date.now());
  const fresh = (txt: string) => txt.split('\n').filter(l => { const m = /^\s*•\s*(\d{2}h\d{2})\s/.exec(l); return !m || m[1]! >= nowHm; }).join('\n');
  // Récap découpé en messages de 4000 caractères max : rien de ce qui a été gardé n'est perdu.
  const parts: string[] = [head];
  for (const h of texts) {
    const item = `• ${t(h.at)} — ${fresh(h.text).trim()}`.slice(0, 3900);
    if (parts[parts.length - 1]!.length + 2 + item.length > 4000) parts.push(item);
    else parts[parts.length - 1] += `\n\n${item}`;
  }
  // Plusieurs messages gardés : un récap clair « ce que tu as raté / ce qui compte aujourd'hui » (Kouider 22/10) ;
  // la liste brute reste le secours si l'IA ne répond pas.
  const clear = texts.length >= 2 ? await clearRecap(parts.join('\n\n')).catch(() => null) : null;
  return [...(clear ? [{ text: clear }] : parts.map(text => ({ text }))), ...media, ...list];
}

async function clearRecap(raw: string): Promise<string | null> {
  const { createAnthropic } = await import('../integrations/anthropic-compat.js');
  const now = new Date().toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const res = await createAnthropic().messages.create({
    model: 'claude-haiku-5-5', max_tokens: 700,
    system: `Tu es Dzaryx, l'assistant de Kouider. Pendant qu'il ne voulait pas être dérangé, tu as gardé des messages. Il est ${now}. `
      + 'Réécris-les en UN message Telegram court, en français simple, sans markdown (pas de ** ni #) :\n'
      + '🔔 Pendant ta pause\n\nCe que tu as raté d\'important :\n• …\n\nCe qui compte aujourd\'hui :\n• …\n'
      + 'Règles : garde chaque info utile (noms, montants, heures, liens) sans rien inventer ; supprime le périmé (heures déjà passées, « je te vois partir », « bien arrivé ») et les doublons ; '
      + 'une section vide est omise ; maximum 10 puces en tout.',
    messages: [{ role: 'user', content: raw.slice(0, 12_000) }],
  });
  const out = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim();
  return out.length > 20 ? out.slice(0, 4000) : null;
}
