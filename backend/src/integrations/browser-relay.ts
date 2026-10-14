import { randomUUID } from 'crypto';
import { kvGet, kvSet } from './app-store.js';
import { emitProactive } from '../notifications/mobile-push.js';

// Navigateur sur le SERVEUR (idée reprise de Hermes Agent « bot screen ») : marche même PC éteint. Le service
// `browser-worker/` sur le VPS prend les tâches ici (/api/browser/next), pilote Chromium (même agent que Nexus :
// pause avant toute action irréversible, jamais de mot de passe ni de carte), et rend la main à Kouider quand il
// faut : question + capture d'écran envoyées sur son Telegram. Kouider répond par message (« continue »,
// « le code est 123456 », « clique sur Accepter ») → browser_reply → le navigateur reprend.
// Stockage : app_kv `browser:jobs`.

export type BrowserJobStatus = 'queued' | 'running' | 'waiting' | 'answered' | 'done' | 'error' | 'cancelled';
export interface BrowserJob {
  id: string;
  task: string;
  status: BrowserJobStatus;
  owner: 'kouider' | 'houari';
  question?: string;
  answer?: string;
  result?: string;
  created_at: string;
  updated_at: string;
}

const KEY = 'browser:jobs';
async function load(): Promise<BrowserJob[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as BrowserJob[]; } catch { return []; }
}
async function save(list: BrowserJob[]): Promise<void> { await kvSet(KEY, JSON.stringify(list.slice(-30))); }
const touch = (j: BrowserJob) => { j.updated_at = new Date().toISOString(); };

export async function browserTaskTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const task = String(input['task'] ?? '').trim();
  if (!task) return '❌ Quelle tâche dans le navigateur ?';
  const list = await load();
  if (list.some(j => ['queued', 'running', 'waiting', 'answered'].includes(j.status))) {
    return '⏳ Une tâche de navigateur est déjà en cours. Dis « état du navigateur », ou réponds à sa question.';
  }
  const now = new Date().toISOString();
  list.push({ id: randomUUID().slice(0, 8), task, status: 'queued', created_at: now, updated_at: now,
    owner: sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider' });
  await save(list);
  return `🌐 C'est parti sur le navigateur du serveur (marche même PC éteint) : « ${task} ». Tu peux regarder en direct : MON PC → PC cloud. Je te préviens du résultat ; s'il faut une connexion, un code ou ton accord, je t'envoie la capture d'écran sur Telegram et tu me réponds ici (ou tu le fais toi-même sur le PC cloud).`;
}

export async function browserReplyTool(input: Record<string, unknown>): Promise<string> {
  const answer = String(input['answer'] ?? '').trim();
  const list = await load();
  const j = [...list].reverse().find(x => x.status === 'waiting');
  if (!j) return 'Le navigateur n\'attend pas de réponse en ce moment.';
  if (/^(annule|arr[eê]te|stop)/i.test(answer)) { j.status = 'cancelled'; touch(j); await save(list); return '🛑 Tâche de navigateur annulée.'; }
  j.answer = answer; j.status = 'answered'; touch(j);
  await save(list);
  return `👍 Transmis au navigateur : « ${answer} ». Il reprend.`;
}

export async function browserStatusTool(): Promise<string> {
  const j = (await load()).at(-1);
  if (!j) return 'Aucune tâche de navigateur.';
  const label: Record<BrowserJobStatus, string> = { queued: 'en attente de démarrage', running: 'en cours', waiting: 'attend ta réponse',
    answered: 'reprend', done: 'terminée', error: 'en erreur', cancelled: 'annulée' };
  return `🌐 « ${j.task} » — ${label[j.status]}${j.question && j.status === 'waiting' ? `\nQuestion : ${j.question}` : ''}${j.result ? `\nRésultat : ${j.result.slice(0, 800)}` : ''}`;
}

/** Worker : prochaine tâche à lancer (queued) ou à reprendre (answered). */
export async function nextJobForWorker(): Promise<BrowserJob | null> {
  const list = await load();
  const j = list.find(x => x.status === 'answered') ?? list.find(x => x.status === 'queued');
  if (!j) return null;
  const was = j.status;
  j.status = 'running'; touch(j);
  await save(list);
  return { ...j, status: was };
}

/** Worker : mise à jour (question → attente de Kouider, ou résultat final). */
export async function updateJobFromWorker(id: string, upd: { status: 'waiting' | 'done' | 'error'; text: string }): Promise<boolean> {
  const list = await load();
  const j = list.find(x => x.id === id);
  if (!j || j.status === 'cancelled') return false;
  j.status = upd.status; touch(j);
  if (upd.status === 'waiting') {
    j.question = upd.text;
    emitProactive(`🌐 Le navigateur a besoin de toi`, 'alert',
      `🌐 Navigateur — « ${j.task} »\n\n${upd.text}\n\n(capture d'écran sur Telegram) Réponds-moi : « continue », « le code est … », « clique sur … » ou « annule ».\n` +
      'Ou fais-le toi-même : touche « Regarder » → MON PC → PC cloud (même navigateur), puis dis-moi « continue ».', j.owner, 'nexus-cloud');
  } else {
    j.result = upd.text;
    emitProactive(`🌐 ${upd.status === 'done' ? 'Terminé' : 'Erreur'} : ${j.task.slice(0, 60)}`, upd.status === 'done' ? 'info' : 'alert',
      `🌐 Navigateur — « ${j.task} »\n\n${upd.text}`, j.owner, 'nexus-cloud');
  }
  await save(list);
  return true;
}

/** Tâche bloquée (worker arrêté pendant « running » > 20 min) → erreur, pour libérer la file. */
export async function jobBrowserWatch(): Promise<void> {
  const list = await load();
  let changed = false;
  for (const j of list) {
    if (j.status === 'running' && Date.now() - Date.parse(j.updated_at) > 20 * 60_000) {
      j.status = 'error'; j.result = 'Le navigateur du serveur ne répond plus (service arrêté ?).'; touch(j); changed = true;
      emitProactive('🌐 Navigateur bloqué', 'alert', `🌐 « ${j.task} » : le navigateur du serveur ne répond plus. Réessaie plus tard.`, j.owner);
    }
    if (j.status === 'waiting' && Date.now() - Date.parse(j.updated_at) > 24 * 3_600_000) { j.status = 'cancelled'; touch(j); changed = true; }
  }
  if (changed) await save(list);
}
