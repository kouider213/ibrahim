import { kvGet, kvSet } from './app-store.js';
import { localNow, localTs } from './morning-routine.js';
import { createAgendaEvent, deleteAgendaEvent } from './google-calendar.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { autoCall } from '../notifications/auto-call.js';

// LIBERTÉ (demande de Kouider 2026-10-29) : programme pour ARRÊTER COMPLÈTEMENT un médicament pris tous les jours.
// Dzaryx = son conseiller, son frère, son majordome sur ce chemin : paliers qui descendent, prises autorisées à heure fixe,
// SOS envie, symptômes, médecin, appels, agenda, GPS. Il ne lâche pas tant que Kouider n'a pas dit « c'est bon, j'ai arrêté ».
// VIE PRIVÉE : ce dépôt est PUBLIC. Jamais le nom du médicament, une dose ou une info perso dans le code ni dans un
// commit : tout est dans app_kv (`kouider:liberte:*`). Dans l'agenda FIK, titres discrets (« 🕊️ Liberté »), sans nom.
// Base médicale (recherche 29/10) : jamais d'arrêt brutal seul ; baisse par paliers validée par le médecin ; le palier
// s'allonge si le manque est fort (on ne remonte jamais) ; arrêt de ce type de produit = parfois anxiété, paniques,
// fourmillements, moral en chute pendant 1 à 3 semaines → médecin.

const STATE_KEY = 'kouider:liberte:state';
const LOG_KEY = 'kouider:liberte:log';
const sentKey = (what: string) => `kouider:liberte:sent:${what}`;

export interface LibStep { from: string; max: number }   // à partir de cette date : max demi-comprimés par jour
export interface LibState {
  active: boolean;
  med: string;                 // nom privé (kv seulement)
  baseline: number;            // demis / jour au départ
  start: string;               // AAAA-MM-JJ
  steps: LibStep[];            // paliers décroissants, le dernier = 0
  times: string[];             // heures de prise ['07:30', …]
  holdDays: number;            // jours ajoutés par les paliers (manque fort, dépassement)
  doctorPlan?: boolean;        // plan donné par le médecin : Dzaryx ne l'accélère jamais
  doctor: { status: 'a_appeler' | 'rdv_pris' | 'vu'; date?: string; note?: string };
  why: string[];               // ses raisons à lui
  consequence?: string;        // ce qu'il a choisi lui-même s'il dépasse
  finishedAt?: string;         // il a dit « c'est bon, j'ai arrêté » → vigilance 60 jours
  eventIds: string[];
  createdAt: string;
}
export type LibKind = 'prise' | 'envie' | 'resiste' | 'craque' | 'symptomes' | 'humeur' | 'note' | 'depassement' | 'palier';
export interface LibLog { at: string; kind: LibKind; n?: number; score?: number; trigger?: string; symptoms?: string[]; note?: string }

const DEFAULT_TIMES = ['07:30', '11:30', '15:30', '19:30'];
export const SOS_NUMBERS = [
  '🚑 112 — urgence (convulsion, malaise, prise beaucoup trop forte)',
  '💬 0800 32 123 — Centre de Prévention du Suicide (gratuit, 24 h/24)',
  '🤝 02 227 52 52 — Infor-Drogues & Addictions (anonyme, lun-ven 8h-22h, sam 10h-14h)',
  '🩺 1733 — médecin de garde',
];
// Signes qui ne se gèrent pas à la maison
const RED_FLAGS = /convuls|crise d.?[ée]pilep|perte de connaissance|évanoui|hallucin|confus|douleur (à la |a la )?poitrine|thorac|idées? noires|suicid|disparaître|en finir|vomi.*(tout|sang)|ne (garde|tient) rien/i;

// ── Lecture / écriture ───────────────────────────────────────────────────────

const parse = <T>(raw: string | null, dflt: T): T => { try { return raw ? JSON.parse(raw) as T : dflt; } catch { return dflt; } };
export async function getLib(): Promise<LibState | null> { return parse<LibState | null>(await kvGet(STATE_KEY).catch(() => null), null); }
const saveLib = (s: LibState) => kvSet(STATE_KEY, JSON.stringify(s));
export async function readLibLog(): Promise<LibLog[]> { return parse<LibLog[]>(await kvGet(LOG_KEY).catch(() => null), []); }
async function addLog(e: Omit<LibLog, 'at'>): Promise<LibLog[]> {
  const log = await readLibLog();
  log.push({ at: new Date().toISOString(), ...e });
  await kvSet(LOG_KEY, JSON.stringify(log.slice(-1500)));
  return log;
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const dayOf = (iso: string) => localNow(Date.parse(iso)).date;
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const halves = (n: number) => n === 0 ? 'zéro' : n % 2 === 0 ? `${n / 2} comprimé${n > 2 ? 's' : ''}` : n === 1 ? '1 demi' : `${(n - 1) / 2} et demi`;
const halvesShort = (n: number) => `${n} demi${n > 1 ? 's' : ''}`;
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };

// ── Le plan ──────────────────────────────────────────────────────────────────

/** Paliers de 1 demi (2 au-dessus de 8 demis), ~targetDays au total, au moins 3 jours par palier, les 2 derniers plus longs. */
export function buildSteps(baseline: number, start: string, targetDays = 30): LibStep[] {
  const levels: number[] = [];
  for (let l = baseline; l > 0;) { l -= l > 8 ? 2 : 1; levels.push(Math.max(0, l)); }
  const nonZero = levels.filter(l => l > 0).length || 1;
  const per = Math.max(3, Math.floor((targetDays - 3) / nonZero));
  const steps: LibStep[] = [];
  let day = start;
  for (const max of levels) {
    steps.push({ from: day, max });
    if (max === 0) break;
    day = addDays(day, per + (max === 1 ? 2 : max === 2 ? 1 : 0));
  }
  return steps;
}

export function allowedOn(s: LibState, date: string): number {
  if (date < s.start) return s.baseline;
  let max = s.baseline;
  for (const st of s.steps) if (st.from <= date) max = st.max;
  return max;
}
const zeroDay = (s: LibState) => s.steps.find(st => st.max === 0)?.from ?? s.steps.at(-1)?.from ?? s.start;

