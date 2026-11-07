// 📊 BILANS FORME (06/11/2026, Kouider : « chaque soir un récap de ma journée, ce qu'il faut améliorer, mes points forts et faibles
// pour tout — battements de cœur, séances, pas… ; à la fin de la semaine un récap de la semaine, à la fin du mois aussi ; il me note
// mon évolution, où je dois m'améliorer, augmenter les séances, le poids… ; en document avec des graphiques sur Telegram ; visible dans
// l'app FORME ; quand je clique sur un jour du calendrier je vois toutes les infos »).
// Tout est CALCULÉ par le code depuis ses vraies données (montre via health:daily, journées FORME, journal des séances, fiches
// d'exercices, repas) : notes, points forts/faibles et conseils viennent de règles, jamais inventés. Le « mot du coach » (cerveau
// gratuit) ne reçoit que ces chiffres. Données privées : rien de chiffré dans ce dépôt public.
import { kvJson, kvPut, ai } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { getFormeProfile, readDays, type FormeDay } from './forme.js';

type Kind = 'day' | 'week' | 'month';
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const wdOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const r1 = (n: number) => Math.round(n * 10) / 10;
const avg = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const nums = (a: Array<number | undefined | null>) => a.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0);
const fr = (n: number, d = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 }).replace(/[\u202F\u00A0]/g, ' ');   // espace fine : absente des polices PDF (« 20 /270 »)
const watchTxt = (w: NonNullable<DayStat['watch']>) => w.map(x => `${x.name}${x.min ? ` ${x.min} min` : ''}${x.kcal ? ` (${x.kcal} kcal)` : ''}`).join(', ');
const MUSCLE_FR: Record<string, string> = { pecs: 'pecs', dos: 'dos', epaules: 'épaules', bras: 'bras', jambes: 'jambes', abdos: 'abdos', biceps: 'biceps', triceps: 'triceps' };

export interface DayStat {
  date: string; label: string;
  steps?: number; stepsGoal: number; sleep_h?: number; rhr?: number; hrv?: number; activeKcal?: number;
  water: number; waterGoal: number; weight?: number;
  eaten?: number; protein?: number; proteinGoal?: number; target?: number; burned?: number; realDeficit?: number; deficitGoal?: number;
  session?: { type: string; label: string; sets: number; volume: number; durationMin?: number; rpe?: number; muscles: string[] };
  prs: Array<{ ex: string; kg: number; prev: number }>;
  watch?: Array<{ name: string; min?: number; kcal?: number }>;   // séances vues par la montre
}

interface HealthRow { date: string; steps?: number; sleep_h?: number; rhr?: number; hrv?: number; active_kcal?: number }

async function sources() {
  const [health, days, profile, sport] = await Promise.all([
    kvJson<HealthRow[]>('health:daily', []).catch(() => [] as HealthRow[]),
    readDays('kouider').catch(() => ({} as Record<string, FormeDay>)),
    getFormeProfile('kouider'),
    import('./sport-coach.js').then(async m => ({ log: await m.readSportLog(), mus: await m.exerciseMuscles(), sess: m.SESSIONS })).catch(() => null),
  ]);
  const exlog = await kvJson<Record<string, Array<{ date: string; kg?: number; reps?: number }>>>('kouider:forme:exlog', {}).catch(() => ({}));
  const live = await import('./workout-live.js').then(m => m.readWorkouts()).catch(() => []);
  return { health: Array.isArray(health) ? health : [], days, profile, sport, exlog, live };
}
type Src = Awaited<ReturnType<typeof sources>>;

/** Muscle d'un exercice : liste du coach, sinon deviné par le nom (exercices créés dans FORME : « Butterfly~… », « Cable_Crossover~… »). */
function muscleOf(id: string, s: Src): string | undefined {
  const m = s.sport?.mus[id]?.muscle; if (m) return m;
  const n = `${id} ${s.sport?.mus[id]?.name ?? ''}`.toLowerCase().replace(/[_~-]/g, ' ');
  if (/butterfly|crossover|cross over|pec|chest|bench|couch|dips|pompe|push ?up|fly\b/.test(n) && !/reverse|rear|arri/.test(n)) return 'pecs';
  if (/triceps|biceps|curl|pushdown|extension triceps|marteau|hammer|avant[- ]bras|forearm/.test(n)) return 'bras';
  if (/squat|leg|presse|press[ée] a cuisse|fente|lunge|mollet|calf|ischio|quadri|hip thrust|fessier|glute|deadlift|souleve/.test(n)) return 'jambes';
  if (/row|tirage|pull|lat\b|lats|dos|traction|chin|rowing|shrug|trap/.test(n)) return 'dos';
  if (/lateral|deltoid|delto|shoulder|epaule|elevation|raise|military|overhead|reverse fly|rear delt|face pull|arnold/.test(n)) return 'epaules';
  if (/abs|crunch|gainage|plank|abdo|oblique|relev[ée] de jambes/.test(n)) return 'abdos';
  return undefined;
}
const exName = (id: string, s: Src) => s.sport?.mus[id]?.name ?? id.replace(/~.*$/, '').replace(/^[a-z]+_/, '').replace(/_/g, ' ');

