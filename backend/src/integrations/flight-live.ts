import { randomBytes } from 'node:crypto';
import { kvGet, kvSet } from './app-store.js';
import { supabase } from './supabase.js';
import { readTrips, writeTrips, type Trip } from './trips.js';
import { updateAgendaEvent } from './google-calendar.js';
import { geocode, drive } from './departures.js';
import { getRoutineConfig, lastKouiderActivity, localNow, hm, TZ } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { autoCall, setQuietUntil, quietUntil } from '../notifications/auto-call.js';
import { callOwner, getPendingCall } from '../notifications/voice-call.js';

// SUIVI DES VOLS EN DIRECT (demande de Kouider 2026-11-04) — complète trips.ts (billet → agenda + check-list).
// Toutes les 5 min, pour chaque vol des 30 prochaines heures (Kouider ET clients) :
//  • statut du vol (heure prévue / estimée, retard, annulation, terminal, porte) lu sur le web par Gemini + Google Search
//    (gratuit) ; un retard n'est appliqué qu'après 2 lectures concordantes (pas d'agenda décalé sur une erreur) ;
//  • position en direct dès 30 min avant le départ (radar ADS-B gratuit adsb.lol → airplanes.live, comme le globe) :
//    décollage, km restants, heure d'arrivée estimée, atterrissage ;
//  • retard → agenda FIK décalé (vol + « être à l'aéroport ») → departures.ts recalcule l'heure de partir avec le trafic ;
//  • veille 20h : briefing (vol, heure de partir, réveil, météo d'arrivée, taux €→DA, check-list, demandes de Houari,
//    locations FIK pendant l'absence) ; H-24 enregistrement en ligne ; jour J fiche + réveil appelé si vol tôt ;
//  • pendant le vol : mode avion (pas d'appel), « bien atterri » + décalage horaire à l'arrivée ;
//  • lien de suivi public pour la famille : /api/vol/suivi/<jeton>.
// Données : app_kv `flight:live:<trip id>`.

const PUBLIC = (process.env['PUBLIC_BACKEND_URL'] || 'https://ibrahim-backend-production.up.railway.app').replace(/\/$/, '');
const UA = 'Dzaryx-FIK/1.0 (assistant personnel; contact fikconciergerie.com)';

// Code IATA de la compagnie → code OACI (indicatif radio = OACI + numéro, ex. AH1015 → DAH1015)
const ICAO: Record<string, string> = {
  AH: 'DAH', TB: 'JAF', FR: 'RYR', HV: 'TRA', AF: 'AFR', SN: 'BEL', TO: 'TVF', V7: 'VOE', U2: 'EZY', W6: 'WZZ', W4: 'WMT',
  TU: 'TAR', AT: 'RAM', TK: 'THY', VY: 'VLG', KL: 'KLM', LH: 'DLH', IB: 'IBE', BJ: 'LBT', EK: 'UAE', QR: 'QTR', SV: 'SVA',
  MS: 'MSR', '3O': 'MAC', LX: 'SWR', OS: 'AUA', AZ: 'ITY', TP: 'TAP', UX: 'AEA', PC: 'PGT', XK: 'CCM', BA: 'BAW', EW: 'EWG',
};

export interface LiveState {
  token?: string;
  statusAt?: number;
  sched?: string;                   // « HH:MM » heure prévue lue
  est?: string;                     // « HH:MM » heure estimée de départ
  estArr?: string;
  delay?: number;                   // minutes, dernière lecture
  pendingDelay?: number;            // lecture à confirmer
  applied?: number;                 // retard appliqué à l'agenda
  cancelled?: boolean;
  terminal?: string; gate?: string; cs?: string; reg?: string;
  statusText?: string; statusSrc?: string;
  pos?: { lat: number; lon: number; alt: number; spd: number; trk: number; at: number; ground: boolean };
  to?: { lat: number; lon: number }; from?: { lat: number; lon: number };
  airborneAt?: number; landedAt?: number; etaAt?: number;
  sent: Record<string, number>;     // messages déjà envoyés (clé → quand)
}

const key = (id: string) => `flight:live:${id}`;
export async function liveState(id: string): Promise<LiveState> {
  try { const o = JSON.parse((await kvGet(key(id))) ?? '{}') as Partial<LiveState>; return { ...o, sent: o.sent ?? {} }; } catch { return { sent: {} }; }
}
async function saveState(id: string, st: LiveState): Promise<void> { await kvSet(key(id), JSON.stringify(st), 10 * 86_400); }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isDZ = (p?: string) => /\b(oran|es ?senia|alger|algiers|constantine|annaba|tlemcen|bejaia|setif|alg[eé]rie|algeria)\b/i.test(norm(p ?? ''));
const mine = (t: Trip) => t.who === 'kouider';

export function callsign(flight?: string): string | null {
  const m = String(flight ?? '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z0-9]{2})(\d{1,4})[A-Z]?$/);
  if (!m) return null;
  const icao = ICAO[m[1]!];
  return icao ? `${icao}${m[2]!}` : null;
}
/** Indicatifs à essayer (AFR025 et AFR25), + celui lu sur le web si la compagnie en utilise un autre (Ryanair « RYR53HB »). */
function callsigns(flight?: string, extra?: string): string[] {
  const c = callsign(flight);
  const out = [extra?.toUpperCase().replace(/\s+/g, ''), c, c?.replace(/^([A-Z]{3})0+/, '$1')].filter((x): x is string => !!x && /^[A-Z0-9]{3,8}$/.test(x));
  return [...new Set(out)];
}

/** Heure « HH:MM » d'un timestamp, ou date + heure si autre jour. */
const at = (ts: number, tz: string) => hm(ts, tz);
const tzOffsetH = (tz: string, ts = Date.now()) => {
  const p = (z: string) => { const l = localNow(ts, z); return Date.parse(`${l.date}T${l.hhmm}:00Z`); };
  return Math.round((p(tz) - p('UTC')) / 3_600_000);
};

// ── Sources ─────────────────────────────────────────────────────────────────

async function getJson<T>(url: string, ms = 8000): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.json() as T : null;
  } catch { return null; }
}

