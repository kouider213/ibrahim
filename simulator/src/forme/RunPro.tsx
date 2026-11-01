import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { forme, errText, vibrate, type Fitness, type Load, type Challenges, type PlanView, type PlanGoal, type Shoe, type Workout, type PlanStep, type RunType } from './api.ts';
import { F, card, btn, ghostBtn, input, Sheet, Spinner, Chip } from './ui.tsx';

// 🏆 Course « PRO » côté app (01/11, après l'analyse des 20 applis) : forme & prédictions, charge d'entraînement,
// plans guidés (séance pas à pas avec la voix), défis du mois + badges, chaussures, cadence (accéléromètre),
// suivi en direct pour un proche (page publique ?suivi=…).

const fmtPace = (s: number | null | undefined) => { if (!s || !Number.isFinite(s) || s <= 0 || s >= 3600) return '–:––'; const r = Math.round(s); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const fmtDur = (s: number) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const DAYS_S = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const KIND: Record<Workout['kind'], { e: string; c: string }> = { easy: { e: '🙂', c: '#1f9d5c' }, long: { e: '🛣️', c: '#1f63f0' }, tempo: { e: '⚡', c: '#e09a12' }, interval: { e: '🔥', c: '#e5322d' }, walkrun: { e: '🚶‍♂️', c: '#7b5cf0' }, race: { e: '🏁', c: '#17151c' } };

// ───────────── Ma forme : VO2max + prédictions + allures ─────────────
export function FitnessCard({ f }: { f: Fitness | null }) {
  if (!f) return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ fontWeight: 700 }}>🫀 Ma forme</div>
      <div style={{ fontSize: 13.5, color: F.muted, marginTop: 4, lineHeight: 1.45 }}>Fais une course d'au moins 1,6 km : FORME calcule ton VO2max, tes temps prévus sur 5 km / 10 km / semi / marathon et tes allures d'entraînement.</div>
    </div>
  );
  const P = f.paces;
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 74, height: 74, borderRadius: 37, background: 'linear-gradient(135deg,#ff5a1f,#e5322d)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{String(f.vdot).replace('.', ',')}</div><div style={{ fontSize: 9.5, fontWeight: 700, opacity: 0.85 }}>VO2max</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>🫀 Ma forme</div>
          <div style={{ fontSize: 12.5, color: F.muted, marginTop: 2, lineHeight: 1.35 }}>Estimé d'après ton {f.from.label} en {fmtDur(f.from.sec)} ({fmtDay(f.from.date)}). Méthode Jack Daniels, comme Garmin.</div>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: F.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 6px' }}>Si tu courais aujourd'hui</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {f.predictions.map(p => <div key={p.label} style={{ background: F.bg, borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}><div style={{ fontSize: 11, color: F.muted, fontWeight: 700 }}>{p.label}</div><div style={{ fontWeight: 800, fontSize: 14.5, fontVariantNumeric: 'tabular-nums' }}>{fmtDur(p.sec)}</div><div style={{ fontSize: 10, color: F.muted }}>{fmtPace(p.sec / (p.m / 1000))}/km</div></div>)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: F.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 6px' }}>Tes allures d'entraînement</div>
      {([['Facile / footing', P.easy, F.green, 'on peut parler'], ['Marathon', P.marathon, '#1f63f0', 'longues sorties rythmées'], ['Seuil / tempo', P.threshold, F.gold, '20-40 min « confortablement dur »'], ['Fractionné', P.interval, F.red, '3-5 min vite'], ['Vitesse', P.rep, '#7b5cf0', '200-400 m']] as const).map(([l, v, c, sub]) => (
        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: `1px solid ${F.line}` }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: c }} /><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{l}</div><div style={{ fontSize: 11.5, color: F.muted }}>{sub}</div></div>
          <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtPace(v)}<span style={{ fontSize: 11, color: F.muted, fontWeight: 600 }}>/km</span></div>
        </div>
      ))}
    </div>
  );
}

