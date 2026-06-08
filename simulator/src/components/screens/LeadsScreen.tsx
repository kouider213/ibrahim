import { useState, useEffect } from 'react';
import { business, type ClientLead } from '../../services/api.ts';

const CAT_META: Record<string, { label: string; icon: string; col: string }> = {
  immo_location:    { label: 'LOC IMMO',     icon: '🏠', col: '#b06bff' },
  immo_vente:       { label: 'ACHAT IMMO',   icon: '🏠', col: '#00e676' },
  voiture_location: { label: 'LOC VOITURE',  icon: '🚗', col: '#10b981' },
  voiture_vente:    { label: 'ACHAT VOIT.',  icon: '🚗', col: '#ff9f43' },
};
const STATUS_META: Record<string, { label: string; col: string }> = {
  nouveau:  { label: 'NOUVEAU',  col: '#10b981' },
  en_cours: { label: 'EN COURS', col: '#ffb347' },
  conclu:   { label: 'CONCLU',   col: '#00e676' },
  perdu:    { label: 'PERDU',    col: '#ff3366' },
};
const STATUS_FLOW = ['nouveau', 'en_cours', 'conclu', 'perdu'];

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(16,185,129,0.04)',
  border: '1px solid #10b9811a', borderRadius: 7, padding: '7px 9px',
  fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#c8e8ff', outline: 'none',
};

