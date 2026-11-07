// 🏁 BILAN DE SÉANCE (Kouider 07/11 : « à la fin de la séance, qu'il me dise ce qu'il en pense, ce que je devrais améliorer,
// un graphique de ma séance par rapport à la dernière séance pareille, d'autres infos visibles dans l'app, et qu'il m'envoie
// tout sur Telegram avec des notes de 0 à 10 »).
// Tout ce qui est chiffré (volume, séries, records, notes /10) est CALCULÉ par le code depuis son journal ; le cerveau (gratuit)
// écrit seulement l'avis et les conseils à partir de ces chiffres. Gardé 60 j dans app_kv `kouider:sport:review:<date>`.
import { kvGet, kvSet } from './app-store.js';
import { ai, jsonOf } from './ai-util.js';
import { queueTelegramMessage, queueTelegramAlbum } from '../notifications/tg-outbox.js';
import { readSportLog, findExercise, SESSIONS, type SessionLog } from './sport-coach.js';

const RK = (date: string) => `kouider:sport:review:${date}`;
const NAMES_K = 'kouider:sport:exnames';
const base = (id: string) => id.replace(/~.*$/, '');
const e1rm = (kg: number, reps: number) => Math.round(kg * (1 + Math.min(reps, 15) / 30));
const clamp10 = (x: number) => Math.max(0, Math.min(10, Math.round(x)));

export interface ExCompare { id: string; name: string; sets: number; volume: number; topKg: number | null; topReps: number | null; e1rm: number | null;
  prev: { sets: number; volume: number; topKg: number | null; e1rm: number | null } | null; pr: boolean }
export interface SessionReview {
  date: string; at: number; type: string; label: string; emoji: string;
  totals: { sets: number; volume: number; durationMin: number | null; rpe: number | null; exercises: number; density: number | null };
  prev: { date: string; sets: number; volume: number; durationMin: number | null } | null;
  exercises: ExCompare[];
  scores: { global: number; progression: number; volume: number; intensite: number; regularite: number; densite: number | null };
  avis: string; good: string[]; improve: string[]; chartUrl: string | null;
}

