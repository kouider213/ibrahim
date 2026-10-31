import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, type SportOverview, type SportSession, type SportExercise } from '../services/api.ts';
import { errText, SHORT_DAYS, dayOf, vibrate, forme, type ProgramView } from './api.ts';
import { F, card, btn, ghostBtn, Spinner } from './ui.tsx';
import { ExerciseSheet, Anim, RecoveryMap } from './Exercises.tsx';

// Onglet SÉANCE — 31/10 refait façon applis pro de muscu (Hevy / Strong / Fitbod) : semaine en pastilles, carte du jour
// avec les exercices en images, carte de récupération du corps, stats, records, historique ; mode séance en direct
// avec tableau SÉRIE | PRÉCÉDENT | KG | REPS | ✓, chrono, minuteur de repos en bas, résumé de fin (durée, volume, records).
// Les séances viennent de sport-coach.ts (calées sur son agenda) ; sa femme : son programme (ProgramSport).
const MUSCLE: Record<string, string> = { pecs: 'Pecs', dos: 'Dos', epaules: 'Épaules', bras: 'Bras', jambes: 'Jambes', abdos: 'Abdos', cardio: 'Cardio' };
const H2 = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '24px 2px 10px' }}><div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' }}>{children}</div>{right}</div>
);
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const thumb: CSSProperties = { width: 64, height: 64, borderRadius: 14, background: F.tile, flexShrink: 0, display: 'flex', alignItems: 'center', overflow: 'hidden', padding: 4, boxSizing: 'border-box' };

export function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch { /* */ }
}

/** Raccourcis vers le scanner et la bibliothèque. */
function Shortcuts({ go }: { go?: (t: 'library' | 'scan') => void }) {
  if (!go) return null;
  const b = (t: 'library' | 'scan', e: string, l: string, sub: string) => (
    <button onClick={() => go(t)} style={{ ...card, flex: 1, border: 'none', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink, padding: 14 }}>
      <div style={{ fontSize: 22 }}>{e}</div><div style={{ fontWeight: 700, marginTop: 6, fontSize: 14.5 }}>{l}</div><div style={{ fontSize: 12, color: F.muted, marginTop: 2 }}>{sub}</div>
    </button>
  );
  return <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>{b('scan', '📷', 'Scanner une machine', 'Les exercices en images')}{b('library', '📚', 'Bibliothèque', '800 exercices')}</div>;
}

/** Une ligne d'exercice (image sur tuile + nom + séries). */
function ExRow({ e, onClick, sub }: { e: SportExercise; onClick: () => void; sub?: string }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', width: '100%', border: 'none', background: 'none', textAlign: 'start', cursor: 'pointer', fontFamily: 'inherit', color: F.ink }}>
      <div style={thumb}>{e.demo.length ? <Anim img={e.demo} alt={e.name} h={56} /> : <span style={{ margin: 'auto', fontSize: 24 }}>🏋️</span>}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{e.name}</div>
        <div style={{ fontSize: 12.5, color: F.muted, marginTop: 2 }}>{sub ?? `${e.sets} séries × ${e.reps}${e.suggestion.kg != null ? ` · ${e.suggestion.kg} kg${e.suggestion.up ? ' ↑' : ''}` : ''}`}</div>
      </div>
      <span style={{ color: '#b5b0c0', fontSize: 20 }}>›</span>
    </button>
  );
}

