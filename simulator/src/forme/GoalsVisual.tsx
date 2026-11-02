import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { get, type GoalsView } from './api.ts';
import { F, card, darkCard, Ring, Bar, LineChart } from './ui.tsx';
import { RecoveryMap, ExerciseSheet } from './Exercises.tsx';
import type { Cut } from './Cut.tsx';

// 🎯 OBJECTIFS « PRO » (Kouider 02/11 : « trop simple, je veux un truc visuel avec des images, des conseils… la meilleure
// de toutes »). Le meilleur de ~20 applis, avec SES vraies données uniquement :
//  - Freeletics « Journey » / Future : héros avant → arrivée en photo + compte à rebours + parcours à étapes
//  - Fitbod / Hevy : carte des muscles colorée par niveau
//  - Caliber « Strength score » / Whoop : anneaux par zone
//  - MacroFactor / Happy Scale : courbe de poids lissée vers l'objectif
//  - Apple Fitness / Fitbit : badges gagnés / à débloquer
//  - Noom / Centr : conseils en cartes qui défilent
//  - Nike Training Club / Gymshark : exercices en grandes images, fiche au toucher
//  - Strava : « Aujourd'hui pour ton objectif » (ce qui reste à faire)
// Rien n'est inventé : pas de photo = cadre vide, zone pas visible = « ? », pas de pesée = pas de courbe.

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const today = () => new Date().toISOString().slice(0, 10);
const daysTo = (d: string) => Math.max(0, Math.round((Date.parse(`${d}T12:00:00Z`) - Date.now()) / 86_400_000));
const lvlColor = (n: number | null) => n == null ? 'rgba(255,255,255,0.25)' : n >= 70 ? '#34d399' : n >= 40 ? '#fbbf24' : '#5b8cff';
const lvlWord = (n: number | null) => n == null ? 'pas visible' : n >= 70 ? 'solide' : n >= 40 ? 'en route' : 'à construire';
const ZONE_MUSCLE: Record<string, RegExp> = { pecs: /pec|chest|poitr/i, bras: /bras|bicep|tricep|arm/i, abdos: /abdo|abs|core|gainage|ventre/i, epaules: /épaul|epaul|shoulder|delt/i, dos: /dos|back|lat|trap/i, jambes: /jamb|leg|quad|ischio|fess|glute|mollet/i };

const H = ({ t, sub }: { t: string; sub?: string }) => <div style={{ margin: '24px 2px 10px' }}><div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em' }}>{t}</div>{sub && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 2 }}>{sub}</div>}</div>;

