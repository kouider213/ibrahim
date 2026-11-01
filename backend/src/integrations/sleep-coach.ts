// Coach sommeil (01/11, demande de Kouider) : la nuit de l'Apple Watch sert PARTOUT (coachs, business, Dzaryx),
// et chaque semaine, si ça ne s'améliore pas, Dzaryx change un levier de plus (échelle) — et le dit.
// Données : health:daily[].sleep_h (raccourci « Dzaryx Santé » à l'arrêt de l'alarme, ou « j'ai dormi 7h »).
import { kvJson, kvPut, tg } from './ai-util.js';
import { localNow } from './morning-routine.js';

const GOAL = 7.5;                         // objectif de nuit (h)
const PLAN_K = 'sleep:plan';

interface Night { date: string; sleep_h?: number }
interface Plan { level: number; since: string; startAvg: number | null; log: Array<{ date: string; level: number; avg: number | null; why: string }> }

/** L'échelle : chaque semaine sans progrès = un levier de plus (on garde les précédents). */
export const LEVERS: Array<{ title: string; rule: string; bedShift: number }> = [
  { title: 'Base', rule: 'objectif 7 h 30, coucher calé sur le réveil du lendemain', bedShift: 0 },
  { title: 'Coucher avancé de 30 min', rule: 'il se couche 30 min plus tôt que d\'habitude', bedShift: 30 },
  { title: 'Écrans + café', rule: 'téléphone posé 45 min avant le coucher, plus de café/thé/boisson énergisante après 14h', bedShift: 30 },
  { title: 'Sport plus tôt', rule: 'pas de séance intense après 19h (séance du soir = légère ou déplacée au matin)', bedShift: 30 },
  { title: 'Business coupé le soir', rule: 'plus aucun sujet business non urgent après 20h30 : Dzaryx garde tout pour le lendemain matin, gros dossiers et appels importants le matin seulement', bedShift: 45 },
  { title: 'Plan fort', rule: 'coucher avancé d\'1 h, sieste de 20 min max les jours off avant 15h ; si toujours sous 6 h de moyenne : en parler à son médecin', bedShift: 60 },
];

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
const fmt = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

export async function getPlan(): Promise<Plan> {
  return kvJson<Plan>(PLAN_K, { level: 0, since: localNow().date, startAvg: null, log: [] });
}

/** Les chiffres de la semaine : dernière nuit, moyenne 7 j / 7 j d'avant, dette, nuits courtes. */
export async function sleepStats(date = localNow().date): Promise<{ last: number | null; avg7: number | null; prev7: number | null; nights: number; debt: number; short: number; trend: 'mieux' | 'pire' | 'stable' | null }> {
  const all = (await kvJson<Night[]>('health:daily', [])).filter(x => (x.sleep_h ?? 0) > 2);
  const inRange = (from: number, to: number) => all.filter(x => x.date > addDays(date, -from) && x.date <= addDays(date, -to)).map(x => x.sleep_h!);
  const w = inRange(7, 0), p = inRange(14, 7);
  const a7 = avg(w), p7 = avg(p);
  return {
    last: all.find(x => x.date === date)?.sleep_h ?? null,
    avg7: a7, prev7: p7, nights: w.length,
    debt: Math.round(w.reduce((s, h) => s + Math.max(0, GOAL - h), 0) * 10) / 10,
    short: w.filter(h => h < 6).length,
    trend: a7 != null && p7 != null ? (a7 - p7 >= 0.3 ? 'mieux' : p7 - a7 >= 0.3 ? 'pire' : 'stable') : null,
  };
}

/** Minutes d'avance sur le coucher : levier en cours + rattrapage de la dette (max 30 min). */
export async function bedtimeAdvance(): Promise<{ minutes: number; why: string }> {
  const [plan, s] = await Promise.all([getPlan(), sleepStats()]);
  const lever = LEVERS[Math.min(plan.level, LEVERS.length - 1)]!;
  const debtMin = s.debt >= 3 ? 30 : s.debt >= 1.5 ? 15 : 0;
  const minutes = Math.max(lever.bedShift, debtMin);
  const why = [lever.bedShift ? `plan sommeil « ${lever.title} »` : '', debtMin ? `dette de ${fmt(s.debt)} cette semaine` : ''].filter(Boolean).join(' + ');
  return { minutes, why };
}

