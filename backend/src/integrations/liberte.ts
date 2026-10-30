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
  wakeDose?: number;           // demis pris d'un coup au réveil (1re heure) — 30/10 : « 2 comprimés et demi déjà au réveil, donc 5 demis »
  holdDays: number;            // jours ajoutés par les paliers (manque fort, dépassement)
  doctorPlan?: boolean;        // plan donné par le médecin : Dzaryx ne l'accélère jamais
  doctor: { status: 'a_appeler' | 'rdv_pris' | 'vu'; date?: string; note?: string };
  why: string[];               // ses raisons à lui
  consequence?: string;        // ce qu'il a choisi lui-même s'il dépasse
  finishedAt?: string;         // il a dit « c'est bon, j'ai arrêté » → vigilance 60 jours
  ifThen?: string[];           // ses plans « si… alors… » (intentions de mise en œuvre)
  rewards?: Array<{ name: string; cost: number; at?: string }>;   // récompenses payées par la cagnotte
  letter?: string;             // sa lettre à lui-même, relue aux moments durs
  ally?: { name: string; phone?: string };   // SA personne de confiance (choisie par lui) — Dzaryx ne la contacte JAMAIS lui-même
  eventIds: string[];
  createdAt: string;
}
export type LibKind = 'prise' | 'envie' | 'resiste' | 'craque' | 'symptomes' | 'humeur' | 'note' | 'depassement' | 'palier' | 'retour' | 'phq2' | 'victoire' | 'mission' | 'calme';
export interface LibLog { at: string; kind: LibKind; n?: number; score?: number; trigger?: string; symptoms?: string[]; note?: string; scores?: Record<string, number> }

const DEFAULT_TIMES = ['07:30', '11:30', '15:30', '19:30'];
// MISSION ANTI-ZOMBIE du jour : une petite action qui ramène ce qu'il veut retrouver (énergie, famille, rire, désir). +1 € à la cagnotte.
const MISSIONS = [
  '15 minutes à jouer par terre avec ton fils, téléphone dans une autre pièce',
  'marche de 20 minutes dehors, à la lumière du jour',
  'un vrai compliment à ta femme, en la regardant dans les yeux',
  'regarde un truc qui te fait rire aux larmes (un sketch, une vidéo)',
  'appelle un ami ou un frère juste pour prendre des nouvelles',
  'cuisine un plat avec ta femme ce soir',
  'téléphone posé à 21h30, au lit à 22h15',
  'une douche qui finit par 30 secondes d\'eau froide',
  'sors prendre un café dehors avec ta femme ou ton fils',
  '10 minutes de rangement d\'un coin de la maison : un esprit clair commence par là',
  'prends ta femme dans tes bras 20 secondes (le corps fabrique de l\'ocytocine)',
  'écris 3 choses qui se sont bien passées aujourd\'hui',
  'propose une sortie au parc à ton fils',
  'fais une séance de sport, même courte',
  'mange un vrai repas assis, sans écran',
  'prévois une soirée à deux cette semaine (dis-le-moi, je la mets dans l\'agenda)',
  'appelle ta mère ou quelqu\'un de ta famille à Oran',
  'apprends un truc nouveau 15 minutes (une vidéo, un livre)',
  'zéro réseau social jusqu\'à midi',
  'dis « merci » à quelqu\'un pour quelque chose de précis',
];
const missionOf = (s: LibState, date: string) => MISSIONS[Math.abs(daysBetween(s.start, date)) % MISSIONS.length]!;
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
const halvesShort = (n: number) => `${String(Math.round(n * 2) / 2).replace('.', ',')} demi${n > 1 ? 's' : ''}`;
/** Quantité EXACTE dite par Kouider → en demis (au quart de comprimé près) : n = demis, comprimes = comprimés (1,5 = 3 demis). */
function qty(input: Record<string, unknown>, dflt: number | null = 1): number | null {
  const num = (v: unknown) => Number(String(v ?? '').replace(',', '.'));
  const c = num(input['comprimes']), h = num(input['n']);
  const v = input['comprimes'] != null && c > 0 ? c * 2 : input['n'] != null && h >= 0 ? h : dflt;
  return v == null ? null : Math.min(30, Math.max(0, Math.round(v * 2) / 2));
}
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

/** Répartition des demis autorisés sur les heures de prise (le surplus va aux premières ; s'il y en a moins que d'heures, on espace).
 *  wake = sa prise du réveil (1re heure) : gardée telle quelle, le reste se répartit sur les autres heures — les baisses se font d'abord l'après-midi. */
export function slotPlan(max: number, times: string[], wake = 0): Array<{ time: string; n: number }> {
  const t = times.length ? times : DEFAULT_TIMES;
  if (max <= 0) return t.map(time => ({ time, n: 0 }));
  if (wake > 0 && t.length > 1) {
    const first = Math.min(wake, max), rest = max - first;
    return [{ time: t[0]!, n: first }, ...(rest > 0 ? slotPlan(rest, t.slice(1)) : t.slice(1).map(time => ({ time, n: 0 })))];
  }
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
const log0 = (log: LibLog[], date: string) => log.filter(l => dayOf(l.at) === date);
const o0ZeroStreak = (log: LibLog[], since: string) => zeroStreak(log, since);
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

// ── CAGNOTTE (« gestion des contingences », la méthode la plus prouvée en addictologie — cœur de reSET-O) ──
// Jour validé = il a noté sa vérité ET il est resté dans le plan → gain qui MONTE chaque jour (2 € +0,5 €/jour, max 10 €).
// Écart → le gain repart à 2 € ; 3 jours validés d'affilée → il retrouve son niveau d'avant. Il la dépense en récompenses qu'il a choisies.
export function bank(s: LibState, log: LibLog[]): { earned: number; spent: number; balance: number; rate: number; days: Array<{ date: string; gain: number }> } {
  const today = localNow().date;
  const logged = new Set(log.map(l => dayOf(l.at)));
  let rate = 2, prev = 2, run = 0, earned = 0;
  const days: Array<{ date: string; gain: number }> = [];
  for (let d = s.start; d < today; d = addDays(d, 1)) {
    const ok = logged.has(d) && takenOn(log, d) <= allowedOn(s, d);
    if (ok) {
      earned += rate; days.push({ date: d, gain: rate });
      run++; if (run === 3 && prev > rate) rate = prev;
      rate = Math.min(10, rate + 0.5);
    } else {
      if (rate > 2) prev = rate;
      rate = 2; run = 0; days.push({ date: d, gain: 0 });
    }
  }
  earned += new Set(log.filter(l => l.kind === 'mission').map(l => dayOf(l.at))).size;   // +1 € par mission du jour faite
  const spent = (s.rewards ?? []).filter(r => r.at).reduce((a, r) => a + r.cost, 0);
  return { earned, spent, balance: earned - spent, rate, days: days.slice(-14) };
}

/** Heures où les envies (et les écarts) reviennent : ≥ 2 fois sur 14 jours → heure à risque. */
export function riskHours(log: LibLog[]): number[] {
  const since = Date.now() - 14 * 86_400_000, h = new Map<number, number>();
  for (const l of log) if ((l.kind === 'envie' || l.kind === 'depassement') && Date.parse(l.at) > since) {
    const hr = Number(localNow(Date.parse(l.at)).hhmm.slice(0, 2));
    h.set(hr, (h.get(hr) ?? 0) + 1);
  }
  return [...h.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([hr]) => hr).sort((a, b) => a - b);
}

type Comeback = { week: number; energie?: number; desir?: number; joie?: number; clarte?: number };
/** Ce qui revient (énergie, désir, joie, clarté) — moyenne par semaine depuis le début. */
function comeback(log: LibLog[], start: string): Comeback[] {
  const by = new Map<number, Record<string, number[]>>();
  for (const l of log) if (l.kind === 'retour' && l.scores) {
    const w = Math.max(0, Math.floor(daysBetween(start, dayOf(l.at)) / 7));
    const cur = by.get(w) ?? {};
    for (const [k, v] of Object.entries(l.scores)) (cur[k] ??= []).push(v);
    by.set(w, cur);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([week, r]) => ({ week, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10])) }));
}

