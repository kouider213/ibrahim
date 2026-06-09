import { useState, useEffect, type CSSProperties } from 'react';
import { business, type ClientLead } from '../../services/api.ts';

const C = {
  bg: '#0b0b0d', surface: '#16161c', surface2: '#1d1d25', border: 'rgba(255,255,255,0.07)',
  accent: '#10b981', accentSoft: '#34d399', text: '#f5f5f7', muted: '#9b9ba6',
  violet: '#a78bfa', orange: '#fb923c', amber: '#fbbf24', red: '#fb7185',
  font: '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const CAT_META: Record<string, { label: string; icon: string; col: string }> = {
  immo_location:    { label: 'Loc immo',    icon: '🏠', col: C.violet },
  immo_vente:       { label: 'Achat immo',  icon: '🏠', col: C.accentSoft },
  voiture_location: { label: 'Loc voiture', icon: '🚗', col: C.accent },
  voiture_vente:    { label: 'Achat voit.', icon: '🚗', col: C.orange },
};
const STATUS_META: Record<string, { label: string; col: string }> = {
  nouveau:  { label: 'Nouveau',  col: C.accent },
  en_cours: { label: 'En cours', col: C.amber },
  conclu:   { label: 'Conclu',   col: C.accentSoft },
  perdu:    { label: 'Perdu',    col: C.red },
};
const STATUS_FLOW = ['nouveau', 'en_cours', 'conclu', 'perdu'];

const inp: CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`,
  borderRadius: 11, padding: '11px 12px', fontFamily: C.font, fontSize: 14, color: C.text, outline: 'none',
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
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, position: 'relative' }}>
      {/* Hero */}
      <div style={{ position: 'relative', padding: '22px 18px 12px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, background: `radial-gradient(circle, ${C.accent}22, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.accent, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Dzaryx · Demandes</div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05, background: `linear-gradient(120deg, #fff, ${C.accentSoft})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Demandes</div>
          </div>
          <button onClick={() => setShow(s => !s)} style={{ width: 42, height: 42, borderRadius: 12, border: 'none', cursor: 'pointer', background: show ? C.surface2 : `linear-gradient(135deg, ${C.accent}, ${C.accentSoft})`, color: show ? C.muted : '#04140d', fontSize: 22, fontWeight: 700 }}>{show ? '✕' : '+'}</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: '0 18px 12px' }}>
        {[{ v: nouveaux, l: 'Nouveaux', c: C.accent }, { v: enCours, l: 'En cours', c: C.amber }, { v: leads.length, l: 'Total', c: C.text }].map(s => (
          <div key={s.l} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 3, margin: '0 18px 12px' }}>
        {([['actifs', 'Actifs'], ['conclu', 'Conclus'], ['all', 'Tout']] as [string, string][]).map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: C.font, fontSize: 12, fontWeight: 600, background: filter === k ? C.accent : 'transparent', color: filter === k ? '#04140d' : C.muted }}>{lbl}</button>
        ))}
      </div>

      <div style={{ padding: '0 18px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Formulaire ajout */}
        {show && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(CAT_META).map(([k, m]) => (
                <button key={k} onClick={() => setF(s => ({ ...s, category: k }))} style={{ flex: '1 1 45%', padding: '9px', borderRadius: 11, cursor: 'pointer', fontFamily: C.font, fontSize: 12, fontWeight: 600, background: f.category === k ? `${m.col}1c` : 'transparent', border: `1px solid ${f.category === k ? m.col : C.border}`, color: f.category === k ? m.col : C.muted }}>{m.icon} {m.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={f.client_name} onChange={e => setF(s => ({ ...s, client_name: e.target.value }))} placeholder="Client" style={inp} />
              <input value={f.client_phone} onChange={e => setF(s => ({ ...s, client_phone: e.target.value }))} placeholder="Téléphone" style={inp} />
            </div>
            <input value={f.criteria} onChange={e => setF(s => ({ ...s, criteria: e.target.value }))} placeholder="Cherche quoi ? (ex: F4 Bir El Djir, 2 ch)" style={inp} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={f.city} onChange={e => setF(s => ({ ...s, city: e.target.value }))} placeholder="Ville" style={inp} />
              <input value={f.budget_max} onChange={e => setF(s => ({ ...s, budget_max: e.target.value }))} type="number" placeholder="Budget max" style={inp} />
              <select value={f.currency} onChange={e => setF(s => ({ ...s, currency: e.target.value }))} style={{ ...inp, flex: '0 0 78px' }}><option>DZD</option><option>EUR</option></select>
            </div>
            <button onClick={() => void add()} disabled={busy === 'add'} style={{ padding: 13, borderRadius: 13, border: 'none', background: `linear-gradient(135deg, ${C.accent}, ${C.accentSoft})`, color: '#04140d', fontFamily: C.font, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: busy === 'add' ? 0.5 : 1 }}>{busy === 'add' ? '…' : 'Enregistrer la demande'}</button>
          </div>
        )}

        {loading ? <Empty t="Chargement…" /> : filtered.length === 0 ? <Empty t="Aucune demande" /> : filtered.map(l => {
          const m = CAT_META[l.category] ?? { label: l.category, icon: '•', col: C.muted };
          const st = STATUS_META[l.status] ?? { label: l.status, col: C.muted };
          const cur = l.currency === 'DZD' ? 'DA' : (l.currency || '€');
          return (
            <div key={l.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: `${m.col}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{m.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{l.client_name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: m.col, background: `${m.col}1a`, border: `1px solid ${m.col}40`, borderRadius: 20, padding: '2px 9px' }}>{m.label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, marginTop: 4, lineHeight: 1.4 }}>{l.criteria}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{[l.city, l.budget_max ? `≤ ${Number(l.budget_max).toLocaleString('fr-FR')} ${cur}` : null].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <button onClick={() => void cycle(l)} disabled={busy === l.id} style={{ fontSize: 11, fontWeight: 700, color: st.col, background: `${st.col}1a`, border: `1px solid ${st.col}55`, borderRadius: 20, padding: '4px 11px', cursor: 'pointer', fontFamily: C.font }}>{st.label} ▸</button>
                  {l.client_phone && <a href={`tel:${l.client_phone}`} style={{ fontSize: 19, textDecoration: 'none' }}>📞</a>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ t }: { t: string }) {
  return <div style={{ textAlign: 'center', padding: 36, color: C.muted, fontSize: 13 }}>{t}</div>;
}
