import { useEffect, useState } from 'react';
import { get, postJson } from './api.ts';
import { F, card, ghostBtn, btn, input, Sheet, Spinner, Stat, LineChart } from './ui.tsx';
import { Radar, DayBars, ScoreStrip } from './Charts.tsx';

// 📊 BILANS (06/11, Kouider) : bilan du jour / de la semaine / du mois (notes, points forts/faibles, quoi améliorer, charges à augmenter)
// + un jour du calendrier en détail (montre, séance, repas, eau, records). Tout vient de /api/forme/report et /api/forme/day.
type Scores = Partial<Record<'sommeil' | 'activite' | 'entrainement' | 'recuperation' | 'nutrition' | 'hydratation', number>> & { global: number };
interface SeriesDay { date: string; score?: number; steps?: number; stepsGoal?: number; sleep_h?: number; rhr?: number; hrv?: number; activeKcal?: number; volume?: number; session?: string; weight?: number; water?: number; waterGoal?: number; eaten?: number; burned?: number; protein?: number; proteinGoal?: number }
interface ReportData { title: string; text: string; scores: Scores; prevScores?: Scores; strengths: string[]; weaknesses: string[]; actions: string[]; progression: string[]; days?: SeriesDay[]; totals?: Totals; prev?: Totals }
interface Totals { muscleSets?: Record<string, number>; sessions?: number; sessionsTarget?: number; sets?: number; volume?: number; stepsAvg?: number; sleepAvg?: number; rhrAvg?: number; hrvAvg?: number; activeKcal?: number; prs?: number; trainMinutes?: number; weightStart?: number; weightEnd?: number }
interface GoalData { lines: string[]; ifBehind: string[]; behind: boolean }
interface DayData {
  day: { date: string; label: string; steps?: number; stepsGoal: number; sleep_h?: number; rhr?: number; hrv?: number; activeKcal?: number; water: number; waterGoal: number; weight?: number;
    eaten?: number; protein?: number; proteinGoal?: number; burned?: number; realDeficit?: number; deficitGoal?: number;
    session?: { label: string; sets: number; volume: number; durationMin?: number; rpe?: number; muscles: string[] }; prs: Array<{ ex: string; kg: number; prev: number }>; watch?: Array<{ name: string; min?: number; kcal?: number }> };
  scores: Scores; strengths: string[]; weaknesses: string[]; actions: string[]; sets: Array<{ ex: string; kg?: number; reps?: number }>; report: string | null;
}
const LABEL: Record<string, string> = { sommeil: 'Sommeil', activite: 'Activité', entrainement: 'Entraînement', recuperation: 'Récup', nutrition: 'Nutrition', hydratation: 'Eau' };
const col = (v: number) => v >= 75 ? F.green : v >= 55 ? F.gold : F.red;
const n = (v?: number, d = 0) => v === undefined ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: d });

