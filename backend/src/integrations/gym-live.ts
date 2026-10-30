import { kvGet, kvSet } from './app-store.js';
import { getLocation } from './location.js';
import { geocode, drive, km } from './departures.js';
import { getRoutineConfig, localNow, localTs, hm } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { callOwner, getPendingCall } from '../notifications/voice-call.js';
import { liveSessionPlan, logSportSession, readSportLog, suggestFor, type Exercise, type CardioBlock, type SessionType } from './sport-coach.js';

// COACH EN DIRECT À LA SALLE (Kouider 28/10) : « je dois être à la maison à 7h20 » → départ de la salle recalculé avec le
// trafic à chaque passage (toutes les 5 min), rappel 10 min avant puis APPEL « pars maintenant ». Pendant la séance Dzaryx
// suit l'ordre : cardio avant → muscu → cardio après (« le temps qui reste » = jusqu'au départ). À chaque série il demande
// kg × reps SEULEMENT s'il les donne (30/10 : « je veux pas qu'il me le demande, c'est moi qui lui indique ») : il note (journal
// + records) et conseille ; sinon il suit la séance au chrono et avec la montre (workout-live.ts) : exercice suivant tout seul,
// couper une série si on est en retard. Fin de séance (départ GPS ou « fini ») → bilan : volume, records, ce qu'il faut améliorer.

const LIVE_KEY = 'kouider:sport:live';
const HOMEBY_KEY = 'kouider:sport:homeby';

interface DoneSet { kg?: number; reps?: number; rpe?: number }
interface Live {
  date: string; startedAt: number; type: SessionType; label: string;
  exercises: Exercise[]; before: CardioBlock[]; after: CardioBlock[];
  idx: number; done: Record<string, DoneSet[]>; skipped: string[];
  homeBy?: string; leaveBy?: number; road?: number; traffic?: string;
  liftsAt?: number; lastSetAt?: number; lastNudge?: number; nudges: number; exAt?: number;
  sent: string[]; health?: string; endedAt?: number; timer?: boolean; warmedUp?: string[];
}

const say = (ts: number) => hm(ts).replace('h', ' h ');
const minLeft = (ts: number, now = Date.now()) => Math.round((ts - now) / 60_000);
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
const range = (r: string) => { const n = r.match(/\d+/g)?.map(Number) ?? []; return { lo: n[0] ?? 10, hi: n[1] ?? n[0] ?? 12 }; };
const isTimed = (e: Exercise) => /\b(s|min)\b/.test(e.reps);
const exMin = (e: Exercise, sets = e.sets) => sets * (0.9 + e.rest / 60);

async function getLive(): Promise<Live | null> {
  try { const l = JSON.parse((await kvGet(LIVE_KEY)) ?? 'null') as Live | null; return l && l.date === localNow().date ? l : null; } catch { return null; }
}
const saveLive = (l: Live) => kvSet(LIVE_KEY, JSON.stringify(l), 8 * 3600);

export async function setHomeBy(date: string, hhmm: string | null): Promise<void> {
  const all = JSON.parse((await kvGet(HOMEBY_KEY).catch(() => null)) ?? '{}') as Record<string, string>;
  for (const k of Object.keys(all)) if (k < localNow().date) delete all[k];
  if (hhmm) all[date] = hhmm; else delete all[date];
  await kvSet(HOMEBY_KEY, JSON.stringify(all));
  const l = await getLive();
  if (l && l.date === date) { if (hhmm) l.homeBy = hhmm; else delete l.homeBy; await saveLive(l); }
}
export async function getHomeBy(date: string): Promise<string | null> {
  try { return (JSON.parse((await kvGet(HOMEBY_KEY)) ?? '{}') as Record<string, string>)[date] ?? null; } catch { return null; }
}

async function points() {
  const cfg = await getRoutineConfig();
  return { home: await geocode(cfg.addresses.home), gym: await geocode(cfg.addresses.gym) };
}
/** Trajet salle → maison maintenant (trafic compris), en minutes. */
export async function gymToHomeMin(): Promise<number> {
  const { home, gym } = await points();
  const t = home && gym ? await drive(gym, home) : null;
  return t?.min ?? 20;
}

/** Recalcule l'heure de départ (position actuelle si fraîche, sinon la salle) avec le trafic. */
async function refreshLeave(l: Live): Promise<void> {
  if (!l.homeBy) { delete l.leaveBy; return; }
  const { home, gym } = await points();
  const loc = await getLocation('kouider').catch(() => null);
  const from = loc && Date.now() - Date.parse(loc.updated_at) < 15 * 60_000 ? { lat: loc.lat, lng: loc.lng } : gym;
  const t = home && from ? await drive(from, home).catch(() => null) : null;
  if (t) { l.road = t.min; l.traffic = t.min > t.normal + 4 ? `bouchons (+${t.min - t.normal} min)` : 'route fluide'; }
  l.leaveBy = localTs(l.date, l.homeBy) - ((l.road ?? 20) + 3) * 60_000;
}

