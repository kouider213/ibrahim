// Kit design Dzaryx v2 — base commune de toutes les pages (palette Nexus : nuit + cyan).
// Règles : texte ≥ 11 px, champs à 16 px (pas de zoom iPhone), boutons avec libellé et zone tactile ≥ 40 px,
// une seule famille de couleurs d'état (ok / warn / bad / info) partout.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

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

// ── Styles globaux (une seule fois) : animations d'entrée, appui « qui s'enfonce », feuilles qui glissent, aurore ──
const KIT_CSS = `
@keyframes dzIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
@keyframes dzFade{from{opacity:0}to{opacity:1}}
@keyframes dzSheet{from{transform:translateY(105%)}to{transform:none}}
@keyframes dzAurora{0%{transform:translate(0,0) scale(1);opacity:.9}50%{transform:translate(-40px,26px) scale(1.18);opacity:1}100%{transform:translate(0,0) scale(1);opacity:.9}}
@keyframes dzAurora2{0%{transform:translate(0,0) scale(1.1)}50%{transform:translate(36px,-18px) scale(.92)}100%{transform:translate(0,0) scale(1.1)}}
@keyframes dzShine{0%{transform:translateX(-130%) skewX(-18deg)}60%,100%{transform:translateX(260%) skewX(-18deg)}}
@keyframes dzSpin{to{transform:rotate(360deg)}}
@keyframes dzPulse{0%,100%{box-shadow:0 0 0 0 var(--dzp)}50%{box-shadow:0 0 0 6px transparent}}
button{-webkit-tap-highlight-color:transparent;transition:transform .14s cubic-bezier(.3,.7,.4,1),background .2s,border-color .2s,box-shadow .2s,color .2s}
button:not(:disabled):active{transform:scale(.965)}
.dz-press{transition:transform .16s cubic-bezier(.3,.7,.4,1),box-shadow .25s,border-color .25s;-webkit-tap-highlight-color:transparent}
.dz-press:active{transform:scale(.975)}
.dz-in>*{animation:dzIn .5s cubic-bezier(.16,.84,.3,1) both}
.dz-in>*:nth-child(2){animation-delay:.04s}.dz-in>*:nth-child(3){animation-delay:.08s}.dz-in>*:nth-child(4){animation-delay:.12s}
.dz-in>*:nth-child(5){animation-delay:.16s}.dz-in>*:nth-child(6){animation-delay:.2s}.dz-in>*:nth-child(7){animation-delay:.24s}.dz-in>*:nth-child(n+8){animation-delay:.28s}
.dz-scroll{scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.dz-scroll::-webkit-scrollbar{display:none}
input::placeholder,textarea::placeholder{color:#4f6289}
input:focus,textarea:focus,select:focus{border-color:rgba(56,216,245,.55)!important;box-shadow:0 0 0 3px rgba(56,216,245,.14)}
@media (prefers-reduced-motion:reduce){.dz-in>*,.dz-sheet,.dz-aurora{animation:none!important}}
`;
if (typeof document !== 'undefined' && !document.getElementById('dz-kit-css')) {
  const st = document.createElement('style'); st.id = 'dz-kit-css'; st.textContent = KIT_CSS; document.head.appendChild(st);
}

