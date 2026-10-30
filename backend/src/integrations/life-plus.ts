import { kvJson, kvPut, ai, research, tg } from './ai-util.js';
import { localNow, localTs, getRoutineConfig } from './morning-routine.js';
import { geocode } from './departures.js';
import { supabase } from './supabase.js';

// COACH DE VIE+ (Kouider 30/10 : « rajoute tout ») — il se sert de tout ce que Dzaryx sait déjà faire :
//  1. Revue de vie du dimanche 19h (appel) : santé, famille, FIK, Liberté, moral en vrais chiffres → 3 intentions dans l'agenda
//  2. Qui je veux devenir : identités + votes trouvés seuls dans ses données (GPS, séances, réservations, Liberté, papa_time)
//  3. Coach de couple : une soirée à deux tous les 15 jours (resto halal / activité + météo), réservée dans l'agenda après son oui
//  4. Énergie : heures fortes (conscience.ts) + récupération → où mettre le dur aujourd'hui (agenda déplacé seulement après son oui)
//  5. Conseil avant une grosse décision : escouade + état du moment (fatigue, heure) + suivi à 30 jours
//  + corrélations (ce qui fait ses bons jours), courbe du dimanche, eau, rapport santé du mois (PDF), surentraînement, prières.

type Kind = 'pere' | 'forme' | 'business' | 'libre' | 'autre';
interface Identity { name: string; kind: Kind; image?: string }
interface Decision { id: string; at: number; text: string; advice: string; followAt: string; verdict?: string }
interface Couple { last?: string; next?: { date: string; time: string; place: string; eventId?: string } ; proposedAt?: string }

