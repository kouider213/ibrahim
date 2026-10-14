import { supabase } from './supabase.js';
import { kvGet, kvSet } from './app-store.js';
import { emitProactive } from '../notifications/mobile-push.js';

// Saisons qui font la demande à Oran : diaspora (vacances scolaires France/Belgique, été), fêtes musulmanes,
// fêtes nationales. Chaque lundi, Dzaryx prévient Kouider des périodes qui arrivent (≤ 6 semaines) avec le
// remplissage RÉEL du parc sur ces dates → monter les prix, bloquer les meilleures voitures, relancer les clients.
// Fêtes musulmanes calculées avec le calendrier Umm al-Qura (ICU) : en Algérie la date peut varier d'un jour.

export interface Season { name: string; start: string; end: string; kind: 'diaspora' | 'fete' | 'nationale'; note: string }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(new Date(`${s}T12:00:00Z`).getTime() + n * 86_400_000));

// Vacances scolaires (sources officielles 2026-2027 : arrêté FR du 22/10/2025, calendrier FWB).
// À compléter chaque année (dès que le calendrier suivant sort) — sinon seules les fêtes restent calculées.
const SCHOOL: Season[] = [
  { name: 'Toussaint (France + Belgique)', start: '2026-10-17', end: '2026-11-02', kind: 'diaspora', note: 'FR toutes zones 17/10-2/11, BE 19-30/10' },
  { name: 'Noël (France + Belgique)', start: '2026-12-19', end: '2027-01-04', kind: 'diaspora', note: 'FR 19/12-4/1, BE 21/12-1/1' },
  { name: 'Hiver France (zones C, A, B)', start: '2027-02-06', end: '2027-03-08', kind: 'diaspora', note: 'C 6-22/2 (Paris), A 13/2-1/3, B 20/2-8/3' },
  { name: 'Carnaval Belgique', start: '2027-02-20', end: '2027-03-07', kind: 'diaspora', note: 'FWB 22/2-5/3' },
  { name: 'Printemps France (zones C, A, B)', start: '2027-04-03', end: '2027-05-03', kind: 'diaspora', note: 'C 3-19/4, A 10-26/4, B 17/4-3/5' },
  { name: 'Printemps Belgique', start: '2027-04-24', end: '2027-05-09', kind: 'diaspora', note: 'FWB 26/4-7/5' },
  { name: 'Été diaspora', start: '2027-07-01', end: '2027-08-31', kind: 'diaspora', note: 'pic de l\'année (FR dès le 3/7, BE 3/7 → fin août)' },
];

/** Jour grégorien où commence le jour hégirien (mois, jour) entre from et to (Umm al-Qura). */
function hijriDays(from: string, to: string, month: number, day: number): string[] {
  const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const p = fmt.formatToParts(new Date(`${d}T12:00:00Z`));
    if (Number(p.find(x => x.type === 'month')?.value) === month && Number(p.find(x => x.type === 'day')?.value) === day) out.push(d);
  }
  return out;
}

function fixedHolidays(from: string, to: string): Season[] {
  const out: Season[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    out.push({ name: 'Yennayer', start: `${y}-01-12`, end: `${y}-01-12`, kind: 'nationale', note: 'jour férié' });
    out.push({ name: 'Fête de l\'Indépendance', start: `${y}-07-05`, end: `${y}-07-05`, kind: 'nationale', note: 'en plein été diaspora' });
    out.push({ name: 'Fête de la Révolution', start: `${y}-11-01`, end: `${y}-11-01`, kind: 'nationale', note: 'jour férié' });
  }
  return out;
}

export function seasonsBetween(from: string, to: string): Season[] {
  const list: Season[] = [...SCHOOL, ...fixedHolidays(from, to)];
  const span = { from: addDays(from, -40), to };
  for (const d of hijriDays(span.from, span.to, 9, 1)) list.push({ name: 'Ramadan', start: d, end: addDays(d, 29), kind: 'fete', note: '±1 jour selon l\'annonce officielle' });
  for (const d of hijriDays(span.from, span.to, 10, 1)) list.push({ name: 'Aïd el-Fitr', start: addDays(d, -3), end: addDays(d, 2), kind: 'fete', note: `Aïd le ${d} (±1 j) — familles en déplacement` });
  for (const d of hijriDays(span.from, span.to, 12, 10)) list.push({ name: 'Aïd el-Adha', start: addDays(d, -4), end: addDays(d, 3), kind: 'fete', note: `Aïd le ${d} (±1 j) — forte demande, beaucoup de diaspora` });
  for (const d of hijriDays(span.from, span.to, 3, 12)) list.push({ name: 'Mawlid', start: d, end: d, kind: 'fete', note: `jour férié (±1 j)` });
  return list.filter(s => s.end >= from && s.start <= to).sort((a, b) => a.start.localeCompare(b.start));
}

