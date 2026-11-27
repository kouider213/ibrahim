// Kit design Dzaryx v4 « Signature » (16/11/2026) — base commune de toutes les pages.
// Analyse de 40 applis (DZARYX/APP/DESIGN_40_APPS.md) : noir profond OLED, cartes en verre fumé avec liseré lumineux,
// typo Geist + étiquettes en Geist Mono, bouton principal monochrome (blanc sur noir / noir sur blanc), icônes au trait
// à la place des emojis, lueur de couleur en haut de chaque page, barre du bas flottante. Règles : texte ≥ 11 px,
// champs à 16 px (pas de zoom iPhone), zones tactiles ≥ 40 px, une seule famille de couleurs d'état (ok / warn / bad).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Label, splitEmoji } from './Icon.tsx';

export const T = {
  bg: 'var(--dz-bg)',
  surface: 'var(--dz-surface)',
  surface2: 'var(--dz-surface2)',
  line: 'var(--dz-line)',
  lineStrong: 'var(--dz-line-strong)',
  text: 'var(--dz-text)',
  muted: 'var(--dz-muted)',
  faint: 'var(--dz-faint)',
  accent: '#3d6bff',
  accent2: '#8b5cf6',
  ok: '#12b76a',
  warn: '#f59e0b',
  bad: '#f04438',
  violet: '#8b5cf6',
  /** Fond des boutons principaux / éléments choisis : noir en clair, BLANC en sombre → texte dessus = T.onInk */
  ink: 'var(--dz-ink)',
  onInk: 'var(--dz-on-ink)',
  font: '"Geist", Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: '"Geist", Inter, -apple-system, sans-serif',
  mono: '"Geist Mono", ui-monospace, "SF Mono", monospace',
  /** Dégradé signature (orbe, héros) */
  grad: 'linear-gradient(135deg, #3d6bff 0%, #8b5cf6 55%, #22d3ee 100%)',
  radius: 22,
  shadow: 'var(--dz-shadow)',
};

// ── Styles globaux (une seule fois) ──
const KIT_CSS = `
@keyframes dzIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
@keyframes dzFade{from{opacity:0}to{opacity:1}}
@keyframes dzSheet{from{transform:translateY(105%)}to{transform:none}}
@keyframes dzSpin{to{transform:rotate(360deg)}}
.dz-kpi{container-type:inline-size}
@container (max-width:96px){.dz-kpi-in{padding:11px 9px 12px!important}.dz-kpi-dot{display:none!important}.dz-kpi-lb{font-size:10.5px!important;letter-spacing:-0.02em!important}}
@keyframes dzPulse{0%,100%{box-shadow:0 0 0 0 var(--dzp)}50%{box-shadow:0 0 0 6px transparent}}
@keyframes dzBlink{0%,100%{opacity:1}50%{opacity:.35}}
button{-webkit-tap-highlight-color:transparent;transition:transform .16s cubic-bezier(.3,.7,.4,1),background .2s,border-color .2s,box-shadow .2s,color .2s,opacity .2s}
button:not(:disabled):active{transform:scale(.96)}
.dz-press{transition:transform .18s cubic-bezier(.3,.7,.4,1),box-shadow .25s,border-color .25s;-webkit-tap-highlight-color:transparent}
.dz-press:active{transform:scale(.982)}
.dz-in>*{animation:dzIn .5s cubic-bezier(.16,.84,.3,1) both}
.dz-in>*:nth-child(2){animation-delay:.035s}.dz-in>*:nth-child(3){animation-delay:.07s}.dz-in>*:nth-child(4){animation-delay:.105s}
.dz-in>*:nth-child(5){animation-delay:.14s}.dz-in>*:nth-child(6){animation-delay:.175s}.dz-in>*:nth-child(7){animation-delay:.21s}.dz-in>*:nth-child(n+8){animation-delay:.24s}
.dz-scroll{scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.dz-scroll::-webkit-scrollbar{display:none}
.dz-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum","ss01"}
input::placeholder,textarea::placeholder{color:var(--dz-faint)}
input,textarea,select{color-scheme:var(--dz-scheme)}
input:focus,textarea:focus,select:focus{border-color:rgba(61,107,255,.7)!important;box-shadow:0 0 0 4px rgba(61,107,255,.16)}
input[type=range]{accent-color:#3d6bff}
@media (prefers-reduced-motion:reduce){.dz-in>*,.dz-sheet{animation:none!important}}
`;
if (typeof document !== 'undefined' && !document.getElementById('dz-kit-css')) {
  const st = document.createElement('style'); st.id = 'dz-kit-css'; st.textContent = KIT_CSS; document.head.appendChild(st);
}

