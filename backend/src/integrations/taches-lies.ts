/**
 * MES TÂCHES — LIENS (27/11/2026, Kouider : « connecte ça avec les arrivées et départs des clients, et pour moi aussi
 * quand je vais en Algérie ») :
 *  - arrivées / retours des clients (check-lists de trips.ts, créées depuis les réservations) des 3 prochains jours ;
 *  - ses propres vols (trips.ts) des 10 prochains jours avec leur check-list ;
 *  - où il est : Algérie (mode Oran GPS ou voyage en cours vers l'Algérie) ou Belgique → tâches « à faire en Algérie » / « au retour ».
 * Lecture seule ici ; on coche avec tickTripItem (trips.ts).
 */
import { localNow } from './morning-routine.js';
import { kvJson } from './ai-util.js';

export type Lieu = 'algerie' | 'belgique';
export interface ClientMove {
  id: string; kind: 'arrivee' | 'retour'; client: string; car: string; date: string; time: string | null; label: string;
  missing: string[]; checklist: Array<{ label: string; done: boolean }>; phone: string | null; bookingId: string | null;
  flags: Array<{ icon: string; text: string; tone: 'bad' | 'warn' | 'ok' | 'info' }>; validated: boolean;
}
export interface MyTrip { id: string; title: string; date: string; time: string; inDays: number; to: string; missing: string[]; checklist: Array<{ label: string; done: boolean }>; requests: string[] }

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const DZ = /\b(oran|alger|algiers|constantine|annaba|tlemcen|bejaia|setif|algerie|algeria|orn|alg)\b/i;
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export function dayLabel(date: string, today = localNow().date): string {
  if (date === today) return "aujourd'hui";
  if (date === addDays(today, 1)) return 'demain';
  if (date < today) return `le ${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const d = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  return d < 7 ? DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]! : `le ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Où est Kouider : GPS en Algérie (mode Oran) ou voyage en cours vers l'Algérie → 'algerie', sinon 'belgique'. */
export async function currentPlace(): Promise<Lieu> {
  try { if (await (await import('./gps-life.js')).oranActive()) return 'algerie'; } catch { /* */ }
  try { const away = await (await import('./trips.js')).kouiderAwayOn(localNow().date); if (away && DZ.test(away)) return 'algerie'; } catch { /* */ }
  return 'belgique';
}

/** Son séjour en Algérie (voyage) qui couvre une date, pour « tu es sur place ». */
async function staysInDz(): Promise<Array<{ from: string; to: string }>> {
  const { readTrips } = await import('./trips.js');
  return (await readTrips()).filter(t => t.who === 'kouider' && t.pauseFrom && t.pauseTo && DZ.test(`${t.to ?? ''}`)).map(t => ({ from: t.pauseFrom!, to: t.pauseTo! }));
}

export async function clientMoves(days = 3): Promise<ClientMove[]> {
  const { readTrips, syncClientTrips } = await import('./trips.js');
  await syncClientTrips().catch(() => {});
  const todayDz = localNow(Date.now(), 'Africa/Algiers').date;
  const trips = (await readTrips()).filter(t => t.who === 'client' && (t.kind === 'booking-start' || t.kind === 'booking-end')
    && t.departAt > Date.now() - 8 * 3600_000 && localNow(t.departAt, 'Africa/Algiers').date <= addDays(todayDz, days));
  if (!trips.length) return [];
  const ids = [...new Set(trips.map(t => t.bookingId).filter(Boolean))] as string[];
  const { supabase } = await import('./supabase.js');
  const { data } = await supabase.from('bookings').select('id, client_phone, car_id, start_date, end_date, notes, status, cars(name)').in('id', ids);
  type B = { id: string; client_phone?: string | null; car_id?: string | null; start_date: string; end_date: string; notes?: string | null; status?: string; cars?: { name?: string } | null };
  const bk = new Map(((data ?? []) as unknown as B[]).map(b => [b.id, b]));
  const { bookingTimes } = await import('./trips.js');
  const stays = await staysInDz().catch(() => []);
  const moves: ClientMove[] = trips.map(t => {
    const b = t.bookingId ? bk.get(t.bookingId) : undefined;
    const l = localNow(t.departAt, 'Africa/Algiers');
    const kind = t.kind === 'booking-start' ? 'arrivee' as const : 'retour' as const;
    const bt = bookingTimes(b?.notes);
    const known = kind === 'arrivee' ? bt.start : bt.end;
    const missing = t.checklist.filter(i => !i.done && !/^caution rendue$/i.test(i.label)).map(i => i.label);
    const flags: ClientMove['flags'] = [];
    const dIn = Math.round((Date.parse(l.date) - Date.parse(todayDz)) / 86_400_000);
    if (!known && dIn <= 2) flags.push({ icon: '🕐', text: kind === 'arrivee' ? "Heure d'arrivée inconnue : demande-la" : 'Heure de retour inconnue : demande-la', tone: 'warn' });
    if (kind === 'arrivee' && dIn <= 3 && missing.some(m => /acompte|paiement/i.test(m))) flags.push({ icon: '💶', text: 'Acompte pas encore reçu (règle : 3 jours avant)', tone: 'bad' });
    if (stays.some(s => s.from <= l.date && l.date <= s.to)) flags.push({ icon: '🇩🇿', text: 'Tu es à Oran ce jour-là : tu peux le faire toi-même', tone: 'ok' });
    return { id: t.id, kind, client: t.clientName ?? 'Client', car: b?.cars?.name ?? (t.title.match(/\(([^)]+)\)\s*$/)?.[1] ?? 'voiture'), date: l.date, time: known ?? null,
      label: dayLabel(l.date, todayDz), missing, checklist: t.checklist.map(i => ({ label: i.label, done: i.done })), phone: b?.client_phone ?? null,
      bookingId: t.bookingId ?? null, flags, validated: t.validated };
  }).sort((a, b) => (a.date + (a.time ?? '99')).localeCompare(b.date + (b.time ?? '99')));
  // Enchaînement : même voiture rendue puis reprise le même jour → la préparer entre les deux
  for (const r of moves.filter(m => m.kind === 'retour')) {
    const next = moves.find(m => m.kind === 'arrivee' && m.date === r.date && m.car === r.car && m.client !== r.client);
    if (next) { r.flags.push({ icon: '🔁', text: `Repart le même jour avec ${next.client}${next.time ? ` à ${next.time.replace(':', 'h')}` : ''} : nettoyage + plein entre les deux`, tone: 'warn' }); }
  }
  // Journée chargée : 3 mouvements ou plus le même jour
  const perDay = new Map<string, number>(); for (const m of moves) perDay.set(m.date, (perDay.get(m.date) ?? 0) + 1);
  for (const m of moves) if ((perDay.get(m.date) ?? 0) >= 3 && !m.flags.some(f => f.icon === '📈')) m.flags.push({ icon: '📈', text: `Journée chargée : ${perDay.get(m.date)} arrivées/retours`, tone: 'info' });
  return moves;
}

