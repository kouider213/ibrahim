/**
 * MODE PRÉSENT (10/11/2026) — Kouider : « quand je suis à la maison à côté de ma femme, Dzaryx m'oblige à moins utiliser
 * mon téléphone, s'il faut il me coupe l'accès à des trucs : ça tue ma relation ».
 *
 * Ce que Dzaryx peut vraiment faire sur un iPhone : une automatisation Raccourcis « quand j'ouvre TikTok / Instagram / … »
 * appelle POST /api/jarvis/event { type: 'app_open', app } ; si la réponse dit block:true, le raccourci renvoie à l'écran
 * d'accueil. C'est Dzaryx qui décide : à la maison + hors travail (congé ou soirée libre), de 9h à 22h30.
 * Soupapes choisies pour qu'il ne coupe pas tout au premier agacement : 3 pauses de 10 min par jour, « je suis seul » = 3 h.
 * Dzaryx ne sait PAS si sa femme est dans la pièce (aucun accès à son téléphone) : la règle est « maison + temps libre ».
 * État : app_kv family:focus (rien de privé dans le code).
 */
import { kvGet, kvSet } from './app-store.js';
import { localNow } from './morning-routine.js';

interface Focus {
  enabled: boolean;
  from: string; to: string;                               // fenêtre automatique (heure de Bruxelles)
  manualUntil?: number;                                   // « mode présent » demandé à la main (resto, sortie…)
  offUntil?: number;                                      // « je suis seul » / coupé pour un moment
  pass?: { date: string; n: number; until?: number };     // pauses du jour
  tries?: { date: string; n: number; apps: Record<string, number> };
}
const KEY = 'family:focus';
const PASS_MAX = 3, PASS_MIN = 10;
const DEF: Focus = { enabled: true, from: '09:00', to: '22:30' };

async function read(): Promise<Focus> {
  try { return { ...DEF, ...(JSON.parse((await kvGet(KEY)) ?? '{}') as Partial<Focus>) }; } catch { return { ...DEF }; }
}
const save = (f: Focus) => kvSet(KEY, JSON.stringify(f));
const hm = (ts: number) => localNow(ts).hhmm.replace(':', 'h');

export interface FocusNow { active: boolean; why: string; until?: number }

export async function focusNow(): Promise<FocusNow> {
  const f = await read(), now = Date.now();
  if (!f.enabled) return { active: false, why: 'mode présent désactivé' };
  if (f.offUntil && now < f.offUntil) return { active: false, why: `coupé jusqu'à ${hm(f.offUntil)}` };
  if (f.pass?.until && now < f.pass.until) return { active: false, why: `pause jusqu'à ${hm(f.pass.until)}`, until: f.pass.until };
  if (f.manualUntil && now < f.manualUntil) return { active: true, why: 'tu l\'as demandé', until: f.manualUntil };
  const { hhmm } = localNow();
  if (hhmm < f.from || hhmm >= f.to) return { active: false, why: `hors horaires (${f.from}–${f.to})` };
  const where = await kvGet('conscience:where').then(x => (JSON.parse(x ?? 'null') as { where?: string } | null)?.where ?? '').catch(() => '');
  if (where !== 'home') return { active: false, why: 'tu n\'es pas à la maison' };
  const kd = await import('./kouider-dossier.js');
  const free = (await kd.isDayOff().catch(() => false)) || (await kd.isAfterWork().catch(() => false));
  if (!free) return { active: false, why: 'tu travailles' };
  return { active: true, why: 'tu es à la maison, hors travail' };
}

const LINES = [
  'Ta femme et ton fils sont là. Pose le téléphone.',
  'Ibrahim ne sera petit qu\'une fois. Le téléphone attendra.',
  'Ce soir c\'est eux, pas l\'écran. Repose-le.',
  'Tu m\'as demandé de te bloquer : je tiens parole. Va les voir.',
  'Rien d\'urgent ici. Ce qui compte est dans la pièce.',
];

