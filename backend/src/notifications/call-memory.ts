import { kvGet, kvSet } from '../integrations/app-store.js';
import { callProvider } from '../providers/provider-manager.js';
import { writeMemory } from '../orchestrator/memory-engine.js';
import type { CallActor } from './voice-call.js';

// Mémoire des appels Telegram : à la fin d'un appel, tgcall envoie la transcription → résumé + choses à faire,
// gardés 30 jours (app_kv `callmem:<actor>`). Dzaryx les connaît ensuite partout (appels suivants, chat, vocal).

export interface CallLine { role: 'user' | 'dzaryx'; text: string; speaker?: string }   // speaker : qui parlait (Fatima…) si ce n'était pas lui
export interface CallMemory { at: string; durationS: number; summary: string; todos: string[] }

const KEY = (who: CallActor) => `callmem:${who}`;
const KEEP = 10;
const TTL_S = 30 * 86_400;

async function load(who: CallActor): Promise<CallMemory[]> {
  try { return JSON.parse((await kvGet(KEY(who))) ?? '[]') as CallMemory[]; } catch { return []; }
}

export async function summarizeCall(who: CallActor, lines: CallLine[], durationS: number): Promise<CallMemory | null> {
  const name = who === 'houari' ? 'Houari' : 'Kouider';
  const transcript = lines
    .filter(l => l.text?.trim())
    .map(l => `${l.role === 'user' ? (l.speaker || name) : 'Dzaryx'} : ${l.text.trim()}`)
    .join('\n')
    .slice(-12_000);
  // Appel vide ou juste « allô » : rien à retenir
  if (lines.filter(l => l.role === 'user' && l.text.trim().split(/\s+/).length >= 3).length === 0) return null;

  const r = await callProvider(
    { provider: 'claude', model: 'claude-sonnet-5-5', temperature: 0.2, maxTokens: 600, fallback: 'openai' },
    `Transcription de l'appel téléphonique entre ${name} et Dzaryx (son assistant) :\n\n${transcript}`,
    `Tu résumes un appel pour la mémoire de Dzaryx. Réponds UNIQUEMENT en JSON :
{"summary": "...", "todos": ["..."]}
- summary : 1 à 3 phrases, en français, les faits et décisions utiles (noms, montants, dates). Pas de politesse.
- todos : ce qui reste À FAIRE après l'appel (par ${name} ou par Dzaryx), formulé court (« Répondre à Mohammed Sergma pour le rendez-vous »). Pas ce qui a déjà été fait pendant l'appel. [] si rien.
- Si quelqu'un d'autre que ${name} a parlé (sa femme Fatima, un proche, un inconnu), commence le résumé par qui a décroché et ce qu'il/elle a dit (ex. quand ${name} sera disponible).`,
    25_000,
  );
  const m = r.text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]) as { summary?: string; todos?: string[] };
  const mem: CallMemory = {
    at: new Date().toISOString(),
    durationS: Math.round(durationS),
    summary: (parsed.summary ?? '').trim(),
    todos: (parsed.todos ?? []).map(t => String(t).trim()).filter(Boolean).slice(0, 8),
  };
  if (!mem.summary) return null;

  const all = [...(await load(who)), mem].slice(-KEEP);
  await kvSet(KEY(who), JSON.stringify(all), TTL_S);
  const day = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  await writeMemory({
    key: `appel_${mem.at}`,
    value: `Appel du ${day} : ${mem.summary}${mem.todos.length ? ` À faire : ${mem.todos.join(' ; ')}` : ''}`,
    domain: 'note',
    source: 'telegram_call',
    userId: who,
  }).catch(() => {});
  return mem;
}

/** Les derniers appels (7 jours), à donner à Dzaryx comme contexte. '' si aucun. */
export async function recentCallsText(who: CallActor, max = 3): Promise<string> {
  const since = Date.now() - 7 * 86_400_000;
  const recent = (await load(who)).filter(c => new Date(c.at).getTime() >= since).slice(-max);
  if (!recent.length) return '';
  const fmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return [
    'DERNIERS APPELS TÉLÉPHONIQUES (ce qui a été dit et décidé ; les « à faire » peuvent être déjà faits depuis : vérifie avant d\'affirmer) :',
    ...recent.map(c => `• ${fmt(c.at)} : ${c.summary}${c.todos.length ? ` — À faire : ${c.todos.join(' ; ')}` : ''}`),
  ].join('\n');
}