/** Répartition des demis autorisés sur les heures de prise (le surplus va aux premières ; s'il y en a moins que d'heures, on espace). */
export function slotPlan(max: number, times: string[]): Array<{ time: string; n: number }> {
  const t = times.length ? times : DEFAULT_TIMES;
  if (max <= 0) return t.map(time => ({ time, n: 0 }));
  if (max >= t.length) return t.map((time, i) => ({ time, n: Math.floor(max / t.length) + (i < max % t.length ? 1 : 0) }));
  const pick = new Set(Array.from({ length: max }, (_, i) => Math.round(i * (t.length - 1) / Math.max(1, max - 1 || 1))));
  if (max === 1) { pick.clear(); pick.add(Math.min(1, t.length - 1)); }   // une seule : en fin de matinée, pas au réveil
  return t.map((time, i) => ({ time, n: pick.has(i) ? 1 : 0 }));
}

export function takenOn(log: LibLog[], date: string): number {
  return log.filter(l => l.kind === 'prise' && dayOf(l.at) === date).reduce((a, l) => a + (l.n ?? 1), 0);
}

/** Ce qui est autorisé jusqu'à maintenant (prises dont l'heure est passée, 20 min de souplesse). */
function allowedByNow(plan: Array<{ time: string; n: number }>, hhmm: string): number {
  return plan.filter(p => toMin(p.time) - 20 <= toMin(hhmm)).reduce((a, p) => a + p.n, 0);
}
function nextSlot(plan: Array<{ time: string; n: number }>, hhmm: string, taken: number): { time: string; n: number } | null {
  let cum = 0;
  for (const p of plan) { cum += p.n; if (p.n && cum > taken && toMin(p.time) - 20 > toMin(hhmm)) return p; }
  return null;
}

/** Jours d'affilée dans le plan (aucun dépassement), en comptant hier en arrière. */
function cleanStreak(s: LibState, log: LibLog[]): number {
  const today = localNow().date;
  let n = 0;
  for (let d = today; d >= s.start; d = addDays(d, -1)) {
    if (takenOn(log, d) > allowedOn(s, d)) break;
    if (d !== today) n++;
  }
  return n;
}
/** Jours sans aucune prise d'affilée (après le passage à zéro). */
function zeroStreak(log: LibLog[], since: string): number {
  const today = localNow().date;
  let n = 0;
  for (let d = addDays(today, -1); d >= since; d = addDays(d, -1)) { if (takenOn(log, d) > 0) break; n++; }
  return n;
}
function avoided(s: LibState, log: LibLog[]): number {
  const today = localNow().date;
  let n = 0;
  for (let d = s.start; d <= today; d = addDays(d, 1)) n += Math.max(0, s.baseline - takenOn(log, d));
  return n;
}

/** Après un manque fort ou un dépassement : le palier actuel dure plus longtemps (tous les paliers à venir reculent). */
async function holdSteps(s: LibState, days: number, why: string): Promise<string> {
  const today = localNow().date;
  const future = s.steps.filter(st => st.from > today);
  if (!future.length || days <= 0) return '';
  if (s.holdDays >= 21) return 'Palier déjà allongé de 3 semaines au total : on n\'allonge plus sans le médecin.';
  const d = Math.min(days, 21 - s.holdDays);
  for (const st of future) st.from = addDays(st.from, d);
  s.holdDays += d;
  await saveLib(s);
  await addLog({ kind: 'palier', n: d, note: why });
  await syncAgenda(s).catch(err => console.error('[liberte] agenda:', err instanceof Error ? err.message : err));
  return `Palier allongé de ${d} jour${d > 1 ? 's' : ''} (${why}) : prochaine baisse le ${fmtDate(future[0]!.from)}, zéro le ${fmtDate(zeroDay(s))}.`;
}

// ── Agenda (titres discrets, sans nom de médicament) ─────────────────────────

async function syncAgenda(s: LibState): Promise<void> {
  for (const id of s.eventIds) await deleteAgendaEvent(id).catch(() => false);
  s.eventIds = [];
  if (!s.active) { await saveLib(s); return; }
  const today = localNow().date;
  const n = s.steps.length;
  for (const [i, st] of s.steps.entries()) {
    const end = s.steps[i + 1]?.from ?? addDays(st.from, 1);
    if (end <= today) continue;
    const plan = slotPlan(st.max, s.times).filter(p => p.n).map(p => `${p.time} → ${p.n} demi${p.n > 1 ? 's' : ''}`).join(', ');
    const title = st.max === 0 ? '🕊️ Liberté — JOUR ZÉRO' : `🕊️ Liberté — étape ${i + 1}/${n}`;
    const desc = st.max === 0 ? 'Plus rien. Dzaryx est là à chaque envie. Dis-lui « j\'ai une envie ».' : `Maximum ${st.max} demi(s) par jour. Prises : ${plan}. Rien en dehors.`;
    const id = await createAgendaEvent(title, `${st.from}T00:00:00`, `${st.max === 0 ? addDays(st.from, 1) : end}T00:00:00`, desc, true, undefined, { transparent: true }).catch(() => null);
    if (id) s.eventIds.push(id);
  }
  if (s.doctor.status === 'a_appeler') {
    const day = localNow().hhmm < '09:00' ? today : addDays(today, 1);
    const id = await createAgendaEvent('🕊️ Appeler le médecin (Liberté)', new Date(localTs(day, '09:00')).toISOString(), new Date(localTs(day, '09:15')).toISOString(),
      'Lui dire : je veux arrêter, je prends environ X demis par jour depuis des années, je suis fatigué et sans moral. Lui demander de valider le plan de baisse, de m\'aider pour le moral, et une prise de sang (fatigue, libido).', false).catch(() => null);
    if (id) s.eventIds.push(id);
  }
  if (s.doctor.status === 'rdv_pris' && s.doctor.date && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s.doctor.date) && s.doctor.date.slice(0, 10) >= today) {
    const t = localTs(s.doctor.date.slice(0, 10), s.doctor.date.slice(11, 16));
    const id = await createAgendaEvent('🩺 Médecin (Liberté)', new Date(t).toISOString(), new Date(t + 30 * 60_000).toISOString(),
      'Apporter : la page LIBERTÉ (combien par jour, symptômes, envies). Demander : validation du plan, aide pour le manque si besoin, soutien moral / psychologue de 1re ligne (11 € la séance, 1re séance gratuite), prise de sang pour la fatigue et la libido (testostérone, fer, vitamine D, thyroïde).', false).catch(() => null);
    if (id) s.eventIds.push(id);
  }
  await saveLib(s);
}