// ───────────── Charge d'entraînement : forme / fatigue / fraîcheur ─────────────
export function LoadCard({ l }: { l: Load }) {
  const s = l.series; if (s.length < 3) return null;
  const W = 340, H = 120, max = Math.max(10, ...s.map(x => Math.max(x.ctl, x.atl))), minT = Math.min(-10, ...s.map(x => x.tsb)), maxT = Math.max(10, ...s.map(x => x.tsb));
  const X = (i: number) => i / (s.length - 1) * W, Y = (v: number) => 8 + (1 - v / max) * (H - 16);
  const path = (k: 'ctl' | 'atl') => s.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('');
  const tsbColor = l.tsb > 3 ? F.green : l.tsb > -10 ? F.accent : l.tsb > -25 ? F.gold : F.red;
  const YT = (v: number) => 4 + (1 - (v - minT) / (maxT - minT)) * 40;
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ fontWeight: 700 }}>📈 Charge d'entraînement <span style={{ color: '#9a95a8', fontWeight: 600 }}>90 jours</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '10px 0' }}>
        <div><div style={{ fontSize: 20, fontWeight: 800, color: F.accent }}>{Math.round(l.ctl)}</div><div style={{ fontSize: 11.5, color: F.muted, fontWeight: 600 }}>Forme (42 j)</div></div>
        <div><div style={{ fontSize: 20, fontWeight: 800, color: '#e5322d' }}>{Math.round(l.atl)}</div><div style={{ fontSize: 11.5, color: F.muted, fontWeight: 600 }}>Fatigue (7 j)</div></div>
        <div><div style={{ fontSize: 20, fontWeight: 800, color: tsbColor }}>{l.tsb > 0 ? '+' : ''}{Math.round(l.tsb)}</div><div style={{ fontSize: 11.5, color: F.muted, fontWeight: 600 }}>Fraîcheur</div></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        <path d={`${path('ctl')}L${W},${H}L0,${H}Z`} fill={F.accent} opacity={0.1} />
        <path d={path('ctl')} fill="none" stroke={F.accent} strokeWidth={2.4} />
        <path d={path('atl')} fill="none" stroke="#e5322d" strokeWidth={1.6} strokeDasharray="3 3" opacity={0.8} />
      </svg>
      <svg viewBox={`0 0 ${W} 48`} style={{ width: '100%', height: 48, display: 'block', marginTop: 4 }}>
        <line x1={0} x2={W} y1={YT(0)} y2={YT(0)} stroke={F.line} />
        {s.map((p, i) => <rect key={p.date} x={X(i) - 1.4} width={2.8} y={Math.min(YT(0), YT(p.tsb))} height={Math.abs(YT(p.tsb) - YT(0)) || 0.5} fill={p.tsb >= 0 ? F.green : F.gold} opacity={0.8} />)}
      </svg>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: tsbColor }}>{l.status}</div>
      {l.warn && <div style={{ fontSize: 13, color: F.red, fontWeight: 600, marginTop: 4 }}>⚠️ {l.warn}</div>}
      <div style={{ fontSize: 11.5, color: F.muted, marginTop: 6, lineHeight: 1.4 }}>Forme = ta charge moyenne sur 6 semaines (elle monte quand tu t'entraînes régulièrement). Fatigue = la dernière semaine. Fraîcheur = forme − fatigue : positive avant une course, négative en période de travail.</div>
    </div>
  );
}

