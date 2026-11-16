// Graphiques FORME des onglets Repas / Sèche / Progrès / Exercices (16/11/2026, Kouider : « rajoute des graphiques »).
// Données déjà existantes : /api/forme/food/week (FoodDay), mensurations, records de /api/sport. Aucune donnée inventée.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { F, card } from './ui.tsx';
import { forme, type FoodDay } from './api.ts';
import { apiFetch, type SportOverview } from '../services/api.ts';
import { Icon } from '../components/ui/Icon.tsx';

const dayL = (d: string) => ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(`${d}T12:00:00Z`).getUTCDay()]!;
const ease = [0.16, 0.84, 0.3, 1] as const;

/** Mangé (bleu) vs brûlé (orange) par jour, déficit au-dessus. */
export function EnergyChart({ days, title = 'Mangé vs brûlé' }: { days: FoodDay[]; title?: string }) {
  const d7 = days.slice(-7);
  if (!d7.some(d => d.meals > 0 || d.burn > 0)) return null;
  const W = 320, H = 170, top = 26, bottom = 22;
  const max = Math.max(...d7.flatMap(d => [d.eaten, d.burn]), 1) * 1.08;
  const step = W / d7.length, bw = step * 0.26;
  const h = (v: number) => (H - top - bottom) * (v / max);
  const logged = d7.filter(d => d.meals > 0 && !d.today);
  const avg = logged.length ? Math.round(logged.reduce((s, d) => s + d.real, 0) / logged.length) : null;
  return (
    <div style={{ ...card, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 650, fontSize: 15 }}>{title}</span>
        <span style={{ fontSize: 12.5, color: F.muted }}>7 jours</span>
        {avg != null && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: avg >= 0 ? F.green : F.red, background: `${avg >= 0 ? F.green : F.red}1f`, padding: '3px 8px', borderRadius: 8 }}>{avg >= 0 ? `déficit moyen ${avg}` : `surplus moyen ${-avg}`} kcal</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible', marginTop: 8 }}>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={W} y1={top + (H - top - bottom) * f} y2={top + (H - top - bottom) * f} stroke="var(--f-line)" strokeDasharray="2 4" />)}
        {d7.map((d, i) => {
          const cx = i * step + step / 2;
          const he = h(d.eaten), hb = h(d.burn);
          const ok = d.mode === 'deficit' ? d.real >= d.goal : -d.real >= d.goal;
          return (
            <g key={d.date}>
              <motion.rect x={cx - bw - 1.5} width={bw} rx={bw / 2.4} fill="#ff7a1a" fillOpacity={0.85}
                initial={{ y: H - bottom, height: 0 }} animate={{ y: H - bottom - hb, height: hb }} transition={{ duration: 0.7, delay: i * 0.04, ease }} />
              <motion.rect x={cx + 1.5} width={bw} rx={bw / 2.4} fill="#3d6bff"
                initial={{ y: H - bottom, height: 0 }} animate={{ y: H - bottom - he, height: he }} transition={{ duration: 0.7, delay: i * 0.04 + 0.05, ease }} />
              {d.meals > 0 && <text x={cx} y={H - bottom - Math.max(he, hb) - 6} textAnchor="middle" fontSize={9.5} fontWeight={700} fontFamily={F.mono}
                fill={d.today ? 'var(--f-muted)' : ok ? F.green : F.red}>{d.real >= 0 ? `−${d.real}` : `+${-d.real}`}</text>}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fontWeight={d.today ? 700 : 500} fill={d.today ? F.accent : 'var(--f-muted)'} fontFamily={F.sans}>{dayL(d.date)}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: F.muted, marginTop: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: '#ff7a1a' }} />Brûlé</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: '#3d6bff' }} />Mangé</span>
        <span style={{ marginLeft: 'auto' }}>chiffre = déficit du jour</span>
      </div>
    </div>
  );
}

