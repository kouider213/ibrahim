/**
 * 🚗 VOCAL CARPLAY PRÉPARÉ À L'AVANCE (06/11, Kouider : « diminuer le temps de lancement », choix « heure arrondie »).
 * Mesure du 06/11 11h42 : 31 s avant la voix (texte 6,8 s + voix 24,7 s). Toutes les 5 min, si un départ habituel arrive
 * dans 5 à 12 min (routine : départ maison, fin de séance, début et fin du travail ; ses vrais démarrages des semaines
 * passées), le texte ET la voix sont fabriqués d'avance, en UNE seule voix. Au démarrage, s'il est dans le même mode
 * (retour / famille / normal) et la même tranche d'heure (« un peu plus de 7 heures »), le son part tout de suite.
 * Sinon : chemin direct inchangé. Gardé en mémoire du serveur (un redéploiement le perd → chemin direct).
 */
import { kvJson, kvPut } from './ai-util.js';
import { localNow } from './morning-routine.js';

interface Prepared { forAt: number; madeAt: number; phrase: string; homeward: boolean; family: boolean; say: string; buf: Buffer }
let PREP: Prepared | null = null;
const STARTS_K = 'car:starts', COUNT_K = (d: string) => `car:prep:count:${d}`;
const MAX_PER_DAY = 6;          // la voix Gemini gratuite ≈ 10 par jour et par modèle : on n'en gâche pas
const VALID_AFTER_MS = 30 * 60_000;

/** Chaque vrai démarrage est gardé (90 derniers) pour apprendre ses heures de départ. */
export async function recordStart(): Promise<void> {
  const list = await kvJson<number[]>(STARTS_K, []);
  await kvPut(STARTS_K, list.concat(Date.now()).slice(-90));
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h! * 60 + m!; };

