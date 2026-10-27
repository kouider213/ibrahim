/**
 * LISTE DE NUIT (27/10/2026) — dans la journée : « fais ça cette nuit : compare les assurances auto en Algérie »,
 * « cette nuit trouve-moi 10 hôtels à Oran qui pourraient être partenaires ». À 2h, Dzaryx traite chaque tâche seul
 * (outils de lecture + web, qualité Sonnet) ; à 6h45 le résultat de la nuit arrive sur Telegram. Lecture seule : il
 * propose, il n'envoie rien. app_kv `nightlist`.
 */
import { kvJson, kvPut, tg, research, uid } from './ai-util.js';

interface NightTask { id: string; task: string; added: string; status: 'todo' | 'done' | 'error'; result?: string; doneAt?: string; reported?: boolean }
const KEY = 'nightlist';
const list = () => kvJson<NightTask[]>(KEY, []);

export async function nightListTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'add');
  const l = await list();
  if (action === 'add') {
    const task = String(input['task'] ?? '').trim();
    if (!task) return '❌ Quelle tâche pour cette nuit ?';
    l.push({ id: uid(), task: task.slice(0, 600), added: new Date().toISOString(), status: 'todo' });
    await kvPut(KEY, l.slice(-40));
    return `🌙 Noté pour cette nuit : « ${task} ». Je m'y mets vers 2h, le résultat t'attend au réveil sur Telegram. (${l.filter(t => t.status === 'todo').length} tâche(s) prévue(s))`;
  }
  if (action === 'remove') {
    const q = String(input['task'] ?? input['id'] ?? '').toLowerCase();
    const keep = l.filter(t => !(t.status === 'todo' && (t.id === q || (q && t.task.toLowerCase().includes(q)))));
    await kvPut(KEY, keep); return `🗑️ ${l.length - keep.length} tâche(s) retirée(s).`;
  }
  if (action === 'results') {
    const done = l.filter(t => t.status !== 'todo').slice(-5);
    return done.length ? done.map(t => `🌙 ${t.task}\n${t.result ?? ''}`).join('\n\n———\n\n') : 'Pas encore de résultat de nuit.';
  }
  const todo = l.filter(t => t.status === 'todo');
  return todo.length ? `🌙 Prévu cette nuit :\n${todo.map(t => `• ${t.task}`).join('\n')}` : 'Rien de prévu cette nuit. (« fais ça cette nuit : … »)';
}

/** 2h : traite les tâches. */
export async function jobNightListRun(): Promise<string> {
  const l = await list();
  const todo = l.filter(t => t.status === 'todo').slice(0, 6);
  for (const t of todo) {
    try {
      t.result = await research(`Kouider t'a confié cette tâche pour la nuit : « ${t.task} ».\nFais-la à fond avec tes outils (vraies données FIK et web). Rends un résultat concret, prêt à l'emploi : faits avec leur source, chiffres, liste, ou brouillon. 10 à 25 lignes, pas de tableau.`, { rounds: 8, sessionId: `nightlist_${t.id}` });
      t.status = 'done';
    } catch (err) { t.status = 'error'; t.result = `❌ ${err instanceof Error ? err.message : String(err)}`; }
    t.doneAt = new Date().toISOString();
    await kvPut(KEY, l);
  }
  return `${todo.length} tâche(s) faite(s)`;
}

/** 6h45 : ce qui a été fait cette nuit. */
export async function jobNightListReport(): Promise<string> {
  const l = await list();
  const fresh = l.filter(t => t.status !== 'todo' && !t.reported);
  if (!fresh.length) return 'rien';
  for (const t of fresh) {
    await tg(`🌙 Fait cette nuit — « ${t.task} »\n\n${t.result ?? ''}`);
    t.reported = true;
  }
  await kvPut(KEY, l.slice(-40));
  return `${fresh.length} résultat(s) envoyé(s)`;
}
