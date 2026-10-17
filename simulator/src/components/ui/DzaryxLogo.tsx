// Emblème Dzaryx partagé (barre du haut, verrouillage, connexion, page VOIX).

export default function DzaryxIcon({ size = 80, glow = false }: { size?: number; glow?: boolean }) {
  // Emblème Dzaryx : hexagone holographique + monogramme D + anneaux (même langage visuel que Nexus).
  const uid = `dz${Math.round(size)}`;
  const hex = (r: number) => Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 6 + i * Math.PI / 3;
    return `${(256 + r * Math.cos(a)).toFixed(1)},${(256 + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: 'block', overflow: 'visible', filter: glow ? 'drop-shadow(0 0 14px rgba(56,216,245,0.45)) drop-shadow(0 0 32px rgba(59,130,246,0.2))' : 'drop-shadow(0 0 6px rgba(56,216,245,0.35))' }}>
      <defs>
        <linearGradient id={`${uid}edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7cf3ff" /><stop offset="55%" stopColor="#38d8f5" /><stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <radialGradient id={`${uid}core`} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#0f2a4d" /><stop offset="100%" stopColor="#040a18" />
        </radialGradient>
        <linearGradient id={`${uid}d`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#7ce8ff" />
        </linearGradient>
      </defs>
      <polygon points={hex(236)} fill={`url(#${uid}core)`} stroke={`url(#${uid}edge)`} strokeWidth="14" strokeLinejoin="round" />
      <polygon points={hex(196)} fill="none" stroke="#38d8f5" strokeOpacity="0.28" strokeWidth="4" strokeDasharray="22 14" />
      <circle cx="256" cy="256" r="150" fill="none" stroke="#38d8f5" strokeOpacity="0.5" strokeWidth="6" strokeDasharray="160 60 40 60" strokeLinecap="round" />
      {/* Monogramme D */}
      <path d="M196 160 H262 a96 96 0 0 1 0 192 H196 Z" fill="none" stroke={`url(#${uid}d)`} strokeWidth="30" strokeLinejoin="round" />
      <path d="M196 256 H246" stroke="#38d8f5" strokeWidth="14" strokeLinecap="round" />
      <circle cx="262" cy="256" r="14" fill="#7cf3ff" />
      {/* Nœuds aux sommets */}
      {[0, 2, 4].map(i => {
        const a = Math.PI / 6 + i * Math.PI / 3;
        return <circle key={i} cx={256 + 236 * Math.cos(a)} cy={256 + 236 * Math.sin(a)} r="16" fill="#7cf3ff" />;
      })}
    </svg>
  );
}
