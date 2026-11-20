// 🏁 BILAN DE SÉANCE (Kouider 07/11 : « à la fin de la séance, qu'il me dise ce qu'il en pense, ce que je devrais améliorer,
// un graphique de ma séance par rapport à la dernière séance pareille, d'autres infos visibles dans l'app, et qu'il m'envoie
// tout sur Telegram avec des notes de 0 à 10 »).
// Tout ce qui est chiffré (volume, séries, records, notes /10) est CALCULÉ par le code depuis son journal ; le cerveau (gratuit)
// écrit seulement l'avis et les conseils à partir de ces chiffres. Gardé 60 j dans app_kv `kouider:sport:review:<date>`.
import { kvGet, kvSet } from './app-store.js';
import { ai, jsonOf } from './ai-util.js';
import { queueTelegramMessage, queueTelegramAlbum } from '../notifications/tg-outbox.js';
import { readSportLog, findExercise, exKeyer, sameExercise, SESSIONS, ALL_EXERCISES, type SessionLog } from './sport-coach.js';

const RK = (date: string) => `kouider:sport:review:${date}`;
const NAMES_K = 'kouider:sport:exnames';
const base = (id: string) => id.replace(/~.*$/, '');
const e1rm = (kg: number, reps: number) => Math.round(kg * (1 + Math.min(reps, 15) / 30));
const clamp10 = (x: number) => Math.max(0, Math.min(10, Math.round(x)));

export interface ExCompare { id: string; name: string; sets: number; volume: number; topKg: number | null; topReps: number | null; e1rm: number | null;
  prev: { sets: number; volume: number; topKg: number | null; e1rm: number | null; topReps?: number | null; date?: string } | null; pr: boolean }
export interface SessionReview {
  date: string; at: number; type: string; label: string; emoji: string;
  totals: { sets: number; volume: number; durationMin: number | null; rpe: number | null; exercises: number; density: number | null };
  prev: { date: string; sets: number; volume: number; comparable?: boolean; durationMin: number | null } | null;
  exercises: ExCompare[];
  scores: { global: number; progression: number; volume: number; intensite: number; regularite: number; densite: number | null };
  avis: string; good: string[]; improve: string[]; chartUrl: string | null;
  // 07/11 soir (16 options) : contexte et extras — tous calculés par le code
  context?: { sleep: number | null; kcalYday: number | null; protYday: number | null; protGoal: number | null; kcalToday: number | null };
  links?: string[];                                    // sommeil / repas ↔ notes des séances passées
  rests?: { avgSec: number; plannedSec: number; slow: string[] } | null;
  challenge?: { name: string; met: boolean } | null;
  month?: { volume: number; best: { month: string; volume: number } | null } | null;
  forecast?: Array<{ name: string; target: number; eta: string }>;
}

/** L'app envoie les noms des exercices (bibliothèque, machines scannées) : gardés pour les bilans suivants.
 *  20/11 : aussi PAR JOUR — un même identifiant a porté deux noms différents selon le programme (« incline_press » =
 *  incliné machine un jour, haltères un autre) ; le nom du jour de la séance passe d'abord. */
export async function rememberNames(names: Record<string, string>, date?: string): Promise<void> {
  const cur = JSON.parse((await kvGet(NAMES_K).catch(() => null)) ?? '{}') as Record<string, string>;
  const day: Record<string, string> = {};
  for (const [k, v] of Object.entries(names)) if (k && v) { cur[base(k)] = String(v).slice(0, 60); day[base(k)] = String(v).slice(0, 60); }
  await kvSet(NAMES_K, JSON.stringify(cur)).catch(() => {});
  if (date && Object.keys(day).length) {
    const old = JSON.parse((await kvGet(`${NAMES_K}:${date}`).catch(() => null)) ?? '{}') as Record<string, string>;
    await kvSet(`${NAMES_K}:${date}`, JSON.stringify({ ...old, ...day }), 400 * 86_400).catch(() => {});
  }
}
async function namesOfDay(date: string): Promise<Record<string, string>> {
  try { return JSON.parse((await kvGet(`${NAMES_K}:${date}`)) ?? '{}') as Record<string, string>; } catch { return {}; }
}
// 20/11 : un identifiant sans nom (« legs_elevations_posterieures_machine ») s'affichait « elevations posterieures machine »
const ACCENTS: Record<string, string> = { elevation: 'élévation', elevations: 'élévations', developpe: 'développé', incline: 'incliné', decline: 'décliné',
  halteres: 'haltères', haltere: 'haltère', couche: 'couché', laterales: 'latérales', laterale: 'latérale', posterieures: 'postérieures', posterieur: 'postérieur',
  alternees: 'alternées', alterne: 'alterné', ecarte: 'écarté', epaules: 'épaules', epaule: 'épaule', assis: 'assis', debout: 'debout', pecs: 'pecs', dos: 'dos' };
