/**
 * 🔇 QUAND LA VOIX CARPLAY PARLE (11/11, Kouider : « une option pour couper le CarPlay ; juste avant mon départ à la
 * salle et en rentrant du travail, pas à chaque démarrage ; et pouvoir le désactiver si je veux »).
 * kv car:voice:mode = 'cible' (défaut) | 'off' | 'toujours'.
 *  - cible    : parle seulement au départ maison → salle (heure de départ de la routine sport ±40 min, près de la maison)
 *               et en quittant le travail (plus près du travail que de la maison) ; sinon son muet.
 *  - off      : jamais (départ ni arrivée).
 *  - toujours : comme avant (chaque démarrage).
 * Muet = petit son silencieux, pour que le raccourci iPhone (« Obtenir le contenu de l'URL » → « Émettre un son ») ne plante pas.
 */
import { kvJson, kvPut } from './ai-util.js';
import { localNow } from './morning-routine.js';

export type CarVoiceMode = 'cible' | 'off' | 'toujours';
const MODE_K = 'car:voice:mode', SPOKE_K = 'car:voice:spoke';
interface LL { lat: number; lng: number }

export async function carVoiceMode(): Promise<CarVoiceMode> {
  const m = await kvJson<CarVoiceMode | null>(MODE_K, null);
  return m === 'off' || m === 'toujours' ? m : 'cible';
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h! * 60 + m!; };

async function places(): Promise<{ home: LL | null; work: LL | null }> {
  const [{ geocode }, { getRoutineConfig }] = await Promise.all([import('./departures.js'), import('./morning-routine.js')]);
  const a = (await getRoutineConfig()).addresses;
  const [home, work] = await Promise.all([geocode(a.home).catch(() => null), geocode(a.work).catch(() => null)]);
  return { home, work };
}

/** Décide si ce démarrage doit parler. `pos` absent → décision à l'heure seule (sert aussi au vocal préparé). */
export async function shouldSpeak(pos: Partial<LL> = {}, at = Date.now()): Promise<{ speak: boolean; why: string }> {
  const mode = await carVoiceMode();
  if (mode === 'off') return { speak: false, why: 'coupé' };
  if (mode === 'toujours') return { speak: true, why: 'toujours' };
  const ln = localNow(at), cur = toMin(ln.hhmm);
  let here: LL | null = Number.isFinite(pos.lat) && pos.lat ? { lat: pos.lat!, lng: pos.lng! } : null;
  if (!here && at === Date.now()) {
    const loc = await import('./location.js').then(m => m.getLocation('kouider')).catch(() => null);
    if (loc && Date.now() - Date.parse(loc.updated_at) < 30 * 60_000) here = { lat: loc.lat, lng: loc.lng };
  }
  const { haversine } = await import('./forme-runs.js');
  const { home, work } = here ? await places().catch(() => ({ home: null, work: null })) : { home: null, work: null };
  const dist = (p: LL | null) => (here && p ? haversine([here.lat, here.lng], [p.lat, p.lng]) : NaN);
  const dH = dist(home), dW = dist(work);

  // 1) départ maison → salle : jour de sport, autour de l'heure de départ de la routine
  const { getRoutineConfig, effectiveDay } = await import('./morning-routine.js');
  const cfg = await getRoutineConfig().catch(() => null);
  const paused = cfg?.pausedUntil && Date.parse(String(cfg.pausedUntil)) > at;
  const day = cfg?.enabled && !paused ? await effectiveDay(cfg, ln.date).catch(() => undefined) : undefined;
  if (day?.kind === 'sport' && day.leave && Math.abs(cur - toMin(day.leave)) <= 40) {
    if (Number.isNaN(dH) || dH < 1500) return { speak: true, why: 'départ salle' };
  }
  // 2) retour du travail : il démarre plus près du travail que de chez lui (maison et travail à ~450 m → comparaison)
  if (cur >= 11 * 60 && !Number.isNaN(dW) && dW < 2500 && dW < dH) return { speak: true, why: 'retour travail' };
  // sans position : heure de fin du travail du jour (-20 / +90 min)
  if (!here) {
    const ends = await kvJson<Record<string, string>>('kouider:work_end', { '2': '20:00', '3': '20:00', '5': '20:00', '6': '20:00' });
    const end = ends[String(ln.weekday)] ?? (ln.weekday === 4 ? '13:00' : undefined);
    if (end && cur - toMin(end) >= -20 && cur - toMin(end) <= 90) return { speak: true, why: 'retour travail (heure)' };
  }
  return { speak: false, why: 'trajet ordinaire' };
}

/** Mémorise si le dernier démarrage a parlé (le discours d'arrivée ne parle qu'après un trajet « parlé »). */
export async function markSpoke(spoke: boolean): Promise<void> { await kvPut(SPOKE_K, { at: Date.now(), spoke }); }
export async function arrivalAllowed(): Promise<boolean> {
  const mode = await carVoiceMode();
  if (mode === 'off') return false;
  if (mode === 'toujours') return true;
  const s = await kvJson<{ at: number; spoke: boolean } | null>(SPOKE_K, null);
  return !!s?.spoke && Date.now() - s.at < 4 * 3600_000;
}

/** 0,3 s de silence (WAV 24 kHz mono 16 bits). */
export function silentWav(): Buffer {
  const rate = 24000, n = Math.round(rate * 0.3), data = n * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(data, 40);
  return b;
}

const CP = String.raw`(?:car\s?-?play|carplay|vocal (?:de la |dans la )?voiture|voix (?:de la |dans la )?voiture|jarvis (?:dans la |en )voiture)`;
const ALWAYS_RE = new RegExp(`${CP}.{0,30}(?:à|a) chaque d[ée]marrage|${CP}.{0,20}(?:toujours|tout le temps)|(?:toujours|à chaque d[ée]marrage).{0,20}${CP}`, 'i');
const OFF_RE = new RegExp(`(?:coupe|d[ée]sactive|arr[êe]te|stop|[ée]teins|enl[èe]ve|supprime|mets? en (?:pause|silence)).{0,25}${CP}|${CP}.{0,10}(?:off|coup[ée]|d[ée]sactiv[ée]|en silence)\\b`, 'i');
const ON_RE = new RegExp(`(?:r[ée]active|active|remets?|rallume|relance|allume).{0,25}${CP}|${CP}.{0,10}\\b(?:on|activ[ée]|normal)\\b`, 'i');

/** « coupe le CarPlay » / « réactive le CarPlay » / « CarPlay à chaque démarrage » → réglage direct. */
export async function carVoiceCommand(text: string): Promise<{ reply: string; direct: boolean } | null> {
  const t = text.trim();
  if (t.length > 90) return null;
  let mode: CarVoiceMode | null = null;
  if (ALWAYS_RE.test(t)) mode = 'toujours';
  else if (OFF_RE.test(t)) mode = 'off';
  else if (ON_RE.test(t)) mode = 'cible';
  if (!mode) return null;
  await kvPut(MODE_K, mode);
  const reply = mode === 'off'
    ? '🔇 Voix CarPlay coupée : plus rien au démarrage ni à l\'arrivée. Dis « réactive le CarPlay » pour la remettre.'
    : mode === 'toujours'
      ? '🔊 Voix CarPlay à chaque démarrage (comme avant). Dis « réactive le CarPlay » pour revenir à salle + retour du travail seulement.'
      : '🚗 Voix CarPlay réactivée : elle parle seulement au départ pour la salle et en rentrant du travail. Dis « coupe le CarPlay » pour la couper.';
  return { reply, direct: true };
}
