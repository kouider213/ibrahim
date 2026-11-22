import { kvGet, kvSet } from '../integrations/app-store.js';
import { callProvider } from '../providers/provider-manager.js';
import { writeMemory } from '../orchestrator/memory-engine.js';
import type { CallActor } from './voice-call.js';
import { redactSecrets } from '../utils/redact-secrets.js';

// Mémoire des appels Telegram : à la fin d'un appel, tgcall envoie la transcription → résumé + choses à faire,
// gardés 30 jours (app_kv `callmem:<actor>`). Dzaryx les connaît ensuite partout (appels suivants, chat, vocal).

// role 'tool' : un outil lancé pendant l'appel + son résultat (tgcall depuis le 22/11) → ce qui a VRAIMENT été fait
export interface CallLine { role: 'user' | 'dzaryx' | 'tool'; text: string; speaker?: string }   // speaker : qui parlait (sa femme…) si ce n'était pas lui
// unverified : actions que Dzaryx a dites faites au téléphone sans qu'aucun outil ne l'ait fait (idée Hermes v0.23 « UNVERIFIED »)
export interface CallMemory { at: string; durationS: number; summary: string; todos: string[]; unverified?: string[] }

// « c'est noté », « j'ai ajouté », « je t'ai mis un rappel »… : Dzaryx affirme avoir FAIT quelque chose
const DONE_CLAIM = /\b(?:c'est (?:not[ée]|fait|programm[ée]|enregistr[ée]|ajout[ée]|envoy[ée]|r[ée]serv[ée]|annul[ée]|confirm[ée]|cal[ée]|mis)|(?:je l'ai|j'ai(?: bien)?|je t'ai|je lui ai|c'est bien) (?:not[ée]|ajout[ée]|enregistr[ée]|envoy[ée]|programm[ée]|r[ée]serv[ée]|annul[ée]|cr[ée]{1,2}|mis|d[ée]plac[ée]|modifi[ée]|calé|pr[ée]venu|transmis|confirm[ée])|(?:rappel|alarme|r[ée]veil) (?:est )?(?:programm[ée]|mis|cal[ée])|(?:ajout[ée]|not[ée]|enregistr[ée]) (?:à|a|dans) (?:l'agenda|ton agenda|tes notes|ta liste|FORME))/i;

/** Phrases de Dzaryx qui disent « c'est fait » dans un appel où AUCUN outil n'a tourné (filet de sécurité du code). */
export function claimsWithoutTool(lines: CallLine[]): string[] {
  if (lines.some(l => l.role === 'tool')) return [];
  const out: string[] = [];
  for (const l of lines) {
    if (l.role !== 'dzaryx' || !DONE_CLAIM.test(l.text)) continue;
    const sentence = l.text.split(/(?<=[.!?])\s+/).find(x => DONE_CLAIM.test(x)) ?? l.text;
    out.push(`Dzaryx a dit « ${sentence.trim().slice(0, 140)} » sans lancer d'outil`);
  }
  return [...new Set(out)].slice(0, 3);
}

const KEY = (who: CallActor) => `callmem:${who}`;
const KEEP = 10;
const TTL_S = 30 * 86_400;

async function load(who: CallActor): Promise<CallMemory[]> {
  try { return JSON.parse((await kvGet(KEY(who))) ?? '[]') as CallMemory[]; } catch { return []; }
}

