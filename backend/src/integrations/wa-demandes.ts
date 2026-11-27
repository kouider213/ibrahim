// 24/11 Kouider : « les demandes WhatsApp vont dans les DEMANDES aussi » (avant : seulement celles du site).
// Une fiche par discussion WhatsApp tant qu'elle est ouverte ; un nouveau message du même client met la fiche à jour.
// Stockage : app_kv (clé wa:demandes ; tt:demandes pour TikTok, 24/11), pas de table Supabase à créer.
import { kvGet, kvSet } from './app-store.js';

export interface WaDemande {
  id: string; chat: string; phone?: string; text: string; status: string;
  lang: 'fr' | 'ar' | 'en'; created_at: string; updated_at: string; count: number;
  via?: 'dm' | 'comment'; video?: string;   // TikTok : message privé ou commentaire (+ vidéo commentée)
  replied_at?: string;   // 27/11 : heure de NOTRE dernière réponse — le client réécrit après (updated_at > replied_at) = vraiment à traiter
}
export type Channel = 'whatsapp' | 'tiktok';

const KEYS: Record<Channel, string> = { whatsapp: 'wa:demandes', tiktok: 'tt:demandes' };
const MAX = 200;
export const WA_CLOSED = new Set(['conclu', 'perdu', 'refusé', 'sans suite']);

async function all(ch: Channel = 'whatsapp'): Promise<WaDemande[]> {
  try { const r = await kvGet(KEYS[ch]); return r ? JSON.parse(r) as WaDemande[] : []; } catch { return []; }
}
async function save(list: WaDemande[], ch: Channel = 'whatsapp'): Promise<void> {
  await kvSet(KEYS[ch], JSON.stringify(list.slice(0, MAX)));
}

/** Le texte du client ressemble à une demande (location, prix, dispo, achat, import…) ? */
export function looksLikeDemande(text: string): boolean {
  return /voiture|v[ée]hicule|louer|location|ch[3e7h]?al|che3al|شحال|kayen|loto|tomobil|tonobil|clio|boite|boîte|places|semaine|jours|disponib|r[ée]serv|dispo|prix|tarif|combien|devis|achat|acheter|import|appart|logement|s[ée]jour|aéroport|aeroport|kra|كراء|طوموبيل|سيارة|حجز|سعر|rent\b|rental|price|booking/i.test(text);
}

function phoneOf(chat: string): string | undefined {
  return /^\+?[\d\s().-]{8,}$/.test(chat) ? chat.replace(/[^\d+]/g, '') : undefined;
}
function langOf(text: string): WaDemande['lang'] {
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/\b(hello|hi|car|rent|price|please|available)\b/i.test(text) && !/\b(bonjour|voiture|prix|merci)\b/i.test(text)) return 'en';
  return 'fr';
}

/** Ajoute ou met à jour la demande WhatsApp de ce client. status = 'refusé' pour un refus d'âge. */
export async function recordWaDemande(chat: string, text: string, status = 'nouveau'): Promise<void> {
  await recordDemande('whatsapp', chat, text, status);
}

/** Même chose pour n'importe quel canal. `at` = date réelle du message (reprise de l'historique). */
// Plusieurs messages arrivent en même temps (reprise TikTok : 5 d'un coup → 1 seul gardé) : on écrit l'un après l'autre.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

export function recordDemande(ch: Channel, chat: string, text: string, status = 'nouveau',
  extra: { via?: WaDemande['via']; video?: string; at?: string } = {}): Promise<boolean> {
  // 26/11 : « de la part de X » → X devient client prioritaire (priority-referral)
  void import('./priority-referral.js').then(m => m.detectReferral(chat, text)).catch(() => {});
  return serial(() => recordDemandeNow(ch, chat, text, status, extra));
}

