/**
 * ✈️ Flight Bot — Intégré dans Ibrahim Backend
 * Recherche de vols via liens eDreams directs
 * Token: FLIGHT_BOT_TOKEN (variable Railway séparée)
 */

import axios from 'axios';
import { env } from '../config/env.js';

// ── Config ────────────────────────────────────────────────────────────────────
function getToken(): string {
  return env.FLIGHT_BOT_TOKEN ?? '';
}
function base(): string {
  return `https://api.telegram.org/bot${getToken()}`;
}

// ── États conversation par chat ───────────────────────────────────────────────
type Step = 'ORIGIN' | 'DESTINATION' | 'DATE_DEP' | 'DATE_RET' | 'PASSENGERS';

interface Session {
  step:        Step;
  origin?:     string;
  destination?: string;
  dateDep?:    string;
  dateRet?:    string | null;
  adults?:     number;
}

const sessions = new Map<number, Session>();

// ── Codes IATA ────────────────────────────────────────────────────────────────
const AIRPORTS: Record<string, string> = {
  'oran': 'ORN', 'orn': 'ORN',
  'alger': 'ALG', 'alg': 'ALG',
  'paris': 'CDG', 'cdg': 'CDG',
  'lyon': 'LYS', 'lys': 'LYS',
  'marseille': 'MRS', 'mrs': 'MRS',
  'dubai': 'DXB', 'dxb': 'DXB',
  'istanbul': 'IST', 'ist': 'IST',
  'london': 'LHR', 'lhr': 'LHR',
  'madrid': 'MAD', 'mad': 'MAD',
  'rome': 'FCO', 'fco': 'FCO',
  'montreal': 'YUL', 'yul': 'YUL',
  'bruxelles': 'BRU', 'bru': 'BRU',
  'amsterdam': 'AMS', 'ams': 'AMS',
  'frankfurt': 'FRA', 'fra': 'FRA',
  'tunis': 'TUN', 'tun': 'TUN',
  'casablanca': 'CMN', 'cmn': 'CMN',
  'doha': 'DOH', 'doh': 'DOH',
  'new york': 'JFK', 'jfk': 'JFK',
  'barcelone': 'BCN', 'bcn': 'BCN',
  'nice': 'NCE', 'nce': 'NCE',
  'milan': 'MXP', 'mxp': 'MXP',
  'geneve': 'GVA', 'gva': 'GVA',
  'toulouse': 'TLS', 'tls': 'TLS',
  'bordeaux': 'BOD', 'bod': 'BOD',
  'nantes': 'NTE', 'nte': 'NTE',
  'strasbourg': 'SXB', 'sxb': 'SXB',
};

function resolveAirport(text: string): string {
  const t = text.trim().toLowerCase();
  return AIRPORTS[t] ?? t.toUpperCase();
}

