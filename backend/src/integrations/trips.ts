import { randomUUID } from 'node:crypto';
import { kvGet, kvSet } from './app-store.js';
import { supabase } from './supabase.js';
import { createAgendaEvent, deleteAgendaEvent } from './google-calendar.js';
import { createAnthropic, QUALITY } from './anthropic-compat.js';
import { listInboxMessages, readEmail } from './gmail.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { autoCall } from '../notifications/auto-call.js';
import { TZ, localNow, localTs, hm } from './morning-routine.js';

// VOYAGES + CHECK-LISTS (demande de Kouider 2026-10-15).
// - Kouider envoie un billet (photo, PDF sur Telegram, ou mail transféré à la boîte pro) → Dzaryx crée le voyage :
//   vol dans l'agenda FIK, « 🧳 être à l'aéroport » 2 h 30 avant (departures.ts dit quand partir selon le trafic),
//   check-list de base (passeport, carte d'identité, chargeur…) que Kouider complète et coche en parlant à Dzaryx.
// - Tant que la check-list n'est pas validée : rappel chaque soir dès J-5 (« il manque le chargeur ») et dans le
//   message du matin ; à J-2, J-1 et le jour J → APPEL pour la valider le jour même.
// - Même chose pour les ARRIVÉES et DÉPARTS des clients (débuts / fins de location) : check-list créée toute seule
//   (contrat, acompte, passeport, vol, voiture prête…), cochée automatiquement quand les données le disent.
// - Pendant un voyage de Kouider (aller → retour), la routine du matin est en pause.
// Données : app_kv `trips:v1`.

const KEY = 'trips:v1';
const MAIL_DONE_KEY = 'trips:mail:done';
const REMIND_FROM_DAYS = 5;
const CALL_FROM_DAYS = 2;

export interface CheckItem { label: string; done: boolean; doneAt?: string; auto?: string }
export interface Trip {
  id: string;
  who: 'kouider' | 'client';
  kind: 'flight' | 'booking-start' | 'booking-end';
  title: string;
  clientName?: string;
  bookingId?: string;
  flightNumber?: string;
  airline?: string;
  from?: string;
  to?: string;
  departAt: number;           // timestamp (vol ou début/fin de location)
  arriveAt?: number;
  tz: string;                 // fuseau des heures affichées
  airport?: string;           // aéroport de départ (adresse pour le trajet)
  pauseFrom?: string;         // YYYY-MM-DD : routine du matin en pause (voyage de Kouider)
  pauseTo?: string;
  checklist: CheckItem[];
  validated: boolean;
  validatedAt?: string;
  calendarIds: string[];
  createdAt: string;
  source?: string;
}