/** Fond de carte commun : verre fumé + liseré lumineux en haut (sombre), blanc + filet (clair). `accent` = halo de couleur en coin. */
export const glass = (accent?: string): CSSProperties => ({
  background: accent
    ? `radial-gradient(120% 90% at 0% 0%, ${tone(accent, 0.16)}, transparent 55%), var(--dz-card)`
    : 'var(--dz-card)',
  border: `1px solid ${accent ? tone(accent, 0.22) : 'var(--dz-card-line)'}`,
  boxShadow: T.shadow,
});

/** Chiffre qui défile jusqu'à sa valeur (5 490 €, 10,93 €, 14 / 15…). Le texte autour est gardé tel quel. */
export function CountUp({ value }: { value: ReactNode }) {
  const s = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null;
  const m = s?.match(/-?\d[\d\s\u202f\u00a0]*(?:[.,]\d+)?/);
  const [k, setK] = useState(m ? 0 : 1);
  // 27/11 : quand la valeur change (chiffre gardé → chiffre frais), on part du chiffre affiché, pas de 0
  // (avant : le total sautait d'abord sur la nouvelle valeur, puis repartait de 0).
  const from = useRef(0), shown = useRef(0), target = useRef<string | null>(null);
  if (target.current !== s) { from.current = shown.current; target.current = s; if (k !== 0 && m) setK(0); }
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
  const cur = from.current + (num - from.current) * k;
  shown.current = cur;
  const txt = dec ? cur.toFixed(dec).replace('.', clean.includes(',') ? ',' : '.') : Math.round(cur).toLocaleString('fr-FR');
  return <>{s.replace(raw, txt)}</>;
}

