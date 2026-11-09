import { useState } from 'react';
import { motion } from 'framer-motion';
import { F } from './ui.tsx';

// 📊 Graphiques FORME (09/11) — Kouider : « les bilans manquent de graphiques » (ils n'existaient que dans le PDF Telegram).
// Tout en SVG, sans librairie : radar des notes, barres par jour (doigt posé = valeur du jour), comparaison mangé / brûlé.

const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const wd = (date: string) => WD[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
const dm = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;
const fr = (v: number, d = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });

/** Radar des notes (0-100) : la forme pleine = maintenant, le trait pointillé = la période d'avant. */
export function Radar({ axes, size = 270 }: { axes: Array<{ label: string; v: number; prev?: number }>; size?: number }) {
  const n = axes.length;
  if (n < 4) return null;
  const c = size / 2, R = size / 2 - 50;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; const r = R * Math.max(0, Math.min(100, v)) / 100; return [c + r * Math.cos(a), c + r * Math.sin(a)] as const; };
  const poly = (get: (a: typeof axes[number]) => number) => axes.map((a, i) => pt(i, get(a)).map(x => x.toFixed(1)).join(',')).join(' ');
  const hasPrev = axes.every(a => typeof a.prev === 'number');   // comparaison seulement si toutes les notes d'avant existent
  const col = (v: number) => v >= 75 ? F.green : v >= 55 ? F.gold : F.red;
  return (
    <div>
      <svg viewBox={`-40 0 ${size + 80} ${size}`} style={{ width: '100%', maxWidth: 380, display: 'block', margin: '0 auto' }}>
        {[25, 50, 75, 100].map(g => <polygon key={g} points={axes.map((_, i) => pt(i, g).map(x => x.toFixed(1)).join(',')).join(' ')} fill={g === 100 ? '#faf8fd' : 'none'} stroke={F.line} strokeWidth="1" />)}
        {axes.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke={F.line} />; })}
        {hasPrev && <polygon points={poly(a => a.prev ?? 0)} fill="none" stroke={F.muted} strokeWidth="1.5" strokeDasharray="4 4" />}
        <motion.polygon points={poly(a => a.v)} fill={F.accent} fillOpacity="0.18" stroke={F.accent} strokeWidth="2.5" strokeLinejoin="round"
          initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }} style={{ transformOrigin: `${c}px ${c}px` }} />
        {axes.map((a, i) => { const [x, y] = pt(i, a.v); return <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke={col(a.v)} strokeWidth="2.5" />; })}
        {axes.map((a, i) => {
          const a2 = -Math.PI / 2 + i * 2 * Math.PI / n; const x = c + (R + 30) * Math.cos(a2) * 1.08, y = c + (R + 26) * Math.sin(a2);
          return <g key={i}><text x={x} y={y - 3} fontSize="10.5" fontWeight="700" fill={F.ink} textAnchor="middle">{a.label}</text><text x={x} y={y + 10} fontSize="11.5" fontWeight="800" fill={col(a.v)} textAnchor="middle">{a.v}</text></g>;
        })}
      </svg>
      {hasPrev && <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 11.5, color: F.muted, marginTop: 2 }}>
        <span><span style={{ display: 'inline-block', width: 14, height: 3, background: F.accent, borderRadius: 2, verticalAlign: 'middle', marginRight: 5 }} />maintenant</span>
        <span><span style={{ display: 'inline-block', width: 14, borderTop: `2px dashed ${F.muted}`, verticalAlign: 'middle', marginRight: 5 }} />avant</span>
      </div>}
    </div>
  );
}

export interface BarPoint { date: string; v?: number; v2?: number; note?: string }
/** Barres par jour. `goal` = ligne d'objectif (barre verte quand il est atteint). `v2` = 2e série (ex. brûlé à côté de mangé).
 *  Un doigt sur une barre affiche la valeur et la date ; sans doigt, on lit la moyenne et le nombre de jours réussis. */
