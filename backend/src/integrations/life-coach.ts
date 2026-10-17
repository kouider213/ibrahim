import { kvGet, kvSet } from './app-store.js';
import { createAnthropic } from './anthropic-compat.js';
import { listAgendaRange } from './google-calendar.js';
import { localNow, localTs } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { autoCall } from '../notifications/auto-call.js';

// COACH DE VIE (demande de Kouider 2026-10-17) : Dzaryx devient aussi son coach de vie, son coach sportif et son
// nutritionniste — mental, humeur, repas, entraînements, calés sur son agenda. Partout : chat, app, voix, appels.
// VIE PRIVÉE : ce dépôt est PUBLIC. Rien de personnel ici (âge, santé, traitements, poids, famille) : tout est dans
// la base (app_kv `kouider:coach:profile`, rempli par Kouider ou par l'outil), jamais dans le code.

const TZ = 'Europe/Brussels';
const PROFILE_KEY = 'kouider:coach:profile';   // texte libre, privé
const LOG_KEY = 'kouider:coach:log';           // [{ at, mood?, weight?, note? }]

interface CoachLog { at: string; mood?: number; weight?: number; note?: string }

// Règles de sécurité (générales, pas d'info perso) — données au coach partout où il parle.
const SAFETY = [
  'RÈGLES DE SÉCURITÉ DU COACH (prioritaires sur tout le reste) :',
  '- Tu n\'es pas médecin : tu ne prescris rien, tu ne changes JAMAIS une dose de médicament et tu n\'encourages jamais à en prendre plus. S\'il parle d\'augmenter un antidouleur ou un traitement pour aller mieux moralement, dis-le avec chaleur et sans juger : c\'est dangereux, le moral se soigne mieux autrement, et la bonne personne est son médecin (qui peut l\'aider à réduire sans risque — jamais d\'arrêt brutal seul).',
  '- Moral bas : écoute d\'abord, reformule, encourage-le à en parler à son médecin ou à un psychologue, propose une petite action concrète (marcher 10 min, appeler un proche, respirer). Tu ne remplaces pas un professionnel.',
  '- Idées noires, envie de disparaître, ou s\'il a pris beaucoup plus que d\'habitude : prends-le au sérieux, reste avec lui, donne le 112 (urgence) et le Centre de Prévention du Suicide 0800 32 123 (Belgique, gratuit, 24h/24). En Algérie : 115 / 3033 (SAMU).',
  '- Tout ce qui touche à sa santé, son moral et ses traitements est STRICTEMENT PRIVÉ : tu n\'en parles qu\'à Kouider lui-même — jamais à sa femme, sa famille, Houari, un client, ni dans un message à quelqu\'un d\'autre.',
  '- Nutrition : halal, jamais d\'alcool (ni dans les recettes). Pendant un traitement qui coupe l\'appétit : petites portions, protéines à chaque repas, légumes/fibres, beaucoup d\'eau, pas de gras lourd ni sucres rapides ; ne fais jamais sauter de repas. Sport adapté à son dos : gainage, renforcement du dos et des abdos, mobilité, pas de charge lourde sur la colonne (pas de soulevé de terre lourd ni squat barre lourde) sans avis médical ; douleur vive = stop.',
].join('\n');

