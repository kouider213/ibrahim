/**
 * Note de passation entre cerveaux (27/10/2026, idée vue dans une vidéo « Claude Code gratuit ») :
 *   - Claude coupé → le cerveau de secours reçoit une note : ce que Kouider veut, ce qui est déjà fait, ce qui attend
 *     son oui. Sans elle, Groq (6 messages tronqués) ou Gemini repartaient de zéro sur un « Oui » ou « vas-y ».
 *   - Claude revient → il reçoit, une seule fois, ce que le secours a fait pendant la coupure.
 * Note construite sans appel IA (gratuite, instantanée).
 */
import type { Message } from './claude-api.js';

const BACK_KEY = 'brain:handoff:back';
const TRACE_RE = /\[note interne, ne pas recopier — outils réellement lancés à ce tour : ([^\]]*)\]/;

const text = (c: Message['content']): string => typeof c === 'string' ? c
  : c.map(b => b.type === 'text' ? b.text : '').filter(Boolean).join('\n');
const clean = (s: string, max: number): string => {
  const t = s.replace(TRACE_RE, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/** Note pour le cerveau de secours, à partir de l'historique déjà chargé (avec la trace des outils). */
export async function buildHandoffNote(messages: Message[], max = 1500): Promise<string> {
  const flat = messages.map(m => ({ role: m.role, text: text(m.content) })).filter(m => m.text.trim());
  if (!flat.length) return '';
  const users = flat.filter(m => m.role === 'user');
  const last = users[users.length - 1]?.text ?? '';
  // Objectif = dernières vraies demandes (une réponse courte « oui » n'en est pas une)
  const asks = users.slice(0, -1).filter(m => m.text.trim().length >= 25).slice(-2).map(m => `« ${clean(m.text, 220)} »`);
  const prevAssistant = [...flat.slice(0, -1)].reverse().find(m => m.role === 'assistant')?.text ?? '';
  const done = flat.slice(-12).filter(m => m.role === 'assistant')
    .map(m => m.text.match(TRACE_RE)?.[1] ?? '').filter(t => t && t !== 'aucun')
    .flatMap(t => t.split(',').map(s => s.trim())).filter(t => t.endsWith('✅')).map(t => t.replace(/\s*✅$/, ''));

  const lines = ['NOTE DE PASSATION — tu reprends la conversation au milieu, à la place du cerveau principal. Kouider ne doit voir AUCUNE différence : même ton, ne parle pas de changement de modèle.'];
  if (asks.length) lines.push(`Ce qu'il voulait juste avant : ${asks.join(' puis ')}.`);
  lines.push(`Son message maintenant : « ${clean(last, 300)} »${last.trim().length < 25 ? ' — réponse courte : c\'est la SUITE du dernier échange, pas un nouveau sujet.' : '.'}`);
  if (prevAssistant) {
    const q = /\?\s*$/.test(clean(prevAssistant, 2000));
    lines.push(`Ta dernière réponse${q ? ' (une question, à laquelle il répond)' : ''} : « ${clean(prevAssistant, 400)} »`);
  }
  if (done.length) lines.push(`Déjà fait avec succès dans les derniers tours (NE PAS refaire, pas de double envoi) : ${[...new Set(done)].slice(-10).join(', ')}.`);
  try {
    const { kvGet } = await import('./app-store.js');
    const wa = JSON.parse((await kvGet('wa:pending')) || 'null') as { chat?: string; draft?: string } | null;
    if (wa?.draft) lines.push(`En attente de son oui/non : réponse WhatsApp proposée à ${wa.chat ?? 'un client'} (« ${clean(wa.draft, 160)} »).`);
  } catch { /* kv indisponible : note sans l'attente */ }
  const note = lines.join('\n');
  return note.length > max ? `${note.slice(0, max)}…` : note;
}

type BackItem = { at: string; by: string; ask: string; reply: string; tools: string[] };

/** Tour servi par le secours → gardé pour le retour de Claude (8 derniers, 2 jours). */
export async function recordFallbackTurn(by: string, ask: string, reply: string, tools: string[]): Promise<void> {
  const { kvGet, kvSet } = await import('./app-store.js');
  let list: BackItem[] = [];
  try { list = JSON.parse((await kvGet(BACK_KEY)) || '[]') as BackItem[]; } catch { list = []; }
  list.push({ at: new Date().toISOString(), by, ask: clean(ask, 200), reply: clean(reply, 250), tools });
  await kvSet(BACK_KEY, JSON.stringify(list.slice(-8)), 2 * 86400);
}

/** Note de retour pour Claude ('' si rien). À effacer avec clearReturnNote() une fois Claude a répondu. */
export async function returnNote(): Promise<string> {
  try {
    const { kvGet } = await import('./app-store.js');
    const list = JSON.parse((await kvGet(BACK_KEY)) || '[]') as BackItem[];
    if (!list.length) return '';
    const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' });
    return ['RETOUR DE PASSATION — pendant ta coupure, le cerveau de secours a répondu à Kouider. Tu reprends avec ce contexte (ne lui en parle que si c\'est utile, ne refais pas ce qui est fait) :',
      ...list.map(i => `- ${hhmm(i.at)} (${i.by}) il a dit « ${i.ask} » → réponse « ${i.reply} »${i.tools.length ? ` — outils : ${i.tools.join(', ')}` : ''}`),
      'Si une réponse du secours était fausse ou incomplète, corrige-la simplement.'].join('\n');
  } catch { return ''; }
}

export async function clearReturnNote(): Promise<void> {
  const { kvDel } = await import('./app-store.js');
  await kvDel(BACK_KEY).catch(() => {});
}