function ScoreBars({ s, prev }: { s: Scores; prev?: Scores }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: col(s.global) }}>{s.global}</div><div style={{ color: F.muted, fontSize: 14 }}>/100{prev?.global ? ` · avant ${prev.global}` : ''}</div>
      </div>
      {Object.entries(LABEL).map(([k, l]) => {
        const v = s[k as keyof Scores]; if (typeof v !== 'number') return null;
        const p = prev?.[k as keyof Scores];
        return (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 70px', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l}</div>
            <div style={{ height: 10, background: F.bg, borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, v)}%`, height: '100%', background: col(v), borderRadius: 5 }} /></div>
            <div style={{ fontSize: 12.5, textAlign: 'right' }}><b>{v}</b>{typeof p === 'number' && <span style={{ color: v >= p ? F.green : F.red }}> {v >= p ? '↗' : '↘'}</span>}</div>
          </div>
        );
      })}
    </div>
  );
}
const List = ({ t, items, color }: { t: string; items: string[]; color: string }) => !items.length ? null : (
  <div style={{ marginTop: 12 }}>
    <div style={{ fontWeight: 700, color, fontSize: 14.5, marginBottom: 4 }}>{t}</div>
    {items.map((x, i) => <div key={i} style={{ fontSize: 13.5, lineHeight: 1.45, padding: '2px 0' }}>• {x}</div>)}
  </div>
);

/** Les chiffres clés de la période à côté de ceux d'avant (flèche verte = mieux). Les moyennes sont comparables même en cours de semaine ;
 *  les totaux (séances, volume) affichent juste « avant : X » tant que la période n'est pas finie. */
function Versus({ r, kind }: { r: ReportData; kind: 'day' | 'week' | 'month' }) {
  const t = r.totals, p = r.prev;
  if (!t || kind === 'day') return null;
  const cell = (label: string, v: number | undefined, pv: number | undefined, unit: string, d = 0, mode: 'up' | 'down' | 'total' = 'up') => {
    if (!v) return null;
    const diff = pv ? v - pv : 0, better = mode === 'down' ? diff < 0 : diff > 0;
    const flat = !pv || Math.abs(diff) < Math.abs(pv) * 0.02;
    return (
      <div key={label} style={{ background: F.bg, borderRadius: 14, padding: '10px 10px 8px' }}>
        <div style={{ fontSize: 11.5, color: F.muted, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 1 }}>{n(v, d)}<span style={{ fontSize: 11.5, fontWeight: 600, color: F.muted }}> {unit}</span></div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: mode === 'total' || flat ? F.muted : better ? F.green : F.red, marginTop: 1 }}>
          {!pv ? '—' : mode === 'total' ? `avant : ${n(pv, d)}` : flat ? `= ${n(pv, d)}` : `${diff > 0 ? '↗' : '↘'} ${diff > 0 ? '+' : '−'}${n(Math.abs(diff), d)} (avant ${n(pv, d)})`}
        </div>
      </div>);
  };
  const cells = [
    cell('Séances', t.sessions, p?.sessions, t.sessionsTarget && kind === 'week' ? `/ ${t.sessionsTarget}` : '', 0, 'total'),
    cell('Volume soulevé', t.volume ? t.volume / 1000 : undefined, p?.volume ? p.volume / 1000 : undefined, 't', 1, 'total'),
    cell('Pas / jour', t.stepsAvg, p?.stepsAvg, ''),
    cell('Sommeil moyen', t.sleepAvg, p?.sleepAvg, 'h', 1),
    cell('Cœur au repos', t.rhrAvg, p?.rhrAvg, 'bpm', 0, 'down'),
    cell('VFC', t.hrvAvg, p?.hrvAvg, 'ms'),
    cell('Records battus', t.prs, p?.prs, '', 0, 'total'),
    cell('Temps de sport', t.trainMinutes, p?.trainMinutes, 'min', 0, 'total'),
  ].filter(Boolean);
  if (cells.length < 2) return null;
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 8 }}>{kind === 'week' ? 'Cette semaine face à la dernière' : 'Ce mois face au précédent'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>{cells}</div>
    </div>);
}

const MUSCLE: Record<string, string> = { pecs: 'Pecs', dos: 'Dos', epaules: 'Épaules', bras: 'Bras', jambes: 'Jambes', abdos: 'Abdos' };
/** 📊 09/11 — les graphiques du bilan, dans l'app (avant : seulement dans le PDF). Doigt posé sur une barre ou une courbe = la valeur du jour. */
function ReportCharts({ r, kind }: { r: ReportData; kind: 'day' | 'week' | 'month' }) {
  const ds = r.days ?? [];
  const axes = Object.entries(LABEL).flatMap(([k, l]) => { const v = r.scores[k as keyof Scores]; const p = r.prevScores?.[k as keyof Scores]; return typeof v === 'number' ? [{ label: l, v, prev: typeof p === 'number' ? p : undefined }] : []; });
  const pts = (get: (d: SeriesDay) => number | undefined) => ds.flatMap(d => { const y = get(d); return typeof y === 'number' && y > 0 ? [{ x: d.date, y }] : []; });
  const hrv = pts(d => d.hrv), rhr = pts(d => d.rhr), wt = pts(d => d.weight);
  const ms = Object.entries(r.totals?.muscleSets ?? {}).filter(([m]) => MUSCLE[m]);
  const msMax = Math.max(20, ...ms.map(([, n]) => n));
  const target = kind === 'month' ? 40 : 10;
  return (
    <div>
      {axes.length >= 4 && <div style={{ ...card, marginTop: 10 }}><div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 2 }}>Ton profil {kind === 'day' ? 'du jour' : kind === 'week' ? 'de la semaine' : 'du mois'}</div><Radar axes={axes} /></div>}
      {kind === 'day' && ds.length > 1 && <div style={{ fontSize: 12.5, color: F.muted, margin: '14px 4px 0', fontWeight: 600 }}>Tes 7 derniers jours — pose le doigt sur un jour pour voir son chiffre.</div>}
      <ScoreStrip days={ds} />
      <DayBars title="👣 Pas" points={ds.map(d => ({ date: d.date, v: d.steps }))} unit="pas" goal={ds[0]?.stepsGoal} />
      <DayBars title="😴 Sommeil" points={ds.map(d => ({ date: d.date, v: d.sleep_h }))} unit="h" goal={7} digits={1} color={F.violet} />
      <DayBars title="🏋️ Volume soulevé" points={ds.map(d => ({ date: d.date, v: d.volume, note: d.session }))} unit="kg" color="#6a4c93" />
      <DayBars title="🔥 Calories actives" points={ds.map(d => ({ date: d.date, v: d.activeKcal }))} unit="kcal" color="#f18f01" />
      {ds.some(d => d.eaten) && <DayBars title="🍽️ Mangé / brûlé" points={ds.map(d => ({ date: d.date, v: d.eaten, v2: d.eaten ? d.burned : undefined }))} unit="kcal" color={F.gold} color2="#b9c8f5" legend={['mangé', 'brûlé']} />}
      {ds.some(d => d.protein) && <DayBars title="🥩 Protéines" points={ds.map(d => ({ date: d.date, v: d.protein }))} unit="g" goal={ds.find(d => d.proteinGoal)?.proteinGoal} color="#c8553d" />}
      <DayBars title="💧 Eau" points={ds.map(d => ({ date: d.date, v: d.water ? d.water * 0.25 : undefined }))} unit="L" goal={ds[0]?.waterGoal ? ds[0].waterGoal * 0.25 : undefined} digits={2} color="#1b998b" />
      {hrv.length >= 2 && <div style={{ ...card, marginTop: 10 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>💚 VFC (ms) — plus haut = mieux récupéré</div><LineChart points={hrv} color={F.green} unit="ms" h={120} /></div>}
      {rhr.length >= 2 && <div style={{ ...card, marginTop: 10 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>❤️ Cœur au repos (bpm) — plus bas = mieux</div><LineChart points={rhr} color={F.red} unit="bpm" h={120} /></div>}
      {wt.length >= 2 && <div style={{ ...card, marginTop: 10 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>⚖️ Poids (kg)</div><LineChart points={wt} color={F.ink} unit="kg" h={120} digits={1} /></div>}
      {kind !== 'day' && !!ms.length && <div style={{ ...card, marginTop: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>💪 Séries par muscle <span style={{ color: F.muted, fontWeight: 600, fontSize: 12 }}>· visé {target}{kind === 'week' ? ' à 20' : '+'}</span></div>
        {ms.sort((a, b) => b[1] - a[1]).map(([m, n]) => (
          <div key={m} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 34px', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{MUSCLE[m]}</div>
            <div style={{ height: 12, background: F.bg, borderRadius: 6, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, n / (kind === 'month' ? Math.max(msMax, 60) : msMax) * 100)}%`, height: '100%', borderRadius: 6, background: n >= target ? F.green : n >= target / 2 ? F.gold : F.red }} /></div>
            <div style={{ fontSize: 13, fontWeight: 800, textAlign: 'right' }}>{n}</div>
          </div>))}
      </div>}
    </div>
  );
}

