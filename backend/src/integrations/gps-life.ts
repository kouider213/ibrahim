/**
 * VIE GPS (Jarvis 4, 28/10/2026) — chaque position Telegram en direct de Kouider (≤ 1/45 s) passe ici :
 *  - trace + visites (lieux où il reste ≥ 10 min, nommés) → Total Recall, banque du temps, « où je suis garé ? »
 *  - ANGE GARDIEN : vite (≥ 80 km/h) puis immobile ≥ 6 min hors lieu connu, ou immobile ≥ 45 min la nuit dans un lieu
 *    inconnu → « tout va bien ? » ; pas de réponse 5 min → appel ; appel sans réponse 10 min → contact d'urgence (WhatsApp)
 *  - FATIGUE AU VOLANT : 2 h de route d'affilée (1 h 15 la nuit) → pause + aire la plus proche
 *  - MODE ORAN : son téléphone arrive en Algérie → tout bascule (dinars, Houari prévenu, famille) ; retour → normal
 *  - CHECK-LIST AU DÉPART : il quitte la maison → il ne parle que s'il manque quelque chose d'important aujourd'hui
 *  - PROSPECTS AUTOUR : arrêt en France / Algérie près de commerces sans site → 2 phrases FIK Sites
 */
import { kvJson, kvPut, tg, ai, research } from './ai-util.js';
import { localNow, getRoutineConfig, lastKouiderActivity } from './morning-routine.js';
import { geocode, km } from './departures.js';

interface Pt { t: number; lat: number; lng: number }
export interface Visit { lat: number; lng: number; from: number; to: number; label?: string; place?: Known }
type Known = 'home' | 'gym' | 'work';
interface GpsState {
  last?: Pt & { kmh: number };
  stay?: Pt;                         // ancre : il est resté dans 150 m depuis stay.t
  drive?: { start: number; lastMove: number; fatigueSaid?: boolean; maxKmh: number };
  fastAt?: number;                   // dernier moment à ≥ 80 km/h
  angel?: { at: number; lat: number; lng: number; step: 'asked' | 'called' | 'alerted'; why: string };
  nightSaid?: string;                // date de la nuit déjà vérifiée
  wasHome?: boolean; homeSince?: number; checklistDate?: string;
  prospectsDay?: string; prospectsN?: number;
  dejaFor?: number;                  // arrêt (stay.t) déjà vérifié pour le déjà-vu
}
const STATE = 'gps:state', TRACK = 'gps:track', VISITS = 'gps:visits', PARKING = 'gps:parking', ORAN = 'mode:oran', ANGEL_CFG = 'angel:cfg';
const STAY_M = 0.15;

let busy = false;
export function onLocationPoint(lat: number, lng: number): void {
  if (busy) return;
  busy = true;
  void handle({ t: Date.now(), lat, lng }).catch(e => console.error('[gps-life]', e instanceof Error ? e.message : e)).finally(() => { busy = false; });
}

let knownCache: { at: number; list: Array<{ id: Known; lat: number; lng: number }> } | null = null;
export async function knownPlaces(): Promise<Array<{ id: Known; lat: number; lng: number }>> {
  if (knownCache && Date.now() - knownCache.at < 6 * 3600_000) return knownCache.list;
  const a = (await getRoutineConfig()).addresses;
  const list: Array<{ id: Known; lat: number; lng: number }> = [];
  for (const id of ['home', 'gym', 'work'] as const) { const g = await geocode(a[id]).catch(() => null); if (g) list.push({ id, ...g }); }
  knownCache = { at: Date.now(), list };
  return list;
}
const placeOf = (p: { lat: number; lng: number }, list: Array<{ id: Known; lat: number; lng: number }>) => list.find(x => km(p, x) < 0.35)?.id;
const inAlgeria = (p: { lat: number; lng: number }) => p.lat >= 18 && p.lat <= 37.5 && p.lng >= -9 && p.lng <= 12;
const inFrance = (p: { lat: number; lng: number }) => p.lat >= 42 && p.lat <= 51.1 && p.lng >= -5 && p.lng <= 8.3 && !(p.lat > 49.5 && p.lng > 2.6);

