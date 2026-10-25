import { kvGet, kvSet } from './app-store.js';
import { createAnthropic, QUALITY } from './anthropic-compat.js';
import { listAgendaRange, createAgendaEvent, deleteAgendaEvent } from './google-calendar.js';
import { localNow, localTs } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { autoCall } from '../notifications/auto-call.js';

// COACH DE VIE (demande de Kouider 2026-10-17) : Dzaryx devient aussi son coach de vie et son coach sportif —
// mental, humeur, entraînements, coucher, calés sur son agenda. Partout : chat, app, voix, appels.
// Nutrition : arrêtée ici le 18/10, revenue le 25/10 dans l'app FORME (forme.ts, halal + traitement éventuel + magasins belges). Toujours aucun repas dans l'agenda.
// VIE PRIVÉE : ce dépôt est PUBLIC. Rien de personnel ici (âge, santé, traitements, poids, famille) : tout est dans
// la base (app_kv `kouider:coach:profile`, rempli par Kouider ou par l'outil), jamais dans le code.

const TZ = 'Europe/Brussels';
const PROFILE_KEY = 'kouider:coach:profile';   // texte libre, privé
const LOG_KEY = 'kouider:coach:log';           // [{ at, mood?, weight?, note? }]

export interface CoachLog { at: string; mood?: number; weight?: number; sleep?: number; note?: string }

// Règles de sécurité (générales, pas d'info perso) — données au coach partout où il parle.
const SAFETY = [
  'RÈGLES DE SÉCURITÉ DU COACH (prioritaires sur tout le reste) :',
  '- Tu n\'es pas médecin : tu ne prescris rien, tu ne changes JAMAIS une dose de médicament et tu n\'encourages jamais à en prendre plus. S\'il parle d\'augmenter un antidouleur ou un traitement pour aller mieux moralement, dis-le avec chaleur et sans juger : c\'est dangereux, le moral se soigne mieux autrement, et la bonne personne est son médecin (qui peut l\'aider à réduire sans risque — jamais d\'arrêt brutal seul).',
  '- Moral bas : écoute d\'abord, reformule, encourage-le à en parler à son médecin ou à un psychologue, propose une petite action concrète (marcher 10 min, appeler un proche, respirer). Tu ne remplaces pas un professionnel.',
  '- Idées noires, envie de disparaître, ou s\'il a pris beaucoup plus que d\'habitude : prends-le au sérieux, reste avec lui, donne le 112 (urgence) et le Centre de Prévention du Suicide 0800 32 123 (Belgique, gratuit, 24h/24). En Algérie : 115 / 3033 (SAMU).',
  '- Tout ce qui touche à sa santé, son moral et ses traitements est STRICTEMENT PRIVÉ : tu n\'en parles qu\'à Kouider lui-même — jamais à sa femme, sa famille, Houari, un client, ni dans un message à quelqu\'un d\'autre.',
  '- NUTRITION = APP FORME (Kouider 25/10, il l\'a redemandée) : repas, courses et macros passent par l\'app FORME (outil forme) — UNIQUEMENT HALAL (il est musulman : jamais porc ni alcool, viande halal), adaptée à son profil privé FORME (traitement éventuel) et aux magasins belges. Jamais de conseil de dose d\'un traitement (son médecin). Toujours rien de nutrition dans l\'agenda. Sport adapté à son dos : gainage, renforcement du dos et des abdos, mobilité, pas de charge lourde sur la colonne (pas de soulevé de terre lourd ni squat barre lourde) sans avis médical ; douleur vive = stop.',
].join('\n');

