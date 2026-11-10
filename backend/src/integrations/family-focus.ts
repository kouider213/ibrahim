/**
 * MODE PRÉSENT (10/11/2026) — Kouider : « quand je suis à la maison à côté de ma femme, Dzaryx m'oblige à moins utiliser
 * mon téléphone, s'il faut il me coupe l'accès à des trucs : ça tue ma relation ».
 *
 * Ce que Dzaryx peut vraiment faire sur un iPhone : une automatisation Raccourcis « quand j'ouvre TikTok / Instagram / … »
 * appelle POST /api/jarvis/event { type: 'app_open', app } ; si la réponse dit block:true, le raccourci renvoie à l'écran
 * d'accueil. C'est Dzaryx qui décide : à la maison + hors travail (congé ou soirée libre), de 9h à 22h30.
 * Bonne raison (toilettes, la famille dort, quelque chose à lui montrer) = déblocage 10 min (ou jusqu'à la fin si elle dort), avec son rappel.
 * Temps d'écran : 2 h par jour pendant le mode (compté de « app ouverte » à « app fermée ») ; le blocage ne commence qu'après.
 * Sa règle (10/11) : limite du jour de son programme privé dépassée → tout est bloqué 2 h (depuis la prise en trop), sans pause ni raison.
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
  budgetMin: number;                                      // temps d'écran laissé chaque jour pendant le mode (Kouider : « au moins 2 h »)
  screen?: { date: string; sec: number; open?: { app: string; at: number } };   // compté entre « app ouverte » et « app fermée »
  medLock: boolean;                                       // sa règle : limite du programme privé dépassée → applis bloquées 2 h
  reasons?: { date: string; list: string[] };            // déblocages « bonne raison » du jour (toilettes, ils dorment, montrer quelque chose)
}
const KEY = 'family:focus';
const PASS_MAX = 3, PASS_MIN = 10;
const DEF: Focus = { enabled: true, from: '09:00', to: '22:30', budgetMin: 120, medLock: true };
const SESSION_CAP = 20 * 60, CLOSE_CAP = 60 * 60;   // ouverture sans fermeture reçue → 20 min comptées ; une session ≤ 1 h

async function read(): Promise<Focus> {
  try { return { ...DEF, ...(JSON.parse((await kvGet(KEY)) ?? '{}') as Partial<Focus>) }; } catch { return { ...DEF }; }
}
const save = (f: Focus) => kvSet(KEY, JSON.stringify(f));
const hm = (ts: number) => localNow(ts).hhmm.replace(':', 'h');

export interface FocusNow { active: boolean; why: string; until?: number; punished?: boolean }

/** Sa propre règle (10/11, durée revue le 10/11 : « je veux que la punition dure 2 h ») : plus que la limite du jour de son
 *  programme privé → applis bloquées 2 h à partir de la prise en trop. Renvoie la fin du blocage, ou null. */
const PUNISH_MS = 2 * 3600 * 1000;
async function punishedUntil(): Promise<number | null> {
  try {
    const lib = await import('./liberte.js');
    const s = await lib.getLib();
    if (!s?.active) return null;
    const today = localNow().date, allowed = lib.allowedOn(s, today), log = await lib.readLibLog();
    if (lib.takenOn(log, today) <= allowed) return null;
    // heure de la prise qui a fait passer au-dessus de la limite
    const prises = log.filter(l => l.kind === 'prise' && lib.takenOn([l], today) > 0).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    let cum = 0, at = Date.now();
    for (const l of prises) { cum += l.n ?? 1; if (cum > allowed) { at = Date.parse(l.at) || Date.now(); break; } }
    const until = at + PUNISH_MS;
    return Date.now() < until ? until : null;
  } catch { return null; }
}
// Affiché en notification sur l'iPhone (écran visible par d'autres) : aucun mot sur le programme lui-même.
const punishText = (until: number) => `Tu as dépassé ta limite aujourd'hui : applis bloquées jusqu'à ${hm(until)}. N'oublie pas — je fais tout ça pour toi. Tu vas tenir.`;
const screenOf = (f: Focus, date: string) => (f.screen?.date === date ? f.screen : { date, sec: 0 });
/** Session restée ouverte (pas de « fermée » reçu) : comptée, plafonnée. */
function settle(f: Focus, date: string, cap: number): { date: string; sec: number } {
  const s = screenOf(f, date);
  const add = s.open ? Math.min(cap, Math.max(0, (Date.now() - s.open.at) / 1000)) : 0;
  return { date, sec: Math.round(s.sec + add) };
}