async function dayStat(date: string, s: Src): Promise<DayStat> {
  const h = s.health.find(x => x.date === date);
  const fd = s.days[date] as FormeDay | undefined;
  const st: DayStat = {
    date, label: `${DAYS[wdOf(date)]} ${dm(date)}`,
    steps: h?.steps ?? fd?.steps, stepsGoal: s.profile.stepsGoal || 8000, sleep_h: h?.sleep_h ?? fd?.sleep, rhr: h?.rhr, hrv: h?.hrv,
    activeKcal: h?.active_kcal ?? fd?.activeKcal, water: fd?.water ?? 0, waterGoal: s.profile.waterGoal || 8, weight: fd?.weight, prs: [],
  };
  // Séances de la montre : suivi en direct (début/fin, kcal) sinon la liste du Raccourci Santé
  const live = s.live.filter(w => localNow(Date.parse(w.end)).date === date).map(w => ({ name: w.type, min: Math.round(w.min), ...(w.kcal ? { kcal: Math.round(w.kcal) } : {}) }));
  const wl = live.length ? live : (fd?.watch ?? []);
  if (wl.length) st.watch = wl;
  // Repas / déficit (seulement si quelque chose a été mangé et noté ce jour-là)
  try {
    const { foodBudget, deficitStatus } = await import('./forme-food.js');
    const b = await foodBudget('kouider', date);
    if (b.eaten.kcal > 0) {
      const d = deficitStatus(b);
      Object.assign(st, { eaten: b.eaten.kcal, protein: Math.round(b.eaten.p), proteinGoal: b.proteinGoal, target: b.target, burned: d.burned, realDeficit: d.real, deficitGoal: d.goal });
    }
  } catch { /* pas de repas */ }
  // Séance
  const log = s.sport?.log.filter(x => x.date === date) ?? [];
  const sets = log.flatMap(x => x.sets ?? []);
  const fw = fd?.workout;
  if (log.length || fw) {
    const type = log[0]?.type ?? 'libre';
    const label = (s.sport?.sess as Record<string, { label: string }> | undefined)?.[type]?.label ?? fw?.label ?? type;
    const all = sets.length ? sets : (fw?.sets ?? []);
    const muscles = [...new Set(all.map(x => muscleOf(x.ex, s)).filter((x): x is string => !!x))];
    st.session = { type, label, sets: all.length, volume: Math.round(all.reduce((t, x) => t + (x.kg ?? 0) * (x.reps ?? 0), 0)),
      durationMin: log[0]?.durationMin ?? fw?.durationMin, rpe: log[0]?.rpe ?? fw?.rpe, muscles };
  }
  // Records du jour : charge max de chaque exercice vs tout ce qui précède
  for (const [ex, l] of Object.entries(s.exlog)) {
    const today = nums(l.filter(x => x.date === date).map(x => x.kg));
    const before = nums(l.filter(x => x.date < date).map(x => x.kg));
    if (today.length && before.length && Math.max(...today) > Math.max(...before)) st.prs.push({ ex: exName(ex, s), kg: Math.max(...today), prev: Math.max(...before) });
  }
  return st;
}

// ── Notes (0-100) : chaque domaine a une règle simple, montrée dans le bilan ─────────────────────────────
export interface Scores { sommeil?: number; activite?: number; entrainement?: number; recuperation?: number; nutrition?: number; hydratation?: number; global: number }
function scores(ds: DayStat[], base: { hrv?: number; rhr?: number }, sessTarget: number, kind: Kind): Scores {
  const sc: Scores = { global: 0 };
  const sl = nums(ds.map(d => d.sleep_h)); if (sl.length) sc.sommeil = Math.min(100, Math.round(avg(sl) / 7.5 * 100));
  const stp = ds.filter(d => d.steps); if (stp.length) sc.activite = Math.min(100, Math.round(avg(stp.map(d => d.steps! / d.stepsGoal)) * 100));
  const done = ds.filter(d => d.session).length;
  const want = kind === 'day' ? (ds[0] && isTrainingDay(ds[0].date) ? 1 : 0) : Math.round(sessTarget * ds.length / 7);
  if (want > 0) sc.entrainement = Math.min(100, Math.round(done / want * 100));
  const hv = nums(ds.map(d => d.hrv)), rh = nums(ds.map(d => d.rhr));
  if ((hv.length && base.hrv) || (rh.length && base.rhr)) {
    const a = hv.length && base.hrv ? Math.min(1.2, avg(hv) / base.hrv) : 1, b = rh.length && base.rhr ? Math.min(1.2, base.rhr / avg(rh)) : 1;
    sc.recuperation = Math.max(0, Math.min(100, Math.round((a * 0.6 + b * 0.4) * 85)));
  }
  const fed = ds.filter(d => d.eaten);
  if (fed.length) sc.nutrition = Math.round(avg(fed.map(d => ((d.realDeficit ?? 0) >= (d.deficitGoal ?? 0) - 30 ? 60 : Math.max(0, 60 * (d.realDeficit ?? 0) / Math.max(1, d.deficitGoal ?? 1))) + Math.min(40, 40 * (d.protein ?? 0) / Math.max(1, d.proteinGoal ?? 1)))));
  const wt = ds.filter(d => d.water > 0); if (wt.length) sc.hydratation = Math.round(avg(wt.map(d => Math.min(1, d.water / d.waterGoal))) * 100);
  const parts = [sc.sommeil, sc.activite, sc.entrainement, sc.recuperation, sc.nutrition, sc.hydratation].filter((x): x is number => typeof x === 'number');
  sc.global = parts.length ? Math.round(avg(parts)) : 0;
  return sc;
}
let restDays: number[] = [1, 4];
const isTrainingDay = (d: string) => !restDays.includes(wdOf(d));

