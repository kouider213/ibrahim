import { DidButton } from './Did.tsx';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, type SportOverview, type SportSession, type SportExercise, type SportType } from '../services/api.ts';
import { errText, SHORT_DAYS, dayOf, vibrate, forme, compressImage, type MachineEx, type MachineScan, type ProgramView, type LibItem, type Routine, type RoutineEx, type ExSet } from './api.ts';
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
type SetRow = { kg: string; reps: string; done: boolean; t: SetT; at?: number };
// 07/11 : défi du jour = un exercice déjà fait avant (pour pouvoir comparer), choisi selon la date
const challengeOf = (exs: PEx[], seed: string): string | null => {
  const ok = exs.filter(e => e.suggestion.last && !e.timed);
  if (!ok.length) return null;
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return ok[h % ok.length]!.id;
};
// Temps entre deux séries validées d'un même exercice, moins ~30 s pour la série elle-même = repos approximatif
const restsOf = (exs: PEx[], rows: Record<string, SetRow[]>): Record<string, number[]> => Object.fromEntries(exs.map(e => {
  const t = (rows[e.id] ?? []).filter(r => r.done && r.at).map(r => r.at!).sort((a, b) => a - b);
  return [e.id, t.slice(1).map((x, k) => Math.round((x - t[k]!) / 1000) - 30).filter(x => x > 0)];
}).filter(([, v]) => (v as number[]).length));
const logExtras = (exs: PEx[], rows: Record<string, SetRow[]>, date: string) => ({ names: exNames(exs), planned: exs.length, rests: restsOf(exs, rows), challenge: challengeOf(exs, date) ?? undefined });
type PEx = SportExercise & { libId?: string | null };
type SaveFn = (sets: Array<{ ex: string; kg?: number; reps?: number }>, durationMin: number, rpe: number, exs: PEx[], rows: Record<string, SetRow[]>, note: string) => Promise<string>;
const T_NEXT: Record<SetT, SetT> = { n: 'w', w: 'd', d: 'f', f: 'n' };
const T_LOOK: Record<Exclude<SetT, 'n'>, { l: string; c: string; name: string }> = { w: { l: 'W', c: '#e08a00', name: 'Échauffement' }, d: { l: 'D', c: '#7b5cf0', name: 'Dégressive' }, f: { l: 'F', c: '#e5322d', name: 'Échec' } };
// 13/11 Kouider : le tapis (vélo, elliptique…) n'est pas une série × kg × reps → une seule ligne en MINUTES, hors séries/volume
const isCardioEx = (e: PEx) => e.muscle === 'cardio' || (/tapis|treadmill|ellipti|stepper|escalier|corde [àa] sauter|^(marche|course|v[ée]lo|rameur)\b|cardio/i.test(e.name) && !/fermier|farmer|crunch/i.test(e.name));
const cardioMin = (e: PEx) => Number(/(\d{1,3})\s*min/.exec(e.reps)?.[1] ?? /(\d{1,3})\s*min/.exec(e.tip)?.[1] ?? 10);
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

// 07/11 : exercice d'une machine scannée → exercice de la séance (séries / kg / reps comme les autres)
export const fromScan = (x: MachineEx, k: number): PEx => ({ id: `${x.id ?? 'scan'}~${Date.now().toString(36)}${k}`, libId: x.id, name: x.name, muscle: '', sets: 3, reps: '10', rest: 90, tip: x.tip ?? '', alt: [], timed: false, demo: x.img ?? [], video: x.video, suggestion: { kg: null } });
/** Scanner (hors séance) : ajoute des exercices à la séance en cours gardée sur le téléphone. */
export function addToLive(items: MachineEx[]): boolean {
  const live = readLive(); if (!live) return false;
  const add = items.map((x, k) => fromScan(x, k));
  const rows = { ...live.rows, ...Object.fromEntries(add.map(e => [e.id, Array.from({ length: e.sets }, () => ({ kg: '', reps: e.reps, done: false, t: 'n' as SetT }))])) };
  try { localStorage.setItem(LIVE_K, JSON.stringify({ ...live, exs: [...live.exs, ...add], rows, i: live.exs.length, at: Date.now() })); return true; } catch { return false; }
}
const fromLib = (x: LibItem, k: number): PEx => ({ id: `${x.id}~${Date.now().toString(36)}${k}`, libId: x.id, name: x.fr, muscle: '', sets: 3, reps: '10', rest: 90, tip: '', alt: [], timed: false, demo: x.img, video: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${x.name} technique musculation`)}`, suggestion: { kg: null } });

// Séance en cours gardée sur le téléphone (Hevy) : appel, écran verrouillé, appli fermée → on la reprend telle quelle.
export const LIVE_K = 'forme:live';
export interface LiveState { kind: 'coach' | 'routine'; s: SportSession; exs: PEx[]; rows: Record<string, SetRow[]>; i: number; start: number; feel: Record<string, Feel>; at: number; ss?: Record<string, boolean> }
export function readLive(): LiveState | null { try { const v = JSON.parse(localStorage.getItem(LIVE_K) ?? 'null') as LiveState | null; return v && Date.now() - v.at < 8 * 3600_000 ? v : null; } catch { return null; } }
const clearLive = () => { try { localStorage.removeItem(LIVE_K); } catch { /* */ } };
const noteKey = (e: PEx) => `forme:exnote:${libIdOf(e) ?? norm(e.name)}`;

