import { kvGet, kvSet } from './app-store.js';
import { createAnthropic, QUALITY } from './anthropic-compat.js';
import { kouiderDossierText, kouiderDossierTool } from './kouider-dossier.js';
import { createAgendaEvent, deleteAgendaEvent, listAgendaRange, updateAgendaSeries } from './google-calendar.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { callOwner, getPendingCall } from '../notifications/voice-call.js';

// ROUTINE DU MATIN (demande de Kouider 2026-10-15) : sport chaque matin sauf le jeudi (ouverture du magasin tôt),
// douche + petit-déj avant le travail. Chaque matin à l'heure du réveil, Dzaryx envoie un message de motivation
// (famille, santé, business, mental, citation) et demande « tu es réveillé ? ». Tant qu'il ne répond
// pas (message Telegram/app ou appel décroché), il est considéré endormi : appel au bout de callAfterMin, rappel ensuite.
// Pause (vacances, repos) : outil morning_routine, ou automatique pendant un voyage enregistré (trips.ts).
// Les trajets (salle, travail, aéroport) et le trafic sont suivis par departures.ts à partir de l'agenda FIK.

export const TZ = 'Europe/Brussels';
const CONFIG_KEY = 'routine:config';
const HISTORY_KEY = 'routine:history';
const ACTIVE_KEY = 'kouider:last_active';
const CALENDAR_FLAG = 'routine:calendar:v1';
const DAYS_V2_FLAG = 'routine:days:v5';   // v5 : douche « famille » (dim/lun) séparée de « douche + petit-déj » (autres jours)                 // v4 : tous les jours sauf jeudi réveil 6h40, départ 7h00 (Kouider 19/10)
const START_FLAG = 'routine:start:2026-10-19';          // sport à partir du lundi 19/10 : séries recréées après la pause
const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const ROUTINE_TITLE = /^(🏋️ [^—]+— salle de Wemmel|🚗 Trajet → salle de Wemmel|🚗 Retour maison|🚿 Douche|⏰ Réveil, douche, petit-déj)/u;

export interface DayPlan {
  kind: 'sport' | 'work' | 'none';
  wake?: string;                 // HH:MM (Bruxelles)
  leave?: string;                // départ de la maison (salle ou travail)
  sport?: [string, string];      // début, fin
  shower?: string;               // début douche (+ petit-déj ensuite)
  eat?: string;                  // petit-déj
  next?: string;                 // ce qui suit, ex. « 09:00 Agence FIK »
}

export interface RoutineConfig {
  enabled: boolean;
  pausedUntil: string | null;    // YYYY-MM-DD inclus
  pauseReason?: string;
  addresses: { home: string; work: string; gym: string };
  days: DayPlan[];               // 0 = dimanche … 6 = samedi
  family: string;
  callAfterMin: number;          // pas de réponse → appel
  recallAfterMin: number;        // toujours rien → 2e appel (le service Telegram rappelle déjà une fois après 10 min)
  calendarIds?: string[];        // séries créées par Dzaryx (sport, douche…)
}