export interface Report {
  kind: Kind; from: string; to: string; title: string; days: DayStat[]; scores: Scores; prevScores?: Scores;
  totals: { sessions: number; sessionsTarget: number; sets: number; volume: number; steps: number; stepsAvg: number; sleepAvg: number; sleepDebt: number;
    rhrAvg: number; hrvAvg: number; activeKcal: number; waterOkDays: number; weightStart?: number; weightEnd?: number; prs: number; trainMinutes: number;
    bestDay?: string; muscleSets: Record<string, number> };
  prev?: Report['totals'];
  strengths: string[]; weaknesses: string[]; actions: string[]; progression: string[]; coach: string; text: string;
  goal?: { lines: string[]; ifBehind: string[]; behind: boolean };
}

const pct = (a: number, b: number) => b ? Math.round((a - b) / b * 100) : 0;
const arrow = (a: number, b: number, higherIsBetter = true) => !b || !a ? '' : Math.abs(pct(a, b)) < 3 ? ' (=)' : `${(a > b) === higherIsBetter ? ' ↗' : ' ↘'} ${pct(a, b) > 0 ? '+' : ''}${pct(a, b)} %`;

function totals(ds: DayStat[], sessTarget: number, s: Src): Report['totals'] {
  const sl = nums(ds.map(d => d.sleep_h)), st = nums(ds.map(d => d.steps));
  const muscleSets: Record<string, number> = {};
  for (const d of ds) for (const x of s.sport?.log.filter(l => l.date === d.date).flatMap(l => l.sets ?? []) ?? []) { const m = muscleOf(x.ex, s); if (m) muscleSets[m] = (muscleSets[m] ?? 0) + 1; }
  const w = ds.filter(d => d.weight);
  const best = [...ds].filter(d => d.steps || d.session).sort((a, b) => ((b.session ? 1 : 0) * 10_000 + (b.steps ?? 0)) - ((a.session ? 1 : 0) * 10_000 + (a.steps ?? 0)))[0];
  return {
    sessions: ds.filter(d => d.session).length, sessionsTarget: Math.round(sessTarget * ds.length / 7), sets: ds.reduce((t, d) => t + (d.session?.sets ?? 0), 0),
    volume: ds.reduce((t, d) => t + (d.session?.volume ?? 0), 0), steps: st.reduce((t, x) => t + x, 0), stepsAvg: Math.round(avg(st)),
    sleepAvg: r1(avg(sl)), sleepDebt: r1(sl.reduce((t, x) => t + Math.max(0, 7.5 - x), 0)), rhrAvg: Math.round(avg(nums(ds.map(d => d.rhr)))), hrvAvg: Math.round(avg(nums(ds.map(d => d.hrv)))),
    activeKcal: ds.reduce((t, d) => t + (d.activeKcal ?? 0), 0), waterOkDays: ds.filter(d => d.water >= d.waterGoal).length,
    weightStart: w[0]?.weight, weightEnd: w.at(-1)?.weight, prs: ds.reduce((t, d) => t + d.prs.length, 0), trainMinutes: ds.reduce((t, d) => t + (d.session?.durationMin ?? 0), 0),
    bestDay: best?.label, muscleSets,
  };
}