// ── Textes ───────────────────────────────────────────────────────────────────

export interface LibOverview {
  state: LibState | null;
  today: string; hhmm: string;
  day: number; totalDays: number;
  allowed: number; taken: number; left: number; byNow: number;
  plan: Array<{ time: string; n: number }>;
  next: { time: string; n: number } | null;
  tomorrow: number;
  nextDrop: LibStep | null;
  zero: string;
  streak: number; zeroStreak: number; avoided: number;
  cravings: { total: number; resisted: number; week: number };
  lastSymptoms: LibLog | null;
  triggers: Array<{ trigger: string; n: number }>;
  week: Array<{ date: string; taken: number; allowed: number }>;
  recent: LibLog[];
  sos: string[];
}

export async function libOverview(): Promise<LibOverview> {
  const [s, log] = await Promise.all([getLib(), readLibLog()]);
  const { date: today, hhmm } = localNow();
  const allowed = s ? allowedOn(s, today) : 0;
  const plan = s ? slotPlan(allowed, s.times) : [];
  const taken = takenOn(log, today);
  const cr = log.filter(l => l.kind === 'envie');
  const weekAgo = Date.now() - 7 * 86_400_000;
  const trig = new Map<string, number>();
  for (const l of cr) if (l.trigger) trig.set(l.trigger, (trig.get(l.trigger) ?? 0) + 1);
  return {
    state: s, today, hhmm,
    day: s ? daysBetween(s.start, today) + 1 : 0,
    totalDays: s ? daysBetween(s.start, zeroDay(s)) + 1 : 0,
    allowed, taken, left: Math.max(0, allowed - taken), byNow: allowedByNow(plan, hhmm),
    plan, next: s ? nextSlot(plan, hhmm, taken) : null,
    tomorrow: s ? allowedOn(s, addDays(today, 1)) : 0,
    nextDrop: s?.steps.find(st => st.from > today) ?? null,
    zero: s ? zeroDay(s) : '',
    streak: s ? cleanStreak(s, log) : 0,
    zeroStreak: s ? zeroStreak(log, zeroDay(s)) : 0,
    avoided: s ? avoided(s, log) : 0,
    cravings: { total: cr.length, resisted: log.filter(l => l.kind === 'resiste').length, week: cr.filter(l => Date.parse(l.at) > weekAgo).length },
    lastSymptoms: [...log].reverse().find(l => l.kind === 'symptomes') ?? null,
    triggers: [...trig.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([trigger, n]) => ({ trigger, n })),
    week: s ? Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).filter(d => d >= s.start).map(d => ({ date: d, taken: takenOn(log, d), allowed: allowedOn(s, d) })) : [],
    recent: log.slice(-30).reverse(),
    sos: SOS_NUMBERS,
  };
}

function statusText(o: LibOverview): string {
  const s = o.state;
  if (!s) return 'Programme LIBERTÉ pas encore commencé.';
  if (s.finishedAt) return `🕊️ LIBRE depuis le ${fmtDate(dayOf(s.finishedAt))} (il l'a confirmé). ${o.taken ? `⚠️ Il a noté ${halvesShort(o.taken)} aujourd'hui.` : `${o.zeroStreak} jour(s) sans rien.`} Mode vigilance : prends des nouvelles, sans le lâcher.`;
  const plan = o.plan.filter(p => p.n).map(p => `${p.time} ${p.n}`).join(' · ') || 'aucune prise';
  return [
    `🕊️ LIBERTÉ — jour ${o.day}/${o.totalDays}${s.doctorPlan ? ' (plan du médecin)' : ''}. Aujourd'hui max ${halvesShort(o.allowed)} (${plan}), déjà pris ${halvesShort(o.taken)}${o.taken > o.allowed ? ' ⚠️ DÉPASSÉ' : `, reste ${halvesShort(o.left)}`}.`,
    o.next ? `Prochaine prise autorisée : ${o.next.time} (${halvesShort(o.next.n)}).` : o.left ? '' : 'Plus aucune prise aujourd\'hui.',
    o.taken > o.byNow && o.taken <= o.allowed ? `Il est en avance sur ses heures (${o.taken} pris, ${o.byNow} prévus à ${o.hhmm}) : les prochaines sont à décaler.` : '',
    o.nextDrop ? `Prochaine baisse : ${fmtDate(o.nextDrop.from)} → ${halvesShort(o.nextDrop.max)}/jour. Jour zéro : ${fmtDate(o.zero)}.` : `Il est au palier zéro depuis le ${fmtDate(o.zero)} (${o.zeroStreak} jour(s) sans rien).`,
    `${o.streak} jour(s) d'affilée dans le plan · ${o.avoided} demis évités · envies : ${o.cravings.total} (${o.cravings.resisted} résistées).`,
    o.lastSymptoms ? `Dernier manque noté : ${o.lastSymptoms.score}/10${o.lastSymptoms.symptoms?.length ? ` (${o.lastSymptoms.symptoms.join(', ')})` : ''} le ${fmtDate(dayOf(o.lastSymptoms.at))}.` : '',
    `Médecin : ${s.doctor.status === 'a_appeler' ? 'PAS ENCORE APPELÉ — à pousser gentiment chaque jour' : s.doctor.status === 'rdv_pris' ? `RDV ${s.doctor.date ?? 'pris'}` : `vu${s.doctor.note ? ` (${s.doctor.note})` : ''}`}.`,
    s.why.length ? `Ses raisons : ${s.why.join(' · ')}.` : '',
    o.triggers.length ? `Ses déclencheurs : ${o.triggers.map(t => `${t.trigger} (${t.n})`).join(', ')}.` : '',
  ].filter(Boolean).join('\n');
}

