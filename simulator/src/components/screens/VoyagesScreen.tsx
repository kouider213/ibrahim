import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, PageHeader, Screen, SectionTitle, Badge, Empty, glass, HeadBtn, Btn, Sheet, Field, inputStyle, money } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';

// MES VOYAGES (27/11) : « je veux aller en Algérie en voiture, bateau en Espagne, la dernière fois X €, 1 mois… »
// → Dzaryx prépare route, villes, lieux pour les trois, budget, objectifs, check-list, 30 options + PDF.
// Aussi depuis Telegram (outil voyage). PRIVÉ : /api/mon-argent/voyages (compte Kouider seulement).

interface Voyage {
  id: string; at: number; status: 'preparing' | 'ready' | 'failed'; request: string; title: string; dest: string; days: number; lastCost?: number | null; budget?: number | null;
  resume?: string; route?: Array<{ day: string; title: string; text: string; km?: number; hours?: number; sleep?: string }>;
  lieux?: Array<{ name: string; city: string; why: string; for?: string; when?: string; price?: string }>; villes?: Array<{ name: string; nights: number; why: string }>;
  lignes?: Array<{ label: string; amount: number; note?: string }>; total?: number; departImpact?: string; error?: string;
  objectifs?: Array<{ icon: string; title: string; text: string; done?: boolean }>; options?: Array<{ icon: string; title: string; text: string; done?: boolean; no?: boolean }>;
  checklist?: Array<{ label: string; when?: string; done?: boolean }>;
  start?: string | null; spent?: Array<{ id: string; d: string; label: string; amount: number }>; changes?: Array<{ at: number; text: string }>; tasksSent?: number; version?: number;
}
const maps = (l: { name: string; city: string }) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name} ${l.city}`)}`;
const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const TABS: Array<[string, string]> = [['plan', 'Le plan'], ['lieux', 'À visiter'], ['budget', 'Budget'], ['depenses', 'Dépenses'], ['options', 'Options'], ['check', 'Check-list']];