/** Carte de la séance du jour : titre, durée, exercices en images, bouton Démarrer. */
function SessionCard({ s, kicker, onStart, onEx, start }: { s: SportSession; kicker: string; onStart: () => void; onEx: (e: SportExercise) => void; start: string }) {
  const custom = (s as { custom?: string }).custom, finisher = (s as { finisher?: string | null }).finisher, deload = (s as SportSession & { deload?: boolean }).deload;
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: 14 }}>
      <div style={{ padding: '16px 16px 6px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: F.accent, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{kicker}</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>{s.label}</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 13, color: F.muted, marginTop: 6, flexWrap: 'wrap' }}>
          <span>⏱ ~{s.estMin} min</span><span>🏋️ {s.exercises.length} exercices</span><span>🎯 {s.focus}</span>{deload && <span>🪶 semaine allégée</span>}
        </div>
        {custom && <div style={{ fontSize: 13, background: F.soft, color: F.accent, borderRadius: 12, padding: '8px 10px', marginTop: 10 }}>Sur mesure : {custom}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 16px 4px', scrollbarWidth: 'none' }}>
        {s.exercises.map(e => (
          <button key={e.id} onClick={() => onEx(e)} style={{ ...thumb, width: 78, height: 78, border: 'none', cursor: 'pointer' }}>{e.demo.length ? <Anim img={e.demo} alt={e.name} h={70} /> : <span style={{ margin: 'auto' }}>🏋️</span>}</button>
        ))}
      </div>
      <div style={{ padding: '6px 16px 0', fontSize: 12.5, color: F.muted }}>🔥 Échauffement : {s.warmup}{finisher ? ` · Fin : ${finisher}` : ''}</div>
      <div style={{ padding: 16 }}><button onClick={onStart} style={{ ...btn, width: '100%' }}>{start}</button></div>
    </div>
  );
}

// ── Mode séance en direct ─────────────────────────────────────────────────────
type SetRow = { kg: string; reps: string; done: boolean };
type SaveFn = (sets: Array<{ ex: string; kg?: number; reps?: number }>, durationMin: number, rpe: number) => Promise<string>;

/** « 3×10/10/8 à 40 kg (28/10) » → précédent de la série k : « 40 × 10 ». */
function prevOf(last: string | undefined, k: number): string {
  const m = /×([\d?/]+) à ([\d.,]+) kg/.exec(last ?? '');
  if (!m) return '—';
  const reps = m[1]!.split('/');
  return `${m[2]} × ${reps[k] ?? reps[reps.length - 1] ?? '?'}`;
}

function RestBar({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const end = useRef(Date.now() + seconds * 1000);
  const total = useRef(seconds);
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      setLeft(l);
      if (l <= 3 && l > 0) vibrate(40);
      if (l === 0) { clearInterval(t); beep(); vibrate(400); onDone(); }
    }, 250);
    return () => clearInterval(t);
  }, [onDone]);
  const add = (d: number) => { end.current += d * 1000; total.current = Math.max(5, total.current + d); setLeft(Math.max(0, Math.ceil((end.current - Date.now()) / 1000))); };
  const small: CSSProperties = { border: 'none', borderRadius: 10, padding: '9px 12px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' };
  return (
    <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 62, background: F.dark, color: '#fff', padding: '0 16px calc(12px + env(safe-area-inset-bottom))' }}>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.12)', margin: '0 -16px 12px' }}><div style={{ height: '100%', width: `${(left / total.current) * 100}%`, background: F.accent2, transition: 'width .25s linear' }} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 11.5, opacity: 0.6, fontWeight: 600 }}>REPOS</div><div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(left)}</div></div>
        <button onClick={() => add(-15)} style={{ ...small, background: 'rgba(255,255,255,0.12)', color: '#fff' }}>−15</button>
        <button onClick={() => add(15)} style={{ ...small, background: 'rgba(255,255,255,0.12)', color: '#fff' }}>+15</button>
        <button onClick={onDone} style={{ ...small, background: F.accent, color: '#fff' }}>Passer</button>
      </div>
    </motion.div>
  );
}