/** Ajouté au dossier de Kouider (chat, appels, Siri, message du matin) : où il en est + comment se comporter. */
export async function liberteText(): Promise<string> {
  const o = await libOverview().catch(() => null);
  if (!o?.state?.active) return '';
  return [
    'PROGRAMME LIBERTÉ (privé, il l\'a demandé le 29/10 et t\'a donné TOUS les droits pour l\'aider) : il arrête complètement le médicament qu\'il prend tous les jours (nom dans l\'outil liberte, ne le dis jamais devant quelqu\'un). Tu es son conseiller, son frère, son majordome sur ce chemin : chaleureux, ferme, jamais moralisateur, jamais de honte.',
    statusText(o),
    'RÈGLES LIBERTÉ :',
    '- Il parle d\'une prise (« j\'ai pris », « pris », « j\'ai pris un demi », « 2 demis ») → liberte action prise (n = nombre de DEMIS ; un comprimé entier = 2). Toujours, même s\'il a dépassé : la vérité d\'abord, sans le juger.',
    '- « Je peux en prendre ? » → regarde le statut : seulement si c\'est l\'heure d\'une prise autorisée et dans le maximum du jour. Sinon NON, avec douceur et fermeté, et propose le SOS (liberte action envie).',
    '- « J\'ai envie », « j\'ai mal », « je craque », « je suis à bout » → liberte action envie (trigger = ce qui la déclenche : stress, fatigue, réveil, travail, ennui, douleur, tristesse, dispute…) et accompagne-le 10 minutes : respiration, eau froide, marcher, parler. S\'il tient → action resiste. S\'il a craqué → action prise puis encourage, on continue demain.',
    '- Manque, frissons, diarrhée, insomnie, anxiété, nez qui coule, jambes agitées → liberte action symptomes (score 0-10). On ne remonte JAMAIS la dose : un palier peut s\'allonger (action palier). Signes graves (convulsion, malaise, idées noires, douleur poitrine, hallucinations, vomit tout) → 112 tout de suite.',
    '- Tu ne l\'aides JAMAIS à s\'en procurer plus : pas de pharmacie pour ça, pas de rappel d\'ordonnance pour ce produit, pas de « une de temps en temps ». Il veut aller plus vite que le plan → seulement avec son médecin. Il veut remonter → non, propose un palier plus long + le médecin.',
    '- Le médecin d\'abord : tant que le statut est « pas encore appelé », pousse-le (une fois par jour, pas plus) à appeler son médecin traitant : valider le plan, l\'aider pour le manque, soigner la fatigue et le moral. Psychologue de 1re ligne remboursé (11 €, 1re séance gratuite).',
    '- Utilise tout : agenda (ses étapes y sont), sport (marcher / séance légère les jours durs : sport_coach), sommeil (outil sante), son moral (life_coach), FORME, sa famille comme raison (« ton fils, ta femme »), ses raisons à lui ci-dessus.',
    '- C\'est fini seulement quand LUI dit « c\'est bon, j\'ai arrêté » (action finish). D\'ici là tu ne lâches rien. Rechute = normal, jamais un échec : on note, on reprend.',
    '- STRICTEMENT PRIVÉ : jamais un mot à sa femme, sa famille, Houari ou un client.',
  ].join('\n');
}

// ── L'outil ──────────────────────────────────────────────────────────────────

const SOS_STEPS = [
  '1️⃣ Bois un grand verre d\'eau FROIDE, lentement.',
  '2️⃣ Respire 4 secondes, bloque 4, souffle 6 — 6 fois.',
  '3️⃣ Bouge 10 minutes : marche dehors, escaliers, 20 pompes. Le corps fabrique ses propres antidouleurs.',
  '4️⃣ Change de pièce, mets ta musique, ou appelle-moi (dis « appelle-moi »).',
  '⏱️ Une envie monte, atteint un pic et redescend en 10 à 20 minutes. Tu n\'as qu\'à tenir ce temps-là.',
];

