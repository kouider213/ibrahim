import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, tone, Sheet, Btn, Field, inputStyle, glass, Badge } from '../ui/Kit.tsx';

// PLAN PAR ÉTAPES (27/11) : réserve → voiture → maison → départ (+ ses propres projets), dates en 3 scénarios,
// leviers, points faibles, points de contrôle, 20 options. Tout est calculé côté serveur sur ses chiffres (privé).

interface Step { id: string; name: string; icon: string; cost: number; cumul: number; at: string | null; label: string; best: string; slow: string; done: boolean; pct: number; fixed?: boolean }
interface Plan {
  now: string; total: number; departLabel: string; departBest: string; departSlow: string; have: number; pct: number;
  steps: Step[]; levers: Array<{ icon: string; label: string; perMonth: number; date: string; gain: number | null }>;
  weak: Array<{ icon: string; text: string }>; checkpoints: Array<{ label: string; need: number }>;
  options: Array<{ icon: string; title: string; text: string }>; curve: Array<{ ym: string; v: number }>;
  monthly: number[]; next: { label: string; need: number; have: number; missing: number };
  // 27/11 nuit : ce qu'il faut faire (serveur) — anciennes versions du serveur : champs absents
  marge?: number; fikDay?: number; perMonth?: number | null; perWeek?: number | null; daysLeft?: number | null; left?: number;
  biz?: { name: string; clients: number; perMonth: number; startLabel: string; partner?: string; noBizLabel: string } | null;
  thisMonth?: { saved: number; target: number } | null; nextStep?: { name: string; icon: string; missing: number; label: string } | null; totalDa?: number;
}
type Fm = (n: number) => string;
const MOISL = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ymAdd = (ym: string, n: number) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const reach = (m: number[], need: number, extra: number) => { for (let i = 0; i < m.length; i++) if (m[i]! + extra * i >= need) return i; return null; };
const ICONS = ['🎯', '🏠', '🚙', '🏢', '💍', '🕋', '🎓', '🏖️', '💼'];

