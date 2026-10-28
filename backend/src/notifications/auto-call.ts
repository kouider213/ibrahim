import { kvGet, kvSet } from '../integrations/app-store.js';
import { callOwner, getPendingCall } from './voice-call.js';
import { isDayOff } from '../integrations/kouider-dossier.js';

// Appels AUTOMATIQUES de Dzaryx à Kouider (sans qu'il demande) — UNIQUEMENT les moments importants
// (choix de Kouider) : récap quotidien de 10h, quelqu'un répond à un de ses mails, nouvelle réservation
// (site / WhatsApp), client qui dit avoir payé l'acompte, retard de retour, impayé urgent, veille de chaque départ et fin de location (18h).
// Pas de visites de site par les prospects : ça reste en notif.
// La notif texte part toujours en plus (emitProactive) — l'appel s'ajoute, il ne remplace rien.
//
// Garde-fous :
// - Jamais la nuit : seulement 8h–22h heure de Bruxelles. La nuit → mis en file, appel groupé à 8h.
// - Pas plus d'un appel auto toutes les 10 min : sinon mis en file, appel groupé ensuite.
// - Max 12 appels auto par jour, et chaque info n'appelle qu'une fois (clé anti-doublon 24 h).
// - Interrupteur : app_kv `autocall:off` = '1' → plus aucun appel auto (les notifs restent).
// - Jours de congé de Kouider (lundi + jeudi, app_kv `kouider:days_off`) : seuls les appels 'urgent' sonnent ;
//   les 'normal' (idées business, actu, anniversaires, vidange…) sont gardés et dits le prochain jour travaillé.
//
// « J'ai des choses pour toi » : ce qui n'a pas pu être dit par appel (quota, appels coupés, appel manqué)
// ou qui attend dans la file est gardé dans `autocall:inbox`. Quand Kouider appelle Dzaryx, il commence par ça.

const TZ          = 'Europe/Brussels';
const START_HOUR  = 8;
const END_HOUR    = 22;
const MIN_GAP_MS  = 10 * 60_000;
const MAX_PER_DAY = 12;  // 8 → 12 le 2026-10-13 : Kouider veut que Dzaryx appelle plus souvent

const QUEUE_KEY = 'autocall:queue';
const LAST_KEY  = 'autocall:last';
const OFF_KEY   = 'autocall:off';
const INBOX_KEY = 'autocall:inbox';
const HELD_KEY  = 'autocall:held';
const QUIET_KEY = 'autocall:quiet_until';   // « je suis pas dispo, rappelle-moi à 11h » → rien de non urgent ne sonne avant
const INBOX_MAX_AGE_MS = 36 * 3_600_000;

export type AutoCallLevel = 'urgent' | 'normal';

function localNow(): { hour: number; day: string } {
  const parts = new Intl.DateTimeFormat('fr-BE', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return { hour: Number(get('hour')), day: `${get('year')}-${get('month')}-${get('day')}` };
}

async function readList(key: string): Promise<string[]> {
  try { return JSON.parse((await kvGet(key)) ?? '[]') as string[]; } catch { return []; }
}
const readQueue = () => readList(QUEUE_KEY);

type InboxItem = { at: number; text: string };
const sameInfo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

async function readInbox(): Promise<InboxItem[]> {
  try {
    const items = JSON.parse((await kvGet(INBOX_KEY)) ?? '[]') as InboxItem[];
    return items.filter(i => i?.text && Date.now() - i.at < INBOX_MAX_AGE_MS);
  } catch { return []; }
}

/** Garde une info pour le prochain appel de Kouider (« avant tout, j'ai des choses pour toi »). */
export async function addToCallInbox(text: string): Promise<void> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return;
  const items = (await readInbox()).filter(i => !sameInfo(i.text, clean));
  items.push({ at: Date.now(), text: clean });
  await kvSet(INBOX_KEY, JSON.stringify(items.slice(-10)), 2 * 86_400);
}

/** L'info va être dite autrement (2e essai d'appel) → on la retire de la boîte. */
export async function removeFromCallInbox(text: string): Promise<void> {
  const items = await readInbox();
  const left = items.filter(i => !sameInfo(i.text, text));
  if (left.length !== items.length) await kvSet(INBOX_KEY, JSON.stringify(left), 2 * 86_400);
}