async function handle(p: Pt): Promise<void> {
  const st = await kvJson<GpsState>(STATE, {});
  const known = await knownPlaces();
  const here = placeOf(p, known);
  // Vitesse depuis le point précédent (≥ 30 s d'écart, sinon le GPS saute)
  const dt = st.last ? (p.t - st.last.t) / 3600_000 : 0;
  const kmh = st.last && dt > 30 / 3600 && dt < 0.25 ? km(st.last, p) / dt : 0;
  if (st.last && p.t - st.last.t < 30_000) return;
  const track = await kvJson<Pt[]>(TRACK, []);
  track.push(p);
  await kvPut(TRACK, track.filter(x => p.t - x.t < 8 * 86_400_000).slice(-2500));
  if (kmh >= 80) st.fastAt = p.t;

  // ── Séjours / visites ──
  if (!st.stay || km(st.stay, p) > STAY_M) {
    if (st.stay && p.t - st.stay.t >= 10 * 60_000) await closeVisit(st.stay, st.last?.t ?? p.t, known);
    // Garé : il roulait, il s'arrête hors de chez lui → première position de l'arrêt = la voiture (CarPlay corrige si dispo)
    st.stay = p;
  }
  const stayMin = (p.t - st.stay.t) / 60_000;

  // ── Conduite + fatigue ──
  if (kmh >= 25) {
    st.drive = st.drive && p.t - st.drive.lastMove < 12 * 60_000 ? { ...st.drive, lastMove: p.t, maxKmh: Math.max(st.drive.maxKmh, kmh) } : { start: p.t, lastMove: p.t, maxKmh: kmh };
    const h = Number(localNow().hhmm.slice(0, 2));
    const night = h >= 22 || h < 5;
    const drivenMin = (p.t - st.drive.start) / 60_000;
    if (!st.drive.fatigueSaid && drivenMin >= (night ? 75 : 120)) {
      st.drive.fatigueSaid = true;
      const { nearby } = await import('./presence.js');
      const aires = await nearby('aire de repos station service café', p).catch(() => '');
      await tg(`😴 Ça fait ${Math.floor(drivenMin / 60)} h ${String(Math.round(drivenMin % 60)).padStart(2, '0')} que tu roules${night ? ' et il est tard' : ''}. Une pause de 15 min te rend 1 h de vigilance.\nLe plus proche :\n${aires.split('\n').slice(0, 4).join('\n')}`);
    }
  } else if (st.drive && p.t - st.drive.lastMove > 12 * 60_000) {
    if (st.drive.maxKmh >= 25 && !here) await kvPut(PARKING, { lat: st.stay.lat, lng: st.stay.lng, at: st.stay.t, how: 'gps' });
    st.drive = undefined;
  }

  // ── Déjà-vu : arrêt de 4 min dans un endroit déjà visité (hors maison / salle / travail) ──
  if (!here && stayMin >= 4 && st.dejaFor !== st.stay.t && !st.drive) {
    st.dejaFor = st.stay.t;
    void import('./wow.js').then(m => m.dejaVu(st.stay!)).catch(() => {});
  }

  // ── Ange gardien ──
  await angel(st, p, here, stayMin);

  // ── Départ de la maison → check-list ──
  const home = here === 'home';
  if (home && !st.wasHome) st.homeSince = p.t;
  if (!home && st.wasHome && st.homeSince && p.t - st.homeSince > 20 * 60_000 && km(p, known.find(k => k.id === 'home') ?? p) > 0.3) {
    const { date, hhmm } = localNow();
    if (st.checklistDate !== date && hhmm >= '05:00' && hhmm <= '21:30') { st.checklistDate = date; void departureChecklist().catch(() => {}); }
  }
  st.wasHome = home;

  // ── Mode Oran ──
  await oranSwitch(p);

  // ── Prospects autour (arrêt de 5-6 min, France / Algérie, heures ouvrées) ──
  const { date, hhmm } = localNow();
  if (!here && stayMin >= 5 && stayMin < 6.5 && hhmm >= '09:30' && hhmm <= '19:00' && (inAlgeria(p) || inFrance(p))
    && (st.prospectsDay !== date || (st.prospectsN ?? 0) < 2)) {
    if (st.prospectsDay !== date) { st.prospectsDay = date; st.prospectsN = 0; }
    st.prospectsN = (st.prospectsN ?? 0) + 1;
    void prospectsAround(p).catch(() => {});
  }

  st.last = { ...p, kmh };
  await kvPut(STATE, st, 3 * 86_400);
  void import('./conscience.js').then(m => m.noteMovement(here ?? (kmh >= 25 ? 'route' : 'ailleurs'))).catch(() => {});
}