/** 1. Héros : avant → arrivée, compte à rebours, anneau du parcours, statut. */
export function GoalHero({ g, onVision, details }: { g: GoalsView; onVision: () => void; details: boolean }) {
  const s = g.state, p = s.plan!;
  const ms = p.milestones, done = ms.filter(m => m.done).length;
  const elapsed = Math.max(0, Math.min(1, (Date.now() - p.at) / (p.weeks * 604_800_000)));
  const journey = ms.length ? Math.round((done / ms.length) * 100) : Math.round(elapsed * 100);
  const pc = g.pace;
  const pill = pc?.status === 'retard' ? { t: '⚠️ En retard', c: '#ff8a80' } : pc?.status === 'avance' ? { t: '🚀 En avance', c: '#7ee2a8' } : pc?.status === 'ok' ? { t: '✅ Dans les temps', c: '#9ecbff' } : null;
  const vis = s.vision?.status === 'done' || s.vision?.path ? g.visionUrl : null;
  return <div style={{ ...darkCard, padding: 0, overflow: 'hidden', marginTop: 12 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: 250, position: 'relative' }}>
      {[{ u: g.latest?.url ?? g.planPhotoUrl, l: 'AUJOURD\'HUI' }, { u: vis, l: `ARRIVÉE · ${fmt(p.eta)}` }].map((x, i) => (
        <div key={i} style={{ position: 'relative', background: i ? 'linear-gradient(160deg,#2b2a55,#16152a)' : '#16152a' }}>
          {x.u ? <img src={x.u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <button onClick={i ? onVision : undefined} style={{ position: 'absolute', inset: 0, background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', fontSize: 13, padding: 12, cursor: i ? 'pointer' : 'default', fontFamily: F.sans }}>{i ? (s.vision?.status === 'running' ? '⏳ Image en création…' : '🔮 Touche pour voir\ntoi à l\'arrivée') : '📸 Pas de photo'}</button>}
          <div style={{ position: 'absolute', left: 8, top: 8, background: i ? F.accent : 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.04em' }}>{x.l}</div>
        </div>
      ))}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 38, height: 38, borderRadius: 19, background: '#fff', color: F.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, boxShadow: '0 6px 18px rgba(0,0,0,0.35)' }}>→</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 70, background: 'linear-gradient(transparent, rgba(22,21,42,0.95))' }} />
    </div>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '4px 16px 16px' }}>
      <Ring value={journey} max={100} size={96} stroke={10} color="#7ee2a8">
        <div style={{ fontSize: 22, fontWeight: 900 }}>{journey}%</div>
        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>PARCOURS</div>
      </Ring>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1 }}>J-{daysTo(p.eta)}</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{done}/{ms.length} étapes · semaine {Math.min(p.weeks, Math.floor(elapsed * p.weeks) + 1)}/{p.weeks}</div>
        {pill && <div style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 800, color: pill.c, background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '4px 10px' }}>{pill.t}</div>}
      </div>
    </div>
    {details && <div style={{ padding: '0 16px 16px', fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,0.88)' }}>{p.summary}</div>}
    {p.warning && <div style={{ margin: '0 16px 16px', fontSize: 13, background: 'rgba(255,180,0,0.15)', borderRadius: 12, padding: 10, color: '#fff' }}>⚠️ {p.warning}</div>}
  </div>;
}

/** 2. Aujourd'hui pour ton objectif (Strava / Whoop) — depuis le module Sèche (vraies données du jour). */
export function GoalToday({ g }: { g: GoalsView }) {
  const [c, setC] = useState<Cut | null>(null);
  useEffect(() => { get<Cut>('/api/forme/cut').then(setC).catch(() => {}); }, []);
  const p = g.state.plan!;
  const tiles = c ? c.parts.map(x => ({ k: x.k, ok: x.ok, hint: x.hint })) : [];
  if (!c) return null;
  const ok = tiles.filter(t => t.ok).length;
  return <>
    <H t="⚡ Aujourd'hui pour ton objectif" sub={`${ok}/${tiles.length} fait · score du jour ${c.score}/100`} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
      {tiles.map(t => <div key={t.k} style={{ ...card, padding: 12, background: t.ok ? '#e9f8ef' : '#fff', border: `1px solid ${t.ok ? 'rgba(31,157,92,0.25)' : F.line}` }}>
        <div style={{ fontSize: 22 }}>{t.ok ? '✅' : '⏳'}</div>
        <div style={{ fontWeight: 800, fontSize: 14, marginTop: 4, textTransform: 'capitalize' }}>{t.k}</div>
        <div style={{ fontSize: 12, color: F.muted, marginTop: 2, lineHeight: 1.35 }}>{t.ok ? 'Validé' : t.hint}</div>
      </div>)}
    </div>
    <div style={{ fontSize: 12, color: F.muted, marginTop: 6 }}>Ton plan chaque semaine : {p.weekly.sessions} séances{p.weekly.steps ? ` · ${p.weekly.steps.toLocaleString('fr-FR')} pas/j` : ''}{p.weekly.protein ? ` · ${p.weekly.protein} g de protéines/j` : ''}{p.weekly.cardio ? ` · ${p.weekly.cardio}` : ''}</div>
  </>;
}

/** 3. Carte du corps + anneaux par zone (Fitbod / Caliber). */
export function GoalBody({ g, onEx, details }: { g: GoalsView; onEx: (id: string) => void; details: boolean }) {
  const s = g.state, p = s.plan!;
  const rec = p.zones.filter(z => z.now != null).map(z => ({ muscle: z.id, pct: z.now! >= 70 ? 100 : z.now! >= 40 ? 60 : 0 }));
  const prev = s.history.length > 1 ? s.history[s.history.length - 2]! : null;
  return <>
    <H t="🧍 Ton corps aujourd'hui" sub={`Photo du ${fmt(p.photoDate)} · estimation`} />
    <div style={{ ...darkCard }}>
      <RecoveryMap rec={rec} h={200} />
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>
        <span><b style={{ color: '#e5322d' }}>●</b> à construire</span><span><b style={{ color: '#fbbf24' }}>●</b> en route</span><span><b style={{ color: '#34d399' }}>●</b> solide</span>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '12px 2px 4px', scrollSnapType: 'x mandatory' }}>
      {p.zones.map((z, i) => {
        const star = s.priority.includes(z.id) || p.focus?.zones.includes(z.id);
        const ex = p.exercises.find(e => ZONE_MUSCLE[z.id]?.test(`${e.muscle} ${e.name}`));
        const d = prev && prev.levels[z.id] != null && z.now != null ? z.now - prev.levels[z.id]! : null;
        return <motion.div key={z.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
          style={{ ...card, padding: 0, overflow: 'hidden', minWidth: 210, maxWidth: 210, scrollSnapAlign: 'start', flexShrink: 0 }}>
          <div style={{ position: 'relative', height: 110, background: F.tile }}>
            {ex?.img && <img src={ex.img} alt="" loading="lazy" onClick={() => onEx(ex.id)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer' }} />}
            {star && <div style={{ position: 'absolute', left: 8, top: 8, background: F.gold, color: '#fff', borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 900 }}>⭐ PRIORITÉ</div>}
            <div style={{ position: 'absolute', right: 8, bottom: -26 }}>
              <div style={{ background: '#fff', borderRadius: 40, padding: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                <Ring value={z.now ?? 0} max={100} size={56} stroke={6} color={lvlColor(z.now) === 'rgba(255,255,255,0.25)' ? F.muted : lvlColor(z.now)} track={F.tile}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: F.ink }}>{z.now ?? '?'}</div>
                </Ring>
              </div>
            </div>
          </div>
          <div style={{ padding: '10px 12px 12px' }}>
            <div style={{ fontWeight: 800, fontSize: 15, paddingRight: 60 }}>{z.label}</div>
            <div style={{ fontSize: 12, color: F.muted, marginTop: 2 }}>{lvlWord(z.now)} · ~{z.weeks} sem.{d != null ? ` · ${d >= 0 ? '+' : ''}${d} depuis le dernier point` : ''}</div>
            {details && z.note && <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.35 }}>{z.note}</div>}
            {ex && <div onClick={() => onEx(ex.id)} style={{ fontSize: 12, color: F.accent, fontWeight: 800, marginTop: 6, cursor: 'pointer' }}>▶ {ex.name}</div>}
          </div>
        </motion.div>;
      })}
    </div>
  </>;
}