/**
 * Kouider appelle Dzaryx : tout ce qui l'attend (boîte + file d'appels pas encore passés), dans l'ordre,
 * puis vidé — c'est dit dans cet appel, la file ne fera donc plus sonner pour ça.
 */
// Alerte liée à une heure (« ton RDV est à 13h00… il est 13h10 ») : périmée 1 h après, ou 3 h après sa mise en boîte
function staleTimed(text: string, at?: number): boolean {
  const m = text.match(/il est (\d{1,2})h(\d{2})?/i);
  if (m) {
    const { hour } = localNow();
    const minute = Number(new Intl.DateTimeFormat('fr-BE', { timeZone: TZ, minute: '2-digit' }).format(new Date()));
    if (hour * 60 + minute - (Number(m[1]) * 60 + Number(m[2] ?? 0)) > 60) return true;
  }
  return !!at && Date.now() - at > 3 * 3_600_000 && /\b(rdv|rendez-vous|retard|départ dans)\b|\b\d{1,2}h\d{2}\b/i.test(text);
}
// Même alerte répétée (« ton RDV en Belgique est à 13h00… » ×3) → une seule fois
const sameTopic = (a: string, b: string) => sameInfo(a, b) || a.trim().toLowerCase().slice(0, 32) === b.trim().toLowerCase().slice(0, 32);

export async function takeCallInbox(): Promise<string[]> {
  const [inbox, queue, held] = await Promise.all([readInbox(), readQueue(), readList(HELD_KEY)]);
  const all: string[] = [];
  const fresh = [...inbox.filter(i => !staleTimed(i.text, i.at)).map(i => i.text), ...[...queue, ...held].filter(t => !staleTimed(t))];
  for (const t of fresh) {
    const dup = all.findIndex(a => sameTopic(a, t));
    if (dup >= 0) all[dup] = t; else all.push(t);   // garde la version la plus récente
  }
  if (inbox.length) await kvSet(INBOX_KEY, '[]', 60);
  if (queue.length) await kvSet(QUEUE_KEY, '[]', 60);
  if (held.length)  await kvSet(HELD_KEY, '[]', 60);
  return all.slice(-6);
}

/** Kouider n'est pas disponible jusqu'à `until` (ms) : les appels auto non urgents attendent (0 = annuler). */
export async function setQuietUntil(until: number): Promise<void> {
  await kvSet(QUIET_KEY, String(until), Math.max(60, Math.ceil((until - Date.now()) / 1000) + 60));
}
export async function quietUntil(): Promise<number> {
  const v = Number((await kvGet(QUIET_KEY).catch(() => null)) ?? 0);
  return v > Date.now() ? v : 0;
}

/** Peut-on faire sonner maintenant ? (heure, pas dispo, écart entre appels, quota, appel déjà en cours) */
async function canRingNow(level: AutoCallLevel = 'normal'): Promise<{ ok: boolean; why?: string }> {
  if ((await kvGet(OFF_KEY)) === '1') return { ok: false, why: 'off' };
  if (level !== 'urgent' && await quietUntil()) return { ok: false, why: 'pas dispo' };
  const { hour, day } = localNow();
  if (hour < START_HOUR || hour >= END_HOUR) return { ok: false, why: 'nuit' };
  const last = Number((await kvGet(LAST_KEY)) ?? 0);
  if (Date.now() - last < MIN_GAP_MS) return { ok: false, why: 'trop rapproché' };
  if (Number((await kvGet(`autocall:count:${day}`)) ?? 0) >= MAX_PER_DAY) return { ok: false, why: 'quota' };
  if (await getPendingCall('kouider')) return { ok: false, why: 'appel en cours' };
  return { ok: true };
}

async function ring(reason: string): Promise<void> {
  const { day } = localNow();
  const countKey = `autocall:count:${day}`;
  await kvSet(LAST_KEY, String(Date.now()), 86_400);
  await kvSet(countKey, String(Number((await kvGet(countKey)) ?? 0) + 1), 2 * 86_400);
  await callOwner(reason, 'kouider');
}

