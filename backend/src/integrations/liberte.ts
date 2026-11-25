import { kvGet, kvSet } from './app-store.js';
import { localNow, localTs } from './morning-routine.js';
import { createAgendaEvent, deleteAgendaEvent, listAgendaRange } from './google-calendar.js';
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
  fastProposal?: { at: string; steps: LibStep[] };   // 25/11 plan plus rapide PRÉPARÉ pour le médecin — appliqué seulement s'il dit que le médecin a validé
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
export type LibKind = 'prise' | 'envie' | 'resiste' | 'craque' | 'symptomes' | 'humeur' | 'note' | 'depassement' | 'palier' | 'retour' | 'phq2' | 'victoire' | 'mission' | 'calme' | 'cause';
export interface LibLog { at: string; kind: LibKind; n?: number; score?: number; trigger?: string; symptoms?: string[]; note?: string; scores?: Record<string, number>; day?: string; moment?: string }

const DEFAULT_TIMES = ['07:30', '11:30', '15:30', '19:30'];
// MISSION ANTI-ZOMBIE du jour : une petite action qui ramène ce qu'il veut retrouver (énergie, famille, rire). +1 € à la cagnotte.
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
  // Prise / prise sautée notée → le rappel « 🕊️ … (0/9) » à boutons est réglé (03/11 : la Conscience le relisait et
  // lui reposait la question avec l'ancien compte, 2 min après « Noté : 6/9 »)
  if (e.kind === 'prise' || e.kind === 'resiste') await import('./conscience.js').then(m => m.closeDecisions(t => t.startsWith('🕊️'))).catch(() => {});
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

/** Heures des prises au-delà du plan (cumul du jour > autorisé à cette heure). Les « total corrigé » n'ont pas d'heure fiable. */
function extraHours(s: LibState, log: LibLog[], since: number): number[] {
  const out: number[] = [];
  const byDay = new Map<string, LibLog[]>();
  for (const l of log) if (l.kind === 'prise' && Date.parse(l.at) > since) byDay.set(dayOf(l.at), [...(byDay.get(dayOf(l.at)) ?? []), l]);
  for (const [d, ps] of byDay) {
    const plan = slotPlan(allowedOn(s, d), s.times, s.wakeDose);
    let cum = 0;
    for (const l of ps.sort((a, b) => a.at.localeCompare(b.at))) {
      cum += l.n ?? 1;
      const hm = localNow(Date.parse(l.at)).hhmm;
      if (!/total/i.test(l.note ?? '') && cum > allowedByNow(plan, hm)) out.push(Number(hm.slice(0, 2)));
    }
  }
  return out;
}
/** Heures où les envies (et les écarts) reviennent : ≥ 2 fois sur 14 jours → heure à risque. */
export function riskHours(log: LibLog[], s?: LibState | null): number[] {
  const since = Date.now() - 14 * 86_400_000, h = new Map<number, number>();
  for (const l of log) if ((l.kind === 'envie' || l.kind === 'depassement') && Date.parse(l.at) > since) {
    const hr = Number(localNow(Date.parse(l.at)).hhmm.slice(0, 2));
    h.set(hr, (h.get(hr) ?? 0) + 1);
  }
  // 25/11 : les prises EN TROP (au-delà de ce que le plan permettait à cette heure-là) comptent aussi — c'est là que ça se joue
  if (s) for (const hr of extraHours(s, log, since)) h.set(hr, (h.get(hr) ?? 0) + 1);
  return [...h.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([hr]) => hr).sort((a, b) => a - b);
}

// ── MOMENTS DE LA JOURNÉE (25/11, Kouider : « il doit voir à quel moment je prends le plus ») ──
// Une prise notée en bloc (« total corrigé », ou 4 demis d'un coup en milieu de matinée) ne dit RIEN de l'heure réelle :
// on ne compte que les prises avec un moment dit par lui (action journee / moment) ou notées à l'instant (≤ 3 demis).
export const MOMENTS: Array<{ key: string; label: string; from: string; at: string }> = [
  { key: 'reveil', label: 'au réveil', from: '04:00', at: '05:30' },
  { key: 'matin', label: 'le matin', from: '08:00', at: '09:30' },
  { key: 'midi', label: 'le midi', from: '11:30', at: '12:30' },
  { key: 'aprem', label: 'l\'après-midi', from: '14:00', at: '15:30' },
  { key: 'soir', label: 'le soir', from: '18:00', at: '19:30' },
  { key: 'nuit', label: 'la nuit', from: '22:00', at: '23:00' },
];
export function momentOfTime(hhmm: string): string {
  let k = 'nuit';
  for (const m of MOMENTS) if (hhmm >= m.from) k = m.key;
  return hhmm < '04:00' ? 'nuit' : k;
}
export function momentKey(raw: unknown): string | null {
  const t = String(raw ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!t) return null;
  if (MOMENTS.some(m => m.key === t)) return t;
  if (/reveil|leve/.test(t)) return 'reveil';
  if (/midi|dejeuner/.test(t)) return 'midi';
  if (/apres.?midi|aprem|aprm/.test(t)) return 'aprem';
  if (/soir|diner/.test(t)) return 'soir';
  if (/nuit|coucher|dormir/.test(t)) return 'nuit';
  if (/matin|travail|boulot|arrive/.test(t)) return 'matin';
  return null;
}
function momentOfLog(l: LibLog, times: string[] = DEFAULT_TIMES): string | null {
  if (l.moment) return l.moment;
  if (/total/i.test(l.note ?? '') || (l.n ?? 1) > 3) return null;
  // heure sûre seulement si notée dans les 40 min après une heure de prise (bouton du rappel) : sinon c'est peut-être
  // la prise du réveil notée en fin de matinée (« 4 » à 10h54) → on ne devine pas
  const hm = toMin(localNow(Date.parse(l.at)).hhmm);
  const slot = times.find(t => hm >= toMin(t) - 10 && hm <= toMin(t) + 40);
  return slot ? momentOfTime(slot) : null;
}
export interface MomentStats { rows: Array<{ key: string; label: string; avg: number; plan: number; days: number }>; known: number; total: number; top: { key: string; label: string; avg: number; plan: number } | null }
export function momentStats(s: LibState, log: LibLog[], days = 21): MomentStats {
  const today = localNow().date, since = addDays(today, -days);
  const ps = log.filter(l => l.kind === 'prise' && dayOf(l.at) > since && dayOf(l.at) >= s.start);
  // seulement les journées COMPLÈTES (toutes les prises du jour ont un moment) — sinon la moyenne ment
  const dset = new Set([...new Set(ps.map(l => dayOf(l.at)))].filter(d => ps.filter(l => dayOf(l.at) === d).every(l => momentOfLog(l, s.times))));
  const known = ps.filter(l => dset.has(dayOf(l.at)));
  const n = Math.max(1, dset.size);
  const rows = MOMENTS.map(m => {
    const sum = known.filter(l => momentOfLog(l, s.times) === m.key).reduce((a, l) => a + (l.n ?? 1), 0);
    // ce que le plan donnait à ce moment-là, en moyenne sur les mêmes jours
    const plan = [...dset].reduce((a, d) => a + slotPlan(allowedOn(s, d), s.times, s.wakeDose).filter(p => momentOfTime(p.time) === m.key).reduce((x, p) => x + p.n, 0), 0) / n;
    return { key: m.key, label: m.label, avg: Math.round(sum / n * 10) / 10, plan: Math.round(plan * 10) / 10, days: dset.size };
  });
  const top = [...rows].filter(r => r.avg > 0).sort((a, b) => (b.avg - b.plan) - (a.avg - a.plan) || b.avg - a.avg)[0] ?? null;
  return { rows, known: known.length, total: ps.length, top };
}
export function momentText(st: MomentStats): string {
  if (st.rows[0]!.days < 4) return `⏰ À quel moment tu prends le plus : je ne peux pas encore le dire — seulement ${st.rows[0]!.days} journée(s) récente(s) où je connais l'heure de CHAQUE prise (il en faut 4). La plupart sont notées en un seul bloc. Dis-moi ta journée par moment (« réveil 3, midi 2, soir 3 ») ou note chaque prise au moment où tu la prends.`;
  const rows = st.rows.filter(r => r.avg > 0 || r.plan > 0).map(r => `${r.label} : ${halvesShort(r.avg)}/jour${r.plan ? ` (plan ${String(r.plan).replace('.', ',')})` : ' (pas prévu)'}${r.avg > r.plan + 0.4 ? ' ⚠️' : ''}`).join('\n');
  return [`⏰ TES MOMENTS (${st.rows[0]!.days} jours avec des heures sûres)`, rows, st.top && st.top.avg > st.top.plan ? `👉 Le moment où tu dépasses le plus : ${st.top.label}. C'est là qu'on met le paquet (rappel avant, plan si-alors, pilulier).` : '', st.total - st.known > 0 ? `(Journées notées en bloc, sans heures : pas comptées.)` : ''].filter(Boolean).join('\n');
}

