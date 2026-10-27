/**
 * COPILOTE MAINS LIBRES (27/10/2026) — page COPILOTE de l'app, en voiture : Kouider parle sans toucher l'écran.
 * Chaque phrase (micro coupé aux pauses) → texte → « oui / non / vocal » d'une réponse WhatsApp proposée, sinon Dzaryx complet
 * (tous ses outils) avec la consigne « il conduit » → réponse dite à voix haute. Les nouveaux messages WhatsApp arrivent
 * dans un fil (app_kv `copilot:feed`) que la page lit à voix haute : « Nouveau message de Karim… je lui réponds ? ».
 */
import { kvGet, kvSet } from './app-store.js';

export interface FeedItem { id: string; at: string; chat: string; text: string; reply?: string; note?: string }
const FEED = 'copilot:feed';

async function feed(): Promise<FeedItem[]> {
  try { return JSON.parse((await kvGet(FEED)) ?? '[]') as FeedItem[]; } catch { return []; }
}

export async function copilotPush(i: Omit<FeedItem, 'id' | 'at'>): Promise<void> {
  const all = await feed();
  all.push({ ...i, text: i.text.slice(0, 500), id: Math.random().toString(36).slice(2, 10), at: new Date().toISOString() });
  await kvSet(FEED, JSON.stringify(all.slice(-30)), 86_400);
}

export async function copilotFeed(since: string): Promise<FeedItem[]> {
  return (await feed()).filter(i => i.at > since);
}

const DRIVING = `[COPILOTE — Kouider CONDUIT en ce moment et te parle mains libres. Réponds à l'oral, 1 à 2 phrases courtes, jamais de liste, jamais de lien lu.
Rien à lire à l'écran : s'il faut lui montrer quelque chose, envoie-le sur Telegram pour plus tard. Itinéraire → Waze (gps_assistant). Musique → playlist.
Pour un envoi (WhatsApp, mail…), prépare puis demande « je l'envoie ? » : il répondra à la voix.]`;

/** Une phrase dite au volant → réponse texte + voix. */
// Mot de réveil : « Dzaryx » (et ce que Whisper en fait souvent)
const WAKE = /\b(dzaryx|dzarix|dzariks|zarix|zaryx|d'?zaryx|jarvis|dzaric|dsarix|dzari)\b[,.!:\s]*/i;

export async function copilotTurn(audio: string, mime: string, wake = false): Promise<{ heard: string; text: string; audio?: string; audioMime?: string; ignored?: boolean }> {
  const { transcribeAudio } = await import('../api/routes/transcribe.js');
  let heard = (await transcribeAudio(audio, mime).catch(() => ({ text: '' }))).text.trim();
  if (!heard || heard.length < 2) return { heard: '', text: '' };
  // Écoute permanente : il ne répond que si on l'appelle « Dzaryx… » (le reste de la conversation est ignoré)
  if (wake) {
    const m = WAKE.exec(heard);
    if (!m) return { heard, text: '', ignored: true };
    heard = heard.slice(m.index + m[0].length).trim() || 'Oui ?';
  }
  let text = '';
  const wa = await import('./whatsapp-web.js').then(m => m.handleWaYesNo(heard)).catch(() => null);
  if (wa?.reply) text = wa.reply;
  else {
    const { processMessage } = await import('../conversation/orchestrator.js');
    const { stripToolTrace } = await import('./supabase.js');
    const note = wake ? '[MAINS LIBRES — Kouider t\'appelle « Dzaryx » à voix haute, l\'app est ouverte près de lui. Réponds à l\'oral, 1 à 3 phrases courtes, sans lien lu.]' : DRIVING;
    const out = await processMessage(`${note}\n${wa?.note ? `${wa.note}\n` : ''}${heard}`, 'voice_kouider', true);
    text = stripToolTrace(out.text ?? '') || 'Pardon, je n\'ai pas compris.';
  }
  const { synthesizeVoice } = await import('../notifications/dispatcher.js');
  const say = text.replace(/https?:\/\/\S+/g, '').replace(/[*_#`>|]/g, '').slice(0, 700);
  const buf = await synthesizeVoice(say, true).catch(() => null);
  return { heard, text, ...(buf?.length ? { audio: buf.toString('base64'), audioMime: buf.subarray(0, 4).toString('ascii') === 'RIFF' ? 'audio/wav' : 'audio/mpeg' } : {}) };
}

/** Texte → voix (pour lire un nouveau message WhatsApp du fil). */
export async function copilotSpeak(text: string): Promise<{ audio?: string }> {
  const { synthesizeVoice } = await import('../notifications/dispatcher.js');
  const buf = await synthesizeVoice(text.slice(0, 600), true).catch(() => null);
  return buf?.length ? { audio: buf.toString('base64') } : {};
}