// ───────────── Défis du mois + badges ─────────────
export function ChallengesCard({ c }: { c: Challenges }) {
  const month = new Date(`${c.month}-15T12:00:00Z`).toLocaleDateString('fr-BE', { month: 'long', timeZone: 'UTC' });
  const row = (e: string, l: string, t: Challenges['km'], unit: string) => (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600 }}><span>{e} {l} {t.next} {unit}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{String(t.v).replace('.', ',')} / {t.next}</span></div>
      <div style={{ height: 9, borderRadius: 5, background: F.bg2, overflow: 'hidden', marginTop: 5 }}><motion.div initial={{ width: 0 }} animate={{ width: `${t.pct}%` }} transition={{ duration: 0.8 }} style={{ height: '100%', borderRadius: 5, background: t.pct >= 100 ? F.green : 'linear-gradient(90deg,#ff5a1f,#e09a12)' }} /></div>
      {t.done.length > 0 && <div style={{ fontSize: 11.5, color: F.green, fontWeight: 700, marginTop: 3 }}>✓ {t.done.map(x => `${x} ${unit}`).join(' · ')}</div>}
    </div>
  );
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ fontWeight: 700 }}>🎯 Défis de {month}</div>
      {row('🏃', 'Parcourir', c.km, 'km')}{row('⛰️', 'Grimper', c.elev, 'm')}{row('📅', 'Bouger', c.days, 'jours')}
      <div style={{ fontWeight: 700, margin: '16px 0 8px' }}>🏅 Badges <span style={{ color: '#9a95a8', fontWeight: 600 }}>{c.badges.filter(b => b.ok).length}/{c.badges.length}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {c.badges.map(b => <div key={b.id} style={{ textAlign: 'center', padding: '8px 2px', borderRadius: 12, background: b.ok ? '#fff6e0' : F.bg, opacity: b.ok ? 1 : 0.45, filter: b.ok ? 'none' : 'grayscale(1)' }}><div style={{ fontSize: 24 }}>{b.e}</div><div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, marginTop: 2 }}>{b.l}</div></div>)}
      </div>
    </div>
  );
}