/** 4. Courbe de poids vers l'objectif (MacroFactor / Happy Scale). */
export function GoalWeight() {
  const [c, setC] = useState<Cut | null>(null);
  useEffect(() => { get<Cut>('/api/forme/cut').then(setC).catch(() => {}); }, []);
  if (!c || c.weight.points.length < 2) return null;
  const w = c.weight, first = w.points[0]!.kg, nowKg = w.last?.kg ?? w.points[w.points.length - 1]!.kg;
  return <>
    <H t="⚖️ Ton poids" />
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div><span style={{ fontSize: 28, fontWeight: 900 }}>{nowKg}</span> <span style={{ color: F.muted }}>kg</span></div>
        <div style={{ fontSize: 13, fontWeight: 800, color: first - nowKg >= 0 ? F.green : F.red }}>{first - nowKg >= 0 ? '−' : '+'}{Math.abs(Math.round((first - nowKg) * 10) / 10)} kg</div>
      </div>
      <LineChart points={w.points.map(x => ({ x: x.date, y: x.trend }))} goal={w.goalKg ?? undefined} color={F.violet} />
      {w.goalKg && <><Bar value={Math.max(0, first - nowKg)} max={Math.max(0.1, first - w.goalKg)} color={F.violet} track={F.bg2} h={8} />
        <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>Objectif {w.goalKg} kg{w.rateWeek != null ? ` · ${w.rateWeek} kg/semaine` : ''}{w.eta ? ` · atteint vers le ${fmt(w.eta)} à ce rythme` : ''}</div></>}
    </div>
  </>;
}

