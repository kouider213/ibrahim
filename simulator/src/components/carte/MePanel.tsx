// Le bonhomme de Kouider sur la Carte live : il va là où son agenda l'emmène (aéroport, garage, banque…),
// et sa fiche montre son agenda (= agenda FIK ; jamais son agenda perso) du jour et des 7 jours, avec ajout / modification / suppression.
import { useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import type { MeSpot, MeState } from './scene.ts';

export interface MeEvent { id?: string; title: string; location: string | null; start: string | null; end: string | null; allDay: boolean }
export interface MeData { day: string; access: { ok: boolean; calendar: string; reason?: string }; events: MeEvent[]; daysOff: number[] }

const TZ = 'Africa/Algiers';
const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayOf = (iso: string) => iso.length <= 10 ? iso : new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
const localParts = (d: Date) => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d); const g = (t: string) => f.find(x => x.type === t)?.value ?? '00'; return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` }; };
const addMin = (date: string, time: string, min: number) => { const d = new Date(`${date}T${time}:00Z`); d.setUTCMinutes(d.getUTCMinutes() + min); return d.toISOString().slice(0, 19); };

// Lieu deviné à partir du titre / lieu du RDV
const SPOT_WORDS: Array<[RegExp, MeSpot]> = [
  [/a[ée]roport|\bvol\b|avion|s[ée]nia|navette|accueil/i, 'aeroport'],
  [/garage|atelier|vidange|m[ée]cani|carross|pneu|contr[ôo]le tech|lavage/i, 'atelier'],
  [/\bport\b|bateau|ferry|douane|import/i, 'port'],
  [/plage|piscine|vacances|baignade/i, 'beach'],
  [/appart|villa|visite (du |d'un )?bien|immo|notaire|terrain|location f\d/i, 'immo'],
  [/entreprise|soci[ée]t[ée]|b2b|prospect|r[ée]union|partenaire/i, 'b2b'],
  [/site web|fik sites|\bsite\b/i, 'web'],
  [/vente|acheteur|showroom/i, 'vente'],
  [/remise|cl[ée]s|livraison|d[ée]part|parking/i, 'parking'],
  [/maison|famille|femme|fils|anniversaire|f[êe]te|d[îi]ner/i, 'home'],
  [/banque|mairie|da[ïi]ra|wilaya|march[ée]|centre|courses|m[ée]decin|dentiste|docteur|h[ôo]pital|pharmacie|caf[ée]|resto|restaurant|poste|ville/i, 'ville'],
];
export const spotOf = (e: MeEvent): MeSpot | null => { const t = `${e.title} ${e.location ?? ''}`; return SPOT_WORDS.find(([r]) => r.test(t))?.[1] ?? null; };

export function meState(d: MeData | null, name: string, missionsLeft: number, now = new Date()): MeState {
  const st = baseState(d, name, missionsLeft, now);
  // Agenda FIK illisible : on le signale sur la bulle
  return d && !d.access.ok ? { ...st, bubble: '⚠️ Agenda FIK illisible', alert: true } : st;
}
function baseState(d: MeData | null, name: string, missionsLeft: number, now: Date): MeState {
  if (!d) return { spot: 'agence', name, bubble: missionsLeft ? `🎯 ${missionsLeft} mission${missionsLeft > 1 ? 's' : ''}` : '👋' };
  const { date: today, time } = localParts(now);
  const h = Number(time.slice(0, 2));
  const timed = d.events.filter(e => !e.allDay && e.start && e.end);
  const cur = timed.find(e => new Date(e.start!) <= now && now < new Date(e.end!));
  const next = timed.find(e => new Date(e.start!) > now && dayOf(e.start!) === today);
  const soon = next && new Date(next.start!).getTime() - now.getTime() < 90 * 60_000 ? next : null;
  const off = d.daysOff.includes(new Date(`${today}T12:00:00`).getDay());
  const allDay = d.events.find(e => e.allDay && e.start && dayOf(e.start) <= today && (!e.end || e.end > today));
  if (cur) return { spot: spotOf(cur) ?? 'agence', name, bubble: `📅 ${cur.title} · jusqu'à ${hm(cur.end!)}` };
  if (soon) return { spot: spotOf(soon) ?? 'agence', name, bubble: `🚶 En route · ${hm(soon.start!)} ${soon.title}` };
  if (h >= 22 || h < 7) return { spot: 'home', name, bubble: next ? `😴 Demain ${hm(next.start!)} ${next.title}` : '😴 Bonne nuit' };
  if (off) return { spot: 'beach', name, bubble: `🏖️ Jour de repos${next ? ` · ${hm(next.start!)} ${next.title}` : ''}` };
  if (allDay) return { spot: spotOf(allDay) ?? 'agence', name, bubble: `📅 ${allDay.title}` };
  if (next) return { spot: 'agence', name, bubble: `⏭ ${hm(next.start!)} ${next.title}` };
  return { spot: 'agence', name, bubble: missionsLeft ? `✅ Agenda libre · 🎯 ${missionsLeft} mission${missionsLeft > 1 ? 's' : ''}` : '✅ Journée libre' };
}

