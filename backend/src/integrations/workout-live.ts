import { kvGet, kvSet } from './app-store.js';
import { localNow, hm } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// SÉANCE VUE PAR LA MONTRE (Kouider 30/10 : « il me demande le poids alors que c'est moi qui lui indique ; il doit voir
// quand la séance commence et finit, tapis ou muscu, battements du cœur, calories… via Santé »).
// Deux automatisations Raccourcis iPhone « Entraînement Apple Watch » (commence / se termine) → POST /api/jarvis/workout.
// Début : Dzaryx sait ce que tu fais (tapis, muscu…) et lance le coach en direct sans rien demander.
// Fin : durée, calories, cœur moyen / max, temps par zone (calculé ici, pas deviné), comparaison avec la fois d'avant,
// charge d'entraînement de la semaine, et le bloc de la séance est coché (cardio fait → muscu ; muscu finie → bilan).
// La montre n'envoie pas le cœur battement par battement à un serveur (il faudrait une app Apple Watch native) :
// on a le début, la fin, et tous les échantillons de la séance à la fin. « pulse » accepte un relevé ponctuel (Siri).

const CUR_KEY = 'kouider:workout:current';
const LOG_KEY = 'kouider:workout:log';

export interface WorkoutRec {
  at: string; end: string; type: string; kind: 'cardio' | 'muscu' | 'autre';
  min: number; kcal?: number; hrAvg?: number; hrMax?: number; zones?: number[]; distanceKm?: number; load?: number;
}

const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[\n,;]+/))
  .map(x => Number(String(x).trim().replace(',', '.'))).filter(x => Number.isFinite(x) && x > 0);
const kindOf = (t: string): WorkoutRec['kind'] =>
  /tapis|course|run|marche|walk|v[ée]lo|cycl|ellipti|rameur|row|cardio|hiit|stair|escalier|natation|swim/i.test(t) ? 'cardio'
    : /muscu|force|strength|renfo|functional|fonctionnel|halt|weight|core|tradition/i.test(t) ? 'muscu' : 'autre';
const label = (t: string) => {
  const k = t.toLowerCase();
  return /indoor.?run|tapis|treadmill/.test(k) ? 'Tapis de course' : /ellipti/.test(k) ? 'Elliptique' : /indoor.?cycl|v[ée]lo/.test(k) ? 'Vélo'
    : /walk|marche/.test(k) ? 'Marche' : /run|course/.test(k) ? 'Course' : /row|rameur/.test(k) ? 'Rameur'
    : /functional|fonctionnel/.test(k) ? 'Renforcement fonctionnel' : /strength|muscu|force|weight/.test(k) ? 'Musculation' : t.slice(0, 40) || 'Entraînement';
};

async function readJson<T>(key: string, dflt: T): Promise<T> {
  try { return JSON.parse((await kvGet(key)) ?? 'null') ?? dflt; } catch { return dflt; }
}
export const readWorkouts = () => readJson<WorkoutRec[]>(LOG_KEY, []);

/** FC max (Tanaka : 208 − 0,7 × âge), âge du profil FORME. */
async function hrMaxOf(): Promise<number> {
  const age = await import('./forme.js').then(f => f.getFormeProfile('kouider')).then(p => p?.age).catch(() => null);
  return Math.round(208 - 0.7 * (Number(age) || 30));
}
/** Minutes par zone (Z1 < 60 %, Z2 60-70, Z3 70-80, Z4 80-90, Z5 > 90 % de la FC max), échantillons répartis sur la durée. */
function zonesOf(hr: number[], min: number, max: number): number[] {
  const z = [0, 0, 0, 0, 0];
  if (!hr.length) return z;
  const per = min / hr.length;
  for (const h of hr) { const p = h / max; z[p < 0.6 ? 0 : p < 0.7 ? 1 : p < 0.8 ? 2 : p < 0.9 ? 3 : 4]! += per; }
  return z.map(x => Math.round(x));
}
/** Charge (TRIMP simplifié, Edwards) : minutes × facteur de zone. */
const loadOf = (z: number[]) => z.reduce((a, m, i) => a + m * (i + 1), 0);

