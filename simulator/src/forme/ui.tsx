import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { trPair } from './i18n.ts';

// Kit visuel FORME — 31/10 : refait au style de l'appli « Library » que Kouider a montrée (TikTok physio_tip) :
// fond clair lavande, tuiles grises-lavande, images d'exercices sur fond clair, muscles en rouge, bouton bleu, police système iPhone.
export const F = {
  bg: '#f5f2fa', bg2: '#ebe6f3', card: '#ffffff', tile: '#ece7f4', ink: '#17151c', dark: '#1d1b26', dark2: '#2c2938',
  muted: '#7f7a8c', line: 'rgba(40,30,70,0.09)', accent: '#1f63f0', accent2: '#5b8cff', soft: '#e4ebff',
  green: '#1f9d5c', blue: '#1f63f0', violet: '#7b5cf0', gold: '#e09a12', red: '#e5322d',
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif',
  serif: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Noto Naskh Arabic", sans-serif',
};

export const card: CSSProperties = { background: F.card, borderRadius: 18, padding: 16, boxShadow: '0 1px 2px rgba(40,30,70,0.05), 0 6px 18px rgba(40,30,70,0.05)' };
export const darkCard: CSSProperties = { background: `linear-gradient(160deg, ${F.dark2}, ${F.dark})`, color: '#fff', borderRadius: 24, padding: 18, boxShadow: '0 12px 28px rgba(30,25,60,0.22)' };

export function Title({ a, b, size = 32, sub }: { a: string; b?: string; size?: number; sub?: string }) {
  [a, b] = trPair(a, b);
  b = b?.replace(/ ([?!:])/g, '\u00a0$1');   // jamais un « ? » seul à la ligne
  return (
    <div style={{ margin: '4px 0 14px' }}>
      <div style={{ fontSize: size, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.05, color: F.ink }}>
        {a}{b && <> <span style={{ color: F.ink }}>{b}</span></>}
      </div>
      {sub && <div style={{ fontSize: 14, color: F.muted, marginTop: 6, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

export const Kicker = ({ children, color = F.muted }: { children: ReactNode; color?: string }) =>
  <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>{children}</div>;

export function Section({ a, b, right, onRight }: { a: string; b?: string; right?: string; onRight?: () => void }) {
  [a, b] = trPair(a, b);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '22px 2px 10px' }}>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{a}{b && <> <span>{b}</span></>}</div>
      {right && <button onClick={onRight} style={{ ...ghostBtn, padding: '4px 0', color: F.accent, fontSize: 13, fontWeight: 700, background: 'none', border: 'none' }}>{right}</button>}
    </div>
  );
}

export const btn: CSSProperties = { background: F.accent, color: '#fff', border: 'none', borderRadius: 999, padding: '14px 20px', fontSize: 15.5, fontWeight: 700, fontFamily: F.sans, cursor: 'pointer', boxShadow: '0 8px 20px rgba(31,99,240,0.25)' };
export const darkBtn: CSSProperties = { ...btn, background: F.dark, boxShadow: '0 8px 18px rgba(30,25,60,0.2)' };
export const ghostBtn: CSSProperties = { background: '#fff', color: F.ink, border: `1px solid ${F.line}`, borderRadius: 999, padding: '11px 16px', fontSize: 14, fontWeight: 600, fontFamily: F.sans, cursor: 'pointer' };
export const input: CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${F.line}`, borderRadius: 14, padding: '13px 14px', fontSize: 16, fontFamily: F.sans, color: F.ink, outline: 'none' };

export function Ring({ value, max, size = 120, stroke = 11, color = F.accent, track = 'rgba(255,255,255,0.1)', children }: { value: number; max: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 1, ease: 'easeOut' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

export function Bar({ value, max, color = F.accent, h = 6, track = 'rgba(255,255,255,0.12)' }: { value: number; max: number; color?: string; h?: number; track?: string }) {
  return (
    <div style={{ height: h, background: track, borderRadius: h, overflow: 'hidden' }}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, max ? value / max * 100 : 0)}%` }} transition={{ duration: 0.8 }} style={{ height: '100%', background: color, borderRadius: h }} />
    </div>
  );
}

export function Chip({ on, children, onClick, color = F.accent }: { on?: boolean; children: ReactNode; onClick?: () => void; color?: string }) {
  return <button onClick={onClick} style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 999, border: `1px solid ${on ? color : F.line}`, background: on ? color : '#fff', color: on ? '#fff' : F.ink, fontWeight: 700, fontSize: 13.5, fontFamily: F.sans, cursor: 'pointer', whiteSpace: 'nowrap' }}>{children}</button>;
}