const PRIO = [['dos', 'Dos'], ['pecs', 'Pecs'], ['epaules', 'Épaules'], ['bras', 'Bras'], ['jambes', 'Jambes'], ['abdos', 'Abdos']] as const;
/** 🎯 Objectif : temps restant + « Adapter mon programme » + priorité d'un muscle (change l'agenda et FORME). */
export function GoalCard({ toast }: { toast?: (t: string) => void }) {
  const [g, setG] = useState<GoalData | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { get<GoalData>('/api/forme/goal-status').then(setG).catch(() => {}); }, []);
  const adapt = async () => { setBusy('adapt'); try { const r = await postJson<{ text: string }>('/api/forme/adapt', {}); setMsg(r.text); toast?.('Programme adapté ✅'); } catch { toast?.('Impossible pour le moment'); } setBusy(''); };
  const prio = async (m: string) => { setBusy(m); try { const r = await postJson<{ text: string }>('/api/forme/priority', { muscles: [m] }); setMsg(r.text); toast?.('Priorité changée ✅'); } catch { toast?.('Impossible pour le moment'); } setBusy(''); };
  if (!g) return null;
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 6 }}>🎯 Ton objectif</div>
      {g.lines.length ? g.lines.map((l, i) => <div key={i} style={{ fontSize: 13.5, lineHeight: 1.45, padding: '2px 0' }}>{l}</div>) : <div style={{ fontSize: 13.5, color: F.muted }}>Fixe ton poids visé dans Objectifs pour voir le temps qu'il te reste.</div>}
      {!!g.ifBehind.length && <List t="💡 Pour y arriver plus vite" items={g.ifBehind} color={F.accent} />}
      <button onClick={adapt} disabled={!!busy} style={{ ...ghostBtn, width: '100%', marginTop: 12, fontWeight: 700, color: g.behind ? F.red : F.ink }}>{busy === 'adapt' ? 'Je regarde…' : '🔧 Adapter mon programme (agenda + FORME)'}</button>
      <div style={{ fontSize: 12.5, color: F.muted, margin: '12px 0 6px' }}>Entraîner en priorité :</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{PRIO.map(([id, l]) => <button key={id} onClick={() => prio(id)} disabled={!!busy} style={{ ...ghostBtn, padding: '8px 12px', fontSize: 13 }}>{busy === id ? '…' : l}</button>)}</div>
      {msg && <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', background: F.bg, borderRadius: 12, padding: 10 }}>{msg}</div>}
    </div>
  );
}

