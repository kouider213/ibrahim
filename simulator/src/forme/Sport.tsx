import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, type SportOverview, type SportSession, type SportExercise } from '../services/api.ts';
import { errText, SHORT_DAYS, dayOf, vibrate, forme, type ProgramView, type LibItem, type Routine, type RoutineEx, type ExSet } from './api.ts';
import { F, card, btn, ghostBtn, input, Sheet, Spinner } from './ui.tsx';
import { ExerciseSheet, Anim, RecoveryMap, LibraryPicker, COACH_TO_GROUP } from './Exercises.tsx';
import { TodayForm } from './Watch.tsx';
import { WeekGoal } from './Insights.tsx';

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

// ── Mode séance en direct (Hevy + Strong + Fitbod réunis) ───────────────────────
// Types de série (W échauffement, D dégressive, F échec), échauffement auto, calculateur de disques, remplacer / ajouter
// un exercice depuis la bibliothèque, record battu en direct, précédent, repos en bas, résumé de fin.
type SetT = 'n' | 'w' | 'd' | 'f';
type SetRow = { kg: string; reps: string; done: boolean; t: SetT };
type PEx = SportExercise & { libId?: string | null };
type SaveFn = (sets: Array<{ ex: string; kg?: number; reps?: number }>, durationMin: number, rpe: number, exs: PEx[], rows: Record<string, SetRow[]>, note: string) => Promise<string>;
const T_NEXT: Record<SetT, SetT> = { n: 'w', w: 'd', d: 'f', f: 'n' };
const T_LOOK: Record<Exclude<SetT, 'n'>, { l: string; c: string; name: string }> = { w: { l: 'W', c: '#e08a00', name: 'Échauffement' }, d: { l: 'D', c: '#7b5cf0', name: 'Dégressive' }, f: { l: 'F', c: '#e5322d', name: 'Échec' } };
const libIdOf = (e: PEx) => e.libId ?? (/\/exercises\/([^/]+)\/\d\.jpg/.exec(e.demo?.[0] ?? '')?.[1] ?? null);
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const r25 = (x: number) => Math.round(x / 2.5) * 2.5;

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
  const said10 = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      setLeft(l);
      if (l <= 3 && l > 0) vibrate(40);
      if (l === 10 && !said10.current) { said10.current = true; speak('Encore 10 secondes'); }
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

/** Calculateur de disques (Strong) : quoi mettre de CHAQUE côté de la barre. */
const PLATES: Array<{ kg: number; c: string; h: number }> = [{ kg: 25, c: '#d93a2b', h: 86 }, { kg: 20, c: '#2f6fe0', h: 86 }, { kg: 15, c: '#e2b007', h: 78 }, { kg: 10, c: '#2a9d55', h: 70 }, { kg: 5, c: '#eeeeee', h: 56 }, { kg: 2.5, c: '#444', h: 46 }, { kg: 1.25, c: '#999', h: 38 }];
function PlateCalc({ open, onClose, kg0 }: { open: boolean; onClose: () => void; kg0: number }) {
  const [kg, setKg] = useState(String(kg0 || 60)); const [bar, setBar] = useState(20);
  useEffect(() => { if (open) setKg(String(kg0 || 60)); }, [open, kg0]);
  let side = Math.max(0, (Number(kg.replace(',', '.')) - bar) / 2); const out: typeof PLATES = [];
  for (const p of PLATES) while (side >= p.kg - 1e-9 && out.length < 14) { out.push(p); side = Math.round((side - p.kg) * 100) / 100; }
  return (
    <Sheet open={open} onClose={onClose} z={75} title={<div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>Calculateur de disques</div>}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} style={{ ...cellBig, flex: 1 }} /><span style={{ fontWeight: 600 }}>kg au total</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{[20, 15, 10, 0].map(b => <button key={b} onClick={() => setBar(b)} style={{ ...ghostBtn, padding: '8px 12px', background: bar === b ? F.ink : '#fff', color: bar === b ? '#fff' : F.ink }}>{b ? `Barre ${b} kg` : 'Sans barre'}</button>)}</div>
      <div style={{ ...card, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, gap: 3 }}>
        <div style={{ width: 70, height: 10, background: '#b9b9c2', borderRadius: 3 }} />
        {out.map((p, i) => <div key={i} style={{ width: 13, height: p.h, background: p.c, borderRadius: 3, border: '1px solid rgba(0,0,0,0.15)' }} />)}
        <div style={{ width: 22, height: 10, background: '#b9b9c2', borderRadius: 3 }} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 15 }}>{out.length ? <>De <b>chaque côté</b> : {out.map(p => p.kg).join(' + ')} kg</> : 'Juste la barre'}{side > 0 ? <div style={{ color: F.red, fontSize: 13 }}>Reste {side} kg impossible à charger</div> : null}</div>
    </Sheet>
  );
}
const cellBig: CSSProperties = { background: '#fff', border: `1px solid ${F.line}`, borderRadius: 12, padding: 12, fontSize: 20, fontWeight: 700, textAlign: 'center', fontFamily: F.sans, color: F.ink, boxSizing: 'border-box' };

// Coach vocal (façon Nike Training Club) : annonce l'exercice, la fin du repos, les 10 dernières secondes.
const VOICE_K = 'forme:voice';
function speak(t: string) { try { if (localStorage.getItem(VOICE_K) === '0') return; const u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* */ } }
// Ressenti par exercice (façon Freeletics) : la prochaine fois, la charge s'ajuste toute seule.
type Feel = 'easy' | 'ok' | 'hard';
const FEEL: Array<{ id: Feel; e: string; l: string }> = [{ id: 'easy', e: '😌', l: 'Facile' }, { id: 'ok', e: '👍', l: 'Parfait' }, { id: 'hard', e: '🥵', l: 'Dur' }];

