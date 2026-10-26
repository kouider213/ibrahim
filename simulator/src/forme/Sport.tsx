import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, type SportOverview, type SportSession, type SportExercise } from '../services/api.ts';
import { errText, SHORT_DAYS, dayOf, vibrate, forme, type ProgramView } from './api.ts';
import { F, Title, Section, card, darkCard, btn, ghostBtn, Img, Ring, Bar, Spinner } from './ui.tsx';
import { ExerciseSheet, ExerciseLibrary } from './Exercises.tsx';

// Onglet SPORT : les séances que Dzaryx cale déjà sur l'agenda (sport-coach.ts), avec un vrai mode séance :
// démo animée de chaque exercice, charges conseillées, minuteur de repos, records. Fin de séance → Dzaryx est prévenu.
const MUSCLE: Record<string, string> = { pecs: 'Pecs', dos: 'Dos', epaules: 'Épaules', bras: 'Bras', jambes: 'Jambes', abdos: 'Abdos', cardio: 'Cardio' };

/** Les 2 photos de la démo en alternance = l'exercice « bouge ». */
export function Demo({ ex, style }: { ex: { demo: string[]; name: string }; style?: React.CSSProperties }) {
  const [f, setF] = useState(0);
  useEffect(() => { if (ex.demo.length < 2) return; const t = setInterval(() => setF(x => 1 - x), 900); return () => clearInterval(t); }, [ex.demo.length]);
  return <Img src={ex.demo[f] ?? ex.demo[0]} alt={ex.name} style={{ background: '#fff', objectFit: 'contain', ...style }} />;
}

/** 📚 Bouton « Tous les exercices » (bibliothèque avec muscles et fiches). */
function LibButton() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)} style={{ ...card, width: '100%', display: 'flex', gap: 12, alignItems: 'center', marginTop: 14, border: 'none', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink }}>
      <span style={{ fontSize: 26 }}>📚</span>
      <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>Tous les exercices</div><div style={{ fontSize: 12.5, color: F.muted, marginTop: 2 }}>800 exercices : comment les faire et les muscles qu'ils travaillent</div></div>
      <span style={{ color: F.accent, fontWeight: 900 }}>›</span>
    </button>
    <ExerciseLibrary open={open} onClose={() => setOpen(false)} />
  </>;
}

export function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch { /* */ }
}

export function RestTimer({ seconds, onDone, onSkip }: { seconds: number; onDone: () => void; onSkip: () => void }) {
  const [left, setLeft] = useState(seconds);
  const end = useRef(Date.now() + seconds * 1000);
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      setLeft(l);
      if (l <= 3 && l > 0) vibrate(40);
      if (l === 0) { clearInterval(t); beep(); vibrate(400); onDone(); }
    }, 250);
    return () => clearInterval(t);
  }, [onDone]);
  return (
    <div style={{ ...darkCard, display: 'flex', alignItems: 'center', gap: 18 }}>
      <Ring value={left} max={seconds} size={96} color={left <= 5 ? F.green : F.accent}>
        <div style={{ fontSize: 26, fontWeight: 900 }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
      </Ring>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.1em', fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>REPOS</div>
        <div style={{ fontSize: 15, fontWeight: 700, margin: '4px 0 10px' }}>Respire, bois une gorgée d'eau.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { end.current += 15_000; }} style={{ ...ghostBtn, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '8px 12px' }}>+15 s</button>
          <button onClick={onSkip} style={{ ...ghostBtn, background: F.accent, color: '#fff', border: 'none', padding: '8px 12px' }}>Passer</button>
        </div>
      </div>
    </div>
  );
}

type SetRow = { kg: string; reps: string; done: boolean };

