// 27/11 — MES TÂCHES sur la page Aujourd'hui : ce que Kouider a demandé à Dzaryx de lui rappeler
// (« lundi appeler le médecin pour ma femme »). Cocher = fait, Demain, autre jour, supprimer, ajouter.
// Les mêmes tâches arrivent en message à 8h, à l'heure dite et à 20h30 si pas faites. Compte Kouider seulement (403 → caché).
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, tone, glass, Badge, SectionTitle, inputStyle } from '../ui/Kit.tsx';
import { Ico } from '../ui/Icon.tsx';

type Task = { id: string; text: string; due: string | null; time?: string | null; cat: string; who?: string | null; repeat?: string | null; done?: string | null; label: string; late: boolean; today: boolean };
type Data = { today: Task[]; late: Task[]; upcoming: Task[]; nodate: Task[]; done: Task[]; promises: Array<{ id: string; text: string; due: string }>; reminders: Array<{ id: string; text: string; at: string }>; stats: { doneWeek: number; open: number } };
const CAT: Record<string, string> = { famille: '👨‍👩‍👦', sante: '🩺', fik: '🚗', admin: '📄', maison: '🏠', perso: '📝' };
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const nextDays = () => { const d = new Date().getDay(); return [2, 3, 4, 5, 6].map(n => DAYS[(d + n) % 7]!); };
const hhmm = (iso: string) => { const d = new Date(iso); return `${DAYS[d.getDay()]!.slice(0, 3)}. ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`; };

