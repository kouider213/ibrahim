import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { get, errText, forme, vibrate, type LibItem, type LibDetail, type ExSet } from './api.ts';
import { F, card, btn, ghostBtn, input, Sheet, Img, Spinner, LineChart } from './ui.tsx';

// BIBLIOTHÈQUE + FICHE EXERCICE — 31/10 refaites au style de l'appli de la vidéo (« Library ») : petits bonshommes
// de muscles en haut, filtre par matériel (ronds + « Appliquer » bleu), grille de tuiles avec marque-page, fiche plein
// écran « À propos / Historique / Progrès » avec Favori · YouTube · Partager · Comment faire, et muscles ciblés.
// Exercices : free-exercise-db (domaine public) via /api/forme/exlib ; schémas des muscles : wger.de (CC BY-SA).
const BASE = '/ibrahim/muscles';
export const MUSCLE_FR: Record<string, string> = {
  chest: 'Pectoraux', shoulders: 'Épaules', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Avant-bras', abdominals: 'Abdos', lats: 'Dorsaux',
  'middle back': 'Milieu du dos', 'lower back': 'Lombaires', traps: 'Trapèzes', quadriceps: 'Quadriceps', hamstrings: 'Ischio-jambiers', glutes: 'Fessiers',
  calves: 'Mollets', adductors: 'Adducteurs', abductors: 'Abducteurs', neck: 'Cou',
};
// Muscle → calques wger (f = vue de face, b = vue de dos)
const WGER: Record<string, { f?: number[]; b?: number[] }> = {
  chest: { f: [4] }, shoulders: { f: [2] }, biceps: { f: [1, 13] }, triceps: { b: [5] }, forearms: { f: [13] }, abdominals: { f: [6, 14] },
  lats: { b: [12] }, 'middle back': { b: [9] }, traps: { b: [9] }, neck: { b: [9] }, 'lower back': { b: [12] }, quadriceps: { f: [10] },
  hamstrings: { b: [11] }, glutes: { b: [8] }, calves: { b: [7, 15] }, adductors: { f: [10] }, abductors: { b: [8] },
};
export const EQ_FR: Record<string, string> = { barbell: 'Barre', dumbbell: 'Haltères', 'body only': 'Poids du corps', cable: 'Poulie', machine: 'Machine', kettlebells: 'Kettlebell',
  bands: 'Élastique', 'medicine ball': 'Médecine-ball', 'exercise ball': 'Swiss ball', 'foam roll': 'Rouleau', 'e-z curl bar': 'Barre EZ', other: 'Autre', none: 'Sans matériel' };
const EQ_ICON: Record<string, string> = { barbell: '🏋️', dumbbell: '💪', 'body only': '🤸', cable: '🪢', machine: '⚙️', 'e-z curl bar': '〰️', kettlebells: '🔔', bands: '➰', 'exercise ball': '⚪', 'medicine ball': '🟤', 'foam roll': '🧻', other: '➕', none: '🙌' };
const LEVEL_FR: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', expert: 'Confirmé' };
// Les petits bonshommes du haut (comme la vidéo) : groupe → muscles + vue
const GROUPS: Array<{ id: string; label: string; m: string[]; side: 'f' | 'b' }> = [
  { id: 'chest', label: 'Pecs', m: ['chest'], side: 'f' }, { id: 'back', label: 'Dos', m: ['lats', 'middle back', 'lower back', 'traps'], side: 'b' },
  { id: 'shoulders', label: 'Épaules', m: ['shoulders'], side: 'f' }, { id: 'biceps', label: 'Biceps', m: ['biceps', 'forearms'], side: 'f' },
  { id: 'triceps', label: 'Triceps', m: ['triceps'], side: 'b' }, { id: 'abs', label: 'Abdos', m: ['abdominals'], side: 'f' },
  { id: 'legs', label: 'Cuisses', m: ['quadriceps', 'adductors', 'hamstrings'], side: 'f' }, { id: 'glutes', label: 'Fessiers', m: ['glutes', 'abductors'], side: 'b' },
  { id: 'calves', label: 'Mollets', m: ['calves'], side: 'b' },
];

