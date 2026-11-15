// Emblème Dzaryx partagé (barre du haut, verrouillage, connexion, page VOIX).
// v3 « Clair premium » : carré arrondi à l'encre, monogramme D blanc, point bleu (la liaison).

export default function DzaryxIcon({ size = 80, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: 'block', overflow: 'visible', filter: glow ? 'drop-shadow(0 18px 30px rgba(var(--dz-ink-rgb),0.28))' : undefined }}>
      <rect x="16" y="16" width="480" height="480" rx="150" fill="#0c0e1a" />
      <path d="M178 140 H254 a116 116 0 0 1 0 232 H178 Z" fill="none" stroke="#ffffff" strokeWidth="46" strokeLinejoin="round" />
      <circle cx="372" cy="150" r="34" fill="#2f5bff" stroke="#0c0e1a" strokeWidth="14" />
    </svg>
  );
}