/** Carte « Mes bilans » : Jour / Semaine / Mois + PDF sur Telegram. */
export function BilansCard({ toast }: { toast?: (t: string) => void }) {
  const [kind, setKind] = useState<'day' | 'week' | 'month' | null>(null);
  const [r, setR] = useState<ReportData | null>(null);
  const [sending, setSending] = useState(false);
  useEffect(() => { if (!kind) return; setR(null); get<ReportData>(`/api/forme/report?kind=${kind}`).then(setR).catch(() => toast?.('Bilan indisponible pour le moment')); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => { if (!kind) return; setSending(true); try { await get(`/api/forme/report?kind=${kind}&send=1`); toast?.('📄 PDF envoyé sur Telegram'); } catch { toast?.('Envoi impossible, réessaie'); } setSending(false); };
  return (
    <>
      <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 100%', fontSize: 13, color: F.muted, marginBottom: 4 }}>Ta note, tes points forts et faibles, quoi améliorer — calculés sur ta montre, tes séances et tes repas. Envoyé tout seul chaque soir à 21 h, le dimanche et le 1er du mois.</div>
        {(['day', 'week', 'month'] as const).map(k => <button key={k} onClick={() => setKind(k)} style={{ ...ghostBtn, flex: 1 }}>{k === 'day' ? "Aujourd'hui" : k === 'week' ? 'Semaine' : 'Mois'}</button>)}
      </div>
      <Sheet open={!!kind} onClose={() => setKind(null)} title={r?.title ?? 'Bilan'}>
        {!r ? <div style={{ padding: 30, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : <div style={{ paddingTop: 6 }}>
          <div style={{ ...card }}><ScoreBars s={r.scores} prev={r.prevScores} /></div>
          {kind && <Versus r={r} kind={kind} />}
          {kind && <ReportCharts r={r} kind={kind} />}
          <List t="✅ Points forts" items={r.strengths} color={F.green} />
          <List t="⚠️ À améliorer" items={r.weaknesses} color={F.red} />
          <List t="🎯 Quoi faire" items={r.actions} color={F.accent} />
          <List t="📈 Charges à augmenter" items={r.progression} color={F.gold} />
          <button onClick={send} disabled={sending} style={{ ...ghostBtn, width: '100%', marginTop: 16 }}>{sending ? 'Envoi…' : '📄 Recevoir aussi le PDF sur Telegram'}</button>
        </div>}
      </Sheet>
    </>
  );
}

// ✏️ 07/11 Kouider : « sur le calendrier, les jours passés, si j'ai oublié de noter l'eau ou autre, je dois pouvoir le rajouter
// plus tard, et ça modifie et c'est enregistré partout — pas que l'eau, tout ce que je fais ce jour-là ».
// Tout part dans les mêmes stockages que le jour même (journée FORME, montre/Santé, repas, journal des séances) → bilans, objectif, coach suivent.
function DayEdit({ date, x, onSaved }: { date: string; x: DayData['day']; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ sleep: '', steps: '', weight: '', meal: '' });
  const run = async (k: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(k); setMsg('');
    try { const r = await fn() as { message?: string; msg?: string } | undefined; setMsg(r?.msg ?? (k === 'meal' && r?.message ? r.message.split('\n')[0]! : ok)); setF(v => ({ ...v, [k]: '' })); onSaved(); }
    catch (e) { setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`); } finally { setBusy(null); }
  };
  const num = (v: string) => Number(v.replace(',', '.'));
  const row = (k: 'sleep' | 'steps' | 'weight', label: string, ph: string, go: () => Promise<unknown>, ok: string, valid: boolean) => (
    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr 64px', gap: 8, alignItems: 'center', marginTop: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      <input inputMode="decimal" value={f[k]} onChange={e => setF(v => ({ ...v, [k]: e.target.value }))} placeholder={ph} style={{ ...input, padding: '9px 10px', fontSize: 15 }} />
      <button disabled={!valid || !!busy} onClick={() => void run(k, go, ok)} style={{ ...btn, padding: '9px 0', fontSize: 14, boxShadow: 'none', opacity: valid ? 1 : 0.4 }}>{busy === k ? '…' : 'OK'}</button>
    </div>);
  if (!open) return <button onClick={() => setOpen(true)} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>✏️ Ajouter / corriger ce que j'ai fait ce jour-là</button>;
  const glasses = x.water;
  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 15.5 }}>✏️ Ajouter / corriger ce jour</div>
      <div style={{ fontSize: 12.5, color: F.muted, marginTop: 2 }}>Enregistré partout : bilans, objectif, coach, calendrier.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, alignItems: 'center', marginTop: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>💧 Eau</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button disabled={!!busy || glasses <= 0} onClick={() => void run('water', () => postJson('/api/forme/log', { kind: 'water-set', glasses: glasses - 1, date }), '💧 Eau corrigée')} style={{ ...ghostBtn, padding: '8px 14px' }}>−</button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 700 }}>{busy === 'water' ? '…' : `${glasses} verre${glasses > 1 ? 's' : ''} · ${(glasses * 0.25).toLocaleString('fr-FR')} L`}</div>
          <button disabled={!!busy} onClick={() => void run('water', () => postJson('/api/forme/log', { kind: 'water-set', glasses: glasses + 1, date }), '💧 Verre ajouté')} style={{ ...ghostBtn, padding: '8px 14px' }}>+</button>
        </div>
      </div>
      {row('sleep', '😴 Sommeil', x.sleep_h ? `${x.sleep_h} h` : 'heures (ex. 7,5)', () => postJson('/api/forme/log', { kind: 'sleep', hours: num(f.sleep), date }), '😴 Sommeil noté', num(f.sleep) > 0 && num(f.sleep) <= 14)}
      {row('steps', '👣 Pas', x.steps ? String(x.steps) : 'ex. 9000', () => postJson('/api/forme/log', { kind: 'steps', steps: Math.round(num(f.steps)), date }), '👣 Pas notés', num(f.steps) >= 0 && f.steps.trim() !== '')}
      {row('weight', '⚖️ Poids', x.weight ? `${x.weight} kg` : 'kg', () => postJson('/api/forme/log', { kind: 'weight', kg: num(f.weight), date }), '⚖️ Pesée notée', num(f.weight) > 30 && num(f.weight) < 250)}
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>🍽️ Repas oublié</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input value={f.meal} onChange={e => setF(v => ({ ...v, meal: e.target.value }))} placeholder="ex. 200 g de riz + 150 g de poulet" style={{ ...input, padding: '9px 10px', fontSize: 15 }} />
        <button disabled={!f.meal.trim() || !!busy} onClick={() => void run('meal', () => postJson('/api/forme/food/text', { text: f.meal.trim(), date }), '🍽️ Repas noté')} style={{ ...btn, padding: '9px 14px', fontSize: 14, boxShadow: 'none', opacity: f.meal.trim() ? 1 : 0.4 }}>{busy === 'meal' ? '…' : 'OK'}</button>
      </div>
      <button disabled={!!busy} onClick={() => void run('sport', () => postJson('/api/sport/done', { date, done: !x.session }), x.session ? 'Séance décochée' : '✅ Séance cochée')} style={{ ...ghostBtn, width: '100%', marginTop: 12 }}>{busy === 'sport' ? '…' : x.session ? '🏋️ Je n\'ai PAS fait la séance ce jour-là (décocher)' : '🏋️ J\'ai fait ma séance ce jour-là (cocher)'}</button>
      {msg && <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 600, color: msg.startsWith('❌') ? F.red : F.green }}>{msg}</div>}
    </div>
  );
}

/** Un jour du calendrier en détail. */
export function DaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const [d, setD] = useState<DayData | null>(null);
  const [err, setErr] = useState(false);
  const load = (quiet = false) => { if (!date) return; if (!quiet) setD(null); setErr(false); get<DayData>(`/api/forme/day?date=${date}`).then(setD).catch(() => setErr(true)); };
  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const x = d?.day;
  const title = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';
  return (
    <Sheet open={!!date} onClose={onClose} title={title.charAt(0).toUpperCase() + title.slice(1)}>
      {err ? <div style={{ padding: 20, color: F.muted }}>Données indisponibles pour ce jour.</div> : !x || !d ? <div style={{ padding: 30, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : <div style={{ paddingTop: 6 }}>
        <div style={{ ...card }}><ScoreBars s={d.scores} /></div>
        {date && date <= new Date().toLocaleDateString('sv-SE') && <DayEdit date={date} x={x} onSaved={() => load(true)} />}
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Stat v={n(x.steps)} l={`pas (obj. ${n(x.stepsGoal)})`} color={x.steps && x.steps >= x.stepsGoal ? F.green : F.ink} />
          <Stat v={x.sleep_h ? `${n(x.sleep_h, 1)} h` : '—'} l="sommeil" color={x.sleep_h && x.sleep_h >= 7 ? F.green : F.ink} />
          <Stat v={x.rhr ? `${x.rhr}` : '—'} l="cœur repos (bpm)" />
          <Stat v={x.hrv ? `${x.hrv}` : '—'} l="VFC (ms)" />
          <Stat v={n(x.activeKcal)} l="kcal actives" />
          <Stat v={`${n(x.water * 0.25, 2)} L`} l={`eau (obj. ${n(x.waterGoal * 0.25, 2)} L)`} color={x.water >= x.waterGoal ? F.green : F.ink} />
          {x.eaten !== undefined && <Stat v={n(x.eaten)} l="kcal mangées" />}
          {x.realDeficit !== undefined && <Stat v={n(x.realDeficit)} l={`déficit (obj. ${n(x.deficitGoal)})`} color={(x.realDeficit ?? 0) >= (x.deficitGoal ?? 0) - 30 ? F.green : F.red} />}
          {x.protein !== undefined && <Stat v={`${x.protein} g`} l={`protéines (obj. ${n(x.proteinGoal)})`} />}
          {x.weight !== undefined && <Stat v={`${n(x.weight, 1)} kg`} l="poids" />}
        </div>
        {x.session ? <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>🏋️ {x.session.label}</div>
          <div style={{ fontSize: 13, color: F.muted, margin: '3px 0 8px' }}>{x.session.sets} séries · {n(x.session.volume)} kg soulevés{x.session.durationMin ? ` · ${x.session.durationMin} min` : ''}{x.session.rpe ? ` · effort ${x.session.rpe}/10` : ''}</div>
          {d.sets.map((s, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', borderTop: i ? `1px solid ${F.line}` : 'none' }}><span>{s.ex}</span><b>{s.kg ? `${n(s.kg, 1)} kg` : ''}{s.reps ? ` × ${s.reps}` : ''}</b></div>)}
          {!!x.prs.length && <div style={{ marginTop: 8, fontSize: 13, color: F.green, fontWeight: 600 }}>🏆 Record : {x.prs.map(p => `${p.ex} ${n(p.kg, 1)} kg (avant ${n(p.prev, 1)})`).join(', ')}</div>}
        </div> : <div style={{ ...card, marginTop: 10, fontSize: 13.5, color: F.muted }}>Pas de séance ce jour-là.</div>}
        {!!x.watch?.length && <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 6 }}>⌚ Vu par ta montre</div>
          {x.watch.map((w, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', borderTop: i ? `1px solid ${F.line}` : 'none' }}><span>{w.name}</span><b>{w.min ? `${w.min} min` : ''}{w.kcal ? ` · ${w.kcal} kcal` : ''}</b></div>)}
        </div>}
        <List t="✅ Points forts" items={d.strengths} color={F.green} />
        <List t="⚠️ À améliorer" items={d.weaknesses} color={F.red} />
        <List t="🎯 Pour la suite" items={d.actions} color={F.accent} />
      </div>}
    </Sheet>
  );
}