export function DayBars({ title, points, unit, goal, color = F.accent, color2 = '#c9c4d6', digits = 0, h = 132, lowerIsBetter = false, legend }: {
  title: string; points: BarPoint[]; unit: string; goal?: number; color?: string; color2?: string; digits?: number; h?: number; lowerIsBetter?: boolean; legend?: [string, string] }) {
  const [sel, setSel] = useState<number | null>(null);
  const have = points.filter(p => typeof p.v === 'number' && p.v > 0);
  if (!have.length) return null;
  const W = 320, top = 14, bottom = 20, plotH = h - top - bottom;
  const max = Math.max(...points.flatMap(p => [p.v ?? 0, p.v2 ?? 0]), goal ?? 0) * 1.08 || 1;
  const n = points.length, slot = W / n, two = points.some(p => typeof p.v2 === 'number');
  const bw = Math.max(3, Math.min(26, slot * (two ? 0.36 : 0.62)));
  const Y = (v: number) => top + plotH * (1 - v / max);
  const avg = have.reduce((a, p) => a + p.v!, 0) / have.length;
  const ok = (v?: number) => goal != null && typeof v === 'number' && v > 0 && (lowerIsBetter ? v <= goal : v >= goal);
  const okDays = goal != null ? have.filter(p => ok(p.v)).length : null;
  const s = sel != null ? points[sel] : null;
  const dense = n > 10;
  return (
    <div style={{ background: '#fff', borderRadius: 18, padding: '14px 12px 10px', marginTop: 10, boxShadow: '0 1px 2px rgba(40,30,70,0.05), 0 6px 18px rgba(40,30,70,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '0 4px' }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: s ? F.ink : F.muted, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {s ? `${dm(s.date)} · ${typeof s.v === 'number' && s.v > 0 ? `${fr(s.v, digits)} ${unit}` : 'rien noté'}${typeof s.v2 === 'number' && s.v2 > 0 ? ` / ${fr(s.v2, digits)}` : ''}` : `moy. ${fr(avg, digits)} ${unit}`}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%', height: h, display: 'block', marginTop: 4, touchAction: 'pan-y' }}
        onPointerDown={e => { const r = e.currentTarget.getBoundingClientRect(); setSel(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n)))); }}
        onPointerMove={e => { if (e.pointerType === 'mouse' && e.buttons === 0) return; const r = e.currentTarget.getBoundingClientRect(); setSel(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n)))); }}>
        {goal != null && <line x1={0} x2={W} y1={Y(goal)} y2={Y(goal)} stroke={F.green} strokeDasharray="4 4" strokeWidth="1.2" />}
        {points.map((p, i) => {
          const cx = slot * i + slot / 2, v = p.v ?? 0, v2 = p.v2 ?? 0;
          const x1 = two ? cx - bw - 1 : cx - bw / 2;
          const fill = sel === i ? F.ink : ok(p.v) ? F.green : color;
          return (
            <g key={p.date}>
              {v > 0 ? <motion.rect x={x1} width={bw} rx={Math.min(5, bw / 2)} fill={fill} initial={{ y: Y(0), height: 0 }} animate={{ y: Y(v), height: Math.max(2, Y(0) - Y(v)) }} transition={{ duration: 0.5, delay: Math.min(0.4, i * 0.02) }} />
                : <rect x={x1} y={Y(0) - 2} width={bw} height={2} rx={1} fill={F.bg2} />}
              {two && v2 > 0 && <motion.rect x={cx + 1} width={bw} rx={Math.min(5, bw / 2)} fill={color2} initial={{ y: Y(0), height: 0 }} animate={{ y: Y(v2), height: Math.max(2, Y(0) - Y(v2)) }} transition={{ duration: 0.5, delay: Math.min(0.4, i * 0.02) }} />}
              {(!dense || i === 0 || i === n - 1 || (i + 1) % 5 === 0) && <text x={cx} y={h - 6} fontSize="10" fill={sel === i ? F.ink : F.muted} fontWeight={sel === i ? 800 : 500} textAnchor="middle">{dense ? p.date.slice(8) : wd(p.date)}</text>}
            </g>
          );
        })}
        {goal != null && <text x={W - 2} y={Y(goal) - 4} fontSize="9.5" fill="#12703f" fontWeight="800" textAnchor="end" stroke="#fff" strokeWidth="3" paintOrder="stroke">objectif {fr(goal, digits)}</text>}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: F.muted, padding: '2px 4px 0', gap: 8 }}>
        <span>{legend ? <><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color, marginRight: 4 }} />{legend[0]} <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color2, margin: '0 4px 0 8px' }} />{legend[1]}</> : s?.note ?? `maxi ${fr(Math.max(...have.map(p => p.v!)), digits)} ${unit}`}</span>
        {okDays != null && <b style={{ color: okDays >= have.length * 0.7 ? F.green : okDays >= have.length * 0.4 ? F.gold : F.red }}>{okDays}/{have.length} j. réussis</b>}
      </div>
    </div>
  );
}

/** Frise des notes globales jour par jour (pastilles colorées) : on voit d'un coup d'œil les bons et les mauvais jours. */
export function ScoreStrip({ days }: { days: Array<{ date: string; score?: number }> }) {
  const have = days.filter(d => typeof d.score === 'number');
  if (have.length < 2) return null;
  const col = (v: number) => v >= 75 ? F.green : v >= 55 ? F.gold : F.red;
  const best = have.reduce((a, b) => (b.score! > a.score! ? b : a));
  const dense = days.length > 10;
  return (
    <div style={{ background: '#fff', borderRadius: 18, padding: 14, marginTop: 10, boxShadow: '0 1px 2px rgba(40,30,70,0.05), 0 6px 18px rgba(40,30,70,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>Ta note jour par jour</div>
        <div style={{ fontSize: 12.5, color: F.muted, fontWeight: 700 }}>meilleur : {dm(best.date)} ({best.score})</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dense ? 7 : days.length}, minmax(0, 1fr))`, gap: 5, marginTop: 10 }}>
        {days.map(d => (
          <div key={d.date} style={{ textAlign: 'center' }}>
            <div style={{ height: dense ? 30 : 38, borderRadius: 10, background: typeof d.score === 'number' ? col(d.score) : F.bg2, color: typeof d.score === 'number' ? '#fff' : F.muted, fontWeight: 800, fontSize: dense ? 12.5 : 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{typeof d.score === 'number' ? d.score : '·'}</div>
            <div style={{ fontSize: 10, color: F.muted, marginTop: 3, fontWeight: 600 }}>{dense ? d.date.slice(8) : wd(d.date)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