const layers = (side: 'f' | 'b', list: string[]) => [...new Set(list.flatMap(m => WGER[m]?.[side] ?? []))];
function Figure({ side, p, s = [], h, style }: { side: 'f' | 'b'; p: string[]; s?: string[]; h: number; style?: CSSProperties }) {
  const main = layers(side, p), sec = layers(side, s).filter(n => !main.includes(n));
  return (
    <div style={{ position: 'relative', height: h, aspectRatio: '200 / 369', ...style }}>
      {[`${BASE}/muscular_system_${side === 'f' ? 'front' : 'back'}.svg`, ...sec.map(n => `${BASE}/secondary/muscle-${n}.svg`), ...main.map(n => `${BASE}/main/muscle-${n}.svg`)]
        .map(src => <img key={src} src={src} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />)}
    </div>
  );
}

/** Schéma du corps (face + dos) : muscles principaux en rouge, secondaires en orange. */
export function MuscleMap({ p, s, h = 230 }: { p: string[]; s: string[]; h?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, direction: 'ltr' }}><Figure side="f" p={p} s={s} h={h} /><Figure side="b" p={p} s={s} h={h} /></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
        {p.map(m => <span key={m} style={{ background: '#fde2df', color: F.red, borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 700 }}>● {MUSCLE_FR[m] ?? m}</span>)}
        {s.map(m => <span key={m} style={{ background: '#fdf0dc', color: '#b8720c', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 600 }}>○ {MUSCLE_FR[m] ?? m}</span>)}
      </div>
    </div>
  );
}

/** Les 2 photos de l'exercice en alternance = l'exercice « bouge ». Fond clair fondu dans la tuile (multiply). */
export function Anim({ img, alt, h, style }: { img: string[]; alt: string; h: number | string; style?: CSSProperties }) {
  const [f, setF] = useState(0);
  useEffect(() => { if (img.length < 2) return; const t = setInterval(() => setF(x => 1 - x), 900); return () => clearInterval(t); }, [img.length]);
  return <Img src={img[f] ?? img[0]} alt={alt} style={{ width: '100%', height: h, objectFit: 'contain', background: 'transparent', mixBlendMode: 'multiply', ...style }} />;
}

// ── Marque-pages (partagés entre la bibliothèque, le scanner et les fiches) ──
let favIds: string[] | null = null;
const favSubs = new Set<(ids: string[]) => void>();
function useFavs(): [string[], (id: string) => void] {
  const [ids, setIds] = useState<string[]>(favIds ?? []);
  useEffect(() => {
    favSubs.add(setIds);
    if (!favIds) forme.exFavs().then(r => { favIds = r.ids; favSubs.forEach(f => f(r.ids)); }).catch(() => {});
    return () => { favSubs.delete(setIds); };
  }, []);
  const toggle = (id: string) => {
    const on = !(favIds ?? []).includes(id);
    favIds = on ? [id, ...(favIds ?? [])] : (favIds ?? []).filter(x => x !== id);
    favSubs.forEach(f => f(favIds!)); vibrate(12);
    forme.exFav(id, on).catch(() => {});
  };
  return [ids, toggle];
}
const Bookmark = ({ on, onClick, size = 18 }: { on: boolean; onClick: () => void; size?: number }) => (
  <span role="button" aria-label="Favori" onClick={e => { e.stopPropagation(); onClick(); }} style={{ display: 'inline-flex', cursor: 'pointer', padding: 4 }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill={on ? F.accent : 'none'} stroke={on ? F.accent : '#8a8597'} strokeWidth="2" strokeLinejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>
  </span>
);

/** Tuile de la grille (image sur fond lavande, nom en gras, muscle en gris) — comme la vidéo. */
export function ExTile({ name, sub, img, favId, onClick, badge }: { name: string; sub: string; img: string[]; favId?: string | null; onClick: () => void; badge?: string }) {
  const [favs, toggle] = useFavs();
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick} style={{ background: F.tile, borderRadius: 16, padding: 0, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 4, insetInlineStart: 4, zIndex: 2 }}>{favId ? <Bookmark on={favs.includes(favId)} onClick={() => toggle(favId)} /> : null}</div>
      {badge && <div style={{ position: 'absolute', top: 8, insetInlineEnd: 8, zIndex: 2, background: F.accent, color: '#fff', borderRadius: 999, fontSize: 10.5, fontWeight: 700, padding: '3px 7px' }}>{badge}</div>}
      <div style={{ height: 132, padding: '14px 8px 0', display: 'flex', alignItems: 'center' }}>{img.length ? <Anim img={img} alt={name} h={118} /> : <div style={{ width: '100%', textAlign: 'center', fontSize: 40 }}>🏋️</div>}</div>
      <div style={{ padding: '8px 11px 12px' }}>
        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.22 }}>{name}</div>
        <div style={{ fontSize: 12, color: F.muted, marginTop: 3 }}>{sub}</div>
      </div>
    </motion.button>
  );
}