// Démo : un agenda d'exemple qui fait bouger le bonhomme (accueil aéroport en cours, banque plus tard)
export function demoMe(): MeData {
  const n = Date.now(), iso = (m: number) => new Date(n + m * 60_000).toISOString();
  return { day: localParts(new Date()).date, daysOff: [], access: { ok: true, calendar: 'demo' }, events: [
    { id: 'd1', title: 'Accueil client à l\'aéroport', location: null, start: iso(-20), end: iso(40), allDay: false },
    { id: 'd2', title: 'RDV banque', location: 'Centre-ville', start: iso(180), end: iso(240), allDay: false },
    { id: 'd3', title: 'Vidange Clio au garage', location: null, start: iso(60 * 24 + 60), end: iso(60 * 24 + 120), allDay: false },
  ] };
}

const fmtDay = (d: string, today: string) => d === today ? 'Aujourd\'hui' : new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
const inp: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 7px', fontSize: 13, minWidth: 0 };
const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({ background: bg, color: fg, border: 'none', borderRadius: 9, padding: '7px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' });

export function MePanel({ data, state, demo, onClose, onAsk, onChanged }: {
  data: MeData | null; state: MeState; demo: boolean; onClose: () => void; onAsk: (p: string) => void; onChanged: () => void;
}) {
  const [form, setForm] = useState<{ id?: string; title: string; date: string; time: string; dur: number; location: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const today = data?.day ?? localParts(new Date()).date;
  const save = async () => {
    if (!form || !form.title.trim() || demo) { setForm(null); return; }
    setBusy(true); setErr('');
    try {
      const start = `${form.date}T${form.time}:00`, end = addMin(form.date, form.time, form.dur);
      const r = form.id
        ? await apiFetch<{ success: boolean }>(`/api/calendar/agenda/${encodeURIComponent(form.id)}`, { method: 'PATCH', body: JSON.stringify({ title: form.title.trim(), start, end, location: form.location.trim() }) })
        : await apiFetch<{ success: boolean }>('/api/calendar/add', { method: 'POST', body: JSON.stringify({ calendar: 'kouider', title: form.title.trim(), startDateTime: start, endDateTime: end, location: form.location.trim() || undefined }) });
      if (!r.success) throw new Error('Google a refusé');
      setForm(null); onChanged();
    } catch (e) { setErr(`Pas enregistré : ${e instanceof Error ? e.message : 'erreur'}`); } finally { setBusy(false); }
  };
  const del = async (e: MeEvent) => {
    if (demo || !e.id || !window.confirm(`Supprimer « ${e.title} » de ton agenda ?`)) return;
    setBusy(true);
    try { await apiFetch(`/api/calendar/agenda/${encodeURIComponent(e.id)}`, { method: 'DELETE' }); onChanged(); } catch { setErr('Suppression impossible'); } finally { setBusy(false); }
  };
  const edit = (e: MeEvent) => {
    const p = e.start && !e.allDay ? localParts(new Date(e.start)) : { date: e.start?.slice(0, 10) ?? today, time: '09:00' };
    const dur = e.start && e.end && !e.allDay ? Math.max(15, Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60_000)) : 60;
    setForm({ id: e.id, title: e.title, date: p.date, time: p.time, dur, location: e.location ?? '' });
  };
  const byDay = new Map<string, MeEvent[]>();
  (data?.events ?? []).forEach(e => { if (!e.start) return; const d = dayOf(e.start); byDay.set(d, [...(byDay.get(d) ?? []), e]); });

  return <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 26 }}>🧑🏽‍💼</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{state.name}</div>
        <div style={{ fontSize: 12, color: state.alert ? '#b91c1c' : '#475569', fontWeight: 600 }}>{state.bubble}</div>
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#64748b' }}>✕</button>
    </div>

    {data && !data.access.ok && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '8px 10px', marginTop: 8, fontSize: 12, color: '#7f1d1d', lineHeight: 1.45 }}>
      <b>Dzaryx n'arrive pas à lire l'agenda FIK.</b> {data.access.reason}.
    </div>}

    {!data && !demo && <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Chargement de l'agenda…</div>}
    <div style={{ marginTop: 8, maxHeight: 230, overflowY: 'auto' }}>
      {[...byDay.entries()].slice(0, 8).map(([d, evs]) => <div key={d} style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: d === today ? '#0f766e' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{fmtDay(d, today)}{data?.daysOff.includes(new Date(`${d}T12:00:00`).getDay()) ? ' · repos' : ''}</div>
        {evs.map((e, i) => <div key={`${e.id}${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderTop: '1px solid #e2e8f0', fontSize: 12.5 }}>
          <span style={{ width: 42, flexShrink: 0, fontWeight: 800, color: '#334155' }}>{e.allDay || !e.start ? 'jour' : hm(e.start)}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}{e.location ? <span style={{ color: '#64748b' }}> · 📍 {e.location}</span> : ''}</span>
          {!demo && e.id && <><button disabled={busy} onClick={() => edit(e)} style={{ ...btn('#f1f5f9', '#334155'), padding: '3px 6px' }}>✏️</button><button disabled={busy} onClick={() => void del(e)} style={{ ...btn('#fef2f2', '#b91c1c'), padding: '3px 6px' }}>🗑️</button></>}
        </div>)}
      </div>)}
      {data && data.access.ok && byDay.size === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>Rien dans ton agenda ces 7 prochains jours.</div>}
    </div>

    {form ? <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, marginTop: 6, display: 'grid', gap: 6 }}>
      <input autoFocus placeholder="Titre (ex. RDV banque)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inp} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 6 }}>
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inp} />
        <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} style={inp} />
        <select value={form.dur} onChange={e => setForm({ ...form, dur: Number(e.target.value) })} style={inp}>
          {[15, 30, 45, 60, 90, 120, 180, 240].map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
        </select>
      </div>
      <input placeholder="Lieu (optionnel) — ex. aéroport, garage, banque" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} style={inp} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button disabled={busy} onClick={() => void save()} style={btn('#0f766e')}>{busy ? '…' : form.id ? '💾 Modifier' : '➕ Ajouter'}</button>
        <button onClick={() => setForm(null)} style={btn('#e2e8f0', '#334155')}>Annuler</button>
      </div>
    </div> : <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {!demo && <button onClick={() => setForm({ title: '', date: today, time: localParts(new Date(Date.now() + 3600_000)).time.slice(0, 2) + ':00', dur: 60, location: '' })} style={btn('#0f766e')}>➕ RDV</button>}
      <button onClick={() => onAsk('Regarde mon agenda FIK d\'aujourd\'hui et demain, mes départs/retours de voitures et les paiements à encaisser, puis propose-moi l\'ordre idéal de ma journée heure par heure (trajets compris à Oran).')} style={btn('#4f46e5')}>✨ Organise ma journée</button>
      {!demo && <button onClick={() => onAsk('Qu\'est-ce que j\'ai dans mon agenda cette semaine ? Signale les conflits avec les départs/retours de voitures et mes jours de repos.')} style={btn('#f1f5f9', '#334155')}>📅 Ma semaine</button>}
    </div>}
    {err && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{err}</div>}
  </div>;
}
