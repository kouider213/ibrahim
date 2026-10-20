import { kvGet, kvSet } from './app-store.js';
import { supabase } from './supabase.js';
import { createAnthropic, QUALITY } from './anthropic-compat.js';
import { getLocation } from './location.js';
import { geocode, drive, km } from './departures.js';
import { getRoutineConfig, routinePausedReason, localNow, localTs, hm, TZ } from './morning-routine.js';
import { listAgendaRange } from './google-calendar.js';
import { trafficBriefLine } from './site-traffic.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { callOwner, getPendingCall } from '../notifications/voice-call.js';

// ASSISTANT GPS (demande de Kouider 2026-10-18) : avec sa position en direct (Telegram), Dzaryx voit où il est et agit
// comme un vrai assistant :
// - il sort de la maison → « je te vois partir, tu vas où ? » ; s'il RÉPOND par message, il est seul → libre de parler
//   (et le matin : appel du brief). Vers la salle : lien Waze + vraies playlists tout de suite.
// - il arrive à la salle EN AVANCE → « tu es bien à la salle ? » ; « oui » → séance validée, rappel de départ annulé,
//   matinée de l'agenda avancée (sport-coach.confirmGymArrival). Dans la fenêtre normale, sport-watch valide tout seul.
// - arrivé au travail → programme du jour (pas prévu à cette heure → « tout va bien ? ») ; rentré le soir → demain en 2 lignes.
// - BRIEF DU MATIN (hier, aujourd'hui, mails, WhatsApp, visites du site, conseils) : seulement s'il a répondu qu'il est
//   seul ; sinon redemandé 10 min avant le travail ; pas de réponse en 25 min → écrit sur Telegram. Ou à la demande.
// Le retard (trafic, heure de départ) reste dans departures.ts.

const STATE_KEY = 'presence:state';
const PREFS_KEY = 'presence:prefs';
const BRIEF_CACHE = 'presence:brief';
const ASK_TTL = 90 * 60_000;
const RADIUS: Record<'home' | 'gym' | 'work', number> = { home: 0.3, gym: 0.4, work: 0.3 };
const NAME: Record<Place, string> = { home: 'la maison', gym: 'la salle', work: 'le travail', away: 'en déplacement' };

type Place = 'home' | 'gym' | 'work' | 'away';
type AskKind = 'left' | 'gym' | 'brief' | 'odd';
interface PresenceState {
  place?: Place; since?: number;
  ask?: { kind: AskKind; at: number; dest?: 'gym' | string };
  aloneUntil?: number;
  lastLeft?: number;
  lastFixAt?: number;                         // dernière position fraîche vue : après un trou, pas d'événement
  done: Record<string, string[]>;            // date → ce qui a déjà été fait (brief, brief-ask, work, home…)
}
interface Prefs { enabled: boolean; leaveAsk: boolean; brief: boolean; music: string[] }
const DEFAULT_PREFS: Prefs = {
  enabled: true, leaveAsk: true, brief: true,
  music: ['Didine Canon 16', 'Soolking', "L'Algérino", 'Lacrim', 'Ninho', 'Jul', 'SCH', 'Naps', "Rim'K", 'Kofs', 'Werenoi', 'Gazo'],
};

async function getState(): Promise<PresenceState> {
  try { const s = JSON.parse((await kvGet(STATE_KEY)) ?? '{}') as Partial<PresenceState>; return { ...s, done: s.done ?? {} }; } catch { return { done: {} }; }
}
async function saveState(s: PresenceState): Promise<void> {
  const today = localNow().date;
  s.done = Object.fromEntries(Object.entries(s.done).filter(([d]) => d >= today));   // on ne garde que le jour en cours
  await kvSet(STATE_KEY, JSON.stringify(s), 7 * 86_400);
}
export async function getPresencePrefs(): Promise<Prefs> {
  try { return { ...DEFAULT_PREFS, ...JSON.parse((await kvGet(PREFS_KEY)) ?? '{}') as Partial<Prefs> }; } catch { return DEFAULT_PREFS; }
}
const did = (st: PresenceState, kind: string, date = localNow().date) => (st.done[date] ?? []).includes(kind);
const mark = (st: PresenceState, kind: string, date = localNow().date) => { st.done[date] = [...(st.done[date] ?? []), kind]; };

// ── Lieux connus ─────────────────────────────────────────────────────────────

async function places(): Promise<Array<{ id: 'home' | 'gym' | 'work'; lat: number; lng: number; address: string }>> {
  const a = (await getRoutineConfig()).addresses;
  const out: Array<{ id: 'home' | 'gym' | 'work'; lat: number; lng: number; address: string }> = [];
  for (const id of ['home', 'gym', 'work'] as const) {
    const g = await geocode(a[id]).catch(() => null);
    if (g) out.push({ id, ...g, address: a[id] });
  }
  return out;
}

/** Lieu actuel ; on ne « quitte » un lieu qu'à 250 m au-delà de son rayon (le GPS saute). */
function classify(p: { lat: number; lng: number }, pts: Awaited<ReturnType<typeof places>>, prev?: Place): Place {
  for (const x of pts) if (km(p, x) < RADIUS[x.id]) return x.id;
  const was = pts.find(x => x.id === prev);
  if (was && km(p, was) < RADIUS[was.id] + 0.25) return was.id;
  return 'away';
}

