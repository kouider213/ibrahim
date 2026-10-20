import { kvGet, kvSet, kvDel } from '../integrations/app-store.js';

// « NE PAS DÉRANGER » (Kouider 2026-10-20) : quand il dit « ne me dérange pas » ou qu'il ne décroche pas un appel,
// Dzaryx ne l'appelle plus ET ne lui écrit plus — même les appels programmés (routine, sport, rappels).
// - untilReply : appel manqué → silence total tant qu'il n'a pas répondu par message (ou appelé).
// - until      : il a donné une heure (« dispo à 15h ») → silence jusque-là.
// Pendant le silence : les appels vont dans la boîte « j'ai des choses pour toi », les messages Telegram sont gardés
// (tg-outbox) puis envoyés d'un bloc à la fin, les notifs de l'app restent dans l'historique sans sonner.
// S'il écrit pendant un silence à heure fixe, les réponses à SES demandes passent (fenêtre de 10 min).

const KEY = 'dnd:state';
const ACTIVE_KEY = 'kouider:last_active';     // même clé que morning-routine.noteKouiderActivity
const TALK_WINDOW_MS = 10 * 60_000;
const REPLY_GRACE_MS = 2 * 60_000;            // il vient de répondre : 2 min pour qu'il donne son heure avant de tout renvoyer

export interface DndState { since: number; until: number; untilReply: boolean; why: string }

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }).replace(':', 'h');

export async function getDnd(): Promise<DndState | null> {
  try {
    const s = JSON.parse((await kvGet(KEY)) ?? 'null') as DndState | null;
    return s && (s.untilReply || s.until > Date.now()) ? s : null;
  } catch { return null; }
}

export async function setDnd(o: { until?: number; untilReply?: boolean; why: string }): Promise<void> {
  const prev = await getDnd();
  const s: DndState = { since: prev?.since ?? Date.now(), until: o.until ?? 0, untilReply: !!o.untilReply, why: o.why };
  await kvSet(KEY, JSON.stringify(s), s.untilReply ? 3 * 86_400 : Math.max(120, Math.ceil((s.until - Date.now()) / 1000) + 600));
}

export async function clearDnd(): Promise<void> {
  await kvDel(KEY);
}

/** Un message proactif peut-il partir maintenant ? (pas de silence, ou il vient de nous écrire) */
export async function dndAllowsMessage(): Promise<boolean> {
  if (!(await getDnd())) return true;
  return Date.now() - Number((await kvGet(ACTIVE_KEY).catch(() => null)) ?? 0) < TALK_WINDOW_MS;
}

/** Kouider vient d'écrire / d'appeler : fin du silence « jusqu'à sa réponse ». Renvoie une consigne pour le cerveau. */
export async function dndOnKouiderMessage(): Promise<string | null> {
  const s = await getDnd();
  if (!s) return null;
  if (s.untilReply) {
    await setDnd({ until: Date.now() + REPLY_GRACE_MS, why: s.why });
    return `[Contexte : tu étais en « ne pas déranger » depuis ${hhmm(s.since)} (${s.why}) : plus d'appels ni de messages. Il vient de te répondre. S'il dit à partir de quelle heure il est joignable (« dispo à 15h », « après 14h », « dans 2 heures »), appelle pause_calls (until_time ou minutes). S'il dit qu'il est dispo, pause_calls resume:true. Sinon, demande-lui en une phrase si tout va bien et à partir de quelle heure tu peux le rappeler. Puis réponds à ce qu'il dit.]`;
  }
  return `[Contexte : il est en « ne pas déranger » jusqu'à ${hhmm(s.until)} : réponds à ce qu'il demande, sans rien lancer d'autre (pas d'appel). S'il dit qu'il est de nouveau dispo, pause_calls resume:true.]`;
}

export function dndLabel(s: DndState): string {
  return s.untilReply ? 'jusqu\'à ta réponse' : `jusqu'à ${hhmm(s.until)}`;
}