// ───────────── Plans d'entraînement ─────────────
const stepTxt = (s: PlanStep) => `${s.m ? `${s.m >= 1000 ? `${String(s.m / 1000).replace('.', ',')} km` : `${s.m} m`}` : fmtDur(s.sec ?? 0)}${s.pace ? ` à ${fmtPace(s.pace)}/km` : ''}`;
export function PlanCard({ plan, onPlan, onStart, toast }: { plan: PlanView | null; onPlan: (p: PlanView | null) => void; onStart: (w: Workout) => void; toast: (t: string) => void }) {
  const [open, setOpen] = useState(false); const [all, setAll] = useState(false);
  const w = plan?.today && !plan.today.done ? plan.today : plan?.next ?? null;
  return (
    <>
      {!plan ? (
        <button onClick={() => setOpen(true)} style={{ ...card, marginTop: 10, width: '100%', border: 'none', textAlign: 'start', cursor: 'pointer', fontFamily: F.sans, color: F.ink, display: 'flex', gap: 12, alignItems: 'center', background: 'linear-gradient(135deg,#eef3ff,#fff)' }}>
          <div style={{ fontSize: 34 }}>📋</div>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>Plan d'entraînement guidé</div><div style={{ fontSize: 13, color: F.muted, marginTop: 2, lineHeight: 1.4 }}>Débuter, 5 km, 10 km ou semi : séances calées sur tes jours, allures calculées pour toi, la voix te guide pendant la séance.</div></div>
          <span style={{ color: F.accent, fontWeight: 800, fontSize: 20 }}>›</span>
        </button>
      ) : (
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 800 }}>📋 {plan.label}</div>
            <div style={{ fontSize: 12.5, color: F.muted, fontWeight: 600 }}>Semaine {plan.week}/{plan.weeks}</div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: F.bg2, overflow: 'hidden', margin: '8px 0 4px' }}><div style={{ width: `${plan.done / Math.max(1, plan.total) * 100}%`, height: '100%', background: F.green, borderRadius: 4 }} /></div>
          <div style={{ fontSize: 12, color: F.muted }}>{plan.done}/{plan.total} séances faites{plan.missed ? ` · ${plan.missed} manquée${plan.missed > 1 ? 's' : ''}` : ''} · objectif le {fmtDay(plan.race)}</div>
          {w && <div style={{ marginTop: 12, borderRadius: 16, padding: 14, background: `linear-gradient(135deg, ${KIND[w.kind].c}18, #fff)`, border: `1px solid ${KIND[w.kind].c}33` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: KIND[w.kind].c, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{w.date === new Date().toLocaleDateString('sv-SE') ? 'Aujourd\'hui' : `Prochaine · ${fmtDay(w.date)}`}</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{KIND[w.kind].e} {w.title}</div>
            <div style={{ fontSize: 13, color: F.muted, marginTop: 4, lineHeight: 1.4 }}>{w.desc}</div>
            <div style={{ fontSize: 12.5, marginTop: 8, display: 'grid', gap: 2 }}>{w.steps.filter((s, i, a) => i < 5 || i === a.length - 1).map((s, i) => <div key={i}>• {s.label} — <b>{stepTxt(s)}</b></div>)}{w.steps.length > 6 && <div style={{ color: F.muted }}>… {w.steps.length} étapes au total</div>}</div>
            <button onClick={() => onStart(w)} style={{ ...btn, width: '100%', marginTop: 12, background: KIND[w.kind].c }}>▶ Lancer la séance guidée</button>
          </div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setAll(true)} style={{ ...ghostBtn, flex: 1 }}>Tout le plan</button>
            <button onClick={() => setOpen(true)} style={{ ...ghostBtn, flex: 1 }}>Changer de plan</button>
          </div>
        </div>
      )}
      <PlanSheet open={open} onClose={() => setOpen(false)} onPlan={p => { onPlan(p); setOpen(false); }} hasPlan={!!plan} toast={toast} />
      <Sheet open={all} onClose={() => setAll(false)} title={plan?.label ?? 'Plan'}>
        {plan && Array.from({ length: plan.weeks }, (_, k) => k + 1).map(wk => (
          <div key={wk} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 800, margin: '6px 2px' }}>Semaine {wk}{wk === plan.week ? ' · en cours' : ''}{(wk % 4 === 0 && wk !== plan.weeks) ? ' · récup' : ''}</div>
            {plan.workouts.filter(x => x.week === wk).map(x => <div key={x.id} style={{ ...card, padding: 12, marginBottom: 6, display: 'flex', gap: 10, alignItems: 'center', opacity: x.done ? 0.6 : 1 }}>
              <div style={{ fontSize: 22 }}>{x.done ? '✅' : KIND[x.kind].e}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: F.muted }}>{fmtDay(x.date)}</div><div style={{ fontWeight: 700 }}>{x.title}</div><div style={{ fontSize: 12, color: F.muted }}>≈ {String(x.km).replace('.', ',')} km</div></div>
              {!x.done && <button onClick={() => { setAll(false); onStart(x); }} style={{ ...ghostBtn, padding: '8px 12px' }}>▶</button>}
            </div>)}
          </div>
        ))}
        {plan && <button onClick={async () => { if (!confirm('Arrêter ce plan ?')) return; await forme.delPlan(); onPlan(null); setAll(false); }} style={{ ...ghostBtn, width: '100%', color: F.red }}>Arrêter le plan</button>}
      </Sheet>
    </>
  );
}