async function readTrips(): Promise<Trip[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as Trip[]; } catch { return []; }
}
async function writeTrips(list: Trip[]): Promise<void> {
  const keep = list.filter(t => t.departAt > Date.now() - 30 * 86_400_000).slice(-80);
  await kvSet(KEY, JSON.stringify(keep));
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const dateOf = (ts: number, tz = TZ) => localNow(ts, tz).date;
const daysUntil = (ts: number) => {
  const a = Date.parse(`${localNow().date}T12:00:00Z`), b = Date.parse(`${dateOf(ts)}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
};
const fmtWhen = (ts: number, tz: string) => new Date(ts).toLocaleString('fr-FR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const DZ_RE = /\b(oran|es ?senia|alger|algiers|houari boumediene|constantine|annaba|tlemcen|bejaia|setif|algerie|algeria|dz)\b/;
export function guessTz(place: string): string {
  return DZ_RE.test(norm(place)) ? 'Africa/Algiers' : TZ;
}

// ── Check-lists de base ──────────────────────────────────────────────────────

function kouiderChecklist(to: string): CheckItem[] {
  const items = [
    'Passeport (valide)', "Carte d'identité", "Billet / carte d'embarquement", 'Enregistrement en ligne fait',
    'Chargeur de téléphone', 'Batterie externe', 'Écouteurs', 'Carte bancaire + un peu de liquide', 'Permis de conduire',
    'Médicaments', 'Clés de la maison', 'Valise pesée (poids autorisé)',
  ];
  if (DZ_RE.test(norm(to))) items.push('Euros pour le change / dinars', 'Cadeaux pour la famille');
  return items.map(label => ({ label, done: false }));
}

const CLIENT_START = [
  ['Contrat signé', 'contract'], ['Acompte / paiement reçu', 'paid'], ['Passeport + permis reçus', 'passport'],
  ['Vol et heure d\'arrivée connus', 'flight'], ['Lieu de remise confirmé', ''], ['Voiture propre + plein fait', ''],
  ['Houari prévenu', ''], ['Photos état des lieux avant', ''],
] as const;
const CLIENT_END = [
  ['Heure et lieu de retour confirmés', ''], ['Solde encaissé', 'paid'], ['Photos état des lieux après', ''],
  ['Caution rendue', ''], ['Demande d\'avis envoyée', 'review'],
] as const;

// ── Création d'un voyage ─────────────────────────────────────────────────────

export interface NewFlight {
  who?: 'kouider' | 'client'; client_name?: string; booking_id?: string;
  flight_number?: string; airline?: string; from: string; to: string;
  depart_local: string; arrive_local?: string;       // « YYYY-MM-DD HH:MM », heure locale de chaque aéroport
  depart_tz?: string; arrive_tz?: string; airport_address?: string; source?: string;
}

function parseLocal(v: string | undefined, tz: string): number | null {
  const m = String(v ?? '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? localTs(m[1]!, m[2]!, tz) : null;
}

async function addFlight(f: NewFlight): Promise<Trip | string> {
  const who = f.who ?? 'kouider';
  const dtz = f.depart_tz || guessTz(f.from), atz = f.arrive_tz || guessTz(f.to);
  const departAt = parseLocal(f.depart_local, dtz);
  if (!departAt) return '❌ Il me faut la date et l\'heure de départ (YYYY-MM-DD HH:MM).';
  const arriveAt = parseLocal(f.arrive_local, atz) ?? undefined;
  const list = await readTrips();
  const dup = list.find(t => t.kind === 'flight' && t.who === who && Math.abs(t.departAt - departAt) < 30 * 60_000
    && (!f.flight_number || !t.flightNumber || norm(t.flightNumber) === norm(f.flight_number)));
  if (dup) return dup;

  const fl = f.flight_number ? ` ${f.flight_number.toUpperCase()}` : '';
  const title = who === 'client' ? `Arrivée de ${f.client_name ?? 'client'} — vol${fl} ${f.from} → ${f.to}` : `Vol${fl} ${f.from} → ${f.to}`;
  const airport = f.airport_address || (who === 'client' ? f.to : f.from);
  const t: Trip = {
    id: randomUUID().slice(0, 8), who, kind: 'flight', title, clientName: f.client_name, bookingId: f.booking_id,
    flightNumber: f.flight_number?.toUpperCase(), airline: f.airline, from: f.from, to: f.to, departAt, arriveAt, tz: dtz,
    airport, checklist: who === 'kouider' ? kouiderChecklist(f.to) : [], validated: who === 'client', calendarIds: [],
    createdAt: new Date().toISOString(), source: f.source,
  };

  // Agenda FIK : le vol, et (pour Kouider) « être à l'aéroport » 2 h 30 avant → alerte de départ avec le trafic
  const iso = (ts: number, tz: string) => { const l = localNow(ts, tz); return `${l.date}T${l.hhmm}:00`; };
  if (who === 'kouider') {
    const end = arriveAt ?? departAt + 3 * 3600_000;
    const id = await createAgendaEvent(`✈️ ${title}`, iso(departAt, dtz), iso(end, dtz), [f.airline, `Check-list : dis « montre ma check-list » à Dzaryx.`].filter(Boolean).join('\n'), false, airport, { timeZone: dtz });
    if (id) t.calendarIds.push(id);
    const at = departAt - 150 * 60_000;
    const id2 = await createAgendaEvent(`🧳 Être à l'aéroport (vol${fl} à ${hm(departAt, dtz)})`, iso(at, dtz), iso(at + 30 * 60_000, dtz), 'Dzaryx te dit quand partir selon le trafic.', false, airport, { timeZone: dtz });
    if (id2) t.calendarIds.push(id2);
  } else {
    const at = arriveAt ?? departAt;
    const id = await createAgendaEvent(`🛬 ${title}`, iso(at, atz), iso(at + 3600_000, atz), f.booking_id ? `Réservation ${f.booking_id}` : undefined, false, f.to, { timeZone: atz });
    if (id) t.calendarIds.push(id);
    // le point « vol connu » de sa check-list d'arrivée est coché
    for (const c of list) if (c.kind === 'booking-start' && ((f.booking_id && c.bookingId === f.booking_id) || (f.client_name && c.clientName && norm(c.clientName) === norm(f.client_name))))
      for (const i of c.checklist) if (i.auto === 'flight') { i.done = true; i.doneAt = new Date().toISOString(); }
  }
  list.push(t);
  await writeTrips(list);
  return t;
}

/** Aller + retour de Kouider : la routine du matin est en pause entre les deux. */
function linkPause(list: Trip[], out: Trip, back?: Trip): void {
  if (out.who !== 'kouider') return;
  out.pauseFrom = dateOf(out.departAt);
  out.pauseTo = back ? dateOf(back.arriveAt ?? back.departAt) : undefined;
  const i = list.findIndex(t => t.id === out.id);
  if (i >= 0) list[i] = out;
}

export async function kouiderAwayOn(date: string): Promise<string | null> {
  const t = (await readTrips()).find(x => x.who === 'kouider' && x.pauseFrom && x.pauseTo && x.pauseFrom <= date && date <= x.pauseTo);
  return t ? `${t.to}, retour le ${t.pauseTo}` : null;
}

// ── Client : check-lists d'arrivée / de départ créées depuis les réservations ─

async function syncClientChecklists(): Promise<void> {
  const today = localNow(Date.now(), 'Africa/Algiers').date;
  const plus = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  type B = { id: string; client_name: string; start_date: string; end_date: string; status: string; amount_remaining: number | null;
    payment_status: string | null; client_passport: string | null; review_request_sent_at: string | null; cars?: { name?: string } | null };
  const cols = 'id, client_name, start_date, end_date, status, amount_remaining, payment_status, client_passport, review_request_sent_at, cars(name)';
  const [{ data: starts }, { data: ends }] = await Promise.all([
    supabase.from('bookings').select(cols).gte('start_date', today).lte('start_date', plus(REMIND_FROM_DAYS)).in('status', ['PENDING', 'CONFIRMED']),
    supabase.from('bookings').select(cols).gte('end_date', today).lte('end_date', plus(3)).in('status', ['PENDING', 'CONFIRMED', 'ACTIVE']),
  ]);
  const list = await readTrips();
  const ids = [...new Set([...(starts ?? []), ...(ends ?? [])].map(b => (b as B).id))];
  const { data: sig } = ids.length
    ? await supabase.from('contract_signatures').select('booking_id').in('booking_id', ids).eq('status', 'signed')
    : { data: [] };
  const signed = new Set(((sig ?? []) as Array<{ booking_id: string }>).map(s => s.booking_id));
  const paid = (b: B) => (b.amount_remaining !== null && Number(b.amount_remaining) <= 0) || /^(paid|payé|complet)/i.test(b.payment_status ?? '');

  const upsert = (b: B, kind: 'booking-start' | 'booking-end') => {
    const id = `${kind === 'booking-start' ? 'bs' : 'be'}-${b.id}`;
    let t = list.find(x => x.id === id);
    const date = kind === 'booking-start' ? b.start_date : b.end_date;
    if (!t) {
      const tpl = kind === 'booking-start' ? CLIENT_START : CLIENT_END;
      t = {
        id, who: 'client', kind, bookingId: b.id, clientName: b.client_name,
        title: `${kind === 'booking-start' ? 'Arrivée' : 'Retour'} de ${b.client_name} (${b.cars?.name ?? 'voiture'})`,
        departAt: localTs(date, '10:00', 'Africa/Algiers'), tz: 'Africa/Algiers',
        checklist: tpl.map(([label, auto]) => ({ label, done: false, ...(auto ? { auto } : {}) })),
        validated: false, calendarIds: [], createdAt: new Date().toISOString(), source: 'réservation',
      };
      list.push(t);
    }
    t.departAt = localTs(date, '10:00', 'Africa/Algiers');
    const now = new Date().toISOString();
    for (const i of t.checklist) {
      const ok = i.auto === 'contract' ? signed.has(b.id) : i.auto === 'paid' ? paid(b) : i.auto === 'passport' ? !!b.client_passport
        : i.auto === 'review' ? !!b.review_request_sent_at : false;
      if (ok && !i.done) { i.done = true; i.doneAt = now; }
    }
    if (!t.validated && t.checklist.every(i => i.done)) { t.validated = true; t.validatedAt = now; }
  };
  for (const b of (starts ?? []) as unknown as B[]) upsert(b, 'booking-start');
  for (const b of (ends ?? []) as unknown as B[]) upsert(b, 'booking-end');
  await writeTrips(list);
}

/** Pour l'appel de la veille (18h) : ce qui manque encore pour le départ / retour d'un client. */
export async function clientChecklistMissing(bookingId: string, kind: 'booking-start' | 'booking-end'): Promise<string> {
  const t = (await readTrips()).find(x => x.id === `${kind === 'booking-start' ? 'bs' : 'be'}-${bookingId}`);
  const left = t?.checklist.filter(i => !i.done).map(i => i.label.toLowerCase()) ?? [];
  return left.length ? ` Check-list pas validée, il manque : ${left.join(', ')}.` : '';
}

// ── Rappels ──────────────────────────────────────────────────────────────────

const missing = (t: Trip) => t.checklist.filter(i => !i.done);
const upcoming = (list: Trip[]) => list.filter(t => !t.validated && t.checklist.length && t.departAt > Date.now() - 3 * 3600_000)
  .sort((a, b) => a.departAt - b.departAt);
const inDays = (n: number) => n <= 0 ? "aujourd'hui" : n === 1 ? 'demain' : `dans ${n} jours`;

/** Lignes ajoutées au message du matin (voyages de Kouider ≤ 5 jours dont la check-list n'est pas validée). */
export async function tripNudges(): Promise<string> {
  const mine = upcoming(await readTrips()).filter(t => t.who === 'kouider' && daysUntil(t.departAt) <= REMIND_FROM_DAYS);
  return mine.map(t => `🧳 ${t.title} ${inDays(daysUntil(t.departAt))} — n'oublie pas : ${missing(t).map(i => i.label.toLowerCase()).join(', ')}.`).join('\n');
}

/** 19h30 (Bruxelles) : rappel des check-lists pas validées ; à J-2 / J-1 / J → appel pour les valider. */
export async function jobTripReminders(): Promise<void> {
  await syncClientChecklists().catch(e => console.error('[trips] clients:', e));
  const list = upcoming(await readTrips()).filter(t => daysUntil(t.departAt) <= REMIND_FROM_DAYS && daysUntil(t.departAt) >= 0);
  if (!list.length) return;
  const mine = list.filter(t => t.who === 'kouider'), clients = list.filter(t => t.who === 'client');
  const lines: string[] = [];
  for (const t of mine) {
    const done = t.checklist.length - missing(t).length;
    lines.push(`🧳 ${t.title} — ${inDays(daysUntil(t.departAt))} (${fmtWhen(t.departAt, t.tz)})\n   ✅ ${done}/${t.checklist.length} validés. Il manque : ${missing(t).map(i => i.label).join(', ')}.`);
  }
  for (const t of clients) lines.push(`👥 ${t.title} — ${inDays(daysUntil(t.departAt))}\n   Il manque : ${missing(t).map(i => i.label).join(', ')}.`);
  const text = `📋 Check-lists à valider\n\n${lines.join('\n\n')}\n\nRéponds par ex. « le chargeur c'est bon », « ajoute lunettes de soleil » ou « tout est ok pour mon voyage ».`;
  await queueTelegramMessage(text);
  emitProactive('📋 Check-lists à valider', 'reminder', text);

  // Appel : voyages de Kouider à J-2 ou moins ; clients à J-2 (J-1 = l'appel de 18h « veille de location » le dit déjà)
  const urgent = [...mine.filter(t => daysUntil(t.departAt) <= CALL_FROM_DAYS), ...clients.filter(t => daysUntil(t.departAt) === CALL_FROM_DAYS)];
  if (!urgent.length) return;
  const said = urgent.map(t => `${t.who === 'kouider' ? `Ton ${t.title.replace(/^Vol/, 'vol')}` : t.title} ${inDays(daysUntil(t.departAt))} : il manque ${missing(t).slice(0, 6).map(i => i.label.toLowerCase()).join(', ')}.`);
  await autoCall(`trip-checklist:${localNow().date}`,
    `Les check-lists ne sont pas validées. ${said.join(' ')} On les valide maintenant ? Dis-moi ce qui est prêt.`, { level: 'urgent' });
}

// ── Billets reçus par mail (boîte pro) ───────────────────────────────────────

const EXTRACT_SYSTEM = `Tu lis un e-mail (souvent transféré) et tu extrais une réservation de VOL s'il y en a une.
Réponds UNIQUEMENT en JSON : {"is_flight": bool, "passengers": [noms], "flights": [{"flight_number": "", "airline": "", "from": "ville ou aéroport", "to": "ville ou aéroport", "depart_local": "YYYY-MM-DD HH:MM", "arrive_local": "YYYY-MM-DD HH:MM"}]}
Heures = heures LOCALES de chaque aéroport, telles qu'écrites dans le billet. Aller puis retour dans l'ordre. is_flight=false si ce n'est pas une réservation de vol confirmée (pub, newsletter, offre).`;

async function extractFlights(material: string, image?: { b64: string; mime: string }): Promise<{ is_flight: boolean; passengers?: string[]; flights?: NewFlight[] } | null> {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: material.slice(0, 12_000) || 'Billet en image.' }];
  if (image) content.unshift({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.b64 } });
  const res = await createAnthropic().messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 800, system: EXTRACT_SYSTEM, messages: [{ role: 'user', content: content as never }],
  }, QUALITY);
  const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { return null; }
}