export async function myTrips(days = 10): Promise<MyTrip[]> {
  const { readTrips } = await import('./trips.js');
  const list = await readTrips();
  const today = localNow().date;
  return list.filter(t => t.who === 'kouider' && t.kind === 'flight' && t.departAt > Date.now() - 3 * 3600_000 && t.departAt < Date.now() + days * 86_400_000)
    .sort((a, b) => a.departAt - b.departAt).map(t => {
      const l = localNow(t.departAt, t.tz);
      const reqs = list.filter(x => x.returnOf === t.id || x.id === t.id).flatMap(x => x.checklist.filter(i => i.for && !i.done).map(i => `${i.for} : ${i.label}`));
      return { id: t.id, title: t.title, date: l.date, time: l.hhmm, inDays: Math.round((Date.parse(l.date) - Date.parse(today)) / 86_400_000), to: t.to ?? '',
        missing: t.checklist.filter(i => !i.done).map(i => i.label), checklist: t.checklist.map(i => ({ label: i.label, done: i.done })), requests: reqs };
    });
}

/** Lignes pour le message de 8h / 20h30 : mouvements clients d'un jour donné (date d'Oran). */
export function movesLines(moves: ClientMove[], date: string): string[] {
  return moves.filter(m => m.date === date).map(m => `${m.kind === 'arrivee' ? '🛬 Arrivée' : '🔑 Retour'} ${m.client} (${m.car})${m.time ? ` à ${m.time.replace(':', 'h')}` : ''}`
    + (m.missing.length ? ` — manque : ${m.missing.slice(0, 4).map(x => x.toLowerCase()).join(', ')}` : ' — ✅ prêt') + (m.flags.some(f => f.icon === '🔁') ? ' 🔁' : ''));
}

/** Dernier lieu connu (pour envoyer la liste « en Algérie » / « au retour » une seule fois au changement). */
export async function lastPlace(): Promise<Lieu | null> { return kvJson<Lieu | null>('perso:taches:lieu', null); }