export async function readLog(): Promise<CoachLog[]> {
  try { return JSON.parse((await kvGet(LOG_KEY)) ?? '[]') as CoachLog[]; } catch { return []; }
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

function logSummary(log: CoachLog[]): string {
  const recent = log.slice(-10);
  if (!recent.length) return 'Aucun suivi noté pour l\'instant (humeur, poids).';
  const lines = recent.map(l => `- ${fmtDay(l.at)} :${l.mood != null ? ` moral ${l.mood}/10` : ''}${l.weight != null ? ` poids ${l.weight} kg` : ''}${l.sleep != null ? ` sommeil ${l.sleep} h` : ''}${l.note ? ` — ${l.note.slice(0, 160)}` : ''}`);
  return `SUIVI RÉCENT :\n${lines.join('\n')}`;
}

/** Ce que Dzaryx sait de Kouider comme coach (ajouté à son dossier : chat, appels, message du matin). Kouider seulement. */
export async function lifeCoachText(): Promise<string> {
  const [profile, log] = await Promise.all([kvGet(PROFILE_KEY).catch(() => null), readLog()]);
  return [
    'TU ES AUSSI SON COACH DE VIE ET SON COACH SPORTIF : bienveillant, exigeant, concret, comme un grand frère qui veut le voir réussir. Tu suis son moral, son poids et ses entraînements, calés sur son agenda. De temps en temps, demande-lui sincèrement comment il va (pas à chaque message). Quand il te donne son humeur (1 à 10), son poids ou comment il se sent, note-le avec life_coach action log.',
    profile?.trim() ? `SON PROFIL (privé) :\n${profile.trim()}` : 'Profil coach pas encore rempli : pose-lui les questions au fil des conversations (life_coach action add).',
    logSummary(log),
    SAFETY,
  ].join('\n');
}

async function agendaOf(date: string): Promise<string> {
  const evs = await listAgendaRange(new Date(localTs(date, '00:00')).toISOString(), new Date(localTs(date, '23:59')).toISOString(), 30).catch(() => null);
  if (!evs) return 'Agenda indisponible.';
  const mine = evs.filter(e => !/^(🍳|🍽️|🥜|🍲|🧠|😴)/u.test(e.summary ?? ''));
  if (!mine.length) return 'Rien à l\'agenda.';
  return mine.map(e => {
    const t = e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : 'journée';
    const end = e.end.dateTime ? `–${new Date(e.end.dateTime).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}` : '';
    return `- ${t}${end} ${e.summary}`;
  }).join('\n');
}

const PLAN_SYSTEM = `Tu es le coach de vie et coach sportif personnel de Kouider. Tu prépares SA journée, calée sur son agenda.
Réponds UNIQUEMENT avec un objet JSON valide (pas de texte autour, pas de \`\`\`), de cette forme :
{"mental":{"time":"HH:MM","goal":"objectif du jour (≤ 70 caractères)","action":"petit geste concret pour le moral (≤ 160 caractères)"},
 "sleep":{"time":"HH:MM","why":"pourquoi cette heure (≤ 100 caractères)"}}
Règles : AUCUN repas ni conseil nutrition (il n'en veut pas). Heures de Bruxelles, jamais pendant le sport ni pendant un RDV. Mental : objectif + geste (famille, gratitude, respiration, prière si c'est dans ses habitudes), placé le matin. Coucher selon le réveil du lendemain.
CONFIDENTIALITÉ : ces textes vont dans son agenda — n'y écris JAMAIS rien sur sa santé, ses traitements, son poids ou son moral (pas de « traitement », « appétit », « médicament », « moral bas »). Respecte TOUTES les règles de sécurité fournies. N'invente aucun rendez-vous.`;

export interface CoachDay {
  date: string; mental: { time: string; goal: string; action: string }; sleep: { time: string; why: string };
  sport: string | null; eventIds: string[]; at: number;
}
const SHORT_NIGHT_H = 6;

/** Dernière nuit notée dans les 20 dernières heures (« j'ai dormi 4 h »), sinon null. */
async function lastNightSleep(): Promise<number | null> {
  const l = (await readLog()).filter(x => x.sleep != null && Date.now() - new Date(x.at).getTime() < 20 * 3600_000).pop();
  return l?.sleep ?? null;
}

const DAY_KEY = (date: string) => `kouider:coach:day:${date}`;
// Les titres repas restent reconnus : ceux posés avant le 18/10 sont effacés de l'agenda à chaque (re)génération.
const COACH_TITLE = /^(🍳 Petit-déj|🍽️ Déjeuner|🥜 Collation|🍲 Dîner|🧠 Mental|😴 Au lit) — /u;
const isHHMM = (v: unknown): v is string => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

export async function getCoachDay(date: string): Promise<CoachDay | null> {
  try { return JSON.parse((await kvGet(DAY_KEY(date))) ?? 'null') as CoachDay | null; } catch { return null; }
}

/** Génère la journée du coach (mental, coucher) et l'écrit dans l'agenda FIK (événements « libres »). */
export async function buildCoachDay(date: string, writeAgenda = true): Promise<CoachDay> {
  const [coach, agenda, sport, old, slept] = await Promise.all([lifeCoachText(), agendaOf(date),
    import('./sport-coach.js').then(m => m.sportSessionFor(date)).catch(() => null), getCoachDay(date), lastNightSleep()]);
  const tired = slept != null && slept < SHORT_NIGHT_H && date === localNow().date
    ? `\n\nNUIT DERNIÈRE : seulement ${slept} h de sommeil → coucher ce soir 1 h à 1 h 30 plus tôt que d'habitude (jamais avant 20:30), raison douce dans « why ».` : '';
  const day = new Date(localTs(date, '12:00')).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const res = await createAnthropic().messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 600, system: PLAN_SYSTEM,
    messages: [{ role: 'user', content: `${coach}\n\nJOUR : ${day}\nAGENDA (sans ce que tu as déjà posé) :\n${agenda}${sport ? `\n\nSÉANCE PRÉVUE :\n${sport}` : ''}${tired}` }],
  }, QUALITY);
  const raw = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as Partial<CoachDay>;
  const out: CoachDay = {
    date,
    mental: { time: isHHMM(j.mental?.time) ? j.mental!.time : '09:30', goal: String(j.mental?.goal ?? '').slice(0, 90), action: String(j.mental?.action ?? '').slice(0, 200) },
    sleep: { time: isHHMM(j.sleep?.time) ? j.sleep!.time : '22:30', why: String(j.sleep?.why ?? '').slice(0, 120) },
    sport, eventIds: [], at: Date.now(),
  };
  if (writeAgenda) {
    // Mental / coucher (et anciens repas) déjà posés ce jour-là (ids connus OU retrouvés par le titre, si un essai a été coupé) → effacés
    const ids = new Set(old?.eventIds ?? []);
    const existing = await listAgendaRange(new Date(localTs(date, '00:00')).toISOString(), new Date(localTs(date, '23:59')).toISOString(), 60).catch(() => null);
    for (const e of existing ?? []) if (e.id && !e.recurringEventId && e.transparency === 'transparent' && COACH_TITLE.test(e.summary ?? '')) ids.add(e.id);
    for (const id of ids) await deleteAgendaEvent(id).catch(() => false);
    const add = async (title: string, start: string, min: number, desc: string) => {
      const end = new Date(localTs(date, start) + min * 60_000);
      const endHm = localNow(end.getTime()).hhmm;
      const id = await createAgendaEvent(title, `${date}T${start}:00`, `${localNow(end.getTime()).date}T${endHm}:00`, `${desc}\n\n✅ À cocher dans l'app Dzaryx → COACH (points du jeu).`, false, undefined,
        { transparent: true, timeZone: TZ }).catch(() => null);
      if (id) out.eventIds.push(id);
    };
    if (out.mental.goal) await add(`🧠 Mental — ${out.mental.goal}`, out.mental.time, 10, out.mental.action);
    await add(`😴 Au lit — coucher conseillé`, out.sleep.time, 15, out.sleep.why);
  }
  await kvSet(DAY_KEY(date), JSON.stringify(out), 12 * 86_400);
  return out;
}

