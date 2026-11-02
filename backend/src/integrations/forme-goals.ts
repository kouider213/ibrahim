import { kvSet } from './app-store.js';
import { supabase } from './supabase.js';
import { createAnthropic, QUALITY } from './anthropic-compat.js';
import { localNow } from './morning-routine.js';
import {
  type Uid, readJson, textOf, jsonOf, LANG_RULE, EX_BASE, EX_ALL, exLibFor, imgBlock, photoB64, BUCKET,
  readPhotos, getFormeProfile, readDays, signedPhotoUrls, pushForme, formeTargets, getProgram, readExLog, adaptNextSession, type BodyPhoto, type ExSet,
} from './forme.js';

// FORME — OBJECTIFS & DÉFIS (Kouider 02/11 : « je veux des pecs, des bras, un ventre plat avec abdos :
// avec ma dernière photo il regarde où j'en suis, me dit quels exercices, en combien de temps, crée une image
// de moi à l'arrivée, me donne les deadlines… et d'autres options auxquelles je n'aurais pas pensé »).
// - Objectif = zones choisies (+ note libre) → plan lu sur sa DERNIÈRE photo : niveau actuel par zone, délai réaliste,
//   exercices de la bibliothèque, jalons datés (deadlines), mensurations cibles, habitudes, idées en plus.
// - « Toi à l'arrivée » : image générée à partir de sa photo — fal.ai d'abord (accord Kouider 02/11), sinon gratuit (HF Kontext / Qwen).
// - Défis : quotidiens / total / record / case à cocher, certains comptés tout seuls (séances, pas).
// - « Faire le point » : nouvelle photo → nouveau plan, historique des niveaux → en avance ou en retard.
// Données privées : app_kv + bucket privé uniquement (dépôt public).

export const GOAL_ZONES = [
  { id: 'pecs', label: 'Pecs', emoji: '🫁' },
  { id: 'bras', label: 'Bras', emoji: '💪' },
  { id: 'abdos', label: 'Ventre plat + abdos', emoji: '🔥' },
  { id: 'epaules', label: 'Épaules larges', emoji: '🏔️' },
  { id: 'dos', label: 'Dos en V', emoji: '🦅' },
  { id: 'jambes', label: 'Jambes', emoji: '🦵' },
  { id: 'posture', label: 'Posture droite', emoji: '🧍' },
  { id: 'force', label: 'Plus de force', emoji: '🏋️' },
] as const;
type ZoneId = typeof GOAL_ZONES[number]['id'];
const ZONE_IDS = GOAL_ZONES.map(z => z.id) as string[];

export interface GoalZone { id: string; label: string; now: number | null; note: string; weeks: number }   // now = null : pas visible sur ses photos → pas de chiffre inventé
export interface GoalEx { id: string; name: string; muscle: string; sets: number; reps: string; why: string; img: string }
export interface Milestone { week: number; date: string; title: string; check: string; done?: number; metric?: 'poids' | 'mensurations' | 'seances' | 'photo'; value?: number; auto?: boolean }
export interface GoalPlan {
  at: number; photoId: string; photoDate: string; seen: string; visible: 'oui' | 'partiel' | 'non';
  summary: string; zones: GoalZone[]; weeks: number; eta: string;
  weekly: { sessions: number; cardio: string; steps: number; protein: number };
  exercises: GoalEx[]; milestones: Milestone[]; measures: Array<{ what: string; now?: number; target: number; unit: string }>;
  focus: { zones: string[]; why: string; split: string };   // ce que le coach priorise (et pourquoi), répartition dans la semaine
  habits: string[]; ideas: string[]; challenges: Array<Pick<Challenge, 'title' | 'emoji' | 'kind' | 'target' | 'unit' | 'days'>>; warning?: string;
}
export interface Challenge {
  id: string; title: string; emoji: string; unit: string;
  kind: 'daily' | 'total' | 'record' | 'check';   // daily = X par jour pendant N jours ; total = cumul ; record = meilleur score ; check = fait / pas fait chaque jour
  target: number; days: number; start: string; log: Record<string, number>;
  auto?: 'sessions' | 'steps'; done?: number;
}
export interface Vision { status: 'running' | 'done' | 'error'; at: number; photoId: string; path?: string; error?: string; prompt?: string }
export interface ChatMsg { role: 'moi' | 'coach'; text: string; at: number }
export interface AutoLog { at: number; date: string; status: 'avance' | 'ok' | 'retard' | 'inconnu'; text: string; changes: string[] }
export interface GoalState { zones: string[]; note: string; priority: string[]; chat: ChatMsg[]; at: number; wantBy?: string; startKg?: number; autoAdjust?: boolean; log?: AutoLog[]; plan?: GoalPlan; history: Array<{ date: string; levels: Record<string, number> }>; vision?: Vision; challenges: Challenge[] }

const GK = (u: Uid) => `${u}:forme:goals`;
const empty = (): GoalState => ({ zones: [], note: '', priority: [], chat: [], at: 0, history: [], challenges: [] });
const read = async (uid: Uid) => ({ ...empty(), ...await readJson<Partial<GoalState>>(GK(uid), {}) }) as GoalState;
const save = (uid: Uid, s: GoalState) => kvSet(GK(uid), JSON.stringify(s));
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// ── Défis prêts à lancer ────────────────────────────────────────────────────
export const CHALLENGE_PRESETS: Array<Pick<Challenge, 'title' | 'emoji' | 'kind' | 'target' | 'unit' | 'days' | 'auto'> & { for: string[] }> = [
  { title: '100 pompes par jour', emoji: '💥', kind: 'daily', target: 100, unit: 'pompes', days: 30, for: ['pecs', 'bras', 'epaules'] },
  { title: 'Gainage : tenir 2 minutes', emoji: '🧱', kind: 'record', target: 120, unit: 's', days: 42, for: ['abdos', 'posture'] },
  { title: 'Gainage chaque jour', emoji: '🔥', kind: 'check', target: 1, unit: 'fait', days: 30, for: ['abdos'] },
  { title: '10 tractions d\'affilée', emoji: '🦅', kind: 'record', target: 10, unit: 'tractions', days: 56, for: ['dos', 'bras'] },
  { title: '1 000 dips en un mois', emoji: '🔱', kind: 'total', target: 1000, unit: 'dips', days: 30, for: ['pecs', 'bras'] },
  { title: '24 séances en 8 semaines', emoji: '🏋️', kind: 'total', target: 24, unit: 'séances', days: 56, auto: 'sessions', for: ['force', 'pecs', 'bras', 'dos', 'jambes', 'epaules', 'abdos'] },
  { title: '10 000 pas par jour', emoji: '👟', kind: 'daily', target: 10000, unit: 'pas', days: 21, auto: 'steps', for: ['abdos'] },
  { title: 'Zéro soda, zéro sucrerie', emoji: '🚫', kind: 'check', target: 1, unit: 'jour propre', days: 30, for: ['abdos'] },
  { title: '100 squats par jour', emoji: '🦵', kind: 'daily', target: 100, unit: 'squats', days: 30, for: ['jambes'] },
  { title: 'Mur postural 5 min/jour', emoji: '🧍', kind: 'check', target: 1, unit: 'fait', days: 21, for: ['posture'] },
];