async function placeName(p: { lat: number; lng: number }): Promise<string> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${p.lat},${p.lng}&rankby=distance&language=fr&key=${key}`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json() as { results?: Array<{ name: string; vicinity?: string; types?: string[] }> };
    const x = (j.results ?? []).find(v => !(v.types ?? []).includes('route') && !(v.types ?? []).includes('locality'));
    return x ? `${x.name}${x.vicinity ? `, ${x.vicinity}` : ''}` : `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
  } catch { return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`; }
}

async function closeVisit(stay: Pt, to: number, known: Array<{ id: Known; lat: number; lng: number }>): Promise<void> {
  const place = placeOf(stay, known);
  const visits = await kvJson<Visit[]>(VISITS, []);
  // Lieu déjà nommé à 100 m près : on réutilise le nom (pas d'appel Google)
  const same = visits.find(v => v.label && km(v, stay) < 0.1);
  const label = place ? { home: 'Maison', gym: 'Salle de sport', work: 'Travail' }[place] : same?.label ?? await placeName(stay);
  visits.push({ lat: stay.lat, lng: stay.lng, from: stay.t, to, label, ...(place ? { place } : {}) });
  await kvPut(VISITS, visits.filter(v => to - v.to < 400 * 86_400_000).slice(-3000));
}

// ── Ange gardien ─────────────────────────────────────────────────────────────
interface AngelCfg { enabled: boolean; contact?: string; contactName?: string }
export async function angelCfg(): Promise<AngelCfg> { return { enabled: true, ...(await kvJson<Partial<AngelCfg>>(ANGEL_CFG, {})) }; }

async function angel(st: GpsState, p: Pt, here: Known | undefined, stayMin: number): Promise<void> {
  const cfg = await angelCfg();
  if (!cfg.enabled) return;
  const active = await lastKouiderActivity();
  if (st.angel) {
    // Il a donné signe de vie (message, appel décroché) ou il repart → fin de l'alerte
    if (active > st.angel.at || stayMin < 1) { st.angel = undefined; return; }
    const waited = (p.t - st.angel.at) / 60_000;
    if (st.angel.step === 'asked' && waited >= 5) {
      st.angel.step = 'called';
      const { callOwner } = await import('../notifications/voice-call.js');
      await callOwner(`Je t'appelle parce que ${st.angel.why}. Dis-moi juste que tout va bien.`, 'kouider', { force: true }).catch(() => {});
    } else if (st.angel.step === 'called' && waited >= 15) {
      st.angel.step = 'alerted';
      const link = `https://waze.com/ul?ll=${st.angel.lat},${st.angel.lng}&navigate=yes`;
      if (cfg.contact) {
        const { sendWaDirect } = await import('./whatsapp-web.js');
        await sendWaDirect(cfg.contact, `Bonjour${cfg.contactName ? ` ${cfg.contactName}` : ''}, ici l'assistant de Kouider. ${st.angel.why[0]!.toUpperCase()}${st.angel.why.slice(1)} et il ne répond ni aux messages ni à l'appel depuis 15 minutes. Pouvez-vous essayer de le joindre ? Sa position : ${link}`).catch(e => console.error('[angel] contact:', e));
        await tg(`🚨 Pas de réponse : j'ai prévenu ${cfg.contactName ?? cfg.contact} avec ta position.`);
      } else await tg(`🚨 Tu ne réponds pas. Aucun contact d'urgence réglé : dis-moi « ange gardien contact <nom> <numéro> » pour que je puisse prévenir quelqu'un la prochaine fois.\nTa position : ${link}`);
    }
    return;
  }
  if (here) return;
  const sinceActive = p.t - active;
  // Vitesse forte puis arrêt net qui dure, sans signe de vie
  if (st.fastAt && st.stay && st.stay.t - st.fastAt < 3 * 60_000 && stayMin >= 6 && sinceActive > 6 * 60_000) {
    st.fastAt = undefined;
    st.angel = { at: p.t, lat: p.lat, lng: p.lng, step: 'asked', why: 'tu roulais vite et tu t\'es arrêté net hors d\'un lieu connu' };
    await tg('🛡️ Tu roulais vite et tu es arrêté depuis quelques minutes. Tout va bien ? Réponds-moi juste « ok ».');
    return;
  }
  // Immobile la nuit dans un lieu inconnu
  const { date, hhmm } = localNow();
  if ((hhmm >= '23:30' || hhmm < '05:00') && stayMin >= 45 && st.nightSaid !== date && sinceActive > 45 * 60_000) {
    const visits = await kvJson<Visit[]>(VISITS, []);
    if (visits.filter(v => km(v, p) < 0.15).length >= 2) return;   // endroit où il va souvent
    st.nightSaid = date;
    st.angel = { at: p.t, lat: p.lat, lng: p.lng, step: 'asked', why: 'tu es immobile depuis longtemps cette nuit dans un endroit inhabituel' };
    await tg('🛡️ Tu es arrêté depuis 45 min cette nuit dans un endroit que je ne connais pas. Tout va bien ? Réponds-moi « ok ».');
  }
}