/** Rapport d'une page pour le médecin (envoyé sur Telegram la veille du RDV, ou à la demande). */
async function doctorReport(s: LibState, log: LibLog[]): Promise<string> {
  const today = localNow().date;
  const days = Array.from({ length: Math.min(21, daysBetween(s.start, today) + 1) }, (_, i) => addDays(today, -i)).filter(d => d >= s.start).reverse();
  const sym = log.filter(l => l.kind === 'symptomes').slice(-8);
  const phq = [...log].reverse().find(l => l.kind === 'phq2');
  const health = await import('./jarvis-hub.js').then(m => m.healthWeekLine()).catch(() => '');
  return [
    '🩺 RAPPORT POUR MON MÉDECIN',
    `Traitement que je veux arrêter : ${s.med}. Depuis des années, tous les jours. Dose au départ : environ ${s.baseline} demi-comprimés/jour (${String(s.baseline / 2).replace('.', ',')} comprimés).`,
    `Plan de baisse commencé le ${fmtDate(s.start)} : ${s.steps.map(st => `${fmtDate(st.from)} → ${st.max}`).join(' · ')} (demis/jour).${s.holdDays ? ` Paliers allongés de ${s.holdDays} j.` : ''}`,
    days.length ? `Prises réelles (demis/jour) :\n${days.map(d => `${fmtDate(d)} : ${takenOn(log, d)}/${allowedOn(s, d)}`).join('\n')}` : '',
    `Envies : ${log.filter(l => l.kind === 'envie').length} (${log.filter(l => l.kind === 'resiste').length} tenues). Dépassements : ${log.filter(l => l.kind === 'depassement').length}.`,
    sym.length ? `Manque (0-10) : ${sym.map(l => `${fmtDate(dayOf(l.at))} ${l.score}${l.symptoms?.length ? ` (${l.symptoms.join(', ')})` : ''}`).join(' ; ')}` : '',
    phq ? `Dépistage PHQ-2 (moral) : ${phq.score}/6${(phq.score ?? 0) >= 3 ? ' — positif' : ''}.` : '',
    health,
    'Plaintes : fatigue permanente, moral bas, libido en baisse. Mes questions : valider ou adapter le plan ; aide pour le manque ; soutien moral / psychologue ; prise de sang (testostérone, fer, vitamine D, thyroïde).',
  ].filter(Boolean).join('\n\n');
}

/** Parc / espace vert le plus proche de sa position (GPS frais) pour aller marcher pendant une envie. */
async function parkNearby(): Promise<string> {
  const loc = await (await import('./location.js')).getLocation('kouider').catch(() => null);
  if (!loc || Date.now() - Date.parse(loc.updated_at) > 30 * 60_000) return '';
  const list = await (await import('./presence.js')).nearby('parc', { lat: loc.lat, lng: loc.lng });
  return list.startsWith('🗺️') ? '' : list.split('\n• ').slice(0, 2).join('\n• ');
}

/** Vocal avec SA propre voix (clone) qui lui rappelle ses raisons — fabriqué une fois, renvoyé à chaque envie. */
async function sendMyVoice(s: LibState): Promise<boolean> {
  const mv = await import('./my-voice.js');
  if (!(await mv.hasMyVoice().catch(() => false))) return false;
  const text = `Kouider, c'est toi. Écoute-moi. Cette envie va passer dans quelques minutes. Rappelle-toi pourquoi tu fais ça : ${(s.why.length ? s.why : ["l'esprit clair, l'énergie, ta femme, ton fils"]).join('. ')}. Bois de l'eau, sors marcher. Tu es plus fort que ça. On ne lâche rien.`.slice(0, 600);
  const k = sentKey('myvoice'), cached = parse<{ text: string; b64: string } | null>(await kvGet(k).catch(() => null), null);
  let b64 = cached?.text === text ? cached.b64 : '';
  if (!b64) { b64 = (await mv.speakAsKouider(text, 'français')).toString('base64'); await kvSet(k, JSON.stringify({ text, b64 })); }
  await mv.sendAudio(Buffer.from(b64, 'base64'), '🎙️ Un message de toi… pour toi.', 'toi-a-toi.mp3');
  return true;
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
    const plan = slotPlan(st.max, s.times, s.wakeDose).filter(p => p.n).map(p => `${p.time} → ${p.n} demi${p.n > 1 ? 's' : ''}`).join(', ');
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
  bank: ReturnType<typeof bank> | null;
  riskHours: number[];
  comeback: Comeback[];
  phq2: number | null;
  mission: { text: string; done: boolean } | null;
  victories: Array<{ at: string; text: string }>;
  calm: number;
}