const pretty = (id: string) => { const t = base(id).replace(/^(push|pull|legs|lib|cardio|abdos)_/, '').replace(/[_-]+/g, ' ').trim().split(/\s+/).map(w => ACCENTS[w.toLowerCase()] ?? w).join(' ');
  return t.charAt(0).toUpperCase() + t.slice(1); };
function nameOf(id: string, names: Record<string, string>): string {
  // 07/11 : recherche EXACTE par id (la recherche floue donnait « Face pull poulie » à 3 exercices différents)
  const b = base(id);
  return names[b] ?? ALL_EXERCISES().find(e => e.id === b)?.name ?? pretty(b);
}

function perEx(s: SessionLog): Map<string, { sets: number; volume: number; topKg: number | null; topReps: number | null; e1rm: number | null }> {
  const m = new Map<string, { sets: number; volume: number; topKg: number | null; topReps: number | null; e1rm: number | null }>();
  for (const z of s.sets) {
    const k = base(z.ex);
    const x = m.get(k) ?? { sets: 0, volume: 0, topKg: null, topReps: null, e1rm: null };
    x.sets++;
    x.volume += (z.kg ?? 0) * (z.reps ?? 0);
    if (z.kg && (x.topKg == null || z.kg > x.topKg)) { x.topKg = z.kg; x.topReps = z.reps ?? null; }
    if (z.kg && z.reps) x.e1rm = Math.max(x.e1rm ?? 0, e1rm(z.kg, z.reps));
    m.set(k, x);
  }
  return m;
}

/** Graphique (image) — 20/11 refait (Kouider : « je comprends rien, plus de détails utiles, il se trompe dans les noms ») :
 *  barres horizontales avec le NOM COMPLET, la charge max d'aujourd'hui vs la DERNIÈRE FOIS sur CET exercice (date à côté),
 *  « kg × reps » écrit sur chaque barre et la flèche ↑/↓ en kg. QuickChart (gratuit, sans clé). */