/** Fond « verre » commun aux cartes : dégradé profond + reflet en haut + ombre portée. */
export const glass = (accent?: string): CSSProperties => ({
  background: `${accent ? `radial-gradient(120% 90% at 0% 0%, ${tone(accent, 0.13)}, transparent 55%), ` : ''}linear-gradient(155deg, rgba(24,42,86,0.82), rgba(10,19,43,0.94))`,
  border: `1px solid ${accent ? tone(accent, 0.3) : 'rgba(120,170,255,0.15)'}`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 14px 34px -22px rgba(0,0,0,0.9)',
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

/** En-tête de page compact : sur-titre, titre, sous-titre (ou message), action à droite. */
export function PageHeader({ eyebrow, title, subtitle, right, compact }: { eyebrow?: string; title: string; subtitle?: ReactNode; right?: ReactNode; compact?: boolean }) {
  return (
    <div style={{ position: 'relative', padding: compact ? '12px 16px 10px' : '18px 16px 14px', overflow: 'hidden' }}>
      <div className="dz-aurora" style={{ position: 'absolute', top: -110, right: -70, width: 300, height: 300, background: `radial-gradient(circle, ${tone(T.accent, 0.2)}, transparent 68%)`, pointerEvents: 'none', animation: 'dzAurora 14s ease-in-out infinite' }} />
      <div className="dz-aurora" style={{ position: 'absolute', top: -60, left: -90, width: 240, height: 240, background: `radial-gradient(circle, ${tone(T.violet, 0.12)}, transparent 70%)`, pointerEvents: 'none', animation: 'dzAurora2 18s ease-in-out infinite' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'Orbitron, ' + T.font, fontSize: 10, letterSpacing: '0.26em', color: T.accent, fontWeight: 600, textTransform: 'uppercase', marginBottom: 7 }}><span style={{ width: 5, height: 5, borderRadius: 2, background: T.accent, boxShadow: `0 0 8px ${T.accent}` }} />{eyebrow}</div>}
          <div style={{ fontSize: compact ? 23 : 30, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.05, background: 'linear-gradient(120deg, #ffffff 30%, #bfeffd 75%, #7fd8ff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{title}</div>
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
    <div style={{ display: 'flex', padding: 4, gap: 4, background: 'rgba(8,16,36,0.75)', border: `1px solid ${T.line}`, borderRadius: 15, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flex: 1, minHeight: 40, borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: T.font,
            background: on ? `linear-gradient(135deg, ${tone(T.accent, 0.26)}, ${tone(T.accent2, 0.18)})` : 'transparent',
            boxShadow: on ? `inset 0 0 0 1px ${tone(T.accent, 0.55)}, 0 6px 18px -8px ${tone(T.accent, 0.7)}` : 'none',
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
export function Kpi({ value, label, color = T.accent, sub, icon }: { value: ReactNode; label: string; color?: string; sub?: ReactNode; icon?: string }) {
  return (
    <div style={{ position: 'relative', minWidth: 0, ...glass(), borderRadius: 18, padding: '13px 13px 12px', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -30, right: -30, width: 90, height: 90, borderRadius: '50%', background: `radial-gradient(circle, ${tone(color, 0.22)}, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', insetInline: 12, top: 0, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${color}, transparent)`, boxShadow: `0 0 10px ${tone(color, 0.7)}` }} />
      <div style={{ position: 'relative', fontSize: 23, fontWeight: 800, letterSpacing: '-0.03em', color: T.text, lineHeight: 1.1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{icon && <span style={{ fontSize: 17, marginRight: 6 }}>{icon}</span>}<CountUp value={value} /></div>
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
  const base: CSSProperties = { minHeight: 44, padding: '0 16px', borderRadius: 13, fontFamily: T.font, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', boxSizing: 'border-box', whiteSpace: 'nowrap' };
  if (variant === 'primary') return { ...base, position: 'relative', overflow: 'hidden', background: `linear-gradient(135deg, #5ee6ff, ${T.accent} 40%, ${T.accent2})`, color: '#03101f', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.45), 0 10px 26px -10px ${tone(T.accent, 0.9)}` };
  if (variant === 'danger') return { ...base, background: tone(T.bad, 0.12), color: T.bad, border: `1px solid ${tone(T.bad, 0.35)}` };
  if (variant === 'ghost') return { ...base, background: 'transparent', color: T.muted, border: `1px solid ${T.line}` };
  return { ...base, background: `linear-gradient(160deg, ${tone(color, 0.16)}, ${tone(color, 0.07)})`, color, border: `1px solid ${tone(color, 0.34)}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' };
}
export function Btn({ children, onClick, variant = 'soft', color, disabled, style, title }: { children: ReactNode; onClick?: () => void; variant?: BtnVariant; color?: string; disabled?: boolean; style?: CSSProperties; title?: string }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} style={{ ...btnStyle(variant, color), opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer', ...style }}>
      {variant === 'primary' && !disabled && <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)', animation: 'dzShine 3.8s ease-in-out infinite', pointerEvents: 'none' }} />}
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7 }}>{children}</span>
    </button>
  );
}

/** Bouton d'action de carte : icône + libellé, largeur égale. */
export function ActionBtn({ icon, label, onClick, color = T.accent, busy }: { icon: string; label: string; onClick: () => void; color?: string; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      flex: 1, minWidth: 0, minHeight: 56, borderRadius: 14, cursor: busy ? 'wait' : 'pointer', fontFamily: T.font,
      background: `linear-gradient(160deg, ${tone(color, 0.12)}, rgba(255,255,255,0.02))`, border: `1px solid ${tone(color, 0.26)}`, color: T.text,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 2px',
    }}>
      <span style={{ fontSize: 19, lineHeight: 1, filter: busy ? 'grayscale(1)' : `drop-shadow(0 2px 6px ${tone(color, 0.5)})` }}>{busy ? '⏳' : icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
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
    <div onClick={onClose} style={{ position: fixed ? 'fixed' : 'absolute', inset: 0, zIndex: z, background: 'rgba(2,6,16,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', fontFamily: T.font, animation: 'dzFade .2s ease both' }}>
      <div className="dz-sheet" onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '92%', display: 'flex', flexDirection: 'column', background: `radial-gradient(100% 50% at 100% 0%, ${tone(accent, 0.14)}, transparent 60%), linear-gradient(180deg, ${T.surface2}, ${T.bg})`, borderRadius: '26px 26px 0 0', border: `1px solid ${T.lineStrong}`, borderBottom: 'none', boxShadow: `0 -24px 70px -20px ${tone(accent, 0.45)}`, animation: 'dzSheet .38s cubic-bezier(.16,.9,.3,1) both' }}>
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
        <div className="dz-scroll" style={{ overflowY: 'auto', padding: '4px 18px 16px', flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: '12px 18px calc(16px + env(safe-area-inset-bottom))', borderTop: `1px solid ${T.line}`, display: 'flex', gap: 10, flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Champ de saisie avec libellé. */
export const inputStyle: CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 48, padding: '0 14px', borderRadius: 13, border: `1px solid ${T.line}`,
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
    <div style={{ position: 'relative', overflow: 'hidden', textAlign: 'center', padding: '40px 20px', border: `1px dashed ${T.lineStrong}`, borderRadius: 22, background: `radial-gradient(80% 60% at 50% 0%, ${tone(T.accent, 0.08)}, transparent 70%), rgba(255,255,255,0.015)` }}>
      <div style={{ width: 68, height: 68, margin: '0 auto 12px', borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, background: `linear-gradient(145deg, ${tone(T.accent, 0.18)}, ${tone(T.violet, 0.1)})`, border: `1px solid ${tone(T.accent, 0.3)}`, boxShadow: `0 10px 30px -12px ${tone(T.accent, 0.6)}` }}>{icon}</div>
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
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a9bbdc' }}>{children}</div>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${tone(T.accent, 0.35)}, transparent)` }} />
      {right}
    </div>
  );
}

/** Écran standard : en-tête fixe + contenu défilant (bas dégagé pour le bouton micro). */
export function Screen({ header, children, toast, pad = true }: { header?: ReactNode; children: ReactNode; toast?: string; pad?: boolean }) {
  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: `radial-gradient(120% 60% at 50% 115%, rgba(56,120,245,0.10), transparent 60%), ${T.bg}`, color: T.text, fontFamily: T.font, animation: 'dzFade .25s ease both' }}>
      {toast != null && <Toast text={toast} />}
      {header != null && <div style={{ flexShrink: 0 }}>{header}</div>}
      <div className="dz-in dz-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: pad ? '6px 16px 130px' : '0 0 130px' }}>{children}</div>
    </div>
  );
}

/** Carte de contenu. `accent` = liseré coloré à gauche. */
export function Card({ children, accent, onClick, style, pad = 14 }: { children: ReactNode; accent?: string; onClick?: () => void; style?: CSSProperties; pad?: number }) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} className={onClick ? 'dz-press' : undefined} style={{
      position: 'relative', ...glass(accent),
      borderRadius: 20, padding: pad, overflow: 'hidden', cursor: onClick ? 'pointer' : undefined, ...style,
    }}>
      {accent && <div style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: '0 3px 3px 0', background: `linear-gradient(180deg, ${accent}, ${tone(accent, 0.4)})`, boxShadow: `0 0 12px ${tone(accent, 0.8)}` }} />}
      {children}
    </div>
  );
}