export function coachDayText(d: CoachDay): string {
  return [
    d.sport ? `🏋️ Sport — ${d.sport.split('\n').slice(0, 9).join('\n')}` : '🏋️ Pas de sport prévu : 20 min de marche ou 10 min de mobilité.',
    `\n🧠 Mental (${d.mental.time}) — ${d.mental.goal}\n   ${d.mental.action}`,
    `😴 Au lit à ${d.sleep.time} — ${d.sleep.why}`,
    `\n📅 Tout est dans ton agenda · à cocher dans l'app → COACH`,
  ].join('\n');
}

/** Plan de la journée (sport + mental + coucher) pour une date AAAA-MM-JJ (heure de Bruxelles). */
export async function coachDayPlan(date: string, regenerate = false): Promise<string> {
  const d = (!regenerate && await getCoachDay(date)) || await buildCoachDay(date);
  return coachDayText(d);
}

const plusDays = (date: string, n: number) => new Date(localTs(date, '12:00') + n * 86_400_000).toISOString().slice(0, 10);

/** Outil life_coach (Kouider uniquement). */
export async function lifeCoachTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const action = String(input['action'] ?? 'show');
  if (action === 'add') {
    const fact = String(input['fact'] ?? '').replace(/\s+/g, ' ').trim();
    if (!fact) return '❌ Quelle info je dois retenir ?';
    const cur = (await kvGet(PROFILE_KEY).catch(() => null)) ?? '';
    await kvSet(PROFILE_KEY, `${cur.trim()}\n- ${fact}`.trim().slice(-6000));
    return `✅ Retenu (privé) : « ${fact} ».`;
  }
  if (action === 'log') {
    const mood = Number(input['mood']), weight = Number(input['weight']), sleep = Number(input['sleep_hours']);
    const entry: CoachLog = { at: new Date().toISOString() };
    if (mood >= 1 && mood <= 10) entry.mood = Math.round(mood);
    if (weight > 30 && weight < 250) entry.weight = Math.round(weight * 10) / 10;
    if (sleep > 0 && sleep <= 14) entry.sleep = Math.round(sleep * 2) / 2;
    const note = String(input['note'] ?? '').trim();
    if (note) entry.note = note.slice(0, 300);
    if (entry.mood == null && entry.weight == null && entry.sleep == null && !entry.note) return '❌ Donne-moi ton moral (1 à 10), ton poids, tes heures de sommeil ou une note.';
    const log = await readLog();
    log.push(entry);
    await kvSet(LOG_KEY, JSON.stringify(log.slice(-120)));
    const w = log.filter(l => l.weight != null);
    const trend = entry.weight != null && w.length >= 2 ? ` (${(entry.weight - w[0].weight!).toFixed(1)} kg depuis le ${fmtDay(w[0].at)})` : '';
    // Courte nuit (Kouider 22/10 : 4 h après les urgences) : le coucher de ce soir est avancé tout de suite dans l'agenda
    let short = '';
    if (entry.sleep != null && entry.sleep < SHORT_NIGHT_H) {
      const day = await buildCoachDay(localNow().date).catch(() => null);
      short = ` Courte nuit : coucher de ce soir ${day ? `avancé à ${day.sleep.time.replace(':', 'h')}${day.eventIds.length ? ' dans son agenda' : ' (agenda injoignable : pas écrit dedans)'} — dis-le-lui` : 'à avancer (plan indisponible)'}. Propose-lui ensuite, sans rien changer sans son oui : une séance plus légère demain (sport_coach) ou un réveil un peu plus tard (morning_routine).`;
    }
    return `✅ Noté${entry.mood != null ? ` — moral ${entry.mood}/10` : ''}${entry.weight != null ? ` — ${entry.weight} kg${trend}` : ''}${entry.sleep != null ? ` — ${entry.sleep} h de sommeil` : ''}.${entry.mood != null && entry.mood <= 3 ? ' Moral très bas : écoute-le vraiment, applique les règles de sécurité.' : ''}${short}`;
  }
  if (action === 'plan') {
    const today = localNow().date;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : input['date'] === 'tomorrow' ? plusDays(today, 1) : today;
    return await coachDayPlan(date, input['regenerate'] === true);
  }
  if (action === 'history') return logSummary(await readLog());
  return await lifeCoachText();
}