function chartUrl(r: Pick<SessionReview, 'exercises' | 'prev' | 'date' | 'totals' | 'label'>): string | null {
  const ex = r.exercises.filter(e => e.topKg || e.prev?.topKg).slice(0, 10);
  if (!ex.length) return null;
  const dm = (d?: string) => d ? `${d.slice(8)}/${d.slice(5, 7)}` : '';
  const set = (kg: number | null | undefined, reps: number | null | undefined) => kg ? `${String(kg).replace('.', ',')} kg × ${reps ?? '?'}` : '';
  const wrap = (t: string) => { const out: string[] = []; let line = ''; for (const w of t.split(' ')) { if ((line + ' ' + w).trim().length > 24) { out.push(line); line = w; } else line = `${line} ${w}`.trim(); } if (line) out.push(line); return out; };
  const labels = ex.map(e => {
    const d = e.topKg && e.prev?.topKg ? Math.round((e.topKg - e.prev.topKg) * 10) / 10 : null;
    const tag = e.pr ? '🏆 record' : d == null ? '1ʳᵉ fois' : d > 0 ? `▲ +${String(d).replace('.', ',')} kg` : d < 0 ? `▼ ${String(d).replace('.', ',')} kg`
      : (e.topReps ?? 0) > (e.prev?.topReps ?? 0) ? `▲ +${(e.topReps ?? 0) - (e.prev?.topReps ?? 0)} reps`
      // 20/11 (Kouider : « il dit pareil alors que la dernière fois j'ai fait 1 série et là 3 ») : même charge → on compare les séries
      : e.prev && e.sets > e.prev.sets ? `▲ +${e.sets - e.prev.sets} série${e.sets - e.prev.sets > 1 ? 's' : ''}`
      : e.prev && e.sets < e.prev.sets ? `▼ ${e.sets - e.prev.sets} série${e.prev.sets - e.sets > 1 ? 's' : ''}` : '= pareil';
    return [...wrap(e.name), `${e.sets} séries · ${tag}`];
  });
  const color = (e: ExCompare) => e.pr || (e.e1rm && e.prev?.e1rm && e.e1rm > e.prev.e1rm) || (e.prev && e.e1rm && e.prev.e1rm && e.e1rm >= e.prev.e1rm && e.sets > e.prev.sets) ? '#1f9d55' : e.e1rm && e.prev?.e1rm && e.e1rm < e.prev.e1rm * 0.97 ? '#e8833a' : '#2c63f2';
  const cfg = {
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [
        { label: "Aujourd'hui", data: ex.map(e => e.topKg ?? 0), backgroundColor: ex.map(color), lbl: ex.map(e => e.topKg ? `${set(e.topKg, e.topReps)} · ${e.sets} série${e.sets > 1 ? 's' : ''}` : '') },
        { label: 'Dernière fois sur cet exercice', data: ex.map(e => e.prev?.topKg ?? 0), backgroundColor: '#c7cbd6', lbl: ex.map(e => e.prev?.topKg ? `${set(e.prev.topKg, e.prev.topReps)} · ${e.prev.sets} série${e.prev.sets > 1 ? 's' : ''} (le ${dm(e.prev.date)})` : '1ʳᵉ fois') },
      ],
    },
    options: {
      title: { display: true, fontSize: 20, fontColor: '#111', text: [`${r.label} du ${dm(r.date)} — ta meilleure série par exercice`,
        `${r.totals.sets} séries · ${r.totals.volume.toLocaleString('fr-FR')} kg soulevés${r.totals.durationMin ? ` · ${r.totals.durationMin} min` : ''}   |   vert = plus fort · orange = moins fort`] },
      legend: { position: 'bottom', labels: { fontSize: 15 } },
      layout: { padding: { right: 30 } },
      scales: { xAxes: [{ ticks: { beginAtZero: true, suggestedMax: Math.ceil(Math.max(...ex.map(e => Math.max(e.topKg ?? 0, e.prev?.topKg ?? 0))) * 1.35 / 5) * 5, fontSize: 13, callback: '__KG__' }, scaleLabel: { display: true, labelString: 'Charge (kg)', fontSize: 14 } }],
        yAxes: [{ ticks: { fontSize: 14, fontColor: '#111' } }] },
      plugins: { datalabels: { anchor: 'end', align: 'end', color: '#111', font: { size: 13, weight: 'bold' }, formatter: '__FMT__' } },
    },
  };
  const js = JSON.stringify(cfg).replace('"__FMT__"', '(v, c) => c.dataset.lbl[c.dataIndex]').replace('"__KG__"', '(v) => v + " kg"');
  const h = Math.max(520, 140 + ex.length * 110);
  return `https://quickchart.io/chart?v=2&w=1000&h=${h}&bkg=white&f=png&c=${encodeURIComponent(js)}`;
}

export async function getReview(date: string): Promise<SessionReview | null> {
  try { return JSON.parse((await kvGet(RK(date))) ?? 'null') as SessionReview | null; } catch { return null; }
}