// Horaires calculés le 2026-10-15 depuis l'agenda FIK (Agence FIK 9h mar/ven/sam, 10h mer ; travail 6h30 jeu) et les
// trajets Google Maps avec trafic (maison → salle ≈ 15-19 min, salle → maison ≈ 16-26 min à 8h, maison → travail 3 min).
// v2 (Kouider) : séance de 1h30 ; aller 20 min et retour 25 min comptés et visibles dans l'agenda.
// v3 (Kouider) : mar/ven/sam réveil 6h, départ 6h30 ; l'Agence FIK passe de 9h à 10h et le créneau libre du matin fait 1h (11h-12h).
// v4 (Kouider 2026-10-19) : TOUS les jours sauf le jeudi, réveil 6h40 (café tranquille, il s'habille), départ 7h00 direct à la salle ;
// tout le reste du matin est décalé derrière (sport 7h20-8h50, douche 9h15, petit-déj 9h35, Agence FIK 10h inchangée).
const SPORT_DAY: DayPlan = { kind: 'sport', wake: '06:40', leave: '07:00', sport: ['07:20', '08:50'], shower: '09:15', eat: '09:35' };
export const DEFAULT_CONFIG: RoutineConfig = {
  enabled: true,
  pausedUntil: null,
  addresses: {
    home: 'Bruxelles, Belgique',                      // vraies adresses : app_kv routine:config (privé, dépôt public)
    work: 'Jette, Belgique',
    gym: 'Wemmel, Belgique',
  },
  days: [
    { ...SPORT_DAY, next: '09:35 petit-déj en famille, 10:00 travail' },
    { ...SPORT_DAY, next: '09:35 petit-déj en famille (jour de congé)' },
    { ...SPORT_DAY, next: '10:00 Agence FIK, 12:00 travail' },
    { ...SPORT_DAY, next: '10:00 Agence FIK, 13:00 travail' },
    { kind: 'work', wake: '05:15', shower: '05:20', eat: '05:40', leave: '06:15', next: '06:30 ouverture du magasin (Jette)' },
    { ...SPORT_DAY, next: '10:00 Agence FIK, 12:00 travail' },
    { ...SPORT_DAY, next: '10:00 Agence FIK, 12:00 travail' },
  ],
  family: 'sa femme et son fils',                    // prénoms : app_kv routine:config (privé)
  callAfterMin: 7,
  recallAfterMin: 20,
};

// ── Heure de Bruxelles ───────────────────────────────────────────────────────

export function tzOffsetMin(ts: number, tz = TZ): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ts));
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - Math.floor(ts / 60000) * 60000) / 60000);
}

/** « 2026-10-20 » + « 06:45 » (heure locale du fuseau) → timestamp. */
export function localTs(date: string, hhmm: string, tz = TZ): number {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  let ts = guess - tzOffsetMin(guess, tz) * 60000;
  ts = guess - tzOffsetMin(ts, tz) * 60000;              // passage heure d'été / d'hiver
  return ts;
}

export function localNow(ts = Date.now(), tz = TZ): { date: string; hhmm: string; weekday: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    .formatToParts(new Date(ts));
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${g('hour')}:${g('minute')}`, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')) };
}

export const hm = (ts: number, tz = TZ) => localNow(ts, tz).hhmm.replace(':', 'h');
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h! * 60 + m!; };
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ── Config + état du jour ────────────────────────────────────────────────────

export async function getRoutineConfig(): Promise<RoutineConfig> {
  try {
    const raw = await kvGet(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<RoutineConfig>) };
  } catch { /* défaut */ }
  return DEFAULT_CONFIG;
}
const saveConfig = (c: RoutineConfig) => kvSet(CONFIG_KEY, JSON.stringify(c));

interface DayState { sentAt?: number; awakeAt?: number; calls: number; lastCallAt?: number }
const stateKey = (date: string) => `routine:day:${date}`;
async function getState(date: string): Promise<DayState> {
  try { const v = JSON.parse((await kvGet(stateKey(date))) ?? '{}') as Partial<DayState>; return { ...v, calls: v.calls ?? 0 }; } catch { return { calls: 0 }; }
}
const saveState = (date: string, s: DayState) => kvSet(stateKey(date), JSON.stringify(s), 2 * 86_400);

/** La routine est-elle en pause ce jour-là ? (coupée, vacances, voyage enregistré) — la raison, sinon null. */
export async function routinePausedReason(date: string, cfg?: RoutineConfig): Promise<string | null> {
  const c = cfg ?? await getRoutineConfig();
  if (!c.enabled) return 'routine coupée';
  if (c.pausedUntil && date <= c.pausedUntil) return `en pause jusqu'au ${c.pausedUntil}${c.pauseReason ? ` (${c.pauseReason})` : ''}`;
  const { restDayReason } = await import('../notifications/rest-day.js');
  const rest = await restDayReason(date).catch(() => null);
  if (rest) return `jour de repos (${rest})`;
  const { kouiderAwayOn } = await import('./trips.js');
  const away = await kouiderAwayOn(date).catch(() => null);
  return away ? `en voyage (${away})` : null;
}

// ── « Il est réveillé / il est là » ──────────────────────────────────────────

export async function lastKouiderActivity(): Promise<number> {
  return Number((await kvGet(ACTIVE_KEY).catch(() => null)) ?? 0);
}

