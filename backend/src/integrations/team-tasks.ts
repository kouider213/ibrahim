import { randomUUID } from 'crypto';
import { kvGet, kvSet } from './app-store.js';
import { emitProactive as realEmit } from '../notifications/mobile-push.js';

// TEAM_TASKS_DRY=1 (tests) : aucune notification envoyée
const emitProactive: typeof realEmit = (...a) => { if (process.env['TEAM_TASKS_DRY'] === '1') { console.log('[team-tasks] DRY notif →', a[3], a[0]); return; } realEmit(...a); };

// Tâches pour Houari avec suivi (idée reprise de Hermes Agent « kanban ») : « dis à Houari de préparer la Clio
// pour 10h demain ». Dzaryx lui envoie la tâche (notif app de Houari), la lui rappelle avant l'heure, lui
// redemande si rien n'est confirmé, et prévient Kouider quand c'est fait — ou si ce n'est pas fait à temps.
// Houari confirme en disant « c'est fait pour la Clio » (outil complete_task). Stockage : app_kv `team_tasks`.

export interface TeamTask {
  id: string;
  title: string;
  details?: string;
  assignee: 'houari' | 'kouider';
  created_by: 'kouider' | 'houari';
  due: string | null;          // ISO
  status: 'todo' | 'done' | 'cancelled';
  created_at: string;
  done_at?: string;
  note?: string;
  reminded?: string[];          // 'before' | 'due' | 'late'
}

const KEY = 'team_tasks';
const TZ = 'Europe/Brussels';
const NAME = { houari: 'Houari', kouider: 'Kouider' } as const;

async function load(): Promise<TeamTask[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as TeamTask[]; } catch { return []; }
}
async function save(list: TeamTask[]): Promise<void> {
  // on garde les tâches ouvertes + les 50 dernières terminées
  const open = list.filter(t => t.status === 'todo');
  const closed = list.filter(t => t.status !== 'todo').slice(-50);
  await kvSet(KEY, JSON.stringify([...open, ...closed]));
}
const actorOf = (sid?: string): 'kouider' | 'houari' => (sid?.toLowerCase().includes('houari') ? 'houari' : 'kouider');
const when = (iso: string) => new Date(iso).toLocaleString('fr-BE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function assignTaskTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const title = String(input['title'] ?? '').trim();
  if (!title) return '❌ Quelle tâche ?';
  const by = actorOf(sessionId);
  const assignee = (input['assignee'] === 'kouider' ? 'kouider' : input['assignee'] === 'houari' ? 'houari' : by === 'kouider' ? 'houari' : 'kouider') as 'houari' | 'kouider';
  const dueRaw = String(input['due'] ?? '').trim();
  const due = dueRaw && !Number.isNaN(Date.parse(dueRaw)) ? new Date(dueRaw).toISOString() : null;
  const t: TeamTask = { id: randomUUID().slice(0, 6), title, details: String(input['details'] ?? '').trim() || undefined,
    assignee, created_by: by, due, status: 'todo', created_at: new Date().toISOString(), reminded: [] };
  const list = await load();
  list.push(t);
  await save(list);
  emitProactive(`📋 Tâche de ${NAME[by]} : ${title}${due ? ` — pour ${when(due)}` : ''}`, 'reminder',
    `📋 ${NAME[by]} te demande :\n« ${title} »${t.details ? `\n${t.details}` : ''}${due ? `\n⏰ Pour ${when(due)}` : ''}\n\nQuand c'est fait, dis-moi « c'est fait pour ${title.split(' ').slice(0, 4).join(' ')} ».`,
    assignee);
  return `✅ Tâche envoyée à ${NAME[assignee]} : « ${title} »${due ? ` pour ${when(due)}` : ''}. Je la lui rappelle avant l'heure, et je te préviens quand c'est fait (ou si ce n'est pas confirmé à temps).`;
}

export async function listTeamTasksTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const me = actorOf(sessionId);
  const list = await load();
  const open = list.filter(t => t.status === 'todo' && (input['all'] === true || t.assignee === me || t.created_by === me))
    .sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const done = list.filter(t => t.status === 'done' && Date.now() - Date.parse(t.done_at ?? t.created_at) < 3 * 86_400_000);
  if (!open.length && !done.length) return 'Aucune tâche en cours.';
  return [
    open.length ? `📋 À FAIRE :\n${open.map(t => `• [${t.id}] ${NAME[t.assignee]} — ${t.title}${t.due ? ` (pour ${when(t.due)}${Date.parse(t.due) < Date.now() ? ', EN RETARD' : ''})` : ''}`).join('\n')}` : 'Rien à faire en attente.',
    done.length ? `✅ Fait récemment : ${done.map(t => `${t.title} (${NAME[t.assignee]})`).join(' · ')}` : '',
  ].filter(Boolean).join('\n\n');
}