/** Automatisation iPhone « à l'ouverture de l'app » → faut-il le renvoyer à l'accueil ? */
export async function appOpen(app: string): Promise<{ block: boolean; say: string }> {
  const st = await focusNow();
  if (!st.active) return { block: false, say: '' };
  const f = await read(), date = localNow().date, name = app.trim().slice(0, 30) || 'appli';
  const t = f.tries?.date === date ? f.tries : { date, n: 0, apps: {} };
  t.n++; t.apps[name] = (t.apps[name] ?? 0) + 1;
  await save({ ...f, tries: t });
  const left = PASS_MAX - (f.pass?.date === date ? f.pass.n : 0);
  return { block: true, say: `${LINES[t.n % LINES.length]} (${t.n}e essai aujourd'hui${left > 0 ? ` — vraiment besoin ? écris « pause » à Dzaryx : ${left} pause${left > 1 ? 's' : ''} de ${PASS_MIN} min` : ' — plus de pause aujourd\'hui'})` };
}

export async function focusTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'status');
  const f = await read(), now = Date.now(), date = localNow().date;
  if (a === 'on') {
    const until = now + Math.min(Math.max(Number(input['hours']) || 3, 0.5), 12) * 3_600_000;
    await save({ ...f, enabled: true, manualUntil: until, offUntil: undefined });
    return `📵 Mode présent jusqu'à ${hm(until)} : les applis reliées au raccourci te renvoient à l'accueil. Profite d'eux.`;
  }
  if (a === 'pause') {
    const n = f.pass?.date === date ? f.pass.n : 0;
    if (n >= PASS_MAX) return `Non. Tu as déjà pris tes ${PASS_MAX} pauses aujourd'hui, et c'est toi qui m'as demandé d'être dur. Pose le téléphone — si c'est une vraie urgence, appelle directement la personne.`;
    const until = now + PASS_MIN * 60_000;
    await save({ ...f, pass: { date, n: n + 1, until } });
    return `⏳ Pause de ${PASS_MIN} min, jusqu'à ${hm(until)} (${n + 1}/${PASS_MAX} aujourd'hui). Après, je rebloque.`;
  }
  if (a === 'seul') {
    const until = now + 3 * 3_600_000;
    await save({ ...f, offUntil: until, manualUntil: undefined });
    return `D'accord, tu es seul : je ne bloque rien jusqu'à ${hm(until)}. Dès qu'ils rentrent, dis « mode présent ».`;
  }
  if (a === 'disable') { await save({ ...f, enabled: false, manualUntil: undefined }); return 'Mode présent désactivé : je ne bloque plus rien. Dis « active le mode présent » pour le remettre.'; }
  if (a === 'enable') { await save({ ...f, enabled: true, offUntil: undefined }); return `Mode présent activé : à la maison et hors travail, de ${f.from.replace(':', 'h')} à ${f.to.replace(':', 'h')}, les applis reliées au raccourci sont bloquées.`; }
  if (a === 'hours') {
    const from = String(input['from'] ?? ''), to = String(input['to'] ?? '');
    if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to) || from >= to) return '❌ from et to au format HH:MM (ex. 18:00 et 22:30).';
    await save({ ...f, from, to });
    return `Mode présent : de ${from.replace(':', 'h')} à ${to.replace(':', 'h')}.`;
  }
  const st = await focusNow();
  const t = f.tries?.date === date ? f.tries : null;
  const used = f.pass?.date === date ? f.pass.n : 0;
  return [
    `📵 Mode présent : ${st.active ? `ACTIF (${st.why})${st.until ? ` jusqu'à ${hm(st.until)}` : ''}` : `en veille — ${st.why}`}.`,
    `Règle : à la maison et hors travail, de ${f.from.replace(':', 'h')} à ${f.to.replace(':', 'h')}.`,
    t ? `Aujourd'hui : ${t.n} ouverture(s) bloquée(s) — ${Object.entries(t.apps).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ×${v}`).join(', ')}.` : 'Aujourd\'hui : aucune ouverture bloquée.',
    `Pauses : ${used}/${PASS_MAX} utilisées.`,
  ].join('\n');
}