// ── Lecture pour l'appli ────────────────────────────────────────────────────
/** Jours d'entraînement, TOUTES sources (comme Insights) : journal du coach sport, séances FORME, exercices notés.
 * 02/11 : ne lire que FORME affichait « 1 séance sur 8 » alors qu'il en avait fait 5 → faux retard. */
export async function trainedDays(uid: Uid, days?: Record<string, { workout?: unknown }>): Promise<Set<string>> {
  const d = days ?? await readDays(uid);
  const out = new Set<string>(Object.entries(d).filter(([, x]) => x.workout).map(([k]) => k));
  for (const l of Object.values(await readExLog(uid).catch(() => ({} as Record<string, ExSet[]>)))) for (const x of l) out.add(x.date);
  if (uid === 'kouider') {
    const log = await import('./sport-coach.js').then(m => m.readSportLog()).catch(() => []);
    for (const x of log) if (x.sets.length || x.durationMin == null || x.durationMin >= 5) out.add(x.date);   // une entrée d'1 min sans série = un essai, pas une séance
  }
  return out;
}

// Remplissage AUTOMATIQUE (Kouider 02/11) : séances validées, pas de la montre, et répétitions notées dans ses séances
const EX_OF: Array<[RegExp, string[]]> = [
  [/pompe/i, ['Pushups', 'Incline_Push-Up']], [/traction/i, ['Pullups', 'Chin-Up', 'Band_Assisted_Pull-Up']],
  [/dips/i, ['Bench_Dips', 'Dips_-_Chest_Version', 'Dips_-_Triceps_Version']], [/squat/i, ['Bodyweight_Squat', 'Goblet_Squat']],
  [/gainage|planche/i, ['Plank', 'Side_Bridge']], [/crunch|abdo/i, ['Crunches', 'Dead_Bug']],
];
export function autoSource(c: Pick<Challenge, 'title' | 'unit' | 'auto'>): { kind: 'sessions' | 'steps' | 'ex'; ids: string[] } | null {
  if (c.auto) return { kind: c.auto, ids: [] };
  const t = `${c.unit} ${c.title}`;
  if (/séance/i.test(t)) return { kind: 'sessions', ids: [] };
  if (/\bpas\b/i.test(c.unit)) return { kind: 'steps', ids: [] };
  for (const [re, ids] of EX_OF) if (re.test(t)) return { kind: 'ex', ids };
  return null;
}
function challengeView(c: Challenge, days: Record<string, { workout?: unknown; steps?: number }>, exlog: Record<string, ExSet[]> = {}, trained: Set<string> = new Set()) {
  const today = localNow().date;
  const log: Record<string, number> = { ...c.log };
  const src = autoSource(c);
  if (src?.kind === 'sessions') for (const d of trained) { if (d >= c.start) log[d] = Math.max(log[d] ?? 0, 1); }
  if (src?.kind === 'steps') for (const [d, v] of Object.entries(days)) if (d >= c.start && v.steps) log[d] = Math.max(log[d] ?? 0, v.steps);
  if (src?.kind === 'ex') {
    // gainage (case à cocher) = un gainage noté ce jour-là ; record = meilleure série ; sinon total des répétitions du jour
    const per: Record<string, number> = {};
    for (const id of src.ids) for (const x of exlog[id] ?? []) if (x.date >= c.start) {
      const r = c.kind === 'check' ? 1 : x.reps ?? 0;
      per[x.date] = c.kind === 'record' || c.kind === 'check' ? Math.max(per[x.date] ?? 0, r) : (per[x.date] ?? 0) + r;
    }
    for (const [d, n] of Object.entries(per)) if (n) log[d] = Math.max(log[d] ?? 0, n);
  }
  const end = addDays(c.start, c.days - 1);
  const dayNo = Math.min(c.days, Math.max(1, dayDiff(c.start, today) + 1));
  const vals = Object.entries(log).filter(([d]) => d >= c.start && d <= end);
  let progress = 0; let label = '';
  if (c.kind === 'daily' || c.kind === 'check') {
    const ok = vals.filter(([, v]) => v >= c.target).length;
    progress = ok / c.days; label = `${ok} / ${c.days} jours réussis`;
  } else if (c.kind === 'total') {
    const sum = vals.reduce((a, [, v]) => a + v, 0);
    progress = sum / c.target; label = `${sum} / ${c.target} ${c.unit}`;
  } else {
    const best = Math.max(0, ...Object.values(log));
    progress = best / c.target; label = `record ${best} / ${c.target} ${c.unit}`;
  }
  // Rythme : où il devrait en être aujourd'hui
  const expected = c.kind === 'record' ? null : dayNo / c.days;
  return { ...c, log, end, dayNo, autoFill: src ? (src.kind === 'ex' ? 'tes séances notées' : src.kind === 'sessions' ? 'tes séances validées' : 'les pas de ta montre') : null, today: log[today] ?? 0, progress: Math.min(1, progress), label, finished: today > end, late: expected != null && progress + 0.05 < expected * (c.kind === 'total' ? 1 : 0.9) };
}

