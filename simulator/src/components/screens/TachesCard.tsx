// 27/11 — MES TÂCHES sur la page Aujourd'hui : ce que Kouider a demandé à Dzaryx de lui rappeler
// (« lundi appeler le médecin pour ma femme »). Cocher = fait, Demain, autre jour, supprimer, ajouter.
// Les mêmes tâches arrivent en message à 8h, à l'heure dite et à 20h30 si pas faites. Compte Kouider seulement (403 → caché).
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, tone, glass, Badge, SectionTitle, inputStyle, waLink } from '../ui/Kit.tsx';
import { Ico } from '../ui/Icon.tsx';

type Task = { id: string; text: string; due: string | null; time?: string | null; cat: string; who?: string | null; repeat?: string | null; done?: string | null; label: string; late: boolean; today: boolean; lieu?: string | null };
type Flag = { icon: string; text: string; tone: 'bad' | 'warn' | 'ok' | 'info' };
type Move = { id: string; kind: 'arrivee' | 'retour'; client: string; car: string; date: string; time: string | null; label: string; missing: string[]; checklist: Array<{ label: string; done: boolean }>; phone: string | null; flags: Flag[]; validated: boolean };
type Trip = { id: string; title: string; date: string; time: string; inDays: number; to: string; missing: string[]; checklist: Array<{ label: string; done: boolean }>; requests: string[] };
const TONE = { bad: T.bad, warn: T.warn, ok: T.ok, info: T.accent } as const;
type Data = { today: Task[]; late: Task[]; upcoming: Task[]; nodate: Task[]; done: Task[]; promises: Array<{ id: string; text: string; due: string }>; reminders: Array<{ id: string; text: string; at: string }>; stats: { doneWeek: number; open: number }; here: 'algerie' | 'belgique'; promos?: Array<{ id: string; title: string; what: string; bookBy?: string | null; why: string; url?: string | null }>; ailleurs: Task[]; moves: Move[]; trips: Trip[] };
const CAT: Record<string, string> = { famille: '👨‍👩‍👦', sante: '🩺', fik: '🚗', admin: '📄', maison: '🏠', perso: '📝' };
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const nextDays = () => { const d = new Date().getDay(); return [2, 3, 4, 5, 6].map(n => DAYS[(d + n) % 7]!); };
const hhmm = (iso: string) => { const d = new Date(iso); return `${DAYS[d.getDay()]!.slice(0, 3)}. ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`; };