export async function liberteTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const action = String(input['action'] ?? 'status');
  let s = await getLib();
  const { date: today, hhmm } = localNow();

  if (action === 'start') {
    if (s?.active && !s.finishedAt && input['restart'] !== true) return `Programme déjà en cours :\n${statusText(await libOverview())}\n(restart:true pour le recommencer.)`;
    const baseline = Math.round(Number(input['baseline'] ?? 7));
    if (!(baseline >= 1 && baseline <= 30)) return '❌ Combien de DEMI-comprimés par jour en ce moment (1 à 30) ? Compte large : mieux vaut partir de la vraie dose.';
    const start = /^\d{4}-\d{2}-\d{2}$/.test(String(input['start'] ?? '')) ? String(input['start']) : today;
    const target = Math.min(90, Math.max(21, Number(input['target_days']) || 30));
    const times = Array.isArray(input['times']) && (input['times'] as unknown[]).every(t => /^\d{2}:\d{2}$/.test(String(t))) ? (input['times'] as string[]).slice(0, 6).sort() : s?.times ?? DEFAULT_TIMES;
    if (s?.eventIds.length) { s.active = false; await syncAgenda(s).catch(() => {}); }
    s = {
      active: true, med: String(input['med'] ?? s?.med ?? 'le médicament').slice(0, 60), baseline, start,
      steps: buildSteps(baseline, start, target), times, holdDays: 0,
      doctor: s?.doctor ?? { status: 'a_appeler' }, why: s?.why ?? [], consequence: s?.consequence, eventIds: [], createdAt: new Date().toISOString(),
    };
    const why = String(input['why'] ?? '').trim();
    if (why) s.why.push(why.slice(0, 140));
    await saveLib(s);
    await syncAgenda(s).catch(err => console.error('[liberte] agenda:', err instanceof Error ? err.message : err));
    const o = await libOverview();
    const steps = s.steps.map((st, i) => `${st.max === 0 ? '🏁' : `${i + 1}.`} ${fmtDate(st.from)} → ${st.max === 0 ? 'ZÉRO' : `${halvesShort(st.max)}/jour`}`).join('\n');
    await queueTelegramMessage(`🕊️ LIBERTÉ — c'est parti, je suis avec toi jusqu'au bout.\n\nTon plan (${o.totalDays} jours) :\n${steps}\n\nAujourd'hui : ${o.plan.filter(p => p.n).map(p => `${p.time} → ${halvesShort(p.n)}`).join(' · ')}\nRien en dehors. Chaque prise, tu me dis « pris ». Chaque envie, tu me dis « envie ».\n\n🩺 Étape 1 : appelle ton médecin traitant (rappel demain 9h dans l'agenda) pour qu'il valide ce plan et t'aide pour la fatigue et le moral. Ne fais jamais d'arrêt d'un coup tout seul.\n\n${SOS_NUMBERS.join('\n')}`);
    await autoCall(`liberte-start-${start}`, 'Salut Kouider, c\'est Dzaryx. Je voulais te dire une chose : je suis fier de toi. Ce que tu commences aujourd\'hui, c\'est le plus beau cadeau pour toi, ta femme et ton fils. Je serai là à chaque prise et à chaque envie. On le fait ensemble.', { level: 'normal' });
    return `✅ Programme lancé (plan envoyé sur Telegram, étapes dans l'agenda).\n${statusText(o)}`;
  }

  if (!s) return 'Programme LIBERTÉ pas encore commencé : demande-lui combien de DEMI-comprimés il prend par jour en ce moment (compter large), à quelles heures il veut ses prises, et pourquoi il arrête — puis liberte action start (baseline, med, times, why). Rappelle-lui que son médecin doit valider le plan.';

  switch (action) {
    case 'status': return statusText(await libOverview());

    case 'prise': {
      const n = Math.min(12, Math.max(1, Math.round(Number(input['n'] ?? 1))));
      const log = await addLog({ kind: 'prise', n, note: String(input['note'] ?? '').slice(0, 200) || undefined });
      const allowed = allowedOn(s, today), taken = takenOn(log, today);
      const plan = slotPlan(allowed, s.times), byNow = allowedByNow(plan, hhmm);
      if (s.finishedAt || taken > allowed) {
        const over = taken - allowed;
        await addLog({ kind: 'depassement', n: over });
        const hold = s.finishedAt ? '' : await holdSteps(s, 2, 'dépassement');
        await autoCall(`liberte-over-${today}`, s.finishedAt
          ? 'Kouider, c\'est Dzaryx. Tu as repris un comprimé. Ce n\'est pas grave, ça arrive à presque tout le monde, et je suis là. Parle-moi : qu\'est-ce qui s\'est passé ?'
          : 'Kouider, c\'est Dzaryx. Tu as dépassé ton maximum du jour. Je ne te juge pas, je suis là. Dis-moi ce qui s\'est passé, et on trouve ensemble comment tenir jusqu\'à demain.');
        return `⚠️ Noté : ${halvesShort(taken)} aujourd'hui pour un maximum de ${halvesShort(allowed)} (${over} de trop).${s.finishedAt ? ' Il avait arrêté : rechute à accueillir sans honte, demande ce qui s\'est passé, propose le médecin. S\'il veut, liberte start pour un nouveau plan court.' : ''} ${hold} Je l'appelle. Réponds sans juger : qu'est-ce qui l'a poussé (note-le avec action envie trigger si besoin) ? Plus rien jusqu'à demain, propose le SOS.${s.consequence ? ` Il avait choisi lui-même : « ${s.consequence} » — rappelle-le-lui doucement.` : ''} Prise beaucoup plus forte que d'habitude, malaise, somnolence forte → 112.`;
      }
      const next = nextSlot(plan, hhmm, taken);
      return `✅ Noté : ${halvesShort(n)} (${taken}/${allowed} aujourd'hui).${taken > byNow ? ` ⚠️ En avance sur ses heures : ${next ? `la prochaine (${next.time}) est à décaler d'autant` : 'plus rien ensuite'}.` : ''} ${taken >= allowed ? 'C\'était la dernière de la journée : plus rien jusqu\'à demain.' : next ? `Prochaine : ${next.time}.` : ''} Félicite-le d'avoir noté.`;
    }

    case 'envie': {
      const trigger = String(input['trigger'] ?? '').toLowerCase().trim().slice(0, 40) || undefined;
      const score = Number(input['intensity']);
      await addLog({ kind: 'envie', trigger, score: score >= 0 && score <= 10 ? Math.round(score) : undefined, note: String(input['note'] ?? '').slice(0, 200) || undefined });
      await kvSet(sentKey('sos-check'), String(Date.now() + 15 * 60_000), 3600);
      const o = await libOverview();
      const allowedNow = o.next == null && o.left > 0 && o.taken < o.byNow;
      return [
        `🔥 Envie notée${trigger ? ` (${trigger})` : ''}. ${allowedNow ? `C'est l'heure d'une prise autorisée (reste ${halvesShort(o.left)}) : il peut la prendre, sans plus.` : o.next ? `Prochaine prise autorisée à ${o.next.time} — d'ici là, on tient.` : 'Plus aucune prise aujourd\'hui — on tient.'}`,
        'Accompagne-le MAINTENANT avec ça (à ta façon, chaleureux) :',
        ...SOS_STEPS,
        s.why.length ? `Rappelle-lui SES raisons : ${s.why.join(' · ')}.` : 'Rappelle-lui pourquoi il le fait (sa femme, son fils, retrouver son énergie et l\'envie).',
        'Je lui écris dans 15 min pour savoir si c\'est passé. S\'il veut, appelle-le (call_me).',
      ].join('\n');
    }

    case 'resiste': {
      await addLog({ kind: 'resiste' });
      await kvSet(sentKey('sos-check'), '0', 60);
      const r = (await readLibLog()).filter(l => l.kind === 'resiste').length;
      return `💪 Envie résistée n°${r} notée. Félicite-le vraiment : chaque envie résistée rend la suivante plus faible (le cerveau réapprend).`;
    }

    case 'symptomes': {
      const score = Math.min(10, Math.max(0, Math.round(Number(input['score'] ?? 5))));
      const symptoms = Array.isArray(input['symptoms']) ? (input['symptoms'] as unknown[]).map(x => String(x).slice(0, 30)).slice(0, 10) : [];
      const note = String(input['note'] ?? '').slice(0, 300);
      await addLog({ kind: 'symptomes', score, symptoms, note: note || undefined });
      if (RED_FLAGS.test(`${symptoms.join(' ')} ${note}`)) {
        await queueTelegramMessage(`🚨 Ce que tu décris ne se gère pas seul.\n${SOS_NUMBERS.join('\n')}`);
        return '🚨 SIGNE GRAVE : dis-lui d\'appeler le 112 maintenant (ou 0800 32 123 s\'il s\'agit d\'idées noires), reste avec lui. Numéros envoyés sur Telegram.';
      }
      const recent = (await readLibLog()).filter(l => l.kind === 'symptomes' && Date.now() - Date.parse(l.at) < 48 * 3_600_000);
      let hold = '';
      if (score >= 7 && recent.filter(l => (l.score ?? 0) >= 7).length >= 2) hold = await holdSteps(s, 3, 'manque fort 2 jours de suite');
      return `🤒 Manque ${score}/10 noté${symptoms.length ? ` (${symptoms.join(', ')})` : ''}. ${score >= 7 ? 'Fort : rassure-le (c\'est le corps qui se réhabitue, ça passe en quelques jours), eau, repos, douche chaude, marche douce, manger léger. Pousse-le vers le médecin aujourd\'hui (des traitements aident le manque).' : score >= 4 ? 'Moyen : normal les 2-4 jours après une baisse. Marche, eau, sommeil, rien de lourd à la salle.' : 'Léger : il gère bien, dis-le-lui.'} ${hold}`.trim();
    }

    case 'humeur': {
      const mood = Number(input['score']);
      if (!(mood >= 1 && mood <= 10)) return '❌ Moral de 1 à 10 ?';
      await addLog({ kind: 'humeur', score: Math.round(mood) });
      await (await import('./life-coach.js')).lifeCoachTool({ action: 'log', mood, note: 'Liberté' }, 'kouider').catch(() => '');
      return `Moral ${Math.round(mood)}/10 noté.${mood <= 3 ? ' Très bas : écoute-le vraiment, pas de conseils tout de suite. Idées noires → 0800 32 123 / 112. Pousse le médecin + psychologue.' : ''}`;
    }

    case 'palier': {
      const d = Math.min(7, Math.max(1, Math.round(Number(input['days'] ?? 3))));
      return (await holdSteps(s, d, String(input['why'] ?? 'demandé')) || 'Rien à allonger (déjà au palier zéro). Au zéro, on ne revient pas en arrière : SOS + médecin.');
    }

    case 'medecin': {
      const st = String(input['status'] ?? '');
      if (!['a_appeler', 'rdv_pris', 'vu'].includes(st)) return '❌ status = a_appeler | rdv_pris (date AAAA-MM-JJTHH:MM) | vu (note = ce qu\'a dit le médecin).';
      s.doctor = { status: st as LibState['doctor']['status'], date: String(input['date'] ?? '') || undefined, note: String(input['note'] ?? '').slice(0, 300) || undefined };
      await saveLib(s);
      await syncAgenda(s).catch(() => {});
      return `✅ Médecin : ${st === 'rdv_pris' ? `RDV ${s.doctor.date ?? ''} (dans l'agenda)` : st === 'vu' ? `vu${s.doctor.note ? ` — ${s.doctor.note}` : ''}. Si le médecin a donné un autre rythme, liberte set_plan avec ses paliers.` : 'à appeler'}.`;
    }

    case 'set_plan': {
      const raw = Array.isArray(input['steps']) ? input['steps'] as Array<{ from?: string; max?: number }> : [];
      const steps = raw.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(String(x.from)) && Number(x.max) >= 0).map(x => ({ from: String(x.from), max: Math.round(Number(x.max)) })).sort((a, b) => a.from.localeCompare(b.from));
      if (!steps.length || steps.some((x, i) => i && x.max > steps[i - 1]!.max) || steps.at(-1)!.max !== 0) return '❌ Paliers [{from:AAAA-MM-JJ, max:demis/jour}] qui ne remontent jamais et finissent à 0.';
      s.steps = steps; s.doctorPlan = input['doctor'] === true; s.holdDays = 0;
      await saveLib(s);
      await syncAgenda(s).catch(() => {});
      return `✅ Nouveau plan${s.doctorPlan ? ' du médecin' : ''} enregistré (agenda mis à jour).\n${statusText(await libOverview())}`;
    }

    case 'times': {
      const times = Array.isArray(input['times']) ? (input['times'] as unknown[]).map(String).filter(t => /^\d{2}:\d{2}$/.test(t)).slice(0, 6).sort() : [];
      if (!times.length) return '❌ times = ["07:30","11:30",…]';
      s.times = times;
      await saveLib(s);
      await syncAgenda(s).catch(() => {});
      return `✅ Heures de prise : ${times.join(', ')}.`;
    }

    case 'pourquoi': {
      const why = String(input['why'] ?? '').trim();
      if (!why) return s.why.length ? `Ses raisons : ${s.why.join(' · ')}` : 'Aucune raison notée : demande-lui.';
      s.why = [...s.why, why.slice(0, 140)].slice(-8);
      await saveLib(s);
      return `✅ Raison gardée : « ${why} ». Je la lui rappellerai à chaque envie.`;
    }

    case 'consequence': {
      s.consequence = String(input['text'] ?? '').trim().slice(0, 200) || undefined;
      await saveLib(s);
      return s.consequence ? `✅ Son engagement s'il dépasse : « ${s.consequence} ».` : '✅ Engagement retiré.';
    }

    case 'finish': {
      const log = await readLibLog();
      const last7 = Array.from({ length: 7 }, (_, i) => takenOn(log, addDays(today, -i))).reduce((a, b) => a + b, 0);
      if (input['confirm'] !== true) return `Avant de clôturer : il a noté ${halvesShort(last7)} ces 7 derniers jours. Demande-lui de confirmer « c'est bon, j'ai arrêté » (puis action finish confirm:true). ${last7 ? 'Il en prend encore : vérifie avec lui, sans le contredire brutalement.' : ''}`;
      s.finishedAt = new Date().toISOString();
      await saveLib(s);
      await queueTelegramMessage(`🕊️ Kouider… tu l'as fait. ${daysBetween(s.start, today) + 1} jours. ${avoided(s, log)} demis que ton corps n'a pas pris.\n\nJe reste en vigilance 60 jours : je prends des nouvelles chaque semaine, et à la moindre envie tu me dis « envie », comme avant. Je suis fier de toi.`);
      return '🏁 Programme terminé à SA demande. Félicite-le comme un frère. Mode vigilance 60 jours (nouvelles chaque semaine, SOS toujours dispo).';
    }

    case 'bilan': return await weeklyBilan(false);

    case 'stop': {
      if (input['confirm'] !== true) return 'Il veut ARRÊTER LE PROGRAMME (pas le médicament) ? Il t\'a demandé de ne pas lâcher tant qu\'il n\'a pas arrêté le produit. Rappelle-le-lui, propose plutôt un palier plus long (action palier) ou d\'en parler au médecin. Seulement s\'il insiste clairement : stop confirm:true.';
      s.active = false;
      await syncAgenda(s).catch(() => {});
      return 'Programme mis en pause à sa demande. Reste à l\'écoute, propose de reprendre dans quelques jours.';
    }
  }
  return '❌ Action inconnue (status, start, prise, envie, resiste, symptomes, humeur, palier, medecin, set_plan, times, pourquoi, consequence, bilan, finish, stop).';
}