/** Remplissage réel du parc sur [start, end] : jours loués / (voitures × jours). */
export async function occupancy(start: string, end: string): Promise<{ pct: number; cars: number; bookedDays: number; days: number }> {
  const [{ count }, { data }] = await Promise.all([
    supabase.from('cars').select('id', { count: 'exact', head: true }).neq('available', false),
    supabase.from('bookings').select('start_date, end_date, status').lte('start_date', end).gte('end_date', start),
  ]);
  const cars = count ?? 0;
  const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1;
  let bookedDays = 0;
  for (const b of (data ?? []) as Array<{ start_date: string; end_date: string; status: string | null }>) {
    if (/cancel|reject|annul/i.test(b.status ?? '')) continue;
    const s = b.start_date > start ? b.start_date : start;
    const e = b.end_date < end ? b.end_date : end;
    bookedDays += Math.max(0, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86_400_000) + 1);
  }
  return { pct: cars && days ? Math.round((100 * bookedDays) / (cars * days)) : 0, cars, bookedDays, days };
}

const fr = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function advice(s: Season, pct: number, inDays: number): string {
  if (pct >= 80) return 'presque plein → prix au maximum, n\'accepte plus de remises';
  if (s.kind === 'diaspora' || s.name.startsWith('Aïd')) {
    return inDays > 21
      ? 'monte les prix maintenant (+15 à 30 %), relance les clients diaspora des années passées, poste une annonce'
      : 'dernière ligne droite : relance tes anciens clients, prix fermes, garde 1 voiture pour les urgences';
  }
  return 'demande locale en hausse, pense à ajuster les prix';
}

export async function seasonsReport(horizonDays = 120): Promise<string> {
  const today = iso(new Date());
  const list = seasonsBetween(today, addDays(today, horizonDays));
  if (!list.length) return `📅 Aucune saison forte dans les ${horizonDays} prochains jours.`;
  const lines: string[] = [];
  for (const s of list) {
    const from = s.start < today ? today : s.start;
    const o = await occupancy(from, s.end);
    const inDays = Math.max(0, Math.round((new Date(s.start).getTime() - Date.now()) / 86_400_000));
    lines.push(`• ${s.name} — ${fr(s.start)} → ${fr(s.end)}${inDays ? ` (dans ${inDays} j)` : ' (en cours)'} · ${s.note}\n   Parc réservé : ${o.pct} % (${o.bookedDays} j loués sur ${o.cars} voitures × ${o.days} j) → ${advice(s, o.pct, inDays)}`);
  }
  return `📅 Saisons à venir (${horizonDays} j)\n${lines.join('\n')}`;
}

/** Job lundi 9h15 : périodes qui commencent dans ≤ 6 semaines, chacune annoncée 2 fois max (≈ J-42 et J-14). */
export async function jobSeasonWatch(): Promise<string> {
  const today = iso(new Date());
  const soon = seasonsBetween(today, addDays(today, 42)).filter(s => s.start >= today);
  const fresh: Season[] = [];
  for (const s of soon) {
    const inDays = Math.round((new Date(s.start).getTime() - Date.now()) / 86_400_000);
    const stage = inDays <= 14 ? 'j14' : 'j42';
    const key = `season:told:${s.name}:${s.start}:${stage}`;
    if (await kvGet(key)) continue;
    await kvSet(key, '1', 120 * 86_400);
    fresh.push(s);
  }
  if (!fresh.length) return 'rien de nouveau';
  const lines: string[] = [];
  for (const s of fresh) {
    const o = await occupancy(s.start, s.end);
    const inDays = Math.round((new Date(s.start).getTime() - Date.now()) / 86_400_000);
    lines.push(`• ${s.name} dans ${inDays} j (${fr(s.start)} → ${fr(s.end)}) — parc réservé ${o.pct} % → ${advice(s, o.pct, inDays)}`);
  }
  emitProactive(`📅 ${fresh.map(s => s.name).join(', ')} arrive${fresh.length > 1 ? 'nt' : ''}.`, 'info',
    `📅 Saisons qui arrivent :\n${lines.join('\n')}\n\nDis « applique les prix de saison » pour que je propose les nouveaux tarifs.`, 'kouider');
  return `${fresh.length} saison(s) annoncée(s)`;
}