/**
 * À appeler à chaque message / appel décroché de Kouider. Retourne une consigne à donner à Dzaryx si ce message
 * répond au contrôle de réveil du matin (sinon null).
 */
export async function noteKouiderActivity(message?: string): Promise<string | null> {
  try {
    await kvSet(ACTIVE_KEY, String(Date.now()), 7 * 86_400);
    const { date, weekday } = localNow();
    const st = await getState(date);
    if (!st.sentAt || st.awakeAt || Date.now() - st.sentAt > 4 * 3600_000) return null;
    st.awakeAt = Date.now();
    await saveState(date, st);
    const plan = (await getRoutineConfig()).days[weekday];
    const next = plan?.kind === 'sport' ? `départ pour la salle à ${plan.leave}, sport ${plan.sport?.[0]}–${plan.sport?.[1]}`
      : plan?.leave ? `départ à ${plan.leave} (${plan.next ?? 'travail'})` : plan?.next ?? '';
    // Jour de sport : le message du réveil demande sa forme 1-5 → séance adaptée (Kouider 21/10)
    let form = '';
    if (plan?.kind === 'sport') {
      const sc = await import('./sport-coach.js');
      const n = message ? sc.parseFormScore(message) : null;
      form = n ? ` Forme du matin : ${await sc.setMorningForm(date, n).catch(() => `${n}/5`)}`
        : ' Tu lui as demandé sa forme de 1 à 5 : si sa réponse la dit en mots (« crevé », « mal dormi », « au top »), appelle sport_coach action=form avec le score (1-5) ; sinon ne la redemande pas.';
    }
    return `[Contexte : ce message répond à ton contrôle de réveil de ce matin — Kouider est RÉVEILLÉ, plus besoin de l'appeler. Félicite-le en une phrase courte et énergique et rappelle-lui ${next}.${form} Puis réponds normalement à ce qu'il dit.]`;
  } catch { return null; }
}

/** La routine du matin a-t-elle appelé Kouider ces dernières minutes ? (évite deux appels coup sur coup) */
export async function routineCalledRecently(min: number): Promise<boolean> {
  const st = await getState(localNow().date);
  return !!st.lastCallAt && Date.now() - st.lastCallAt < min * 60_000;
}

// ── Message du matin ─────────────────────────────────────────────────────────

function planLine(p: DayPlan, addrs: RoutineConfig['addresses']): string {
  if (p.kind === 'sport') {
    const gymCity = /wemmel/i.test(addrs.gym) ? 'Wemmel' : 'la salle';
    return `📋 Ton matin : ${p.leave} départ → 🏋️ ${p.sport?.[0]}–${p.sport?.[1]} salle (${gymCity}) → 🚿 ${p.shower} douche → 🍳 ${p.eat} petit-déj → ${p.next ?? ''}`.trim();
  }
  return `📋 Ton matin : 🚿 ${p.shower} douche → 🍳 ${p.eat} petit-déj → 🚗 ${p.leave} départ → ${p.next ?? 'travail'}`;
}

const WAKE_SYSTEM = `Tu es Dzaryx, le bras droit de Kouider. Chaque matin tu le réveilles avec un message qui lui donne la niaque.
Tu le connais par cœur (dossier ci-dessous). Écris EXACTEMENT 5 lignes, chacune commence par son émoji, tutoiement, français, phrases courtes et percutantes :
🔥 Motivation famille : fais-le pour sa femme et son fils (prénoms dans le dossier ; varie l'angle : exemple pour son fils, fierté de sa femme, l'avenir qu'il construit pour eux…)
💪 Santé : un conseil concret pour aujourd'hui (sport, sommeil, récupération, mobilité du dos… — jamais de nutrition)
💼 Business : un conseil concret et actionnable pour FIK Conciergerie / FIK Sites aujourd'hui
🧠 Mental : un conseil de gagnant (discipline, focus, résilience, confiance…)
✨ Citation : une vraie citation qui accroche, avec son auteur (pas inventée)
Ne répète JAMAIS une citation ou un conseil déjà utilisé (liste fournie). N'invente aucun chiffre, prospect, client ni règle de l'entreprise : le conseil business reste une action générale ou s'appuie sur le dossier. Pas de titre, pas d'intro, pas de conclusion.`;