export const tone = (c: string, a = 0.14) => {
  if (!c.startsWith('#')) return `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;
  const n = parseInt(c.slice(1).length === 3 ? c.slice(1).split('').map(x => x + x).join('') : c.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Petite étiquette en capitales mono (sur-titres, libellés de chiffres). */
export function Eyebrow({ children, color = T.muted, dot }: { children: ReactNode; color?: string; dot?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: T.mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase', color }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 2, background: dot, boxShadow: `0 0 10px ${dot}` }} />}
      {children}
    </div>
  );
}

/** En-tête de page : étiquette mono, très grand titre serré, sous-titre, action à droite. */
export function PageHeader({ eyebrow, title, subtitle, right, compact }: { eyebrow?: string; title: string; subtitle?: ReactNode; right?: ReactNode; compact?: boolean }) {
  const t = splitEmoji(title);
  return (
    <div style={{ padding: compact ? '8px 20px 12px' : '10px 20px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <div style={{ marginBottom: 10 }}><Eyebrow dot="var(--dz-glow, #3d6bff)">{eyebrow}</Eyebrow></div>}
          <div style={{ fontFamily: T.display, fontSize: compact ? 28 : 36, fontWeight: 650, letterSpacing: '-0.045em', lineHeight: 1.02, color: T.text }}>{t.had && t.text !== title ? t.text : title}</div>
          {subtitle != null && <div style={{ fontSize: 14.5, color: T.muted, marginTop: compact ? 5 : 9, lineHeight: 1.45, letterSpacing: '-0.005em' }}>{subtitle}</div>}
        </div>
        {right}
      </div>
    </div>
  );
}

/** Contrôle segmenté : piste fumée, pastille relevée. */
export function Segmented<K extends string>({ items, value, onChange }: { items: { id: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div style={{ display: 'flex', padding: 4, gap: 2, background: 'var(--dz-track)', border: '1px solid var(--dz-card-line)', borderRadius: 16 }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flex: 1, minHeight: 40, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: T.font,
            background: on ? 'var(--dz-seg-on)' : 'transparent',
            boxShadow: on ? '0 1px 0 rgba(255,255,255,0.06) inset, 0 6px 16px -8px rgba(var(--dz-shadow-rgb),0.5)' : 'none',
            color: on ? T.text : T.muted, fontSize: 13.5, fontWeight: on ? 600 : 500, letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 6px',
          }}>
            <Label size={15}>{it.label}</Label>
            {it.count != null && <span className="dz-num" style={{ fontFamily: T.mono, fontSize: 10.5, fontWeight: 600, padding: '2px 6px', borderRadius: 6, background: on ? T.ink : 'rgba(var(--dz-ink-rgb),0.08)', color: on ? T.onInk : T.muted }}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Puces de filtre défilantes : pleine (encre) quand elle est choisie. */
export function Chips<K extends string>({ items, value, onChange }: { items: { id: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="dz-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px', margin: '0 -16px' }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flexShrink: 0, minHeight: 36, padding: '0 14px', borderRadius: 12, cursor: 'pointer', fontFamily: T.font,
            border: `1px solid ${on ? 'transparent' : 'var(--dz-card-line)'}`, background: on ? T.ink : 'var(--dz-card)',
            color: on ? T.onInk : T.text, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: '-0.01em',
          }}><Label size={15}>{it.label}</Label>{it.count != null && <span className="dz-num" style={{ fontFamily: T.mono, fontSize: 11, opacity: 0.6 }}>{it.count}</span>}</button>
        );
      })}
    </div>
  );
}

/** Tuile de chiffre clé : étiquette mono, gros chiffre, petite lueur de couleur. */
export function Kpi({ value, label, color = T.accent, sub, icon }: { value: ReactNode; label: string; color?: string; sub?: ReactNode; icon?: string }) {
  return (
    <div className="dz-kpi" style={{ minWidth: 0 }}><div className="dz-kpi-in" style={{ height: '100%', boxSizing: 'border-box', ...glass(), borderRadius: 18, padding: '13px 14px 14px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 80, height: 80, borderRadius: '50%', background: tone(color, 0.18), filter: 'blur(22px)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 500, color: T.muted, lineHeight: 1.25, letterSpacing: '-0.005em' }}>
        <span className="dz-kpi-dot" style={{ width: 6, height: 6, borderRadius: 2, background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
        <span className="dz-kpi-lb" lang="fr" style={{ minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', hyphens: 'auto', WebkitHyphens: 'auto' }}>{label}</span>
      </div>
      <div className="dz-num" style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: T.display, fontSize: 25, fontWeight: 600, letterSpacing: '-0.045em', color: T.text, lineHeight: 1.1, marginTop: 10, whiteSpace: 'nowrap' }}>{icon && (() => { const ic = splitEmoji(icon); return ic.icon ? <span style={{ color, display: 'flex' }}><Icon name={ic.icon} size={18} stroke={2} /></span> : <span style={{ fontSize: 16 }}>{icon}</span>; })()}<CountUp value={value} /></div>
      {sub != null && <div style={{ fontSize: 11.5, color, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
    </div></div>
  );
}

/** Pastille d'état. */
export function Badge({ children, color = T.accent, solid = false }: { children: ReactNode; color?: string; solid?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, fontSize: 11.5, fontWeight: 600, letterSpacing: '-0.005em',
      background: solid ? color : tone(color, 0.13), color: solid ? '#ffffff' : color, whiteSpace: 'nowrap', border: solid ? 'none' : `1px solid ${tone(color, 0.18)}`,
    }}>
      {!solid && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />}
      <Label size={13} gap={4}>{children}</Label>
    </span>
  );
}

type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger';
export function btnStyle(variant: BtnVariant = 'soft', color: string = T.accent): CSSProperties {
  const base: CSSProperties = { minHeight: 46, padding: '0 18px', borderRadius: 14, fontFamily: T.font, fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', boxSizing: 'border-box', whiteSpace: 'nowrap' };
  if (variant === 'primary') return { ...base, background: color === T.accent ? T.ink : color, color: color === T.accent ? T.onInk : '#ffffff', boxShadow: '0 1px 0 rgba(255,255,255,0.25) inset, 0 10px 24px -12px rgba(var(--dz-shadow-rgb),0.6)' };
  if (variant === 'danger') return { ...base, background: tone(T.bad, 0.12), color: T.bad, border: `1px solid ${tone(T.bad, 0.2)}` };
  if (variant === 'ghost') return { ...base, background: 'var(--dz-card)', color: T.text, border: '1px solid var(--dz-line-strong)' };
  return { ...base, background: tone(color, 0.12), color, border: `1px solid ${tone(color, 0.16)}` };
}
export function Btn({ children, onClick, variant = 'soft', color, disabled, style, title }: { children: ReactNode; onClick?: () => void; variant?: BtnVariant; color?: string; disabled?: boolean; style?: CSSProperties; title?: string }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} style={{ ...btnStyle(variant, color), opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer', ...style }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}><Label size={17}>{children}</Label></span>
    </button>
  );
}

/** Bouton d'action de carte : icône au trait dans une pastille + libellé. */
export function ActionBtn({ icon, label, onClick, color = T.accent, busy }: { icon: string; label: string; onClick: () => void; color?: string; busy?: boolean }) {
  const ic = splitEmoji(icon);
  return (
    <button onClick={onClick} disabled={busy} style={{
      flex: 1, minWidth: 0, minHeight: 64, borderRadius: 16, cursor: busy ? 'wait' : 'pointer', fontFamily: T.font,
      background: 'var(--dz-card)', border: '1px solid var(--dz-card-line)', color: T.text,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 2px',
    }}>
      <span style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone(color, 0.14), color }}>
        {busy ? <span style={{ animation: 'dzSpin 1s linear infinite', display: 'flex' }}><Icon name="refresh" size={16} /></span> : ic.icon ? <Icon name={ic.icon} size={17} /> : <span style={{ fontSize: 16 }}>{icon}</span>}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: '-0.01em' }}>{label}</span>
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
      boxShadow: on ? `0 0 16px -2px ${tone(c, 0.6)}` : 'none',
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 24 : 3, width: 25, height: 25, borderRadius: '50%', background: '#ffffff', boxShadow: '0 2px 6px rgba(0,0,0,0.3)', transition: 'left .25s cubic-bezier(.34,1.56,.64,1)' }} />
    </button>
  );
}

/** Feuille modale (glisse depuis le bas). Toujours rendue dans <body> : jamais cachée sous la barre du bas
 *  (16/11 : sur LIBERTÉ le bouton « Noter » restait sous la barre et Kouider ne pouvait pas valider). */
export function Sheet({ title, subtitle, onClose, children, footer, accent: _accent = T.accent, z = 60 }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; accent?: string; z?: number; fixed?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const node = (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000 + z, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px) saturate(140%)', WebkitBackdropFilter: 'blur(10px) saturate(140%)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: T.font, color: T.text, animation: 'dzFade .2s ease both' }}>
      <div className="dz-sheet" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '90dvh', display: 'flex', flexDirection: 'column', background: 'var(--dz-sheet)', borderRadius: '28px 28px 0 0', border: '1px solid var(--dz-card-line)', borderBottom: 'none', boxShadow: '0 -30px 80px -20px rgba(0,0,0,0.6)', animation: 'dzSheet .42s cubic-bezier(.16,.9,.3,1) both' }}>
        <div style={{ padding: '10px 20px 12px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.2)', margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 650, color: T.text, letterSpacing: '-0.035em' }}><Label size={20} gap={9}>{title}</Label></div>
              {subtitle != null && <div style={{ fontSize: 13.5, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>{subtitle}</div>}
            </div>
            <button onClick={onClose} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: 12, border: '1px solid var(--dz-card-line)', background: 'var(--dz-card)', color: T.text, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={16} stroke={2.2} /></button>
          </div>
        </div>
        <div className="dz-scroll" style={{ overflowY: 'auto', overflowX: 'hidden', overscrollBehaviorX: 'none', padding: '4px 20px 16px', flex: 1, minHeight: 0, minWidth: 0 }}>{children}</div>
        {footer
          ? <div style={{ padding: '12px 20px calc(14px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--dz-card-line)', display: 'flex', gap: 10, flexShrink: 0 }}>{footer}</div>
          : <div style={{ height: 'env(safe-area-inset-bottom)', flexShrink: 0 }} />}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}

/** Champ de saisie avec libellé. */
export const inputStyle: CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 50, padding: '0 15px', borderRadius: 14, border: '1px solid var(--dz-line-strong)',
  background: 'var(--dz-card)', color: T.text, fontFamily: T.font, fontSize: 16, outline: 'none',
};
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.muted, marginBottom: 7, letterSpacing: '-0.005em' }}><Label size={14} gap={5}>{label}</Label></div>
      {children}
      {hint != null && <div style={{ fontSize: 12, color: T.faint, marginTop: 6, lineHeight: 1.4 }}>{hint}</div>}
    </label>
  );
}

/** État vide. */
export function Empty({ icon = '✨', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  const ic = splitEmoji(icon);
  return (
    <div style={{ textAlign: 'center', padding: '40px 22px', borderRadius: T.radius, ...glass(), borderStyle: 'dashed' }}>
      <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: T.muted, background: 'var(--dz-track)', border: '1px solid var(--dz-card-line)' }}>
        {ic.icon ? <Icon name={ic.icon} size={24} /> : icon}
      </div>
      <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 650, color: T.text, letterSpacing: '-0.03em' }}>{title}</div>
      {text && <div style={{ fontSize: 13.5, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>{text}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

/** Message éphémère (toast) en haut de page. */
export function Toast({ text }: { text: string }) {
  if (!text) return null;
  const bad = text.startsWith('❌');
  const node = (
    <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 16, right: 16, zIndex: 2000, padding: '13px 16px', borderRadius: 16, fontFamily: T.font, fontSize: 14, fontWeight: 600, color: bad ? '#fff' : T.onInk, background: bad ? '#d92d20' : T.ink, boxShadow: '0 20px 40px -14px rgba(0,0,0,0.6)', animation: 'dzIn .3s ease both', display: 'flex', alignItems: 'center', gap: 9 }}>
      <Label size={17} gap={9}>{text}</Label>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}

/** Titre de section. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 2px 10px' }}>
      <div style={{ fontFamily: T.display, fontSize: 19, fontWeight: 650, letterSpacing: '-0.035em', color: T.text }}><Label size={18} gap={8}>{children}</Label></div>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

/** Écran standard : en-tête + contenu défilant (bas dégagé pour la barre flottante). Fond transparent : la lueur de page passe derrière. */
export function Screen({ header, children, toast, pad = true }: { header?: ReactNode; children: ReactNode; toast?: string; pad?: boolean }) {
  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', color: T.text, fontFamily: T.font }}>
      {toast != null && <Toast text={toast} />}
      {header != null && <div style={{ flexShrink: 0 }}>{header}</div>}
      <div className="dz-in dz-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: pad ? '6px 16px 130px' : '0 0 130px' }}>{children}</div>
    </div>
  );
}

/** Carte de contenu. `accent` = halo de couleur en coin + liseré teinté. */
export function Card({ children, accent, onClick, style, pad = 16 }: { children: ReactNode; accent?: string; onClick?: () => void; style?: CSSProperties; pad?: number }) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} className={onClick ? 'dz-press' : undefined} style={{
      position: 'relative', ...glass(accent),
      borderRadius: T.radius, padding: pad, overflow: 'hidden', cursor: onClick ? 'pointer' : undefined, ...style,
    }}>
      {children}
    </div>
  );
}

/** Avatar : initiales ou icône sur carré arrondi teinté. */
export function Avatar({ name, icon, color = T.accent, size = 42 }: { name?: string; icon?: string; color?: string; size?: number }) {
  const ic = icon ? splitEmoji(icon) : null;
  const ini = icon ?? (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(145deg, ${tone(color, 0.28)}, ${tone(color, 0.1)})`, border: `1px solid ${tone(color, 0.25)}`, color, fontFamily: T.display, fontSize: icon ? size * 0.46 : size * 0.36, fontWeight: 650, letterSpacing: '-0.03em' }}>
      {ic?.icon ? <Icon name={ic.icon} size={size * 0.48} /> : ini}
    </div>
  );
}