// ── Musique ──────────────────────────────────────────────────────────────────

// Vraies playlists (Kouider 20/10 : un lien de recherche ouvre juste l'app) : « <artiste> : les indispensables »
// d'Apple Music, trouvée sur la page de l'artiste (API iTunes, gratuite) et gardée 30 jours ; à défaut, sa page artiste.
// Boutique BELGE (son compte Apple Music est en Belgique) : un lien /fr/ ouvrait l'app sans afficher la playlist.
const STORE = 'be';
const GENRE_PLAYLISTS = [
  { name: 'Magh Rap (rap algérien / maghrébin)', url: `https://music.apple.com/${STORE}/playlist/magh-rap/pl.4f0e32560bde4190aa01c5788d43797d` },
  { name: 'Le Code (rap français du moment)', url: `https://music.apple.com/${STORE}/playlist/le-code/pl.084e56c4114a4a199e582aa7db6e7e56` },
  { name: 'Hits Rap', url: `https://music.apple.com/${STORE}/playlist/hits-rap/pl.4d2a54110afa4782a4aeaf039e401550` },
];

async function artistPlaylist(artist: string): Promise<{ name: string; url: string; playlist: boolean } | null> {
  const ck = `music:pl:${STORE}:${artist.toLowerCase()}`;
  const cached = await kvGet(ck).catch(() => null);
  if (cached) { try { return JSON.parse(cached) as { name: string; url: string; playlist: boolean }; } catch { /* ancien format */ } }
  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=musicArtist&country=${STORE}&limit=1`, { signal: AbortSignal.timeout(6000) });
    const a = ((await r.json()) as { results?: Array<{ artistLinkUrl?: string; artistName?: string }> }).results?.[0];
    const page = a?.artistLinkUrl?.split('?')[0];
    if (!page) return null;
    const html = await (await fetch(`${page}?l=fr-FR`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) })).text();
    const pl = html.match(new RegExp(`https://music\\.apple\\.com/${STORE}/playlist/[^"?]*-les-indispensables/pl\\.[0-9a-f]+`))?.[0];
    const out = { name: a?.artistName ?? artist, url: pl ?? page, playlist: !!pl };
    await kvSet(ck, JSON.stringify(out), 30 * 86_400).catch(() => {});
    return out;
  } catch { return null; }
}

/** Playlists Apple Music : ses artistes du jour, ou ce qu'il demande (« mets-moi du Khaled », « une playlist Soolking et Jul »). */
export async function playlistText(forWhat = 'la route', query?: string): Promise<string> {
  const { music } = await getPresencePrefs();
  const day = Math.floor(Date.now() / 86_400_000);
  const asked = (query ?? '').split(/,|;| et | and |\+/i).map(x => x.trim()).filter(x => x.length > 1).slice(0, 5);
  const pick = asked.length ? asked : [0, 1, 2].map(i => music[(day * 3 + i) % music.length]!).filter((v, i, a) => a.indexOf(v) === i);
  const found = await Promise.all(pick.map(artistPlaylist));
  const lines = found.flatMap(f => f ? [`• ${f.name}${f.playlist ? ' — les indispensables' : ' (page artiste)'}\n${f.url}`] : []);
  const missing = pick.filter((_, i) => !found[i]);
  const genre = GENRE_PLAYLISTS[day % GENRE_PLAYLISTS.length]!;
  return [`🎧 Pour ${forWhat} — appuie sur un lien, la playlist s'ouvre dans Apple Music, puis ▶️ :`, ...lines,
    ...(asked.length ? [] : [`• ${genre.name}\n${genre.url}`]),
    ...(missing.length ? [`(pas trouvé sur Apple Music : ${missing.join(', ')})`] : [])].join('\n\n');
}

// ── Brief du matin ───────────────────────────────────────────────────────────