function Pill({ children, onClick, active, color = T.accent }: { children: React.ReactNode; onClick: () => void; active?: boolean; color?: string }) {
  return <button onClick={e => { e.stopPropagation(); onClick(); }} style={{ flexShrink: 0, minHeight: 32, padding: '0 11px', borderRadius: 99, fontFamily: T.font, fontSize: 12.5, fontWeight: 650, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${active ? color : 'var(--dz-card-line)'}`, background: active ? tone(color, 0.14) : 'var(--dz-card)', color: active ? color : T.text }}>{children}</button>;
}

function Check({ items, onTick }: { items: Array<{ label: string; done: boolean }>; onTick: (label: string, done: boolean) => void }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
    {items.map(i => <button key={i.label} onClick={() => onTick(i.label, !i.done)} style={{ minHeight: 30, padding: '0 10px', borderRadius: 99, fontFamily: T.font, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      border: `1px solid ${i.done ? tone(T.ok, 0.4) : 'var(--dz-card-line)'}`, background: i.done ? tone(T.ok, 0.1) : 'var(--dz-card)', color: i.done ? T.ok : T.text }}>{i.done ? '✓ ' : '○ '}{i.label}</button>)}
  </div>;
}

function MoveRow({ m, onTick }: { m: Move; onTick: (id: string, label: string, done: boolean) => void }) {
  const [open, setOpen] = useState(!m.validated && m.label === "aujourd'hui");
  const wa = waLink(m.phone);
  const c = m.kind === 'arrivee' ? '#3d6bff' : '#8b5cf6';
  return (
    <div style={{ borderTop: '1px solid var(--dz-card-line)', padding: '10px 0' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}>
        <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone(c, 0.12), fontSize: 15 }}>{m.kind === 'arrivee' ? '🛬' : '🔑'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{m.kind === 'arrivee' ? 'Arrivée' : 'Retour'} {m.client} <span style={{ color: T.muted, fontWeight: 500 }}>· {m.car}</span></div>
          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: m.validated ? T.ok : m.label === "aujourd'hui" ? T.accent : T.muted }}>
            {m.label}{m.time ? ` · ${m.time.replace(':', 'h')}` : ''} · {m.validated ? '✅ prêt' : `${m.missing.length} à faire`}
          </div>
        </div>
        <span style={{ color: T.faint, fontSize: 13 }}>{open ? '▴' : '▾'}</span>
      </div>
      {m.flags.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, paddingLeft: 41 }}>
        {m.flags.map(f => <div key={f.text} style={{ fontSize: 12, fontWeight: 600, color: TONE[f.tone] }}>{f.icon} {f.text}</div>)}
      </div>}
      {open && <div style={{ paddingLeft: 41 }}>
        <Check items={m.checklist} onTick={(l, d) => onTick(m.id, l, d)} />
        {(wa || m.phone) && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ minHeight: 32, padding: '0 12px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: '#25D366', border: '1px solid rgba(37,211,102,0.4)', textDecoration: 'none' }}>💬 WhatsApp</a>}
          {m.phone && <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`} style={{ minHeight: 32, padding: '0 12px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, fontWeight: 700, color: T.text, border: '1px solid var(--dz-card-line)', textDecoration: 'none' }}>📞 Appeler</a>}
        </div>}
      </div>}
    </div>
  );
}