export async function summarizeCall(who: CallActor, rawLines: CallLine[], durationS: number, tracked = false, persist = true): Promise<CallMemory | null> {
  // Secrets dictés (codes, mots de passe, IBAN, cartes) masqués AVANT le résumé et la mémoire de 30 jours
  const lines = rawLines.map(l => ({ ...l, text: redactSecrets(String(l.text ?? '')) }));
  const name = who === 'houari' ? 'Houari' : 'Kouider';
  const transcript = lines
    .filter(l => l.text?.trim())
    .map(l => l.role === 'tool' ? `[OUTIL] ${l.text.trim()}` : `${l.role === 'user' ? (l.speaker || name) : 'Dzaryx'} : ${l.text.trim()}`)
    .join('\n')
    .slice(-12_000);
  const toolsTracked = lines.some(l => l.role === 'tool') || tracked;
  // Appel vide ou juste « allô » : rien à retenir
  if (lines.filter(l => l.role === 'user' && l.text.trim().split(/\s+/).length >= 3).length === 0) return null;

  const r = await callProvider(
    { provider: 'claude', model: 'claude-sonnet-5-5', temperature: 0.2, maxTokens: 600, fallback: 'openai' },
    `Transcription de l'appel téléphonique entre ${name} et Dzaryx (son assistant) :\n\n${transcript}`,
    `Tu résumes un appel pour la mémoire de Dzaryx. Réponds UNIQUEMENT en JSON :
{"summary": "...", "todos": ["..."], "unverified": ["..."]}
${toolsTracked ? `- Les lignes [OUTIL] sont les seules actions VRAIMENT faites pendant l'appel (outil lancé + résultat). Une ligne [OUTIL] dont le résultat dit « PAS FAIT », « BLOQUÉ », « Erreur », « Échec », « ❌ » ou « LANCÉ EN FOND » n'est PAS une action faite.
- unverified : chaque action que Dzaryx a dite faite (« c'est noté », « j'ai ajouté à l'agenda », « je t'ai mis un rappel », « j'ai envoyé ») SANS ligne [OUTIL] réussie qui la fait. Une phrase courte par action (« Rappel de 20h05 : dit noté, aucun outil lancé »). [] si tout est confirmé par un outil. Les simples réponses à une question (heure, conseil, calcul) ne comptent pas.
- summary : n'écris « Dzaryx a enregistré / ajouté / envoyé » QUE si une ligne [OUTIL] réussie le confirme ; sinon mets cette action dans todos (elle reste à faire).
` : '- unverified : [] (toujours).\n'}
- summary : 1 à 3 phrases, en français, les faits et décisions utiles (noms, montants, dates). Pas de politesse.
- todos : ce qui reste À FAIRE après l'appel (par ${name} ou par Dzaryx), formulé court (« Répondre à Mohammed Sergma pour le rendez-vous »). Pas ce qui a déjà été fait pendant l'appel. [] si rien.
- N'écris RIEN sur la technique de l'appel (coupures, ligne, « tu m'entends ? », allô, appel interrompu, bruit) : seulement le fond. Si l'appel n'a contenu que ça, summary = "".
- N'invente jamais qui a décroché : quelqu'un d'autre que ${name} seulement si la transcription le montre clairement.
- Si quelqu'un d'autre que ${name} a parlé (sa femme, un proche, un inconnu), commence le résumé par qui a décroché et ce qu'il/elle a dit (ex. quand ${name} sera disponible).`,
    25_000,
  );
  const m = r.text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]) as { summary?: string; todos?: string[]; unverified?: string[] };
  const fromModel = toolsTracked && Array.isArray(parsed.unverified) ? parsed.unverified : [];
  const fromCode = toolsTracked ? claimsWithoutTool(lines) : [];
  const unverified = [...fromModel, ...fromCode].map(t => redactSecrets(String(t).trim())).filter(Boolean)
    .filter((t, i, a) => a.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i).slice(0, 4);
  const mem: CallMemory = {
    at: new Date().toISOString(),
    durationS: Math.round(durationS),
    summary: redactSecrets((parsed.summary ?? '').trim()),
    todos: (parsed.todos ?? []).map(t => redactSecrets(String(t).trim())).filter(Boolean).slice(0, 8),
    ...(unverified.length ? { unverified } : {}),
  };
  if (!mem.summary) return null;
  if (!persist) return mem;   // tests (bac à sable) : rien d'écrit

  const all = [...(await load(who)), mem].slice(-KEEP);
  await kvSet(KEY(who), JSON.stringify(all), TTL_S);
  const day = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  await writeMemory({
    key: `appel_${mem.at}`,
    value: `Appel du ${day} : ${mem.summary}${mem.todos.length ? ` À faire : ${mem.todos.join(' ; ')}` : ''}`
      + `${mem.unverified?.length ? ` NON VÉRIFIÉ (dit au téléphone, aucun outil ne l'a fait) : ${mem.unverified.join(' ; ')}` : ''}`,
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
    'DERNIERS APPELS TÉLÉPHONIQUES (ce qui a été dit et décidé ; les « à faire » peuvent être déjà faits depuis : vérifie avant d\'affirmer ; ne parle JAMAIS des coupures ou problèmes de ligne des appels d\'avant) :',
    ...recent.map(c => `• ${fmt(c.at)} : ${c.summary}${c.todos.length ? ` — À faire : ${c.todos.join(' ; ')}` : ''}`
      + `${c.unverified?.length ? ` — ⚠️ NON VÉRIFIÉ (dit fait au téléphone mais aucun outil ne l'a fait : vérifie avec l'outil, ne le redis jamais comme fait) : ${c.unverified.join(' ; ')}` : ''}`),
  ].join('\n');
}