/** 20h30 : plan de demain (sport, mental, coucher) + « comment tu te sens ? ». Moral bas récent → appel bienveillant. */
export async function jobLifeCoachEvening(): Promise<void> {
  const today = localNow().date;
  try {
    const plan = coachDayText(await buildCoachDay(plusDays(today, 1)));
    // Pas rentré (GPS) avant 20h30 : les nouvelles du souci perso de la veille sont demandées ici
    const care = await (await import('../notifications/dnd.js')).takeFamilyFollowup().catch(() => null);
    const text = `🌙 Ton plan pour demain\n\n${plan}\n\n${care ? `❤️ Et depuis hier (${care.toLowerCase()}), comment ça va à la maison ?\n` : ''}❓ Et toi, ce soir, ton moral de 1 à 10 ?`;
    await queueTelegramMessage(text);
    emitProactive('🌙 Ton plan pour demain est prêt', 'info', text, 'kouider');
  } catch (err) {
    console.error('[life-coach] plan:', err instanceof Error ? err.message : err);
  }
  const recent = (await readLog()).filter(l => l.mood != null && Date.now() - new Date(l.at).getTime() < 3 * 86_400_000);
  const low = recent.slice(-2);
  if (low.length && low.every(l => l.mood! <= 4)) {
    await autoCall(`coach-moral-${today}`, 'Salut Kouider, c\'est Dzaryx. Je voulais juste prendre de tes nouvelles, ces derniers jours tu n\'avais pas trop le moral. Comment tu te sens ce soir ?');
  }
}

