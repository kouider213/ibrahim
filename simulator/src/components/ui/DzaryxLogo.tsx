// Emblème Dzaryx v4 « Signature » (16/11/2026) : carré arrondi noir, monogramme D au trait,
// cœur lumineux en dégradé bleu → violet → cyan (la liaison avec Dzaryx).
import { useId } from 'react';

export default function DzaryxIcon({ size = 80, glow = false }: { size?: number; glow?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: 'block', overflow: 'visible', filter: glow ? 'drop-shadow(0 18px 40px rgba(61,107,255,0.45))' : undefined }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d6bff" /><stop offset="0.55" stopColor="#8b5cf6" /><stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c1c24" /><stop offset="1" stopColor="#050507" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="140" fill={`url(#b${id})`} />
      <rect x="17.5" y="17.5" width="477" height="477" rx="138.5" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" />
      <path d="M176 136 H252 a120 120 0 0 1 0 240 H176 Z" fill="none" stroke={`url(#g${id})`} strokeWidth="44" strokeLinejoin="round" />
      <circle cx="254" cy="256" r="26" fill="#ffffff" />
    </svg>
  );
}