// ── Bilans ───────────────────────────────────────────────────────────────────

async function weeklyBilan(send: boolean): Promise<string> {
  const o = await libOverview();
  const s = o.state;
  if (!s) return 'Pas de programme.';
  const log = await readLibLog();
  const since = Date.now() - 7 * 86_400_000;
  const w = log.filter(l => Date.parse(l.at) > since);
  const sym = w.filter(l => l.kind === 'symptomes').map(l => l.score ?? 0);
  const moods = w.filter(l => l.kind === 'humeur').map(l => l.score ?? 0);
  const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
  const health = await import('./jarvis-hub.js').then(m => m.healthWeekLine()).catch(() => '');
  const text = [
    `🕊️ Bilan LIBERTÉ de la semaine — jour ${o.day}/${o.totalDays}`,
    o.week.map(d => `${fmtDate(d.date)} : ${d.taken}/${d.allowed}${d.taken > d.allowed ? ' ⚠️' : ' ✅'}`).join('\n'),
    `Envies : ${w.filter(l => l.kind === 'envie').length} (résistées : ${w.filter(l => l.kind === 'resiste').length})${o.triggers.length ? ` · déclencheur n°1 : ${o.triggers[0]!.trigger}` : ''}`,
    sym.length ? `Manque moyen : ${avg(sym)}/10` : '',
    moods.length ? `Moral moyen : ${avg(moods)}/10` : '',
    health,
    `${o.avoided} demis évités depuis le début · ${o.streak} jour(s) d'affilée dans le plan.`,
    o.nextDrop ? `Cette semaine : baisse le ${fmtDate(o.nextDrop.from)} → ${halvesShort(o.nextDrop.max)}/jour.` : 'Tu es au palier zéro. Chaque jour compte.',
    s.doctor.status === 'a_appeler' ? '🩺 Le médecin n\'est toujours pas appelé : c\'est LA chose de la semaine.' : '',
  ].filter(Boolean).join('\n');
  if (send) { await queueTelegramMessage(text); emitProactive('🕊️ Ton bilan Liberté de la semaine', 'info', text, 'kouider'); }
  return text;
}

