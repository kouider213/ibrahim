// Kit design Dzaryx v3 « Clair premium » — base commune de toutes les pages (style appli de banque : fond clair,
// cartes blanches, encre noire, un seul bleu d'action). Règles : texte ≥ 11 px, champs à 16 px (pas de zoom iPhone),
// boutons avec libellé et zone tactile ≥ 40 px, une seule famille de couleurs d'état (ok / warn / bad) partout.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export const T = {
  bg: 'var(--dz-bg)',
  surface: 'var(--dz-surface)',
  surface2: 'var(--dz-surface2)',
  line: 'var(--dz-line)',
  lineStrong: 'var(--dz-line-strong)',
  text: 'var(--dz-text)',
  muted: 'var(--dz-muted)',
  faint: 'var(--dz-faint)',
  accent: '#2f5bff',
  accent2: '#7a3cff',
  ok: '#0a9a5e',
  warn: '#b86e00',
  bad: '#e0304f',
  violet: '#7a3cff',
  /** Fond des boutons principaux / éléments choisis (noir en clair, bleu en sombre) — texte posé dessus : blanc */
  ink: 'var(--dz-ink)',
  font: 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: 'Manrope, Inter, -apple-system, sans-serif',
  /** Bouton principal : encre noire (le texte posé dessus reste blanc) */
  grad: 'linear-gradient(135deg, var(--dz-ink) 0%, var(--dz-ink2) 100%)',
  radius: 24,
  /** Ombre douce des cartes */
  shadow: 'var(--dz-shadow)',
};

// ── Styles globaux (une seule fois) : animations d'entrée, appui « qui s'enfonce », feuilles qui glissent ──
const KIT_CSS = `
@keyframes dzIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes dzFade{from{opacity:0}to{opacity:1}}
@keyframes dzSheet{from{transform:translateY(105%)}to{transform:none}}
@keyframes dzSpin{to{transform:rotate(360deg)}}
@keyframes dzPulse{0%,100%{box-shadow:0 0 0 0 var(--dzp)}50%{box-shadow:0 0 0 6px transparent}}
button{-webkit-tap-highlight-color:transparent;transition:transform .14s cubic-bezier(.3,.7,.4,1),background .2s,border-color .2s,box-shadow .2s,color .2s}
button:not(:disabled):active{transform:scale(.965)}
.dz-press{transition:transform .16s cubic-bezier(.3,.7,.4,1),box-shadow .25s,border-color .25s;-webkit-tap-highlight-color:transparent}
.dz-press:active{transform:scale(.98)}
.dz-in>*{animation:dzIn .42s cubic-bezier(.16,.84,.3,1) both}
.dz-in>*:nth-child(2){animation-delay:.03s}.dz-in>*:nth-child(3){animation-delay:.06s}.dz-in>*:nth-child(4){animation-delay:.09s}
.dz-in>*:nth-child(5){animation-delay:.12s}.dz-in>*:nth-child(6){animation-delay:.15s}.dz-in>*:nth-child(7){animation-delay:.18s}.dz-in>*:nth-child(n+8){animation-delay:.21s}
.dz-scroll{scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.dz-scroll::-webkit-scrollbar{display:none}
input::placeholder,textarea::placeholder{color:var(--dz-faint)}
input,textarea,select{color-scheme:var(--dz-scheme)}
input:focus,textarea:focus,select:focus{border-color:rgba(47,91,255,.6)!important;box-shadow:0 0 0 4px rgba(47,91,255,.12)}
@media (prefers-reduced-motion:reduce){.dz-in>*,.dz-sheet{animation:none!important}}
`;
if (typeof document !== 'undefined' && !document.getElementById('dz-kit-css')) {
  const st = document.createElement('style'); st.id = 'dz-kit-css'; st.textContent = KIT_CSS; document.head.appendChild(st);
}

/** Fond de carte commun : blanc, coins larges, ombre douce (teinte légère si `accent`). */
export const glass = (accent?: string): CSSProperties => ({
  background: accent ? `linear-gradient(180deg, ${tone(accent, 0.07)}, ${tone(accent, 0.02)} 60%), var(--dz-surface)` : 'var(--dz-surface)',
  border: `1px solid ${accent ? tone(accent, 0.18) : 'rgba(var(--dz-ink-rgb),0.05)'}`,
  boxShadow: T.shadow,
});