/** L'app envoie les noms des exercices (bibliothèque, machines scannées) : gardés pour les bilans suivants. */
export async function rememberNames(names: Record<string, string>): Promise<void> {
  const cur = JSON.parse((await kvGet(NAMES_K).catch(() => null)) ?? '{}') as Record<string, string>;
  for (const [k, v] of Object.entries(names)) if (k && v) cur[base(k)] = String(v).slice(0, 60);
  await kvSet(NAMES_K, JSON.stringify(cur)).catch(() => {});
}
async function nameOf(id: string, names: Record<string, string>): Promise<string> {
  // 07/11 : recherche EXACTE par id (la recherche floue donnait « Face pull poulie » à 3 exercices différents)
  const f = findExercise(base(id));
  return names[base(id)] ?? (f && f.id.toLowerCase() === base(id).toLowerCase() ? f.name : base(id).replace(/^(push|pull|legs|lib)_/, '').replace(/_/g, ' '));
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

/** Graphique (image) : volume par exercice, cette séance vs la dernière du même type — QuickChart (gratuit, sans clé). */
function chartUrl(r: Pick<SessionReview, 'exercises' | 'prev' | 'date'>): string | null {
  const ex = r.exercises.filter(e => e.volume > 0 || (e.prev?.volume ?? 0) > 0).slice(0, 10);
  if (!ex.length) return null;
  const short = (n: string) => n.length > 18 ? `${n.slice(0, 17)}…` : n;
  const cfg = {
    type: 'bar',
    data: {
      labels: ex.map(e => short(e.name)),
      datasets: [
        ...(r.prev ? [{ label: `Dernière (${r.prev.date.slice(8)}/${r.prev.date.slice(5, 7)})`, data: ex.map(e => Math.round(e.prev?.volume ?? 0)), backgroundColor: '#c7cbd6' }] : []),
        { label: `Aujourd'hui (${r.date.slice(8)}/${r.date.slice(5, 7)})`, data: ex.map(e => Math.round(e.volume)), backgroundColor: '#2c63f2' },
      ],
    },
    options: { plugins: { title: { display: true, text: 'Volume par exercice (kg × reps)' }, legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } },
  };
  return `https://quickchart.io/chart?v=4&w=800&h=480&bkg=white&f=png&c=${encodeURIComponent(JSON.stringify(cfg))}`;
}

export async function getReview(date: string): Promise<SessionReview | null> {
  try { return JSON.parse((await kvGet(RK(date))) ?? 'null') as SessionReview | null; } catch { return null; }
}

/** Construit le bilan de la séance du jour `date` (après /api/sport/log), le garde et l'envoie sur Telegram. */
export async function buildReview(date: string, o: { names?: Record<string, string>; send?: boolean; planned?: number; extra?: string } = {}): Promise<SessionReview | null> {
  if (o.names) await rememberNames(o.names);
  const names = { ...(JSON.parse((await kvGet(NAMES_K).catch(() => null)) ?? '{}') as Record<string, string>), ...Object.fromEntries(Object.entries(o.names ?? {}).map(([k, v]) => [base(k), v])) };
  const log = await readSportLog();
  const cur = log.find(l => l.date === date);
  if (!cur || !cur.sets.length) return null;
  const prevS = log.filter(l => l.date < date && l.type === cur.type && l.sets.length).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const now = perEx(cur), was = prevS ? perEx(prevS) : new Map();
  // Records : meilleure force estimée de chaque exercice avant aujourd'hui (toutes séances)
  const bestBefore = new Map<string, number>();
  for (const l of log) if (l.date < date) for (const z of l.sets) if (z.kg && z.reps) bestBefore.set(base(z.ex), Math.max(bestBefore.get(base(z.ex)) ?? 0, e1rm(z.kg, z.reps)));
  const exercises: ExCompare[] = [];
  for (const [id, x] of now) {
    const p = was.get(id);
    exercises.push({ id, name: await nameOf(id, names), ...x, prev: p ? { sets: p.sets, volume: p.volume, topKg: p.topKg, e1rm: p.e1rm } : null,
      pr: !!x.e1rm && (bestBefore.get(id) ?? 0) > 0 && x.e1rm > (bestBefore.get(id) ?? 0) });
  }
  const volume = exercises.reduce((a, e) => a + e.volume, 0);
  const sets = cur.sets.length;
  const prevVol = prevS ? prevS.sets.reduce((a, z) => a + (z.kg ?? 0) * (z.reps ?? 0), 0) : 0;
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
    else if (e.e1rm && e.prev?.e1rm && e.e1rm < e.prev.e1rm * 0.93) improve.push(`${e.name} : en baisse (${e.prev.topKg} → ${e.topKg} kg) — sommeil, repas ou repos entre séries ?`);
    if (e.sets <= 2 && (e.prev?.sets ?? 3) >= 3) improve.push(`${e.name} : seulement ${e.sets} série${e.sets > 1 ? 's' : ''} (${e.prev?.sets ?? 3} la dernière fois)`);
  }
  const lost = prevS ? [...was.keys()].filter(k => !now.has(k)) : [];
  if (lost.length) improve.push(`Pas refait : ${(await Promise.all(lost.slice(0, 3).map(k => nameOf(k, names)))).join(', ')}`);
  if (prevVol && volume >= prevVol * 1.05) good.push(`Volume total +${Math.round((volume / prevVol - 1) * 100)} % vs la dernière ${SESSIONS[cur.type].label}`);
  if (cur.rpe && cur.rpe <= 6) improve.push(`Effort ${cur.rpe}/10 : c'était facile → monte un peu les charges la prochaine fois`);
  if (cur.rpe === 10) improve.push('Effort 10/10 : garde 1-2 reps en réserve sur la plupart des séries, tu progresseras plus longtemps');
  if (o.planned && exercises.length < o.planned) improve.push(`${o.planned - exercises.length} exercice(s) du programme non faits`);

  const r: SessionReview = {
    date, at: Date.now(), type: cur.type, label: SESSIONS[cur.type].label, emoji: SESSIONS[cur.type].emoji, totals,
    prev: prevS ? { date: prevS.date, sets: prevS.sets.length, volume: Math.round(prevVol), durationMin: prevS.durationMin ?? null } : null,
    exercises, scores, avis: '', good: good.slice(0, 5), improve: improve.slice(0, 5), chartUrl: null,
  };
  r.chartUrl = chartUrl(r);

  // ── Avis du coach (cerveau gratuit, à partir des chiffres ci-dessus uniquement) ──
  const facts = {
    seance: r.label, duree_min: dur, effort: cur.rpe ?? null, series: sets, volume_kg: r.totals.volume, derniere_pareille: r.prev,
    exercices: exercises.map(e => ({ nom: e.name, series: e.sets, max: e.topKg ? `${e.topKg} kg × ${e.topReps ?? '?'}` : null, avant: e.prev?.topKg ?? null, record: e.pr })),
    notes_sur_10: scores, points_forts: r.good, a_ameliorer: r.improve, seances_7_jours: week,
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
    const vsPrev = r.prev ? ` (dernière ${r.label} le ${r.prev.date.slice(8)}/${r.prev.date.slice(5, 7)} : ${r.prev.sets} séries · ${r.prev.volume.toLocaleString('fr-FR')} kg)` : '';
    const text = [
      `🏁 Bilan de ta séance ${r.emoji} ${r.label} — ${scores.global}/10`,
      `${sets} séries · ${r.totals.volume.toLocaleString('fr-FR')} kg soulevés${dur ? ` · ${dur} min` : ''}${cur.rpe ? ` · effort ${cur.rpe}/10` : ''}${vsPrev}`,
      '',
      `📊 Notes : progression ${scores.progression}/10 ${bar(scores.progression)} · volume ${scores.volume}/10 · intensité ${scores.intensite}/10 · régularité ${scores.regularite}/10${scores.densite != null ? ` · densité ${scores.densite}/10` : ''}`,
      '',
      `💬 ${r.avis}`,
      ...(r.good.length ? ['', '✅ Points forts :', ...r.good.map(x => `• ${x}`)] : []),
      ...(r.improve.length ? ['', '🎯 À améliorer :', ...r.improve.map(x => `• ${x}`)] : ['', '🎯 Rien de spécial à corriger, garde ce rythme.']),
      '',
      ...(o.extra ? ['', o.extra] : []),
      '📱 Détail + graphique dans FORME › Entraînement.',
    ].join('\n');
    await queueTelegramMessage(text).catch(() => {});
    if (r.chartUrl) {
      await queueTelegramAlbum(`📈 ${r.label} : aujourd'hui (bleu) vs la dernière (gris) — volume par exercice`, [r.chartUrl]).catch(() => {});
    }
  }
  return r;
}