export default function VoyagesScreen() {
  const [list, setList] = useState<Voyage[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState('plan');
  const [ask, setAsk] = useState(false);
  const [form, setForm] = useState({ request: '', days: '30', last: '' });
  const [msg, setMsg] = useState('');
  const [mod, setMod] = useState('');
  const [busy, setBusy] = useState(false);
  const [sp, setSp] = useState({ amount: '', label: '' });
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try { const r = await apiFetch<{ voyages: Voyage[] }>('/api/mon-argent/voyages'); setList(r.voyages); return r.voyages; } catch { setList(l => l ?? []); return []; }
  }, []);
  useEffect(() => { void load(); return () => { if (timer.current) window.clearInterval(timer.current); }; }, [load]);
  // Un plan en préparation → on revérifie toutes les 10 s
  useEffect(() => {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    if (list?.some(v => v.status === 'preparing')) timer.current = window.setInterval(() => void load(), 10_000);
  }, [list, load]);
  const flash = (t: string) => { setMsg(t); window.setTimeout(() => setMsg(''), 3000); };

  const post = async <R,>(path: string, body: unknown) => apiFetch<R>(path, { method: 'POST', body: JSON.stringify(body) });
  const create = async () => {
    try {
      const r = await post<{ voyage: Voyage }>('/api/mon-argent/voyages', { request: form.request, days: Number(form.days) || 30, budget: Number(form.last) || undefined });
      setAsk(false); setForm({ request: '', days: '30', last: '' }); setList(l => [r.voyage, ...(l ?? [])]); flash('⏳ Je prépare ton voyage (3 à 5 min), le PDF arrivera aussi sur Telegram');
    } catch (e) { flash(`⚠️ ${(e as Error).message.replace(/^API \d+: /, '')}`); }
  };
  const tick = async (id: string, kind: string, i: number, value: string) => {
    try { const r = await post<{ voyage: Voyage }>('/api/mon-argent/voyages/tick', { id, kind, i, value }); setList(l => (l ?? []).map(v => (v.id === id ? r.voyage : v))); } catch { /* */ }
  };
  const pdf = async (v: Voyage, telegram: boolean) => {
    try {
      const r = await post<{ ok: boolean; name?: string; base64?: string }>('/api/mon-argent/voyages/pdf', { id: v.id, telegram });
      if (telegram) { flash('📄 PDF envoyé sur Telegram'); return; }
      if (r.base64) { const a = document.createElement('a'); a.href = `data:application/pdf;base64,${r.base64}`; a.download = r.name ?? 'voyage.pdf'; a.click(); }
    } catch (e) { flash(`⚠️ ${(e as Error).message}`); }
  };
  const act = async (path: string, body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { const r = await post<{ voyage?: Voyage; added?: number }>(`/api/mon-argent/voyages/${path}`, body); if (r.voyage) setList(l => (l ?? []).map(x => (x.id === r.voyage!.id ? r.voyage! : x))); flash(ok.replace('{n}', String(r.added ?? ''))); return r; }
    catch (e) { flash(`⚠️ ${(e as Error).message.replace(/^API \d+: /, '')}`); return null; } finally { setBusy(false); }
  };
  const del = async (v: Voyage) => { if (!window.confirm(`Supprimer « ${v.title} » ?`)) return; await post('/api/mon-argent/voyages/delete', { id: v.id }).catch(() => {}); setOpen(null); void load(); };

  const v = list?.find(x => x.id === open) ?? null;
  return (
    <Screen toast={msg} header={<PageHeader eyebrow="Vacances en famille" title="🧳 Mes voyages" subtitle="Dis où tu veux aller : je prépare la route, les lieux pour vous trois, le budget et le PDF."
      right={<HeadBtn icon="＋" label="Nouveau" onClick={() => setAsk(true)} />} />}>
      {!list ? <SkeletonCards count={3} /> : !list.length ? (
        <Empty icon="🧳" title="Aucun voyage préparé" text="Exemple : « je veux aller en Algérie en voiture, je prends le bateau en Espagne, mon budget c'est X €, 1 mois de vacances ». Ici ou sur Telegram." action={<Btn variant="primary" onClick={() => setAsk(true)}>Préparer un voyage</Btn>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {list.map(x => (
            <div key={x.id} role="button" onClick={() => { if (x.status === 'ready') { setOpen(x.id); setTab('plan'); } }} style={{ ...glass(x.status === 'ready' ? T.accent : x.status === 'failed' ? T.bad : T.warn), borderRadius: 20, padding: 14, cursor: x.status === 'ready' ? 'pointer' : 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>{x.status === 'preparing' ? '⏳' : x.status === 'failed' ? '❌' : '🧳'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{x.title}</div>
                  <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{x.status === 'preparing' ? 'Préparation en cours (3 à 5 min)…' : x.status === 'failed' ? (x.error ?? 'échec') : `${x.start && dayDiff(todayStr(), x.start) > 0 ? `J-${dayDiff(todayStr(), x.start)} · ` : ''}${x.days} jours · ${money(x.total ?? 0)}${x.budget ? ` (budget ${money(x.budget)})` : x.lastCost ? ` (dernière fois ${money(x.lastCost)})` : ''}`}</div>
                </div>
                {x.status === 'ready' && <span style={{ color: T.muted }}>›</span>}
                {x.status === 'failed' && <button onClick={e => { e.stopPropagation(); void del(x); }} style={{ border: 'none', background: 'transparent', color: T.bad, cursor: 'pointer' }}>🗑</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {ask && (
        <Sheet title="🧳 Nouveau voyage" subtitle="Écris comme tu parles : où, comment, combien de temps, ce que tu veux." onClose={() => setAsk(false)}
          footer={<Btn variant="primary" disabled={form.request.trim().length < 10} onClick={() => void create()} style={{ width: '100%' }}>Prépare-moi tout ça</Btn>}>
          <Field label="Ta demande"><textarea value={form.request} onChange={e => setForm({ ...form, request: e.target.value })} rows={5} placeholder="Je veux aller en Algérie en voiture, je prends le bateau en Espagne, cette fois je veux de bonnes vacances…" style={{ ...inputStyle, resize: 'vertical' }} /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Durée (jours)"><input inputMode="numeric" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} style={inputStyle} /></Field>
            <Field label="Mon budget (€)"><input inputMode="numeric" value={form.last} onChange={e => setForm({ ...form, last: e.target.value })} placeholder="ex. 4000" style={inputStyle} /></Field>
          </div>
        </Sheet>
      )}

      {v && (
        <Sheet title={`🧳 ${v.title}`} subtitle={`${v.days} jours · ${money(v.total ?? 0)}`} onClose={() => setOpen(null)}
          footer={<div style={{ display: 'flex', gap: 8 }}><Btn variant="primary" onClick={() => void pdf(v, true)} style={{ flex: 1 }}>📄 PDF sur Telegram</Btn><Btn onClick={() => void pdf(v, false)}>⬇ PDF</Btn><Btn variant="ghost" onClick={() => void del(v)}>🗑</Btn></div>}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
            {TABS.map(([id, l]) => <button key={id} onClick={() => setTab(id)} style={{ flexShrink: 0, border: 'none', borderRadius: 99, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, background: tab === id ? T.accent : 'var(--dz-card)', color: tab === id ? '#fff' : T.text }}>{l}</button>)}
          </div>
          {tab === 'plan' && <>
            {v.resume && <div style={{ fontSize: 14, lineHeight: 1.5, color: T.text, marginBottom: 12 }}>{v.resume}</div>}
            {/* Date de départ → compte à rebours + combien mettre de côté par semaine */}
            <div style={{ ...glass(T.warn), borderRadius: 18, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>📅 Départ</span>
                <input type="date" value={v.start ?? ''} onChange={e => e.target.value && void act('start', { id: v.id, start: e.target.value }, '📅 Date de départ notée')} style={{ ...inputStyle, width: 160, padding: '6px 8px' }} />
              </div>
              {v.start && (() => { const d = dayDiff(todayStr(), v.start!), w = Math.max(1, Math.ceil(d / 7)); return d > 0
                ? <div style={{ fontSize: 13, color: T.muted, marginTop: 8 }}>⏳ <b style={{ color: T.text }}>J-{d}</b> · pour payer {money(v.total ?? 0)} sans toucher à ton épargne du départ : <b style={{ color: T.text }}>{money(Math.ceil((v.total ?? 0) / w))} par semaine</b> pendant {w} semaine{w > 1 ? 's' : ''}.</div>
                : d > -v.days ? <div style={{ fontSize: 13, color: T.ok, marginTop: 8, fontWeight: 700 }}>🌴 Tu es en vacances : jour {1 - d} sur {v.days}. Note tes dépenses dans l'onglet Dépenses.</div>
                : <div style={{ fontSize: 13, color: T.muted, marginTop: 8 }}>Voyage terminé.</div>; })()}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={mod} onChange={e => setMod(e.target.value)} placeholder="Changer le plan : moins cher, ajoute Tlemcen, 3 semaines…" style={{ ...inputStyle, flex: 1 }} />
              <Btn variant="primary" disabled={busy || mod.trim().length < 3} onClick={() => void act('modify', { id: v.id, instruction: mod }, '✏️ Je refais le plan (1 à 3 min)').then(r => { if (r) { setMod(''); setOpen(null); } })}>✏️</Btn>
            </div>
            {v.changes?.length ? <div style={{ fontSize: 12, color: T.faint, marginBottom: 10 }}>Modifié : {v.changes.map(c => `« ${c.text} »`).join(', ')}</div> : null}
            {v.objectifs?.length ? <><SectionTitle>🎯 Objectifs</SectionTitle>
              {v.objectifs.map((o, i) => <Check key={i} done={o.done} onClick={() => void tick(v.id, 'objectif', i, o.done ? 'undo' : 'done')} title={`${o.icon ?? ''} ${o.title}`} text={o.text} />)}</> : null}
            {v.villes?.length ? <><SectionTitle>📍 Les villes</SectionTitle>{v.villes.map(c => <div key={c.name} style={{ fontSize: 13.5, marginBottom: 6 }}><b>{c.name}</b> · {c.nights} nuits — <span style={{ color: T.muted }}>{c.why}</span></div>)}</> : null}
            <SectionTitle>🗓️ Jour par jour</SectionTitle>
            {(v.route ?? []).map((r, i) => (
              <div key={i} style={{ ...glass(), borderRadius: 16, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}><Badge>{r.day}</Badge> {r.title}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.45 }}>{r.text}{r.km ? ` · ${r.km} km` : ''}{r.hours ? `, ${r.hours} h` : ''}{r.sleep ? ` · Nuit : ${r.sleep}` : ''}</div>
              </div>
            ))}
          </>}
          {tab === 'lieux' && (v.lieux ?? []).map((l, i) => (
            <div key={i} style={{ ...glass(), borderRadius: 16, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{l.name} <span style={{ color: T.muted, fontWeight: 500 }}>· {l.city}</span></div>
                <a href={maps(l)} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: T.accent, textDecoration: 'none' }}>🗺 Maps</a></div>
              <div style={{ fontSize: 13, color: T.muted, marginTop: 3, lineHeight: 1.45 }}>{l.why}{l.when ? ` · ${l.when}` : ''}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{l.for && <Badge color={T.violet}>{l.for}</Badge>}{l.price && <Badge color={T.ok}>{l.price}</Badge>}</div>
            </div>
          ))}
          {tab === 'budget' && <>
            {v.lignes?.map((l, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}><div style={{ flex: 1 }}>{l.label}{l.note && <div style={{ fontSize: 11.5, color: T.faint }}>{l.note}</div>}</div><b>{money(l.amount)}</b></div>)}
            <div style={{ display: 'flex', padding: '12px 0', fontSize: 16, fontWeight: 800 }}><span style={{ flex: 1 }}>Total</span><span>{money(v.total ?? 0)}</span></div>
            {(() => { const ref = v.budget ?? v.lastCost; if (!ref) return null; const t = v.total ?? 0;
              return <div style={{ fontSize: 13.5, color: t <= ref ? T.ok : T.warn, fontWeight: 700 }}>{v.budget ? 'Ton budget' : 'Dernière fois'} : {money(ref)} → {t <= ref ? `${money(ref - t)} en dessous` : `${money(t - ref)} au-dessus`}</div>; })()}
            {v.departImpact && <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>{v.departImpact}</div>}
            <div style={{ fontSize: 11.5, color: T.faint, marginTop: 10 }}>Montants estimés : vérifie au moment de réserver.</div>
          </>}
          {tab === 'depenses' && (() => {
            const spent = (v.spent ?? []).reduce((a, x) => a + x.amount, 0), left = (v.total ?? 0) - spent;
            const d = v.start ? dayDiff(todayStr(), v.start) : null, daysLeft = d !== null ? Math.max(1, Math.min(v.days, v.days + d)) : null;
            return <>
              <div style={{ ...glass(left >= 0 ? T.ok : T.bad), borderRadius: 18, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'flex', fontSize: 13.5 }}><span style={{ flex: 1 }}>Dépensé</span><b>{money(spent)} / {money(v.total ?? 0)}</b></div>
                <div style={{ height: 8, borderRadius: 4, background: 'rgba(var(--dz-ink-rgb),0.07)', marginTop: 8 }}><div style={{ height: '100%', width: `${Math.min(100, spent / Math.max(1, v.total ?? 1) * 100)}%`, borderRadius: 4, background: left >= 0 ? T.ok : T.bad }} /></div>
                <div style={{ fontSize: 13, marginTop: 8, color: left >= 0 ? T.text : T.bad, fontWeight: 700 }}>Reste {money(left)}{daysLeft && d !== null && d <= 0 ? ` · ${money(left / daysLeft)} par jour pour ${daysLeft} jours` : ''}</div>
                {v.budget ? <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Ton budget : {money(v.budget)}</div> : v.lastCost ? <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>La dernière fois : {money(v.lastCost)}</div> : null}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input inputMode="decimal" value={sp.amount} onChange={e => setSp({ ...sp, amount: e.target.value })} placeholder="€" style={{ ...inputStyle, width: 80 }} />
                <input value={sp.label} onChange={e => setSp({ ...sp, label: e.target.value })} placeholder="essence, resto, bateau…" style={{ ...inputStyle, flex: 1 }} />
                <Btn variant="primary" disabled={busy || !(Number(sp.amount.replace(',', '.')) > 0)} onClick={() => void act('spend', { id: v.id, amount: Number(sp.amount.replace(',', '.')), label: sp.label }, '🧾 Dépense notée').then(r => { if (r) setSp({ amount: '', label: '' }); })}>＋</Btn>
              </div>
              {[...(v.spent ?? [])].reverse().map(x => (
                <div key={x.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
                  <span style={{ color: T.faint, width: 44 }}>{x.d.slice(8, 10)}/{x.d.slice(5, 7)}</span><span style={{ flex: 1 }}>{x.label}</span><b>{money(x.amount)}</b>
                  <button onClick={() => void act('spend', { id: v.id, remove: x.id }, 'Supprimée')} style={{ border: 'none', background: 'transparent', color: T.faint, cursor: 'pointer' }}>✕</button>
                </div>))}
              <div style={{ fontSize: 12, color: T.faint, marginTop: 10 }}>Sur Telegram : « voyage -60 essence ».</div>
            </>;
          })()}
          {tab === 'options' && <Btn disabled={busy} onClick={() => void act('options', { id: v.id }, '💡 30 nouvelles options')} style={{ width: '100%', marginBottom: 10 }}>{busy ? 'Je cherche…' : '💡 30 nouvelles options (garde celles cochées)'}</Btn>}
          {tab === 'options' && (v.options ?? []).map((o, i) => (
            <div key={i} style={{ ...glass(o.done ? T.ok : undefined), borderRadius: 16, padding: '10px 12px', marginBottom: 8, opacity: o.no ? 0.45 : 1 }}>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ fontSize: 18 }}>{o.icon}</span><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{i + 1}. {o.title}</div><div style={{ fontSize: 13, color: T.muted, marginTop: 3, lineHeight: 1.45 }}>{o.text}</div></div></div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Btn variant={o.done ? 'primary' : 'soft'} onClick={() => void tick(v.id, 'option', i, o.done ? 'undo' : 'done')}>{o.done ? '✓ Je le fais' : 'Je le fais'}</Btn>
                <Btn variant="ghost" onClick={() => void tick(v.id, 'option', i, o.no ? 'undo' : 'no')}>{o.no ? 'Remettre' : 'Pas pour moi'}</Btn>
              </div>
            </div>
          ))}
          {tab === 'check' && <Btn disabled={busy} onClick={() => void act('tasks', { id: v.id }, '✅ {n} points ajoutés à À faire')} style={{ width: '100%', marginBottom: 10 }}>{v.tasksSent ? '✅ Renvoyer ce qui reste dans À faire' : '✅ Mettre la check-list dans À faire (Aujourd\'hui)'}</Btn>}
          {tab === 'check' && (v.checklist ?? []).map((c, i) => <Check key={i} done={c.done} onClick={() => void tick(v.id, 'check', i, c.done ? 'undo' : 'done')} title={c.label} text={c.when} />)}
        </Sheet>
      )}
    </Screen>
  );
}

function Check({ done, onClick, title, text }: { done?: boolean; onClick: () => void; title: string; text?: string }) {
  return (
    <div role="button" onClick={onClick} style={{ display: 'flex', gap: 10, padding: '9px 2px', borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}>
      <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? T.ok : 'transparent', border: `2px solid ${done ? T.ok : T.line}`, color: '#fff', fontSize: 13 }}>{done ? '✓' : ''}</span>
      <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? T.muted : T.text }}>{title}</div>{text && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{text}</div>}</div>
    </div>
  );
}