async function whoIsPassenger(names: string[]): Promise<{ who: 'kouider' | 'client'; client?: string; bookingId?: string }> {
  const joined = norm(names.join(' '));
  if (!names.length || /kouider/.test(joined)) return { who: 'kouider' };
  const { data } = await supabase.from('bookings').select('id, client_name, start_date').in('status', ['PENDING', 'CONFIRMED'])
    .gte('start_date', localNow().date).order('start_date').limit(40);
  for (const b of (data ?? []) as Array<{ id: string; client_name: string }>) {
    const parts = norm(b.client_name).split(' ').filter(p => p.length > 2);
    if (parts.length && parts.every(p => joined.includes(p))) return { who: 'client', client: b.client_name, bookingId: b.id };
  }
  return { who: 'kouider' };
}

async function saveExtracted(ex: { passengers?: string[]; flights?: NewFlight[] }, source: string): Promise<string> {
  const flights = (ex.flights ?? []).filter(f => f.depart_local && f.from && f.to);
  if (!flights.length) return '';
  const p = await whoIsPassenger(ex.passengers ?? []);
  const made: Trip[] = [];
  for (const f of flights) {
    const r = await addFlight({ ...f, who: p.who, client_name: p.client, booking_id: p.bookingId, source });
    if (typeof r !== 'string') made.push(r);
  }
  if (!made.length) return '';
  if (p.who === 'kouider' && made.length >= 2) {
    const list = await readTrips();
    const out = list.find(t => t.id === made[0]!.id)!, back = list.find(t => t.id === made[made.length - 1]!.id)!;
    back.checklist = []; back.validated = true;             // une seule check-list : celle de l'aller
    linkPause(list, out, back);
    await writeTrips(list);
  }
  return made.map(t => `✈️ ${t.title} — ${fmtWhen(t.departAt, t.tz)}`).join('\n');
}