/** Position radar en direct (gratuit) par indicatif. */
async function radar(css: string[], reg?: string): Promise<LiveState['pos'] | null> {
  for (const cs of css) { const p = await radarOne(`callsign/${cs}`); if (p) return p; }
  return reg && /^[A-Z0-9-]{3,10}$/i.test(reg) ? radarOne(`reg/${reg.toUpperCase()}`) : null;
}
async function radarOne(path: string): Promise<LiveState['pos'] | null> {
  type Ac = { lat?: number; lon?: number; alt_baro?: number | string; alt_geom?: number; gs?: number; track?: number; seen_pos?: number };
  for (const base of ['https://api.adsb.lol/v2', 'https://api.airplanes.live/v2']) {
    const d = await getJson<{ ac?: Ac[] }>(`${base}/${path}`);
    const a = d?.ac?.find(x => x.lat != null && x.lon != null);
    if (!a) { if (d) return null; continue; }
    const ground = a.alt_baro === 'ground';
    return { lat: a.lat!, lon: a.lon!, alt: ground ? 0 : Math.round(Number(a.alt_baro || a.alt_geom || 0) * 0.3048),
      spd: Math.round(Number(a.gs || 0) * 1.852), trk: Number(a.track || 0), at: Date.now() - Number(a.seen_pos || 0) * 1000, ground };
  }
  return null;
}

/** Statut du vol (heure prévue/estimée, annulé, terminal, porte) lu sur le web par Gemini + Google Search. */
type WebStatus = { sched?: string; est?: string; est_arr?: string; delay_min?: number; cancelled?: boolean; terminal?: string; gate?: string; status?: string; source?: string; callsign?: string; registration?: string };

/** Clé d'un service de vols : variable Railway ou app_kv `cfg:<nom>` (posée par « set_key »). */
async function apiKey(env: string, kv: string): Promise<string | null> {
  return process.env[env]?.trim() || (await kvGet(`cfg:${kv}`).catch(() => null))?.trim() || null;
}
/** Quota mensuel d'un service (gratuit) : false si épuisé ce mois-ci. */
async function spend(name: string, perMonth: number): Promise<boolean> {
  const k = `flight:quota:${name}:${new Date().toISOString().slice(0, 7)}`;
  const n = Number((await kvGet(k).catch(() => null)) ?? 0);
  if (n >= perMonth) return false;
  await kvSet(k, String(n + 1), 40 * 86_400);
  return true;
}
const hhmmOf = (v: unknown, tz: string): string | undefined => {
  const str = String(v ?? '');
  if (!str) return undefined;
  const ts = /[zZ]|[+-]\d{2}:?\d{2}$/.test(str) ? Date.parse(str) : NaN;
  if (Number.isFinite(ts)) return localNow(ts, tz).hhmm;
  const m = str.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : undefined;
};
const STATUS_FR: Record<string, string> = { scheduled: "à l'heure", active: 'parti', 'en-route': 'en vol', landed: 'atterri', cancelled: 'annulé', diverted: 'dérouté', delayed: 'retardé', incident: 'incident' };

/** AirLabs (gratuit 1000 demandes/mois, clé AIRLABS_API_KEY). Heures locales des aéroports. */
async function airlabs(t: Trip): Promise<WebStatus | null> {
  const key = await apiKey('AIRLABS_API_KEY', 'airlabs_key');
  if (!key || !t.flightNumber || !(await spend('airlabs', 950))) return null;
  const j = await getJson<{ response?: Record<string, unknown>; error?: unknown }>(`https://airlabs.co/api/v9/flight?flight_iata=${encodeURIComponent(t.flightNumber)}&api_key=${key}`, 12_000);
  const r = j?.response;
  if (!r || !r['dep_time']) return null;
  if (String(r['dep_time']).slice(0, 10) !== localNow(t.departAt, t.tz).date) return null;      // autre jour (vol de demain pas encore publié)
  const st = String(r['status'] ?? '');
  const delay = Number(r['dep_delayed'] ?? r['delayed'] ?? 0) || 0;
  return { sched: hhmmOf(r['dep_time'], t.tz), est: hhmmOf(r['dep_actual'] ?? r['dep_estimated'], t.tz), est_arr: hhmmOf(r['arr_estimated'], guessTzOf(t.to)),
    delay_min: delay, cancelled: st === 'cancelled', terminal: r['dep_terminal'] ? String(r['dep_terminal']) : undefined, gate: r['dep_gate'] ? String(r['dep_gate']) : undefined,
    status: delay >= 15 && (!st || st === 'scheduled') ? 'retardé' : STATUS_FR[st] ?? (st || undefined), source: 'AirLabs', callsign: r['flight_icao'] ? String(r['flight_icao']) : undefined,
    registration: r['reg_number'] ? String(r['reg_number']) : undefined };
}

/** Aviationstack (gratuit 100 demandes/mois, clé AVIATIONSTACK_API_KEY) : seulement les 4 dernières heures. */
async function aviationstack(t: Trip): Promise<WebStatus | null> {
  const key = await apiKey('AVIATIONSTACK_API_KEY', 'aviationstack_key');
  if (!key || !t.flightNumber || (t.departAt - Date.now()) > 4 * 3600_000 || !(await spend('aviationstack', 95))) return null;
  type Side = { scheduled?: string; estimated?: string; actual?: string; delay?: number | null; terminal?: string | null; gate?: string | null };
  const j = await getJson<{ data?: Array<{ flight_date?: string; flight_status?: string; departure?: Side; arrival?: Side; flight?: { icao?: string }; aircraft?: { registration?: string } | null }> }>(
    `http://api.aviationstack.com/v1/flights?access_key=${key}&flight_iata=${encodeURIComponent(t.flightNumber)}`, 12_000);
  const day = localNow(t.departAt, t.tz).date;
  const f = j?.data?.find(x => x.flight_date === day);
  if (!f?.departure) return null;
  const d = f.departure, st = String(f.flight_status ?? '');
  const delay = Number(d.delay ?? 0) || 0;
  // Aviationstack écrit l'heure LOCALE suivie de « +00:00 » : on ne garde que HH:MM
  const hh = (v?: string) => v?.match(/T(\d{2}:\d{2})/)?.[1];
  return { sched: hh(d.scheduled), est: hh(d.actual ?? d.estimated), est_arr: hh(f.arrival?.estimated), delay_min: delay,
    cancelled: st === 'cancelled', terminal: d.terminal ?? undefined, gate: d.gate ?? undefined, status: delay >= 15 && (!st || st === 'scheduled') ? 'retardé' : STATUS_FR[st] ?? (st || undefined),
    source: 'Aviationstack', callsign: f.flight?.icao, registration: f.aircraft?.registration };
}