type SaveFn = (sets: Array<{ ex: string; kg?: number; reps?: number }>, durationMin: number, rpe: number) => Promise<string>;
function Player({ s, onClose, onFinished, save: saveFn }: { s: SportSession; onClose: () => void; onFinished: (msg: string) => void; save: SaveFn }) {
  const [i, setI] = useState(0);
  const [how, setHow] = useState(false);
  const [rows, setRows] = useState<Record<string, SetRow[]>>(() => Object.fromEntries(s.exercises.map(e => [e.id, Array.from({ length: e.sets }, () => ({ kg: e.suggestion.kg ? String(e.suggestion.kg) : '', reps: String(parseInt(e.reps) || ''), done: false }))])));
  const [rest, setRest] = useState<number | null>(null);
  const [finish, setFinish] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [busy, setBusy] = useState(false);
  const start = useRef(Date.now());
  const ex = s.exercises[i]!;
  const sets = rows[ex.id]!;
  const upd = (k: number, patch: Partial<SetRow>) => setRows(r => ({ ...r, [ex.id]: r[ex.id]!.map((x, j) => j === k ? { ...x, ...patch } : x) }));
  const endRest = useCallback(() => setRest(null), []);
  const validate = (k: number) => {
    vibrate(25); upd(k, { done: true });
    if (k === sets.length - 1) { if (i < s.exercises.length - 1) { setRest(ex.rest); setI(i + 1); } else setFinish(true); }
    else setRest(ex.rest);
  };
  const totalDone = Object.values(rows).flat().filter(r => r.done).length, total = Object.values(rows).flat().length;
  const save = async () => {
    setBusy(true);
    try {
      const all = s.exercises.flatMap(e => rows[e.id]!.filter(r => r.done).map(r => ({ ex: e.id, kg: Number(r.kg) || undefined, reps: Number(r.reps) || undefined })));
      onFinished(await saveFn(all, Math.round((Date.now() - start.current) / 60000), rpe));
    } catch (e) { alert(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: F.bg, overflowY: 'auto', fontFamily: F.sans, color: F.ink, padding: 'calc(12px + env(safe-area-inset-top)) 18px calc(30px + env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { if (confirm('Quitter la séance ? (rien n\'est enregistré)')) onClose(); }} style={{ ...ghostBtn, width: 40, height: 40, padding: 0, borderRadius: 20 }}>✕</button>
        <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 800, color: F.accent, letterSpacing: '0.1em' }}>{s.emoji} {s.label.toUpperCase()}</div><Bar value={totalDone} max={total} track={F.bg2} h={6} /></div>
        <div style={{ fontWeight: 900 }}>{i + 1}/{s.exercises.length}</div>
      </div>
      {finish ? (
        <div style={{ marginTop: 30, textAlign: 'center' }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ fontSize: 70 }}>🏆</motion.div>
          <Title a="Séance" b="terminée !" sub={`${totalDone} séries en ${Math.round((Date.now() - start.current) / 60000)} min. C'était dur comment ?`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>{[5, 6, 7, 8, 9].map(n => <button key={n} onClick={() => setRpe(n)} style={{ ...ghostBtn, padding: '14px 0', background: rpe === n ? F.accent : '#fff', color: rpe === n ? '#fff' : F.ink }}>{n}</button>)}</div>
          <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>5 = facile · 9 = à fond</div>
          <button disabled={busy} onClick={save} style={{ ...btn, width: '100%', marginTop: 20 }}>{busy ? 'Enregistrement…' : 'Enregistrer ma séance'}</button>
        </div>
      ) : <>
        <AnimatePresence mode="wait">
          <motion.div key={ex.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: 14 }}>
              <Demo ex={ex} style={{ width: '100%', height: 230 }} />
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: F.accent, letterSpacing: '0.1em' }}>{MUSCLE[ex.muscle] ?? ex.muscle} · {ex.sets} × {ex.reps} · repos {ex.rest}s</div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>{ex.name}</div>
                <div style={{ fontSize: 14, color: F.muted, marginTop: 6, lineHeight: 1.4 }}>💡 {ex.tip}</div>
                {ex.suggestion.kg != null && <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 8, color: ex.suggestion.up ? F.green : F.ink }}>{ex.suggestion.up ? '📈 On monte : ' : 'Charge conseillée : '}{ex.suggestion.kg} kg{ex.suggestion.last ? ` (dernière fois ${ex.suggestion.last})` : ''}</div>}
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setHow(true)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13.5, fontWeight: 800, color: F.accent, cursor: 'pointer', fontFamily: 'inherit' }}>ⓘ Comment faire · muscles</button>
                  <a href={ex.video} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: F.blue }}>▶ Vidéo</a>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        <ExerciseSheet session={how ? ex : null} onClose={() => setHow(false)} z={70} />
        {rest != null && <div style={{ marginTop: 12 }}><RestTimer key={`${i}-${totalDone}`} seconds={rest} onDone={endRest} onSkip={endRest} /></div>}
        <div style={{ ...card, marginTop: 12, padding: '6px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 52px', gap: 8, fontSize: 11.5, fontWeight: 800, color: F.muted, padding: '6px 0' }}><div>SÉRIE</div><div>KG</div><div>{ex.timed ? 'SEC' : 'REPS'}</div><div /></div>
          {sets.map((r, k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 52px', gap: 8, alignItems: 'center', padding: '6px 0', opacity: r.done ? 0.55 : 1 }}>
              <div style={{ fontWeight: 900, fontSize: 17 }}>{k + 1}</div>
              <input inputMode="decimal" value={r.kg} onChange={e => upd(k, { kg: e.target.value })} placeholder="—" style={{ background: F.bg, border: 'none', borderRadius: 10, padding: 10, fontSize: 16, fontWeight: 800, width: '100%', boxSizing: 'border-box', fontFamily: F.sans }} />
              <input inputMode="numeric" value={r.reps} onChange={e => upd(k, { reps: e.target.value })} style={{ background: F.bg, border: 'none', borderRadius: 10, padding: 10, fontSize: 16, fontWeight: 800, width: '100%', boxSizing: 'border-box', fontFamily: F.sans }} />
              <button onClick={() => r.done ? upd(k, { done: false }) : validate(k)} aria-label="Série faite" style={{ width: 46, height: 40, borderRadius: 12, border: 'none', background: r.done ? F.green : F.dark, color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer' }}>✓</button>
            </div>
          ))}
        </div>
        {ex.alt.length > 0 && <div style={{ fontSize: 13, color: F.muted, marginTop: 10 }}>Machine prise ? Remplace par : {ex.alt.join(' · ')}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button disabled={i === 0} onClick={() => setI(i - 1)} style={{ ...ghostBtn, flex: 1, opacity: i ? 1 : 0.4 }}>← Précédent</button>
          <button onClick={() => i < s.exercises.length - 1 ? setI(i + 1) : setFinish(true)} style={{ ...ghostBtn, flex: 1 }}>{i < s.exercises.length - 1 ? 'Suivant →' : 'Terminer'}</button>
        </div>
      </>}
    </div>
  );
}