/** Carte à partager (façon Strava) : image 1080×1350 de la séance. */
async function shareCard(o: { title: string; dur: string; volume: number; sets: number; lines: string[]; prs: string[] }) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 1080, 1350); gr.addColorStop(0, '#1f63f0'); gr.addColorStop(1, '#5b3fe0'); g.fillStyle = gr; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '600 40px -apple-system, Inter, sans-serif'; g.fillText(new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' }), 80, 130);
  g.fillStyle = '#fff'; g.font = '800 84px -apple-system, Inter, sans-serif'; g.fillText(o.title.slice(0, 22), 80, 240);
  const stat = (x: number, v: string, l: string) => { g.font = '800 76px -apple-system, Inter, sans-serif'; g.fillText(v, x, 400); g.font = '500 34px -apple-system, Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(l, x, 450); g.fillStyle = '#fff'; };
  stat(80, o.dur, 'Durée'); stat(420, `${Math.round(o.volume)}`, 'kg soulevés'); stat(800, String(o.sets), 'Séries');
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(80, 510, 920, 3); g.fillStyle = '#fff';
  g.font = '600 42px -apple-system, Inter, sans-serif'; o.lines.slice(0, 8).forEach((t, k) => g.fillText(t.slice(0, 40), 80, 600 + k * 70));
  if (o.prs.length) { g.font = '700 44px -apple-system, Inter, sans-serif'; g.fillText(`🏆 Record : ${o.prs.join(', ').slice(0, 34)}`, 80, 1180); }
  g.font = '800 48px -apple-system, Inter, sans-serif'; g.fillText('FORME', 80, 1270); g.font = '500 32px -apple-system, Inter, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText('par Dzaryx', 270, 1270);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
  if (!blob) return;
  const file = new File([blob], 'seance.png', { type: 'image/png' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: o.title }); return; } } catch { return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'seance.png'; a.click();
}

const fromLib = (x: LibItem, k: number): PEx => ({ id: `${x.id}~${Date.now().toString(36)}${k}`, libId: x.id, name: x.fr, muscle: '', sets: 3, reps: '10', rest: 90, tip: '', alt: [], timed: false, demo: x.img, video: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${x.name} technique musculation`)}`, suggestion: { kg: null } });

// Séance en cours gardée sur le téléphone (Hevy) : appel, écran verrouillé, appli fermée → on la reprend telle quelle.
export const LIVE_K = 'forme:live';
export interface LiveState { kind: 'coach' | 'routine'; s: SportSession; exs: PEx[]; rows: Record<string, SetRow[]>; i: number; start: number; feel: Record<string, Feel>; at: number }
export function readLive(): LiveState | null { try { const v = JSON.parse(localStorage.getItem(LIVE_K) ?? 'null') as LiveState | null; return v && Date.now() - v.at < 8 * 3600_000 ? v : null; } catch { return null; } }
const clearLive = () => { try { localStorage.removeItem(LIVE_K); } catch { /* */ } };
const noteKey = (e: PEx) => `forme:exnote:${libIdOf(e) ?? norm(e.name)}`;