const setsLeft = (l: Live, e: Exercise) => Math.max(0, e.sets - (l.done[e.id]?.length ?? 0));
const remaining = (l: Live) => l.exercises.filter((e, i) => i >= l.idx && !l.skipped.includes(e.id) && setsLeft(l, e) > 0);
const beforeMin = (l: Live) => l.before.reduce((a, b) => a + b.min, 0);
function phase(l: Live, now = Date.now()): 'avant' | 'muscu' | 'apres' {
  if (!remaining(l).length) return 'apres';
  if (!l.liftsAt && now < l.startedAt + beforeMin(l) * 60_000 && Object.keys(l.done).length === 0) return 'avant';
  return 'muscu';
}

/** Temps : ce qu'il reste, la marge avant le départ et le cardio de fin qui en découle. */
function timeline(l: Live, now = Date.now()): { liftMin: number; afterMin: number; margin: number | null; line: string } {
  const ph = phase(l, now);
  const beforeLeft = ph === 'avant' ? Math.max(0, minLeft(l.startedAt + beforeMin(l) * 60_000, now)) : 0;
  const liftMin = Math.round(remaining(l).reduce((a, e) => a + exMin(e, setsLeft(l, e)), 0));
  const fixedAfter = l.after.filter(b => !b.flex).reduce((a, b) => a + b.min, 0);
  if (!l.leaveBy) {
    const afterMin = l.after.reduce((a, b) => a + b.min, 0);
    return { liftMin, afterMin, margin: null, line: `⏱️ Il te reste ~${beforeLeft + liftMin + afterMin} min de séance.` };
  }
  const free = minLeft(l.leaveBy, now) - beforeLeft - liftMin;
  const flexMin = Math.max(0, free - fixedAfter);
  const afterMin = fixedAfter + (l.after.some(b => b.flex) ? flexMin : 0);
  const margin = free - (l.after.some(b => b.flex) ? fixedAfter + 10 : fixedAfter);   // on garde au moins 10 min au cardio « temps qui reste »
  return { liftMin, afterMin, margin, line: `⏱️ Départ de la salle à ${hm(l.leaveBy)} (${l.road ?? '?'} min de route, ${l.traffic ?? 'trafic non vérifié'}) pour être à la maison à ${l.homeBy!.replace(':', 'h')} → il te reste ${minLeft(l.leaveBy, now)} min.` };
}

/** Conseil quand il est en retard sur le planning. */
// ── Bonus (Kouider 28/10 « des options auxquelles je n'aurais pas pensé ») ──
// Disques à mettre de chaque côté (barre olympique 20 kg, barre EZ / Larry Scott ~10 kg) — pas pour les poulies.
const BARBELL = /(couch|barre|skull|larry)/i;
function platesLine(name: string, kg: number | null): string {
  if (!kg || !BARBELL.test(name) || /poulie|barre droite/i.test(name)) return '';
  const bar = /curl|skull|larry|ez/i.test(name) ? 10 : 20;
  let side = (kg - bar) / 2;
  if (side <= 0) return `   🔩 Barre seule (${bar} kg)`;
  const out: number[] = [];
  for (const d of [20, 15, 10, 5, 2.5, 1.25]) while (side >= d - 0.01) { out.push(d); side -= d; }
  return `   🔩 ${kg} kg = barre ${bar} kg + de chaque côté : ${out.join(' + ')} kg`;
}
/** Montée en charge avant la 1re série lourde d'un muscle : évite la blessure, prépare le système nerveux. */
const warmupLine = (kg: number | null) => kg && kg >= 10 ? `   🔥 Séries d'approche : 1 × 10 à ${Math.round(kg * 0.5 * 2) / 2} kg, puis 1 × 5 à ${Math.round(kg * 0.75 * 2) / 2} kg (repos 45 s), ensuite tes séries.` : '';
/** Force max estimée (formule d'Epley) : comparable même si les reps changent d'une séance à l'autre. */
export const e1rm = (kg: number, reps: number) => Math.round(kg * (1 + Math.min(reps, 15) / 30) * 2) / 2;
/** 1er exercice de ce muscle aujourd'hui → séries d'approche. */
const needWarm = (l: Live, e: Exercise) => !l.exercises.some(x => x.muscle === e.muscle && (l.done[x.id]?.length ?? 0) > 0);
const isBiceps = (n: string) => /curl/i.test(n);
const isTriceps = (n: string) => /triceps|extension|skull|poulie haute|barre droite/i.test(n) && !/curl/i.test(n);
/** En retard : biceps + triceps enchaînés sans repos (muscles opposés → aucune perte de force). */
function supersetAdvice(l: Live): string {
  const rest = remaining(l);
  const b = rest.find(e => isBiceps(e.name)), t = rest.find(e => isTriceps(e.name));
  if (!b || !t) return '';
  const gain = Math.round((Math.min(setsLeft(l, b), setsLeft(l, t)) * Math.min(b.rest, t.rest)) / 60);
  return ` Ou fais ${t.name} + ${b.name} en SUPERSET (l'un puis l'autre sans repos, repos après la paire) : ~${gain} min gagnées sans couper de série.`;
}

