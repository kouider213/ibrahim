import { randomUUID } from 'node:crypto';
import { kvGet, kvSet, kvDel } from '../integrations/app-store.js';
import { supabase, saveConversationTurn } from '../integrations/supabase.js';
import { env } from '../config/env.js';
import { pushToActor } from './mobile-push.js';
import { synthesizeVoice } from './dispatcher.js';
import { getDnd } from './dnd.js';

// « Appels » Dzaryx dans l'app (sans numéro de téléphone) :
// - Dzaryx appelle → notif « 📞 Dzaryx t'appelle » → l'app ouvre l'écran d'appel → Décrocher
//   → Dzaryx annonce la raison de l'appel, puis conversation vocale mains libres.
// - Kouider appelle → bouton 📞 dans l'app → même écran, Dzaryx décroche tout de suite.
// La conversation passe par la session voice_<actor> : l'annonce y est enregistrée
// pour que « c'est quelle société ? » ait le contexte.

export type CallActor = 'kouider' | 'houari';

interface PendingCall { id: string; reason: string; greeting: string; createdAt: string }

/** Préfixe d'un rappel qui doit faire sonner l'app au lieu d'une notif texte. */
export const CALL_REMINDER_MARK = '[APPEL] ';

const RING_TTL_S = 180;                       // non décroché après 3 min = appel manqué
const PENDING_KEY = (a: CallActor) => `call:pending:${a}`;

function firstName(actor: CallActor): string {
  return actor === 'houari' ? env.PARTNER_NAME : env.OWNER_NAME;
}

/** Dzaryx appelle Kouider (ou Houari) : sonnerie push + appel en attente côté serveur.
 *  « Ne pas déranger » (dnd.ts) : rien ne sonne, même programmé — l'info attend son prochain appel.
 *  force = c'est lui qui vient de demander « appelle-moi ». */
export async function callOwner(reason: string, actor: CallActor = 'kouider', opts: { force?: boolean } = {}): Promise<{ id: string; held?: boolean }> {
  const clean = reason.trim().replace(/\s+/g, " ").slice(0, 1200);   // 1200 : place pour le travail préparé (call-tasks)
  if (actor === 'kouider' && !opts.force && await getDnd()) {
    const { addToCallInbox } = await import('./auto-call.js');
    await addToCallInbox(clean.replace(/^\[TÂCHE:[^\]]+\]\s*/, '')).catch(() => {});
    console.log(`[voice-call] ne pas déranger — appel gardé : "${clean.slice(0, 60)}"`);
    return { id: 'held', held: true };
  }
  const call: PendingCall = {
    id:        randomUUID(),
    reason:    clean,
    greeting:  `Allô ${firstName(actor)}, c'est Dzaryx. ${clean}`,
    createdAt: new Date().toISOString(),
  };
  await kvSet(PENDING_KEY(actor), JSON.stringify(call), RING_TTL_S);

  await pushToActor(
    '📞 Dzaryx t\'appelle',
    clean.length > 120 ? `${clean.slice(0, 117)}…` : clean,
    { type: 'call', deepLink: 'call', callId: call.id },
    actor,
    { name: 'Dzaryx:incoming_call', payload: { id: call.id, reason: clean } },
    RING_TTL_S,
  );

  // Trace dans l'historique des notifs (visible même si l'appel est manqué)
  void supabase.from('proactive_history')
    .insert({ actor, type: 'alert', text: `📞 Appel de Dzaryx : ${clean}`, deep_link: 'call', created_at: call.createdAt })
    .then(({ error }) => { if (error) console.error('[voice-call] historique:', error.message); });

  console.log(`[voice-call] RING ${actor} id=${call.id} reason="${clean.slice(0, 60)}"`);
  return { id: call.id };
}

export async function getPendingCall(actor: CallActor): Promise<PendingCall | null> {
  const raw = await kvGet(PENDING_KEY(actor));
  if (!raw) return null;
  try { return JSON.parse(raw) as PendingCall; } catch { return null; }
}

/** Kouider décroche (appel de Dzaryx) ou lance l'appel lui-même → phrase d'accueil + audio. */
/** Accueil quand c'est Kouider qui appelle et que des infos l'attendent (« avant tout, j'ai des choses pour toi »). */
export function waitingGreeting(actor: CallActor, waiting: string[]): string {
  const hi = `Oui ${firstName(actor)}, je t'écoute.`;
  if (!waiting.length) return hi;
  const items = waiting.map(w => w.replace(/\s+/g, ' ').trim().replace(/[^.!?…]$/, m => `${m}.`));
  const body = items.length === 1
    ? `Avant tout, j'ai une chose pour toi : ${items[0]}`
    : `Avant tout, j'ai ${items.length} choses pour toi. ${items.map((t, i) => `${i === 0 ? 'Un' : i === items.length - 1 ? 'Et enfin' : 'Ensuite'} : ${t}`).join(' ')}`;
  return `${hi} ${body} Voilà, dis-moi.`;
}

/**
 * @param waiting  infos qui attendaient Kouider (boîte des appels) : dites en premier quand c'est LUI qui appelle
 */
export async function answerCall(actor: CallActor, callId?: string, noAudio = false, waiting: string[] = []): Promise<{ text: string; audio: string | null; incoming: boolean }> {
  const pending = await getPendingCall(actor);
  const incoming = !!pending && (!callId || pending.id === callId);
  const text = incoming ? pending!.greeting : waitingGreeting(actor, waiting);
  if (pending) await kvDel(PENDING_KEY(actor));   // décroché, ou remplacé par l'appel de Kouider

  if (incoming || waiting.length) {
    saveConversationTurn(`voice_${actor}`, 'assistant', text, { call: true, ...(incoming ? { call_id: pending!.id } : {}) })
      .catch(err => console.error('[voice-call] contexte:', err instanceof Error ? err.message : String(err)));
  }
  const buf = noAudio ? null : await synthesizeVoice(text);   // noAudio : la voix temps réel dit l'accueil elle-même
  console.log(`[voice-call] ANSWER ${actor} incoming=${incoming}`);
  return { text, audio: buf ? buf.toString('base64') : null, incoming };
}

/** Kouider refuse l'appel ou ne décroche pas : l'appel en attente est retiré. */
export async function declineCall(actor: CallActor, callId?: string): Promise<void> {
  const pending = await getPendingCall(actor);
  if (pending && (!callId || pending.id === callId)) await kvDel(PENDING_KEY(actor));
}
