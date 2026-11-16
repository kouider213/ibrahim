// Tableau de bord FORME (16/11/2026) — Kouider : « pour FORME je vois pas de différence à part le thème sombre,
// rajoute des graphiques ». Anneaux d'activité (style Apple Fitness), graphique à onglets (volume / pas / sommeil /
// calories) et courbe de poids en aire. Uniquement des données déjà chargées (overview + /api/sport), aucun appel en plus.
import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { F, card } from './ui.tsx';
import type { Overview } from './api.ts';

type Pt = { label: string; v: number | null; today?: boolean };

const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')}k` : String(Math.round(n));
const dayL = (d: string) => ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(`${d}T12:00:00Z`).getUTCDay()]!;

function Rings({ rings, size = 132 }: { rings: Array<{ v: number; max: number; color: string }>; size?: number }) {
  const stroke = 13, gap = 3;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      {rings.map((r, i) => {
        const rad = size / 2 - stroke / 2 - i * (stroke + gap);
        const c = 2 * Math.PI * rad, pct = Math.max(0, Math.min(1, r.max ? r.v / r.max : 0));
        return (
          <g key={i}>
            <circle cx={size / 2} cy={size / 2} r={rad} stroke={r.color} strokeOpacity={0.18} strokeWidth={stroke} fill="none" />
            <motion.circle cx={size / 2} cy={size / 2} r={rad} stroke={r.color} strokeWidth={stroke} fill="none" strokeLinecap="round"
              strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }}
              transition={{ duration: 1.1, delay: 0.1 * i, ease: [0.16, 0.84, 0.3, 1] }}
              style={{ filter: `drop-shadow(0 0 6px ${r.color}66)` }} />
          </g>
        );
      })}
    </svg>
  );
}

function Bars({ pts, color, goal, unit, fmt = fmtK }: { pts: Pt[]; color: string; goal?: number; unit: string; fmt?: (n: number) => string }) {
  const W = 320, H = 150, top = 18, bottom = 22;
  const vals = pts.map(p => p.v ?? 0);
  const max = Math.max(goal ?? 0, ...vals, 1) * 1.12;
  const bw = (W / pts.length) * 0.56, step = W / pts.length;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const known = pts.filter(p => p.v != null && p.v > 0);
  const avg = known.length ? known.reduce((s, p) => s + (p.v ?? 0), 0) / known.length : null;
  const gid = `g${color.replace('#', '')}`;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '2px 2px 6px' }}>
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{avg != null ? fmt(avg) : '—'}</span>
        <span style={{ fontSize: 13, color: F.muted }}>{unit} en moyenne</span>
        {goal != null && avg != null && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 650, color: avg >= goal ? F.green : F.gold, background: `${avg >= goal ? F.green : F.gold}1f`, padding: '3px 8px', borderRadius: 8 }}>{avg >= goal ? 'Objectif tenu' : `Objectif ${fmt(goal)}`}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity={0.35} /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={W} y1={top + (H - top - bottom) * f} y2={top + (H - top - bottom) * f} stroke="var(--f-line)" strokeDasharray="2 4" />)}
        {pts.map((p, i) => {
          const v = p.v ?? 0, x = i * step + (step - bw) / 2, h = Math.max(v > 0 ? 4 : 0, (H - top - bottom) - (y(v) - top));
          return (
            <g key={i}>
              <rect x={x} y={top} width={bw} height={H - top - bottom} rx={bw / 2.6} fill="var(--f-line)" opacity={0.35} />
              <motion.rect x={x} width={bw} rx={bw / 2.6} fill={p.today ? `url(#${gid})` : color} fillOpacity={p.today ? 1 : 0.78}
                initial={{ y: H - bottom, height: 0 }} animate={{ y: H - bottom - h, height: h }} transition={{ duration: 0.7, delay: i * 0.04, ease: [0.16, 0.84, 0.3, 1] }} />
              {p.v != null && p.v > 0 && <text x={x + bw / 2} y={y(v) - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--f-muted)" fontFamily={F.mono}>{fmt(v)}</text>}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fontWeight={p.today ? 700 : 500} fill={p.today ? color : 'var(--f-muted)'} fontFamily={F.sans}>{p.label}</text>
            </g>
          );
        })}
        {goal != null && <>
          <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke={F.green} strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={W} y={y(goal) - 4} textAnchor="end" fontSize={10} fontWeight={700} fill={F.green} fontFamily={F.mono}>{fmt(goal)}</text>
        </>}
      </svg>
    </div>
  );
}