// ── Mode Oran ────────────────────────────────────────────────────────────────
export async function oranActive(): Promise<{ since: number } | null> { return kvJson<{ since: number } | null>(ORAN, null); }

async function oranSwitch(p: Pt): Promise<void> {
  const on = await oranActive();
  if (inAlgeria(p) && !on) {
    await kvPut(ORAN, { since: p.t });
    const plan = await research(`Kouider vient d'arriver en Algérie (position ${p.lat.toFixed(3)},${p.lng.toFixed(3)}). Prépare son « mode Oran » en 8 lignes max : réservations FIK en cours et à venir pendant son séjour, voitures libres, ce que Houari doit savoir, 2 choses utiles à faire sur place pour le business, le taux de l'euro au square. Pas de blabla.`, { rounds: 5, sessionId: 'mode-oran' }).catch(() => '');
    await tg(`🇩🇿 Bienvenue en Algérie ! Mode Oran activé : je te parle en heure d'Oran, prix en dinars d'abord, Houari est prévenu.\n\n${plan}\n\nDis-moi les visites famille que tu veux faire, je te les cale dans les trous de l'agenda.`);
    const { queueTelegramMessage } = await import('../notifications/tg-outbox.js');
    await queueTelegramMessage('🇩🇿 Kouider est arrivé en Algérie. Il est joignable sur place : prépare-lui l\'état des voitures et ce qui est en cours.', undefined, 'houari').catch(() => {});
  } else if (on && !inAlgeria(p) && p.t - on.since > 3600_000) {
    await kvPut(ORAN, null);
    await tg('✈️ Tu as quitté l\'Algérie : mode Oran désactivé, je repasse à l\'heure de Bruxelles et aux euros. Bon retour !');
  }
}

// ── Check-list au départ ─────────────────────────────────────────────────────
async function departureChecklist(): Promise<void> {
  const { date } = localNow();
  const { listAgendaRange } = await import('./google-calendar.js');
  const end = new Date(); end.setHours(23, 59, 0, 0);
  const evs = ((await listAgendaRange(new Date().toISOString(), end.toISOString()).catch(() => null)) ?? []) as Array<{ summary?: string; location?: string; start?: { dateTime?: string } }>;
  const trips = (await kvJson<Array<{ who: string; kind: string; title: string; departAt: number }>>('trips:v1', [])).filter(t => t.who === 'kouider' && localNow(t.departAt).date === date);
  const oran = await oranActive();
  let books = '';
  if (oran) {
    const { supabase } = await import('./supabase.js');
    const { data } = await supabase.from('bookings').select('client_name, start_date, end_date, status, cars(name)').or(`start_date.gte.${date},end_date.gte.${date}`).lte('start_date', `${date}T23:59`).limit(10);
    books = JSON.stringify(data ?? []);
  }
  const sport = await import('./sport-coach.js').then(m => m.sportToday()).then(t => t.label && !t.arrived && !t.skipped ? t.label : '').catch(() => '');
  const out = await ai(`Kouider vient de quitter la maison (${localNow().hhmm}). Sa journée :\nAgenda : ${evs.map(e => `${e.start?.dateTime?.slice(11, 16) ?? ''} ${e.summary ?? ''} ${e.location ?? ''}`).join(' | ') || 'rien'}\nVols aujourd'hui : ${trips.map(t => t.title).join(', ') || 'aucun'}\n${oran ? `Il est à Oran, remises/retours de voitures du jour : ${books}\n` : ''}${sport ? `Sport : ${sport}\n` : ''}
Liste UNIQUEMENT les objets qu'il risque d'oublier et qui lui gâcheraient la journée (passeport/billet si vol, clés et contrat si remise de voiture à Oran, sac de sport si séance, document pour un RDV administratif, chargeur si longue journée). Si rien d'important, réponds exactement RIEN.
Sinon : une ligne « Tu as bien : … ? » (3 objets max).`, { max: 200 });
  if (out && !/^RIEN\b/i.test(out.trim())) await tg(`🎒 ${out.trim()}`);
}