/** Statut : AirLabs → Aviationstack → Gemini + Google Search (le premier qui répond). */
async function webStatus(t: Trip): Promise<WebStatus | null> {
  for (const src of [airlabs, aviationstack, geminiStatus]) {
    const r = await src(t).catch(() => null);
    if (r) return r;
  }
  return null;
}

async function geminiStatus(t: Trip): Promise<WebStatus | null> {
  const keys = [process.env['GEMINI_API_KEY'], ...(process.env['GEMINI_API_KEYS'] ?? '').split(',')].map(k => k?.trim()).filter(Boolean) as string[];
  if (!keys.length || !t.flightNumber) return null;
  const day = localNow(t.departAt, t.tz).date;
  const prompt = `Cherche le statut EN DIRECT du vol ${t.flightNumber}${t.airline ? ` (${t.airline})` : ''} du ${day}, de ${t.from} vers ${t.to} (départ prévu ${at(t.departAt, t.tz)} heure locale).
Sources : site de l'aéroport de départ, de la compagnie, FlightAware, Flightradar24, FlightStats.
Réponds UNIQUEMENT en JSON : {"found": bool, "sched": "HH:MM", "est": "HH:MM heure de départ estimée ou réelle", "est_arr": "HH:MM", "delay_min": nombre, "cancelled": bool, "terminal": "", "gate": "", "status": "à l'heure | retardé | embarquement | parti | atterri | annulé", "callsign": "indicatif OACI radio si connu (ex. RYR53HB)", "registration": "immatriculation de l'avion si connue (ex. 7T-VJK)", "source": "site"}
Si tu ne trouves pas d'info fiable pour CE vol à CETTE date : {"found": false}. N'invente rien.`;
  for (const k of [...new Set(keys)].slice(0, 3)) for (const model of ['gemini-3.5-flash', 'gemini-flash-latest']) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
      });
      const j = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const txt = j.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
      if (!txt.includes('{')) continue;
      const o = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)) as Record<string, unknown>;
      if (!o['found']) return null;
      return o as never;
    } catch { /* modèle / clé suivant */ }
  }
  return null;
}

async function airportPoint(name: string): Promise<{ lat: number; lon: number } | null> {
  const g = await geocode(/a[ée]roport|airport/i.test(name) ? name : `Aéroport ${name}`);
  return g ? { lat: g.lat, lon: g.lng } : null;
}
const distKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = Math.PI / 180, x = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, x)));
};

// ── Envoi ───────────────────────────────────────────────────────────────────

async function tell(t: Trip, st: LiveState, tag: string, text: string, title?: string): Promise<void> {
  if (st.sent[tag]) return;
  st.sent[tag] = Date.now();
  await saveState(t.id, st);
  await queueTelegramMessage(text);
  emitProactive(title ?? text.split('\n')[0]!, 'reminder', text);
}

const iso = (ts: number) => { const l = localNow(ts, 'Africa/Algiers'); return `${l.date}T${l.hhmm}:00`; };   // updateAgendaEvent = heure d'Alger

/** Décale le vol + « être à l'aéroport » dans l'agenda, et relance le calcul « quand partir ». */
async function shiftAgenda(t: Trip, minutes: number): Promise<void> {
  const [flightId, airportId] = t.calendarIds;
  const dep = t.departAt + minutes * 60_000;
  const end = (t.arriveAt ?? t.departAt + 3 * 3600_000) + minutes * 60_000;
  // Kouider : l'événement = le vol (départ → arrivée) ; client : l'événement = son ARRIVÉE (1 h)
  if (flightId) await updateAgendaEvent(flightId, mine(t) ? { start: iso(dep), end: iso(end) } : { start: iso(end), end: iso(end + 3600_000) }).catch(() => false);
  if (airportId && mine(t)) {
    const a = dep - 150 * 60_000;
    await updateAgendaEvent(airportId, { start: iso(a), end: iso(a + 30 * 60_000),
      title: `🧳 Être à l'aéroport (vol ${t.flightNumber ?? ''} retardé à ${at(dep, t.tz)})` }).catch(() => false);
    await kvSet(`dep:${airportId}`, '{}', 86_400);              // departures.ts recalcule l'heure de partir
  }
}

// ── Le briefing de la veille ────────────────────────────────────────────────

