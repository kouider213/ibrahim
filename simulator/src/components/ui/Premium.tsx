// Composants design partagés (style validé sur l'écran Clients) — cohérence sur toute l'app.
import type { ReactNode } from 'react';
import DzaryxIcon from './DzaryxLogo.tsx';
import { T, PageHeader, Kpi } from './Kit.tsx';


// Logo IA (= emblème Dzaryx de l'app) — rendu vectoriel net à toute taille.
export function OrbIcon({ size = 64, glow = false }: { size?: number; glow?: boolean }) {
  return <DzaryxIcon size={size} glow={glow} />;
}

// En-tête et tuiles alignés sur le kit v2 (Kit.tsx) : même rendu sur toutes les pages.
export function Hero({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: ReactNode; accent?: string }) {
  return <PageHeader eyebrow={eyebrow.replace(/^Dzaryx\s*·\s*/i, '')} title={title} subtitle={subtitle} />;
}

export function StatCard({ icon, value, label, color = T.accent }: { icon?: string; value: string; label: string; color?: string }) {
  const nice = label.length > 3 && label === label.toUpperCase() ? label.charAt(0) + label.slice(1).toLowerCase() : label;
  return <Kpi value={<>{icon && <span style={{ fontSize: 16, marginRight: 6 }}>{icon}</span>}{value}</>} label={nice} color={color} />;
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
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 999, padding: '0 16px 0 42px', color: T.text, fontFamily: T.font, fontSize: 16, outline: 'none' }} />
    </div>
  );
}
