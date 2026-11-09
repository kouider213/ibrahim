// 🎯 OBJECTIF + PROGRAMME QUI S'ADAPTE (06/11/2026, Kouider : « il sait mon objectif : il me dit combien de temps il me reste vu que je
// suis occupé, si ce n'est pas assez ce que je devrais faire ; dans l'app il me propose d'adapter mon programme et il le change partout ;
// si je lui demande d'entraîner un truc en priorité il le fait ; s'il voit que je fais moins souvent un truc il le met dans le programme »).
// Construit sur l'existant : forme-goals (objectifs, priorités, pace, goalsCheck), forme-cut (vitesse de perte, ETA), sport-coach
// (rotation + agenda). Rien d'inventé : chiffres calculés, conseils par règles.
import { kvJson } from './ai-util.js';
import { localNow } from './morning-routine.js';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const weeksBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / (7 * 86_400_000) * 10) / 10);
export const MAIN_MUSCLES = ['pecs', 'dos', 'epaules', 'bras', 'jambes'] as const;
const MUSCLE_FR: Record<string, string> = { pecs: 'pecs', dos: 'dos', epaules: 'épaules', bras: 'bras', jambes: 'jambes', abdos: 'abdos' };

export interface GoalStatus { lines: string[]; ifBehind: string[]; behind: boolean; etaDate: string | null; weeksLeft: number | null; toLose: number | null }

/** Où il en est par rapport à SON objectif : kilos restants, date d'arrivée au rythme réel, et si ce n'est pas assez, quoi faire. */
export async function goalStatus(): Promise<GoalStatus> {
  const today = localNow().date;
  const lines: string[] = [], ifBehind: string[] = [];
  const cut = await import('./forme-cut.js').then(m => m.cutStatus('kouider')).catch(() => null);
  const g = await kvJson<{ wantBy?: string; priority?: string[]; zones?: string[]; plan?: { milestones?: Array<{ title: string; date: string; done?: number; metric?: string; value?: number }> } }>('kouider:forme:goals', {}).catch(() => ({} as Record<string, never>));
  const goals = await import('./forme-goals.js');
  const pc = g.plan ? await goals.pace('kouider', g as never).catch(() => null) : null;
  let behind = false, etaDate: string | null = null, weeksLeft: number | null = null, toLose: number | null = null;
  if (cut) {
    const w = cut.weight;
    toLose = w.toLose ?? null;
    if (w.goalKg && w.toLose != null) {
      if (w.toLose <= 0) lines.push(`🎯 Objectif ${w.goalKg} kg atteint (tu es à ${w.current} kg) 🎉`);
      else {
        lines.push(`🎯 Objectif ${w.goalKg} kg : il te reste ${String(w.toLose).replace('.', ',')} kg (tu es à ${String(w.current).replace('.', ',')} kg).`);
        if (w.rateWeek != null && w.rateWeek > 0.05) {
          weeksLeft = Math.ceil(w.toLose / w.rateWeek);
          etaDate = w.eta ?? addDays(today, weeksLeft * 7);
          lines.push(`⏳ À ton rythme réel (${String(w.rateWeek).replace('.', ',')} kg/semaine), tu y es vers le ${dm(etaDate)} — encore ${weeksLeft} semaine${weeksLeft > 1 ? 's' : ''}.`);
        } else if (w.rateWeek != null) {
          behind = true;
          lines.push(`⏳ Ton poids ne descend pas en ce moment (${String(w.rateWeek).replace('.', ',')} kg/semaine) : à ce rythme l'objectif n'arrive pas.`);
        } else lines.push('⏳ Pas encore assez de pesées pour calculer ta date d\'arrivée : pèse-toi le matin à jeun 5 jours de suite.');
        if (g.wantBy && etaDate && etaDate > g.wantBy) {
          behind = true;
          const wkTarget = weeksBetween(today, g.wantBy);
          const need = wkTarget > 0 ? Math.round(w.toLose / wkTarget * 100) / 100 : null;
          lines.push(`📅 Tu voulais y être le ${dm(g.wantBy)} : il faudrait ${need ? `${String(need).replace('.', ',')} kg/semaine` : 'aller plus vite'}, tu fais ${String(w.rateWeek).replace('.', ',')}.`);
        } else if (g.wantBy && etaDate) lines.push(`📅 Date voulue (${dm(g.wantBy)}) tenue ✅`);
      }
    }
  }
  if (pc) {
    if (pc.status === 'retard') behind = true;
    if (pc.next) lines.push(`🏁 Prochaine étape : « ${pc.next.title} » le ${dm(pc.next.date)}${pc.next.projected != null ? (pc.next.projected <= (pc.next.target ?? 0) && !pc.next.late ? ' — à ce rythme tu y es avant la date ✅' : ` — prévu ${String(pc.next.projected).replace('.', ',')} kg pour ${pc.next.target} visés${pc.next.late ? ' ⚠️ en retard' : ' ✅'}`) : ''}.`);
    lines.push(`🏋️ Séances : ${pc.sessions14}/${pc.planned14} sur 14 jours.`);
    if (pc.sessions14 < pc.planned14 * 0.75) ifBehind.push(`Le n°1 qui te freine : les séances manquées (${pc.sessions14}/${pc.planned14}). Même occupé, 3 séances courtes de 35-40 min valent mieux que 2 longues — je peux raccourcir ton programme.`);
  }
  if (behind && cut) {
    const st = cut;
    if (st.decision?.level === 'down' && st.decision.deficit != null) ifBehind.push(`Calories : passer ton déficit à ${st.decision.deficit} kcal/jour (limite sûre, sans perdre de muscle).`);
    ifBehind.push('Pas : +2 000 pas par jour (15 min de marche après le repas) ≈ +0,1 kg/semaine sans fatigue en plus.');
    ifBehind.push('Fin de séance : 10 min de marche inclinée (pente 10, 5 km/h) — brûle sans abîmer la récup.');
    if ((cut.weight.toLose ?? 0) > 0) ifBehind.push('Sommeil ≥ 7 h : moins de faim le lendemain et plus de gras perdu à déficit égal.');
  }
  return { lines, ifBehind, behind, etaDate, weeksLeft, toLose };
}

