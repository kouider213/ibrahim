import { useEffect, useMemo, useState } from 'react';
import { get, errText, type LibItem, type LibDetail } from './api.ts';
import { F, card, ghostBtn, input, Sheet, Img, Spinner, Chip, Section } from './ui.tsx';

// FICHE EXERCICE + BIBLIOTHÈQUE (Kouider 26/10, « comme l'appli de la vidéo ») : démo animée, muscles travaillés en
// rouge sur le schéma du corps (avant / dos), étapes, erreurs à éviter. Exercices : free-exercise-db (domaine public) via
// /api/forme/exlib ; schémas des muscles : wger.de (CC BY-SA), dans public/muscles/.
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
const EQ_FR: Record<string, string> = { barbell: 'Barre', dumbbell: 'Haltères', 'body only': 'Poids du corps', cable: 'Poulie', machine: 'Machine', kettlebells: 'Kettlebell',
  bands: 'Élastique', 'medicine ball': 'Médecine-ball', 'exercise ball': 'Swiss ball', 'foam roll': 'Rouleau', 'e-z curl bar': 'Barre EZ', other: 'Autre', none: 'Sans matériel' };
const LEVEL_FR: Record<string, string> = { beginner: 'Débutant', intermediate: 'Intermédiaire', expert: 'Confirmé' };
// Filtres de la bibliothèque (comme les petits bonshommes de la vidéo)
const GROUPS: Array<{ id: string; label: string; m: string[] }> = [
  { id: 'chest', label: 'Pecs', m: ['chest'] }, { id: 'back', label: 'Dos', m: ['lats', 'middle back', 'lower back', 'traps'] },
  { id: 'shoulders', label: 'Épaules', m: ['shoulders'] }, { id: 'arms', label: 'Bras', m: ['biceps', 'triceps', 'forearms'] },
  { id: 'abs', label: 'Abdos', m: ['abdominals'] }, { id: 'legs', label: 'Jambes', m: ['quadriceps', 'hamstrings', 'calves', 'adductors', 'abductors'] },
  { id: 'glutes', label: 'Fessiers', m: ['glutes'] },
];

/** Schéma du corps (face + dos) : muscles principaux en rouge, secondaires en orange. */
export function MuscleMap({ p, s, h = 230 }: { p: string[]; s: string[]; h?: number }) {
  const layers = (side: 'f' | 'b', list: string[]) => [...new Set(list.flatMap(m => WGER[m]?.[side] ?? []))];
  const fig = (side: 'f' | 'b') => {
    const main = layers(side, p), sec = layers(side, s).filter(n => !main.includes(n));
    return (
      <div style={{ position: 'relative', height: h, aspectRatio: '200 / 369' }}>
        {[`${BASE}/muscular_system_${side === 'f' ? 'front' : 'back'}.svg`, ...sec.map(n => `${BASE}/secondary/muscle-${n}.svg`), ...main.map(n => `${BASE}/main/muscle-${n}.svg`)]
          .map(src => <img key={src} src={src} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />)}
      </div>
    );
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 18, direction: 'ltr' }}>{fig('f')}{fig('b')}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
        {p.map(m => <span key={m} style={{ background: '#fde2dc', color: F.red, borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 800 }}>● {MUSCLE_FR[m] ?? m}</span>)}
        {s.map(m => <span key={m} style={{ background: '#fdf0dc', color: '#c27a10', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 700 }}>○ {MUSCLE_FR[m] ?? m}</span>)}
      </div>
    </div>
  );
}

function Anim({ img, alt, h }: { img: string[]; alt: string; h: number }) {
  const [f, setF] = useState(0);
  useEffect(() => { if (img.length < 2) return; const t = setInterval(() => setF(x => 1 - x), 900); return () => clearInterval(t); }, [img.length]);
  return <Img src={img[f] ?? img[0]} alt={alt} style={{ width: '100%', height: h, background: '#fff', objectFit: 'contain' }} />;
}

export interface SessionInfo { name: string; demo?: string[]; sets?: number; reps?: string; rest?: number; tip?: string; alt?: string[]; video?: string }
const dbIdOf = (demo?: string[]) => /\/exercises\/([^/]+)\/\d\.jpg/.exec(demo?.[0] ?? '')?.[1] ?? null;