function lateAdvice(l: Live, margin: number | null): string {
  if (margin == null || margin >= 0) return '';
  const rest = remaining(l);
  const cut = rest.filter(e => setsLeft(l, e) >= 3).slice(-Math.ceil(-margin / 3));
  return `⚠️ Tu as ~${-margin} min de retard sur le planning : ${cut.length ? `fais 2 séries au lieu de 3 sur ${cut.map(e => e.name).join(', ')}` : 'raccourcis les repos à 60 s'} pour garder du temps au cardio de fin.${supersetAdvice(l)}`;
}

function exLine(e: Exercise, sug: { kg: number | null; last?: string; up?: boolean }, warm = false): string {
  const kg = sug.kg != null ? ` — charge conseillée ${sug.kg} kg${sug.up ? ' ⬆️ (tu as tout réussi la dernière fois)' : ''}` : ' — 1re fois : prends une charge où tu fais 12 reps propres en gardant 2 reps en réserve';
  return [`▶️ ${e.name} : ${e.sets} × ${e.reps}, repos ${e.rest} s${kg}`, sug.last ? `   Dernière fois : ${sug.last}` : '', `   💡 ${e.tip}`,
    warm ? warmupLine(sug.kg) : '', platesLine(e.name, sug.kg)].filter(Boolean).join('\n');
}