export async function libOverview(): Promise<LibOverview> {
  const [s, log] = await Promise.all([getLib(), readLibLog()]);
  const { date: today, hhmm } = localNow();
  const allowed = s ? allowedOn(s, today) : 0;
  const plan = s ? slotPlan(allowed, s.times, s.wakeDose) : [];
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
    bank: s ? bank(s, log) : null,
    riskHours: riskHours(log),
    comeback: s ? comeback(log, s.start) : [],
    phq2: [...log].reverse().find(l => l.kind === 'phq2')?.score ?? null,
    mission: s ? { text: missionOf(s, today), done: log.some(l => l.kind === 'mission' && dayOf(l.at) === today) } : null,
    victories: log.filter(l => l.kind === 'victoire' && l.note).slice(-8).reverse().map(l => ({ at: l.at, text: l.note! })),
    calm: log.filter(l => l.kind === 'calme').length,
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
    o.riskHours.length ? `Ses heures à risque : ${o.riskHours.map(h => `${h}h`).join(', ')}.` : '',
    s.ifThen?.length ? `Ses plans si-alors : ${s.ifThen.join(' · ')}.` : '',
    o.bank ? `Cagnotte : ${eur(o.bank.balance)} (gain du prochain jour validé : ${eur(o.bank.rate)})${s.rewards?.some(r => !r.at) ? ` · récompenses visées : ${s.rewards.filter(r => !r.at).map(r => `${r.name} (${r.cost} €)`).join(', ')}` : ''}.` : '',
    o.mission ? `Mission du jour : ${o.mission.text}${o.mission.done ? ' ✅ faite' : ''}.` : '',
    o.victories.length ? `Ses dernières victoires : ${o.victories.slice(0, 3).map(v => v.text).join(' · ')}.` : '',
    s.ally ? `Son allié (choisi par lui) : ${s.ally.name}${s.ally.phone ? ` ${s.ally.phone}` : ''} — à lui proposer d'appeler dans les moments durs ; toi tu ne le contactes jamais.` : '',
    o.phq2 != null && o.phq2 >= 3 ? `⚠️ Dépistage moral PHQ-2 positif (${o.phq2}/6) : médecin à pousser fermement.` : '',
  ].filter(Boolean).join('\n');
}
const eur = (n: number) => `${n.toFixed(1).replace('.', ',').replace(',0', '')} €`;