export async function completeTaskTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const me = actorOf(sessionId);
  const q = norm(String(input['task'] ?? ''));
  const list = await load();
  const open = list.filter(t => t.status === 'todo');
  const words = q.split(/[^a-z0-9]+/).filter(w => w.length > 2);
  const scored = open.map(t => ({ t, s: t.id === q ? 99 : words.filter(w => norm(`${t.title} ${t.details ?? ''}`).includes(w)).length + (t.assignee === me ? 0.5 : 0) }))
    .filter(x => x.s >= 1).sort((a, b) => b.s - a.s);
  if (!scored.length) return `❌ Je ne trouve pas cette tâche. En cours : ${open.map(t => t.title).join(' · ') || 'aucune'}.`;
  if (scored.length > 1 && scored[0]!.s === scored[1]!.s) return `Laquelle ? ${scored.slice(0, 4).map(x => `« ${x.t.title} »`).join(', ')}`;
  const t = scored[0]!.t;
  const cancel = input['cancel'] === true;
  t.status = cancel ? 'cancelled' : 'done';
  t.done_at = new Date().toISOString();
  t.note = String(input['note'] ?? '').trim() || undefined;
  await save(list);
  const other = me === 'houari' ? 'kouider' : 'houari';
  if (!cancel && (t.created_by !== me || t.assignee !== me)) {
    emitProactive(`✅ ${NAME[me]} : fait — ${t.title}`, 'info', `✅ ${NAME[me]} a terminé : « ${t.title} »${t.note ? `\n📝 ${t.note}` : ''}`, t.created_by === me ? other : t.created_by);
  }
  return cancel ? `🗑️ Tâche annulée : « ${t.title} ».` : `✅ Noté, « ${t.title} » est fait. ${t.created_by !== me ? `Je préviens ${NAME[t.created_by]}.` : ''}`;
}

/** Tâches ouvertes de Houari, à glisser dans son contexte quand il parle à Dzaryx. */
export async function openTasksContext(actor: string): Promise<string> {
  if (actor !== 'houari') return '';
  const open = (await load()).filter(t => t.status === 'todo' && t.assignee === 'houari');
  if (!open.length) return '';
  return `TÂCHES DE HOUARI EN ATTENTE (rappelle-les-lui si c'est utile ; « c'est fait » → complete_task) :\n${open.map(t => `- ${t.title}${t.due ? ` (pour ${when(t.due)})` : ''}`).join('\n')}`;
}

/** Job toutes les 15 min : rappel 1 h avant, à l'heure, et alerte au créateur 1 h après si pas confirmé. */
export async function jobTeamTasks(): Promise<void> {
  const list = await load();
  const now = Date.now();
  let changed = false;
  for (const t of list.filter(x => x.status === 'todo' && x.due)) {
    const due = Date.parse(t.due!);
    const r = t.reminded ?? (t.reminded = []);
    const ping = (stage: string, to: 'houari' | 'kouider', short: string, long: string) => {
      if (r.includes(stage)) return;
      r.push(stage); changed = true;
      emitProactive(short, 'reminder', long, to);
    };
    if (now >= due - 60 * 60_000 && now < due) ping('before', t.assignee, `⏰ Dans moins d'1 h : ${t.title}`, `⏰ Rappel : « ${t.title} » est prévu pour ${when(t.due!)}.\nDis-moi « c'est fait » quand c'est bon.`);
    if (now >= due && now < due + 60 * 60_000) ping('due', t.assignee, `⏰ C'est l'heure : ${t.title}`, `⏰ C'est l'heure pour « ${t.title} ». C'est fait ?`);
    if (now >= due + 60 * 60_000) ping('late', t.created_by, `⚠️ ${NAME[t.assignee]} n'a pas confirmé : ${t.title}`,
      `⚠️ ${NAME[t.assignee]} n'a pas encore confirmé « ${t.title} » (prévu ${when(t.due!)}). Tu veux que je lui redemande ?`);
  }
  if (changed) await save(list);
}