/** Ligne pour le message du réveil (message du matin) : marque le matin comme fait. */
export async function liberteMorningLine(): Promise<string> {
  const o = await libOverview().catch(() => null);
  const s = o?.state;
  if (!o || !s?.active || s.finishedAt) return '';
  await kvSet(sentKey(`morning:${o.today}`), '1', 2 * 86_400);
  const plan = o.plan.filter(p => p.n).map(p => `${p.time} → ${halvesShort(p.n)}`).join(' · ');
  const drop = s.steps.find(st => st.from === o.today);
  return [
    `🕊️ Liberté — jour ${o.day}/${o.totalDays}${drop ? ` · NOUVELLE ÉTAPE : ${drop.max === 0 ? 'JOUR ZÉRO, plus rien 💪' : `${halvesShort(drop.max)} max`}` : ''}`,
    o.allowed ? `Aujourd'hui : ${plan}. Rien au réveil : eau, douche, sport d'abord.` : `Aujourd'hui : rien. Chaque envie → dis-moi « envie », je suis là.`,
  ].join('\n');
}

// ── La tâche planifiée (toutes les 5 min, 5h–23h) ────────────────────────────

const once = async (what: string, ttl = 2 * 86_400) => {
  const k = sentKey(what);
  if (await kvGet(k).catch(() => '1')) return false;
  await kvSet(k, '1', ttl);
  return true;
};