const algiers = (off = 0) => new Date(Date.now() + off * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Algiers' });

async function briefFacts(): Promise<string> {
  const today = localNow().date;
  const yStart = new Date(localTs(today, '00:00') - 86_400_000).toISOString(), tStart = new Date(localTs(today, '00:00')).toISOString();
  const [{ buildYesterdayRecap }, { buildMailDigest }, { waPendingDrafts }, { sportToday }] = await Promise.all([
    import('./prospect-autopilot.js'), import('./mail-digest.js'), import('./whatsapp-web.js'), import('./sport-coach.js')]);
  const tA = algiers(), type = (r: unknown) => ((r ?? []) as Array<{ client_name: string; cars?: { name?: string } | null }>).map(b => `${b.client_name} (${b.cars?.name ?? 'voiture'})`).join(', ');
  const [prospects, mails, wa, sport, agenda, newB, departs, returns, late, pv, cv] = await Promise.all([
    buildYesterdayRecap().catch(() => null),
    buildMailDigest().catch(() => null),
    waPendingDrafts().catch(() => []),
    sportToday().catch(() => null),
    listAgendaRange(new Date().toISOString(), new Date(localTs(today, '23:59')).toISOString(), 30).catch(() => null),
    supabase.from('bookings').select('client_name, final_price, cars(name)').gte('created_at', yStart).lt('created_at', tStart),
    supabase.from('bookings').select('client_name, cars(name)').in('status', ['CONFIRMED', 'ACTIVE']).eq('start_date', tA),
    supabase.from('bookings').select('client_name, cars(name)').in('status', ['CONFIRMED', 'ACTIVE']).eq('end_date', tA),
    supabase.from('bookings').select('id').in('status', ['CONFIRMED', 'ACTIVE']).lt('end_date', tA),
    import('./site-traffic.js').then(m => m.dayTraffic(-1)).catch(() => null),
    supabase.from('car_views').select('cars(name)').gte('created_at', yStart).lt('created_at', tStart),
  ]);
  const carCount: Record<string, number> = {};
  for (const v of (cv.data ?? []) as Array<{ cars?: { name?: string } | null }>) { const n = v.cars?.name ?? '?'; carCount[n] = (carCount[n] ?? 0) + 1; }
  const topCars = Object.entries(carCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} ${c}`).join(', ');
  const nb = (newB.data ?? []) as Array<{ client_name: string; final_price?: number; cars?: { name?: string } | null }>;
  const evs = (agenda ?? []).filter(e => e.start.dateTime && !/^(🟢|🚿|⏰)/u.test(e.summary ?? ''))
    .map(e => `${hm(Date.parse(e.start.dateTime!))} ${e.summary}${e.location ? ` (${e.location})` : ''}`);
  return [
    `HIER (${new Date(Date.parse(yStart)).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })}) :`,
    `- Nouvelles réservations : ${nb.length ? nb.map(b => `${b.client_name} (${b.cars?.name ?? 'voiture'}${b.final_price ? `, ${b.final_price} €` : ''})`).join(', ') : 'aucune'}`,
    `- Site web : ${pv ? trafficBriefLine(pv) : 'stats indisponibles'}${topCars ? ` ; voitures les plus vues : ${topCars}` : ''}`,
    prospects?.lines.length ? `- Prospection :\n  ${prospects.lines.join('\n  ')}` : '- Prospection : rien de noté',
    `AUJOURD'HUI :`,
    `- Agenda : ${evs.length ? evs.join(' ; ') : 'rien de prévu'}`,
    sport?.slot ? `- Sport : ${sport.label} ${hm(Date.parse(sport.slot.start))}${sport.arrived ? ' (déjà à la salle / faite)' : sport.skipped ? ' (annulée)' : ''}` : '',
    `- Locations : départs ${type(departs.data) || 'aucun'} ; retours ${type(returns.data) || 'aucun'}${late.data?.length ? ` ; ⚠️ ${late.data.length} voiture(s) pas rendue(s)` : ''}`,
    `MAILS :\n${mails ?? 'rien d\'important dans la boîte pro'}`,
    `WHATSAPP : ${wa.length ? wa.map(w => `${w.chat} : « ${w.preview.slice(0, 120)} »`).join(' | ') : 'aucun message en attente'}`,
  ].filter(Boolean).join('\n');
}

const BRIEF_SYSTEM = `Tu es Dzaryx, le bras droit de Kouider (FIK Conciergerie : location de voitures à Oran, FIK Sites). Tu lui fais son BRIEF DU MATIN à partir des FAITS fournis — n'invente AUCUN chiffre, client, mail ni événement.
Réponds en JSON strict : {"written": "...", "spoken": "..."}
- written : message Telegram, sections avec émojis (📊 Hier, 📅 Aujourd'hui, 📬 Mails, 📲 WhatsApp, 🌐 Site, 💡 3 conseils concrets pour aujourd'hui tirés des faits, 🔥 une phrase de motivation). Court et clair, tutoiement.
- spoken : la version à l'oral pour un appel, 900 caractères maximum, phrases courtes, sans émoji ni liste, chiffres écrits simplement ; termine par « Tu veux que je détaille quelque chose ? ».`;

/** Le brief (gardé 20 min : l'appel et le message écrit disent la même chose). */
export async function buildMorningBrief(force = false): Promise<{ written: string; spoken: string }> {
  if (!force) { try { const c = await kvGet(BRIEF_CACHE); if (c) return JSON.parse(c) as { written: string; spoken: string }; } catch { /* refait */ } }
  const facts = await briefFacts();
  let out = { written: `☀️ Ton brief du matin\n\n${facts}`, spoken: 'Ton brief du matin est prêt, je te l\'ai écrit sur Telegram. Tu veux que je détaille quelque chose ?' };
  try {
    const res = await createAnthropic().messages.create({
      model: 'claude-sonnet-5-5', max_tokens: 1800, system: BRIEF_SYSTEM,
      messages: [{ role: 'user', content: `Nous sommes le ${new Date().toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })}, il est ${hm(Date.now())}.\n\nFAITS :\n${facts}` }],
    }, QUALITY);
    const t = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
    const j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) as { written?: string; spoken?: string };
    if (j.written && j.spoken) out = { written: `☀️ Ton brief du matin\n\n${j.written.trim().replace(/^[^\n]*brief[^\n]*\n+/i, '')}`, spoken: j.spoken.trim().slice(0, 1100) };
  } catch (err) { console.error('[presence] brief:', err instanceof Error ? err.message : err); }
  await kvSet(BRIEF_CACHE, JSON.stringify(out), 20 * 60).catch(() => {});
  return out;
}

