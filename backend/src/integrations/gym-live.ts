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
// kg × reps, les note (journal + records), et conseille : monter la charge, garder, baisser, rajouter du repos, couper une
// série si on est en retard. Fin de séance (départ GPS ou « fini ») → bilan : volume, records, ce qu'il faut améliorer.

const LIVE_KEY = 'kouider:sport:live';
const HOMEBY_KEY = 'kouider:sport:homeby';
const NUDGE_AFTER = 8 * 60_000;

interface DoneSet { kg?: number; reps?: number; rpe?: number }
interface Live {
  date: string; startedAt: number; type: SessionType; label: string;
  exercises: Exercise[]; before: CardioBlock[]; after: CardioBlock[];
  idx: number; done: Record<string, DoneSet[]>; skipped: string[];
  homeBy?: string; leaveBy?: number; road?: number; traffic?: string;
  liftsAt?: number; lastSetAt?: number; lastNudge?: number; nudges: number;
  sent: string[]; health?: string; endedAt?: number;
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
async function getHomeBy(date: string): Promise<string | null> {
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
function lateAdvice(l: Live, margin: number | null): string {
  if (margin == null || margin >= 0) return '';
  const rest = remaining(l);
  const cut = rest.filter(e => setsLeft(l, e) >= 3).slice(-Math.ceil(-margin / 3));
  return `⚠️ Tu as ~${-margin} min de retard sur le planning : ${cut.length ? `fais 2 séries au lieu de 3 sur ${cut.map(e => e.name).join(', ')}` : 'raccourcis les repos à 60 s'} pour garder du temps au cardio de fin.`;
}

function exLine(e: Exercise, sug: { kg: number | null; last?: string; up?: boolean }): string {
  const kg = sug.kg != null ? ` — charge conseillée ${sug.kg} kg${sug.up ? ' ⬆️ (tu as tout réussi la dernière fois)' : ''}` : ' — 1re fois : prends une charge où tu fais 12 reps propres en gardant 2 reps en réserve';
  return `▶️ ${e.name} : ${e.sets} × ${e.reps}, repos ${e.rest} s${kg}${sug.last ? `\n   Dernière fois : ${sug.last}` : ''}\n   💡 ${e.tip}`;
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
  l.health = await healthLine();
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
    first ? `\n${l.before.length ? 'Après le cardio, on commence par :' : 'On commence par :'}\n${exLine(first, suggestFor(first, log, date))}` : '',
    '\n📝 Après CHAQUE série, dis-moi le poids et les reps (ex. « 60 kg 12 » ou « 12 reps à 60 ») : je note, je te dis si tu montes, gardes ou baisses.',
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
  if (isTimed(e) || !o.reps) advice.push(o.reps ? '' : 'Dis-moi aussi le nombre de reps pour que je règle la charge.');
  else if (o.reps >= hi + 3) advice.push(`Trop facile : monte à ${o.kg ? `${o.kg + step} kg` : `+${step} kg`} dès la prochaine série.`);
  else if (o.reps >= hi) advice.push(k < e.sets ? `Haut de la fourchette 👌 garde ${o.kg ?? 'la charge'}${o.kg ? ' kg' : ''} ; si la dernière passe encore à ${hi}, on monte la prochaine fois.` : '');
  else if (o.reps < lo - 2) advice.push(`Trop lourd : baisse à ~${o.kg ? Math.round(o.kg * 0.9 * 2) / 2 : '−10 %'}${o.kg ? ' kg' : ''} pour rester dans ${e.reps} avec une technique propre.`);
  else if (o.reps < lo) advice.push(`Un peu court : garde ${o.kg ?? 'la charge'}${o.kg ? ' kg' : ''}, prends ${e.rest + 30} s de repos et vise ${lo} reps.`);
  else advice.push(`Dans la cible ✅ garde ${o.kg ?? 'la charge'}${o.kg ? ' kg' : ''}.`);
  if (o.rpe && o.rpe >= 9.5 && k < e.sets) advice.push('Tu es allé à l\'échec : garde 1-2 reps en réserve sur la suivante, c\'est là que ça progresse sans se blesser.');
  if (sug.kg && o.kg) advice.push(o.kg > sug.kg ? `+${Math.round((o.kg - sug.kg) * 10) / 10} kg par rapport à la dernière fois 💪` : o.kg < sug.kg ? `(${sug.kg} kg étaient prévus${sug.last ? ` — dernière fois ${sug.last}` : ''})` : '');
  if (r.prs.length) advice.push(`🏆 NOUVEAU RECORD : ${r.prs.join(', ')} !`);
  let next = '';
  if (k >= e.sets) {
    const all = arr.filter(s => s.reps != null);
    const allTop = all.length >= e.sets && all.every(s => (s.reps ?? 0) >= hi);
    advice.push(`✅ ${e.name} terminé (${arr.map(s => `${s.kg ?? '?'}×${s.reps ?? '?'}`).join(', ')}).${allTop && o.kg ? ` Toutes les séries à ${hi} → prochaine séance ${o.kg + step} kg.` : ''}`);
    l.idx = Math.max(l.idx, l.exercises.indexOf(e) + 1);
    const nx = remaining(l)[0];
    next = nx ? `\n\n${exLine(nx, suggestFor(nx, log.filter(x => x.date !== l.date), l.date))}` : `\n\n🏁 Muscu terminée ! ${l.after.length ? `Passe à ${l.after.map(b => b.name).join(' + ')}${l.leaveBy ? ` jusqu'à ${hm(l.leaveBy - 2 * 60_000)}` : ''}.` : 'Étirements 5 min.'}`;
    if (!nx) l.sent.push('after');
  } else next = `\nSérie ${k + 1}/${e.sets} : repos ${e.rest} s puis dis-moi kg × reps.`;
  await saveLive(l);
  const t = timeline(l, now);
  return `📝 ${e.name} série ${k}/${e.sets} : ${o.kg ?? '?'} kg × ${o.reps ?? '?'}. ${advice.filter(Boolean).join(' ')}${next}\n${l.leaveBy ? `⏱️ ${minLeft(l.leaveBy, now)} min avant de partir.` : ''} ${lateAdvice(l, t.margin)}`.trim();
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
    lines.push(`• ${e.name} : ${arr.map(s => `${s.kg ?? '?'}×${s.reps ?? '?'}`).join(', ')}`);
    const reps = arr.map(s => s.reps ?? 0).filter(Boolean);
    if (reps.length && reps.every(x => x >= hi)) improve.push(`${e.name} : tout à ${hi}+ → monte la charge la prochaine fois`);
    else if (reps.length && Math.max(...reps) - Math.min(...reps) >= 4) improve.push(`${e.name} : grosse baisse de reps entre séries → plus de repos ou −5 %`);
    else if (reps.some(x => x < lo)) improve.push(`${e.name} : sous ${lo} reps → garde la charge jusqu'à faire ${lo}-${hi} partout`);
    if (arr.length < e.sets) improve.push(`${e.name} : ${arr.length}/${e.sets} séries`);
  }
  const min = Math.round((l.endedAt - l.startedAt) / 60_000);
  const late = l.leaveBy && l.endedAt > l.leaveBy + 3 * 60_000 ? `⚠️ Parti ${minLeft(l.endedAt, l.leaveBy) * -1} min après l'heure prévue.` : '';
  return [`🏁 Bilan ${l.label} (${min} min, ${why})`, ...lines, volume ? `📦 Volume soulevé : ${Math.round(volume)} kg` : '',
    improve.length ? `🎯 À améliorer :\n- ${improve.slice(0, 6).join('\n- ')}` : '🎯 Séance propre, tout dans la cible. Continue comme ça.', late,
    l.after.length ? `⌚ Je vérifie ${l.after.map(b => b.name).join(' + ')} avec Santé quand la montre l'envoie.` : ''].filter(Boolean).join('\n');
}

/** Outil sport_coach action=live. */
export async function liveTool(input: Record<string, unknown>): Promise<string> {
  const op = String(input['op'] ?? 'status');
  let l = await getLive();
  if (op === 'start' || (!l && op === 'set')) {
    const txt = await startLive();
    if (op === 'start') return `${txt}\n\n[Il est à la salle : réponds court et motivant, demande-lui de te dire kg × reps après chaque série.]`;
    l = await getLive();
  }
  if (!l) return 'Pas de séance en cours.';
  if (l.endedAt && op !== 'start') return 'La séance d\'aujourd\'hui est terminée (bilan déjà fait).';
  const num = (k: string) => Number(input[k]) > 0 ? Number(input[k]) : undefined;
  if (op === 'set') return `${await logSet(l, { ...(input['exercise'] ? { exercise: String(input['exercise']) } : {}), kg: num('kg'), reps: num('reps'), rpe: num('rpe'), sets: num('sets') })}\n\n[Réponds court (il est entre deux séries) : le conseil + ce qu'il fait ensuite, puis redemande kg × reps.]`;
  if (op === 'next' || op === 'skip') {
    const e = (input['exercise'] ? findIn(l, String(input['exercise'])) : null) ?? remaining(l)[0];
    if (!e) return statusText(l);
    if (op === 'skip') l.skipped.push(e.id); else l.idx = Math.max(l.idx, l.exercises.indexOf(e) + 1);
    if (!l.liftsAt) l.liftsAt = Date.now();
    await saveLive(l);
    const nx = remaining(l)[0];
    return `${op === 'skip' ? `⏭️ ${e.name} passé${e.alt.length ? ` (alternative si la machine est prise : ${e.alt.join(' ou ')})` : ''}.` : `✅ ${e.name} terminé.`}\n${nx ? exLine(nx, suggestFor(nx, await readSportLog(), l.date)) : '🏁 Muscu terminée, place au cardio de fin.'}\n${timeline(l).line}`;
  }
  if (op === 'cardio_done') { l.liftsAt ??= Date.now(); await saveLive(l); const nx = remaining(l)[0]; return `✅ Cardio fait. ${nx ? `\n${exLine(nx, suggestFor(nx, await readSportLog(), l.date))}` : ''}\n${timeline(l).line}`; }
  if (op === 'stop') { const t = await endLive(l, 'terminée'); return `${t}\n\n[Félicite-le en une phrase et donne LE point principal à améliorer.]`; }
  return statusText(l);
}

/** Note ajoutée à chaque message / tour d'appel de Kouider pendant la séance (call.ts). */
export async function liveNote(): Promise<string | null> {
  const l = await getLive().catch(() => null);
  if (!l || l.endedAt) return null;
  const e = remaining(l)[0];
  return `[SÉANCE EN COURS À LA SALLE (${l.label}) : ${phase(l) === 'avant' ? `cardio d'échauffement jusqu'à ${hm(l.startedAt + beforeMin(l) * 60_000)}` : e ? `exercice actuel ${e.name} série ${(l.done[e.id]?.length ?? 0) + 1}/${e.sets}` : 'muscu finie, cardio de fin'}${l.leaveBy ? `, départ à ${hm(l.leaveBy)}` : ''}. S'il donne un poids / des reps (« 60 kg 12 », « 12 à 40 ») → sport_coach action=live op=set (exercise si ce n'est pas l'exercice actuel). « Tapis fini » → op=cardio_done. « J'ai fini l'exercice / je passe » → op=next ; machine prise → op=skip ; « il me reste quoi » → op=status ; « j'ai fini la séance » → op=stop. Réponds COURT.]`;
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
    l.liftsAt = now;
    const e = remaining(l)[0];
    if (e) await notify(`✅ ${l.before.map(b => b.name).join(' + ')} terminé ! Place à la muscu.\n${exLine(e, suggestFor(e, await readSportLog(), l.date))}\n\nDis-moi kg × reps après chaque série.\n${timeline(l, now).line}`, `▶️ ${e.name}`);
  } else if (ph === 'muscu' && now - (l.lastSetAt ?? l.liftsAt ?? now) > NUDGE_AFTER && now - (l.lastNudge ?? 0) > NUDGE_AFTER && l.nudges < 4) {
    const e = remaining(l)[0]!;
    l.lastNudge = now; l.nudges++;
    await notify(`⏱️ Tu en es où sur ${e.name} (série ${(l.done[e.id]?.length ?? 0) + 1}/${e.sets}) ? Dis-moi le poids et les reps.\n${l.leaveBy ? `Il te reste ${minLeft(l.leaveBy, now)} min avant de partir.` : ''} ${lateAdvice(l, timeline(l, now).margin)}`.trim(), `⏱️ ${e.name} : combien ?`);
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
