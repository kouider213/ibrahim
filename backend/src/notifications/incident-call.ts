// Anomalie / bug / panne → message Telegram + alerte dans l'app. Plus d'APPEL pour un bug (Kouider 24/10 : l'appel
// « mentor-news a planté » de 8h l'a mis en « ne pas déranger » toute la matinée ; ses bugs ne sont pas à lui de gérer).
// Garde-fous : un même incident n'appelle qu'une fois toutes les REPEAT_H heures, et pas plus de DAILY_MAX appels
// d'incident par jour (au-delà : alerte écrite seulement). Si la base ne répond pas, on se rabat sur la mémoire du process.
import { kvGet, kvSet } from '../integrations/app-store.js';
import { queueTelegramMessage } from './tg-outbox.js';
import { emitProactive } from './mobile-push.js';

const REPEAT_H  = 3;
const DAILY_MAX = 6;
const seenLocal = new Map<string, number>();
let   dayLocal  = { day: '', count: 0 };

const today = () => new Date().toISOString().slice(0, 10);

/** Clé stable d'une erreur : sans chiffres ni identifiants, pour qu'une même panne qui se répète compte pour une. */
export function incidentKey(text: string): string {
  return text.split('\n')[0]!.replace(/[0-9a-f]{8,}|\d+/gi, '#').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** 'call' = appeler ; 'alert' = alerte écrite seulement (plafond du jour atteint) ; 'dup' = déjà signalé récemment. */
async function decide(key: string): Promise<'call' | 'alert' | 'dup'> {
  const seenKey = `incident:seen:${key}`;
  const dayKey  = `incident:calls:${today()}`;
  try {
    if (await kvGet(seenKey)) return 'dup';
    const count = Number(await kvGet(dayKey) ?? 0);
    await kvSet(seenKey, '1', REPEAT_H * 3600);
    if (count >= DAILY_MAX) return 'alert';
    await kvSet(dayKey, String(count + 1), 26 * 3600);
    return 'call';
  } catch {
    const last = seenLocal.get(key) ?? 0;
    if (Date.now() - last < REPEAT_H * 3600_000) return 'dup';
    seenLocal.set(key, Date.now());
    if (dayLocal.day !== today()) dayLocal = { day: today(), count: 0 };
    return ++dayLocal.count <= DAILY_MAX ? 'call' : 'alert';
  }
}

/**
 * Signale un problème à Kouider : alerte écrite + appel immédiat (rien si déjà signalé ; plafond du jour → écrit seulement).
 * @param spoken ce que Dzaryx dit en décrochant (court, en français parlé)
 * @param detail texte complet pour l'alerte écrite (erreur technique, quoi faire…) ; null = alerte déjà envoyée par l'appelant
 */
export async function reportIncident(key: string, spoken: string, detail?: string | null): Promise<void> {
  try {
    const what = await decide(incidentKey(key));
    if (what === 'dup') return;
    if (detail !== null) emitProactive(`🚨 ${spoken}`.slice(0, 140), 'alert', `🚨 PROBLÈME DÉTECTÉ\n${detail ?? spoken}`, 'kouider');
    if (what === 'call') {
      await queueTelegramMessage(`🛠 ${spoken} (Pas besoin de répondre : les détails sont dans l'app.)`);
      console.log(`[incident] message envoyé : ${key.slice(0, 80)}`);
    }
  } catch (err) {
    // Jamais de throw ici : appelé depuis les gardes-fous globaux (uncaughtException…)
    console.error('[incident] signalement impossible:', err instanceof Error ? err.message : err);
  }
}
