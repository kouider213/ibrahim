// 24/11 Kouider : « les demandes WhatsApp vont dans les DEMANDES aussi » (avant : seulement celles du site).
// Une fiche par discussion WhatsApp tant qu'elle est ouverte ; un nouveau message du même client met la fiche à jour.
// Stockage : app_kv (clé wa:demandes), pas de table Supabase à créer.
import { kvGet, kvSet } from './app-store.js';

export interface WaDemande {
  id: string; chat: string; phone?: string; text: string; status: string;
  lang: 'fr' | 'ar' | 'en'; created_at: string; updated_at: string; count: number;
}

const KEY = 'wa:demandes';
const MAX = 200;
export const WA_CLOSED = new Set(['conclu', 'perdu', 'refusé']);

async function all(): Promise<WaDemande[]> {
  try { const r = await kvGet(KEY); return r ? JSON.parse(r) as WaDemande[] : []; } catch { return []; }
}
async function save(list: WaDemande[]): Promise<void> {
  await kvSet(KEY, JSON.stringify(list.slice(0, MAX)));
}

/** Le texte du client ressemble à une demande (location, prix, dispo, achat, import…) ? */
export function looksLikeDemande(text: string): boolean {
  return /voiture|v[ée]hicule|louer|location|r[ée]serv|dispo|prix|tarif|combien|devis|achat|acheter|import|appart|logement|s[ée]jour|aéroport|aeroport|kra|كراء|طوموبيل|سيارة|حجز|سعر|car\b|rent|price|booking/i.test(text);
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
  const clean = text.split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 500);
  if (!chat || !clean) return;
  const list = await all();
  const now = new Date().toISOString();
  const i = list.findIndex(d => d.chat.toLowerCase() === chat.toLowerCase() && !WA_CLOSED.has(d.status));
  if (i >= 0) {
    const d = list[i]!;
    if (d.text.endsWith(clean)) return;   // même message signalé deux fois
    d.text = `${d.text}\n${clean}`.slice(-800);
    d.updated_at = now; d.count += 1;
    if (status !== 'nouveau') d.status = status;
    list.splice(i, 1); list.unshift(d);
  } else {
    list.unshift({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, chat, phone: phoneOf(chat),
      text: clean, status, lang: langOf(clean), created_at: now, updated_at: now, count: 1 });
  }
  await save(list);
}

export async function listWaDemandes(): Promise<WaDemande[]> { return all(); }

export async function updateWaDemande(id: string, status: string): Promise<boolean> {
  const list = await all();
  const d = list.find(x => x.id === id);
  if (!d) return false;
  d.status = status; d.updated_at = new Date().toISOString();
  await save(list);
  return true;
}

export async function deleteWaDemande(id: string): Promise<boolean> {
  const list = await all();
  const next = list.filter(x => x.id !== id);
  if (next.length === list.length) return false;
  await save(next);
  return true;
}
