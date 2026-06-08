import { useState, useEffect } from 'react';
import { business, type ClientSummary, type ClientIntelligence, type ClientOperation, type ClientType } from '../../services/api.ts';

const TYPE_META: Record<ClientType, { label: string; col: string }> = {
  loc_auto:   { label: 'LOC AUTO',   col: '#10b981' },
  loc_immo:   { label: 'LOC IMMO',   col: '#b06bff' },
  achat_auto: { label: 'ACHAT AUTO', col: '#ff9f43' },
  achat_immo: { label: 'ACHAT IMMO', col: '#00e676' },
  demande:    { label: 'DEMANDE',    col: '#ff5fa2' },
};

const OP_META: Record<string, { label: string; icon: string; col: string }> = {
  location_immo:      { label: 'Location immo',  icon: '🏠', col: '#b06bff' },
  vente_immo:         { label: 'Achat immo',     icon: '🏠', col: '#00e676' },
  vente_voiture:      { label: 'Achat voiture',  icon: '🚗', col: '#ff9f43' },
  demande_specifique: { label: 'Demande spéciale', icon: '✨', col: '#ff5fa2' },
  demande:            { label: 'Demande spéciale', icon: '✨', col: '#ff5fa2' },
};

const SCORE_COL: Record<string, string> = {
  VIP: '#ffd700', FREQUENT: '#10b981', FRÉQUENT: '#10b981',
  REGULAR: '#00e676', RÉGULIER: '#00e676', NEW: '#ffffff66', NOUVEAU: '#ffffff66',
};
const SCORE_BG: Record<string, string> = {
  VIP: '#ffd70018', FREQUENT: '#10b98118', FRÉQUENT: '#10b98118',
  REGULAR: '#00e67618', RÉGULIER: '#00e67618', NEW: '#ffffff0a', NOUVEAU: '#ffffff0a',
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
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone?.includes(search) ?? false)
  );

  const getScore = (name: string) => {
    const ci = intel.get(name);
    return ci?.score?.toUpperCase() ?? 'NOUVEAU';
  };

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${Math.round(n)}€`;

  const vipCount = clients.filter(c => getScore(c.name) === 'VIP').length;
  const totalSpent = clients.reduce((s, c) => s + (intel.get(c.name)?.total_spent ?? 0), 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0c', color: '#fff', fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #10b98112', flexShrink: 0, background: 'rgba(10,10,12,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#10b981', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #10b98155' }}>
            CLIENTS
          </div>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: '#10b98155', letterSpacing: '0.15em' }}>
            {clients.length} PROFILS
          </span>
        </div>

        {/* KPI row */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          <KpiCard label="TOTAL" val={String(clients.length)} col="#10b981" />
          <KpiCard label="VIP" val={String(vipCount)} col="#ffd700" />
          <KpiCard label="CA TOTAL" val={fmt(totalSpent)} col="#00e676" />
        </div>

        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Chercher nom / téléphone…"
          style={inputStyle}
        />
        <div style={{ marginTop: 6, height: 1, background: 'linear-gradient(90deg, transparent, #10b98144, transparent)' }} />
      </div>

      {/* Client list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {loading ? <HudLoader /> : filtered.length === 0 ? <HudEmpty text="Aucun client" /> : filtered.map(c => {
          const score  = getScore(c.name);
          const scCol  = SCORE_COL[score] ?? '#ffffff55';
          const scBg   = SCORE_BG[score] ?? '#ffffff08';
          const ci     = intel.get(c.name);
          const isExp  = expanded === c.name;
          const initials = c.name.split(' ').map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase();

          return (
            <div key={c.name} style={{
              borderRadius: 10, overflow: 'hidden',
              border: `1px solid ${scCol}22`,
              background: `linear-gradient(135deg, ${scCol}06, rgba(10,10,12,0.5))`,
              boxShadow: isExp ? `0 0 12px ${scCol}15` : 'none',
            }}>
              <div onClick={() => setExpanded(e => e === c.name ? null : c.name)}
                style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Avatar */}
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: scBg, border: `1.5px solid ${scCol}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Inter, sans-serif', fontSize: 10, color: scCol,
                  boxShadow: `0 0 8px ${scCol}22`,
                }}>
                  {initials || '?'}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#e8f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 8, color: '#ffffff44', marginTop: 1 }}>
                    {c.bookingCount} résa · {fmt(c.totalSpent)}
                  </div>
                  {c.types && c.types.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                      {c.types.map(t => {
                        const m = TYPE_META[t]; if (!m) return null;
                        return (
                          <span key={t} style={{
                            fontSize: 6, fontFamily: 'Inter, sans-serif', letterSpacing: '0.08em',
                            color: m.col, background: `${m.col}14`, border: `1px solid ${m.col}44`,
                            borderRadius: 4, padding: '2px 5px',
                          }}>{m.label}</span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Score + phone */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{
                    padding: '3px 7px', borderRadius: 6, fontSize: 7,
                    background: scBg, color: scCol,
                    fontFamily: 'Inter, sans-serif', letterSpacing: '0.1em',
                    border: `1px solid ${scCol}44`,
                    boxShadow: score === 'VIP' ? `0 0 8px ${scCol}44` : 'none',
                  }}>
                    {score.slice(0, 4)}
                  </div>
                  {c.phone && (
                    <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()}
                      style={{ fontSize: 15, textDecoration: 'none' }}>📞</a>
                  )}
                </div>
              </div>

              {/* Intelligence + opérations detail */}
              {isExp && (ci || (ops.get(c.name)?.length ?? 0) > 0) && (
                <div style={{ padding: '6px 12px 10px 20px', background: 'rgba(0,5,15,0.96)', borderTop: `1px solid ${scCol}18` }}>
                  {ci && <>
                    <Row label="Voitures préférées" val={(ci.preferred_cars ?? []).join(', ') || '—'} />
                    <Row label="Durée typique" val={ci.typical_duration_days ? `${ci.typical_duration_days}j` : '—'} />
                    <Row label="Style négociation" val={ci.negotiation_style ?? '—'} />
                    <Row label="Fiabilité paiement" val={ci.payment_reliability ?? '—'} />
                    <Row label="Dépenses total" val={fmt(ci.total_spent)} col="#ffd700" />
                    {ci.notes && (
                      <div style={{ marginTop: 6, padding: '6px 8px', background: '#10b98105', borderRadius: 6, border: '1px solid #10b9810f', fontSize: 8, color: '#ffffff77', lineHeight: 1.6 }}>
                        {ci.notes}
                      </div>
                    )}
                  </>}

                  {/* Ce que le client a pris (immo / vente / demandes) */}
                  {(ops.get(c.name)?.length ?? 0) > 0 && (
                    <div style={{ marginTop: ci ? 8 : 0 }}>
                      <div style={{ fontSize: 7, color: '#ffffff33', letterSpacing: '0.2em', marginBottom: 4 }}>IMMO · VENTE · DEMANDES</div>
                      {(ops.get(c.name) ?? []).map(op => {
                        const m = OP_META[op.deal_type] ?? { label: op.deal_type, icon: '•', col: '#888' };
                        const cur = op.currency === 'DZD' ? 'DA' : (op.currency || '€');
                        return (
                          <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid #ffffff08' }}>
                            <span style={{ fontSize: 11 }}>{m.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 8, color: m.col }}>{m.label}</div>
                              {op.item_label && <div style={{ fontSize: 7, color: '#ffffff55', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.item_label}</div>}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 8, color: '#fff' }}>{op.amount != null ? `${Number(op.amount).toLocaleString()} ${cur}` : '—'}</div>
                              <div style={{ fontSize: 6, color: '#ffffff33' }}>{String(op.created_at).slice(0, 10)}</div>
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

function KpiCard({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ flex: 1, background: `${col}0a`, borderRadius: 8, padding: '6px 8px', border: `1px solid ${col}2a`, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: col, textShadow: `0 0 10px ${col}44` }}>{val}</div>
      <div style={{ fontSize: 6, color: `${col}66`, letterSpacing: '0.15em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Row({ label, val, col }: { label: string; val: string; col?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ fontSize: 8, color: '#ffffff2a' }}>{label}</span>
      <span style={{ fontSize: 8, color: col ?? '#ffffff77', maxWidth: '55%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
    </div>
  );
}

function HudLoader() {
  return <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#10b98133', fontFamily: 'Inter, sans-serif', letterSpacing: '0.25em' }}>CHARGEMENT…</div>;
}
function HudEmpty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#ffffff1a', letterSpacing: '0.1em' }}>{text}</div>;
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(16,185,129,0.04)', border: '1px solid #10b9811a',
  borderRadius: 8, padding: '6px 10px',
  fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#c8e8ff', outline: 'none',
};

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 12, t = 1.5, col = 'transparent';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}33` : 'none';
  const h  = pos.endsWith('l')   ? { left: 4 }  : { right: 4 };
  const v  = pos.startsWith('t') ? { top: 4 }   : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}
