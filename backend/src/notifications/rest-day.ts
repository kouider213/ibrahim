import { kvGet, kvSet, kvDel } from '../integrations/app-store.js';

// « MODE REPOS » (Kouider 2026-10-21) : il dit « malade », « journée off », « je me repose aujourd'hui » →
// pour la journée : pas de sport (séance décalée, blocs enlevés de l'agenda), pas de réveil ni de routine du matin,
// pas d'appel de Dzaryx (gardés dans la boîte « j'ai des choses pour toi »). Les messages passent toujours.
// Module sans dépendance (voice-call et morning-routine le lisent) : pas d'import circulaire.

const key = (date: string) => `kouider:rest:${date}`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' });

/** Raison du jour de repos (« malade »…), sinon null. */
export async function restDayReason(date = today()): Promise<string | null> {
  return (await kvGet(key(date)).catch(() => null)) || null;
}

export async function setRestDay(date: string, reason: string | null): Promise<void> {
  if (reason) await kvSet(key(date), reason.slice(0, 60), 3 * 86_400);
  else await kvDel(key(date));
}