/** Charge à augmenter : dernière séance de chaque exercice, toutes les séries à ≥ 12 répétitions au même poids → +2,5 kg (+1 kg petits haltères). */
function progression(s: Src, to: string): string[] {
  const out: Array<{ t: string; at: string }> = [];
  for (const [ex, l] of Object.entries(s.exlog)) {
    const dates = [...new Set(l.filter(x => x.date <= to).map(x => x.date))].sort();
    const last = dates.at(-1); if (!last || last < addDays(to, -21)) continue;
    const sets = l.filter(x => x.date === last && x.kg && x.reps);
    if (sets.length < 2) continue;
    const kg = Math.max(...sets.map(x => x.kg!));
    const top = sets.filter(x => x.kg === kg);
    if (top.length >= 2 && top.every(x => (x.reps ?? 0) >= 12)) {
      const step = kg < 12 ? 1 : 2.5;
      out.push({ t: `${exName(ex, s)} : ${fr(kg, 1)} kg × ${top[0]!.reps} sur toutes tes séries → passe à ${fr(kg + step, 1)} kg (8-10 reps), puis remonte à 12.`, at: last });
    }
    // Plateau : même charge max sur les 3 dernières séances sans atteindre 12 reps → changer quelque chose
    else if (dates.length >= 3) {
      const maxOf = (d: string) => Math.max(...nums(l.filter(x => x.date === d).map(x => x.kg)), 0);
      const last3 = dates.slice(-3).map(maxOf);
      if (last3[0] && last3.every(v => v === last3[0])) out.push({ t: `${exName(ex, s)} : bloqué à ${fr(last3[0], 1)} kg depuis 3 séances → fais 4 séries de 8 avec 1 min 30 de repos, ou change de variante (haltères ↔ machine) pendant 2 semaines.`, at: last });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6).map(x => x.t);
}

function analyse(r: Omit<Report, 'strengths' | 'weaknesses' | 'actions' | 'coach' | 'text'>): { strengths: string[]; weaknesses: string[]; actions: string[] } {
  const S: string[] = [], W: string[] = [], A: string[] = [];
  const t = r.totals, sc = r.scores, one = r.kind === 'day', d0 = r.days[0];
  // Sommeil
  if (t.sleepAvg) {
    if (t.sleepAvg >= 7) S.push(`Sommeil : ${fr(t.sleepAvg, 1)} h${one ? '' : ' en moyenne'} — c'est là que le muscle se construit.`);
    else { W.push(`Sommeil court : ${fr(t.sleepAvg, 1)} h${one ? '' : ` en moyenne (dette ${fr(t.sleepDebt, 1)} h)`} pour 7 h 30 visées.`); A.push(`Sommeil : couche-toi 30 min plus tôt ${one ? 'ce soir' : 'la semaine prochaine'} (écran coupé 22 h 30) — +30 min par nuit = meilleure récup et moins de faim.`); }
  } else if (!one) W.push('Sommeil pas mesuré la plupart des nuits : garde la montre ou dis « bonne nuit » / un message au réveil.');
  // Pas
  if (t.stepsAvg) {
    const g = r.days[0]?.stepsGoal ?? 8000;
    if (t.stepsAvg >= g) S.push(`Activité : ${fr(t.stepsAvg)} pas${one ? '' : '/jour'} (objectif ${fr(g)}).`);
    else { W.push(`Pas : ${fr(t.stepsAvg)}${one ? '' : '/jour'} pour ${fr(g)} visés.`); A.push(`Pas : ajoute une marche de 15 min après le repas (~2 000 pas).`); }
  }
  // Cœur / récupération
  if (sc.recuperation !== undefined) {
    if (sc.recuperation >= 80) S.push(`Récupération bonne (cœur au repos ${t.rhrAvg || '—'} bpm, VFC ${t.hrvAvg || '—'} ms).`);
    else if (sc.recuperation < 65) { W.push(`Récupération basse : cœur au repos ${t.rhrAvg || '—'} bpm, VFC ${t.hrvAvg || '—'} ms (moins bien que ta moyenne).`); A.push(`Récup : ${one ? 'demain' : 'les 2 prochains jours'} séance plus légère (-20 % de charge ou moins de séries), eau + sommeil.`); }
  }
  // Séances
  if (one) {
    if (d0?.session) S.push(`Séance ${d0.session.label} faite : ${d0.session.sets} séries, ${fr(d0.session.volume)} kg soulevés${d0.session.durationMin ? ` en ${d0.session.durationMin} min` : ''}.`);
    else if (d0 && isTrainingDay(d0.date)) W.push('Pas de séance notée aujourd\'hui (jour d\'entraînement).');
  } else {
    if (t.sessions >= t.sessionsTarget && t.sessionsTarget) S.push(`Régularité : ${t.sessions} séances sur ${t.sessionsTarget} prévues.`);
    else if (t.sessionsTarget) { W.push(`Séances : ${t.sessions} sur ${t.sessionsTarget} prévues.`); A.push(`Séances : bloque tes ${t.sessionsTarget} créneaux dans l'agenda dès dimanche soir, sac prêt la veille.`); }
    if (r.prev && t.volume && r.prev.volume) (t.volume >= r.prev.volume ? S : W).push(`Volume soulevé : ${fr(t.volume)} kg${arrow(t.volume, r.prev.volume)} vs ${r.kind === 'week' ? 'semaine' : 'mois'} d'avant.`);
    const zero = ['pecs', 'dos', 'epaules', 'bras', 'jambes'].filter(m => !t.muscleSets[m]);
    const low = Object.entries(t.muscleSets).filter(([m, n]) => n < (r.kind === 'week' ? 10 : 40) && MUSCLE_FR[m]).map(([m]) => m);
    if (zero.length) { W.push(`Muscles pas travaillés : ${zero.map(m => MUSCLE_FR[m]).join(', ')}.`); A.push(`Ajoute ${zero.map(m => MUSCLE_FR[m]).join(', ')} : 2 exercices × 3 séries chacun dans tes prochaines séances.`); }
    else if (low.length && r.kind === 'week') A.push(`Pour grossir : vise 10 à 20 séries par semaine sur ${low.map(m => MUSCLE_FR[m]).join(', ')} (tu es en dessous).`);
  }
  if (t.prs) S.push(`${t.prs} record${t.prs > 1 ? 's' : ''} de charge battu${t.prs > 1 ? 's' : ''} 💪`);
  // Nutrition / eau / poids
  if (sc.nutrition !== undefined) (sc.nutrition >= 75 ? S : W).push(`Nutrition : note ${sc.nutrition}/100 (déficit et protéines).`);
  const fed = r.days.filter(d => d.eaten);
  if (fed.length && avg(fed.map(d => (d.protein ?? 0) / Math.max(1, d.proteinGoal ?? 1))) < 0.8) A.push('Protéines : ajoute 1 portion par repas (poulet, œufs, thon, skyr) — tu es sous 80 % de ton objectif.');
  if (!one && r.days.length - fed.length > r.days.length / 2) A.push('Repas : photographie au moins le repas du soir, sinon je ne peux pas suivre ton déficit.');
  if (sc.hydratation !== undefined) ((one ? sc.hydratation >= 90 : t.waterOkDays >= r.days.length * 0.7) ? S : W).push(`Eau : ${one ? `${fr((d0?.water ?? 0) * 0.25, 2)} L` : `objectif tenu ${t.waterOkDays}/${r.days.length} jours`}.`);
  if (t.weightStart && t.weightEnd && t.weightStart !== t.weightEnd) (t.weightEnd < t.weightStart ? S : W).push(`Poids : ${fr(t.weightStart, 1)} → ${fr(t.weightEnd, 1)} kg.`);
  return { strengths: S.slice(0, 6), weaknesses: W.slice(0, 6), actions: [...new Set(A)].slice(0, 6) };
}

function periodOf(kind: Kind, end: string): { from: string; to: string; title: string; prevFrom: string; prevTo: string } {
  if (kind === 'day') return { from: end, to: end, title: `Bilan du ${DAYS[wdOf(end)]} ${Number(end.slice(8))} ${MONTHS[Number(end.slice(5, 7)) - 1]}`, prevFrom: addDays(end, -1), prevTo: addDays(end, -1) };
  if (kind === 'week') { const mon = addDays(end, -((wdOf(end) + 6) % 7)); return { from: mon, to: addDays(mon, 6) > end ? end : addDays(mon, 6), title: `Bilan de la semaine du ${dm(mon)} au ${dm(addDays(mon, 6))}`, prevFrom: addDays(mon, -7), prevTo: addDays(mon, -1) }; }
  const from = `${end.slice(0, 7)}-01`;
  const pm = new Date(`${from}T12:00:00Z`); pm.setUTCMonth(pm.getUTCMonth() - 1);
  const prevFrom = pm.toISOString().slice(0, 10), prevTo = addDays(from, -1);
  return { from, to: end, title: `Bilan du mois de ${MONTHS[Number(end.slice(5, 7)) - 1]} ${end.slice(0, 4)}`, prevFrom, prevTo };
}
const range = (a: string, b: string) => { const o: string[] = []; for (let d = a; d <= b && o.length < 40; d = addDays(d, 1)) o.push(d); return o; };

export async function buildReport(kind: Kind, end = localNow().date, withCoach = true): Promise<Report> {
  const s = await sources();
  restDays = s.profile.restDays?.length ? s.profile.restDays : [1, 4];
  const sessTarget = s.profile.sessionsPerWeek || 4;
  const p = periodOf(kind, end);
  const days = await Promise.all(range(p.from, p.to).map(d => dayStat(d, s)));
  const prevDays = await Promise.all(range(p.prevFrom, p.prevTo).map(d => dayStat(d, s)));
  const baseRows = s.health.filter(h => h.date < p.from && h.date >= addDays(p.from, -21));
  const base = { hrv: avg(nums(baseRows.map(h => h.hrv))) || undefined, rhr: avg(nums(baseRows.map(h => h.rhr))) || undefined };
  const core = { kind, from: p.from, to: p.to, title: p.title, days, scores: scores(days, base, sessTarget, kind), prevScores: scores(prevDays, base, sessTarget, kind),
    totals: totals(days, sessTarget, s), prev: totals(prevDays, sessTarget, s), progression: progression(s, p.to) };
  const an = analyse(core);
  const gs = await import('./forme-adapt.js').then(m => m.goalStatus()).catch(() => null);
  const goal = gs && (gs.lines.length || gs.ifBehind.length) ? { lines: gs.lines, ifBehind: gs.ifBehind, behind: gs.behind } : undefined;
  let coach = '';
  if (withCoach) {
    const facts = { objectif: goal?.lines, si_pas_assez: goal?.ifBehind, periode: p.title, notes: core.scores, notes_avant: core.prevScores, totaux: core.totals, avant: core.prev, forts: an.strengths, faibles: an.weaknesses, actions: an.actions, charges: core.progression };
    coach = (await ai(`Tu es le coach sportif et de vie de Kouider (grand frère exigeant et bienveillant, tutoiement, français simple). Voici SES chiffres réels :\n${JSON.stringify(facts)}\n\n`
      + `Écris 3 à 4 phrases : ce qui progresse (avec un chiffre), le point n°1 à améliorer et COMMENT concrètement, une phrase de motivation liée à sa femme et son fils. N'invente AUCUN chiffre. Pas de médicament. Pas de liste, pas de titre.`,
      { max: 300 }).catch(() => '')).trim().replace(/^["«]|["»]$/g, '');
  }
  const r = { ...core, ...an, coach, goal, text: '' } as Report;
  r.text = reportText(r);
  return r;
}

const NOTE: Array<[keyof Scores, string]> = [['sommeil', 'Sommeil'], ['activite', 'Activité'], ['entrainement', 'Entraînement'], ['recuperation', 'Récupération'], ['nutrition', 'Nutrition'], ['hydratation', 'Eau']];
export function reportText(r: Report): string {
  const t = r.totals, p = r.prev;
  const notes = NOTE.filter(([k]) => typeof r.scores[k] === 'number').map(([k, l]) => `${l} ${r.scores[k]}${r.prevScores && typeof r.prevScores[k] === 'number' ? arrow(r.scores[k] as number, r.prevScores[k] as number).replace(/ [+-]?\d+ %/, '') : ''}`).join(' · ');
  const one = r.kind === 'day', d = r.days[0];
  const lines = [
    `📊 ${r.title}`,
    `⭐ Note globale : ${r.scores.global}/100${r.prevScores?.global ? arrow(r.scores.global, r.prevScores.global) : ''}`,
    notes ? `(${notes})` : '',
    '',
    one && d ? [
      d.steps ? `👣 ${fr(d.steps)} pas` : '', d.sleep_h ? `😴 ${fr(d.sleep_h, 1)} h` : '', d.rhr ? `❤️ repos ${d.rhr} bpm` : '', d.hrv ? `VFC ${d.hrv} ms` : '',
      d.activeKcal ? `🔥 ${fr(d.activeKcal)} kcal actives` : '', d.eaten ? `🍽️ ${fr(d.eaten)} kcal mangées` : '', d.water ? `💧 ${fr(d.water * 0.25, 2)} L` : '',
      d.session ? `🏋️ ${d.session.label} : ${d.session.sets} séries · ${fr(d.session.volume)} kg` : '',
      d.watch?.length ? `⌚ Montre : ${watchTxt(d.watch)}` : '',
    ].filter(Boolean).join(' · ') : [
      `🏋️ ${t.sessions}/${t.sessionsTarget} séances · ${t.sets} séries · ${fr(t.volume)} kg${p?.volume ? arrow(t.volume, p.volume) : ''}`,
      r.days.some(d => d.watch?.length) ? `⌚ Montre : ${r.days.filter(d => d.watch?.length).map(d => `${d.label.split(' ')[0]} ${watchTxt(d.watch!)}`).join(' · ')}` : '',
      t.stepsAvg ? `👣 ${fr(t.stepsAvg)} pas/jour${p?.stepsAvg ? arrow(t.stepsAvg, p.stepsAvg) : ''}` : '',
      t.sleepAvg ? `😴 ${fr(t.sleepAvg, 1)} h/nuit${p?.sleepAvg ? arrow(t.sleepAvg, p.sleepAvg) : ''}${t.sleepDebt ? ` (dette ${fr(t.sleepDebt, 1)} h)` : ''}` : '',
      t.rhrAvg ? `❤️ repos ${t.rhrAvg} bpm${p?.rhrAvg ? arrow(t.rhrAvg, p.rhrAvg, false) : ''} · VFC ${t.hrvAvg || '—'} ms` : '',
      t.weightStart && t.weightEnd ? `⚖️ ${fr(t.weightStart, 1)} → ${fr(t.weightEnd, 1)} kg` : '',
      t.bestDay ? `🏆 Meilleur jour : ${t.bestDay}` : '',
    ].filter(Boolean).join('\n'),
    '',
    r.strengths.length ? `✅ Points forts :\n${r.strengths.map(x => `• ${x}`).join('\n')}` : '',
    r.weaknesses.length ? `⚠️ À améliorer :\n${r.weaknesses.map(x => `• ${x}`).join('\n')}` : '',
    r.actions.length ? `🎯 ${one ? 'Demain' : 'La suite'} :\n${r.actions.map(x => `• ${x}`).join('\n')}` : '',
    r.goal?.lines.length ? `${r.goal.lines.join('\n')}${r.goal.ifBehind.length ? `\n💡 Pour y arriver plus vite :\n${r.goal.ifBehind.map(x => `• ${x}`).join('\n')}` : ''}${r.goal.behind ? '\n👉 Dis « adapte mon programme » (ou le bouton dans FORME › Progrès) et je change tout.' : ''}` : '',
    r.progression.length && !one ? `📈 Charges à augmenter :\n${r.progression.slice(0, 4).map(x => `• ${x}`).join('\n')}` : '',
    r.coach ? `\n🗣️ ${r.coach}` : '',
  ];
  return lines.filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── PDF avec graphiques (pdfkit) ───────────────────────────────────────────────────────────────────────
const ASCII = (s: string) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/↗/g, '+').replace(/↘/g, '-').replace(/→/g, '->').replace(/[   ]/g, ' ').replace(/—/g, '-').replace(/≈/g, 'env.').replace(/×/g, 'x').trim();

export async function reportPdf(r: Report): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(res => doc.on('end', () => res(Buffer.concat(chunks))));
  const NAVY = '#0B2545', ACC = '#6C4CF1', GREEN = '#1F9D5C', RED = '#D64545', GOLD = '#C98A00', GREY = '#666666', GRID = '#E6E2EE';
  const X0 = 40, WID = 515;
  const say = (t: string, o: { size?: number; color?: string; bold?: boolean; gap?: number } = {}) => {
    doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size ?? 10.5).fillColor(o.color ?? '#222222').text(ASCII(t), { width: WID });
    if (o.gap) doc.moveDown(o.gap);
  };
  const room = (h: number) => { if (doc.y + h > 800) doc.addPage(); };
  /** Barres (une par jour) avec ligne d'objectif. */
  const bars = (title: string, vals: Array<{ l: string; v: number }>, unit: string, goal?: number, color = ACC) => {
    room(190);
    say(title, { bold: true, size: 12, color: NAVY });
    const y0 = doc.y + 6, h = 120, w = WID, n = Math.max(1, vals.length);
    const max = Math.max(goal ?? 0, ...vals.map(x => x.v), 1) * 1.1;
    doc.save().strokeColor(GRID).lineWidth(0.5);
    for (let i = 0; i <= 4; i++) { const y = y0 + h - h * i / 4; doc.moveTo(X0, y).lineTo(X0 + w, y).stroke(); doc.fontSize(7).fillColor(GREY).text(fr(max * i / 4 / 1.1 * 1.1, max < 20 ? 1 : 0), X0 - 34, y - 4, { width: 30, align: 'right' }); }
    doc.restore();
    const bw = Math.min(36, w / n * 0.65);
    vals.forEach((x, i) => {
      const cx = X0 + w * (i + 0.5) / n, bh = h * x.v / max;
      doc.rect(cx - bw / 2, y0 + h - bh, bw, Math.max(0, bh)).fill(goal && x.v < goal ? `${color}88` : color);
      if (x.v && n <= 16) doc.fontSize(7).fillColor('#222222').text(fr(x.v, x.v < 20 ? 1 : 0), cx - 22, y0 + h - bh - 10, { width: 44, align: 'center' });
      if (n <= 16 || i % 3 === 0) doc.fontSize(7).fillColor(GREY).text(x.l, cx - 22, y0 + h + 4, { width: 44, align: 'center' });
    });
    if (goal) { const y = y0 + h - h * goal / max; doc.save().strokeColor(GREEN).dash(4, { space: 3 }).moveTo(X0, y).lineTo(X0 + w, y).stroke().undash().restore(); doc.fontSize(7).fillColor(GREEN).text(`objectif ${fr(goal, goal < 20 ? 1 : 0)} ${unit}`, X0 + w - 120, y - 10, { width: 120, align: 'right' }); }
    doc.x = X0; doc.y = y0 + h + 22;
  };
  /** Courbes (1 ou 2 séries). */
  const lines = (title: string, labels: string[], series: Array<{ name: string; v: Array<number | undefined>; color: string }>) => {
    const pts = series.flatMap(s => nums(s.v)); if (pts.length < 2) return;
    room(190);
    say(title, { bold: true, size: 12, color: NAVY });
    const y0 = doc.y + 6, h = 120, w = WID, n = Math.max(2, labels.length);
    const lo = Math.min(...pts) * 0.9, hi = Math.max(...pts) * 1.08;
    doc.save().strokeColor(GRID).lineWidth(0.5);
    for (let i = 0; i <= 4; i++) { const y = y0 + h - h * i / 4; doc.moveTo(X0, y).lineTo(X0 + w, y).stroke(); doc.fontSize(7).fillColor(GREY).text(fr(lo + (hi - lo) * i / 4), X0 - 34, y - 4, { width: 30, align: 'right' }); }
    doc.restore();
    for (const s of series) {
      const P = s.v.map((v, i) => v ? { x: X0 + w * i / (n - 1), y: y0 + h - h * (v - lo) / (hi - lo) } : null);
      doc.save().strokeColor(s.color).lineWidth(2);
      let started = false;
      for (const p of P) { if (!p) continue; if (!started) { doc.moveTo(p.x, p.y); started = true; } else doc.lineTo(p.x, p.y); }
      doc.stroke().restore();
      for (const p of P) if (p) doc.circle(p.x, p.y, 2.5).fill(s.color);
    }
    labels.forEach((l, i) => { if (labels.length <= 16 || i % 3 === 0) doc.fontSize(7).fillColor(GREY).text(l, X0 + w * i / (n - 1) - 20, y0 + h + 4, { width: 40, align: 'center' }); });
    let lx = X0; for (const s of series) { doc.rect(lx, y0 + h + 16, 8, 8).fill(s.color); doc.fontSize(8).fillColor('#222222').text(s.name, lx + 11, y0 + h + 16); lx += 130; }
    doc.x = X0; doc.y = y0 + h + 32;
  };

  // En-tête
  doc.rect(0, 0, 595, 88).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#FFFFFF').text(ASCII(r.title), X0, 26, { width: WID });
  doc.font('Helvetica').fontSize(10).fillColor('#C9C2F5').text('FORME · Dzaryx, ton coach — chiffres réels de ta montre, de tes séances et de tes repas', X0, 56, { width: WID });
  doc.x = X0; doc.y = 106;
  // Notes
  say(`Note globale : ${r.scores.global}/100${r.prevScores?.global ? `   (avant : ${r.prevScores.global})` : ''}`, { bold: true, size: 15, color: r.scores.global >= 75 ? GREEN : r.scores.global >= 55 ? GOLD : RED, gap: 0.4 });
  for (const [k, l] of NOTE) {
    const v = r.scores[k]; if (typeof v !== 'number') continue;
    const y = doc.y; doc.font('Helvetica').fontSize(10).fillColor('#222222').text(l, X0, y, { width: 100 });
    doc.rect(X0 + 105, y + 1, 300, 9).fill('#EEEAF6'); doc.rect(X0 + 105, y + 1, 3 * Math.min(100, v), 9).fill(v >= 75 ? GREEN : v >= 55 ? GOLD : RED);
    const pv = r.prevScores?.[k];
    doc.fontSize(10).fillColor('#222222').text(`${v}/100${typeof pv === 'number' ? `  (avant ${pv})` : ''}`, X0 + 415, y, { width: 110 });
    doc.x = X0; doc.y = y + 16;
  }
  doc.moveDown(0.6);
  const block = (title: string, items: string[], color: string) => { if (!items.length) return; room(30 + items.length * 26); say(title, { bold: true, size: 12, color }); for (const x of items) say(`•  ${x}`, { size: 10 }); doc.moveDown(0.5); };
  block('Points forts', r.strengths, GREEN);
  block('À améliorer', r.weaknesses, RED);
  block(r.kind === 'day' ? 'Demain' : 'Plan pour la suite', r.actions, ACC);
  if (r.progression.length) block('Charges à augmenter (surcharge progressive)', r.progression, GOLD);
  if (r.goal?.lines.length) block('Ton objectif', r.goal.lines, NAVY);
  if (r.goal?.ifBehind.length) block('Pour y arriver plus vite', r.goal.ifBehind, ACC);
  if (r.coach) { room(80); say('Le mot du coach', { bold: true, size: 12, color: NAVY }); say(r.coach, { size: 10.5, gap: 0.6 }); }

  // Graphiques (période ; pour un jour : les 7 derniers jours pour voir la tendance)
  const ds = r.kind === 'day' ? await Promise.all(range(addDays(r.to, -6), r.to).map(async d => d === r.to ? r.days[0]! : dayStat(d, await sources()))) : r.days;
  const lab = ds.map(d => r.kind === 'month' ? d.date.slice(8) : `${DAYS[wdOf(d.date)].slice(0, 3)} ${d.date.slice(8)}`);
  doc.addPage();
  say(r.kind === 'day' ? 'Tes 7 derniers jours' : 'Graphiques de la période', { bold: true, size: 15, color: NAVY, gap: 0.4 });
  bars('Pas par jour', ds.map((d, i) => ({ l: lab[i]!, v: d.steps ?? 0 })), 'pas', ds[0]?.stepsGoal, ACC);
  bars('Sommeil (heures)', ds.map((d, i) => ({ l: lab[i]!, v: d.sleep_h ?? 0 })), 'h', 7.5, '#2E86AB');
  lines('Cœur : fréquence au repos (bpm) et VFC (ms)', lab, [{ name: 'Repos (bpm)', v: ds.map(d => d.rhr), color: RED }, { name: 'VFC (ms)', v: ds.map(d => d.hrv), color: GREEN }]);
  bars('Calories actives (montre)', ds.map((d, i) => ({ l: lab[i]!, v: d.activeKcal ?? 0 })), 'kcal', undefined, '#F18F01');
  if (ds.some(d => d.session)) bars('Volume soulevé par séance (kg × répétitions)', ds.map((d, i) => ({ l: lab[i]!, v: d.session?.volume ?? 0 })), 'kg', undefined, '#6A4C93');
  if (ds.some(d => d.eaten)) lines('Calories : mangées vs brûlées', lab, [{ name: 'Mangées', v: ds.map(d => d.eaten), color: GOLD }, { name: 'Brûlées', v: ds.map(d => d.burned), color: ACC }]);
  if (ds.filter(d => d.weight).length >= 2) lines('Poids (kg)', lab, [{ name: 'Poids', v: ds.map(d => d.weight), color: NAVY }]);
  if (ds.some(d => d.water)) bars('Eau (litres)', ds.map((d, i) => ({ l: lab[i]!, v: r1(d.water * 0.25) })), 'L', r1((ds[0]?.waterGoal ?? 8) * 0.25), '#1B998B');
  const ms = Object.entries(r.totals.muscleSets).filter(([m]) => MUSCLE_FR[m]);
  if (ms.length && r.kind !== 'day') bars('Séries par muscle (10 à 20 / semaine pour progresser)', ms.map(([m, n]) => ({ l: MUSCLE_FR[m]!, v: n })), 'séries', r.kind === 'week' ? 10 : undefined, '#5B7F95');
  // Tableau des séances
  const sess = r.days.filter(d => d.session);
  if (sess.length) {
    room(60); say('Tes séances', { bold: true, size: 12, color: NAVY });
    for (const d of sess) say(`${d.label} — ${d.session!.label} : ${d.session!.sets} séries, ${fr(d.session!.volume)} kg${d.session!.durationMin ? `, ${d.session!.durationMin} min` : ''}${d.session!.rpe ? `, effort ${d.session!.rpe}/10` : ''}${d.prs.length ? ` — record : ${d.prs.map(p => `${p.ex} ${fr(p.kg, 1)} kg (avant ${fr(p.prev, 1)})`).join(', ')}` : ''}`, { size: 9.5 });
  }
  const wd = r.days.filter(d => d.watch?.length);
  if (wd.length) {
    room(60); say('Vu par ta montre', { bold: true, size: 12, color: NAVY });
    for (const d of wd) say(`${d.label} — ${watchTxt(d.watch!)}`, { size: 9.5 });
  }
  doc.end();
  return done;
}