/** Ligne de liste : avatar/icône, titre, sous-titre, élément à droite. */
export function Row({ left, title, sub, right, onClick, accent }: { left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; accent?: string }) {
  return (
    <Card onClick={onClick} accent={accent} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {left}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.02em' }}>{title}</div>
        {sub != null && <div style={{ fontSize: 13, color: T.muted, marginTop: 3, lineHeight: 1.35 }}>{sub}</div>}
      </div>
      {right ?? (onClick ? <Icon name="chevronRight" size={16} color="var(--dz-faint)" stroke={2.2} /> : null)}
    </Card>
  );
}

/** Rangée de chiffres clés (2 colonnes, ou 3 si `cols=3`). */
export function KpiGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 10, marginBottom: 16 }}>{children}</div>;
}

/** Bouton d'en-tête (rafraîchir, ajouter…) : carré de verre avec icône. */
export function HeadBtn({ icon, label, onClick, busy, color: _color = T.accent }: { icon: string; label: string; onClick: () => void; busy?: boolean; color?: string }) {
  const ic = splitEmoji(icon);
  return (
    <button onClick={onClick} disabled={busy} aria-label={label} title={label} style={{
      minWidth: 44, height: 44, padding: label.length <= 9 ? '0 14px' : 0, borderRadius: 14, cursor: busy ? 'wait' : 'pointer', fontFamily: T.font,
      background: 'var(--dz-card)', border: '1px solid var(--dz-card-line)', color: T.text, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0,
    }}>
      <span style={{ display: 'inline-flex', animation: busy ? 'dzSpin 1s linear infinite' : undefined }}>{ic.icon ? <Icon name={ic.icon} size={18} /> : <span style={{ fontSize: 16 }}>{icon}</span>}</span>
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