export default function SportScreen({ toast }: { toast: (t: string) => void }) {
  const [d, setD] = useState<SportOverview | null>(null);
  const [err, setErr] = useState('');
  const [play, setPlay] = useState<SportSession | null>(null);
  const [ex, setEx] = useState<SportExercise | null>(null);
  const [pick, setPick] = useState<string | null>(null);   // jour touché dans la semaine
  const load = useCallback(() => apiFetch<SportOverview>('/api/sport').then(setD).catch(e => setErr(errText(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (err) return <div style={{ padding: 18, color: F.red }}>❌ {err}</div>;
  if (!d) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  const today = d.week[0]?.date;
  const picked = pick ? (d.planned ?? []).find(x => x.date === pick) ?? (pick === d.today?.date ? d.today : pick === d.next?.date ? d.next : null) : null;
  const s = pick ? picked : d.today ?? d.next;
  const isToday = !!s && s.date === today;
  return (
    <div style={{ padding: '6px 18px 0' }}>
      <Title a="Ton" b="entraînement" sub={d.stats.streak > 1 ? `🔥 ${d.stats.streak} séances d'affilée · ${d.stats.monthSessions} ce mois-ci` : `${d.stats.monthSessions} séance(s) ce mois-ci`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
        {d.week.map(w => (
          <button key={w.date} onClick={() => { vibrate(10); setPick(w.type ? w.date : null); }} style={{ ...card, padding: '8px 0', textAlign: 'center', borderRadius: 16, background: w.status === 'done' ? F.green : w.type ? '#fff' : F.bg2, color: w.status === 'done' ? '#fff' : F.ink, boxShadow: (s?.date === w.date) ? `0 0 0 2.5px ${F.accent}` : 'none', border: `1px solid ${F.line}`, cursor: w.type ? 'pointer' : 'default', fontFamily: F.sans }}>
            <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.7 }}>{SHORT_DAYS[dayOf(w.date)]}</div>
            <div style={{ fontSize: 18, marginTop: 2 }}>{w.skip ? '🛌' : w.status === 'done' ? '✓' : w.emoji ?? '·'}</div>
            <div style={{ fontSize: 9, fontWeight: 800, opacity: 0.6, marginTop: 1 }}>{w.type ? (w.label ?? '').replace(/ DAY$/, '').slice(0, 7) : 'repos'}</div>
          </button>
        ))}
      </div>
      {d.objective && <div style={{ fontSize: 12.5, fontWeight: 700, color: F.muted, marginTop: 10, textAlign: 'center' }}>🎯 {d.objective} · touche un jour pour voir sa séance</div>}
      {s ? (
        <div style={{ ...darkCard, padding: 0, overflow: 'hidden', marginTop: 16 }}>
          <div style={{ position: 'relative', height: 180, background: '#fff' }}>
            {s.exercises[0] && <Demo ex={s.exercises[0]} style={{ width: '100%', height: '100%' }} />}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 40%, rgba(33,29,28,0.95))' }} />
            <div style={{ position: 'absolute', left: 16, bottom: 12, right: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: F.accent2, letterSpacing: '0.1em' }}>{isToday ? "AUJOURD'HUI" : `${pick ? '' : 'PROCHAINE · '}${SHORT_DAYS[dayOf(s.date)]} ${s.date.slice(8)}`} · {new Date(s.start).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em' }}>{s.emoji} {s.label}</div>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {(s as { custom?: string }).custom && <div style={{ fontSize: 13, background: 'rgba(255,122,69,0.18)', color: '#ffd2c2', borderRadius: 12, padding: '8px 10px', marginBottom: 8 }}>🎯 Sur mesure : {(s as { custom?: string }).custom}</div>}
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{s.focus} · ~{s.estMin} min · {s.exercises.length} exercices{(s as SportSession & { deload?: boolean }).deload ? ' · semaine allégée' : ''}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>🔥 Échauffement : {s.warmup}</div>
            {(s as { finisher?: string | null }).finisher && <div style={{ fontSize: 13, color: '#ffd2c2', marginTop: 6 }}>🔥 {(s as { finisher?: string | null }).finisher}</div>}
            <button onClick={() => setPlay(s)} style={{ ...btn, width: '100%', marginTop: 14 }}>{isToday ? '▶ Démarrer la séance' : '▶ Voir / faire cette séance'}</button>
          </div>
        </div>
      ) : <div style={{ ...card, marginTop: 16 }}>Pas de séance prévue cette semaine. Dis à Dzaryx « cale mes séances » 💬</div>}
      {s && <>
        <Section a="Les" b="exercices" />
        {s.exercises.map(e => (
          <button key={e.id} onClick={() => setEx(e)} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: 10, marginBottom: 10, width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: F.sans, color: F.ink }}>
            <Img src={e.demo[0]} style={{ width: 70, height: 70, borderRadius: 14, objectFit: 'contain', background: '#fff', border: `1px solid ${F.line}`, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: F.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{MUSCLE[e.muscle] ?? e.muscle}</div>
              <div style={{ fontSize: 15.5, fontWeight: 800 }}>{e.name}</div>
              <div style={{ fontSize: 12.5, color: F.muted }}>{e.sets} × {e.reps}{e.suggestion.kg != null ? ` · ${e.suggestion.kg} kg${e.suggestion.up ? ' 📈' : ''}` : ''}</div>
            </div>
          </button>
        ))}
      </>}
      {(d.planned?.length ?? 0) > 1 && <>
        <Section a="Ta" b="semaine" />
        {d.planned!.map(x => (
          <button key={x.date} onClick={() => { setPick(x.date); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: 12, marginBottom: 8, width: '100%', border: x.date === s?.date ? `2px solid ${F.accent}` : 'none', textAlign: 'left', cursor: 'pointer', fontFamily: F.sans, color: F.ink }}>
            <div style={{ width: 48, textAlign: 'center' }}><div style={{ fontSize: 11, fontWeight: 800, color: F.muted }}>{SHORT_DAYS[dayOf(x.date)]}</div><div style={{ fontSize: 22 }}>{x.emoji}</div></div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 15 }}>{x.label}</div><div style={{ fontSize: 12.5, color: F.muted }}>{x.focus} · {x.exercises.length} exercices · ~{x.estMin} min</div><div style={{ fontSize: 12, color: F.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.exercises.map(e => e.name).join(' · ')}</div></div>
            <div style={{ fontSize: 18, color: F.muted }}>›</div>
          </button>
        ))}
      </>}
      <Section a="Récupération" b="musculaire" />
      <div style={{ ...card }}>
        {d.recovery.map(r => (
          <div key={r.muscle} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 44px', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{MUSCLE[r.muscle] ?? r.muscle}</div>
            <Bar value={r.pct} max={100} color={r.pct >= 100 ? F.green : r.pct > 60 ? F.gold : F.accent} track={F.bg2} h={8} />
            <div style={{ fontSize: 12.5, fontWeight: 800, textAlign: 'right', color: r.pct >= 100 ? F.green : F.muted }}>{r.pct >= 100 ? 'prêt' : `${r.pct}%`}</div>
          </div>
        ))}
      </div>
      {d.stats.prs.length > 0 && <>
        <Section a="Tes" b="records" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {d.stats.prs.slice(0, 6).map(p => <div key={p.ex} style={{ ...card, padding: 12 }}><div style={{ fontSize: 22, fontWeight: 900, color: F.accent }}>{p.kg} kg</div><div style={{ fontSize: 13, fontWeight: 700 }}>{p.ex}</div><div style={{ fontSize: 11.5, color: F.muted }}>{p.reps ? `${p.reps} reps · ` : ''}{p.date.slice(8)}/{p.date.slice(5, 7)}</div></div>)}
        </div>
      </>}
      <ExerciseSheet session={ex} onClose={() => setEx(null)} />
      <LibButton />
      {play && <Player s={play} onClose={() => setPlay(null)} onFinished={msg => { setPlay(null); toast(msg); void load(); }} save={async (sets, durationMin, rpe) => {
        const r = await apiFetch<{ prs: string[] }>('/api/sport/log', { method: 'POST', body: JSON.stringify({ date: d.week[0]?.date ?? play.date, type: play.type, sets, durationMin, rpe }) });
        return `💪 Séance enregistrée${r.prs.length ? ` — 🏆 record : ${r.prs.join(', ')}` : ''} · Dzaryx est prévenu`;
      }} />}
    </div>
  );
}

/** Séances de sa femme : son propre programme (fait par Claude selon son objectif et son lieu), même mode séance. */
export function ProgramSport({ toast }: { toast: (t: string) => void }) {
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
    <div style={{ padding: '6px 18px 0' }}>
      <Title a="Ton" b="entraînement" sub={`${d.total} séance(s) faites · ${d.sessions.length} séances par semaine`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
        {d.week.map(w => (
          <div key={w.date} style={{ ...card, padding: '8px 0', textAlign: 'center', borderRadius: 16, background: w.done ? F.green : w.planned ? '#fff' : F.bg2, color: w.done ? '#fff' : F.ink, boxShadow: 'none', border: `1px solid ${F.line}` }}>
            <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.7 }}>{SHORT_DAYS[dayOf(w.date)]}</div>
            <div style={{ fontSize: 18, marginTop: 2 }}>{w.done ? '✓' : w.planned ? '🔥' : '·'}</div>
          </div>
        ))}
      </div>
      {s && (
        <div style={{ ...darkCard, padding: 0, overflow: 'hidden', marginTop: 16 }}>
          <div style={{ position: 'relative', height: 180, background: '#fff' }}>
            {s.exercises[0] && <Demo ex={s.exercises[0]} style={{ width: '100%', height: '100%' }} />}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 40%, rgba(33,29,28,0.95))' }} />
            <div style={{ position: 'absolute', left: 16, bottom: 12, right: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: F.accent2, letterSpacing: '0.1em' }}>{d.doneToday ? 'FAITE AUJOURD\'HUI ✓ · PROCHAINE' : d.todayPlanned ? "AUJOURD'HUI" : 'PROCHAINE SÉANCE'}</div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em' }}>{s.emoji} {s.label}</div>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {(s as { custom?: string }).custom && <div style={{ fontSize: 13, background: 'rgba(255,122,69,0.18)', color: '#ffd2c2', borderRadius: 12, padding: '8px 10px', marginBottom: 8 }}>🎯 Sur mesure : {(s as { custom?: string }).custom}</div>}
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{s.focus} · ~{s.estMin} min · {s.exercises.length} exercices</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>🔥 {s.warmup}</div>
            <button onClick={() => setPlay(true)} style={{ ...btn, width: '100%', marginTop: 14 }}>▶ Démarrer la séance</button>
          </div>
        </div>
      )}
      {s && <>
        <Section a="Les" b="exercices" />
        {s.exercises.map(e => (
          <button key={e.id} onClick={() => setEx(e)} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: 10, marginBottom: 10, width: '100%', border: 'none', textAlign: 'start', cursor: 'pointer', fontFamily: 'inherit', color: F.ink }}>
            <Img src={e.demo[0]} style={{ width: 70, height: 70, borderRadius: 14, objectFit: 'contain', background: '#fff', border: `1px solid ${F.line}`, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: F.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{e.muscle}</div>
              <div style={{ fontSize: 15.5, fontWeight: 800 }}>{e.name}</div>
              <div style={{ fontSize: 12.5, color: F.muted }}>{e.sets} × {e.reps}{e.suggestion.kg != null ? ` · ${e.suggestion.kg} kg` : ''}</div>
            </div>
          </button>
        ))}
      </>}
      <Section a="Toutes" b="les séances" />
      <div style={{ ...card, padding: '4px 14px' }}>{d.sessions.map((x, i) => <div key={i} style={{ padding: '10px 0', borderBottom: i < d.sessions.length - 1 ? `1px solid ${F.line}` : 'none', fontSize: 14.5 }}>{x.emoji} <b>{x.label}</b> <span style={{ color: F.muted }}>· {x.focus}</span></div>)}</div>
      <button disabled={busy} onClick={async () => { if (!confirm('Refaire un nouveau programme ?')) return; setBusy(true); try { setD(await forme.newProgram()); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }} style={{ ...ghostBtn, width: '100%', marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>{busy ? <><Spinner size={16} /> …</> : '🔄 Nouveau programme'}</button>
      <ExerciseSheet session={ex} onClose={() => setEx(null)} />
      <LibButton />
      {play && s && <Player s={s} onClose={() => setPlay(false)} onFinished={msg => { setPlay(false); toast(msg); void load(); }} save={async (sets, durationMin, rpe) => {
        await forme.log('workout', { session: s.index, label: s.label, sets, durationMin, rpe });
        return '💪 Séance enregistrée';
      }} />}
    </div>
  );
}
