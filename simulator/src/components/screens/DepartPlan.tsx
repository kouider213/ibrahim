import { useEffect, useState } from 'react';
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
      <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 2 }}>{p.departLabel}</div>
      <div style={{ fontSize: 12.5, color: T.muted }}>entre {p.departBest} (tu gardes tout) et {p.departSlow} (tu dépenses plus)</div>
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
      {p.next && <div style={{ fontSize: 12.5, marginTop: 8, color: p.next.missing ? T.warn : T.ok }}>📍 Prochain point : {fm(p.next.need)} en {p.next.label}{p.next.missing ? ` — il manque ${fm(p.next.missing)}` : ' — tu es dans les temps ✅'}</div>}
    </div>
    {open && <PlanSheet plan={p} onClose={() => setOpen(false)} onChange={setP} real={real} fm={fm} />}
  </>);
}

function PlanSheet({ plan: p, onClose, onChange, real, fm }: { plan: Plan; onClose: () => void; onChange: (p: Plan) => void; real: Array<{ ym: string; v: number }>; fm: Fm }) {
  const [sim, setSim] = useState({ pieces: 0, fik: 0, cut: 0 });
  const marge = 2.25, extra = sim.pieces * marge * 26 + sim.fik * 8 + sim.cut;
  const simI = reach(p.monthly ?? [], p.total, extra), baseI = reach(p.monthly ?? [], p.total, 0);
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
      {([['pieces', 'pièces de snus en plus / jour', 0, 10, 1], ['fik', 'jours de location FIK en plus / mois', 0, 60, 5], ['cut', '€ de dépenses en moins / mois', 0, 800, 50]] as const).map(([k, l, a, b, st]) => (
        <div key={k} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', fontSize: 13.5 }}><span style={{ flex: 1 }}>{l}</span><b>{sim[k]}</b></div>
          <input type="range" min={a} max={b} step={st} value={sim[k]} onChange={e => setSim(v => ({ ...v, [k]: Number(e.target.value) }))} style={{ width: '100%' }} />
        </div>
      ))}
      <div style={{ ...glass(extra ? T.ok : T.accent), borderRadius: 14, padding: 12, fontSize: 14 }}>
        {extra ? <>+{fm(extra)}/mois → départ <b>{simLabel}</b>{baseI !== null && simI !== null && baseI > simI ? <> (<b style={{ color: T.ok }}>{baseI - simI} mois plus tôt</b>)</> : ''}</> : 'Bouge un curseur pour voir ta nouvelle date de départ.'}
      </div>

      {/* Courbe de l'épargne vs objectif */}
      <H>Ton épargne prévue (réaliste)</H>
      <div style={{ position: 'relative', height: 110, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${p.total / mx * 100}%`, borderTop: `1px dashed ${T.warn}` }}><span style={{ position: 'absolute', right: 0, top: -16, fontSize: 10.5, color: T.warn }}>départ {fm(p.total)}</span></div>
        {p.curve.map(c => <div key={c.ym} title={`${c.ym} : ${fm(c.v)}`} style={{ flex: 1, height: `${Math.max(2, c.v / mx * 100)}%`, background: c.v >= p.total ? T.ok : tone(T.accent, 0.6), borderRadius: 2 }} />)}
      </div>
      {real.length > 1 && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>Réel (fin de chaque mois) : {real.map(r => `${MOISL[+r.ym.slice(5, 7) - 1]} ${fm(r.v)}`).join(' · ')}</div>}
      <div style={{ display: 'flex', fontSize: 11, color: T.faint, marginTop: 4 }}><span style={{ flex: 1 }}>maintenant</span><span>{p.curve[p.curve.length - 1]?.ym.slice(0, 4)}</span></div>

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
            <input inputMode="decimal" value={g.cost} onChange={e => setList(l => l.map((x, k) => (k === i ? { ...x, cost: e.target.value.replace(/[^\d.]/g, '') } : x)))} style={{ ...inputStyle, width: 90 }} />
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
