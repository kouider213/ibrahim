import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { apiFetch } from '../services/api.ts';
import { F, card, Sheet, Spinner } from './ui.tsx';
import { errText, vibrate } from './api.ts';
import { Anim, ExerciseSheet, type SessionInfo } from './Exercises.tsx';

// 📅 AGENDA DES SÉANCES — 19/11 (Kouider : « l'agenda avec toutes les séances que je dois faire et que j'ai déjà faites ;
// celles faites avec le poids porté et toutes les infos ; les prochaines avec les objectifs à réaliser, les records à battre »).
// Données : GET /api/sport/agenda (backend sport-coach.ts sportAgenda) — log réel, plan de la semaine, progression, records.

type SetX = { kg?: number; reps?: number };
interface DoneEx { name: string; sets: SetX[]; pr: boolean; demo?: string[] }
interface PlanEx { name: string; demo?: string[]; tip?: string; video?: string; muscle: string; sets: number; reps: string; rest: number; timed: boolean; plan: number[] | null; up: boolean; goal: string | null; last: string | null;
  prev: Array<{ kg: number; reps: number | null }> | null; record: { kg: number; reps: number | null; date: string } | null }
interface Day { date: string; status: 'done' | 'missed' | 'skip' | 'planned' | 'today'; label: string; emoji?: string; focus?: string; start?: string; estMin?: number;
  warmup?: string; finisher?: string | null; deload?: boolean; durationMin?: number | null; rpe?: number | null; note?: string | null; volume?: number; prs?: string[]; reason?: string;
  exercises: Array<DoneEx | PlanEx> }
interface Agenda { today: string; goal: { text: string; done: number; target: number; reached: boolean; kind: string } | null; streak: number; total: number; monthSessions: number; rules: string[]; days: Day[] }

const fr = (n: number) => String(n).replace('.', ',');
const dd = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
const COLOR: Record<Day['status'], string> = { done: F.green, today: F.accent, planned: F.accent, missed: F.red, skip: F.muted };

function MonthGrid({ days, today, onPick }: { days: Day[]; today: string; onPick: (d: string) => void }) {
  const [m, setM] = useState(today.slice(0, 7));
  const by = new Map(days.map(d => [d.date, d]));
  const first = new Date(`${m}-01T12:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const n = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const shift = (k: number) => { const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + k, 1)); setM(d.toISOString().slice(0, 7)); };
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`)];
  const navBtn = { border: 'none', background: F.bg, color: F.ink, borderRadius: 10, width: 34, height: 30, cursor: 'pointer', fontSize: 16 } as const;
  return (
    <div style={{ ...card, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => shift(-1)} style={navBtn} aria-label="Mois précédent">‹</button>
        <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{first.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
        <button onClick={() => shift(1)} style={navBtn} aria-label="Mois suivant">›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x, i) => <div key={i} style={{ fontSize: 11, fontWeight: 600, color: F.muted }}>{x}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const x = by.get(d), st = x?.status;
          const filled = st === 'done';
          return (
            <button key={d} disabled={!x} onClick={() => { vibrate(8); onPick(d); }} style={{ aspectRatio: '1', border: 'none', borderRadius: 999, cursor: x ? 'pointer' : 'default', padding: 0, fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700, background: filled ? F.green : 'transparent', color: filled ? '#fff' : st === 'missed' ? F.red : st === 'skip' ? F.muted : F.ink,
              boxShadow: d === today ? `inset 0 0 0 2.5px ${F.accent}` : st === 'planned' ? `inset 0 0 0 1.5px ${F.accent}` : st === 'missed' ? `inset 0 0 0 1.5px ${F.red}` : 'none',
              opacity: st === 'skip' ? 0.6 : 1 }}>
              {filled ? '✓' : Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 10, fontSize: 11.5, color: F.muted }}>
        <span><b style={{ color: F.green }}>●</b> faite</span><span><b style={{ color: F.accent }}>○</b> à venir</span><span><b style={{ color: F.red }}>○</b> ratée</span><span>· repos</span>
      </div>
    </div>
  );
}

const thumbBox: CSSProperties = { width: 68, height: 68, borderRadius: 16, background: F.tile, flexShrink: 0, display: 'flex', alignItems: 'center', overflow: 'hidden', padding: 4, boxSizing: 'border-box' };
const Thumb = ({ e, size = 68 }: { e: { name: string; demo?: string[] }; size?: number }) => (
  <div style={{ ...thumbBox, width: size, height: size }}>{e.demo?.length ? <Anim img={e.demo} alt={e.name} h={size - 8} /> : <span style={{ margin: 'auto', fontSize: size / 2.6 }}>🏋️</span>}</div>
);
const th: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: F.muted, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 4px' };
const td: CSSProperties = { fontSize: 13.5, fontWeight: 600, padding: '5px 0', borderTop: `1px solid ${F.line}`, fontVariantNumeric: 'tabular-nums' };