export async function motivationLines(cfg: RoutineConfig, plan: DayPlan, date: string): Promise<string> {
  let history: string[] = [];
  try { history = JSON.parse((await kvGet(HISTORY_KEY)) ?? '[]') as string[]; } catch { /* vide */ }
  try {
    const dossier = await kouiderDossierText().catch(() => '');
    const res = await createAnthropic().messages.create({
      model: 'claude-sonnet-5-5', max_tokens: 700, system: WAKE_SYSTEM,
      messages: [{ role: 'user', content: [
        dossier,
        `Famille : ${cfg.family}.`,
        `Aujourd'hui : ${DAY_NAMES[localNow(localTs(date, '12:00')).weekday]} ${date}. Programme : ${plan.kind === 'sport' ? `sport ${plan.sport?.join('–')}` : 'pas de sport, il ouvre le magasin tôt'} ; ensuite ${plan.next ?? 'travail'}.`,
        history.length ? `DÉJÀ UTILISÉ (ne pas répéter) :\n${history.slice(-20).join('\n')}` : '',
      ].filter(Boolean).join('\n\n') }],
    }, QUALITY);
    const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim();
    if (text.split('\n').filter(l => l.trim()).length >= 4) {
      await kvSet(HISTORY_KEY, JSON.stringify([...history, text.replace(/\n+/g, ' | ').slice(0, 400)].slice(-30)));
      return text;
    }
  } catch (err) {
    console.error('[routine] motivation:', err instanceof Error ? err.message : err);
  }
  return [
    `🔥 Ta femme et ton fils comptent sur toi : chaque matin où tu te lèves, tu leur montres l'exemple.`,
    `💪 Un grand verre d'eau dès maintenant, avant même le café.`,
    `💼 Une seule action business aujourd'hui qui rapporte : un client relancé ou un prospect appelé.`,
    `🧠 La discipline, c'est faire ce qu'il faut même quand tu n'en as pas envie.`,
    `✨ « Le succès, c'est tomber sept fois et se relever huit. » — proverbe japonais`,
  ].join('\n');
}

async function sendWakeMessage(cfg: RoutineConfig, plan: DayPlan, date: string, test = false, up = ''): Promise<string> {
  const { tripNudges } = await import('./trips.js');
  const [motivation, nudges, liberte] = await Promise.all([motivationLines(cfg, plan, date), tripNudges().catch(() => ''),
    test ? '' : import('./liberte.js').then(m => m.liberteMorningLine()).catch(() => '')]);
  const head = test
    ? `☀️ (Test) Message du matin de Dzaryx :`
    : up ? `☀️ Bonjour Kouider ! Je vois que tu es déjà debout (${up}) 💪 Pas d'appel de réveil aujourd'hui.`
    : plan.kind === 'sport'
      ? `☀️ Bonjour Kouider, il est ${hm(Date.now())}. Tu es réveillé ? Réponds-moi avec ta forme de 1 à 5 (1 = crevé, 5 = au top) : j'adapte ta séance. Sinon je t'appelle dans ${cfg.callAfterMin} min.`
      : `☀️ Bonjour Kouider, il est ${hm(Date.now())}. Tu es réveillé ? Réponds-moi (un mot suffit) — sinon je t'appelle dans ${cfg.callAfterMin} min.`;
  const text = [head, '', motivation, '', planLine(plan, cfg.addresses), liberte ? `\n${liberte}` : '', nudges ? `\n${nudges}` : ''].join('\n').trim();
  await queueTelegramMessage(text);
  emitProactive(text.split('\n')[0]!, 'reminder', text);
  return text;
}

// ── Tâche planifiée (toutes les 2 min, 4h–11h Bruxelles) ─────────────────────