const ID_KEY = 'life:identities', VOTES_KEY = 'life:votes', MANUAL_KEY = 'life:manual-votes', INTENT_KEY = 'life:intentions';
const DEC_KEY = 'life:decisions', COUPLE_KEY = 'life:couple', PRAYER_KEY = 'life:prayer';
const sent = (k: string) => `life:sent:${k}`;
async function once(k: string, ttl = 2 * 86_400): Promise<boolean> {
  if (await kvJson<string | null>(sent(k), null)) return false;
  await kvPut(sent(k), '1', ttl);
  return true;
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fmtD = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const BARS = '▁▂▃▄▅▆▇█';
const spark = (v: number[], max = 100) => v.map(x => BARS[Math.max(0, Math.min(7, Math.round(x / max * 7)))]).join('');
const kindOf = (n: string): Kind => /p[eè]re|papa|famille|mari|[ée]poux|fils/i.test(n) ? 'pere' : /forme|sport|sant[ée]|athl|muscl/i.test(n) ? 'forme'
  : /business|entrepreneur|patron|ind[ée]pendant|riche|homme d.affaires|fik/i.test(n) ? 'business' : /libre|libert|sobre|clair/i.test(n) ? 'libre' : 'autre';
const DEFAULT_IDS = ['Un père présent', 'Un homme en forme', 'Un vrai businessman', 'Un homme libre'];

export async function identities(): Promise<Identity[]> {
  const l = await kvJson<Identity[] | null>(ID_KEY, null);
  if (l) return l;
  const d = DEFAULT_IDS.map(name => ({ name, kind: kindOf(name) }));
  await kvPut(ID_KEY, d);
  return d;
}

// ── Données de la journée ────────────────────────────────────────────────────

/** Heures à la maison le soir (17h-22h30) d'après les visites GPS. */
async function homeEveningH(date: string): Promise<number> {
  const vs = await kvJson<Array<{ from: number; to: number; place?: string }>>('gps:visits', []);
  const a = localTs(date, '17:00'), b = localTs(date, '22:30');
  return vs.filter(v => v.place === 'home').reduce((s, v) => s + Math.max(0, Math.min(v.to, b) - Math.max(v.from, a)), 0) / 3600_000;
}
async function dayFacts(date: string) {
  const [sport, watch, health, kid, lib, home] = await Promise.all([
    import('./sport-coach.js').then(m => m.readSportLog()).catch(() => []),
    import('./workout-live.js').then(m => m.readWorkouts()).catch(() => []),
    kvJson<Array<{ date: string; steps?: number }>>('health:daily', []),
    kvJson<Array<{ date: string; kind: string; minutes: number; what: string }>>('kouider:kid:log', []),
    import('./liberte.js').then(async m => { const s = await m.getLib(); if (!s?.active || date < s.start) return null; const log = await m.readLibLog(); return { taken: m.takenOn(log, date), allowed: m.allowedOn(s, date), logged: log.some(l => l.at.slice(0, 10) === date) }; }).catch(() => null),
    homeEveningH(date).catch(() => 0),
  ]);
  const dayStart = new Date(localTs(date, '00:00')).toISOString(), dayEnd = new Date(localTs(addDays(date, 1), '00:00')).toISOString();
  const [{ data: books }, { data: pros }] = await Promise.all([
    supabase.from('bookings').select('id, client_name, final_price').gte('created_at', dayStart).lt('created_at', dayEnd).then(r => r, () => ({ data: null })),
    supabase.from('prospects').select('id').gte('created_at', dayStart).lt('created_at', dayEnd).then(r => r, () => ({ data: null })),
  ]);
  const w = watch.filter(x => x.at.slice(0, 10) === date);
  return {
    session: sport.some(l => l.date === date) || w.length > 0, workouts: w,
    zone2: w.reduce((a, x) => a + (x.zones?.[1] ?? 0), 0), kcal: w.reduce((a, x) => a + (x.kcal ?? 0), 0),
    steps: health.find(h => h.date === date)?.steps ?? 0,
    kid: kid.filter(k => k.date === date && k.kind !== 'maman'), home,
    bookings: (books ?? []) as Array<{ client_name?: string; final_price?: number }>, prospects: (pros ?? []).length,
    libre: lib,
  };
}

/** Les votes du jour pour chaque identité (trouvés seuls, sans qu'il note rien). */
export async function votesFor(date: string): Promise<Record<string, string[]>> {
  const [ids, f, manual] = await Promise.all([identities(), dayFacts(date), kvJson<Record<string, Record<string, string[]>>>(MANUAL_KEY, {})]);
  const out: Record<string, string[]> = {};
  for (const id of ids) {
    const v: string[] = [...(manual[date]?.[id.name] ?? [])];
    if (id.kind === 'pere') {
      if (f.home >= 2) v.push(`${f.home.toFixed(1).replace('.', ',')} h à la maison le soir`);
      for (const k of f.kid.slice(0, 2)) v.push(`${k.what || 'moment avec ton fils'} (${k.minutes} min)`);
    } else if (id.kind === 'forme') {
      if (f.session) v.push(f.workouts[0] ? `séance ${f.workouts.map(w => w.type).join(' + ')}` : 'séance de sport');
      if (f.steps >= 10_000) v.push(`${f.steps.toLocaleString('fr-FR')} pas`);
    } else if (id.kind === 'business') {
      for (const b of f.bookings.slice(0, 3)) v.push(`réservation ${b.client_name ?? ''}`.trim());
      if (f.prospects) v.push(`${f.prospects} prospect${f.prospects > 1 ? 's' : ''} ajouté${f.prospects > 1 ? 's' : ''}`);
    } else if (id.kind === 'libre') {
      if (f.libre && f.libre.logged && f.libre.taken <= f.libre.allowed) v.push('journée dans ton plan');
    }
    out[id.name] = v;
  }
  return out;
}

// ── 1. Corrélations : ce qui fait ses bons jours ─────────────────────────────

export async function correlations(): Promise<string> {
  const [rs, lib, watch, sport] = await Promise.all([
    import('./workout-live.js').then(m => m.readinessSeries()).catch(() => []),
    import('./liberte.js').then(m => m.readLibLog()).catch(() => []),
    import('./workout-live.js').then(m => m.readWorkouts()).catch(() => []),
    import('./sport-coach.js').then(m => m.readSportLog()).catch(() => []),
  ]);
  const ready = new Map(rs.map(r => [r.date, r.score]));
  const mood = new Map<string, number>();
  for (const l of lib) if (l.kind === 'humeur' && l.score) mood.set(l.at.slice(0, 10), l.score * 10);
  const z2 = new Map<string, number>(), trained = new Set(sport.map(s => s.date));
  for (const w of watch) { const d = w.at.slice(0, 10); z2.set(d, (z2.get(d) ?? 0) + (w.zones?.[1] ?? 0)); trained.add(d); }
  const health = await kvJson<Array<{ date: string; steps?: number }>>('health:daily', []);
  const steps = new Map(health.map(h => [h.date, h.steps ?? 0]));
  const days = [...new Set([...ready.keys(), ...mood.keys()])].sort();
  if (days.length < 14) return `🔬 Corrélations : il me faut au moins 14 jours de données (j'en ai ${days.length}). Je te dis ce qui fait tes bons jours dès que j'en ai assez.`;
  const tests: Array<{ cause: string; yes: (d: string) => boolean; effect: string; val: Map<string, number> }> = [
    { cause: 'les jours où tu t\'entraînes', yes: d => trained.has(d), effect: 'ta récupération le lendemain', val: ready },
    { cause: 'les jours avec 30 min+ en zone 2', yes: d => (z2.get(d) ?? 0) >= 30, effect: 'ton moral le lendemain', val: mood },
    { cause: 'les jours à 10 000 pas', yes: d => (steps.get(d) ?? 0) >= 10_000, effect: 'ton moral le lendemain', val: mood },
    { cause: 'les jours où tu t\'entraînes', yes: d => trained.has(d), effect: 'ton moral le lendemain', val: mood },
    { cause: 'les jours à 10 000 pas', yes: d => (steps.get(d) ?? 0) >= 10_000, effect: 'ta récupération le lendemain', val: ready },
  ];
  const found: string[] = [];
  for (const t of tests) {
    const a: number[] = [], b: number[] = [];
    for (const d of days) { const next = t.val.get(addDays(d, 1)); if (next == null) continue; (t.yes(d) ? a : b).push(next); }
    if (a.length < 4 || b.length < 4) continue;
    const m = (x: number[]) => x.reduce((s, y) => s + y, 0) / x.length, diff = m(a) - m(b);
    if (Math.abs(diff) >= 6) found.push(`• Après ${t.cause}, ${t.effect} est ${diff > 0 ? 'meilleur' : 'moins bon'} de ${Math.round(Math.abs(diff))} points (${a.length} jours contre ${b.length}).`);
  }
  return found.length ? `🔬 Ce qui fait tes bons jours (${days.length} jours analysés) :\n${found.join('\n')}` : `🔬 ${days.length} jours analysés : pas encore de lien net entre ton sport, tes pas, ta récupération et ton moral. Je continue de regarder.`;
}

// ── 2. Courbe du dimanche ────────────────────────────────────────────────────

export async function weekCurve(): Promise<string> {
  const today = localNow().date;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const [rs, watch, sport] = await Promise.all([
    import('./workout-live.js').then(m => m.readinessSeries()).catch(() => []),
    import('./workout-live.js').then(m => m.readWorkouts()).catch(() => []),
    import('./sport-coach.js').then(m => m.readSportLog()).catch(() => []),
  ]);
  const r = days.map(d => rs.find(x => x.date === d)?.score ?? 0);
  const load = days.map(d => watch.filter(w => w.at.slice(0, 10) === d).reduce((a, w) => a + (w.load ?? w.min * 2), 0) || (sport.some(s => s.date === d) ? 60 : 0));
  const lmax = Math.max(60, ...load);
  const lbl = days.map(d => 'DLMMJVS'[new Date(`${d}T12:00:00Z`).getUTCDay()]).join('');
  const has = r.filter(Boolean);
  const loadL = await import('./workout-live.js').then(m => m.loadLine()).catch(() => '');
  return [`📊 Ta semaine (${lbl})`, `🔋 Récupération ${spark(r)}${has.length ? ` moyenne ${Math.round(has.reduce((a, b) => a + b, 0) / has.length)}/100` : ' (pas de données montre)'}`,
    `🏋️ Charge       ${spark(load, lmax)} ${load.filter(Boolean).length} jour${load.filter(Boolean).length > 1 ? 's' : ''} d'entraînement`, loadL].filter(Boolean).join('\n');
}

// ── 1 (coach). Revue de vie du dimanche ──────────────────────────────────────

async function weekFacts(): Promise<string> {
  const today = localNow().date;
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const facts = await Promise.all(days.map(d => dayFacts(d).catch(() => null)));
  const ok = facts.filter(Boolean) as Array<Awaited<ReturnType<typeof dayFacts>>>;
  const sessions = ok.filter(f => f.session).length, kcal = ok.reduce((a, f) => a + f.kcal, 0);
  const home = ok.reduce((a, f) => a + f.home, 0), kid = ok.reduce((a, f) => a + f.kid.length, 0);
  const books = ok.flatMap(f => f.bookings), ca = books.reduce((a, b) => a + (Number(b.final_price) || 0), 0);
  const lib = ok.filter(f => f.libre?.logged);
  const libOk = lib.filter(f => f.libre!.taken <= f.libre!.allowed).length;
  const rs = await import('./workout-live.js').then(m => m.readinessSeries()).catch(() => []);
  const rw = rs.filter(r => r.date >= days[0]!).map(r => r.score);
  const mood = (await import('./liberte.js').then(m => m.readLibLog()).catch(() => [])).filter(l => l.kind === 'humeur' && l.score && l.at.slice(0, 10) >= days[0]!).map(l => l.score!);
  const intents = await kvJson<{ week: string; items: Array<{ text: string; done?: boolean }> } | null>(INTENT_KEY, null);
  return [
    `Santé : ${sessions} séance${sessions > 1 ? 's' : ''}${kcal ? `, ${kcal} calories à la salle` : ''}${rw.length ? `, récupération moyenne ${Math.round(rw.reduce((a, b) => a + b, 0) / rw.length)} sur 100` : ''}.`,
    `Famille : ${home.toFixed(0)} heures à la maison le soir${kid ? `, ${kid} moment${kid > 1 ? 's' : ''} noté${kid > 1 ? 's' : ''} avec ton fils` : ''}.`,
    `FIK : ${books.length} nouvelle${books.length > 1 ? 's' : ''} réservation${books.length > 1 ? 's' : ''}${ca ? ` pour ${Math.round(ca)} euros` : ''}.`,
    ...(lib.length ? [`Liberté : ${libOk} jour${libOk > 1 ? 's' : ''} sur ${lib.length} dans ton plan.`] : []),
    ...(mood.length ? [`Moral moyen : ${(mood.reduce((a, b) => a + b, 0) / mood.length).toFixed(1).replace('.', ',')} sur 10.`] : []),
    ...(intents?.items.length ? [`Tes intentions de la semaine : ${intents.items.map(i => `${i.text}${i.done ? ' (fait)' : ''}`).join(' ; ')}.`] : []),
  ].join(' ');
}

async function sundayReview(): Promise<void> {
  const facts = await weekFacts();
  const [curve, corr] = await Promise.all([weekCurve().catch(() => ''), correlations().catch(() => '')]);
  await kvPut('life:revue:pending', { at: Date.now() }, 2 * 86_400);
  await tg(`🧭 REVUE DE VIE — semaine du ${fmtD(addDays(localNow().date, -6))}\n${facts}\n\n${curve}\n\n${corr}\n\nJe t'appelle pour en parler 15 min : on choisit tes 3 intentions de la semaine.`);
  const { callOwner } = await import('../notifications/voice-call.js');
  await callOwner(`Kouider, c'est Dzaryx, c'est l'heure de ta revue de vie de la semaine. ${facts} Qu'est-ce qui t'a rendu fier cette semaine, et qu'est-ce que tu veux changer ? Donne-moi tes 3 intentions pour la semaine qui vient, je les mets dans ton agenda.`).catch(() => null);
}

async function setIntentions(items: string[]): Promise<string> {
  const list = items.map(s => s.trim()).filter(Boolean).slice(0, 5);
  if (!list.length) return '❌ items = ses intentions (1 à 5 phrases courtes).';
  const today = localNow().date;
  await kvPut(INTENT_KEY, { week: today, items: list.map(text => ({ text })) });
  await kvPut('life:revue:pending', null, 1);
  // Rappel discret chaque matin (mardi, jeudi) + bilan le dimanche suivant
  const { createAgendaEvent } = await import('./google-calendar.js');
  for (const [i, d] of [2, 4].map(n => addDays(today, n)).entries()) {
    await createAgendaEvent(`🧭 Mes intentions (${i + 1}/2)`, `${d}T08:00:00`, `${d}T08:10:00`, list.map((t, k) => `${k + 1}. ${t}`).join('\n'), false).catch(() => null);
  }
  return `✅ Tes intentions de la semaine :\n${list.map((t, k) => `${k + 1}. ${t}`).join('\n')}\nRappel dans ton agenda mardi et jeudi à 8h, bilan dimanche à la revue.`;
}

// ── 3. Coach de couple ───────────────────────────────────────────────────────

async function proposeCouple(): Promise<string> {
  const cfg = await getRoutineConfig();
  const home = await geocode(cfg.addresses.home).catch(() => null);
  const today = localNow().date;
  const sat = addDays(today, (6 - localNow().weekday + 7) % 7 || 7);
  const txt = await research(`Kouider (musulman, mange halal, vit près de ${cfg.addresses.home}${home ? ` (${home.lat.toFixed(3)}, ${home.lng.toFixed(3)})` : ''}, Bruxelles) veut une soirée à deux avec sa femme le ${fmtD(sat)}. Cherche 2 idées concrètes à moins de 25 min : 1 restaurant HALAL bien noté (nom, adresse, fourchette de prix, pourquoi c'est bien pour un couple) et 1 activité (balade, expo, cinéma, dessert…), en tenant compte de la météo prévue ce soir-là. Termine par l'heure conseillée. Réponse courte, en français, sans mentionner d'alcool.`, { rounds: 5, max: 900 }).catch(() => '');
  if (!txt) return '❌ Recherche impossible pour le moment.';
  await kvPut(COUPLE_KEY, { ...(await kvJson<Couple>(COUPLE_KEY, {})), proposedAt: today });
  const { createDecision } = await import('./conscience.js');
  await createDecision(`💑 Soirée à deux ${fmtD(sat)} ?\n${txt.slice(0, 450)}`, [
    { label: 'Oui, réserve le créneau', tool: 'vie', input: { action: 'couple', op: 'book', date: sat } },
    { label: 'Pas cette semaine', tool: 'vie', input: { action: 'couple', op: 'skip' } },
  ]).catch(() => {});
  return `💑 Idée pour ${fmtD(sat)} :\n${txt}`;
}

async function bookCouple(date: string, time = '19:30', place = 'Soirée à deux'): Promise<string> {
  const { createAgendaEvent } = await import('./google-calendar.js');
  const end = `${String(Math.min(23, Number(time.slice(0, 2)) + 3)).padStart(2, '0')}:${time.slice(3, 5)}`;
  const id = await createAgendaEvent(`💑 ${place}`, `${date}T${time}:00`, `${date}T${end}:00`, 'Soirée à deux. Téléphone en silencieux : Dzaryx garde les clients (bouclier famille).', false).catch(() => null);
  await kvPut(COUPLE_KEY, { last: date, next: { date, time, place, ...(id ? { eventId: id } : {}) } });
  return `✅ ${place} le ${fmtD(date)} à ${time.replace(':', 'h')} dans ton agenda.${id ? '' : ' (agenda injoignable : pas écrit dedans)'} Je te rappelle 2 jours avant de prévoir la garde d'Ibrahim, et le jour même je t'envoie l'itinéraire. C'est toi qui proposes à ta femme : je ne la contacte jamais.`;
}

// ── 5. Conseil avant une grosse décision ─────────────────────────────────────

async function decide(text: string): Promise<string> {
  const now = localNow();
  const r = await import('./workout-live.js').then(m => m.readiness()).catch(() => null);
  const mood = await kvJson<{ at: number; stress: number; energy: number } | null>('mood:now', null);
  const tired = (r && r.score < 34) || (mood && Date.now() - mood.at < 4 * 3600_000 && (mood.stress >= 7 || mood.energy <= 3)) || now.hhmm >= '22:00' || now.hhmm < '06:00';
  const advice = await research(`Kouider (loueur de voitures FIK à Oran / Bruxelles, entrepreneur, famille) envisage cette décision : « ${text} ». Fais le conseil avant décision : 1) les chiffres (coût, gain possible, délai pour rentrer dans ses frais — utilise ses vraies données si c'est lié à FIK : voitures, réservations, finances), 2) les 3 risques principaux, 3) pour / contre, 4) ce qu'il faudrait vérifier avant, 5) ton avis franc en une phrase. Court et concret.`, { rounds: 6, max: 1200 }).catch(() => '');
  const d: Decision = { id: Math.random().toString(36).slice(2, 7), at: Date.now(), text: text.slice(0, 300), advice: advice.slice(0, 1500), followAt: addDays(now.date, 30) };
  const list = await kvJson<Decision[]>(DEC_KEY, []);
  list.push(d);
  await kvPut(DEC_KEY, list.slice(-60));
  return `🛑 CONSEIL AVANT DÉCISION — « ${d.text} »\n${tired ? `⚠️ ${now.hhmm >= '22:00' || now.hhmm < '06:00' ? 'Il est tard' : 'Tu es fatigué ou tendu en ce moment'} : ne décide pas maintenant, dors dessus et on en reparle demain matin.\n` : ''}\n${advice || 'Analyse indisponible pour le moment.'}\n\n📅 Je te redemande le ${fmtD(d.followAt)} si c'était le bon choix. (Pour aller plus loin : l'escouade d'agents peut creuser chaque piste.)`;
}

// ── B. Eau ───────────────────────────────────────────────────────────────────

export async function waterLine(date = localNow().date): Promise<string> {
  const p = await import('./forme.js').then(f => f.getFormeProfile('kouider')).catch(() => null);
  const kg = p?.weightKg ?? 90;
  const kcal = (await import('./workout-live.js').then(m => m.readWorkouts()).catch(() => [])).filter(w => w.at.slice(0, 10) === date).reduce((a, w) => a + (w.kcal ?? 0), 0);
  let temp = 0;
  try {
    const cfg = await getRoutineConfig(), h = await geocode(cfg.addresses.home);
    if (h) { const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${h.lat}&longitude=${h.lng}&daily=temperature_2m_max&timezone=Europe%2FBrussels&forecast_days=1`, { signal: AbortSignal.timeout(6000) }); temp = ((await r.json()) as { daily?: { temperature_2m_max?: number[] } }).daily?.temperature_2m_max?.[0] ?? 0; }
  } catch { /* météo facultative */ }
  const l = Math.round((kg * 0.033 + (kcal ? kcal / 400 * 0.5 : 0) + (temp >= 25 ? 0.5 : 0)) * 10) / 10;
  return `💧 Eau aujourd'hui : ${String(l).replace('.', ',')} L${kcal ? ` (dont ${String(Math.round(kcal / 400 * 5) / 10).replace('.', ',')} L pour tes ${kcal} kcal de sport)` : ''}${temp >= 25 ? ' (+0,5 L, il fait chaud)' : ''} — soit ~${Math.round(l / 0.25)} verres.`;
}

// ── C. Rapport santé du mois (PDF) ───────────────────────────────────────────

async function monthReport(month?: string): Promise<string> {
  const m = month ?? addDays(`${localNow().date.slice(0, 7)}-01`, -1).slice(0, 7);
  const health = (await kvJson<Array<{ date: string; steps?: number; rhr?: number; hrv?: number; weight?: number; active_kcal?: number }>>('health:daily', [])).filter(h => h.date.startsWith(m));
  const watch = (await import('./workout-live.js').then(x => x.readWorkouts()).catch(() => [])).filter(w => w.at.startsWith(m));
  const sport = (await import('./sport-coach.js').then(x => x.readSportLog()).catch(() => [])).filter(s => s.date.startsWith(m));
  const rs = (await import('./workout-live.js').then(x => x.readinessSeries()).catch(() => [])).filter(r => r.date.startsWith(m));
  const avg = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  const nz = (k: 'steps' | 'rhr' | 'hrv' | 'active_kcal') => health.map(h => Number(h[k] ?? 0)).filter(Boolean);
  const ws = health.map(h => h.weight).filter((x): x is number => !!x);
  const lines: Array<[string, string]> = [
    ['Jours de données montre', String(health.length)],
    ['Pas par jour (moyenne)', nz('steps').length ? Math.round(avg(nz('steps'))).toLocaleString('fr-FR') : '—'],
    ['Cœur au repos (moyenne)', nz('rhr').length ? `${Math.round(avg(nz('rhr')))} bpm (min ${Math.min(...nz('rhr'))}, max ${Math.max(...nz('rhr'))})` : '—'],
    ['Variabilité cardiaque (VFC)', nz('hrv').length ? `${Math.round(avg(nz('hrv')))} ms` : '—'],
    ['Récupération moyenne', rs.length ? `${Math.round(avg(rs.map(r => r.score)))}/100` : '—'],
    ['Séances de sport', String(new Set([...sport.map(s => s.date), ...watch.map(w => w.at.slice(0, 10))]).size)],
    ['Entraînements montre', watch.length ? `${watch.length} (${watch.reduce((a, w) => a + w.min, 0)} min, ${watch.reduce((a, w) => a + (w.kcal ?? 0), 0)} kcal)` : '—'],
    ['Minutes en zone 2', watch.length ? String(watch.reduce((a, w) => a + (w.zones?.[1] ?? 0), 0)) : '—'],
    ['Cœur max en séance', watch.some(w => w.hrMax) ? `${Math.max(...watch.map(w => w.hrMax ?? 0))} bpm` : '—'],
    ['Poids', ws.length >= 2 ? `${ws[0]} → ${ws[ws.length - 1]} kg` : ws.length ? `${ws[0]} kg` : '—'],
  ];
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(res => doc.on('end', () => res(Buffer.concat(chunks))));
  const title = new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  doc.fontSize(20).fillColor('#0B3D91').text(`Rapport santé — ${title}`).moveDown(0.3);
  doc.fontSize(10).fillColor('#666').text('Kouider · données Apple Watch / Santé iPhone + séances notées par Dzaryx').moveDown(1);
  for (const [k, v] of lines) { doc.fontSize(12).fillColor('#222').text(`${k} : `, { continued: true }).fillColor('#0B3D91').text(v); doc.moveDown(0.3); }
  doc.moveDown(1).fontSize(9).fillColor('#888').text('Valeurs mesurées par la montre ; le sommeil n\'est pas mesuré (montre retirée la nuit). Document informatif, pas un avis médical.');
  doc.end();
  const pdf = await done;
  const { queueTelegramFile } = await import('../actions/handlers/nexus-relay.js');
  await queueTelegramFile(pdf.toString('base64'), `Rapport-sante-${m}.pdf`, `🩺 Ton rapport santé de ${title} (à montrer à ton médecin si tu veux).`);
  return `✅ Rapport santé de ${title} envoyé en PDF sur Telegram.`;
}

// ── D. Surentraînement ───────────────────────────────────────────────────────

async function overtrainingCheck(): Promise<void> {
  const rs = await import('./workout-live.js').then(m => m.readinessSeries()).catch(() => []);
  const last3 = rs.slice(-3);
  if (last3.length < 3 || !last3.every(r => r.score < 40) || last3.at(-1)!.date < addDays(localNow().date, -1)) return;
  const log = await import('./workout-live.js').then(m => m.readWorkouts()).catch(() => []);
  const t = Date.now(), sum = (d: number) => log.filter(w => t - Date.parse(w.end) < d * 86_400_000).reduce((a, w) => a + (w.load ?? w.min * 2), 0);
  const ratio = sum(28) ? sum(7) / (sum(28) / 4) : 0;
  const sessions = (await import('./sport-coach.js').then(m => m.readSportLog()).catch(() => [])).filter(s => s.date >= addDays(localNow().date, -6)).length;
  if (ratio < 1.3 && sessions < 5) return;
  if (!(await once(`overtrain:${localNow().date.slice(0, 8)}`, 7 * 86_400))) return;
  const r = await import('./sport-coach.js').then(m => m.sportCoachTool({ action: 'deload', mode: 'on', reason: 'récupération basse 3 jours' })).catch(() => '');
  await tg(`⚠️ Surentraînement : ta récupération est sous 40/100 depuis 3 jours (${last3.map(x => x.score).join(', ')}) et ta charge est haute${ratio ? ` (${ratio.toFixed(1).replace('.', ',')} × ta moyenne)` : ` (${sessions} séances en 7 jours)`}.\n${r || 'Semaine allégée à activer.'}\nDis « annule la semaine allégée » si tu te sens bien.`);
}

// ── 6. Prières ───────────────────────────────────────────────────────────────

async function prayerTimes(date: string): Promise<Record<string, string> | null> {
  const oran = await import('./gps-life.js').then(m => m.oranActive()).catch(() => null);
  const [y, mo, d] = date.split('-');
  try {
    const r = await fetch(`https://api.aladhan.com/v1/timingsByCity/${d}-${mo}-${y}?city=${oran ? 'Oran' : 'Brussels'}&country=${oran ? 'Algeria' : 'Belgium'}&method=3`, { signal: AbortSignal.timeout(8000) });
    const t = ((await r.json()) as { data?: { timings?: Record<string, string> } }).data?.timings;
    return t ? { Fajr: t['Fajr']!, Dhuhr: t['Dhuhr']!, Asr: t['Asr']!, Maghrib: t['Maghrib']!, Isha: t['Isha']! } : null;
  } catch { return null; }
}
const PR_FR: Record<string, string> = { Fajr: 'Fajr', Dhuhr: 'Dohr', Asr: 'Asr', Maghrib: 'Maghreb', Isha: 'Icha' };
export async function prayerLine(date = localNow().date): Promise<string> {
  const p = await kvJson<{ on?: boolean; remind?: boolean }>(PRAYER_KEY, { on: true });
  if (p.on === false) return '';
  const t = await prayerTimes(date);
  return t ? `🕌 Prières : ${Object.entries(t).map(([k, v]) => `${PR_FR[k]} ${v.slice(0, 5)}`).join(' · ')}` : '';
}
async function prayerReminders(): Promise<void> {
  const p = await kvJson<{ on?: boolean; remind?: boolean }>(PRAYER_KEY, { on: true });
  if (!p.remind || p.on === false) return;
  const { date, hhmm } = localNow();
  const t = await prayerTimes(date);
  if (!t) return;
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  for (const [k, v] of Object.entries(t)) {
    const d = toMin(v) - toMin(hhmm);
    if (d >= 0 && d <= 15 && await once(`prayer:${date}:${k}`)) await tg(`🕌 ${PR_FR[k]} à ${v.slice(0, 5)}${d ? ` (dans ${d} min)` : ''}.`);
  }
}

// ── Tâche (toutes les 15 min) ────────────────────────────────────────────────

export async function jobLifePlus(): Promise<void> {
  const { date, hhmm, weekday } = localNow();
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const at = (h: string) => { const d = toMin(hhmm) - toMin(h); return d >= 0 && d < 15; };
  const run = async (k: string, f: () => Promise<unknown>) => { if (await once(`${k}:${date}`)) await f().catch(e => console.error(`[life-plus] ${k}:`, e instanceof Error ? e.message : e)); };
  await prayerReminders().catch(() => {});
  if (at('07:45')) await run('overtrain-check', overtrainingCheck);
  if (at('11:30')) await run('water-1', async () => tg(`${await waterLine()}\nOù tu en es ? Un grand verre maintenant.`));
  if (at('15:30')) await run('water-2', async () => tg('💧 Mi-journée : tu as bu combien ? Il te reste ~1 L à boire avant ce soir.'));
  if (hhmm >= '21:00' && hhmm < '21:15') await run('votes', eveningVotes);
  if (weekday === 0 && hhmm >= '19:00' && hhmm < '19:15') await run('revue', sundayReview);
  if (weekday === 0 && hhmm >= '20:30' && hhmm < '20:45') await run('revue-relance', async () => {
    if (await kvJson<{ at: number } | null>('life:revue:pending', null)) await tg('🧭 On n\'a pas encore noté tes 3 intentions de la semaine. Écris-les-moi ici (une par ligne), je les mets dans ton agenda.');
  });
  // Couple : proposition le mercredi midi, une semaine sur deux (15 jours depuis la dernière soirée / proposition)
  if (weekday === 3 && hhmm >= '12:00' && hhmm < '12:15') await run('couple', async () => {
    const c = await kvJson<Couple>(COUPLE_KEY, {});
    const last = [c.last, c.proposedAt].filter(Boolean).sort().at(-1);
    if (!last || last <= addDays(date, -13)) await tg(await proposeCouple());
  });
  const c = await kvJson<Couple>(COUPLE_KEY, {});
  if (c.next && hhmm >= '10:00' && hhmm < '10:15') {
    if (c.next.date === addDays(date, 2)) await run('couple-garde', async () => tg(`💑 Samedi ${c.next!.time.replace(':', 'h')} : ta soirée à deux. Pense à trouver quelqu'un pour garder Ibrahim.`));
    if (c.next.date === date) await run('couple-jour', async () => {
      const g = await geocode(c.next!.place).catch(() => null);
      await tg(`💑 Ce soir ${c.next!.time.replace(':', 'h')} : ${c.next!.place}. Téléphone en silencieux, je garde les clients.${g ? `\n🧭 Waze : https://waze.com/ul?ll=${g.lat},${g.lng}&navigate=yes` : ''}`);
    });
  }
  if (hhmm >= '10:00' && hhmm < '10:15') await run('decisions-suivi', async () => {
    const list = await kvJson<Decision[]>(DEC_KEY, []);
    for (const d of list.filter(x => !x.verdict && x.followAt === date)) await tg(`🛑 Il y a 30 jours tu pensais à : « ${d.text} ». Avec le recul, c'était le bon choix ? (réponds-moi, je le note pour tes prochaines décisions)`);
  });
  if (date.endsWith('-01') && hhmm >= '10:00' && hhmm < '10:15') await run('rapport-mois', () => monthReport());
}

async function eveningVotes(): Promise<void> {
  const date = localNow().date;
  const v = await votesFor(date);
  const all = await kvJson<Record<string, Record<string, string[]>>>(VOTES_KEY, {});
  all[date] = v;
  for (const k of Object.keys(all)) if (k < addDays(date, -90)) delete all[k];
  await kvPut(VOTES_KEY, all);
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  const lines = Object.entries(v).map(([name, list]) => {
    const w = week.reduce((a, d) => a + (all[d]?.[name]?.length ?? 0), 0);
    return `${list.length ? '✅'.repeat(Math.min(3, list.length)) : '▫️'} ${name}${list.length ? ` — ${list.join(', ')}` : ' — pas de vote aujourd\'hui'} (semaine : ${w})`;
  });
  const weakest = Object.entries(v).find(([, l]) => !l.length)?.[0];
  const idea = weakest ? await ai(`Propose UNE micro-action très concrète pour demain (moins de 15 min) qui serait un « vote » pour l'identité « ${weakest} » de Kouider (père d'un garçon de 1 an et demi, loueur de voitures FIK, sport le matin). Une phrase, tutoiement, pas de nutrition.`, { max: 80 }).catch(() => '') : '';
  await tg(`🗳️ Tes votes du jour — chaque action est une voix pour qui tu deviens :\n${lines.join('\n')}${idea ? `\n\n➡️ Demain : ${idea.trim()}` : ''}`);
}

// ── Pour l'app et le cerveau ─────────────────────────────────────────────────

export async function lifeOverview() {
  const date = localNow().date;
  const [ids, votes, intents, decisions, couple, prayer, water, r, curve] = await Promise.all([
    identities(), kvJson<Record<string, Record<string, string[]>>>(VOTES_KEY, {}), kvJson<{ week: string; items: Array<{ text: string; done?: boolean }> } | null>(INTENT_KEY, null),
    kvJson<Decision[]>(DEC_KEY, []), kvJson<Couple>(COUPLE_KEY, {}), prayerLine(date).catch(() => ''), waterLine(date).catch(() => ''),
    import('./workout-live.js').then(m => m.readiness()).catch(() => null), weekCurve().catch(() => ''),
  ]);
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  const today = votes[date] ?? await votesFor(date).catch(() => ({} as Record<string, string[]>));
  return {
    identities: ids.map(i => ({ ...i, today: today[i.name] ?? [], week: week.reduce((a, d) => a + ((d === date ? today : votes[d])?.[i.name]?.length ?? 0), 0) })),
    intentions: intents?.items ?? [], decisions: decisions.slice(-5).reverse(), couple: couple.next ?? null,
    prayer, water, readiness: r?.line ?? '', curve,
  };
}

export async function lifeText(): Promise<string> {
  const [pending, intents] = await Promise.all([kvJson<{ at: number } | null>('life:revue:pending', null), kvJson<{ items: Array<{ text: string }> } | null>(INTENT_KEY, null)]);
  return [
    pending ? 'REVUE DE VIE EN COURS (dimanche) : quand il donne ses intentions de la semaine → outil vie action intentions items=[…] (une par intention).' : '',
    intents?.items.length ? `Ses intentions de la semaine : ${intents.items.map(i => i.text).join(' ; ')}.` : '',
  ].filter(Boolean).join('\n');
}

export async function lifeTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'status');
  const list = (k: string) => Array.isArray(input[k]) ? (input[k] as unknown[]).map(String) : String(input[k] ?? '').split(/\n|;/).map(s => s.trim()).filter(Boolean);
  switch (a) {
    case 'status': {
      const o = await lifeOverview();
      return [o.readiness, ...o.identities.map(i => `• ${i.name} : ${i.today.length} vote(s) aujourd'hui, ${i.week} cette semaine`), o.intentions.length ? `🧭 Intentions : ${o.intentions.map(i => i.text).join(' ; ')}` : '', o.couple ? `💑 Prochaine soirée : ${fmtD(o.couple.date)} ${o.couple.time}` : '', o.water, o.prayer].filter(Boolean).join('\n');
    }
    case 'identites': {
      const names = list('items').slice(0, 5);
      if (!names.length) return `Identités actuelles : ${(await identities()).map(i => i.name).join(', ')}. Pour changer : items = ses 3-5 phrases « Un père présent »…`;
      const ids: Identity[] = names.map(name => ({ name, kind: kindOf(name), image: `https://image.pollinations.ai/prompt/${encodeURIComponent(`cinematic inspiring photo, ${name}, modern muslim man in his thirties, warm light, realistic`)}?width=768&height=512&nologo=true` }));
      await kvPut(ID_KEY, ids);
      const { queueTelegramAlbum } = await import('../notifications/tg-outbox.js');
      await queueTelegramAlbum(`🗳️ Tes identités : ${names.join(' · ')}`, ids.map(i => i.image!)).catch(() => {});
      return `✅ Identités enregistrées : ${names.join(', ')}. Chaque soir à 21h je compte tes « votes » trouvés dans tes données (GPS, séances, réservations…). Images de ta vision envoyées sur Telegram et dans l'app (JARVIS › Vie).`;
    }
    case 'vote': {
      const name = String(input['identity'] ?? ''), what = String(input['text'] ?? '').slice(0, 80);
      const id = (await identities()).find(i => i.name.toLowerCase().includes(name.toLowerCase()) || kindOf(name) === i.kind);
      if (!id || !what) return '❌ identity + text (ce qu\'il a fait).';
      const m = await kvJson<Record<string, Record<string, string[]>>>(MANUAL_KEY, {});
      const d = localNow().date;
      ((m[d] ??= {})[id.name] ??= []).push(what);
      await kvPut(MANUAL_KEY, m);
      return `✅ Vote pour « ${id.name} » : ${what}.`;
    }
    case 'votes': return Object.entries(await votesFor(localNow().date)).map(([k, v]) => `• ${k} : ${v.join(', ') || 'aucun vote'}`).join('\n');
    case 'intentions': return setIntentions(list('items'));
    case 'intention_faite': {
      const it = await kvJson<{ week: string; items: Array<{ text: string; done?: boolean }> } | null>(INTENT_KEY, null);
      const n = Number(input['n']);
      if (!it || !it.items[n - 1]) return '❌ n = numéro de l\'intention.';
      it.items[n - 1]!.done = true;
      await kvPut(INTENT_KEY, it);
      return `✅ Intention ${n} faite : ${it.items[n - 1]!.text} 💪`;
    }
    case 'revue': await sundayReview(); return '✅ Revue de vie lancée (message + appel).';
    case 'couple': {
      const op = String(input['op'] ?? 'propose');
      if (op === 'book') return bookCouple(String(input['date'] ?? addDays(localNow().date, 1)), /^\d{2}:\d{2}$/.test(String(input['time'] ?? '')) ? String(input['time']) : undefined, String(input['place'] ?? '') || undefined);
      if (op === 'skip') { await kvPut(COUPLE_KEY, { ...(await kvJson<Couple>(COUPLE_KEY, {})), proposedAt: localNow().date }); return 'OK, pas cette semaine. Je te reproposerai dans 15 jours.'; }
      return proposeCouple();
    }
    case 'decision': {
      const t = String(input['text'] ?? '').trim();
      return t ? decide(t) : '❌ text = la décision envisagée.';
    }
    case 'decision_bilan': {
      const l = await kvJson<Decision[]>(DEC_KEY, []);
      const d = l.find(x => x.id === input['id']) ?? l.filter(x => !x.verdict).at(-1);
      if (!d) return 'Aucune décision en attente de bilan.';
      d.verdict = String(input['text'] ?? '').slice(0, 300);
      await kvPut(DEC_KEY, l);
      return `✅ Noté pour « ${d.text} » : ${d.verdict}. Je m'en servirai pour tes prochaines décisions.`;
    }
    case 'decisions': return (await kvJson<Decision[]>(DEC_KEY, [])).slice(-8).map(d => `• ${fmtD(new Date(d.at).toISOString().slice(0, 10))} — ${d.text}${d.verdict ? ` → ${d.verdict}` : ` (bilan le ${fmtD(d.followAt)})`}`).join('\n') || 'Aucune décision notée.';
    case 'correlations': return correlations();
    case 'courbe': return weekCurve();
    case 'eau': return waterLine();
    case 'rapport': return monthReport(/^\d{4}-\d{2}$/.test(String(input['month'] ?? '')) ? String(input['month']) : localNow().date.slice(0, 7));
    case 'priere': {
      const on = String(input['op'] ?? '');
      const p = await kvJson<{ on?: boolean; remind?: boolean }>(PRAYER_KEY, { on: true });
      if (on === 'rappels_on') p.remind = true; else if (on === 'rappels_off') p.remind = false; else if (on === 'off') p.on = false; else if (on === 'on') p.on = true;
      await kvPut(PRAYER_KEY, p);
      return `${(await prayerLine()) || '🕌 Heures de prière masquées.'}\nRappels 15 min avant : ${p.remind ? 'activés' : 'désactivés (« rappels prière on »)'}.`;
    }
  }
  return '❌ action : status, identites, vote, votes, intentions, intention_faite, revue, couple, decision, decision_bilan, decisions, correlations, courbe, eau, rapport, priere.';
}