export async function goalsOverview(uid: Uid) {
  const s = await read(uid);
  const days = await readDays(uid);
  const exlog = await readExLog(uid).catch(() => ({}));
  const trained = await trainedDays(uid, days);
  if (s.plan && autoMilestones(s, days, trained)) await save(uid, s);
  let visionUrl: string | null = null;
  if (s.vision?.path) { const { data } = await supabase.storage.from(BUCKET).createSignedUrl(s.vision.path, 3600); visionUrl = data?.signedUrl ?? null; }
  const photos = await readPhotos(uid);
  const ph = s.plan ? photos.find(p => p.id === s.plan!.photoId) : null;
  const latest = latestPhoto(photos);
  // 02/11 (Kouider : « l'évolution avec des images, pas une explication ») : toutes ses photos de suivi, par pose, dans l'ordre
  const sorted = [...photos].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const evo = sorted.slice(-24);
  const urls = await signedPhotoUrls([...new Map([ph, latest, ...evo].filter(Boolean).map(x => [x!.id, x!])).values()] as BodyPhoto[]);
  const weightOn = (d: string) => { const w = Object.entries(days).filter(([k, x]) => k <= d && (x as { weight?: number }).weight).sort(([a], [b]) => b.localeCompare(a))[0]; return w ? (w[1] as { weight?: number }).weight ?? null : null; };
  const evolution = evo.filter(x => urls[x.id]).map(x => ({ id: x.id, date: x.date, pose: x.pose, url: urls[x.id]!, kg: x.weight ?? weightOn(x.date) }));
  // Une photo plus récente que le plan → on propose de « faire le point »
  const recheck = !!(s.plan && latest && latest.id !== s.plan.photoId && latest.date > s.plan.photoDate);
  const nextMilestone = s.plan?.milestones.find(m => !m.done) ?? null;
  return {
    zones: GOAL_ZONES, presets: CHALLENGE_PRESETS, state: { ...s, challenges: s.challenges.map(c => challengeView(c, days, exlog, trained)) }, pace: s.plan ? await pace(uid, s, days, trained).catch(() => null) : null,
    planPhotoUrl: ph ? urls[ph.id] ?? null : null, latest: latest ? { id: latest.id, date: latest.date, url: urls[latest.id] ?? null } : null,
    visionUrl, recheck, nextMilestone, evolution,
  };
}

const latestPhoto = (photos: BodyPhoto[]) => [...photos].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).find(p => p.pose === 'face') ?? photos[photos.length - 1] ?? null;