function PlanSheet({ open, onClose, onPlan, hasPlan, toast }: { open: boolean; onClose: () => void; onPlan: (p: PlanView | null) => void; hasPlan: boolean; toast: (t: string) => void }) {
  const [goal, setGoal] = useState<PlanGoal>('5k'); const [days, setDays] = useState<number[]>([2, 4, 0]); const [weeks, setWeeks] = useState(8); const [busy, setBusy] = useState(false);
  const G: Array<{ id: PlanGoal; e: string; l: string; sub: string; w: number }> = [
    { id: 'start5k', e: '🌱', l: 'Débuter : 0 → 5 km', sub: 'Tu ne cours pas encore : marche/course alternées jusqu\'à 30 min d\'affilée', w: 9 },
    { id: '5k', e: '🎽', l: '5 km plus vite', sub: 'Tu cours déjà : fractionné, tempo, sortie longue', w: 8 },
    { id: '10k', e: '🔟', l: '10 km', sub: 'Endurance + vitesse, 3 à 4 séances par semaine', w: 10 },
    { id: 'semi', e: '🥈', l: 'Semi-marathon', sub: '21,1 km : sorties longues progressives', w: 12 },
  ];
  return (
    <Sheet open={open} onClose={onClose} z={65} title="Mon plan">
      <div style={{ display: 'grid', gap: 8 }}>{G.map(g => <button key={g.id} onClick={() => { setGoal(g.id); setWeeks(g.w); }} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', border: goal === g.id ? `2px solid ${F.accent}` : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start', color: F.ink, padding: 12 }}><span style={{ fontSize: 26 }}>{g.e}</span><div><div style={{ fontWeight: 700 }}>{g.l}</div><div style={{ fontSize: 12.5, color: F.muted }}>{g.sub}</div></div></button>)}</div>
      <div style={{ fontWeight: 700, margin: '16px 2px 8px' }}>Mes jours de course <span style={{ color: F.muted, fontWeight: 600 }}>(2 à 5)</span></div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{[1, 2, 3, 4, 5, 6, 0].map(d => <Chip key={d} on={days.includes(d)} onClick={() => setDays(x => x.includes(d) ? x.filter(y => y !== d) : x.length >= 5 ? x : [...x, d])}>{DAYS_S[d]}</Chip>)}</div>
      <div style={{ fontWeight: 700, margin: '16px 2px 8px' }}>Durée</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{[6, 8, 10, 12, 16].map(w => <Chip key={w} on={weeks === w} onClick={() => setWeeks(w)}>{w} sem.</Chip>)}</div>
      <div style={{ fontSize: 12.5, color: F.muted, marginTop: 12, lineHeight: 1.45 }}>Les allures viennent de tes sorties (VO2max). Une semaine sur 4 est plus légère pour récupérer, la dernière prépare le jour J.{hasPlan ? ' Un nouveau plan remplace l\'actuel.' : ''}</div>
      <button disabled={busy || days.length < 2} onClick={async () => { setBusy(true); try { onPlan((await forme.newPlan({ goal, weeks, days })).plan); toast('📋 Plan créé'); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }} style={{ ...btn, width: '100%', marginTop: 14 }}>{busy ? 'Création…' : 'Créer mon plan'}</button>
    </Sheet>
  );
}

// ───────────── Chaussures ─────────────
export function ShoesSection({ shoes, onShoes, toast }: { shoes: Shoe[]; onShoes: (s: Shoe[]) => void; toast: (t: string) => void }) {
  const [name, setName] = useState('');
  const act = async (b: Parameters<typeof forme.shoe>[0]) => { try { onShoes((await forme.shoe(b)).shoes); } catch (e) { toast(errText(e)); } };
  return (
    <>
      <div style={{ fontWeight: 800, margin: '18px 2px 8px' }}>👟 Mes chaussures</div>
      <div style={{ ...card, padding: '6px 14px' }}>
        {shoes.map(s => <div key={s.id} style={{ padding: '10px 0', borderBottom: `1px solid ${F.line}`, opacity: s.retired ? 0.5 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, fontWeight: 700 }}>{s.name}{s.retired ? ' (retraite)' : ''}</div><div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{String(s.km).replace('.', ',')} / {s.maxKm} km</div></div>
          <div style={{ height: 7, borderRadius: 4, background: F.bg2, overflow: 'hidden', margin: '6px 0' }}><div style={{ width: `${s.pct}%`, height: '100%', background: s.pct >= 90 ? F.red : s.pct >= 70 ? F.gold : F.green }} /></div>
          {s.pct >= 90 && !s.retired && <div style={{ fontSize: 12, color: F.red, fontWeight: 600 }}>Usées : pense à les changer (risque de blessure).</div>}
          <div style={{ display: 'flex', gap: 6 }}><button onClick={() => void act({ action: 'retire', id: s.id })} style={{ ...ghostBtn, padding: '6px 10px', fontSize: 12.5 }}>{s.retired ? 'Réactiver' : 'Mettre à la retraite'}</button><button onClick={() => { if (confirm('Supprimer ?')) void act({ action: 'delete', id: s.id }); }} style={{ ...ghostBtn, padding: '6px 10px', fontSize: 12.5, color: F.red }}>Supprimer</button></div>
        </div>)}
        <div style={{ display: 'flex', gap: 8, padding: '10px 0' }}><input value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Nike Pegasus 41" style={{ ...input, padding: '10px 12px' }} /><button disabled={!name.trim()} onClick={() => { void act({ action: 'add', name, maxKm: 700 }); setName(''); }} style={{ ...btn, padding: '10px 16px' }}>Ajouter</button></div>
      </div>
      <div style={{ fontSize: 12, color: F.muted, marginTop: 6 }}>Une chaussure de course dure ~600-800 km. FORME compte les km de chaque paire.</div>
    </>
  );
}