function Player({ s, onClose, onFinished, save: saveFn, prs = {}, kind = 'coach', resume }: { s: SportSession; onClose: () => void; onFinished: (msg: string) => void; save: SaveFn; prs?: Record<string, number>; kind?: 'coach' | 'routine'; resume?: LiveState | null }) {
  const mkRows = (e: PEx): SetRow[] => Array.from({ length: e.sets }, () => ({ kg: e.suggestion.kg ? String(e.suggestion.kg) : '', reps: String(parseInt(e.reps) || ''), done: false, t: 'n' as SetT }));
  const [exs, setExs] = useState<PEx[]>(() => resume?.exs ?? s.exercises.map(e => ({ ...e })));
  const [i, setI] = useState(resume?.i ?? 0);
  const [how, setHow] = useState(false);
  const [rows, setRows] = useState<Record<string, SetRow[]>>(() => resume?.rows ?? Object.fromEntries(s.exercises.map(e => [e.id, mkRows(e)])));
  const [rest, setRest] = useState<{ n: number; key: number } | null>(null);
  const [finish, setFinish] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<'add' | 'swap' | null>(null);
  const [plates, setPlates] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [newPrs, setNewPrs] = useState<string[]>([]);
  const [feel, setFeel] = useState<Record<string, Feel>>(resume?.feel ?? {});
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem(VOICE_K) !== '0'; } catch { return true; } });
  const toggleVoice = () => { const v = !voice; setVoice(v); try { localStorage.setItem(VOICE_K, v ? '1' : '0'); } catch { /* */ } if (v) speak('Coach vocal activé'); else speechSynthesis.cancel(); };
  const start = useRef(resume?.start ?? Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (Object.values(rows).flat().some(r => r.done)) { try { localStorage.setItem(LIVE_K, JSON.stringify({ kind, s, exs, rows, i, start: start.current, feel, at: Date.now() } satisfies LiveState)); } catch { /* */ } } }, [rows, exs, i, feel]); // eslint-disable-line react-hooks/exhaustive-deps
  const [note, setNote] = useState('');
  const ex = exs[Math.min(i, exs.length - 1)];
  useEffect(() => { if (ex) { try { setNote(localStorage.getItem(noteKey(ex)) ?? ''); } catch { setNote(''); } } }, [ex?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ex && !finish) speak(`${i === 0 ? 'On commence' : 'Exercice suivant'} : ${ex.name}. ${ex.sets} séries de ${ex.reps}${ex.suggestion.kg ? `, à ${ex.suggestion.kg} kilos` : ''}.`); }, [ex?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sets = ex ? rows[ex.id] ?? [] : [];
  const upd = (k: number, patch: Partial<SetRow>) => ex && setRows(r => ({ ...r, [ex.id]: r[ex.id]!.map((x, j) => j === k ? { ...x, ...patch } : x) }));
  const endRest = useCallback(() => { setRest(null); speak('C\'est reparti !'); }, []);
  const best = (e: PEx) => prs[norm(e.name)] ?? 0;
  const validate = (k: number) => {
    if (!ex) return;
    vibrate(25);
    const r0 = rows[ex.id]![k]!;
    const kg = Number(r0.kg.replace(',', '.')) || 0;
    if (r0.t !== 'w' && kg > 0 && best(ex) > 0 && kg > best(ex) && !newPrs.includes(ex.name)) { setNewPrs(p => [...p, ex.name]); setFlash(`🏆 Nouveau record : ${kg} kg !`); vibrate(300); setTimeout(() => setFlash(null), 3500); }
    setRows(r => ({ ...r, [ex.id]: r[ex.id]!.map((x, j) => j === k ? { ...x, done: true } : j === k + 1 && !x.done ? { ...x, kg: x.kg || r0.kg } : x) }));
    const last = sets.every((x, j) => j === k || x.done);
    // Plus de passage automatique : il donne d'abord son ressenti (qui, lui, passe à l'exercice suivant)
    if (!(last && i === exs.length - 1)) setRest({ n: r0.t === 'w' ? Math.min(60, ex.rest) : ex.rest, key: Date.now() });
  };
  const warmup = () => {
    if (!ex) return;
    const top = Number(sets.find(r => r.t !== 'w')?.kg.replace(',', '.')) || 0;
    if (!top) { setFlash('Mets d\'abord ta charge de travail (kg)'); setTimeout(() => setFlash(null), 2500); return; }
    const w: SetRow[] = [[0.5, 10], [0.7, 5], [0.85, 3]].map(([p, r]) => ({ kg: String(Math.max(0, r25(top * p!))), reps: String(r), done: false, t: 'w' as SetT }));
    setRows(rr => ({ ...rr, [ex.id]: [...w, ...rr[ex.id]!.filter(x => x.t !== 'w')] }));
  };
  const addExs = (items: LibItem[]) => {
    const add = items.map((x, k) => fromLib(x, k));
    setExs(e => [...e, ...add]); setRows(r => ({ ...r, ...Object.fromEntries(add.map(e => [e.id, mkRows(e)])) }));
    setI(exs.length);
  };
  const swap = (items: LibItem[]) => {
    const x = items[0]; if (!x || !ex) return;
    const ne = { ...fromLib(x, 0), sets: ex.sets, reps: ex.reps, rest: ex.rest, muscle: ex.muscle };
    setExs(e => e.map((y, j) => j === i ? ne : y)); setRows(r => ({ ...r, [ne.id]: mkRows(ne) }));
  };
  const allRows = exs.flatMap(e => rows[e.id] ?? []);
  const work = allRows.filter(r => r.t !== 'w');
  const doneSets = work.filter(r => r.done);
  const volume = exs.reduce((a, e) => a + (rows[e.id] ?? []).filter(r => r.done && r.t !== 'w').reduce((b, r) => b + (Number(r.kg.replace(',', '.')) || 0) * (Number(r.reps) || 0), 0), 0);
  const elapsed = Math.round((now - start.current) / 1000);
  const save = async () => {
    setBusy(true);
    try {
      const out = exs.flatMap(e => (rows[e.id] ?? []).filter(r => r.done && r.t !== 'w').map(r => ({ ex: e.id, kg: Number(r.kg.replace(',', '.')) || undefined, reps: Number(r.reps) || undefined })));
      const fb = exs.filter(e => feel[e.id]).map(e => `${e.name} : ${FEEL.find(f => f.id === feel[e.id])!.l.toLowerCase()}`);
      const msg = await saveFn(out, Math.round(elapsed / 60), rpe, exs, rows, fb.length ? `Ressenti — ${fb.join(' ; ')}` : '');
      // Historique de chaque exercice de la bibliothèque (fiche → Historique / Progrès)
      const lib = exs.flatMap(e => { const id = libIdOf(e); return id ? (rows[e.id] ?? []).filter(r => r.done && r.t !== 'w').map(r => ({ id, kg: Number(r.kg.replace(',', '.')) || undefined, reps: Number(r.reps) || undefined, ...(feel[e.id] ? { fb: feel[e.id] } : {}) })) : []; });
      if (lib.length) await forme.exBatch(lib).catch(() => {});
      clearLive();
      onFinished(newPrs.length ? `${msg} · 🏆 ${newPrs.join(', ')}` : msg);
    } catch (e) { alert(errText(e)); } finally { setBusy(false); }
  };
  const cell: CSSProperties = { background: F.bg, border: 'none', borderRadius: 9, padding: '9px 4px', fontSize: 16, fontWeight: 600, width: '100%', boxSizing: 'border-box', fontFamily: F.sans, textAlign: 'center', color: F.ink };
  const cols = '34px 1fr 64px 56px 42px';
  const tool: CSSProperties = { flex: 1, border: 'none', background: F.bg, borderRadius: 10, padding: '9px 4px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', color: F.ink, whiteSpace: 'nowrap' };
  let nNum = 0;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: F.bg, overflowY: 'auto', fontFamily: F.sans, color: F.ink, paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'rgba(245,242,250,0.94)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', padding: 'calc(8px + env(safe-area-inset-top)) 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => { if (finish) setFinish(false); else if (!allRows.some(r => r.done) || confirm('Abandonner la séance ? (rien n\'est enregistré)')) { clearLive(); onClose(); } }} aria-label="Fermer" style={{ width: 36, height: 36, border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: F.ink }}>{finish ? '‹' : '✕'}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
          <div style={{ fontSize: 12.5, color: F.muted, fontVariantNumeric: 'tabular-nums' }}>⏱ {fmtTime(elapsed)} · {doneSets.length}/{work.length} séries · {Math.round(volume)} kg</div>
        </div>
        {!finish && <button onClick={toggleVoice} aria-label="Coach vocal" style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: voice ? F.soft : F.bg2, cursor: 'pointer', fontSize: 16 }}>{voice ? '🔊' : '🔇'}</button>}
        {!finish && <button onClick={() => { setRest(null); setFinish(true); speak('Séance terminée. Bravo !'); }} style={{ ...btn, padding: '9px 16px', fontSize: 14, boxShadow: 'none' }}>Terminer</button>}
      </div>
      {finish ? (
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ fontSize: 64 }}>🏆</motion.div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>Bien joué !</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 18 }}>
            {[[fmtTime(elapsed), 'Durée'], [`${Math.round(volume)} kg`, 'Volume'], [String(doneSets.length), 'Séries']].map(([v, l]) => <div key={l} style={{ ...card, padding: 12 }}><div style={{ fontSize: 19, fontWeight: 700 }}>{v}</div><div style={{ fontSize: 12, color: F.muted }}>{l}</div></div>)}
          </div>
          {newPrs.length > 0 && <div style={{ ...card, marginTop: 10, background: '#fff6df', fontWeight: 600 }}>🏆 Record{newPrs.length > 1 ? 's' : ''} battu{newPrs.length > 1 ? 's' : ''} : {newPrs.join(', ')}</div>}
          <div style={{ ...card, marginTop: 10, textAlign: 'start', padding: '4px 14px' }}>
            {exs.filter(e => (rows[e.id] ?? []).some(r => r.done && r.t !== 'w')).map((e, k, arr) => { const d = rows[e.id]!.filter(r => r.done && r.t !== 'w'); const top = d.reduce((a, r) => (Number(r.kg) || 0) > (Number(a.kg) || 0) ? r : a, d[0]!); return (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: k < arr.length - 1 ? `1px solid ${F.line}` : 'none', fontSize: 14 }}><span style={{ fontWeight: 600 }}>{d.length} × {e.name}</span><span style={{ color: F.muted, whiteSpace: 'nowrap' }}>{top.kg ? `${top.kg} kg × ${top.reps}` : `${top.reps} reps`}</span></div>); })}
          </div>
          <div style={{ fontWeight: 600, marginTop: 22 }}>C'était dur comment ?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 10 }}>{[5, 6, 7, 8, 9].map(n => <button key={n} onClick={() => setRpe(n)} style={{ ...ghostBtn, borderRadius: 12, padding: '13px 0', background: rpe === n ? F.accent : '#fff', color: rpe === n ? '#fff' : F.ink }}>{n}</button>)}</div>
          <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>5 = facile · 9 = à fond</div>
          <button disabled={busy || !doneSets.length} onClick={save} style={{ ...btn, width: '100%', marginTop: 22, opacity: doneSets.length ? 1 : 0.5 }}>{busy ? 'Enregistrement…' : doneSets.length ? 'Enregistrer ma séance' : 'Aucune série validée'}</button>
          {doneSets.length > 0 && <button onClick={() => void shareCard({ title: s.label, dur: fmtTime(elapsed), volume, sets: doneSets.length, prs: newPrs, lines: exs.filter(e => (rows[e.id] ?? []).some(r => r.done && r.t !== 'w')).map(e => { const d = rows[e.id]!.filter(r => r.done && r.t !== 'w'); const top = Math.max(...d.map(r => Number(r.kg.replace(',', '.')) || 0)); return `${d.length} × ${e.name}${top ? ` · ${top} kg` : ''}`; }) })} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>📤 Partager ma séance (image)</button>}
        </div>
      ) : <>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 14px 8px', scrollbarWidth: 'none' }}>
          {exs.map((e, j) => { const ok = (rows[e.id] ?? []).length > 0 && rows[e.id]!.every(r => r.done); return (
            <button key={e.id} onClick={() => setI(j)} style={{ flexShrink: 0, border: j === i ? `2px solid ${F.accent}` : '2px solid transparent', borderRadius: 14, background: ok ? '#dff3e7' : F.tile, width: 54, height: 54, padding: 3, cursor: 'pointer', position: 'relative' }}>
              {e.demo.length ? <Anim img={e.demo} alt="" h={44} /> : '🏋️'}
              {ok && <span style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, background: F.green, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
            </button>); })}
          <button onClick={() => setPicker('add')} aria-label="Ajouter un exercice" style={{ flexShrink: 0, borderRadius: 14, border: `2px dashed ${F.line}`, background: 'transparent', width: 54, height: 54, fontSize: 22, color: F.muted, cursor: 'pointer' }}>＋</button>
        </div>
        {!ex ? (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 44 }}>🏋️</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>Séance libre</div>
            <div style={{ color: F.muted, fontSize: 14, marginTop: 4 }}>Ajoute les exercices que tu fais, au fur et à mesure.</div>
            <button onClick={() => setPicker('add')} style={{ ...btn, marginTop: 16 }}>＋ Ajouter un exercice</button>
          </div>
        ) : (
        <AnimatePresence mode="wait">
          <motion.div key={ex.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} style={{ padding: '0 14px' }}>
            <div style={{ ...card, padding: 0, overflow: 'hidden', position: 'relative' }}>
              <AnimatePresence>{flash && <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 2, background: F.dark, color: '#fff', borderRadius: 12, padding: '10px 12px', fontWeight: 600, textAlign: 'center' }}>{flash}</motion.div>}</AnimatePresence>
              <div style={{ background: F.tile, height: 200, display: 'flex', alignItems: 'center', padding: 8, boxSizing: 'border-box' }}>{ex.demo.length ? <Anim img={ex.demo} alt={ex.name} h={184} /> : <div style={{ margin: 'auto', fontSize: 50 }}>🏋️</div>}</div>
              <div style={{ padding: '12px 14px 4px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: F.accent }}>{i + 1}/{exs.length}{ex.muscle ? ` · ${MUSCLE[ex.muscle] ?? ex.muscle}` : ''} · repos {ex.rest}s{best(ex) ? ` · record ${best(ex)} kg` : ''}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 2 }}>{ex.name}</div>
                  </div>
                  <button onClick={() => setHow(true)} aria-label="Comment faire" style={{ width: 34, height: 34, borderRadius: 17, border: `1px solid ${F.line}`, background: '#fff', cursor: 'pointer', fontWeight: 700, color: F.accent, flexShrink: 0 }}>i</button>
                </div>
                {ex.tip && <div style={{ fontSize: 13.5, color: F.muted, marginTop: 6, lineHeight: 1.4 }}>💡 {ex.tip}</div>}
                {ex.suggestion.up && <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: F.green }}>↑ On monte à {ex.suggestion.kg} kg aujourd'hui</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={warmup} style={tool}>🔥 Échauffement</button>
                  <button onClick={() => setPlates(true)} style={tool}>🧮 Disques</button>
                  <button onClick={() => setPicker('swap')} style={tool}>🔁 Remplacer</button>
                </div>
              </div>
              <div style={{ padding: '6px 10px 10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, fontSize: 11, fontWeight: 600, color: F.muted, padding: '6px 4px', textAlign: 'center' }}><div>SÉRIE</div><div>PRÉCÉDENT</div><div>KG</div><div>{ex.timed ? 'SEC' : 'REPS'}</div><div>✓</div></div>
                {sets.map((r, k) => { const look = r.t !== 'n' ? T_LOOK[r.t] : null; if (r.t === 'n') nNum++; const num = nNum; return (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'center', padding: '4px', borderRadius: 10, background: r.done ? '#dff3e7' : 'transparent', transition: 'background .2s' }}>
                    <button onClick={() => upd(k, { t: T_NEXT[r.t] })} title={look?.name ?? 'Série normale — touche pour changer le type'} style={{ fontWeight: 700, textAlign: 'center', border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, color: look?.c ?? F.ink, fontFamily: 'inherit' }}>{look?.l ?? num}</button>
                    <div style={{ fontSize: 13, color: F.muted, textAlign: 'center' }}>{r.t === 'w' ? '—' : prevOf(ex.suggestion.last, num - 1)}</div>
                    <input inputMode="decimal" value={r.kg} onChange={e => upd(k, { kg: e.target.value })} placeholder="—" style={{ ...cell, background: r.done ? 'transparent' : F.bg }} />
                    <input inputMode="numeric" value={r.reps} onChange={e => upd(k, { reps: e.target.value })} placeholder="—" style={{ ...cell, background: r.done ? 'transparent' : F.bg }} />
                    <button onClick={() => r.done ? upd(k, { done: false }) : validate(k)} aria-label="Série faite" style={{ width: 38, height: 36, borderRadius: 10, border: 'none', background: r.done ? F.green : F.bg2, color: r.done ? '#fff' : F.muted, fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                  </div>); })}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => setRows(rr => { const l = rr[ex.id]!; const last = [...l].reverse().find(x => x.t !== 'w'); return { ...rr, [ex.id]: [...l, { kg: last?.kg ?? '', reps: last?.reps ?? '', done: false, t: 'n' }] }; })} style={{ ...tool, fontSize: 14, padding: 10 }}>+ Ajouter une série</button>
                  {sets.length > 1 && <button onClick={() => setRows(rr => ({ ...rr, [ex.id]: rr[ex.id]!.slice(0, -1) }))} style={{ ...tool, flex: '0 0 auto', padding: '10px 14px', fontSize: 14 }}>−</button>}
                </div>
                {sets.length > 0 && sets.filter(r => r.t !== 'w').every(r => r.done) && <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: F.muted, textAlign: 'center', marginBottom: 6 }}>Ton ressenti ? (la charge s'adapte la prochaine fois)</div>
                  <div style={{ display: 'flex', gap: 6 }}>{FEEL.map(f => <button key={f.id} onClick={() => { vibrate(15); setFeel(x => ({ ...x, [ex.id]: f.id })); if (i < exs.length - 1) setTimeout(() => setI(i + 1), 500); }} style={{ ...tool, fontSize: 13.5, padding: 10, background: feel[ex.id] === f.id ? F.accent : F.bg, color: feel[ex.id] === f.id ? '#fff' : F.ink }}>{f.e} {f.l}</button>)}</div>
                </div>}
                <div style={{ fontSize: 11.5, color: F.muted, textAlign: 'center', marginTop: 6 }}>Touche le n° de série : W échauffement · D dégressive · F échec</div>
                <input value={note} onChange={e => { setNote(e.target.value); try { localStorage.setItem(noteKey(ex), e.target.value); } catch { /* */ } }} placeholder="📝 Note (ex. siège cran 4, prise serrée…) — gardée pour la prochaine fois" style={{ ...input, marginTop: 10, fontSize: 14, padding: '10px 12px', background: F.bg, border: 'none' }} />
              </div>
            </div>
            {ex.alt.length > 0 && <div style={{ fontSize: 13, color: F.muted, margin: '10px 4px 0' }}>Machine prise ? Remplace par : {ex.alt.join(' · ')}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button disabled={i === 0} onClick={() => setI(i - 1)} style={{ ...ghostBtn, flex: 1, opacity: i ? 1 : 0.4 }}>‹ Précédent</button>
              <button onClick={() => i < exs.length - 1 ? setI(i + 1) : setFinish(true)} style={{ ...ghostBtn, flex: 1 }}>{i < exs.length - 1 ? 'Suivant ›' : 'Terminer'}</button>
            </div>
          </motion.div>
        </AnimatePresence>)}
        <ExerciseSheet session={how && ex ? ex : null} onClose={() => setHow(false)} z={70} />
      </>}
      <LibraryPicker open={!!picker} onClose={() => setPicker(null)} multi={picker === 'add'} title={picker === 'swap' ? 'Remplacer par…' : 'Ajouter des exercices'} group={picker === 'swap' && ex ? COACH_TO_GROUP[ex.muscle] ?? null : null} likeId={picker === 'swap' && ex ? libIdOf(ex) : null} onPick={items => picker === 'swap' ? swap(items) : addExs(items)} />
      <PlateCalc open={plates} onClose={() => setPlates(false)} kg0={Number(sets.find(r => r.t !== 'w')?.kg.replace(',', '.')) || 0} />
      <AnimatePresence>{rest && !finish && <RestBar key={rest.key} seconds={rest.n} onDone={endRest} />}</AnimatePresence>
    </div>
  );
}