// ── Formater date eDreams DD/MM/YYYY ─────────────────────────────────────────
function formatDateEdreams(date: string): string {
  const parts = date.split('-');
  if (parts.length === 3 && parts[0] && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return date;
}


function normalizeDate(input: string): string | null {
  // Accepte: 2026-07-15 ou 15/07/2026
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match && match[1] && match[2] && match[3]) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

// ── Construire lien eDreams ───────────────────────────────────────────────────
function buildEdreamsLink(
  origin: string,
  destination: string,
  dateDep: string,
  dateRet: string | null,
  adults: number
): string {
  const dep = formatDateEdreams(dateDep);

  if (dateRet) {
    const ret = formatDateEdreams(dateRet);
    return (
      `https://www.edreams.fr/flight/#results/type=R;` +
      `from=${origin};to=${destination};` +
      `dep=${dep};ret=${ret};` +
      `adults=${adults};children=0;infants=0`
    );
  }
  return (
    `https://www.edreams.fr/flight/#results/type=O;` +
    `from=${origin};to=${destination};` +
    `dep=${dep};adults=${adults};children=0;infants=0`
  );
}

// ── Envoyer message ───────────────────────────────────────────────────────────
async function sendMsg(chatId: number, text: string): Promise<void> {
  const token = getToken();
  if (!token) return;
  try {
    await axios.post(`${base()}/sendMessage`, {
      chat_id:    chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    });
  } catch {
    await axios.post(`${base()}/sendMessage`, { chat_id: chatId, text }).catch(() => {});
  }
}

async function sendTyping(chatId: number): Promise<void> {
  await axios.post(`${base()}/sendChatAction`, {
    chat_id: chatId,
    action:  'typing',
  }).catch(() => {});
}

// ── Traitement message ────────────────────────────────────────────────────────
async function handleMessage(chatId: number, text: string): Promise<void> {
  const t = text.trim();

  // /start ou /nouveau
  if (t === '/start' || t === '/nouveau' || t.toLowerCase() === 'nouveau' || t.toLowerCase() === 'recommencer') {
    sessions.set(chatId, { step: 'ORIGIN' });
    await sendMsg(chatId,
      `✈️ *Bienvenue sur le Bot de Vols!*\n\n` +
      `Je vais te trouver le meilleur vol sur eDreams.\n\n` +
      `📍 *D'où pars-tu?*\n` +
      `_(Ex: Oran, Alger, Paris, Lyon, Bruxelles...)_`
    );
    return;
  }

  // /help
  if (t === '/help') {
    await sendMsg(chatId,
      `✈️ *Comment utiliser le bot:*\n\n` +
      `1️⃣ Tape /start pour commencer\n` +
      `2️⃣ Entre ta ville de départ\n` +
      `3️⃣ Entre ta destination\n` +
      `4️⃣ Date de départ (format: YYYY-MM-DD)\n` +
      `5️⃣ Date de retour (ou "non" pour aller simple)\n` +
      `6️⃣ Nombre de passagers\n\n` +
      `Je te génère un lien eDreams direct! 🎯`
    );
    return;
  }

  const session = sessions.get(chatId);

  // Pas de session → démarrer
  if (!session) {
    sessions.set(chatId, { step: 'ORIGIN' });
    await sendMsg(chatId,
      `✈️ Nouvelle recherche!\n\n📍 *D'où pars-tu?*\n_(Ex: Oran, Paris, Bruxelles...)_`
    );
    return;
  }

  await sendTyping(chatId);

  switch (session.step) {

    case 'ORIGIN': {
      const code = resolveAirport(t);
      session.origin = code;
      session.step   = 'DESTINATION';
      sessions.set(chatId, session);
      await sendMsg(chatId,
        `✅ Départ: *${code}*\n\n🎯 *Destination?*\n_(Ex: Paris, Dubai, Istanbul...)_`
      );
      break;
    }

    case 'DESTINATION': {
      const code = resolveAirport(t);
      session.destination = code;
      session.step        = 'DATE_DEP';
      sessions.set(chatId, session);
      await sendMsg(chatId,
        `✅ Destination: *${code}*\n\n📅 *Date de départ?*\n_(Format: YYYY-MM-DD — ex: 2026-07-15)_`
      );
      break;
    }

    case 'DATE_DEP': {
      const date = normalizeDate(t);
      if (!date) {
        await sendMsg(chatId, `⚠️ Format invalide. Utilise: *YYYY-MM-DD*\nEx: 2026-07-15`);
        return;
      }
      session.dateDep = date;
      session.step    = 'DATE_RET';
      sessions.set(chatId, session);
      await sendMsg(chatId,
        `✅ Départ: *${date}*\n\n🔄 *Date de retour?*\n_(Format: YYYY-MM-DD — ou tape "non" pour aller simple)_`
      );
      break;
    }

    case 'DATE_RET': {
      const lower = t.toLowerCase();
      if (lower === 'non' || lower === 'no' || lower === 'aller simple' || lower === '-') {
        session.dateRet = null;
      } else {
        const date = normalizeDate(t);
        if (!date) {
          await sendMsg(chatId, `⚠️ Format invalide. Utilise: *YYYY-MM-DD* ou tape "non" pour aller simple.`);
          return;
        }
        session.dateRet = date;
      }
      session.step = 'PASSENGERS';
      sessions.set(chatId, session);
      await sendMsg(chatId,
        `✅ Retour: *${session.dateRet ?? 'Aller simple'}*\n\n👥 *Nombre de passagers?*\n_(Ex: 1, 2, 3...)_`
      );
      break;
    }

    case 'PASSENGERS': {
      const n = parseInt(t, 10);
      if (isNaN(n) || n < 1 || n > 9) {
        await sendMsg(chatId, `⚠️ Nombre invalide. Entre un chiffre entre 1 et 9.`);
        return;
      }
      session.adults = n;

      // ── Générer résultat ──────────────────────────────────────────────────
      const { origin, destination, dateDep, dateRet, adults } = session;
      if (!origin || !destination || !dateDep) {
        await sendMsg(chatId, `⚠️ Données manquantes. Tape /start pour recommencer.`);
        sessions.delete(chatId);
        return;
      }

      const link = buildEdreamsLink(origin, destination, dateDep, dateRet ?? null, adults ?? 1);
      const tripType = dateRet ? `Aller-Retour` : `Aller Simple`;
      const retInfo  = dateRet ? `\n📅 Retour: *${dateRet}*` : '';

      await sendMsg(chatId,
        `🎉 *Voici ta recherche de vol!*\n\n` +
        `🛫 Départ: *${origin}*\n` +
        `🛬 Arrivée: *${destination}*\n` +
        `📅 Départ: *${dateDep}*${retInfo}\n` +
        `👥 Passagers: *${adults ?? 1}*\n` +
        `🎫 Type: *${tripType}*\n\n` +
        `🔗 [👉 Voir les vols sur eDreams](${link})\n\n` +
        `_Tape /nouveau pour une autre recherche_`
      );

      sessions.delete(chatId);
      break;
    }
  }
}

// ── Polling long ──────────────────────────────────────────────────────────────
let lastUpdateId = 0;
let isRunning    = false;

async function poll(): Promise<void> {
  if (!getToken()) {
    console.log('[flight-bot] FLIGHT_BOT_TOKEN not set — bot disabled');
    return;
  }

  isRunning = true;
  console.log('[flight-bot] ✈️ Started polling...');

  while (isRunning) {
    try {
      const { data } = await axios.get(`${base()}/getUpdates`, {
        params: {
          offset:          lastUpdateId + 1,
          timeout:         30,
          allowed_updates: ['message'],
        },
        timeout: 35_000,
      });

      const updates = (data as { result: Array<{
        update_id: number;
        message?: { chat: { id: number }; text?: string };
      }> }).result;

      for (const update of updates) {
        lastUpdateId = update.update_id;
        const msg    = update.message;
        if (msg?.text) {
          handleMessage(msg.chat.id, msg.text).catch(err => {
            console.error('[flight-bot] handleMessage error:', err);
          });
        }
      }
    } catch (err) {
      if (!isRunning) break;
      console.error('[flight-bot] Poll error:', err instanceof Error ? err.message : String(err));
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

export function startFlightBot(): void {
  if (!getToken()) {
    console.log('[flight-bot] ⚠️  FLIGHT_BOT_TOKEN manquant — bot vols désactivé');
    return;
  }
  poll().catch(err => console.error('[flight-bot] Fatal:', err));
}

export function stopFlightBot(): void {
  isRunning = false;
}