/** Brief envoyé : par appel (le texte arrive aussi sur Telegram) ou seulement par écrit. */
export async function deliverBrief(mode: 'call' | 'write'): Promise<string> {
  const st = await getState();
  mark(st, 'brief'); st.ask = st.ask?.kind === 'brief' ? undefined : st.ask;
  await saveState(st);
  const b = await buildMorningBrief();
  await queueTelegramMessage(b.written);
  if (mode === 'call' && !(await getPendingCall('kouider'))) await callOwner(b.spoken);
  return b.written;
}

export async function briefDoneToday(): Promise<boolean> {
  return did(await getState(), 'brief');
}

/** Heure de début du travail ce jour-là (« 10:00 Agence FIK, 12:00 travail » → 10:00), null si congé / rien. */
function workStart(next?: string): string | null {
  for (const part of (next ?? '').split(',')) {
    const m = part.match(/(\d{2}:\d{2})\s*(.*)/);
    if (m && /travail|agence|magasin|ouverture|bureau/i.test(m[2]!) && !/cong[ée]/i.test(part)) return m[1]!;
  }
  return null;
}

// ── Événements GPS ───────────────────────────────────────────────────────────

async function nextTrip(now: number): Promise<{ name: string; start: number; location: string } | null> {
  const evs = await listAgendaRange(new Date(now).toISOString(), new Date(now + 3 * 3600_000).toISOString(), 10).catch(() => null);
  const e = (evs ?? []).find(x => x.start.dateTime && x.location?.trim() && !/^(🟢|🏠|🚿|⏰|🚗)/u.test(x.summary ?? ''));
  return e ? { name: (e.summary ?? 'RDV').replace(/^[^\p{L}\d]+/u, '').split(' — ')[0]!.trim(), start: Date.parse(e.start.dateTime!), location: e.location! } : null;
}

/** Lien Waze vers la salle (Kouider 20/10 : Waze seulement, pas de point Plans/Maps) — trajet depuis sa position. */
async function gymPin(label: string): Promise<void> {
  const g = (await places()).find(p => p.id === 'gym');
  if (!g) return;
  const loc = await getLocation('kouider').catch(() => null);
  const t = loc && Date.now() - Date.parse(loc.updated_at) < 20 * 60_000 ? await drive({ lat: loc.lat, lng: loc.lng }, g).catch(() => null) : null;
  await queueTelegramMessage(`🏋️ Salle — ${label}${t ? ` : ${t.min} min de route depuis où tu es` : ''}\n🧭 Waze : ${waze(g)}`);
}
const waze = (p: { lat: number; lng: number }) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;

async function onLeftHome(st: PresenceState, now: number, prefs: Prefs): Promise<void> {
  if (!prefs.leaveAsk || (st.lastLeft && now - st.lastLeft < 2 * 3600_000)) return;
  st.lastLeft = now;
  const { sportToday } = await import('./sport-coach.js');
  const sp = await sportToday().catch(() => null);
  const gymLikely = !!(sp?.slot && !sp.arrived && !sp.skipped && now > Date.parse(sp.slot.start) - 100 * 60_000 && now < Date.parse(sp.slot.end));
  const trip = gymLikely ? null : await nextTrip(now);
  const hour = Number(localNow(now).hhmm.slice(0, 2));
  const briefDue = prefs.brief && hour < 12 && !did(st, 'brief') && !(await routinePausedReason(localNow(now).date).catch(() => null));
  const guess = gymLikely ? ` À la salle pour ton ${sp!.label} ?` : trip ? ` Pour « ${trip.name} » à ${hm(trip.start)} ?` : '';
  const lines = [`🚗 Je te vois partir de la maison (${hm(now)}). Tu vas où ?${guess}`,
    briefDue ? `Si tu es seul, réponds-moi (un mot suffit) : je t'appelle pour ton brief du matin — hier, aujourd'hui, mails, WhatsApp, visites du site.`
      : `Si tu es seul, réponds-moi : on parle, je suis là (trajet, agenda, mails, musique…).`];
  if (gymLikely) {
    await gymPin(sp!.label!);
    lines.push('', await playlistText('la route et la séance'), '', `💪 Allez champion, chaque séance compte !`);
  }
  await queueTelegramMessage(lines.join('\n'));
  st.ask = { kind: 'left', at: now, dest: gymLikely ? 'gym' : trip?.name };
}