/** Heures (minutes depuis minuit, Bruxelles) où il démarre d'habitude aujourd'hui. */
export async function expectedStarts(now = Date.now()): Promise<number[]> {
  const { date, weekday } = localNow(now);
  const out: number[] = [];
  const { getRoutineConfig, effectiveDay } = await import('./morning-routine.js');
  const cfg = await getRoutineConfig().catch(() => null);
  const paused = cfg?.pausedUntil && Date.parse(String(cfg.pausedUntil)) > now;
  const day = cfg?.enabled && !paused ? await effectiveDay(cfg, date) : undefined;
  if (day?.leave) out.push(toMin(day.leave));                                  // maison → salle / travail
  if (day?.sport?.[1]) out.push(toMin(day.sport[1]));                          // fin de séance → retour
  for (const part of (day?.next ?? '').split(',')) {                           // « 13:00 travail » → départ ~10 min avant
    const m = part.match(/(\d{2}):(\d{2})\s*(.*)/);
    if (m && /travail|magasin|ouverture|bureau|agence/i.test(m[3]!)) out.push(toMin(`${m[1]}:${m[2]}`) - 10);
  }
  const ends = await kvJson<Record<string, string>>('kouider:work_end', { '2': '20:00', '3': '20:00', '5': '20:00', '6': '20:00' });
  if (ends[String(weekday)]) out.push(toMin(ends[String(weekday)]!));          // fin du travail → maison
  // ses vrais démarrages, même jour de la semaine, 5 dernières semaines (au moins 2 fois à ±15 min = une habitude)
  const past = (await kvJson<number[]>(STARTS_K, [])).filter(t => now - t < 35 * 86400_000 && now - t > 12 * 3600_000 && localNow(t).weekday === weekday)
    .map(t => toMin(localNow(t).hhmm));
  for (const t of past) if (past.filter(x => Math.abs(x - t) <= 15).length >= 2 && !out.some(x => Math.abs(x - t) <= 10)) out.push(t);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Job toutes les 5 min : prépare le vocal du prochain départ s'il arrive dans 5 à 12 min. */
export async function jobCarPrep(): Promise<void> {
  const now = Date.now();
  const ln = localNow(now);
  const cur = toMin(ln.hhmm);
  if (cur < 4 * 60 || cur > 23 * 60) return;
  const on = await kvJson<{ at: number } | null>('car:last-event', null), off = await kvJson<{ at: number } | null>('car:last-off', null);
  if (on && now - on.at < 3 * 3600_000 && (!off || off.at < on.at)) return;   // il roule déjà
  const target = (await expectedStarts(now)).find(t => t - cur >= 5 && t - cur <= 12);
  if (target === undefined) return;
  const forAt = now + (target - cur) * 60_000;
  // 11/11 : pas de vocal préparé pour un départ où la voix restera muette (coupée / trajet ordinaire)
  if (!(await import('./car-voice-mode.js').then(m => m.shouldSpeak({}, forAt)).then(g => g.speak).catch(() => true))) return;
  if (PREP && Math.abs(PREP.forAt - forAt) < 20 * 60_000 && now - PREP.madeAt < 40 * 60_000) return;
  const n = await kvJson<number>(COUNT_K(ln.date), 0);
  if (n >= MAX_PER_DAY) return;
  await kvPut(COUNT_K(ln.date), n + 1, 2 * 86400);
  const t0 = Date.now();
  const cc = await import('./car-coach.js');
  const j4 = await import('./jarvis4.js');
  const cco = await import('./car-company.js');
  const vac = await cco.vacationState({}).catch(() => null);
  const who = vac ? await cco.rideCompany(vac).catch(() => null) : null;
  if (vac && who && (vac.on || who !== 'seul')) return;                        // vacances / avec Houari : chemin direct
  const at = forAt + 3 * 60_000;                                               // il part souvent un peu après l'heure
  const homeward = await cc.isHomeward({}).catch(() => false);
  // isFamilyRide lit l'heure actuelle : à 5-12 min près le mode est le même (sinon, refusé au démarrage)
  const family = await cc.isFamilyRide(homeward).catch(() => false);
  let full: string;
  if (family) full = `${await cc.familyGreeting(at).catch(() => 'Bonjour à toute la famille.')} ${await cc.carBlessing(false).catch(() => '')}`.trim();
  else {
    const [hello, brief] = await Promise.all([cc.carGreeting({}, homeward, { approxAt: at }).catch(() => 'Bonjour Kouider.'), homeward ? Promise.resolve('') : j4.carBrief({}, true)]);
    const bless = await cc.carBlessing(homeward).catch(() => '');
    full = `${j4.speakable(j4.carPrivacy(`${hello} ${brief}`)) || 'Bonjour Kouider.'} ${bless}`.trim();
  }
  const tv = Date.now();
  const buf = await j4.makeJarvisVoice(full);
  console.log(`[car-prep] départ prévu ${localNow(forAt).hhmm} : texte ${tv - t0} ms, voix ${buf ? 'ok' : 'ÉCHEC'} ${Date.now() - tv} ms (${homeward ? 'retour' : family ? 'famille' : 'normal'})`);
  if (!buf) return;
  PREP = { forAt, madeAt: Date.now(), phrase: cc.approxTimePhrase(at), homeward, family, say: full.replace(/\s*\[\[Q:[\d,]+\]\]/g, '').trim(), buf };
  void kvPut('car:prep:last', { forAt, madeAt: PREP.madeAt, homeward, family }).catch(() => {});
}

/** Au démarrage : le vocal préparé s'il correspond encore (même mode, même tranche d'heure), sinon null. */
export async function takePrepared(homeward: boolean, family: boolean): Promise<{ say: string; buf: Buffer } | null> {
  const p = PREP;
  if (!p) return null;
  const now = Date.now();
  const { approxTimePhrase } = await import('./car-coach.js');
  const why = now > p.forAt + VALID_AFTER_MS ? 'trop tard' : now < p.madeAt ? 'pas prêt' : p.homeward !== homeward ? 'autre mode (retour)'
    : p.family !== family ? 'autre mode (famille)' : approxTimePhrase(now) !== p.phrase ? 'autre heure' : '';
  // un 2e démarrage < 30 min = « Re-bonjour » direct (court) : le préparé reste pour plus tard s'il est encore valable
  const last = await kvJson<number>('car:greet:last', 0);
  if (!why && now - last < 30 * 60_000) { console.log('[car-prep] non utilisé : re-bonjour'); return null; }
  if (why) { console.log(`[car-prep] non utilisé : ${why}`); if (why === 'trop tard') PREP = null; return null; }
  PREP = null;
  await kvPut('car:greet:last', now);
  console.log(`[car-timing] vocal PRÉPARÉ utilisé (fait il y a ${Math.round((now - p.madeAt) / 60_000)} min)`);
  return { say: p.say, buf: p.buf };
}
