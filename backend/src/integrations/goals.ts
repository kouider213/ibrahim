import { randomUUID } from 'crypto';
import { kvGet, kvSet } from './app-store.js';
import { runReadOnlyAgent } from './readonly-agent.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { autoCall } from '../notifications/auto-call.js';

// Objectifs (idée reprise de Hermes Agent « /goal ») : « objectif : louer la Jumpy ce week-end »,
// « 3 nouveaux clients entreprises ce mois-ci ». Chaque jour à 9h Dzaryx mesure où on en est (outils de
// LECTURE seulement), propose 1 à 3 actions concrètes, et s'arrête quand c'est atteint ou à l'échéance.
// Différence avec une mission : un objectif a une ligne d'arrivée. Stockage : app_kv `goals`.

export interface Goal {
  id: string;
  objective: string;
  deadline: string | null;     // AAAA-MM-JJ
  owner: 'kouider' | 'houari';
  status: 'active' | 'done' | 'expired' | 'abandoned';
  created_at: string;
  last_check?: string;
  last_progress?: string;
}

const KEY = 'goals';
const TZ = 'Europe/Brussels';

async function load(): Promise<Goal[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as Goal[]; } catch { return []; }
}
async function save(list: Goal[]): Promise<void> { await kvSet(KEY, JSON.stringify(list)); }
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

function find(list: Goal[], ref: string): Goal | undefined {
  const r = ref.trim().toLowerCase();
  return list.find(g => g.id === ref) ?? list.find(g => g.status === 'active' && g.objective.toLowerCase().includes(r));
}

export async function createGoalTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const objective = String(input['objective'] ?? '').trim();
  if (!objective) return '❌ Quel est l\'objectif ?';
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(String(input['deadline'] ?? '')) ? String(input['deadline']) : null;
  const list = await load();
  if (list.filter(g => g.status === 'active').length >= 10) return '❌ Déjà 10 objectifs en cours.';
  const g: Goal = { id: randomUUID().slice(0, 8), objective, deadline, status: 'active', created_at: new Date().toISOString(),
    owner: sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider' };
  list.push(g);
  await save(list);
  const first = await checkGoal(g, false).catch(() => null);
  return `🎯 Objectif enregistré : « ${objective} »${deadline ? ` — échéance ${deadline}` : ''}. Je fais le point chaque matin à 9h et je te propose quoi faire, jusqu'à ce que ce soit atteint.`
    + (first ? `\n\nPoint de départ :\n${first}` : '');
}

export async function listGoalsTool(): Promise<string> {
  const list = await load();
  const act = list.filter(g => g.status === 'active');
  const past = list.filter(g => g.status !== 'active').slice(-5);
  if (!list.length) return 'Aucun objectif. Exemple : « objectif : louer la Jumpy ce week-end ».';
  return [
    act.length ? `🎯 EN COURS :\n${act.map(g => `• ${g.objective}${g.deadline ? ` (échéance ${g.deadline})` : ''}${g.last_progress ? `\n   Dernier point : ${g.last_progress.slice(0, 200)}` : ''}`).join('\n')}` : 'Aucun objectif en cours.',
    past.length ? `Terminés : ${past.map(g => `${g.objective} → ${{ done: '✅ atteint', expired: '⌛ échéance passée', abandoned: '✖ abandonné' }[g.status as 'done']}`).join(' · ')}` : '',
  ].filter(Boolean).join('\n\n');
}

export async function updateGoalTool(input: Record<string, unknown>): Promise<string> {
  const list = await load();
  const g = find(list, String(input['goal'] ?? ''));
  if (!g) return '❌ Objectif introuvable.';
  if (input['status'] === 'done' || input['status'] === 'abandoned') g.status = input['status'];
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(input['deadline'] ?? ''))) g.deadline = String(input['deadline']);
  await save(list);
  return `✅ Objectif « ${g.objective} » : ${g.status === 'active' ? `en cours${g.deadline ? `, échéance ${g.deadline}` : ''}` : g.status === 'done' ? 'marqué atteint 🎉' : 'abandonné'}.`;
}

const GOAL_SYSTEM =
  'Tu suis un OBJECTIF de Kouider. Mesure où on en est avec tes outils (réservations, flotte, prospects, mails pro, ' +
  'finances…), puis réponds avec ce format EXACT :\n' +
  'ATTEINT: oui|non\n' +
  'PROGRÈS: une phrase chiffrée (où on en est par rapport au but)\n' +
  'ACTIONS: 1 à 3 actions concrètes que Kouider (ou toi sur son ordre) peut faire AUJOURD\'HUI, la plus efficace d\'abord\n' +
  'ORAL: 1 phrase à dire au téléphone, sans emoji\n' +
  'Ne déclare ATTEINT: oui que si les données le prouvent.';

async function checkGoal(g: Goal, notify = true): Promise<string> {
  const { text } = await runReadOnlyAgent(
    `OBJECTIF : ${g.objective}\nCréé le ${g.created_at.slice(0, 10)}${g.deadline ? `, échéance ${g.deadline}` : ''}. Aujourd'hui : ${today()}.`,
    { system: GOAL_SYSTEM, sessionId: `mission_goal_${g.id}`, maxRounds: 8, maxTokens: 1500 },
  );
  const reached = /ATTEINT:\s*oui/i.test(text);
  const progress = text.match(/PROGRÈS:\s*(.+)/i)?.[1]?.trim() ?? '';
  const actions = text.match(/ACTIONS:\s*([\s\S]+?)(?:\n\s*ORAL:|$)/i)?.[1]?.trim() ?? '';
  const oral = text.match(/ORAL:\s*(.+)/i)?.[1]?.trim() ?? '';
  const list = await load();
  const cur = list.find(x => x.id === g.id);
  if (cur) {
    cur.last_check = new Date().toISOString();
    cur.last_progress = progress;
    const expired = !!cur.deadline && today() > cur.deadline;
    if (reached) cur.status = 'done';
    else if (expired) cur.status = 'expired';
    await save(list);
    if (notify) {
      if (reached) emitProactive(`🎉 Objectif atteint : ${g.objective}`, 'info', `🎉 Objectif atteint : « ${g.objective} »\n\n${progress}`, g.owner);
      else if (expired) emitProactive(`⌛ Objectif non atteint : ${g.objective}`, 'alert', `⌛ L'échéance de « ${g.objective} » est passée.\n\n${progress}\n\nDis-moi si on le prolonge (nouvelle date) ou si on l'abandonne.`, g.owner);
      else {
        emitProactive(`🎯 ${g.objective} : ${progress.slice(0, 120)}`, 'info', `🎯 Objectif « ${g.objective} »\n\n📊 ${progress}\n\n👉 À faire aujourd'hui :\n${actions}`, g.owner);
        // Échéance dans 2 jours ou moins et pas atteint → appel
        const daysLeft = g.deadline ? (new Date(g.deadline).getTime() - new Date(today()).getTime()) / 86_400_000 : 99;
        if (daysLeft <= 2 && oral && g.owner === 'kouider') await autoCall(`goal:${g.id}:${today()}`, `Objectif ${g.objective}. ${oral}`);
      }
    }
  }
  return `📊 ${progress}\n👉 ${actions}`;
}

/** Job chaque matin 9h (Bruxelles). */
export async function jobGoals(): Promise<void> {
  for (const g of (await load()).filter(x => x.status === 'active')) {
    try { await checkGoal(g); } catch (err) { console.error('[goals]', g.objective, err instanceof Error ? err.message : err); }
  }
}