/** Une ligne d'exercice : photo animée (le mouvement) + nom + tableau des séries. Toucher = fiche complète de l'exercice. */
function ExBlock({ e, onOpen, children, badge }: { e: { name: string; demo?: string[] }; onOpen: () => void; children?: ReactNode; badge?: ReactNode }) {
  return (
    <div style={{ padding: '12px 0', borderTop: `1px solid ${F.line}` }}>
      <button onClick={onOpen} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink }}>
        <Thumb e={e} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 15, lineHeight: 1.25 }}>{e.name}</div>
          {badge}
        </div>
        <span style={{ color: F.muted, fontSize: 18 }}>›</span>
      </button>
      {children}
    </div>
  );
}

function PlannedCard({ d, onEx }: { d: Day; onEx: (e: PlanEx) => void }) {
  const exs = d.exercises as PlanEx[];
  return (
    <>
      {d.deload && <div style={{ fontSize: 12.5, color: F.gold, fontWeight: 600, marginTop: 8 }}>🪶 Semaine allégée : charges −10 %</div>}
      {d.warmup && <div style={{ fontSize: 12.5, color: F.muted, margin: '8px 0 4px' }}>🔥 Échauffement : {d.warmup}</div>}
      {exs.map((e, k) => {
        const rows = e.plan?.length ? e.plan : null;
        return (
          <ExBlock key={k} e={e} onOpen={() => onEx(e)} badge={<>
            <div style={{ fontSize: 12.5, color: F.muted, marginTop: 2 }}>{e.sets} séries × {e.reps}{e.rest ? ` · repos ${e.rest} s` : ''}</div>
            {e.record && <div style={{ display: 'inline-block', marginTop: 5, fontSize: 11.5, fontWeight: 700, color: F.gold, background: 'rgba(245,158,11,0.13)', borderRadius: 999, padding: '3px 9px' }}>🏆 Record à battre · {fr(e.record.kg)} kg{e.record.reps ? ` × ${e.record.reps}` : ''}</div>}
          </>}>
            {rows ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                <thead><tr><th style={{ ...th, textAlign: 'start' }}>Série</th><th style={{ ...th, textAlign: 'center' }}>Objectif</th><th style={{ ...th, textAlign: 'end' }}>Dernière fois</th></tr></thead>
                <tbody>{rows.map((kg, i) => {
                  const up = e.up && i === 0, p = e.prev?.[i];
                  return (
                    <tr key={i}>
                      <td style={{ ...td, color: F.muted, width: 52 }}>{i + 1}</td>
                      <td style={{ ...td, textAlign: 'center', color: up ? F.accent : F.ink }}>{fr(kg)} kg × {e.reps}{up ? ' ↑' : ''}</td>
                      <td style={{ ...td, textAlign: 'end', color: F.muted, fontWeight: 500 }}>{p ? `${fr(p.kg)} kg × ${p.reps ?? '?'}` : '—'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            ) : !e.timed && e.muscle !== 'cardio' ? <div style={{ fontSize: 12.5, color: F.muted, marginTop: 8 }}>Première fois : trouve un poids où les dernières reps sont dures mais propres.</div> : null}
            {e.goal && <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 8, background: 'rgba(255,90,31,0.08)', borderRadius: 10, padding: '8px 10px' }}>🎯 {e.goal}</div>}
          </ExBlock>
        );
      })}
      {d.finisher && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 8 }}>🏁 Pour finir : {d.finisher}</div>}
    </>
  );
}