/** Chiffre qui défile jusqu'à sa valeur (5 490 €, 10,93 €, 14 / 15…). Le texte autour est gardé tel quel. */
export function CountUp({ value }: { value: ReactNode }) {
  const s = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null;
  const m = s?.match(/-?\d[\d\s\u202f\u00a0]*(?:[.,]\d+)?/);
  const [k, setK] = useState(m ? 0 : 1);
  useEffect(() => {
    if (!m) return;
    let raf = 0; const t0 = performance.now();
    const f = (now: number) => { const x = Math.min(1, (now - t0) / 750); setK(1 - Math.pow(1 - x, 3)); if (x < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  if (!s || !m) return <>{value}</>;
  const raw = m[0].trimEnd();
  const clean = raw.replace(/[\s\u202f\u00a0]/g, '');
  const dec = (clean.split(/[.,]/)[1] ?? '').length;
  const num = parseFloat(clean.replace(',', '.'));
  if (!isFinite(num)) return <>{value}</>;
  const cur = num * k;
  const txt = dec ? cur.toFixed(dec).replace('.', clean.includes(',') ? ',' : '.') : Math.round(cur).toLocaleString('fr-FR');
  return <>{s.replace(raw, txt)}</>;
}

export const tone = (c: string, a = 0.14) => {
  const n = parseInt(c.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** En-tête de page : petit sur-titre, grand titre à l'encre, sous-titre, action à droite. */
export function PageHeader({ eyebrow, title, subtitle, right, compact }: { eyebrow?: string; title: string; subtitle?: ReactNode; right?: ReactNode; compact?: boolean }) {
  return (
    <div style={{ padding: compact ? '10px 20px 10px' : '14px 20px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <div style={{ fontFamily: T.font, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, color: T.accent }}>{eyebrow}</div>}
          <div style={{ fontFamily: T.display, fontSize: compact ? 26 : 32, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.05, color: T.text }}>{title}</div>
          {subtitle != null && <div style={{ fontSize: 14, color: T.muted, marginTop: compact ? 4 : 7, lineHeight: 1.45 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

/** Contrôle segmenté (onglets) avec compteurs : piste grise, pastille blanche. */
export function Segmented<K extends string>({ items, value, onChange }: { items: { id: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div style={{ display: 'flex', padding: 4, gap: 2, background: 'rgba(var(--dz-ink-rgb),0.06)', borderRadius: 16 }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flex: 1, minHeight: 40, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: T.font,
            background: on ? 'var(--dz-surface)' : 'transparent',
            boxShadow: on ? '0 1px 2px rgba(var(--dz-ink-rgb),0.08), 0 4px 12px -6px rgba(var(--dz-ink-rgb),0.18)' : 'none',
            color: on ? T.text : T.muted, fontSize: 13.5, fontWeight: on ? 700 : 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {it.label}
            {it.count != null && <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: on ? T.ink : 'rgba(var(--dz-ink-rgb),0.08)', color: on ? '#ffffff' : T.muted }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Puces de filtre défilantes : noire quand elle est choisie. */
export function Chips<K extends string>({ items, value, onChange }: { items: { id: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 16px', margin: '0 -16px' }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flexShrink: 0, minHeight: 36, padding: '0 15px', borderRadius: 99, cursor: 'pointer', fontFamily: T.font,
            border: `1px solid ${on ? T.ink : T.line}`, background: on ? T.ink : 'var(--dz-surface)',
            color: on ? '#ffffff' : T.text, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}>{it.label}{it.count != null ? ` · ${it.count}` : ''}</button>
        );
      })}
    </div>
  );
}

/** Tuile de chiffre clé : libellé avec point de couleur, gros chiffre. */
export function Kpi({ value, label, color = T.accent, sub, icon }: { value: ReactNode; label: string; color?: string; sub?: ReactNode; icon?: string }) {
  return (
    <div style={{ minWidth: 0, ...glass(), borderRadius: 20, padding: '13px 14px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.muted, fontWeight: 600, lineHeight: 1.25 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
      <div style={{ fontFamily: T.display, fontSize: 23, fontWeight: 800, letterSpacing: '-0.035em', color: T.text, lineHeight: 1.1, marginTop: 8, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{icon && <span style={{ fontSize: 16, marginRight: 5 }}>{icon}</span>}<CountUp value={value} /></div>
      {sub != null && <div style={{ fontSize: 11.5, color, marginTop: 3, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

/** Pastille d'état. */
export function Badge({ children, color = T.accent, solid = false }: { children: ReactNode; color?: string; solid?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 700,
      background: solid ? color : tone(color, 0.1), color: solid ? '#ffffff' : color, whiteSpace: 'nowrap',
    }}>
      {!solid && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />}
      {children}
    </span>
  );
}

type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger';
export function btnStyle(variant: BtnVariant = 'soft', color: string = T.accent): CSSProperties {
  const base: CSSProperties = { minHeight: 46, padding: '0 18px', borderRadius: 99, fontFamily: T.font, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', boxSizing: 'border-box', whiteSpace: 'nowrap' };
  if (variant === 'primary') return { ...base, background: T.ink, color: '#ffffff', boxShadow: '0 10px 22px -12px rgba(var(--dz-shadow-rgb),0.55)' };
  if (variant === 'danger') return { ...base, background: tone(T.bad, 0.1), color: T.bad };
  if (variant === 'ghost') return { ...base, background: 'var(--dz-surface)', color: T.text, border: `1px solid ${T.lineStrong}` };
  return { ...base, background: tone(color, 0.1), color };
}
export function Btn({ children, onClick, variant = 'soft', color, disabled, style, title }: { children: ReactNode; onClick?: () => void; variant?: BtnVariant; color?: string; disabled?: boolean; style?: CSSProperties; title?: string }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} style={{ ...btnStyle(variant, color), opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer', ...style }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>{children}</span>
    </button>
  );
}

/** Bouton d'action de carte : icône + libellé, largeur égale. */
export function ActionBtn({ icon, label, onClick, color = T.accent, busy }: { icon: string; label: string; onClick: () => void; color?: string; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      flex: 1, minWidth: 0, minHeight: 58, borderRadius: 16, cursor: busy ? 'wait' : 'pointer', fontFamily: T.font,
      background: tone(color, 0.08), border: 'none', color: T.text,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '6px 2px',
    }}>
      <span style={{ fontSize: 19, lineHeight: 1, filter: busy ? 'grayscale(1)' : undefined }}>{busy ? '⏳' : icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
    </button>
  );
}

/** Interrupteur. */
export function Toggle({ on, onChange, busy, colorOn = T.ok, colorOff = T.bad }: { on: boolean; onChange: () => void; busy?: boolean; colorOn?: string; colorOff?: string }) {
  const c = on ? colorOn : colorOff;
  return (
    <button onClick={onChange} disabled={busy} aria-pressed={on} style={{
      width: 52, height: 31, borderRadius: 99, border: 'none', position: 'relative', cursor: busy ? 'wait' : 'pointer',
      background: on ? c : (colorOff === T.bad ? tone(c, 0.3) : 'rgba(var(--dz-ink-rgb),0.16)'), transition: 'background .25s', flexShrink: 0, opacity: busy ? 0.6 : 1,
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 24 : 3, width: 25, height: 25, borderRadius: '50%', background: 'var(--dz-surface)', boxShadow: '0 2px 6px rgba(var(--dz-shadow-rgb),0.25)', transition: 'left .25s cubic-bezier(.34,1.56,.64,1)' }} />
    </button>
  );
}

/** Feuille modale (glisse depuis le bas). */
export function Sheet({ title, subtitle, onClose, children, footer, accent: _accent = T.accent, z = 60, fixed }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; accent?: string; z?: number; fixed?: boolean }) {
  return (
    <div onClick={onClose} style={{ position: fixed ? 'fixed' : 'absolute', inset: 0, zIndex: z, background: 'rgba(var(--dz-ink-rgb),0.42)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', fontFamily: T.font, animation: 'dzFade .2s ease both' }}>
      <div className="dz-sheet" onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '92%', display: 'flex', flexDirection: 'column', background: T.bg, borderRadius: '30px 30px 0 0', boxShadow: '0 -20px 60px -20px rgba(var(--dz-shadow-rgb),0.35)', animation: 'dzSheet .38s cubic-bezier(.16,.9,.3,1) both' }}>
        <div style={{ padding: '10px 20px 12px', flexShrink: 0 }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.16)', margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.display, fontSize: 21, fontWeight: 800, color: T.text, letterSpacing: '-0.025em' }}>{title}</div>
              {subtitle != null && <div style={{ fontSize: 13.5, color: T.muted, marginTop: 3 }}>{subtitle}</div>}
            </div>
            <button onClick={onClose} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(var(--dz-ink-rgb),0.07)', color: T.text, fontSize: 15, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
        </div>
        <div className="dz-scroll" style={{ overflowY: 'auto', padding: '4px 20px 16px', flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: '12px 20px calc(16px + env(safe-area-inset-bottom))', background: 'var(--dz-surface)', borderTop: `1px solid ${T.line}`, display: 'flex', gap: 10, flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Champ de saisie avec libellé. */
export const inputStyle: CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 50, padding: '0 15px', borderRadius: 15, border: `1px solid ${T.line}`,
  background: 'var(--dz-surface)', color: T.text, fontFamily: T.font, fontSize: 16, outline: 'none',
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
    <div style={{ textAlign: 'center', padding: '38px 22px', borderRadius: T.radius, ...glass() }}>
      <div style={{ width: 64, height: 64, margin: '0 auto 14px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, background: T.bg }}>{icon}</div>
      <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>{title}</div>
      {text && <div style={{ fontSize: 13.5, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>{text}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

/** Message éphémère (toast) en haut de page : pastille d'encre. */
export function Toast({ text }: { text: string }) {
  if (!text) return null;
  const bad = text.startsWith('❌');
  return (
    <div style={{ position: 'absolute', top: 10, left: 16, right: 16, zIndex: 80, padding: '13px 16px', borderRadius: 18, fontFamily: T.font, fontSize: 14, fontWeight: 600, color: '#ffffff', background: bad ? '#b3213b' : T.ink, boxShadow: '0 16px 36px -14px rgba(var(--dz-shadow-rgb),0.55)', animation: 'dzIn .3s ease both' }}>{text}</div>
  );
}

/** Titre de section. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 2px 10px' }}>
      <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 800, letterSpacing: '-0.025em', color: T.text }}>{children}</div>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

/** Écran standard : en-tête fixe + contenu défilant (bas dégagé pour la barre). */
export function Screen({ header, children, toast, pad = true }: { header?: ReactNode; children: ReactNode; toast?: string; pad?: boolean }) {
  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: T.font, animation: 'dzFade .25s ease both' }}>
      {toast != null && <Toast text={toast} />}
      {header != null && <div style={{ flexShrink: 0 }}>{header}</div>}
      <div className="dz-in dz-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: pad ? '6px 16px 140px' : '0 0 140px' }}>{children}</div>
    </div>
  );
}

/** Carte de contenu. `accent` = barre de couleur à gauche. */
export function Card({ children, accent, onClick, style, pad = 16 }: { children: ReactNode; accent?: string; onClick?: () => void; style?: CSSProperties; pad?: number }) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} className={onClick ? 'dz-press' : undefined} style={{
      position: 'relative', ...glass(),
      borderRadius: T.radius, padding: pad, overflow: 'hidden', cursor: onClick ? 'pointer' : undefined, ...style,
    }}>
      {accent && <div style={{ position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, borderRadius: '0 4px 4px 0', background: accent }} />}
      {children}
    </div>
  );
}

/** Avatar rond : initiales ou emoji sur fond pastel. */
export function Avatar({ name, icon, color = T.accent, size = 42 }: { name?: string; icon?: string; color?: string; size?: number }) {
  const ini = icon ?? (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: tone(color, 0.12), color, fontFamily: T.display, fontSize: icon ? size * 0.46 : size * 0.36, fontWeight: 800, letterSpacing: '-0.02em' }}>{ini}</div>
  );
}

/** Ligne de liste : avatar/icône, titre, sous-titre, élément à droite. */
export function Row({ left, title, sub, right, onClick, accent }: { left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; accent?: string }) {
  return (
    <Card onClick={onClick} accent={accent} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {left}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {sub != null && <div style={{ fontSize: 13, color: T.muted, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>}
      </div>
      {right}
    </Card>
  );
}

/** Rangée de chiffres clés (2 colonnes, ou 3 si `cols=3`). */
export function KpiGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10, marginBottom: 16 }}>{children}</div>;
}

/** Bouton d'en-tête (rafraîchir, ajouter…) : pastille blanche. */
export function HeadBtn({ icon, label, onClick, busy, color: _color = T.accent }: { icon: string; label: string; onClick: () => void; busy?: boolean; color?: string }) {
  return (
    <button onClick={onClick} disabled={busy} aria-label={label} title={label} style={{
      minWidth: 44, height: 44, padding: '0 14px', borderRadius: 99, cursor: busy ? 'wait' : 'pointer', fontFamily: T.font,
      background: 'var(--dz-surface)', border: 'none', color: T.text, fontSize: 14, fontWeight: 700, boxShadow: T.shadow,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
    }}>
      <span style={{ fontSize: 16, display: 'inline-block', animation: busy ? 'dzSpin 1s linear infinite' : undefined }}>{icon}</span>
      {label.length <= 9 && <span>{label}</span>}
    </button>
  );
}

/** Lien WhatsApp à partir d'un numéro. */
export const waLink = (phone?: string | null, text?: string) => {
  const p = (phone ?? '').replace(/\D/g, '');
  return p ? `https://wa.me/${p}${text ? `?text=${encodeURIComponent(text)}` : ''}` : null;
};

/** Montant lisible : 2 380 €. */
export const money = (n: number | null | undefined, cur = '€') =>
  n == null || !isFinite(n) ? '—' : `${Math.round(n).toLocaleString('fr-FR')} ${cur === 'EUR' ? '€' : cur === 'DZD' ? 'DA' : cur}`;