// ── Le plan : dernière photo + objectif → où il en est, exercices, délai, jalons ────
export async function makeGoalPlan(uid: Uid, o: { zones?: string[]; note?: string; photoId?: string; priority?: string[]; wantBy?: string }): Promise<GoalState> {
  const s = await read(uid);
  const zones = (o.zones ?? s.zones).filter(z => ZONE_IDS.includes(z)).slice(0, 8);
  if (!zones.length) throw new Error('Choisis au moins un objectif (pecs, bras, ventre…)');
  const note = String(o.note ?? s.note ?? '').slice(0, 500);
  const wantBy = o.wantBy !== undefined ? (/^\d{4}-\d{2}-\d{2}$/.test(o.wantBy) ? o.wantBy : '') : s.wantBy ?? '';
  const priority = (o.priority ?? s.priority ?? []).filter(z => zones.includes(z));
  const talk = s.chat.slice(-8).map(m => `${m.role === 'moi' ? 'LUI' : 'COACH'} : ${m.text}`).join('\n');
  const photos = await readPhotos(uid);
  const ph = (o.photoId ? photos.find(p => p.id === o.photoId) : null) ?? latestPhoto(photos);
  if (!ph) throw new Error('Prends d\'abord une photo de face dans Progrès → Photos de suivi (torse nu ou t-shirt moulant).');
  const prof = await getFormeProfile(uid);
  const days = await readDays(uid);
  const lastMeasures = Object.entries(days).sort().reverse().find(([, d]) => d.measures && Object.keys(d.measures).length)?.[1].measures ?? {};
  const weight = Object.entries(days).sort().reverse().find(([, d]) => d.weight)?.[1].weight ?? prof.weightKg;
  const lib = exLibFor(prof);
  const today = localNow().date;
  // VÉRITÉ (Kouider 02/11 « vérifie que c'est pas inventé ») : on donne au coach ses VRAIES données et toutes ses poses récentes
  const t = formeTargets(prof);
  const prog = await getProgram(uid).catch(() => null);
  const DN = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const trainDays = (prog?.days ?? []).map(d => DN[d]!);
  const near = (x: BodyPhoto) => Math.abs(dayDiff(x.date, ph.date)) <= 45;
  const others = (['dos', 'profil', 'face'] as const).filter(po => po !== ph.pose)
    .map(po => [...photos].filter(x => x.pose === po && near(x)).sort((a, b) => b.date.localeCompare(a.date))[0]).filter(Boolean) as BodyPhoto[];
  const wanted = zones.map(z => GOAL_ZONES.find(g => g.id === z)!.label).join(', ');
  const prev = s.plan ? `\nPLAN PRÉCÉDENT (${s.plan.photoDate}) : niveaux ${s.plan.zones.map(z => `${z.label} ${z.now ?? '?'}/100`).join(', ')}, arrivée prévue ${s.plan.eta}. Compare honnêtement : en avance, dans les temps ou en retard ?` : '';
  const system = `Tu es le coach physique personnel de ${uid === 'kouider' ? 'Kouider' : prof.name || 'cette personne'} (${prof.sex === 'h' ? 'homme' : 'femme'}, ${prof.age} ans, ${prof.heightCm} cm, ${weight} kg, ${prof.sessionsPerWeek} séances/semaine, salle : ${prof.gym || 'salle de sport'}${uid === 'kouider' ? ', dos à ménager' : ''}).
Il/elle te montre ses photos (la 1re = la plus récente, les autres = autres poses) et ses objectifs.
VÉRITÉ AVANT TOUT — rien d'inventé :
- Tu ne notes une zone QUE si elle est réellement visible sur une des photos (le dos ne se juge PAS sur une photo de face ; jambes couvertes = pas visibles). Sinon "visible": false, "now": null, et la note dit quelle photo prendre.
- "now" est une estimation à l'œil : reste prudent, et la note cite ce que tu VOIS (pas de généralité).
- Tes chiffres de semaine (séances, protéines, pas) et tes JOURS d'entraînement sont ceux qu'on te donne, jamais d'autres.
- Aucune mensuration connue = tu ne fixes PAS de « −X cm » dans les jalons ; "measures" sans "now", et un jalon « prendre ses mensurations de départ » en semaine 1.
- Pas de mots flatteurs ou exagérés (« massif », « point fort », « excellent ») si le muscle n'est pas nettement dessiné sur la photo : décris simplement.
- Abdos visibles = masse grasse basse. Si le ventre est nettement couvert de gras sur la photo, ne promets PAS d'abdos visibles avant au moins 16 semaines ; les premiers résultats réalistes = taille qui baisse, ventre moins gonflé, haut du corps plus net.
- Jamais de détail de peau (vergetures, poils, cicatrices, veines, rougeurs) : sur une photo de téléphone tu ne peux pas le voir de façon sûre.
- Chaque jalon a si possible un \"metric\" vérifiable AUTOMATIQUEMENT par l'appli : poids (value = kg à atteindre ou moins), mensurations (prendre ses mesures), seances (value = nombre de séances depuis le début du plan), photo (nouvelle photo de contrôle).
- Chaque jalon doit être vérifiable avec ce qu'il/elle a (balance, photo, mètre ruban, charges notées). Jamais de % de gras ni de kg de muscle inventés. Ne commente jamais le visage. Bienveillant mais franc.
Pour chaque objectif : "now" = niveau actuel 0-100 (100 = l'objectif atteint, physique naturel réaliste), "weeks" = semaines réalistes pour y arriver en suivant le plan (sans produit dopant ; ventre plat avec abdos visibles = surtout la perte de gras : sois réaliste, souvent 16 à 40 semaines).
Exercices UNIQUEMENT parmi ces identifiants : ${Object.entries(lib).map(([k, v]) => `${k} (${v})`).join(', ')}.
Jalons = deadlines concrètes et vérifiables (un chiffre de force, une mensuration, une photo de contrôle), espacés de 2 à 4 semaines, le dernier = arrivée.
"ideas" = 4 à 6 choses utiles auxquelles il/elle n'aurait PAS pensé (ex. sommeil, ordre des exercices, mensurations, symétrie gauche/droite, posture, progression des charges, photo même lumière…), concrètes et liées à SA photo.
PRIORITÉ : s'il/elle a choisi des muscles prioritaires, ils passent en premier (plus de séries, 2 à 3 fois/semaine, en début de séance). Sinon C'EST TOI qui décides d'après la photo : ce qui est déjà bien (ex. bras déjà dessinés) passe en entretien, ce qui est le plus loin (ex. abdos pas visibles) devient la priorité — et tu le dis clairement dans "focus.why".
PHASES : s'il/elle décrit un ordre (ex. « d'abord le haut du corps, ensuite le bas »), RESPECTE-LE : phase 1 = ses priorités (le reste en simple entretien léger), puis un jalon daté « Bascule phase 2 » quand le haut est au niveau visé, puis la phase 2. Décris les phases dans "focus.split".
"challenges" = 2 ou 3 défis motivants adaptés (kind : daily = X par jour pendant N jours, total = cumul sur N jours, record = atteindre un score une fois, check = case à cocher chaque jour).
Réponds UNIQUEMENT en JSON :
{"seen":"ce que tu vois vraiment (1-2 phrases)","body_visible":"oui|partiel|non","summary":"où il/elle en est, 2-3 phrases","zones":[{"id":"pecs","visible":true,"now":0-100 ou null,"weeks":12,"note":"≤ 110 car., ce que tu vois"}],
"focus":{"zones":["abdos"],"why":"pourquoi ces priorités, en 1-2 phrases, en parlant de SA photo","split":"répartition de la semaine, ex. Lun pecs+bras · Mar abdos+cardio…"},
"weekly":{"sessions":4,"cardio":"ex. 3 × 30 min marche rapide","steps":9000,"protein":160},
"exercises":[{"id":"…","sets":4,"reps":"8-12","why":"≤ 80 car."}],
"milestones":[{"week":3,"title":"≤ 60 car.","check":"comment vérifier (≤ 90 car.)","metric":"poids|mensurations|seances|photo|null","value":78}],
"measures":[{"what":"Tour de taille","now":null,"target":84,"unit":"cm"}],
"habits":["≤ 100 car."],"ideas":["≤ 140 car."],
"challenges":[{"title":"…","emoji":"💥","kind":"daily|total|record|check","target":50,"unit":"pompes","days":30}],
"warning":"seulement si la photo ne permet pas de juger (sinon vide)"}${LANG_RULE(prof.lang)}`;
  const imgs = await Promise.all([ph, ...others].map(x => photoB64(x.path)));
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 2500, system, messages: [{ role: 'user', content: [
    ...imgs.map(imgBlock),
    { type: 'text' as const, text: `Photos dans l'ordre : ${[ph, ...others].map((x, i) => `${i + 1}) ${x.pose} du ${x.date}${x.weight ? ` (${x.weight} kg)` : ''}`).join(' ; ')}. Aujourd'hui : ${today}.
VRAIES DONNÉES (à reprendre telles quelles) : ${weight} kg, objectif balance ${prof.targetKg} kg ; protéines ${t.p} g/jour ; pas ${prof.stepsGoal || 8000}/jour ; ${trainDays.length || prof.sessionsPerWeek} séances/semaine${trainDays.length ? ` les ${trainDays.join(', ')}` : ''}${prog?.sessions.length ? ` (programme actuel : ${prog.sessions.map(x => x.label).join(' / ')})` : ''}.
OBJECTIFS : ${wanted}${note ? ` — ce qu'il/elle veut atteindre, avec ses mots : « ${note} »` : ''}.\nMUSCLES PRIORITAIRES choisis par lui/elle : ${priority.length ? priority.map(z => GOAL_ZONES.find(g => g.id === z)!.label).join(', ') : 'aucun → décide toi-même'}.${talk ? `\nCE QU'IL/ELLE A DIT AU COACH (à respecter) :\n${talk}` : ''}
Mensurations connues : ${Object.entries(lastMeasures).map(([k, v]) => `${k} ${v} cm`).join(', ') || 'AUCUNE (jamais mesuré)'}.${ph.analysis?.summary ? `\nDernière analyse de cette photo : ${ph.analysis.summary}` : ''}${prev}
${wantBy ? `\nIL/ELLE VEUT DÉJÀ VOIR DES RÉSULTATS D'ICI LE ${wantBy} : mets un jalon à cette date avec ce qui sera RÉALISTEMENT visible à ce moment-là (dis-le franchement si c'est court), et organise les premières semaines pour que ce soit le cas.` : ''}\nRéponds dans l'ordre exact des objectifs : ${zones.join(', ')}.` },
  ] }] }, QUALITY);
  const j = jsonOf<Record<string, unknown> & { zones?: Array<Record<string, unknown>>; exercises?: Array<Record<string, unknown>>; milestones?: Array<Record<string, unknown>>; measures?: Array<Record<string, unknown>>; challenges?: Array<Record<string, unknown>>; weekly?: Record<string, unknown> }>(textOf(res));
  const vis = (['oui', 'partiel', 'non'].includes(String(j['body_visible'])) ? j['body_visible'] : 'partiel') as GoalPlan['visible'];
  const gz: GoalZone[] = zones.map((id, i) => {
    const z = (j.zones ?? []).find(x => x['id'] === id) ?? (j.zones ?? [])[i] ?? {};
    const unseen = z['visible'] === false || z['now'] == null || z['now'] === 'null';
    return { id, label: GOAL_ZONES.find(g => g.id === id)!.label, now: unseen ? null : Math.round(clamp(z['now'], 0, 100, 50)), weeks: Math.round(clamp(z['weeks'], 2, 104, 16)), note: String(z['note'] ?? '').slice(0, 140) };
  });
  // filet : une phrase qui parle de la peau est retirée (souvent inventée à cette résolution)
  const SKIN = /\s*\(?[^.()]*\b(vergetures?|cicatrices?|veines?|rougeurs?|cellulite)\b[^.()]*\)?/gi;
  for (const z of gz) z.note = z.note.replace(SKIN, '').trim();
  const weeks = Math.max(...gz.map(z => z.weeks));
  const kinds = ['daily', 'total', 'record', 'check'];
  const plan: GoalPlan = {
    at: Date.now(), photoId: ph.id, photoDate: ph.date, seen: String(j['seen'] ?? '').slice(0, 300), visible: vis,
    summary: String(j['summary'] ?? '').slice(0, 600), zones: gz, weeks, eta: addDays(today, weeks * 7),
    // chiffres de la semaine = ses VRAIS réglages (jamais ceux du modèle)
    weekly: { sessions: trainDays.length || prof.sessionsPerWeek || 4, cardio: String(j.weekly?.['cardio'] ?? '').slice(0, 100), steps: prof.stepsGoal || 8000, protein: t.p },
    exercises: (j.exercises ?? []).filter(e => lib[String(e['id'])]).slice(0, 10).map(e => ({ id: String(e['id']), name: String(e['id']).replace(/_/g, ' '), muscle: EX_ALL[String(e['id'])] ?? '', sets: Math.round(clamp(e['sets'], 1, 8, 3)), reps: String(e['reps'] ?? '10-12').slice(0, 20), why: String(e['why'] ?? '').slice(0, 120), img: `${EX_BASE}/${String(e['id'])}/0.jpg` })),
    milestones: (j.milestones ?? []).slice(0, 10).map(m => {
      const w = Math.round(clamp(m['week'], 1, 104, 4));
      const metric = (['poids', 'mensurations', 'seances', 'photo'].includes(String(m['metric'])) ? m['metric'] : undefined) as Milestone['metric'];
      const value = Number(m['value']);
      return { week: w, date: addDays(today, w * 7), title: String(m['title'] ?? '').slice(0, 80), check: String(m['check'] ?? '').slice(0, 120), ...(metric ? { metric } : {}), ...(metric && Number.isFinite(value) && value > 0 ? { value } : {}) };
    })
      // filet anti-invention : sans mensuration de départ, pas de seuil en cm
      .filter(m => Object.keys(lastMeasures).length || !/\d\s*cm/i.test(`${m.title} ${m.check}`))
      .sort((a, b) => a.week - b.week),
    measures: (j.measures ?? []).slice(0, 5).map(m => ({ what: String(m['what'] ?? '').slice(0, 40), ...(Number(m['now']) > 0 && Object.keys(lastMeasures).length ? { now: Number(m['now']) } : {}), target: clamp(m['target'], 0, 300, 0), unit: String(m['unit'] ?? 'cm').slice(0, 8) })).filter(m => m.what && m.target > 0),
    focus: { zones: (((j['focus'] as Record<string, unknown>)?.['zones'] as unknown[]) ?? []).map(String).filter(z => zones.includes(z)).slice(0, 4), why: String((j['focus'] as Record<string, unknown>)?.['why'] ?? '').slice(0, 300), split: String((j['focus'] as Record<string, unknown>)?.['split'] ?? '').slice(0, 240) },
    habits: ((j['habits'] as unknown[]) ?? []).map(String).slice(0, 6), ideas: ((j['ideas'] as unknown[]) ?? []).map(String).slice(0, 6),
    challenges: (j.challenges ?? []).slice(0, 3).map(c => ({ title: String(c['title'] ?? '').slice(0, 60), emoji: String(c['emoji'] ?? '🎯').slice(0, 4), kind: (kinds.includes(String(c['kind'])) ? c['kind'] : 'daily') as Challenge['kind'], target: Math.round(clamp(c['target'], 1, 100000, 10)), unit: String(c['unit'] ?? '').slice(0, 20), days: Math.round(clamp(c['days'], 3, 120, 30)) })).filter(c => c.title),
    ...(String(j['warning'] ?? '').trim() ? { warning: String(j['warning']).slice(0, 300) } : {}),
  };
  // Les jalons déjà cochés restent cochés s'ils portent le même titre
  for (const m of plan.milestones) { const old = s.plan?.milestones.find(x => x.title === m.title && x.done); if (old) m.done = old.done; }
  const fresh = await read(uid);   // la génération d'image a pu écrire pendant ce temps
  fresh.zones = zones; fresh.note = note; fresh.priority = priority; fresh.wantBy = wantBy || undefined; fresh.startKg = weight; fresh.at = Date.now(); fresh.plan = plan;
  fresh.history = [...fresh.history.filter(h => h.date !== ph.date), { date: ph.date, levels: Object.fromEntries(gz.filter(z => z.now != null).map(z => [z.id, z.now!])) }].sort((a, b) => a.date.localeCompare(b.date)).slice(-40);
  await save(uid, fresh);
  return fresh;
}