async function recordDemandeNow(ch: Channel, chat: string, text: string, status: string,
  extra: { via?: WaDemande['via']; video?: string; at?: string }): Promise<boolean> {
  const clean = text.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 500);
  if (!chat || !clean) return false;
  const list = await all(ch);
  const now = extra.at || new Date().toISOString();
  const i = list.findIndex(d => d.chat.toLowerCase() === chat.toLowerCase() && !WA_CLOSED.has(d.status) && (d.via ?? 'dm') === (extra.via ?? 'dm'));
  if (i >= 0) {
    const d = list[i]!;
    if (d.text.endsWith(clean)) {   // même message signalé deux fois (seul le statut peut changer : « sans suite »)
      if (status === 'nouveau' || d.status === status) return false;
      d.status = status; await save(list, ch); return true;
    }
    d.text = `${d.text}\n${clean}`.slice(-800);
    d.updated_at = now; d.count += 1;
    if (status !== 'nouveau') d.status = status;
    list.splice(i, 1); list.unshift(d);
  } else {
    list.unshift({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, chat, phone: ch === 'whatsapp' ? phoneOf(chat) : undefined,
      text: clean, status, lang: langOf(clean), created_at: now, updated_at: now, count: 1,
      ...(extra.via ? { via: extra.via } : {}), ...(extra.video ? { video: extra.video } : {}) });
  }
  list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  await save(list, ch);
  return true;
}

export async function listWaDemandes(ch: Channel = 'whatsapp'): Promise<WaDemande[]> { return all(ch); }

export function updateWaDemande(id: string, status: string, ch: Channel = 'whatsapp'): Promise<boolean> {
  return serial(async () => {
  const list = await all(ch);
  const d = list.find(x => x.id === id);
  if (!d) return false;
  d.status = status;
  if (status === 'contacté') d.replied_at = new Date().toISOString();
  await save(list, ch);
  return true;
  });
}

export function deleteWaDemande(id: string, ch: Channel = 'whatsapp'): Promise<boolean> {
  return serial(async () => {
  const list = await all(ch);
  const next = list.filter(x => x.id !== id);
  if (next.length === list.length) return false;
  await save(next, ch);
  return true;
  });
}

/** Même client ? Nom de discussion identique, ou mêmes 9 derniers chiffres pour un numéro. */
function sameClient(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const da = a.replace(/\D/g, ''), db = b.replace(/\D/g, '');
  return da.length >= 9 && db.length >= 9 && da.slice(-9) === db.slice(-9);
}

/** 24/11 : statut mis à jour tout seul — réponse WhatsApp envoyée → « contacté » ; réservation créée → « conclu ».
 *  Seulement si la demande est encore à un statut de `from` (on ne rouvre jamais une demande close). */
export function markDemande(chatOrPhone: string, status: string, from: string[], ch: Channel = 'whatsapp'): Promise<boolean> {
  return serial(async () => {
    if (!chatOrPhone) return false;
    const list = await all(ch);
    const d = list.find(x => sameClient(x.chat, chatOrPhone) && (from.includes(x.status) || (status === 'contacté' && x.status === 'contacté')));   // nouvelle réponse → replied_at rafraîchi
    if (!d) return false;
    d.status = status;
    if (status === 'contacté') d.replied_at = new Date().toISOString();
    await save(list, ch);
    return true;
  });
}

/** Titre d'une demande : la dernière vraie demande du client (pas « Non merci » ni « [photo] »). */
export function demandeTitle(text: string): string {
  const lines = text.split('\n').filter(l => !/^\[/.test(l));
  const pick = [...lines].reverse().find(l => looksLikeDemande(l)) ?? [...lines].reverse().find(l => l.length >= 20) ?? lines[lines.length - 1];
  return (pick || 'Message').slice(0, 140);
}

/** 24/11 Kouider : « relance pas les anciens messages, note-les en sans suite ». Demande ouverte sans nouveau message
 *  depuis `days` jours → « sans suite » (rangée dans les terminées, jamais relancée automatiquement). */
export function archiveStale(days = 30): Promise<number> {
  return serial(async () => {
    let n = 0;
    for (const ch of ['whatsapp', 'tiktok'] as Channel[]) {
      const list = await all(ch);
      let changed = false;
      for (const d of list) if (!WA_CLOSED.has(d.status) && Date.now() - Date.parse(d.updated_at) > days * 86_400_000) { d.status = 'sans suite'; changed = true; n++; }
      if (changed) await save(list, ch);
    }
    return n;
  });
}