function WeightArea({ weights, target }: { weights: Array<{ date: string; kg: number }>; target?: number | null }) {
  const pts = weights.slice(-45);
  if (pts.length < 2) return null;
  const W = 320, H = 130, pad = 14;
  const ks = pts.map(p => p.kg);
  const lo = Math.min(...ks, target ?? Infinity) - 0.6, hi = Math.max(...ks) + 0.6;
  const t0 = new Date(pts[0]!.date).getTime(), t1 = new Date(pts[pts.length - 1]!.date).getTime() || t0 + 1;
  const x = (d: string) => ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * W;
  const y = (k: number) => pad + (H - pad * 2) * (1 - (k - lo) / (hi - lo));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const first = pts[0]!.kg, last = pts[pts.length - 1]!.kg, diff = last - first;
  const days = Math.max(1, Math.round((t1 - t0) / 86400000));
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 650, fontSize: 15 }}>Poids</span>
        <span style={{ fontSize: 12.5, color: F.muted }}>{days} derniers jours</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: diff <= 0 ? F.green : F.gold, fontVariantNumeric: 'tabular-nums' }}>{diff > 0 ? '+' : ''}{diff.toFixed(1).replace('.', ',')} kg</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', margin: '2px 0 4px', fontVariantNumeric: 'tabular-nums' }}>{last.toFixed(1).replace('.', ',')}<span style={{ fontSize: 15, color: F.muted, fontWeight: 600 }}> kg</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="fw-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff5a1f" stopOpacity={0.45} /><stop offset="1" stopColor="#ff2d55" stopOpacity={0} /></linearGradient>
          <linearGradient id="fw-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff9a3c" /><stop offset="1" stopColor="#ff2d55" /></linearGradient>
        </defs>
        {target != null && target >= lo && target <= hi && <>
          <line x1={0} x2={W} y1={y(target)} y2={y(target)} stroke={F.green} strokeWidth={1.4} strokeDasharray="5 4" />
          <text x={4} y={y(target) - 5} fontSize={10} fontWeight={700} fill={F.green} fontFamily={F.mono}>objectif {String(target).replace('.', ',')} kg</text>
        </>}
        <motion.path d={area} fill="url(#fw-area)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
        <motion.path d={line} fill="none" stroke="url(#fw-line)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
        <circle cx={x(pts[pts.length - 1]!.date)} cy={y(last)} r={5} fill="#ff2d55" stroke="var(--f-bg)" strokeWidth={2.5} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: F.muted, fontFamily: F.mono, marginTop: 4 }}>
        <span>{pts[0]!.date.slice(8)}/{pts[0]!.date.slice(5, 7)}</span><span>min {Math.min(...ks).toFixed(1)} · max {Math.max(...ks).toFixed(1)}</span><span>{pts[pts.length - 1]!.date.slice(8)}/{pts[pts.length - 1]!.date.slice(5, 7)}</span>
      </div>
    </div>
  );
}

function Legend({ color, label, value, sub }: { color: string; label: string; value: ReactNode; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{ width: 9, height: 26, borderRadius: 5, background: color, boxShadow: `0 0 10px ${color}88`, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: F.muted, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}<span style={{ fontSize: 12, color: F.muted, fontWeight: 500 }}> {sub}</span></div>
      </div>
    </div>
  );
}

type ChartTab = 'volume' | 'steps' | 'sleep' | 'kcal';