/** Protéines par jour vs objectif. */
export function ProteinChart({ days }: { days: FoodDay[] }) {
  const d7 = days.slice(-7);
  if (!d7.some(d => d.meals > 0)) return null;
  const goal = d7[d7.length - 1]?.proteinGoal || Math.max(...d7.map(d => d.proteinGoal), 1);
  const W = 320, H = 120, top = 14, bottom = 22;
  const max = Math.max(goal, ...d7.map(d => d.p), 1) * 1.12;
  const step = W / d7.length, bw = step * 0.5;
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const hit = d7.filter(d => d.meals > 0 && d.p >= goal * 0.9).length;
  return (
    <div style={{ ...card, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 650, fontSize: 15 }}>Protéines</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: F.muted }}>objectif atteint <b style={{ color: hit ? F.green : F.muted }}>{hit}</b> / 7 j</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible', marginTop: 8 }}>
        {d7.map((d, i) => {
          const x = i * step + (step - bw) / 2, hh = Math.max(d.p > 0 ? 3 : 0, H - bottom - y(d.p));
          return (
            <g key={d.date}>
              <rect x={x} y={top} width={bw} height={H - top - bottom} rx={bw / 2.6} fill="var(--f-line)" opacity={0.35} />
              <motion.rect x={x} width={bw} rx={bw / 2.6} fill={d.p >= goal * 0.9 ? F.green : '#8b5cf6'}
                initial={{ y: H - bottom, height: 0 }} animate={{ y: H - bottom - hh, height: hh }} transition={{ duration: 0.7, delay: i * 0.04, ease }} />
              {d.p > 0 && <text x={x + bw / 2} y={y(d.p) - 4} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="var(--f-muted)" fontFamily={F.mono}>{Math.round(d.p)}</text>}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fontWeight={d.today ? 700 : 500} fill={d.today ? F.accent : 'var(--f-muted)'} fontFamily={F.sans}>{dayL(d.date)}</text>
            </g>
          );
        })}
        <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke={F.green} strokeWidth={1.5} strokeDasharray="5 4" />
        <text x={W} y={y(goal) - 4} textAnchor="end" fontSize={10} fontWeight={700} fill={F.green} fontFamily={F.mono}>{Math.round(goal)} g</text>
      </svg>
    </div>
  );
}

/** Charge la semaine de repas (pour l'onglet Sèche, qui ne l'a pas). */
export function useFoodWeek() {
  const [w, setW] = useState<FoodDay[] | null>(null);
  useEffect(() => { forme.foodWeek().then(r => setW(r.days)).catch(() => setW(null)); }, []);
  return w;
}

/** Courbe d'une mensuration (tour de taille…) — n'apparaît qu'à partir de 2 mesures. */
export function MeasureLine({ points, label, color = '#22d3ee', unit = 'cm' }: { points: Array<{ date: string; v: number }>; label: string; color?: string; unit?: string }) {
  const pts = points.filter(p => p.v > 0).slice(-20);
  if (pts.length < 2) return null;
  const W = 320, H = 100, pad = 12;
  const vs = pts.map(p => p.v), lo = Math.min(...vs) - 0.8, hi = Math.max(...vs) + 0.8;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => pad + (H - pad * 2) * (1 - (v - lo) / (hi - lo));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const diff = pts[pts.length - 1]!.v - pts[0]!.v;
  const gid = `ml-${label.replace(/\W/g, '')}`;
  return (
    <div style={{ ...card, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 650, fontSize: 15, textTransform: 'capitalize' }}>{label}</span>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginLeft: 6 }}>{String(pts[pts.length - 1]!.v).replace('.', ',')}<span style={{ fontSize: 12, color: F.muted }}> {unit}</span></span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: diff <= 0 ? F.green : F.gold }}>{diff > 0 ? '+' : ''}{diff.toFixed(1).replace('.', ',')} {unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible', marginTop: 6 }}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.35} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        <motion.path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
        <motion.path d={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
        {pts.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.v)} r={i === pts.length - 1 ? 4.5 : 2.5} fill={color} stroke="var(--f-bg)" strokeWidth={1.5} />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: F.muted, fontFamily: F.mono, marginTop: 4 }}>
        <span>{pts[0]!.date.slice(8)}/{pts[0]!.date.slice(5, 7)}</span><span>{pts.length} mesures</span><span>{pts[pts.length - 1]!.date.slice(8)}/{pts[pts.length - 1]!.date.slice(5, 7)}</span>
      </div>
    </div>
  );
}

/** Bandeau « Tes records » en haut de la bibliothèque d'exercices. */
export function RecordsStrip() {
  const [prs, setPrs] = useState<SportOverview['stats']['prs'] | null>(null);
  useEffect(() => { apiFetch<SportOverview>('/api/sport').then(d => setPrs(d.stats?.prs ?? [])).catch(() => setPrs([])); }, []);
  if (!prs?.length) return null;
  const top = prs.slice(0, 10);
  const max = Math.max(...top.map(p => p.kg), 1);
  return (
    <div style={{ margin: '0 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 650, fontSize: 15, margin: '0 2px 8px' }}><Icon name="trophy" size={16} color={F.gold} />Tes records</div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', margin: '0 -14px', padding: '0 14px 2px' }}>
        {top.map(p => (
          <div key={p.ex} style={{ ...card, padding: 12, minWidth: 128, flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: F.muted, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 124 }}>{p.ex}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 4 }}>{p.kg}<span style={{ fontSize: 12, color: F.muted }}> kg{p.reps ? ` × ${p.reps}` : ''}</span></div>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--f-line)', marginTop: 8, overflow: 'hidden' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(p.kg / max) * 100}%` }} transition={{ duration: 0.8, ease }} style={{ height: '100%', background: F.grad, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 11, color: F.muted, fontFamily: F.mono, marginTop: 6 }}>{p.date.slice(8)}/{p.date.slice(5, 7)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