function TripBox({ t, onTick }: { t: Trip; onTick: (id: string, label: string, done: boolean) => void }) {
  const done = t.checklist.filter(i => i.done).length;
  return (
    <div style={{ borderRadius: 18, padding: '12px 14px', margin: '10px 0 4px', background: `radial-gradient(120% 120% at 100% 0%, ${tone('#22d3ee', 0.18)}, transparent 60%), ${tone('#3d6bff', 0.08)}`, border: `1px solid ${tone('#3d6bff', 0.25)}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>✈️</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: T.text }}>{t.title}</div>
        <Badge color={t.inDays <= 1 ? T.bad : '#3d6bff'}>{t.inDays === 0 ? "aujourd'hui" : t.inDays === 1 ? 'demain' : `J-${t.inDays}`}</Badge>
      </div>
      <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3 }}>Départ {t.time.replace(':', 'h')} · check-list {done}/{t.checklist.length}</div>
      <Check items={t.checklist} onTick={(l, d) => onTick(t.id, l, d)} />
      {t.requests.length > 0 && <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>🎁 Demandes : {t.requests.join(' · ')}</div>}
    </div>
  );
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
  const [lieu, setLieu] = useState<'' | 'algerie' | 'belgique'>('');
  const [showAway, setShowAway] = useState(false);
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
      const r = await apiFetch<{ ok: boolean; dup?: boolean; task: Task }>('/api/taches', { method: 'POST', body: JSON.stringify({ text, due: lieu && due === "aujourd'hui" ? null : due || null, time: time || null, lieu: lieu || '' }) });
      setToast(r.dup ? 'Déjà notée' : '📝 Notée — je te la rappelle'); setText(''); setTime(''); setLieu(''); setAdding(false); await load();
    } catch (e) { setToast(`❌ ${(e as Error).message}`); }
  };

  const tickItem = async (id: string, label: string, done: boolean) => {
    try { navigator.vibrate?.(10); } catch { /* iPhone */ }
    try { const r = await apiFetch<{ ok: boolean; message: string }>('/api/taches/check', { method: 'POST', body: JSON.stringify({ id, label, done }) }); setToast(r.message); await load(); }
    catch (e) { setToast(`❌ ${(e as Error).message}`); }
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
        {data?.here === 'algerie' && <Badge color={T.ok}>🇩🇿 En Algérie</Badge>}
        <Badge color={T.accent}>{now.length} aujourd'hui</Badge>
      </span>}><Ico e="📝" />À faire</SectionTitle>
      <div style={{ ...glass(T.accent), borderRadius: 24, padding: '6px 16px 12px', border: '1px solid var(--dz-card-line)', boxShadow: T.shadow }}>
        {!data && <div style={{ padding: '14px 0', color: T.muted, fontSize: 13 }}>Chargement…</div>}
        {data?.trips.map(t => <TripBox key={t.id} t={t} onTick={tickItem} />)}
        {data?.promos?.map(p => (
          <a key={p.id} href={p.url ?? undefined} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', borderRadius: 16, padding: '10px 13px', margin: '10px 0 2px', background: tone('#e11d48', 0.07), border: `1px solid ${tone('#e11d48', 0.25)}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>✈️ Promo Air Algérie · {p.title}</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{p.what}{p.bookBy ? ` · réserver avant le ${p.bookBy.slice(8, 10)}/${p.bookBy.slice(5, 7)}` : ''}</div>
            <div style={{ fontSize: 12, color: '#e11d48', fontWeight: 600, marginTop: 3 }}>👉 {p.why}</div>
          </a>
        ))}
        {data && !now.length && !later.length && !doneToday.length && !data.moves.length && (
          <div style={{ padding: '12px 0 4px', color: T.muted, fontSize: 13.5, lineHeight: 1.45 }}>Rien à faire de noté. Dis à Dzaryx « lundi je dois appeler le médecin pour ma femme » ou ajoute-la ici.</div>
        )}
        {data && now.length === 0 && later.length > 0 && <div style={{ padding: '10px 0 2px', color: T.ok, fontSize: 13.5, fontWeight: 600 }}>✓ Rien pour aujourd'hui</div>}
        {now.map(t => <Row key={t.id} t={t} onAct={act} />)}
        {doneToday.map(t => <Row key={t.id} t={t} onAct={act} />)}
        {(data?.moves.length ?? 0) > 0 && <div style={{ fontSize: 11.5, fontFamily: T.mono, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint, margin: '12px 0 2px' }}>Clients · 3 jours</div>}
        {data?.moves.map(m => <MoveRow key={m.id} m={m} onTick={tickItem} />)}
        {later.length > 0 && <div style={{ fontSize: 11.5, fontFamily: T.mono, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint, margin: '12px 0 2px' }}>Plus tard</div>}
        {shownLater.map(t => <Row key={t.id} t={t} onAct={act} />)}
        {later.length > 3 && <button onClick={() => setMore(m => !m)} style={{ background: 'none', border: 'none', color: T.accent, fontWeight: 650, fontSize: 13, padding: '8px 0', cursor: 'pointer', fontFamily: T.font }}>{more ? 'Moins' : `Voir les ${later.length - 3} autres`}</button>}
        {(data?.ailleurs.length ?? 0) > 0 && <>
          <button onClick={() => setShowAway(v => !v)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '12px 0 2px', cursor: 'pointer', fontFamily: T.mono, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint }}>
            {data!.here === 'algerie' ? '🇧🇪 Au retour' : '🇩🇿 En Algérie'} · {data!.ailleurs.length}<span style={{ marginLeft: 'auto' }}>{showAway ? '▴' : '▾'}</span>
          </button>
          {showAway && data!.ailleurs.map(t => <Row key={t.id} t={{ ...t, label: data!.here === 'algerie' ? 'à ton retour' : 'quand tu seras en Algérie' }} onAct={act} />)}
        </>}
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
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {([['', '📍 Partout'], ['algerie', '🇩🇿 En Algérie'], ['belgique', '🇧🇪 Au retour']] as const).map(([k, l]) => <Pill key={k || 'p'} active={lieu === k} color={k ? T.ok : T.accent} onClick={() => setLieu(k)}>{l}</Pill>)}
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