export function Sheet({ open, onClose, children, title, z = 50 }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; z?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.4)', zIndex: z, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: F.bg, borderRadius: '28px 28px 0 0', padding: '10px 18px calc(28px + env(safe-area-inset-bottom))', fontFamily: F.sans, color: F.ink, boxSizing: 'border-box' }}>
            <div style={{ width: 42, height: 5, borderRadius: 3, background: 'rgba(40,30,70,0.18)', margin: '0 auto 12px' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ flex: 1 }}>{typeof title === 'string' ? <Title a={title} size={24} /> : title}</div>
              <button onClick={onClose} aria-label="Fermer" style={{ ...ghostBtn, width: 40, height: 40, padding: 0, borderRadius: 20, flexShrink: 0 }}>✕</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Toast({ text }: { text: string | null }) {
  return createPortal(
    <AnimatePresence>
      {text && <motion.div key={text} initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
        style={{ position: 'fixed', top: 'calc(14px + env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', zIndex: 80, background: F.dark, color: '#fff', padding: '12px 18px', borderRadius: 16, fontWeight: 700, fontSize: 14, fontFamily: F.sans, boxShadow: '0 10px 30px rgba(0,0,0,0.25)', maxWidth: '86vw', textAlign: 'center' }}>{text}</motion.div>}
    </AnimatePresence>,
    document.body,
  );
}

export function Img({ src, style, alt = '' }: { src?: string | null; style?: CSSProperties; alt?: string }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  return src && !bad ? <img src={src} alt={alt} loading="lazy" draggable={false} onError={() => setBad(true)} style={{ objectFit: 'cover', display: 'block', background: F.bg2, ...style }} />
    : <div style={{ background: `linear-gradient(135deg, ${F.soft}, ${F.bg2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, ...style }}>🛒</div>;
}

export const Spinner = ({ size = 22, color = F.accent }: { size?: number; color?: string }) =>
  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ width: size, height: size, borderRadius: '50%', border: `3px solid ${color}33`, borderTopColor: color }} />;

export const Stat = ({ v, l, color = F.ink }: { v: ReactNode; l: string; color?: string }) =>
  <div style={{ ...card, padding: '12px 12px', flex: 1, minWidth: 0 }}><div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{v}</div><div style={{ fontSize: 12, color: F.muted, fontWeight: 600, marginTop: 2 }}>{l}</div></div>;

/** Petite courbe (poids, mensurations) en SVG, sans librairie. */
export function LineChart({ points, h = 150, color = F.accent, unit = 'kg', goal }: { points: Array<{ x: string; y: number }>; h?: number; color?: string; unit?: string; goal?: number }) {
  if (points.length < 2) return <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: F.muted, fontSize: 14, textAlign: 'center' }}>{points.length ? `${points[0]!.y} ${unit} — la courbe apparaît dès la 2e mesure` : 'Pas encore de mesure'}</div>;
  const W = 320, pad = 26;
  const ys = points.map(p => p.y).concat(goal != null ? [goal] : []);
  const min = Math.min(...ys) - 0.5, max = Math.max(...ys) + 0.5;
  const X = (i: number) => pad + i * (W - pad * 2) / (points.length - 1), Y = (v: number) => 12 + (h - 34) * (1 - (v - min) / (max - min));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%', height: h }}>
      <defs><linearGradient id="lc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.25" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {goal != null && <><line x1={pad} x2={W - pad} y1={Y(goal)} y2={Y(goal)} stroke={F.green} strokeDasharray="4 4" /><text x={W - pad} y={Y(goal) - 4} fontSize="10" textAnchor="end" fill={F.green} fontWeight="700">objectif {goal}</text></>}
      <path d={`${d} L${X(points.length - 1)},${h - 22} L${X(0)},${h - 22} Z`} fill="url(#lc)" />
      <motion.path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
      {points.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p.y)} r={i === points.length - 1 ? 5 : 3} fill={i === points.length - 1 ? color : '#fff'} stroke={color} strokeWidth="2" />)}
      <text x={X(0)} y={h - 6} fontSize="10" fill={F.muted}>{points[0]!.x.slice(5).split('-').reverse().join('/')}</text>
      <text x={X(points.length - 1)} y={h - 6} fontSize="10" fill={F.muted} textAnchor="end">{points[points.length - 1]!.x.slice(5).split('-').reverse().join('/')}</text>
    </svg>
  );
}