/** 5. Le parcours (Freeletics Journey) : étapes datées, « tu es ici ». */
export function GoalJourney({ g, onToggle, details }: { g: GoalsView; onToggle: (i: number, done: boolean) => void; details: boolean }) {
  const p = g.state.plan!, t = today();
  const hereIdx = p.milestones.findIndex(m => !m.done);
  return <>
    <H t="🗺️ Ton parcours" />
    <div style={{ ...card, padding: '14px 14px 6px' }}>
      {p.milestones.map((m, i) => {
        const late = !m.done && m.date < t, here = i === hereIdx;
        const col = m.done ? F.green : late ? F.red : here ? F.accent : F.line;
        return <div key={i} style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 30 }}>
            <button onClick={() => onToggle(i, !m.done)} style={{ width: here ? 30 : 24, height: here ? 30 : 24, borderRadius: 20, border: `3px solid ${col}`, background: m.done ? F.green : '#fff', color: '#fff', fontWeight: 900, cursor: 'pointer', flexShrink: 0, boxShadow: here ? `0 0 0 6px ${F.soft}` : 'none', padding: 0 }}>{m.done ? '✓' : ''}</button>
            {i < p.milestones.length - 1 && <div style={{ width: 3, flex: 1, minHeight: 26, background: m.done ? F.green : F.line, borderRadius: 2, margin: '2px 0' }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: 14 }}>
            {here && <div style={{ fontSize: 10.5, fontWeight: 900, color: F.accent, letterSpacing: '0.08em' }}>📍 TU ES ICI</div>}
            <div style={{ fontSize: 12, fontWeight: 800, color: late ? F.red : F.muted }}>{fmt(m.date)} · semaine {m.week}{late ? ' · en retard' : ''}</div>
            <div style={{ fontSize: 15, fontWeight: 800, textDecoration: m.done ? 'line-through' : 'none', color: m.done ? F.muted : F.ink }}>{m.title}</div>
            {details && m.check && !m.done && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 2 }}>{m.check}</div>}
            {m.auto && <div style={{ fontSize: 11.5, color: F.green, fontWeight: 700 }}>✓ coché automatiquement</div>}
          </div>
        </div>;
      })}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingBottom: 10 }}>
        <div style={{ width: 30, textAlign: 'center', fontSize: 22 }}>🏁</div>
        <div style={{ fontWeight: 900 }}>Arrivée · {fmt(p.eta)}</div>
      </div>
    </div>
  </>;
}

/** 6. Exercices en grandes images (NTC / Gymshark). */
export function GoalExercises({ g, onEx, details }: { g: GoalsView; onEx: (id: string) => void; details: boolean }) {
  const p = g.state.plan!;
  if (!p.exercises.length) return null;
  return <>
    <H t="🏋️ Tes exercices clés" />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {p.exercises.map(e => <button key={e.id} onClick={() => onEx(e.id)} style={{ ...card, padding: 0, overflow: 'hidden', border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: F.sans, color: F.ink }}>
        <div style={{ position: 'relative', aspectRatio: '1 / 1', background: F.tile }}>
          {e.img && <img src={e.img} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          <div style={{ position: 'absolute', right: 6, bottom: 6, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 999, padding: '3px 9px', fontSize: 11.5, fontWeight: 900 }}>{e.sets} × {e.reps}</div>
        </div>
        <div style={{ padding: '8px 10px 10px' }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, lineHeight: 1.25 }}>{e.name}</div>
          {details && e.why && <div style={{ fontSize: 11.5, color: F.muted, marginTop: 3, lineHeight: 1.3 }}>{e.why}</div>}
        </div>
      </button>)}
    </div>
  </>;
}