// ── « Toi à l'arrivée » : image générée à partir de sa photo (gratuit, Hugging Face) ────
const HF_KONTEXT = 'https://black-forest-labs-flux-1-kontext-dev.hf.space/gradio_api';
const HF_QWEN = 'https://multimodalart-qwen-image-edit-fast.hf.space/gradio_api';
const ZONE_EN: Record<ZoneId, string> = {
  pecs: 'a fuller, well-defined muscular chest', bras: 'bigger, defined arms with visible biceps and triceps', abdos: 'a flat lean stomach with visible abs, slimmer waist',
  epaules: 'broader rounded shoulders', dos: 'a wider V-shaped back', jambes: 'stronger defined legs', posture: 'an upright confident posture', force: 'an athletic strong build',
};

export async function startVision(uid: Uid): Promise<Vision> {
  const s = await read(uid);
  if (!s.plan) throw new Error('Crée d\'abord ton objectif : l\'image part de ta photo du plan.');
  if (s.vision?.status === 'running' && Date.now() - s.vision.at < 8 * 60_000) return s.vision;
  const photos = await readPhotos(uid);
  const ph = photos.find(p => p.id === s.plan!.photoId);
  if (!ph) throw new Error('La photo du plan a été supprimée : refais le plan avec une photo récente.');
  const prof = await getFormeProfile(uid);
  const months = Math.max(1, Math.round(s.plan.weeks / 4.3));
  const prompt = `Edit this photo of the ${prof.sex === 'h' ? 'man' : 'woman'}: keep the exact same person, same face, same skin tone, same hair, same pose, same camera angle, same clothes and same background and lighting. Only change the body so it looks like after ${months} months of serious natural training and clean diet: ${s.zones.map(z => ZONE_EN[z as ZoneId]).filter(Boolean).join(', ')}. Realistic natural physique, not a bodybuilder, photorealistic, no text.`;
  const v: Vision = { status: 'running', at: Date.now(), photoId: ph.id, prompt };
  s.vision = v; await save(uid, s);
  void (async () => {
    let out: Vision;
    try {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(ph.path, 1800);
      if (!data?.signedUrl) throw new Error('photo illisible');
      const { hfGradio, hfFail } = await import('../marketing/video-studio.js');
      let url: string | undefined;
      // 1) fal.ai (Nano Banana, ~0,04 $) — Kouider 02/11 : OK pour cette image ; plus de crédit → gratuits
      const vs = await import('../marketing/video-studio.js');
      if (process.env['FAL_KEY'] && !await vs.falEmptyNow().catch(() => true)) {
        try {
          const r = await vs.falRun('fal-ai/nano-banana/edit', { prompt, image_urls: [data.signedUrl], num_images: 1, output_format: 'jpeg' }, 300_000);
          url = (r['images'] as Array<{ url: string }> | undefined)?.[0]?.url;
          if (url) await vs.addSpent(0.04).catch(() => {});
        } catch (e) {
          console.warn('[forme-goals] fal.ai :', String(e).slice(0, 200));
          if (/crédit|balance|exhausted|locked|402|403/i.test(String(e))) await vs.markFalEmpty().catch(() => {});
        }
      }
      // 2) sinon 2 générateurs gratuits l'un après l'autre (FLUX Kontext, puis Qwen Image Edit)
      const file = { path: data.signedUrl, meta: { _type: 'gradio.FileData' } };
      if (!url) for (const [base, args] of [[HF_KONTEXT, [file, prompt, 0, true, 2.5, 28]], [HF_QWEN, [file, prompt, 0, true, 1.0, 8, false]]] as const) {
        try { const r = await hfGradio(base, 'infer', [...args], 300_000); url = (r[0] as { url?: string } | undefined)?.url; if (url) break; }
        catch (e) { await hfFail(e); }
      }
      if (!url) throw new Error('fal.ai sans crédit et générateurs gratuits saturés en ce moment : réessaie dans quelques heures (bouton ci-dessous).');
      const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!img.ok) throw new Error(`téléchargement image ${img.status}`);
      const path = `${uid}/vision-${Date.now().toString(36)}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(path, Buffer.from(await img.arrayBuffer()), { contentType: img.headers.get('content-type') || 'image/jpeg', upsert: true });
      if (up.error) throw new Error(up.error.message);
      if (s.vision?.path) await supabase.storage.from(BUCKET).remove([s.vision.path]).catch(() => {});
      out = { status: 'done', at: Date.now(), photoId: ph.id, path, prompt };
      await pushForme(uid, '🔮 Toi à l\'arrivée', 'Ton image « objectif atteint » est prête.', '/ibrahim/forme/?tab=body', 'forme-goal').catch(() => false);
    } catch (e) {
      out = { status: 'error', at: Date.now(), photoId: ph.id, error: e instanceof Error ? e.message : String(e), ...(s.vision?.path ? { path: s.vision.path } : {}) };
    }
    const cur = await read(uid); cur.vision = out; await save(uid, cur);
  })();
  return v;
}

// ── Jalons et défis ─────────────────────────────────────────────────────────
export async function toggleMilestone(uid: Uid, i: number, done: boolean): Promise<GoalState> {
  const s = await read(uid);
  const m = s.plan?.milestones[i];
  if (!m) throw new Error('jalon introuvable');
  if (done) m.done = Date.now(); else delete m.done;
  await save(uid, s);
  return s;
}

export async function challengeAction(uid: Uid, b: { action?: string; id?: string; preset?: number; custom?: Partial<Challenge>; value?: number; date?: string; fromPlan?: number }): Promise<void> {
  const s = await read(uid);
  const today = localNow().date;
  if (b.action === 'add') {
    const src = b.preset != null ? CHALLENGE_PRESETS[b.preset] : b.fromPlan != null ? s.plan?.challenges[b.fromPlan] : b.custom;
    if (!src?.title) throw new Error('défi introuvable');
    if (s.challenges.some(c => c.title === src.title && !c.done && today <= addDays(c.start, c.days - 1))) throw new Error('Ce défi est déjà en cours');
    const kinds = ['daily', 'total', 'record', 'check'];
    s.challenges.push({ id: Date.now().toString(36), title: String(src.title).slice(0, 60), emoji: String(src.emoji ?? '🎯').slice(0, 4), unit: String(src.unit ?? '').slice(0, 20),
      kind: (kinds.includes(String(src.kind)) ? src.kind : 'daily') as Challenge['kind'], target: Math.round(clamp(src.target, 1, 100000, 10)), days: Math.round(clamp(src.days, 3, 365, 30)),
      start: today, log: {}, ...('auto' in src && src.auto ? { auto: src.auto } : {}) });
    s.challenges = s.challenges.slice(-20);
  } else {
    const c = s.challenges.find(x => x.id === b.id);
    if (!c) throw new Error('défi introuvable');
    if (b.action === 'delete') s.challenges = s.challenges.filter(x => x.id !== c.id);
    else if (b.action === 'log') {
      const d = b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : today;
      const v = Math.max(0, Math.round(Number(b.value) || 0));
      // daily/total : on AJOUTE (« +20 pompes ») ; record : on garde le meilleur ; check : 1 = fait, 0 = annulé
      c.log[d] = c.kind === 'record' ? Math.max(c.log[d] ?? 0, v) : c.kind === 'check' ? (v ? 1 : 0) : (c.log[d] ?? 0) + v;
    } else if (b.action === 'reset-day') { delete c.log[today]; }
    else throw new Error('action inconnue');
  }
  await save(uid, s);
}

/** Pour Dzaryx (dossier, coach) : une ligne sur l'objectif physique et les défis. */
export async function goalsText(uid: Uid = 'kouider'): Promise<string> {
  const s = await read(uid);
  if (!s.plan) return '';
  const days = await readDays(uid);
  const next = s.plan.milestones.find(m => !m.done);
  const pc = await pace(uid, s, days).catch(() => null);
  return `${pc ? `Suivi objectif : ${pc.text} ` : ''}Objectif physique : ${s.plan.zones.map(z => `${z.label} ${z.now ?? '?'}/100`).join(', ')} → arrivée ~${s.plan.eta}${next ? ` ; prochain jalon ${next.date} : ${next.title}` : ''}. Défis : ${s.challenges.map(c => challengeView(c, days, {}, new Set())).filter(c => !c.finished && !c.autoFill?.includes('séances')).map(c => `${c.title} (${c.label})`).join(' ; ') || 'aucun'}.`;
}

// ── Parler au coach : n'importe quelle question, et il peut CHANGER l'objectif tout seul ────
export async function goalChat(uid: Uid, message: string): Promise<{ answer: string; changed: boolean }> {
  const msg = message.trim().slice(0, 800);
  if (!msg) throw new Error('Écris ta question');
  const s = await read(uid);
  const prof = await getFormeProfile(uid);
  const p = s.plan;
  const ctx = p ? `OBJECTIFS : ${s.zones.join(', ')} ; prioritaires choisis : ${s.priority.join(', ') || 'aucun'} ; ses mots : « ${s.note || '—'} »${s.wantBy ? ` ; veut des résultats visibles d'ici le ${s.wantBy}` : ''}.
PLAN (photo du ${p.photoDate}) : ${p.summary} Niveaux : ${p.zones.map(z => `${z.id} ${z.now}/100 (${z.weeks} sem.)`).join(', ')}. Arrivée ~${p.eta}. Priorité du coach : ${p.focus.zones.join(', ')} — ${p.focus.why}. Semaine : ${p.focus.split}. Exercices : ${p.exercises.map(e => e.name).join(', ')}.` : 'Pas encore de plan.';
  const system = `Tu es le coach physique de ${uid === 'kouider' ? 'Kouider' : prof.name || 'cette personne'} dans l'appli FORME. Il/elle peut te demander N'IMPORTE QUOI (exercice, délai, alimentation, douleur, motivation…) et CHANGER son objectif à tout moment.
Réponds court, concret, en tutoyant (≤ 600 caractères), honnête (pas de promesse irréaliste, jamais de produit dopant ; douleur → prudence et médecin si ça persiste).
Si son message change ce qu'il/elle veut (ajouter/retirer un objectif, prioriser un muscle, changer de délai, d'envie…), remplis "change". Objectifs possibles : ${GOAL_ZONES.map(z => `${z.id} (${z.label})`).join(', ')}.
Réponds UNIQUEMENT en JSON : {"answer":"…","change":null | {"zones":["…"] (liste COMPLÈTE si elle change),"priority":["…"],"note":"son objectif reformulé avec ses mots si il change","wantBy":"AAAA-MM-JJ s'il donne une date pour voir des résultats (aujourd'hui : ${localNow().date})"}}${LANG_RULE(prof.lang)}`;
  const hist = s.chat.slice(-10).map(m => `${m.role === 'moi' ? 'LUI' : 'COACH'} : ${m.text}`).join('\n');
  const res = await createAnthropic().messages.create({ model: 'claude-sonnet-5-5', max_tokens: 900, system, messages: [{ role: 'user', content: `${ctx}${hist ? `\n\nDERNIERS ÉCHANGES :\n${hist}` : ''}\n\nSON MESSAGE : ${msg}` }] }, QUALITY);
  const raw = textOf(res);
  let j: { answer?: string; change?: { zones?: string[]; priority?: string[]; note?: string; wantBy?: string } | null };
  try { j = jsonOf(raw); } catch { j = { answer: raw.trim(), change: null }; }
  const answer = String(j.answer ?? '').slice(0, 1200) || 'Je n\'ai pas compris, reformule ?';
  const ch = j.change && typeof j.change === 'object' ? j.change : null;
  const fresh = await read(uid);
  let changed = false;
  if (ch) {
    const zones = Array.isArray(ch.zones) ? ch.zones.map(String).filter(z => ZONE_IDS.includes(z)) : null;
    if (zones?.length && zones.join() !== fresh.zones.join()) { fresh.zones = zones; changed = true; }
    if (Array.isArray(ch.priority)) { const pr = ch.priority.map(String).filter(z => fresh.zones.includes(z)); if (pr.join() !== fresh.priority.join()) { fresh.priority = pr; changed = true; } }
    if (typeof ch.note === 'string' && ch.note.trim() && ch.note.trim() !== fresh.note) { fresh.note = ch.note.trim().slice(0, 500); changed = true; }
    if (typeof ch.wantBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ch.wantBy) && ch.wantBy > localNow().date && ch.wantBy !== fresh.wantBy) { fresh.wantBy = ch.wantBy; changed = true; }
  }
  fresh.chat = [...fresh.chat, { role: 'moi' as const, text: msg, at: Date.now() }, { role: 'coach' as const, text: answer + (changed ? '\n\n✅ J\'ai mis à jour ton objectif — appuie sur « Refaire mon plan » pour le recalculer.' : ''), at: Date.now() }].slice(-30);
  await save(uid, fresh);
  return { answer, changed };
}

/** Réglages directs (sans refaire le plan) : objectifs, priorités, texte libre. */
export async function setGoalPrefs(uid: Uid, b: { zones?: string[]; priority?: string[]; note?: string; wantBy?: string; autoAdjust?: boolean }): Promise<void> {
  const s = await read(uid);
  if (Array.isArray(b.zones)) s.zones = b.zones.map(String).filter(z => ZONE_IDS.includes(z)).slice(0, 8);
  if (Array.isArray(b.priority)) s.priority = b.priority.map(String).filter(z => ZONE_IDS.includes(z));
  s.priority = s.priority.filter(z => s.zones.includes(z));
  if (typeof b.note === 'string') s.note = b.note.slice(0, 500);
  if (typeof b.wantBy === 'string') s.wantBy = /^\d{4}-\d{2}-\d{2}$/.test(b.wantBy) ? b.wantBy : undefined;
  if (typeof b.autoAdjust === 'boolean') s.autoAdjust = b.autoAdjust;
  await save(uid, s);
}

export async function clearGoalChat(uid: Uid): Promise<void> { const s = await read(uid); s.chat = []; await save(uid, s); }

// ── SUIVI AUTOMATIQUE (Kouider 02/11) ───────────────────────────────────────
/** Coche tout seul les jalons vérifiables (poids, mensurations, séances, photo). Renvoie true si quelque chose a changé. */
function autoMilestones(s: GoalState, days: Record<string, { weight?: number; measures?: object; workout?: unknown }>, trained: Set<string>): boolean {
  const p = s.plan!; const start = new Date(p.at).toISOString().slice(0, 10);
  const ws = Object.entries(days).filter(([, d]) => d.weight).sort(([a], [b]) => a.localeCompare(b));
  const lastKg = ws[ws.length - 1]?.[1].weight;
  const measured = Object.entries(days).some(([d, x]) => d >= start && x.measures && Object.keys(x.measures).length);
  const sessions = [...trained].filter(d => d >= start).length;
  let changed = false;
  for (const m of p.milestones) {
    if (m.done) continue;
    const ok = m.metric === 'poids' ? !!(lastKg && m.value && lastKg <= m.value)
      : m.metric === 'mensurations' ? measured
      : m.metric === 'seances' ? !!(m.value && sessions >= m.value)
      : false;   // photo : cochée quand il fait le point (nouveau plan)
    if (ok) { m.done = Date.now(); m.auto = true; changed = true; }
  }
  return changed;
}

export interface Pace { status: AutoLog['status']; text: string; rateWeek: number | null; weightEta: string | null; sessions14: number; planned14: number; next?: { title: string; date: string; projected?: number; target?: number; late: boolean } }

/** Avance ou retard : vraie vitesse de perte (module Sèche, moyenne lissée) + séances faites vs prévues, comparées aux deadlines. */
export async function pace(uid: Uid, s: GoalState, days?: Record<string, { workout?: unknown }>, trained?: Set<string>): Promise<Pace> {
  const d = days ?? await readDays(uid);
  const tr = trained ?? await trainedDays(uid, d);
  const cut = await import('./forme-cut.js').then(m => m.cutStatus(uid));
  const prog = await getProgram(uid).catch(() => null);
  const today = localNow().date;
  const sessions14 = [...tr].filter(k => k > addDays(today, -14)).length;
  const planned14 = Math.max(1, (prog?.days.length ?? 4) * 2);
  const rate = cut.weight.rateWeek;   // kg perdus / semaine (+ = perte), null = pas assez de pesées
  const cur = cut.weight.current;
  const next = s.plan?.milestones.find(m => !m.done && m.metric === 'poids' && m.value);
  let status: AutoLog['status'] = 'inconnu'; const bits: string[] = [];
  let nx: Pace['next'];
  if (next) {
    const wk = Math.max(0, dayDiff(today, next.date) / 7);
    const projected = rate != null ? Math.round((cur - rate * wk) * 10) / 10 : undefined;
    const late = projected != null && projected > next.value! + 0.2;
    nx = { title: next.title, date: next.date, ...(projected != null ? { projected } : {}), target: next.value, late };
    if (projected != null) {
      // semaines nécessaires à ce rythme vs semaines restantes
      const need = rate! > 0.05 ? (cur - next.value!) / rate! : Infinity;
      const diff = Math.round(wk - need);
      status = late ? 'retard' : diff >= 1 ? 'avance' : 'ok';
      bits.push(late ? `À ce rythme (${rate} kg/sem.), tu serais à ${projected} kg le ${next.date.slice(8)}/${next.date.slice(5, 7)} au lieu de ${next.value} kg : la deadline « ${next.title} » ne sera pas tenue.`
        : diff >= 1 ? `Tu perds ${rate} kg/sem. : tu atteins ${next.value} kg environ ${diff} semaine${diff > 1 ? 's' : ''} AVANT la deadline du ${next.date.slice(8)}/${next.date.slice(5, 7)}.`
        : `Tu perds ${rate} kg/sem. : la deadline « ${next.title} » (${next.date.slice(8)}/${next.date.slice(5, 7)}) est tenue.`);
    }
  }
  if (rate == null) bits.push('Pas encore assez de pesées pour mesurer ta vitesse (pèse-toi chaque matin).');
  if (sessions14 < planned14 * 0.75) { bits.push(`Séances : ${sessions14}/${planned14} sur 14 jours — c'est ça qui retarde le plus.`); if (status !== 'inconnu') status = 'retard'; }
  else bits.push(`Séances : ${sessions14}/${planned14} sur 14 jours ✅`);
  return { status, text: bits.join(' '), rateWeek: rate, weightEta: cut.weight.eta, sessions14, planned14, ...(nx ? { next: nx } : {}) };
}

/** Le contrôle : en retard → séance + déficit ajustés (dans les limites sûres du module Sèche), et il est prévenu. */
export async function goalsCheck(uid: Uid, apply = true): Promise<AutoLog> {
  const s = await read(uid);
  if (!s.plan) throw new Error('Pas encore de plan');
  const days = await readDays(uid);
  const trained = await trainedDays(uid, days);
  autoMilestones(s, days, trained);
  const pc = await pace(uid, s, days, trained);
  const changes: string[] = [];
  if (apply && s.autoAdjust !== false && pc.status === 'retard') {
    const cut = await import('./forme-cut.js');
    const st = await cut.cutStatus(uid);
    const behindOnSessions = pc.sessions14 < pc.planned14 * 0.75;
    // Calories : seulement si les séances sont faites (sinon le souci n'est pas l'assiette) et si la règle Sèche le permet
    if (!behindOnSessions && st.decision.deficit != null && st.decision.level === 'down') {
      const nd = await cut.applyCutDecision(uid, st.decision.deficit);
      changes.push(`Déficit calorique : ${st.deficit} → ${nd} kcal/jour (${st.decision.text})`);
    } else if (!behindOnSessions && st.decision.level !== 'down') {
      changes.push(`Calories inchangées : ${st.decision.text}`);
    }
    const pr = (s.priority.length ? s.priority : s.plan.focus?.zones ?? []).map(z => GOAL_ZONES.find(g => g.id === z)?.label ?? z);
    const ad = await adaptNextSession(uid, { focus: `RETARD sur l'objectif : ${behindOnSessions ? 'séances manquées → séance plus courte et faisable, 45 min max' : 'ajoute 10-15 min de cardio en fin de séance (marche inclinée) et garde les charges lourdes'}. Priorité : ${pr.join(', ')}.`, observations: pc.text }).catch(() => null);
    if (ad?.date) changes.push(`Séance du ${ad.date.slice(8)}/${ad.date.slice(5, 7)} refaite pour rattraper le retard`);
  }
  const entry: AutoLog = { at: Date.now(), date: localNow().date, status: pc.status, text: pc.text, changes };
  s.log = [...(s.log ?? []), entry].slice(-20);
  await save(uid, s);
  return entry;
}

/** Dimanche 19h (job forme-weekly) : bilan + ajustements + message. */
export async function goalsWeekly(uid: Uid = 'kouider'): Promise<void> {
  const s = await read(uid);
  if (!s.plan) return;
  const e = await goalsCheck(uid, true);
  const head = e.status === 'avance' ? '🚀 En avance sur ton objectif' : e.status === 'retard' ? '⚠️ En retard sur ton objectif' : e.status === 'ok' ? '✅ Dans les temps' : '📊 Bilan objectif';
  const body = `${e.text}${e.changes.length ? `\n\nJ'ai ajusté :\n• ${e.changes.join('\n• ')}` : ''}`;
  await pushForme(uid, head, body.slice(0, 180), '/ibrahim/forme/?tab=body', 'forme-goal').catch(() => false);
  if (uid === 'kouider') await import('../notifications/tg-outbox.js').then(m => m.queueTelegramMessage(`${head}\n\n${body}`)).catch(() => {});
}
