// 07/11 (journée d'erreurs) : la clé Gemini gratuite = 20 requêtes/jour/modèle. Les tâches automatiques (Conscience, coach,
// mentor, rappels…) mangeaient ce quota avant les messages de Kouider → toute la journée sur des petits cerveaux.
// Une tâche du planificateur est marquée ici : elle passe par les autres cerveaux gratuits d'abord, gros Gemini en dernier.
import { AsyncLocalStorage } from 'async_hooks';

const bg = new AsyncLocalStorage<string>();
/** Tâches qui rejouent un message de Kouider lui-même → gardent le gros cerveau. */
const FOR_KOUIDER = new Set(['brain-retry']);

export const runInBackground = <T>(job: string, fn: () => Promise<T>): Promise<T> => (FOR_KOUIDER.has(job) ? fn() : bg.run(job, fn));
export const backgroundJob = (): string | undefined => bg.getStore();
