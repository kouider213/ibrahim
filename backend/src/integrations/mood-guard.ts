/**
 * HUMEUR VÉRIFIÉE (19/11, Kouider : « parfois il m'envoie "je sens que tu es stressé", comment il peut confirmer ça ? »).
 * L'humeur est DEVINÉE par une IA à partir de ses mots : ce n'est pas une mesure. Trois règles :
 *  1. On ne l'affirme jamais (pas de « ton stress est à 8/10 ») : on DEMANDE (« tu as l'air…, je me trompe ? »).
 *  2. On croise avec la montre (VFC, pouls au repos, sommeil du jour vs ses 14 derniers jours) : si la montre dit le
 *     contraire → on se tait. Pas de données montre ce jour-là → question seulement.
 *  3. Il répond « non ça va » → plus un mot sur son humeur jusqu'au lendemain.
 */
import { kvJson, kvPut } from './ai-util.js';
import { localNow } from './morning-routine.js';

interface HDay { date: string; sleep_h?: number; hrv?: number; rhr?: number }
export interface MoodGuess { at: number; stress: number; energy: number; why: string }

const DENIED = (d: string) => `mood:denied:${d}`;

/** « non ça va », « je suis pas stressé », « tout va bien », « t'inquiète » (réponse à une question sur son humeur). */
export const MOOD_DENY_RE = /(?<![a-zà-ÿ])(non\s*,?\s*(ça|ca|sa)\s+va(?!\s+(pas|mal|plus))|(ça|ca|sa)\s+va\s+(tr[eè]s\s+)?bien|tout\s+va\s+bien|je\s+(ne\s+)?suis\s+pas\s+(du\s+tout\s+)?(stress[ée]e?|tendu|fatigu[ée]|crev[ée]|[ée]nerv[ée])|pas\s+stress[ée]|t.inqui[eè]te?s?\s+pas|je\s+vais\s+bien)(?![a-zà-ÿ])/i;

export async function moodDeniedToday(): Promise<boolean> {
  return !!(await kvJson<number | null>(DENIED(localNow().date), null));
}
export async function denyMoodToday(): Promise<void> {
  await kvPut(DENIED(localNow().date), Date.now(), 36 * 3600);
}

/** La montre ce jour-là : 'tendu' (VFC basse / pouls haut / nuit courte), 'ok' (tout normal), null (pas de données). */
export async function watchSignal(): Promise<'tendu' | 'ok' | null> {
  const h = await kvJson<HDay[]>('health:daily', []);
  const today = localNow().date;
  const t = h.find(x => x.date === today);
  if (!t || (t.hrv == null && t.rhr == null && t.sleep_h == null)) return null;
  const past = h.filter(x => x.date < today).slice(-14);
  const avg = (k: 'hrv' | 'rhr') => { const v = past.map(x => x[k]).filter((n): n is number => typeof n === 'number' && n > 0); return v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const hAvg = avg('hrv'), rAvg = avg('rhr');
  const signs = [
    t.hrv != null && hAvg ? t.hrv < hAvg * 0.85 : null,
    t.rhr != null && rAvg ? t.rhr > rAvg + 4 : null,
    t.sleep_h != null ? t.sleep_h < 5.5 : null,
  ].filter((x): x is boolean => x !== null);
  if (!signs.length) return null;
  return signs.some(Boolean) ? 'tendu' : 'ok';
}

/**
 * Ce que Dzaryx a le droit d'en faire : 'ask' (le demander, sans chiffre), 'silent' (ne rien dire).
 * 'silent' si rien de marquant, s'il a déjà dit que ça va aujourd'hui, ou si la montre dit le contraire.
 */
export async function moodVerdict(m: MoodGuess | null, maxAgeMs = 3 * 3600_000): Promise<{ say: 'ask' | 'silent'; watch: 'tendu' | 'ok' | null; low: boolean }> {
  const low = !!m && Date.now() - m.at < maxAgeMs && (m.stress >= 7 || m.energy <= 3);
  if (!low) return { say: 'silent', watch: null, low: false };
  if (await moodDeniedToday()) return { say: 'silent', watch: null, low };
  const watch = await watchSignal().catch(() => null);
  return { say: watch === 'ok' ? 'silent' : 'ask', watch, low };
}

/** Ligne pour les cerveaux : jamais de chiffre, jamais affirmé ; vide si on doit se taire. */
export async function moodHintLine(m: MoodGuess | null, maxAgeMs = 3 * 3600_000): Promise<string> {
  const v = await moodVerdict(m, maxAgeMs);
  if (v.say === 'silent' || !m) return '';
  const what = m.stress >= 7 ? 'tendu' : 'fatigué';
  return `💭 SUPPOSITION (pas une mesure) : d'après ses mots, il a peut-être l'air ${what} (${m.why.slice(0, 80)})${v.watch === 'tendu' ? ' ; sa montre va dans le même sens' : ' ; montre sans données aujourd\'hui'}. `
    + `Ne l'affirme JAMAIS (pas de « je sens que tu es stressé », jamais de note sur 10) : sois bref et calme ; si c'est utile, DEMANDE-LE (« tu as l'air ${what}, je me trompe ? »). S'il dit que ça va → n'en reparle plus aujourd'hui.`;
}
