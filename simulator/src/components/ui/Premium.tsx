// Composants design partagés (style validé sur l'écran Clients) — cohérence sur toute l'app.
import type { ReactNode } from 'react';
import DzaryxIcon from './DzaryxLogo.tsx';

const MUTED = '#8ea3c8';

// Logo IA (= emblème Dzaryx de l'app) — rendu vectoriel net à toute taille.
export function OrbIcon({ size = 64, glow = false }: { size?: number; glow?: boolean }) {
  return <DzaryxIcon size={size} glow={glow} />;
}

export function Hero({ eyebrow, title, subtitle, accent = '#38d8f5' }: { eyebrow: string; title: string; subtitle?: ReactNode; accent?: string }) {
  return (
    <div style={{ position: 'relative', padding: '24px 18px 16px', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -80, right: -50, width: 240, height: 240, background: `radial-gradient(circle, ${accent}26, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -40, left: -60, width: 180, height: 180, background: 'radial-gradient(circle, rgba(74,163,255,0.12), transparent 70%)', pointerEvents: 'none' }} />
      {/* Grille holographique discrète (style Nexus) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5, backgroundImage: 'linear-gradient(rgba(90,150,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(90,150,255,0.06) 1px, transparent 1px)', backgroundSize: '22px 22px', maskImage: 'linear-gradient(180deg, #000, transparent)', WebkitMaskImage: 'linear-gradient(180deg, #000, transparent)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Orbitron', fontSize: 9.5, letterSpacing: '0.28em', color: accent, fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}` }} />{eyebrow}
      </div>
      <div style={{ position: 'relative', fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, background: `linear-gradient(120deg, #fff 30%, ${accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{title}</div>
      {subtitle != null && <div style={{ position: 'relative', fontSize: 12.5, color: MUTED, marginTop: 8 }}>{subtitle}</div>}
    </div>
  );
}

export function StatCard({ icon, value, label, color = '#38d8f5' }: { icon?: string; value: string; label: string; color?: string }) {
  return (
    <div style={{ position: 'relative', background: 'linear-gradient(160deg, #0e1a34, #091328)', border: '1px solid rgba(90,150,255,0.16)', borderRadius: 18, padding: '14px 6px 12px', textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 2, background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <div style={{ position: 'absolute', top: -16, right: -16, width: 60, height: 60, borderRadius: '50%', background: `${color}14`, filter: 'blur(8px)' }} />
      {icon && <div style={{ fontSize: 16, marginBottom: 3 }}>{icon}</div>}
      <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', background: `linear-gradient(120deg, #fff, ${color})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{value}</div>
      <div style={{ fontSize: 9.5, color: MUTED, marginTop: 3, letterSpacing: '0.04em' }}>{label}</div>
    </div>
  );
}

// Skeletons de chargement (shimmer) — remplace les "Chargement…"
export function SkeletonCards({ count = 4, height = 64 }: { count?: number; height?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{`@keyframes dzShimmer{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}`}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height, borderRadius: 16, border: '1px solid rgba(90,150,255,0.14)',
          background: 'linear-gradient(90deg, #0b1529 25%, #12213f 50%, #0b1529 75%)',
          backgroundSize: '200px 100%', animation: 'dzShimmer 1.3s linear infinite',
        }} />
      ))}
    </div>
  );
}

// Champ recherche en pilule (avec loupe)
export function SearchPill({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5 }}>🔍</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', background: '#0c1730', border: '1px solid rgba(90,150,255,0.16)', borderRadius: 999, padding: '13px 16px 13px 42px', color: '#f5f5f7', fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif', fontSize: 14, outline: 'none' }} />
    </div>
  );
}