// ───────────── Cadence (pas/min) via l'accéléromètre ─────────────
export async function askMotion(): Promise<boolean> {
  try {
    const D = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    if (D?.requestPermission) return (await D.requestPermission()) === 'granted';
    return typeof window.DeviceMotionEvent !== 'undefined';
  } catch { return false; }
}
export function useCadence(active: boolean) {
  const steps = useRef<number[]>([]); const total = useRef(0);
  const [live, setLive] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let avg = 9.8, last = 0, above = false;
    const h = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity; if (!a || a.x == null || a.y == null || a.z == null) return;
      const m = Math.hypot(a.x, a.y, a.z); avg = avg * 0.98 + m * 0.02;
      const now = performance.now();
      if (!above && m > avg + 2.2 && now - last > 240) { above = true; last = now; total.current++; steps.current.push(now); }
      else if (above && m < avg + 0.5) above = false;
    };
    window.addEventListener('devicemotion', h);
    const t = setInterval(() => { const now = performance.now(); steps.current = steps.current.filter(x => now - x < 20000); setLive(steps.current.length >= 10 ? Math.round(steps.current.length * 3) : null); }, 2000);
    return () => { window.removeEventListener('devicemotion', h); clearInterval(t); };
  }, [active]);
  return { live, total };
}

// ───────────── Séance guidée : moteur des étapes ─────────────
export interface StepState { i: number; startD: number; startT: number; done: boolean }
export const STEP_E: Record<PlanStep['kind'], string> = { warm: '🔥 Échauffement', run: '🏃 Effort', rec: '😮‍💨 Récupération', cool: '🧘 Retour au calme', walk: '🚶 Marche' };
export function stepProgress(s: PlanStep, st: StepState, d: number, mov: number) {
  if (s.m) { const left = s.m - (d - st.startD); return { left: Math.max(0, left), pct: Math.min(1, (d - st.startD) / s.m), txt: left >= 1000 ? `${(left / 1000).toFixed(2).replace('.', ',')} km` : `${Math.max(0, Math.round(left))} m` }; }
  const left = (s.sec ?? 0) - (mov - st.startT); return { left: Math.max(0, left), pct: Math.min(1, (mov - st.startT) / Math.max(1, s.sec ?? 1)), txt: fmtDur(Math.max(0, left)) };
}
export const sayStep = (s: PlanStep, n: number, total: number) => `${s.label}. ${s.m ? (s.m >= 1000 ? `${String(s.m / 1000).replace('.', ' virgule ')} kilomètre${s.m >= 2000 ? 's' : ''}` : `${s.m} mètres`) : `${Math.round((s.sec ?? 0) / 60) || 1} minute${(s.sec ?? 0) >= 120 ? 's' : ''}`}${s.pace ? `, allure ${Math.floor(s.pace / 60)} minutes ${Math.round(s.pace % 60)}` : ''}.${n === total - 1 ? ' Dernière étape !' : ''}`;