function Player({ s, onClose, onFinished, save: saveFn }: { s: SportSession; onClose: () => void; onFinished: (msg: string) => void; save: SaveFn }) {
  const [i, setI] = useState(0);
  const [how, setHow] = useState(false);
  const [rows, setRows] = useState<Record<string, SetRow[]>>(() => Object.fromEntries(s.exercises.map(e => [e.id, Array.from({ length: e.sets }, () => ({ kg: e.suggestion.kg ? String(e.suggestion.kg) : '', reps: String(parseInt(e.reps) || ''), done: false }))])));
  const [rest, setRest] = useState<{ n: number; key: number } | null>(null);
  const [finish, setFinish] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [busy, setBusy] = useState(false);
  const start = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ex = s.exercises[i]!;
  const sets = rows[ex.id]!;
  const upd = (k: number, patch: Partial<SetRow>) => setRows(r => ({ ...r, [ex.id]: r[ex.id]!.map((x, j) => j === k ? { ...x, ...patch } : x) }));
  const endRest = useCallback(() => setRest(null), []);
  const validate = (k: number) => {
    vibrate(25);
    setRows(r => ({ ...r, [ex.id]: r[ex.id]!.map((x, j) => j === k ? { ...x, done: true } : j === k + 1 && !x.done ? { ...x, kg: x.kg || r[ex.id]![k]!.kg } : x) }));
    const last = sets.every((x, j) => j === k || x.done);
    if (last && i < s.exercises.length - 1) setTimeout(() => setI(i + 1), 450);
    if (!(last && i === s.exercises.length - 1)) setRest({ n: ex.rest, key: Date.now() });
  };
  const all = Object.values(rows).flat();
  const doneSets = all.filter(r => r.done);
  const volume = s.exercises.reduce((a, e) => a + rows[e.id]!.filter(r => r.done).reduce((b, r) => b + (Number(r.kg) || 0) * (Number(r.reps) || 0), 0), 0);
  const elapsed = Math.round((now - start.current) / 1000);
  const save = async () => {
    setBusy(true);
    try {
      const out = s.exercises.flatMap(e => rows[e.id]!.filter(r => r.done).map(r => ({ ex: e.id, kg: Number(r.kg) || undefined, reps: Number(r.reps) || undefined })));
      onFinished(await saveFn(out, Math.round(elapsed / 60), rpe));
    } catch (e) { alert(errText(e)); } finally { setBusy(false); }
  };
  const cell: CSSProperties = { background: F.bg, border: 'none', borderRadius: 9, padding: '9px 4px', fontSize: 16, fontWeight: 600, width: '100%', boxSizing: 'border-box', fontFamily: F.sans, textAlign: 'center', color: F.ink };
  const cols = '34px 1fr 64px 56px 42px';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: F.bg, overflowY: 'auto', fontFamily: F.sans, color: F.ink, paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'rgba(245,242,250,0.94)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', padding: 'calc(8px + env(safe-area-inset-top)) 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => { if (finish) setFinish(false); else if (confirm('Quitter la séance ? (rien n\'est enregistré)')) onClose(); }} aria-label="Fermer" style={{ width: 36, height: 36, border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: F.ink }}>{finish ? '‹' : '✕'}</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{s.label}</div>
          <div style={{ fontSize: 12.5, color: F.muted, fontVariantNumeric: 'tabular-nums' }}>⏱ {fmtTime(elapsed)} · {doneSets.length}/{all.length} séries · {Math.round(volume)} kg</div>
        </div>
        {!finish && <button onClick={() => { setRest(null); setFinish(true); }} style={{ ...btn, padding: '9px 16px', fontSize: 14, boxShadow: 'none' }}>Terminer</button>}
      </div>
      {finish ? (
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ fontSize: 64 }}>🏆</motion.div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>Bien joué !</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 18 }}>
            {[[fmtTime(elapsed), 'Durée'], [`${Math.round(volume)} kg`, 'Volume'], [String(doneSets.length), 'Séries']].map(([v, l]) => <div key={l} style={{ ...card, padding: 12 }}><div style={{ fontSize: 19, fontWeight: 700 }}>{v}</div><div style={{ fontSize: 12, color: F.muted }}>{l}</div></div>)}
          </div>
          <div style={{ fontWeight: 600, marginTop: 22 }}>C'était dur comment ?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 10 }}>{[5, 6, 7, 8, 9].map(n => <button key={n} onClick={() => setRpe(n)} style={{ ...ghostBtn, borderRadius: 12, padding: '13px 0', background: rpe === n ? F.accent : '#fff', color: rpe === n ? '#fff' : F.ink }}>{n}</button>)}</div>
          <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>5 = facile · 9 = à fond</div>
          <button disabled={busy || !doneSets.length} onClick={save} style={{ ...btn, width: '100%', marginTop: 22, opacity: doneSets.length ? 1 : 0.5 }}>{busy ? 'Enregistrement…' : doneSets.length ? 'Enregistrer ma séance' : 'Aucune série validée'}</button>
        </div>
      ) : <>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 14px 8px', scrollbarWidth: 'none' }}>
          {s.exercises.map((e, j) => { const ok = rows[e.id]!.every(r => r.done); return (
            <button key={e.id} onClick={() => setI(j)} style={{ flexShrink: 0, border: j === i ? `2px solid ${F.accent}` : '2px solid transparent', borderRadius: 14, background: ok ? '#dff3e7' : F.tile, width: 54, height: 54, padding: 3, cursor: 'pointer', position: 'relative' }}>
              {e.demo.length ? <Anim img={e.demo} alt="" h={44} /> : '🏋️'}
              {ok && <span style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, background: F.green, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
            </button>); })}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={ex.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} style={{ padding: '0 14px' }}>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ background: F.tile, height: 210, display: 'flex', alignItems: 'center', padding: 8, boxSizing: 'border-box' }}>{ex.demo.length ? <Anim img={ex.demo} alt={ex.name} h={194} /> : <div style={{ margin: 'auto', fontSize: 50 }}>🏋️</div>}</div>
              <div style={{ padding: '12px 14px 4px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: F.accent }}>{i + 1}/{s.exercises.length} · {MUSCLE[ex.muscle] ?? ex.muscle} · repos {ex.rest}s</div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 2 }}>{ex.name}</div>
                  </div>
                  <button onClick={() => setHow(true)} aria-label="Comment faire" style={{ width: 34, height: 34, borderRadius: 17, border: `1px solid ${F.line}`, background: '#fff', cursor: 'pointer', fontWeight: 700, color: F.accent, flexShrink: 0 }}>i</button>
                </div>
                {ex.tip && <div style={{ fontSize: 13.5, color: F.muted, marginTop: 6, lineHeight: 1.4 }}>💡 {ex.tip}</div>}
                {ex.suggestion.up && <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: F.green }}>↑ On monte à {ex.suggestion.kg} kg aujourd'hui</div>}
              </div>
              <div style={{ padding: '6px 10px 10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, fontSize: 11, fontWeight: 600, color: F.muted, padding: '6px 4px', textAlign: 'center' }}><div>SÉRIE</div><div>PRÉCÉDENT</div><div>KG</div><div>{ex.timed ? 'SEC' : 'REPS'}</div><div>✓</div></div>
                {sets.map((r, k) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'center', padding: '4px', borderRadius: 10, background: r.done ? '#dff3e7' : 'transparent', transition: 'background .2s' }}>
                    <div style={{ fontWeight: 700, textAlign: 'center' }}>{k + 1}</div>
                    <div style={{ fontSize: 13, color: F.muted, textAlign: 'center' }}>{prevOf(ex.suggestion.last, k)}</div>
                    <input inputMode="decimal" value={r.kg} onChange={e => upd(k, { kg: e.target.value })} placeholder="—" style={{ ...cell, background: r.done ? 'transparent' : F.bg }} />
                    <input inputMode="numeric" value={r.reps} onChange={e => upd(k, { reps: e.target.value })} placeholder="—" style={{ ...cell, background: r.done ? 'transparent' : F.bg }} />
                    <button onClick={() => r.done ? upd(k, { done: false }) : validate(k)} aria-label="Série faite" style={{ width: 38, height: 36, borderRadius: 10, border: 'none', background: r.done ? F.green : F.bg2, color: r.done ? '#fff' : F.muted, fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                  </div>
                ))}
                <button onClick={() => setRows(rr => ({ ...rr, [ex.id]: [...rr[ex.id]!, { kg: rr[ex.id]![rr[ex.id]!.length - 1]?.kg ?? '', reps: rr[ex.id]![rr[ex.id]!.length - 1]?.reps ?? '', done: false }] }))} style={{ width: '100%', marginTop: 8, border: 'none', background: F.bg, borderRadius: 10, padding: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: F.ink }}>+ Ajouter une série</button>
              </div>
            </div>
            {ex.alt.length > 0 && <div style={{ fontSize: 13, color: F.muted, margin: '10px 4px 0' }}>Machine prise ? Remplace par : {ex.alt.join(' · ')}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button disabled={i === 0} onClick={() => setI(i - 1)} style={{ ...ghostBtn, flex: 1, opacity: i ? 1 : 0.4 }}>‹ Précédent</button>
              <button onClick={() => i < s.exercises.length - 1 ? setI(i + 1) : setFinish(true)} style={{ ...ghostBtn, flex: 1 }}>{i < s.exercises.length - 1 ? 'Suivant ›' : 'Terminer'}</button>
            </div>
          </motion.div>
        </AnimatePresence>
        <ExerciseSheet session={how ? ex : null} onClose={() => setHow(false)} z={70} />
      </>}
      <AnimatePresence>{rest && !finish && <RestBar key={rest.key} seconds={rest.n} onDone={endRest} />}</AnimatePresence>
    </div>
  );
}