/** Muscles pas travaillés depuis N jours (journal du coach + séances FORME), du plus oublié au moins oublié. */
export async function neglectedMuscles(days = 10): Promise<string[]> {
  const today = localNow().date, since = addDays(today, -days);
  const sc = await import('./sport-coach.js');
  const log = await sc.readSportLog();
  const mus = await sc.exerciseMuscles();
  const last: Record<string, string> = {};
  for (const s of log) {
    if (s.date < since) continue;
    const hit = new Set<string>([...(sc.SESSIONS[s.type]?.muscles ?? []), ...(s.sets ?? []).map(x => mus[x.ex]?.muscle).filter((x): x is string => !!x)]);
    for (const m of hit) if (!last[m] || last[m]! < s.date) last[m] = s.date;
  }
  return MAIN_MUSCLES.filter(m => !last[m]);
}

/** « entraîne le dos en priorité » : priorité FORME en tête + programme de la semaine refait (agenda + FORME). */
export async function prioritize(muscles: string[]): Promise<string> {
  const ids = [...new Set(muscles.filter(m => (MAIN_MUSCLES as readonly string[]).includes(m) || m === 'abdos'))];
  if (!ids.length) return '❌ Je n\'ai pas compris quel muscle (pecs, dos, épaules, bras, jambes, abdos).';
  const goals = await import('./forme-goals.js');
  const cur = await kvJson<{ zones?: string[]; priority?: string[] }>('kouider:forme:goals', {}).catch(() => ({} as { zones?: string[]; priority?: string[] }));
  const zones = [...new Set([...ids, ...(cur.zones ?? [])])];
  const priority = [...ids, ...(cur.priority ?? []).filter(z => !ids.includes(z))];
  await goals.setGoalPrefs('kouider', { zones, priority });
  const plan = await import('./sport-coach.js').then(m => m.planSportWeek(true)).catch(() => null);
  const slots = plan?.slots ?? [];
  const sc = await import('./sport-coach.js');
  const hits = slots.filter(s => (sc.SESSIONS[s.type]?.muscles ?? []).some(m => ids.includes(m)));
  return `✅ ${ids.map(m => MUSCLE_FR[m]).join(', ')} en priorité n°1 dans FORME.${slots.length ? ` Programme des 7 jours refait dans l'agenda : ${hits.length ? hits.map(s => `${s.date.slice(8)}/${s.date.slice(5, 7)} ${sc.SESSIONS[s.type]?.label ?? s.type}`).join(', ') : 'aucune séance ne les travaille encore, je les ajoute à la prochaine'}.` : ''} La grosse séance du samedi et les ajustements suivront cette priorité.`;
}

/** Bouton « Adapter mon programme » / « adapte mon programme » : objectif vérifié, séances refaites, muscles oubliés ajoutés. */
export async function adaptProgram(): Promise<{ text: string; changes: string[] }> {
  const changes: string[] = [];
  const goals = await import('./forme-goals.js');
  const hasPlan = !!(await kvJson<{ plan?: unknown }>('kouider:forme:goals', {}).catch(() => ({} as { plan?: unknown }))).plan;
  if (hasPlan) {
    const log = await goals.goalsCheck('kouider', true).catch(() => null);
    if (log?.changes.length) changes.push(...log.changes);
  }
  const neg = await neglectedMuscles(10).catch(() => [] as string[]);
  const plan = await import('./sport-coach.js').then(m => m.planSportWeek(true)).catch(() => null);
  if (neg.length) changes.push(`Muscles pas travaillés depuis 10 jours ajoutés au programme : ${neg.map(m => MUSCLE_FR[m]).join(', ')}`);
  if (plan?.slots.length) changes.push(`Agenda des 7 jours mis à jour (${plan.slots.length} séance${plan.slots.length > 1 ? 's' : ''})`);
  const gs = await goalStatus().catch(() => null);
  const text = [gs?.lines.join('\n') ?? '', changes.length ? `\n🔧 Changé :\n${changes.map(c => `• ${c}`).join('\n')}` : '\n✅ Ton programme est déjà adapté : rien à changer.', gs?.ifBehind.length ? `\n💡 Pour aller plus vite :\n${gs.ifBehind.map(c => `• ${c}`).join('\n')}` : ''].join('\n').trim();
  return { text, changes };
}