/** Toutes les 15 min : billets d'avion arrivés dans la boîte pro (transférés par Kouider ou envoyés par la compagnie). */
export async function jobFlightMailImport(): Promise<void> {
  let msgs;
  try {
    msgs = await listInboxMessages('pro', 'newer_than:2d (vol OR flight OR boarding OR embarquement OR e-ticket OR itinéraire OR itinerary OR "confirmation de réservation" OR "booking confirmation" OR billet)', 10);
  } catch { return; }
  let done: string[] = [];
  try { done = JSON.parse((await kvGet(MAIL_DONE_KEY)) ?? '[]') as string[]; } catch { /* vide */ }
  for (const m of msgs) {
    if (done.includes(m.id)) continue;
    done.push(m.id);
    await kvSet(MAIL_DONE_KEY, JSON.stringify(done.slice(-200)));
    try {
      const mail = await readEmail('pro', m.id, 10_000);
      const ex = await extractFlights(`De : ${mail.from}\nObjet : ${mail.subject}\n\n${mail.body}`);
      if (!ex?.is_flight) continue;
      const saved = await saveExtracted(ex, `mail « ${mail.subject} »`);
      if (!saved) continue;
      const text = `📧 Billet trouvé dans la boîte pro (« ${mail.subject} ») :\n${saved}\n\nAjouté à l'agenda FIK${/Arrivée de/.test(saved) ? '' : ' + check-list de voyage créée (passeport, carte d\'identité, chargeur…). Dis « montre ma check-list » pour la voir ou « ajoute … » pour la compléter'}.`;
      await queueTelegramMessage(text);
      emitProactive('✈️ Billet ajouté à l\'agenda', 'info', text);
    } catch (err) {
      console.error('[trips] mail', m.id, err instanceof Error ? err.message : err);
    }
  }
}

