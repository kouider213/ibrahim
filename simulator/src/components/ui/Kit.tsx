// Kit design Dzaryx v2 — base commune de toutes les pages (palette Nexus : nuit + cyan).
// Règles : texte ≥ 11 px, champs à 16 px (pas de zoom iPhone), boutons avec libellé et zone tactile ≥ 40 px,
// une seule famille de couleurs d'état (ok / warn / bad / info) partout.
import type { CSSProperties, ReactNode } from 'react';

export const T = {
  bg: '#050a16',
  surface: '#0b1530',
  surface2: '#101d3d',
  line: 'rgba(110,160,255,0.14)',
  lineStrong: 'rgba(110,160,255,0.28)',
  text: '#f4f7ff',
  muted: '#8ea3c8',
  faint: '#5d7096',
  accent: '#38d8f5',
  accent2: '#4aa3ff',
  ok: '#34d399',
  warn: '#fbbf24',
  bad: '#fb7185',
  violet: '#a78bfa',
  font: 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
  radius: 18,
};

export const tone = (c: string, a = 0.14) => {
  const n = parseInt(c.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** En-tête de page compact : sur-titre, titre, sous-titre (ou message), action à droite. */
export function PageHeader({ eyebrow, title, subtitle, right, compact }: { eyebrow?: string; title: string; subtitle?: ReactNode; right?: ReactNode; compact?: boolean }) {
  return (
    <div style={{ position: 'relative', padding: compact ? '12px 16px 10px' : '18px 16px 12px', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -90, right: -60, width: 260, height: 260, background: `radial-gradient(circle, ${tone(T.accent, 0.16)}, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <div style={{ fontFamily: 'Orbitron, ' + T.font, fontSize: 10, letterSpacing: '0.26em', color: T.accent, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{eyebrow}</div>}
          <div style={{ fontSize: compact ? 22 : 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, color: T.text }}>{title}</div>
          {subtitle != null && <div style={{ fontSize: compact ? 12.5 : 13, color: T.muted, marginTop: compact ? 3 : 6, lineHeight: 1.4 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

/** Contrôle segmenté (onglets) avec compteurs. */
export function Segmented<K extends string>({ items, value, onChange }: { items: { id: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div style={{ display: 'flex', padding: 4, gap: 4, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14 }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flex: 1, minHeight: 40, borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: T.font,
            background: on ? `linear-gradient(135deg, ${tone(T.accent, 0.22)}, ${tone(T.accent2, 0.16)})` : 'transparent',
            boxShadow: on ? `inset 0 0 0 1px ${tone(T.accent, 0.5)}` : 'none',
            color: on ? T.text : T.muted, fontSize: 13.5, fontWeight: on ? 700 : 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {it.label}
            {it.count != null && <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: on ? tone(T.accent, 0.25) : 'rgba(255,255,255,0.06)', color: on ? T.accent : T.faint }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Puces de filtre défilantes. */
export function Chips<K extends string>({ items, value, onChange }: { items: { id: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 16px', margin: '0 -16px' }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flexShrink: 0, minHeight: 34, padding: '0 14px', borderRadius: 99, cursor: 'pointer', fontFamily: T.font,
            border: `1px solid ${on ? tone(T.accent, 0.6) : T.line}`, background: on ? tone(T.accent, 0.14) : 'transparent',
            color: on ? T.accent : T.muted, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}>{it.label}{it.count != null ? ` · ${it.count}` : ''}</button>
        );
      })}
    </div>
  );
}

/** Tuile de chiffre clé. */
export function Kpi({ value, label, color = T.accent, sub }: { value: ReactNode; label: string; color?: string; sub?: ReactNode }) {
  return (
    <div style={{ position: 'relative', minWidth: 0, background: `linear-gradient(160deg, ${T.surface2}, ${T.surface})`, border: `1px solid ${T.line}`, borderRadius: 16, padding: '12px 12px 11px', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', insetInline: 12, top: 0, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: T.text, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4, fontWeight: 500 }}>{label}</div>
      {sub != null && <div style={{ fontSize: 11, color, marginTop: 2, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

/** Pastille d'état. */
export function Badge({ children, color = T.accent, solid = false }: { children: ReactNode; color?: string; solid?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
      background: solid ? color : tone(color, 0.16), color: solid ? '#04101f' : color, border: solid ? 'none' : `1px solid ${tone(color, 0.35)}`,
      backdropFilter: 'blur(8px)', whiteSpace: 'nowrap',
    }}>
      {!solid && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />}
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger';
export function btnStyle(variant: BtnVariant = 'soft', color: string = T.accent): CSSProperties {
  const base: CSSProperties = { minHeight: 44, padding: '0 16px', borderRadius: 13, fontFamily: T.font, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', boxSizing: 'border-box' };
  if (variant === 'primary') return { ...base, background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`, color: '#04101f', boxShadow: `0 8px 24px -10px ${tone(T.accent, 0.8)}` };
  if (variant === 'danger') return { ...base, background: tone(T.bad, 0.12), color: T.bad, border: `1px solid ${tone(T.bad, 0.35)}` };
  if (variant === 'ghost') return { ...base, background: 'transparent', color: T.muted, border: `1px solid ${T.line}` };
  return { ...base, background: tone(color, 0.12), color, border: `1px solid ${tone(color, 0.3)}` };
}
export function Btn({ children, onClick, variant = 'soft', color, disabled, style, title }: { children: ReactNode; onClick?: () => void; variant?: BtnVariant; color?: string; disabled?: boolean; style?: CSSProperties; title?: string }) {
  return <button title={title} onClick={onClick} disabled={disabled} style={{ ...btnStyle(variant, color), opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer', ...style }}>{children}</button>;
}

/** Bouton d'action de carte : icône + libellé, largeur égale. */
export function ActionBtn({ icon, label, onClick, color = T.accent, busy }: { icon: string; label: string; onClick: () => void; color?: string; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      flex: 1, minWidth: 0, minHeight: 52, borderRadius: 12, cursor: busy ? 'wait' : 'pointer', fontFamily: T.font,
      background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.line}`, color: T.text,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 2px',
    }}>
      <span style={{ fontSize: 17, lineHeight: 1, filter: busy ? 'grayscale(1)' : 'none' }}>{busy ? '⏳' : icon}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color }}>{label}</span>
    </button>
  );
}

/** Interrupteur. */
export function Toggle({ on, onChange, busy, colorOn = T.ok, colorOff = T.bad }: { on: boolean; onChange: () => void; busy?: boolean; colorOn?: string; colorOff?: string }) {
  const c = on ? colorOn : colorOff;
  return (
    <button onClick={onChange} disabled={busy} aria-pressed={on} style={{
      width: 52, height: 30, borderRadius: 99, border: `1px solid ${tone(c, 0.5)}`, position: 'relative', cursor: busy ? 'wait' : 'pointer',
      background: on ? `linear-gradient(90deg, ${tone(c, 0.55)}, ${c})` : tone(c, 0.25), transition: 'background .25s', flexShrink: 0, opacity: busy ? 0.6 : 1,
      boxShadow: `0 0 14px -2px ${tone(c, 0.6)}`,
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.45)', transition: 'left .25s cubic-bezier(.34,1.56,.64,1)' }} />
    </button>
  );
}

/** Feuille modale (glisse depuis le bas). */
export function Sheet({ title, subtitle, onClose, children, footer, accent = T.accent, z = 60, fixed }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; accent?: string; z?: number; fixed?: boolean }) {
  return (
    <div onClick={onClose} style={{ position: fixed ? 'fixed' : 'absolute', inset: 0, zIndex: z, background: 'rgba(2,6,16,0.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', fontFamily: T.font }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '92%', display: 'flex', flexDirection: 'column', background: `linear-gradient(180deg, ${T.surface2}, ${T.bg})`, borderRadius: '24px 24px 0 0', border: `1px solid ${T.lineStrong}`, borderBottom: 'none', boxShadow: `0 -20px 60px -20px ${tone(accent, 0.35)}` }}>
        <div style={{ padding: '10px 18px 12px', flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>{title}</div>
              {subtitle != null && <div style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>{subtitle}</div>}
            </div>
            <button onClick={onClose} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: 12, border: `1px solid ${T.line}`, background: 'rgba(255,255,255,0.04)', color: T.muted, fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '4px 18px 16px', flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: '12px 18px calc(16px + env(safe-area-inset-bottom))', borderTop: `1px solid ${T.line}`, display: 'flex', gap: 10, flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Champ de saisie avec libellé. */
export const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '0 14px', borderRadius: 13, border: `1px solid ${T.line}`,
  background: 'rgba(255,255,255,0.04)', color: T.text, fontFamily: T.font, fontSize: 16, outline: 'none',
};
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{label}</div>
      {children}
      {hint != null && <div style={{ fontSize: 12, color: T.faint, marginTop: 5 }}>{hint}</div>}
    </label>
  );
}

/** État vide. */
export function Empty({ icon = '✨', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '38px 20px', border: `1px dashed ${T.lineStrong}`, borderRadius: T.radius, background: 'rgba(255,255,255,0.015)' }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{title}</div>
      {text && <div style={{ fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.45 }}>{text}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/** Message éphémère (toast) en haut de page. */
export function Toast({ text }: { text: string }) {
  if (!text) return null;
  const bad = text.startsWith('❌');
  return (
    <div style={{ position: 'absolute', top: 12, left: 16, right: 16, zIndex: 80, padding: '12px 14px', borderRadius: 14, fontFamily: T.font, fontSize: 14, fontWeight: 600, color: T.text, background: bad ? 'rgba(80,16,32,0.92)' : 'rgba(10,40,48,0.92)', border: `1px solid ${tone(bad ? T.bad : T.ok, 0.45)}`, boxShadow: '0 12px 30px rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}>{text}</div>
  );
}

/** Titre de section. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 10px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.muted }}>{children}</div>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.line}, transparent)` }} />
      {right}
    </div>
  );
}