// ── MES ROUTINES + SÉANCE LIBRE (Hevy) ─────────────────────────────────────────
function RoutineEditor({ open, init, onClose, onSaved }: { open: boolean; init: Routine | null; onClose: () => void; onSaved: (l: Routine[]) => void }) {
  const [name, setName] = useState(''); const [exs, setExs] = useState<RoutineEx[]>([]); const [pick, setPick] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setName(init?.name ?? ''); setExs(init?.exercises ?? []); setErr(''); } }, [open, init]);
  const add = (items: LibItem[]) => setExs(e => [...e, ...items.map(x => ({ id: x.id, name: x.fr, img: x.img, sets: 3, reps: '10', rest: 90 }))]);
  const mv = (k: number, d: number) => setExs(e => { const n = [...e]; const [x] = n.splice(k, 1); n.splice(Math.max(0, Math.min(n.length, k + d)), 0, x!); return n; });
  const small: CSSProperties = { ...input, width: 52, padding: '7px 4px', textAlign: 'center', fontSize: 15, fontWeight: 600 };
  return (
    <Sheet open={open} onClose={onClose} title={<div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>{init ? 'Modifier la routine' : 'Nouvelle routine'}</div>}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom (ex. Pecs lourd, Jambes maison…)" style={{ ...input, marginBottom: 12 }} />
      {exs.map((e, k) => (
        <div key={`${e.id}-${k}`} style={{ ...card, padding: 10, marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ ...thumb, width: 52, height: 52 }}>{e.img.length ? <Anim img={e.img} alt="" h={44} /> : '🏋️'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: 12.5, color: F.muted }}>
              <input inputMode="numeric" value={e.sets} onChange={v => setExs(l => l.map((y, j) => j === k ? { ...y, sets: Number(v.target.value) || 1 } : y))} style={small} />séries ×
              <input value={e.reps} onChange={v => setExs(l => l.map((y, j) => j === k ? { ...y, reps: v.target.value } : y))} style={small} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button onClick={() => mv(k, -1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: F.muted }}>▲</button>
            <button onClick={() => mv(k, 1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: F.muted }}>▼</button>
          </div>
          <button onClick={() => setExs(l => l.filter((_, j) => j !== k))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: F.red, fontSize: 16 }}>✕</button>
        </div>
      ))}
      <button onClick={() => setPick(true)} style={{ ...ghostBtn, width: '100%', borderStyle: 'dashed' }}>＋ Ajouter des exercices</button>
      {err && <div style={{ color: F.red, marginTop: 8 }}>{err}</div>}
      <button disabled={busy} onClick={async () => { if (!name.trim() || !exs.length) { setErr('Donne un nom et ajoute au moins un exercice.'); return; } setBusy(true); try { onSaved((await forme.saveRoutine({ id: init?.id, name: name.trim(), exercises: exs })).routines); onClose(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); } }} style={{ ...btn, width: '100%', marginTop: 12 }}>{busy ? 'Enregistrement…' : 'Enregistrer la routine'}</button>
      <LibraryPicker open={pick} onClose={() => setPick(false)} multi onPick={add} />
    </Sheet>
  );
}