async function onGym(st: PresenceState, now: number): Promise<void> {
  const { sportToday } = await import('./sport-coach.js');
  const sp = await sportToday().catch(() => null);
  if (!sp || sp.arrived || sp.skipped) return;
  if (!sp.slot) {                                                  // pas de séance prévue aujourd'hui
    if (did(st, 'gym-extra')) return;
    mark(st, 'gym-extra');
    await queueTelegramMessage(`🏋️ Je te vois à la salle — séance bonus aujourd'hui ? Réponds « oui » et je la valide, puis dis-moi ce que tu fais, je note tout.`);
    st.ask = { kind: 'gym', at: now };
    return;
  }
  const start = Date.parse(sp.slot.start);
  if (now >= start - 25 * 60_000 || did(st, 'gym-ask')) return;    // fenêtre normale : sport-watch valide tout seul
  mark(st, 'gym-ask');
  const cfg = await getRoutineConfig();
  const leave = cfg.days[localNow(now).weekday]?.leave;
  await queueTelegramMessage(`🏋️ Je te vois à la salle, en avance (séance prévue à ${hm(start)}) ! Tu y es bien ?\nRéponds « oui » : je valide ton ${sp.label}, j'avance ta matinée dans l'agenda${leave ? ` et j'annule le rappel de ${leave.replace(':', 'h')}` : ''}.\n\n${await playlistText('ta séance')}`);
  st.ask = { kind: 'gym', at: now };
}

/** Qu'est-ce qu'il est censé faire maintenant d'après l'agenda ? (« 07:20 🏋️ PUSH DAY ») */
async function agendaNow(now: number): Promise<{ text: string; isWork: boolean } | null> {
  const evs = await listAgendaRange(new Date(now - 3 * 3600_000).toISOString(), new Date(now + 45 * 60_000).toISOString(), 20).catch(() => null);
  const cur = (evs ?? []).filter(e => e.start.dateTime && e.end?.dateTime && !/^(🟢|⏰)/u.test(e.summary ?? '')
    && Date.parse(e.start.dateTime) - 45 * 60_000 <= now && Date.parse(e.end.dateTime) > now);
  const e = cur[cur.length - 1];
  return e ? { text: `${hm(Date.parse(e.start.dateTime!))} ${e.summary}`, isWork: /travail|magasin|bureau|boulot|ouverture/i.test(e.summary ?? '') } : null;
}

async function onWork(st: PresenceState, now: number): Promise<void> {
  const hour = Number(localNow(now).hhmm.slice(0, 2));
  if (did(st, 'work') || hour < 5 || hour > 15) return;
  // Pas censé être au travail maintenant (Kouider 20/10 : garé devant le travail à 7h41 au lieu de la salle
  // → « bien arrivé au travail ») : on demande si tout va bien, sans rien valider.
  const ws = workStart((await getRoutineConfig()).days[localNow(now).weekday]?.next);
  const expected = ws ? now >= localTs(localNow(now).date, ws) - 60 * 60_000 : false;
  const cur = await agendaNow(now);
  if (!expected && !cur?.isWork) {
    if (did(st, 'work-odd')) return;
    mark(st, 'work-odd');
    await queueTelegramMessage(`👀 Je te vois au travail (${hm(now)}) alors que ce n'était pas prévu maintenant${cur ? ` — à cette heure-ci ton agenda dit : ${cur.text}` : ws ? ` (travail prévu à ${ws.replace(':', 'h')})` : ''}.\nTout va bien ? Tu fais quoi là-bas ?`);
    st.ask = { kind: 'odd', at: now, dest: cur?.text };
    return;
  }
  mark(st, 'work');
  const evs = await listAgendaRange(new Date(now).toISOString(), new Date(localTs(localNow(now).date, '23:59')).toISOString(), 20).catch(() => null);
  const list = (evs ?? []).filter(e => e.start.dateTime && !/^(🟢|🚿|⏰|🚗)/u.test(e.summary ?? '')).slice(0, 6)
    .map(e => `• ${hm(Date.parse(e.start.dateTime!))} ${e.summary}`);
  await queueTelegramMessage([`💼 Bien arrivé au travail (${hm(now)}). Bonne journée champion !`, list.length ? `\nLa suite :\n${list.join('\n')}` : '',
    did(st, 'brief') ? '' : `\nTon brief du matin t'attend : écris « brief » quand tu es seul (ou « écris-le »).`].filter(Boolean).join('\n'));
}

async function onHomeEvening(st: PresenceState, now: number): Promise<void> {
  const hour = Number(localNow(now).hhmm.slice(0, 2));
  if (did(st, 'home') || hour < 15) return;
  mark(st, 'home');
  const cfg = await getRoutineConfig();
  const tomorrow = localNow(now + 86_400_000);
  const plan = cfg.days[tomorrow.weekday];
  const paused = await routinePausedReason(tomorrow.date, cfg).catch(() => null);
  const evs = await listAgendaRange(new Date(localTs(tomorrow.date, '00:00')).toISOString(), new Date(localTs(tomorrow.date, '23:59')).toISOString(), 20).catch(() => null);
  const first = (evs ?? []).find(e => e.start.dateTime && !/^(🟢|🚿|⏰|🚗)/u.test(e.summary ?? ''));
  await queueTelegramMessage(`🏠 Bien rentré ! Profite de ta famille.\nDemain : ${!paused && plan?.wake ? `réveil ${plan.wake.replace(':', 'h')}` : 'pas de réveil prévu'}${first ? `, ${hm(Date.parse(first.start.dateTime!))} ${first.summary}` : ''}.`);
}

// ── Boucle : chaque position reçue (≤ 1 fois / 45 s) + toutes les 5 min ──────

let lastTick = 0, running = false;
export function onLocationUpdate(): void {
  if (running || Date.now() - lastTick < 45_000) return;
  void jobPresenceWatch().catch(err => console.error('[presence]', err instanceof Error ? err.message : err));
}

export async function jobPresenceWatch(): Promise<void> {
  if (running) return;
  running = true; lastTick = Date.now();
  try {
    const prefs = await getPresencePrefs();
    if (!prefs.enabled) return;
    const st = await getState();
    const now = Date.now();
    const { date, hhmm, weekday } = localNow(now);
    const hour = Number(hhmm.slice(0, 2));
    const loc = await getLocation('kouider').catch(() => null);
    if (loc && now - Date.parse(loc.updated_at) < 20 * 60_000) {
      const place = classify(loc, await places(), st.place);
      const gap = !st.lastFixAt || now - st.lastFixAt > 30 * 60_000;   // partage coupé puis relancé : on se recale sans rien dire
      st.lastFixAt = now;
      if (st.place && !gap && place !== st.place && hour >= 5 && hour < 23) {
        if (st.place === 'home' && place === 'away') await onLeftHome(st, now, prefs);
        else if (st.place === 'home') st.lastLeft = now;   // déjà arrivé ailleurs (positions espacées) : pas de « tu vas où ? »
        if (place === 'gym') await onGym(st, now);
        else if (place === 'work') await onWork(st, now);
        else if (place === 'home') await onHomeEvening(st, now);
      }
      if (place !== st.place) { st.place = place; st.since = now; }
    }

    // Brief : 10 min avant le travail s'il n'a pas eu lieu ; sans réponse 25 min plus tard → écrit
    const cfg = await getRoutineConfig();
    const ws = workStart(cfg.days[weekday]?.next);
    if (prefs.brief && ws && !did(st, 'brief') && !(await routinePausedReason(date, cfg).catch(() => null))) {
      const t = localTs(date, ws);
      if (!did(st, 'brief-ask') && now >= t - 10 * 60_000 && now < t + 60 * 60_000 && !st.ask) {
        mark(st, 'brief-ask');
        st.ask = { kind: 'brief', at: now };
        await queueTelegramMessage(`☀️ Ton brief du matin est prêt (hier, aujourd'hui, mails, WhatsApp, visites du site + mes conseils).\nTu es seul ? Réponds « oui » et je t'appelle — « écris-le » pour l'avoir ici, ou « plus tard ».`);
      } else if (st.ask?.kind === 'brief' && now - st.ask.at > 25 * 60_000) {
        await saveState(st);
        await deliverBrief('write');
        return;
      }
    }
    if (st.ask && now - st.ask.at > ASK_TTL) st.ask = undefined;
    await saveState(st);
  } finally { running = false; }
}

// ── Réponse de Kouider sur Telegram ──────────────────────────────────────────

const YES = /^\s*(oui|ouais|ouai|wi|yes|ok|okay|yep|d'?accord|vas[- ]y|go|c'?est bon|exact|grave|bien s[uû]r|carr[ée]ment|wah|ih|نعم|واه)(?=$|[\s,.!👍💪])/i;
const NO = /^\s*(non|no|nan|pas seul|je suis pas seul|laisse|pas maintenant|لا)(?=$|[\s,.!])/i;
const LATER = /plus tard|apr[eè]s|pas maintenant|occup|pas (tout )?seul|avec (ma femme|mon fils|la famille|quelqu)/i;
const WRITE = /[ée]cri[st]|par (message|[ée]crit)|en texte|envoie[- ]le/i;

/** Message écrit de Kouider juste après une question GPS. reply = réponse directe ; note = contexte pour Dzaryx. null = pas concerné. */
export async function handlePresenceReply(message: string): Promise<{ reply?: string; note?: string } | null> {
  const st = await getState();
  const a = st.ask;
  const now = Date.now();
  if (!a || now - a.at > ASK_TTL) return null;
  const msg = message.trim();
  st.ask = undefined;
  const busy = NO.test(msg) || LATER.test(msg);
  if (!busy) st.aloneUntil = now + 45 * 60_000;
  await saveState(st);
  await import('./whatsapp-web.js').then(m => m.clearWaPending()).catch(() => {});

  if (a.kind === 'gym') {
    if (NO.test(msg)) return { note: `[Contexte : tu lui as demandé (GPS) s'il était à la salle de sport ; il répond non. Ne valide rien ; demande-lui en une phrase où il est ou ce qu'il fait.]` };
    if (!YES.test(msg) && !/salle|suis l[àa]|arriv|sport/i.test(msg)) return { note: `[Contexte : tu lui as demandé (GPS) s'il était bien à la salle. Sa réponse n'est pas un oui clair : réponds à ce qu'il dit ; s'il est bien à la salle, il peut écrire « oui ».]` };
    const { confirmGymArrival } = await import('./sport-coach.js');
    const r = await confirmGymArrival(now);
    emitProactive('💪 Séance validée — tu es à la salle', 'reminder', r.text, 'kouider', 'sport');
    return { reply: [`✅ C'est noté champion, tu es à la salle !`, r.shifted.length ? `🗓️ Agenda avancé : ${r.shifted.join(' · ')} — plus de rappel de départ.` : `🔕 Plus de rappel de départ ni d'appel pour la salle aujourd'hui.`, '', r.text].join('\n') };
  }

  if (a.kind === 'odd') {
    return { note: `[Contexte : tu l'as vu (GPS) au travail alors que ce n'était pas prévu à cette heure${a.dest ? ` (l'agenda disait : ${a.dest})` : ''}, et tu lui as demandé si tout va bien et ce qu'il fait là. Voici sa réponse : réagis avec bienveillance. S'il a sauté ou raté quelque chose de l'agenda (ex. le sport), propose de décaler (outil sport_coach / agenda) au lieu de le lui reprocher. S'il y a un souci, aide-le.]` };
  }

  if (a.kind === 'brief') {
    if (WRITE.test(msg)) { await deliverBrief('write'); return { reply: '✍️ Voilà ton brief juste au-dessus. Dis-moi si tu veux que je détaille un point.' }; }
    if (busy) return { reply: `👌 Je te le garde. Écris « brief » quand tu es seul et je t'appelle (ou « écris-le »).` };
    if (YES.test(msg)) { void deliverBrief('call').catch(err => console.error('[presence] brief call:', err)); return { reply: '📞 Parfait, je t\'appelle dans un instant pour ton brief (je te l\'écris aussi ici).' }; }
    return null;
  }

  // a.kind === 'left' : il a répondu → il est seul (sauf s'il dit le contraire)
  const briefDue = !did(st, 'brief') && Number(localNow(now).hhmm.slice(0, 2)) < 12 && (await getPresencePrefs()).brief;
  let briefNote = '';
  if (briefDue && !busy) {
    if (WRITE.test(msg)) { await deliverBrief('write'); briefNote = 'Son brief du matin vient de lui être envoyé par écrit juste avant ta réponse : dis-le en une demi-phrase.'; }
    else {
      setTimeout(() => { void deliverBrief('call').catch(err => console.error('[presence] brief call:', err)); }, 20_000);
      briefNote = "Je l'appelle dans 20 secondes pour son brief du matin (déjà lancé, le texte arrive aussi sur Telegram) : dis-le-lui en une phrase et ne fais PAS le brief toi-même.";
    }
  }
  let gymNote = '';
  if (a.dest !== 'gym' && /salle|sport|muscu|gym|entra[iî]n/i.test(msg)) {
    const { sportToday } = await import('./sport-coach.js');
    const sp = await sportToday().catch(() => null);
    if (sp?.slot && !sp.arrived) { await gymPin(sp.label!); await queueTelegramMessage(await playlistText('la route et la séance')); }
    gymNote = 'Il va à la salle : le lien Waze et des playlists lui ont été envoyés ; motive-le en une phrase.';
  }
  return { note: busy
    ? `[Contexte : ce message répond à « je te vois partir de la maison, tu vas où ? » (GPS). Il n'est PAS seul ou pas dispo : reste bref et discret, pas d'infos privées. Le brief du matin est reporté (10 min avant le travail, ou quand il écrit « brief »).]`
    : `[Contexte : ce message répond à « je te vois partir de la maison, tu vas où ? » (GPS). Kouider est SEUL et libre de parler pendant ~45 min. Réponds comme un vrai assistant : réagis à où il va (si c'est un lieu ou un RDV : temps de trajet avec gps_assistant action eta), encourage-le, propose 1 ou 2 trucs utiles (musique, agenda, mails, appel). ${gymNote} ${briefNote}]` };
}

// ── Outil gps_assistant ──────────────────────────────────────────────────────

async function nearby(q: string, p: { lat: number; lng: number }): Promise<string> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  const fallback = `🗺️ https://www.google.com/maps/search/${encodeURIComponent(q)}/@${p.lat},${p.lng},14z`;
  if (!key) return fallback;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&location=${p.lat},${p.lng}&radius=4000&language=fr&key=${key}`);
    const j = await r.json() as { status: string; results?: Array<{ name: string; formatted_address?: string; rating?: number; opening_hours?: { open_now?: boolean }; geometry: { location: { lat: number; lng: number } } }> };
    const list = (j.results ?? []).map(x => ({ ...x, d: km(p, x.geometry.location) })).sort((a, b) => a.d - b.d).slice(0, 4);
    if (!list.length) return fallback;
    return list.map(x => `• ${x.name} — ${x.d.toFixed(1)} km${x.opening_hours?.open_now === true ? ' · ouvert' : x.opening_hours?.open_now === false ? ' · fermé' : ''}${x.rating ? ` · ${x.rating}★` : ''}${x.formatted_address ? `\n  ${x.formatted_address}` : ''}\n  🧭 https://waze.com/ul?ll=${x.geometry.location.lat},${x.geometry.location.lng}&navigate=yes`).join('\n');
  } catch { return fallback; }
}

/** Outil gps_assistant (Kouider seulement). */
export async function presenceTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'status');
  const loc = await getLocation('kouider').catch(() => null);
  const age = loc ? Math.round((Date.now() - Date.parse(loc.updated_at)) / 60000) : null;
  const fresh = loc && age !== null && age < 30 ? { lat: loc.lat, lng: loc.lng } : null;
  const noGps = `Je n'ai pas sa position récente${age !== null ? ` (dernière il y a ${age} min)` : ''} : il doit partager sa position en direct dans le chat Telegram de Dzaryx (📎 → Position → « jusqu'à désactivation »).`;

  switch (action) {
    case 'status': {
      const st = await getState();
      if (!fresh) return noGps;
      const pts = await places();
      const dist = await Promise.all(pts.filter(p => km(fresh, p) > RADIUS[p.id]).map(async p => {
        const t = km(fresh, p) < 150 ? await drive(fresh, p).catch(() => null) : null;
        return `${NAME[p.id]} : ${km(fresh, p).toFixed(1)} km${t ? `, ${t.min} min en voiture maintenant` : ''}`;
      }));
      const trip = await nextTrip(Date.now());
      return [`📍 Kouider est ${st.place && st.place !== 'away' ? `à ${NAME[st.place]}` : `en déplacement${loc!.city ? ` (${loc!.city})` : ''}`}${st.since ? ` depuis ${hm(st.since)}` : ''} — position d'il y a ${age} min (${fresh.lat.toFixed(4)}, ${fresh.lng.toFixed(4)}).`,
        st.aloneUntil && st.aloneUntil > Date.now() ? '🗣️ Il a confirmé être seul : libre de parler.' : '',
        dist.length ? `Distances : ${dist.join(' ; ')}.` : '',
        trip ? `Prochain RDV avec adresse : ${trip.name} à ${hm(trip.start)} (${trip.location}).` : '',
        `Aujourd'hui déjà fait : ${(st.done[localNow().date] ?? []).join(', ') || 'rien'}.`].filter(Boolean).join('\n');
    }
    case 'eta': {
      const dest = String(input['destination'] ?? '').trim();
      if (!dest) return 'Donne destination (adresse, lieu, « salle », « maison », « travail »).';
      if (!fresh) return noGps;
      const known = (await places()).find(p => (p.id === 'gym' && /salle|gym|sport/i.test(dest)) || (p.id === 'home' && /maison|chez moi/i.test(dest)) || (p.id === 'work' && /travail|boulot|magasin/i.test(dest)));
      const g = known ?? await geocode(dest);
      if (!g) return `Adresse introuvable : « ${dest} ».`;
      const t = await drive(fresh, g);
      if (!t) return `Trajet impossible à calculer vers « ${dest} » (${km(fresh, g).toFixed(1)} km à vol d'oiseau).`;
      const extra = t.min - t.normal;
      return `🚗 ${dest} : ${t.min} min (${t.km} km)${extra >= 5 ? `, 🔴 trafic +${extra} min` : extra >= 2 ? ', 🟡 un peu de trafic' : ', 🟢 fluide'} → arrivée vers ${hm(Date.now() + t.min * 60_000)}.\n🧭 https://waze.com/ul?ll=${g.lat},${g.lng}&navigate=yes`;
    }
    case 'nearby': {
      const q = String(input['query'] ?? '').trim();
      if (!q) return 'Donne query (ex. « station essence », « pharmacie de garde », « café »).';
      if (!fresh) return noGps;
      return `📍 Autour de lui — ${q} :\n${await nearby(q, fresh)}`;
    }
    case 'brief': {
      const mode = String(input['mode'] ?? 'text');
      if (mode === 'call' || mode === 'write') {
        const txt = await deliverBrief(mode);
        return mode === 'call' ? `Brief envoyé sur Telegram et appel lancé.\n\n${txt}` : `Brief envoyé sur Telegram :\n\n${txt}`;
      }
      const b = await buildMorningBrief(input['refresh'] === true);
      const st = await getState();
      if (!did(st, 'brief')) { mark(st, 'brief'); await saveState(st); }
      return `${b.written}\n\n(Version orale : ${b.spoken})`;
    }
    case 'playlist': {
      const txt = await playlistText(String(input['for'] ?? 'toi'), input['query'] ? String(input['query']) : undefined);
      if (input['send'] !== false) await queueTelegramMessage(txt);
      return txt;
    }
    case 'music': {
      const artists = Array.isArray(input['artists']) ? (input['artists'] as unknown[]).map(String).map(s => s.trim()).filter(Boolean) : [];
      const prefs = await getPresencePrefs();
      if (artists.length) {
        const music = input['replace'] === true ? artists : [...new Set([...artists, ...prefs.music])];
        await kvSet(PREFS_KEY, JSON.stringify({ ...prefs, music: music.slice(0, 30) }));
        return `🎧 Goûts musicaux enregistrés : ${music.slice(0, 30).join(', ')}.`;
      }
      return `🎧 Ses artistes : ${prefs.music.join(', ')}.`;
    }
    case 'settings': {
      const prefs = await getPresencePrefs();
      const next: Prefs = { ...prefs };
      if (typeof input['enabled'] === 'boolean') next.enabled = input['enabled'];
      if (typeof input['leave_ask'] === 'boolean') next.leaveAsk = input['leave_ask'];
      if (typeof input['brief'] === 'boolean') next.brief = input['brief'];
      await kvSet(PREFS_KEY, JSON.stringify(next));
      return `⚙️ Assistant GPS : ${next.enabled ? 'activé' : 'coupé'} · question au départ de la maison : ${next.leaveAsk ? 'oui' : 'non'} · brief du matin auto : ${next.brief ? 'oui' : 'non'}.`;
    }
    default:
      return 'action inconnue (status, eta, nearby, brief, playlist, music, settings).';
  }
}