// ── Outil travel ─────────────────────────────────────────────────────────────

function findTrip(list: Trip[], q: unknown): Trip | undefined {
  const s = norm(String(q ?? ''));
  const live = list.filter(t => t.departAt > Date.now() - 3 * 3600_000).sort((a, b) => a.departAt - b.departAt);
  if (!s) return live.find(t => t.who === 'kouider' && t.checklist.length) ?? live.find(t => t.checklist.length);
  return list.find(t => t.id === String(q)) ?? live.find(t => norm(`${t.title} ${t.clientName ?? ''} ${t.to ?? ''} ${t.flightNumber ?? ''}`).includes(s))
    ?? live.find(t => s.split(' ').filter(w => w.length > 2).some(w => norm(`${t.title} ${t.clientName ?? ''}`).includes(w)));
}

function matchItems(t: Trip, wanted: string[]): CheckItem[] {
  if (wanted.some(w => /^(tout|all|toute? la liste)$/.test(norm(w)))) return t.checklist;
  const out: CheckItem[] = [];
  for (const w of wanted.map(norm).filter(Boolean)) {
    const hit = t.checklist.find(i => norm(i.label).includes(w) || w.includes(norm(i.label)))
      ?? t.checklist.find(i => w.split(' ').filter(x => x.length > 3).some(x => norm(i.label).includes(x.replace(/s$/, ''))));
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

function show(t: Trip): string {
  const left = missing(t);
  return [
    `${t.who === 'kouider' ? '🧳' : '👥'} ${t.title} — ${fmtWhen(t.departAt, t.tz)} (${inDays(daysUntil(t.departAt))}) [id: ${t.id}]`,
    ...t.checklist.map(i => `${i.done ? '✅' : '⬜'} ${i.label}`),
    t.validated ? '✔️ Check-list VALIDÉE.' : `Reste ${left.length}/${t.checklist.length}.`,
  ].join('\n');
}

export async function travelTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const action = String(input['action'] ?? 'list');
  const list = await readTrips();

  if (action === 'add_trip') {
    const base: NewFlight = {
      who: input['who'] === 'client' ? 'client' : 'kouider', client_name: input['client_name'] as string | undefined,
      booking_id: input['booking_id'] as string | undefined, flight_number: input['flight_number'] as string | undefined,
      airline: input['airline'] as string | undefined, from: String(input['from'] ?? ''), to: String(input['to'] ?? ''),
      depart_local: String(input['depart_local'] ?? ''), arrive_local: input['arrive_local'] as string | undefined,
      depart_tz: input['depart_tz'] as string | undefined, arrive_tz: input['arrive_tz'] as string | undefined,
      airport_address: input['airport_address'] as string | undefined, source: 'billet envoyé à Dzaryx',
    };
    if (!base.from || !base.to) return '❌ Il me faut la ville / l\'aéroport de départ et d\'arrivée.';
    const out = await addFlight(base);
    if (typeof out === 'string') return out;
    let back: Trip | undefined;
    if (input['return_depart_local']) {
      const r = await addFlight({ ...base, from: base.to, to: base.from, flight_number: input['return_flight_number'] as string | undefined,
        depart_local: String(input['return_depart_local']), arrive_local: input['return_arrive_local'] as string | undefined,
        depart_tz: base.arrive_tz, arrive_tz: base.depart_tz, airport_address: input['return_airport_address'] as string | undefined });
      if (typeof r !== 'string') back = r;
    }
    const fresh = await readTrips();
    const o = fresh.find(t => t.id === out.id)!;
    if (back) { const b = fresh.find(t => t.id === back!.id)!; b.checklist = []; b.validated = true; }
    linkPause(fresh, o, back && fresh.find(t => t.id === back!.id));
    await writeTrips(fresh);
    if (o.who === 'client') return `✅ ${o.title} ajouté à l'agenda FIK (${fmtWhen(o.arriveAt ?? o.departAt, guessTz(o.to ?? ''))}). Le point « vol connu » de sa check-list d'arrivée est coché.`;
    return [
      `✅ Voyage enregistré : ${o.title} — ${fmtWhen(o.departAt, o.tz)}${back ? `\n↩️ Retour : ${back.title} — ${fmtWhen(back.departAt, back.tz)}` : ''}`,
      `📅 Dans l'agenda FIK : le vol + « être à l'aéroport » 2 h 30 avant (je te dirai quand partir selon le trafic).`,
      o.pauseFrom && o.pauseTo ? `⏸️ Routine du matin en pause du ${o.pauseFrom} au ${o.pauseTo}.` : `ℹ️ Donne-moi la date de retour pour mettre la routine du matin en pause pendant le voyage.`,
      '', show(o), '',
      `Je te rappelle ce qui manque chaque soir dès J-5, et je t'appelle à J-2 si ce n'est pas validé. Dis « ajoute … » pour compléter.`,
    ].join('\n');
  }

  if (action === 'list') {
    await syncClientChecklists().catch(() => {});
    const live = (await readTrips()).filter(t => t.departAt > Date.now() - 3 * 3600_000 && (t.checklist.length || t.kind === 'flight')).sort((a, b) => a.departAt - b.departAt);
    if (!live.length) return 'Aucun voyage ni check-list en cours. Envoie-moi un billet (photo, PDF ou mail transféré à la boîte pro).';
    return live.map(t => `${t.validated ? '✔️' : '⏳'} ${t.who === 'kouider' ? '🧳' : '👥'} ${t.title} — ${fmtWhen(t.departAt, t.tz)}${t.checklist.length ? ` · ${t.checklist.length - missing(t).length}/${t.checklist.length}` : ''} [id: ${t.id}]`).join('\n');
  }

  const t = findTrip(list, input['trip']);
  if (!t) return '❌ Je ne trouve pas ce voyage / cette check-list. Dis « liste mes voyages ».';
  const items = (Array.isArray(input['items']) ? input['items'] : []).map(String).filter(Boolean);

  if (action === 'show') return show(t);
  if (action === 'add_items') {
    for (const label of items) if (!t.checklist.some(i => norm(i.label) === norm(label))) t.checklist.push({ label: label.charAt(0).toUpperCase() + label.slice(1), done: false });
    t.validated = false;
  } else if (action === 'remove_items') {
    const hit = matchItems(t, items);
    t.checklist = t.checklist.filter(i => !hit.includes(i));
  } else if (action === 'check' || action === 'validate') {
    const hit = action === 'validate' ? t.checklist : matchItems(t, items);
    if (!hit.length) return `❌ Je ne vois pas « ${items.join(', ')} » dans la check-list.\n${show(t)}`;
    for (const i of hit) if (!i.done) { i.done = true; i.doneAt = new Date().toISOString(); }
  } else if (action === 'uncheck') {
    for (const i of matchItems(t, items)) { i.done = false; delete i.doneAt; }
    t.validated = false;
  } else if (action === 'delete') {
    for (const id of t.calendarIds) await deleteAgendaEvent(id).catch(() => false);
    await writeTrips(list.filter(x => x.id !== t.id));
    return `🗑️ ${t.title} supprimé (et retiré de l'agenda).`;
  } else return '❌ Action inconnue.';

  if (!t.validated && t.checklist.length && t.checklist.every(i => i.done)) { t.validated = true; t.validatedAt = new Date().toISOString(); }
  await writeTrips(list);
  return t.validated ? `🎉 Check-list VALIDÉE pour ${t.title} — plus de rappels. Bon voyage !\n${show(t)}` : show(t);
}

/** Billet reçu en PDF / image hors chat (ex. Telegram) — utilisé si besoin par d'autres modules. */
export async function importTicket(material: string, image?: { b64: string; mime: string }): Promise<string> {
  const ex = await extractFlights(material, image);
  return ex?.is_flight ? await saveExtracted(ex, 'billet reçu') : '';
}
