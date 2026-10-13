import { randomUUID } from 'crypto';
import { kvGet, kvSet } from './app-store.js';
import { supabase } from './supabase.js';
import { listInboxMessages } from './gmail.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { autoCall } from '../notifications/auto-call.js';

// Rappels déclenchés par un ÉVÉNEMENT, pas par une heure (idée reprise d'OpenClaw « standing intents ») :
// « la prochaine fois que Karim réserve, rappelle-moi la caution », « si Sonatrach répond, appelle-moi »,
// « quand Houari me parle de la Clio, rappelle-moi le pneu ».
// Événements surveillés : nouvelle réservation (tous canaux), mail reçu (boîte PRO seulement), message WhatsApp
// d'un client, et ce que Kouider/Houari disent à Dzaryx (« mention »). Vérification toutes les 5 min + à chaque message.
// Stockage : app_kv `intentions`.

export type IntentionEvent = 'booking' | 'email' | 'whatsapp' | 'mention' | 'any';
export interface Intention {
  id: string;
  event: IntentionEvent;
  match: string;           // qui / quoi : « Karim », « Clio », « Sonatrach »
  reminder: string;        // ce qu'il faut rappeler / faire
  urgency: 'notif' | 'call';
  repeat: boolean;         // false = une seule fois
  owner: 'kouider' | 'houari';
  active: boolean;
  created_at: string;
  fired?: Array<{ at: string; what: string }>;
}

const KEY = 'intentions';
const LAST_KEY = 'intentions:last';
const MAX = 40;

export async function loadIntentions(): Promise<Intention[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as Intention[]; } catch { return []; }
}
async function saveIntentions(list: Intention[]): Promise<void> { await kvSet(KEY, JSON.stringify(list)); }

export const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Tous les mots significatifs de `match` doivent apparaître (mot entier) dans le texte. */
export function matches(match: string, text: string): boolean {
  const t = norm(text);
  const hay = ` ${t.replace(/[^a-z0-9€]+/g, ' ')} `;   // « a.b@sonatrach.dz » → mots « a b sonatrach dz »
  const m = norm(match);
  if (m.includes('@')) return t.includes(m);          // adresse email complète
  const words = m.replace(/[^a-z0-9€]+/g, ' ').split(' ').filter(w => w.length > 1);
  return words.length > 0 && words.every(w => hay.includes(` ${w} `));
}

const EVENT_LABEL: Record<IntentionEvent, string> = {
  booking: 'réserve', email: 'écrit un mail', whatsapp: 'écrit sur WhatsApp', mention: 'en parle', any: 'se manifeste',
};

// ── Outils ────────────────────────────────────────────────────────────────────
export async function createIntentionTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const match = String(input['match'] ?? '').trim();
  const reminder = String(input['reminder'] ?? '').trim();
  const event = (['booking', 'email', 'whatsapp', 'mention', 'any'].includes(String(input['event'])) ? input['event'] : 'any') as IntentionEvent;
  if (!match || !reminder) return '❌ match (qui/quoi) et reminder (le rappel) requis.';
  const list = await loadIntentions();
  if (list.filter(i => i.active).length >= MAX) return `❌ Déjà ${MAX} rappels d'événement actifs.`;
  const it: Intention = {
    id: randomUUID().slice(0, 8), event, match, reminder,
    urgency: input['urgency'] === 'call' ? 'call' : 'notif',
    repeat: input['repeat'] === true,
    owner: sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider',
    active: true, created_at: new Date().toISOString(),
  };
  list.push(it);
  await saveIntentions(list);
  return `✅ Noté : ${it.repeat ? 'chaque fois' : 'la prochaine fois'} que « ${match} » ${EVENT_LABEL[event]}, je te ${it.urgency === 'call' ? 'appelle' : 'préviens'} : ${reminder}.`;
}

export async function listIntentionsTool(): Promise<string> {
  const list = (await loadIntentions()).filter(i => i.active);
  if (!list.length) return 'Aucun rappel d\'événement en attente. Exemple : « la prochaine fois que Karim réserve, rappelle-moi la caution ».';
  return list.map(i => `• Quand « ${i.match} » ${EVENT_LABEL[i.event]} → ${i.reminder} (${i.urgency === 'call' ? 'appel' : 'notif'}${i.repeat ? ', à chaque fois' : ''})`).join('\n');
}

export async function cancelIntentionTool(input: Record<string, unknown>): Promise<string> {
  const q = norm(String(input['intention'] ?? ''));
  const list = await loadIntentions();
  const it = list.find(i => i.active && (i.id === q || norm(`${i.match} ${i.reminder}`).includes(q)));
  if (!it) return '❌ Rappel introuvable. Dis « mes rappels d\'événement » pour la liste.';
  it.active = false;
  await saveIntentions(list);
  return `🗑️ Rappel annulé : quand « ${it.match} » ${EVENT_LABEL[it.event]} → ${it.reminder}.`;
}