// ── Envoi + stockage pour l'app ───────────────────────────────────────────────────────────────────────
const STORE = (kind: Kind, end: string) => `kouider:forme:report:${kind}:${end}`;
export async function sendReport(kind: Kind, end = localNow().date, send = true): Promise<string> {
  const r = await buildReport(kind, end);
  await kvPut(STORE(kind, r.to), { at: new Date().toISOString(), title: r.title, text: r.text, scores: r.scores }, 120 * 86_400).catch(() => {});
  if (send) {
    const pdf = await reportPdf(r);
    const { queueTelegramFile } = await import('../actions/handlers/nexus-relay.js');
    const name = `FORME-${kind === 'day' ? 'jour' : kind === 'week' ? 'semaine' : 'mois'}-${r.to}.pdf`;
    await queueTelegramFile(pdf.toString('base64'), name, r.text.slice(0, 1000));
  }
  return r.text;
}

/** Jobs : chaque soir 21h (avant son « bonne nuit » ; gardé pendant un silence), dimanche 20h la semaine, le 1er du mois le mois d'avant. */
export async function jobFormeDaily(): Promise<void> {
  const { dndAllowsMessage } = await import('../notifications/dnd.js');
  if (!(await dndAllowsMessage().catch(() => true))) { console.log('[forme-report] silence : bilan du jour gardé dans l\'app'); await sendReport('day', localNow().date, false); return; }
  await sendReport('day');
}
export async function jobFormeWeekReport(): Promise<void> { await sendReport('week'); }
export async function jobFormeMonthReport(): Promise<void> { await sendReport('month', addDays(localNow().date, -1)); }

