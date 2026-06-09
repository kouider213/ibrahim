import { useState, useEffect } from 'react';
import { business, type ClientSummary, type ClientIntelligence, type ClientOperation, type ClientType } from '../../services/api.ts';

// ── Palette premium (cartes sur obsidian + accent émeraude) ─────
const C = {
  bg: '#0b0b0d', surface: '#16161c', surface2: '#1d1d25', border: 'rgba(255,255,255,0.07)',
  accent: '#10b981', accentSoft: '#34d399', text: '#f5f5f7', muted: '#9b9ba6',
  gold: '#fbbf24', blue: '#60a5fa', violet: '#a78bfa',
  font: '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const TYPE_META: Record<ClientType, { label: string; col: string }> = {
  loc_auto:   { label: 'Loc auto',   col: C.accent },
  loc_immo:   { label: 'Loc immo',   col: C.violet },
  achat_auto: { label: 'Achat auto', col: '#fb923c' },
  achat_immo: { label: 'Achat immo', col: C.accentSoft },
  demande:    { label: 'Demande',    col: '#f472b6' },
};

const OP_META: Record<string, { label: string; icon: string; col: string }> = {
  location_immo:      { label: 'Location immo',  icon: '🏠', col: C.violet },
  vente_immo:         { label: 'Achat immo',     icon: '🏠', col: C.accentSoft },
  vente_voiture:      { label: 'Achat voiture',  icon: '🚗', col: '#fb923c' },
  demande_specifique: { label: 'Demande spéciale', icon: '✨', col: '#f472b6' },
  demande:            { label: 'Demande spéciale', icon: '✨', col: '#f472b6' },
};

const SCORE_COL: Record<string, string> = {
  VIP: C.gold, FREQUENT: C.accent, FRÉQUENT: C.accent,
  REGULAR: C.accentSoft, RÉGULIER: C.accentSoft, NEW: C.muted, NOUVEAU: C.muted,
};