function Player({ s, onClose, onFinished, save: saveFn, prs = {}, kind = 'coach', resume }: { s: SportSession; onClose: () => void; onFinished: (msg: string) => void; save: SaveFn; prs?: Record<string, number>; kind?: 'coach' | 'routine'; resume?: LiveState | null }) {
  const mkRows = (e: PEx): SetRow[] => isCardioEx(e) ? [{ kg: '', reps: String(cardioMin(e)), done: false, t: 'n' as SetT }] : Array.from({ length: e.sets }, () => ({ kg: e.suggestion.kg ? String(e.suggestion.kg) : '', reps: String(parseInt(e.reps) || ''), done: false, t: 'n' as SetT }));
  const [exs, setExs] = useState<PEx[]>(() => resume?.exs ?? s.exercises.map(e => ({ ...e })));
  const [i, setI] = useState(resume?.i ?? 0);
  const [how, setHow] = useState(false);
  const [rows, setRows] = useState<Record<string, SetRow[]>>(() => resume?.rows ?? Object.fromEntries(s.exercises.map(e => [e.id, mkRows(e)])));
  const [rest, setRest] = useState<{ n: number; key: number } | null>(null);
  const [finish, setFinish] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<'add' | 'swap' | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [plates, setPlates] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [newPrs, setNewPrs] = useState<string[]>([]);
  const [feel, setFeel] = useState<Record<string, Feel>>(resume?.feel ?? {});
  // 13/11 : SUPERSETS (Hevy) — ss[idA] = A enchaîné avec l'exercice suivant, sans repos entre les deux
  const [ss, setSs] = useState<Record<string, boolean>>(resume?.ss ?? {});
  // 13/11 : HORS LIGNE (sous-sol de la salle) — tout reste sur le téléphone, l'envoi repart tout seul quand le réseau revient
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const [pendingSave, setPendingSave] = useState(false);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem(VOICE_K) !== '0'; } catch { return true; } });
  const toggleVoice = () => { const v = !voice; setVoice(v); try { localStorage.setItem(VOICE_K, v ? '1' : '0'); } catch { /* */ } if (v) speak('Coach vocal activé'); else speechSynthesis.cancel(); };
  const start = useRef(resume?.start ?? Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (Object.values(rows).flat().some(r => r.done) || exs.length !== s.exercises.length || exs.some((e, j) => e.id !== s.exercises[j]?.id)) { try { localStorage.setItem(LIVE_K, JSON.stringify({ kind, s, exs, rows, i, start: start.current, feel, at: Date.now(), ss } satisfies LiveState)); } catch { /* */ } } }, [rows, exs, i, feel, ss]); // eslint-disable-line react-hooks/exhaustive-deps
  const [note, setNote] = useState('');
  const ex = exs[Math.min(i, exs.length - 1)];
  const chal = useRef(kind === 'coach' ? challengeOf(s.exercises, s.date) : null).current;
  // 07/11 : 💧 rappel « bois » toutes les 20 min de séance
  const lastWater = useRef(0);
  useEffect(() => {
    const m = Math.floor((Date.now() - start.current) / 1_200_000);
    if (m >= 1 && m !== lastWater.current && !finish) { lastWater.current = m; vibrate(60); speak('Pense à boire une gorgée d\'eau.'); setFlash('💧 Bois une gorgée d\'eau'); setTimeout(() => setFlash(null), 4000); }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps
  // 07/11 : échauffement général chronométré (5 min) avant la 1re série
  const [warm, setWarm] = useState<number | null>(null);
  // 09/11 : le chrono suit la durée écrite dans la séance (« 8 min cardio facile… ») au lieu d'annoncer toujours 5 min.
  const warmMin = Math.max(3, Math.min(15, Number(/(\d{1,2})\s*min/.exec(s.warmup ?? '')?.[1] ?? 5)));
  useEffect(() => { if (warm && now >= warm) { setWarm(null); vibrate(200); speak('Échauffement terminé. On attaque !'); } }, [now, warm]);
  useEffect(() => { if (ex) { try { setNote(localStorage.getItem(noteKey(ex)) ?? ''); } catch { setNote(''); } } }, [ex?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ex && !finish) speak(`${i === 0 ? 'On commence' : 'Exercice suivant'} : ${ex.name}. ${isCardioEx(ex) ? `${rows[ex.id]?.[0]?.reps || cardioMin(ex)} minutes` : `${ex.sets} séries de ${ex.reps}`}${ex.suggestion.kg ? `, à ${ex.suggestion.kg} kilos` : ''}.`); }, [ex?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sets = ex ? rows[ex.id] ?? [] : [];
  const upd = (k: number, patch: Partial<SetRow>) => ex && setRows(r => ({ ...r, [ex.id]: r[ex.id]!.map((x, j) => j === k ? { ...x, ...patch } : x) }));
  const endRest = useCallback(() => { setRest(null); speak('C\'est reparti !'); }, []);
  // 10/11 : un ancien poids mal noté (« 30 kg » jamais fait) se corrige en touchant la colonne PRÉCÉDENT
  const [prFix, setPrFix] = useState<Record<string, number>>({});
  const best = (e: PEx) => prFix[e.id] ?? prs[norm(e.name)] ?? 0;
  const fixPrev = async () => {
    if (!ex) return;
    const m = /à ([\d.,]+) kg \((\d\d)\/(\d\d)\)/.exec(ex.suggestion.last ?? '');
    if (!m) return;
    const v = prompt(`Le ${m[2]}/${m[3]}, j'ai noté ${m[1]} kg sur « ${ex.name} ».\nSi c'est faux, écris le vrai poids (kg) :`, '');
    const kg = Number((v ?? '').replace(',', '.'));
    if (!(kg > 0) || kg === Number(m[1].replace(',', '.'))) return;
    const base = { ex: ex.id, ...(libIdOf(ex) ? { libId: libIdOf(ex)! } : {}), kg };
    try {
      let r = await forme.fixPrev({ ...base, day: `${m[2]}/${m[3]}` });
      if (!r.fixed) { setFlash('Je n\'ai pas retrouvé cette séance'); setTimeout(() => setFlash(null), 3000); return; }
      const fr = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
      if (r.higher.length && confirm(`Corrigé : ${kg} kg le ${m[2]}/${m[3]}.\n\nIl reste aussi ${r.higher.map(h => `${h.kg} kg le ${fr(h.date)}`).join(', ')}.\nC'est faux aussi ? OK = je les mets à ${kg} kg.`)) {
        for (const h of r.higher) r = await forme.fixPrev({ ...base, date: h.date });
      }
      const old = String(ex.suggestion.kg ?? '');
      setPrFix(p => ({ ...p, [ex.id]: r.best }));
      setExs(e => e.map(y => y.id === ex.id ? { ...y, suggestion: { kg, last: (y.suggestion.last ?? '').replace(`à ${m[1]} kg`, `à ${kg} kg`) } } : y));
      setRows(rw => ({ ...rw, [ex.id]: (rw[ex.id] ?? []).map(x => !x.done && x.t !== 'w' && x.kg === old ? { ...x, kg: String(kg) } : x) }));
      setFlash(`✅ Corrigé : ${kg} kg`); setTimeout(() => setFlash(null), 3000);
    } catch (e) { setFlash(errText(e)); setTimeout(() => setFlash(null), 4000); }
  };
  const validate = (k: number) => {
    if (!ex) return;
    vibrate(25);
    const r0 = rows[ex.id]![k]!;
    const kg = Number(r0.kg.replace(',', '.')) || 0;
    if (r0.t !== 'w' && kg > 0 && best(ex) > 0 && kg > best(ex) && !newPrs.includes(ex.name)) { setNewPrs(p => [...p, ex.name]); setFlash(`🏆 Nouveau record : ${kg} kg !`); vibrate(300); setTimeout(() => setFlash(null), 3500); }
    setRows(r => ({ ...r, [ex.id]: r[ex.id]!.map((x, j) => j === k ? { ...x, done: true, at: Date.now() } : j === k + 1 && !x.done ? { ...x, kg: x.kg || r0.kg } : x) }));
    const last = sets.every((x, j) => j === k || x.done);
    if (isCardioEx(ex)) { speak('Cardio noté. Bien joué !'); if (i < exs.length - 1) setTimeout(() => setI(i + 1), 600); return; }
    if (r0.t !== 'w') {
      const nx = exs[i + 1], pv = exs[i - 1];
      // A d'un superset → B tout de suite, sans repos
      if (ss[ex.id] && nx && (rows[nx.id] ?? []).some(x => !x.done && x.t !== 'w')) { setFlash(`🔗 Enchaîne : ${nx.name}`); setTimeout(() => setFlash(null), 2200); speak(`Sans repos : ${nx.name}`); setI(i + 1); return; }
      // B d'un superset → repos puis retour sur A s'il lui reste des séries
      if (pv && ss[pv.id] && (rows[pv.id] ?? []).some(x => !x.done && x.t !== 'w')) { setRest({ n: Math.max(ex.rest, pv.rest), key: Date.now() }); setI(i - 1); return; }
    }
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
  const addScanned = (items: MachineEx[]) => {
    const add = items.map((x, k) => fromScan(x, k));
    setExs(e => [...e, ...add]); setRows(r => ({ ...r, ...Object.fromEntries(add.map(e => [e.id, mkRows(e)])) }));
    setI(exs.length); setScanOpen(false);
  };
  // 07/11 Kouider : « je dois pouvoir supprimer les autres si je ne les ai pas faits »
  const removeEx = () => {
    if (!ex) return;
    if ((rows[ex.id] ?? []).some(r => r.done) && !confirm(`Retirer « ${ex.name} » ? Ses séries validées ne seront pas enregistrées.`)) return;
    vibrate(20); setRest(null);
    setExs(e => e.filter(y => y.id !== ex.id)); setRows(r => { const n = { ...r }; delete n[ex.id]; return n; });
    setI(j => Math.max(0, Math.min(j, exs.length - 2)));
  };
  const swap = (items: LibItem[]) => {
    const x = items[0]; if (!x || !ex) return;
    const ne = { ...fromLib(x, 0), sets: ex.sets, reps: ex.reps, rest: ex.rest, muscle: ex.muscle };
    setExs(e => e.map((y, j) => j === i ? ne : y)); setRows(r => ({ ...r, [ne.id]: mkRows(ne) }));
  };
  const allRows = exs.flatMap(e => rows[e.id] ?? []);
  const lifts = exs.filter(e => !isCardioEx(e));
  const work = lifts.flatMap(e => rows[e.id] ?? []).filter(r => r.t !== 'w');
  const cardioDone = exs.filter(e => isCardioEx(e) && rows[e.id]?.[0]?.done).map(e => `${e.name} ${Number(rows[e.id]![0]!.reps) || cardioMin(e)} min`);
  const doneSets = work.filter(r => r.done);
  const volume = lifts.reduce((a, e) => a + (rows[e.id] ?? []).filter(r => r.done && r.t !== 'w').reduce((b, r) => b + (Number(r.kg.replace(',', '.')) || 0) * (Number(r.reps) || 0), 0), 0);
  const elapsed = Math.round((now - start.current) / 1000);
  // 07/11 : l'app dit au coach où il en est (exercice actuel, ce qui reste, ajouts compris) → plus de « exercice suivant » ni de
  // « muscu terminée » au chrono pendant qu'il est encore sur un exercice ; « terminée » seulement quand il appuie sur Terminer ici.
  const progKey = `${exs.map(e => e.id).join('|')}#${i}#${doneSets.length}#${work.length}`;
  useEffect(() => {
    if (finish) return;
    const t = setTimeout(() => {
      const left = exs.filter(e => isCardioEx(e) ? !rows[e.id]?.[0]?.done : (rows[e.id] ?? []).some(r => !r.done && r.t !== 'w')).map(e => e.name);
      void apiFetch('/api/sport/live-app', { method: 'POST', body: JSON.stringify({ current: ex?.name ?? null, left, done: doneSets.length, total: work.length }) }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [progKey, finish]); // eslint-disable-line react-hooks/exhaustive-deps
  const progRef = useRef<() => void>(() => {});
  progRef.current = () => { if (finish) return; const left = exs.filter(e => isCardioEx(e) ? !rows[e.id]?.[0]?.done : (rows[e.id] ?? []).some(r => !r.done && r.t !== 'w')).map(e => e.name); void apiFetch('/api/sport/live-app', { method: 'POST', body: JSON.stringify({ current: ex?.name ?? null, left, done: doneSets.length, total: work.length }) }).catch(() => {}); };
  useEffect(() => { const t = setInterval(() => progRef.current(), 8 * 60_000); return () => clearInterval(t); }, []);   // signe de vie (la note expire après 60 min sans nouvelles)
  const save = async () => {
    setBusy(true);
    try {
      const out = lifts.flatMap(e => (rows[e.id] ?? []).filter(r => r.done && r.t !== 'w').map(r => ({ ex: e.id, kg: Number(r.kg.replace(',', '.')) || undefined, reps: Number(r.reps) || undefined })));
      const fb = exs.filter(e => feel[e.id]).map(e => `${e.name} : ${FEEL.find(f => f.id === feel[e.id])!.l.toLowerCase()}`);
      const notes = [cardioDone.length ? `Cardio — ${cardioDone.join(' ; ')}` : '', fb.length ? `Ressenti — ${fb.join(' ; ')}` : ''].filter(Boolean).join(' · ');
      const msg = await saveFn(out, Math.round(elapsed / 60), rpe, lifts, rows, notes);
      // Historique de chaque exercice de la bibliothèque (fiche → Historique / Progrès)
      const lib = lifts.flatMap(e => { const id = libIdOf(e); return id ? (rows[e.id] ?? []).filter(r => r.done && r.t !== 'w').map(r => ({ id, kg: Number(r.kg.replace(',', '.')) || undefined, reps: Number(r.reps) || undefined, ...(feel[e.id] ? { fb: feel[e.id] } : {}) })) : []; });
      if (lib.length) await forme.exBatch(lib).catch(() => {});
      clearLive();
      void apiFetch('/api/sport/live-app', { method: 'POST', body: JSON.stringify({ current: null, left: [], done: doneSets.length, total: work.length, finished: true }) }).catch(() => {});
      setPendingSave(false);
      onFinished(newPrs.length ? `${msg} · 🏆 ${newPrs.join(', ')}` : msg);
    } catch (e) {
      // Pas de réseau : rien n'est perdu (séance gardée sur le téléphone), envoi automatique au retour du réseau
      if (!navigator.onLine || /fetch|network|r[ée]seau|load failed|timeout|abort/i.test(String((e as Error)?.message ?? e))) { setPendingSave(true); setFlash('📴 Pas de réseau : séance gardée, je l\'envoie dès que le réseau revient'); setTimeout(() => setFlash(null), 4000); }
      else alert(errText(e));
    } finally { setBusy(false); }
  };
  useEffect(() => { if (online && pendingSave && !busy) void save(); }, [online, pendingSave]); // eslint-disable-line react-hooks/exhaustive-deps
  const cell: CSSProperties = { background: F.bg, border: 'none', borderRadius: 9, padding: '9px 4px', fontSize: 16, fontWeight: 600, width: '100%', boxSizing: 'border-box', fontFamily: F.sans, textAlign: 'center', color: F.ink };
  const cols = '34px 1fr 64px 56px 42px';
  const tool: CSSProperties = { flex: 1, border: 'none', background: F.bg, borderRadius: 10, padding: '9px 4px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', color: F.ink, whiteSpace: 'nowrap' };
  let nNum = 0;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: F.bg, overflowY: 'auto', fontFamily: F.sans, color: F.ink, paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'rgba(245,242,250,0.94)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', padding: 'calc(8px + env(safe-area-inset-top)) 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => { if (finish) setFinish(false); else if (!allRows.some(r => r.done) || confirm('Abandonner la séance ? (rien n\'est enregistré)')) { clearLive(); void apiFetch('/api/sport/live-app', { method: 'POST', body: JSON.stringify({ abandon: true }) }).catch(() => {}); onClose(); } }} aria-label="Fermer" style={{ width: 36, height: 36, border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: F.ink }}>{finish ? '‹' : '✕'}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
          <div style={{ fontSize: 12.5, color: F.muted, fontVariantNumeric: 'tabular-nums' }}>⏱ {fmtTime(elapsed)} · {doneSets.length}/{work.length} séries · {Math.round(volume)} kg{!online ? ' · 📴 hors ligne (tout est gardé)' : ''}</div>
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
            {lifts.filter(e => (rows[e.id] ?? []).some(r => r.done && r.t !== 'w')).map((e, k, arr) => { const d = rows[e.id]!.filter(r => r.done && r.t !== 'w'); const top = d.reduce((a, r) => (Number(r.kg) || 0) > (Number(a.kg) || 0) ? r : a, d[0]!); return (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: k < arr.length - 1 ? `1px solid ${F.line}` : 'none', fontSize: 14 }}><span style={{ fontWeight: 600 }}>{d.length} × {e.name}</span><span style={{ color: F.muted, whiteSpace: 'nowrap' }}>{top.kg ? `${top.kg} kg × ${top.reps}` : `${top.reps} reps`}</span></div>); })}
          </div>
          {cardioDone.length > 0 && <div style={{ ...card, marginTop: 10, textAlign: 'start', fontSize: 14, fontWeight: 600 }}>🏃 {cardioDone.join(' · ')}</div>}
          <div style={{ fontWeight: 600, marginTop: 22 }}>C'était dur comment ?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 10 }}>{[5, 6, 7, 8, 9].map(n => <button key={n} onClick={() => setRpe(n)} style={{ ...ghostBtn, borderRadius: 12, padding: '13px 0', background: rpe === n ? F.accent : '#fff', color: rpe === n ? '#fff' : F.ink }}>{n}</button>)}</div>
          <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>5 = facile · 9 = à fond</div>
          <button disabled={busy || !(doneSets.length || cardioDone.length)} onClick={save} style={{ ...btn, width: '100%', marginTop: 22, opacity: doneSets.length || cardioDone.length ? 1 : 0.5 }}>{busy ? 'Enregistrement…' : pendingSave ? '📴 En attente du réseau… (touche pour réessayer)' : doneSets.length || cardioDone.length ? 'Enregistrer ma séance' : 'Aucune série validée'}</button>
          {doneSets.length > 0 && <button onClick={() => void shareCard({ title: s.label, dur: fmtTime(elapsed), volume, sets: doneSets.length, prs: newPrs, lines: exs.filter(e => (rows[e.id] ?? []).some(r => r.done && r.t !== 'w')).map(e => { const d = rows[e.id]!.filter(r => r.done && r.t !== 'w'); const top = Math.max(...d.map(r => Number(r.kg.replace(',', '.')) || 0)); return `${d.length} × ${e.name}${top ? ` · ${top} kg` : ''}`; }) })} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>📤 Partager ma séance (image)</button>}
        </div>
      ) : <>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 14px 8px', scrollbarWidth: 'none' }}>
          {exs.map((e, j) => { const ok = isCardioEx(e) ? !!rows[e.id]?.[0]?.done : (rows[e.id] ?? []).length > 0 && rows[e.id]!.every(r => r.done); return (
            <button key={e.id} onClick={() => setI(j)} style={{ flexShrink: 0, border: j === i ? `2px solid ${F.accent}` : '2px solid transparent', borderRadius: 14, background: ok ? '#dff3e7' : F.tile, width: 54, height: 54, padding: 3, cursor: 'pointer', position: 'relative' }}>
              {e.demo.length ? <Anim img={e.demo} alt="" h={44} /> : '🏋️'}
              {ok && <span style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, background: F.green, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
            </button>); })}
          <button onClick={() => setPicker('add')} aria-label="Ajouter un exercice" style={{ flexShrink: 0, borderRadius: 14, border: `2px dashed ${F.line}`, background: 'transparent', width: 54, height: 54, fontSize: 22, color: F.muted, cursor: 'pointer' }}>＋</button>
          <button onClick={() => setScanOpen(true)} aria-label="Scanner une machine" style={{ flexShrink: 0, borderRadius: 14, border: `2px dashed ${F.line}`, background: 'transparent', width: 54, height: 54, fontSize: 22, color: F.muted, cursor: 'pointer' }}>📷</button>
        </div>
        {(warm || !allRows.some(r => r.done)) && <div style={{ ...card, margin: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}><div style={{ fontWeight: 700 }}>{warm ? `Échauffement : ${fmtTime(Math.max(0, Math.round((warm - now) / 1000)))}` : `Échauffement général ${warmMin} min`}</div><div style={{ color: F.muted, lineHeight: 1.3 }}>{s.warmup || 'Vélo ou rameur léger, rotations des épaules et des hanches'}</div></div>
          <button onClick={() => { if (warm) setWarm(null); else { setWarm(Date.now() + warmMin * 60_000); speak(`Échauffement ${warmMin} minutes. ${s.warmup || ''}`); } }} style={{ ...btn, padding: '8px 12px', fontSize: 13, boxShadow: 'none' }}>{warm ? 'Stop' : '▶ Lancer'}</button>
        </div>}
        {!ex ? (
          <div style={{ padding: '30px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 44 }}>🏋️</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>Séance libre</div>
            <div style={{ color: F.muted, fontSize: 14, marginTop: 4 }}>Ajoute les exercices que tu fais, au fur et à mesure.</div>
            <button onClick={() => setPicker('add')} style={{ ...btn, marginTop: 16 }}>＋ Ajouter un exercice</button>
            <button onClick={() => setScanOpen(true)} style={{ ...ghostBtn, marginTop: 10, display: 'block', marginInline: 'auto' }}>📷 Scanner une machine</button>
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
                    <div style={{ fontSize: 12, fontWeight: 600, color: F.accent }}>{i + 1}/{exs.length}{ex.muscle ? ` · ${MUSCLE[ex.muscle] ?? ex.muscle}` : ''}{isCardioEx(ex) ? ' · cardio' : ` · repos ${ex.rest}s`}{best(ex) ? ` · record ${best(ex)} kg` : ''}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 2 }}>{ex.name}</div>
                  </div>
                  <button onClick={() => setHow(true)} aria-label="Comment faire" style={{ width: 34, height: 34, borderRadius: 17, border: `1px solid ${F.line}`, background: '#fff', cursor: 'pointer', fontWeight: 700, color: F.accent, flexShrink: 0 }}>i</button>
                </div>
                {(ss[ex.id] && exs[i + 1]) ? <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: F.accent }}>🔗 Superset avec « {exs[i + 1]!.name} » : 1 série ici → direct l'autre, puis repos</div>
                  : (exs[i - 1] && ss[exs[i - 1]!.id]) ? <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: F.accent }}>🔗 Superset avec « {exs[i - 1]!.name} » : après ta série, repos puis retour dessus</div> : null}
                {ex.tip && <div style={{ fontSize: 13.5, color: F.muted, marginTop: 6, lineHeight: 1.4 }}>💡 {ex.tip}</div>}
                {ex.suggestion.up && <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, color: F.green }}>↑ On monte à {ex.suggestion.kg} kg aujourd'hui</div>}
                {chal === ex.id && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, padding: '8px 10px', borderRadius: 10, background: '#fff6df' }}>🎯 Défi du jour : fais mieux que la dernière fois ({ex.suggestion.last}) — 1 rep ou 1 kg de plus</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {!isCardioEx(ex) && <button onClick={warmup} style={tool}>🔥 Échauffement</button>}
                  {!isCardioEx(ex) && <button onClick={() => setPlates(true)} style={tool}>🧮 Disques</button>}
                  <button onClick={() => setPicker('swap')} style={tool}>🔁 Remplacer</button>
                  {!isCardioEx(ex) && exs[i + 1] && !isCardioEx(exs[i + 1]!) && <button onClick={() => { vibrate(15); setSs(x => ({ ...x, [ex.id]: !x[ex.id] })); }} aria-label="Superset avec l'exercice suivant" style={{ ...tool, flex: '0 0 auto', padding: '9px 11px', background: ss[ex.id] ? F.accent : F.bg, color: ss[ex.id] ? '#fff' : F.ink }}>🔗</button>}
                  <button onClick={removeEx} aria-label="Retirer cet exercice" style={{ ...tool, flex: '0 0 auto', padding: '9px 11px' }}>🗑️</button>
                </div>
              </div>
              {isCardioEx(ex) ? (() => { const r = sets[0] ?? { kg: '', reps: String(cardioMin(ex)), done: false, t: 'n' as SetT }; return (
              <div style={{ padding: '10px 14px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, background: r.done ? '#dff3e7' : F.bg }}>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>⏱ Durée</div>
                  <input inputMode="numeric" value={r.reps} onChange={e => upd(0, { reps: e.target.value })} style={{ ...cell, width: 70, background: r.done ? 'transparent' : '#fff' }} />
                  <span style={{ fontWeight: 600, color: F.muted }}>min</span>
                  <button onClick={() => r.done ? upd(0, { done: false }) : validate(0)} aria-label="Cardio fait" style={{ width: 44, height: 40, borderRadius: 10, border: 'none', background: r.done ? F.green : F.bg2, color: r.done ? '#fff' : F.muted, fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>✓</button>
                </div>
                <div style={{ fontSize: 11.5, color: F.muted, textAlign: 'center', marginTop: 8 }}>Cardio : pas de séries ni de kg — mets juste tes minutes et valide ✓</div>
              </div>); })() : (
              <div style={{ padding: '6px 10px 10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, fontSize: 11, fontWeight: 600, color: F.muted, padding: '6px 4px', textAlign: 'center' }}><div>SÉRIE</div><div>PRÉCÉDENT</div><div>KG</div><div>{ex.timed ? 'SEC' : 'REPS'}</div><div>✓</div></div>
                {sets.map((r, k) => { const look = r.t !== 'n' ? T_LOOK[r.t] : null; if (r.t === 'n') nNum++; const num = nNum; return (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: cols, gap: 6, alignItems: 'center', padding: '4px', borderRadius: 10, background: r.done ? '#dff3e7' : 'transparent', transition: 'background .2s' }}>
                    <button onClick={() => upd(k, { t: T_NEXT[r.t] })} title={look?.name ?? 'Série normale — touche pour changer le type'} style={{ fontWeight: 700, textAlign: 'center', border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, color: look?.c ?? F.ink, fontFamily: 'inherit' }}>{look?.l ?? num}</button>
                    <button onClick={() => void fixPrev()} disabled={r.t === 'w' || !ex.suggestion.last} title="Touche pour corriger ce poids s'il est faux" style={{ fontSize: 13, color: F.muted, textAlign: 'center', border: 'none', background: 'none', padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit', textDecoration: r.t !== 'w' && ex.suggestion.last ? 'underline dotted' : 'none', textUnderlineOffset: 3 }}>{r.t === 'w' ? '—' : prevOf(ex.suggestion.last, num - 1)}</button>
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
                <div style={{ fontSize: 11.5, color: F.muted, textAlign: 'center', marginTop: 6 }}>Touche le n° de série : W échauffement · D dégressive · F échec · touche PRÉCÉDENT pour corriger un ancien poids</div>
                <input value={note} onChange={e => { setNote(e.target.value); try { localStorage.setItem(noteKey(ex), e.target.value); } catch { /* */ } }} placeholder="📝 Note (ex. siège cran 4, prise serrée…) — gardée pour la prochaine fois" style={{ ...input, marginTop: 10, fontSize: 14, padding: '10px 12px', background: F.bg, border: 'none' }} />
              </div>)}
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
      <ScanSheet open={scanOpen} onClose={() => setScanOpen(false)} onAdd={addScanned} />
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
      {play && <Player s={live.s} resume={live} kind={live.kind} onClose={() => { setPlay(false); setLive(readLive()); }} onFinished={msg => { setPlay(false); setLive(null); toast(msg); onDone?.(); }} save={async (sets, durationMin, rpe, exs, rws, note) => {
        if (live.kind === 'coach') {
          const r = await apiFetch<{ prs: string[] }>('/api/sport/log', { method: 'POST', body: JSON.stringify({ date: live.s.date, type: live.s.type, sets, durationMin, rpe, ...logExtras(exs, rws, live.s.date), ...(note ? { note } : {}) }) });
          return `💪 Séance enregistrée${r.prs.length ? ` — 🏆 record : ${r.prs.join(', ')}` : ''} · Dzaryx est prévenu`;
        }
        await forme.log('workout', { session: (live.s as unknown as { index?: number }).index ?? 0, label: live.s.label, sets, durationMin, rpe });
        return `💪 ${live.s.label} enregistrée`;
      }} />}
    </>
  );
}

const exNames = (exs: PEx[]) => Object.fromEntries(exs.map(e => [e.id, e.name]));

interface SessionReviewV { date: string; label: string; emoji: string; totals: { sets: number; volume: number; durationMin: number | null; rpe: number | null };
  prev: { date: string; sets: number; volume: number; comparable?: boolean } | null; scores: { global: number; progression: number; volume: number; intensite: number; regularite: number; densite: number | null };
  exercises: Array<{ id: string; name: string; sets: number; volume: number; topKg: number | null; topReps: number | null; prev: { volume: number; topKg: number | null } | null; pr: boolean }>;
  avis: string; good: string[]; improve: string[]; chartUrl: string | null;
  context?: { sleep: number | null; protYday: number | null; protGoal: number | null } | null; links?: string[];
  rests?: { avgSec: number; plannedSec: number } | null; challenge?: { name: string; met: boolean } | null;
  month?: { volume: number; best: { month: string; volume: number } | null } | null; forecast?: Array<{ name: string; target: number; eta: string }> }
const fmtS = (sec: number) => sec >= 60 ? `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')}` : `${sec} s`;

/** 07/11 : bilan de la dernière séance (notes /10, avis, à améliorer, comparaison avec la dernière pareille). */
function ReviewCard({ dates, bump }: { dates: string[]; bump: number }) {
  const [r, setR] = useState<SessionReviewV | null>(null);
  const [open, setOpen] = useState(false);
  const key = dates.join(',');
  useEffect(() => {
    let stop = false; let tries = 0;
    const run = async () => {
      for (const dt of dates) {
        const x = await apiFetch<{ review: SessionReviewV | null }>(`/api/sport/review?date=${dt}`).catch(() => null);
        if (stop) return;
        if (x?.review) { setR(x.review); return; }
      }
      if (bump && ++tries < 8 && !stop) setTimeout(() => void run(), 6000);   // bilan en préparation juste après la séance
    };
    void run();
    return () => { stop = true; };
  }, [key, bump]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return null;
  const col = (n: number) => n >= 8 ? F.accent : n >= 6 ? '#e9a23b' : F.red;
  const note = (l: string, n: number | null) => n == null ? null : (
    <div key={l} style={{ flex: '1 1 30%', minWidth: 86 }}><div style={{ fontSize: 12, color: F.muted }}>{l}</div>
      <div style={{ height: 6, borderRadius: 3, background: F.line, marginTop: 4 }}><div style={{ width: `${n * 10}%`, height: '100%', borderRadius: 3, background: col(n) }} /></div>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2 }}>{n}/10</div></div>);
  const maxV = Math.max(1, ...r.exercises.map(e => Math.max(e.volume, e.prev?.volume ?? 0)));
  return (
    <>
      <H2>Bilan de ta dernière séance</H2>
      <div style={{ ...card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, border: `4px solid ${col(r.scores.global)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{r.scores.global}<span style={{ fontSize: 11, color: F.muted }}>/10</span></div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>{r.emoji} {r.label} · {r.date.slice(8)}/{r.date.slice(5, 7)}</div>
            <div style={{ fontSize: 12.5, color: F.muted }}>{r.totals.sets} séries · {r.totals.volume.toLocaleString('fr-FR')} kg{r.totals.durationMin ? ` · ${r.totals.durationMin} min` : ''}{r.prev && r.prev.comparable !== false ? ` · avant : ${r.prev.volume.toLocaleString('fr-FR')} kg` : ''}</div></div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>{[note('Progression', r.scores.progression), note('Volume', r.scores.volume), note('Intensité', r.scores.intensite), note('Régularité', r.scores.regularite), note('Densité', r.scores.densite)]}</div>
        <div style={{ fontSize: 14, marginTop: 12, lineHeight: 1.45 }}>💬 {r.avis}</div>
        {open && <>
          {r.good.length > 0 && <div style={{ marginTop: 10 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>✅ Points forts</div>{r.good.map((x, i) => <div key={i} style={{ fontSize: 13, marginTop: 3 }}>• {x}</div>)}</div>}
          {r.improve.length > 0 && <div style={{ marginTop: 10 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>🎯 À améliorer</div>{r.improve.map((x, i) => <div key={i} style={{ fontSize: 13, marginTop: 3 }}>• {x}</div>)}</div>}
          {(r.context?.sleep != null || r.context?.protYday || r.rests) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5 }}>
            {r.context?.sleep != null && <span style={{ background: F.bg, borderRadius: 8, padding: '5px 8px' }}>😴 {r.context.sleep} h cette nuit</span>}
            {r.context?.protYday ? <span style={{ background: F.bg, borderRadius: 8, padding: '5px 8px' }}>🥩 {Math.round(r.context.protYday)}{r.context.protGoal ? `/${r.context.protGoal}` : ''} g protéines hier</span> : null}
            {r.rests && <span style={{ background: F.bg, borderRadius: 8, padding: '5px 8px' }}>⏱️ repos {fmtS(r.rests.avgSec)} (prévu {fmtS(r.rests.plannedSec)})</span>}
          </div>}
          {r.forecast?.length ? <div style={{ marginTop: 10 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>🔮 À ce rythme</div>{r.forecast.map((f, i) => <div key={i} style={{ fontSize: 13, marginTop: 3 }}>• {f.name} à {f.target} kg vers le {f.eta.slice(8)}/{f.eta.slice(5, 7)}</div>)}</div> : null}
          {r.links?.length ? <div style={{ marginTop: 10 }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>🔗 Ce que disent tes séances</div>{r.links.map((x, i) => <div key={i} style={{ fontSize: 13, marginTop: 3 }}>• {x}</div>)}</div> : null}
          {r.month?.best && <div style={{ fontSize: 13, marginTop: 10 }}>📅 Ce mois : <b>{r.month.volume.toLocaleString('fr-FR')} kg</b> · meilleur mois ({r.month.best.month.slice(5)}/{r.month.best.month.slice(0, 4)}) : {r.month.best.volume.toLocaleString('fr-FR')} kg</div>}
          <div style={{ marginTop: 12, fontWeight: 700, fontSize: 13.5 }}>📈 Volume par exercice <span style={{ fontWeight: 400, color: F.muted }}>(gris = dernière fois)</span></div>
          {r.exercises.map(e => (
            <div key={e.id} style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.pr ? '🏆 ' : ''}{e.name}</span><span style={{ color: F.muted, flexShrink: 0, marginLeft: 8 }}>{e.topKg ? `${e.topKg} kg × ${e.topReps ?? '?'}` : `${e.sets} séries`}{e.prev?.topKg ? ` (avant ${e.prev.topKg})` : ''}</span></div>
              {e.prev && <div style={{ height: 5, borderRadius: 3, background: '#c7cbd6', width: `${(e.prev.volume / maxV) * 100}%`, marginTop: 3 }} />}
              <div style={{ height: 7, borderRadius: 3, background: F.accent, width: `${Math.max(2, (e.volume / maxV) * 100)}%`, marginTop: 2 }} />
            </div>
          ))}
        </>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => setOpen(!open)} style={{ flex: 1, border: 'none', background: F.bg, borderRadius: 10, padding: '9px 12px', cursor: 'pointer', fontWeight: 600, color: F.ink }}>{open ? 'Masquer le détail' : 'Voir le détail + graphique'}</button>
          <button onClick={() => void shareCard({ title: `${r.label} · ${r.scores.global}/10`, dur: r.totals.durationMin ? `${r.totals.durationMin} min` : '—', volume: r.totals.volume, sets: r.totals.sets, prs: r.exercises.filter(e => e.pr).map(e => `${e.name} ${e.topKg} kg`), lines: r.exercises.map(e => `${e.sets} × ${e.name}${e.topKg ? ` · ${e.topKg} kg` : ''}`) })} aria-label="Partager" style={{ border: 'none', background: F.bg, borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontWeight: 600, color: F.ink }}>📤</button>
        </div>
      </div>
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
  const [bump, setBump] = useState(0);
  const load = useCallback(() => apiFetch<SportOverview>('/api/sport').then(setD).catch(e => setErr(errText(e))), []);
  useEffect(() => { void load(); }, [load]);
  if (err) return <div style={{ padding: 18, color: F.red }}>❌ {err}</div>;
  if (!d) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  const today = d.week[0]?.date;
  const picked = pick ? (d.planned ?? []).find(x => x.date === pick) ?? (pick === d.today?.date ? d.today : pick === d.next?.date ? d.next : null) : null;
  // 02/11 (Kouider : « j'enregistre ma séance mais il me dit encore la séance d'aujourd'hui ») : faite → on passe à la suivante
  const doneToday = d.week[0]?.status === 'done';
  const s = pick ? picked : doneToday ? d.next : d.today ?? d.next;
  const isToday = !!s && s.date === today;
  // 07/11 : semaine lundi → dimanche (jours passés + à venir), chaque jour cochable « faite / pas faite »
  const strip = [...(d.past ?? []), ...d.week].slice(0, 7);
  const statusOf = (date: string) => strip.find(w => w.date === date)?.status ?? null;
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
        {strip.map(w => {
          const done = w.status === 'done', sel = s?.date === w.date, live = w.status === 'en_cours', missed = w.status === 'missed';
          return (
            <button key={w.date} onClick={() => { vibrate(10); setPick(w.type ? w.date : null); }} style={{ background: 'none', border: 'none', padding: 0, cursor: w.type ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: sel ? F.accent : F.muted }}>{SHORT_DAYS[dayOf(w.date)]!.slice(0, 1)}</div>
              <div style={{ width: 38, height: 38, borderRadius: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700,
                background: done ? F.accent : w.type && !w.skip ? '#fff' : 'transparent', color: done ? '#fff' : missed ? F.red : F.ink,
                border: sel ? `2.5px solid ${F.accent}` : live ? `2px dashed ${F.accent}` : w.type && !w.skip ? `1.5px solid ${missed ? F.red : F.line}` : `1.5px dashed ${F.line}` }}>
                {w.skip ? '·' : done ? '✓' : Number(w.date.slice(8))}
              </div>
            </button>
          );
        })}
      </div>
      <ResumeBanner toast={toast} onDone={() => { void load(); setBump(b => b + 1); }} />
      <TodayForm />
      {doneToday && !pick && <div style={{ ...card, marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 40, height: 40, borderRadius: 20, background: F.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800 }}>✓</div><div><div style={{ fontWeight: 700 }}>Séance du jour faite{d.today?.label ? ` : ${d.today.label}` : ''}</div><div style={{ fontSize: 13, color: F.muted }}>Bravo. Récupère bien — voici la prochaine.</div></div></div>}
      {s ? <SessionCard s={s} kicker={isToday ? (doneToday ? 'Aujourd\'hui · faite ✓' : "Aujourd'hui") : `${pick ? '' : 'Prochaine · '}${SHORT_DAYS[dayOf(s.date)]} ${s.date.slice(8)} · ${new Date(s.start).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' })}`} onStart={() => setPlay(s)} onEx={setEx} start={isToday ? 'Démarrer l\'entraînement' : 'Voir / faire cette séance'} />
        : <div style={{ ...card, marginTop: 14 }}>Pas de séance prévue cette semaine. Dis à Dzaryx « cale mes séances » 💬</div>}
      {s && s.date <= (today ?? '') && <DoneToggle date={s.date} label={s.label} done={statusOf(s.date) === 'done'} live={statusOf(s.date) === 'en_cours'} toast={toast} onD={x => { setD(x); setPick(s.date); }} />}
      {s && s.date >= (today ?? '') && statusOf(s.date) !== 'done' && <SwapRow d={d} date={s.date} current={s.type} toast={toast} onD={x => { setD(x); setPick(s.date); }} />}
      {s && <>
        <H2 right={<span style={{ fontSize: 13, color: F.muted }}>{s.exercises.length}</span>}>Exercices</H2>
        <div style={{ ...card, padding: '4px 14px' }}>{s.exercises.map((e, k) => <div key={e.id} style={{ borderBottom: k < s.exercises.length - 1 ? `1px solid ${F.line}` : 'none' }}><ExRow e={e} onClick={() => setEx(e)} /></div>)}</div>
      </>}
      <DidButton toast={toast} onDone={() => void load()} />
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
      <ReviewCard dates={[...new Set([...(d.week[0]?.status === 'done' && today ? [today] : []), ...(d.recent ?? []).map(x => x.date)])].slice(0, 3)} bump={bump} />
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
      {play && <Player s={play} prs={prs} onClose={() => setPlay(null)} onFinished={msg => { setPlay(null); toast(msg); void load(); setBump(b => b + 1); }} save={async (sets, durationMin, rpe, exs, rws, note) => {
        const r = await apiFetch<{ prs: string[] }>('/api/sport/log', { method: 'POST', body: JSON.stringify({ date: d.week[0]?.date ?? play.date, type: play.type, sets, durationMin, rpe, ...logExtras(exs, rws, play.date), ...(note ? { note } : {}) }) });
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

// 📷 07/11 Kouider : « quand je fais une séance et que je prends une machine en photo, il l'ajoute à ma séance et je note comme les autres »
function ScanSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (x: MachineEx[]) => void }) {
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<MachineScan | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { if (!open) { setScan(null); setSel([]); setErr(''); } }, [open]);
  const go = async (file?: File | null) => {
    if (!file) return;
    setErr(''); setScan(null); setBusy(true); vibrate(15);
    try {
      const [image, thumb] = await Promise.all([compressImage(file, 1024, 0.8), compressImage(file, 220, 0.6)]);
      const r = await forme.machine(image, thumb);
      if (!r.scan.machine || !r.scan.exercises.length) { setErr(r.scan.what || 'Je ne vois pas de machine — reprends la photo avec tout l\'appareil.'); return; }
      setScan(r.scan); setSel([0]); vibrate(60);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); if (cam.current) cam.current.value = ''; if (gal.current) gal.current.value = ''; }
  };
  return (
    <Sheet open={open} onClose={onClose} z={75}>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => void go(e.target.files?.[0])} />
      <input ref={gal} type="file" accept="image/*" hidden onChange={e => void go(e.target.files?.[0])} />
      <div style={{ fontSize: 20, fontWeight: 700 }}>Scanner une machine</div>
      {!scan && !busy && <>
        <div style={{ fontSize: 13.5, color: F.muted, marginTop: 4 }}>Prends la machine en photo : ses exercices s'ajoutent à ta séance, tu notes tes séries comme les autres.</div>
        <button onClick={() => cam.current?.click()} style={{ ...btn, width: '100%', marginTop: 14 }}>📷 Prendre la photo</button>
        <button onClick={() => gal.current?.click()} style={{ ...ghostBtn, width: '100%', marginTop: 8 }}>🖼️ Depuis la galerie</button>
      </>}
      {busy && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 24 }}><Spinner size={28} /><div style={{ fontWeight: 600 }}>Je reconnais la machine…</div><div style={{ fontSize: 12.5, color: F.muted }}>~15 à 25 secondes</div></div>}
      {err && !busy && <div style={{ color: F.red, fontWeight: 600, marginTop: 12 }}>❌ {err}</div>}
      {scan && !busy && <>
        <div style={{ fontWeight: 700, marginTop: 8 }}>{scan.machine}</div>
        {scan.setup && <div style={{ fontSize: 13, color: F.muted, marginTop: 4, lineHeight: 1.4 }}>⚙️ {scan.setup}</div>}
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 12 }}>Coche ce que tu fais :</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {scan.exercises.map((x, k) => { const on = sel.includes(k); return (
            <button key={k} onClick={() => setSel(v => on ? v.filter(y => y !== k) : [...v, k])} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 14, border: on ? `2px solid ${F.accent}` : `2px solid ${F.line}`, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <div style={{ width: 52, height: 52, borderRadius: 10, background: F.tile, overflow: 'hidden', flexShrink: 0 }}>{x.img?.length ? <Anim img={x.img} alt="" h={52} /> : null}</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14.5, color: F.ink }}>{x.name}</div><div style={{ fontSize: 12, color: F.muted }}>{x.muscles.join(', ')}</div></div>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: on ? F.accent : '#fff', border: on ? 'none' : `2px solid ${F.line}`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{on ? '✓' : ''}</div>
            </button>); })}
        </div>
        <button disabled={!sel.length} onClick={() => onAdd(sel.sort((a, b) => a - b).map(k => scan.exercises[k]!))} style={{ ...btn, width: '100%', marginTop: 14, opacity: sel.length ? 1 : 0.5 }}>＋ Ajouter à ma séance{sel.length > 1 ? ` (${sel.length})` : ''}</button>
        <button onClick={() => cam.current?.click()} style={{ ...ghostBtn, width: '100%', marginTop: 8 }}>📷 Autre machine</button>
      </>}
    </Sheet>
  );
}

// ✅ Cocher / décocher une séance (Kouider 07/11 : « il note ma séance d'aujourd'hui comme faite alors qu'elle est pas faite ;
// je dois pouvoir cocher les séances de la semaine ; si je la décoche il me donne les exercices à faire »)
function DoneToggle({ date, label, done, live, toast, onD }: { date: string; label: string; done: boolean; live: boolean; toast: (t: string) => void; onD: (d: SportOverview) => void }) {
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    setBusy(true); vibrate(15);
    try { const r = await apiFetch<SportOverview & { msg: string }>('/api/sport/done', { method: 'POST', body: JSON.stringify({ date, done: !done }) }); onD(r); toast(r.msg); } catch (e) { toast(`❌ ${errText(e)}`); } finally { setBusy(false); }
  };
  return (
    <button disabled={busy} onClick={() => void flip()} style={{ ...card, marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', gap: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', opacity: busy ? 0.6 : 1 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18,
        background: done ? F.green : '#fff', color: '#fff', border: done ? 'none' : `2px solid ${F.line}` }}>{busy ? '…' : done ? '✓' : ''}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: F.ink }}>{done ? `${label} : faite` : `${label} : pas encore faite`}</div>
        <div style={{ fontSize: 12.5, color: F.muted }}>{done ? 'Touche pour décocher si tu ne l\'as pas faite' : live ? 'Tu es à la salle : coche quand tu as fini' : 'Touche pour cocher si tu l\'as faite'}</div>
      </div>
    </button>
  );
}