/** 7. Conseils du coach en cartes qui défilent (Noom / Centr). */
const TIP_STYLE = [
  { bg: 'linear-gradient(150deg,#1f63f0,#7b5cf0)', icon: '💡' }, { bg: 'linear-gradient(150deg,#e09a12,#e5322d)', icon: '🔥' },
  { bg: 'linear-gradient(150deg,#1f9d5c,#0e7490)', icon: '🌱' }, { bg: 'linear-gradient(150deg,#2c2938,#5b5470)', icon: '🧠' },
];
export function GoalTips({ g }: { g: GoalsView }) {
  const p = g.state.plan!;
  const tips = [...p.ideas.map(t => ({ t, k: 'Tu n\'y aurais pas pensé' })), ...p.habits.map(t => ({ t, k: 'Habitude gagnante' })), ...(p.focus?.why ? [{ t: p.focus.why, k: 'Pourquoi ces priorités' }] : [])];
  if (!tips.length) return null;
  return <>
    <H t="🎓 Les conseils de ton coach" sub="Fais défiler →" />
    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, scrollSnapType: 'x mandatory' }}>
      {tips.map((x, i) => { const st = TIP_STYLE[i % TIP_STYLE.length]!; return <div key={i} style={{ minWidth: 240, maxWidth: 240, minHeight: 170, flexShrink: 0, scrollSnapAlign: 'start', background: st.bg, color: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 10px 22px rgba(30,25,60,0.18)' }}>
        <div style={{ fontSize: 34 }}>{st.icon}</div>
        <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.1em', opacity: 0.8, marginTop: 6 }}>{x.k.toUpperCase()}</div>
        <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.4, marginTop: 4 }}>{x.t}</div>
      </div>; })}
    </div>
  </>;
}

/** 8. Badges (Apple Fitness / Fitbit) — calculés sur ce qui est vraiment fait. */
export function GoalBadges({ g }: { g: GoalsView }) {
  const s = g.state, p = s.plan;
  const ms = p?.milestones ?? [];
  const finished = s.challenges.filter(c => c.finished && c.progress >= 1).length;
  const B = [
    { e: '🎯', t: 'Plan lancé', ok: !!p },
    { e: '🏁', t: '1re étape', ok: ms.some(m => m.done) },
    { e: '🔥', t: 'Mi-parcours', ok: ms.length > 0 && ms.filter(m => m.done).length >= Math.ceil(ms.length / 2) },
    { e: '🏆', t: '1er défi réussi', ok: finished >= 1 },
    { e: '💎', t: '3 défis réussis', ok: finished >= 3 },
    { e: '📸', t: '2e photo de suivi', ok: s.history.length >= 2 },
    { e: '🚀', t: 'En avance', ok: g.pace?.status === 'avance' },
    { e: '👑', t: 'Arrivée', ok: ms.length > 0 && ms.every(m => m.done) },
  ];
  return <>
    <H t="🏅 Tes badges" sub={`${B.filter(b => b.ok).length}/${B.length} débloqués`} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {B.map(b => <div key={b.t} style={{ ...card, padding: '12px 4px', textAlign: 'center', opacity: b.ok ? 1 : 0.45, filter: b.ok ? 'none' : 'grayscale(1)' }}>
        <div style={{ fontSize: 28 }}>{b.ok ? b.e : '🔒'}</div>
        <div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 4, lineHeight: 1.2 }}>{b.t}</div>
      </div>)}
    </div>
  </>;
}

/** Fiche exercice (ouverte depuis la carte du corps ou la grille). */
export function GoalExSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  return id ? <ExerciseSheet id={id} onClose={onClose} z={80} /> : null;
}

/** 0. 📸 TON ÉVOLUTION EN IMAGES (Kouider 02/11 : « l'évolution avec des images, pas une explication détaillée »).
 *  Curseur avant / maintenant qu'on glisse au doigt (comme les applis de transformation) + toutes les photos par pose. */
