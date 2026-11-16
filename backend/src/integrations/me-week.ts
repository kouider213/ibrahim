// 16/11 : « Toi » sur la page Aujourd'hui (séance, protéines, Liberté, RDV médecin, nuit) + « Ta semaine » (7 derniers jours
// comparés aux 7 d'avant : poids, séances, sommeil, demis, protéines) + CA du mois (même source que l'écran CA).
// Le dimanche 19h30, la même carte part en message Telegram.
import { kvGet } from './app-store.js';
import { localNow } from './morning-routine.js';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const r1 = (n: number | null) => n == null ? null : Math.round(n * 10) / 10;

export interface WeekRow { id: string; label: string; now: number | null; prev: number | null; unit: string; better: 'up' | 'down'; note?: string }
export interface MeCard {
  today: string;
  session: { label: string | null; done: boolean; skipped: boolean } | null;
  protein: { eaten: number; goal: number } | null;
  liberte: { taken: number; allowed: number; next: { time: string; n: number } | null } | null;
  doctor: { date: string; status: string } | null;
  sleep: number | null;
  week: WeekRow[];
  ca: { month: string; gross: number } | null;
}

export async function meCard(): Promise<MeCard> {
  const today = localNow().date;
  const inWin = (d: string, k: 0 | 1) => d > addDays(today, -7 * (k + 1)) && d <= addDays(today, -7 * k);
  const [sport, food, lib, ov, health, ca] = await Promise.all([
    import('./sport-coach.js').then(async m => ({ today: await m.sportToday(), log: await m.readSportLog() })).catch(() => null),
    import('./forme-food.js').then(async m => ({ b: await m.foodBudget('kouider'), w: await m.foodWeek('kouider', 14) })).catch(() => null),
    import('./liberte.js').then(async m => ({ o: await m.libOverview(), log: await m.readLibLog() })).catch(() => null),
    import('./forme.js').then(m => m.formeOverview('kouider')).catch(() => null),
    kvGet('health:daily').then(r => JSON.parse(r ?? '[]') as Array<{ date: string; sleep_h?: number }>).catch(() => []),
    import('./finance.js').then(m => { const d = new Date(); return m.getFinancialReport(d.getFullYear(), d.getMonth() + 1); }).catch(() => null),
  ]);

  const doneDates = new Set((sport?.log ?? []).map(l => l.date));
  const session = sport ? { label: sport.today.label, done: doneDates.has(today), skipped: sport.today.skipped } : null;

  const weights = (ov?.weights ?? []) as Array<{ date: string; kg: number }>;
  const wAvg = (k: 0 | 1) => r1(avg(weights.filter(w => inWin(w.date, k)).map(w => w.kg)));
  const sleepOf = (k: 0 | 1) => r1(avg(health.filter(h => inWin(h.date, k) && h.sleep_h).map(h => h.sleep_h!)));
  const sessions = (k: 0 | 1) => [...doneDates].filter(d => inWin(d, k)).length;
  const demis = (k: 0 | 1) => {
    const log = (lib?.log ?? []).filter(l => l.kind === 'prise' && inWin(l.at.slice(0, 10), k));
    return log.length ? log.reduce((a, l) => a + (l.n ?? 1), 0) : (k === 0 && lib ? lib.o.week.reduce((a, d) => a + d.taken, 0) : null);
  };
  const protAvg = (k: 0 | 1) => { const ds = (food?.w.days ?? []).filter(d => !d.today && d.meals > 0 && inWin(d.date, k)); return ds.length ? Math.round(avg(ds.map(d => d.p))!) : null; };
  const lastNight = health.find(h => h.date === today)?.sleep_h ?? null;

  const week: WeekRow[] = [
    { id: 'poids', label: 'Poids moyen', now: wAvg(0), prev: wAvg(1), unit: 'kg', better: 'down' },
    { id: 'seances', label: 'Séances', now: sessions(0), prev: sessions(1), unit: '', better: 'up' },
    { id: 'sommeil', label: 'Sommeil moyen', now: sleepOf(0), prev: sleepOf(1), unit: 'h', better: 'up' },
    { id: 'proteines', label: 'Protéines / jour', now: protAvg(0), prev: protAvg(1), unit: 'g', better: 'up', note: food ? `objectif ${food.b.proteinGoal} g` : undefined },
    { id: 'demis', label: 'Demis Liberté', now: demis(0), prev: demis(1), unit: '', better: 'down' },
  ];
  // 75 kg = plancher ET objectif (sèche finie) : sous 75 kg la baisse n'est plus « mieux »
  if ((week[0]!.now ?? 99) <= 75.5) week[0]!.note = 'plancher 75 kg : on stabilise';

  return {
    today, session,
    protein: food ? { eaten: food.b.eaten.p, goal: food.b.proteinGoal } : null,
    liberte: lib?.o.state ? { taken: lib.o.taken, allowed: lib.o.allowed, next: lib.o.next } : null,
    doctor: lib?.o.state?.doctor?.date && lib.o.state.doctor.status !== 'vu' && lib.o.state.doctor.date.slice(0, 10) >= today ? { date: lib.o.state.doctor.date, status: lib.o.state.doctor.status } : null,
    sleep: lastNight,
    week,
    ca: ca ? { month: ca.period, gross: Math.round(ca.grossCA) } : null,
  };
}

const arrow = (r: WeekRow) => {
  if (r.now == null || r.prev == null || r.now === r.prev) return '';
  const good = (r.now > r.prev) === (r.better === 'up');
  return good ? ' ✅' : ' ⚠️';
};
const fmt = (n: number | null, u: string) => n == null ? '—' : `${String(n).replace('.', ',')}${u ? ` ${u}` : ''}`;

/** Dimanche 19h30 : la carte en message. */
export async function jobWeekCard(): Promise<string> {
  const c = await meCard();
  const rows = c.week.filter(r => r.now != null || r.prev != null);
  if (!rows.length) return 'rien';
  const { tg } = await import('./ai-util.js');
  const lines = rows.map(r => `• ${r.label} : ${fmt(r.now, r.unit)}${r.prev != null ? ` (avant ${fmt(r.prev, r.unit)})` : ''}${arrow(r)}${r.note ? ` — ${r.note}` : ''}`);
  await tg(`📊 Ta semaine (7 derniers jours, comparés aux 7 d'avant) :\n${lines.join('\n')}${c.ca ? `\n• CA de ${c.ca.month} : ${c.ca.gross} €` : ''}\n\nLa même carte est dans l'app, page Aujourd'hui.`);
  return 'envoyé';
}