// 🔁 Changer la séance d'un jour (Kouider 01/11 : « demain lundi au lieu des épaules je veux faire les bras ») —
// même chose que dire à Dzaryx : agenda, appel du matin et rotation suivent.
function SwapRow({ d, date, current, toast, onD }: { d: SportOverview; date: string; current: SportType; toast: (t: string) => void; onD: (d: SportOverview) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const pickType = async (t: SportType) => {
    if (t === current) { setOpen(false); return; }
    setBusy(t); vibrate(15);
    try {
      const r = await apiFetch<SportOverview>('/api/sport/swap', { method: 'POST', body: JSON.stringify({ date, type: t }) });
      onD(r); setOpen(false); toast(`✅ ${SHORT_DAYS[dayOf(date)]} ${Number(date.slice(8))} : ${d.sessions[t]?.label ?? t} (agenda mis à jour)`);
    } catch (e) { toast(`❌ ${errText(e)}`); } finally { setBusy(null); }
  };
  return (
    <div style={{ marginTop: 10 }}>
      {!open ? <button onClick={() => setOpen(true)} style={{ ...ghostBtn, width: '100%' }}>🔁 Changer la séance de ce jour</button> : (
        <div style={{ ...card }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Ce jour-là je fais…</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(Object.keys(d.sessions) as SportType[]).map(t => (
              <button key={t} disabled={!!busy} onClick={() => void pickType(t)} style={{ ...ghostBtn, padding: '9px 14px', fontSize: 14, border: t === current ? `2px solid ${F.accent}` : undefined, opacity: busy && busy !== t ? 0.5 : 1 }}>
                {busy === t ? '…' : `${d.sessions[t]!.emoji} ${d.sessions[t]!.label}`}
              </button>
            ))}
          </div>
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: F.muted, marginTop: 8, fontFamily: 'inherit', cursor: 'pointer' }}>Annuler</button>
        </div>
      )}
    </div>
  );
}