async function weatherAt(p: { lat: number; lon: number }, date: string): Promise<string> {
  const d = await getJson<{ daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[]; weather_code?: number[] } }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(3)}&longitude=${p.lon.toFixed(3)}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&start_date=${date}&end_date=${date}`);
  const x = d?.daily;
  if (!x?.temperature_2m_max?.length) return '';
  const code = x.weather_code?.[0] ?? 0;
  const sky = code >= 95 ? 'orages' : code >= 61 ? 'pluie' : code >= 51 ? 'bruine' : code >= 45 ? 'brouillard' : code >= 3 ? 'couvert' : code >= 1 ? 'quelques nuages' : 'soleil';
  return `${Math.round(x.temperature_2m_min![0]!)}–${Math.round(x.temperature_2m_max[0]!)} °C, ${sky}${(x.precipitation_probability_max?.[0] ?? 0) >= 40 ? ` (pluie ${x.precipitation_probability_max![0]} %)` : ''}`;
}

async function bookingsDuring(from: string, to: string): Promise<string[]> {
  const { data } = await supabase.from('bookings').select('client_name, start_date, end_date, cars(name)')
    .in('status', ['PENDING', 'CONFIRMED', 'ACTIVE']).lte('start_date', to).gte('end_date', from).order('start_date').limit(12);
  return ((data ?? []) as Array<{ client_name: string; start_date: string; end_date: string; cars?: { name?: string } | null }>)
    .map(b => `${b.client_name} (${b.cars?.name ?? 'voiture'}) ${b.start_date.slice(5)} → ${b.end_date.slice(5)}`);
}

async function leavePlan(t: Trip, st: LiveState): Promise<{ leave: number; min: number; km: number } | null> {
  const cfg = await getRoutineConfig();
  const home = await geocode(cfg.addresses.home);
  const ap = await geocode(t.airport ?? `Aéroport ${t.from}`);
  if (!home || !ap) return null;
  const r = await drive(home, ap);
  if (!r || r.km > 300) return null;                     // pas un départ « de la maison » (ex. retour depuis Oran)
  const beAt = t.departAt + (st.applied ?? 0) * 60_000 - 150 * 60_000;
  return { leave: beAt - (r.min + 10) * 60_000, min: r.min, km: r.km };
}

function requestsOf(list: Trip[], t: Trip): string[] {
  const back = list.find(x => x.returnOf === t.id);
  return [...t.checklist, ...(back?.checklist ?? [])].filter(i => i.for && !i.done).map(i => `${i.for} : ${i.label.replace(/^🎁\s*[^:]+:\s*/u, '')}${back?.checklist.includes(i) ? ' (au retour)' : ''}`);
}

async function eveBriefing(t: Trip, st: LiveState, list: Trip[]): Promise<string> {
  const lines = [`🧳 DEMAIN : ${t.title}`, `🛫 Départ ${at(t.departAt + (st.applied ?? 0) * 60_000, t.tz)}${st.applied ? ` (retard de ${st.applied} min)` : ''}${t.terminal || st.terminal ? ` · terminal ${st.terminal ?? t.terminal}` : ''}${t.pnr ? ` · réservation ${t.pnr}` : ''}`];
  if (t.arriveAt) lines.push(`🛬 Arrivée ${at(t.arriveAt + (st.applied ?? 0) * 60_000, guessTzOf(t.to))} heure locale`);
  const lp = await leavePlan(t, st).catch(() => null);
  if (lp) {
    lines.push(`🚗 Partir de la maison vers ${at(lp.leave, TZ)} (${lp.min} min de route avec le trafic actuel, ${lp.km} km — je te redis demain avec le vrai trafic)`);
    if (Number(localNow(lp.leave).hhmm.slice(0, 2)) < 10) lines.push(`⏰ Réveil conseillé : ${at(lp.leave - 60 * 60_000, TZ)} (je t'appelle si tu ne m'as pas écrit d'ici là)`);
  }
  const to = st.to ?? await airportPoint(t.to ?? '');
  if (to) { const w = await weatherAt(to, localNow(t.arriveAt ?? t.departAt, guessTzOf(t.to)).date); if (w) lines.push(`🌤 Météo à ${t.to} : ${w}`); }
  const off = tzOffsetH(guessTzOf(t.to), t.departAt) - tzOffsetH(t.tz, t.departAt);
  if (off) lines.push(`🕐 Décalage horaire : ${off > 0 ? '+' : ''}${off} h à l'arrivée`);
  if (isDZ(t.to)) {
    try {
      const { getRates } = await import('./exchange-rates.js');
      const r = await getRates();
      const sq = r?.parallel?.eur_to_dzd, off2 = r?.official?.eur_to_dzd;
      if (sq || off2) lines.push(`💱 1 € = ${sq ? `${Math.round(sq)} DA au square` : ''}${sq && off2 ? ' · ' : ''}${off2 ? `${Math.round(off2)} DA officiel` : ''}`);
    } catch { /* taux indisponible */ }
  }
  const left = t.checklist.filter(i => !i.done && !i.for);
  lines.push(left.length ? `📋 Check-list : il manque ${left.map(i => i.label.toLowerCase()).join(', ')}` : '📋 Check-list : tout est coché ✅');
  const req = requestsOf(list, t);
  if (req.length) lines.push(`🎁 Demandes à ne pas oublier :\n${req.map(r => `   • ${r}`).join('\n')}`);
  if (t.pauseFrom && t.pauseTo) {
    const b = await bookingsDuring(t.pauseFrom, t.pauseTo).catch(() => []);
    if (b.length) lines.push(`🚘 Locations FIK pendant ton absence (${b.length}) :\n${b.map(x => `   • ${x}`).join('\n')}\n   → vérifie que Houari a les clés et les contrats.`);
  }
  lines.push(`💶 Plus de 10 000 € en liquide en quittant l'UE = à déclarer à la douane.`);
  if (st.token) lines.push(`🌍 Lien de suivi pour la famille : ${PUBLIC}/api/vol/suivi/${st.token}`);
  lines.push('', 'Dis « le chargeur c\'est bon » pour cocher, ou « tout est ok pour mon voyage ».');
  return lines.join('\n');
}

const depAirport = (t: Trip) => (mine(t) ? t.airport ?? t.from : t.from) ?? '';
function guessTzOf(place?: string): string { return isDZ(place) ? 'Africa/Algiers' : TZ; }

// ── Le job ──────────────────────────────────────────────────────────────────

export async function jobFlightWatch(): Promise<void> {
  const now = Date.now();
  const list = await readTrips();
  const flights = list.filter(t => t.kind === 'flight' && t.departAt - now < 30 * 3600_000 && (t.arriveAt ?? t.departAt + 4 * 3600_000) + 6 * 3600_000 > now);
  for (const t of flights) {
    try { await watchOne(t, list, now); } catch (e) { console.error('[flight-live]', t.id, e instanceof Error ? e.message : e); }
  }
}