export default function Dashboard({ o, weeks, weekDone, weekGoal, streak }: {
  o: Overview; weeks: Array<{ from: string; sessions: number; volume: number }>; weekDone: number; weekGoal: number; streak: number;
}) {
  const [tab, setTab] = useState<ChartTab>('volume');
  const STEP_GOAL = 8000;
  const w7all = o.week7 ?? [];
  const steps = o.day?.steps ?? w7all[w7all.length - 1]?.steps ?? 0;
  const prot = o.eaten?.p ?? 0, protGoal = o.targets?.p || 154;
  const w7 = w7all.slice(-7);
  const today = o.today;
  const tabs: Array<{ id: ChartTab; label: string; color: string }> = [
    { id: 'volume', label: 'Volume', color: '#ff5a1f' },
    { id: 'steps', label: 'Pas', color: '#12b76a' },
    { id: 'sleep', label: 'Sommeil', color: '#8b5cf6' },
    { id: 'kcal', label: 'Calories', color: '#3d6bff' },
  ];
  const has: Record<ChartTab, boolean> = {
    volume: true,
    steps: w7.some(d => (d.steps ?? 0) > 0) || steps > 0,
    sleep: w7.some(d => (d.sleep ?? 0) > 0),
    kcal: w7.some(d => (d.kcal ?? 0) > 0),
  };
  const shown = tabs.filter(t => has[t.id]);
  const cur = shown.find(t => t.id === tab) ?? shown[0]!;
  const active = cur.id;
  const wk = weeks.slice(-8);
  return (
    <>
      {/* Anneaux d'activité */}
      <div style={{ ...card, marginTop: 14, display: 'flex', alignItems: 'center', gap: 18, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: -40, top: -40, width: 200, height: 200, borderRadius: '50%', background: F.grad, opacity: 0.12, filter: 'blur(36px)' }} />
        <Rings rings={[
          { v: weekDone, max: weekGoal || 4, color: '#ff5a1f' },
          { v: steps, max: STEP_GOAL, color: '#12b76a' },
          { v: prot, max: protGoal, color: '#3d6bff' },
        ]} />
        <div style={{ display: 'grid', gap: 10, flex: 1, minWidth: 0, position: 'relative' }}>
          <Legend color="#ff5a1f" label="Séances semaine" value={weekDone} sub={`/ ${weekGoal || 4}`} />
          <Legend color="#12b76a" label="Pas aujourd'hui" value={fmtK(steps)} sub={`/ ${fmtK(STEP_GOAL)}`} />
          <Legend color="#3d6bff" label="Protéines" value={Math.round(prot)} sub={`/ ${Math.round(protGoal)} g`} />
          {streak > 0 && <div style={{ justifySelf: 'start', fontSize: 11.5, fontWeight: 700, color: '#ff5a1f', background: 'rgba(255,90,31,0.14)', padding: '3px 8px', borderRadius: 8 }}>{streak} séance{streak > 1 ? 's' : ''} d'affilée</div>}
        </div>
      </div>

      {/* Graphique à onglets */}
      <div style={{ ...card, marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--f-tile)', borderRadius: 13, marginBottom: 12 }}>
          {shown.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, border: 'none', cursor: 'pointer', borderRadius: 10, padding: '8px 0', fontFamily: F.sans, fontSize: 12.5, fontWeight: active === t.id ? 700 : 500,
              background: active === t.id ? 'var(--f-card)' : 'transparent', color: active === t.id ? t.color : F.muted, boxShadow: active === t.id ? '0 4px 12px -6px rgba(0,0,0,0.5)' : 'none' }}>{t.label}</button>
          ))}
        </div>
        {active === 'volume' && (wk.length
          ? <Bars color={cur.color} unit="t / semaine" fmt={n => (n / 1000).toFixed(1).replace('.', ',')}
              pts={wk.map((w, i) => ({ label: `${w.from.slice(8)}/${w.from.slice(5, 7)}`.replace(/^0/, ''), v: w.volume || 0, today: i === wk.length - 1 }))} />
          : <Empty />)}
        {active === 'steps' && <Bars color={cur.color} unit="pas / jour" goal={STEP_GOAL}
          pts={w7.map(d => ({ label: dayL(d.date), v: d.date === today ? (o.day?.steps ?? d.steps) : d.steps, today: d.date === today }))} />}
        {active === 'sleep' && <Bars color={cur.color} unit="h / nuit" goal={7} fmt={n => n.toFixed(1).replace('.', ',')}
          pts={w7.map(d => ({ label: dayL(d.date), v: d.sleep, today: d.date === today }))} />}
        {active === 'kcal' && <Bars color={cur.color} unit="kcal mangées" goal={o.targets?.kcal || undefined}
          pts={w7.map(d => ({ label: dayL(d.date), v: d.kcal || null, today: d.date === today }))} />}
      </div>

      <WeightArea weights={o.weights ?? []} target={o.profile?.targetKg} />
    </>
  );
}

function Empty() {
  return <div style={{ padding: '30px 0', textAlign: 'center', color: F.muted, fontSize: 13.5 }}>Pas encore assez de séances enregistrées.</div>;
}
