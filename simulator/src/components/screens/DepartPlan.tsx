import { useEffect, useRef, useState } from 'react';
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

function PlanSheet({ plan: p, onClose, onChange, real, fm }: { plan: Plan; onClose: () => void; onChange: (p: Plan) => void; real: Array<{ ym: string; v: number }>; fm: Fm }) {
  const [sim, setSim] = useState({ pieces: 0, fik: 0, cut: 0, buy: 0 });
  // 27/11 nuit : la VRAIE marge du snus et de FIK (avant : 2,25 € figé dans l'app ≠ serveur) + « et si j'achète un truc à X € ? »
  const marge = p.marge ?? 2.25, fikDay = p.fikDay ?? 8, extra = sim.pieces * marge * 26 + sim.fik * fikDay + sim.cut;
  const simI = reach(p.monthly ?? [], p.total + sim.buy, extra), baseI = reach(p.monthly ?? [], p.total, 0);
  const touched = extra > 0 || sim.buy > 0;
  const simLabel = simI === null ? 'pas avant 15 ans' : (() => { const ym = ymAdd(p.now, simI); return `${MOISL[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`; })();
  const [step, setStep] = useState('');
  const [edit, setEdit] = useState(false);
  const [list, setList] = useState(p.steps.map(s => ({ id: s.id, name: s.name, icon: s.icon, cost: String(s.cost), fixed: s.fixed })));
  const [busy, setBusy] = useState(false);
  const mx = Math.max(1, p.total, ...p.curve.map(c => c.v));
  const save = async () => {
    setBusy(true);
    try { onChange(await apiFetch<Plan>('/api/mon-argent/goals', { method: 'POST', body: JSON.stringify({ goals: list.map(g => ({ ...g, cost: Number(g.cost) })) }) })); setEdit(false); }
    finally { setBusy(false); }
  };
  const move = (i: number, d: -1 | 1) => setList(l => { const c = [...l]; const j = i + d; if (j < 0 || j >= c.length) return c; [c[i], c[j]] = [c[j]!, c[i]!]; return c; });
  const H = ({ children }: { children: string }) => <div style={{ fontSize: 12.5, color: T.muted, fontWeight: 800, letterSpacing: '0.04em', margin: '18px 0 8px' }}>{children.toUpperCase()}</div>;

  return (
    <Sheet title="🇩🇿 Ton plan de départ" subtitle={`Départ potentiel : ${p.departLabel}`} onClose={onClose}>
      {/* 3 scénarios */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        {[{ l: 'Tu gardes tout', v: p.departBest, c: T.ok }, { l: 'Réaliste', v: p.departLabel, c: T.accent }, { l: 'Tu dépenses plus', v: p.departSlow, c: T.warn }].map(x => (
          <div key={x.l} style={{ ...glass(x.c), borderRadius: 14, padding: 10 }}><div style={{ fontSize: 15, fontWeight: 800 }}>{x.v}</div><div style={{ fontSize: 11.5, color: T.muted }}>{x.l}</div></div>
        ))}
      </div>

      {/* Simulateur « et si… » */}
      <H>Et si… (simulateur)</H>
      {([['pieces', 'pièces de snus en plus / jour', 0, 10, 1], ['fik', 'jours de location FIK en plus / mois', 0, 60, 5], ['cut', '€ de dépenses en moins / mois', 0, 800, 50], ['buy', '€ d\'un achat maintenant (or, voiture, voyage…)', 0, 5000, 100]] as const).map(([k, l, a, b, st]) => (
        <div key={k} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', fontSize: 13.5 }}><span style={{ flex: 1 }}>{l}</span><b>{sim[k]}</b></div>
          <Slider min={a} max={b} step={st} value={sim[k]} onChange={n => setSim(v => ({ ...v, [k]: n }))} />
        </div>
      ))}
      <div style={{ ...glass(extra ? T.ok : T.accent), borderRadius: 14, padding: 12, fontSize: 14 }}>
        {touched ? <>{extra ? `+${fm(extra)}/mois` : ''}{extra && sim.buy ? ' et ' : ''}{sim.buy ? `un achat de ${fm(sim.buy)}` : ''} → départ <b>{simLabel}</b>
          {baseI !== null && simI !== null && baseI > simI ? <> (<b style={{ color: T.ok }}>{baseI - simI} mois plus tôt</b>)</> : baseI !== null && simI !== null && simI > baseI ? <> (<b style={{ color: T.bad }}>{simI - baseI} mois plus tard</b>)</> : ' (même mois)'}</>
          : 'Bouge un curseur pour voir ta nouvelle date de départ.'}
        {touched && <button onClick={() => setSim({ pieces: 0, fik: 0, cut: 0, buy: 0 })} style={{ display: 'block', marginTop: 6, background: 'none', border: 'none', padding: 0, color: T.accent, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: T.font }}>Remettre à zéro</button>}
      </div>

      {/* Courbe de l'épargne vs objectif */}
      <H>Ton épargne prévue (réaliste)</H>
      <div style={{ position: 'relative', height: 110, display: 'flex', alignItems: 'flex-end', gap: 2, marginTop: 18 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${p.total / mx * 100}%`, borderTop: `1px dashed ${T.warn}` }}><span style={{ position: 'absolute', left: 0, top: -17, fontSize: 10.5, fontWeight: 700, color: T.warn, background: 'var(--dz-bg)', padding: '0 4px', borderRadius: 4 }}>objectif départ {fm(p.total)}</span></div>
        {p.curve.map(c => <div key={c.ym} title={`${c.ym} : ${fm(c.v)}`} style={{ flex: 1, height: `${Math.max(2, c.v / mx * 100)}%`, background: c.v >= p.total ? T.ok : tone(T.accent, 0.6), borderRadius: 2 }} />)}
      </div>
      {/* 27/11 nuit : les années sous les barres (avant : aucune date, on ne savait pas où on était) */}
      <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>{p.curve.map((c, i) => <span key={c.ym} style={{ flex: 1, fontSize: 9.5, color: T.faint, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'visible' }}>{i && c.ym.slice(5, 7) <= '03' && p.curve[i - 1]!.ym.slice(0, 4) !== c.ym.slice(0, 4) ? c.ym.slice(0, 4) : ''}</span>)}</div>
      {real.length > 1 && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>Réel (fin de chaque mois) : {real.map(r => `${MOISL[+r.ym.slice(5, 7) - 1]} ${fm(r.v)}`).join(' · ')}</div>}
      {p.totalDa ? <div style={{ fontSize: 12, color: T.faint, marginTop: 4 }}>Objectif total {fm(p.total)} ≈ {(p.totalDa / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M DA au taux d'aujourd'hui</div> : null}

      {/* Étapes cliquables */}
      <H>Les étapes</H>
      {p.steps.map(s => (
        <div key={s.id} onClick={() => setStep(x => (x === s.id ? '' : s.id))} style={{ ...glass(s.done ? T.ok : T.accent), borderRadius: 14, padding: 12, marginBottom: 8, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{s.icon}</span><b style={{ flex: 1, fontSize: 14 }}>{s.name}</b>{s.done ? <Badge color={T.ok}>atteint</Badge> : <b style={{ fontSize: 14 }}>{s.label}</b>}</div>
          {step === s.id && <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginTop: 8 }}>
            Coût : <b style={{ color: T.text }}>{fm(s.cost)}</b> · total cumulé à réunir : <b style={{ color: T.text }}>{fm(s.cumul)}</b><br />
            Tu en as {s.pct} %. Au mieux : {s.best} · réaliste : {s.label} · si tu dépenses plus : {s.slow}.
          </div>}
        </div>
      ))}
      <Btn variant="ghost" onClick={() => setEdit(e => !e)} style={{ width: '100%' }}>{edit ? 'Fermer' : '✏️ Ajouter / modifier mes étapes (maison en Belgique, appartement…)'}</Btn>
      {edit && <div style={{ marginTop: 10 }}>
        {list.map((g, i) => (
          <div key={g.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <select value={g.icon} onChange={e => setList(l => l.map((x, k) => (k === i ? { ...x, icon: e.target.value } : x)))} style={{ ...inputStyle, width: 52, padding: 6 }}>{[g.icon, ...ICONS.filter(x => x !== g.icon)].map(x => <option key={x}>{x}</option>)}</select>
            <input value={g.name} onChange={e => setList(l => l.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} style={{ ...inputStyle, flex: 1 }} />
            <input inputMode="decimal" value={g.cost} onChange={e => setList(l => l.map((x, k) => (k === i ? { ...x, cost: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') } : x)))} style={{ ...inputStyle, width: 90 }} />
            <button onClick={() => move(i, -1)} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 16 }}>↑</button>
            <button onClick={() => setList(l => l.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', color: T.bad, cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        ))}
        <Btn variant="ghost" onClick={() => setList(l => [...l, { id: Math.random().toString(36).slice(2, 8), name: 'Nouvelle étape', icon: '🎯', cost: '', fixed: undefined }])} style={{ width: '100%', marginBottom: 8 }}>＋ Ajouter une étape</Btn>
        <Field label="" hint="L'ordre = l'ordre dans lequel tu veux les réaliser. Montants en euros."><Btn variant="primary" disabled={busy} onClick={() => void save()} style={{ width: '100%' }}>{busy ? '…' : 'Enregistrer et recalculer'}</Btn></Field>
      </div>}

      {/* Leviers */}
      <H>Ce qui avance ton départ</H>
      {p.levers.map(l => (
        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
          <span>{l.icon}</span><span style={{ flex: 1 }}>{l.label} <span style={{ color: T.faint }}>(+{fm(l.perMonth)}/mois)</span></span>
          <b style={{ color: l.gain ? T.ok : T.muted }}>{l.gain ? `−${l.gain} mois` : '≈ pareil'}</b>
        </div>
      ))}

      {/* Où t'améliorer */}
      {p.weak.length > 0 && <><H>Où tu dois t'améliorer</H>
        {p.weak.map((w, i) => <div key={i} style={{ ...glass(T.warn), borderRadius: 14, padding: 12, marginBottom: 8, fontSize: 13.5, lineHeight: 1.45, display: 'flex', gap: 10 }}><span>{w.icon}</span><span>{w.text}</span></div>)}
      </>}

      {/* Points de contrôle */}
      <H>Tes points de contrôle</H>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        {p.checkpoints.map(c => <div key={c.label} style={{ ...glass(T.violet), borderRadius: 14, padding: 10 }}><div style={{ fontSize: 15, fontWeight: 800 }}>{fm(c.need)}</div><div style={{ fontSize: 11.5, color: T.muted }}>en {c.label}</div></div>)}
      </div>

      {/* 20 options */}
      <H>{`${p.options.length} options pour ton départ`}</H>
      {p.options.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 20 }}>{o.icon}</span>
          <div><div style={{ fontSize: 14, fontWeight: 800 }}>{o.title}</div><div style={{ fontSize: 13, color: T.muted, lineHeight: 1.45 }}>{o.text}</div></div>
        </div>
      ))}
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