function DoneCard({ d, onEx }: { d: Day; onEx: (e: DoneEx) => void }) {
  const exs = d.exercises as DoneEx[];
  return (
    <>
      {exs.length ? exs.map((e, k) => {
        const top = Math.max(0, ...e.sets.map(z => z.kg ?? 0));
        return (
          <ExBlock key={k} e={e} onOpen={() => onEx(e)} badge={<>
            <div style={{ fontSize: 12.5, color: F.muted, marginTop: 2 }}>{e.sets.length} série{e.sets.length > 1 ? 's' : ''}{top ? ` · max ${fr(top)} kg` : ''}</div>
            {e.pr && <div style={{ display: 'inline-block', marginTop: 5, fontSize: 11.5, fontWeight: 700, color: F.gold, background: 'rgba(245,158,11,0.13)', borderRadius: 999, padding: '3px 9px' }}>🏆 Nouveau record</div>}
          </>}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
              <thead><tr><th style={{ ...th, textAlign: 'start' }}>Série</th><th style={{ ...th, textAlign: 'center' }}>Poids</th><th style={{ ...th, textAlign: 'end' }}>Reps</th></tr></thead>
              <tbody>{e.sets.map((z, i) => {
                const best = !!top && z.kg === top;
                return (
                  <tr key={i}>
                    <td style={{ ...td, color: F.muted, width: 52 }}>{i + 1}</td>
                    <td style={{ ...td, textAlign: 'center', color: best ? F.green : F.ink }}>{z.kg != null ? `${fr(z.kg)} kg` : '—'}</td>
                    <td style={{ ...td, textAlign: 'end' }}>{z.reps ?? '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </ExBlock>
        );
      }) : <div style={{ fontSize: 12.5, color: F.muted, marginTop: 8 }}>Séance notée sans le détail des séries.</div>}
      {d.note && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 8 }}>📝 {d.note}</div>}
    </>
  );
}

const pill = (t: ReactNode) => <span style={{ fontSize: 12, fontWeight: 600, background: F.bg, borderRadius: 999, padding: '5px 10px', whiteSpace: 'nowrap' }}>{t}</span>;
const STATUS_TXT: Record<Day['status'], string> = { today: "Aujourd'hui", planned: 'À venir', done: 'Faite', missed: 'Ratée', skip: 'Repos' };

/** Carte d'un jour : en-tête pro (statut, date, titre, chiffres), aperçu des exercices en photos ; touché = détail complet. */
function DayCard({ d, open, onToggle, onEx }: { d: Day; open: boolean; onToggle: () => void; onEx: (e: SessionInfo) => void }) {
  const c = COLOR[d.status], rich = d.exercises.length > 0;
  const time = d.start ? new Date(d.start).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', opacity: d.status === 'skip' ? 0.7 : 1 }}>
      <button onClick={rich ? onToggle : undefined} style={{ display: 'block', width: '100%', boxSizing: 'border-box', border: 'none', textAlign: 'start', cursor: rich ? 'pointer' : 'default', fontFamily: 'inherit', color: F.ink, padding: '14px 16px 12px',
        background: `linear-gradient(135deg, color-mix(in srgb, ${c} 16%, transparent), transparent 70%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: c, borderRadius: 999, padding: '3px 9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{STATUS_TXT[d.status]}{d.status === 'done' ? ' ✓' : ''}</span>
          <span style={{ fontSize: 12.5, color: F.muted, textTransform: 'capitalize', flex: 1 }}>{longDay(d.date)}{time && d.status !== 'done' ? ` · ${time}` : ''}</span>
          {rich && <span style={{ color: F.muted, fontSize: 14, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>}
        </div>
        <div style={{ fontSize: 19, fontWeight: 750, letterSpacing: '-0.02em', marginTop: 8, lineHeight: 1.2 }}>{d.emoji ? `${d.emoji} ` : ''}{d.status === 'skip' ? `Pas de sport${d.reason ? ` · ${d.reason}` : ''}` : d.label}</div>
        {d.status === 'missed' && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 4 }}>Pas faite — elle reste dans la rotation pour la prochaine fois.</div>}
        {rich && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {d.status === 'done' ? <>
            {d.durationMin ? pill(`⏱ ${d.durationMin} min`) : null}
            {d.volume ? pill(`🏋️ ${d.volume >= 1000 ? `${fr(Math.round(d.volume / 100) / 10)} t` : `${d.volume} kg`}`) : null}
            {pill(`${(d.exercises as DoneEx[]).reduce((a, e) => a + e.sets.length, 0)} séries`)}
            {d.rpe ? pill(`💥 ${d.rpe}/10`) : null}
            {d.prs?.length ? pill(<span style={{ color: F.gold }}>🏆 {d.prs.length} record{d.prs.length > 1 ? 's' : ''}</span>) : null}
          </> : <>
            {pill(`${d.exercises.length} exercices`)}
            {d.estMin ? pill(`⏱ ~${d.estMin} min`) : null}
            {(d.exercises as PlanEx[]).some(e => e.up) ? pill(<span style={{ color: F.accent }}>↑ charge en hausse</span>) : null}
          </>}
        </div>}
        {rich && !open && <div style={{ display: 'flex', gap: 6, marginTop: 12, overflow: 'hidden' }}>
          {d.exercises.slice(0, d.exercises.length > 6 ? 5 : 6).map((e, i) => <Thumb key={i} e={e} size={48} />)}
          {d.exercises.length > 6 && <div style={{ ...thumbBox, width: 48, height: 48, justifyContent: 'center', fontSize: 13, fontWeight: 700, color: F.muted }}>+{d.exercises.length - 5}</div>}
        </div>}
      </button>
      {rich && open && <div style={{ padding: '0 16px 14px' }}>
        {d.status === 'done' ? <DoneCard d={d} onEx={e => onEx({ name: e.name, demo: e.demo })} /> : <PlannedCard d={d} onEx={e => onEx({ name: e.name, demo: e.demo, sets: e.sets, reps: e.reps, rest: e.rest, tip: e.tip, video: e.video })} />}
      </div>}
    </div>
  );
}

export function AgendaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [a, setA] = useState<Agenda | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'next' | 'done' | 'all'>('all');
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const [openD, setOpenD] = useState<Record<string, boolean>>({});
  const [ex, setEx] = useState<SessionInfo | null>(null);
  useEffect(() => { if (!open) return; setErr(''); apiFetch<Agenda>('/api/sport/agenda?days=120').then(setA).catch(e => setErr(errText(e))); }, [open]);
  const pick = (d: string) => {
    const x = a?.days.find(y => y.date === d);
    if (x) setTab(x.status === 'planned' || x.status === 'today' ? (tab === 'done' ? 'all' : tab) : (tab === 'next' ? 'all' : tab));
    setOpenD(o => ({ ...o, [d]: true }));
    setTimeout(() => refs.current[d]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const upcoming = (a?.days ?? []).filter(d => d.status === 'planned' || d.status === 'today').reverse();   // la plus proche d'abord
  const past = (a?.days ?? []).filter(d => d.status !== 'planned' && d.status !== 'today');
  const list = tab === 'next' ? upcoming : tab === 'done' ? past : [...upcoming, ...past];
  const tabBtn = (k: typeof tab, l: string) => (
    <button onClick={() => setTab(k)} style={{ flex: 1, border: 'none', borderRadius: 10, padding: '8px 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: 13.5,
      background: tab === k ? F.accent : 'transparent', color: tab === k ? '#fff' : F.ink }}>{l}</button>
  );
  return (
    <Sheet open={open} onClose={onClose} z={60} title={<div style={{ fontSize: 22, fontWeight: 700, paddingTop: 6 }}>📅 Agenda des séances</div>}>
      {err && <div style={{ color: F.red, padding: 12 }}>❌ {err}</div>}
      {!a && !err && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>}
      {a && <>
        <div style={{ display: 'flex', gap: 8 }}>
          {[[a.streak, "d'affilée"], [a.monthSessions, 'ce mois'], [a.total, 'au total']].map(([v, l]) => (
            <div key={String(l)} style={{ ...card, padding: '10px 12px', flex: 1 }}><div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div><div style={{ fontSize: 11.5, color: F.muted }}>séances {l}</div></div>
          ))}
        </div>
        {a.goal && <div style={{ ...card, marginTop: 8, padding: '10px 14px', fontSize: 13.5 }}>🎯 <b>Objectif de la semaine :</b> {a.goal.text} — {a.goal.reached ? <span style={{ color: F.green, fontWeight: 700 }}>atteint ✓</span> : a.goal.kind === 'sessions' ? `${a.goal.done}/${a.goal.target}` : `meilleur : ${a.goal.done ? `${fr(a.goal.done)} kg` : 'pas encore'}`}</div>}
        <div style={{ marginTop: 10 }}><MonthGrid days={a.days} today={a.today} onPick={pick} /></div>
        <div style={{ display: 'flex', gap: 4, background: F.bg, borderRadius: 12, padding: 3, marginTop: 12 }}>
          {tabBtn('all', 'Tout')}{tabBtn('next', `À venir (${upcoming.length})`)}{tabBtn('done', 'Faites')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, marginTop: 12 }}>
          {list.length === 0 && <div style={{ color: F.muted, textAlign: 'center', padding: 20 }}>Rien ici pour l'instant.</div>}
          {list.map((d, i) => (
            <div key={d.date} ref={el => { refs.current[d.date] = el; }} style={{ scrollMarginTop: 12, minWidth: 0 }}>
              <DayCard d={d} open={openD[d.date] ?? (i === 0 && (d.status === 'today' || d.status === 'planned' || tab === 'done'))} onToggle={() => { vibrate(8); setOpenD(o => ({ ...o, [d.date]: !(o[d.date] ?? (i === 0 && (d.status === 'today' || d.status === 'planned' || tab === 'done'))) })); }} onEx={setEx} />
            </div>
          ))}
        </div>
        {a.rules.length > 0 && <div style={{ fontSize: 12, color: F.muted, marginTop: 14, lineHeight: 1.45 }}>📌 Tes règles : {a.rules.join(' · ')}</div>}
      </>}
      <ExerciseSheet session={ex} onClose={() => setEx(null)} z={70} />
    </Sheet>
  );
}