// ── RYTHME DES PRISES (demande de Kouider 25/11 : « analyse les jours où je prends le plus » — hier presque rien, aujourd'hui trop).
// Jours notés seulement (un jour sans aucune ligne = « pas noté », jamais compté comme zéro).
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const wdOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export interface LibPattern {
  days: Array<{ date: string; taken: number; allowed: number }>;
  unlogged: number;
  heavy: Array<{ wd: string; avg: number; n: number }>;      // jours de la semaine les plus chargés (≥ 2 semaines de recul)
  light: Array<{ wd: string; avg: number; n: number }>;
  overDays: number;
  rebound: { lows: number; after: number; overAfter: number; examples: string[] };   // jour bas (≤ autorisé − 2) → le lendemain
  swing: number;                                              // écart moyen d'un jour à l'autre (14 derniers jours notés)
  avg7: number; allowed7: number;
  heavyHours: number[];
}
export function libPattern(s: LibState, log: LibLog[], until = localNow().date): LibPattern {
  const logged = new Set(log.map(l => dayOf(l.at)));
  const days: LibPattern['days'] = [];
  let unlogged = 0;
  for (let d = s.start; d <= until; d = addDays(d, 1)) {
    if (!logged.has(d)) { if (d < until) unlogged++; continue; }
    days.push({ date: d, taken: takenOn(log, d), allowed: allowedOn(s, d) });
  }
  const done = days.filter(d => d.date < until);   // aujourd'hui pas fini : pas dans les moyennes
  const byWd = new Map<number, number[]>();
  for (const d of done) byWd.set(wdOf(d.date), [...(byWd.get(wdOf(d.date)) ?? []), d.taken - d.allowed]);
  const wds = [...byWd.entries()].filter(([, v]) => v.length >= 2).map(([w, v]) => ({ wd: WEEKDAYS[w]!, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10, n: v.length }));
  const heavy = [...wds].sort((a, b) => b.avg - a.avg).filter(w => w.avg > 0).slice(0, 2);
  const light = [...wds].sort((a, b) => a.avg - b.avg).filter(w => w.avg < 0).slice(0, 2);
  const byDate = new Map(days.map(d => [d.date, d]));
  const rebound = { lows: 0, after: 0, overAfter: 0, examples: [] as string[] };
  const afters: number[] = [];
  for (const d of days) {
    if (d.date >= until || d.taken > d.allowed - 2) continue;
    rebound.lows++;
    const nx = byDate.get(addDays(d.date, 1));
    if (!nx) continue;
    afters.push(nx.taken);
    if (nx.taken > nx.allowed || nx.taken - d.taken >= 4) { rebound.overAfter++; rebound.examples.push(`${fmtDate(d.date)} ${halvesShort(d.taken)} → lendemain ${halvesShort(nx.taken)}`); }
  }
  rebound.after = afters.length ? Math.round(afters.reduce((a, b) => a + b, 0) / afters.length * 10) / 10 : 0;
  const last14 = days.slice(-14);
  const diffs = last14.slice(1).map((d, i) => Math.abs(d.taken - last14[i]!.taken));
  const last7 = done.slice(-7);
  const hours = new Map<number, number>();
  for (const l of log) if (l.kind === 'prise' && !/total/i.test(l.note ?? '')) { const h = Number(localNow(Date.parse(l.at)).hhmm.slice(0, 2)); hours.set(h, (hours.get(h) ?? 0) + (l.n ?? 1)); }
  return {
    days, unlogged, heavy, light,
    overDays: done.filter(d => d.taken > d.allowed).length,
    rebound: { ...rebound, examples: rebound.examples.slice(-3) },
    swing: diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length * 10) / 10 : 0,
    avg7: last7.length ? Math.round(last7.reduce((a, d) => a + d.taken, 0) / last7.length * 10) / 10 : 0,
    allowed7: last7.length ? Math.round(last7.reduce((a, d) => a + d.allowed, 0) / last7.length * 10) / 10 : 0,
    heavyHours: [...hours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([h]) => h).sort((a, b) => a - b),
  };
}
/** Le texte d'analyse (outil liberte action analyse, et un résumé court dans son dossier). */
export function patternText(p: LibPattern, short = false): string {
  const done = p.days.length;
  if (done < 5) return short ? '' : 'Pas encore assez de jours notés pour voir un rythme (il en faut 5).';
  const sign = (n: number) => `${n > 0 ? '+' : ''}${String(n).replace('.', ',')}`;
  const reb = p.rebound.lows ? `Après un jour très bas (${p.rebound.lows} fois), le lendemain il prend en moyenne ${halvesShort(p.rebound.after)}${p.rebound.overAfter ? ` — ${p.rebound.overAfter} fois ça a remonté fort (${p.rebound.examples.join(' ; ')})` : ''}.` : '';
  if (short) return [
    p.heavy.length ? `Ses jours les plus chargés : ${p.heavy.map(h => `${h.wd} (${sign(h.avg)} par rapport au plan)`).join(', ')}.` : '',
    p.rebound.overAfter ? `EFFET YO-YO repéré : ${reb} → un jour trop bas n'est pas une victoire s'il fait remonter le lendemain ; vise la régularité.` : '',
  ].filter(Boolean).join(' ');
  const last = p.days.slice(-10).map(d => `${WEEKDAYS[wdOf(d.date)]!.slice(0, 3)} ${d.date.slice(8)}/${d.date.slice(5, 7)} : ${String(d.taken).replace('.', ',')}${d.taken > d.allowed ? ` ⚠️(max ${d.allowed})` : `/${d.allowed}`}`).join('\n');
  return [
    '📊 TON RYTHME DE PRISES (en demis, jours notés)',
    last,
    '',
    p.heavy.length ? `🔴 Jours où tu prends le plus : ${p.heavy.map(h => `${h.wd} (${sign(h.avg)} demi par rapport au plan, sur ${h.n} semaines)`).join(' · ')}.` : 'Pas de jour de la semaine qui ressort encore.',
    p.light.length ? `🟢 Jours les plus calmes : ${p.light.map(h => `${h.wd} (${sign(h.avg)})`).join(' · ')}.` : '',
    reb ? `🔁 ${reb}` : '',
    `↕️ D'un jour à l'autre, ça bouge en moyenne de ${halvesShort(p.swing)}${p.swing >= 2.5 ? ' : c\'est beaucoup, c\'est ça qui fatigue le corps' : ''}.`,
    `7 derniers jours : ${halvesShort(p.avg7)}/jour en moyenne pour ${halvesShort(p.allowed7)} prévus. ${p.overDays} jour(s) au-dessus depuis le début.`,
    p.heavyHours.length ? `Heures où tu prends le plus : ${p.heavyHours.map(h => `${h}h`).join(', ')}.` : '',
    p.unlogged ? `${p.unlogged} jour(s) sans rien noté — ceux-là, je ne les vois pas.` : '',
    '',
    '💡 Ce que ça veut dire : le corps aime la RÉGULARITÉ. Un jour presque à zéro, c\'est souvent du manque le lendemain… et le lendemain on compense. Mieux vaut ton autorisé, à l\'heure, tous les jours, qu\'un jour à 3 et un jour à 8. Le lendemain d\'un jour bas : prises à l\'heure, pas de rattrapage, et je passe te voir l\'après-midi.',
  ].filter(l => l !== null && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}

// ── POURQUOI (25/11, Kouider : « il doit m'aider à arrêter, il cherche la cause, le pourquoi du comment ») ──
// Pour chaque jour noté, on rassemble ce qu'on sait déjà (nuit de la montre, jour de travail ou de congé, veille basse,
// envies et leurs déclencheurs, manque, moral, cause qu'il a donnée) puis on compare les jours où il prend PLUS
// (au-dessus du plan, ou +3 demis sur la veille) aux autres. Ce sont des pistes à vérifier avec lui, jamais un verdict.
export const CAUSES: Record<string, string> = {
  rebond: 'l\'effet rebond (trop peu la veille)', manque: 'le manque (le corps qui réclame)', stress: 'le stress', travail: 'le travail', fatigue: 'la fatigue / mal dormi',
  famille: 'une tension à la maison', ennui: 'l\'ennui / le vide', douleur: 'une douleur', habitude: 'l\'habitude, le geste automatique',
  tristesse: 'la tristesse / le moral', angoisse: 'l\'angoisse', autre: 'autre chose',
};
export function causeKey(raw: string): string {
  const t = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/rebond|trop peu hier|pas assez hier|presque rien hier|rien pris hier/.test(t)) return 'rebond';
  if (/manque|reclam|tremble|frisson|sevrage/.test(t)) return 'manque';
  if (/travail|boulot|taf|librairie|patron|client/.test(t)) return 'travail';
  if (/fatig|dormi|sommeil|creve|nuit/.test(t)) return 'fatigue';
  if (/femme|dispute|famille|maison|fils/.test(t)) return 'famille';
  if (/ennui|vide|rien a faire/.test(t)) return 'ennui';
  if (/douleur|mal (au|a la|aux|de)|dos|tete/.test(t)) return 'douleur';
  if (/habitude|automat|reflexe|sans reflechir/.test(t)) return 'habitude';
  if (/triste|moral|deprim|cafard/.test(t)) return 'tristesse';
  if (/angoiss|anxi|panique|peur/.test(t)) return 'angoisse';
  if (/stress|pression|nerv|enerv/.test(t)) return 'stress';
  return CAUSES[t] ? t : 'autre';
}
interface DayWhy { date: string; taken: number; allowed: number; high: boolean; sleep: number | null; off: boolean; lowBefore: boolean; triggers: string[]; symptoms: number | null; mood: number | null; causes: string[]; notes: string[] }
async function dayFactors(s: LibState, log: LibLog[], until = localNow().date): Promise<DayWhy[]> {
  const p = libPattern(s, log, until);
  const nights = parse<Array<{ date: string; sleep_h?: number }>>(await kvGet('health:daily').catch(() => null), []);
  const sleepOf = new Map(nights.filter(n => (n.sleep_h ?? 0) > 2).map(n => [n.date, n.sleep_h!]));
  const daysOff = await import('./kouider-dossier.js').then(m => m.getDaysOff()).catch(() => [] as number[]);
  const byDate = new Map(p.days.map(d => [d.date, d]));
  return p.days.map(d => {
    const prev = byDate.get(addDays(d.date, -1));
    const of = log.filter(l => (l.day ?? dayOf(l.at)) === d.date);
    const sy = of.filter(l => l.kind === 'symptomes' && l.score != null).map(l => l.score!);
    const mo = of.filter(l => l.kind === 'humeur' && l.score != null).map(l => l.score!);
    return {
      date: d.date, taken: d.taken, allowed: d.allowed,
      high: d.taken > d.allowed || (!!prev && d.taken - prev.taken >= 3),
      sleep: sleepOf.get(d.date) ?? null,
      off: daysOff.includes(wdOf(d.date)),
      lowBefore: !!prev && prev.taken <= prev.allowed - 2,
      triggers: of.filter(l => l.kind === 'envie' && l.trigger).map(l => l.trigger!),
      symptoms: sy.length ? Math.max(...sy) : null,
      mood: mo.length ? Math.min(...mo) : null,
      causes: of.filter(l => l.kind === 'cause' && l.trigger).map(l => l.trigger!),
      notes: of.filter(l => l.kind === 'cause' && l.note).map(l => l.note!),
    };
  });
}
export interface WhyFacts { hi: DayWhy[]; all: DayWhy[]; leads: Array<{ key: string; txt: string; score: number }>; told: Array<{ cause: string; label: string; n: number }>; triggers: Array<{ t: string; n: number }>; unknown: string[]; thoughts: string[] }
/** Les faits de l'enquête (partagés : texte, app, bilan, médecin). */
export async function whyFacts(s: LibState, log: LibLog[]): Promise<WhyFacts> {
  const today = localNow().date;
  const all = (await dayFactors(s, log)).filter(d => d.date < today || d.high);
  const hi = all.filter(d => d.high), lo = all.filter(d => !d.high);
  const pct = (a: DayWhy[], f: (d: DayWhy) => boolean | null) => { const k = a.filter(d => f(d) !== null); return k.length ? { n: k.filter(d => f(d)).length, of: k.length } : null; };
  const leads: WhyFacts['leads'] = [];
  const cmp = (key: string, label: string, f: (d: DayWhy) => boolean | null) => {
    const h = pct(hi, f), l = pct(lo, f);
    if (!h || h.n === 0) return;
    const rh = h.n / h.of, rl = l ? l.n / l.of : 0;
    if (rh >= 0.5 && rh - rl >= 0.2) leads.push({ key, txt: `${label} : ${h.n} fois sur ${h.of} les jours où tu prends plus${l ? `, contre ${l.n} sur ${l.of} les autres jours` : ''}`, score: rh - rl });
  };
  cmp('rebond', 'la veille, tu avais pris très peu (effet rebond)', d => d.lowBefore);
  cmp('fatigue', 'nuit de moins de 6 h', d => d.sleep == null ? null : d.sleep < 6);
  cmp('travail', 'jour de travail', d => !d.off);
  cmp('conge', 'jour de congé (temps libre, pas de cadre)', d => d.off);
  cmp('manque', 'manque fort (6/10 ou plus)', d => d.symptoms == null ? null : d.symptoms >= 6);
  cmp('tristesse', 'moral bas (4/10 ou moins)', d => d.mood == null ? null : d.mood <= 4);
  leads.sort((a, b) => b.score - a.score);
  const told = new Map<string, number>(), trig = new Map<string, number>();
  for (const d of hi) { for (const c of d.causes) told.set(c, (told.get(c) ?? 0) + 1); for (const t of d.triggers) trig.set(t, (trig.get(t) ?? 0) + 1); }
  return {
    hi, all, leads,
    told: [...told.entries()].sort((a, b) => b[1] - a[1]).map(([cause, n]) => ({ cause, label: CAUSES[cause] ?? cause, n })),
    triggers: [...trig.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => ({ t, n })),
    unknown: hi.filter(d => !d.causes.length && d.date < today).map(d => d.date),
    thoughts: hi.flatMap(d => d.notes).slice(-3),
  };
}
/** Le premier suspect d'un jour précis (pour la question du soir). */
function suspectOf(d: DayWhy | undefined): { key: string; txt: string } | null {
  if (!d) return null;
  if (d.lowBefore) return { key: 'rebond', txt: 'la veille tu avais pris très peu — l\'effet rebond' };
  if (d.sleep != null && d.sleep < 6) return { key: 'fatigue', txt: `ta nuit a été courte (${String(d.sleep).replace('.', ',')} h)` };
  if ((d.symptoms ?? 0) >= 6) return { key: 'manque', txt: `tu as noté un manque fort (${d.symptoms}/10)` };
  if (d.mood != null && d.mood <= 4) return { key: 'tristesse', txt: `ton moral était bas (${d.mood}/10)` };
  if (d.triggers.length) return { key: causeKey(d.triggers[0]!), txt: `ton envie venait de : ${d.triggers[0]}` };
  return null;
}
/** Plan « si… alors… » proposé pour une cause (il le garde, ou il écrit le sien). */
export const IF_THEN: Record<string, string> = {
  rebond: 'si j\'ai pris très peu la veille, alors le lendemain je prends mes prises à l\'heure, ni plus ni moins, et j\'écris « envie » à Dzaryx avant tout rattrapage',
  manque: 'si mon corps réclame, alors je bois un grand verre d\'eau froide, je marche 10 minutes et j\'attends 20 minutes avant de décider',
  stress: 'si le stress monte, alors je fais 5 minutes de cohérence cardiaque (page Liberté → Calme) avant de toucher à la boîte',
  travail: 'si le travail me pèse, alors je sors 5 minutes prendre l\'air et j\'écris à Dzaryx ce qui me pèse',
  fatigue: 'si j\'ai mal dormi, alors je prends à l\'heure, sieste de 20 minutes si je peux, et au lit 30 minutes plus tôt — pas de rattrapage',
  famille: 'si ça se tend à la maison, alors je sors marcher 10 minutes et j\'en parle calmement après',
  ennui: 'si je m\'ennuie, alors je fais ma mission du jour ou 20 pompes, et je sors avec mon fils',
  douleur: 'si j\'ai mal, alors je note la douleur sur 10 et j\'en parle à mon médecin, pas de demi en plus',
  habitude: 'si je tends la main vers la boîte sans y penser, alors je la range loin et je bois un verre d\'eau à la place',
  tristesse: 'si le moral tombe, alors j\'appelle quelqu\'un ou j\'écris à Dzaryx, et je relis mes raisons',
  angoisse: 'si l\'angoisse monte, alors je respire 4-4-6 six fois et je mets les mains sous l\'eau froide',
};
/** L'enquête : ce qui revient les jours où il prend plus, comparé aux autres jours. */
export async function whyText(s: LibState, log: LibLog[], short = false): Promise<string> {
  const f = await whyFacts(s, log);
  const { hi, leads } = f;
  if (!hi.length) return short ? '' : 'Aucun jour où tu as pris plus pour l\'instant : rien à expliquer.';
  const toldTxt = f.told.map(c => `${c.label} (${c.n})`).join(', ');
  const trigTxt = f.triggers.map(x => `${x.t} (${x.n})`).join(', ');
  const unknown = f.unknown.length;
  if (short) return [leads.length ? `Pistes sur le pourquoi : ${leads.slice(0, 2).map(l => l.txt).join(' ; ')}.` : '', toldTxt ? `Causes qu'il a données : ${toldTxt}.` : '', unknown ? `${unknown} jour(s) où il a pris plus sans cause connue → creuse avec lui (une question à la fois).` : ''].filter(Boolean).join(' ');
  return [
    `🔎 POURQUOI TU PRENDS PLUS CERTAINS JOURS (${hi.length} jour(s) étudiés : ${hi.slice(-5).map(d => `${fmtDate(d.date)} ${halvesShort(d.taken)}`).join(', ')})`,
    leads.length ? `Ce qui revient :\n${leads.slice(0, 4).map(l => `• ${l.txt}`).join('\n')}` : 'Rien ne ressort encore des chiffres (sommeil, travail, veille) : c\'est TOI qui as la réponse — dis-le-moi chaque fois.',
    toldTxt ? `Ce que tu m'as dit toi-même : ${toldTxt}.` : '',
    trigTxt ? `Tes envies ces jours-là venaient de : ${trigTxt}.` : '',
    f.thoughts.map(n => `« ${n} »`).join('\n'),
    unknown ? `❓ ${unknown} jour(s) où je ne sais pas encore pourquoi.` : '',
    'Ce sont des pistes, pas un jugement. Pour chaque cause on prépare un plan « si… alors… » (ex. « si j\'ai mal dormi, alors je prends à l\'heure et je fais une sieste de 20 min, pas de rattrapage »).',
  ].filter(Boolean).join('\n');
}
/** Hier très bas, ou jour de la semaine où il prend le plus → aujourd'hui = jour à surveiller. */
function riskToday(s: LibState, log: LibLog[], today: string): { reason: string } | null {
  const y = addDays(today, -1);
  const logged = log.some(l => dayOf(l.at) === y);
  const yt = takenOn(log, y), ya = allowedOn(s, y);
  if (logged && yt <= ya - 2) return { reason: `hier tu as pris peu (${halvesShort(yt)} pour ${halvesShort(ya)} autorisés) — bravo, mais c'est souvent le LENDEMAIN que ça remonte` };
  const p = libPattern(s, log, today);
  const wd = WEEKDAYS[wdOf(today)]!;
  if (p.heavy[0]?.wd === wd && p.heavy[0].avg >= 1) return { reason: `le ${wd}, c'est le jour où tu dépasses le plus (${String(p.heavy[0].avg).replace('.', ',')} demi de plus en moyenne)` };
  return null;
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
    await whyFacts(s, log).then(f => f.hi.length ? `Jours au-dessus du plan ou en forte hausse : ${f.hi.map(d => `${fmtDate(d.date)} ${d.taken}`).join(', ')}.${f.leads.length ? ` Ce qui revient : ${f.leads.slice(0, 3).map(l => l.txt.replace(/tu avais/g, "j'avais").replace(/tu prends/g, 'je prends')).join(' ; ')}.` : ''}${f.told.length ? ` Causes que je donne : ${f.told.map(c => `${c.label} (${c.n})`).join(', ')}.` : ''} Question : un effet rebond / manque entre deux prises — faut-il répartir autrement ?` : '').catch(() => ''),
    (() => { const m = momentStats(s, log); return m.rows[0]!.days >= 4 ? `Moments de prise (moyenne/jour) : ${m.rows.filter(r => r.avg > 0).map(r => `${r.label} ${r.avg}`).join(', ')}.` : ''; })(),
    log.some(l => l.kind === 'note' && l.note === 'veut aller plus vite' && Date.now() - Date.parse(l.at) < 30 * 86_400_000) ? 'Je veux arrêter le plus vite possible : quel rythme est sûr pour moi, et une aide pour le manque ?' : '',
    phq ? `Dépistage PHQ-2 (moral) : ${phq.score}/6${(phq.score ?? 0) >= 3 ? ' — positif' : ''}.` : '',
    health,
    'Plaintes : fatigue permanente, moral bas. Mes questions : valider ou adapter le plan ; aide pour le manque ; soutien moral / psychologue ; prise de sang (fer, vitamine D, thyroïde).',
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
// 03/11 : CarPlay affiche les événements du jour à l'écran de la voiture (passagers) → titres NEUTRES, jamais « Liberté »,
// ni dose dans la description (tout le détail reste dans la page LIBERTÉ de l'app).

export async function resyncLiberteAgenda(): Promise<number> { const s = await getLib(); if (!s) return 0; await syncAgenda(s); return s.eventIds.length; }
// 03/11 : anciens titres « 🕊️ Liberté — … » visibles sur CarPlay → supprimés de l'agenda (une fois, là où Google répond).
const OLD_TITLES = /^🕊️ Liberté —|^🕊️ Appeler le médecin \(Liberté\)|^🩺 Médecin \(Liberté\)/;
async function purgeOldLiberteEvents(): Promise<number | null> {
  const evs = await listAgendaRange(new Date(Date.now() - 3 * 86_400_000).toISOString(), new Date(Date.now() + 120 * 86_400_000).toISOString(), 250).catch(() => null);
  if (!evs) return null;
  let n = 0;
  for (const e of evs) if (e.id && OLD_TITLES.test(e.summary ?? '') && await deleteAgendaEvent(e.id).catch(() => false)) n++;
  return n;
}
async function syncAgenda(s: LibState): Promise<void> {
  // Sans accès Google (ex. serveur de secours) : ne rien toucher, sinon les ids sont perdus et les vieux événements restent.
  if (!(await listAgendaRange(new Date().toISOString(), new Date(Date.now() + 86_400_000).toISOString(), 1).catch(() => null))) return;
  for (const id of s.eventIds) await deleteAgendaEvent(id).catch(() => false);
  s.eventIds = [];
  if (!s.active) { await saveLib(s); return; }
  const today = localNow().date;
  const n = s.steps.length;
  for (const [i, st] of s.steps.entries()) {
    const end = s.steps[i + 1]?.from ?? addDays(st.from, 1);
    if (end <= today) continue;
    const plan = slotPlan(st.max, s.times, s.wakeDose).filter(p => p.n).map(p => `${p.time} → ${p.n} demi${p.n > 1 ? 's' : ''}`).join(', ');
    void plan;
    const title = st.max === 0 ? '🎯 Objectif perso — jour J' : `🎯 Objectif perso — étape ${i + 1}/${n}`;
    const desc = 'Détails dans l\'app Dzaryx.';
    const id = await createAgendaEvent(title, `${st.from}T00:00:00`, `${st.max === 0 ? addDays(st.from, 1) : end}T00:00:00`, desc, true, undefined, { transparent: true }).catch(() => null);
    if (id) s.eventIds.push(id);
  }
  if (s.doctor.status === 'a_appeler') {
    const day = localNow().hhmm < '09:00' ? today : addDays(today, 1);
    const id = await createAgendaEvent('📞 Appel perso', new Date(localTs(day, '09:00')).toISOString(), new Date(localTs(day, '09:15')).toISOString(),
      'Détails dans l\'app Dzaryx.', false).catch(() => null);
    if (id) s.eventIds.push(id);
  }
  if (s.doctor.status === 'rdv_pris' && s.doctor.date && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s.doctor.date) && s.doctor.date.slice(0, 10) >= today) {
    const t = localTs(s.doctor.date.slice(0, 10), s.doctor.date.slice(11, 16));
    const id = await createAgendaEvent('📌 RDV perso', new Date(t).toISOString(), new Date(t + 30 * 60_000).toISOString(),
      'Détails dans l\'app Dzaryx.', false).catch(() => null);
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
  pattern: string;
  why: string;
  insight: null | { days: Array<{ date: string; taken: number; allowed: number; high: boolean; lowBefore: boolean; sleep: number | null; causes: string[] }>; leads: Array<{ key: string; txt: string }>; told: Array<{ cause: string; label: string; n: number }>; unknown: string[]; heavy: LibPattern['heavy']; rebound: LibPattern['rebound']; swing: number; avg7: number; allowed7: number; causes: Record<string, string>; moments: MomentStats };
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
    riskHours: riskHours(log, s),
    comeback: s ? comeback(log, s.start) : [],
    phq2: [...log].reverse().find(l => l.kind === 'phq2')?.score ?? null,
    mission: s ? { text: missionOf(s, today), done: log.some(l => l.kind === 'mission' && dayOf(l.at) === today) } : null,
    victories: log.filter(l => l.kind === 'victoire' && l.note).slice(-8).reverse().map(l => ({ at: l.at, text: l.note! })),
    calm: log.filter(l => l.kind === 'calme').length,
    pattern: s ? patternText(libPattern(s, log, today), true) : '',
    why: s ? await whyText(s, log, true).catch(() => '') : '',
    insight: s ? await (async () => {
      const f = await whyFacts(s, log), p = libPattern(s, log, today);
      return { days: f.all.slice(-21).map(d => ({ date: d.date, taken: d.taken, allowed: d.allowed, high: d.high, lowBefore: d.lowBefore, sleep: d.sleep, causes: d.causes })), leads: f.leads.map(l => ({ key: l.key, txt: l.txt })), told: f.told, unknown: f.unknown, heavy: p.heavy, rebound: p.rebound, swing: p.swing, avg7: p.avg7, allowed7: p.allowed7, causes: CAUSES, moments: momentStats(s, log) };
    })().catch(() => null) : null,
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
    o.pattern ? `Rythme : ${o.pattern}` : '',
    o.why ? o.why : '',
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
    '- « Je n\'arrive plus à baisser », moral qui replonge (travail, dépression) : dis-lui la VÉRITÉ du statut (s\'il est dans le plan, il n\'a PAS « freiné » ni échoué : dis « tu es à X/Y, dans ton plan »). Annonce la prochaine baisse (date + quantité) et propose-lui de choisir : la garder, ou rester quelques jours de plus à ce palier (action palier, jamais remonter) en attendant de voir son médecin — c\'est LUI qui décide. Moral très bas → médecin cette semaine + psy de 1re ligne ; idées noires → 112.',
    '- Le médecin d\'abord : tant que le statut est « pas encore appelé », pousse-le (une fois par jour, pas plus) à appeler son médecin traitant : valider le plan, l\'aider pour le manque, soigner la fatigue et le moral. Psychologue de 1re ligne remboursé (11 €, 1re séance gratuite).',
    '- Utilise tout : agenda (ses étapes y sont), sport (marcher / séance légère les jours durs : sport_coach), sommeil (outil sante), son moral (life_coach), FORME, sa famille comme raison (« ton fils, ta femme »), ses raisons à lui ci-dessus.',
    '- « Quels jours je prends le plus ? », « analyse mes prises », « hier presque rien et aujourd\'hui trop » → liberte action analyse, puis aide-le : la régularité compte plus qu\'un jour héroïque ; le lendemain d\'un jour bas = prises à l\'heure, pas de rattrapage.',
    '- CHERCHER LE POURQUOI : quand il a pris plus (ou le dit), ne te contente pas de noter. Mène l\'enquête avec lui, UNE question à la fois, sans juger : à quel moment ça a commencé ? qu\'est-ce qui s\'est passé juste avant ? où il était, avec qui ? ce qu\'il ressentait dans le corps (manque) ou dans la tête (stress, ennui, tristesse) ? ce qu\'il s\'est dit (« juste un demi, ça va passer ») ? Puis liberte action cause (trigger = manque|stress|travail|fatigue|famille|ennui|douleur|habitude|tristesse|angoisse, text = son récit en une phrase, date aujourd\'hui|hier). Croise avec ce que tu sais (nuit de la montre, veille basse, travail) en le présentant comme une piste (« je me demande si… »), puis construis AVEC lui un plan si-alors pour cette cause (action si_alors). « Pourquoi je prends plus ? » → action analyse.',
    '- MOMENTS : quand il donne un total ou un gros chiffre d\'un coup, demande UNE fois « à quels moments ? (réveil, matin, midi, aprèm, soir, nuit) » puis liberte action journee (date, reveil, matin, midi, aprem, soir, nuit = demis). Prise au moment même → action prise avec moment si dit. « À quel moment je prends le plus ? » → action moments.',
    '- La date du zéro ne recule plus toute seule (ni dépassement, ni manque : pour le manque, c\'est LUI qui choisit). Rappelle-lui souvent le compte à rebours (J-n).\n- « Le médecin est d\'accord pour le plan rapide » → liberte action plan_rapide_valide confirm:true. Jamais sans cette phrase.',
    '- « Je veux arrêter au plus vite » → liberte action plus_vite (rapport + question au médecin + rappel d\'appel), puis dis-lui que le chemin le plus court tout de suite = zéro dépassement, zéro yo-yo. Tu n\'accélères JAMAIS le plan toi-même.',
    '- Grosse baisse qui l\'inquiète (≥ 2 demis d\'un coup) → propose-lui de CHOISIR : garder la marche, ou liberte action adoucir (marches de 1 demi tous les 3 jours — jamais plus haut, seul le jour zéro recule) ; en parler au médecin.',
    '- C\'est fini seulement quand LUI dit « c\'est bon, j\'ai arrêté » (action finish). D\'ici là tu ne lâches rien. Rechute = normal, jamais un échec : on note, on reprend.',
    '- EN APPEL / SIRI / VOCAL : s\'il a une envie pendant un appel, guide-le À VOIX HAUTE (« inspire… 2… 3… 4… bloque… souffle… »), phrases courtes, reste en ligne 10 minutes. Propose « je t\'envoie ta propre voix » (liberte action ma_voix).',
    '- Il te donne énergie / joie / clarté sur 10 (« 5 6 5 ») → liberte action retour. Ses réponses aux 2 questions du moral (« 1 2 », 0-3 chacune) → action phq2.',
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
      const mk = momentKey(input['moment']);
      const log = await addLog({ kind: 'prise', n, note: String(input['note'] ?? '').slice(0, 200) || undefined, ...(mk ? { moment: mk } : {}) });
      const allowed = allowedOn(s, today), taken = takenOn(log, today);
      const plan = slotPlan(allowed, s.times, s.wakeDose), byNow = allowedByNow(plan, hhmm);
      if (s.finishedAt || taken > allowed) {
        const over = taken - allowed;
        await addLog({ kind: 'depassement', n: over });
        const hold = s.finishedAt ? '' : 'La date du zéro NE BOUGE PAS (25/11 : il veut arrêter au plus vite) : demain on reprend le plan exact.';
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
      if (score >= 7 && recent.filter(l => (l.score ?? 0) >= 7).length >= 2 && await once(`symhold:${today}`)) {
        // 25/11 : il veut aller au plus vite → on n'allonge plus tout seul, il CHOISIT (et le médecin en premier)
        const { createDecision } = await import('./conscience.js');
        await createDecision('🕊️ Manque fort 2 jours de suite. Tu préfères :', [
          { label: '💪 Je tiens la date', tool: 'liberte', input: { action: 'victoire', text: 'manque fort tenu sans repousser la date' } },
          { label: '⏸️ 3 jours de plus à ce palier', tool: 'liberte', input: { action: 'palier', days: 3, why: 'manque fort 2 jours' } },
          { label: '🩺 J\'appelle le médecin', tool: 'liberte', input: { action: 'plus_vite' } },
        ]);
        hold = 'Choix envoyé (tenir la date / 3 jours de plus / médecin). Pousse le médecin aujourd\'hui : des traitements aident le manque.';
      }
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

    case 'journee': {
      // « ce matin 3, midi 2, ce soir 3 » → la journée entière par moment (remplace les prises notées ce jour-là)
      const d = /hier/i.test(String(input['date'] ?? '')) ? addDays(today, -1) : /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : today;
      const parts = MOMENTS.map(m => ({ m, n: Math.max(0, Math.round(Number(String(input[m.key] ?? 0).replace(',', '.')) * 2) / 2) })).filter(x => x.n > 0);
      const log = (await readLibLog()).filter(l => !(l.kind === 'prise' && dayOf(l.at) === d));
      for (const x of parts) log.push({ at: new Date(localTs(d, x.m.at)).toISOString(), kind: 'prise', n: x.n, moment: x.m.key, note: 'journée par moment' });
      if (!parts.length) log.push({ at: new Date(localTs(d, '20:00')).toISOString(), kind: 'note', note: 'total du jour : zéro' });
      log.sort((a, b) => a.at.localeCompare(b.at));
      await kvSet(LOG_KEY, JSON.stringify(log.slice(-1500)));
      const n = parts.reduce((a, x) => a + x.n, 0), allowed = allowedOn(s, d);
      const fresh = await readLibLog();
      if (n > allowed && !fresh.some(l => l.kind === 'depassement' && dayOf(l.at) === d)) await addLog({ kind: 'depassement', n: n - allowed, note: `total du ${d}` });
      const undone = n <= allowed ? await undoOverrun(s, d) : '';
      const plan = slotPlan(allowed, s.times, s.wakeDose);
      const over = parts.filter(x => x.n > plan.filter(p => momentOfTime(p.time) === x.m.key).reduce((a, p) => a + p.n, 0)).map(x => x.m.label);
      return `${undone}✅ ${d === today ? 'Aujourd\'hui' : fmtDate(d)} : ${parts.map(x => `${x.m.label} ${halvesShort(x.n)}`).join(' · ') || 'rien'} = ${halvesShort(n)} pour ${halvesShort(allowed)} autorisés.${over.length ? ` Au-delà du plan : ${over.join(', ')} — c'est ce moment-là qu'on va travailler.` : ''} Merci, avec les moments je vois enfin où ça se joue.`;
    }

    case 'plan_rapide': {
      // Plan PLUS RAPIDE préparé pour le médecin : mêmes marches que son plan, mais 10 jours chacune (jamais moins de 7,
      // jamais une marche plus grosse que les siennes). Rien n'est appliqué : il le montre au médecin.
      const days = Math.min(14, Math.max(7, Math.round(Number(input['days'] ?? 10))));
      const cur = s.steps.findIndex(st => st.from > today);
      if (cur < 0) return 'Il est déjà au palier zéro.';
      const levels = s.steps.slice(cur).map(st => st.max);
      const first = s.steps[cur]!.from;
      const steps: LibStep[] = levels.map((max, k) => ({ from: addDays(first, k * days), max }));
      s.fastProposal = { at: new Date().toISOString(), steps };
      await saveLib(s);
      const zeroNow = zeroDay(s), zeroFast = steps.at(-1)!.from;
      const txt = `🏁 PLAN PLUS RAPIDE — À FAIRE VALIDER PAR MON MÉDECIN\nPlan actuel : ${s.steps.slice(cur).map(st => `${fmtDate(st.from)} → ${st.max}`).join(' · ')} (zéro le ${fmtDate(zeroNow)}).\nProposition (mêmes marches, ${days} jours chacune) : ${steps.map(st => `${fmtDate(st.from)} → ${st.max}`).join(' · ')}.\n➡️ Zéro le ${fmtDate(zeroFast)}, soit ${daysBetween(zeroFast, zeroNow)} jours plus tôt.\nQuestion au médecin : est-ce sûr pour moi ? Faut-il une aide pour le manque (dernières marches) ?`;
      await queueTelegramMessage(txt);
      return `${txt}\n\n(Envoyé sur Telegram. Rien n'est changé tant qu'il ne dit pas « le médecin est d'accord » → action plan_rapide_valide confirm:true.)`;
    }

    case 'plan_rapide_valide': {
      if (!s.fastProposal) return 'Aucun plan rapide préparé : action plan_rapide d\'abord.';
      if (input['confirm'] !== true) return 'Seulement si SON MÉDECIN a validé le plan rapide : demande-lui de confirmer (« oui le médecin est d\'accord ») puis confirm:true.';
      const keep = s.steps.filter(st => st.from <= today);
      s.steps = [...keep, ...s.fastProposal.steps.filter(st => st.from > today)];
      s.doctorPlan = true;
      delete s.fastProposal;
      await saveLib(s);
      await addLog({ kind: 'note', note: 'plan rapide validé par le médecin' });
      await syncAgenda(s).catch(err => console.error('[liberte] agenda:', err instanceof Error ? err.message : err));
      return `🏁 Plan rapide appliqué (validé par son médecin) : ${s.steps.filter(st => st.from > today).map(st => `${fmtDate(st.from)} → ${halvesShort(st.max)}`).join(' · ')}. JOUR ZÉRO : ${fmtDate(zeroDay(s))}. Dis-lui que tu seras là chaque jour jusque-là.`;
    }

    case 'plus_vite': {
      // 25/11 « je dois arrêter au plus vite » : Dzaryx n'accélère JAMAIS seul (arrêt trop rapide = manque fort, rebonds, parfois dangereux).
      // Il note l'envie, prépare la question pour le médecin (rapport) et met un rappel d'appel dans l'agenda.
      await addLog({ kind: 'note', note: 'veut aller plus vite' });
      let day = addDays(today, 1);
      for (let k = 0; k < 6 && (wdOf(day) === 0 || wdOf(day) === 6); k++) day = addDays(day, 1);   // cabinet fermé le week-end
      await createAgendaEvent('📞 Appel perso', new Date(localTs(day, '09:00')).toISOString(), new Date(localTs(day, '09:15')).toISOString(), 'Appeler le médecin (détails dans l\'app, page privée).').catch(() => null);
      await liberteTool({ action: 'plan_rapide' }, 'kouider').catch(() => '');
      await queueTelegramMessage(`${await doctorReport(s, await readLibLog())}\n\n❓ MA DEMANDE : je veux arrêter le plus vite possible (proposition de plan rapide envoyée juste avant). Quel rythme de baisse est sûr pour moi ? Est-ce qu'un traitement peut m'aider à passer le manque pour aller plus vite ?`);
      const p = libPattern(s, await readLibLog());
      return `Noté : il veut aller plus vite. Rapport + sa question envoyés sur Telegram, rappel « appeler le médecin » le ${fmtDate(day)} à 9h. Dis-lui la vérité, simplement : 1) c'est son MÉDECIN qui peut accélérer le plan (tu ne le fais jamais seul : trop vite = manque fort, rebonds, parfois dangereux) ; 2) ce qui le fait aller plus vite DÈS AUJOURD'HUI, c'est zéro jour au-dessus du plan et zéro yo-yo : chaque dépassement repousse ses paliers de 2 jours${p.overDays ? ` (${p.overDays} dépassement(s) jusqu'ici)` : ''}, et chaque jour trop bas prépare un lendemain trop haut ; 3) tenir exactement son autorisé, à l'heure, chaque jour = le chemin le plus court. Propose-lui de noter sa journée par moment pour trouver le moment à travailler.`;
    }

    case 'adoucir': {
      // 25/11 : grosse marche (ex. 6 → 3 d'un coup) + effet rebond chez lui → il peut CHOISIR des marches de 1 demi tous les 3 jours.
      // Jamais une remontée : chaque jour reste ≤ au jour d'avant ; seule la date du zéro recule.
      const i = s.steps.findIndex(st => st.from > today);
      if (i < 1) return 'Pas de prochaine baisse à adoucir.';
      const prev = s.steps[i - 1]!.max, drop = s.steps[i]!;
      const gap = prev - drop.max;
      if (gap < 2) return `La prochaine baisse (${fmtDate(drop.from)} → ${halvesShort(drop.max)}) n'est que d'un demi : elle est déjà douce.`;
      const every = Math.min(4, Math.max(2, Math.round(Number(input['days'] ?? 3))));
      const shift = (gap - 1) * every;
      const mids: LibStep[] = Array.from({ length: gap - 1 }, (_, k) => ({ from: addDays(drop.from, k * every), max: prev - 1 - k }));
      for (const st of s.steps.slice(i)) st.from = addDays(st.from, shift);
      s.steps.splice(i, 0, ...mids);
      await saveLib(s);
      await addLog({ kind: 'palier', n: shift, note: `marche adoucie : ${prev} → ${drop.max} en ${gap} marches de 1` });
      await syncAgenda(s).catch(err => console.error('[liberte] agenda:', err instanceof Error ? err.message : err));
      return `🪜 Marche adoucie : ${[...mids, s.steps[i + mids.length]!].map(st => `${fmtDate(st.from)} → ${halvesShort(st.max)}`).join(' · ')}. Jour zéro : ${fmtDate(zeroDay(s))}.${s.doctorPlan ? ' C\'est le plan de ton médecin : dis-lui ce changement au prochain RDV (il est plus doux, pas plus haut).' : ''}`;
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
    case 'analyse': { const log = await readLibLog(); return `${patternText(libPattern(s, log))}\n\n${momentText(momentStats(s, log))}\n\n${await whyText(s, log)}`; }
    case 'moments': return momentText(momentStats(s, await readLibLog()));
    case 'pourquoi_analyse': return await whyText(s, await readLibLog());
    case 'cause': {
      const raw = String(input['trigger'] ?? input['text'] ?? '').trim();
      if (!raw) return '❌ Quelle cause ? (manque, stress, travail, fatigue, famille, ennui, douleur, habitude, tristesse, angoisse) + son récit dans text.';
      const day = /hier/i.test(String(input['date'] ?? '')) ? addDays(today, -1) : /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : today;
      const key = CAUSES[raw] ? raw : causeKey(raw);
      const text = String(input['text'] ?? '').trim();
      await addLog({ kind: 'cause', trigger: key, day, ...(text && text !== raw ? { note: text.slice(0, 200) } : {}) });
      const same = (await readLibLog()).filter(l => l.kind === 'cause' && l.trigger === key).length;
      const ifThen = s.ifThen?.find(x => causeKey(x) === key);
      if (input['bouton'] === true) {   // choisi par bouton (sans cerveau) : on propose tout de suite le plan pour la prochaine fois
        const { createDecision } = await import('./conscience.js');
        await createDecision(ifThen ? `🔎 ${CAUSES[key]} — tu avais déjà un plan : « ${ifThen} ». Qu'est-ce qui l'a empêché de marcher cette fois ?` : `🔎 Merci. Pour la prochaine fois, je te propose : « ${IF_THEN[key] ?? 'si ça revient, alors je dis « envie » à Dzaryx avant de prendre quoi que ce soit'} »`,
          ifThen ? [{ label: '💬 Je te raconte', say: `Mon plan « ${ifThen} » n'a pas marché, je t'explique pourquoi.` }]
            : [{ label: '👍 Je garde ce plan', tool: 'liberte', input: { action: 'si_alors', text: IF_THEN[key] ?? 'si ça revient, alors je dis « envie » à Dzaryx avant de prendre quoi que ce soit' } },
               { label: '✏️ J\'écris le mien', say: 'Je veux écrire mon propre plan si-alors pour cette cause, aide-moi.' }]);
        return `🔎 Noté : ${CAUSES[key]}.`;
      }
      return `🔎 Noté pour le ${fmtDate(day)} : ${CAUSES[key]}.${same >= 2 ? ` C'est la ${same}e fois que ça revient.` : ''} ${ifThen ? `Il a déjà un plan pour ça : « ${ifThen} » — demande-lui pourquoi il n'a pas marché cette fois et ajuste-le avec lui.` : 'Aide-le à écrire SON plan « si… alors… » pour la prochaine fois (action si_alors).'} Une seule question à la fois, sans juger.`;
    }

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
      for (const k of ['energie', 'joie', 'clarte']) { const v = Number(input[k]); if (v >= 1 && v <= 10) scores[k] = Math.round(v); }
      if (!Object.keys(scores).length) return '❌ energie, joie, clarte de 1 à 10.';
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
      else log.push({ at, kind: 'note', note: 'total du jour : zéro' });   // 25/11 : un jour à zéro est un jour NOTÉ (pas « pas noté »)
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
    o.week.map(d => !log.some(l => dayOf(l.at) === d.date) && d.date < o.today ? `${fmtDate(d.date)} : pas noté ❔` : `${fmtDate(d.date)} : ${d.taken}/${d.allowed}${d.taken > d.allowed ? ' ⚠️' : ' ✅'}`).join('\n'),
    `Envies : ${w.filter(l => l.kind === 'envie').length} (résistées : ${w.filter(l => l.kind === 'resiste').length})${o.triggers.length ? ` · déclencheur n°1 : ${o.triggers[0]!.trigger}` : ''}`,
    sym.length ? `Manque moyen : ${avg(sym)}/10` : '',
    moods.length ? `Moral moyen : ${avg(moods)}/10` : '',
    health,
    `${o.avoided} demis évités depuis le début · ${o.streak} jour(s) d'affilée dans le plan.`,
    o.nextDrop ? `Cette semaine : baisse le ${fmtDate(o.nextDrop.from)} → ${halvesShort(o.nextDrop.max)}/jour.` : 'Tu es au palier zéro. Chaque jour compte.',
    await whyText(s, log).then(t => t.startsWith('🔎') ? `\n${t}\n` : '').catch(() => ''),
    o.bank ? `💰 Cagnotte : ${eur(o.bank.balance)} — gain du prochain jour validé : ${eur(o.bank.rate)}` : '',
    o.comeback.length > 1 ? `✨ Ce qui revient : ${(['energie', 'joie', 'clarte'] as const).map(k => { const a = o.comeback[0]![k], b = o.comeback.at(-1)![k]; return a != null && b != null ? `${k} ${a}→${b}` : ''; }).filter(Boolean).join(' · ')}` : '',
    s.doctor.status === 'a_appeler' ? '🩺 Le médecin n\'est toujours pas appelé : c\'est LA chose de la semaine.' : '',
    '',
    '❓ Cette semaine, de 1 à 10 : ton ÉNERGIE, ta JOIE, ton esprit CLAIR ? (réponds par exemple « 5 6 5 »)',
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
  const drop = s.steps.find((st, i) => i > 0 && st.from === o.today);   // le 1er palier = dose de départ, pas une baisse (30/10)
  const risk = o.allowed ? riskToday(s, await readLibLog(), o.today) : null;
  return [
    `🕊️ Liberté — jour ${o.day}/${o.totalDays} · 🏁 zéro le ${fmtDate(o.zero)} (J-${daysBetween(o.today, o.zero)})${drop ? ` · NOUVELLE ÉTAPE : ${drop.max === 0 ? 'JOUR ZÉRO, plus rien 💪' : `${halvesShort(drop.max)} max`}` : ''}`,
    o.allowed ? `Aujourd'hui : ${plan}.` : `Aujourd'hui : rien. Chaque envie → dis-moi « envie », je suis là.`,
    `🎯 Mission anti-zombie du jour (+1 €) : ${missionOf(s, o.today)}.`,
    '🌅 Rituel du réveil, à la place du comprimé : 2 grands verres d\'eau → 20 pompes → 30 s d\'eau froide en fin de douche → lumière du jour.',
    risk ? `⚠️ Jour à surveiller : ${risk.reason}. Aujourd'hui : tes prises à l'heure, pas de rattrapage. Je passe te voir vers 14h.` : '',
  ].filter(Boolean).join('\n');
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
  if (!(await kvGet('liberte:agenda-neutral-v1').catch(() => null))) {
    const n = await purgeOldLiberteEvents();
    if (n !== null) { await syncAgenda(s).catch(() => {}); if (s.eventIds.length || !s.steps.length) await kvSet('liberte:agenda-neutral-v1', String(n)); console.log(`[liberte] agenda neutre : ${n} ancien(s) supprimé(s), ${s.eventIds.length} recréé(s)`); }
  }
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

  // 25/11 : hier rien de noté → le matin, on demande le vrai chiffre en un clic (un jour non noté = un jour qu'on ne peut pas comprendre)
  if (hhmm >= '09:30' && hhmm < '12:00' && !dnd) {
    const y = addDays(today, -1), log = await readLibLog();
    if (y >= s.start && !log.some(l => dayOf(l.at) === y) && await once(`unlogged:${y}`, 3 * 86_400)) {
      const ya = allowedOn(s, y);
      const { createDecision } = await import('./conscience.js');
      await createDecision(`🕊️ Hier (${fmtDate(y)}), je n'ai rien de noté. Tu en as pris combien, en vrai ? Sans jugement — c'est ce qui me permet de comprendre tes journées.`, [
        { label: `✅ Comme prévu (${halvesShort(ya)})`, tool: 'liberte', input: { action: 'total', date: y, n: ya } },
        { label: '0️⃣ Rien du tout', tool: 'liberte', input: { action: 'total', date: y, n: 0 } },
        { label: '⬆️ Plus que prévu', say: `Hier (${fmtDate(y)}) j'ai pris plus que prévu, je te dis combien.` },
        { label: '⬇️ Moins que prévu', say: `Hier (${fmtDate(y)}) j'ai pris moins que prévu, je te dis combien.` },
      ]);
    }
  }

  // 25/11 : grosse marche qui arrive (≥ 2 demis d'un coup) et il a déjà eu des rebonds → 2 jours avant, il CHOISIT
  {
    const i = s.steps.findIndex(st => st.from > today);
    const drop = i >= 1 ? s.steps[i]! : null, prev = i >= 1 ? s.steps[i - 1]!.max : 0;
    if (drop && prev - drop.max >= 2 && daysBetween(today, drop.from) <= 2 && hhmm >= '19:00' && hhmm < '21:00' && !dnd) {
      const p = libPattern(s, await readLibLog());
      if (await once(`bigdrop:${drop.from}`, 5 * 86_400)) {
        const { createDecision } = await import('./conscience.js');
        await createDecision(`🕊️ ${fmtDate(drop.from)}, tu passes de ${halvesShort(prev)} à ${halvesShort(drop.max)} d'un coup${prev >= 2 * drop.max ? ' (la moitié)' : ''}. ${p.rebound.overAfter ? `Tes chiffres : après un jour trop bas, ${p.rebound.overAfter} fois ça a remonté fort le lendemain. ` : ''}Une grosse marche, c'est souvent du manque… puis un rattrapage. Tu préfères :`, [
          { label: '👍 Je garde la marche', tool: 'liberte', input: { action: 'victoire', text: `prêt pour la marche du ${drop.from}` } },
          { label: `🪜 Des marches de 1 (${prev}→${prev - 1}→…→${drop.max})`, tool: 'liberte', input: { action: 'adoucir', days: 3 } },
          { label: '💬 On en parle', say: `On parle de ma baisse du ${fmtDate(drop.from)} (${prev} → ${drop.max}) : j'ai peur du rebond.` },
        ]);
      }
    }
  }

  // Le soir d'un jour où il a pris plus (ou le lendemain matin si raté) : lui demander POURQUOI, avec des boutons (25/11)
  {
    const log = await readLibLog();
    const ask = async (day: string, label: string) => {
      const t = takenOn(log, day), a = allowedOn(s, day), prev = takenOn(log, addDays(day, -1));
      const high = t > a || (log.some(l => dayOf(l.at) === addDays(day, -1)) && t - prev >= 3);
      if (!high || log.some(l => l.kind === 'cause' && (l.day ?? dayOf(l.at)) === day) || !await once(`why:${day}`, 3 * 86_400)) return;
      const { createDecision } = await import('./conscience.js');
      const sus = suspectOf((await dayFactors(s, log, day)).find(x => x.date === day));
      const btn = (k: string, l: string) => ({ label: l, tool: 'liberte', input: { action: 'cause', trigger: k, date: day, bouton: true } });
      await createDecision(`🕊️ ${label} tu as pris ${halvesShort(t)} (plan : ${halvesShort(a)}${prev ? `, la veille ${halvesShort(prev)}` : ''}). Pas de jugement : on cherche juste POURQUOI, pour que ça ne se reproduise pas.${sus ? ` Ma piste : ${sus.txt}. Je me trompe ?` : ' C\'était plutôt…'}`, [
        sus?.key === 'rebond' ? btn('rebond', '🔁 Oui, trop peu la veille') : btn('manque', '😣 Le manque, mon corps réclamait'),
        btn('stress', '😤 Stress / travail'),
        sus?.key === 'rebond' ? btn('manque', '😣 Le manque, mon corps réclamait') : btn('fatigue', '😴 Fatigue, mal dormi'),
        { label: '💬 Autre chose, je te raconte', say: `Je vais te raconter pourquoi j'ai pris plus le ${fmtDate(day)}. Pose-moi tes questions une par une.` },
      ]);
    };
    if (hhmm >= '21:30' && hhmm < '22:30' && !dnd) await ask(today, 'Aujourd\'hui');
    else if (hhmm >= '09:00' && hhmm < '12:00' && !dnd) await ask(addDays(today, -1), 'Hier');
  }

  // Jour à surveiller (hier très bas → rebond, ou son jour le plus chargé) : un passage vers 14h, avant que ça déborde (25/11)
  if (o.allowed && hhmm >= '14:00' && hhmm < '15:00' && !dnd) {
    const risk = riskToday(s, await readLibLog(), today);
    if (risk && o.taken <= o.allowed && await once(`risk:${today}`)) {
      const { createDecision } = await import('./conscience.js');
      await createDecision(`🕊️ Petit passage : ${risk.reason}. Là tu en es à ${o.taken}/${o.allowed}${o.next ? `, prochaine prise ${o.next.time}` : ''}. Comment ça va ?`, [
        { label: '👍 Ça va, je tiens le plan', tool: 'liberte', input: { action: 'victoire', text: 'jour à risque tenu à 14h' } },
        { label: '🔥 Ça tire, aide-moi', tool: 'liberte', input: { action: 'envie', trigger: 'lendemain de jour bas' } },
      ]);
    }
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
    const drop = s.steps.find((st, i) => i > 0 && st.from === addDays(today, 1));
    await queueTelegramMessage([
      `🌙 Liberté — ta journée : ${o.taken ? `${halvesShort(o.taken)} noté${o.taken > 1 ? 's' : ''} sur ${o.allowed} autorisé${o.allowed > 1 ? 's' : ''}` : o.allowed ? 'rien de noté aujourd\'hui. Tu en as pris combien vraiment ? La vérité, sans jugement.' : 'jour sans rien 🕊️'}${o.taken > o.allowed ? ' — demain on repart.' : o.taken ? ' ✅' : ''}`,
      '❓ Ton manque de 0 à 10 ? Ton moral de 1 à 10 ? Et ta VICTOIRE du jour, même petite ?',
      o.mission && !o.mission.done ? `🎯 Ta mission (« ${o.mission.text} ») : faite ? (+1 €)` : '',
      drop ? `\n⬇️ DEMAIN NOUVELLE ÉTAPE : ${drop.max === 0 ? 'JOUR ZÉRO. Plus rien. Tu es prêt, et je serai là toute la journée.' : `${halvesShort(drop.max)} par jour.`}` : '',
      tomorrow.length ? `\n💊 Prépare ton pilulier de demain MAINTENANT : ${tomorrow.map(p => `${p.time} → ${halvesShort(p.n)}`).join(' · ')} (${halves(o.tomorrow)} au total). Le reste de la boîte : rangé loin de la table de nuit et de la voiture.` : '',
      o.taken > 0 && o.taken <= o.allowed - 2 ? `\n⚠️ Tu as pris peu aujourd'hui (${halvesShort(o.taken)}) — bravo. Mais attention : chez toi, c'est le LENDEMAIN que ça remonte (effet rebond). Demain : tes prises à l'heure, pas de rattrapage, et au moindre tiraillement tu m'écris « envie ».` : '',
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
  const drop = s.steps.find((st, i) => i > 0 && st.from === today);
  if (drop && hhmm >= '12:30' && hhmm < '18:00')
    await autoCall(`liberte-drop-${today}`, drop.max === 0
      ? 'Kouider, c\'est Dzaryx. Jour zéro aujourd\'hui. Je voulais juste entendre ta voix. Comment tu tiens ?'
      : `Salut Kouider, c'est Dzaryx. Aujourd'hui ton palier descend à ${drop.max} demis maximum. Comment tu te sens ? Le manque, ça va ?`);

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

  // 3 semaines après le jour zéro : l'énergie revient-elle ? Sinon → prise de sang chez le médecin
  if (today === addDays(zeroDay(s), 21) && hhmm >= '19:00' && hhmm < '21:00' && await once(`libido:${today}`)) {
    const cb = o.comeback, a = cb[0], b = cb.at(-1);
    const up = a && b && b !== a && (b.energie ?? 0) - (a.energie ?? 0) >= 2;
    await queueTelegramMessage(up
      ? `✨ 3 semaines après ton jour zéro : ton énergie remonte (${a!.energie ?? '?'}→${b!.energie ?? '?'}). C'est ton corps qui revient. Continue.`
      : '🩺 3 semaines après ton jour zéro. Si l\'énergie ne revient pas encore assez, c\'est fréquent après des années de ce type de médicament. Ça se vérifie par une simple prise de sang — parles-en à ton médecin cette semaine.');
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
  // 02/11 : fausse alerte « je te vois à la pharmacie » en voiture → seulement s'il est À L'ARRÊT au même endroit ≥ 5 min
  // (passer devant en roulant ou s'arrêter à un feu ne compte plus), et jamais pendant qu'il conduit (CarPlay branché).
  const car = parse<{ at: number; type: string } | null>(await kvGet('car:last-event').catch(() => null), null);
  if (car && car.type.startsWith('carplay') && car.type !== 'carplay_off' && Date.now() - car.at < 3 * 3600_000) {
    const off = parse<{ at: number; type: string } | null>(await kvGet('car:last-off').catch(() => null), null);
    if (!off || off.at < car.at) return;
  }
  const last = parse<{ lat: number; lng: number; since: number; n: number; day: string; checked?: boolean } | null>(await kvGet(sentKey('ph-last')).catch(() => null), null);
  const { date } = localNow();
  const same = last && Math.hypot((loc.lat - last.lat) * 111_000, (loc.lng - last.lng) * 73_000) < 40;
  const count = last?.day === date ? last.n : 0;
  if (!same) { await kvSet(sentKey('ph-last'), JSON.stringify({ lat: loc.lat, lng: loc.lng, since: Date.now(), n: count, day: date }), 2 * 86_400); return; }
  if (last!.checked || Date.now() - last!.since < 5 * 60_000 || count >= 15) return;
  await kvSet(sentKey('ph-last'), JSON.stringify({ ...last, n: count + 1, day: date, checked: true }), 2 * 86_400);
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${loc.lat},${loc.lng}&radius=25&type=pharmacy&key=${key}`);
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

// ── Prise dite en phrase normale (03/11 : « Je pris 6 demi aujourd'hui » → le cerveau a compté 6 DATTES dans FORME) ──
const NUM_WORDS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12 };
const FOOD_RE = /mang|bouff|dattes?|baguette|pain|pizza|kebab|tacos|poulet|riz|p[âa]tes?|verre|bi[èe]re|litre|caf[ée]|th[ée]\b|lait|jus|sandwich|burger|kcal|calorie/i;
/** Texte qui parle de SES comprimés (demi(s), comprimé(s), cachet(s), médoc, traitement) et pas de nourriture. */
export function looksLikeMedText(text: string): boolean {
  const t = text.toLowerCase();
  if (/comprim|cachet|m[ée]doc|m[ée]dicament|traitement|lib[ée]rt[ée]/.test(t)) return true;
  return /\bdemi(?:e|s|es)?\b/.test(t) && !FOOD_RE.test(t);
}
/** « j'ai pris 2 demis », « je pris 6 demi aujourd'hui », « pris un comprimé et demi » → quantité en demis + total du jour ou nouvelle prise. */
export function parseMedTake(text: string): { n: number; total: boolean; rest?: boolean; extra?: boolean } | null {
  // 05/11 19h53 : « Je pris 8 demis » précédé de « [Contexte : ne pas déranger…] » → trop long → rien noté, réponse vide
  let raw = text; for (let i = 0; i < 3; i++) { const m = raw.match(/^\s*\[[\s\S]*?\]\s*/); if (!m) break; raw = raw.slice(m[0].length); }
  raw = raw.replace(/^CONFIRM[ÉE] AU T[ÉE]L[ÉE]PHONE\s*:\s*/i, '');
  // 06/11 banc fautes : « jé pris 2 demie » → pas lu (jé ≠ je, demie ≠ demi) → cerveau
  const t = raw.toLowerCase().replace(/[’`]/g, "'").trim().replace(/\bj[ée]\s/g, 'je ').replace(/\bjai\b/g, "j'ai").replace(/\bdemies\b/g, 'demis').replace(/\bdemie\b/g, 'demi');
  const medWord = /comprim|cachet|m[ée]doc|m[ée]dicament|traitement|lib[ée]r/.test(t);
  // 06/11 12h32 « Je viens de prendre 2 demi je dois plus prendre après » → rejeté (« dois ») → cerveau « noté » sans rien noter
  const pastTake = /\b(viens|vien|viena) de prendre\b|\bj'ai (d[ée]j[àa] )?(pris|prit|prix)\b|\bd[ée]j[àa] (pris|prit|prix|pri)\b|^je (d[ée]j[àa] )?(pris|prit|prix)\b/.test(t);
  if (t.length > 200 || (FOOD_RE.test(t) && !medWord) || /\?|combien|est-ce|je peux|puis-je/.test(t) || (!pastTake && /dois|vais|veux|envie|faut|faudr|oubli|devrai/.test(t))) return null;
  // 11/11 12h52 « Je rajoute un demi » → pas lu → le cerveau a dit « 4 au total » sans rien noter
  if (!/\b(pris|repris|prise|pri|prit|prix|prie|pries|prends|prend|prendre|reprends?|rajout\w*|ajout\w*|aval[ée])\b/.test(t)) return null;   // 06/11 « Je déjà prix 5 demis » (prix = pris)   // 05/11 banc : « je viens de prendre », « j'ai prit »
  const m = /(\d+(?:[.,]5)?|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s*(?:demi(?:-|\s)?(?:comprim[ée]s?|cachets?)?s?(?![a-zé])|demis(?![a-zé])|(comprim[ée]s?|cachets?|cp)(?![a-zé])(\s*et\s*demi)?)/.exec(t);
  if (!m) return null;
  const v = Number(String(m[1]).replace(',', '.')) || NUM_WORDS[m[1]!] || 0;
  const n = m[2] ? v * 2 + (m[3] ? 1 : 0) : v;          // comprimés → demis
  if (!(n > 0 && n <= 30)) return null;
  // 04/11 « J'en ai marre moralement, je suis au travail, j'ai encore pris un demi… » → seul « ✅ Noté » partait, son moral ignoré.
  // rest = il dit AUTRE CHOSE que la prise → le code note, puis le cerveau lui répond vraiment.
  const left = t.replace(m[0], ' ').replace(/[^a-zà-ÿ' ]/g, ' ').split(/[\s']+/)
    .filter(w => w && !/^(je|j|ai|pris|prise|pri|prends|prend|reprends?|rajout\w*|ajout\w*|aval[ée]e?|viens|vien|de|d|du|un|une|le|la|les|l|ce|cette|matin|midi|soir|aujourd|hui|en|tout|au|total|depuis|dans|journ[ée]e|encore|l[àa]|[àa]|h|heure|heures|et|demi|demis|ok|voil[àa]|c|est|fait|bien|mon|ma|m[ée]doc|comprim[ée]s?|cachets?|lib[ée]rt[ée])$/.test(w));
  // 06/11 contrôle de nuit : « … je dois plus prendre après » = son plan (plus rien aujourd'hui), pas une conversation → réponse directe du code
  const planOnly = /\b(dois|vais|veux|faut) (plus|pas|rien) (en )?(re)?prendre\b|\bplus rien (apres|après|aujourd)|\bc.?est (la|le) dern/.test(t)
    && !/marre|moral|fatigu|triste|stress|angoiss|d[ée]prim|craqu|pleur|mal\b|dur\b|travail|boulot|taf|aide|envie/.test(t);
  const rest = !planOnly && left.length >= 3 || /marre|moral|fatigu|triste|stress|angoiss|d[ée]prim|craqu|pleur|seul|[ée]nerv|peux plus|en peux|mal\b|dur\b|travail|boulot|taf|aide/.test(t);
  // 11/11 : « j'en ai repris 2 en plus » = vraie prise EN PLUS (pas le doublon d'une prise dont il reparle)
  const extra = /\ben plus\b|\brepris\b|\breprends?\b|\brajout\w*|\bajout\w*|\bnouvelle prise\b|\bune autre\b|\bencore (un|une|\d)/.test(t);
  return { n, total: /aujourd|aujaurd|auj\b|en tout|au total|depuis ce matin|dans la journ[ée]e/.test(t), rest, ...(extra ? { extra } : {}) };
}
/** Exécutée par le code (orchestrateur), réponse directe. « aujourd'hui / en tout » = TOTAL du jour → on n'ajoute que la différence. */
export async function runMedTake(c: { n: number; total: boolean; extra?: boolean }): Promise<string> {
  const s = await getLib();
  if (!s) return 'Programme LIBERTÉ pas encore commencé.';
  const today = localNow().date;
  let add = c.n;
  if (c.total) {
    const already = takenOn(await readLibLog(), today);
    add = c.n - already;
    if (add <= 0) return `✅ Déjà noté : ${halvesShort(already)} aujourd'hui${add < 0 ? ` (tu dis ${halvesShort(c.n)} — dis-moi « corrige liberté » si mon compte est faux)` : ''}. Rien ajouté.`;
  }
  const r = await liberteTool({ action: 'prise', n: add, nouvelle: c.total || c.extra ? true : undefined }, 'kouider');
  // 10/11 05h53 : la consigne du cerveau (« demande-lui de confirmer puis rappelle liberte prise avec nouvelle:true ») lui était affichée telle quelle
  return r.replace(/ Si c'est vraiment une NOUVELLE prise en plus, demande-lui de confirmer puis rappelle liberte prise avec nouvelle:true\./, ` Si c'est une prise EN PLUS, écris « j'en ai repris ${halvesShort(add)} en plus ».`)
    .replace(/\s*Félicite-le d'avoir noté\.?/, '').replace(/ Réponds sans juger.*$/s, '').trim() + (c.total && add !== c.n ? `\n(Total du jour : ${halvesShort(c.n)}, j'ai ajouté ${halvesShort(add)}.)` : '');
}

// 15/11 « j'avais réussi à diminuer fortement mes médicaments, maintenant j'arrive plus » → réponse sans son vrai statut
// (« ne te culpabilise pas si tu as dû freiner » alors qu'il était à 5/5 dans le plan) et sans la baisse du lendemain.
const LIB_MED = /m[ée]doc|m[ée]dicament|demis?\b|comprim[ée]|cachet|traitement|sevrage|lib[ée]rt[ée]/i;
const LIB_HARD = /(n'|j'|j)?arrive (plus|pas)|y arrive pas|j'en peux plus|craqu|d[ée]prim|d[ée]pression|replong|trop dur|peux pas baisser|r[ée]ussi.{0,30}(diminuer|baisser)/i;
// 23/11 19h06 : « Tu penses que comme je suis occupé j'arrête quand les médicaments ? » → réponse générique
// (« n'arrête pas seul », Wegovy cité alors qu'il n'en prend pas), sans son plan ni la date. Question « quand/arrêter » = son plan réel.
const LIB_WHEN = /\bquand\b|arr[êe]t|stopp|z[ée]ro|fini[rs]?\b|baiss|diminu|accél[ée]r|plus vite/i;
export async function liberteStruggleHint(msg: string): Promise<string> {
  if (!LIB_MED.test(msg)) return '';
  const hard = LIB_HARD.test(msg);
  if (!hard && !LIB_WHEN.test(msg)) return '';
  const o = await libOverview().catch(() => null);
  if (!o?.state?.active || o.state.finishedAt) return '';
  if (!hard) {
    const zero = o.state.steps.find(s => s.max === 0)?.from;
    return [
      `IL PARLE DE SON PROGRAMME LIBERTÉ (arrêt de son ${o.state.med ?? 'médicament'}, privé) — réponds avec SON plan réel, pas un conseil général. Ne parle d'aucun autre médicament (pas de Wegovy).`,
      statusText(o),
      `• ${o.state.doctorPlan ? 'Ce plan vient de SON MÉDECIN (papier) : ' : ''}aujourd'hui max ${halvesShort(o.allowed)} (pris ${halvesShort(o.taken)})${o.nextDrop ? `, prochaine baisse le ${fmtDate(o.nextDrop.from)} → ${halvesShort(o.nextDrop.max)}/jour` : ''}${zero ? `, ZÉRO prévu le ${fmtDate(zero)}` : ''}. Donne-lui ces dates clairement.`,
      '• S\'il veut aller plus vite parce qu\'il est occupé/motivé : être occupé aide (moins de moments d\'envie), mais on ne saute pas de palier sans l\'accord de son médecin ; il peut en parler à son prochain RDV. S\'il veut ralentir : liberte action palier (jamais remonter), seulement après son oui.',
      '• 3-5 phrases, chaleureux, sans liste d\'avertissements.',
    ].join('\n');
  }
  return [
    'IL PARLE DE SON PROGRAMME LIBERTÉ ET DE SON MORAL — statut réel (privé) :',
    statusText(o),
    `• Dis-lui la vérité du jour : ${o.taken <= o.allowed ? `il est DANS son plan (${halvesShort(o.taken)} sur ${halvesShort(o.allowed)}) — il n'a ni freiné ni échoué, dis-le-lui` : `il a dépassé (${halvesShort(o.taken)} pour ${halvesShort(o.allowed)}) — sans le juger`}.`,
    o.nextDrop ? `• Annonce la prochaine baisse (${fmtDate(o.nextDrop.from)} → ${halvesShort(o.nextDrop.max)}/jour) et laisse-le CHOISIR : la garder, ou rester quelques jours de plus au palier actuel (liberte action palier, jamais remonter) le temps de voir son médecin. N'appelle pas palier sans son oui.` : '',
    '• Puis son moral : médecin cette semaine (moral + travail + plan), psy de 1re ligne (11 €) ; idées noires → 112. Activités de repos AVANT ou APRÈS le travail, jamais pendant (aucune pause au travail).',
  ].filter(Boolean).join('\n');
}