export async function focusNow(): Promise<FocusNow> {
  const f = await read(), now = Date.now();
  if (!f.enabled) return { active: false, why: 'mode présent désactivé' };
  const pu = f.medLock ? await punishedUntil() : null;
  if (pu) return { active: true, why: `limite du jour dépassée — bloqué 2 h, jusqu'à ${hm(pu)}`, until: pu, punished: true };
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
  const blocked = async (say: string) => { t.n++; t.apps[name] = (t.apps[name] ?? 0) + 1; await save({ ...f, tries: t, screen: settle(f, date, SESSION_CAP) }); return { block: true, say }; };
  if (st.punished && st.until) return blocked(punishText(st.until));
  // Temps d'écran du jour : tant qu'il en reste, l'appli s'ouvre et le compteur tourne jusqu'à sa fermeture.
  const used = settle(f, date, SESSION_CAP), leftMin = Math.floor(f.budgetMin - used.sec / 60);
  if (leftMin > 0) {
    await save({ ...f, screen: { ...used, open: { app: name, at: Date.now() } } });
    return { block: false, say: leftMin <= 15 ? `Il te reste ${leftMin} min d'écran aujourd'hui.` : '' };
  }
  const left = PASS_MAX - (f.pass?.date === date ? f.pass.n : 0);
  return blocked(`Tes ${Math.round(f.budgetMin / 60 * 10) / 10} h d'écran sont utilisées. ${LINES[(t.n + 1) % LINES.length]} (${t.n + 1}e essai aujourd'hui${left > 0 ? ` — écris « pause » à Dzaryx (${left} de ${PASS_MIN} min)` : ''} — une bonne raison ? dis-la à Dzaryx)`);
}

/** Automatisation iPhone « à la fermeture de l'app » → arrête le compteur de temps d'écran. */
export async function appClose(): Promise<{ say: string }> {
  const f = await read(), date = localNow().date;
  if (f.screen?.open) await save({ ...f, screen: settle(f, date, CLOSE_CAP) });
  return { say: '' };
}

export async function focusTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'status');
  const f = await read(), now = Date.now(), date = localNow().date;
  const pu = ['pause', 'raison', 'seul', 'disable'].includes(a) && f.medLock ? await punishedUntil() : null;
  if (pu) {
    return `Non. ${punishText(pu)} Si ça ne va pas, parle-moi : je suis là.`;
  }
  if (a === 'budget') {
    const min = Math.round(Number(input['minutes']) || Number(input['hours']) * 60);
    if (!(min >= 30 && min <= 480)) return '❌ minutes entre 30 et 480 (ex. 120 = 2 h).';
    await save({ ...f, budgetMin: min });
    return `Temps d'écran : ${Math.round(min / 6) / 10} h par jour pendant le mode présent.`;
  }
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
  // 10/11 (Kouider) : avec une bonne raison il a le droit de débloquer — sans toucher aux 3 pauses — mais TOUJOURS avec son rappel.
  if (a === 'raison') {
    const why = String(input['reason'] ?? '').trim().slice(0, 80) || 'raison non précisée';
    const sleep = /dor[mst]|couch|au lit/i.test(why);
    const { hhmm } = localNow();
    const [th, tm] = f.to.split(':').map(Number), [h, m] = hhmm.split(':').map(Number);
    const until = sleep ? now + Math.max(10, (th! * 60 + tm!) - (h! * 60 + m!)) * 60_000 : now + PASS_MIN * 60_000;
    const r = f.reasons?.date === date ? f.reasons.list : [];
    await save({ ...f, pass: { date, n: f.pass?.date === date ? f.pass.n : 0, until }, reasons: { date, list: [...r, `${hhmm} ${why}`].slice(-20) } });
    return `🔓 Débloqué jusqu'à ${hm(until)} (${why}).\n⚠️ N'oublie pas : si tu mens, c'est ta relation avec ta famille que tu tues. Passe plus de temps avec eux.${r.length >= 2 ? `\nC'est ta ${r.length + 1}e raison aujourd'hui.` : ''}`;
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
    `Temps d'écran : ${Math.round(settle(f, date, SESSION_CAP).sec / 60)} min utilisées sur ${f.budgetMin} — après, les applis sont bloquées.`,
    `Pauses : ${used}/${PASS_MAX} utilisées.`,
    f.reasons?.date === date && f.reasons.list.length ? `Déblocages avec raison : ${f.reasons.list.join(' · ')}.` : '',
  ].filter(Boolean).join('\n');
}