function Pill({ children, onClick, active, color = T.accent }: { children: React.ReactNode; onClick: () => void; active?: boolean; color?: string }) {
  return <button onClick={e => { e.stopPropagation(); onClick(); }} style={{ flexShrink: 0, minHeight: 32, padding: '0 11px', borderRadius: 99, fontFamily: T.font, fontSize: 12.5, fontWeight: 650, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${active ? color : 'var(--dz-card-line)'}`, background: active ? tone(color, 0.14) : 'var(--dz-card)', color: active ? color : T.text }}>{children}</button>;
}

function Row({ t, onAct }: { t: Task; onAct: (id: string, action: string, extra?: Record<string, unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const done = !!t.done;
  const color = t.done ? T.ok : t.late ? T.bad : t.today ? T.accent : T.muted;
  return (
    <div style={{ borderTop: '1px solid var(--dz-card-line)', padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <button aria-label={done ? 'Remettre à faire' : 'Fait'} onClick={() => onAct(t.id, done ? 'undo' : 'done')} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 99, cursor: 'pointer',
          border: `2px solid ${done ? T.ok : color}`, background: done ? T.ok : 'transparent', color: '#fff', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done ? '✓' : ''}</button>
        <div onClick={() => !done && setOpen(o => !o)} style={{ flex: 1, minWidth: 0, cursor: done ? 'default' : 'pointer' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: done ? T.faint : T.text, textDecoration: done ? 'line-through' : 'none', lineHeight: 1.3 }}>{CAT[t.cat] ?? '📝'} {t.text}</div>
          <div style={{ fontSize: 12, color, marginTop: 2, fontWeight: 600 }}>
            {done ? 'fait' : t.label}{t.time ? ` · ${t.time.replace(':', 'h')}` : ''}{t.who ? ` · pour ${t.who}` : ''}{t.repeat ? ` · chaque ${t.repeat}` : ''}
          </div>
        </div>
        {!done && !t.today && !t.late ? null : !done && <Pill onClick={() => onAct(t.id, 'tomorrow')}>Demain</Pill>}
      </div>
      {open && !done && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 9, paddingLeft: 39, scrollbarWidth: 'none' }}>
          {(t.today || t.late) && <Pill onClick={() => onAct(t.id, 'hour')}>⏰ Dans 1 h</Pill>}
          {!(t.today || t.late) && <Pill onClick={() => onAct(t.id, 'move', { due: "aujourd'hui" })}>📌 Aujourd'hui</Pill>}
          {!(t.today || t.late) && <Pill onClick={() => onAct(t.id, 'tomorrow')}>Demain</Pill>}
          {nextDays().map(d => <Pill key={d} onClick={() => onAct(t.id, 'move', { due: d })}>{d[0]!.toUpperCase() + d.slice(1)}</Pill>)}
          <Pill color={T.bad} onClick={() => onAct(t.id, 'remove')}>🗑 Supprimer</Pill>
        </div>
      )}
    </div>
  );
}

export function TachesCard({ tick }: { tick?: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [hidden, setHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [due, setDue] = useState<string>("aujourd'hui");
  const [time, setTime] = useState('');
  const [more, setMore] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try { setData(await apiFetch<Data>('/api/taches')); }
    catch (e) { if (/403|Réservé/.test(String(e))) setHidden(true); }
  }, []);
  useEffect(() => { void load(); }, [load, tick]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    try { navigator.vibrate?.(action === 'done' ? [12, 40, 12] : 10); } catch { /* iPhone */ }
    try {
      const r = await apiFetch<{ ok: boolean; message: string }>('/api/taches/act', { method: 'POST', body: JSON.stringify({ id, action, ...extra }) });
      setToast(r.message); await load();
    } catch (e) { setToast(`❌ ${(e as Error).message}`); }
  };
  const add = async () => {
    if (!text.trim()) return;
    try {
      const r = await apiFetch<{ ok: boolean; dup?: boolean; task: Task }>('/api/taches', { method: 'POST', body: JSON.stringify({ text, due: due || null, time: time || null }) });
      setToast(r.dup ? 'Déjà notée' : '📝 Notée — je te la rappelle'); setText(''); setTime(''); setAdding(false); await load();
    } catch (e) { setToast(`❌ ${(e as Error).message}`); }
  };

  if (hidden) return null;
  const now = [...(data?.late ?? []), ...(data?.today ?? [])];
  const later = [...(data?.upcoming ?? []), ...(data?.nodate ?? [])];
  const doneToday = (data?.done ?? []).filter(t => t.done && new Date(t.done).toDateString() === new Date().toDateString());
  const extra = (data?.promises.length ?? 0) + (data?.reminders.length ?? 0);
  const shownLater = more ? later : later.slice(0, 3);

  return (
    <div style={{ marginBottom: 18 }}>
      <SectionTitle right={<span style={{ display: 'flex', gap: 6 }}>
        {(data?.late.length ?? 0) > 0 && <Badge color={T.bad}>{data!.late.length} en retard</Badge>}
        <Badge color={T.accent}>{now.length} aujourd'hui</Badge>
      </span>}><Ico e="📝" />À faire</SectionTitle>
      <div style={{ ...glass(T.accent), borderRadius: 24, padding: '6px 16px 12px', border: '1px solid var(--dz-card-line)', boxShadow: T.shadow }}>
        {!data && <div style={{ padding: '14px 0', color: T.muted, fontSize: 13 }}>Chargement…</div>}
        {data && !now.length && !later.length && !doneToday.length && (
          <div style={{ padding: '12px 0 4px', color: T.muted, fontSize: 13.5, lineHeight: 1.45 }}>Rien à faire de noté. Dis à Dzaryx « lundi je dois appeler le médecin pour ma femme » ou ajoute-la ici.</div>
        )}
        {data && now.length === 0 && later.length > 0 && <div style={{ padding: '10px 0 2px', color: T.ok, fontSize: 13.5, fontWeight: 600 }}>✓ Rien pour aujourd'hui</div>}
        {now.map(t => <Row key={t.id} t={t} onAct={act} />)}
        {doneToday.map(t => <Row key={t.id} t={t} onAct={act} />)}
        {later.length > 0 && <div style={{ fontSize: 11.5, fontFamily: T.mono, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint, margin: '12px 0 2px' }}>Plus tard</div>}
        {shownLater.map(t => <Row key={t.id} t={t} onAct={act} />)}
        {later.length > 3 && <button onClick={() => setMore(m => !m)} style={{ background: 'none', border: 'none', color: T.accent, fontWeight: 650, fontSize: 13, padding: '8px 0', cursor: 'pointer', fontFamily: T.font }}>{more ? 'Moins' : `Voir les ${later.length - 3} autres`}</button>}
        {extra > 0 && (
          <div style={{ borderTop: '1px solid var(--dz-card-line)', marginTop: 4, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {data!.reminders.map(r => <div key={r.id} style={{ fontSize: 13, color: T.muted }}>⏰ {r.text} <span style={{ color: T.faint }}>· {hhmm(r.at)}</span></div>)}
            {data!.promises.map(p => <div key={p.id} style={{ fontSize: 13, color: T.muted }}>🤝 {p.text} <span style={{ color: T.faint }}>· {hhmm(p.due)}</span></div>)}
          </div>
        )}
        {!adding ? (
          <button onClick={() => setAdding(true)} style={{ marginTop: 10, width: '100%', minHeight: 42, borderRadius: 14, border: `1px dashed ${tone(T.accent, 0.5)}`, background: tone(T.accent, 0.06), color: T.accent, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: T.font }}>+ Ajouter une tâche</button>
        ) : (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input autoFocus value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Appeler le médecin pour ma femme" style={inputStyle} />
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {["aujourd'hui", 'demain', ...nextDays(), ''].map(d => <Pill key={d || 'none'} active={due === d} onClick={() => setDue(d)}>{d ? d[0]!.toUpperCase() + d.slice(1) : 'Sans date'}</Pill>)}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ ...inputStyle, width: 120, flex: 'none' }} />
              <span style={{ fontSize: 12, color: T.faint, flex: 1 }}>heure facultative (rappel à l'heure)</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setAdding(false); setText(''); }} style={{ flex: 1, minHeight: 42, borderRadius: 14, border: '1px solid var(--dz-card-line)', background: 'var(--dz-card)', color: T.text, fontWeight: 650, fontFamily: T.font, cursor: 'pointer' }}>Annuler</button>
              <button disabled={!text.trim()} onClick={add} style={{ flex: 2, minHeight: 42, borderRadius: 14, border: 'none', background: T.accent, color: '#fff', fontWeight: 700, fontFamily: T.font, cursor: 'pointer', opacity: text.trim() ? 1 : 0.45 }}>Noter</button>
            </div>
          </div>
        )}
        {(data?.stats.doneWeek ?? 0) > 0 && <div style={{ fontSize: 12, color: T.faint, marginTop: 10 }}>✅ {data!.stats.doneWeek} faite(s) ces 7 derniers jours</div>}
      </div>
      {toast && <div style={{ position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)', background: 'rgba(20,20,28,0.92)', color: '#fff', padding: '10px 16px', borderRadius: 14, fontSize: 13.5, fontWeight: 600, zIndex: 80, maxWidth: '86vw', textAlign: 'center' }}>{toast}</div>}
    </div>
  );
}