/** Ajouté au dossier de Kouider (chat, appels, Siri, message du matin) : où il en est + comment se comporter. */
export async function liberteText(): Promise<string> {
  const o = await libOverview().catch(() => null);
  if (!o?.state?.active) return '';
  return [
    'PROGRAMME LIBERTÉ (privé, il l\'a demandé le 29/10 et t\'a donné TOUS les droits pour l\'aider) : il arrête complètement le médicament qu\'il prend tous les jours (nom dans l\'outil liberte, ne le dis jamais devant quelqu\'un). Tu es son conseiller, son frère, son majordome sur ce chemin : chaleureux, ferme, jamais moralisateur, jamais de honte.',
    statusText(o),
    'RÈGLES LIBERTÉ :',
    '- Il parle d\'une prise → liberte action prise avec la quantité EXACTE qu\'il dit : « un demi » → n 1 ; « 3 demis » → n 3 ; « un comprimé et demi » → comprimes 1.5 ; « un quart » → n 0.5. Pas de chiffre → demande-le. « En tout aujourd\'hui / hier j\'en ai pris X » → action total (date, n ou comprimes). « Je me suis trompé » → action annuler. Toujours, même s\'il a dépassé : la vérité d\'abord, sans le juger.',
    '- « Je peux en prendre ? » → regarde le statut : seulement si c\'est l\'heure d\'une prise autorisée et dans le maximum du jour. Sinon NON, avec douceur et fermeté, et propose le SOS (liberte action envie).',
    '- « J\'ai envie », « j\'ai mal », « je craque », « je suis à bout » → liberte action envie (trigger = ce qui la déclenche : stress, fatigue, réveil, travail, ennui, douleur, tristesse, dispute…) et accompagne-le 10 minutes : respiration, eau froide, marcher, parler. S\'il tient → action resiste. S\'il a craqué → action prise puis encourage, on continue demain.',
    '- Manque, frissons, diarrhée, insomnie, anxiété, nez qui coule, jambes agitées → liberte action symptomes (score 0-10). On ne remonte JAMAIS la dose : un palier peut s\'allonger (action palier). Signes graves (convulsion, malaise, idées noires, douleur poitrine, hallucinations, vomit tout) → 112 tout de suite.',
    '- Tu ne l\'aides JAMAIS à s\'en procurer plus : pas de pharmacie pour ça, pas de rappel d\'ordonnance pour ce produit, pas de « une de temps en temps ». Il veut aller plus vite que le plan → seulement avec son médecin. Il veut remonter → non, propose un palier plus long + le médecin.',
    '- Le médecin d\'abord : tant que le statut est « pas encore appelé », pousse-le (une fois par jour, pas plus) à appeler son médecin traitant : valider le plan, l\'aider pour le manque, soigner la fatigue et le moral. Psychologue de 1re ligne remboursé (11 €, 1re séance gratuite).',
    '- Utilise tout : agenda (ses étapes y sont), sport (marcher / séance légère les jours durs : sport_coach), sommeil (outil sante), son moral (life_coach), FORME, sa famille comme raison (« ton fils, ta femme »), ses raisons à lui ci-dessus.',
    '- C\'est fini seulement quand LUI dit « c\'est bon, j\'ai arrêté » (action finish). D\'ici là tu ne lâches rien. Rechute = normal, jamais un échec : on note, on reprend.',
    '- EN APPEL / SIRI / VOCAL : s\'il a une envie pendant un appel, guide-le À VOIX HAUTE (« inspire… 2… 3… 4… bloque… souffle… »), phrases courtes, reste en ligne 10 minutes. Propose « je t\'envoie ta propre voix » (liberte action ma_voix).',
    '- Il te donne énergie / désir / joie / clarté sur 10 (« 5 4 6 5 ») → liberte action retour. Ses réponses aux 2 questions du moral (« 1 2 », 0-3 chacune) → action phq2.',
    '- Cagnotte : chaque jour validé rapporte plus que le précédent ; un écart la remet à 2 €. Parle-lui de ses récompenses (action recompense) pour lui donner envie. Il peut écrire ses plans si-alors (action si_alors) et une lettre à lui-même (action lettre).',
    '- Il dit avoir fait sa mission du jour → action mission. Il raconte une réussite, même petite → action victoire (text). Stress / nervosité → propose la cohérence cardiaque 5 min (app LIBERTÉ → « Calme », ou guide-le : 5 s inspire, 5 s souffle, 5 min). Moment dur → rappelle-lui ses victoires.',
    '- STRICTEMENT PRIVÉ : jamais un mot à sa femme, sa famille, Houari ou un client. Exception choisie par lui : il peut nommer UN allié (action allie) — tu lui proposes de L\'APPELER LUI-MÊME, tu ne le contactes jamais.',
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

/** Le dépassement d'un jour était une erreur de saisie (total corrigé, prise annulée) : on l'efface et on rend les jours de palier ajoutés pour lui. */
async function undoOverrun(s: LibState, date: string): Promise<string> {
  const log = await readLibLog();
  const days = log.filter(l => l.kind === 'palier' && l.note === 'dépassement' && dayOf(l.at) === date).reduce((a, l) => a + (l.n ?? 0), 0);
  const kept = log.filter(l => !(dayOf(l.at) === date && (l.kind === 'depassement' || (l.kind === 'palier' && l.note === 'dépassement'))));
  if (kept.length === log.length) return '';
  await kvSet(LOG_KEY, JSON.stringify(kept));
  if (days > 0) {
    for (const st of s.steps) if (st.from > date) st.from = addDays(st.from, -days);
    s.holdDays = Math.max(0, s.holdDays - days);
    await saveLib(s);
    await syncAgenda(s).catch(() => {});
  }
  return `↩️ Dépassement du ${fmtDate(date)} effacé${days ? ` et palier remis à sa date (prochaine baisse le ${fmtDate(s.steps.find(st => st.from > date)?.from ?? date)})` : ''}. `;
}

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
      const n = qty(input) || 1;
      // Même quantité déjà notée il y a moins de 2 h = il en reparle, ce n'est pas une 2e prise
      // (30/10 : ses 5 demis du réveil notés à 5h25 puis encore à 6h05 → 10 comptés, faux dépassement, palier repoussé, appel)
      const dup = input['nouvelle'] !== true && (await readLibLog()).filter(l => l.kind === 'prise' && l.n === n && Date.now() - Date.parse(l.at) < 2 * 3_600_000).at(-1);
      if (dup) return `ℹ️ Déjà noté : ${halvesShort(n)} à ${localNow(Date.parse(dup.at)).hhmm} — PAS ajouté une 2e fois (aujourd'hui : ${halvesShort(takenOn(await readLibLog(), today))}). Si c'est vraiment une NOUVELLE prise en plus, demande-lui de confirmer puis rappelle liberte prise avec nouvelle:true.`;
      const log = await addLog({ kind: 'prise', n, note: String(input['note'] ?? '').slice(0, 200) || undefined });
      const allowed = allowedOn(s, today), taken = takenOn(log, today);
      const plan = slotPlan(allowed, s.times, s.wakeDose), byNow = allowedByNow(plan, hhmm);
      if (s.finishedAt || taken > allowed) {
        const over = taken - allowed;
        await addLog({ kind: 'depassement', n: over });
        const hold = s.finishedAt ? '' : await holdSteps(s, 2, 'dépassement');
        await autoCall(`liberte-over-${today}`, s.finishedAt
          ? 'Kouider, c\'est Dzaryx. Tu as repris un comprimé. Ce n\'est pas grave, ça arrive à presque tout le monde, et je suis là. Parle-moi : qu\'est-ce qui s\'est passé ?'
          : 'Kouider, c\'est Dzaryx. Tu as dépassé ton maximum du jour. Je ne te juge pas, je suis là. Dis-moi ce qui s\'est passé, et on trouve ensemble comment tenir jusqu\'à demain.');
        return `⚠️ Noté : ${halvesShort(taken)} aujourd'hui pour un maximum de ${halvesShort(allowed)} (${over} de trop).${s.finishedAt ? ' Il avait arrêté : rechute à accueillir sans honte, demande ce qui s\'est passé, propose le médecin. S\'il veut, liberte start pour un nouveau plan court.' : ''} ${hold} Je l'appelle. Réponds sans juger : qu'est-ce qui l'a poussé (note-le avec action envie trigger si besoin) ? Plus rien jusqu'à demain, propose le SOS.${s.consequence ? ` Il avait choisi lui-même : « ${s.consequence} » — rappelle-le-lui doucement.` : ''} ${s.letter ? ` Sa lettre à lui-même : « ${s.letter.slice(0, 400)} » — lis-la-lui.` : ''} Prise beaucoup plus forte que d'habitude, malaise, somnolence forte → 112.`;
      }
      const next = nextSlot(plan, hhmm, taken);
      return `✅ Noté : ${halvesShort(n)} (${taken}/${allowed} aujourd'hui).${taken > byNow ? ` ⚠️ En avance sur ses heures : ${next ? `la prochaine (${next.time}) est à décaler d'autant` : 'plus rien ensuite'}.` : ''} ${taken >= allowed ? 'C\'était la dernière de la journée : plus rien jusqu\'à demain.' : next ? `Prochaine : ${next.time}.` : ''} Félicite-le d'avoir noté.`;
    }

    case 'envie': {
      const trigger = String(input['trigger'] ?? '').toLowerCase().trim().slice(0, 40) || undefined;
      const score = Number(input['intensity']);
      await addLog({ kind: 'envie', trigger, score: score >= 0 && score <= 10 ? Math.round(score) : undefined, note: String(input['note'] ?? '').slice(0, 200) || undefined });
      await kvSet(sentKey('sos-check'), String(Date.now() + 15 * 60_000), 3600);
      const voice = await once(`voice:${today}:${hhmm.slice(0, 2)}`, 3 * 3600) ? await sendMyVoice(s).catch(() => false) : false;
      const o = await libOverview();
      const allowedNow = o.next == null && o.left > 0 && o.taken < o.byNow;
      return [
        `🔥 Envie notée${trigger ? ` (${trigger})` : ''}. ${allowedNow ? `C'est l'heure d'une prise autorisée (reste ${halvesShort(o.left)}) : il peut la prendre, sans plus.` : o.next ? `Prochaine prise autorisée à ${o.next.time} — d'ici là, on tient.` : 'Plus aucune prise aujourd\'hui — on tient.'}`,
        'Accompagne-le MAINTENANT avec ça (à ta façon, chaleureux) :',
        ...SOS_STEPS,
        s.why.length ? `Rappelle-lui SES raisons : ${s.why.join(' · ')}.` : 'Rappelle-lui pourquoi il le fait (sa femme, son fils, retrouver son énergie et l\'envie).',
        s.ifThen?.length ? `Ses plans à lui pour ce moment : ${s.ifThen.join(' · ')}.` : '',
        o.victories.length ? `Rappelle-lui ses victoires : ${o.victories.slice(0, 3).map(v => v.text).join(' · ')}.` : '',
        s.ally ? `Propose-lui d'appeler son allié ${s.ally.name}${s.ally.phone ? ` (${s.ally.phone})` : ''}.` : '',
        await parkNearby().then(p => p ? `🌳 Pour marcher tout de suite, le plus proche de lui :\n${p}` : '').catch(() => ''),
        voice ? '🎙️ Un vocal avec SA PROPRE VOIX qui lui rappelle ses raisons vient de partir sur Telegram : dis-lui de l\'écouter.' : '',
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

    case 'si_alors': {
      const t = String(input['text'] ?? '').trim();
      if (input['remove'] === true) { s.ifThen = (s.ifThen ?? []).filter(x => !x.toLowerCase().includes(t.toLowerCase())); await saveLib(s); return '✅ Plan retiré.'; }
      if (!t) return s.ifThen?.length ? `Ses plans : ${s.ifThen.join(' · ')}` : 'Aucun plan si-alors : aide-le à en écrire 2-3 (« si je me réveille avec l\'envie, alors je bois 2 verres d\'eau et je fais 20 pompes »).';
      s.ifThen = [...(s.ifThen ?? []), t.slice(0, 160)].slice(-8);
      await saveLib(s);
      return `✅ Plan gardé : « ${t} ». Je le lui rappellerai juste avant ses heures à risque.`;
    }

    case 'recompense': {
      s.rewards ??= [];
      const name = String(input['text'] ?? '').trim(), cost = Number(input['cost']);
      const b = bank(s, await readLibLog());
      if (input['claim'] === true) {
        const r = s.rewards.find(x => !x.at && (!name || x.name.toLowerCase().includes(name.toLowerCase())));
        if (!r) return '❌ Quelle récompense ?';
        if (b.balance < r.cost) return `Pas encore : cagnotte ${eur(b.balance)} / ${r.cost} €. Encore ${Math.ceil((r.cost - b.balance) / Math.max(2, b.rate))} jour(s) validés environ.`;
        r.at = new Date().toISOString(); await saveLib(s);
        await queueTelegramMessage(`🎁 Récompense débloquée : ${r.name} ! Tu l'as gagnée, jour après jour. Profite.`);
        return `🎁 ${r.name} débloquée (${r.cost} €). Félicite-le, qu'il en profite vraiment (en famille si c'est prévu).`;
      }
      if (input['remove'] === true) { s.rewards = s.rewards.filter(r => r.at || !r.name.toLowerCase().includes(name.toLowerCase())); await saveLib(s); return '✅ Récompense retirée.'; }
      if (!name || !(cost > 0)) return `Cagnotte ${eur(b.balance)}. Récompenses : ${s.rewards.map(r => `${r.name} ${r.cost} €${r.at ? ' ✅' : ''}`).join(' · ') || 'aucune — aide-le à en choisir (resto avec sa femme, sortie avec son fils, un vêtement, un soin…).'}`;
      s.rewards.push({ name: name.slice(0, 80), cost: Math.round(cost) });
      await saveLib(s);
      return `✅ Récompense « ${name} » à ${Math.round(cost)} €. Cagnotte actuelle : ${eur(b.balance)}.`;
    }

    case 'lettre': {
      const t = String(input['text'] ?? '').trim();
      if (!t) return s.letter ? `Sa lettre : « ${s.letter} »` : 'Pas encore de lettre : propose-lui d\'écrire (ou dicter) une lettre à lui-même pour les moments durs — ce qu\'il ressent aujourd\'hui, ce qu\'il veut retrouver.';
      s.letter = t.slice(0, 1500); await saveLib(s);
      return '✅ Lettre gardée. Je la lui relirai au jour zéro et s\'il craque un jour.';
    }

    case 'retour': {
      const scores: Record<string, number> = {};
      for (const k of ['energie', 'desir', 'joie', 'clarte']) { const v = Number(input[k]); if (v >= 1 && v <= 10) scores[k] = Math.round(v); }
      if (!Object.keys(scores).length) return '❌ energie, desir, joie, clarte de 1 à 10.';
      await addLog({ kind: 'retour', scores });
      const cb = comeback(await readLibLog(), s.start);
      const first = cb[0], last = cb.at(-1);
      const diff = first && last && last !== first ? (Object.keys(scores) as Array<keyof Comeback>).map(k => first[k] != null && last[k] != null ? `${k} ${first[k]}→${last[k]}` : '').filter(Boolean).join(', ') : '';
      return `✅ Noté (${Object.entries(scores).map(([k, v]) => `${k} ${v}/10`).join(', ')}).${diff ? ` Depuis le début : ${diff}. Montre-lui ce qui revient.` : ' Premier relevé : on comparera chaque semaine.'}`;
    }

    case 'phq2': {
      const a = Number(input['q1']), b2 = Number(input['q2']);
      if (!(a >= 0 && a <= 3 && b2 >= 0 && b2 <= 3) || input['q1'] == null || input['q2'] == null) return 'Pose-lui les 2 questions (ces 2 dernières semaines, 0 = jamais, 1 = plusieurs jours, 2 = plus de la moitié des jours, 3 = presque tous les jours) : 1) peu d\'intérêt ou de plaisir à faire les choses ? 2) triste, déprimé ou sans espoir ? Puis phq2 q1 q2.';
      await addLog({ kind: 'phq2', score: a + b2 });
      return a + b2 >= 3 ? `PHQ-2 = ${a + b2}/6 → dépistage POSITIF : ce n'est pas un diagnostic, mais il faut en parler à son médecin cette semaine (la dépression se soigne très bien). Dis-le avec douceur, propose de préparer le RDV. Idées noires → 0800 32 123.` : `PHQ-2 = ${a + b2}/6 : pas de signal fort. On refait dans 2 semaines.`;
    }

    case 'rapport_medecin': {
      const r = await doctorReport(s, await readLibLog());
      await queueTelegramMessage(r);
      return '✅ Rapport médecin envoyé sur Telegram (à montrer au médecin).';
    }

    case 'total': {
      // « en tout aujourd'hui / hier j'en ai pris X » → remplace les prises notées ce jour-là par le chiffre exact
      const d = input['date'] === 'hier' || input['date'] === 'yesterday' ? addDays(today, -1) : /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : today;
      const n = qty(input, null);
      if (n == null) return '❌ Combien en tout ? (n = demis, ou comprimes = comprimés, ex. 2,5)';
      const log = (await readLibLog()).filter(l => !(l.kind === 'prise' && dayOf(l.at) === d));
      const at = d === today ? new Date().toISOString() : new Date(localTs(d, '20:00')).toISOString();
      if (n > 0) log.push({ at, kind: 'prise', n, note: 'total corrigé' });
      log.sort((a, b) => a.at.localeCompare(b.at));
      await kvSet(LOG_KEY, JSON.stringify(log.slice(-1500)));
      const allowed = allowedOn(s, d);
      if (n > allowed && d >= s.start && !log.some(l => l.kind === 'depassement' && dayOf(l.at) === d)) await addLog({ kind: 'depassement', n: n - allowed, note: `total du ${d}` });
      const undone = n <= allowed ? await undoOverrun(s, d) : '';
      return `${undone}✅ ${d === today ? 'Aujourd\'hui' : `Le ${fmtDate(d)}`} : ${halvesShort(n)} au total (${String(n / 2).replace('.', ',')} comprimé${n > 2 ? 's' : ''}) pour ${halvesShort(allowed)} autorisés.${n > allowed ? ' Au-dessus du plan : sans jugement, demande ce qui s\'est passé, on repart.' : ' Dans le plan ✅.'} Merci pour la vérité.`;
    }

    case 'annuler': {
      const log = await readLibLog();
      const i = log.map(l => l.kind).lastIndexOf('prise');
      if (i < 0 || Date.now() - Date.parse(log[i]!.at) > 6 * 3_600_000) return '❌ Pas de prise récente à annuler (corrige plutôt le total du jour : action total).';
      const [gone] = log.splice(i, 1);
      await kvSet(LOG_KEY, JSON.stringify(log));
      const undone = takenOn(log, today) <= allowedOn(s, today) ? await undoOverrun(s, today) : '';
      return `↩️ Prise annulée (${halvesShort(gone!.n ?? 1)} notée à ${localNow(Date.parse(gone!.at)).hhmm}). Aujourd'hui : ${halvesShort(takenOn(log, today))}.${undone ? ` ${undone}` : ''}`;
    }

    case 'reveil': {
      // « au réveil je prends 2 comprimés et demi » → sa 1re prise reste groupée, le reste est réparti sur les autres heures
      const n = qty(input, null);
      if (n == null) return '❌ Combien au réveil ? (n = demis, ou comprimes, ex. 2.5)';
      s.wakeDose = n || undefined;
      await saveLib(s);
      await syncAgenda(s).catch(() => {});
      const plan = slotPlan(allowedOn(s, today), s.times, s.wakeDose).filter(p => p.n).map(p => `${p.time} → ${halvesShort(p.n)}`).join(', ');
      return `✅ Prise du réveil : ${n ? halvesShort(n) : 'plus de prise groupée'}. Aujourd'hui (max ${halvesShort(allowedOn(s, today))}) : ${plan || 'rien'}.`;
    }

    case 'mission': {
      const log = await readLibLog();
      if (log.some(l => l.kind === 'mission' && dayOf(l.at) === today)) return 'Mission du jour déjà notée ✅.';
      await addLog({ kind: 'mission', note: missionOf(s, today) });
      return `✅ Mission faite (« ${missionOf(s, today)} ») : +1 € dans la cagnotte. Demande-lui comment c'était.`;
    }

    case 'victoire': {
      const t = String(input['text'] ?? '').trim();
      if (!t) return '❌ Quelle victoire ?';
      await addLog({ kind: 'victoire', note: t.slice(0, 200) });
      return `🏆 Victoire gardée : « ${t} ». Je la lui rappellerai les jours durs.`;
    }

    case 'calme': { await addLog({ kind: 'calme', n: Math.round(Number(input['n'] ?? 5)) }); return '🌬️ Séance de calme notée.'; }

    case 'allie': {
      if (input['remove'] === true) { delete s.ally; await saveLib(s); return '✅ Allié retiré.'; }
      const name = String(input['text'] ?? '').trim();
      if (!name) return s.ally ? `Son allié : ${s.ally.name} ${s.ally.phone ?? ''}` : 'Pas d\'allié. Propose-lui (sans insister) de choisir UNE personne de confiance qu\'il pourrait appeler lui-même dans un moment dur — un frère, un ami, son médecin. Toi tu ne la contacteras jamais.';
      s.ally = { name: name.slice(0, 60), phone: String(input['phone'] ?? '').replace(/[^\d+ ]/g, '').trim() || undefined };
      await saveLib(s);
      return `✅ Allié : ${s.ally.name}. Je lui proposerai de l'appeler dans les moments durs — je ne le contacterai jamais moi-même.`;
    }

    case 'ma_voix': return await sendMyVoice(s) ? '🎙️ Vocal avec sa propre voix envoyé sur Telegram.' : '❌ Sa voix n\'est pas encore apprise (ma_voix status) : qu\'il envoie un vocal Telegram de 30 s.';

    case 'stop': {
      if (input['confirm'] !== true) return 'Il veut ARRÊTER LE PROGRAMME (pas le médicament) ? Il t\'a demandé de ne pas lâcher tant qu\'il n\'a pas arrêté le produit. Rappelle-le-lui, propose plutôt un palier plus long (action palier) ou d\'en parler au médecin. Seulement s\'il insiste clairement : stop confirm:true.';
      s.active = false;
      await syncAgenda(s).catch(() => {});
      return 'Programme mis en pause à sa demande. Reste à l\'écoute, propose de reprendre dans quelques jours.';
    }
  }
  return '❌ Action inconnue (status, start, prise, envie, resiste, symptomes, humeur, palier, medecin, set_plan, times, pourquoi, consequence, si_alors, recompense, lettre, retour, phq2, rapport_medecin, ma_voix, total, annuler, reveil, mission, victoire, calme, allie, bilan, finish, stop).';
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
    o.bank ? `💰 Cagnotte : ${eur(o.bank.balance)} — gain du prochain jour validé : ${eur(o.bank.rate)}` : '',
    o.comeback.length > 1 ? `✨ Ce qui revient : ${(['energie', 'desir', 'joie', 'clarte'] as const).map(k => { const a = o.comeback[0]![k], b = o.comeback.at(-1)![k]; return a != null && b != null ? `${k} ${a}→${b}` : ''; }).filter(Boolean).join(' · ')}` : '',
    s.doctor.status === 'a_appeler' ? '🩺 Le médecin n\'est toujours pas appelé : c\'est LA chose de la semaine.' : '',
    '',
    '❓ Cette semaine, de 1 à 10 : ton ÉNERGIE, ton DÉSIR, ta JOIE, ton esprit CLAIR ? (réponds par exemple « 5 4 6 5 »)',
    daysBetween(s.start, localNow().date) % 14 < 7 ? '❓ Et ces 2 dernières semaines (0 jamais → 3 presque tous les jours) : peu de plaisir à faire les choses ? triste ou sans espoir ? (réponds par exemple « 1 2 »)' : '',
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
    o.allowed ? `Aujourd'hui : ${plan}.` : `Aujourd'hui : rien. Chaque envie → dis-moi « envie », je suis là.`,
    `🎯 Mission anti-zombie du jour (+1 €) : ${missionOf(s, o.today)}.`,
    '🌅 Rituel du réveil, à la place du comprimé : 2 grands verres d\'eau → 20 pompes → 30 s d\'eau froide en fin de douche → lumière du jour.',
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
  // Étapes pas encore dans l'agenda (plan lancé d'un endroit sans accès Google) : rattrapage, nouvel essai toutes les 6 h
  if (!s.finishedAt && !s.eventIds.length && await once('agenda-sync', 6 * 3600)) await syncAgenda(s).catch(err => console.error('[liberte] agenda:', err instanceof Error ? err.message : err));
  const o = await libOverview();
  const { today, hhmm } = o;
  const now = toMin(hhmm);
  const dnd = await import('../notifications/dnd.js').then(m => m.dndAt(Date.now())).catch(() => null);

  // Vigilance après l'arrêt : un mot par semaine pendant 60 jours, puis le programme se range
  if (s.finishedAt) {
    const since = daysBetween(dayOf(s.finishedAt), today);
    if (since > 366) { s.active = false; await saveLib(s); return; }
    const free = o0ZeroStreak(await readLibLog(), zeroDay(s));
    if ([30, 90, 180, 365].includes(free) && hhmm >= '12:00' && hhmm < '19:00' && await once(`anniv:${free}`, 5 * 86_400)) {
      const label = free === 30 ? 'UN MOIS' : free === 90 ? 'TROIS MOIS' : free === 180 ? 'SIX MOIS' : 'UN AN';
      await queueTelegramMessage(`🕊️ ${label} SANS RIEN. Kouider… regarde d'où tu viens. Prends ta récompense, fête-le avec ta femme et ton fils. Je suis fier de toi.`);
      await autoCall(`liberte-anniv-${free}`, `Kouider, c'est Dzaryx. ${label.toLowerCase()} sans rien aujourd'hui. Je voulais te le dire de vive voix : je suis fier de toi mon frère.`);
    }
    if (since > 60) return;
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
  const yesterday = slotPlan(allowedOn(s, addDays(today, -1)), s.times, s.wakeDose);
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
      { label: '🎧 Envoie ma musique, je sors marcher', tool: 'gps_assistant', input: { action: 'playlist', for: 'marcher et se vider la tête' } },
    ]);
  }

  // Soir 21h15 : la vérité du jour + manque + moral + pilulier de demain
  if (hhmm >= '21:15' && hhmm < '22:30' && !dnd && await once(`evening:${today}`)) {
    const tomorrow = slotPlan(o.tomorrow, s.times, s.wakeDose).filter(p => p.n);
    const drop = s.steps.find(st => st.from === addDays(today, 1));
    await queueTelegramMessage([
      `🌙 Liberté — ta journée : ${o.taken ? `${halvesShort(o.taken)} noté${o.taken > 1 ? 's' : ''} sur ${o.allowed} autorisé${o.allowed > 1 ? 's' : ''}` : o.allowed ? 'rien de noté aujourd\'hui. Tu en as pris combien vraiment ? La vérité, sans jugement.' : 'jour sans rien 🕊️'}${o.taken > o.allowed ? ' — demain on repart.' : o.taken ? ' ✅' : ''}`,
      '❓ Ton manque de 0 à 10 ? Ton moral de 1 à 10 ? Et ta VICTOIRE du jour, même petite ?',
      o.mission && !o.mission.done ? `🎯 Ta mission (« ${o.mission.text} ») : faite ? (+1 €)` : '',
      drop ? `\n⬇️ DEMAIN NOUVELLE ÉTAPE : ${drop.max === 0 ? 'JOUR ZÉRO. Plus rien. Tu es prêt, et je serai là toute la journée.' : `${halvesShort(drop.max)} par jour.`}` : '',
      tomorrow.length ? `\n💊 Prépare ton pilulier de demain MAINTENANT : ${tomorrow.map(p => `${p.time} → ${halvesShort(p.n)}`).join(' · ')} (${halves(o.tomorrow)} au total). Le reste de la boîte : rangé loin de la table de nuit et de la voiture.` : '',
      s.doctor.status === 'a_appeler' ? '\n🩺 Demain 9h : appelle ton médecin. C\'est le pas qui rend tout le reste plus facile.' : '',
    ].filter(Boolean).join('\n'));
  }

  // Heures à risque (apprises de ses envies) : 15 min avant, on prévient avec SES plans si-alors
  for (const h of o.riskHours) {
    const t = h * 60 - 15;
    if (now >= t && now < t + 10 && !dnd && await once(`risk:${today}:${h}`))
      await queueTelegramMessage(`🕊️ Dans 15 min, c'est ${h}h — l'heure où l'envie revient souvent. On la prend de vitesse :\n${s.ifThen?.length ? s.ifThen.map(x => `• ${x}`).join('\n') : '• un grand verre d\'eau maintenant\n• 10 minutes de marche dès que tu peux\n• et si ça monte : dis-moi « envie »'}`);
  }

  // Jour de marche (le palier baisse aujourd'hui) : appel à 12h30 pour voir comment il tient
  const drop = s.steps.find(st => st.from === today);
  if (drop && hhmm >= '12:30' && hhmm < '18:00')
    await autoCall(`liberte-drop-${today}`, drop.max === 0
      ? 'Kouider, c\'est Dzaryx. Jour zéro aujourd\'hui. Je voulais juste entendre ta voix. Comment tu tiens ?'
      : `Salut Kouider, c'est Dzaryx. Aujourd'hui tu es descendu à ${drop.max} demis. Comment tu te sens ? Le manque, ça va ?`);

  // Jour zéro, le matin : sa lettre + rapporter les boîtes restantes à la pharmacie (elles reprennent les médicaments non utilisés)
  if (drop?.max === 0 && hhmm >= '08:00' && !dnd && await once(`zero:${today}`))
    await queueTelegramMessage(`🕊️ JOUR ZÉRO.\n${s.letter ? `\nTa lettre, écrite au début :\n« ${s.letter} »\n` : ''}\n🧹 Geste fort aujourd'hui : rapporte TOUTES les boîtes qui restent à la pharmacie (elles reprennent les médicaments non utilisés). Plus rien à la maison, plus rien dans la voiture.\n\nChaque envie → « envie ». Je suis là toute la journée.`);

  // Veille du RDV médecin, 20h : le rapport d'une page à lui montrer
  if (s.doctor.status === 'rdv_pris' && s.doctor.date?.slice(0, 10) === addDays(today, 1) && hhmm >= '20:00' && await once(`report:${today}`))
    await queueTelegramMessage(`📋 Demain, ton médecin. Montre-lui ça (tout est vrai, c'est toi qui l'as noté) :\n\n${await doctorReport(s, await readLibLog())}`);

  // Montre / Santé : nuit très courte ou cœur au repos bien plus haut que d'habitude → journée allégée proposée (une fois)
  if (hhmm >= '09:00' && hhmm < '12:00') {
    const hd = await import('./ai-util.js').then(m => m.kvJson<Array<{ date: string; sleep_h?: number; rhr?: number }>>('health:daily', [])).catch(() => []);
    const t = hd.find(x => x.date === today), past = hd.filter(x => x.date < today && x.rhr).slice(-14);
    const avgRhr = past.length >= 5 ? past.reduce((a, x) => a + x.rhr!, 0) / past.length : 0;
    const why = t?.sleep_h && t.sleep_h < 5 ? `${String(t.sleep_h).replace('.', ',')} h de sommeil` : t?.rhr && avgRhr && t.rhr >= avgRhr + 8 ? `cœur au repos à ${t.rhr} (d'habitude ${Math.round(avgRhr)})` : '';
    if (why && !dnd && await once(`body:${today}`))
      await queueTelegramMessage(`🩺 Ta montre dit : ${why}. C'est souvent le corps qui travaille pendant la baisse — normal, et ça passe. Aujourd'hui : séance légère ou marche, beaucoup d'eau, coucher tôt. Je te la cale plus légère si tu veux (dis « séance légère »).`);
  }

  // Jour de marche, 7h05 : proposer d'alléger la journée (journée dure = pas de business non urgent, appels gardés)
  if (drop && hhmm >= '07:05' && hhmm < '10:00' && !dnd && await once(`light:${today}`)) {
    const { createDecision } = await import('./conscience.js');
    await createDecision(`🕊️ Nouvelle étape aujourd'hui (${drop.max ? `${halvesShort(drop.max)} max` : 'zéro'}). Les 2-3 premiers jours sont les plus durs. J'allège ta journée ?`, [
      { label: '🙏 Oui, allège', tool: 'family_care', input: { action: 'hard_day', why: 'étape difficile' } },
      { label: '💪 Non, ça va', say: 'Il ne veut pas alléger sa journée : encourage-le simplement.' },
    ]);
  }

  // Jour de manque (≥ 5/10 aujourd'hui) : rappels d'eau à 10h, 13h, 16h (sueurs, diarrhée = on se vide)
  const symToday = log0(await readLibLog(), today).filter(l => l.kind === 'symptomes').map(l => l.score ?? 0);
  const hardDay = (symToday.length && Math.max(...symToday) >= 5) || !!drop;
  for (const h of ['10:00', '13:00', '16:00'])
    if (hardDay && hhmm >= h && hhmm < `${h.slice(0, 2)}:30` && !dnd && await once(`water:${today}:${h}`))
      await queueTelegramMessage(`💧 ${h.replace(':00', 'h')} : un grand verre d'eau maintenant. Les jours de manque, le corps se vide (sueurs, ventre). Si tu as la diarrhée : un sachet de réhydratation de la pharmacie aide (demande au pharmacien).`);

  // Coucher protégé les jours durs (le sommeil est ce qui revient en dernier) : 21h50
  if (hardDay && hhmm >= '21:50' && hhmm < '22:30' && !dnd && await once(`bed:${today}`))
    await queueTelegramMessage('😴 Ce soir on protège ta nuit : téléphone posé à 22h15, douche chaude, chambre fraîche et sombre. Si tu ne dors pas au bout de 20 min, lève-toi, lumière douce, reviens quand les yeux piquent. Une nuit agitée pendant la baisse, c\'est normal — ça revient.');

  // 3 semaines après le jour zéro : le désir / l'énergie reviennent-ils ? Sinon → prise de sang (testostérone) chez le médecin
  if (today === addDays(zeroDay(s), 21) && hhmm >= '19:00' && hhmm < '21:00' && await once(`libido:${today}`)) {
    const cb = o.comeback, a = cb[0], b = cb.at(-1);
    const up = a && b && b !== a && ((b.desir ?? 0) - (a.desir ?? 0) >= 2 || (b.energie ?? 0) - (a.energie ?? 0) >= 2);
    await queueTelegramMessage(up
      ? `✨ 3 semaines après ton jour zéro : ton énergie et ton désir remontent (${a!.energie ?? '?'}→${b!.energie ?? '?'}, ${a!.desir ?? '?'}→${b!.desir ?? '?'}). C'est ton corps qui revient. Continue.`
      : '🩺 3 semaines après ton jour zéro. Si l\'énergie et le désir ne reviennent pas encore assez, c\'est fréquent après des années de ce type de médicament : la testostérone peut rester basse un moment. Ça se vérifie par une simple prise de sang et ça se soigne — parles-en à ton médecin cette semaine.');
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