/**
 * Dzaryx appelle Kouider pour une info importante.
 * @param key    identifiant unique de l'info (ex. `site-booking:<id>`) — n'appelle qu'une fois par 24 h
 * @param spoken phrase dite au décroché, à l'oral, courte, sans emoji ni markdown
 */
export async function autoCall(key: string, spoken: string, opts: { level?: AutoCallLevel } = {}): Promise<void> {
  if (process.env['AUTOCALL_DRY_RUN'] === '1') { console.log(`[auto-call] DRY ${key} → ${spoken}`); return; }
  try {
    const dedupe = `autocall:done:${key}`;
    if (await kvGet(dedupe)) return;
    await kvSet(dedupe, '1', 86_400);
    const clean = spoken.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}*_`]/gu, '').replace(/\s+/g, ' ').trim();
    // Appels coupés : rien ne sonne, mais il l'entendra quand il appellera
    if ((await kvGet(OFF_KEY)) === '1') { await addToCallInbox(clean); return; }
    // Jour de congé : on ne dérange pas pour du non urgent → gardé pour le prochain jour travaillé
    if (opts.level === 'normal' && await isDayOff().catch(() => false)) {
      const held = await readList(HELD_KEY);
      if (!held.some(h => sameInfo(h, clean))) held.push(clean);
      await kvSet(HELD_KEY, JSON.stringify(held.slice(-8)), 4 * 86_400);
      console.log(`[auto-call] jour de congé — ${key} gardé pour demain`);
      return;
    }

    const check = await canRingNow(opts.level);
    if (check.ok) {
      await ring(clean);
      console.log(`[auto-call] RING ${key}`);
      return;
    }
    if (check.why === 'quota') {
      await addToCallInbox(clean);
      console.log(`[auto-call] quota atteint — ${key} reste en notif + boîte du prochain appel`);
      return;
    }
    const queue = await readQueue();
    queue.push(clean);
    await kvSet(QUEUE_KEY, JSON.stringify(queue.slice(-10)), 2 * 86_400);
    console.log(`[auto-call] en file (${check.why}) ${key}`);
  } catch (err) {
    console.error('[auto-call]', key, err instanceof Error ? err.message : err);
  }
}

/** Tâche planifiée (toutes les 15 min) : appelle avec les infos mises en file (nuit, appels rapprochés). */
export async function flushAutoCalls(): Promise<void> {
  await sendDndRecap().catch(e => console.warn('[auto-call] récap fin de silence:', e instanceof Error ? e.message : e));
  // Fin du congé : ce qui a été gardé (non urgent) rejoint la file, dès 9h le jour travaillé suivant
  const held = await readList(HELD_KEY);
  if (held.length && !(await isDayOff().catch(() => true)) && localNow().hour >= 9) {
    const q = await readQueue();
    await kvSet(QUEUE_KEY, JSON.stringify([...q, ...held.filter(h => !q.some(x => sameInfo(x, h)))].slice(-10)), 2 * 86_400);
    await kvSet(HELD_KEY, '[]', 60);
  }
  const queue = await readQueue();
  if (!queue.length) return;
  if (!(await canRingNow()).ok) return;
  await kvSet(QUEUE_KEY, '[]', 60);
  const spoken = queue.length === 1
    ? queue[0]!
    : `J'ai ${queue.length} infos pour toi. ${queue.map((q, i) => `${i + 1} : ${q}`).join(' ')}`;
  await ring(spoken);
  console.log(`[auto-call] RING groupé (${queue.length} infos)`);
}

/** Fin du silence d'appel manqué (1 h) : ce qu'il avait à lui dire part en UN message Telegram (24/10 : rien ne revenait). */
async function sendDndRecap(): Promise<void> {
  const { getDnd, DND_RECAP_KEY } = await import('./dnd.js');
  if (!(await kvGet(DND_RECAP_KEY)) || await getDnd()) return;
  await kvSet(DND_RECAP_KEY, '', 1);
  const items = await takeCallInbox();
  if (!items.length) return;
  const { queueTelegramMessage } = await import('./tg-outbox.js');
  await queueTelegramMessage(`📋 Tu n'avais pas décroché tout à l'heure. Voici ce que j'avais pour toi :\n\n${items.map(t => `• ${t}`).join('\n')}\n\nDis-moi si tu veux que je t'appelle pour en parler.`);
}
