// Composants design partagés (style validé sur l'écran Clients) — cohérence sur toute l'app.
import type { ReactNode } from 'react';

const MUTED = '#9b9ba6';

// Orbe IA (identique à l'icône d'app) — rendu vectoriel net à toute taille.
export function OrbIcon({ size = 64, glow = false }: { size?: number; glow?: boolean }) {
  const uid = `orb${Math.round(size)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: 'block', filter: glow ? 'drop-shadow(0 0 16px rgba(52,245,224,0.5))' : undefined }}>
      <defs>
        <radialGradient id={`${uid}g`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#34f5e0" stopOpacity="0.5" /><stop offset="60%" stopColor="#10b6c8" stopOpacity="0.15" /><stop offset="100%" stopColor="#10b6c8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}o`} cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#eafffb" /><stop offset="32%" stopColor="#5ef0df" /><stop offset="70%" stopColor="#13b9c9" /><stop offset="100%" stopColor="#0a6f86" />
        </radialGradient>
        <linearGradient id={`${uid}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffd76a" /><stop offset="100%" stopColor="#f0a93a" /></linearGradient>
      </defs>
      <circle cx="256" cy="256" r="220" fill={`url(#${uid}g)`} />
      <circle cx="256" cy="256" r="140" fill="none" stroke={`url(#${uid}r)`} strokeWidth="7" opacity="0.85" />
      <circle cx="256" cy="256" r="110" fill={`url(#${uid}o)`} />
      <ellipse cx="222" cy="214" rx="42" ry="27" fill="#ffffff" opacity="0.45" />
    </svg>
  );
}

export function Hero({ eyebrow, title, subtitle, accent = '#10b981' }: { eyebrow: string; title: string; subtitle?: ReactNode; accent?: string }) {
  return (
    <div style={{ position: 'relative', padding: '24px 18px 16px', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -80, right: -50, width: 240, height: 240, background: `radial-gradient(circle, ${accent}26, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -40, left: -60, width: 180, height: 180, background: 'radial-gradient(circle, rgba(251,191,36,0.10), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ fontSize: 11, letterSpacing: '0.22em', color: accent, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>{eyebrow}</div>
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, background: `linear-gradient(120deg, #fff 30%, ${accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{title}</div>
      {subtitle != null && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>{subtitle}</div>}
    </div>
  );
}

export function StatCard({ icon, value, label, color = '#10b981' }: { icon?: string; value: string; label: string; color?: string }) {
  return (
    <div style={{ position: 'relative', background: 'linear-gradient(160deg, #18181f, #121217)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '14px 6px 12px', textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 2, background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div style={{ position: 'absolute', top: -16, right: -16, width: 60, height: 60, borderRadius: '50%', background: `${color}14`, filter: 'blur(8px)' }} />
      {icon && <div style={{ fontSize: 16, marginBottom: 3 }}>{icon}</div>}
      <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', background: `linear-gradient(120deg, #fff, ${color})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{value}</div>
      <div style={{ fontSize: 9.5, color: MUTED, marginTop: 3, letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

// Champ recherche en pilule (avec loupe)
export function SearchPill({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5 }}>🔍</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', background: '#16161c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '13px 16px 13px 42px', color: '#f5f5f7', fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif', fontSize: 14, outline: 'none' }} />
    </div>
  );
}