/** Pour l'app : un jour du calendrier en détail (+ bilan déjà fait ce jour-là). */
export async function formeDayDetail(date: string) {
  const s = await sources();
  restDays = s.profile.restDays?.length ? s.profile.restDays : [1, 4];
  const d = await dayStat(date, s);
  const r = await buildReport('day', date, false);
  const saved = await kvJson<{ text: string } | null>(STORE('day', date), null).catch(() => null);
  const sets = (s.sport?.log.filter(x => x.date === date).flatMap(x => x.sets ?? []) ?? []).map(x => ({ ex: exName(x.ex, s), kg: x.kg, reps: x.reps }));
  return { day: d, scores: r.scores, strengths: r.strengths, weaknesses: r.weaknesses, actions: r.actions, sets, report: saved?.text ?? null };
}

/** Outil / commande : « bilan du jour / de la semaine / du mois ». */
export async function formeReportTool(input: Record<string, unknown>): Promise<string> {
  const k = String(input['kind'] ?? input['periode'] ?? 'day');
  const kind: Kind = /sem|week/i.test(k) ? 'week' : /mois|month/i.test(k) ? 'month' : 'day';
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : localNow().date;
  const txt = await sendReport(kind, end, input['send'] !== false);
  return `${txt}\n\n📄 PDF avec les graphiques envoyé sur Telegram (aussi dans FORME › Stats).`;
}