/** Petit graphe en barres : séances par semaine (8 dernières). */
function WeekBars({ weeks }: { weeks: Array<{ from: string; sessions: number; volume: number }> }) {
  const w = weeks.slice(-8); const max = Math.max(1, ...w.map(x => x.sessions));
  if (!w.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110, padding: '8px 2px 0' }}>
      {w.map((x, i) => (
        <div key={x.from} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: F.muted }}>{x.sessions || ''}</div>
          <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(4, (x.sessions / max) * 70)}px` }} transition={{ delay: i * 0.04 }} style={{ width: '100%', borderRadius: 6, background: i === w.length - 1 ? F.accent : F.accent2, opacity: i === w.length - 1 ? 1 : 0.45 }} />
          <div style={{ fontSize: 10, color: F.muted }}>{x.from.slice(8)}/{x.from.slice(5, 7)}</div>
        </div>
      ))}
    </div>
  );
}

const statTile = (v: ReactNode, l: string) => <div style={{ ...card, padding: '12px 12px', flex: 1, minWidth: 0 }}><div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>{v}</div><div style={{ fontSize: 12, color: F.muted, marginTop: 2 }}>{l}</div></div>;

export default function SportScreen({ toast, go }: { toast: (t: string) => void; go?: (t: 'library' | 'scan') => void }) {
  const [d, setD] = useState<SportOverview | null>(null);
  const [err, setErr] = useState('');
  const [play, setPlay] = useState<SportSession | null>(null);
  const [ex, setEx] = useState<SportExercise | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const load = useCallback(() => apiFetch<SportOverview>('/api/sport').then(setD).catch(e => setErr(errText(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (err) return <div style={{ padding: 18, color: F.red }}>❌ {err}</div>;
  if (!d) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  const today = d.week[0]?.date;
  const picked = pick ? (d.planned ?? []).find(x => x.date === pick) ?? (pick === d.today?.date ? d.today : pick === d.next?.date ? d.next : null) : null;
  const s = pick ? picked : d.today ?? d.next;
  const isToday = !!s && s.date === today;
  const weekVol = d.stats.weeks[d.stats.weeks.length - 1]?.volume ?? 0;
  const dateLong = new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div style={{ padding: '0 14px' }}>
      <div style={{ fontSize: 13, color: F.muted, fontWeight: 500, margin: '2px 2px 0', textTransform: 'capitalize' }}>{dateLong}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px' }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Entraînement</div>
        {d.stats.streak > 1 && <div style={{ background: '#fff1e0', color: '#c06a00', borderRadius: 999, padding: '6px 11px', fontSize: 13, fontWeight: 700 }}>🔥 {d.stats.streak}</div>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 12 }}>
        {d.week.map(w => {
          const done = w.status === 'done', sel = s?.date === w.date;
          return (
            <button key={w.date} onClick={() => { vibrate(10); setPick(w.type ? w.date : null); }} style={{ background: 'none', border: 'none', padding: 0, cursor: w.type ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: sel ? F.accent : F.muted }}>{SHORT_DAYS[dayOf(w.date)]!.slice(0, 1)}</div>
              <div style={{ width: 38, height: 38, borderRadius: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700,
                background: done ? F.accent : w.type && !w.skip ? '#fff' : 'transparent', color: done ? '#fff' : F.ink,
                border: sel ? `2.5px solid ${F.accent}` : w.type && !w.skip ? `1.5px solid ${F.line}` : `1.5px dashed ${F.line}` }}>
                {w.skip ? '·' : done ? '✓' : Number(w.date.slice(8))}
              </div>
            </button>
          );
        })}
      </div>
      {s ? <SessionCard s={s} kicker={isToday ? "Aujourd'hui" : `${pick ? '' : 'Prochaine · '}${SHORT_DAYS[dayOf(s.date)]} ${s.date.slice(8)} · ${new Date(s.start).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`} onStart={() => setPlay(s)} onEx={setEx} start={isToday ? 'Démarrer l\'entraînement' : 'Voir / faire cette séance'} />
        : <div style={{ ...card, marginTop: 14 }}>Pas de séance prévue cette semaine. Dis à Dzaryx « cale mes séances » 💬</div>}
      {s && <>
        <H2 right={<span style={{ fontSize: 13, color: F.muted }}>{s.exercises.length}</span>}>Exercices</H2>
        <div style={{ ...card, padding: '4px 14px' }}>{s.exercises.map((e, k) => <div key={e.id} style={{ borderBottom: k < s.exercises.length - 1 ? `1px solid ${F.line}` : 'none' }}><ExRow e={e} onClick={() => setEx(e)} /></div>)}</div>
      </>}
      <Shortcuts go={go} />
      <H2>Récupération</H2>
      <div style={{ ...card }}>
        <RecoveryMap rec={d.recovery} />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: F.muted, marginTop: 10 }}>
          <span><b style={{ color: F.green }}>●</b> Prêt</span><span><b style={{ color: F.gold }}>●</b> Bientôt</span><span><b style={{ color: F.red }}>●</b> Fatigué</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 10 }}>
          {d.recovery.map(r => <span key={r.muscle} style={{ fontSize: 12.5, fontWeight: 600, background: F.bg, borderRadius: 999, padding: '5px 10px', color: r.pct >= 100 ? F.green : r.pct >= 60 ? F.gold : F.red }}>{MUSCLE[r.muscle] ?? r.muscle} {r.pct >= 100 ? '✓' : `${r.pct}%`}</span>)}
        </div>
      </div>
      <H2>Statistiques</H2>
      <div style={{ display: 'flex', gap: 8 }}>{statTile(d.stats.monthSessions, 'Séances ce mois')}{statTile(d.stats.total, 'Au total')}{statTile(weekVol ? `${Math.round(weekVol / 100) / 10} t` : '—', 'Volume semaine')}</div>
      {d.stats.weeks.length > 1 && <div style={{ ...card, marginTop: 8 }}><div style={{ fontWeight: 600, fontSize: 14 }}>Séances par semaine</div><WeekBars weeks={d.stats.weeks} /></div>}
      {d.stats.prs.length > 0 && <>
        <H2>Records</H2>
        <div style={{ ...card, padding: '4px 14px' }}>
          {d.stats.prs.slice(0, 6).map((p, k) => (
            <div key={p.ex} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: k < Math.min(6, d.stats.prs.length) - 1 ? `1px solid ${F.line}` : 'none' }}>
              <span style={{ fontSize: 18 }}>🏆</span>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.ex}</div><div style={{ fontSize: 12, color: F.muted }}>{p.date.slice(8)}/{p.date.slice(5, 7)}</div></div>
              <div style={{ fontWeight: 700 }}>{p.kg} kg{p.reps ? <span style={{ color: F.muted, fontWeight: 500 }}> × {p.reps}</span> : null}</div>
            </div>
          ))}
        </div>
      </>}
      {d.recent?.length > 0 && <>
        <H2>Historique</H2>
        <div style={{ display: 'grid', gap: 8 }}>
          {d.recent.slice(0, 8).map(r => (
            <div key={`${r.date}-${r.type}`} style={{ ...card, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontWeight: 700 }}>{r.label}</div><div style={{ fontSize: 12.5, color: F.muted }}>{new Date(`${r.date}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })}</div></div>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: F.muted, marginTop: 6 }}>{r.durationMin ? <span>⏱ {r.durationMin} min</span> : null}<span>🏋️ {Math.round(r.volume)} kg</span><span>{r.sets} séries</span>{r.rpe ? <span>💥 {r.rpe}/10</span> : null}</div>
            </div>
          ))}
        </div>
      </>}
      <ExerciseSheet session={ex} onClose={() => setEx(null)} />
      {play && <Player s={play} onClose={() => setPlay(null)} onFinished={msg => { setPlay(null); toast(msg); void load(); }} save={async (sets, durationMin, rpe) => {
        const r = await apiFetch<{ prs: string[] }>('/api/sport/log', { method: 'POST', body: JSON.stringify({ date: d.week[0]?.date ?? play.date, type: play.type, sets, durationMin, rpe }) });
        return `💪 Séance enregistrée${r.prs.length ? ` — 🏆 record : ${r.prs.join(', ')}` : ''} · Dzaryx est prévenu`;
      }} />}
    </div>
  );
}