export function GoalEvolution({ g }: { g: GoalsView }) {
  const all = g.evolution ?? [];
  const poses = (['face', 'dos', 'profil'] as const).filter(p => all.some(x => x.pose === p));
  const [pose, setPose] = useState<typeof poses[number]>(poses[0] ?? 'face');
  const list = all.filter(x => x.pose === pose);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  if (!all.length) return null;
  const before = list.find(x => x.id === beforeId) ?? list[0], after = list[list.length - 1];
  const move = (clientX: number) => { const r = ref.current?.getBoundingClientRect(); if (r) setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))); };
  const tag = (x: typeof all[number] | undefined, l: string) => x ? `${l} · ${fmt(x.date)}${x.kg ? ` · ${x.kg} kg` : ''}` : l;
  const days = before && after ? Math.round((Date.parse(after.date) - Date.parse(before.date)) / 86_400_000) : 0;
  const dKg = before?.kg && after?.kg ? Math.round((after.kg - before.kg) * 10) / 10 : null;
  return <>
    <H t="📸 Ton évolution" />
    {poses.length > 1 && <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
      {poses.map(p => <button key={p} onClick={() => { setPose(p); setBeforeId(null); }} style={{ flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13, fontFamily: F.sans, cursor: 'pointer', background: pose === p ? F.dark : '#fff', color: pose === p ? '#fff' : F.ink }}>{p === 'face' ? 'Face' : p === 'dos' ? 'Dos' : 'Profil'}</button>)}
    </div>}
    {list.length >= 2 && before && after && before.id !== after.id ? <div ref={ref}
      onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); move(e.clientX); }} onPointerMove={e => { if (e.buttons) move(e.clientX); }}
      style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 22, overflow: 'hidden', background: F.dark, touchAction: 'pan-y', userSelect: 'none', boxShadow: '0 12px 28px rgba(30,25,60,0.25)' }}>
      <img src={after.url} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <img src={before.url} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 3, background: '#fff', transform: 'translateX(-50%)', boxShadow: '0 0 10px rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'absolute', top: '50%', left: `${pos}%`, transform: 'translate(-50%,-50%)', width: 44, height: 44, borderRadius: 22, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: F.ink, boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}>⇆</div>
      <div style={{ position: 'absolute', left: 10, top: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 800 }}>{tag(before, 'AVANT')}</div>
      <div style={{ position: 'absolute', right: 10, top: 10, background: F.accent, color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 800 }}>{tag(after, 'MAINTENANT')}</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 14px 12px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', color: '#fff', display: 'flex', justifyContent: 'center', gap: 18, fontWeight: 900 }}>
        <span>⏱ {days} jours</span>{dKg != null && <span style={{ color: dKg <= 0 ? '#7ee2a8' : '#ffb4a8' }}>{dKg > 0 ? '+' : ''}{dKg} kg</span>}
      </div>
    </div> : after ? <div style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 22, overflow: 'hidden' }}>
      <img src={after.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <div style={{ position: 'absolute', left: 10, top: 10, background: F.accent, color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 800 }}>{tag(after, 'DÉPART')}</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 14px 12px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', color: '#fff', textAlign: 'center', fontWeight: 800, fontSize: 13 }}>📸 Prochaine photo dans la même pose → l'avant / après apparaît</div>
    </div> : null}
    {list.length > 1 && <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 2px 2px' }}>
      {list.map(x => { const on = x.id === before?.id; const last = x.id === after?.id; return <button key={x.id} onClick={() => !last && setBeforeId(x.id)} style={{ position: 'relative', flexShrink: 0, width: 76, height: 100, padding: 0, borderRadius: 14, overflow: 'hidden', border: `3px solid ${on ? F.gold : last ? F.accent : 'transparent'}`, cursor: last ? 'default' : 'pointer', background: F.tile }}>
        <img src={x.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 0', textAlign: 'center' }}>{fmt(x.date)}{x.kg ? ` · ${x.kg}` : ''}</div>
      </button>; })}
    </div>}
  </>;
}
