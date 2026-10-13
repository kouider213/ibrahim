import { kvGet, kvSet } from '../integrations/app-store.js';
import { callOwner, getPendingCall } from './voice-call.js';

// Appels AUTOMATIQUES de Dzaryx à Kouider (sans qu'il demande) — UNIQUEMENT les moments importants
// (choix de Kouider) : nouvelle réservation (site / WhatsApp), client qui dit avoir payé l'acompte,
// retard de retour, impayé urgent. Pas de point du matin ni de prospects : ça reste en notif.
// La notif texte part toujours en plus (emitProactive) — l'appel s'ajoute, il ne remplace rien.
//
// Garde-fous :
// - Jamais la nuit : seulement 8h–22h heure de Bruxelles. La nuit → mis en file, appel groupé à 8h.
// - Pas plus d'un appel auto toutes les 10 min : sinon mis en file, appel groupé ensuite.
// - Max 5 appels auto par jour, et chaque info n'appelle qu'une fois (clé anti-doublon 24 h).
// - Interrupteur : app_kv `autocall:off` = '1' → plus aucun appel auto (les notifs restent).

const TZ          = 'Europe/Brussels';
const START_HOUR  = 8;
const END_HOUR    = 22;
const MIN_GAP_MS  = 10 * 60_000;
const MAX_PER_DAY = 5;

const QUEUE_KEY = 'autocall:queue';
const LAST_KEY  = 'autocall:last';
const OFF_KEY   = 'autocall:off';

function localNow(): { hour: number; day: string } {
  const parts = new Intl.DateTimeFormat('fr-BE', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return { hour: Number(get('hour')), day: `${get('year')}-${get('month')}-${get('day')}` };
}

async function readQueue(): Promise<string[]> {
  try { return JSON.parse((await kvGet(QUEUE_KEY)) ?? '[]') as string[]; } catch { return []; }
}

/** Peut-on faire sonner maintenant ? (heure, écart entre appels, quota, appel déjà en cours) */
async function canRingNow(): Promise<{ ok: boolean; why?: string }> {
  if ((await kvGet(OFF_KEY)) === '1') return { ok: false, why: 'off' };
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
export async function autoCall(key: string, spoken: string): Promise<void> {
  try {
    const dedupe = `autocall:done:${key}`;
    if (await kvGet(dedupe)) return;
    await kvSet(dedupe, '1', 86_400);
    if ((await kvGet(OFF_KEY)) === '1') return;

    const clean = spoken.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}*_`]/gu, '').replace(/\s+/g, ' ').trim();
    const check = await canRingNow();
    if (check.ok) {
      await ring(clean);
      console.log(`[auto-call] RING ${key}`);
      return;
    }
    if (check.why === 'quota') { console.log(`[auto-call] quota atteint — ${key} reste en notif`); return; }
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