export function DepartCard({ real, fm }: { real: Array<{ ym: string; v: number }>; fm: Fm }) {
  const [p, setP] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { apiFetch<Plan>('/api/mon-argent/plan').then(setP).catch(() => setP(null)); }, []);
  if (!p) return null;
  return (<>
    <div className="dz-press" role="button" onClick={() => setOpen(true)} style={{ ...glass('#0ea5e9'), borderRadius: 22, padding: 16, marginBottom: 12, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <div style={{ flex: 1, fontSize: 13, color: T.muted, fontWeight: 600 }}>Départ potentiel</div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.accent }}>Détails ›</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
        <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>{p.departLabel}</div>
        {p.daysLeft != null && <Badge color={T.accent}>J-{p.daysLeft}</Badge>}
      </div>
      <div style={{ fontSize: 12.5, color: T.muted }}>entre {p.departBest} (tu gardes tout) et {p.departSlow} (tu dépenses plus)</div>
      {p.biz && <div style={{ fontSize: 12, color: T.warn, marginTop: 2 }}>⚠️ avec {p.biz.name} ({p.biz.clients} clients/mois) · sans : {p.biz.noBizLabel}</div>}
      {/* 27/11 nuit : ce qu'il faut faire concrètement */}
      {p.perMonth != null && p.perMonth > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 12 }}>
        <div style={{ background: 'rgba(var(--dz-ink-rgb),0.05)', borderRadius: 14, padding: '10px 12px' }}><div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>À mettre de côté</div><div style={{ fontSize: 18, fontWeight: 800 }}>{fm(p.perMonth)}<span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}> /mois</span></div><div style={{ fontSize: 11.5, color: T.faint }}>soit {fm(p.perWeek ?? 0)} par semaine</div></div>
        {p.thisMonth ? (() => { const tm = p.thisMonth!, ok = tm.saved >= tm.target, pc = tm.target ? Math.max(0, Math.min(100, tm.saved / tm.target * 100)) : 100; return (
          <div style={{ background: 'rgba(var(--dz-ink-rgb),0.05)', borderRadius: 14, padding: '10px 12px' }}><div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>Ce mois-ci</div><div style={{ fontSize: 18, fontWeight: 800, color: tm.saved < 0 ? T.bad : ok ? T.ok : T.text }}>{tm.saved < 0 ? '−' : '+'}{fm(Math.abs(tm.saved))}</div>
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.08)', marginTop: 4 }}><div style={{ height: '100%', width: `${pc}%`, borderRadius: 3, background: ok ? T.ok : T.warn }} /></div>
            <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>{ok ? 'dans les temps ✅' : `prévu ${fm(tm.target)}`}</div></div>); })()
          : p.nextStep && <div style={{ background: 'rgba(var(--dz-ink-rgb),0.05)', borderRadius: 14, padding: '10px 12px' }}><div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>Prochaine étape</div><div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nextStep.icon} {p.nextStep.name}</div><div style={{ fontSize: 11.5, color: T.faint }}>encore {fm(p.nextStep.missing)}</div></div>}
      </div>}
      {/* Frise des étapes */}
      <div style={{ marginTop: 14 }}>
        {p.steps.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 26 }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: s.done ? tone(T.ok, 0.25) : 'rgba(var(--dz-ink-rgb),0.06)', border: `1px solid ${s.done ? T.ok : T.line}` }}>{s.done ? '✓' : s.icon}</div>
              {i < p.steps.length - 1 && <div style={{ flex: 1, width: 2, background: s.done ? T.ok : T.line, minHeight: 14 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 10, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ flex: 1, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span><b style={{ fontSize: 13.5, color: s.done ? T.ok : T.text }}>{s.done ? 'atteint' : s.label}</b></div>
              <div style={{ fontSize: 12, color: T.faint }}>{fm(s.cost)}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(var(--dz-ink-rgb),0.06)', marginTop: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: `${p.pct}%`, background: 'linear-gradient(90deg,#22d3ee,#3d6bff)' }} /></div>
      <div style={{ display: 'flex', fontSize: 12, color: T.muted, marginTop: 6 }}><span style={{ flex: 1 }}>{fm(p.have)} réunis</span><span>{p.pct} % de {fm(p.total)}</span></div>
      {/* 27/11 nuit : « il manque X » faisait croire à un retard — c'est ce qu'il reste à mettre de côté d'ici là */}
      {p.next && <div style={{ fontSize: 12.5, marginTop: 8, color: p.next.missing ? T.muted : T.ok }}>📍 Repère {p.next.label} : avoir {fm(p.next.need)}{p.next.missing ? ` — encore ${fm(p.next.missing)} à mettre de côté d'ici là` : ' — déjà atteint ✅'}</div>}
      {p.nextStep && p.thisMonth && <div style={{ fontSize: 12.5, marginTop: 4, color: T.muted }}>{p.nextStep.icon} Prochaine étape : {p.nextStep.name} — encore {fm(p.nextStep.missing)} ({p.nextStep.label})</div>}
    </div>
    {open && <PlanSheet plan={p} onClose={() => setOpen(false)} onChange={setP} real={real} fm={fm} />}
  </>);
}

/** 27/11 nuit (photo de Kouider : « le graphique est éclaté, la page va de gauche à droite ») : vraie courbe SVG
 *  (réel passé + prévu jusqu'au départ + 1 an), lignes des étapes, repère « aujourd'hui » et « départ ». Tient TOUJOURS dans la largeur. */
function PlanChart({ p, real, fm, simI, extra, buy }: { p: Plan; real: Array<{ ym: string; v: number }>; fm: Fm; simI: number | null; extra: number; buy: number }) {
  const m = p.monthly ?? [];
  const iDep = reach(m, p.total, 0);
  const span = Math.min(m.length - 1, Math.max(24, (Math.max(iDep ?? 36, simI ?? 0)) + 12));
  const past = real.filter(r => r.ym < p.now).slice(-12);
  const nPast = past.length;
  const W = 340, H = 190, L = 8, R = 8, Tp = 14, B = 24;
  const n = nPast + span;
  const x = (k: number) => L + (k / Math.max(1, n)) * (W - L - R);
  const proj = m.slice(0, span + 1);
  const simCurve = (extra || buy) ? proj.map((v, i) => v + extra * i - buy) : null;
  const mx = Math.max(p.total, ...proj, ...(simCurve ?? []), ...past.map(r => r.v)) * 1.08;
  const y = (v: number) => Tp + (1 - Math.max(0, v) / mx) * (H - Tp - B);
  const line = (vals: number[], off: number) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(off + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line(proj, nPast)} L${x(nPast + proj.length - 1).toFixed(1)},${y(0)} L${x(nPast).toFixed(1)},${y(0)} Z`;
  const years: Array<{ k: number; label: string }> = [];
  for (let i = 1; i <= span; i++) { const ym = ymAdd(p.now, i); if (ym.endsWith('-01')) years.push({ k: nPast + i, label: ym.slice(0, 4) }); }
  const [tip, setTip] = useState<number | null>(null);
  const onMove = (cx: number, el: SVGSVGElement) => { const r = el.getBoundingClientRect(); const k = Math.round(((cx - r.left) / r.width * W - L) / (W - L - R) * n) - nPast; setTip(Math.max(0, Math.min(span, k))); };
  const tipYm = tip != null ? ymAdd(p.now, tip) : null;
  return (
    <div style={{ ...glass(T.accent), borderRadius: 18, padding: '12px 10px 8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 4px 6px', minHeight: 34 }}>
        {tip != null && tipYm ? <><span style={{ fontSize: 13, color: T.muted }}>{MOISL[+tipYm.slice(5, 7) - 1]} {tipYm.slice(0, 4)}</span><b style={{ fontSize: 16 }}>{fm(proj[tip] ?? 0)}</b>{simCurve && <span style={{ fontSize: 12.5, color: T.ok, fontWeight: 700 }}>simulé {fm(simCurve[tip] ?? 0)}</span>}</>
          : <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.35 }}>Glisse le doigt sur la courbe pour voir combien tu auras chaque mois.</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', touchAction: 'none' }}
        onPointerDown={e => onMove(e.clientX, e.currentTarget)} onPointerMove={e => { if (e.buttons || e.pointerType === 'mouse') onMove(e.clientX, e.currentTarget); }} onPointerLeave={() => setTip(null)}>
        <defs><linearGradient id="dzpl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3d6bff" stopOpacity="0.45" /><stop offset="1" stopColor="#3d6bff" stopOpacity="0.02" /></linearGradient></defs>
        {/* étapes = lignes horizontales */}
        {p.steps.map((st, i) => st.cumul <= mx && (
          <g key={st.id}>
            <line x1={L} x2={W - R} y1={y(st.cumul)} y2={y(st.cumul)} stroke={st.done ? 'var(--dz-ok, #12b76a)' : 'rgba(var(--dz-ink-rgb),0.22)'} strokeDasharray="3 4" strokeWidth="1" />
            {/* étiquette seulement si assez loin de la suivante (sinon elles se chevauchent : 189 000 / 191 843) */}
            {(i === p.steps.length - 1 || Math.abs(y(st.cumul) - y(p.steps[i + 1]!.cumul)) > 13) && <text x={L + 2} y={y(st.cumul) - 4} fontSize="10" fill="currentColor" opacity="0.7">{st.icon} {fm(st.cumul)}</text>}
          </g>))}
        <path d={area} fill="url(#dzpl)" />
        <path d={line(proj, nPast)} fill="none" stroke="#3d6bff" strokeWidth="2.2" strokeLinejoin="round" />
        {simCurve && <path d={line(simCurve, nPast)} fill="none" stroke="#12b76a" strokeWidth="2" strokeDasharray="5 4" />}
        {nPast > 0 && <path d={line([...past.map(r => r.v), proj[0] ?? 0], 0)} fill="none" stroke="#f59e0b" strokeWidth="2.2" />}
        {past.map((r, i) => <circle key={r.ym} cx={x(i)} cy={y(r.v)} r="2.6" fill="#f59e0b" />)}
        {/* aujourd'hui */}
        <line x1={x(nPast)} x2={x(nPast)} y1={Tp} y2={H - B} stroke="rgba(var(--dz-ink-rgb),0.35)" strokeWidth="1" />
        <circle cx={x(nPast)} cy={y(proj[0] ?? 0)} r="4" fill="#3d6bff" stroke="var(--dz-bg)" strokeWidth="2" />
        {/* départ */}
        {iDep != null && <g><line x1={x(nPast + iDep)} x2={x(nPast + iDep)} y1={Tp} y2={H - B} stroke="#f59e0b" strokeWidth="1.5" /><circle cx={x(nPast + iDep)} cy={y(p.total)} r="5" fill="#f59e0b" stroke="var(--dz-bg)" strokeWidth="2" /></g>}
        {tip != null && <line x1={x(nPast + tip)} x2={x(nPast + tip)} y1={Tp} y2={H - B} stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" />}
        {years.map(t => <text key={t.k} x={x(t.k)} y={H - 7} fontSize="10" fill="currentColor" opacity="0.55" textAnchor="middle">{t.label}</text>)}
      </svg>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '4px 4px 0', fontSize: 11.5, color: T.muted }}>
        {nPast > 0 && <span><span style={{ color: '#f59e0b' }}>●</span> réel</span>}<span><span style={{ color: '#3d6bff' }}>━</span> prévu</span>
        {simCurve && <span><span style={{ color: '#12b76a' }}>┅</span> simulé</span>}<span><span style={{ color: '#f59e0b' }}>│</span> départ {p.departLabel}</span>
      </div>
    </div>
  );
}

function PlanSheet({ plan: p, onClose, onChange, real, fm }: { plan: Plan; onClose: () => void; onChange: (p: Plan) => void; real: Array<{ ym: string; v: number }>; fm: Fm }) {
  const [sim, setSim] = useState({ pieces: 0, fik: 0, cut: 0, buy: 0 });
  // la VRAIE marge du snus et de FIK (serveur) + « et si j'achète un truc à X € ? »
  const marge = p.marge ?? 2.25, fikDay = p.fikDay ?? 8, extra = sim.pieces * marge * 26 + sim.fik * fikDay + sim.cut;
  const simI = reach(p.monthly ?? [], p.total + sim.buy, extra), baseI = reach(p.monthly ?? [], p.total, 0);
  const touched = extra > 0 || sim.buy > 0;
  const simLabel = simI === null ? 'pas avant 15 ans' : (() => { const ym = ymAdd(p.now, simI); return `${MOISL[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`; })();
  const [edit, setEdit] = useState(false);
  const [allOpt, setAllOpt] = useState(false);
  const [list, setList] = useState(p.steps.map(s => ({ id: s.id, name: s.name, icon: s.icon, cost: String(s.cost), fixed: s.fixed })));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { onChange(await apiFetch<Plan>('/api/mon-argent/goals', { method: 'POST', body: JSON.stringify({ goals: list.map(g => ({ ...g, cost: Number(g.cost) })) }) })); setEdit(false); }
    finally { setBusy(false); }
  };
  const move = (i: number, d: -1 | 1) => setList(l => { const c = [...l]; const j = i + d; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j]!, c[i]!]; return c; });
  const H = ({ children, right }: { children: string; right?: React.ReactNode }) => <div style={{ display: 'flex', alignItems: 'center', fontSize: 12.5, color: T.muted, fontWeight: 800, letterSpacing: '0.04em', margin: '22px 0 10px' }}><span style={{ flex: 1 }}>{children.toUpperCase()}</span>{right}</div>;
  const card = (c: string): React.CSSProperties => ({ ...glass(c), borderRadius: 16, padding: 12, minWidth: 0 });

  return (
    <Sheet title="🇩🇿 Ton plan de départ" subtitle={`${fm(p.have)} réunis sur ${fm(p.total)}`} onClose={onClose}>
      <div style={{ minWidth: 0, maxWidth: '100%' }}>
      {/* 1. La date, en grand */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, padding: 18, background: 'radial-gradient(120% 90% at 100% 0%, rgba(34,211,238,0.35), transparent 55%), linear-gradient(145deg, #0b5f8a 0%, #0b2a4a 100%)', color: '#fff' }}>
        <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', opacity: 0.75 }}>Départ réaliste</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: T.display, fontSize: 40, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.1 }}>{p.departLabel}</div>
          {p.daysLeft != null && <span style={{ fontSize: 13, fontWeight: 800, background: 'rgba(255,255,255,0.16)', padding: '4px 10px', borderRadius: 99 }}>J-{p.daysLeft}</span>}
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.15)', marginTop: 12, overflow: 'hidden' }}><div style={{ height: '100%', width: `${p.pct}%`, background: 'linear-gradient(90deg,#22d3ee,#5fe0a8)' }} /></div>
        <div style={{ display: 'flex', fontSize: 12.5, opacity: 0.8, marginTop: 6, gap: 8 }}><span style={{ flex: 1 }}>{p.pct} % réunis</span><span>{p.totalDa ? `≈ ${(p.totalDa / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M DA` : ''}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 12 }}>
          {[{ l: 'Si tu gardes tout', v: p.departBest }, { l: 'Si tu dépenses plus', v: p.departSlow }].map(z => (
            <div key={z.l} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 10px' }}><div style={{ fontSize: 15, fontWeight: 800 }}>{z.v}</div><div style={{ fontSize: 11.5, opacity: 0.7 }}>{z.l}</div></div>
          ))}
        </div>
      </div>

      {/* 27/11 nuit : la date réaliste compte sur un business pas encore lancé → le dire clairement */}
      {p.biz && <div style={{ ...glass(T.warn), borderRadius: 16, padding: 12, marginTop: 10, fontSize: 13.5, lineHeight: 1.45, display: 'flex', gap: 10 }}>
        <span style={{ flexShrink: 0 }}>⚠️</span>
        <div style={{ minWidth: 0 }}>Cette date compte sur <b>{p.biz.name}</b>{p.biz.partner ? ` avec ${p.biz.partner}` : ''} : <b>{p.biz.clients} clients/mois</b> dès {p.biz.startLabel || 'bientôt'}, soit <b>+{fm(p.biz.perMonth)}/mois</b> pour toi.
          <div style={{ marginTop: 4 }}>Sans ce business : départ <b style={{ color: T.bad }}>{p.biz.noBizLabel}</b>.</div></div>
      </div>}

      {/* 2. Ce qu'il faut faire */}
      {p.perMonth != null && p.perMonth > 0 && <>
        <H>Ce que tu dois faire</H>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
          <div style={card(T.accent)}><div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>Mettre de côté</div><div style={{ fontSize: 20, fontWeight: 800 }}>{fm(p.perMonth)}<span style={{ fontSize: 12, color: T.muted }}> /mois</span></div><div style={{ fontSize: 11.5, color: T.faint }}>{fm(p.perWeek ?? 0)} par semaine</div></div>
          {p.thisMonth ? (() => { const tm = p.thisMonth!, ok = tm.saved >= tm.target; return (
            <div style={card(ok ? T.ok : T.warn)}><div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>Ce mois-ci</div><div style={{ fontSize: 20, fontWeight: 800, color: tm.saved < 0 ? T.bad : ok ? T.ok : T.text }}>{tm.saved < 0 ? '−' : '+'}{fm(Math.abs(tm.saved))}</div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.08)', marginTop: 4 }}><div style={{ height: '100%', width: `${tm.target ? Math.max(0, Math.min(100, tm.saved / tm.target * 100)) : 100}%`, borderRadius: 3, background: ok ? T.ok : T.warn }} /></div>
              <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>{ok ? 'dans les temps ✅' : `prévu ${fm(tm.target)}`}</div></div>); })()
            : p.nextStep && <div style={card(T.violet)}><div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>Prochaine étape</div><div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nextStep.icon} {p.nextStep.name}</div><div style={{ fontSize: 11.5, color: T.faint }}>encore {fm(p.nextStep.missing)}</div></div>}
        </div>
      </>}

      {/* 3. La courbe */}
      <H>Ton épargne, mois par mois</H>
      <PlanChart p={p} real={real} fm={fm} simI={simI} extra={extra} buy={sim.buy} />

      {/* 4. Les étapes, avec leur progression */}
      <H right={<button onClick={() => setEdit(e => !e)} style={{ background: 'none', border: 'none', color: T.accent, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: T.font, padding: 0 }}>{edit ? 'Fermer' : '✏️ Modifier'}</button>}>Les étapes</H>
      {!edit && p.steps.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 30, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: s.done ? tone(T.ok, 0.22) : 'rgba(var(--dz-ink-rgb),0.06)', border: `1px solid ${s.done ? T.ok : T.line}` }}>{s.done ? '✓' : s.icon}</div>
            {i < p.steps.length - 1 && <div style={{ flex: 1, width: 2, background: s.done ? T.ok : T.line, minHeight: 12 }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><b style={{ flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 1.3 }}>{s.name}</b><b style={{ fontSize: 13.5, color: s.done ? T.ok : T.text, flexShrink: 0 }}>{s.done ? 'atteint' : s.label}</b></div>
            <div style={{ height: 5, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.07)', margin: '6px 0 4px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${s.pct}%`, background: s.done ? T.ok : T.accent }} /></div>
            <div style={{ fontSize: 12, color: T.muted }}>{fm(s.cost)} · {s.done ? 'déjà réuni' : `${s.pct} % · au mieux ${s.best}, au pire ${s.slow}`}</div>
          </div>
        </div>
      ))}
      {edit && <div>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 8, lineHeight: 1.4 }}>Ajoute la maison en Belgique, un appartement… L'ordre = l'ordre dans lequel tu veux les réaliser. Montants en euros.</div>
        {list.map((g, i) => (
          <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '46px minmax(0,1fr) 84px 26px 26px', gap: 4, alignItems: 'center', marginBottom: 6 }}>
            <select value={g.icon} onChange={e => setList(l => l.map((x, k) => (k === i ? { ...x, icon: e.target.value } : x)))} style={{ ...inputStyle, padding: 4, minHeight: 44 }}>{[g.icon, ...ICONS.filter(x => x !== g.icon)].map(x => <option key={x}>{x}</option>)}</select>
            <input value={g.name} onChange={e => setList(l => l.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} style={{ ...inputStyle, minHeight: 44, padding: '0 10px', fontSize: 15 }} />
            <input inputMode="decimal" value={g.cost} onChange={e => setList(l => l.map((x, k) => (k === i ? { ...x, cost: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') } : x)))} style={{ ...inputStyle, minHeight: 44, padding: '0 8px', fontSize: 15 }} />
            <button onClick={() => move(i, -1)} aria-label="Monter" style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 16, padding: 0 }}>↑</button>
            <button onClick={() => setList(l => l.filter((_, k) => k !== i))} aria-label="Supprimer" style={{ background: 'none', border: 'none', color: T.bad, cursor: 'pointer', fontSize: 18, padding: 0 }}>×</button>
          </div>
        ))}
        <Btn variant="ghost" onClick={() => setList(l => [...l, { id: Math.random().toString(36).slice(2, 8), name: 'Nouvelle étape', icon: '🎯', cost: '', fixed: undefined }])} style={{ width: '100%', marginBottom: 8 }}>＋ Ajouter une étape</Btn>
        <Btn variant="primary" disabled={busy} onClick={() => void save()} style={{ width: '100%' }}>{busy ? '…' : 'Enregistrer et recalculer'}</Btn>
      </div>}

      {/* 5. Simulateur */}
      <H>Et si…</H>
      <div style={{ ...glass(T.accent), borderRadius: 18, padding: '12px 14px' }}>
        {([['pieces', 'Pièces de snus en plus / jour', 0, 10, 1, ''], ['fik', 'Jours de location FIK en plus / mois', 0, 60, 5, ''], ['cut', 'Dépenses en moins / mois', 0, 800, 50, ' €'], ['buy', 'Un achat maintenant (or, voiture…)', 0, 5000, 100, ' €']] as const).map(([k, l, a, b, st, u]) => (
          <div key={k} style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', fontSize: 13.5, gap: 8 }}><span style={{ flex: 1, minWidth: 0 }}>{l}</span><b style={{ color: sim[k] ? (k === 'buy' ? T.bad : T.ok) : T.muted }}>{sim[k]}{u}</b></div>
            <Slider min={a} max={b} step={st} value={sim[k]} onChange={n => setSim(v => ({ ...v, [k]: n }))} />
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10, fontSize: 14, lineHeight: 1.45 }}>
          {touched ? <>Départ <b>{simLabel}</b>{baseI !== null && simI !== null && baseI > simI ? <> · <b style={{ color: T.ok }}>{baseI - simI} mois plus tôt</b></> : baseI !== null && simI !== null && simI > baseI ? <> · <b style={{ color: T.bad }}>{simI - baseI} mois plus tard</b></> : ' · même mois'}
            {extra > 0 && <div style={{ fontSize: 12.5, color: T.muted }}>+{fm(extra)} par mois en plus</div>}
            <button onClick={() => setSim({ pieces: 0, fik: 0, cut: 0, buy: 0 })} style={{ display: 'block', marginTop: 6, background: 'none', border: 'none', padding: 0, color: T.accent, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: T.font }}>Remettre à zéro</button></>
            : <span style={{ color: T.muted }}>Bouge un curseur : la date et la courbe verte changent tout de suite.</span>}
        </div>
      </div>

      {/* 6. Leviers */}
      <H>Ce qui avance ton départ</H>
      <div style={{ ...glass(T.ok), borderRadius: 18, padding: '2px 14px' }}>
        {p.levers.map((l, i) => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${T.line}` : 'none', fontSize: 13.5 }}>
            <span style={{ flexShrink: 0 }}>{l.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ lineHeight: 1.3 }}>{l.label}</div><div style={{ fontSize: 12, color: T.faint }}>+{fm(l.perMonth)} par mois</div></div>
            <b style={{ color: l.gain ? T.ok : T.muted, flexShrink: 0, whiteSpace: 'nowrap' }}>{l.gain ? `−${l.gain} mois` : '≈ pareil'}</b>
          </div>
        ))}
      </div>

      {/* 7. Où t'améliorer */}
      {p.weak.length > 0 && <><H>Où tu dois t'améliorer</H>
        {p.weak.map((w, i) => <div key={i} style={{ ...glass(T.warn), borderRadius: 14, padding: 12, marginBottom: 8, fontSize: 13.5, lineHeight: 1.45, display: 'flex', gap: 10 }}><span style={{ flexShrink: 0 }}>{w.icon}</span><span style={{ minWidth: 0 }}>{w.text}</span></div>)}
      </>}

      {/* 8. Points de contrôle */}
      <H>Tes points de contrôle</H>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        {p.checkpoints.map(c => { const ok = p.have >= c.need; return <div key={c.label} style={card(ok ? T.ok : T.violet)}><div style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fm(c.need)}</div><div style={{ fontSize: 11.5, color: T.muted }}>en {c.label}{ok ? ' ✅' : ''}</div></div>; })}
      </div>
      <div style={{ fontSize: 12, color: T.faint, marginTop: 6, lineHeight: 1.4 }}>Ce que tu dois avoir à ces dates pour partir en {p.departLabel}.</div>

      {/* 9. Options */}
      <H>{`${p.options.length} idées pour ton départ`}</H>
      {(allOpt ? p.options : p.options.slice(0, 5)).map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>{o.icon}</span>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 800 }}>{o.title}</div><div style={{ fontSize: 13, color: T.muted, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{o.text}</div></div>
        </div>
      ))}
      {p.options.length > 5 && <Btn variant="ghost" onClick={() => setAllOpt(v => !v)} style={{ width: '100%', marginTop: 10 }}>{allOpt ? 'Moins' : `Voir les ${p.options.length - 5} autres idées`}</Btn>}
      </div>
    </Sheet>
  );
}

/** 27/11 soir (Kouider : « quand je bouge le curseur, toute la page bouge ») : curseur maison — le doigt ne fait JAMAIS défiler la page
 *  (touch-action none + capture du pointeur), on peut toucher n'importe où sur la barre, gros bouton facile à attraper. */
function Slider({ min, max, step, value, onChange }: { min: number; max: number; step: number; value: number; onChange: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const pick = (x: number) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const f = Math.min(1, Math.max(0, (x - r.left) / r.width));
    const n = Math.round((min + f * (max - min)) / step) * step;
    if (n !== value) onChange(n);
  };
  const pct = (value - min) / (max - min) * 100;
  return (
    <div ref={ref} role="slider" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); pick(e.clientX); }}
      onPointerMove={e => { if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) { e.preventDefault(); pick(e.clientX); } }}
      onTouchMove={e => e.stopPropagation()}
      style={{ position: 'relative', height: 40, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', cursor: 'pointer' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 17, height: 6, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.12)' }} />
      <div style={{ position: 'absolute', left: 0, width: `${pct}%`, top: 17, height: 6, borderRadius: 3, background: T.accent }} />
      <div style={{ position: 'absolute', left: `calc(${pct}% - ${pct * 0.28}px)`, top: 6, width: 28, height: 28, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }} />
    </div>
  );
}
