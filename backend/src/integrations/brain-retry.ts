// QUESTION GARDÉE quand tous les cerveaux gratuits sont saturés (05/11/2026, banc « comme Kouider ») : avant, Dzaryx répondait
// « ⚠️ Service temporairement indisponible. Réessaie dans quelques secondes. » et la question était perdue. Maintenant elle
// est gardée, rejouée toutes les 5 min (6 essais, 6 h max) et la réponse part sur Telegram dès qu'un cerveau revient.
// Jamais rejouée si un outil qui ÉCRIT a déjà tourné à ce tour (pas de résa / mail en double).
import { kvGet, kvSet } from './app-store.js';

const KEY = 'brain:retry-queue';
interface Q { sessionId: string; message: string; at: number; tries: number; waitBig?: boolean }
const READ_ONLY = /^(list|get|check|read|search|recall|show|find|fetch|watch|web_search|gold_watch|demain|esprit|travel)/;

async function readQ(): Promise<Q[]> { try { return JSON.parse((await kvGet(KEY)) ?? '[]') as Q[]; } catch { return []; } }

// ── Questions EN COURS quand le serveur s'arrête (redéploiement) ─────────────────────────────────────────────
const INFLIGHT = new Map<string, { sessionId: string; message: string; at: number }>();
let hooked = false;
export function inflightStart(sessionId: string, message: string): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  INFLIGHT.set(id, { sessionId, message: message.slice(0, 2000), at: Date.now() });
  if (!hooked) { hooked = true; void import('../queue/queue.js').then(m => m.shutdownHooks.push(saveInflight)).catch(() => {}); }
  return id;
}
export function inflightEnd(id: string): void { INFLIGHT.delete(id); }
/** Appelé au SIGTERM : chaque question encore sans réponse (et sans outil qui ÉCRIT déjà lancé) → file de rejeu. */
export async function saveInflight(): Promise<void> {
  if (!INFLIGHT.size) return;
  const { redis } = await import('../queue/queue.js');
  const q = (await readQ()).filter(x => Date.now() - x.at < 6 * 3600_000);
  for (const it of INFLIGHT.values()) {
    if (Date.now() - it.at < 1500) continue;   // arrivée pendant l'arrêt : le client renverra
    const hist = await redis.lrange(`action:history:${it.sessionId}`, 0, 30).catch(() => [] as string[]);
    const wrote = hist.some(h => { try { const x = JSON.parse(h) as { toolName: string; success: boolean; timestamp: number }; return x.timestamp >= it.at && x.success && !READ_ONLY.test(x.toolName); } catch { return false; } });
    if (wrote) continue;                          // déjà agi (cash, résa…) : jamais rejoué → pas de doublon
    if (!q.some(x => x.sessionId === it.sessionId && x.message === it.message)) q.push({ sessionId: it.sessionId, message: it.message, at: it.at, tries: 0 });
  }
  await kvSet(KEY, JSON.stringify(q.slice(-10))).catch(() => {});
  console.log(`[brain-retry] arrêt du serveur : ${INFLIGHT.size} question(s) en cours gardée(s) pour après le redémarrage`);
}

/** Appelé quand plus aucun cerveau ne répond. Renvoie le texte à donner à Kouider tout de suite. */
export async function keepForLater(sessionId: string, message: string, since: number): Promise<string> {
  const { redis } = await import('../queue/queue.js');
  const hist = await redis.lrange(`action:history:${sessionId}`, 0, 30).catch(() => [] as string[]);
  const wrote = hist.map(h => { try { return JSON.parse(h) as { toolName: string; success: boolean; timestamp: number }; } catch { return null; } })
    .filter((x): x is { toolName: string; success: boolean; timestamp: number } => !!x && x.timestamp >= since && x.success && !READ_ONLY.test(x.toolName));
  if (wrote.length) {
    return `⚠️ Mes cerveaux gratuits sont saturés à l'instant. J'ai quand même fait : ${[...new Set(wrote.map(w => w.toolName))].join(', ')}. Vérifie dans l'app ou redemande-moi dans quelques minutes pour la suite.`;
  }
  const q = (await readQ()).filter(x => Date.now() - x.at < 6 * 3600_000);
  if (!q.some(x => x.sessionId === sessionId && x.message === message.slice(0, 2000))) q.push({ sessionId, message: message.slice(0, 2000), at: Date.now(), tries: 0 });   // rejouée par le job : on garde son compteur d'essais
  await kvSet(KEY, JSON.stringify(q.slice(-10)));
  return '⏳ Mes cerveaux gratuits sont saturés là, mais j\'ai gardé ta question : je te réponds ici sur Telegram dès qu\'un cerveau revient (en général moins de 15 min). Pas besoin de la renvoyer.';
}