async function healthLine(): Promise<string> {
  try {
    const all = JSON.parse((await kvGet('health:daily')) ?? '[]') as Array<{ date: string; sleep_h?: number; rhr?: number; hrv?: number }>;
    const d = all.filter(x => x.date >= new Date(Date.now() - 36 * 3600_000).toISOString().slice(0, 10)).pop();
    if (!d) return '';
    const prev = all.slice(-15, -1);
    const avg = (k: 'rhr' | 'hrv') => { const v = prev.map(x => Number(x[k] ?? 0)).filter(x => x > 0); return v.length >= 5 ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
    const tired = (d.sleep_h != null && d.sleep_h < 5.5) || (d.rhr && avg('rhr') && d.rhr >= avg('rhr') + 8) || (d.hrv && avg('hrv') && d.hrv < avg('hrv') * 0.75);
    const facts = [d.sleep_h ? `${d.sleep_h} h de sommeil` : '', d.rhr ? `cœur au repos ${d.rhr}` : '', d.hrv ? `VFC ${d.hrv}` : ''].filter(Boolean).join(', ');
    return facts ? `🩺 Santé : ${facts}${tired ? ' → corps fatigué : garde tes charges habituelles, pas de record aujourd\'hui, technique parfaite.' : ' → feu vert, tu peux pousser.'}` : '';
  } catch { return ''; }
}

/** Démarre le suivi en direct (arrivée GPS à la salle, « je suis à la salle », ou outil). Renvoie le plan minuté. */
export async function startLive(date = localNow().date, at = Date.now()): Promise<string> {
  const cur = await getLive();
  if (cur && !cur.endedAt) return statusText(cur);
  const p = await liveSessionPlan(date);
  const l: Live = { date, startedAt: at, type: p.type, label: p.label, exercises: p.exercises, before: p.before, after: p.after,
    idx: 0, done: {}, skipped: [], nudges: 0, sent: [], ...(await getHomeBy(date).then(h => h ? { homeBy: h } : {})) };
  if (!l.before.length) l.liftsAt = at;                     // pas de cardio avant : la muscu commence tout de suite
  await refreshLeave(l);
  l.health = [await healthLine(), await import('./workout-live.js').then(m => m.readiness()).then(r => r?.line ?? '').catch(() => '')].filter(Boolean).join('\n');
  await saveLive(l);
  const log = await readSportLog();
  const t = timeline(l, at);
  const first = l.exercises[0];
  const plan = [
    `🎧 COACH EN DIRECT — ${l.label}`,
    l.homeBy ? t.line : '',
    l.before.length ? `1️⃣ ${l.before.map(b => `${b.name} ${b.min} min`).join(' + ')} → jusqu'à ${hm(at + beforeMin(l) * 60_000)}` : '',
    `${l.before.length ? '2️⃣' : '1️⃣'} Muscu : ${l.exercises.map(e => `${e.name} ${e.sets}×${e.reps}`).join(' · ')} (~${t.liftMin} min)`,
    l.after.length ? `${l.before.length ? '3️⃣' : '2️⃣'} ${l.after.map(b => `${b.name} ${b.flex ? `le temps qui reste (~${Math.max(0, t.afterMin)} min)` : `${b.min} min`}`).join(' + ')}` : '',
    lateAdvice(l, t.margin), l.health ?? '',
    first ? `\n${l.before.length ? 'Après le cardio, on commence par :' : 'On commence par :'}\n${exLine(first, suggestFor(first, log, date), needWarm(l, first))}` : '',
    '\n⌚ Je suis ta séance au chrono et avec ta montre : je t\'envoie l\'exercice suivant tout seul. Tu n\'as rien à me dire — si tu veux, donne un poids (« 60 kg 12 ») et je te dis si tu montes.',
  ].filter(Boolean).join('\n');
  return plan;
}

function statusText(l: Live, now = Date.now()): string {
  const t = timeline(l, now);
  const rest = remaining(l);
  const ph = phase(l, now);
  const done = l.exercises.filter(e => (l.done[e.id]?.length ?? 0) > 0).map(e => `${e.name} ${l.done[e.id]!.length}/${e.sets}`);
  return [
    `🏋️ ${l.label} — ${ph === 'avant' ? `cardio d'échauffement (${l.before.map(b => b.name).join(' + ')}) jusqu'à ${hm(l.startedAt + beforeMin(l) * 60_000)}` : ph === 'muscu' ? 'muscu en cours' : `fin : ${l.after.map(b => b.name).join(' + ') || 'étirements'}`}`,
    t.line,
    done.length ? `✅ Fait : ${done.join(' · ')}` : '',
    rest.length ? `📋 Reste : ${rest.map(e => `${e.name} (${setsLeft(l, e)} série${setsLeft(l, e) > 1 ? 's' : ''})`).join(' · ')}` : '✅ Muscu terminée',
    l.after.length ? `🏁 Puis ${l.after.map(b => `${b.name} ${b.flex ? `~${Math.max(0, t.afterMin)} min (le temps qui reste)` : `${b.min} min`}`).join(' + ')}` : '',
    lateAdvice(l, t.margin),
  ].filter(Boolean).join('\n');
}

function findIn(l: Live, q: string): Exercise | null {
  const n = norm(q);
  let best: Exercise | null = null, score = 0;
  for (const e of l.exercises) {
    const sc = [...new Set(norm(`${e.name} ${e.alt.join(' ')}`).split(/\s+/).filter(w => w.length > 3))].filter(w => n.includes(w)).length;
    if (sc > score) { score = sc; best = e; }
  }
  return best;
}

/** Une série : note + conseil + suite. */
async function logSet(l: Live, o: { exercise?: string; kg?: number; reps?: number; rpe?: number; sets?: number }): Promise<string> {
  const now = Date.now();
  const e = (o.exercise ? findIn(l, o.exercise) : null) ?? remaining(l)[0] ?? null;
  if (!e) return `Toute la muscu est déjà notée. ${statusText(l)}`;
  const log = await readSportLog();
  const sug = suggestFor(e, log.filter(x => x.date !== l.date), l.date);
  const n = Math.max(1, Math.min(5, o.sets ?? 1));
  const arr = l.done[e.id] ??= [];
  for (let i = 0; i < n; i++) arr.push({ ...(o.kg ? { kg: o.kg } : {}), ...(o.reps ? { reps: o.reps } : {}), ...(o.rpe ? { rpe: o.rpe } : {}) });
  l.liftsAt ??= now; l.lastSetAt = now; l.nudges = 0;
  const r = await logSportSession({ date: l.date, type: l.type, sets: Array.from({ length: n }, () => ({ ex: e.id, ...(o.kg ? { kg: o.kg } : {}), ...(o.reps ? { reps: o.reps } : {}) })) });
  const k = arr.length, { lo, hi } = range(e.reps), step = Math.abs(e.step ?? 2.5);
  const advice: string[] = [];
  if (isTimed(e) || !o.reps) advice.push('');
  else if (o.reps >= hi + 3) advice.push(`Trop facile : monte à ${o.kg ? `${o.kg + step} kg` : `+${step} kg`} dès la prochaine série.`);
  else if (o.reps >= hi) advice.push(k < e.sets ? `Haut de la fourchette 👌 garde ${o.kg ?? 'la charge'}${o.kg ? ' kg' : ''} ; si la dernière passe encore à ${hi}, on monte la prochaine fois.` : '');
  else if (o.reps < lo - 2) advice.push(`Trop lourd : baisse à ~${o.kg ? Math.round(o.kg * 0.9 * 2) / 2 : '−10 %'}${o.kg ? ' kg' : ''} pour rester dans ${e.reps} avec une technique propre.`);
  else if (o.reps < lo) advice.push(`Un peu court : garde ${o.kg ?? 'la charge'}${o.kg ? ' kg' : ''}, prends ${e.rest + 30} s de repos et vise ${lo} reps.`);
  else advice.push(`Dans la cible ✅ garde ${o.kg ?? 'la charge'}${o.kg ? ' kg' : ''}.`);
  if (o.rpe && o.rpe >= 9.5 && k < e.sets) advice.push('Tu es allé à l\'échec : garde 1-2 reps en réserve sur la suivante, c\'est là que ça progresse sans se blesser.');
  if (sug.kg && o.kg) advice.push(o.kg > sug.kg ? `+${Math.round((o.kg - sug.kg) * 10) / 10} kg par rapport à la dernière fois 💪` : o.kg < sug.kg ? `(${sug.kg} kg étaient prévus${sug.last ? ` — dernière fois ${sug.last}` : ''})` : '');
  if (r.prs.length) advice.push(`🏆 NOUVEAU RECORD : ${r.prs.join(', ')} !`);
  // 👻 Fantôme : la même série à la dernière séance de cet exercice — il court contre lui-même
  const prevDay = [...log].reverse().find(x => x.date !== l.date && x.sets.some(z => z.ex === e.id));
  const ghost = prevDay?.sets.filter(z => z.ex === e.id)[k - 1];
  if (ghost?.kg && ghost.reps && o.kg && o.reps) {
    const d = e1rm(o.kg, o.reps) - e1rm(ghost.kg, ghost.reps);
    advice.push(`👻 Ton fantôme du ${prevDay!.date.slice(8)}/${prevDay!.date.slice(5, 7)} : ${ghost.kg}×${ghost.reps} → ${d > 0 ? `tu le bats (+${Math.round(d)} kg de force estimée)` : d < 0 ? `il te devance de ${Math.round(-d)} kg, reprends-le à la suivante` : 'égalité parfaite'}.`);
  }
  let next = '';
  if (k >= e.sets) {
    const all = arr.filter(s => s.reps != null);
    const allTop = all.length >= e.sets && all.every(s => (s.reps ?? 0) >= hi);
    advice.push(`✅ ${e.name} terminé (${arr.map(s => `${s.kg ?? '?'}×${s.reps ?? '?'}`).join(', ')}).${allTop && o.kg ? ` Toutes les séries à ${hi} → prochaine séance ${o.kg + step} kg.` : ''}`);
    l.idx = Math.max(l.idx, l.exercises.indexOf(e) + 1);
    l.exAt = now;
    const nx = remaining(l)[0];
    next = nx ? `\n\n${exLine(nx, suggestFor(nx, log.filter(x => x.date !== l.date), l.date), needWarm(l, nx))}` : `\n\n🏁 Muscu terminée ! ${l.after.length ? `Passe à ${l.after.map(b => b.name).join(' + ')}${l.leaveBy ? ` jusqu'à ${hm(l.leaveBy - 2 * 60_000)}` : ''}.` : 'Étirements 5 min.'}`;
    if (!nx) l.sent.push('after');
  } else next = `\nSérie ${k + 1}/${e.sets} : repos ${e.rest} s${l.timer !== false ? ' — je te préviens quand c\'est fini' : ''}.`;
  await saveLive(l);
  if (l.timer !== false) restTimer(l.date, now, k >= e.sets ? 90 : e.rest, k >= e.sets ? remaining(l)[0]?.name ?? null : `${e.name} série ${k + 1}/${e.sets}${o.kg ? ` à ${o.kg} kg` : ''}`, k);
  const t = timeline(l, now);
  return `📝 ${e.name} série ${k}/${e.sets} : ${o.kg ?? '?'} kg × ${o.reps ?? '?'}. ${advice.filter(Boolean).join(' ')}${next}\n${l.leaveBy ? `⏱️ ${minLeft(l.leaveBy, now)} min avant de partir.` : ''} ${lateAdvice(l, t.margin)}`.trim();
}

/** ⏱️ Minuteur de repos : notification (montre / iPhone) + Telegram quand le repos est fini, s'il n'a rien dit entre-temps.
 *  Tous les 3 repos, rappel de boire. Minuteur en mémoire : perdu si le serveur redémarre (sans gravité). */
function restTimer(date: string, setAt: number, sec: number, what: string | null, n: number): void {
  if (!what || sec < 20) return;
  setTimeout(() => { void (async () => {
    const l = await getLive();
    if (!l || l.endedAt || l.date !== date || l.lastSetAt !== setAt) return;      // il a déjà annoncé une autre série
    const t = `⏱️ Repos fini → ${what}${n % 3 === 0 ? ' · 💧 bois une gorgée' : ''}`;
    emitProactive(t, 'reminder', undefined, 'kouider', 'sport');
    await queueTelegramMessage(t);
  })().catch(() => {}); }, sec * 1000);
}

/** Séries par muscle sur 7 jours (la cible pour progresser : 10 à 20 par muscle et par semaine). */
async function weekVolumeLine(): Promise<string> {
  const { findExercise } = await import('./sport-coach.js');
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const count: Record<string, number> = {};
  for (const d of (await readSportLog()).filter(x => x.date >= from)) for (const z of d.sets) {
    const m = findExercise(z.ex)?.muscle;
    if (m && m !== 'cardio' && m !== 'jambes') count[m] = (count[m] ?? 0) + 1;
  }
  const NAME: Record<string, string> = { pecs: 'pecs', dos: 'dos', epaules: 'épaules', bras: 'bras', abdos: 'abdos' };
  const parts = ['pecs', 'dos', 'epaules', 'bras'].map(m => `${NAME[m]} ${count[m] ?? 0}${(count[m] ?? 0) < 10 ? ' ⬇️' : (count[m] ?? 0) > 20 ? ' ⚠️' : ' ✅'}`);
  return `📊 Séries sur 7 jours (cible 10-20 par muscle) : ${parts.join(' · ')}`;
}

/** Bilan de fin de séance : volume, records, points à améliorer. */
async function endLive(l: Live, why: string): Promise<string> {
  l.endedAt = Date.now();
  await saveLive(l);
  const lines: string[] = [];
  const improve: string[] = [];
  let volume = 0;
  for (const e of l.exercises) {
    const arr = l.done[e.id] ?? [];
    if (!arr.length) { improve.push(`${e.name} pas fait${l.skipped.includes(e.id) ? ' (passé)' : ''}`); continue; }
    volume += arr.reduce((a, s) => a + (s.kg ?? 0) * (s.reps ?? 0), 0);
    const { lo, hi } = range(e.reps);
    const best = Math.max(0, ...arr.filter(z => z.kg && z.reps).map(z => e1rm(z.kg!, z.reps!)));
    const before = Math.max(0, ...(await readSportLog()).filter(d => d.date !== l.date).flatMap(d => d.sets).filter(z => z.ex === e.id && z.kg && z.reps).map(z => e1rm(z.kg!, z.reps!)));
    const trend = best && before ? ` → force max estimée ${best} kg (${best >= before ? '+' : ''}${Math.round((best / before - 1) * 100)} %)` : best ? ` → force max estimée ${best} kg` : '';
    lines.push(`• ${e.name} : ${arr.map(s => `${s.kg ?? '?'}×${s.reps ?? '?'}`).join(', ')}${trend}`);
    const reps = arr.map(s => s.reps ?? 0).filter(Boolean);
    if (reps.length && reps.every(x => x >= hi)) improve.push(`${e.name} : tout à ${hi}+ → monte la charge la prochaine fois`);
    else if (reps.length && Math.max(...reps) - Math.min(...reps) >= 4) improve.push(`${e.name} : grosse baisse de reps entre séries → plus de repos ou −5 %`);
    else if (reps.some(x => x < lo)) improve.push(`${e.name} : sous ${lo} reps → garde la charge jusqu'à faire ${lo}-${hi} partout`);
    if (arr.length < e.sets) improve.push(`${e.name} : ${arr.length}/${e.sets} séries`);
  }
  const min = Math.round((l.endedAt - l.startedAt) / 60_000);
  const late = l.leaveBy && l.endedAt > l.leaveBy + 3 * 60_000 ? `⚠️ Parti ${minLeft(l.endedAt, l.leaveBy) * -1} min après l'heure prévue.` : '';
  return [`🏁 Bilan ${l.label} (${min} min, ${why})`, ...lines, volume ? `📦 Volume soulevé : ${Math.round(volume)} kg` : '', await weekVolumeLine().catch(() => ''),
    improve.length ? `🎯 À améliorer :\n- ${improve.slice(0, 6).join('\n- ')}` : '🎯 Séance propre, tout dans la cible. Continue comme ça.', late,
    l.after.length ? `⌚ Je vérifie ${l.after.map(b => b.name).join(' + ')} avec Santé quand la montre l'envoie.` : ''].filter(Boolean).join('\n');
}

/** Outil sport_coach action=live. */
export async function liveTool(input: Record<string, unknown>): Promise<string> {
  const op = String(input['op'] ?? 'status');
  let l = await getLive();
  if (op === 'start' || (!l && op === 'set')) {
    const txt = await startLive();
    if (op === 'start') return `${txt}\n\n[Il est à la salle : réponds court et motivant. Ne lui demande JAMAIS ses poids ni ses reps : c'est lui qui les donne s'il veut ; tu suis la séance au chrono et avec sa montre.]`;
    l = await getLive();
  }
  if (!l) return 'Pas de séance en cours.';
  if (l.endedAt && op !== 'start') return 'La séance d\'aujourd\'hui est terminée (bilan déjà fait).';
  const num = (k: string) => Number(input[k]) > 0 ? Number(input[k]) : undefined;
  if (op === 'set') return `${await logSet(l, { ...(input['exercise'] ? { exercise: String(input['exercise']) } : {}), kg: num('kg'), reps: num('reps'), rpe: num('rpe'), sets: num('sets') })}\n\n[Réponds court (il est entre deux séries) : le conseil + ce qu'il fait ensuite. Ne redemande pas de poids ni de reps.]`;
  if (op === 'next' || op === 'skip') {
    const e = (input['exercise'] ? findIn(l, String(input['exercise'])) : null) ?? remaining(l)[0];
    if (!e) return statusText(l);
    if (op === 'skip') l.skipped.push(e.id); else l.idx = Math.max(l.idx, l.exercises.indexOf(e) + 1);
    l.exAt = Date.now();
    if (!l.liftsAt) l.liftsAt = Date.now();
    await saveLive(l);
    const nx = remaining(l)[0];
    return `${op === 'skip' ? `⏭️ ${e.name} passé${e.alt.length ? ` (alternative si la machine est prise : ${e.alt.join(' ou ')})` : ''}.` : `✅ ${e.name} terminé.`}\n${nx ? exLine(nx, suggestFor(nx, await readSportLog(), l.date), needWarm(l, nx)) : '🏁 Muscu terminée, place au cardio de fin.'}\n${timeline(l).line}`;
  }
  if (op === 'timer') { l.timer = !(input['on'] === false || input['on'] === 'false' || /off|non|stop/i.test(String(input['on'] ?? ''))); await saveLive(l); return `⏱️ Minuteur de repos ${l.timer ? 'activé' : 'coupé'}.`; }
  if (op === 'cardio_done') { l.liftsAt ??= Date.now(); await saveLive(l); const nx = remaining(l)[0]; return `✅ Cardio fait. ${nx ? `\n${exLine(nx, suggestFor(nx, await readSportLog(), l.date), needWarm(l, nx))}` : ''}\n${timeline(l).line}`; }
  if (op === 'stop') { const t = await endLive(l, 'terminée'); return `${t}\n\n[Félicite-le en une phrase et donne LE point principal à améliorer.]`; }
  return statusText(l);
}

/** Note ajoutée à chaque message / tour d'appel de Kouider pendant la séance (call.ts). */
export async function liveNote(): Promise<string | null> {
  const l = await getLive().catch(() => null);
  if (!l || l.endedAt) return null;
  const e = remaining(l)[0];
  return `[SÉANCE EN COURS À LA SALLE (${l.label}) : ${phase(l) === 'avant' ? `cardio d'échauffement jusqu'à ${hm(l.startedAt + beforeMin(l) * 60_000)}` : e ? `exercice actuel ${e.name} série ${(l.done[e.id]?.length ?? 0) + 1}/${e.sets}` : 'muscu finie, cardio de fin'}${l.leaveBy ? `, départ à ${hm(l.leaveBy)}` : ''}. S'il donne un poids / des reps (« 60 kg 12 », « 12 à 40 ») → sport_coach action=live op=set (exercise si ce n'est pas l'exercice actuel). « Tapis fini » → op=cardio_done. « J'ai fini l'exercice / je passe » → op=next ; machine prise → op=skip ; « il me reste quoi » → op=status ; « j'ai fini la séance » → op=stop ; « coupe le minuteur » → op=timer on=false. NE LUI DEMANDE JAMAIS son poids ni ses reps (il les donne s'il veut) : tu suis la séance au chrono et avec sa montre (Santé). VIDÉO d'une série → analyse sa TECHNIQUE sur cet exercice (amplitude, tempo, dos, coudes, élan, triche) en 3 points max + note /10, et propose la correction. PHOTO d'une machine ou de la salle → dis quelle machine c'est, le réglage (siège, poignées, charge de départ) et, si elle est prise, l'alternative avec le matériel visible. Réponds COURT.]`;
}

async function notify(text: string, title: string): Promise<void> {
  await queueTelegramMessage(text);
  emitProactive(title, 'reminder', text, 'kouider', 'sport');
}

/** Toutes les 5 min (sport-watch) : départ recalculé, rappels, relance des charges, fin automatique. */
export async function liveTick(): Promise<void> {
  const l = await getLive();
  if (!l || l.endedAt) return;
  const now = Date.now();
  await refreshLeave(l);
  const once = (k: string) => { if (l.sent.includes(k)) return false; l.sent.push(k); return true; };
  // Parti de la salle (GPS) → bilan
  const { gym } = await points();
  const loc = await getLocation('kouider').catch(() => null);
  const fresh = loc && now - Date.parse(loc.updated_at) < 10 * 60_000 ? { lat: loc.lat, lng: loc.lng } : null;
  if ((fresh && gym && km(fresh, gym) > 0.8 && now > l.startedAt + 20 * 60_000) || now > l.startedAt + 3 * 3600_000) {
    await notify(await endLive(l, fresh ? 'parti de la salle' : 'clôturée'), '🏁 Bilan de ta séance');
    return;
  }
  const ph = phase(l, now);
  if (ph === 'muscu' && !l.liftsAt && once('lifts')) {
    l.liftsAt = now; l.exAt = now;
    const e = remaining(l)[0];
    if (e) await notify(`✅ ${l.before.map(b => b.name).join(' + ')} terminé ! Place à la muscu.\n${exLine(e, suggestFor(e, await readSportLog(), l.date), needWarm(l, e))}\n${timeline(l, now).line}`, `▶️ ${e.name}`);
  } else if (ph === 'muscu') {
    // Suivi au chrono : le temps prévu de l'exercice est passé (+2 min) → exercice suivant, sans rien lui demander
    const e = remaining(l)[0]!;
    const since = l.exAt ?? l.liftsAt ?? now;
    const talking = l.lastSetAt && now - l.lastSetAt < (e.rest / 60 + 4) * 60_000;   // il donne ses séries : c'est lui qui mène
    if (!talking && now - since > (exMin(e) + 2) * 60_000) {
      l.idx = Math.max(l.idx, l.exercises.indexOf(e) + 1);
      l.exAt = now;
      const nx = remaining(l)[0];
      await notify(nx ? `⏭️ Normalement ${e.name} est fini → ${exLine(nx, suggestFor(nx, await readSportLog(), l.date), needWarm(l, nx))}\n${timeline(l, now).line} ${lateAdvice(l, timeline(l, now).margin)}`.trim()
        : `🏁 Muscu terminée au chrono ! ${l.after.length ? `Passe à ${l.after.map(b => b.name).join(' + ')}.` : 'Étirements 5 min.'}`, nx ? `▶️ ${nx.name}` : '🏁 Muscu terminée');
      if (!nx) l.sent.push('after');
    }
  } else if (ph === 'apres' && once('after')) {
    await notify(`🏁 Muscu terminée ! ${l.after.length ? `Passe à ${l.after.map(b => b.name).join(' + ')}${l.leaveBy ? ` jusqu'à ${hm(l.leaveBy - 2 * 60_000)} (${Math.max(0, minLeft(l.leaveBy - 2 * 60_000, now))} min)` : ''}. Zone 2 : tu dois pouvoir parler.` : 'Étirements 5 min.'}`, '🏁 Muscu terminée');
  }
  if (l.leaveBy) {
    if (now >= l.leaveBy - 12 * 60_000 && now < l.leaveBy - 5 * 60_000 && once('warn')) {
      const rest = remaining(l);
      await notify(`⏳ Dans ~10 min tu pars (${hm(l.leaveBy)}) pour être à la maison à ${l.homeBy!.replace(':', 'h')} — ${l.road} min de route, ${l.traffic}.${rest.length ? `\nIl reste ${rest.map(e => e.name).join(', ')} : fais seulement ${rest[0]!.name}, le reste la prochaine fois.` : ' Finis ton cardio tranquillement, 2 min d\'étirements.'}`, `⏳ Départ à ${hm(l.leaveBy)}`);
    }
    if (now >= l.leaveBy - 4 * 60_000 && once('leave')) {
      const { home } = await points();
      await queueTelegramMessage(`🚗 C'est l'heure de partir pour être à la maison à ${l.homeBy!.replace(':', 'h')} (${l.road} min, ${l.traffic}).${home ? `\n🧭 Waze : https://waze.com/ul?ll=${home.lat},${home.lng}&navigate=yes` : ''}`);
      if (!(await getPendingCall('kouider'))) {
        await callOwner(`Kouider, c'est Dzaryx. C'est l'heure de partir de la salle pour être à la maison à ${say(localTs(l.date, l.homeBy!))} : il y a ${l.road} minutes de route, ${l.traffic}. Arrête ton ${ph === 'apres' ? (l.after[0]?.name ?? 'cardio').toLowerCase() : 'exercice'}, bois un coup et file. Bravo pour la séance !`).catch(() => null);
      }
    }
  }
  await saveLive(l);
}

// ── Montre (workout-live.ts) ─────────────────────────────────────────────────
export async function liveActive(): Promise<boolean> { const l = await getLive(); return !!l && !l.endedAt; }

/** La montre dit « musculation commencée » → fin du cardio d'échauffement, 1er exercice au chrono. */
export async function watchLifting(at: number): Promise<void> {
  const l = await getLive();
  if (!l || l.endedAt || l.liftsAt) return;
  l.liftsAt = at; l.exAt = at; l.sent.push('lifts');
  await saveLive(l);
}

/** La montre dit « entraînement fini » : cardio d'avant → place à la muscu ; muscu → bilan ; cardio de fin → bilan. Renvoie la ligne pour le message. */
export async function watchEnded(w: { kind: 'cardio' | 'muscu' | 'autre'; type: string; min: number; kcal?: number; hrAvg?: number }): Promise<string> {
  const l = await getLive();
  if (!l || l.endedAt) return '';
  const now = Date.now();
  const watch = `⌚ ${w.type} ${w.min} min${w.kcal ? `, ${w.kcal} kcal` : ''}${w.hrAvg ? `, cœur moyen ${w.hrAvg}` : ''}`;
  l.health = `${l.health ?? ''}\n${watch}`.trim();
  // cardio d'échauffement fini (la muscu n'est pas commencée ou vient juste de l'être) → place à la muscu
  if (w.kind === 'cardio' && remaining(l).length && Object.keys(l.done).length === 0 && l.idx === 0) {
    if (!l.liftsAt) l.sent.push('lifts');
    l.liftsAt = now; l.exAt = now;
    await saveLive(l);
    const e = remaining(l)[0]!;
    return `✅ Cardio fait. Place à la muscu :\n${exLine(e, suggestFor(e, await readSportLog(), l.date), needWarm(l, e))}`;
  }
  // muscu finie et un cardio de fin prévu → on attend la fin de ce cardio pour le bilan
  if (w.kind !== 'cardio' && l.after.length) {
    l.idx = l.exercises.length; l.exAt = now;
    if (!l.sent.includes('after')) l.sent.push('after');
    await saveLive(l);
    return `🏁 Muscu terminée ! Passe à ${l.after.map(b => b.name).join(' + ')}${l.leaveBy ? ` jusqu'à ${hm(l.leaveBy - 2 * 60_000)}` : ''}. Zone 2 : tu dois pouvoir parler.`;
  }
  // sinon (cardio de fin, ou muscu sans cardio après) → bilan de la séance
  return endLive(l, `montre : ${w.type} fini`).then(t => `\n${t}`);
}