// ── Prospects autour ─────────────────────────────────────────────────────────
async function prospectsAround(p: { lat: number; lng: number }): Promise<void> {
  const key = process.env['GOOGLE_MAPS_API_KEY'];
  if (!key) return;
  const r = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${p.lat},${p.lng}&radius=250&language=fr&key=${key}`, { signal: AbortSignal.timeout(8000) });
  const list = ((await r.json() as { results?: Array<{ place_id: string; name: string; types?: string[]; business_status?: string; user_ratings_total?: number }> }).results ?? [])
    .filter(x => x.business_status === 'OPERATIONAL' && !(x.types ?? []).some(t => /route|locality|political|atm|bank|school|church|mosque|hospital|parking|transit|gas_station|lodging/.test(t)))
    .sort((a, b) => (b.user_ratings_total ?? 0) - (a.user_ratings_total ?? 0)).slice(0, 6);
  const seen = await kvJson<string[]>('prospects:around:seen', []);
  const noSite: Array<{ name: string; type: string; addr: string; phone: string }> = [];
  for (const x of list.filter(l => !seen.includes(l.place_id))) {
    const d = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${x.place_id}&fields=website,formatted_phone_number,vicinity&language=fr&key=${key}`, { signal: AbortSignal.timeout(8000) })
      .then(r2 => r2.json() as Promise<{ result?: { website?: string; formatted_phone_number?: string; vicinity?: string } }>).catch(() => null);
    seen.push(x.place_id);
    if (d?.result && !d.result.website) noSite.push({ name: x.name, type: (x.types ?? [])[0] ?? '', addr: d.result.vicinity ?? '', phone: d.result.formatted_phone_number ?? '' });
  }
  await kvPut('prospects:around:seen', seen.slice(-800));
  if (!noSite.length) return;
  const best = noSite[0]!;
  const pitch = await ai(`Kouider vend des sites web (FIK Sites) aux commerces sans site. Il est à côté de « ${best.name} » (${best.type}, ${best.addr}), qui n'a pas de site internet. Écris 2 phrases d'accroche à dire en entrant, naturelles, en français, sans pression, adaptées à ce commerce. Rien d'autre.`, { max: 200 });
  await tg(`🎯 Prospect juste à côté : ${best.name} (${best.addr}) n'a pas de site web${noSite.length > 1 ? ` — et aussi ${noSite.slice(1, 3).map(n => n.name).join(', ')}` : ''}.${best.phone ? `\n📞 ${best.phone}` : ''}\nSi tu veux passer :\n${pitch}\n\nDis « ajoute-le aux prospects » et je le garde.`);
}

// ── Lecture (outils) ─────────────────────────────────────────────────────────
export async function parkingText(): Promise<string> {
  const pk = await kvJson<{ lat: number; lng: number; at: number; how: string } | null>(PARKING, null);
  if (!pk) return 'Je n\'ai pas de position de voiture garée. Avec le Raccourci CarPlay, je la note à chaque fois que tu coupes le moteur.';
  const name = await placeName(pk);
  const { queueTelegramLocation } = await import('../notifications/tg-outbox.js');
  await queueTelegramLocation(pk.lat, pk.lng, '🚗 Ta voiture', name).catch(() => {});
  return `🚗 Garé ${localNow(pk.at).date === localNow().date ? 'aujourd\'hui' : `le ${localNow(pk.at).date.slice(5)}`} à ${localNow(pk.at).hhmm} — ${name}${pk.how === 'carplay' ? '' : ' (déduit du GPS)'}.\nPoint envoyé sur Telegram. À pied : https://www.google.com/maps/dir/?api=1&destination=${pk.lat},${pk.lng}&travelmode=walking`;
}
export async function setParking(lat: number, lng: number): Promise<void> { await kvPut(PARKING, { lat, lng, at: Date.now(), how: 'carplay' }); }