async function readLog(): Promise<CoachLog[]> {
  try { return JSON.parse((await kvGet(LOG_KEY)) ?? '[]') as CoachLog[]; } catch { return []; }
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

function logSummary(log: CoachLog[]): string {
  const recent = log.slice(-10);
  if (!recent.length) return 'Aucun suivi noté pour l\'instant (humeur, poids).';
  const lines = recent.map(l => `- ${fmtDay(l.at)} :${l.mood != null ? ` moral ${l.mood}/10` : ''}${l.weight != null ? ` poids ${l.weight} kg` : ''}${l.note ? ` — ${l.note.slice(0, 160)}` : ''}`);
  return `SUIVI RÉCENT :\n${lines.join('\n')}`;
}

/** Ce que Dzaryx sait de Kouider comme coach (ajouté à son dossier : chat, appels, message du matin). Kouider seulement. */
export async function lifeCoachText(): Promise<string> {
  const [profile, log] = await Promise.all([kvGet(PROFILE_KEY).catch(() => null), readLog()]);
  return [
    'TU ES AUSSI SON COACH DE VIE, SON COACH SPORTIF ET SON NUTRITIONNISTE : bienveillant, exigeant, concret, comme un grand frère qui veut le voir réussir. Tu suis son moral, son poids, ses repas et ses entraînements, calés sur son agenda. De temps en temps, demande-lui sincèrement comment il va (pas à chaque message). Quand il te donne son humeur (1 à 10), son poids ou comment il se sent, note-le avec life_coach action log.',
    profile?.trim() ? `SON PROFIL (privé) :\n${profile.trim()}` : 'Profil coach pas encore rempli : pose-lui les questions au fil des conversations (life_coach action add).',
    logSummary(log),
    SAFETY,
  ].join('\n');
}

async function agendaOf(date: string): Promise<string> {
  const evs = await listAgendaRange(new Date(localTs(date, '00:00')).toISOString(), new Date(localTs(date, '23:59')).toISOString(), 30).catch(() => null);
  if (!evs) return 'Agenda indisponible.';
  if (!evs.length) return 'Rien à l\'agenda.';
  return evs.map(e => {
    const t = e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : 'journée';
    const end = e.end.dateTime ? `–${new Date(e.end.dateTime).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })}` : '';
    return `- ${t}${end} ${e.summary}`;
  }).join('\n');
}

const PLAN_SYSTEM = `Tu es le coach de vie, coach sportif et nutritionniste personnel de Kouider. Tu prépares SA journée, calée sur son agenda.
Format (texte simple pour Telegram, emojis comme titres, pas de markdown lourd) :
🍽️ Repas — petit-déj, déjeuner, collation, dîner : plats précis et simples à préparer ou acheter (portions, protéines), halal, sans alcool, adaptés à son traitement et à son objectif de poids ; placés aux bonnes heures selon son agenda. Plus 💧 l'eau à boire.
🏋️ Sport — si un créneau sport est à l'agenda : la séance exacte (échauffement, exercices avec séries × répétitions, gainage/dos, retour au calme), adaptée à son dos. Sinon : une activité légère (marche, mobilité 10 min).
🧠 Mental — un objectif du jour + un petit geste concret pour le moral (famille, gratitude, respiration, prière si c'est dans ses habitudes).
😴 Sommeil — heure de coucher conseillée selon le réveil du lendemain.
Viande et volaille : écris « halal ». Ne pose aucune question à la fin (elle est ajoutée après). Respecte TOUTES les règles de sécurité fournies. N'invente aucun rendez-vous. 1500 caractères maximum.`;

/** Plan de la journée (repas + sport + mental) pour une date AAAA-MM-JJ (heure de Bruxelles). */
export async function coachDayPlan(date: string): Promise<string> {
  const [coach, agenda] = await Promise.all([lifeCoachText(), agendaOf(date)]);
  const day = new Date(localTs(date, '12:00')).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const res = await createAnthropic().messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 1400, system: PLAN_SYSTEM,
    messages: [{ role: 'user', content: `${coach}\n\nJOUR : ${day}\nAGENDA :\n${agenda}` }],
  });
  return res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim();
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
    const mood = Number(input['mood']), weight = Number(input['weight']);
    const entry: CoachLog = { at: new Date().toISOString() };
    if (mood >= 1 && mood <= 10) entry.mood = Math.round(mood);
    if (weight > 30 && weight < 250) entry.weight = Math.round(weight * 10) / 10;
    const note = String(input['note'] ?? '').trim();
    if (note) entry.note = note.slice(0, 300);
    if (entry.mood == null && entry.weight == null && !entry.note) return '❌ Donne-moi ton moral (1 à 10), ton poids ou une note.';
    const log = await readLog();
    log.push(entry);
    await kvSet(LOG_KEY, JSON.stringify(log.slice(-120)));
    const w = log.filter(l => l.weight != null);
    const trend = entry.weight != null && w.length >= 2 ? ` (${(entry.weight - w[0].weight!).toFixed(1)} kg depuis le ${fmtDay(w[0].at)})` : '';
    return `✅ Noté${entry.mood != null ? ` — moral ${entry.mood}/10` : ''}${entry.weight != null ? ` — ${entry.weight} kg${trend}` : ''}.${entry.mood != null && entry.mood <= 3 ? ' Moral très bas : écoute-le vraiment, applique les règles de sécurité.' : ''}`;
  }
  if (action === 'plan') {
    const today = localNow().date;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : input['date'] === 'tomorrow' ? plusDays(today, 1) : today;
    return await coachDayPlan(date);
  }
  if (action === 'history') return logSummary(await readLog());
  return await lifeCoachText();
}

/** 20h30 : plan de demain (repas, sport, mental) + « comment tu te sens ? ». Moral bas récent → appel bienveillant. */
export async function jobLifeCoachEvening(): Promise<void> {
  const today = localNow().date;
  try {
    const plan = await coachDayPlan(plusDays(today, 1));
    const text = `🌙 Ton plan pour demain\n\n${plan}\n\n❓ Et toi, ce soir, ton moral de 1 à 10 ?`;
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