async function watchOne(t: Trip, list: Trip[], now: number): Promise<void> {
  const st = await liveState(t.id);
  if (st.landedAt) return;
  if (!st.token) st.token = randomBytes(9).toString('base64url');
  const hBefore = (t.departAt - now) / 3_600_000;
  const name = mine(t) ? `Ton vol ${t.flightNumber ?? ''}`.trim() : `Le vol de ${t.clientName ?? 'ton client'}${t.flightNumber ? ` (${t.flightNumber})` : ''}`;
  if (!st.from) st.from = await airportPoint(depAirport(t)) ?? undefined;
  if (!st.to) st.to = await airportPoint(t.to ?? '') ?? undefined;

  // 1. Statut web : toutes les 3 h jusqu'à H-6, puis toutes les 30 min, puis 20 min après l'heure prévue tant qu'il n'a pas décollé
  const every = hBefore > 6 ? 3 * 3600_000 : hBefore > 0 ? 30 * 60_000 : 20 * 60_000;
  if (!st.airborneAt && t.flightNumber && now - (st.statusAt ?? 0) >= every) {
    st.statusAt = now;
    const s = await webStatus(t).catch(() => null);
    if (s) {
      st.statusText = s.status; st.statusSrc = s.source;
      if (s.callsign) st.cs = s.callsign; if (s.registration) st.reg = s.registration; st.est = s.est; st.estArr = s.est_arr; st.sched = s.sched;
      if (s.cancelled && !st.cancelled) {
        st.cancelled = true;
        await tell(t, st, 'cancel', `❌ ${name} ${t.from} → ${t.to} est indiqué ANNULÉ${s.source ? ` (source : ${s.source})` : ''}.\nVérifie tout de suite chez la compagnie${t.pnr ? ` (réservation ${t.pnr})` : ''}.`, '❌ Vol annulé');
        if (mine(t)) await autoCall(`flight-cancel:${t.id}`, `Kouider, attention : ton vol ${t.flightNumber ?? ''} vers ${t.to} est indiqué annulé. Vérifie vite chez la compagnie.`, { level: 'urgent' });
      }
      if (s.terminal) s.terminal = String(s.terminal).replace(/^\s*terminal\s*/i, '').trim();
      if (s.terminal && s.terminal !== st.terminal) { const old = st.terminal; st.terminal = s.terminal; if (old) await tell(t, st, `term:${s.terminal}`, `🔀 ${name} : changement de terminal → ${s.terminal} (avant ${old}).`); }
      if (s.gate && s.gate !== st.gate) { st.gate = s.gate; if (hBefore < 3) await tell(t, st, `gate:${s.gate}`, `🚪 ${name} : porte ${s.gate}${st.terminal ? `, terminal ${st.terminal}` : ''}.`); }
      // Retard : appliqué seulement si 2 lectures à ±10 min l'une de l'autre
      let d = Number.isFinite(Number(s.delay_min)) ? Math.max(0, Math.round(Number(s.delay_min))) : 0;
      if (!d && s.est) { const m = s.est.match(/^(\d{1,2}):(\d{2})$/); if (m) d = Math.max(0, Math.round((localTsLike(t, s.est) - t.departAt) / 60_000)); }
      if (d > 720) d = 0;                                                   // lecture aberrante
      st.delay = d;
      const applied = st.applied ?? 0;
      if (Math.abs(d - applied) >= 15) {
        if (st.pendingDelay != null && Math.abs(st.pendingDelay - d) <= 10) {
          st.applied = d; st.pendingDelay = undefined;
          await shiftAgenda(t, d);
          const newDep = t.departAt + d * 60_000;
          const tag = `delay:${Math.round(d / 15)}`;
          if (d >= 15) {
            const lp = mine(t) ? await leavePlan(t, st).catch(() => null) : null;
            await tell(t, st, tag, `⏳ ${name} ${t.from} → ${t.to} a du RETARD : ${d} min.\n🛫 Nouveau départ ≈ ${at(newDep, t.tz)} (au lieu de ${at(t.departAt, t.tz)})${s.est_arr ? ` · arrivée ≈ ${s.est_arr.replace(':', 'h')}` : t.arriveAt ? ` · arrivée ≈ ${at(t.arriveAt + d * 60_000, guessTzOf(t.to))}` : ''}${s.source ? `\nSource : ${s.source}` : ''}\n📅 Agenda FIK décalé${mine(t) ? ` — « être à l'aéroport » à ${at(newDep - 150 * 60_000, t.tz)}${lp ? `, partir vers ${at(lp.leave, TZ)}` : ''} (je te redis avec le trafic)` : ' — décale la remise de la voiture'}.`, `⏳ Vol retardé de ${d} min`);
            if (mine(t) && d >= 60 && hBefore < 5) await autoCall(`flight-delay:${t.id}:${Math.round(d / 30)}`, `Kouider, ton vol pour ${t.to} a ${d} minutes de retard. Nouveau départ vers ${at(newDep, t.tz).replace('h', ' heures ')}. Pas besoin de partir aussi tôt, j'ai décalé l'agenda.`, { level: 'urgent' });
          } else await tell(t, st, tag, `✅ ${name} est de nouveau à l'heure : départ ${at(t.departAt, t.tz)}.`);
        } else st.pendingDelay = d;
      } else st.pendingDelay = undefined;
    }
  }

  // 2. Rappels Kouider : enregistrement en ligne (H-24), briefing de la veille (20h), fiche jour J, réveil
  if (mine(t) && !t.returnOf) {
    const checkin = t.checklist.find(i => /enregistrement/i.test(i.label));
    if (hBefore <= 24 && hBefore > 3 && checkin && !checkin.done)
      await tell(t, st, 'checkin', `🎫 L'enregistrement en ligne de ${name.toLowerCase()} est sûrement ouvert (H-24).\n🔗 https://www.google.com/search?q=${encodeURIComponent(`enregistrement en ligne ${t.airline ?? ''} ${t.flightNumber ?? ''}`.trim())}\nFais-le maintenant pour choisir ta place, puis dis-moi « enregistrement fait ».`);
    const today = localNow(now).date, depDay = localNow(t.departAt).date;
    const tomorrow = localNow(now + 86_400_000).date;
    if (depDay === tomorrow && Number(localNow(now).hhmm.slice(0, 2)) >= 20) await tell(t, st, 'eve', await eveBriefing(t, st, list), '🧳 Briefing de demain');
    if (depDay === today && hBefore > 1 && hBefore < 14 && Number(localNow(now).hhmm.slice(0, 2)) >= 3) {
      const req = requestsOf(list, t);
      const left = t.checklist.filter(i => !i.done && !i.for).map(i => i.label.toLowerCase());
      await tell(t, st, 'dayj', [`✈️ JOUR J — ${t.title}`, `🛫 ${at(t.departAt + (st.applied ?? 0) * 60_000, t.tz)}${st.terminal ?? t.terminal ? ` · terminal ${st.terminal ?? t.terminal}` : ''}${st.gate ? ` · porte ${st.gate}` : ''}${t.pnr ? ` · réservation ${t.pnr}` : ''}`,
        st.statusText ? `📡 Statut : ${st.statusText}` : '', left.length ? `📋 Encore à prendre : ${left.join(', ')}` : '📋 Check-list OK ✅',
        req.length ? `🎁 N'oublie pas : ${req.join(' · ')}` : '', `🪪 Passeport + carte d'embarquement dans la poche.`,
        `🌍 Suivi pour la famille : ${PUBLIC}/api/vol/suivi/${st.token}`].filter(Boolean).join('\n'), '✈️ Jour J');
      // Réveil : vol tôt → s'il n'a donné aucun signe de vie 1 h avant l'heure de partir, appel
      const lp = await leavePlan(t, st).catch(() => null);
      if (lp && now >= lp.leave - 60 * 60_000 && now < lp.leave && !st.sent['wake'] && (await lastKouiderActivity()) < now - 5 * 3600_000 && !(await getPendingCall('kouider'))) {
        st.sent['wake'] = now; await saveState(t.id, st);
        await callOwner(`Debout Kouider, c'est le jour du vol pour ${t.to} ! Départ à ${at(t.departAt + (st.applied ?? 0) * 60_000, t.tz).replace('h', ' heures ')}, il faut partir de la maison vers ${at(lp.leave, TZ).replace('h', ' heures ')}.${requestsOf(list, t).length ? ` Et n'oublie pas les demandes : ${requestsOf(list, t).join(', ')}.` : ''}`, 'kouider', { force: true }).catch(() => {});
      }
    }
  }

  // 3. Radar en direct dès 30 min avant le départ
  const css = callsigns(t.flightNumber, st.cs);
  if ((css.length || st.reg) && now > t.departAt + (st.applied ?? 0) * 60_000 - 30 * 60_000) {
    const p = await radar(css, st.reg);
    if (p) {
      st.pos = p;
      const toKm = st.to ? distKm(p, st.to) : null, fromKm = st.from ? distKm(p, st.from) : null;
      if (!p.ground && p.alt > 300 && !st.airborneAt && (fromKm == null || fromKm < 400)) {
        st.airborneAt = now;
        const late = Math.round((now - t.departAt) / 60_000);
        if (t.arriveAt) st.etaAt = now + (t.arriveAt - t.departAt);
        else if (toKm && p.spd > 200) st.etaAt = now + (toKm / (Math.max(p.spd, 780) * 0.92)) * 3_600_000 + 12 * 60_000;
        await tell(t, st, 'takeoff', `🛫 ${name} a DÉCOLLÉ (${at(now, t.tz)}${late >= 15 ? `, ${late} min de retard` : ''}).${st.etaAt ? `\n🛬 Arrivée estimée ≈ ${at(st.etaAt, guessTzOf(t.to))} heure ${/^[aeiouyéèh]/i.test(t.to ?? '') ? 'd’' : 'de '}${t.to}.` : ''}\n🌍 Suis-le en direct : app GLOBE › « 🧳 Mon vol »${mine(t) ? ` · lien famille ${PUBLIC}/api/vol/suivi/${st.token}` : ''}`, '🛫 Décollé');
        if (mine(t) && st.etaAt && (await quietUntil()) < st.etaAt) await setQuietUntil(st.etaAt + 30 * 60_000);   // mode avion : pas d'appels pendant le vol
      } else if (st.airborneAt && toKm != null && p.spd > 200) st.etaAt = now + (toKm / (p.spd * 0.92)) * 3_600_000 + 12 * 60_000;
      if (st.airborneAt && toKm != null && toKm < 15 && (p.ground || p.alt < 150)) await landed(t, st, name, now);
    } else if (st.airborneAt && st.etaAt && now > st.etaAt + 15 * 60_000 && st.pos && st.to && distKm(st.pos, st.to) < 80) await landed(t, st, name, now);
  }
  // 4. Radar seul (marche même sans statut web) : pas encore décollé 20 / 60 min après l'heure prévue
  const depNow = t.departAt + (st.applied ?? 0) * 60_000;
  if ((css.length || st.reg) && !st.airborneAt && !st.cancelled) for (const late of [20, 60]) {
    if (now > depNow + late * 60_000 && now < depNow + (late + 40) * 60_000)
      await tell(t, st, `notoff:${late}`, `⏳ ${name} n'a pas encore décollé d'après le radar (prévu ${at(depNow, t.tz)}, +${Math.round((now - t.departAt) / 60_000)} min).${mine(t) ? '' : ' Décale la remise de la voiture.'}`);
  }
  await saveState(t.id, st);
}

function localTsLike(t: Trip, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const l = localNow(t.departAt, t.tz);
  const base = Date.parse(`${l.date}T${l.hhmm}:00Z`), want = Date.parse(`${l.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  let diff = want - base;
  if (diff < -6 * 3600_000) diff += 86_400_000;                 // passé minuit
  return t.departAt + diff;
}

async function landed(t: Trip, st: LiveState, name: string, now: number): Promise<void> {
  st.landedAt = now;
  const tz = guessTzOf(t.to);
  const off = tzOffsetH(tz, now) - tzOffsetH(TZ, now);
  if (mine(t)) {
    await setQuietUntil(0).catch(() => {});
    await tell(t, st, 'landed', `🛬 Bien atterri à ${t.to} (${at(now, tz)} heure locale${off ? `, ${off > 0 ? '+' : ''}${off} h par rapport à la Belgique` : ''}). ${isDZ(t.to) && !t.returnOf ? 'Bienvenue au pays 🇩🇿' : 'Bon retour 🏠'}\nLes appels sont de nouveau actifs. Dis « préviens ma femme que j'ai atterri » si tu veux que je lui écrive.`, '🛬 Atterri');
  } else await tell(t, st, 'landed', `🛬 ${name} a ATTERRI à ${t.to} (${at(now, tz)}). Compte ~30–45 min (bagages, sortie) avant la remise de la voiture.`, '🛬 Client atterri');
}

// ── Pour l'outil travel, le globe et le lien famille ───────────────────────

export interface FlightView {
  id: string; title: string; flight?: string; cs?: string; from?: string; to?: string; departAt: number; arriveAt?: number; tz: string;
  delay: number; status?: string; terminal?: string; gate?: string; cancelled?: boolean; airborne: boolean; landed: boolean;
  pos?: LiveState['pos']; fromPt?: { lat: number; lon: number }; toPt?: { lat: number; lon: number }; leftKm?: number; etaAt?: number; pct?: number;
}

export async function flightView(t: Trip, refresh = true): Promise<FlightView> {
  const st = await liveState(t.id);
  const css = callsigns(t.flightNumber, st.cs);
  const cs = css[0];
  if (refresh && (cs || st.reg) && !st.landedAt && Date.now() > t.departAt - 3 * 3600_000) {
    const p = await radar(css, st.reg).catch(() => null);
    if (p) st.pos = p;
  }
  if (!st.from) st.from = await airportPoint(depAirport(t)) ?? undefined;
  if (!st.to) st.to = await airportPoint(t.to ?? '') ?? undefined;
  const leftKm = st.pos && st.to ? Math.round(distKm(st.pos, st.to)) : undefined;
  const tot = st.from && st.to ? distKm(st.from, st.to) : undefined;
  const etaAt = st.pos && leftKm != null && st.pos.spd > 200 ? Date.now() + leftKm / (st.pos.spd * 0.92) * 3_600_000 + 12 * 60_000 : st.etaAt;
  return { id: t.id, title: t.title, flight: t.flightNumber, cs, from: t.from, to: t.to, departAt: t.departAt, arriveAt: t.arriveAt, tz: t.tz,
    delay: st.applied ?? 0, status: st.statusText, terminal: st.terminal ?? t.terminal, gate: st.gate, cancelled: st.cancelled,
    airborne: !!st.airborneAt || (!!st.pos && !st.pos.ground && st.pos.alt > 300 && Date.now() - st.pos.at < 15 * 60_000), landed: !!st.landedAt,
    pos: st.pos && Date.now() - st.pos.at < 30 * 60_000 ? st.pos : undefined, fromPt: st.from, toPt: st.to, leftKm, etaAt,
    pct: tot && leftKm != null ? Math.max(0, Math.min(100, Math.round((1 - leftKm / tot) * 100))) : undefined };
}

/** Le prochain vol suivi (Kouider d'abord), pour le globe. */
export async function nextFlight(): Promise<FlightView | null> {
  const now = Date.now();
  const list = (await readTrips()).filter(t => t.kind === 'flight' && (t.arriveAt ?? t.departAt + 4 * 3600_000) + 3 * 3600_000 > now).sort((a, b) => a.departAt - b.departAt);
  const t = list.find(mine) ?? list[0];
  return t ? flightView(t) : null;
}

export async function flightByToken(token: string): Promise<FlightView | null> {
  if (!/^[\w-]{8,20}$/.test(token)) return null;
  for (const t of await readTrips()) {
    if (t.kind !== 'flight') continue;
    const st = await liveState(t.id);
    if (st.token === token) { const v = await flightView(t); return { ...v, title: `Vol ${t.flightNumber ?? ''} ${t.from} → ${t.to}`.replace(/\s+/g, ' ') }; }
  }
  return null;
}

/** Texte pour l'outil (action 'track'). */
export async function trackText(t: Trip): Promise<string> {
  const v = await flightView(t);
  const st = await liveState(t.id);
  if (!st.token) { st.token = randomBytes(9).toString('base64url'); await saveState(t.id, st); }
  const dep = v.departAt + v.delay * 60_000;
  const lines = [`✈️ ${t.title}`, `🛫 Départ ${at(dep, t.tz)}${v.delay ? ` (retard ${v.delay} min)` : ''}${v.terminal ? ` · terminal ${v.terminal}` : ''}${v.gate ? ` · porte ${v.gate}` : ''}`];
  if (v.cancelled) lines.push('❌ Indiqué ANNULÉ.');
  if (v.status) lines.push(`📡 Statut : ${v.status}${st.statusSrc ? ` (${st.statusSrc})` : ''}`);
  if (v.landed) lines.push('🛬 Atterri.');
  else if (v.pos && !v.pos.ground) lines.push(`📍 En vol : ${v.pos.alt.toLocaleString('fr-FR')} m, ${v.pos.spd} km/h${v.leftKm != null ? `, encore ${v.leftKm.toLocaleString('fr-FR')} km` : ''}${v.pct != null ? ` (${v.pct} % du trajet)` : ''}${v.etaAt ? ` · arrivée ≈ ${at(v.etaAt, guessTzOf(t.to))}` : ''}.`);
  else if (v.pos?.ground) lines.push('📍 L\'avion est au sol (radar).');
  else lines.push(v.cs ? `📍 Pas encore visible au radar (indicatif ${v.cs}) — il apparaît ~30 min avant le départ.` : '📍 Compagnie inconnue du radar : je suis le statut sur le web seulement.');
  lines.push(`🌍 App GLOBE › « 🧳 Mon vol » · lien famille : ${PUBLIC}/api/vol/suivi/${st.token}`);
  return lines.join('\n');
}

/** Page publique de suivi (famille) : carte + avion en direct, sans nom ni info perso. */
export function trackPage(_token: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Suivi du vol</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>:root{--bg:#06101f;--fg:#e8f0ff;--dim:#8aa0c0;--acc:#ffc53d}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,sans-serif}
#map{height:62vh}.card{padding:16px}.big{font-size:22px;font-weight:700}.dim{color:var(--dim)}.bar{height:8px;background:#1b2a44;border-radius:4px;margin:10px 0}.bar i{display:block;height:100%;background:var(--acc);border-radius:4px}</style></head>
<body><div id="map"></div><div class="card"><div class="big" id="t">Chargement…</div><div id="s" class="dim"></div><div class="bar"><i id="b" style="width:0"></i></div><div id="d"></div><div class="dim" style="margin-top:8px">Mise à jour toutes les 30 s · radar ADS-B</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script><script>
const map=L.map('map',{zoomControl:false}).setView([42,2],4);L.tileLayer('https://{s}.basemap.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap © CARTO'}).addTo(map);
let pl,line,first=true;const ico=L.divIcon({html:'<div style="font-size:26px;transform:rotate(var(--r))">✈️</div>',className:'',iconSize:[28,28]});
const hm=(ts,tz)=>new Date(ts).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:tz});
async function go(){try{const v=await (await fetch(location.pathname+'.json')).json();if(!v||v.error){document.getElementById('t').textContent='Vol introuvable';return;}
document.getElementById('t').textContent=v.title;
const dep=v.departAt+v.delay*60000;let s=v.cancelled?'❌ Annulé':v.landed?'🛬 Atterri':v.airborne?'✈️ En vol':'🕐 Départ prévu '+hm(dep,v.tz)+(v.delay?' (retard '+v.delay+' min)':'');
if(v.airborne&&v.etaAt)s+=' · arrivée vers '+hm(v.etaAt,v.to&&/oran|alger|alg/i.test(v.to)?'Africa/Algiers':'Europe/Brussels');document.getElementById('s').textContent=s;
document.getElementById('b').style.width=(v.landed?100:v.pct||0)+'%';
document.getElementById('d').textContent=v.pos&&!v.pos.ground?(v.pos.alt.toLocaleString('fr-FR')+' m · '+v.pos.spd+' km/h'+(v.leftKm!=null?' · encore '+v.leftKm.toLocaleString('fr-FR')+' km':'')):'';
if(v.fromPt&&v.toPt){if(line)line.remove();line=L.polyline([[v.fromPt.lat,v.fromPt.lon],[v.toPt.lat,v.toPt.lon]],{color:'#ffc53d',dashArray:'6 8',weight:2}).addTo(map);if(first){map.fitBounds(line.getBounds(),{padding:[30,30]});first=false;}}
if(v.pos){const ll=[v.pos.lat,v.pos.lon];if(!pl)pl=L.marker(ll,{icon:ico}).addTo(map);else pl.setLatLng(ll);pl.getElement()&&pl.getElement().firstChild.style.setProperty('--r',(v.pos.trk-45)+'deg');}
}catch(e){document.getElementById('s').textContent='Connexion…';}}go();setInterval(go,30000);
</script></body></html>`;
}

// ── Demandes (Houari ou autre) ajoutées à la check-list ─────────────────────

const RETURN_BASE = ['Passeport', 'Carte d\'embarquement retour', 'Chargeur de téléphone', 'Valise pesée (poids autorisé)'];

/** « Houari m'a demandé de lui ramener X » → ajouté avant l'aller (défaut) ou le retour, rappelé la veille et le jour J. */
export async function addRequest(person: string, items: string[], phase: 'out' | 'back', trip?: Trip): Promise<string> {
  const list = await readTrips();
  const live = list.filter(t => t.kind === 'flight' && mine(t) && !t.returnOf && t.departAt > Date.now() - 3600_000).sort((a, b) => a.departAt - b.departAt);
  const out = trip ? list.find(t => t.id === trip.id) : live[0];
  if (!out) return '❌ Aucun voyage prévu. Envoie-moi d\'abord ton billet, puis je mets la demande dans la check-list.';
  let target = out;
  if (phase === 'back') {
    const back = list.find(t => t.returnOf === out.id) ?? list.find(t => t.kind === 'flight' && mine(t) && t.departAt > out.departAt && out.pauseTo && localNow(t.departAt).date <= out.pauseTo);
    if (!back) return `❌ Je n'ai pas ton vol retour. Envoie-moi le billet retour, ou dis « avant l'aller » pour le mettre sur l'aller (${out.title}).`;
    back.returnOf = out.id;
    if (!back.checklist.length) back.checklist = RETURN_BASE.map(label => ({ label, done: false }));
    target = back;
  }
  const who = person.trim() ? person.trim().charAt(0).toUpperCase() + person.trim().slice(1) : 'Demande';
  const added: string[] = [];
  for (const raw of items.map(s => s.trim()).filter(Boolean)) {
    const label = `🎁 ${who} : ${raw}`;
    if (target.checklist.some(i => norm(i.label) === norm(label))) continue;
    target.checklist.push({ label, done: false, for: who });
    added.push(raw);
  }
  target.validated = false;
  await writeTrips(list);
  return added.length
    ? `✅ Ajouté à la check-list ${phase === 'back' ? 'du RETOUR' : 'du départ'} (${target.title}) : ${added.map(a => `« ${a} » pour ${who}`).join(', ')}.\nJe te le rappelle chaque soir dès J-5, dans le briefing de la veille, le matin du départ, et à l'appel de réveil. Dis « c'est fait pour ${who} » une fois prêt.`
    : 'C\'était déjà dans la check-list.';
}

export const _internals = { radar, webStatus, callsigns, eveBriefing };   // tests