/** Routine (ou séance libre) → séance jouable : « précédent » et charge reprises de l'historique de chaque exercice. */
async function routineSession(r: Routine | null): Promise<SportSession> {
  const exs = r?.exercises ?? [];
  const last: Record<string, ExSet[]> = exs.length ? (await forme.exLast(exs.map(e => e.id)).catch(() => ({ last: {} as Record<string, ExSet[]> }))).last : {};
  const today = new Date().toISOString().slice(0, 10);
  return { date: today, type: 'push', label: r?.name ?? 'Séance libre', emoji: '⭐', focus: '', muscles: [], warmup: '', finisher: null, estMin: exs.length * 8, start: new Date().toISOString(), end: '', minutes: 0, arrived: null,
    exercises: exs.map((e, k) => {
      const l = (last[e.id] ?? []).filter(x => x.kg || x.reps); const top = l.reduce((a, x) => Math.max(a, x.kg ?? 0), 0);
      return { id: `${e.id}~${k}`, libId: e.id, name: e.name, muscle: '', sets: e.sets, reps: e.reps, rest: e.rest, tip: '', alt: [], timed: false, demo: e.img,
        video: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${e.name} technique musculation`)}`,
        suggestion: { kg: (top ? Math.max(0, top + (l.some(x => x.fb === 'easy') ? 2.5 : l.some(x => x.fb === 'hard') ? -2.5 : 0)) : 0) || null, up: l.some(x => x.fb === 'easy'), ...(l.length ? { last: `${l.length}×${l.map(x => x.reps ?? '?').join('/')} à ${top} kg (${l[0]!.date.slice(8)}/${l[0]!.date.slice(5, 7)})` } : {}) } } as PEx;
    }) } as unknown as SportSession;
}