/** Construit le bilan de la séance du jour `date` (après /api/sport/log), le garde et l'envoie sur Telegram. */
export async function buildReview(date: string, o: { names?: Record<string, string>; send?: boolean; planned?: number; extra?: string; rests?: Record<string, number[]>; challenge?: string } = {}): Promise<SessionReview | null> {
  if (o.names) await rememberNames(o.names, date);
  const names = { ...(JSON.parse((await kvGet(NAMES_K).catch(() => null)) ?? '{}') as Record<string, string>), ...(await namesOfDay(date)), ...Object.fromEntries(Object.entries(o.names ?? {}).map(([k, v]) => [base(k), v])) };
  const log0 = await readSportLog();
  // 17/11 : un même exercice peut avoir plusieurs identifiants → tout est ramené à un identifiant par NOM (records, « avant »)
  const kx = await exKeyer(names);
  const canon = new Map<string, string>();
  for (const l of log0) for (const z of l.sets) { const k = kx.key(z.ex); if (!canon.has(k) || l.date === date) canon.set(k, base(z.ex)); }
  const log = log0.map(l => ({ ...l, sets: l.sets.map(z => ({ ...z, ex: canon.get(kx.key(z.ex)) ?? base(z.ex) })) }));
  const cur = log.find(l => l.date === date);
  if (!cur || !cur.sets.length) return null;
  // 17/11 (Kouider : « elle compte encore comme si c'est une séance épaule ») : JAMBES du 17 comparée aux PECS du 16 parce que
  // les deux étaient rangées dans la case « legs ». La « dernière pareille » = la plus récente qui partage vraiment ses exercices.
  const curIds = new Set(cur.sets.map(z => base(z.ex)));
  const shared = (l: SessionLog) => new Set(l.sets.map(z => base(z.ex)).filter(id => curIds.has(id))).size;
  const need = Math.max(1, Math.ceil(curIds.size * 0.3));
  const prevS = log.filter(l => l.date < date && l.sets.length && shared(l) >= need).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const now = perEx(cur), was = prevS ? perEx(prevS) : new Map();
  // Records : meilleure force estimée de chaque exercice avant aujourd'hui (toutes séances)
  const bestBefore = new Map<string, number>();
  for (const l of log) if (l.date < date) for (const z of l.sets) if (z.kg && z.reps) bestBefore.set(base(z.ex), Math.max(bestBefore.get(base(z.ex)) ?? 0, e1rm(z.kg, z.reps)));
  const exercises: ExCompare[] = [];
  for (const [id, x] of now) {
    // 20/11 (Kouider : « le graphique je comprends rien ») : « avant » = la dernière fois qu'il a fait CET exercice,
    // pas seulement la séance d'avant (ancien programme → 4 exercices sur 6 sans comparaison)
    // … y compris sous un autre nom (« Tirage poulie basse assis » = « Rowing assis poulie », même règle que PRÉCÉDENT)
    const nm = nameOf(id, names);
    const hit = (z: { ex: string }) => base(z.ex) === id || sameExercise(nameOf(z.ex, names), nm);
    const pS = was.has(id) ? prevS : log.filter(l => l.date < date && l.sets.some(hit)).sort((a, b) => b.date.localeCompare(a.date))[0];
    const p = pS ? (perEx(pS).get(id) ?? perEx({ ...pS, sets: pS.sets.filter(hit).map(z => ({ ...z, ex: id })) }).get(id)) : undefined;
    exercises.push({ id, name: nameOf(id, names), ...x, prev: p ? { sets: p.sets, volume: p.volume, topKg: p.topKg, e1rm: p.e1rm, topReps: p.topReps, date: pS!.date } : null,
      pr: !!x.e1rm && (bestBefore.get(id) ?? 0) > 0 && x.e1rm > (bestBefore.get(id) ?? 0) });
  }
  const volume = exercises.reduce((a, e) => a + e.volume, 0);
  const sets = cur.sets.length;
  const prevVolRaw = prevS ? prevS.sets.reduce((a, z) => a + (z.kg ?? 0) * (z.reps ?? 0), 0) : 0;
  // 09/11 : « ton volume explose de +439 % » — la séance d'avant n'était notée qu'à moitié (735 kg). Une séance précédente
  // avec moins de la moitié des séries (ou un volume 2,5× plus petit / plus grand) n'est pas comparable : pas de % annoncé.
  const prevOk = !!prevS && prevVolRaw > 0 && prevS.sets.length >= sets * 0.5 && sets >= prevS.sets.length * 0.5 && volume / prevVolRaw <= 2.5 && volume / prevVolRaw >= 0.4;
  const prevVol = prevOk ? prevVolRaw : 0;
  const dur = cur.durationMin ?? null;
  const totals = { sets, volume: Math.round(volume), durationMin: dur, rpe: cur.rpe ?? null, exercises: exercises.length, density: dur ? Math.round(volume / dur) : null };

  // ── Notes /10 (calculées) ──
  const comparable = exercises.filter(e => e.e1rm && e.prev?.e1rm);
  const progRatio = comparable.length ? comparable.reduce((a, e) => a + e.e1rm! / e.prev!.e1rm!, 0) / comparable.length : null;
  const progression = progRatio == null ? (exercises.some(e => e.pr) ? 8 : 6) : clamp10(6 + (progRatio - 1) * 100 / 1.5 + exercises.filter(e => e.pr).length);
  const volScore = prevVol > 0 ? clamp10(7 + (volume / prevVol - 1) * 20) : clamp10(sets >= 16 ? 8 : sets >= 12 ? 7 : sets >= 8 ? 6 : 4);
  const intensite = cur.rpe ? clamp10(cur.rpe >= 7 && cur.rpe <= 9 ? 9 : cur.rpe === 10 ? 7 : cur.rpe === 6 ? 6 : 4) : 6;
  // Régularité : séances des 7 derniers jours (cible 4)
  const since = new Date(Date.parse(`${date}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const week = new Set(log.filter(l => l.date >= since && l.date <= date).map(l => l.date)).size;
  const regularite = clamp10(week / 4 * 10);
  // densité comparée seulement si les 2 séances ont une vraie durée (une séance notée en 11 min faussait tout : 1/10)
  const prevDens = prevS?.durationMin && prevS.durationMin >= 25 && (dur ?? 0) >= 25 ? prevVol / prevS.durationMin : null;
  const densite = totals.density && prevDens ? clamp10(7 + (totals.density / prevDens - 1) * 15) : null;
  const parts = [progression, volScore, intensite, regularite, ...(densite != null ? [densite] : [])];
  const scores = { global: clamp10(parts.reduce((a, b) => a + b, 0) / parts.length), progression, volume: volScore, intensite, regularite, densite };

  // ── Points forts / à améliorer (règles) ──
  const good: string[] = [], improve: string[] = [];
  for (const e of exercises) {
    if (e.pr) good.push(`🏆 Record sur ${e.name} (${e.topKg} kg × ${e.topReps})`);
    else if (e.e1rm && e.prev?.e1rm && e.e1rm > e.prev.e1rm) good.push(`${e.name} : plus fort que la dernière fois (${e.prev.topKg ?? '?'} → ${e.topKg} kg)`);
    else if (e.prev && e.e1rm && e.prev.e1rm && e.e1rm >= e.prev.e1rm && e.sets > e.prev.sets) good.push(`${e.name} : même charge mais ${e.sets} séries au lieu de ${e.prev.sets}`)
    else if (e.e1rm && e.prev?.e1rm && e.e1rm < e.prev.e1rm * 0.93) improve.push(`${e.name} : en baisse (${e.prev.topKg} → ${e.topKg} kg) — sommeil, repas ou repos entre séries ?`);
    if (e.sets <= 2 && (e.prev?.sets ?? 3) >= 3) improve.push(`${e.name} : seulement ${e.sets} série${e.sets > 1 ? 's' : ''} (${e.prev?.sets ?? 3} la dernière fois)`);
  }
  // 20/11 (Kouider : « il me dit pas refait alors que je fais exactement tous les exercices de FORME ») : la séance d'avant
  // venait d'un ancien programme. « Pas refait » = seulement les exercices du PROGRAMME DU JOUR qu'il n'a pas faits.
  const doneKeys = new Set([...now.keys()].map(k => kx.key(k)));
  const plan = await import('./sport-coach.js').then(m => m.liveSessionPlan(date)).catch(() => null);
  const lost = plan?.exercises.length
    ? plan.exercises.filter(e => e.muscle !== 'cardio' && !now.has(base(e.id)) && !doneKeys.has(kx.key(e.id))).map(e => e.id)
    : [];
  if (lost.length) improve.push(`Pas refait : ${lost.slice(0, 3).map(k => nameOf(k, names)).join(', ')}`);
  if (prevVol && volume >= prevVol * 1.05) good.push(`Volume total +${Math.round((volume / prevVol - 1) * 100)} % vs la même séance du ${prevS!.date.slice(8)}/${prevS!.date.slice(5, 7)}`);
  if (cur.rpe && cur.rpe <= 6) improve.push(`Effort ${cur.rpe}/10 : c'était facile → monte un peu les charges la prochaine fois`);
  if (cur.rpe === 10) improve.push('Effort 10/10 : garde 1-2 reps en réserve sur la plupart des séries, tu progresseras plus longtemps');
  if (o.planned && exercises.length < o.planned && !lost.length) improve.push(`${o.planned - exercises.length} exercice(s) du programme non faits`);

  // ── #5 Repos réel entre les séries (secondes mesurées par l'app) ──
  let rests: SessionReview['rests'] = null;
  if (o.rests) {
    const all: number[] = []; const slow: string[] = []; let planned = 0, nP = 0;
    for (const [id, arr] of Object.entries(o.rests)) {
      const v = (arr ?? []).map(Number).filter(x => x >= 15 && x <= 900);
      if (!v.length) continue;
      all.push(...v);
      const ex = findExercise(base(id)); const plan = ex && ex.id.toLowerCase() === base(id).toLowerCase() ? ex.rest : 90;
      planned += plan; nP++;
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      if (m > plan * 1.6 && m - plan > 45) slow.push(`${nameOf(id, names)} (${fmtS(Math.round(m))} au lieu de ${fmtS(plan)})`);
    }
    if (all.length >= 3) rests = { avgSec: Math.round(all.reduce((a, b) => a + b, 0) / all.length), plannedSec: Math.round(planned / Math.max(1, nP)), slow: slow.slice(0, 3) };
  }
  if (rests && rests.slow.length) improve.push(`Repos trop longs : ${rests.slow.join(', ')} — garde le chrono du repos`);
  // ── #10 Défi du jour ──
  let challenge: SessionReview['challenge'] = null;
  if (o.challenge) {
    const e = exercises.find(x => x.id === base(o.challenge!));
    if (e && e.prev?.e1rm) { const met = !!(e.e1rm && e.prev?.e1rm && e.e1rm > e.prev.e1rm) || e.pr; challenge = { name: e.name, met }; (met ? good : improve).push(met ? `🎯 Défi du jour réussi sur ${e.name}` : `🎯 Défi du jour pas réussi sur ${e.name} — on retente la prochaine fois`); }
  }
  // ── #13 Ce mois vs ton meilleur mois (volume) ──
  const byMonth = new Map<string, number>();
  for (const l of log) if (l.date <= date) byMonth.set(l.date.slice(0, 7), (byMonth.get(l.date.slice(0, 7)) ?? 0) + l.sets.reduce((a, z) => a + (z.kg ?? 0) * (z.reps ?? 0), 0));
  const mNow = byMonth.get(date.slice(0, 7)) ?? 0;
  const bestM = [...byMonth.entries()].filter(([m]) => m !== date.slice(0, 7)).sort((a, b) => b[1] - a[1])[0];
  const month = { volume: Math.round(mNow), best: bestM ? { month: bestM[0], volume: Math.round(bestM[1]) } : null };
  if (month.best && mNow > month.best.volume) good.push(`📅 Ce mois bat déjà ton meilleur mois (${month.volume.toLocaleString('fr-FR')} kg)`);
  // ── #16 Prévision : quand tu passeras le palier suivant (+5 kg) à ce rythme ──
  const forecast: NonNullable<SessionReview['forecast']> = [];
  const since42 = new Date(Date.parse(`${date}T12:00:00Z`) - 42 * 86_400_000).toISOString().slice(0, 10);
  for (const e of exercises.filter(x => x.topKg)) {
    const pts = log.filter(l => l.date >= since42 && l.date <= date).map(l => ({ t: Date.parse(`${l.date}T12:00:00Z`) / 86_400_000, kg: Math.max(0, ...l.sets.filter(z => base(z.ex) === e.id && z.kg).map(z => z.kg!)) })).filter(x => x.kg > 0);
    if (pts.length < 3) continue;
    const n = pts.length, mt = pts.reduce((a, x) => a + x.t, 0) / n, mk = pts.reduce((a, x) => a + x.kg, 0) / n;
    const slope = pts.reduce((a, x) => a + (x.t - mt) * (x.kg - mk), 0) / Math.max(1e-9, pts.reduce((a, x) => a + (x.t - mt) ** 2, 0));   // kg / jour
    if (slope <= 0.02) continue;
    const target = (Math.floor(e.topKg! / 5) + 1) * 5;
    const days = Math.ceil((target - e.topKg!) / slope);
    if (days > 120) continue;
    const eta = new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    forecast.push({ name: e.name, target, eta });
  }
  forecast.sort((a, b) => a.eta.localeCompare(b.eta));
  // ── #8 + #9 Sommeil et repas autour de la séance ──
  const sleepH = await import('./sleep-coach.js').then(m => m.sleepStats(date)).then(x => x.last).catch(() => null);
  const yday = new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const food = await import('./forme-food.js').catch(() => null);
  const bY = food ? await food.foodBudget('kouider', yday).catch(() => null) : null;
  const bT = food ? await food.foodBudget('kouider', date).catch(() => null) : null;
  const context = { sleep: sleepH ?? null, kcalYday: bY?.eaten.kcal || null, protYday: bY?.eaten.p || null, protGoal: bY?.proteinGoal ?? null, kcalToday: bT?.eaten.kcal || null };
  if (context.sleep != null && context.sleep < 6) improve.push(`Seulement ${context.sleep} h de sommeil cette nuit : ça pèse sur la force`);
  if (context.protYday && context.protGoal && context.protYday < context.protGoal * 0.7) improve.push(`Protéines hier : ${Math.round(context.protYday)} g sur ${context.protGoal} g — mange plus de protéines la veille`);

  // 11/11 : séance « PECTORAUX & ABDOS » demandée le 10/11 → bilan titré « PECTORAUX & TRICEPS » (nom de la séance type)
  const custom = (JSON.parse((await kvGet('kouider:sport:custom').catch(() => null)) ?? '{}') as Record<string, { label?: string; emoji?: string }>)[date];
  const r: SessionReview = {
    date, at: Date.now(), type: cur.type, label: cur.label ?? custom?.label ?? SESSIONS[cur.type].label, emoji: custom?.emoji ?? SESSIONS[cur.type].emoji, totals,
    prev: prevS ? { date: prevS.date, sets: prevS.sets.length, volume: Math.round(prevVolRaw), comparable: prevOk, durationMin: prevS.durationMin ?? null } : null,
    exercises, scores, avis: '', good: good.slice(0, 6), improve: improve.slice(0, 6), chartUrl: null,
    context, rests, challenge, month, forecast: forecast.slice(0, 3), links: await linksFor(date, scores.global, context),
  };
  r.chartUrl = chartUrl(r);

  // ── Avis du coach (cerveau gratuit, à partir des chiffres ci-dessus uniquement) ──
  const facts = {
    seance: r.label, duree_min: dur, effort: cur.rpe ?? null, series: sets, volume_kg: r.totals.volume, derniere_pareille: r.prev,
    exercices: exercises.map(e => ({ nom: e.name, series: e.sets, max: e.topKg ? `${e.topKg} kg × ${e.topReps ?? '?'}` : null, avant: e.prev?.topKg ?? null, series_avant: e.prev?.sets ?? null, record: e.pr })),
    notes_sur_10: scores, points_forts: r.good, a_ameliorer: r.improve, seances_7_jours: week,
    sommeil_nuit_h: context.sleep, proteines_hier_g: context.protYday, repos_moyen_s: rests?.avgSec ?? null, previsions: r.forecast,
  };
  const out = jsonOf<{ avis?: string; conseils?: string[] }>(await Promise.race([
    ai(`Tu es le coach de musculation de Kouider (objectif : perdre le ventre et du poids, pecs/dos/bras). Voici sa séance d'aujourd'hui, chiffres RÉELS calculés :\n${JSON.stringify(facts)}\n\nRéponds en JSON {"avis": "3 phrases max, en français, tutoiement, honnête et motivant : ce que tu penses de la séance, appuyé sur les chiffres", "conseils": ["2 à 3 conseils concrets pour la prochaine ${r.label} (charge, reps, repos, exercice), seulement s'il y a vraiment quelque chose à améliorer ; sinon liste vide"]}. N'invente AUCUN chiffre absent des données.`, { max: 500 }).catch(() => ''),
    new Promise<string>(res => setTimeout(() => res(''), 25_000)),
  ]));
  r.avis = out?.avis?.trim() || (scores.global >= 8 ? 'Très bonne séance : tu as progressé, continue comme ça.' : scores.global >= 6 ? 'Séance correcte : la base est là, on peut pousser un peu plus la prochaine fois.' : 'Séance en dessous de la dernière : ce n\'est pas grave, regarde les points à améliorer.');
  for (const c of (out?.conseils ?? []).slice(0, 3)) if (c && !r.improve.includes(c)) r.improve.push(String(c).slice(0, 200));
  r.improve = r.improve.slice(0, 6);
  await kvSet(RK(date), JSON.stringify(r), 60 * 86_400).catch(() => {});

  if (o.send !== false) {
    const bar = (n: number) => `${'●'.repeat(Math.round(n / 2))}${'○'.repeat(5 - Math.round(n / 2))}`;
    const vsPrev = r.prev ? ` (dernière ${r.label} le ${r.prev.date.slice(8)}/${r.prev.date.slice(5, 7)} : ${r.prev.sets} séries · ${r.prev.volume.toLocaleString('fr-FR')} kg${r.prev.comparable === false ? ' — séance notée à moitié, PAS comparable : ne donne aucun pourcentage de volume' : ''})` : '';
    const text = [
      `🏁 Bilan de ta séance ${r.emoji} ${r.label} — ${scores.global}/10`,
      `${sets} séries · ${r.totals.volume.toLocaleString('fr-FR')} kg soulevés${dur ? ` · ${dur} min` : ''}${cur.rpe ? ` · effort ${cur.rpe}/10` : ''}${vsPrev}`,
      '',
      `📊 Notes : progression ${scores.progression}/10 ${bar(scores.progression)} · volume ${scores.volume}/10 · intensité ${scores.intensite}/10 · régularité ${scores.regularite}/10${scores.densite != null ? ` · densité ${scores.densite}/10` : ''}`,
      '',
      `💬 ${r.avis}`,
      ...(r.good.length ? ['', '✅ Points forts :', ...r.good.map(x => `• ${x}`)] : []),
      ...(r.improve.length ? ['', '🎯 À améliorer :', ...r.improve.map(x => `• ${x}`)] : ['', '🎯 Rien de spécial à corriger, garde ce rythme.']),
      ...(r.rests ? ['', `⏱️ Repos moyen : ${fmtS(r.rests.avgSec)} (prévu ${fmtS(r.rests.plannedSec)})`] : []),
      ...(r.forecast?.length ? ['', '🔮 À ce rythme :', ...r.forecast.map(f => `• ${f.name} à ${f.target} kg vers le ${f.eta.slice(8)}/${f.eta.slice(5, 7)}`)] : []),
      ...(r.links?.length ? ['', '🔗 Ce que disent tes séances :', ...r.links.map(x => `• ${x}`)] : []),
      ...(r.month?.best ? ['', `📅 Ce mois : ${r.month.volume.toLocaleString('fr-FR')} kg · meilleur mois (${r.month.best.month.slice(5)}/${r.month.best.month.slice(0, 4)}) : ${r.month.best.volume.toLocaleString('fr-FR')} kg`] : []),
      '',
      ...(o.extra ? ['', o.extra] : []),
      '📱 Détail + graphique dans FORME › Entraînement.',
    ].join('\n');
    await queueTelegramMessage(text).catch(() => {});
    if (r.chartUrl) {
      await queueTelegramAlbum(`📈 ${r.label} : ta meilleure série sur chaque exercice, aujourd'hui (couleur) vs la dernière fois (gris)`, [r.chartUrl]).catch(() => {});
    }
    // #1 Bilan vocal (voix du coach, gratuit) — pas pendant le travail
    const atWork = await import('./grand-coach-plus.js').then(m => m.atWorkNow()).catch(() => false);
    if (!atWork) {
      const voice = `Bilan de ta séance ${r.label} : ${scores.global} sur 10. ${r.avis} ${r.improve[0] ? `Pour la prochaine fois : ${r.improve[0].replace(/\(.*?\)/g, '')}.` : ''}`;
      await import('./grand-coach-plus.js').then(m => m.sendVoice(voice, '🎧 Bilan de ta séance en audio')).catch(() => false);
    }
  }
  return r;
}

const fmtS = (sec: number) => sec >= 60 ? `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')}` : `${sec} s`;

/** #8 + #9 : lien sommeil / protéines de la veille ↔ note des séances passées (dès 4 bilans comparables). */
async function linksFor(date: string, global: number, ctx: NonNullable<SessionReview['context']>): Promise<string[]> {
  const past: SessionReview[] = [];
  for (let k = 1; k <= 60; k++) {
    const d = new Date(Date.parse(`${date}T12:00:00Z`) - k * 86_400_000).toISOString().slice(0, 10);
    const x = await getReview(d); if (x?.context) past.push(x);
  }
  const all = [...past, { scores: { global }, context: ctx } as SessionReview];
  const out: string[] = [];
  const cmp = (label: string, good: (r: SessionReview) => boolean | null, yes: string, no: string) => {
    const a = all.filter(r => good(r) === true).map(r => r.scores.global), b = all.filter(r => good(r) === false).map(r => r.scores.global);
    if (a.length < 2 || b.length < 2) return;
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
    if (Math.abs(ma - mb) >= 0.8) out.push(`${label} ${yes} : ${Math.round(ma * 10) / 10}/10 en moyenne, contre ${Math.round(mb * 10) / 10}/10 ${no}`);
  };
  cmp('Après 7 h de sommeil ou plus', r => r.context?.sleep == null ? null : r.context.sleep >= 7, 'tes séances valent', 'après une nuit courte');
  cmp('Quand tu as mangé assez de protéines la veille', r => !r.context?.protYday || !r.context.protGoal ? null : r.context.protYday >= r.context.protGoal * 0.85, 'tes séances valent', 'sinon');
  return out;
}

/** #4 : note moyenne /10 de la semaine (bilans de séance) vs la semaine d'avant — pour le bilan du dimanche. */
export async function weekScoreLine(monday: string): Promise<string> {
  const avgOf = async (from: string) => {
    const v: number[] = [];
    for (let k = 0; k < 7; k++) { const d = new Date(Date.parse(`${from}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10); const r = await getReview(d); if (r) v.push(r.scores.global); }
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null;
  };
  const now = await avgOf(monday), prev = await avgOf(new Date(Date.parse(`${monday}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10));
  if (now == null) return '';
  return `⭐ Note de la semaine : ${now}/10${prev != null ? ` (${now > prev ? '↑' : now < prev ? '↓' : '='} ${prev}/10 la semaine d'avant)` : ''}`;
}