/** 07/11 (Kouider « oui ») : question IMPORTANTE, gros Gemini épuisés ET plus de place Claude → on ne laisse pas les petits
 *  cerveaux inventer. Gardée jusqu'au retour d'un gros Gemini (quota remis vers 9h), 18 h max, puis réponse sur Telegram. */
export async function keepImportant(sessionId: string, message: string, since: number): Promise<string> {
  const { redis } = await import('../queue/queue.js');
  const hist = await redis.lrange(`action:history:${sessionId}`, 0, 30).catch(() => [] as string[]);
  const wrote = hist.some(h => { try { const x = JSON.parse(h) as { toolName: string; success: boolean; timestamp: number }; return x.timestamp >= since && x.success && !READ_ONLY.test(x.toolName); } catch { return false; } });
  if (wrote) return keepForLater(sessionId, message, since);
  const q = (await readQ()).filter(x => Date.now() - x.at < (x.waitBig ? 18 : 6) * 3600_000);
  const msg = message.slice(0, 2000);
  if (!q.some(x => x.sessionId === sessionId && x.message === msg)) q.push({ sessionId, message: msg, at: Date.now(), tries: 0, waitBig: true });
  await kvSet(KEY, JSON.stringify(q.slice(-10)));
  console.warn(`[brain-retry] question importante gardée : gros Gemini épuisés + plus de place Claude → pas de réponse devinée session=${sessionId}`);
  return '⏳ Mes gros cerveaux gratuits sont saturés là, et je ne veux pas te répondre au hasard sur une question importante. Je l\'ai gardée : je te réponds ici sur Telegram dès que le bon cerveau revient. Pas besoin de la renvoyer.';
}

/** Job toutes les 5 min : rejoue la plus ancienne question gardée. */
export async function jobBrainRetry(): Promise<string> {
  const q = (await readQ()).filter(x => Date.now() - x.at < (x.waitBig ? 18 : 6) * 3600_000 && x.tries < 6);
  if (!q.length) { await kvSet(KEY, '[]').catch(() => {}); return 'rien'; }
  const item = q[0]!;
  // question importante : rejouée seulement quand un gros Gemini est revenu (sinon les petits cerveaux réinventeraient)
  if (item.waitBig && !(await import('./agentic-fallback.js')).bigGeminiAvailable()) { await kvSet(KEY, JSON.stringify(q)); return 'attend un gros Gemini'; }
  item.tries++;
  await kvSet(KEY, JSON.stringify(q));
  const { processWithOrchestration } = await import('../orchestrator/orchestrator-engine.js');
  const r = await processWithOrchestration(item.message, item.sessionId, true).catch(() => null);
  const text = String(r?.text ?? '');
  if (!text || /cerveaux gratuits sont saturés|Service temporairement indisponible/.test(text)) return `toujours saturé (essai ${item.tries})`;
  await kvSet(KEY, JSON.stringify((await readQ()).filter(x => !(x.at === item.at && x.sessionId === item.sessionId))));
  const { queueTelegramMessage } = await import('../notifications/tg-outbox.js');
  const hh = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }).format(new Date(item.at));
  await queueTelegramMessage(`↩️ Ta question de ${hh} : « ${item.message.replace(/^\s*\[[\s\S]*?\]\s*/, '').slice(0, 140)} »\n\n${text}`, undefined, 'kouider', undefined, true);
  return 'répondu';
}
