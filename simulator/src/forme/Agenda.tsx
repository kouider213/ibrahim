import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from '../services/api.ts';
import { F, card, Sheet, Spinner } from './ui.tsx';
import { errText, vibrate } from './api.ts';

// 📅 AGENDA DES SÉANCES — 19/11 (Kouider : « l'agenda avec toutes les séances que je dois faire et que j'ai déjà faites ;
// celles faites avec le poids porté et toutes les infos ; les prochaines avec les objectifs à réaliser, les records à battre »).
// Données : GET /api/sport/agenda (backend sport-coach.ts sportAgenda) — log réel, plan de la semaine, progression, records.

type SetX = { kg?: number; reps?: number };
interface DoneEx { name: string; sets: SetX[]; pr: boolean }
interface PlanEx { name: string; muscle: string; sets: number; reps: string; rest: number; timed: boolean; plan: number[] | null; up: boolean; goal: string | null; last: string | null;
  prev: Array<{ kg: number; reps: number | null }> | null; record: { kg: number; reps: number | null; date: string } | null }
interface Day { date: string; status: 'done' | 'missed' | 'skip' | 'planned' | 'today'; label: string; emoji?: string; focus?: string; start?: string; estMin?: number;
  warmup?: string; finisher?: string | null; deload?: boolean; durationMin?: number | null; rpe?: number | null; note?: string | null; volume?: number; prs?: string[]; reason?: string;
  exercises: Array<DoneEx | PlanEx> }
interface Agenda { today: string; goal: { text: string; done: number; target: number; reached: boolean; kind: string } | null; streak: number; total: number; monthSessions: number; rules: string[]; days: Day[] }

const fr = (n: number) => String(n).replace('.', ',');
const dd = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const longDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
const chip = (children: ReactNode, bg: string = F.bg, color: string = F.ink, key?: number | string) =>
  <span key={key} style={{ fontSize: 12.5, fontWeight: 600, background: bg, color, borderRadius: 8, padding: '4px 8px', whiteSpace: 'nowrap' }}>{children}</span>;
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