export default function LeadsScreen() {
  const [leads, setLeads] = useState<ClientLead[]>([]);
  const [loading, setLoad] = useState(true);
  const [filter, setFilter] = useState<string>('actifs');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({ client_name: '', client_phone: '', category: 'immo_location', criteria: '', budget_max: '', currency: 'DZD', city: '' });

  const load = async () => {
    setLoad(true);
    try { const r = await business.fetchLeads(); setLeads(r.leads ?? []); }
    catch { setLeads([]); } finally { setLoad(false); }
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    if (!f.client_name.trim() || !f.criteria.trim()) return;
    setBusy('add');
    try {
      await business.createLead({
        client_name: f.client_name.trim(), client_phone: f.client_phone.trim() || null,
        category: f.category, criteria: f.criteria.trim(),
        budget_max: f.budget_max ? Number(f.budget_max) : null, currency: f.currency, city: f.city.trim() || null,
      });
      setShow(false); setF({ client_name: '', client_phone: '', category: 'immo_location', criteria: '', budget_max: '', currency: 'DZD', city: '' });
      void load();
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  const cycle = async (l: ClientLead) => {
    const next = STATUS_FLOW[(STATUS_FLOW.indexOf(l.status) + 1) % STATUS_FLOW.length];
    setBusy(l.id);
    try { await business.updateLead(l.id, { status: next }); setLeads(xs => xs.map(x => x.id === l.id ? { ...x, status: next } : x)); }
    catch { /* ignore */ } finally { setBusy(null); }
  };

  const filtered = leads.filter(l => filter === 'actifs' ? ['nouveau', 'en_cours'].includes(l.status) : filter === 'all' ? true : l.status === filter);
  const nouveaux = leads.filter(l => l.status === 'nouveau').length;
  const enCours = leads.filter(l => l.status === 'en_cours').length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0c', color: '#fff', fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #10b98112', flexShrink: 0, background: 'rgba(10,10,12,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#10b981', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #10b98155' }}>DEMANDES</div>
          <button onClick={() => setShow(s => !s)} style={{ background: '#10b98118', border: '1px solid #10b98155', borderRadius: 8, padding: '4px 10px', fontFamily: 'Inter, sans-serif', fontSize: 7, color: '#10b981', cursor: 'pointer', letterSpacing: '0.12em' }}>{show ? '✕' : '+ DEMANDE'}</button>
        </div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          <Kpi label="NOUVEAUX" val={String(nouveaux)} col="#10b981" />
          <Kpi label="EN COURS" val={String(enCours)} col="#ffb347" />
          <Kpi label="TOTAL" val={String(leads.length)} col="#00e676" />
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {([['actifs', 'ACTIFS'], ['conclu', 'CONCLUS'], ['all', 'TOUT']] as [string, string][]).map(([k, lbl]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ flex: 1, padding: '5px', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 7, cursor: 'pointer', background: filter === k ? 'rgba(16,185,129,0.15)' : 'transparent', border: `1px solid #10b981${filter === k ? '88' : '22'}`, color: `#10b981${filter === k ? '' : '66'}` }}>{lbl}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {show && (
          <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid #10b98122', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(CAT_META).map(([k, m]) => (
                <button key={k} onClick={() => setF(s => ({ ...s, category: k }))} style={{ flex: '1 1 45%', padding: '5px', borderRadius: 6, fontFamily: 'Inter, sans-serif', fontSize: 6, cursor: 'pointer', background: f.category === k ? `${m.col}22` : 'transparent', border: `1px solid ${f.category === k ? m.col : '#ffffff22'}`, color: f.category === k ? m.col : '#ffffff44' }}>{m.icon} {m.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <input value={f.client_name} onChange={e => setF(s => ({ ...s, client_name: e.target.value }))} placeholder="Client" style={inp} />
              <input value={f.client_phone} onChange={e => setF(s => ({ ...s, client_phone: e.target.value }))} placeholder="Tél" style={inp} />
            </div>
            <input value={f.criteria} onChange={e => setF(s => ({ ...s, criteria: e.target.value }))} placeholder="Cherche quoi ? (ex: F4 Bir El Djir, 2 ch)" style={inp} />
            <div style={{ display: 'flex', gap: 5 }}>
              <input value={f.city} onChange={e => setF(s => ({ ...s, city: e.target.value }))} placeholder="Ville" style={inp} />
              <input value={f.budget_max} onChange={e => setF(s => ({ ...s, budget_max: e.target.value }))} type="number" placeholder="Budget max" style={inp} />
              <select value={f.currency} onChange={e => setF(s => ({ ...s, currency: e.target.value }))} style={{ ...inp, flex: '0 0 64px' }}><option>DZD</option><option>EUR</option></select>
            </div>
            <button onClick={() => void add()} disabled={busy === 'add'} style={{ ...inp, cursor: 'pointer', textAlign: 'center', color: '#00e676', border: '1px solid #00e67644', background: 'rgba(0,230,118,0.1)', fontFamily: 'Inter, sans-serif', fontSize: 8, letterSpacing: '0.15em' }}>{busy === 'add' ? '…' : '✅ ENREGISTRER LA DEMANDE'}</button>
          </div>
        )}

        {loading ? <Loader /> : filtered.length === 0 ? <Empty text="Aucune demande" /> : filtered.map(l => {
          const m = CAT_META[l.category] ?? { label: l.category, icon: '•', col: '#888' };
          const st = STATUS_META[l.status] ?? { label: l.status, col: '#888' };
          const cur = l.currency === 'DZD' ? 'DA' : (l.currency || '€');
          return (
            <div key={l.id} style={{ borderRadius: 10, border: `1px solid ${st.col}33`, background: `linear-gradient(135deg, ${m.col}07, rgba(10,10,12,0.6))`, padding: '9px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>{m.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#e8f4ff' }}>{l.client_name}</span>
                    <span style={{ fontSize: 6, fontFamily: 'Inter, sans-serif', color: m.col, background: `${m.col}14`, border: `1px solid ${m.col}44`, borderRadius: 4, padding: '2px 5px' }}>{m.label}</span>
                  </div>
                  <div style={{ fontSize: 8, color: '#ffffff66', marginTop: 2 }}>{l.criteria}</div>
                  <div style={{ fontSize: 7, color: '#ffffff33', marginTop: 1 }}>{[l.city, l.budget_max ? `≤ ${Number(l.budget_max).toLocaleString()} ${cur}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <button onClick={() => void cycle(l)} disabled={busy === l.id} style={{ fontSize: 6, fontFamily: 'Inter, sans-serif', color: st.col, background: `${st.col}14`, border: `1px solid ${st.col}44`, borderRadius: 5, padding: '3px 6px', cursor: 'pointer' }}>{st.label} ▸</button>
                  {l.client_phone && <a href={`tel:${l.client_phone}`} style={{ fontSize: 13, textDecoration: 'none' }}>📞</a>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ flex: 1, background: `${col}0a`, borderRadius: 8, padding: '6px 8px', border: `1px solid ${col}2a`, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: col, textShadow: `0 0 10px ${col}44` }}>{val}</div>
      <div style={{ fontSize: 6, color: `${col}66`, letterSpacing: '0.15em', marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Loader() { return <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#10b98133', fontFamily: 'Inter, sans-serif', letterSpacing: '0.25em' }}>CHARGEMENT…</div>; }
function Empty({ text }: { text: string }) { return <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#ffffff1a', letterSpacing: '0.1em' }}>{text}</div>; }
function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 12, t = 1.5, col = 'transparent';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l') ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r') ? `${t}px solid ${col}33` : 'none';
  const h = pos.endsWith('l') ? { left: 4 } : { right: 4 };
  const v = pos.startsWith('t') ? { top: 4 } : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}