/** Séances de sa femme : son propre programme, même mode séance. */
export function ProgramSport({ toast, go }: { toast: (t: string) => void; go?: (t: 'library' | 'scan') => void }) {
  const [d, setD] = useState<ProgramView | null>(null);
  const [err, setErr] = useState('');
  const [play, setPlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ex, setEx] = useState<SportExercise | null>(null);
  const load = useCallback(() => forme.program().then(setD).catch(e => setErr(errText(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (err) return <div style={{ padding: 18, color: F.red }}>❌ {err}</div>;
  if (!d || !Array.isArray(d.week)) return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 60, color: F.muted }}><Spinner />Préparation de ton programme…</div>;
  const s = d.session;
  return (
    <div style={{ padding: '0 14px' }}>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: '2px 2px 0' }}>Entraînement</div>
      <div style={{ fontSize: 13.5, color: F.muted, margin: '2px 2px 0' }}>{d.total} séance(s) faites · {d.sessions.length} par semaine</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 12 }}>
        {d.week.map(w => (
          <div key={w.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: F.muted }}>{SHORT_DAYS[dayOf(w.date)]!.slice(0, 1)}</div>
            <div style={{ width: 38, height: 38, borderRadius: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, background: w.done ? F.accent : w.planned ? '#fff' : 'transparent', color: w.done ? '#fff' : F.ink, border: w.planned ? `1.5px solid ${F.line}` : `1.5px dashed ${F.line}` }}>{w.done ? '✓' : Number(w.date.slice(8))}</div>
          </div>
        ))}
      </div>
      {s && <SessionCard s={s as unknown as SportSession} kicker={d.doneToday ? 'Faite aujourd\'hui ✓ · prochaine' : d.todayPlanned ? "Aujourd'hui" : 'Prochaine séance'} onStart={() => setPlay(true)} onEx={setEx} start="Démarrer l'entraînement" />}
      {s && <>
        <H2>Exercices</H2>
        <div style={{ ...card, padding: '4px 14px' }}>{s.exercises.map((e, k) => <div key={e.id} style={{ borderBottom: k < s.exercises.length - 1 ? `1px solid ${F.line}` : 'none' }}><ExRow e={e} onClick={() => setEx(e)} /></div>)}</div>
      </>}
      <Shortcuts go={go} />
      <H2>Toutes les séances</H2>
      <div style={{ ...card, padding: '4px 14px' }}>{d.sessions.map((x, i) => <div key={i} style={{ padding: '11px 0', borderBottom: i < d.sessions.length - 1 ? `1px solid ${F.line}` : 'none', fontSize: 14.5 }}>{x.emoji} <b>{x.label}</b> <span style={{ color: F.muted }}>· {x.focus}</span></div>)}</div>
      <button disabled={busy} onClick={async () => { if (!confirm('Refaire un nouveau programme ?')) return; setBusy(true); try { setD(await forme.newProgram()); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }} style={{ ...ghostBtn, width: '100%', marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>{busy ? <><Spinner size={16} /> …</> : '🔄 Nouveau programme'}</button>
      <ExerciseSheet session={ex} onClose={() => setEx(null)} />
      {play && s && <Player s={s as unknown as SportSession} onClose={() => setPlay(false)} onFinished={msg => { setPlay(false); toast(msg); void load(); }} save={async (sets, durationMin, rpe) => {
        await forme.log('workout', { session: s.index, label: s.label, sets, durationMin, rpe });
        return '💪 Séance enregistrée';
      }} />}
    </div>
  );
}