export async function visitsText(fromIso?: string, toIso?: string, q?: string): Promise<string> {
  const from = fromIso ? Date.parse(fromIso) : Date.now() - 14 * 86_400_000, to = toIso ? Date.parse(toIso) : Date.now();
  const vs = (await kvJson<Visit[]>(VISITS, [])).filter(v => v.to >= from && v.from <= to && (!q || (v.label ?? '').toLowerCase().includes(q.toLowerCase())));
  return vs.slice(-80).map(v => `${localNow(v.from).date} ${localNow(v.from).hhmm}-${localNow(v.to).hhmm} ${v.label ?? '?'}`).join('\n');
}

/** Banque du temps : la semaine en heures (maison, travail, salle, route, bouchons, ailleurs) + conseils. */
export async function timeBank(days = 7): Promise<string> {
  const since = Date.now() - days * 86_400_000;
  const vs = (await kvJson<Visit[]>(VISITS, [])).filter(v => v.to > since);
  const track = (await kvJson<Pt[]>(TRACK, [])).filter(x => x.t > since);
  const h: Record<string, number> = {};
  for (const v of vs) { const k = v.place ?? v.label ?? 'ailleurs'; h[k] = (h[k] ?? 0) + (v.to - Math.max(v.from, since)) / 3600_000; }
  let road = 0, jam = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]!, b = track[i]!, dt = (b.t - a.t) / 3600_000;
    if (dt <= 0 || dt > 0.1) continue;
    const s = km(a, b) / dt;
    if (s >= 4) { road += dt; if (s < 18) jam += dt; }
  }
  if (!vs.length && !track.length) return 'Pas encore assez de positions : il faut partager ta position en direct sur Telegram avec Dzaryx.';
  const top = Object.entries(h).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${{ home: 'Maison', work: 'Travail', gym: 'Salle' }[k] ?? k} ${v.toFixed(1)} h`);
  const advice = await ai(`Semaine de Kouider (${days} j) : ${top.join(', ')} ; en voiture ${road.toFixed(1)} h dont ${jam.toFixed(1)} h au pas (bouchons). Donne 2 conseils concrets pour récupérer du temps (décaler les trajets, regrouper les courses, horaires de salle…), chiffrés en heures. 3 lignes max.`, { max: 250 });
  return `⏳ Banque du temps (${days} jours)\n• ${top.join('\n• ')}\n• 🚗 Route : ${road.toFixed(1)} h, dont ${jam.toFixed(1)} h dans les bouchons\n\n${advice}`;
}

export async function jobTimeBank(): Promise<string> {
  const t = await timeBank(7);
  if (!t.startsWith('Pas encore')) await tg(t);
  return 'ok';
}

export async function angelTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'status');
  const cfg = await angelCfg();
  if (a === 'contact') {
    const { waNumber } = await import('./whatsapp-web.js');
    const n = waNumber(String(input['number'] ?? ''), String(input['country'] ?? '') || undefined);
    if (!n || n === 'ASK') return '❌ Donne le numéro complet avec l\'indicatif (+33…, +32…, +213…).';
    await kvPut(ANGEL_CFG, { ...cfg, contact: n.replace(/\D/g, ''), contactName: String(input['name'] ?? '') || undefined });
    return `✅ Contact d'urgence : ${String(input['name'] ?? '')} ${n}. Il ne sera prévenu que si tu ne réponds ni au message ni à l'appel.`;
  }
  if (a === 'on' || a === 'off') { await kvPut(ANGEL_CFG, { ...cfg, enabled: a === 'on' }); return a === 'on' ? '🛡️ Ange gardien activé.' : 'Ange gardien désactivé.'; }
  if (a === 'ok') { const st = await kvJson<GpsState>(STATE, {}); st.angel = undefined; await kvPut(STATE, st, 3 * 86_400); return 'Alerte levée, content que tout aille bien.'; }
  return `🛡️ Ange gardien ${cfg.enabled ? 'actif' : 'désactivé'} · contact d'urgence : ${cfg.contact ? `${cfg.contactName ?? ''} +${cfg.contact}` : 'aucun (dis « ange gardien contact <nom> <numéro> »)'}.\nIl surveille : arrêt net après une route rapide, immobile la nuit dans un lieu inconnu, longue route (fatigue).`;
}

