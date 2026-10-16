import { randomUUID } from 'crypto';
import { kvGet, kvSet } from './app-store.js';
import { runReadOnlyAgent } from './readonly-agent.js';
import { generateMentorIdea, keepMentorIdea, ideaText } from './business-mentor.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';

// ORDRES AVEC RAPPEL (Kouider 2026-10-16 : « rappelle-moi dans une heure avec un nouveau business plan ») :
// avant, call_me programmait seulement l'appel → à l'heure dite Dzaryx appelait les mains vides.
// Maintenant call_me + task : le travail démarre TOUT DE SUITE en arrière-plan, le résultat écrit part sur Telegram,
// et à l'heure du rappel Dzaryx dit ce qu'il a préparé. Si Railway a redémarré entre-temps, le travail est refait
// juste avant d'appeler (rien n'est perdu). Stockage : app_kv `calltask:<id>`.

export const CALL_TASK_RE = /^\[TÂCHE:([0-9a-f-]{36})\]\s*/;
const KEY = (id: string) => `calltask:${id}`;
const BUSINESS = /business|plan d.action|business plan|idée|offre|opportunit|stratégi|analyse de march|march[ée]|démarchage|nouveau projet|lancer/i;

interface CallTask { task: string; status: 'running' | 'done' | 'failed'; started: string; spoken?: string; text?: string }

async function load(id: string): Promise<CallTask | null> {
  try { return JSON.parse((await kvGet(KEY(id))) ?? 'null') as CallTask | null; } catch { return null; }
}
const save = (id: string, t: CallTask) => kvSet(KEY(id), JSON.stringify(t));

async function work(task: string): Promise<{ spoken: string; text: string }> {
  if (BUSINESS.test(task)) {
    const idea = await generateMentorIdea(task);
    if (idea) {
      await keepMentorIdea(idea);
      return { spoken: idea.spoken, text: ideaText(idea) };
    }
  }
  const run = await runReadOnlyAgent(
    `Kouider t'a donné cet ordre, à préparer pour quand tu le rappelles : « ${task} ».\n`
    + 'Fais VRAIMENT le travail (recherche web, ses chiffres, ses clients, son agenda…), concret et utilisable tout de suite. '
    + 'Termine par une ligne qui commence par « À DIRE : » avec 2 à 3 phrases à lui dire au téléphone (l\'essentiel + la question pour avancer).',
    { quality: true, maxRounds: 10, maxTokens: 2500, sessionId: 'call_task' });
  const m = run.text.match(/À DIRE\s*:\s*([\s\S]+)$/i);
  return { spoken: (m?.[1] ?? run.text).replace(/[*#_`]/g, '').trim().slice(0, 500), text: run.text.replace(/À DIRE\s*:[\s\S]+$/i, '').trim() };
}

async function runTask(id: string, t: CallTask): Promise<CallTask> {
  try {
    const r = await work(t.task);
    const done: CallTask = { ...t, status: 'done', spoken: r.spoken, text: r.text };
    await save(id, done);
    const msg = `📋 Ce que tu m'as demandé (« ${t.task.slice(0, 120)} ») :\n\n${r.text}`.slice(0, 3900);
    await queueTelegramMessage(msg).catch(() => {});
    emitProactive(`Prêt : ${t.task.slice(0, 80)}`, 'info', msg);
    return done;
  } catch (err) {
    console.error('[call-task]', err instanceof Error ? err.message : String(err));
    const failed: CallTask = { ...t, status: 'failed' };
    await save(id, failed).catch(() => {});
    return failed;
  }
}

/** Démarre le travail maintenant (arrière-plan) → id à mettre dans le message du rappel. */
export async function startCallTask(task: string): Promise<string> {
  const id = randomUUID();
  const t: CallTask = { task: task.trim().slice(0, 1500), status: 'running', started: new Date().toISOString() };
  await save(id, t);
  void runTask(id, t);
  return id;
}

/** Au moment d'appeler : « [TÂCHE:id] motif » → motif + ce qui a été préparé (attend / refait le travail si besoin). */
export async function callTaskReason(message: string): Promise<string> {
  const m = message.match(CALL_TASK_RE);
  if (!m) return message;
  const reason = message.slice(m[0].length).trim();
  let t = await load(m[1]);
  if (!t) return reason;
  const fresh = Date.now() - Date.parse(t.started) < 15 * 60_000;
  for (let i = 0; t?.status === 'running' && fresh && i < 24; i++) {   // encore en cours : jusqu'à 4 min
    await new Promise(r => setTimeout(r, 10_000));
    t = await load(m[1]);
  }
  if (t && t.status !== 'done') t = await runTask(m[1], { ...t, status: 'running', started: new Date().toISOString() });   // perdu (redémarrage) ou échoué → on refait
  if (t?.status === 'done' && t.spoken) return `${reason} ${t.spoken} Le détail complet est sur Telegram.`;
  return `${reason} Je n'ai pas réussi à finir ce travail, je te l'envoie dès que c'est prêt.`;
}