function Routines({ toast, prs, onDone }: { toast: (t: string) => void; prs: Record<string, number>; onDone?: () => void }) {
  const [list, setList] = useState<Routine[] | null>(null);
  const [edit, setEdit] = useState<Routine | null | 'new'>(null);
  const [play, setPlay] = useState<SportSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { forme.routines().then(r => setList(r.routines)).catch(() => setList([])); }, []);
  const go = async (r: Routine | null) => { setBusy(r?.id ?? 'free'); try { setPlay(await routineSession(r)); } finally { setBusy(null); } };
  return (
    <>
      <H2 right={<button onClick={() => setEdit('new')} style={{ border: 'none', background: 'none', color: F.accent, fontWeight: 600, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit' }}>＋ Nouvelle</button>}>Mes routines</H2>
      <button onClick={() => void go(null)} style={{ ...card, width: '100%', border: 'none', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'inherit', color: F.ink, textAlign: 'start' }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: F.soft, color: F.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{busy === 'free' ? <Spinner size={18} /> : '＋'}</div>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>Séance libre</div><div style={{ fontSize: 12.5, color: F.muted }}>Commence vide, ajoute tes exercices au fur et à mesure</div></div>
      </button>
      {list?.map(r => (
        <div key={r.id} style={{ ...card, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 16 }}>{r.name}</div><div style={{ fontSize: 12.5, color: F.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.exercises.map(e => e.name).join(', ')}</div></div>
            <button onClick={() => setEdit(r)} aria-label="Modifier" style={{ border: 'none', background: F.bg, borderRadius: 10, width: 34, height: 34, cursor: 'pointer' }}>✎</button>
            <button onClick={async () => { if (confirm(`Supprimer « ${r.name} » ?`)) setList((await forme.delRoutine(r.id)).routines); }} aria-label="Supprimer" style={{ border: 'none', background: F.bg, borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: F.red }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '10px 0', scrollbarWidth: 'none' }}>{r.exercises.map((e, k) => <div key={k} style={{ ...thumb, width: 54, height: 54 }}>{e.img.length ? <Anim img={e.img} alt="" h={46} /> : '🏋️'}</div>)}</div>
          <button onClick={() => void go(r)} style={{ ...btn, width: '100%', padding: '11px 16px', fontSize: 14.5 }}>{busy === r.id ? '…' : '▶ Démarrer la routine'}</button>
        </div>
      ))}
      <RoutineEditor open={!!edit} init={edit && edit !== 'new' ? edit : null} onClose={() => setEdit(null)} onSaved={setList} />
      {play && <Player s={play} prs={prs} kind="routine" onClose={() => setPlay(null)} onFinished={msg => { setPlay(null); toast(msg); onDone?.(); }} save={async (sets, durationMin, rpe) => {
        await forme.log('workout', { session: 0, label: play.label, sets, durationMin, rpe });
        return `💪 ${play.label} enregistrée`;
      }} />}
    </>
  );
}

/** Séance interrompue (appel, appli fermée…) → bandeau « Reprendre ». */
function ResumeBanner({ toast, onDone }: { toast: (t: string) => void; onDone?: () => void }) {
  const [live, setLive] = useState<LiveState | null>(() => readLive());
  const [play, setPlay] = useState(false);
  if (!live) return null;
  const done = Object.values(live.rows).flat().filter(r => r.done).length;
  return (
    <>
      <div style={{ ...card, marginTop: 14, background: F.dark, color: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 24 }}>⏱</span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>Séance en cours : {live.s.label}</div><div style={{ fontSize: 12.5, opacity: 0.7 }}>{done} série{done > 1 ? 's' : ''} déjà validée{done > 1 ? 's' : ''}</div></div>
        <button onClick={() => setPlay(true)} style={{ ...btn, padding: '10px 14px', fontSize: 14 }}>Reprendre</button>
        <button onClick={() => { if (confirm('Abandonner cette séance ?')) { try { localStorage.removeItem(LIVE_K); } catch { /* */ } setLive(null); } }} aria-label="Abandonner" style={{ border: 'none', background: 'none', color: '#fff', opacity: 0.6, fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>
      {play && <Player s={live.s} resume={live} kind={live.kind} onClose={() => { setPlay(false); setLive(readLive()); }} onFinished={msg => { setPlay(false); setLive(null); toast(msg); onDone?.(); }} save={async (sets, durationMin, rpe, _e, _r, note) => {
        if (live.kind === 'coach') {
          const r = await apiFetch<{ prs: string[] }>('/api/sport/log', { method: 'POST', body: JSON.stringify({ date: live.s.date, type: live.s.type, sets, durationMin, rpe, ...(note ? { note } : {}) }) });
          return `💪 Séance enregistrée${r.prs.length ? ` — 🏆 record : ${r.prs.join(', ')}` : ''} · Dzaryx est prévenu`;
        }
        await forme.log('workout', { session: (live.s as unknown as { index?: number }).index ?? 0, label: live.s.label, sets, durationMin, rpe });
        return `💪 ${live.s.label} enregistrée`;
      }} />}
    </>
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
  const prs = Object.fromEntries(d.stats.prs.map(p => [norm(p.ex), p.kg]));
  const dateLong = new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div style={{ padding: '0 14px' }}>
      <div style={{ fontSize: 13, color: F.muted, fontWeight: 500, margin: '2px 2px 0', textTransform: 'capitalize' }}>{dateLong}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px' }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Entraînement</div>
        <WeekGoal />
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
      <ResumeBanner toast={toast} onDone={() => void load()} />
      <TodayForm />
      {s ? <SessionCard s={s} kicker={isToday ? "Aujourd'hui" : `${pick ? '' : 'Prochaine · '}${SHORT_DAYS[dayOf(s.date)]} ${s.date.slice(8)} · ${new Date(s.start).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`} onStart={() => setPlay(s)} onEx={setEx} start={isToday ? 'Démarrer l\'entraînement' : 'Voir / faire cette séance'} />
        : <div style={{ ...card, marginTop: 14 }}>Pas de séance prévue cette semaine. Dis à Dzaryx « cale mes séances » 💬</div>}
      {s && <>
        <H2 right={<span style={{ fontSize: 13, color: F.muted }}>{s.exercises.length}</span>}>Exercices</H2>
        <div style={{ ...card, padding: '4px 14px' }}>{s.exercises.map((e, k) => <div key={e.id} style={{ borderBottom: k < s.exercises.length - 1 ? `1px solid ${F.line}` : 'none' }}><ExRow e={e} onClick={() => setEx(e)} /></div>)}</div>
      </>}
      <Routines toast={toast} prs={prs} onDone={() => void load()} />
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
      {play && <Player s={play} prs={prs} onClose={() => setPlay(null)} onFinished={msg => { setPlay(null); toast(msg); void load(); }} save={async (sets, durationMin, rpe, _exs, _rows, note) => {
        const r = await apiFetch<{ prs: string[] }>('/api/sport/log', { method: 'POST', body: JSON.stringify({ date: d.week[0]?.date ?? play.date, type: play.type, sets, durationMin, rpe, ...(note ? { note } : {}) }) });
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
      <ResumeBanner toast={toast} onDone={() => void load()} />
      {s && <SessionCard s={s as unknown as SportSession} kicker={d.doneToday ? 'Faite aujourd\'hui ✓ · prochaine' : d.todayPlanned ? "Aujourd'hui" : 'Prochaine séance'} onStart={() => setPlay(true)} onEx={setEx} start="Démarrer l'entraînement" />}
      {s && <>
        <H2>Exercices</H2>
        <div style={{ ...card, padding: '4px 14px' }}>{s.exercises.map((e, k) => <div key={e.id} style={{ borderBottom: k < s.exercises.length - 1 ? `1px solid ${F.line}` : 'none' }}><ExRow e={e} onClick={() => setEx(e)} /></div>)}</div>
      </>}
      <Routines toast={toast} prs={{}} onDone={() => void load()} />
      <Shortcuts go={go} />
      <H2>Toutes les séances</H2>
      <div style={{ ...card, padding: '4px 14px' }}>{d.sessions.map((x, i) => <div key={i} style={{ padding: '11px 0', borderBottom: i < d.sessions.length - 1 ? `1px solid ${F.line}` : 'none', fontSize: 14.5 }}>{x.emoji} <b>{x.label}</b> <span style={{ color: F.muted }}>· {x.focus}</span></div>)}</div>
      <button disabled={busy} onClick={async () => { if (!confirm('Refaire un nouveau programme ?')) return; setBusy(true); try { setD(await forme.newProgram()); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }} style={{ ...ghostBtn, width: '100%', marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>{busy ? <><Spinner size={16} /> …</> : '🔄 Nouveau programme'}</button>
      <ExerciseSheet session={ex} onClose={() => setEx(null)} />
      {play && s && <Player s={s as unknown as SportSession} kind="routine" onClose={() => setPlay(false)} onFinished={msg => { setPlay(false); toast(msg); void load(); }} save={async (sets, durationMin, rpe) => {
        await forme.log('workout', { session: s.index, label: s.label, sets, durationMin, rpe });
        return '💪 Séance enregistrée';
      }} />}
    </div>
  );
}