function PlannedCard({ d }: { d: Day }) {
  const exs = d.exercises as PlanEx[];
  return (
    <>
      <div style={{ fontSize: 12.5, color: F.muted, marginTop: 4 }}>
        {d.start ? `🕐 ${new Date(d.start).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}` : ''}{d.estMin ? ` · ~${d.estMin} min` : ''}{d.focus ? ` · ${d.focus}` : ''}
      </div>
      {d.deload && <div style={{ fontSize: 12.5, color: F.gold, fontWeight: 600, marginTop: 6 }}>🪶 Semaine allégée : charges −10 %</div>}
      {d.warmup && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>🔥 Échauffement : {d.warmup}</div>}
      <div style={{ marginTop: 6 }}>
        {exs.map((e, k) => (
          <div key={k} style={{ padding: '10px 0', borderTop: `1px solid ${F.line}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{e.name}</div>
              <div style={{ fontSize: 12.5, color: F.muted, whiteSpace: 'nowrap' }}>{e.sets} × {e.reps}</div>
            </div>
            {e.plan?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: F.muted, fontWeight: 600 }}>À faire :</span>
                {e.plan.map((kg, i) => chip(<>S{i + 1} {fr(kg)} kg{e.up && i === 0 ? ' ↑' : ''}</>, e.up && i === 0 ? 'rgba(255,90,31,0.14)' : F.bg, e.up && i === 0 ? F.accent : F.ink, i))}
              </div>
            ) : !e.timed && e.muscle !== 'cardio' ? <div style={{ fontSize: 12.5, color: F.muted, marginTop: 5 }}>Première fois : trouve un poids où les dernières reps sont dures mais propres.</div> : null}
            {e.goal && <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.4 }}>🎯 {e.goal}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 5, fontSize: 12, color: F.muted }}>
              {e.record && <span style={{ color: F.gold, fontWeight: 600 }}>🏆 Record à battre : {fr(e.record.kg)} kg{e.record.reps ? ` × ${e.record.reps}` : ''} ({dd(e.record.date)})</span>}
              {e.prev?.length ? <span>Dernière fois : {e.prev.map(p => `${fr(p.kg)}×${p.reps ?? '?'}`).join(' · ')}</span> : null}
            </div>
          </div>
        ))}
      </div>
      {d.finisher && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>🏁 Pour finir : {d.finisher}</div>}
    </>
  );
}

function DoneCard({ d }: { d: Day }) {
  const exs = d.exercises as DoneEx[];
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12.5, color: F.muted, marginTop: 4 }}>
        {d.durationMin ? <span>⏱ {d.durationMin} min</span> : null}
        {d.volume ? <span>🏋️ {d.volume >= 1000 ? `${fr(Math.round(d.volume / 100) / 10)} t` : `${d.volume} kg`} soulevés</span> : null}
        {exs.length ? <span>{exs.reduce((a, e) => a + e.sets.length, 0)} séries</span> : null}
        {d.rpe ? <span>💥 effort {d.rpe}/10</span> : null}
      </div>
      {d.prs?.length ? <div style={{ fontSize: 12.5, color: F.gold, fontWeight: 700, marginTop: 6 }}>🏆 Record battu : {d.prs.join(', ')}</div> : null}
      {exs.length ? exs.map((e, k) => (
        <div key={k} style={{ padding: '9px 0', borderTop: k ? `1px solid ${F.line}` : 'none', marginTop: k ? 0 : 6 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}{e.pr ? <span style={{ color: F.gold }}> 🏆</span> : null}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
            {e.sets.map((z, i) => chip(<>{i + 1}. {z.kg != null ? `${fr(z.kg)} kg` : '—'}{z.reps != null ? ` × ${z.reps}` : ''}</>, F.bg, F.ink, i))}
          </div>
        </div>
      )) : <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>Séance notée sans le détail des séries.</div>}
      {d.note && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>📝 {d.note}</div>}
    </>
  );
}

export function AgendaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [a, setA] = useState<Agenda | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'next' | 'done' | 'all'>('all');
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => { if (!open) return; setErr(''); apiFetch<Agenda>('/api/sport/agenda?days=120').then(setA).catch(e => setErr(errText(e))); }, [open]);
  const pick = (d: string) => {
    const x = a?.days.find(y => y.date === d);
    if (x) setTab(x.status === 'planned' || x.status === 'today' ? (tab === 'done' ? 'all' : tab) : (tab === 'next' ? 'all' : tab));
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
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {list.length === 0 && <div style={{ color: F.muted, textAlign: 'center', padding: 20 }}>Rien ici pour l'instant.</div>}
          {list.map(d => (
            <div key={d.date} ref={el => { refs.current[d.date] = el; }} style={{ ...card, padding: 14, scrollMarginTop: 12, borderLeft: `4px solid ${COLOR[d.status]}`, opacity: d.status === 'skip' ? 0.7 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLOR[d.status], textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {d.status === 'today' ? "Aujourd'hui" : d.status === 'planned' ? 'À venir' : d.status === 'done' ? 'Faite ✓' : d.status === 'missed' ? 'Ratée' : 'Repos'}
                </div>
                <div style={{ fontSize: 12.5, color: F.muted, textTransform: 'capitalize' }}>{longDay(d.date)}</div>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{d.emoji ? `${d.emoji} ` : ''}{d.status === 'skip' ? `Pas de sport${d.reason ? ` · ${d.reason}` : ''}` : d.label}</div>
              {(d.status === 'planned' || d.status === 'today') && <PlannedCard d={d} />}
              {d.status === 'done' && <DoneCard d={d} />}
              {d.status === 'missed' && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 4 }}>Pas faite — elle reste dans la rotation pour la prochaine fois.</div>}
            </div>
          ))}
        </div>
        {a.rules.length > 0 && <div style={{ fontSize: 12, color: F.muted, marginTop: 14, lineHeight: 1.45 }}>📌 Tes règles : {a.rules.join(' · ')}</div>}
      </>}
    </Sheet>
  );
}