// ── Déclenchement ─────────────────────────────────────────────────────────────
async function fire(it: Intention, what: string, eventKey: string, notify = true): Promise<void> {
  it.fired = [...(it.fired ?? []), { at: new Date().toISOString(), what: what.slice(0, 200) }].slice(-5);
  if (!it.repeat) it.active = false;
  console.log(`[intentions] 🔔 ${it.match} — ${what.slice(0, 80)}`);
  if (!notify) return;
  emitProactive(`🔔 ${what} → ${it.reminder}`, 'alert', `🔔 Rappel : ${what}\n\n👉 ${it.reminder}`, it.owner);
  if (it.urgency === 'call' && it.owner === 'kouider') {
    await autoCall(`intention:${it.id}:${eventKey}`, `Rappel. ${what.replace(/[«»]/g, '')}. Tu m'avais demandé : ${it.reminder}`);
  }
}

/**
 * Ce que Kouider/Houari dit à Dzaryx : renvoie les rappels déclenchés, à glisser dans le contexte
 * pour que Dzaryx les mentionne dans sa réponse (pas de notif en plus : il le dit directement).
 */
export async function checkMentionIntentions(text: string, actor: string): Promise<string> {
  const list = await loadIntentions();
  const hit = list.filter(i => i.active && i.owner === actor && (i.event === 'mention' || i.event === 'any') && matches(i.match, text));
  if (!hit.length) return '';
  for (const it of hit) await fire(it, `Tu parles de « ${it.match} »`, 'mention', false);
  await saveIntentions(list);
  return 'RAPPELS DÉCLENCHÉS (Kouider te les avait demandés pour ce sujet — dis-les-lui au début de ta réponse) :\n'
    + hit.map(i => `- ${i.match} → ${i.reminder}`).join('\n');
}

/** Job toutes les 5 min : nouvelles réservations, mails pro, messages WhatsApp depuis le dernier passage. */
export async function jobIntentions(): Promise<void> {
  const list = await loadIntentions();
  const active = list.filter(i => i.active && i.event !== 'mention');
  const sinceMs = Number((await kvGet(LAST_KEY)) ?? 0) || Date.now() - 10 * 60_000;
  const now = Date.now();
  await kvSet(LAST_KEY, String(now));
  if (!active.length) return;
  const since = new Date(sinceMs).toISOString();
  const wants = (e: IntentionEvent) => active.some(i => i.event === e || i.event === 'any');
  const events: Array<{ type: IntentionEvent; key: string; text: string; what: string }> = [];

  if (wants('booking')) {
    const { data } = await supabase.from('bookings').select('id, client_name, start_date, end_date, created_at, cars(name)')
      .gt('created_at', since).limit(50);
    for (const b of (data ?? []) as Array<{ id: string; client_name: string; start_date: string; end_date: string; cars?: { name?: string } | null }>) {
      const car = b.cars?.name ?? '';
      events.push({ type: 'booking', key: `b:${b.id}`, text: `${b.client_name} ${car}`,
        what: `Nouvelle réservation : ${b.client_name}${car ? `, ${car}` : ''}, du ${b.start_date} au ${b.end_date}` });
    }
  }
  if (wants('email')) {
    const after = Math.floor(sinceMs / 1000);
    const mails = await listInboxMessages('pro', `after:${after}`, 30).catch(() => []);
    for (const m of mails) {
      if (m.date && m.date < sinceMs) continue;
      events.push({ type: 'email', key: `m:${m.id}`, text: `${m.from} ${m.fromEmail} ${m.subject}`,
        what: `Mail de ${m.from.replace(/<[^>]+>/, '').trim() || m.fromEmail} : « ${m.subject} »` });
    }
  }
  if (wants('whatsapp')) {
    const { data } = await supabase.from('whatsapp_messages').select('id, from_number, body, created_at')
      .eq('direction', 'inbound').gt('created_at', since).limit(50);
    for (const w of (data ?? []) as Array<{ id: string; from_number: string; body: string }>) {
      const digits = w.from_number.replace(/\D/g, '').slice(-9);
      const { data: b } = await supabase.from('bookings').select('client_name').ilike('client_phone', `%${digits}%`).limit(1);
      const name = (b?.[0] as { client_name?: string } | undefined)?.client_name ?? '';
      events.push({ type: 'whatsapp', key: `w:${w.id}`, text: `${name} ${w.from_number} ${w.body}`,
        what: `WhatsApp de ${name || w.from_number} : « ${w.body.slice(0, 120)} »` });
    }
  }

  let changed = false;
  for (const ev of events) {
    for (const it of list) {
      if (!it.active || (it.event !== ev.type && it.event !== 'any')) continue;
      if (!matches(it.match, ev.text)) continue;
      await fire(it, ev.what, ev.key);
      changed = true;
    }
  }
  if (changed) await saveIntentions(list);
}
