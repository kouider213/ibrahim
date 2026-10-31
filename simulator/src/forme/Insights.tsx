import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { get } from './api.ts';
import { F, card, Ring, LineChart } from './ui.tsx';

// 📊 STATS PRO (31/10) — le meilleur des grosses applis, calculé sur ses vraies données (/api/forme/insights) :
// anneau objectif semaine (Apple Fitness / Hevy), séries par muscle vs zone utile 10-20 (JEFIT / Alpha Progression),
// calendrier 12 semaines (Hevy / Strava), semaines tenues + badges (Strava / Peloton), tendances montre (Fitbit / Garmin).
export interface InsightsData {
  week: { done: number; target: number }; weekStreak: number; total: number; sets: Record<string, number>;
  calendar: Array<{ date: string; done: boolean; future: boolean }>; badges: Array<{ e: string; l: string; ok: boolean }>;
  health: Array<{ date: string; steps?: number; rhr?: number; hrv?: number; sleep_h?: number }>; load: string;
}
const MUSCLE: Record<string, string> = { pecs: 'Pecs', dos: 'Dos', epaules: 'Épaules', bras: 'Bras', jambes: 'Jambes', abdos: 'Abdos' };
let cache: InsightsData | null = null;
export function useInsights(): InsightsData | null {
  const [d, setD] = useState<InsightsData | null>(cache);
  useEffect(() => { get<InsightsData>('/api/forme/insights').then(x => { cache = x; setD(x); }).catch(() => {}); }, []);
  return d;
}
const H2 = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 19, fontWeight: 700, margin: '24px 2px 10px' }}>{children}</div>;

/** Petit anneau « objectif de la semaine » (en-tête de l'onglet Séance). */
export function WeekGoal() {
  const d = useInsights();
  if (!d) return null;
  const ok = d.week.done >= d.week.target;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Ring value={d.week.done} max={d.week.target} size={40} stroke={5} color={ok ? F.green : F.accent} track={F.bg2}><div style={{ fontSize: 11, fontWeight: 700 }}>{d.week.done}/{d.week.target}</div></Ring>
      {d.weekStreak > 0 && <div style={{ background: '#fff1e0', color: '#c06a00', borderRadius: 999, padding: '6px 10px', fontSize: 12.5, fontWeight: 700 }}>🔥 {d.weekStreak} sem.</div>}
    </div>
  );
}

export default function Insights() {
  const d = useInsights();
  if (!d) return null;
  const max = Math.max(20, ...Object.values(d.sets));
  const weeks = Array.from({ length: 12 }, (_, w) => d.calendar.slice(w * 7, w * 7 + 7));
  const h = d.health;
  return (
    <div>
      <H2>Cette semaine</H2>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Ring value={d.week.done} max={d.week.target} size={86} stroke={9} color={d.week.done >= d.week.target ? F.green : F.accent} track={F.bg2}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{d.week.done}<span style={{ fontSize: 13, color: F.muted }}>/{d.week.target}</span></div>
        </Ring>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{d.week.done >= d.week.target ? 'Objectif atteint 🎉' : `Encore ${d.week.target - d.week.done} séance${d.week.target - d.week.done > 1 ? 's' : ''}`}</div>
          <div style={{ fontSize: 13, color: F.muted, marginTop: 3 }}>🔥 {d.weekStreak} semaine{d.weekStreak > 1 ? 's' : ''} tenue{d.weekStreak > 1 ? 's' : ''} d'affilée · {d.total} séances au total</div>
          {d.load && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 4 }}>{d.load}</div>}
        </div>
      </div>

      <H2>Séries par muscle (7 jours)</H2>
      <div style={{ ...card }}>
        {Object.entries(d.sets).map(([m, n]) => (
          <div key={m} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 34px', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{MUSCLE[m] ?? m}</div>
            <div style={{ position: 'relative', height: 12, background: F.bg, borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: `${10 / max * 100}%`, width: `${10 / max * 100}%`, top: 0, bottom: 0, background: 'rgba(31,157,92,0.14)' }} />
              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, n / max * 100)}%` }} style={{ height: '100%', borderRadius: 6, background: n >= 10 ? F.green : n > 0 ? F.accent2 : 'transparent' }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: n >= 10 ? F.green : F.ink }}>{n}</div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: F.muted, marginTop: 6 }}>Zone verte = 10 à 20 séries par semaine, l'idéal pour faire grossir un muscle.</div>
      </div>

      <H2>Calendrier</H2>
      <div style={{ ...card }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(12, 1fr)`, gap: 4 }}>
          {weeks.map((w, i) => <div key={i} style={{ display: 'grid', gap: 4 }}>{w.map(c => <div key={c.date} title={c.date} style={{ aspectRatio: '1', borderRadius: 4, background: c.done ? F.accent : c.future ? 'transparent' : F.bg2, border: c.future ? `1px dashed ${F.line}` : 'none' }} />)}</div>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: F.muted, marginTop: 8 }}><span>il y a 12 semaines</span><span>cette semaine</span></div>
      </div>

      <H2>Badges</H2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {d.badges.map(b => (
          <div key={b.l} style={{ ...card, padding: '12px 6px', textAlign: 'center', opacity: b.ok ? 1 : 0.4, filter: b.ok ? 'none' : 'grayscale(1)' }}>
            <div style={{ fontSize: 26 }}>{b.e}</div><div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, lineHeight: 1.2 }}>{b.l}</div>
          </div>
        ))}
      </div>

      {h.length > 1 && <>
        <H2>Ta montre (30 jours)</H2>
        {h.some(x => x.hrv) && <div style={{ ...card, marginBottom: 8 }}><div style={{ fontWeight: 600, fontSize: 14 }}>VFC (ms) — plus haut = mieux récupéré</div><LineChart points={h.filter(x => x.hrv).map(x => ({ x: x.date, y: x.hrv! }))} color={F.green} unit="ms" h={120} /></div>}
        {h.some(x => x.rhr) && <div style={{ ...card, marginBottom: 8 }}><div style={{ fontWeight: 600, fontSize: 14 }}>Cœur au repos (bpm) — plus bas = mieux</div><LineChart points={h.filter(x => x.rhr).map(x => ({ x: x.date, y: x.rhr! }))} color={F.red} unit="bpm" h={120} /></div>}
        {h.some(x => x.steps) && <div style={{ ...card, marginBottom: 8 }}><div style={{ fontWeight: 600, fontSize: 14 }}>Pas par jour</div><LineChart points={h.filter(x => x.steps).map(x => ({ x: x.date, y: x.steps! }))} color={F.accent} unit="pas" h={120} /></div>}
        {h.some(x => x.sleep_h) && <div style={{ ...card }}><div style={{ fontWeight: 600, fontSize: 14 }}>Sommeil (h)</div><LineChart points={h.filter(x => x.sleep_h).map(x => ({ x: x.date, y: x.sleep_h! }))} color={F.violet} unit="h" h={120} /></div>}
      </>}
    </div>
  );
}