/** Charge des 7 derniers jours vs moyenne sur 4 semaines (ratio aigu/chronique : 0,8-1,3 = zone sûre, > 1,5 = risque). */
export async function loadLine(): Promise<string> {
  const log = await readWorkouts();
  const t = Date.now();
  const sum = (days: number) => log.filter(w => t - Date.parse(w.end) < days * 86_400_000).reduce((a, w) => a + (w.load ?? w.min * 2), 0);
  const week = sum(7), month = sum(28);
  const first = log[0] ? (t - Date.parse(log[0].end)) / 86_400_000 : 0;
  if (!week) return '';
  if (first < 14) return `📈 Charge d'entraînement 7 jours : ${Math.round(week)} (ratio dispo après 2 semaines de données).`;
  const ratio = week / (month / 4);
  return `📈 Charge 7 jours : ${Math.round(week)} — ${ratio.toFixed(2).replace('.', ',')} × ta moyenne ${ratio > 1.5 ? '⚠️ trop d\'un coup : risque de blessure, allège 2-3 jours' : ratio > 1.3 ? '🟠 grosse semaine, dors bien' : ratio < 0.8 ? '🔵 semaine légère : tu peux pousser' : '✅ zone idéale'}.`;
}

type HDay = { date: string; sleep_h?: number; rhr?: number; hrv?: number };
/** Score de récupération 0-100 d'un jour (index i de health:daily) : VFC et cœur au repos vs les 14 jours d'avant, + sommeil s'il est connu. */
export function scoreDay(all: HDay[], i: number): { score: number; hAvg: number; rAvg: number } | null {
  const d = all[i];
  if (!d || (!d.hrv && !d.rhr)) return null;
  const prev = all.slice(Math.max(0, i - 14), i);
  const avg = (k: 'rhr' | 'hrv') => { const v = prev.map(x => Number(x[k] ?? 0)).filter(x => x > 0); return v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  let s = 60;
  const h = avg('hrv'), r = avg('rhr');
  if (d.hrv && h) s += 30 * clamp((d.hrv / h - 1) / 0.25);
  if (d.rhr && r) s -= 20 * clamp((d.rhr - r) / 6);
  if (d.sleep_h) s += 8 * clamp((d.sleep_h - 7) / 1.5);
  return { score: Math.max(0, Math.min(100, Math.round(s))), hAvg: h, rAvg: r };
}

/** Récupération du dernier jour reçu (façon Whoop / Athlytic). */
export async function readiness(): Promise<{ score: number; line: string } | null> {
  const all = await readJson<HDay[]>('health:daily', []);
  const r = scoreDay(all, all.length - 1);
  if (!r) return null;
  const d = all.at(-1)!, { score, hAvg: h, rAvg: rr } = r;
  const base = !h && !rr ? ' (encore peu de jours pour comparer)' : '';
  return { score, line: `🔋 Récupération ${score}/100${base} — ${score >= 67 ? 'feu vert, journée pour pousser' : score >= 34 ? 'normal : charges habituelles' : 'corps fatigué : séance légère, technique, et coucher tôt'} (VFC ${d.hrv ?? '?'}${h ? ` / ${Math.round(h)} d'habitude` : ''}, cœur au repos ${d.rhr ?? '?'}${rr ? ` / ${Math.round(rr)}` : ''}).` };
}

/** Récupération jour par jour (courbe du dimanche, surentraînement, corrélations). */
export async function readinessSeries(): Promise<Array<{ date: string; score: number }>> {
  const all = await readJson<HDay[]>('health:daily', []);
  return all.map((d, i) => ({ date: d.date, r: scoreDay(all, i) })).filter(x => x.r).map(x => ({ date: x.date, score: x.r!.score }));
}

/** POST /api/jarvis/workout — corps tolérant (Raccourcis) : { event: start|end|pulse, type, hr, kcal, duration, distance }. */
export async function receiveWorkout(body: Record<string, unknown>): Promise<{ ok: true; say: string }> {
  const b = (typeof body['data'] === 'object' && body['data']) ? { ...body, ...(body['data'] as Record<string, unknown>) } : body;
  const pick = (re: RegExp) => Object.entries(b).find(([k]) => re.test(k))?.[1];
  const ev = String(pick(/^(event|evenement|état|etat|quand)$/i) ?? b['event'] ?? '').toLowerCase();
  const type = String(pick(/^(type|workout|entra[iî]nement|activit[ée]|sport)$/i) ?? '').trim();
  const now = Date.now();
  const cur = await readJson<{ at: number; type: string } | null>(CUR_KEY, null);

  if (/start|d[ée]but|commence|begin/.test(ev)) {
    const t = label(type), kind = kindOf(`${type} ${t}`);
    await kvSet(CUR_KEY, JSON.stringify({ at: now, type: t }), 6 * 3600);
    const gym = await import('./gym-live.js');
    let extra = '';
    // Muscu ou cardio de début de séance : le coach en direct démarre tout seul (il n'a rien à dire)
    if (!(await gym.liveActive())) { await gym.startLive(localNow().date, now).catch(() => ''); extra = ' Coach en direct lancé.'; }
    if (kind === 'muscu') await gym.watchLifting(now).catch(() => {});
    await queueTelegramMessage(`⌚ ${t} démarré à ${hm(now)}.${extra} Je suis la séance avec ta montre : tu n'as rien à me dire (un poids, seulement si tu veux).`);
    return { ok: true, say: `${t} : c'est noté, je te suis.` };
  }

  if (/pulse|pouls|coeur|cœur|bpm/.test(ev)) {
    const hr = nums(pick(/heart|cardi|hr|bpm|pouls|fc/i)).at(-1);
    if (!hr) return { ok: true, say: 'Pas de battements reçus.' };
    const max = await hrMaxOf(), p = hr / max;
    const zone = p >= 0.9 ? 'zone 5, zone rouge' : p >= 0.8 ? 'zone 4, intense' : p >= 0.7 ? 'zone 3, tempo' : p >= 0.6 ? 'zone 2' : 'zone 1, récupération';
    // Sur le tapis / le cardio : la cible est la zone 2 (60-70 % du max) → il dit quoi faire
    const cardio = cur ? kindOf(cur.type) === 'cardio' : true;
    const lo = Math.round(max * 0.6), hi = Math.round(max * 0.7);
    const todo = !cardio ? (p >= 0.9 ? ' Respire, repos un peu plus long.' : '')
      : p > 0.72 ? ` Ralentis un peu ou baisse l'inclinaison : vise ${lo} à ${hi}.` : p < 0.58 ? ` Accélère un peu ou monte l'inclinaison : vise ${lo} à ${hi}.` : ' Parfait, garde ce rythme.';
    return { ok: true, say: `${Math.round(hr)} battements, ${zone}.${todo}` };
  }

  // Fin (ou envoi sans événement = fin)
  const start = cur?.at ?? now - (nums(pick(/dur[ée]e|duration/i))[0] ?? 0) * 60_000;
  const t = type ? label(type) : cur?.type ?? 'Entraînement';
  let min = nums(pick(/dur[ée]e|duration/i))[0] ?? Math.round((now - start) / 60_000);
  if (min > 600) min = Math.round(min / 60);                           // secondes → minutes
  const hr = nums(pick(/heart|cardi|^hr|bpm|pouls|fc/i)).filter(x => x >= 40 && x <= 230);
  const kcalL = nums(pick(/kcal|calor|energ|active/i));
  const kcal = kcalL.length ? Math.round(kcalL.reduce((a, x) => a + x, 0)) : undefined;
  const dist = nums(pick(/dist/i))[0];
  const max = await hrMaxOf();
  const zones = zonesOf(hr, min, max);
  const rec: WorkoutRec = { at: new Date(start).toISOString(), end: new Date(now).toISOString(), type: t, kind: kindOf(t), min,
    ...(kcal ? { kcal } : {}), ...(hr.length ? { hrAvg: Math.round(hr.reduce((a, x) => a + x, 0) / hr.length), hrMax: Math.round(Math.max(...hr)), zones, load: loadOf(zones) } : {}),
    ...(dist ? { distanceKm: Math.round((dist > 100 ? dist / 1000 : dist) * 100) / 100 } : {}) };
  const log = await readWorkouts();
  log.push(rec);
  await kvSet(LOG_KEY, JSON.stringify(log.slice(-300)));
  await kvSet(CUR_KEY, 'null', 60);

  const prev = [...log].slice(0, -1).reverse().find(w => w.type === t);
  const cmp = prev?.kcal && rec.kcal ? ` (${rec.kcal >= prev.kcal ? '+' : ''}${rec.kcal - prev.kcal} kcal vs le ${prev.at.slice(8, 10)}/${prev.at.slice(5, 7)})` : '';
  const zLine = hr.length ? `\n❤️ Cœur moyen ${rec.hrAvg} · max ${rec.hrMax} (${Math.round(rec.hrMax! / max * 100)} % de ton max ${max})\n🎯 Zones : ${zones.map((m, i) => `Z${i + 1} ${m} min`).join(' · ')}` : '';
  const advice = rec.kind === 'cardio' && hr.length
    ? zones[1]! >= min * 0.5 ? '\n✅ Surtout en zone 2 : parfait pour brûler les graisses et le cœur.' : zones[3]! + zones[4]! > min * 0.4 ? '\n🔥 Beaucoup en zone 4-5 : séance dure, garde la prochaine en zone 2.' : ''
    : '';
  // La séance du coach avance toute seule : cardio fini → muscu ; muscu finie → bilan
  const gym = await import('./gym-live.js');
  const coach = await gym.watchEnded(rec).catch(() => '');
  const water = await import('./life-plus.js').then(m => m.waterLine()).catch(() => '');
  const msg = `⌚ ${t} terminé : ${min} min${rec.kcal ? ` · 🔥 ${rec.kcal} kcal${cmp}` : ''}${rec.distanceKm ? ` · ${rec.distanceKm} km` : ''}${zLine}${advice}${coach ? `\n${coach}` : ''}\n${await loadLine().catch(() => '')}${water ? `\n${water}` : ''}`.trim();
  await queueTelegramMessage(msg);
  // FORME + journal sport (comme le Raccourci Santé du soir)
  await import('./sport-coach.js').then(m => m.markWatchWorkout(localNow().date, min, t)).catch(() => null);
  if (rec.kcal) await import('./forme.js').then(f => f.updateDay('kouider', localNow().date, x => { x.activeKcal = Math.max(x.activeKcal ?? 0, rec.kcal!); })).catch(() => {});
  return { ok: true, say: `${t} terminé, ${min} minutes${rec.kcal ? `, ${rec.kcal} calories` : ''}. Bravo.` };
}

/** Pour le cerveau (« combien j'ai brûlé ? », « ma séance d'hier ? »). */
export async function workoutsText(days = 7): Promise<string> {
  const from = Date.now() - days * 86_400_000;
  const l = (await readWorkouts()).filter(w => Date.parse(w.end) >= from);
  const r = await readiness().catch(() => null);
  const lines = l.map(w => `• ${w.at.slice(8, 10)}/${w.at.slice(5, 7)} ${hm(Date.parse(w.at))} ${w.type} ${w.min} min${w.kcal ? ` · ${w.kcal} kcal` : ''}${w.hrAvg ? ` · cœur ${w.hrAvg}/${w.hrMax}` : ''}${w.zones ? ` · Z2 ${w.zones[1]} min` : ''}`);
  return [r?.line ?? '', lines.length ? `⌚ Séances montre (${days} j) :\n${lines.join('\n')}` : '⌚ Aucune séance reçue de la montre ces derniers jours (automatisations « Entraînement Apple Watch » à installer).', await loadLine().catch(() => '')].filter(Boolean).join('\n');
}