export interface SessionInfo { name: string; demo?: string[]; img?: string[]; sets?: number; reps?: string; rest?: number; tip?: string; alt?: string[]; video?: string; id?: string | null }
const dbIdOf = (demo?: string[]) => /\/exercises\/([^/]+)\/\d\.jpg/.exec(demo?.[0] ?? '')?.[1] ?? null;
const slug = (t: string) => `n:${t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
const ytOf = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} technique musculation`)}`;

type DTab = 'about' | 'hist' | 'prog';
/** Fiche plein écran d'un exercice : celui d'une séance / d'un scan (session) ou de la bibliothèque (id). */
export function ExerciseSheet({ session, id, onClose, z = 65 }: { session?: SessionInfo | null; id?: string | null; onClose: () => void; z?: number }) {
  const open = !!session || !!id;
  const [d, setD] = useState<LibDetail | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<DTab>('about');
  const [favs, toggleFav] = useFavs();
  const [toast, setToast] = useState('');
  useEffect(() => {
    setD(null); setErr(''); setTab('about');
    if (!open) return;
    const db = id ?? session?.id ?? dbIdOf(session?.demo ?? session?.img);
    setBusy(true);
    (db ? get<{ ex: LibDetail }>(`/api/forme/exlib/${encodeURIComponent(db)}`) : get<{ ex: LibDetail | null }>(`/api/forme/exlib-match?name=${encodeURIComponent(session!.name)}`))
      .then(r => setD(r.ex)).catch(e => setErr(errText(e))).finally(() => setBusy(false));
  }, [open, id, session?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose]);
  const img = session?.demo?.length ? session.demo : session?.img?.length ? session.img : d?.img ?? [];
  const title = session?.name ?? d?.fr ?? '';
  const key = d?.id ?? (title ? slug(title) : '');
  const video = session?.video ?? ytOf(d?.name ?? title);
  const share = async () => {
    const text = `${title} — ${d ? d.p.map(m => MUSCLE_FR[m] ?? m).join(', ') : ''}\n${video}`;
    try { if (navigator.share) await navigator.share({ title, text }); else { await navigator.clipboard.writeText(text); setToast('Copié'); setTimeout(() => setToast(''), 1500); } } catch { /* annulé */ }
  };
  const pill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${F.line}`, borderRadius: 999, padding: '8px 13px', fontSize: 13, fontWeight: 600, color: F.ink, textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="ex" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          style={{ position: 'fixed', inset: 0, zIndex: z, background: `linear-gradient(180deg, #f7f3fb, ${F.bg})`, overflowY: 'auto', fontFamily: F.sans, color: F.ink, paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' }}>
          <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'rgba(247,243,251,0.9)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', padding: 'calc(8px + env(safe-area-inset-top)) 12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={onClose} aria-label="Retour" style={{ width: 40, height: 40, border: 'none', background: 'none', fontSize: 26, cursor: 'pointer', color: F.ink, lineHeight: 1 }}>‹</button>
              <div style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 16.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
              <div style={{ width: 40 }} />
            </div>
            <div style={{ display: 'flex', gap: 22, padding: '6px 14px 0', borderBottom: `1px solid ${F.line}` }}>
              {([['about', 'À propos'], ['hist', 'Historique'], ['prog', 'Progrès']] as Array<[DTab, string]>).map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', padding: '8px 0 10px', fontSize: 14.5, fontWeight: tab === t ? 600 : 500, color: tab === t ? F.ink : F.muted, borderBottom: `2px solid ${tab === t ? F.ink : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: '0 16px' }}>
            {tab === 'about' && <>
              <div style={{ height: 290, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
                {img.length ? <Anim img={img} alt={title} h={280} /> : busy ? <Spinner /> : <div style={{ fontSize: 60 }}>🏋️</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 0 4px' }}>
                {key && <button onClick={() => toggleFav(key)} style={pill}><svg width="15" height="15" viewBox="0 0 24 24" fill={favs.includes(key) ? F.accent : 'none'} stroke={favs.includes(key) ? F.accent : F.ink} strokeWidth="2"><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>{favs.includes(key) ? 'Favori' : 'Favoris'}</button>}
                <a href={video} target="_blank" rel="noreferrer" style={pill}><span style={{ background: '#ff0000', color: '#fff', borderRadius: 4, fontSize: 9, padding: '2px 4px' }}>▶</span>YouTube</a>
                <button onClick={() => void share()} style={pill}>↗ Partager</button>
                <button onClick={() => document.getElementById('ex-how')?.scrollIntoView({ behavior: 'smooth' })} style={pill}>💡 Comment faire</button>
              </div>
              {toast && <div style={{ fontSize: 12.5, color: F.green, fontWeight: 600 }}>{toast}</div>}
              {d && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {[EQ_FR[d.eq] ?? d.eq, LEVEL_FR[d.level] ?? d.level, session && d.fr !== session.name ? `≈ ${d.fr}` : ''].filter(Boolean).map(t => <span key={t} style={{ background: F.tile, borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 600 }}>{t}</span>)}
              </div>}
              {session && (session.sets || session.tip) && <div style={{ ...card, marginTop: 12, fontSize: 14.5, lineHeight: 1.5 }}>
                {session.sets ? <><b>{session.sets} × {session.reps}</b>{session.rest ? ` · repos ${session.rest} s` : ''}<br /></> : null}
                {session.tip && <>💡 {session.tip}</>}{session.alt?.length ? <><br />🔁 Variantes : {session.alt.join(', ')}</> : null}
              </div>}
              {busy && !d && <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 24, color: F.muted }}><Spinner size={18} /> Préparation de la fiche…</div>}
              {err && <div style={{ color: F.red, fontWeight: 600, marginTop: 12 }}>❌ {err}</div>}
              {!busy && !d && !err && <div style={{ ...card, marginTop: 12, color: F.muted, fontSize: 14 }}>Pas encore de fiche détaillée pour cet exercice — regarde la vidéo YouTube.</div>}
              {d && <>
                <div style={{ fontSize: 18, fontWeight: 700, margin: '22px 0 12px' }}>Muscles ciblés</div>
                <MuscleMap p={d.p} s={d.s} h={250} />
                <div id="ex-how" style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Comment le faire</div>
                {d.steps.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 13, background: F.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12.5, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ fontSize: 14.5, lineHeight: 1.45, paddingTop: 3 }}>{t}</div>
                  </div>
                ))}
                {d.breathing && <div style={{ ...card, background: F.soft, boxShadow: 'none', fontSize: 14, lineHeight: 1.45 }}>🌬️ {d.breathing}</div>}
                {d.mistakes.length > 0 && <>
                  <div style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Erreurs à éviter</div>
                  <div style={{ ...card, padding: '4px 14px' }}>{d.mistakes.map((m, i) => <div key={i} style={{ padding: '10px 0', borderBottom: i < d.mistakes.length - 1 ? `1px solid ${F.line}` : 'none', fontSize: 14, lineHeight: 1.4 }}>⚠️ {m}</div>)}</div>
                </>}
              </>}
              <a href={video} target="_blank" rel="noreferrer" style={{ ...btn, display: 'block', textAlign: 'center', marginTop: 20, textDecoration: 'none' }}>▶ Voir la vidéo (YouTube)</a>
              <div style={{ fontSize: 11, color: F.muted, textAlign: 'center', marginTop: 10 }}>Photos : free-exercise-db · Schémas : wger.de (CC BY-SA)</div>
            </>}
            {tab !== 'about' && key && <HistoryTab id={key} prog={tab === 'prog'} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Onglets « Historique » (noter une série, liste par jour) et « Progrès » (courbe de la meilleure charge + record). */
function HistoryTab({ id, prog }: { id: string; prog: boolean }) {
  const [sets, setSets] = useState<ExSet[] | null>(null);
  const [kg, setKg] = useState(''); const [reps, setReps] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { forme.exLog(id).then(r => setSets(r.sets)).catch(e => setErr(errText(e))); }, [id]);
  const add = async () => {
    const k = Number(kg.replace(',', '.')), r = Number(reps);
    if (!k && !r) return;
    setBusy(true); try { setSets((await forme.exAdd(id, k || undefined, r || undefined)).sets); vibrate(20); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  if (!sets) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>{err ? <span style={{ color: F.red }}>❌ {err}</span> : <Spinner />}</div>;
  const byDate = new Map<string, ExSet[]>();
  for (const s of [...sets].reverse()) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const e1rm = (s: ExSet) => s.kg ? s.kg * (1 + (s.reps ?? 1) / 30) : 0;
  if (prog) {
    const days = [...byDate].map(([date, l]) => ({ x: date, y: Math.max(...l.map(s => s.kg ?? 0)) })).filter(p => p.y > 0).reverse();
    const best = sets.reduce<ExSet | null>((a, s) => (s.kg ?? 0) > (a?.kg ?? 0) ? s : a, null);
    const bestE = Math.round(Math.max(0, ...sets.map(e1rm)));
    const vol = sets.filter(s => s.date >= new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)).reduce((a, s) => a + (s.kg ?? 0) * (s.reps ?? 0), 0);
    return (
      <div style={{ paddingTop: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[[best?.kg ? `${best.kg} kg` : '—', 'Record'], [bestE ? `${bestE} kg` : '—', '1RM estimé'], [vol ? `${Math.round(vol)} kg` : '—', 'Volume 30 j']].map(([v, l]) => (
            <div key={l} style={{ ...card, padding: 12 }}><div style={{ fontSize: 19, fontWeight: 700 }}>{v}</div><div style={{ fontSize: 12, color: F.muted }}>{l}</div></div>
          ))}
        </div>
        <div style={{ ...card, marginTop: 12 }}><div style={{ fontWeight: 600, marginBottom: 6 }}>Meilleure charge par séance</div><LineChart points={days} color={F.accent} unit="kg" /></div>
        {!sets.length && <div style={{ color: F.muted, fontSize: 14, textAlign: 'center', marginTop: 12 }}>Note tes séries dans « Historique » : la courbe se dessine toute seule.</div>}
      </div>
    );
  }
  const num: CSSProperties = { ...input, padding: '12px', textAlign: 'center', fontWeight: 700 };
  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ ...card }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Noter une série</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
          <input inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} placeholder="kg" style={num} />
          <input inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} placeholder="reps" style={num} />
          <button disabled={busy} onClick={() => void add()} style={{ ...btn, padding: '0 20px' }}>{busy ? '…' : '＋'}</button>
        </div>
      </div>
      {err && <div style={{ color: F.red, marginTop: 10 }}>❌ {err}</div>}
      {!sets.length && <div style={{ color: F.muted, fontSize: 14, textAlign: 'center', marginTop: 20 }}>Aucune série notée pour cet exercice.</div>}
      {[...byDate].map(([date, l]) => (
        <div key={date} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: F.muted, marginBottom: 6 }}>{new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div style={{ ...card, padding: '4px 14px' }}>
            {[...l].reverse().map((s, i) => (
              <div key={s.at} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < l.length - 1 ? `1px solid ${F.line}` : 'none' }}>
                <div style={{ width: 28, color: F.muted, fontWeight: 600 }}>{i + 1}</div>
                <div style={{ flex: 1, fontWeight: 600 }}>{s.kg ? `${s.kg} kg` : '—'} × {s.reps ?? '—'}</div>
                <button onClick={async () => setSets((await forme.exDel(id, s.at)).sets)} aria-label="Supprimer" style={{ background: 'none', border: 'none', color: F.muted, fontSize: 16, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 📚 Bibliothèque plein onglet, comme l'appli de la vidéo. */
export function LibraryScreen() {
  const [items, setItems] = useState<LibItem[] | null>(null);
  const [err, setErr] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [eqs, setEqs] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [n, setN] = useState(40);
  const [pick, setPick] = useState<string | null>(null);
  const [favs] = useFavs();
  useEffect(() => { get<{ items: LibItem[] }>('/api/forme/exlib').then(r => setItems(r.items)).catch(e => setErr(errText(e))); }, []);
  useEffect(() => setN(40), [group, q, eqs, favOnly]);
  const list = useMemo(() => {
    if (!items) return [];
    const t = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const g = GROUPS.find(x => x.id === group);
    const rank = (x: LibItem) => (x.cat === 'strength' ? 0 : 1) + (['dumbbell', 'barbell', 'cable', 'machine', 'body only'].includes(x.eq) ? 0 : 1);
    return items.filter(x => (!t || `${x.fr} ${x.name}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t))
      && (!g || x.p.some(m => g.m.includes(m))) && (!eqs.length || eqs.includes(x.eq)) && (!favOnly || favs.includes(x.id)))
      .sort((a, b) => rank(a) - rank(b));
  }, [items, group, q, eqs, favOnly, favs]);
  const iconBtn: CSSProperties = { width: 38, height: 38, borderRadius: 19, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: F.ink };
  return (
    <div style={{ padding: '0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0 6px' }}>
        <div style={{ flex: 1, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>Bibliothèque</div>
        <button aria-label="Chercher" onClick={() => { setSearching(s => !s); if (searching) setQ(''); }} style={iconBtn}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></button>
        <button aria-label="Filtrer" onClick={() => { setDraft(eqs); setFilterOpen(true); }} style={{ ...iconBtn, position: 'relative' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9.5" /><path d="M7.5 9h9M9 12.5h6M10.5 16h3" /></svg>
          {eqs.length > 0 && <span style={{ position: 'absolute', top: 3, right: 3, width: 9, height: 9, borderRadius: 5, background: F.accent }} />}
        </button>
      </div>
      {searching && <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher (développé, curl, tirage…)" style={{ ...input, marginBottom: 8, borderRadius: 12, background: F.tile, border: 'none' }} />}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0 10px', alignItems: 'flex-end', scrollbarWidth: 'none' }}>
        <button onClick={() => { vibrate(8); setFavOnly(f => !f); }} aria-label="Mes favoris" style={{ flexShrink: 0, width: 46, height: 74, borderRadius: 12, border: favOnly ? `2px solid ${F.ink}` : '2px solid transparent', background: favOnly ? '#fff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill={favOnly ? F.accent : 'none'} stroke={favOnly ? F.accent : F.ink} strokeWidth="2"><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>
        </button>
        {GROUPS.map(g => (
          <button key={g.id} onClick={() => { vibrate(8); setGroup(group === g.id ? null : g.id); }} style={{ flexShrink: 0, width: 62, padding: '5px 0 4px', borderRadius: 12, border: group === g.id ? `2px solid ${F.ink}` : '2px solid transparent', background: group === g.id ? '#fff' : 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'inherit' }}>
            <Figure side={g.side} p={g.m} h={52} />
            <div style={{ fontSize: 10.5, fontWeight: 600, color: group === g.id ? F.ink : F.muted, marginTop: 2 }}>{g.label}</div>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 2px 10px' }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{favOnly ? 'Mes favoris' : group ? GROUPS.find(g => g.id === group)!.label : 'Tous les exercices'}{eqs.length ? ` · ${eqs.map(e => EQ_FR[e] ?? e).join(', ')}` : ''}</div>
        <div style={{ fontSize: 12.5, color: F.muted }}>{items ? list.length : ''}</div>
      </div>
      {err && <div style={{ color: F.red, fontWeight: 600 }}>❌ {err}</div>}
      {!items && !err && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
        {list.slice(0, n).map(x => <ExTile key={x.id} name={x.fr} sub={x.p.map(m => MUSCLE_FR[m] ?? m).join(', ')} img={x.img} favId={x.id} onClick={() => setPick(x.id)} />)}
      </div>
      {list.length > n && <button onClick={() => setN(n + 40)} style={{ ...ghostBtn, width: '100%', marginTop: 12 }}>Voir plus ({list.length - n})</button>}
      {items && !list.length && <div style={{ color: F.muted, textAlign: 'center', padding: 24 }}>{favOnly ? 'Touche le marque-page d\'un exercice pour le garder ici.' : 'Aucun exercice trouvé.'}</div>}
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title={<div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>Filtre</div>}>
        <div style={{ fontWeight: 600, margin: '4px 0 12px' }}>Matériel</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {['barbell', 'dumbbell', 'body only', 'cable', 'machine', 'e-z curl bar', 'kettlebells', 'bands', 'exercise ball', 'medicine ball', 'foam roll', 'other'].map(e => {
            const on = draft.includes(e);
            return (
              <button key={e} onClick={() => { vibrate(8); setDraft(on ? draft.filter(x => x !== e) : [...draft, e]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontFamily: 'inherit', padding: 0 }}>
                <div style={{ width: 62, height: 62, borderRadius: 31, background: '#fff', border: on ? `2.5px solid ${F.accent}` : `1px solid ${F.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{EQ_ICON[e] ?? '•'}</div>
                <div style={{ fontSize: 11.5, color: on ? F.accent : F.ink, fontWeight: on ? 600 : 500, textAlign: 'center' }}>{EQ_FR[e] ?? e}</div>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={() => setDraft([])} style={{ ...ghostBtn, flex: 1, background: F.tile, border: 'none', padding: '14px' }}>Tout effacer</button>
          <button onClick={() => { setEqs(draft); setFilterOpen(false); }} style={{ ...btn, flex: 1 }}>Appliquer</button>
        </div>
      </Sheet>
      <ExerciseSheet id={pick} onClose={() => setPick(null)} />
    </div>
  );
}

// ── Carte de RÉCUPÉRATION (façon Fitbod) : chaque groupe coloré selon sa récupération ──
// Groupes du coach (sport-coach.ts) → calques wger. Calque rouge recoloré : vert = prêt, orange = bientôt, rouge = fatigué.
const REC: Record<string, { f?: number[]; b?: number[] }> = {
  pecs: { f: [4] }, epaules: { f: [2] }, bras: { f: [1, 13], b: [5] }, dos: { b: [12, 9] }, abdos: { f: [6, 14] }, jambes: { f: [10], b: [11, 8, 7, 15] },
};
const recColor = (pct: number) => pct >= 100 ? 'hue-rotate(115deg) saturate(0.9)' : pct >= 60 ? 'hue-rotate(32deg) saturate(1.2)' : 'none';
export function RecoveryMap({ rec, h = 190 }: { rec: Array<{ muscle: string; pct: number }>; h?: number }) {
  const fig = (side: 'f' | 'b') => (
    <div style={{ position: 'relative', height: h, aspectRatio: '200 / 369' }}>
      <img src={`${BASE}/muscular_system_${side === 'f' ? 'front' : 'back'}.svg`} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {rec.flatMap(r => (REC[r.muscle]?.[side] ?? []).map(n => <img key={`${r.muscle}-${n}`} src={`${BASE}/main/muscle-${n}.svg`} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', filter: recColor(r.pct), opacity: 0.9 }} />))}
    </div>
  );
  return <div style={{ display: 'flex', justifyContent: 'center', gap: 20, direction: 'ltr' }}>{fig('f')}{fig('b')}</div>;
}

// ── Sélecteur d'exercices (routines, « + Exercice » et « Remplacer » pendant la séance) ──
let libCache: LibItem[] | null = null;
export async function loadLib(): Promise<LibItem[]> { if (!libCache) libCache = (await get<{ items: LibItem[] }>('/api/forme/exlib')).items; return libCache; }
export const COACH_TO_GROUP: Record<string, string> = { pecs: 'chest', dos: 'back', epaules: 'shoulders', bras: 'biceps', jambes: 'legs', abdos: 'abs' };
export function LibraryPicker({ open, onClose, onPick, multi = false, group: g0 = null, likeId = null, title = 'Ajouter des exercices', z = 75 }: { open: boolean; onClose: () => void; onPick: (items: LibItem[]) => void; multi?: boolean; group?: string | null; likeId?: string | null; title?: string; z?: number }) {
  const [items, setItems] = useState<LibItem[] | null>(libCache);
  const [group, setGroup] = useState<string | null>(g0);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<LibItem[]>([]);
  const [n, setN] = useState(30);
  const groupOf = (lib: LibItem[] | null) => { const it = likeId && lib ? lib.find(x => x.id === likeId) : null; return it ? GROUPS.find(gr => it.p.some(m => gr.m.includes(m)))?.id ?? g0 : g0; };
  useEffect(() => { if (open) { setSel([]); setQ(''); setGroup(groupOf(items)); setN(30); if (!items) void loadLib().then(l => { setItems(l); setGroup(groupOf(l)); }).catch(() => {}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    if (!items) return [];
    const t = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const gg = GROUPS.find(x => x.id === group);
    const rank = (x: LibItem) => (x.cat === 'strength' ? 0 : 1) + (['dumbbell', 'barbell', 'cable', 'machine'].includes(x.eq) ? 0 : 1);
    return items.filter(x => (!t || `${x.fr} ${x.name}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t)) && (!gg || x.p.some(m => gg.m.includes(m)))).sort((a, b) => rank(a) - rank(b));
  }, [items, group, q]);
  const pick = (x: LibItem) => { vibrate(10); if (!multi) { onPick([x]); onClose(); return; } setSel(s => s.some(y => y.id === x.id) ? s.filter(y => y.id !== x.id) : [...s, x]); };
  return (
    <Sheet open={open} onClose={onClose} z={z} title={<div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>{title}</div>}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un exercice" style={{ ...input, borderRadius: 12, background: F.tile, border: 'none', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
        {GROUPS.map(x => <button key={x.id} onClick={() => setGroup(group === x.id ? null : x.id)} style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 999, border: 'none', background: group === x.id ? F.ink : F.tile, color: group === x.id ? '#fff' : F.ink, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{x.label}</button>)}
      </div>
      {!items && <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>}
      <div style={{ display: 'grid', gap: 2 }}>
        {list.slice(0, n).map(x => { const on = sel.some(y => y.id === x.id); return (
          <button key={x.id} onClick={() => pick(x)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 6px', borderRadius: 12, border: 'none', background: on ? F.soft : 'transparent', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink }}>
            <div style={{ width: 54, height: 54, borderRadius: 12, background: F.tile, flexShrink: 0, padding: 3, boxSizing: 'border-box', display: 'flex', alignItems: 'center' }}><Img src={x.img[0]} style={{ width: '100%', height: 46, objectFit: 'contain', background: 'transparent', mixBlendMode: 'multiply' }} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14.5 }}>{x.fr}</div><div style={{ fontSize: 12, color: F.muted }}>{x.p.map(m => MUSCLE_FR[m] ?? m).join(', ')} · {EQ_FR[x.eq] ?? x.eq}</div></div>
            {multi && <div style={{ width: 24, height: 24, borderRadius: 12, border: on ? 'none' : `2px solid ${F.line}`, background: on ? F.accent : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{on ? '✓' : ''}</div>}
          </button>); })}
      </div>
      {list.length > n && <button onClick={() => setN(n + 30)} style={{ ...ghostBtn, width: '100%', marginTop: 8 }}>Voir plus</button>}
      {multi && <div style={{ position: 'sticky', bottom: 0, paddingTop: 10, background: F.bg }}><button disabled={!sel.length} onClick={() => { onPick(sel); onClose(); }} style={{ ...btn, width: '100%', opacity: sel.length ? 1 : 0.5 }}>Ajouter {sel.length ? `(${sel.length})` : ''}</button></div>}
    </Sheet>
  );
}
