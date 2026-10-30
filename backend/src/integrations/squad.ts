/**
 * ESCOUADE D'AGENTS (27/10/2026) — « Dzaryx, lance l'escouade : prépare-moi l'été 2027 ». Le chef découpe l'objectif en
 * 2 à 4 missions (chercheur, analyste, rédacteur…), chaque agent travaille EN MÊME TEMPS avec les outils de lecture
 * (réservations, finances, web, mails…), et la page JARVIS › ESCOUADE montre chaque fenêtre avancer en direct.
 * À la fin, le chef assemble un plan unique (Telegram + app). Lecture seule : rien n'est envoyé ni modifié, les actions
 * sont proposées à Kouider. Séance : app_kv `squad:<id>` + `squad:last`.
 */
import { randomUUID } from 'crypto';
import { kvGet, kvSet } from './app-store.js';
import { createAnthropic, CLAUDE_MAIN, QUALITY } from './anthropic-compat.js';
import { runReadOnlyAgent } from './readonly-agent.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { jsonOf } from './media-util.js';
import { inSandbox } from './crash-test-sandbox.js';

interface Agent { name: string; icon: string; task: string; status: 'waiting' | 'working' | 'done' | 'error'; steps: Array<{ at: string; text: string }>; result?: string }
export interface Squad { id: string; goal: string; started: string; status: 'planning' | 'working' | 'merging' | 'done' | 'error'; agents: Agent[]; final?: string }

const TOOL_WORDS: Record<string, string> = {
  web_search: '🔎 cherche sur le web', list_bookings: '📅 lit les réservations', get_financial_report: '💶 lit les finances', get_revenue_report: '💶 lit le chiffre d\'affaires',
  get_fleet_status: '🚗 regarde la flotte', list_emails: '📧 lit les mails', read_email: '📧 lit un mail', get_upcoming_seasons: '🗓️ regarde les saisons',
  list_prospects: '🎯 lit les prospects', get_site_analytics: '📈 lit les visites du site', recall_memory: '🧠 fouille la mémoire', suggest_smart_pricing: '💡 calcule les prix',
  get_client_history: '👤 lit l\'historique client', check_car_availability: '🚗 vérifie les dispos', get_finance_dashboard: '💶 lit le tableau financier', list_leads: '🎯 lit les demandes', get_client_brain: '👤 lit une fiche client', prospect_replies: '📬 lit les réponses prospects', list_reviews: '⭐ lit les avis', get_expenses: '🧾 lit les dépenses', get_news: '📰 lit l\'actu', fetch_url: '🌐 ouvre une page',
};
const stepText = (tool: string, input: Record<string, unknown>) => {
  const q = String(input['query'] ?? input['q'] ?? input['search'] ?? '').slice(0, 60);
  return `${TOOL_WORDS[tool] ?? `⚙️ ${tool.replace(/_/g, ' ')}`}${q ? ` : « ${q} »` : ''}`;
};

const key = (id: string) => `squad:${id}`;
async function save(s: Squad): Promise<void> {
  await kvSet(key(s.id), JSON.stringify(s), 3 * 86_400);
  await kvSet('squad:last', s.id, 3 * 86_400);
}
export async function getSquad(id?: string): Promise<Squad | null> {
  const sid = id || (await kvGet('squad:last').catch(() => null));
  if (!sid) return null;
  try { return JSON.parse((await kvGet(key(sid))) ?? 'null') as Squad | null; } catch { return null; }
}

async function plan(goal: string): Promise<Array<{ name: string; icon: string; task: string }>> {
  const r = await createAnthropic().messages.create({ model: CLAUDE_MAIN, max_tokens: 1500, messages: [{ role: 'user', content:
`Tu es le chef d'une escouade d'agents IA qui travaillent pour Kouider (FIK Conciergerie : location de voitures à Oran, sites web FIK Sites, Bruxelles).
Objectif de Kouider : « ${goal} »
Découpe en 2 à 4 missions qui peuvent avancer EN MÊME TEMPS, sans se marcher dessus (ex. Chercheur marché, Analyste chiffres FIK, Stratège, Rédacteur).
Les agents ont seulement des outils de LECTURE : réservations, finances, flotte, mails, prospects, avis, saisons, recherche web, pages web.
Réponds UNIQUEMENT : {"agents":[{"name":"nom court","icon":"un emoji","task":"mission précise en 30 mots maximum"}]}` }] }, QUALITY);
  const j = jsonOf<{ agents?: Array<{ name: string; icon: string; task: string }> }>(r.content.map(b => (b.type === 'text' ? b.text : '')).join(''));
  return (j?.agents ?? []).slice(0, 4).filter(a => a.task);
}