/** Une seule fois : séries de l'agenda recréées pour ne commencer qu'après la pause (sport à partir du lundi 19/10). */
export async function ensureRoutineStart(): Promise<void> {
  // Nouveaux horaires (v4) : appliqués une fois dès le prochain passage (departure-watch, toutes les 5 min, jour et soir)
  if ((await kvGet(CALENDAR_FLAG).catch(() => '0')) === '1' && (await kvGet(DAYS_V2_FLAG).catch(() => '1')) !== '1') {
    const r = await syncRoutineCalendar({ ...(await getRoutineConfig()), days: DEFAULT_CONFIG.days }).catch(e => String(e));
    if (/^\d+\/\d+ séries/.test(r) && !r.startsWith('0/')) await kvSet(DAYS_V2_FLAG, '1');
    console.log(`[routine] horaires v4 (réveil 6h40, départ 7h, sauf jeudi) : ${r}`);
  }
  if ((await kvGet(START_FLAG).catch(() => '1')) === '1') return;
  const r = await syncRoutineCalendar().catch(e => String(e));
  if (/^\d+\/\d+ séries/.test(r) && !r.startsWith('0/')) await kvSet(START_FLAG, '1');
  console.log(`[routine] séries après la pause : ${r}`);
}

export async function jobMorningRoutine(): Promise<void> {
  await ensureRoutineStart();
  if ((await kvGet(CALENDAR_FLAG).catch(() => '1')) !== '1') await setupRoutineCalendar().catch(e => console.error('[routine] agenda:', e));
  const cfg = await getRoutineConfig();
  const { date, hhmm, weekday } = localNow();
  const plan = cfg.days[weekday];
  if (!plan || plan.kind === 'none' || !plan.wake) return;
  if (await routinePausedReason(date, cfg)) return;
  // Sport annulé ce jour-là ou « ne me dérange pas demain matin » : pas de message ni d'appel de réveil (Kouider 20/10).
  // Imports à la demande : sport-coach importe ce fichier (pas d'import circulaire au chargement).
  if (plan.kind === 'sport' && await (await import('./sport-coach.js')).isSportSkipped(date).catch(() => false)) return;
  if (await (await import('../notifications/dnd.js')).dndAt(localTs(date, plan.wake)).catch(() => null)) return;

  const st = await getState(date);
  const now = toMin(hhmm), wake = toMin(plan.wake);
  if (!st.sentAt) {
    if (now < wake || now > wake + 60) return;
    // Déjà debout (il m'a parlé depuis 4 h, GPS hors de la maison, séance déjà notée) : pas de « tu es réveillé ? » ni d'appel (Kouider 26/10)
    const from = localTs(date, '04:00');
    const up = await lastKouiderActivity() >= from ? 'il a déjà parlé à Dzaryx ce matin'
      : await (await import('./presence.js')).kouiderOutSince(from).catch(() => null);
    if (up) {
      st.sentAt = st.awakeAt = Date.now();
      await saveState(date, st);
      await sendWakeMessage(cfg, plan, date, false, up).catch(e => console.error('[routine] message (debout):', e));
      console.log(`[routine] réveil sauté (${date} ${hhmm}) : déjà debout — ${up}`);
      return;
    }
    st.sentAt = Date.now();
    await saveState(date, st);                     // avant l'envoi : jamais deux messages même si l'IA est lente
    await sendWakeMessage(cfg, plan, date);
    console.log(`[routine] message du matin envoyé (${date} ${hhmm})`);
    return;
  }
  if (st.awakeAt) return;
  const since = (Date.now() - st.sentAt) / 60000;
  if (since > 75) return;                           // il a dû se lever sans répondre ; on n'insiste plus
  const due = st.calls === 0 ? since >= cfg.callAfterMin
    : st.calls === 1 ? (Date.now() - (st.lastCallAt ?? 0)) / 60000 >= cfg.recallAfterMin : false;
  if (!due) return;
  if (await getPendingCall('kouider')) return;     // un appel sonne déjà
  st.calls += 1; st.lastCallAt = Date.now();
  await saveState(date, st);
  const what = plan.kind === 'sport'
    ? `Tu pars à la salle à ${plan.leave?.replace(':', ' h ')}, sport à ${plan.sport?.[0].replace(':', ' h ')}.`
    : `Tu ouvres le magasin, départ à ${plan.leave?.replace(':', ' h ')}.`;
  await callOwner(st.calls === 1
    ? `Debout champion, il est ${hm(Date.now()).replace('h', ' h ')} ! Je t'ai écrit et tu n'as pas répondu. ${what} Fais-le pour ta femme et ton fils. Dis-moi que tu es bien réveillé.`
    : `Kouider, c'est encore Dzaryx : tu ne m'as toujours pas répondu. Lève-toi maintenant, ${what} Allez, on y va !`);
  console.log(`[routine] appel de réveil n°${st.calls}`);
}

