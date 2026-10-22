import { kvGet, kvSet, kvDel } from '../integrations/app-store.js';

// « NE PAS DÉRANGER » (Kouider 2026-10-20) : quand il dit « ne me dérange pas » ou qu'il ne décroche pas un appel,
// Dzaryx ne l'appelle plus ET ne lui écrit plus — même les appels programmés (routine, sport, rappels).
// - untilReply : appel manqué → silence total tant qu'il n'a pas répondu par message (ou appelé).
// - until      : il a donné une heure (« dispo à 15h ») → silence jusque-là.
// Pendant le silence : les appels vont dans la boîte « j'ai des choses pour toi », les messages Telegram sont gardés
// (tg-outbox) puis envoyés d'un bloc à la fin, les notifs de l'app restent dans l'historique sans sonner.
// S'il écrit pendant un silence à heure fixe, les réponses à SES demandes passent (fenêtre de 10 min).

const KEY = 'dnd:state';
const PLANNED_KEY = 'dnd:planned';            // silences programmés à l'avance (« demain matin ») : pas effacés par resume
const ACTIVE_KEY = 'kouider:last_active';     // même clé que morning-routine.noteKouiderActivity
const TALK_WINDOW_MS = 10 * 60_000;
const PERSONAL_RE = /h[oô]pital|urgence|malade|m[ée]decin|ibrahim|fatima|famille|enfant|b[ée]b[ée]|d[ée]c[eè]s|enterrement|accident|bless/i;
const REPLY_GRACE_MS = 2 * 60_000;            // il vient de répondre : 2 min pour qu'il donne son heure avant de tout renvoyer

export interface DndState { since: number; until: number; untilReply: boolean; why: string }

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }).replace(':', 'h');

export interface PlannedDnd { from: number; until: number; why: string }

export async function getPlannedDnd(): Promise<PlannedDnd[]> {
  try { return (JSON.parse((await kvGet(PLANNED_KEY)) ?? '[]') as PlannedDnd[]).filter(w => w.until > Date.now()); }
  catch { return []; }
}

/** « Ne me dérange pas demain matin » : silence de from à until, programmé à l'avance. */
export async function planDnd(w: PlannedDnd): Promise<void> {
  const list = [...(await getPlannedDnd()).filter(o => o.until <= w.from || o.from >= w.until), w].sort((a, b) => a.from - b.from);
  const last = Math.max(...list.map(o => o.until));
  await kvSet(PLANNED_KEY, JSON.stringify(list), Math.ceil((last - Date.now()) / 1000) + 600);
}

export async function clearPlannedDnd(): Promise<void> {
  await kvDel(PLANNED_KEY);
}

/** « Je suis dispo » pendant un silence programmé : termine le créneau en cours, garde ceux d'après. */
export async function endCurrentPlannedDnd(): Promise<void> {
  const now = Date.now();
  const list = await getPlannedDnd();
  const rest = list.filter(o => o.from > now);
  if (rest.length === list.length) return;
  if (!rest.length) { await kvDel(PLANNED_KEY); return; }
  await kvSet(PLANNED_KEY, JSON.stringify(rest), Math.ceil((Math.max(...rest.map(o => o.until)) - now) / 1000) + 600);
}

export async function getDnd(): Promise<DndState | null> {
  try {
    const s = JSON.parse((await kvGet(KEY)) ?? 'null') as DndState | null;
    if (s && (s.untilReply || s.until > Date.now())) return s;
    const now = Date.now();
    const w = (await getPlannedDnd()).find(o => o.from <= now && now < o.until);
    return w ? { since: w.from, until: w.until, untilReply: false, why: w.why } : null;
  } catch { return null; }
}

/** Silence actif ou programmé à cette heure-là (ex. réveil de 6h40 demain). */
export async function dndAt(ts: number): Promise<PlannedDnd | null> {
  const now = await getDnd();
  // ts déjà passé (job lancé après l'heure prévue) = « maintenant » : le silence en cours compte aussi
  if (now && (now.untilReply || Math.max(ts, Date.now()) < now.until)) return { from: now.since, until: now.untilReply ? Infinity : now.until, why: now.why };
  return (await getPlannedDnd()).find(o => o.from <= ts && ts < o.until) ?? null;
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
  // Silence pour un souci perso (enfant malade, hôpital…) : Kouider 22/10 « tu m'as même pas demandé il avait quoi Ibrahim »
  const care = PERSONAL_RE.test(s.why)
    ? ` Ce silence était pour une raison perso (${s.why}) : AVANT tout le reste, demande des nouvelles (ce qu'il avait, comment il va maintenant, comment va Kouider lui-même), avec chaleur, sans liste d'actions. Retiens ce qu'il te répond avec remember_info (santé de la famille) pour reprendre des nouvelles plus tard dans la journée.`
    : '';
  const work = ' S\'il dit qu\'il est au travail, ne parle pas de jour de congé : il travaille aujourd\'hui.';
  if (s.untilReply) {
    await setDnd({ until: Date.now() + REPLY_GRACE_MS, why: s.why });
    return `[Contexte : tu étais en « ne pas déranger » depuis ${hhmm(s.since)} (${s.why}) : plus d'appels ni de messages. Il vient de te répondre. S'il dit à partir de quelle heure il est joignable (« dispo à 15h », « après 14h », « dans 2 heures »), appelle pause_calls (until_time ou minutes). S'il dit qu'il est dispo ou qu'on peut tout débloquer, pause_calls resume:true — et ne confirme qu'après le résultat de l'outil. Sinon, demande-lui en une phrase si tout va bien et à partir de quelle heure tu peux le rappeler. Puis réponds à ce qu'il dit.${care}${work}]`;
  }
  return `[Contexte : il est en « ne pas déranger » jusqu'à ${hhmm(s.until)} (${s.why}) : réponds à ce qu'il demande, sans rien lancer d'autre (pas d'appel). S'il dit qu'il est de nouveau dispo ou qu'on peut tout débloquer, pause_calls resume:true — et ne confirme qu'après le résultat de l'outil.${care}${work}]`;
}

export function dndLabel(s: DndState): string {
  return s.untilReply ? 'jusqu\'à ta réponse' : `jusqu'à ${hhmm(s.until)}`;
}