async function run(s: Squad, onDone?: (final: string) => Promise<void>): Promise<void> {
  try {
    const p = await plan(s.goal);
    if (!p.length) throw new Error('découpage impossible');
    s.agents = p.map(a => ({ ...a, status: 'waiting', steps: [] }));
    s.status = 'working';
    await save(s);
    let pending = Promise.resolve();
    const persist = () => { pending = pending.then(() => save(s)).catch(() => {}); };   // écritures dans l'ordre
    await Promise.all(s.agents.map(async (a, i) => {
      await new Promise(r => setTimeout(r, i * 1500));   // départs décalés (limites de débit)
      a.status = 'working'; a.steps.push({ at: new Date().toISOString(), text: '🚀 au travail' }); persist();
      try {
        const out = await runReadOnlyAgent(
          `Aujourd'hui : ${new Date().toISOString().slice(0, 10)} (pense à cette année dans tes recherches web). Tu es l'agent « ${a.name} » d'une escouade. Objectif global de Kouider : « ${s.goal} ».\nTA mission : ${a.task}\n`
          + 'Travaille avec tes outils (vraies données), puis rends un résultat concret et court (8 à 15 lignes) : faits trouvés avec leur source, chiffres, recommandations.',
          { sessionId: `squad_${s.id}_${i}`, maxRounds: 7, maxTokens: 1500, quality: true,
            onStep: st => { a.steps.push({ at: new Date().toISOString(), text: stepText(st.tool, st.input) }); a.steps = a.steps.slice(-12); persist(); } });
        a.result = out.text; a.status = 'done'; a.steps.push({ at: new Date().toISOString(), text: '✅ terminé' });
      } catch (err) {
        a.status = 'error'; a.result = `❌ ${err instanceof Error ? err.message : String(err)}`;
      }
      persist();
    }));
    await pending;
    s.status = 'merging'; await save(s);
    const r = await createAnthropic().messages.create({ model: CLAUDE_MAIN, max_tokens: 1600, messages: [{ role: 'user', content:
`Objectif de Kouider : « ${s.goal} ». Voici le travail de ton escouade :\n\n${s.agents.map(a => `## ${a.icon} ${a.name}\n${a.result ?? '(rien)'}`).join('\n\n')}\n\n`
+ 'Assemble UN plan final pour Kouider : 3 lignes de synthèse, puis les actions numérotées (qui, quoi, quand, combien), puis les risques. Tutoie-le, français simple, pas de tableau, pas d\'invention.' }] }, QUALITY);
    s.final = r.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
    s.status = 'done';
    await save(s);
    if (inSandbox()) return;   // crash-test : rien chez Kouider
    await queueTelegramMessage(`🛰️ Escouade terminée — « ${s.goal} »\n\n${s.final.replace(/\*\*/g, '')}`).catch(() => {});
    emitProactive(`🛰️ Escouade terminée : ${s.goal.slice(0, 60)}`, 'info', s.final.slice(0, 1500));
    if (onDone) await onDone(s.final).catch(err => console.warn('[squad] onDone:', err instanceof Error ? err.message : err));
  } catch (err) {
    s.status = 'error'; s.final = `❌ ${err instanceof Error ? err.message : String(err)}`;
    await save(s);
  }
}

/** onDone : appelé avec le plan final (pas en crash-test), ex. l'usine à business rappelle Kouider avec le résumé. */
export async function startSquad(goal: string, onDone?: (final: string) => Promise<void>): Promise<Squad> {
  const s: Squad = { id: randomUUID().slice(0, 8), goal: goal.slice(0, 400), started: new Date().toISOString(), status: 'planning', agents: [] };
  await save(s);
  void run(s, onDone);
  return s;
}

export async function squadTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'start');
  if (action === 'status') {
    const s = await getSquad();
    if (!s) return 'Aucune escouade lancée.';
    return `🛰️ « ${s.goal} » — ${s.status}\n${s.agents.map(a => `${a.icon} ${a.name} : ${a.status}${a.steps.length ? ` — ${a.steps[a.steps.length - 1]!.text}` : ''}`).join('\n')}${s.final ? `\n\n${s.final}` : ''}`;
  }
  const goal = String(input['goal'] ?? '').trim();
  if (!goal) return '❌ Quel objectif pour l\'escouade ?';
  const s = await startSquad(goal);
  return `🛰️ Escouade lancée (« ${s.goal} ») : je découpe en 2 à 4 agents qui travaillent en même temps. Tu peux les regarder en direct dans l'app : JARVIS › 🛰️ Escouade. Le plan final arrive sur Telegram dans quelques minutes.`;
}