// ───────────── Suivi en direct : page publique pour un proche ─────────────
export function LiveViewer({ token }: { token: string }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof forme.livePublic>> | null>(null); const [err, setErr] = useState('');
  const el = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null); const line = useRef<L.Polyline | null>(null); const me = useRef<L.Marker | null>(null); const fitted = useRef(false);
  useEffect(() => {
    const load = () => forme.livePublic(token).then(x => { setD(x); setErr(''); }).catch(e => setErr(/404/.test(String(e)) ? 'Ce suivi est terminé ou le lien n\'est plus valable.' : errText(e)));
    void load(); const t = setInterval(load, 15000); return () => clearInterval(t);
  }, [token]);
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false }); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(m); m.attributionControl.setPrefix(false); m.setView([50.85, 4.35], 13); map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current; if (!m || !d || !d.pts.length) return;
    const ll = d.pts.map(p => [p[0], p[1]] as L.LatLngTuple);
    if (!line.current) line.current = L.polyline(ll, { color: '#ff5a1f', weight: 6 }).addTo(m); else line.current.setLatLngs(ll);
    const last = ll[ll.length - 1]!;
    const icon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: `<div style="width:22px;height:22px;border-radius:50%;background:#1f63f0;border:4px solid #fff;box-shadow:0 0 0 6px rgba(31,99,240,.25)"></div>` });
    if (!me.current) me.current = L.marker(last, { icon }).addTo(m); else me.current.setLatLng(last);
    if (!fitted.current) { m.fitBounds(L.latLngBounds(ll), { padding: [40, 40], maxZoom: 16 }); fitted.current = true; } else m.panTo(last);
  }, [d]);
  const ago = d ? Math.round((Date.now() - d.at) / 1000) : 0;
  const box: CSSProperties = { position: 'absolute', left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))', zIndex: 600, ...card };
  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: F.sans, color: F.ink, background: F.bg }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div style={box}>
        {err ? <div style={{ fontWeight: 700, color: F.red }}>{err}</div> : !d ? <Spinner /> : <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: d.ended ? F.muted : F.green, boxShadow: d.ended ? 'none' : `0 0 0 4px ${F.green}33` }} /><div style={{ fontWeight: 800, flex: 1 }}>{d.ended ? `${d.name} a terminé` : `${d.name} est en sortie`}</div><div style={{ fontSize: 12, color: F.muted }}>{ago < 60 ? `il y a ${ago} s` : `il y a ${Math.round(ago / 60)} min`}</div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
            <div><div style={{ fontSize: 22, fontWeight: 800 }}>{(d.dist / 1000).toFixed(2).replace('.', ',')}</div><div style={{ fontSize: 11.5, color: F.muted }}>km</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtDur(d.moving)}</div><div style={{ fontSize: 11.5, color: F.muted }}>temps</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800 }}>{d.dist > 100 ? fmtPace(d.moving / (d.dist / 1000)) : '–:––'}</div><div style={{ fontSize: 11.5, color: F.muted }}>/km</div></div>
          </div>
          <div style={{ fontSize: 11.5, color: F.muted, marginTop: 8 }}>📍 Suivi en direct FORME · mis à jour toutes les 15 s · départ {new Date(d.startedAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</div>
        </>}
      </div>
    </div>
  );
}

export const SHARE_K = 'forme:run:share';
export const getShareLive = () => { try { return localStorage.getItem(SHARE_K) === '1'; } catch { return false; } };
export function shareLiveLink(link: string, toast: (t: string) => void) {
  vibrate(20);
  const text = '📍 Suis ma sortie en direct sur la carte :';
  if (navigator.share) void navigator.share({ title: 'Suivi en direct', text, url: link }).catch(() => {});
  else void navigator.clipboard?.writeText(link).then(() => toast('Lien copié')).catch(() => toast(link));
}
export type { RunType };