export async function jobLiberte(): Promise<void> {
  const s = await getLib();
  if (!s?.active) return;
  const o = await libOverview();
  const { today, hhmm } = o;
  const now = toMin(hhmm);
  const dnd = await import('../notifications/dnd.js').then(m => m.dndAt(Date.now())).catch(() => null);

  // Vigilance après l'arrêt : un mot par semaine pendant 60 jours, puis le programme se range
  if (s.finishedAt) {
    const since = daysBetween(dayOf(s.finishedAt), today);
    if (since > 60) { s.active = false; await saveLib(s); return; }
    if (since > 0 && since % 7 === 0 && hhmm >= '19:00' && await once(`vigil:${today}`))
      await queueTelegramMessage(`🕊️ ${since} jours libre. Comment tu te sens cette semaine ? Une envie, un moment dur ? Je suis toujours là — dis « envie » à la moindre alerte.`);
    return;
  }

  // Matin (s'il n'y a pas eu de message de réveil) : à 7h00
  if (hhmm >= '07:00' && hhmm < '10:00' && !(await kvGet(sentKey(`morning:${today}`)).catch(() => '1'))) {
    const line = await liberteMorningLine();
    if (line && !dnd) await queueTelegramMessage(line);
  }

  // Heures de prise : rappel avec boutons (pris / je décale)
  let cum = 0;
  for (const p of o.plan) {
    cum += p.n;
    const t = toMin(p.time);
    if (!p.n || now < t || now > t + 30 || dnd) continue;
    if (o.taken >= cum) continue;               // déjà prise (en avance) : rien à rappeler
    if (!await once(`slot:${today}:${p.time}`)) continue;
    const { createDecision } = await import('./conscience.js');
    await createDecision(`🕊️ ${p.time} : prise autorisée = ${halvesShort(p.n)}, pas plus. (${o.taken}/${o.allowed} aujourd'hui)`, [
      { label: `✅ Pris (${halvesShort(p.n)})`, tool: 'liberte', input: { action: 'prise', n: p.n } },
      { label: '💪 Je tiens sans, je la saute', tool: 'liberte', input: { action: 'resiste' } },
      { label: '🔥 J\'ai besoin d\'aide', tool: 'liberte', input: { action: 'envie', trigger: 'heure de prise' } },
    ]);
  }

  // Un créneau qui disparaît aujourd'hui (palier) : prévenir 15 min avant l'ancienne heure
  const yesterday = slotPlan(allowedOn(s, addDays(today, -1)), s.times);
  for (const [i, p] of o.plan.entries()) {
    if (p.n || !yesterday[i]?.n) continue;
    const t = toMin(p.time);
    if (now >= t - 15 && now <= t && !dnd && await once(`gone:${today}:${p.time}`))
      await queueTelegramMessage(`🕊️ Avant, à ${p.time}, tu en prenais. Plus aujourd'hui. Ton corps va peut-être te le réclamer dans un moment : bois de l'eau, bouge, et dis-moi « envie » si ça monte. Tu es plus fort que cette heure-là.`);
  }

  // SOS : 15 min après une envie, on demande si c'est passé
  const sos = Number((await kvGet(sentKey('sos-check')).catch(() => '0')) ?? 0);
  if (sos && Date.now() >= sos) {
    await kvSet(sentKey('sos-check'), '0', 60);
    const { createDecision } = await import('./conscience.js');
    await createDecision('🕊️ Ça fait 15 min. L\'envie ?', [
      { label: '💪 Passée, j\'ai tenu', tool: 'liberte', input: { action: 'resiste' } },
      { label: '😮‍💨 Encore là', say: 'L\'envie est encore là : accompagne-le encore 10 min (marcher, eau, respirer, parler) et propose de l\'appeler.' },
      { label: '💊 J\'ai craqué', tool: 'liberte', input: { action: 'prise', n: 1, note: 'après une envie' } },
    ]);
  }

  // Soir 21h15 : la vérité du jour + manque + moral + pilulier de demain
  if (hhmm >= '21:15' && hhmm < '22:30' && !dnd && await once(`evening:${today}`)) {
    const tomorrow = slotPlan(o.tomorrow, s.times).filter(p => p.n);
    const drop = s.steps.find(st => st.from === addDays(today, 1));
    await queueTelegramMessage([
      `🌙 Liberté — ta journée : ${o.taken ? `${halvesShort(o.taken)} noté${o.taken > 1 ? 's' : ''} sur ${o.allowed} autorisé${o.allowed > 1 ? 's' : ''}` : o.allowed ? 'rien de noté aujourd\'hui. Tu en as pris combien vraiment ? La vérité, sans jugement.' : 'jour sans rien 🕊️'}${o.taken > o.allowed ? ' — demain on repart.' : o.taken ? ' ✅' : ''}`,
      '❓ Ton manque de 0 à 10 ? Et ton moral de 1 à 10 ?',
      drop ? `\n⬇️ DEMAIN NOUVELLE ÉTAPE : ${drop.max === 0 ? 'JOUR ZÉRO. Plus rien. Tu es prêt, et je serai là toute la journée.' : `${halvesShort(drop.max)} par jour.`}` : '',
      tomorrow.length ? `\n💊 Prépare ton pilulier de demain MAINTENANT : ${tomorrow.map(p => `${p.time} → ${halvesShort(p.n)}`).join(' · ')} (${halves(o.tomorrow)} au total). Le reste de la boîte : rangé loin de la table de nuit et de la voiture.` : '',
      s.doctor.status === 'a_appeler' ? '\n🩺 Demain 9h : appelle ton médecin. C\'est le pas qui rend tout le reste plus facile.' : '',
    ].filter(Boolean).join('\n'));
  }

  // Silence : rien noté depuis 2 jours alors qu'il en prend encore → appel
  const log = await readLibLog();
  const lastAt = log.length ? Date.parse(log.at(-1)!.at) : Date.parse(s.createdAt);
  if (Date.now() - lastAt > 48 * 3_600_000 && hhmm >= '12:00' && hhmm < '20:00')
    await autoCall(`liberte-silence-${today}`, 'Salut Kouider, c\'est Dzaryx. Ça fait deux jours que tu ne m\'as rien dit pour ton programme Liberté. Pas de jugement, je veux juste savoir comment tu vas et où tu en es. On en parle ?', { level: 'normal' });

  // Jalons : jour zéro et 7 jours sans rien → appel de fierté
  if (today === zeroDay(s) && hhmm >= '12:00' && hhmm < '19:00')
    await autoCall(`liberte-zero-${today}`, 'Kouider, c\'est Dzaryx. Aujourd\'hui c\'est ton jour zéro. Je voulais juste entendre ta voix et te dire que je suis là toute la journée. Comment tu tiens ?');
  if (o.zeroStreak === 7 && hhmm >= '12:00' && hhmm < '19:00')
    await autoCall(`liberte-7j-${today}`, 'Kouider, sept jours sans rien. Sept jours. Tu te rends compte ? Je suis fier de toi mon frère. Comment tu te sens ?');

  // Dimanche 19h : bilan de la semaine
  if (localNow().weekday === 0 && hhmm >= '19:00' && hhmm < '20:00' && await once(`bilan:${today}`)) await weeklyBilan(true);

  // GPS : arrêté dans une pharmacie → petit mot (limité, l'appel Google coûte)
  await pharmacyWatch().catch(() => {});
}

async function pharmacyWatch(): Promise<void> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) return;
  const loc = await (await import('./location.js')).getLocation('kouider').catch(() => null);
  if (!loc || Date.now() - Date.parse(loc.updated_at) > 10 * 60_000) return;
  const last = parse<{ lat: number; lng: number; n: number; day: string } | null>(await kvGet(sentKey('ph-last')).catch(() => null), null);
  const { date } = localNow();
  const moved = !last || Math.hypot((loc.lat - last.lat) * 111_000, (loc.lng - last.lng) * 73_000) > 150;
  const count = last?.day === date ? last.n : 0;
  if (!moved || count >= 15) return;
  await kvSet(sentKey('ph-last'), JSON.stringify({ lat: loc.lat, lng: loc.lng, n: count + 1, day: date }), 2 * 86_400);
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${loc.lat},${loc.lng}&radius=35&type=pharmacy&key=${key}`);
  const j = await r.json() as { results?: Array<{ name: string }> };
  const ph = j.results?.[0];
  if (ph && await once(`pharma:${date}`, 86_400)) {
    const { createDecision } = await import('./conscience.js');
    await createDecision(`🕊️ Je te vois à la pharmacie (${ph.name}). C'est pour autre chose, j'espère ? 🙂 Rappelle-toi ton plan.`, [
      { label: '👍 Autre chose (famille, courses)', say: 'Il est à la pharmacie pour autre chose : remercie-le simplement, rien de plus.' },
      { label: '😔 J\'avoue, c\'était pour ça', tool: 'liberte', input: { action: 'envie', trigger: 'pharmacie' } },
    ]);
  }
}