/** Une ligne pour TOUS les cerveaux (conversation, coachs, mentor) : la nuit + ce que ça change aujourd'hui. */
export async function sleepContextLine(): Promise<string> {
  const [s, plan] = await Promise.all([sleepStats(), getPlan()]);
  if (s.last == null && s.avg7 == null) return '';
  const lever = LEVERS[Math.min(plan.level, LEVERS.length - 1)]!;
  const tired = (s.last != null && s.last < 6) || s.debt >= 4 || s.short >= 3;
  const parts = [
    `😴 Sommeil : ${s.last != null ? `nuit ${fmt(s.last)}` : 'nuit pas reçue'}${s.avg7 != null ? ` · moyenne 7 j ${fmt(s.avg7)} (${s.nights} nuits)` : ''}${s.debt ? ` · dette ${fmt(s.debt)}` : ''}${s.trend ? ` · ${s.trend}` : ''}`,
    plan.level ? `plan sommeil niveau ${plan.level} « ${lever.title} » : ${lever.rule}` : '',
    tired
      ? 'FATIGUÉ → aujourd\'hui : décisions importantes, négociations et papiers LE MATIN, rien de lourd après 15h, sport allégé, patience (plus irritable, plus de faim/sucre) ; propose de prendre des tâches à ta charge'
      : s.last != null && s.last >= 7 ? 'bien reposé → bon jour pour les tâches difficiles et les gros appels' : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Bilan chaque dimanche (et à la demande) : progrès → on garde ; sinon → un levier de plus, annoncé. */
export async function weeklySleepReview(force = false): Promise<string> {
  const { date, weekday } = localNow();
  const plan = await getPlan();
  if (!force && weekday !== 0) return 'pas dimanche';
  if (!force && plan.log.at(-1)?.date === date) return 'déjà fait';
  const s = await sleepStats(date);
  if (s.nights < 4) return `pas assez de nuits (${s.nights}/7) — le raccourci doit envoyer chaque matin`;
  const daysOnLevel = Math.round((Date.parse(date) - Date.parse(plan.since)) / 86_400_000);
  const ok = s.avg7! >= GOAL - 0.3 && s.short <= 1;
  const better = plan.startAvg != null && s.avg7! - plan.startAvg >= 0.4;
  let why: string, msg: string;
  if (ok) {
    why = 'objectif atteint';
    if (plan.level > 0 && s.avg7! >= GOAL) { plan.level -= 1; why += ' → on relâche un levier'; }
    msg = `Moyenne ${fmt(s.avg7!)} sur 7 nuits, ${s.short} nuit courte. Objectif tenu 💪${plan.level < (plan.log.at(-1)?.level ?? 0) ? ` On relâche un cran : niveau ${plan.level}.` : ' On garde exactement ce qui marche.'}`;
  } else if (better || daysOnLevel < 6) {
    why = better ? 'en progrès' : 'levier trop récent';
    msg = `Moyenne ${fmt(s.avg7!)} (${plan.startAvg != null ? `${s.avg7! >= plan.startAvg ? '+' : ''}${Math.round((s.avg7! - plan.startAvg) * 60)} min depuis le dernier changement` : 'première semaine'}). ${better ? 'Ça progresse : on garde le plan une semaine de plus.' : 'On laisse le plan agir encore un peu.'}`;
  } else if (plan.level < LEVERS.length - 1) {
    plan.level += 1;
    const l = LEVERS[plan.level]!;
    why = `pas de progrès → niveau ${plan.level}`;
    msg = `Moyenne ${fmt(s.avg7!)}, dette ${fmt(s.debt)}, ${s.short} nuit(s) sous 6 h : pas mieux qu'avant. Je change un truc à partir de ce soir 👉 « ${l.title} » : ${l.rule}.${l.bedShift ? ` Ton heure de coucher conseillée avance de ${l.bedShift} min.` : ''} Bilan dimanche prochain.`;
  } else {
    why = 'échelle au max sans progrès';
    msg = `Moyenne ${fmt(s.avg7!)} malgré tout le plan. Là, il faut en parler à ton médecin (sommeil + traitement Liberté en cours). Je garde le plan fort en attendant.`;
  }
  if (plan.level !== (plan.log.at(-1)?.level ?? 0) || plan.startAvg == null) { plan.since = date; plan.startAvg = s.avg7; }
  plan.log.push({ date, level: plan.level, avg: s.avg7, why });
  plan.log = plan.log.slice(-30);
  await kvPut(PLAN_K, plan);
  const text = `😴 Bilan sommeil de la semaine\n${msg}`;
  if (!force) await tg(text).catch(() => {});
  return text;
}

/** Outil « sommeil » : état, semaine, bilan forcé, reset. */
export async function sleepTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'etat');
  if (action === 'bilan') return weeklySleepReview(true);
  if (action === 'reset') { await kvPut(PLAN_K, { level: 0, since: localNow().date, startAvg: null, log: [] }); return 'Plan sommeil remis à zéro (niveau 0).'; }
  const [plan, adv] = await Promise.all([getPlan(), bedtimeAdvance()]);
  const nights = (await kvJson<Night[]>('health:daily', [])).filter(x => (x.sleep_h ?? 0) > 2).slice(-7).map(x => `${x.date.slice(8)}/${x.date.slice(5, 7)} ${fmt(x.sleep_h!)}`).join(' · ');
  return [
    await sleepContextLine() || 'Pas encore de nuit reçue.',
    nights ? `Nuits : ${nights}` : '',
    `Plan : niveau ${plan.level}/${LEVERS.length - 1} « ${LEVERS[plan.level]!.title} » depuis le ${plan.since}${adv.minutes ? ` · coucher avancé de ${adv.minutes} min (${adv.why})` : ''}.`,
    `Échelle : ${LEVERS.slice(1).map((l, i) => `${i + 1}. ${l.title}`).join(' → ')}. Bilan chaque dimanche 20h : pas de progrès = un levier de plus.`,
  ].filter(Boolean).join('\n');
}