// ── Agenda : séries sport / douche + adresses ────────────────────────────────

/** Prochaine date de ce jour de semaine après aujourd'hui — et après la pause (« je commence le sport lundi »). */
function nextDateFor(weekday: number, pausedUntil?: string | null): string {
  const { date } = localNow();
  const from = pausedUntil && pausedUntil > date ? pausedUntil : date;
  const fromDay = localNow(localTs(from, '12:00')).weekday;
  return addDays(from, ((weekday - fromDay + 7) % 7) || 7);
}

/** (Re)crée dans l'agenda FIK les séries de la routine à partir de la config (en supprimant les anciennes). */
export async function syncRoutineCalendar(cfg?: RoutineConfig): Promise<string> {
  const c = cfg ?? await getRoutineConfig();
  // Séries connues + toute série de la routine retrouvée par son titre (ids perdus) — sans agenda joignable, on ne touche à rien.
  const { date: today } = localNow();
  const evs = await listAgendaRange(new Date(localTs(today, '00:00')).toISOString(), new Date(localTs(addDays(today, 15), '00:00')).toISOString(), 250);
  if (!evs) return 'agenda FIK injoignable — séries inchangées';
  const old = new Set(c.calendarIds ?? []);
  for (const e of evs) if (e.recurringEventId && ROUTINE_TITLE.test(e.summary ?? '')) old.add(e.recurringEventId);
  for (const id of old) await deleteAgendaEvent(id).catch(() => false);
  type Block = { title: string; start: string; end: string; location: string; desc: string; days: number[] };
  const blocks = new Map<string, Block>();
  const add = (k: string, b: Omit<Block, 'days'>, d: number) => {
    const cur = blocks.get(k);
    if (cur) cur.days.push(d); else blocks.set(k, { ...b, days: [d] });
  };
  const after = (hhmm: string, min: number) => { const t = toMin(hhmm) + min; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  c.days.forEach((p, d) => {
    if (p.kind === 'sport' && p.sport) {
      add(`sport-${p.sport.join('-')}`, { title: '🏋️ Sport — salle de Wemmel', start: p.sport[0], end: p.sport[1], location: c.addresses.gym,
        desc: `Réveil ${p.wake} · départ ${p.leave} (Dzaryx te dit l'heure exacte selon le trafic).\nDzaryx vérifie que tu es réveillé et t'appelle si tu ne réponds pas.` }, d);
      if (p.leave) add(`aller-${p.leave}-${p.sport[0]}`, { title: '🚗 Trajet → salle de Wemmel', start: p.leave, end: p.sport[0], location: '',
        desc: 'Temps de trajet maison → salle (Dzaryx te prévient si le trafic l\'allonge).' }, d);
      if (p.shower) add(`retour-${p.sport[1]}-${p.shower}`, { title: '🚗 Retour maison', start: p.sport[1], end: p.shower, location: '',
        desc: 'Temps de trajet salle → maison.' }, d);
      if (p.shower && p.eat) {
        const familyMeal = /famille/i.test(p.next ?? '');
        add(`douche-${p.shower}-${p.eat}-${familyMeal ? 'famille' : 'seul'}`, { title: familyMeal ? '🚿 Douche (puis petit-déj en famille)' : '🚿 Douche + 🍳 petit-déj',
          start: p.shower, end: familyMeal ? p.eat : after(p.eat, 25), location: c.addresses.home, desc: `Ensuite : ${p.next ?? ''}` }, d);
      }
    } else if (p.kind === 'work' && p.wake && p.leave) {
      add(`work-${p.wake}-${p.leave}`, { title: '⏰ Réveil, douche, petit-déj', start: p.wake, end: p.leave, location: c.addresses.home,
        desc: `Pas de sport aujourd'hui : ${p.next ?? 'travail'}. Départ ${p.leave}.` }, d);
    }
  });
  const ids: string[] = [];
  for (const b of blocks.values()) {
    const first = b.days.map(d => nextDateFor(d, c.pausedUntil)).sort()[0]!;
    const id = await createAgendaEvent(b.title, `${first}T${b.start}:00`, `${first}T${b.end}:00`, b.desc, false, b.location,
      { recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${b.days.map(d => RRULE_DAYS[d]).join(',')}`], timeZone: TZ });
    if (id) ids.push(id);
  }
  await saveConfig({ ...c, calendarIds: ids });
  return `${ids.length}/${blocks.size} séries créées dans l'agenda FIK`;
}

/** Une seule fois : séries de la routine + adresses sur « travail » et « maison » + famille dans le dossier. */
export async function setupRoutineCalendar(): Promise<string> {
  if ((await kvGet(CALENDAR_FLAG)) === '1') return 'déjà fait';
  if ((await kvGet('routine:calendar:lock')) === '1') return 'en cours';
  await kvSet('routine:calendar:lock', '1', 600);
  const cfg = await getRoutineConfig();
  const created = await syncRoutineCalendar(cfg);
  if (!created.startsWith('0/')) {
    const { date } = localNow();
    const evs = await listAgendaRange(new Date(localTs(date, '00:00')).toISOString(), new Date(localTs(addDays(date, 8), '00:00')).toISOString(), 100) ?? [];
    const done = new Set<string>();
    for (const e of evs) {
      const master = e.recurringEventId ?? e.id ?? '';
      if (!master || done.has(master)) continue;
      const loc = /^✈️ Belgique/.test(e.summary ?? '') ? cfg.addresses.work : /^🏠 Maison/.test(e.summary ?? '') ? cfg.addresses.home : null;
      if (!loc) continue;
      done.add(master);
      await updateAgendaSeries(e.id!, { location: loc }).catch(() => false);
    }
    for (const fact of [
      'Il fait du sport chaque matin à la salle de Wemmel, sauf le jeudi où il ouvre le magasin tôt (6h30).',
      `Adresses en Belgique : maison ${cfg.addresses.home} ; travail ${cfg.addresses.work}.`,
    ]) await kouiderDossierTool({ action: 'add', fact }).catch(() => '');
    await kvSet(CALENDAR_FLAG, '1');
    console.log(`[routine] agenda prêt : ${created}, adresses sur ${done.size} séries`);
  }
  await kvSet('routine:calendar:lock', '0', 60);
  return created;
}

// ── Outil morning_routine ────────────────────────────────────────────────────

function parseDay(v: unknown): number | null {
  if (typeof v === 'number' && v >= 0 && v <= 6) return v;
  const s = String(v ?? '').toLowerCase().trim();
  const i = DAY_NAMES.findIndex(n => s.startsWith(n.slice(0, 3)));
  return i >= 0 ? i : (/^\d$/.test(s) && Number(s) <= 6 ? Number(s) : null);
}
const isHHMM = (v: unknown): v is string => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

function describe(c: RoutineConfig): string {
  const lines = c.days.map((p, d) => {
    const name = DAY_NAMES[d]!.padEnd(9);
    if (p.kind === 'sport') return `- ${name}: réveil ${p.wake}, départ ${p.leave}, sport ${p.sport?.join('–')}, douche ${p.shower}, petit-déj ${p.eat} → ${p.next ?? ''}`;
    if (p.kind === 'work') return `- ${name}: réveil ${p.wake}, douche ${p.shower}, petit-déj ${p.eat}, départ ${p.leave} → ${p.next ?? ''}`;
    return `- ${name}: rien`;
  });
  return [
    `🌅 Routine du matin : ${!c.enabled ? '⛔ COUPÉE' : c.pausedUntil ? `⏸️ en pause jusqu'au ${c.pausedUntil}${c.pauseReason ? ` (${c.pauseReason})` : ''}` : '✅ active'}`,
    ...lines,
    `Adresses : 🏠 ${c.addresses.home} · 💼 ${c.addresses.work} · 🏋️ ${c.addresses.gym}`,
    `Contrôle : message à l'heure du réveil, appel si pas de réponse après ${c.callAfterMin} min, rappel ${c.recallAfterMin} min plus tard.`,
  ].join('\n');
}

export async function morningRoutineTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const action = String(input['action'] ?? 'status');
  const c = await getRoutineConfig();
  const { date } = localNow();

  if (action === 'pause') {
    const until = /^\d{4}-\d{2}-\d{2}$/.test(String(input['until'] ?? '')) ? String(input['until'])
      : addDays(date, Math.max(1, Number(input['days'] ?? 1)) - 1);
    await saveConfig({ ...c, pausedUntil: until, pauseReason: String(input['reason'] ?? '').slice(0, 80) || undefined });
    return `⏸️ Routine du matin en pause jusqu'au ${until} inclus : pas de message de réveil, pas d'appel, pas d'alerte de départ pour la salle ou le travail. Elle reprend toute seule le lendemain. Repose-toi bien !`;
  }
  if (action === 'resume' || action === 'on') {
    await saveConfig({ ...c, enabled: true, pausedUntil: null, pauseReason: undefined });
    return '▶️ Routine du matin réactivée — je te réveille demain à l\'heure prévue.';
  }
  if (action === 'off') {
    await saveConfig({ ...c, enabled: false });
    return '⛔ Routine du matin coupée jusqu\'à ce que tu me dises de la remettre.';
  }
  if (action === 'set_day') {
    const d = parseDay(input['day']);
    if (d === null) return '❌ Quel jour ? (lundi… dimanche)';
    const p: DayPlan = { ...c.days[d]! };
    if (input['kind'] === 'sport' || input['kind'] === 'work' || input['kind'] === 'none') p.kind = input['kind'];
    if (isHHMM(input['wake'])) p.wake = input['wake'];
    if (isHHMM(input['leave'])) p.leave = input['leave'];
    if (isHHMM(input['sport_start']) && isHHMM(input['sport_end'])) p.sport = [input['sport_start'], input['sport_end']];
    if (isHHMM(input['shower'])) p.shower = input['shower'];
    if (isHHMM(input['eat'])) p.eat = input['eat'];
    if (typeof input['next'] === 'string') p.next = input['next'];
    if (p.kind === 'sport' && !p.sport) p.sport = ['07:00', '08:00'];
    // Séance déplacée sans nouveaux réveil/départ : ils suivent avec les mêmes écarts (avant : réveil 6h40 pour une séance à 6h, 26/10)
    const old = c.days[d]!;
    if (p.kind === 'sport' && p.sport && old.sport && old.wake && old.leave && p.sport[0] !== old.sport[0] && !isHHMM(input['wake']) && !isHHMM(input['leave'])) {
      const fmt = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
      const s0 = toMin(p.sport[0]);
      p.leave = fmt(s0 - (toMin(old.sport[0]) - toMin(old.leave)));
      p.wake = fmt(toMin(p.leave) - (toMin(old.leave) - toMin(old.wake)));
    }
    const days = [...c.days]; days[d] = p;
    const next = { ...c, days };
    await saveConfig(next);
    const cal = await syncRoutineCalendar(next).catch(e => `agenda non mis à jour (${e instanceof Error ? e.message : e})`);
    return `✅ ${DAY_NAMES[d]} modifié (${cal}).\n${describe(next)}`;
  }
  if (action === 'set_addresses') {
    const a = { ...c.addresses };
    for (const k of ['home', 'work', 'gym'] as const) if (typeof input[k] === 'string' && (input[k] as string).trim()) a[k] = (input[k] as string).trim();
    const next = { ...c, addresses: a };
    await saveConfig(next);
    const cal = await syncRoutineCalendar(next).catch(() => 'agenda non mis à jour');
    return `✅ Adresses enregistrées (${cal}).\n${describe(next)}`;
  }
  if (action === 'set_call_delay') {
    const m = Math.min(30, Math.max(3, Number(input['minutes'] ?? 7)));
    await saveConfig({ ...c, callAfterMin: m });
    return `✅ Si tu ne réponds pas, je t'appelle ${m} min après le message du matin.`;
  }
  if (action === 'test') {
    const plan = c.days[localNow().weekday]!;
    await sendWakeMessage(c, plan.kind === 'none' ? c.days[2]! : plan, date, true);
    return '✅ Message du matin de test envoyé sur Telegram (sans contrôle de réveil ni appel).';
  }
  if (action === 'sync_calendar') return `✅ ${await syncRoutineCalendar(c)}.`;
  const paused = await routinePausedReason(date, c);
  return `${describe(c)}${paused && c.enabled && !c.pausedUntil ? `\n(Aujourd'hui : ${paused})` : ''}`;
}