/** Dimanche 18h : bilan de la semaine au téléphone (poids, moral, sport) et cap de la semaine suivante. */
export async function jobLifeCoachWeekly(): Promise<void> {
  const week = (await readLog()).filter(l => Date.now() - new Date(l.at).getTime() < 7 * 86_400_000);
  const moods = week.filter(l => l.mood != null).map(l => l.mood!);
  const weights = week.filter(l => l.weight != null).map(l => l.weight!);
  const parts = [
    moods.length ? `ton moral moyen cette semaine est de ${Math.round(moods.reduce((a, b) => a + b, 0) / moods.length)} sur 10` : '',
    weights.length ? `ton dernier poids noté est ${weights.at(-1)} kilos` : '',
  ].filter(Boolean).join(', et ');
  await autoCall(`coach-weekly-${localNow().date}`,
    `Salut Kouider, c'est ton coach. On fait le bilan de la semaine ? ${parts ? `D'après mon suivi, ${parts}.` : 'Je n\'ai pas encore de suivi, on le commence ensemble.'} Dis-moi comment s'est passée ta semaine, et on fixe ensemble l'objectif de la semaine prochaine.`,
    { level: 'normal' });
}

/** Rattrapage (toutes les 5 min) : journée du coach d'aujourd'hui (5h–20h) ou de demain (après 20h40) manquante → générée + agenda. */
export async function ensureCoachDays(): Promise<void> {
  await purgeMealEvents().catch(err => console.error('[life-coach] purge repas:', err instanceof Error ? err.message : err));
  const { date, hhmm } = localNow();
  const target = hhmm >= '20:40' ? plusDays(date, 1) : hhmm >= '05:00' && hhmm < '20:00' ? date : null;
  if (!target || await getCoachDay(target)) return;
  const lock = `kouider:coach:gen:${target}`;
  if (await kvGet(lock).catch(() => '1')) return;
  await kvSet(lock, '1', 900);
  await buildCoachDay(target).catch(async err => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[life-coach] journée:', msg);
    await kvSet(lock, `erreur ${new Date().toISOString()} : ${msg.slice(0, 300)}`, 900);   // visible pour le débogage, nouvel essai dans 15 min
  });
}

/** Une seule fois (nutrition retirée le 2026-10-18) : efface de l'agenda FIK les repas déjà posés (J-2 → J+14). */
async function purgeMealEvents(): Promise<void> {
  const FLAG = 'kouider:coach:meals-purged';
  if (await kvGet(FLAG)) return;
  const evs = await listAgendaRange(new Date(Date.now() - 2 * 86_400_000).toISOString(), new Date(Date.now() + 14 * 86_400_000).toISOString(), 500);
  if (!evs) return;   // agenda injoignable → nouvel essai dans 5 min
  let n = 0;
  for (const e of evs) if (e.id && /^(🍳 Petit-déj|🍽️ Déjeuner|🥜 Collation|🍲 Dîner) — /u.test(e.summary ?? '') && await deleteAgendaEvent(e.id).catch(() => false)) n++;
  await kvSet(FLAG, `${new Date().toISOString()} : ${n} repas effacés`);
  console.log(`[life-coach] ${n} repas effacés de l'agenda`);
}