export default function ClientsScreen() {
  const [clients, setClients]   = useState<ClientSummary[]>([]);
  const [intel, setIntel]       = useState<Map<string, ClientIntelligence>>(new Map());
  const [ops, setOps]           = useState<Map<string, ClientOperation[]>>(new Map());
  const [loading, setLoad]      = useState(true);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoad(true);
    try {
      const [clientRes, intelRes, opsRes] = await Promise.all([
        business.fetchClients().catch(() => ({ clients: [] as ClientSummary[] })),
        business.fetchClientIntel().catch(() => ({ clients: [] as ClientIntelligence[] })),
        business.fetchOperations().catch(() => ({ operations: [] as ClientOperation[] })),
      ]);
      setClients(clientRes.clients ?? []);
      const map = new Map<string, ClientIntelligence>();
      (intelRes.clients ?? []).forEach(c => map.set(c.client_name, c));
      setIntel(map);
      const opMap = new Map<string, ClientOperation[]>();
      (opsRes.operations ?? []).forEach(o => {
        const arr = opMap.get(o.client_name) ?? [];
        arr.push(o); opMap.set(o.client_name, arr);
      });
      setOps(opMap);
    } finally { setLoad(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone?.includes(search) ?? false)
  );
  const getScore = (name: string) => intel.get(name)?.score?.toUpperCase() ?? 'NOUVEAU';
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${Math.round(n)}€`;
  const vipCount = clients.filter(c => getScore(c.name) === 'VIP').length;
  const totalSpent = clients.reduce((s, c) => s + (intel.get(c.name)?.total_spent ?? 0), 0);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, position: 'relative' }}>
      {/* Hero */}
      <div style={{ position: 'relative', padding: '22px 18px 14px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, background: `radial-gradient(circle, ${C.accent}22, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.accent, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Dzaryx · Clients</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05, background: `linear-gradient(120deg, #fff, ${C.accentSoft})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Clients</div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: '0 18px 12px' }}>
        {[
          { v: String(clients.length), l: 'Profils', c: C.text },
          { v: String(vipCount), l: 'VIP', c: C.gold },
          { v: fmt(totalSpent), l: 'CA total', c: C.accentSoft },
        ].map(s => (
          <div key={s.l} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Recherche */}
      <div style={{ padding: '0 18px 12px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un nom ou téléphone…"
          style={{ width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' }} />
      </div>

      {/* Liste */}
      <div style={{ padding: '0 18px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <Empty t="Chargement…" />
        ) : filtered.length === 0 ? (
          <Empty t="Aucun client" />
        ) : filtered.map(c => {
          const score = getScore(c.name);
          const scCol = SCORE_COL[score] ?? C.muted;
          const ci    = intel.get(c.name);
          const isExp = expanded === c.name;
          const initials = c.name.split(' ').map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase();
          const cOps = ops.get(c.name) ?? [];

          return (
            <div key={c.name} style={{ background: C.surface, border: `1px solid ${isExp ? scCol + '55' : C.border}`, borderRadius: 18, overflow: 'hidden', transition: 'border .2s' }}>
              <div onClick={() => setExpanded(e => e === c.name ? null : c.name)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, cursor: 'pointer' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: `${scCol}1a`, border: `1.5px solid ${scCol}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: scCol }}>{initials || '?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{c.bookingCount} résa · {fmt(c.totalSpent)}</div>
                  {c.types && c.types.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                      {c.types.map(t => { const m = TYPE_META[t]; if (!m) return null; return (
                        <span key={t} style={{ fontSize: 10, fontWeight: 600, color: m.col, background: `${m.col}1a`, border: `1px solid ${m.col}40`, borderRadius: 20, padding: '2px 9px' }}>{m.label}</span>
                      ); })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: scCol, background: `${scCol}1f`, border: `1px solid ${scCol}55`, borderRadius: 20, padding: '3px 10px' }}>{score}</span>
                  {c.phone && <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: 20, textDecoration: 'none' }}>📞</a>}
                </div>
              </div>

              {isExp && (ci || cOps.length > 0) && (
                <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${C.border}`, background: C.surface2 }}>
                  {ci && <>
                    <Row label="Voitures préférées" val={(ci.preferred_cars ?? []).join(', ') || '—'} />
                    <Row label="Durée typique" val={ci.typical_duration_days ? `${ci.typical_duration_days} j` : '—'} />
                    <Row label="Négociation" val={ci.negotiation_style ?? '—'} />
                    <Row label="Fiabilité paiement" val={ci.payment_reliability ?? '—'} />
                    <Row label="Dépenses total" val={fmt(ci.total_spent)} col={C.gold} />
                    {ci.notes && <div style={{ marginTop: 10, padding: '10px 12px', background: `${C.accent}10`, borderRadius: 12, border: `1px solid ${C.accent}22`, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{ci.notes}</div>}
                  </>}
                  {cOps.length > 0 && (
                    <div style={{ marginTop: ci ? 14 : 0 }}>
                      <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Immo · Vente · Demandes</div>
                      {cOps.map(op => {
                        const m = OP_META[op.deal_type] ?? { label: op.deal_type, icon: '•', col: C.muted };
                        const cur = op.currency === 'DZD' ? 'DA' : (op.currency || '€');
                        return (
                          <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 16 }}>{m.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: m.col, fontWeight: 600 }}>{m.label}</div>
                              {op.item_label && <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{op.item_label}</div>}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{op.amount != null ? `${Number(op.amount).toLocaleString('fr-FR')} ${cur}` : '—'}</div>
                              <div style={{ fontSize: 10, color: C.muted }}>{String(op.created_at).slice(0, 10)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, val, col }: { label: string; val: string; col?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
      <span style={{ fontSize: 12.5, color: C.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: col ?? C.text, fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
    </div>
  );
}
function Empty({ t }: { t: string }) {
  return <div style={{ textAlign: 'center', padding: 36, color: C.muted, fontSize: 13 }}>{t}</div>;
}