/** Avatar rond : initiales ou emoji. */
export function Avatar({ name, icon, color = T.accent, size = 42 }: { name?: string; icon?: string; color?: string; size?: number }) {
  const ini = icon ?? (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(circle at 30% 25%, ${tone(color, 0.42)}, ${tone(color, 0.1)} 70%)`, border: `1px solid ${tone(color, 0.55)}`,
      boxShadow: `0 0 0 3px ${tone(color, 0.08)}, 0 8px 20px -10px ${tone(color, 0.8)}, inset 0 1px 0 rgba(255,255,255,0.18)`,
      color, fontSize: icon ? size * 0.46 : size * 0.36, fontWeight: 800, letterSpacing: '-0.02em' }}>{ini}</div>
  );
}

/** Ligne de liste : avatar/icône, titre, sous-titre, élément à droite. */
export function Row({ left, title, sub, right, onClick, accent }: { left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; accent?: string }) {
  return (
    <Card onClick={onClick} accent={accent} pad={12} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {left}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
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

/** Bouton icône rond libellé pour l'en-tête (rafraîchir, ajouter…). */
export function HeadBtn({ icon, label, onClick, busy, color = T.accent }: { icon: string; label: string; onClick: () => void; busy?: boolean; color?: string }) {
  return (
    <button onClick={onClick} disabled={busy} aria-label={label} title={label} style={{
      minWidth: 44, height: 44, padding: '0 12px', borderRadius: 13, cursor: busy ? 'wait' : 'pointer', fontFamily: T.font,
      background: `linear-gradient(160deg, ${tone(color, 0.18)}, ${tone(color, 0.06)})`, border: `1px solid ${tone(color, 0.38)}`, color, fontSize: 14, fontWeight: 700,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 20px -12px ${tone(color, 0.8)}`,
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