/** Fiche d'un exercice : celui d'une séance (session) ou de la bibliothèque (id). */
export function ExerciseSheet({ session, id, onClose, z }: { session?: SessionInfo | null; id?: string | null; onClose: () => void; z?: number }) {
  const open = !!session || !!id;
  const [d, setD] = useState<LibDetail | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setD(null); setErr('');
    if (!open) return;
    const db = id ?? dbIdOf(session?.demo);
    setBusy(true);
    (db ? get<{ ex: LibDetail }>(`/api/forme/exlib/${encodeURIComponent(db)}`) : get<{ ex: LibDetail | null }>(`/api/forme/exlib-match?name=${encodeURIComponent(session!.name)}`))
      .then(r => setD(r.ex)).catch(e => setErr(errText(e))).finally(() => setBusy(false));
  }, [open, id, session?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const img = session?.demo?.length ? session.demo : d?.img ?? [];
  const title = session?.name ?? d?.fr ?? '';
  return (
    <Sheet open={open} onClose={onClose} title={title} z={z}>
      {open && <>
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>{img.length ? <Anim img={img} alt={title} h={250} /> : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{busy ? <Spinner /> : '🏋️'}</div>}</div>
        {d && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {[EQ_FR[d.eq] ?? d.eq, LEVEL_FR[d.level] ?? d.level, session && d.fr !== session.name ? `≈ ${d.fr}` : ''].filter(Boolean).map(t => <span key={t} style={{ background: '#fff', border: `1px solid ${F.line}`, borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 700 }}>{t}</span>)}
        </div>}
        {session && (session.sets || session.tip) && <div style={{ ...card, marginTop: 12, fontSize: 14.5, lineHeight: 1.5 }}>
          {session.sets ? <><b>{session.sets} × {session.reps}</b>{session.rest ? ` · repos ${session.rest} s` : ''}<br /></> : null}
          {session.tip && <>💡 {session.tip}</>}{session.alt?.length ? <><br />🔁 Variantes : {session.alt.join(', ')}</> : null}
        </div>}
        {busy && !d && <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 24, color: F.muted }}><Spinner size={18} /> Préparation de la fiche…</div>}
        {err && <div style={{ color: F.red, fontWeight: 700, marginTop: 12 }}>❌ {err}</div>}
        {!busy && !d && !err && session && <div style={{ ...card, marginTop: 12, color: F.muted, fontSize: 14 }}>Pas encore de fiche détaillée pour cet exercice — regarde la vidéo ci-dessous.</div>}
        {d && <>
          <Section a="Muscles" b="travaillés" />
          <div style={{ ...card }}><MuscleMap p={d.p} s={d.s} /></div>
          <Section a="Comment" b="le faire" />
          {d.steps.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: F.dark, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.45, paddingTop: 4 }}>{t}</div>
            </div>
          ))}
          {d.breathing && <div style={{ ...card, background: F.soft, boxShadow: 'none', fontSize: 14, lineHeight: 1.45 }}>🌬️ {d.breathing}</div>}
          {d.mistakes.length > 0 && <>
            <Section a="Erreurs" b="à éviter" />
            <div style={{ ...card, padding: '4px 14px' }}>{d.mistakes.map((m, i) => <div key={i} style={{ padding: '10px 0', borderBottom: i < d.mistakes.length - 1 ? `1px solid ${F.line}` : 'none', fontSize: 14, lineHeight: 1.4 }}>⚠️ {m}</div>)}</div>
          </>}
        </>}
        <a href={session?.video ?? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${d?.fr ?? title} exercice technique`)}`} target="_blank" rel="noreferrer" style={{ ...ghostBtn, display: 'block', textAlign: 'center', marginTop: 14, textDecoration: 'none' }}>▶ Vidéos de la technique</a>
        <div style={{ fontSize: 11, color: F.muted, textAlign: 'center', marginTop: 10 }}>Photos : free-exercise-db · Schémas : wger.de (CC BY-SA)</div>
      </>}
    </Sheet>
  );
}

/** 📚 Tous les exercices, filtrés par muscle (comme l'appli de la vidéo). */
export function ExerciseLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<LibItem[] | null>(null);
  const [err, setErr] = useState('');
  const [group, setGroup] = useState('chest');
  const [q, setQ] = useState('');
  const [n, setN] = useState(40);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => { if (open && !items) get<{ items: LibItem[] }>('/api/forme/exlib').then(r => setItems(r.items)).catch(e => setErr(errText(e))); }, [open, items]);
  useEffect(() => setN(40), [group, q]);
  const list = useMemo(() => {
    if (!items) return [];
    const t = q.trim().toLowerCase();
    const g = GROUPS.find(x => x.id === group)!;
    const rank = (x: LibItem) => (x.cat === 'strength' ? 0 : 1) + (['dumbbell', 'barbell', 'cable', 'machine', 'body only'].includes(x.eq) ? 0 : 1);
    return items.filter(x => t ? `${x.fr} ${x.name}`.toLowerCase().includes(t) : x.p.some(m => g.m.includes(m))).sort((a, b) => rank(a) - rank(b));
  }, [items, group, q]);
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Exercices">
        {open && <>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Chercher (ex. développé, squat, curl)" style={{ ...input, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>{GROUPS.map(g => <Chip key={g.id} on={!q && group === g.id} onClick={() => { setQ(''); setGroup(g.id); }}>{g.label}</Chip>)}</div>
          {!q && <div style={{ ...card, padding: 10, marginBottom: 12 }}><MuscleMap p={GROUPS.find(g => g.id === group)!.m} s={[]} h={150} /></div>}
          {err && <div style={{ color: F.red, fontWeight: 700 }}>❌ {err}</div>}
          {!items && !err && <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {list.slice(0, n).map(x => (
              <button key={x.id} onClick={() => setPick(x.id)} style={{ ...card, padding: 0, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink }}>
                <Img src={x.img[0]} style={{ width: '100%', height: 110, objectFit: 'contain', background: '#fff' }} />
                <div style={{ padding: '8px 10px 10px' }}><div style={{ fontWeight: 800, fontSize: 13.5, lineHeight: 1.25 }}>{x.fr}</div><div style={{ fontSize: 12, color: F.muted, marginTop: 3 }}>{x.p.map(m => MUSCLE_FR[m] ?? m).join(', ')} · {EQ_FR[x.eq] ?? x.eq}</div></div>
              </button>
            ))}
          </div>
          {list.length > n && <button onClick={() => setN(n + 40)} style={{ ...ghostBtn, width: '100%', marginTop: 12 }}>Voir plus ({list.length - n})</button>}
          {items && !list.length && <div style={{ color: F.muted, textAlign: 'center', padding: 20 }}>Aucun exercice trouvé.</div>}
        </>}
      </Sheet>
      <ExerciseSheet id={pick} onClose={() => setPick(null)} z={55} />
    </>
  );
}
